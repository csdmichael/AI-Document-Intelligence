"""
Train a custom Azure AI Document Intelligence extraction model.

Workflow
--------
1. Query Cosmos DB for reviewed/approved documents (human-corrected fields).
2. Download each PDF from Blob Storage into a temporary training folder.
3. Re-analyse each PDF with prebuilt-layout to obtain word bounding boxes.
4. Generate per-document  <filename>.labels.json  files that map corrected
   field values to bounding regions discovered in step 3.
5. Generate a single  fields.json  schema covering all labelled fields.
6. Upload the training folder to blob storage (prefix: training/).
7. Call the Document Intelligence SDK to build a NEURAL custom model.
8. Poll until training completes and print the resulting model ID.

The model ID is printed to stdout so it can be set as
DOC_INTELLIGENCE_MODEL_ID (or custom_model_id in doc_intelligence.yaml).

Usage
-----
    python -m scripts.train_custom_model
    python -m scripts.train_custom_model --min-docs 3  # lower threshold for dev
"""

import argparse
import json
import os
import sys
import tempfile
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from azure.identity import DefaultAzureCredential
from azure.ai.documentintelligence import DocumentIntelligenceClient
from azure.ai.documentintelligence.models import (
    AnalyzeDocumentRequest,
    DocumentAnalysisFeature,
    BuildDocumentModelRequest,
    AzureBlobContentSource,
    DocumentBuildMode,
)
from azure.cosmos import CosmosClient
from azure.storage.blob import (
    BlobServiceClient,
    ContentSettings,
    generate_container_sas,
    ContainerSasPermissions,
)
from config import cfg

CONTAINER_NAME = cfg.azure.storage.container_name
BLOB_URL = cfg.blob_url
TRAINING_PREFIX = "training/"
TRAINING_CONTAINER = "doc-intelligence-training"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _sas_url(blob_service: BlobServiceClient,
             container: str,
             prefix: str = "") -> str:
    """Return a SAS-signed container URL valid for 4 hours."""
    udk = blob_service.get_user_delegation_key(
        key_start_time=datetime.now(timezone.utc),
        key_expiry_time=datetime.now(timezone.utc) + timedelta(hours=4),
    )
    token = generate_container_sas(
        account_name=cfg.azure.storage.account_name,
        container_name=container,
        user_delegation_key=udk,
        permission=ContainerSasPermissions(read=True, list=True, write=True),
        expiry=datetime.now(timezone.utc) + timedelta(hours=4),
    )
    base = f"https://{cfg.azure.storage.account_name}.blob.core.windows.net"
    url = f"{base}/{container}?{token}"
    if prefix:
        url = f"{base}/{container}/{prefix}?{token}"
    return url


def _ensure_container(blob_service: BlobServiceClient, container_name: str):
    """Create a blob container if it does not already exist."""
    cc = blob_service.get_container_client(container_name)
    try:
        cc.get_container_properties()
    except Exception:
        try:
            cc.create_container()
            print(f"Created container '{container_name}'.")
        except Exception as exc:
            print(f"Warning: could not create '{container_name}': {exc}")


# ---------------------------------------------------------------------------
# Labelling helpers
# ---------------------------------------------------------------------------

def _find_bounding_boxes(result, text: str) -> list[dict]:
    """
    Walk the prebuilt-layout result for word sequences whose joined content
    best matches *text*.  Returns a list of bounding-box dicts compatible
    with the Document Intelligence labels.json format.
    """
    if not text or not hasattr(result, "pages") or not result.pages:
        return []

    text_lower = text.lower().strip()
    boxes = []

    for page in result.pages:
        if not hasattr(page, "words") or not page.words:
            continue
        page_num = page.page_number

        words = page.words
        # Sliding window search: try to match *text* over consecutive words
        for start_idx in range(len(words)):
            window = []
            for end_idx in range(start_idx, min(start_idx + 12, len(words))):
                window.append(words[end_idx])
                joined = " ".join(
                    w.content for w in window
                    if hasattr(w, "content") and w.content
                ).lower()
                if text_lower in joined or joined in text_lower:
                    # Collect bounding polygon from all window words
                    polys = []
                    for w in window:
                        if hasattr(w, "polygon") and w.polygon:
                            pts = w.polygon
                            # polygon is a flat list [x0,y0,x1,y1,x2,y2,x3,y3]
                            polys.extend(pts)
                    if polys:
                        boxes.append({
                            "page": page_num,
                            "text": " ".join(
                                w.content for w in window
                                if hasattr(w, "content") and w.content
                            ),
                            "boundingBoxes": [polys],
                        })
                    break  # found for this start_idx

    return boxes[:1]  # take the first (best) match only


def _build_labels_json(filename: str, layout_result, doc_record: dict) -> dict:
    """Build a Document Intelligence labels.json for one document."""
    labels = []

    for section in doc_record.get("sections", []):
        for field in section.get("fields", []):
            # Prefer the human-corrected value; fall back to extracted
            ground_truth = field.get("correctedValue") or field.get("extractedValue", "")
            field_name = field.get("fieldName", "")
            if not field_name or not ground_truth:
                continue

            boxes = _find_bounding_boxes(layout_result, ground_truth)
            if not boxes:
                # Try the extracted value as the text to locate
                boxes = _find_bounding_boxes(
                    layout_result, field.get("extractedValue", ""))

            if boxes:
                labels.append({
                    "label": field_name,
                    "key": None,
                    "value": boxes,
                })

    return {
        "document": filename,
        "$schema": "https://schema.cognitiveservices.azure.com/formrecognizer/2021-03-01/labels.json",
        "labels": labels,
    }


def _build_fields_json(doc_records: list[dict]) -> dict:
    """Build a Document Intelligence fields.json schema from all records."""
    all_fields: set[str] = set()
    for doc in doc_records:
        for section in doc.get("sections", []):
            for field in section.get("fields", []):
                if field.get("fieldName"):
                    all_fields.add(field["fieldName"])

    fields_dict = {
        name: {"fieldType": "string", "fieldFormat": "not-specified"}
        for name in sorted(all_fields)
    }
    return {
        "$schema": "https://schema.cognitiveservices.azure.com/formrecognizer/2021-03-01/fields.json",
        "fields": fields_dict,
        "definitions": {},
    }


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Train a custom AI Document Intelligence extraction model "
                    "from human-reviewed tax forms.")
    parser.add_argument(
        "--min-docs", type=int, default=5,
        help="Minimum number of reviewed documents required (default: 5)")
    parser.add_argument(
        "--model-id", type=str, default="",
        help="Custom model ID to use (default: auto-generated)")
    parser.add_argument(
        "--build-mode", choices=["neural", "template"],
        default="neural",
        help="Document Intelligence build mode (default: neural)")
    args = parser.parse_args()

    credential = DefaultAzureCredential()

    # -----------------------------------------------------------------------
    # 1. Load reviewed documents from Cosmos DB
    # -----------------------------------------------------------------------
    print("Loading reviewed documents from Cosmos DB …")
    cosmos = CosmosClient(url=cfg.cosmos_endpoint, credential=credential)
    db = cosmos.get_database_client(cfg.azure.cosmos_db.database)
    container = db.get_container_client(cfg.azure.cosmos_db.container)

    query = (
        "SELECT c.id, c.fileName, c.state, c.status, c.parsedAt, c.sections "
        "FROM c WHERE c.status IN ('reviewed', 'approved')"
    )
    docs = list(container.query_items(
        query=query, enable_cross_partition_query=True))

    # Deduplicate: keep only the latest per fileName
    latest: dict[str, dict] = {}
    for d in docs:
        fn = d.get("fileName", "")
        existing = latest.get(fn)
        if not existing or (d.get("parsedAt") or "") > (existing.get("parsedAt") or ""):
            latest[fn] = d
    docs = list(latest.values())

    print(f"  Found {len(docs)} unique reviewed documents.")
    if len(docs) < args.min_docs:
        print(
            f"ERROR: Need at least {args.min_docs} reviewed documents "
            f"(have {len(docs)}). Review and correct more documents first.")
        sys.exit(1)

    # -----------------------------------------------------------------------
    # 2. Initialise Document Intelligence and Blob clients
    # -----------------------------------------------------------------------
    di_client = DocumentIntelligenceClient(
        endpoint=cfg.di_endpoint, credential=credential)
    blob_service = BlobServiceClient(
        account_url=BLOB_URL, credential=credential)

    _ensure_container(blob_service, TRAINING_CONTAINER)

    # -----------------------------------------------------------------------
    # 3. For each document: re-analyse with prebuilt-layout and build labels
    # -----------------------------------------------------------------------
    print(f"\nAnalysing {len(docs)} documents to extract bounding boxes …")

    # SAS token so DI can read the source container
    udk = blob_service.get_user_delegation_key(
        key_start_time=datetime.now(timezone.utc),
        key_expiry_time=datetime.now(timezone.utc) + timedelta(hours=4),
    )
    read_sas = generate_container_sas(
        account_name=cfg.azure.storage.account_name,
        container_name=CONTAINER_NAME,
        user_delegation_key=udk,
        permission=ContainerSasPermissions(read=True),
        expiry=datetime.now(timezone.utc) + timedelta(hours=4),
    )

    training_container_client = blob_service.get_container_client(
        TRAINING_CONTAINER)
    cs_pdf = ContentSettings(content_type="application/pdf")
    cs_json = ContentSettings(content_type="application/json")

    labeled_count = 0
    all_fields_json = _build_fields_json(docs)

    for i, doc in enumerate(docs, 1):
        filename = doc.get("fileName", "")
        if not filename:
            continue

        print(f"  [{i}/{len(docs)}] {filename} …", end=" ", flush=True)

        doc_url = f"{BLOB_URL}/{CONTAINER_NAME}/{filename}?{read_sas}"
        try:
            # Re-analyse with layout to get bounding boxes
            poller = di_client.begin_analyze_document(
                "prebuilt-layout",
                AnalyzeDocumentRequest(url_source=doc_url),
                features=[DocumentAnalysisFeature.KEY_VALUE_PAIRS],
            )
            layout_result = poller.result()
        except Exception as exc:
            print(f"SKIP (analysis failed: {exc})")
            continue

        # Build labels
        labels_obj = _build_labels_json(filename, layout_result, doc)
        label_count = len(labels_obj.get("labels", []))

        # Upload PDF to training container
        try:
            source_blob = blob_service.get_container_client(
                CONTAINER_NAME).get_blob_client(filename)
            pdf_bytes = source_blob.download_blob().readall()
            training_container_client.get_blob_client(
                f"training/{filename}"
            ).upload_blob(
                pdf_bytes, overwrite=True, content_settings=cs_pdf)

            # Upload labels JSON
            labels_blob_name = f"training/{filename}.labels.json"
            training_container_client.get_blob_client(
                labels_blob_name
            ).upload_blob(
                json.dumps(labels_obj, indent=2).encode(),
                overwrite=True,
                content_settings=cs_json,
            )

            labeled_count += 1
            print(f"OK ({label_count} labels)")
        except Exception as exc:
            print(f"SKIP (upload failed: {exc})")
            continue

    # Upload fields.json to training folder root
    training_container_client.get_blob_client("training/fields.json").upload_blob(
        json.dumps(all_fields_json, indent=2).encode(),
        overwrite=True,
        content_settings=cs_json,
    )
    print(f"\nUploaded {labeled_count} labeled documents + fields.json")

    if labeled_count < args.min_docs:
        print(
            f"ERROR: Only {labeled_count} documents were successfully labeled "
            f"(need {args.min_docs}). Check blob storage access and retry.")
        sys.exit(1)

    # -----------------------------------------------------------------------
    # 4. Generate SAS URL for the training container
    # -----------------------------------------------------------------------
    udk2 = blob_service.get_user_delegation_key(
        key_start_time=datetime.now(timezone.utc),
        key_expiry_time=datetime.now(timezone.utc) + timedelta(hours=4),
    )
    train_sas_token = generate_container_sas(
        account_name=cfg.azure.storage.account_name,
        container_name=TRAINING_CONTAINER,
        user_delegation_key=udk2,
        permission=ContainerSasPermissions(read=True, list=True),
        expiry=datetime.now(timezone.utc) + timedelta(hours=4),
    )
    train_container_sas_url = (
        f"https://{cfg.azure.storage.account_name}.blob.core.windows.net"
        f"/{TRAINING_CONTAINER}?{train_sas_token}"
    )

    # -----------------------------------------------------------------------
    # 5. Build the custom model
    # -----------------------------------------------------------------------
    model_id = args.model_id or f"tax-form-custom-{uuid.uuid4().hex[:8]}"
    build_mode = (DocumentBuildMode.NEURAL
                  if args.build_mode == "neural"
                  else DocumentBuildMode.TEMPLATE)

    print(f"\nStarting custom model training (model_id={model_id}) …")
    print(f"  Build mode : {args.build_mode}")
    print(f"  Training documents : {labeled_count}")

    request = BuildDocumentModelRequest(
        model_id=model_id,
        description=(
            "Custom extraction model for Garmin tax exemption forms. "
            f"Trained on {labeled_count} human-reviewed documents."
        ),
        build_mode=build_mode,
        azure_blob_source=AzureBlobContentSource(
            container_url=train_container_sas_url,
            prefix="training/",
        ),
    )

    try:
        poller = di_client.begin_build_document_model(request)
        print("  Training started — polling for completion …")
        model = poller.result()
    except Exception as exc:
        print(f"ERROR: Training failed: {exc}")
        sys.exit(1)

    # -----------------------------------------------------------------------
    # 6. Report results
    # -----------------------------------------------------------------------
    print("\n" + "=" * 60)
    print("CUSTOM MODEL TRAINING COMPLETE")
    print("=" * 60)
    print(f"  Model ID      : {model.model_id}")
    print(f"  Description   : {model.description}")
    print(f"  Created at    : {model.created_date_time}")
    if hasattr(model, "doc_types") and model.doc_types:
        for dt_name, dt in model.doc_types.items():
            print(f"  Document type : {dt_name}")
            if hasattr(dt, "field_confidence"):
                for field, conf in sorted(dt.field_confidence.items()):
                    print(f"    {field:40s} {conf:.1%}")

    print("\nTo use this model for parsing, set:")
    print(f"  export DOC_INTELLIGENCE_MODEL_ID={model.model_id}")
    print("or update  config/doc_intelligence.yaml → model.custom_model_id")


if __name__ == "__main__":
    main()

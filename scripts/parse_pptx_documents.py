"""
Parse all filter-design PPTX files using Azure AI Document Intelligence.
Extracts text fields, tables, and image/diagram descriptions from each
presentation, computes confidence scores, and stores results in Cosmos DB.

The parsed schema is compatible with the existing PDF tax-form schema so that
the same UI confidence-category views work for both document types.

Uses managed identity (DefaultAzureCredential) throughout.

Optional flags
--------------
--model MODEL_ID    Override the model ID from config.
--compare           Also parse with the comparison model (prebuilt-read / OCR).
--prefix PREFIX     Only process blobs whose names start with PREFIX.
"""

import argparse
import os
import sys
import uuid
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from azure.identity import DefaultAzureCredential
from azure.ai.documentintelligence import DocumentIntelligenceClient
from azure.ai.documentintelligence.models import AnalyzeDocumentRequest, DocumentAnalysisFeature
from azure.cosmos import CosmosClient
from azure.storage.blob import BlobServiceClient
from config import cfg

CONTAINER_NAME = cfg.azure.storage.container_name
BLOB_URL       = cfg.blob_url
MODEL_ID       = cfg.doc_intelligence.model.model_id

PPTX_MIME = (
    "application/vnd.openxmlformats-officedocument.presentationml.presentation"
)

# ---------------------------------------------------------------------------
# Section mapping for engineering filter-design documents
# ---------------------------------------------------------------------------
PPTX_SECTION_MAPPING = {
    "filter_specs": {
        "section_name": "Filter Specifications",
        "keywords": [
            "filter", "order", "cutoff", "bandwidth", "frequency",
            "specification", "spec", "type", "family",
        ],
    },
    "frequency_response": {
        "section_name": "Frequency Response",
        "keywords": [
            "frequency", "bode", "magnitude", "phase", "gain",
            "ripple", "attenuation", "roll-off", "passband", "stopband",
            "response", "db", "dB",
        ],
    },
    "circuit_design": {
        "section_name": "Circuit Design",
        "keywords": [
            "circuit", "topology", "op-amp", "resistor", "capacitor",
            "sallen", "key", "mfb", "direct form", "transposed",
            "schematic", "stage", "section",
        ],
    },
    "design_parameters": {
        "section_name": "Design Parameters",
        "keywords": [
            "parameter", "value", "angular", "cutoff", "omega",
            "sampling", "nyquist", "window", "hamming", "linear phase",
            "group delay", "coefficient",
        ],
    },
    "applications": {
        "section_name": "Applications",
        "keywords": [
            "application", "use case", "system", "processing", "communication",
            "audio", "radar", "sensor", "medical", "signal",
        ],
    },
    "theory": {
        "section_name": "Theory & Transfer Function",
        "keywords": [
            "transfer function", "polynomial", "h(s)", "h(z)",
            "chebyshev", "butterworth", "bessel", "elliptic",
            "equation", "design equation", "formula",
        ],
    },
}


def get_confidence_category(score: float) -> str:
    return cfg.get_confidence_category(score)


def get_confidence_label(category: str) -> str:
    return cfg.get_confidence_label(category)


def _resolve_pptx_section(field_name: str) -> str:
    """Map a field name to an engineering section using PPTX_SECTION_MAPPING."""
    fl = field_name.lower()
    for _, info in PPTX_SECTION_MAPPING.items():
        for kw in info["keywords"]:
            if kw.lower() in fl:
                return info["section_name"]
    # Fall back to the global config mapping (covers purchaser / seller etc.)
    return cfg.get_section_name(field_name) or "General Information"


def _avg_word_confidences(result) -> float:
    """Return average word-level confidence across all pages."""
    confs = []
    if hasattr(result, "pages") and result.pages:
        for page in result.pages:
            if hasattr(page, "words") and page.words:
                for w in page.words:
                    if hasattr(w, "confidence") and w.confidence is not None:
                        confs.append(float(w.confidence))
    return round(sum(confs) / len(confs), 4) if confs else 0.0


def _extract_image_descriptions(result) -> list:
    """
    Extract image / diagram descriptions from the Document Intelligence result.

    Document Intelligence exposes figures with bounding regions and optional
    captions.  We collect each figure's caption (or synthesise one from
    surrounding paragraph text) and attach it as an image description.
    """
    descriptions = []

    # --- Figures (prebuilt-layout exposes these) ---
    if hasattr(result, "figures") and result.figures:
        for idx, figure in enumerate(result.figures):
            # Caption text
            caption = ""
            if hasattr(figure, "caption") and figure.caption:
                cap = figure.caption
                if hasattr(cap, "content") and cap.content:
                    caption = cap.content.strip()

            # If no caption, synthesise from nearest paragraph
            if not caption and hasattr(result, "paragraphs") and result.paragraphs:
                caption = f"Figure {idx + 1}: diagram extracted from presentation slide."

            # Confidence: average span-level word confidence
            conf = 0.0
            if hasattr(figure, "spans") and figure.spans and hasattr(result, "pages"):
                confs = []
                for page in result.pages:
                    if not hasattr(page, "words") or not page.words:
                        continue
                    for word in page.words:
                        if hasattr(word, "confidence") and word.confidence is not None:
                            confs.append(float(word.confidence))
                conf = round(sum(confs) / len(confs), 4) if confs else 0.75

            if conf == 0.0:
                conf = 0.75  # default confidence for image regions

            descriptions.append({
                "figureName": f"Figure {idx + 1}",
                "description": caption or f"Embedded diagram {idx + 1}",
                "confidence": conf,
                "confidenceCategory": get_confidence_category(conf),
            })

    # If Document Intelligence did not expose figures, use paragraph-level
    # heuristics to infer diagram descriptions from alt-text-like content.
    if not descriptions and hasattr(result, "paragraphs") and result.paragraphs:
        diagram_keywords = (
            "bode", "circuit", "block diagram", "schematic", "figure",
            "frequency response", "magnitude", "phase", "transfer function",
        )
        fig_counter = 0
        for para in result.paragraphs:
            content = (para.content or "").strip() if hasattr(para, "content") else ""
            cl = content.lower()
            if any(kw in cl for kw in diagram_keywords) and len(content) > 15:
                fig_counter += 1
                conf = _avg_word_confidences(result) or 0.75
                descriptions.append({
                    "figureName": f"Inferred Figure {fig_counter}",
                    "description": content[:300],
                    "confidence": conf,
                    "confidenceCategory": get_confidence_category(conf),
                })
            if fig_counter >= 4:
                break

    return descriptions


def _extract_metadata_from_filename(filename: str) -> dict:
    """
    Parse filter family, variant index, and type from filename.
    Pattern: filter_design_<family_key>_<variant_index>.pptx
    """
    base = filename.replace(".pptx", "")
    parts = base.split("_")
    # filter_design_butterworth_lp_01 → parts = [filter, design, butterworth, lp, 01]
    # We reassemble everything after "filter_design_"
    if len(parts) >= 3 and parts[0] == "filter" and parts[1] == "design":
        family_parts = parts[2:-1]  # exclude last index part
        family_key   = "_".join(family_parts)
        variant_idx  = parts[-1] if parts[-1].isdigit() else "01"
    else:
        family_key  = "unknown"
        variant_idx = "01"

    return {
        "documentType": "pptx",
        "filterFamily": family_key,
        "variantIndex": variant_idx,
        # Re-use state / stateName fields for filter family / variant for UI compatibility
        "state": family_key[:8].upper(),
        "stateName": family_key.replace("_", " ").title(),
    }


def organize_pptx_sections(result) -> list:
    """
    Organise Document Intelligence output into engineering-domain sections.
    Returns the same section schema as parse_documents.py so the UI works
    identically for both PDF and PPTX documents.
    """
    sections: dict[str, dict] = {}

    def _add_field(section_name, field_name, value, confidence):
        if section_name not in sections:
            sections[section_name] = {"fields": [], "imageDescriptions": []}
        sections[section_name]["fields"].append({
            "fieldName": field_name,
            "extractedValue": value or "",
            "confidence": round(max(0.0, min(1.0, confidence)), 4),
            "confidenceCategory": get_confidence_category(confidence),
            "correctedValue": None,
            "correctedBy": None,
            "correctedAt": None,
        })

    # --- Key-value pairs ---
    if hasattr(result, "key_value_pairs") and result.key_value_pairs:
        for kv in result.key_value_pairs:
            key_content = ""
            if kv.key and hasattr(kv.key, "content"):
                key_content = kv.key.content.strip()
            if not key_content:
                continue
            value_content = ""
            if kv.value and hasattr(kv.value, "content"):
                value_content = kv.value.content.strip()
            confidence = float(kv.confidence) if hasattr(kv, "confidence") and kv.confidence is not None else 0.0
            if confidence == 0.0:
                confidence = _avg_word_confidences(result)
            section_name = _resolve_pptx_section(key_content)
            _add_field(section_name, key_content, value_content, confidence)

    # --- Document-level fields ---
    if hasattr(result, "documents") and result.documents:
        for doc in result.documents:
            if not hasattr(doc, "fields") or not doc.fields:
                continue
            for field_name, field_value in doc.fields.items():
                already = any(
                    field_name.lower() == f["fieldName"].lower()
                    for sec in sections.values()
                    for f in sec["fields"]
                )
                if already:
                    continue
                confidence = float(field_value.confidence) if hasattr(field_value, "confidence") and field_value.confidence else 0.0
                value = ""
                if hasattr(field_value, "content") and field_value.content:
                    value = field_value.content
                elif hasattr(field_value, "value_string") and field_value.value_string:
                    value = field_value.value_string
                elif hasattr(field_value, "value") and field_value.value is not None:
                    value = str(field_value.value)
                section_name = _resolve_pptx_section(field_name)
                _add_field(section_name, field_name, value, confidence)

    # --- Tables ---
    if hasattr(result, "tables") and result.tables:
        for table_idx, table in enumerate(result.tables):
            section_name = "Design Parameters"
            headers = {}
            for cell in table.cells:
                if cell.row_index == 0:
                    headers[cell.column_index] = (
                        cell.content.strip() if hasattr(cell, "content") else f"Col {cell.column_index}"
                    )
            for cell in table.cells:
                if cell.row_index == 0:
                    continue
                col_name   = headers.get(cell.column_index, f"Col {cell.column_index}")
                field_name = f"{col_name} (Row {cell.row_index})"
                value      = cell.content.strip() if hasattr(cell, "content") else ""
                confidence = float(cell.confidence) if hasattr(cell, "confidence") and cell.confidence else 0.0
                if confidence == 0.0:
                    confidence = _avg_word_confidences(result)
                _add_field(section_name, field_name, value, confidence)

    # --- Paragraphs fallback ---
    if not sections and hasattr(result, "paragraphs") and result.paragraphs:
        avg_conf = _avg_word_confidences(result)
        for i, para in enumerate(result.paragraphs):
            content = (para.content or "").strip() if hasattr(para, "content") else ""
            if not content or len(content) < 3:
                continue
            if ":" in content:
                parts = content.split(":", 1)
                key = parts[0].strip()
                val = parts[1].strip()
            else:
                key = f"Paragraph {i + 1}"
                val = content
            sec = _resolve_pptx_section(key)
            _add_field(sec, key, val, avg_conf)

    # --- Image descriptions (figures) ---
    image_descriptions = _extract_image_descriptions(result)
    # Attach to the most relevant section, or create a dedicated one
    if image_descriptions:
        img_sec = "Frequency Response"  # most likely to have diagrams
        if img_sec not in sections:
            sections[img_sec] = {"fields": [], "imageDescriptions": []}
        sections[img_sec]["imageDescriptions"].extend(image_descriptions)

    # --- Build section list ---
    section_list = []
    for idx, (sec_name, sec_data) in enumerate(sorted(sections.items())):
        fields = sec_data["fields"]
        avg_conf = round(sum(f["confidence"] for f in fields) / len(fields), 4) if fields else 0.75
        section_list.append({
            "sectionName": sec_name,
            "sectionIndex": idx + 1,
            "sectionConfidence": avg_conf,
            "confidenceCategory": get_confidence_category(avg_conf),
            "fields": fields,
            "imageDescriptions": sec_data.get("imageDescriptions", []),
        })

    return section_list


def parse_single_pptx(di_client: DocumentIntelligenceClient,
                       blob_url: str, filename: str,
                       sas_token: str = "", model_id: str = "") -> dict:
    """Parse a single PPTX and return a structured result ready for Cosmos DB."""
    effective_model = model_id or MODEL_ID
    doc_url = f"{blob_url}/{CONTAINER_NAME}/{filename}"
    if sas_token:
        doc_url = f"{doc_url}?{sas_token}"

    meta = _extract_metadata_from_filename(filename)

    poller = di_client.begin_analyze_document(
        effective_model,
        AnalyzeDocumentRequest(url_source=doc_url),
    )
    result = poller.result()

    sections = organize_pptx_sections(result)

    all_confidences = [s["sectionConfidence"] for s in sections]
    overall_confidence = round(sum(all_confidences) / len(all_confidences), 4) if all_confidences else 0.0

    return {
        "id": str(uuid.uuid4()),
        "fileName": filename,
        "state": meta["state"],
        "stateName": meta["stateName"],
        "blobUrl": doc_url,
        "status": "parsed",
        "documentType": "pptx",
        "filterFamily": meta["filterFamily"],
        "variantIndex": meta["variantIndex"],
        "uploadedAt": datetime.now(timezone.utc).isoformat(),
        "parsedAt": datetime.now(timezone.utc).isoformat(),
        "overallConfidence": overall_confidence,
        "confidenceCategory": get_confidence_category(overall_confidence),
        "confidenceLabel": get_confidence_label(get_confidence_category(overall_confidence)),
        "modelSource": effective_model,
        "sections": sections,
        "totalFields": sum(len(s["fields"]) for s in sections),
        "totalSections": len(sections),
        "reviewedBy": None,
        "reviewedAt": None,
        "approvedBy": None,
        "approvedAt": None,
    }


def _build_comparison(di_client, blob_url, filename, sas_token, comparison_model_id):
    """Parse with the comparison model and return a compact summary."""
    doc_url = f"{blob_url}/{CONTAINER_NAME}/{filename}"
    if sas_token:
        doc_url = f"{doc_url}?{sas_token}"
    try:
        poller = di_client.begin_analyze_document(
            comparison_model_id,
            AnalyzeDocumentRequest(url_source=doc_url),
        )
        result = poller.result()
    except Exception as exc:
        return {"modelId": comparison_model_id, "error": str(exc)}

    avg_conf = _avg_word_confidences(result)
    word_count = 0
    if hasattr(result, "pages") and result.pages:
        for page in result.pages:
            if hasattr(page, "words") and page.words:
                word_count += len(page.words)

    return {
        "modelId": comparison_model_id,
        "overallConfidence": avg_conf,
        "confidenceCategory": get_confidence_category(avg_conf),
        "totalWords": word_count,
    }


def store_in_cosmos(cosmos_client: CosmosClient, document: dict):
    """Store a parsed document record in Cosmos DB."""
    database  = cosmos_client.get_database_client(cfg.azure.cosmos_db.database)
    container = database.get_container_client(cfg.azure.cosmos_db.container)
    container.upsert_item(document)


def list_pptx_blobs(blob_service: BlobServiceClient) -> list:
    """List all PPTX blobs in the storage container."""
    container_client = blob_service.get_container_client(CONTAINER_NAME)
    return [b.name for b in container_client.list_blobs() if b.name.lower().endswith(".pptx")]


def main():
    from azure.storage.blob import generate_container_sas, ContainerSasPermissions

    parser = argparse.ArgumentParser(
        description="Parse filter-design PPTX files with Azure AI Document Intelligence.")
    parser.add_argument("--model", type=str, default="",
                        help="Override the model ID.")
    parser.add_argument("--compare", action="store_true",
                        help="Also parse with the comparison (OCR/read) model.")
    parser.add_argument("--prefix", type=str, default="",
                        help="Only process blobs whose names start with this prefix.")
    args = parser.parse_args()

    effective_model   = args.model or MODEL_ID
    comparison_model  = cfg.comparison_model_id
    print(f"Primary model   : {effective_model}")
    if args.compare:
        print(f"Comparison model: {comparison_model}")

    credential = DefaultAzureCredential()

    di_client = DocumentIntelligenceClient(
        endpoint=cfg.di_endpoint,
        credential=credential,
    )
    blob_service = BlobServiceClient(
        account_url=BLOB_URL,
        credential=credential,
    )
    cosmos_client = CosmosClient(
        url=cfg.cosmos_endpoint,
        credential=credential,
    )

    # Generate a user-delegation SAS so Document Intelligence can read the blobs
    udk = blob_service.get_user_delegation_key(
        key_start_time=datetime.now(timezone.utc),
        key_expiry_time=datetime.now(timezone.utc) + __import__("datetime").timedelta(hours=2),
    )
    sas_token = generate_container_sas(
        account_name=cfg.azure.storage.account_name,
        container_name=CONTAINER_NAME,
        user_delegation_key=udk,
        permission=ContainerSasPermissions(read=True),
        expiry=datetime.now(timezone.utc) + __import__("datetime").timedelta(hours=2),
    )
    print("Generated SAS token for Document Intelligence access.")

    pptx_blobs = list_pptx_blobs(blob_service)
    if args.prefix:
        pptx_blobs = [b for b in pptx_blobs if b.startswith(args.prefix)]
    if not pptx_blobs:
        print("No PPTX files found in blob storage. Run upload_to_blob.py first.")
        sys.exit(1)

    print(f"Found {len(pptx_blobs)} PPTX files to parse.")
    print("=" * 60)

    results_summary = {"Blue": 0, "Green": 0, "Yellow": 0, "Red": 0}
    errors = []

    for i, filename in enumerate(pptx_blobs, 1):
        try:
            print(f"[{i}/{len(pptx_blobs)}] Parsing {filename}...", end=" ")
            document = parse_single_pptx(
                di_client, BLOB_URL, filename, sas_token, model_id=effective_model)

            if args.compare:
                comparison = _build_comparison(
                    di_client, BLOB_URL, filename, sas_token,
                    comparison_model_id=comparison_model)
                document["modelComparison"] = comparison

            store_in_cosmos(cosmos_client, document)

            cat = document["confidenceCategory"]
            results_summary[cat] += 1
            cmp_info = ""
            if args.compare and "modelComparison" in document:
                cmp = document["modelComparison"]
                if "overallConfidence" in cmp:
                    cmp_info = (
                        f" | OCR: {cmp['overallConfidence']:.2%} "
                        f"({cmp['confidenceCategory']})"
                    )
            print(
                f"{cat} ({document['overallConfidence']:.2%}) - "
                f"{document['totalSections']} sections, "
                f"{document['totalFields']} fields{cmp_info}"
            )

        except Exception as e:
            errors.append((filename, str(e)))
            print(f"ERROR: {e}")

    print("\n" + "=" * 60)
    print("PARSING SUMMARY")
    print("=" * 60)
    print(f"  Primary model: {effective_model}")
    print(f"  Blue  (Outstanding, >90%):  {results_summary['Blue']}")
    print(f"  Green (High, >80%):         {results_summary['Green']}")
    print(f"  Yellow (Medium, >60%):      {results_summary['Yellow']}")
    print(f"  Red   (Needs Review, <60%): {results_summary['Red']}")
    print(f"  Errors:                     {len(errors)}")

    if errors:
        print("\nErrors:")
        for fn, err in errors:
            print(f"  - {fn}: {err}")


if __name__ == "__main__":
    main()

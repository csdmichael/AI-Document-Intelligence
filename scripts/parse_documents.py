"""
Parse all tax exemption PDFs using Azure AI Document Intelligence.
Extracts fields by section, computes confidence scores, and stores results in Cosmos DB.

Uses managed identity (DefaultAzureCredential) throughout.

Optional flags
--------------
--model MODEL_ID    Override the model ID from config (e.g. a custom model ID).
--compare           Also parse with the comparison model (prebuilt-read / OCR)
                    and store the comparison result alongside the primary result.
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
from azure.cosmos import CosmosClient, PartitionKey
from azure.storage.blob import BlobServiceClient
from config import cfg

CONTAINER_NAME = cfg.azure.storage.container_name
BLOB_URL = cfg.blob_url
MODEL_ID = cfg.doc_intelligence.model.model_id


def get_confidence_category(score: float) -> str:
    """Map confidence score to color category using config thresholds."""
    return cfg.get_confidence_category(score)


def get_confidence_label(category: str) -> str:
    """Get human-readable label for a confidence category."""
    return cfg.get_confidence_label(category)


def extract_state_from_filename(filename: str) -> tuple:
    """Extract state abbreviation and full name from filename pattern."""
    # Pattern: tax_exemption_CA_001.pdf
    parts = filename.replace(".pdf", "").split("_")
    state_abbr = parts[2] if len(parts) >= 3 else "UNKNOWN"

    state_map = {
        "AL": "Alabama", "AK": "Alaska", "AZ": "Arizona", "AR": "Arkansas",
        "CA": "California", "CO": "Colorado", "CT": "Connecticut", "DE": "Delaware",
        "FL": "Florida", "GA": "Georgia", "HI": "Hawaii", "ID": "Idaho",
        "IL": "Illinois", "IN": "Indiana", "IA": "Iowa", "KS": "Kansas",
        "KY": "Kentucky", "LA": "Louisiana", "ME": "Maine", "MD": "Maryland",
        "MA": "Massachusetts", "MI": "Michigan", "MN": "Minnesota", "MS": "Mississippi",
        "MO": "Missouri", "MT": "Montana", "NE": "Nebraska", "NV": "Nevada",
        "NH": "New Hampshire", "NJ": "New Jersey", "NM": "New Mexico", "NY": "New York",
        "NC": "North Carolina", "ND": "North Dakota", "OH": "Ohio", "OK": "Oklahoma",
        "OR": "Oregon", "PA": "Pennsylvania", "RI": "Rhode Island", "SC": "South Carolina",
        "SD": "South Dakota", "TN": "Tennessee", "TX": "Texas", "UT": "Utah",
        "VT": "Vermont", "VA": "Virginia", "WA": "Washington", "WV": "West Virginia",
        "WI": "Wisconsin", "WY": "Wyoming",
    }
    return state_abbr, state_map.get(state_abbr, state_abbr)


def organize_into_sections(result) -> list:
    """
    Organize Document Intelligence results into logical sections.
    Extracts fields with real confidence scores from key-value pairs,
    document fields, tables, and page words.
    """
    sections = {}

    def _resolve_section(field_name: str) -> str:
        return cfg.get_section_name(field_name)

    def _add_field(section_name: str, field_name: str, value: str, confidence: float):
        if section_name not in sections:
            sections[section_name] = {"fields": []}
        sections[section_name]["fields"].append({
            "fieldName": field_name,
            "extractedValue": value or "",
            "confidence": round(max(0.0, min(1.0, confidence)), 4),
            "confidenceCategory": get_confidence_category(confidence),
            "correctedValue": None,
            "correctedBy": None,
            "correctedAt": None,
        })

    # --- Source 1: Key-value pairs (best source for form-like documents) ---
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

            # Confidence comes from the KV pair itself
            confidence = 0.0
            if hasattr(kv, "confidence") and kv.confidence is not None:
                confidence = float(kv.confidence)
            else:
                # Fallback: average word-level confidence from the value spans
                word_confs = []
                if kv.value and hasattr(kv.value, "spans") and kv.value.spans and hasattr(result, "pages"):
                    for page in result.pages:
                        if hasattr(page, "words") and page.words:
                            for word in page.words:
                                if hasattr(word, "confidence") and word.confidence is not None:
                                    word_confs.append(float(word.confidence))
                if word_confs:
                    confidence = sum(word_confs) / len(word_confs)

            section_name = _resolve_section(key_content)
            _add_field(section_name, key_content, value_content, confidence)

    # --- Source 2: Document-level fields (prebuilt models like prebuilt-document) ---
    if hasattr(result, "documents") and result.documents:
        for doc in result.documents:
            if not hasattr(doc, "fields") or not doc.fields:
                continue
            for field_name, field_value in doc.fields.items():
                # Skip if we already extracted this field from key-value pairs
                already_exists = any(
                    field_name.lower() == f["fieldName"].lower()
                    for sec in sections.values()
                    for f in sec["fields"]
                )
                if already_exists:
                    continue

                confidence = 0.0
                if hasattr(field_value, "confidence") and field_value.confidence is not None:
                    confidence = float(field_value.confidence)

                value = ""
                if hasattr(field_value, "content") and field_value.content:
                    value = field_value.content
                elif hasattr(field_value, "value_string") and field_value.value_string:
                    value = field_value.value_string
                elif hasattr(field_value, "value") and field_value.value is not None:
                    value = str(field_value.value)

                section_name = _resolve_section(field_name)
                _add_field(section_name, field_name, value, confidence)

    # --- Source 3: Tables (fallback, use cell-level confidence) ---
    if not sections and hasattr(result, "tables") and result.tables:
        for table_idx, table in enumerate(result.tables):
            section_name = f"Table {table_idx + 1}"
            # Build header row for column names
            headers = {}
            for cell in table.cells:
                if cell.row_index == 0:
                    headers[cell.column_index] = cell.content.strip() if hasattr(cell, "content") else f"Col {cell.column_index}"

            for cell in table.cells:
                if cell.row_index == 0:
                    continue  # skip header row
                col_name = headers.get(cell.column_index, f"Col {cell.column_index}")
                field_name = f"{col_name} (Row {cell.row_index})"
                value = cell.content.strip() if hasattr(cell, "content") else ""

                confidence = 0.0
                if hasattr(cell, "confidence") and cell.confidence is not None:
                    confidence = float(cell.confidence)
                # If cell confidence is missing, derive from page words
                if confidence == 0.0 and hasattr(result, "pages"):
                    word_confs = _get_word_confidences_for_content(result, value)
                    if word_confs:
                        confidence = sum(word_confs) / len(word_confs)

                _add_field(section_name, field_name, value, confidence)

    # --- Source 4: Paragraphs as last resort ---
    if not sections and hasattr(result, "paragraphs") and result.paragraphs:
        section_name = "Extracted Text"
        for i, para in enumerate(result.paragraphs):
            content = para.content.strip() if hasattr(para, "content") else ""
            if not content or len(content) < 3:
                continue
            # Split paragraph into "key: value" if possible
            if ":" in content:
                parts = content.split(":", 1)
                key = parts[0].strip()
                val = parts[1].strip()
            else:
                key = f"Paragraph {i + 1}"
                val = content

            # Derive confidence from word-level scores
            confidence = 0.0
            word_confs = _get_word_confidences_for_content(result, content)
            if word_confs:
                confidence = sum(word_confs) / len(word_confs)

            real_section = _resolve_section(key)
            _add_field(real_section, key, val, confidence)

    # Compute section-level confidence
    section_list = []
    for idx, (sec_name, sec_data) in enumerate(sorted(sections.items())):
        fields = sec_data["fields"]
        if fields:
            avg_conf = round(sum(f["confidence"] for f in fields) / len(fields), 4)
        else:
            avg_conf = 0.0

        section_list.append({
            "sectionName": sec_name,
            "sectionIndex": idx + 1,
            "sectionConfidence": avg_conf,
            "confidenceCategory": get_confidence_category(avg_conf),
            "fields": fields,
        })

    return section_list


def _get_word_confidences_for_content(result, content: str) -> list:
    """Extract word-level confidence scores that match the given content."""
    if not content or not hasattr(result, "pages"):
        return []
    content_lower = content.lower()
    confs = []
    for page in result.pages:
        if not hasattr(page, "words") or not page.words:
            continue
        for word in page.words:
            word_text = word.content.lower() if hasattr(word, "content") else ""
            if word_text and word_text in content_lower:
                if hasattr(word, "confidence") and word.confidence is not None:
                    confs.append(float(word.confidence))
    return confs


def parse_single_document(di_client: DocumentIntelligenceClient,
                          blob_url: str, filename: str,
                          sas_token: str = "",
                          model_id: str = "") -> dict:
    """Parse a single PDF document and return structured results."""
    effective_model = model_id or MODEL_ID
    doc_url = f"{blob_url}/{CONTAINER_NAME}/{filename}"
    if sas_token:
        doc_url = f"{doc_url}?{sas_token}"
    state_abbr, state_name = extract_state_from_filename(filename)

    poller = di_client.begin_analyze_document(
        effective_model,
        AnalyzeDocumentRequest(url_source=doc_url),
        features=[DocumentAnalysisFeature.KEY_VALUE_PAIRS],
    )
    result = poller.result()

    sections = organize_into_sections(result)

    # Compute document-level confidence
    all_confidences = []
    for section in sections:
        all_confidences.append(section["sectionConfidence"])

    overall_confidence = round(
        sum(all_confidences) / len(all_confidences), 4
    ) if all_confidences else 0.0

    return {
        "id": str(uuid.uuid4()),
        "fileName": filename,
        "state": state_abbr,
        "stateName": state_name,
        "blobUrl": doc_url,
        "status": "parsed",
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


def _build_comparison(di_client: DocumentIntelligenceClient,
                      blob_url: str, filename: str,
                      sas_token: str,
                      comparison_model_id: str) -> dict:
    """
    Parse the document with the comparison model (e.g. prebuilt-read) and
    return a compact comparison summary.
    """
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

    # For prebuilt-read the primary signal is word-level confidence
    word_confs = []
    if hasattr(result, "pages") and result.pages:
        for page in result.pages:
            if hasattr(page, "words") and page.words:
                for w in page.words:
                    if hasattr(w, "confidence") and w.confidence is not None:
                        word_confs.append(float(w.confidence))

    avg_conf = round(sum(word_confs) / len(word_confs), 4) if word_confs else 0.0

    return {
        "modelId": comparison_model_id,
        "overallConfidence": avg_conf,
        "confidenceCategory": get_confidence_category(avg_conf),
        "totalWords": len(word_confs),
    }


def store_in_cosmos(cosmos_client: CosmosClient, document: dict):
    """Store a parsed document record in Cosmos DB."""
    database = cosmos_client.get_database_client(cfg.azure.cosmos_db.database)
    container = database.get_container_client(cfg.azure.cosmos_db.container)
    container.upsert_item(document)


def list_blobs(blob_service: BlobServiceClient) -> list:
    """List all PDF blobs in the tax-forms container."""
    container_client = blob_service.get_container_client(CONTAINER_NAME)
    return [b.name for b in container_client.list_blobs() if b.name.endswith(".pdf")]


def main():
    from azure.storage.blob import generate_container_sas, ContainerSasPermissions

    parser = argparse.ArgumentParser(
        description="Parse tax exemption PDFs with Azure AI Document Intelligence.")
    parser.add_argument(
        "--model", type=str, default="",
        help="Override the model ID (e.g. a custom trained model ID).")
    parser.add_argument(
        "--compare", action="store_true",
        help="Also parse with the comparison (OCR/read) model and store the "
             "comparison result in the document record.")
    parser.add_argument(
        "--prefix", type=str, default="",
        help="Only process blobs whose names start with this prefix.")
    args = parser.parse_args()

    effective_model = args.model or MODEL_ID
    comparison_model = cfg.comparison_model_id
    print(f"Primary model   : {effective_model}")
    if args.compare:
        print(f"Comparison model: {comparison_model}")

    credential = DefaultAzureCredential()

    # Initialize clients
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

    # Generate a user delegation SAS so Document Intelligence can access the blobs
    udk = blob_service.get_user_delegation_key(
        key_start_time=datetime.now(timezone.utc),
        key_expiry_time=datetime.now(timezone.utc) + __import__('datetime').timedelta(hours=2),
    )
    sas_token = generate_container_sas(
        account_name=cfg.azure.storage.account_name,
        container_name=CONTAINER_NAME,
        user_delegation_key=udk,
        permission=ContainerSasPermissions(read=True),
        expiry=datetime.now(timezone.utc) + __import__('datetime').timedelta(hours=2),
    )
    print(f"Generated SAS token for Document Intelligence access.")

    # List all PDFs in blob storage
    pdf_blobs = list_blobs(blob_service)
    if args.prefix:
        pdf_blobs = [b for b in pdf_blobs if b.startswith(args.prefix)]
    if not pdf_blobs:
        print("No PDF files found in blob storage. Run upload_to_blob.py first.")
        sys.exit(1)

    print(f"Found {len(pdf_blobs)} PDF files to parse.")
    print("=" * 60)

    results_summary = {"Blue": 0, "Green": 0, "Yellow": 0, "Red": 0}
    errors = []

    for i, filename in enumerate(pdf_blobs, 1):
        try:
            print(f"[{i}/{len(pdf_blobs)}] Parsing {filename}...", end=" ")
            document = parse_single_document(
                di_client, BLOB_URL, filename, sas_token,
                model_id=effective_model)

            # Optional: run comparison model
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
            print(f"{cat} ({document['overallConfidence']:.2%}) - "
                  f"{document['totalSections']} sections, "
                  f"{document['totalFields']} fields{cmp_info}")

        except Exception as e:
            errors.append((filename, str(e)))
            print(f"ERROR: {e}")

    # Summary
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

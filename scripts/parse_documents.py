"""
Parse all tax exemption PDFs using Azure AI Document Intelligence.
Extracts fields by section, computes confidence scores, and stores results in Cosmos DB.

Uses managed identity (DefaultAzureCredential) throughout.
"""

import os
import sys
import uuid
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from azure.identity import DefaultAzureCredential
from azure.ai.documentintelligence import DocumentIntelligenceClient
from azure.ai.documentintelligence.models import AnalyzeDocumentRequest
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
    Returns a list of section dicts with field-level confidence scores.
    """
    sections = {}

    def _resolve_section(field_name: str) -> str:
        """Use config-driven section mapping to classify a field."""
        return cfg.get_section_name(field_name)

    # Process document fields from the analyzed result
    if hasattr(result, "documents") and result.documents:
        for doc in result.documents:
            if hasattr(doc, "fields") and doc.fields:
                for field_name, field_value in doc.fields.items():
                    # Determine section from config-driven mapping
                    section_name = _resolve_section(field_name)

                    if section_name not in sections:
                        sections[section_name] = {"fields": []}

                    confidence = field_value.confidence if hasattr(field_value, "confidence") and field_value.confidence else 0.0
                    value = field_value.content if hasattr(field_value, "content") else str(field_value.value) if hasattr(field_value, "value") else ""

                    sections[section_name]["fields"].append({
                        "fieldName": field_name,
                        "extractedValue": value or "",
                        "confidence": round(confidence, 4),
                        "confidenceCategory": get_confidence_category(confidence),
                        "correctedValue": None,
                        "correctedBy": None,
                        "correctedAt": None,
                    })

    # Fall back to key-value pairs if no document-level fields
    if not sections and hasattr(result, "key_value_pairs") and result.key_value_pairs:
        for kv in result.key_value_pairs:
            key_content = kv.key.content if kv.key and hasattr(kv.key, "content") else "Unknown"
            value_content = kv.value.content if kv.value and hasattr(kv.value, "content") else ""
            confidence = kv.confidence if hasattr(kv, "confidence") and kv.confidence else 0.0

            section_name = _resolve_section(key_content)

            if section_name not in sections:
                sections[section_name] = {"fields": []}

            sections[section_name]["fields"].append({
                "fieldName": key_content,
                "extractedValue": value_content,
                "confidence": round(confidence, 4),
                "confidenceCategory": get_confidence_category(confidence),
                "correctedValue": None,
                "correctedBy": None,
                "correctedAt": None,
            })

    # Fall back to tables
    if not sections and hasattr(result, "tables") and result.tables:
        section_name = "Table Data"
        sections[section_name] = {"fields": []}
        for table in result.tables:
            for cell in table.cells:
                confidence = cell.confidence if hasattr(cell, "confidence") and cell.confidence else 0.5
                sections[section_name]["fields"].append({
                    "fieldName": f"Row {cell.row_index} Col {cell.column_index}",
                    "extractedValue": cell.content if hasattr(cell, "content") else "",
                    "confidence": round(confidence, 4),
                    "confidenceCategory": get_confidence_category(confidence),
                    "correctedValue": None,
                    "correctedBy": None,
                    "correctedAt": None,
                })

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


def parse_single_document(di_client: DocumentIntelligenceClient,
                          blob_url: str, filename: str,
                          sas_token: str = "") -> dict:
    """Parse a single PDF document and return structured results."""
    doc_url = f"{blob_url}/{CONTAINER_NAME}/{filename}"
    if sas_token:
        doc_url = f"{doc_url}?{sas_token}"
    state_abbr, state_name = extract_state_from_filename(filename)

    poller = di_client.begin_analyze_document(
        MODEL_ID,
        AnalyzeDocumentRequest(url_source=doc_url),
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
        "sections": sections,
        "totalFields": sum(len(s["fields"]) for s in sections),
        "totalSections": len(sections),
        "reviewedBy": None,
        "reviewedAt": None,
        "approvedBy": None,
        "approvedAt": None,
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
            document = parse_single_document(di_client, BLOB_URL, filename, sas_token)
            store_in_cosmos(cosmos_client, document)

            cat = document["confidenceCategory"]
            results_summary[cat] += 1
            print(f"{cat} ({document['overallConfidence']:.2%}) - "
                  f"{document['totalSections']} sections, "
                  f"{document['totalFields']} fields")

        except Exception as e:
            errors.append((filename, str(e)))
            print(f"ERROR: {e}")

    # Summary
    print("\n" + "=" * 60)
    print("PARSING SUMMARY")
    print("=" * 60)
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

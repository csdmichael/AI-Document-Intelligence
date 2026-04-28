"""
FastAPI backend for the AI Document Intelligence Tax Form Processing solution.
All Azure access uses managed identity via DefaultAzureCredential.
"""

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from azure.identity import DefaultAzureCredential
from azure.cosmos import CosmosClient
from azure.storage.blob import BlobServiceClient
from datetime import datetime, timezone
from typing import Optional

from api.config import (
    BLOB_URL, STORAGE_CONTAINER_NAME, COSMOS_ENDPOINT,
    COSMOS_DATABASE, COSMOS_CONTAINER, API_HOST, API_PORT,
)
from api.models import (
    FieldUpdate, DocumentSummary, DocumentDetail,
    ConfidenceStats, BlobFile, RetrainingStatus,
)

app = FastAPI(
    title="AI Document Intelligence - Tax Form Processor",
    version="1.0.0",
    description="Parse, review, and correct tax exemption forms with AI Document Intelligence",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Shared credential and clients (initialized lazily)
_credential = None
_cosmos_client = None
_blob_client = None


def get_credential():
    global _credential
    if _credential is None:
        _credential = DefaultAzureCredential()
    return _credential


def get_cosmos_container():
    global _cosmos_client
    if _cosmos_client is None:
        _cosmos_client = CosmosClient(url=COSMOS_ENDPOINT, credential=get_credential())
    db = _cosmos_client.get_database_client(COSMOS_DATABASE)
    return db.get_container_client(COSMOS_CONTAINER)


def get_blob_container():
    global _blob_client
    if _blob_client is None:
        _blob_client = BlobServiceClient(account_url=BLOB_URL, credential=get_credential())
    return _blob_client.get_container_client(STORAGE_CONTAINER_NAME)


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

@app.get("/health")
def health():
    return {"status": "healthy"}


# ---------------------------------------------------------------------------
# Blob Storage Endpoints (unparsed documents)
# ---------------------------------------------------------------------------

@app.get("/api/blobs", response_model=list[BlobFile])
def list_blobs():
    """List all PDF files in the tax-forms blob container."""
    container = get_blob_container()
    blobs = []
    for b in container.list_blobs():
        if b.name.endswith(".pdf"):
            blobs.append(BlobFile(
                name=b.name,
                size=b.size or 0,
                lastModified=b.last_modified.isoformat() if b.last_modified else "",
                url=f"{BLOB_URL}/{STORAGE_CONTAINER_NAME}/{b.name}",
            ))
    return blobs


# ---------------------------------------------------------------------------
# Parsed Documents Endpoints
# ---------------------------------------------------------------------------

@app.get("/api/documents", response_model=list[DocumentSummary])
def list_documents(
    category: Optional[str] = Query(None, description="Filter by confidence category: Blue|Green|Yellow|Red"),
    state: Optional[str] = Query(None, description="Filter by state abbreviation"),
    status: Optional[str] = Query(None, description="Filter by status: pending|parsed|reviewed|approved"),
    reviewed: Optional[bool] = Query(None, description="Filter by reviewed (true) or not reviewed (false)"),
):
    """List all parsed documents with optional filters."""
    container = get_cosmos_container()

    conditions = []
    params = []
    if category:
        conditions.append("c.confidenceCategory = @category")
        params.append({"name": "@category", "value": category})
    if state:
        conditions.append("c.state = @state")
        params.append({"name": "@state", "value": state.upper()})
    if status:
        conditions.append("c.status = @status")
        params.append({"name": "@status", "value": status})
    if reviewed is True:
        conditions.append("(c.status = 'reviewed' OR c.status = 'approved')")
    elif reviewed is False:
        conditions.append("(c.status != 'reviewed' AND c.status != 'approved')")

    where_clause = " AND ".join(conditions)
    query = "SELECT c.id, c.fileName, c.state, c.stateName, c.status, " \
            "c.overallConfidence, c.confidenceCategory, c.totalSections, " \
            "c.totalFields, c.parsedAt FROM c"
    if where_clause:
        query += f" WHERE {where_clause}"
    query += " ORDER BY c.overallConfidence ASC"

    items = list(container.query_items(query=query, parameters=params or None, enable_cross_partition_query=True))
    return items


@app.get("/api/documents/stats", response_model=ConfidenceStats)
def get_confidence_stats():
    """Get document count per confidence category."""
    container = get_cosmos_container()
    query = "SELECT VALUE c.confidenceCategory FROM c"
    categories = list(container.query_items(query=query, enable_cross_partition_query=True))

    stats = ConfidenceStats()
    for cat in categories:
        cat_lower = (cat or "").lower()
        if cat_lower == "blue":
            stats.blue += 1
        elif cat_lower == "green":
            stats.green += 1
        elif cat_lower == "yellow":
            stats.yellow += 1
        elif cat_lower == "red":
            stats.red += 1
    stats.total = stats.blue + stats.green + stats.yellow + stats.red
    return stats


@app.get("/api/documents/{document_id}", response_model=DocumentDetail)
def get_document(document_id: str):
    """Get a single parsed document with all sections and fields."""
    container = get_cosmos_container()
    query = "SELECT * FROM c WHERE c.id = @id"
    params = [{"name": "@id", "value": document_id}]
    items = list(container.query_items(query=query, parameters=params, enable_cross_partition_query=True))

    if not items:
        raise HTTPException(status_code=404, detail="Document not found")
    return items[0]


@app.put("/api/documents/{document_id}/sections/{section_index}/fields/{field_name}")
def update_field(document_id: str, section_index: int, field_name: str, update: FieldUpdate):
    """
    Update a field's corrected value (human-in-the-loop correction).
    This stores the correction alongside the original extracted value.
    """
    container = get_cosmos_container()

    # Find the document
    query = "SELECT * FROM c WHERE c.id = @id"
    params = [{"name": "@id", "value": document_id}]
    items = list(container.query_items(query=query, parameters=params, enable_cross_partition_query=True))

    if not items:
        raise HTTPException(status_code=404, detail="Document not found")

    doc = items[0]

    # Find the section
    section = None
    for s in doc.get("sections", []):
        if s.get("sectionIndex") == section_index:
            section = s
            break

    if not section:
        raise HTTPException(status_code=404, detail=f"Section index {section_index} not found")

    # Find and update the field
    field_found = False
    for field in section.get("fields", []):
        if field.get("fieldName") == field_name:
            field["correctedValue"] = update.correctedValue
            field["correctedBy"] = update.correctedBy
            field["correctedAt"] = datetime.now(timezone.utc).isoformat()
            field_found = True
            break

    if not field_found:
        raise HTTPException(status_code=404, detail=f"Field '{field_name}' not found in section")

    # Update document status
    doc["status"] = "reviewed"
    doc["reviewedBy"] = update.correctedBy
    doc["reviewedAt"] = datetime.now(timezone.utc).isoformat()

    # Upsert back to Cosmos DB
    container.upsert_item(doc)

    return {"message": "Field updated", "documentId": document_id, "field": field_name}


@app.put("/api/documents/{document_id}/approve")
def approve_document(document_id: str, approved_by: str = Query(...)):
    """Mark a document as approved after human review."""
    container = get_cosmos_container()
    query = "SELECT * FROM c WHERE c.id = @id"
    params = [{"name": "@id", "value": document_id}]
    items = list(container.query_items(query=query, parameters=params, enable_cross_partition_query=True))

    if not items:
        raise HTTPException(status_code=404, detail="Document not found")

    doc = items[0]
    doc["status"] = "approved"
    doc["approvedBy"] = approved_by
    doc["approvedAt"] = datetime.now(timezone.utc).isoformat()
    container.upsert_item(doc)

    return {"message": "Document approved", "documentId": document_id}


# ---------------------------------------------------------------------------
# Retraining — Export reviewed docs for model fine-tuning
# ---------------------------------------------------------------------------

@app.get("/api/retraining/stats", response_model=RetrainingStatus)
def get_retraining_stats():
    """Get counts of reviewed/approved documents available for retraining."""
    container = get_cosmos_container()
    query = "SELECT VALUE c.status FROM c"
    statuses = list(container.query_items(query=query, enable_cross_partition_query=True))

    reviewed = sum(1 for s in statuses if s in ("reviewed", "approved"))
    total_corrections = 0
    if reviewed > 0:
        corr_query = "SELECT VALUE c.sections FROM c WHERE c.status IN ('reviewed', 'approved')"
        sections_list = list(container.query_items(query=corr_query, enable_cross_partition_query=True))
        for sections in sections_list:
            for section in sections:
                for field in section.get("fields", []):
                    if field.get("correctedValue"):
                        total_corrections += 1

    return RetrainingStatus(
        reviewedDocuments=reviewed,
        totalDocuments=len(statuses),
        totalCorrections=total_corrections,
        readyForTraining=reviewed >= 5,
        minimumRequired=5,
    )


@app.post("/api/retraining/export")
def export_training_data():
    """Export reviewed documents with corrections as labeled training data."""
    container = get_cosmos_container()
    query = "SELECT * FROM c WHERE c.status IN ('reviewed', 'approved')"
    docs = list(container.query_items(query=query, enable_cross_partition_query=True))

    training_data = []
    for doc in docs:
        labeled_fields = []
        for section in doc.get("sections", []):
            for field in section.get("fields", []):
                labeled_fields.append({
                    "fieldName": field.get("fieldName"),
                    "extractedValue": field.get("extractedValue"),
                    "groundTruth": field.get("correctedValue") or field.get("extractedValue"),
                    "wasCorrected": field.get("correctedValue") is not None,
                    "originalConfidence": field.get("confidence"),
                })
        training_data.append({
            "documentId": doc.get("id"),
            "fileName": doc.get("fileName"),
            "state": doc.get("state"),
            "blobUrl": doc.get("blobUrl"),
            "fields": labeled_fields,
        })

    return {
        "exportedAt": datetime.now(timezone.utc).isoformat(),
        "documentCount": len(training_data),
        "documents": training_data,
    }


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api.app:app", host=API_HOST, port=API_PORT, reload=True)

"""Pydantic models for API request/response schemas."""

from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class FieldUpdate(BaseModel):
    correctedValue: str
    correctedBy: str


class FieldResponse(BaseModel):
    fieldName: str
    extractedValue: str
    confidence: float
    confidenceCategory: str
    correctedValue: Optional[str] = None
    correctedBy: Optional[str] = None
    correctedAt: Optional[str] = None


class ImageDescription(BaseModel):
    """Description of an embedded image or diagram extracted from a PPTX slide."""
    figureName: str
    description: str
    confidence: float
    confidenceCategory: str


class SectionResponse(BaseModel):
    sectionName: str
    sectionIndex: int
    sectionConfidence: float
    confidenceCategory: str
    fields: list[FieldResponse]
    imageDescriptions: list[ImageDescription] = []


class ModelComparison(BaseModel):
    """Result of running the OCR/read comparison model on the same document."""
    modelId: str
    overallConfidence: Optional[float] = None
    confidenceCategory: Optional[str] = None
    totalWords: Optional[int] = None
    error: Optional[str] = None


class DocumentSummary(BaseModel):
    id: str
    fileName: str
    state: str
    stateName: str
    status: str
    overallConfidence: float
    confidenceCategory: str
    totalSections: int
    totalFields: int
    parsedAt: Optional[str] = None
    modelSource: Optional[str] = None
    documentType: Optional[str] = "pdf"


class DocumentDetail(BaseModel):
    id: str
    fileName: str
    state: str
    stateName: str
    blobUrl: str
    status: str
    overallConfidence: float
    confidenceCategory: str
    confidenceLabel: Optional[str] = None
    modelSource: Optional[str] = None
    modelComparison: Optional[ModelComparison] = None
    sections: list[SectionResponse]
    totalSections: int
    totalFields: int
    uploadedAt: Optional[str] = None
    parsedAt: Optional[str] = None
    reviewedBy: Optional[str] = None
    reviewedAt: Optional[str] = None
    documentType: Optional[str] = "pdf"


class ConfidenceStats(BaseModel):
    blue: int = 0
    green: int = 0
    yellow: int = 0
    red: int = 0
    total: int = 0


class BlobFile(BaseModel):
    name: str
    size: int
    lastModified: str
    url: str
    contentType: Optional[str] = "application/pdf"


class RetrainingStatus(BaseModel):
    reviewedDocuments: int = 0
    totalDocuments: int = 0
    totalCorrections: int = 0
    readyForTraining: bool = False
    minimumRequired: int = 5


class CustomModelStatus(BaseModel):
    """Status of the custom extraction model."""
    customModelId: str
    isAvailable: bool
    primaryModelId: str
    comparisonModelId: str
    minimumReviewedDocs: int
    currentReviewedDocs: int
    readyToTrain: bool


class BulkStatusUpdate(BaseModel):
    documentIds: list[str]
    status: str
    updatedBy: str


class TrainRequest(BaseModel):
    modelId: Optional[str] = None
    buildMode: Optional[str] = "neural"

export interface Field {
  fieldName: string;
  extractedValue: string;
  confidence: number;
  confidenceCategory: string;
  correctedValue: string | null;
  correctedBy: string | null;
  correctedAt: string | null;
}

export interface ImageDescription {
  figureName: string;
  description: string;
  confidence: number;
  confidenceCategory: string;
  correctedDescription: string | null;
  correctedBy: string | null;
  correctedAt: string | null;
}

export interface Section {
  sectionName: string;
  sectionIndex: number;
  sectionConfidence: number;
  confidenceCategory: string;
  fields: Field[];
  imageDescriptions: ImageDescription[];
}

export interface ModelComparison {
  modelId: string;
  overallConfidence: number | null;
  confidenceCategory: string | null;
  totalWords: number | null;
  error: string | null;
}

export interface DocumentSummary {
  id: string;
  fileName: string;
  state: string;
  stateName: string;
  status: string;
  overallConfidence: number;
  confidenceCategory: string;
  totalSections: number;
  totalFields: number;
  parsedAt: string | null;
  modelSource: string | null;
  documentType?: string;
}

export interface DocumentDetail extends DocumentSummary {
  blobUrl: string;
  confidenceLabel: string | null;
  modelComparison: ModelComparison | null;
  sections: Section[];
  uploadedAt: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
}

export interface ConfidenceStats {
  blue: number;
  green: number;
  yellow: number;
  red: number;
  total: number;
}

export interface BlobFile {
  name: string;
  size: number;
  lastModified: string;
  url: string;
  contentType?: string;
}

export const CATEGORY_COLORS: Record<string, string> = {
  Blue: '#1565C0',
  Green: '#2E7D32',
  Yellow: '#F9A825',
  Red: '#C62828',
};

export const CATEGORY_LABELS: Record<string, string> = {
  Blue: 'Outstanding (>90%)',
  Green: 'High (>80%)',
  Yellow: 'Medium (>60%)',
  Red: 'Needs Review (<60%)',
};

export interface RetrainingStatus {
  reviewedDocuments: number;
  totalDocuments: number;
  totalCorrections: number;
  readyForTraining: boolean;
  minimumRequired: number;
}

export interface CustomModelStatus {
  customModelId: string;
  isAvailable: boolean;
  primaryModelId: string;
  comparisonModelId: string;
  minimumReviewedDocs: number;
  currentReviewedDocs: number;
  readyToTrain: boolean;
}

export interface CustomModelInfo {
  modelId: string;
  description: string;
  createdDateTime: string | null;
}

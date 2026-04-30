import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  BlobFile, DocumentSummary, DocumentDetail, ConfidenceStats,
  RetrainingStatus, CustomModelStatus, CustomModelInfo,
} from './models';
import { environment } from '../environments/environment';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private base = `${environment.apiBaseUrl}/api`;

  constructor(private http: HttpClient) {}

  getBlobs(): Observable<BlobFile[]> {
    return this.http.get<BlobFile[]>(`${this.base}/blobs`);
  }

  getBlobSasUrl(blobName: string): Observable<{ url: string }> {
    return this.http.get<{ url: string }>(`${this.base}/blobs/${encodeURIComponent(blobName)}/sas-url`);
  }

  getDocuments(params?: { category?: string; state?: string; status?: string; reviewed?: boolean; documentType?: string }): Observable<DocumentSummary[]> {
    let httpParams = new HttpParams();
    if (params?.category) httpParams = httpParams.set('category', params.category);
    if (params?.state) httpParams = httpParams.set('state', params.state);
    if (params?.status) httpParams = httpParams.set('status', params.status);
    if (params?.reviewed !== undefined) httpParams = httpParams.set('reviewed', String(params.reviewed));
    if (params?.documentType) httpParams = httpParams.set('document_type', params.documentType);
    return this.http.get<DocumentSummary[]>(`${this.base}/documents`, { params: httpParams });
  }

  getDocumentDetail(id: string): Observable<DocumentDetail> {
    return this.http.get<DocumentDetail>(`${this.base}/documents/${encodeURIComponent(id)}`);
  }

  getConfidenceStats(): Observable<ConfidenceStats> {
    return this.http.get<ConfidenceStats>(`${this.base}/documents/stats`);
  }

  updateField(documentId: string, sectionIndex: number, fieldName: string, correctedValue: string, correctedBy: string): Observable<void> {
    return this.http.put<void>(
      `${this.base}/documents/${encodeURIComponent(documentId)}/sections/${sectionIndex}/fields/${encodeURIComponent(fieldName)}`,
      { correctedValue, correctedBy }
    );
  }

  approveDocument(documentId: string, approvedBy: string): Observable<void> {
    return this.http.put<void>(
      `${this.base}/documents/${encodeURIComponent(documentId)}/approve?approved_by=${encodeURIComponent(approvedBy)}`,
      {}
    );
  }

  bulkUpdateStatus(documentIds: string[], status: string, updatedBy: string): Observable<{ updated: string[]; notFound: string[] }> {
    return this.http.put<{ updated: string[]; notFound: string[] }>(
      `${this.base}/documents/bulk-status`,
      { documentIds, status, updatedBy }
    );
  }

  getRetrainingStats(): Observable<RetrainingStatus> {
    return this.http.get<RetrainingStatus>(`${this.base}/retraining/stats`);
  }

  exportTrainingData(): Observable<unknown> {
    return this.http.post(`${this.base}/retraining/export`, {});
  }

  // Custom model endpoints
  getCustomModelStatus(): Observable<CustomModelStatus> {
    return this.http.get<CustomModelStatus>(`${this.base}/custom-model/status`);
  }

  listCustomModels(): Observable<{ models: CustomModelInfo[]; count: number }> {
    return this.http.get<{ models: CustomModelInfo[]; count: number }>(`${this.base}/custom-model/list`);
  }
}

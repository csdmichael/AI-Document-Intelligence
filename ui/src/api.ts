import type { DocumentSummary, DocumentDetail, ConfidenceStats, BlobFile } from "./types";

const BASE = "/api";

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json();
}

export async function getBlobs(): Promise<BlobFile[]> {
  return fetchJson(`${BASE}/blobs`);
}

export async function getDocuments(params?: {
  category?: string;
  state?: string;
  status?: string;
}): Promise<DocumentSummary[]> {
  const sp = new URLSearchParams();
  if (params?.category) sp.set("category", params.category);
  if (params?.state) sp.set("state", params.state);
  if (params?.status) sp.set("status", params.status);
  const qs = sp.toString();
  return fetchJson(`${BASE}/documents${qs ? "?" + qs : ""}`);
}

export async function getDocumentDetail(id: string): Promise<DocumentDetail> {
  return fetchJson(`${BASE}/documents/${encodeURIComponent(id)}`);
}

export async function getConfidenceStats(): Promise<ConfidenceStats> {
  return fetchJson(`${BASE}/documents/stats`);
}

export async function updateField(
  documentId: string,
  sectionIndex: number,
  fieldName: string,
  correctedValue: string,
  correctedBy: string
): Promise<void> {
  await fetchJson(
    `${BASE}/documents/${encodeURIComponent(documentId)}/sections/${sectionIndex}/fields/${encodeURIComponent(fieldName)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ correctedValue, correctedBy }),
    }
  );
}

export async function approveDocument(
  documentId: string,
  approvedBy: string
): Promise<void> {
  await fetchJson(
    `${BASE}/documents/${encodeURIComponent(documentId)}/approve?approved_by=${encodeURIComponent(approvedBy)}`,
    { method: "PUT" }
  );
}

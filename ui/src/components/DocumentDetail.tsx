import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import type { DocumentDetail as DocDetail } from "../types";
import { getDocumentDetail, approveDocument } from "../api";
import ConfidenceBadge from "./ConfidenceBadge";
import SectionDetail from "./SectionDetail";

export default function DocumentDetailView() {
  const { id } = useParams<{ id: string }>();
  const [doc, setDoc] = useState<DocDetail | null>(null);
  const [expandedSection, setExpandedSection] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadDoc = () => {
    if (!id) return;
    setLoading(true);
    getDocumentDetail(id)
      .then(setDoc)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(loadDoc, [id]);

  if (loading) return <div className="loading">Loading document...</div>;
  if (error) return <div className="error">Error: {error}</div>;
  if (!doc) return <div className="error">Document not found</div>;

  const handleApprove = async () => {
    try {
      await approveDocument(doc.id, "admin");
      loadDoc();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Approval failed");
    }
  };

  return (
    <>
      <Link className="back-link" to="/parsed">
        ← Back to Parsed Documents
      </Link>

      {/* Document Header */}
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
          <div>
            <h2>{doc.fileName}</h2>
            <p style={{ color: "#666", fontSize: "0.85rem" }}>
              {doc.stateName} ({doc.state}) &bull; Status:{" "}
              <strong>{doc.status}</strong>
            </p>
          </div>
          <div style={{ textAlign: "right" }}>
            <ConfidenceBadge
              category={doc.confidenceCategory}
              score={doc.overallConfidence}
            />
            <p
              style={{
                color: "#888",
                fontSize: "0.75rem",
                marginTop: "0.3rem",
              }}
            >
              {doc.confidenceLabel}
            </p>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr 1fr",
            gap: "1rem",
            marginTop: "1rem",
            fontSize: "0.85rem",
          }}
        >
          <div>
            <strong>Sections:</strong> {doc.totalSections}
          </div>
          <div>
            <strong>Fields:</strong> {doc.totalFields}
          </div>
          <div>
            <strong>Parsed:</strong>{" "}
            {doc.parsedAt ? new Date(doc.parsedAt).toLocaleString() : "-"}
          </div>
          <div>
            <strong>Reviewed:</strong>{" "}
            {doc.reviewedBy ? `${doc.reviewedBy} on ${new Date(doc.reviewedAt!).toLocaleDateString()}` : "Not yet"}
          </div>
        </div>

        {doc.status !== "approved" && (
          <button
            className="btn-success"
            style={{ marginTop: "1rem" }}
            onClick={handleApprove}
          >
            ✓ Approve Document
          </button>
        )}
      </div>

      {/* Sections */}
      <div className="card">
        <h2>Sections</h2>
        {doc.sections.map((section) => (
          <div
            key={section.sectionIndex}
            className={`section-card ${section.confidenceCategory}`}
            onClick={() =>
              setExpandedSection(
                expandedSection === section.sectionIndex
                  ? null
                  : section.sectionIndex
              )
            }
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <strong>{section.sectionName}</strong>
                <span
                  style={{
                    color: "#888",
                    fontSize: "0.8rem",
                    marginLeft: "0.5rem",
                  }}
                >
                  ({section.fields.length} fields)
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <ConfidenceBadge
                  category={section.confidenceCategory}
                  score={section.sectionConfidence}
                />
                <span style={{ fontSize: "0.8rem", color: "#888" }}>
                  {expandedSection === section.sectionIndex ? "▲" : "▼"}
                </span>
              </div>
            </div>

            {expandedSection === section.sectionIndex && (
              <div
                style={{ marginTop: "0.8rem" }}
                onClick={(e) => e.stopPropagation()}
              >
                <SectionDetail
                  documentId={doc.id}
                  section={section}
                  onFieldUpdated={loadDoc}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

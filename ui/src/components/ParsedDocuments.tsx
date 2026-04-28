import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { DocumentSummary, ConfidenceStats } from "../types";
import { CATEGORY_COLORS, CATEGORY_LABELS } from "../types";
import { getDocuments, getConfidenceStats } from "../api";
import ConfidenceBadge from "./ConfidenceBadge";

const CATEGORIES = ["All", "Blue", "Green", "Yellow", "Red"] as const;

export default function ParsedDocuments() {
  const [docs, setDocs] = useState<DocumentSummary[]>([]);
  const [stats, setStats] = useState<ConfidenceStats | null>(null);
  const [filter, setFilter] = useState<string>("All");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      getDocuments(filter !== "All" ? { category: filter } : undefined),
      getConfidenceStats(),
    ])
      .then(([d, s]) => {
        setDocs(d);
        setStats(s);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [filter]);

  if (loading) return <div className="loading">Loading parsed documents...</div>;
  if (error) return <div className="error">Error: {error}</div>;

  return (
    <>
      {/* Stats Bar */}
      {stats && (
        <div className="stats-bar">
          {(["blue", "green", "yellow", "red"] as const).map((key) => {
            const cat = key.charAt(0).toUpperCase() + key.slice(1);
            return (
              <div
                key={key}
                className="stat-card"
                style={{ background: CATEGORY_COLORS[cat] }}
              >
                <div className="count">{stats[key]}</div>
                <div className="label">{CATEGORY_LABELS[cat]}</div>
              </div>
            );
          })}
          <div className="stat-card" style={{ background: "#555" }}>
            <div className="count">{stats.total}</div>
            <div className="label">Total Parsed</div>
          </div>
        </div>
      )}

      {/* Category Filter Tabs */}
      <div className="filter-tabs">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            className={`filter-tab ${cat} ${filter === cat ? "active" : ""}`}
            onClick={() => {
              setLoading(true);
              setFilter(cat);
            }}
          >
            {cat === "All" ? "All Documents" : CATEGORY_LABELS[cat] || cat}
          </button>
        ))}
      </div>

      {/* Documents Table */}
      <div className="card">
        <h2>📄 Parsed Documents ({docs.length})</h2>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>File Name</th>
              <th>State</th>
              <th>Status</th>
              <th>Confidence</th>
              <th>Sections</th>
              <th>Fields</th>
              <th>Parsed At</th>
            </tr>
          </thead>
          <tbody>
            {docs.map((doc, i) => (
              <tr key={doc.id}>
                <td>{i + 1}</td>
                <td>
                  <Link className="doc-link" to={`/documents/${doc.id}`}>
                    {doc.fileName}
                  </Link>
                </td>
                <td>
                  {doc.stateName} ({doc.state})
                </td>
                <td>{doc.status}</td>
                <td>
                  <ConfidenceBadge
                    category={doc.confidenceCategory}
                    score={doc.overallConfidence}
                  />
                </td>
                <td>{doc.totalSections}</td>
                <td>{doc.totalFields}</td>
                <td>
                  {doc.parsedAt
                    ? new Date(doc.parsedAt).toLocaleString()
                    : "-"}
                </td>
              </tr>
            ))}
            {docs.length === 0 && (
              <tr>
                <td colSpan={8} style={{ textAlign: "center", color: "#999" }}>
                  No documents found for this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

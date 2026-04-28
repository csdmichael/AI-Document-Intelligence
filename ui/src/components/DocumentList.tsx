import { useEffect, useState } from "react";
import type { BlobFile } from "../types";
import { getBlobs } from "../api";

export default function DocumentList() {
  const [blobs, setBlobs] = useState<BlobFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    getBlobs()
      .then(setBlobs)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading">Loading blob files...</div>;
  if (error) return <div className="error">Error: {error}</div>;

  return (
    <div className="card">
      <h2>📁 Blob Storage Files ({blobs.length})</h2>
      <p style={{ marginBottom: "1rem", color: "#666", fontSize: "0.85rem" }}>
        Tax exemption PDF forms in the <code>tax-forms</code> container before
        parsing.
      </p>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>File Name</th>
            <th>Size</th>
            <th>Last Modified</th>
          </tr>
        </thead>
        <tbody>
          {blobs.map((b, i) => (
            <tr key={b.name}>
              <td>{i + 1}</td>
              <td>{b.name}</td>
              <td>{(b.size / 1024).toFixed(1)} KB</td>
              <td>{b.lastModified ? new Date(b.lastModified).toLocaleString() : "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

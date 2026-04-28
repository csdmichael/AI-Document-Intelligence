import type { Section } from "../types";
import ConfidenceBadge from "./ConfidenceBadge";
import FieldEditor from "./FieldEditor";

interface Props {
  documentId: string;
  section: Section;
  onFieldUpdated: () => void;
}

export default function SectionDetail({ documentId, section, onFieldUpdated }: Props) {
  return (
    <table>
      <thead>
        <tr>
          <th>Field</th>
          <th>Extracted Value</th>
          <th>Confidence</th>
          <th>Corrected Value</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>
        {section.fields.map((field) => (
          <tr key={field.fieldName}>
            <td style={{ fontWeight: 500 }}>{field.fieldName}</td>
            <td>{field.extractedValue || <em style={{ color: "#999" }}>empty</em>}</td>
            <td>
              <ConfidenceBadge
                category={field.confidenceCategory}
                score={field.confidence}
              />
            </td>
            <td>
              {field.correctedValue ? (
                <span style={{ color: "#2e7d32", fontWeight: 500 }}>
                  {field.correctedValue}
                  <br />
                  <small style={{ color: "#888" }}>
                    by {field.correctedBy} on{" "}
                    {field.correctedAt
                      ? new Date(field.correctedAt).toLocaleDateString()
                      : ""}
                  </small>
                </span>
              ) : (
                <span style={{ color: "#999" }}>—</span>
              )}
            </td>
            <td>
              <FieldEditor
                documentId={documentId}
                sectionIndex={section.sectionIndex}
                fieldName={field.fieldName}
                currentValue={field.correctedValue || field.extractedValue}
                onSaved={onFieldUpdated}
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

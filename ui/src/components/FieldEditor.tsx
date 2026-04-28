import { useState } from "react";
import { updateField } from "../api";

interface Props {
  documentId: string;
  sectionIndex: number;
  fieldName: string;
  currentValue: string;
  onSaved: () => void;
}

export default function FieldEditor({
  documentId,
  sectionIndex,
  fieldName,
  currentValue,
  onSaved,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(currentValue);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateField(documentId, sectionIndex, fieldName, value, "admin");
      setEditing(false);
      onSaved();
    } catch {
      alert("Failed to save correction");
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <button className="btn-primary btn-sm" onClick={() => setEditing(true)}>
        Edit
      </button>
    );
  }

  return (
    <div style={{ display: "flex", gap: "0.3rem", alignItems: "center" }}>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        style={{ minWidth: "120px" }}
      />
      <button
        className="btn-success btn-sm"
        onClick={handleSave}
        disabled={saving}
      >
        {saving ? "..." : "Save"}
      </button>
      <button
        className="btn-sm"
        style={{ background: "#eee" }}
        onClick={() => {
          setEditing(false);
          setValue(currentValue);
        }}
      >
        Cancel
      </button>
    </div>
  );
}

import { useState, useRef } from "react";
import { Upload, FileSpreadsheet, X } from "lucide-react";

interface Props {
  onUpload: (file: File) => void;
  loading: boolean;
}

export default function CsvUpload({ onUpload, loading }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (f: File) => {
    const ext = f.name.split(".").pop()?.toLowerCase();
    if (ext !== "csv" && ext !== "tsv") {
      alert("Only CSV/TSV files are supported");
      return;
    }
    setFile(f);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  };

  const handleSubmit = () => {
    if (file && !loading) onUpload(file);
  };

  return (
    <div className="pixel-card">
      <div className="pixel-card-header">═══ UPLOAD CSV / TSV ═══</div>
      <div style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: "1rem" }}>

        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          style={{
            border: `3px dashed ${dragOver ? "var(--color-primary)" : "var(--color-muted-foreground)"}`,
            background: dragOver ? "rgba(48,64,208,0.07)" : "var(--color-card)",
            padding: "2rem",
            textAlign: "center",
            cursor: "pointer",
            transition: "border-color 0.15s",
          }}
        >
          <Upload style={{ width: "2rem", height: "2rem", margin: "0 auto 0.75rem", color: "var(--color-muted-foreground)", display: "block" }} />
          <p style={{ fontSize: "0.75rem", color: "var(--color-muted-foreground)" }}>
            Drag &amp; drop or click to select
          </p>
          <p style={{ fontSize: "0.6rem", color: "var(--color-muted-foreground)", marginTop: "0.25rem" }}>
            Required columns: <strong>Sequence, Charge, collision_energy, Fragmentation</strong>
          </p>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.tsv"
            style={{ display: "none" }}
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
        </div>

        {/* Selected file */}
        {file && (
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.75rem", background: "var(--color-card)", border: "3px solid var(--color-border)", boxShadow: "inset 3px 3px 0 0 var(--color-border-dark), inset -3px -3px 0 0 var(--color-border-light)" }}>
            <FileSpreadsheet style={{ width: "1.25rem", height: "1.25rem", color: "var(--color-success)", flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: "0.75rem", fontWeight: "bold", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</p>
              <p style={{ fontSize: "0.6rem", color: "var(--color-muted-foreground)" }}>
                {(file.size / 1024).toFixed(1)} KB
              </p>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); setFile(null); }}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-muted-foreground)", padding: "0.25rem" }}
            >
              <X style={{ width: "1rem", height: "1rem" }} />
            </button>
          </div>
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={!file || loading}
          className="pixel-btn pixel-btn-primary"
          style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", fontSize: "0.75rem", padding: "0.3rem 0.75rem", boxShadow: "2px 2px 0 0 var(--color-border-dark)" }}
        >
          <Upload style={{ width: "0.75rem", height: "0.75rem" }} />
          {loading ? "SUBMITTING..." : "SUBMIT BATCH JOB"}
        </button>
      </div>
    </div>
  );
}

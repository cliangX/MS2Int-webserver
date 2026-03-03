import { useState, useRef } from "react";
import { Upload, FileSpreadsheet, X, Download } from "lucide-react";

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
      <div className="pixel-card-header">
        <span>═══ UPLOAD CSV / TSV ═══</span>
        <a href="/api/demo/batch" download className="demo-download-btn">
          <Download size={14} /> DEMO
        </a>
      </div>
      <div style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: "1rem" }}>

        {/* Drop zone */}
        <div
          className={`pixel-dropzone${dragOver ? " pixel-dropzone-active" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="mx-auto mb-2"
            style={{ width: 24, height: 24, color: "var(--color-muted-foreground)" }} />
          <p style={{ fontFamily: "var(--font-pixel-body)", fontSize: "1.3rem", color: "#000" }}>
            Drag &amp; drop or click to select
          </p>
          <p style={{ fontSize: "1rem", color: "var(--color-muted-foreground)", marginTop: "0.25rem" }}>
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
              <p style={{ fontSize: "0.8rem", fontWeight: "bold", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</p>
              <p style={{ fontSize: "0.75rem", color: "var(--color-muted-foreground)" }}>
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
          style={{ display: "inline-flex", alignSelf: "flex-end", alignItems: "center", gap: "0.5rem" }}
        >
          <Upload style={{ width: "1rem", height: "1rem" }} />
          {loading ? "SUBMITTING..." : "SUBMIT BATCH JOB"}
        </button>
      </div>
    </div>
  );
}

import { useState, useRef, useCallback, useEffect } from "react";
import { Upload, Dna, X } from "lucide-react";
import { submitFastaJob } from "../api";
import JobStatus from "./JobStatus";
import JobHistory, { type JobRecord } from "./JobHistory";
import { useAppToast } from "../ToastContext";

const CHARGES = [1, 2, 3, 4];
const COLLISION_ENERGIES = [20, 23, 25, 26, 27, 28, 29, 30, 32, 35, 40];
const FRAGMENTATIONS = ["HCD", "CID"];
const MISSED_CLEAVAGES = [0, 1, 2, 3];

const STORAGE_KEY = "ms2int_fasta_job_history";

function loadHistory(): JobRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHistory(jobs: JobRecord[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
}

export default function FastaMode() {
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [history, setHistory] = useState<JobRecord[]>(loadHistory);
  const { toast } = useAppToast();
  const inputRef = useRef<HTMLInputElement>(null);

  // Parameters
  const [charges, setCharges] = useState<number[]>([2]);
  const [ce, setCe] = useState(30);
  const [frag, setFrag] = useState("HCD");
  const [missedCleavages, setMissedCleavages] = useState(1);
  const [minLen, setMinLen] = useState(7);
  const [maxLen, setMaxLen] = useState(30);

  useEffect(() => { saveHistory(history); }, [history]);

  const handleFile = (f: File) => {
    const ext = f.name.split(".").pop()?.toLowerCase();
    if (!["fasta", "fa", "faa", "txt"].includes(ext ?? "")) {
      toast("error", "Only FASTA files (.fasta/.fa/.faa/.txt) are supported");
      return;
    }
    setFile(f);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  };

  const toggleCharge = (c: number) => {
    setCharges((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]
    );
  };

  const handleSubmit = async () => {
    if (!file || loading || charges.length === 0) return;
    setLoading(true);
    try {
      const res = await submitFastaJob(file, {
        charges: charges.sort().join(","),
        collision_energy: ce,
        fragmentation: frag,
        missed_cleavages: missedCleavages,
        min_length: minLen,
        max_length: maxLen,
      });
      const record: JobRecord = {
        job_id: res.job_id,
        filename: res.filename,
        total_samples: res.total_samples,
        created_at: res.created_at,
      };
      setHistory((prev) => [record, ...prev]);
      setActiveJobId(res.job_id);
      toast("success", `Job submitted: ${res.total_samples} peptides (~${res.estimated_seconds.toFixed(0)}s)`);
    } catch (e: unknown) {
      toast("error", e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = (jobId: string) => {
    setHistory((prev) => prev.filter((j) => j.job_id !== jobId));
    if (activeJobId === jobId) setActiveJobId(null);
  };

  const handleCompleted = useCallback(() => {
    toast("success", "FASTA batch job completed! Ready to download.");
  }, [toast]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>

      {/* Description card */}
      <div className="pixel-card">
        <div className="pixel-card-header">═══ FASTA PREDICTION ═══</div>
        <div className="p-4">
          <p style={{ fontFamily: "var(--font-pixel-body)", fontSize: "1rem" }}>
            Spectrum Library Generation
          </p>
          <p style={{ fontSize: "1rem", color: "var(--color-muted-foreground)" }}>
            Upload a FASTA protein file → trypsin in-silico digestion → batch spectrum prediction with configurable charge states, collision energy, and peptide length filters → Download spectral library
          </p>
          <p style={{ fontSize: "1rem", color: "var(--color-muted-foreground)" }}>
            Accepts: .fasta / .fa / .faa files — proteins will be trypsin-digested
          </p>
        </div>
      </div>

      {/* Upload card */}
      <div className="pixel-card">
        <div className="pixel-card-header">═══ UPLOAD FASTA ═══</div>
        <div style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: "1rem" }}>

          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            style={{
              border: `3px dashed ${dragOver ? "var(--color-primary)" : "var(--color-muted-foreground)"}`,
              background: dragOver ? "color-mix(in srgb, var(--color-primary) 7%, var(--color-card))" : "var(--color-card)",
              padding: "2rem",
              textAlign: "center",
              cursor: "pointer",
              transition: "border-color 0.15s",
            }}
          >
            <Dna style={{ width: "2rem", height: "2rem", margin: "0 auto 0.75rem", color: "var(--color-muted-foreground)", display: "block" }} />
            <p style={{ fontSize: "1rem", color: "var(--color-muted-foreground)" }}>
              Drag &amp; drop or click to select a FASTA file
            </p>
            <p style={{ fontSize: "1rem", color: "var(--color-muted-foreground)", marginTop: "0.25rem" }}>
              Supports .fasta / .fa / .faa — proteins will be trypsin-digested
            </p>
            <input
              ref={inputRef}
              type="file"
              accept=".fasta,.fa,.faa,.txt"
              style={{ display: "none" }}
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
          </div>

          {/* Selected file */}
          {file && (
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.75rem", background: "var(--color-card)", border: "3px solid var(--color-border)", boxShadow: "inset 3px 3px 0 0 var(--color-border-dark), inset -3px -3px 0 0 var(--color-border-light)" }}>
              <Dna style={{ width: "1.25rem", height: "1.25rem", color: "var(--color-success)", flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: "0.8rem", fontWeight: "bold", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</p>
                <p style={{ fontSize: "0.75rem", color: "var(--color-muted-foreground)" }}>{(file.size / 1024).toFixed(1)} KB</p>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); setFile(null); }}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-muted-foreground)", padding: "0.25rem" }}
              >
                <X style={{ width: "1rem", height: "1rem" }} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Parameters card */}
      <div className="pixel-card">
        <div className="pixel-card-header">═══ DIGESTION PARAMETERS ═══</div>
        <div style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: "1rem" }}>

          {/* Row 1: Charge checkboxes */}
          <div>
            <label style={{ display: "block", fontFamily: "var(--font-pixel-title)", fontSize: "0.6rem", marginBottom: "0.5rem", letterSpacing: "0.05em" }}>
              CHARGE STATE(S)
            </label>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              {CHARGES.map((c) => (
                <button
                  key={c}
                  onClick={() => toggleCharge(c)}
                  style={{
                    fontFamily: "var(--font-pixel-body)",
                    fontSize: "0.85rem",
                    padding: "0.4rem 0.75rem",
                    border: "3px solid var(--color-border)",
                    background: charges.includes(c) ? "var(--color-primary)" : "var(--color-card)",
                    color: charges.includes(c) ? "var(--color-primary-foreground)" : "var(--color-foreground)",
                    cursor: "pointer",
                    boxShadow: charges.includes(c) ? "2px 2px 0 0 var(--color-border-dark)" : "4px 4px 0 0 var(--color-border-dark)",
                  }}
                >
                  {c}+
                </button>
              ))}
            </div>
          </div>

          {/* Row 2: CE + Frag + Missed cleavages */}
          <div style={{ display: "flex", gap: "5rem", flexWrap: "wrap" }}>
            <div>
              <label style={{ display: "block", fontFamily: "var(--font-pixel-title)", fontSize: "0.6rem", marginBottom: "0.5rem", letterSpacing: "0.05em" }}>CE (eV)</label>
              <select value={ce} onChange={(e) => setCe(Number(e.target.value))} className="pixel-select" style={{ width: "6rem" }}>
                {COLLISION_ENERGIES.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: "block", fontFamily: "var(--font-pixel-title)", fontSize: "0.6rem", marginBottom: "0.5rem", letterSpacing: "0.05em" }}>FRAG</label>
              <select value={frag} onChange={(e) => setFrag(e.target.value)} className="pixel-select" style={{ width: "6rem" }}>
                {FRAGMENTATIONS.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: "block", fontFamily: "var(--font-pixel-title)", fontSize: "0.6rem", marginBottom: "0.5rem", letterSpacing: "0.05em" }}>MISSED CLEAVAGES</label>
              <select value={missedCleavages} onChange={(e) => setMissedCleavages(Number(e.target.value))} className="pixel-select" style={{ width: "4rem" }}>
                {MISSED_CLEAVAGES.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: "block", fontFamily: "var(--font-pixel-title)", fontSize: "0.6rem", marginBottom: "0.5rem", letterSpacing: "0.05em" }}>PEPTIDE LENGTH</label>
              <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <input
                  type="number"
                  value={minLen}
                  min={2}
                  max={maxLen - 1}
                  onChange={(e) => setMinLen(Number(e.target.value))}
                  className="pixel-input"
                  style={{ width: "4.5rem", textAlign: "center" }}
                />
                <span style={{ fontFamily: "var(--font-pixel-body)", fontSize: "0.85rem" }}>–</span>
                <input
                  type="number"
                  value={maxLen}
                  min={minLen + 1}
                  max={30}
                  onChange={(e) => setMaxLen(Number(e.target.value))}
                  className="pixel-input"
                  style={{ width: "4.5rem", textAlign: "center" }}
                />
              </div>
            </div>
          </div>

          {/* Submit */}
          <div>
            <button
              onClick={handleSubmit}
              disabled={!file || loading || charges.length === 0}
              className="pixel-btn pixel-btn-primary"
              style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}
            >
              <Upload style={{ width: "1rem", height: "1rem" }} />
              {loading ? "SUBMITTING..." : "SUBMIT FASTA JOB"}
            </button>
            {charges.length === 0 && (
              <span style={{ marginLeft: "1rem", fontSize: "0.7rem", color: "var(--color-destructive)", fontFamily: "var(--font-pixel-body)" }}>
                Select at least one charge state
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Active job status */}
      {activeJobId && (
        <JobStatus jobId={activeJobId} onCompleted={handleCompleted} />
      )}

      {/* History */}
      <JobHistory
        jobs={history}
        activeJobId={activeJobId}
        onSelect={setActiveJobId}
        onRemove={handleRemove}
      />
    </div>
  );
}

import { useState } from "react";
import { Send, Loader2 } from "lucide-react";

const COLLISION_ENERGIES = [10, 20, 23, 25, 26, 27, 28, 29, 30, 35, 40, 42];
const FRAGMENTATIONS = ["HCD", "CID"];
const CHARGES = [1, 2, 3, 4, 5, 6, 7];

export interface PeptideFormData {
  sequence: string;
  charge: number;
  collision_energy: number;
  fragmentation: string;
}

interface Props {
  onSubmit: (data: PeptideFormData) => void;
  loading: boolean;
}

export default function PeptideForm({ onSubmit, loading }: Props) {
  const [sequence, setSequence] = useState("PEPTIDEK");
  const [charge, setCharge] = useState(2);
  const [ce, setCe] = useState(30);
  const [frag, setFrag] = useState("HCD");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!sequence.trim() || loading) return;
    onSubmit({
      sequence: sequence.trim(),
      charge,
      collision_energy: ce,
      fragmentation: frag,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="pixel-card">
      <div className="pixel-card-header">═══ INPUT ═══</div>
      <div style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {/* Flex layout: each label+input grouped as a column */}
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-end" }}>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.3rem" }}>
            <label style={{ fontFamily: "var(--font-pixel-title)", fontSize: "0.6rem", letterSpacing: "0.05em" }}>
              PEPTIDE SEQUENCE
            </label>
            <input
              type="text"
              value={sequence}
              onChange={(e) => setSequence(e.target.value)}
              placeholder="e.g. PEPTIDEK or [Acetyl]-ALLS[Phospho]LATHK"
              className="pixel-input"
              style={{ width: "100%" }}
              disabled={loading}
            />
          </div>
          <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", gap: "0.3rem" }}>
            <label style={{ fontFamily: "var(--font-pixel-title)", fontSize: "0.6rem", letterSpacing: "0.05em" }}>
              CHARGE
            </label>
            <select
              value={charge}
              onChange={(e) => setCharge(Number(e.target.value))}
              className="pixel-select"
              style={{ width: "5.5rem" }}
              disabled={loading}
            >
              {CHARGES.map((c) => (
                <option key={c} value={c}>{c}+</option>
              ))}
            </select>
          </div>
          <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", gap: "0.3rem" }}>
            <label style={{ fontFamily: "var(--font-pixel-title)", fontSize: "0.6rem", letterSpacing: "0.05em" }}>
              CE (eV)
            </label>
            <select
              value={ce}
              onChange={(e) => setCe(Number(e.target.value))}
              className="pixel-select"
              style={{ width: "5.5rem" }}
              disabled={loading}
            >
              {COLLISION_ENERGIES.map((e) => (
                <option key={e} value={e}>{e}</option>
              ))}
            </select>
          </div>
          <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", gap: "0.3rem" }}>
            <label style={{ fontFamily: "var(--font-pixel-title)", fontSize: "0.6rem", letterSpacing: "0.05em" }}>
              FRAGMENT
            </label>
            <select
              value={frag}
              onChange={(e) => setFrag(e.target.value)}
              className="pixel-select"
              style={{ width: "6.5rem" }}
              disabled={loading}
            >
              {FRAGMENTATIONS.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Modifications hint */}
        <p className="text-muted-foreground text-[1rem]">
          ★ Supports modifications: M[Oxidation], S[Phospho], C[Carbamidomethyl], [Acetyl]- ...
        </p>

        {/* Row 3: Submit button */}
        <div>
          <button
            type="submit"
            disabled={loading || !sequence.trim()}
            className="pixel-btn pixel-btn-primary"
            style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            {loading ? "PREDICTING..." : "PREDICT"}
          </button>
        </div>
      </div>
    </form>
  );
}

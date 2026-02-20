import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { IonItem } from "../api";

interface Props {
  ions: IonItem[];
}

const ION_COLOR: Record<string, string> = {
  b: "var(--color-ion-b)",
  y: "var(--color-ion-y)",
  internal: "var(--color-ion-internal)",
  immonium: "var(--color-warning)",
};

function ionColor(type: string): string {
  return ION_COLOR[type] ?? "var(--color-muted-foreground)";
}

const TH: React.CSSProperties = {
  fontFamily: "var(--font-pixel-title)",
  fontSize: "0.55rem",
  letterSpacing: "0.05em",
  padding: "0.5rem 0.5rem",
  borderBottom: "3px solid var(--color-border-dark)",
  background: "var(--color-muted)",
  whiteSpace: "nowrap",
};

export default function IonTable({ ions }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [filter, setFilter] = useState<string>("all");

  const sorted = [...ions].sort((a, b) => b.intensity - a.intensity);
  const filtered = filter === "all" ? sorted : sorted.filter((i) => i.type === filter);
  const displayed = expanded ? filtered : filtered.slice(0, 20);
  const types = ["all", ...Array.from(new Set(ions.map((i) => i.type)))];
  const maxInt = sorted[0]?.intensity || 1;

  return (
    <div className="pixel-card">
      <div className="pixel-card-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.4rem" }}>
        <span>═══ ION TABLE ({filtered.length}) ═══</span>
        <div style={{ display: "flex", gap: "0.35rem" }}>
          {types.map((t) => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              style={{
                fontFamily: "var(--font-pixel-body)",
                fontSize: "0.7rem",
                padding: "0.1rem 0.45rem",
                border: "2px solid var(--color-border-dark)",
                background: filter === t ? "var(--color-foreground)" : "var(--color-card)",
                color: filter === t ? "var(--color-primary-foreground)" : "var(--color-foreground)",
                cursor: "pointer",
                lineHeight: 1.4,
              }}
            >
              {t.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: "0.75rem", overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--font-pixel-body)", fontSize: "0.8rem" }}>
          <thead>
            <tr>
              <th style={{ ...TH, textAlign: "left" }}>ION</th>
              <th style={{ ...TH, textAlign: "left" }}>TYPE</th>
              <th style={{ ...TH, textAlign: "right" }}>M/Z</th>
              <th style={{ ...TH, textAlign: "right" }}>INTENSITY</th>
              <th style={{ ...TH, textAlign: "left", width: "8rem" }}>BAR</th>
            </tr>
          </thead>
          <tbody>
            {displayed.map((ion, idx) => {
              const pct = (ion.intensity / maxInt) * 100;
              const color = ionColor(ion.type);
              const rowBg = idx % 2 === 0 ? "var(--color-card)" : "var(--color-muted)";
              return (
                <tr key={idx} style={{ background: rowBg, borderBottom: "1px solid var(--color-border-light)" }}>
                  <td style={{ padding: "0.35rem 0.5rem", fontWeight: "bold", color, whiteSpace: "nowrap" }}>
                    {ion.label}
                  </td>
                  <td style={{ padding: "0.35rem 0.5rem", whiteSpace: "nowrap" }}>
                    <span style={{ color, marginRight: "0.3rem", fontSize: "0.9rem" }}>■</span>
                    <span style={{ color: "var(--color-muted-foreground)" }}>{ion.type}</span>
                  </td>
                  <td style={{ padding: "0.35rem 0.5rem", textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                    {ion.mz > 0 ? ion.mz.toFixed(4) : "—"}
                  </td>
                  <td style={{ padding: "0.35rem 0.5rem", textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                    {ion.intensity.toFixed(4)}
                  </td>
                  <td style={{ padding: "0.35rem 0.5rem" }}>
                    <div style={{ height: "0.6rem", background: "var(--color-muted)", border: "1px solid var(--color-border)" }}>
                      <div style={{ height: "100%", width: `${Math.min(pct, 100)}%`, background: color }} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {filtered.length > 20 && (
          <button
            onClick={() => setExpanded(!expanded)}
            style={{
              marginTop: "0.75rem",
              display: "inline-flex",
              alignItems: "center",
              gap: "0.4rem",
              fontFamily: "var(--font-pixel-body)",
              fontSize: "0.7rem",
              padding: "0.35rem 0.75rem",
              border: "3px solid var(--color-border)",
              background: "var(--color-card)",
              boxShadow: "3px 3px 0 0 var(--color-border-dark)",
              cursor: "pointer",
            }}
          >
            {expanded
              ? <><ChevronUp style={{ width: "0.75rem", height: "0.75rem" }} /> COLLAPSE</>
              : <><ChevronDown style={{ width: "0.75rem", height: "0.75rem" }} /> SHOW ALL {filtered.length} IONS</>
            }
          </button>
        )}
      </div>
    </div>
  );
}

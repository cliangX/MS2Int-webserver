import { useState } from "react";
import { Zap, Layers, Dna } from "lucide-react";
import Header from "./components/Header";
import SingleMode from "./components/SingleMode";
import BatchMode from "./components/BatchMode";
import FastaMode from "./components/FastaMode";

type Tab = "single" | "batch" | "fasta";

function App() {
  const [tab, setTab] = useState<Tab>("single");

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main style={{ maxWidth: "64rem", margin: "0 auto", padding: "0 1.5rem 3rem" }}>
        {/* Tab bar */}
        <div style={{ display: "flex", gap: "0.5rem", borderBottom: "3px solid var(--color-border)", position: "relative" }}>
          <button
            onClick={() => setTab("single")}
            className={`pixel-tab flex items-center justify-center gap-2 ${tab === "single" ? "pixel-tab-active" : ""
              }`}
          >
            <Zap className="w-3 h-3" style={{ position: "relative", top: "-1px" }} />
            SINGLE
          </button>
          <button
            onClick={() => setTab("batch")}
            className={`pixel-tab flex items-center justify-center gap-2 ${tab === "batch" ? "pixel-tab-active" : ""
              }`}
          >
            <Layers className="w-3 h-3" />
            BATCH
          </button>
          <button
            onClick={() => setTab("fasta")}
            className={`pixel-tab flex items-center justify-center gap-2 ${tab === "fasta" ? "pixel-tab-active" : ""
              }`}
          >
            <Dna className="w-3 h-3" />
            FASTA
          </button>
        </div>

        {/* Tab content — both rendered, hidden via CSS to preserve state */}
        <div style={{ border: "3px solid var(--color-border)", background: "var(--color-card)", padding: "1.5rem", marginTop: "-3px" }}>
          <div style={{ display: tab === "single" ? "block" : "none" }}>
            <SingleMode />
          </div>
          <div style={{ display: tab === "batch" ? "block" : "none" }}>
            <BatchMode />
          </div>
          <div style={{ display: tab === "fasta" ? "block" : "none" }}>
            <FastaMode />
          </div>
        </div>
      </main>

      <footer style={{
        textAlign: "center",
        padding: "1.25rem",
        color: "var(--color-muted-foreground)",
        fontFamily: "var(--font-pixel-body)",
        fontSize: "0.85rem",
        borderTop: "3px solid var(--color-border)",
        background: "var(--color-muted)",
        letterSpacing: "0.05em",
      }}>
        MS2Int &copy; 2026 &nbsp;│&nbsp; Powered by Yulab &nbsp;│&nbsp; ★★★
      </footer>
    </div>
  );
}

export default App;

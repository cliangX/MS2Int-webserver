import { useState } from "react";
import { Zap, Layers, Dna, Scale, MapPin, Database, Search, Filter } from "lucide-react";
import Header from "./components/Header";
import AboutSection from "./components/AboutSection";
import SingleMode from "./components/SingleMode";
import BatchMode from "./components/BatchMode";
import FastaMode from "./components/FastaMode";
import RescoreMode from "./components/RescoreMode";
import PtmMode from "./components/PtmMode";

type Tab = "single" | "batch" | "fasta" | "rescore" | "ptm";

function App() {
  const [tab, setTab] = useState<Tab>("single");

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main style={{ maxWidth: "64rem", margin: "0 auto", padding: "0 1.5rem 3rem" }}>
        <AboutSection />

        {/* Tab bar */}
        <div id="start" style={{ display: "flex", gap: "0.5rem", borderBottom: "3px solid var(--color-border)", position: "relative" }}>
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
          <button
            onClick={() => setTab("rescore")}
            className={`pixel-tab flex items-center justify-center gap-2 ${tab === "rescore" ? "pixel-tab-active" : ""
              }`}
          >
            <Scale className="w-3 h-3" />
            RESCORE
          </button>
          <button
            onClick={() => setTab("ptm")}
            className={`pixel-tab flex items-center justify-center gap-2 ${tab === "ptm" ? "pixel-tab-active" : ""
              }`}
          >
            <MapPin className="w-3 h-3" style={{ position: "relative", top: "-1px" }} />
            PTM LOC
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
          <div style={{ display: tab === "rescore" ? "block" : "none" }}>
            <RescoreMode />
          </div>
          <div style={{ display: tab === "ptm" ? "block" : "none" }}>
            <PtmMode />
          </div>
        </div>
      </main>

      <section className="resources-section">
        <div className="pixel-card">
          <div className="pixel-card-header">═══ EXTERNAL RESOURCES ═══</div>
          <div style={{ padding: "1.5rem" }}>
            <div className="resources-grid">
              <a href="https://www.uniprot.org" target="_blank" rel="noopener noreferrer" className="resource-card" style={{ textDecoration: "none", color: "inherit" }}>
                <div className="resource-icon"><Database className="w-6 h-6" style={{ margin: "0 auto" }} /></div>
                <div className="resource-name">UNIPROT</div>
                <div className="resource-desc">Universal Protein Resource — comprehensive protein sequence &amp; annotation database</div>
                <span className="resource-link">uniprot.org →</span>
              </a>
              <a href="https://www.maxquant.org" target="_blank" rel="noopener noreferrer" className="resource-card" style={{ textDecoration: "none", color: "inherit" }}>
                <div className="resource-icon"><Search className="w-6 h-6" style={{ margin: "0 auto" }} /></div>
                <div className="resource-name">MAXQUANT</div>
                <div className="resource-desc">Quantitative proteomics software for analyzing large mass-spectrometric datasets</div>
                <span className="resource-link">maxquant.org →</span>
              </a>
              <a href="http://percolator.ms" target="_blank" rel="noopener noreferrer" className="resource-card" style={{ textDecoration: "none", color: "inherit" }}>
                <div className="resource-icon"><Filter className="w-6 h-6" style={{ margin: "0 auto" }} /></div>
                <div className="resource-name">PERCOLATOR</div>
                <div className="resource-desc">Semi-supervised learning for peptide identification in shotgun proteomics</div>
                <span className="resource-link">percolator.ms →</span>
              </a>
            </div>
          </div>
        </div>
      </section>

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

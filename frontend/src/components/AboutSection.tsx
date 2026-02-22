import { useState } from "react";
import { ChevronDown, ChevronUp, Plug, Github } from "lucide-react";

export default function AboutSection() {
  const [expanded, setExpanded] = useState(true);

  return (
    <section id="about" style={{ marginBottom: "1.5rem" }}>
      <div className="pixel-card">
        <div
          className="pixel-card-header about-header"
          onClick={() => setExpanded(!expanded)}
        >
          <span>═══ ABOUT MS2Int ═══</span>
          <button
            className="about-toggle-btn"
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
          >
            {expanded ? (
              <><ChevronUp className="w-3 h-3" style={{ display: "inline", verticalAlign: "middle" }} /> COLLAPSE</>
            ) : (
              <><ChevronDown className="w-3 h-3" style={{ display: "inline", verticalAlign: "middle" }} /> EXPAND</>
            )}
          </button>
        </div>

        <div className={`about-body ${expanded ? "about-body-expanded" : "about-body-collapsed"}`}>
          <div style={{ padding: "1.5rem" }}>

            <p className="about-intro">
              MS2Int is a deep learning framework for tandem mass spectrum prediction
              that jointly models both terminal (b/y) and internal fragment ions (m-ions).
              Built on a Mamba state-space model with virtual adversarial training,
              it delivers more complete spectral characterization for high-confidence proteomics.
            </p>

            <div className="about-features-grid">
              <div className="about-feature-card">
                <div className="about-feature-title">DDA RESCORE</div>
                <div className="about-feature-stat">+28.2% PSMs</div>
                <div className="about-feature-desc">
                  Surpasses MaxQuant with m-ion discriminative features in semi-supervised rescoring
                </div>
              </div>

              <div className="about-feature-card">
                <div className="about-feature-title">DIA SEARCH</div>
                <div className="about-feature-stat">Complementary IDs</div>
                <div className="about-feature-desc">
                  Label-free spectral library search without compromising quantitative reproducibility
                </div>
              </div>

              <div className="about-feature-card">
                <div className="about-feature-title">IMMUNOPEPTIDOMICS</div>
                <div className="about-feature-stat">Neoantigen Discovery</div>
                <div className="about-feature-desc">
                  Enhanced recovery of non-tryptic HLA peptides and novel neoantigen candidates
                </div>
              </div>

              <div className="about-feature-card">
                <div className="about-feature-title">PTM LOCATION</div>
                <div className="about-feature-stat">FLR-controlled</div>
                <div className="about-feature-desc">
                  M-ions boost site localization coverage with cross-replicate reproducibility
                </div>
              </div>
            </div>

            <div className="about-tech">
              <div className="about-tech-title">KEY INNOVATIONS</div>
              <div className="about-tech-items">
                <span className="about-tech-badge">Internal Fragment Ions (m-ions)</span>
                <span className="about-tech-badge">Mamba State-Space Model</span>
                <span className="about-tech-badge">Virtual Adversarial Training</span>
                <span className="about-tech-badge">Linear-time Inference</span>
              </div>
            </div>

            <div className="about-links">
              <a
                href="/docs"
                target="_blank"
                rel="noopener noreferrer"
                className="pixel-btn"
                style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}
              >
                <Plug className="w-3 h-3" />
                API DOCUMENTATION
              </a>
              <a
                href="https://github.com/cliangX/MS2Int"
                target="_blank"
                rel="noopener noreferrer"
                className="pixel-btn"
                style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}
              >
                <Github className="w-3 h-3" />
                INSTALL LOCAL
              </a>
            </div>

          </div>
        </div>
      </div>
    </section>
  );
}

import { useState, useEffect } from "react";
import { Sun, Moon, Github } from "lucide-react";
import logo from "../assets/ms2int-logo.png";

export default function Header() {
  const [dark, setDark] = useState(() =>
    document.documentElement.classList.contains("dark")
  );

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  return (
    <header style={{
      backgroundColor: "var(--color-foreground)",
      color: "var(--color-primary-foreground)",
      padding: "1rem 1.5rem",
      marginBottom: "1.5rem",
      borderBottom: "3px solid var(--color-border)",
    }}>
      <div style={{
        maxWidth: "64rem",
        margin: "0 auto",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <img src={logo} alt="MS2Int logo" style={{ width: "1.75rem", height: "1.75rem", objectFit: "contain", imageRendering: "pixelated" }} />
          <h1 style={{ fontFamily: "var(--font-pixel-title)", fontSize: "0.875rem", letterSpacing: "0.05em", margin: 0 }}>
            ★ MS2Int ★
          </h1>
          <span style={{ color: "#fcfcfc", fontSize: "0.95rem", fontFamily: "var(--font-pixel-body)", marginLeft: "0.5rem" }}>
            ═══ Spectrum Prediction Tool ═══
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <button
            onClick={() => setDark(!dark)}
            style={{ padding: "0.5rem", background: "none", border: "none", color: "inherit", cursor: "pointer" }}
            title="Toggle dark mode"
          >
            {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <a
            href="https://github.com/cliangX/MS2Int"
            target="_blank"
            rel="noopener noreferrer"
            style={{ padding: "0.5rem", color: "inherit", display: "flex" }}
            title="GitHub"
          >
            <Github className="w-4 h-4" />
          </a>
        </div>
      </div>
    </header>
  );
}

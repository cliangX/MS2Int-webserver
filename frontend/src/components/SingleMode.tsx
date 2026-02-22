import { useState } from "react";
import PeptideForm, { type PeptideFormData } from "./PeptideForm";
import SpectrumImage from "./SpectrumImage";
import IonTable from "./IonTable";
import { predictSingle, type PredictResponse } from "../api";
import { useAppToast } from "../ToastContext";

export default function SingleMode() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PredictResponse | null>(null);
  const { toast } = useAppToast();

  const handlePredict = async (data: PeptideFormData) => {
    setLoading(true);
    try {
      const res = await predictSingle(data);
      setResult(res);
      toast("success", `Predicted ${res.ions.length} ions for ${res.sequence}/${res.charge}+`);
    } catch (e: unknown) {
      toast("error", e instanceof Error ? e.message : String(e));
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      <div className="pixel-card">
        <div className="pixel-card-header">═══ SINGLE PREDICTION ═══</div>
        <div className="p-4">
          <p style={{ fontFamily: "var(--font-pixel-body)", fontSize: "1rem" }}>
            Interactive Spectrum Prediction
          </p>
          <p style={{ fontSize: "1rem", color: "var(--color-muted-foreground)" }}>
            Enter a peptide sequence with charge, collision energy, and fragmentation type → MS2Int instantly predicts its MS/MS spectrum with both terminal (b/y) and internal fragment ions
          </p>
          <p style={{ fontSize: "1rem", color: "var(--color-muted-foreground)" }}>
            Supports modifications: M[Oxidation], S[Phospho], C[Carbamidomethyl], [Acetyl]- ...
          </p>
        </div>
      </div>

      <PeptideForm onSubmit={handlePredict} loading={loading} />

      {result ? (
        <>
          <SpectrumImage
            pngBase64={result.spectrum_png}
            sequence={result.sequence}
            charge={result.charge}
          />
          <IonTable ions={result.ions} />
        </>
      ) : (
        <div className="pixel-card">
          <div className="pixel-card-header">═══ SPECTRUM ═══</div>
          <div style={{ padding: "3rem 1rem", textAlign: "center", color: "var(--color-muted-foreground)", fontFamily: "var(--font-pixel-body)", fontSize: "1rem" }}>
            ▷ Press PREDICT to start your quest!
          </div>
        </div>
      )}
    </div>
  );
}

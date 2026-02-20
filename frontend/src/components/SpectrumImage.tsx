interface Props {
  pngBase64: string;
  sequence: string;
  charge: number;
}

export default function SpectrumImage({ pngBase64, sequence, charge }: Props) {
  return (
    <div className="pixel-card">
      <div className="pixel-card-header">
        ═══ SPECTRUM ═══&nbsp;&nbsp;
        <span style={{ fontFamily: "var(--font-pixel-body)", fontSize: "0.75rem", fontWeight: "normal" }}>
          {sequence} / {charge}+
        </span>
      </div>
      <div style={{ padding: "1rem" }}>
        <img
          src={`data:image/png;base64,${pngBase64}`}
          alt={`Predicted spectrum for ${sequence}/${charge}+`}
          style={{ width: "100%", height: "auto", imageRendering: "auto", display: "block" }}
        />
      </div>
    </div>
  );
}

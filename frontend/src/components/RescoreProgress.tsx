import type { RescoreStatusResponse } from "../api";

const STEP_LABELS = [
  "Filter msms.txt",
  "Generate SpecId",
  "Parse MGF & build H5",
  "MS2Int prediction (GPU)",
  "Compute MS2PIP features",
  "Mokapot rescoring",
];

interface Props {
  jobId: string;
  status: RescoreStatusResponse;
}

export function RescoreProgress({ jobId, status }: Props) {
  const elapsed = status.elapsed_seconds;
  const mins = Math.floor(elapsed / 60);
  const secs = Math.floor(elapsed % 60);

  return (
    <div className="pixel-card">
      <div className="pixel-card-header">
        PIPELINE PROGRESS — {jobId}
      </div>
      <div className="p-4 space-y-1">
        {STEP_LABELS.map((label, i) => {
          const stepNum = i + 1;
          let stepStatus: "done" | "active" | "pending" = "pending";
          if (stepNum < status.current_step) stepStatus = "done";
          else if (stepNum === status.current_step) {
            stepStatus = status.status === "completed" ? "done" : "active";
          }

          return (
            <div key={i} className={`pixel-step pixel-step-${stepStatus}`}>
              <div className="pixel-step-icon">
                {stepStatus === "done" ? "✓" : stepStatus === "active" ? "▶" : " "}
              </div>
              <div>
                <div style={{ fontFamily: "var(--font-pixel-body)", fontSize: "0.9rem" }}>
                  Step {stepNum}/6 &nbsp; {label}
                </div>
                {stepStatus === "done" && stepNum === 1 && status.msms_filtered > 0 && (
                  <div style={{ fontSize: "0.8rem", color: "var(--color-muted-foreground)" }}>
                    {status.msms_total.toLocaleString()} → {status.msms_filtered.toLocaleString()} PSMs
                    ({((status.msms_filtered / status.msms_total) * 100).toFixed(1)}% kept)
                  </div>
                )}
                {stepStatus === "active" && (
                  <div style={{ fontSize: "0.8rem", color: "var(--color-primary)" }}>
                    {status.step_message}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        <div
          className="mt-3 pt-2"
          style={{
            borderTop: "2px solid var(--color-border-light)",
            fontSize: "0.85rem",
            color: "var(--color-muted-foreground)",
          }}
        >
          ELAPSED: {mins}m {secs.toString().padStart(2, "0")}s
          {status.status === "failed" && status.error && (
            <span style={{ color: "var(--color-destructive)", marginLeft: "1rem" }}>
              ERROR: {status.error}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

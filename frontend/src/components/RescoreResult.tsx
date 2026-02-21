import { getRescoreDownloadUrl, type RescoreStatusResponse } from "../api";

interface Props {
  jobId: string;
  status: RescoreStatusResponse;
}

export function RescoreResult({ jobId, status }: Props) {
  const elapsed = status.elapsed_seconds;
  const mins = Math.floor(elapsed / 60);
  const secs = Math.floor(elapsed % 60);

  const psmRate =
    status.msms_filtered > 0
      ? ((status.accepted_psms / status.msms_filtered) * 100).toFixed(1)
      : "0";

  return (
    <div className="pixel-card">
      <div className="pixel-card-header">═══ RESULTS ═══</div>
      <div className="p-4">
        <table className="pixel-table mb-4">
          <tbody>
            <tr>
              <td style={{ fontWeight: "bold" }}>TOTAL PSMs (input)</td>
              <td>{status.msms_total.toLocaleString()}</td>
            </tr>
            <tr>
              <td style={{ fontWeight: "bold" }}>FILTERED PSMs</td>
              <td>{status.msms_filtered.toLocaleString()}</td>
            </tr>
            <tr>
              <td style={{ fontWeight: "bold" }}>ACCEPTED PSMs (FDR)</td>
              <td>
                {status.accepted_psms.toLocaleString()} ({psmRate}%)
              </td>
            </tr>
            <tr>
              <td style={{ fontWeight: "bold" }}>ACCEPTED PEPTIDES</td>
              <td>{status.accepted_peptides.toLocaleString()}</td>
            </tr>
            <tr>
              <td style={{ fontWeight: "bold" }}>ELAPSED TIME</td>
              <td>
                {mins}m {secs.toString().padStart(2, "0")}s
              </td>
            </tr>
          </tbody>
        </table>

        <div className="flex gap-3 flex-wrap">
          {status.result_files.map((f) => (
            <a
              key={f}
              className="pixel-btn pixel-btn-primary"
              href={getRescoreDownloadUrl(jobId, f)}
              download
            >
              ↓ {f.toUpperCase()}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

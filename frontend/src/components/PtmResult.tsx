import { getPtmDownloadUrl, type PtmStatusResponse } from "../api";

interface Props {
  jobId: string;
  status: PtmStatusResponse;
}

export default function PtmResult({ jobId, status }: Props) {
  const elapsed = status.elapsed_seconds;
  const mins = Math.floor(elapsed / 60);
  const secs = Math.floor(elapsed % 60);

  const flr1pctRate = status.mono_phospho_psms > 0
    ? ((status.flr_1pct_psms / status.mono_phospho_psms) * 100).toFixed(1) : "0";
  const flr5pctRate = status.mono_phospho_psms > 0
    ? ((status.flr_5pct_psms / status.mono_phospho_psms) * 100).toFixed(1) : "0";

  return (
    <div className="pixel-card">
      <div className="pixel-card-header">═══ RESULTS ═══</div>
      <div className="p-4">
        <table className="pixel-table mb-4">
          <tbody>
            <tr>
              <td style={{ fontWeight: "bold" }}>TOTAL PHOSPHO PSMs</td>
              <td>{status.total_phospho_psms.toLocaleString()}</td>
            </tr>
            <tr>
              <td style={{ fontWeight: "bold" }}>MONO-PHOSPHO PSMs</td>
              <td>{status.mono_phospho_psms.toLocaleString()}</td>
            </tr>
            <tr>
              <td style={{ fontWeight: "bold" }}>FLR ≤ 1% PSMs</td>
              <td>{status.flr_1pct_psms.toLocaleString()} ({flr1pctRate}%)</td>
            </tr>
            <tr>
              <td style={{ fontWeight: "bold" }}>FLR ≤ 5% PSMs</td>
              <td>{status.flr_5pct_psms.toLocaleString()} ({flr5pctRate}%)</td>
            </tr>
            <tr>
              <td style={{ fontWeight: "bold" }}>PHOSPHOSITES EXPORTED</td>
              <td>{status.phosphosites_exported.toLocaleString()}</td>
            </tr>
            <tr>
              <td style={{ fontWeight: "bold" }}>ELAPSED TIME</td>
              <td>{mins}m {secs.toString().padStart(2, "0")}s</td>
            </tr>
          </tbody>
        </table>

        <div className="flex gap-3 flex-wrap">
          {status.result_files.map((f) => (
            <a key={f} className="pixel-btn pixel-btn-primary"
              href={getPtmDownloadUrl(jobId, f)} download
              style={{ textDecoration: "none" }}>
              ↓ {f.toUpperCase()}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

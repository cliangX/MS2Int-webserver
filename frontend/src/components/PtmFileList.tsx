import type { UploadedFileInfo, PtmRawFileInfo } from "../api";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface Props {
  uploadedFiles: UploadedFileInfo[];
  rawFiles: PtmRawFileInfo[];
  unmatchedMgf: string[];
  hasStyFile: boolean;
  styFilename: string;
}

export default function PtmFileList({ uploadedFiles, rawFiles, unmatchedMgf }: Props) {
  const matchedMgfSet = new Set(rawFiles.map((r) => r.mgf_file).filter(Boolean));

  return (
    <div className="pixel-card">
      <div className="pixel-card-header">═══ UPLOADED FILES ═══</div>
      <div className="p-3">
        <table className="pixel-table">
          <thead>
            <tr>
              <th>FILE</th>
              <th>SIZE</th>
              <th>TYPE</th>
              <th>STATUS</th>
            </tr>
          </thead>
          <tbody>
            {uploadedFiles.map((f) => {
              let status = "";
              let statusColor = "var(--color-foreground)";

              if (f.type === "msms") {
                const totalPhospho = rawFiles
                  .filter((r) => r.msms_file === f.filename)
                  .reduce((s, r) => s + r.phospho_psm_count, 0);
                status = `✓ ${totalPhospho.toLocaleString()} phospho PSMs`;
                statusColor = "var(--color-success)";
              } else if (f.type === "sty_sites") {
                status = "✓ detected";
                statusColor = "var(--color-success)";
              } else {
                if (matchedMgfSet.has(f.filename)) {
                  status = "✓ matched";
                  statusColor = "var(--color-success)";
                } else {
                  status = "⚠ no match";
                  statusColor = "var(--color-warning)";
                }
              }

              return (
                <tr key={f.filename}>
                  <td style={{ fontFamily: "var(--font-pixel-code)", fontSize: "0.8rem" }}>
                    {f.filename}
                  </td>
                  <td>{formatSize(f.size_bytes)}</td>
                  <td>
                    <span className={`pixel-file-tag pixel-file-tag-${f.type}`}>
                      {f.type === "sty_sites" ? "STY SITES" : f.type.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ color: statusColor }}>{status}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {unmatchedMgf.length > 0 && (
          <div className="mt-2 p-2"
            style={{
              fontSize: "0.85rem",
              color: "var(--color-warning)",
              borderLeft: "3px solid var(--color-warning)",
              paddingLeft: "0.5rem",
            }}>
            ⚠ {unmatchedMgf.join(", ")} — no matching Raw file in msms.txt, will be ignored
          </div>
        )}
      </div>
    </div>
  );
}

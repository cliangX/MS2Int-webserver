import type { RawFileInfo, MsmsFileInfo, FileParam } from "../api";

interface Props {
  rawFiles: RawFileInfo[];
  msmsFiles: MsmsFileInfo[];
  fileParams: FileParam[];
  onChange: (params: FileParam[]) => void;
}

export function RescoreFileTable({ rawFiles, msmsFiles, fileParams, onChange }: Props) {
  const msmsNames = msmsFiles.map((m) => m.filename);

  const update = (idx: number, field: keyof FileParam, value: string | number) => {
    const next = fileParams.map((p, i) =>
      i === idx ? { ...p, [field]: value } : p
    );
    onChange(next);
  };

  return (
    <div className="pixel-card">
      <div className="pixel-card-header">FILE PARAMETERS</div>
      <div className="p-3">
        <table className="pixel-table">
          <thead>
            <tr>
              <th>RAW FILE</th>
              <th>SEARCH RESULT</th>
              <th>FRAGMENT</th>
              <th>CE (eV)</th>
            </tr>
          </thead>
          <tbody>
            {fileParams.map((fp, idx) => {
              const rf = rawFiles.find((r) => r.raw_file === fp.raw_file);
              const hasMgf = rf ? rf.mgf_file !== "" : false;

              return (
                <tr
                  key={fp.raw_file}
                  style={!hasMgf ? { opacity: 0.5 } : undefined}
                >
                  <td style={{ fontFamily: "var(--font-pixel-code)", fontSize: "0.8rem" }}>
                    {fp.raw_file}
                    {!hasMgf && (
                      <span style={{ color: "var(--color-warning)", marginLeft: "0.5rem" }}>
                        (no MGF)
                      </span>
                    )}
                  </td>
                  <td>
                    <select
                      className="pixel-select"
                      style={{ fontSize: "0.85rem", width: "100%" }}
                      value={fp.search_result}
                      onChange={(e) => update(idx, "search_result", e.target.value)}
                    >
                      {msmsNames.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      className="pixel-select"
                      style={{ width: "5rem" }}
                      value={fp.fragmentation}
                      onChange={(e) => update(idx, "fragmentation", e.target.value)}
                    >
                      <option value="HCD">HCD</option>
                      <option value="CID">CID</option>
                    </select>
                  </td>
                  <td>
                    <input
                      className="pixel-input"
                      type="number"
                      style={{ width: "4.5rem" }}
                      value={fp.collision_energy}
                      onChange={(e) =>
                        update(idx, "collision_energy", parseInt(e.target.value, 10) || 0)
                      }
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

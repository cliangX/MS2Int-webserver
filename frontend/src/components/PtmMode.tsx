import { useState, useCallback, useEffect, useRef } from "react";
import {
  uploadPtmFilesWithProgress,
  submitPtm,
  getPtmStatus,
  type PtmUploadResponse,
  type PtmStatusResponse,
  type PtmFileParam,
} from "../api";
import PtmUpload from "./PtmUpload";
import PtmFileList from "./PtmFileList";
import PtmFileTable from "./PtmFileTable";
import PtmProgress from "./PtmProgress";
import PtmResult from "./PtmResult";

type Phase = "idle" | "uploading" | "uploaded" | "running" | "completed" | "failed";

export default function PtmMode() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadData, setUploadData] = useState<PtmUploadResponse | null>(null);
  const [fileParams, setFileParams] = useState<PtmFileParam[]>([]);
  const [targetFlr, setTargetFlr] = useState(0.01);
  const [jobId, setJobId] = useState("");
  const [jobStatus, setJobStatus] = useState<PtmStatusResponse | null>(null);
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const handleUpload = useCallback(async (files: File[]) => {
    setError("");
    setPhase("uploading");
    setUploadProgress(0);

    try {
      const data = await uploadPtmFilesWithProgress(files, setUploadProgress);

      if (data.errors.length > 0) {
        setError(data.errors.join("; "));
      }

      // Build initial file params from raw_files
      const params: PtmFileParam[] = data.raw_files.map((rf) => ({
        raw_file: rf.raw_file,
        search_result: rf.msms_file,
        fragmentation: "HCD",
        collision_energy: 30,
      }));

      setUploadData(data);
      setFileParams(params);
      setPhase("uploaded");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("idle");
    }
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!uploadData) return;
    setError("");

    try {
      const resp = await submitPtm({
        session_id: uploadData.session_id,
        file_params: fileParams,
        target_flr: targetFlr,
      });

      setJobId(resp.job_id);
      setPhase("running");

      // Start polling
      const poll = window.setInterval(async () => {
        try {
          const st = await getPtmStatus(resp.job_id);
          setJobStatus(st);

          if (st.status === "completed") {
            clearInterval(poll);
            pollRef.current = null;
            setPhase("completed");
          } else if (st.status === "failed") {
            clearInterval(poll);
            pollRef.current = null;
            setError(st.error || "Pipeline failed");
            setPhase("failed");
          }
        } catch (e: unknown) {
          clearInterval(poll);
          pollRef.current = null;
          setError(e instanceof Error ? e.message : String(e));
          setPhase("failed");
        }
      }, 2000);

      pollRef.current = poll;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("uploaded");
    }
  }, [uploadData, fileParams, targetFlr]);

  const handleReset = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setPhase("idle");
    setError("");
    setUploadProgress(0);
    setUploadData(null);
    setFileParams([]);
    setTargetFlr(0.01);
    setJobId("");
    setJobStatus(null);
  }, []);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="pixel-card">
        <div className="pixel-card-header">═══ PTM LOCATION ═══</div>
        <div className="p-4">
          <p style={{ fontFamily: "var(--font-pixel-body)", fontSize: "1rem" }}>
            Phosphorylation Site Localization (FLR)
          </p>
          <p style={{ fontSize: "1rem", color: "var(--color-muted-foreground)" }}>
            Upload search result (with PTM) + MGF files → MS2Int predict →
            Cosine similarity → FLR → Download
          </p>
          <p style={{ fontSize: "1rem", color: "var(--color-muted-foreground)" }}>
            Accepts: .txt (MaxQuant msms.txt, Phospho(STY)Sites.txt) and .mgf (spectra)
          </p>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="pixel-card p-3"
          style={{ borderColor: "var(--color-destructive)", color: "var(--color-destructive)" }}>
          <span style={{ fontFamily: "var(--font-pixel-title)", fontSize: "0.5rem" }}>ERROR:</span>{" "}
          <span style={{ fontSize: "0.85rem" }}>{error}</span>
        </div>
      )}

      {/* IDLE */}
      {phase === "idle" && <PtmUpload onUpload={handleUpload} />}

      {/* UPLOADING */}
      {phase === "uploading" && (
        <div className="pixel-card p-6">
          <p style={{ fontFamily: "var(--font-pixel-body)", fontSize: "0.75rem", marginBottom: "1rem" }}>
            UPLOADING ... {uploadProgress}%
          </p>
          <div className="pixel-progress">
            <div className="pixel-progress-bar"
              style={{ width: `${uploadProgress}%`, transition: "width 0.2s ease" }} />
          </div>
        </div>
      )}

      {/* UPLOADED */}
      {phase === "uploaded" && uploadData && (
        <>
          <PtmFileList
            uploadedFiles={uploadData.uploaded_files}
            rawFiles={uploadData.raw_files}
            unmatchedMgf={uploadData.unmatched_mgf_files}
            hasStyFile={uploadData.has_sty_file}
            styFilename={uploadData.sty_filename}
          />
          <PtmFileTable
            rawFiles={uploadData.raw_files}
            msmsFiles={uploadData.msms_files}
            fileParams={fileParams}
            onChange={setFileParams}
            targetFlr={targetFlr}
            onTargetFlrChange={setTargetFlr}
          />
          <div className="flex gap-3">
            <button className="pixel-btn pixel-btn-primary" onClick={handleSubmit}>
              ▶ START PTM LOCATION
            </button>
            <button className="pixel-btn" onClick={handleReset}>CANCEL</button>
          </div>
        </>
      )}

      {/* RUNNING / FAILED */}
      {(phase === "running" || phase === "failed") && jobStatus && (
        <PtmProgress jobId={jobId} status={jobStatus} />
      )}

      {/* COMPLETED */}
      {phase === "completed" && jobStatus && (
        <>
          <PtmProgress jobId={jobId} status={jobStatus} />
          <PtmResult jobId={jobId} status={jobStatus} />
          <button className="pixel-btn" onClick={handleReset}>
            ▶ START NEW PTM LOCATION
          </button>
        </>
      )}
    </div>
  );
}

import { useState, useCallback, useEffect, useRef } from "react";
import {
  uploadRescoreFiles,
  submitRescore,
  getRescoreStatus,
  type RescoreUploadResponse,
  type RescoreStatusResponse,
  type FileParam,
} from "../api";
import { RescoreUpload } from "./RescoreUpload";
import { RescoreFileList } from "./RescoreFileList";
import { RescoreFileTable } from "./RescoreFileTable";
import { RescoreProgress } from "./RescoreProgress";
import { RescoreResult } from "./RescoreResult";

type Phase = "idle" | "uploading" | "uploaded" | "running" | "completed" | "failed";

export default function RescoreMode() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState("");
  const [uploadData, setUploadData] = useState<RescoreUploadResponse | null>(null);
  const [fileParams, setFileParams] = useState<FileParam[]>([]);
  const [jobId, setJobId] = useState("");
  const [jobStatus, setJobStatus] = useState<RescoreStatusResponse | null>(null);
  const pollRef = useRef<number | null>(null);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const handleUpload = useCallback(async (files: File[]) => {
    setPhase("uploading");
    setError("");
    try {
      const resp = await uploadRescoreFiles(files);
      setUploadData(resp);
      // Initialize fileParams from raw_files
      setFileParams(
        resp.raw_files.map((rf) => ({
          raw_file: rf.raw_file,
          search_result: rf.msms_file,
          fragmentation: "HCD",
          collision_energy: 30,
        }))
      );
      setPhase("uploaded");
      if (resp.errors.length > 0) {
        setError(resp.errors.join("; "));
      }
    } catch (e: any) {
      setError(e.message || "Upload failed");
      setPhase("idle");
    }
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!uploadData) return;
    setError("");
    try {
      const resp = await submitRescore({
        session_id: uploadData.session_id,
        file_params: fileParams,
      });
      setJobId(resp.job_id);
      setPhase("running");

      // Start polling
      pollRef.current = window.setInterval(async () => {
        try {
          const status = await getRescoreStatus(resp.job_id);
          setJobStatus(status);
          if (status.status === "completed") {
            setPhase("completed");
            if (pollRef.current) clearInterval(pollRef.current);
          } else if (status.status === "failed") {
            setPhase("failed");
            setError(status.error || "Pipeline failed");
            if (pollRef.current) clearInterval(pollRef.current);
          }
        } catch {
          // ignore transient fetch errors
        }
      }, 2000);
    } catch (e: any) {
      setError(e.message || "Submit failed");
    }
  }, [uploadData, fileParams]);

  const handleReset = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    setPhase("idle");
    setError("");
    setUploadData(null);
    setFileParams([]);
    setJobId("");
    setJobStatus(null);
  }, []);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="pixel-card">
        <div className="pixel-card-header">★ RESCORE</div>
        <div className="p-4">
          <p style={{ fontFamily: "var(--font-pixel-body)", fontSize: "1rem" }}>
            Percolator Rescoring Pipeline
          </p>
          <p style={{ fontSize: "1rem", color: "var(--color-muted-foreground)" }}>
            Upload search result(FDR: 100%) + MGF files → MS2Int predict → feature extract → Percolator(FDR: 1%) → Download
          </p>
          <p style={{ fontSize: "1rem", color: "var(--color-muted-foreground)" }}>
            Accepts: .txt (MaxQuant msms.txt(only now)) and .mgf (spectra)
          </p>
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div
          className="pixel-card p-3"
          style={{ borderColor: "var(--color-destructive)", color: "var(--color-destructive)" }}
        >
          <span style={{ fontFamily: "var(--font-pixel-title)", fontSize: "0.5rem" }}>
            ERROR:
          </span>{" "}
          <span style={{ fontSize: "0.85rem" }}>{error}</span>
        </div>
      )}

      {/* Phase: IDLE — upload area */}
      {phase === "idle" && <RescoreUpload onUpload={handleUpload} />}

      {/* Phase: UPLOADING — loading */}
      {phase === "uploading" && (
        <div className="pixel-card p-6 text-center">
          <div className="pixel-loading-dots">
            <span /><span /><span />
          </div>
          <p style={{ marginTop: "0.5rem", fontSize: "0.9rem" }}>Uploading files...</p>
        </div>
      )}

      {/* Phase: UPLOADED — file list + table form + submit */}
      {phase === "uploaded" && uploadData && (
        <>
          <RescoreFileList
            uploadedFiles={uploadData.uploaded_files}
            rawFiles={uploadData.raw_files}
            unmatchedMgf={uploadData.unmatched_mgf_files}
          />
          <RescoreFileTable
            rawFiles={uploadData.raw_files}
            msmsFiles={uploadData.msms_files}
            fileParams={fileParams}
            onChange={setFileParams}
          />
          <div className="flex gap-3">
            <button className="pixel-btn pixel-btn-primary" onClick={handleSubmit}>
              ▶ START RESCORE
            </button>
            <button className="pixel-btn" onClick={handleReset}>
              CANCEL
            </button>
          </div>
        </>
      )}

      {/* Phase: RUNNING — progress */}
      {(phase === "running" || phase === "failed") && jobStatus && (
        <RescoreProgress jobId={jobId} status={jobStatus} />
      )}

      {/* Phase: COMPLETED — results */}
      {phase === "completed" && jobStatus && (
        <>
          <RescoreProgress jobId={jobId} status={jobStatus} />
          <RescoreResult jobId={jobId} status={jobStatus} />
          <button className="pixel-btn" onClick={handleReset}>
            ▶ START NEW RESCORE
          </button>
        </>
      )}
    </div>
  );
}

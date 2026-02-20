import { useEffect, useState } from "react";
import { Download, Clock, AlertTriangle, CheckCircle, Loader2 } from "lucide-react";
import { getJobStatus, getJobDownloadUrl, type JobStatusResponse } from "../api";

interface Props {
  jobId: string;
  onCompleted?: () => void;
}

export default function JobStatus({ jobId, onCompleted }: Props) {
  const [status, setStatus] = useState<JobStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;
    let mounted = true;

    const poll = async () => {
      try {
        const s = await getJobStatus(jobId);
        if (!mounted) return;
        setStatus(s);
        if (s.status === "completed" || s.status === "failed") {
          clearInterval(timer);
          if (s.status === "completed") onCompleted?.();
        }
      } catch (e: unknown) {
        if (!mounted) return;
        setError(e instanceof Error ? e.message : String(e));
        clearInterval(timer);
      }
    };

    poll();
    timer = setInterval(poll, 2000);

    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [jobId, onCompleted]);

  if (error) {
    return (
      <div className="pixel-card p-4 bg-destructive/10 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0" />
        <div>
          <p className="font-[family-name:var(--font-pixel-title)] text-[0.6rem] text-destructive">ERROR</p>
          <p className="text-[0.75rem] mt-1">{error}</p>
        </div>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="pixel-card p-4 flex items-center gap-3">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
        <span className="text-[0.75rem]">Loading job status...</span>
      </div>
    );
  }

  const pct = Math.round(status.progress * 100);

  return (
    <div className="pixel-card p-5 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="font-[family-name:var(--font-pixel-title)] text-[0.6rem] tracking-wide">
            JOB: {status.job_id}
          </p>
          <p className="text-[0.65rem] text-muted-foreground mt-1">{status.filename}</p>
        </div>
        <StatusBadge status={status.status} />
      </div>

      {/* Progress */}
      {(status.status === "running" || status.status === "pending") && (
        <div>
          <div className="pixel-progress">
            <div className="pixel-progress-bar" style={{ width: `${pct}%` }} />
          </div>
          <div className="flex justify-between mt-2 text-[0.6rem] text-muted-foreground">
            <span>{status.processed} / {status.total} samples</span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              ~{Math.round(status.estimated_remaining_seconds)}s remaining
            </span>
          </div>
        </div>
      )}

      {/* Completed */}
      {status.status === "completed" && (
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-success text-[0.7rem]">
            <CheckCircle className="w-4 h-4" />
            <span>{status.total} samples processed in {status.elapsed_seconds.toFixed(1)}s</span>
          </div>
          <a
            href={getJobDownloadUrl(jobId)}
            download
            className="pixel-btn pixel-btn-primary flex items-center gap-2 no-underline text-[0.6rem]"
          >
            <Download className="w-4 h-4" />
            DOWNLOAD H5
          </a>
        </div>
      )}

      {/* Failed */}
      {status.status === "failed" && status.error && (
        <div className="flex items-start gap-2 text-destructive text-[0.7rem]">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{status.error}</span>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: "bg-warning text-foreground",
    running: "bg-primary text-primary-foreground",
    completed: "bg-success text-primary-foreground",
    failed: "bg-destructive text-primary-foreground",
  };
  return (
    <span className={`px-2 py-1 text-[0.55rem] font-[family-name:var(--font-pixel-title)] border-2 border-border-dark ${styles[status] || "bg-muted-foreground text-primary-foreground"}`}>
      {status.toUpperCase()}
    </span>
  );
}

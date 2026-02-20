import { useState, useEffect, useCallback } from "react";
import CsvUpload from "./CsvUpload";
import JobStatus from "./JobStatus";
import JobHistory, { type JobRecord } from "./JobHistory";
import { submitJob } from "../api";
import { useAppToast } from "../ToastContext";

const STORAGE_KEY = "ms2int_job_history";

function loadHistory(): JobRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHistory(jobs: JobRecord[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
}

export default function BatchMode() {
  const [loading, setLoading] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [history, setHistory] = useState<JobRecord[]>(loadHistory);
  const { toast } = useAppToast();

  useEffect(() => {
    saveHistory(history);
  }, [history]);

  const handleUpload = async (file: File) => {
    setLoading(true);
    try {
      const res = await submitJob(file);
      const record: JobRecord = {
        job_id: res.job_id,
        filename: res.filename,
        total_samples: res.total_samples,
        created_at: res.created_at,
      };
      setHistory((prev) => [record, ...prev]);
      setActiveJobId(res.job_id);
      toast("success", `Job submitted: ${res.total_samples} samples (~${res.estimated_seconds}s)`);
    } catch (e: unknown) {
      toast("error", e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = (jobId: string) => {
    setHistory((prev) => prev.filter((j) => j.job_id !== jobId));
    if (activeJobId === jobId) setActiveJobId(null);
  };

  const handleCompleted = useCallback(() => {
    toast("success", "Batch job completed! Ready to download.");
  }, [toast]);

  return (
    <div className="space-y-5">
      <CsvUpload onUpload={handleUpload} loading={loading} />

      {activeJobId && (
        <JobStatus jobId={activeJobId} onCompleted={handleCompleted} />
      )}

      <JobHistory
        jobs={history}
        activeJobId={activeJobId}
        onSelect={setActiveJobId}
        onRemove={handleRemove}
      />
    </div>
  );
}

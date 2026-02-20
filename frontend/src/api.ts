/** MS2Int API client */

const BASE = "/api";

// ── Types ─────────────────────────────────────────────────────

export interface IonItem {
  label: string;
  mz: number;
  intensity: number;
  type: string;
}

export interface PredictResponse {
  sequence: string;
  charge: number;
  collision_energy: number;
  fragmentation: string;
  length: number;
  spectrum_png: string; // base64
  ions: IonItem[];
}

export interface JobSubmitResponse {
  job_id: string;
  filename: string;
  total_samples: number;
  estimated_seconds: number;
  status: string;
  created_at: string;
}

export interface JobStatusResponse {
  job_id: string;
  status: "pending" | "running" | "completed" | "failed";
  progress: number;
  processed: number;
  total: number;
  elapsed_seconds: number;
  estimated_remaining_seconds: number;
  error: string | null;
  filename: string;
  created_at: string;
}

export interface JobListItem {
  job_id: string;
  filename: string;
  total_samples: number;
  status: string;
  created_at: string;
}

export interface HealthResponse {
  status: string;
  model_loaded: boolean;
  device: string;
}

// ── Single mode ───────────────────────────────────────────────

export async function predictSingle(params: {
  sequence: string;
  charge: number;
  collision_energy: number;
  fragmentation: string;
}): Promise<PredictResponse> {
  const res = await fetch(`${BASE}/predict`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

// ── Batch mode ────────────────────────────────────────────────

export async function submitJob(file: File): Promise<JobSubmitResponse> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${BASE}/jobs/submit`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function getJobStatus(jobId: string): Promise<JobStatusResponse> {
  const res = await fetch(`${BASE}/jobs/${jobId}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

export function getJobDownloadUrl(jobId: string): string {
  return `${BASE}/jobs/${jobId}/download`;
}

export async function listJobs(): Promise<JobListItem[]> {
  const res = await fetch(`${BASE}/jobs`);
  if (!res.ok) return [];
  return res.json();
}

// ── FASTA mode ────────────────────────────────────────────────

export interface FastaJobParams {
  charges: string;        // comma-separated e.g. "1,2,3"
  collision_energy: number;
  fragmentation: string;
  missed_cleavages: number;
  min_length: number;
  max_length: number;
}

export async function submitFastaJob(file: File, params: FastaJobParams): Promise<JobSubmitResponse> {
  const form = new FormData();
  form.append("file", file);
  form.append("charges", params.charges);
  form.append("collision_energy", String(params.collision_energy));
  form.append("fragmentation", params.fragmentation);
  form.append("missed_cleavages", String(params.missed_cleavages));
  form.append("min_length", String(params.min_length));
  form.append("max_length", String(params.max_length));
  const res = await fetch(`${BASE}/jobs/submit-fasta`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

// ── Health ────────────────────────────────────────────────────

export async function checkHealth(): Promise<HealthResponse> {
  const res = await fetch(`${BASE}/health`);
  return res.json();
}

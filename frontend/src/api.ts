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

// ── Rescore mode ─────────────────────────────────────────────

export interface UploadedFileInfo {
  filename: string;
  size_bytes: number;
  type: "msms" | "mgf";
}

export interface MsmsFileInfo {
  filename: string;
  total_rows: number;
  raw_files: string[];
}

export interface RawFileInfo {
  raw_file: string;
  mgf_file: string;
  msms_file: string;
  psm_count: number;
}

export interface RescoreUploadResponse {
  session_id: string;
  uploaded_files: UploadedFileInfo[];
  msms_files: MsmsFileInfo[];
  raw_files: RawFileInfo[];
  unmatched_mgf_files: string[];
  errors: string[];
}

export interface FileParam {
  raw_file: string;
  search_result: string;
  fragmentation: string;
  collision_energy: number;
}

export interface RescoreSubmitRequest {
  session_id: string;
  file_params: FileParam[];
  rng?: number;
  folds?: number;
  max_workers?: number;
  train_fdr?: number;
  test_fdr?: number;
  add_basic?: boolean;
  add_maxquant?: boolean;
}

export interface RescoreSubmitResponse {
  job_id: string;
  status: string;
  total_steps: number;
  created_at: string;
}

export interface RescoreStatusResponse {
  job_id: string;
  status: "pending" | "running" | "completed" | "failed";
  current_step: number;
  total_steps: number;
  step_message: string;
  msms_total: number;
  msms_filtered: number;
  accepted_psms: number;
  accepted_peptides: number;
  elapsed_seconds: number;
  error: string | null;
  result_files: string[];
}

export async function uploadRescoreFiles(files: File[]): Promise<RescoreUploadResponse> {
  const form = new FormData();
  for (const f of files) {
    form.append("files", f);
  }
  const res = await fetch(`${BASE}/rescore/upload`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

export function uploadRescoreFilesWithProgress(
  files: File[],
  onProgress: (percent: number) => void
): Promise<RescoreUploadResponse> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    for (const f of files) form.append("files", f);

    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try { resolve(JSON.parse(xhr.responseText)); }
        catch { reject(new Error("Invalid JSON response")); }
      } else {
        try {
          const err = JSON.parse(xhr.responseText);
          reject(new Error(err.detail || `HTTP ${xhr.status}`));
        } catch {
          reject(new Error(`HTTP ${xhr.status}`));
        }
      }
    };
    xhr.onerror = () => reject(new Error("Network error"));
    xhr.open("POST", `${BASE}/rescore/upload`);
    xhr.send(form);
  });
}

export async function submitRescore(params: RescoreSubmitRequest): Promise<RescoreSubmitResponse> {
  const res = await fetch(`${BASE}/rescore/submit`, {
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

export async function getRescoreStatus(jobId: string): Promise<RescoreStatusResponse> {
  const res = await fetch(`${BASE}/rescore/${jobId}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

export function getRescoreDownloadUrl(jobId: string, filename: string): string {
  return `${BASE}/rescore/${jobId}/download/${filename}`;
}

// ── Health ────────────────────────────────────────────────────

export async function checkHealth(): Promise<HealthResponse> {
  const res = await fetch(`${BASE}/health`);
  return res.json();
}

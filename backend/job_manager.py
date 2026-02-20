"""Async job queue for batch predictions.

Jobs are submitted, run in a background thread, and results are stored
on disk for later retrieval.
"""

from __future__ import annotations

import csv
import io
import os
import shutil
import threading
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Any, Callable, Optional

import h5py
import numpy as np
import pandas as pd

from config import JOBS_DIR, ESTIMATE_SEC_PER_SAMPLE, JOB_RETENTION_HOURS


class JobStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


@dataclass
class JobInfo:
    job_id: str
    filename: str
    total_samples: int
    status: JobStatus = JobStatus.PENDING
    processed: int = 0
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    error: Optional[str] = None

    @property
    def estimated_seconds(self) -> float:
        return self.total_samples * ESTIMATE_SEC_PER_SAMPLE

    @property
    def progress(self) -> float:
        if self.total_samples == 0:
            return 0.0
        return min(self.processed / self.total_samples, 1.0)

    @property
    def elapsed_seconds(self) -> float:
        if self.started_at is None:
            return 0.0
        end = self.finished_at or datetime.now(timezone.utc)
        return (end - self.started_at).total_seconds()

    @property
    def estimated_remaining_seconds(self) -> float:
        if self.progress <= 0 or self.elapsed_seconds <= 0:
            return self.estimated_seconds
        rate = self.processed / self.elapsed_seconds
        remaining = self.total_samples - self.processed
        return remaining / rate if rate > 0 else 0.0


class JobManager:
    """Thread-safe job manager for batch predictions."""

    def __init__(self) -> None:
        self._jobs: dict[str, JobInfo] = {}
        self._lock = threading.Lock()

    def submit(
        self,
        csv_bytes: bytes,
        filename: str,
        predict_fn: Callable,
    ) -> JobInfo:
        """Create a new job and start processing in a background thread.

        ``predict_fn`` should be ``predictor.predict_batch_from_arrays``.
        """
        # Parse CSV/TSV
        sep = "\t" if filename.lower().endswith(".tsv") else ","
        text = csv_bytes.decode("utf-8-sig")
        df = pd.read_csv(io.StringIO(text), sep=sep)

        required = {"Sequence", "Charge", "collision_energy", "Fragmentation"}
        missing = required - set(df.columns)
        if missing:
            raise ValueError(f"Missing required columns: {missing}")

        # Auto-compute Length if absent
        if "Length" not in df.columns:
            from ion_labels import tokenize_peptide
            df["Length"] = df["Sequence"].apply(
                lambda s: len([t for t in tokenize_peptide(s)
                               if not (t.startswith("[") and t.endswith("]-")) and t != "-[]"])
            )

        job_id = uuid.uuid4().hex[:8]
        job_dir = JOBS_DIR / job_id
        job_dir.mkdir(parents=True, exist_ok=True)

        # Save input
        df.to_csv(job_dir / "input.csv", index=False)

        job = JobInfo(
            job_id=job_id,
            filename=filename,
            total_samples=len(df),
        )

        with self._lock:
            self._jobs[job_id] = job

        thread = threading.Thread(
            target=self._run_job,
            args=(job, df, predict_fn),
            daemon=True,
        )
        thread.start()
        return job

    def get_status(self, job_id: str) -> Optional[JobInfo]:
        with self._lock:
            return self._jobs.get(job_id)

    def get_result_path(self, job_id: str) -> Optional[Path]:
        job = self.get_status(job_id)
        if job is None or job.status != JobStatus.COMPLETED:
            return None
        result_path = JOBS_DIR / job_id / "result.h5"
        if result_path.exists():
            return result_path
        return None

    def list_jobs(self) -> list[JobInfo]:
        with self._lock:
            return list(self._jobs.values())

    def _run_job(
        self,
        job: JobInfo,
        df: pd.DataFrame,
        predict_fn: Callable,
    ) -> None:
        """Execute prediction in background thread."""
        with self._lock:
            job.status = JobStatus.RUNNING
            job.started_at = datetime.now(timezone.utc)

        def progress_cb(processed: int, total: int) -> None:
            with self._lock:
                job.processed = processed

        try:
            predictions = predict_fn(
                sequences=df["Sequence"].tolist(),
                charges=df["Charge"].astype(int).tolist(),
                collision_energies=df["collision_energy"].astype(int).tolist(),
                fragmentations=df["Fragmentation"].astype(str).tolist(),
                progress_callback=progress_cb,
            )

            # Save results to H5
            job_dir = JOBS_DIR / job.job_id
            result_path = job_dir / "result.h5"
            with h5py.File(str(result_path), "w") as f:
                f.create_dataset(
                    "Sequence",
                    data=df["Sequence"].astype(str).str.encode("utf-8").values.astype("S128"),
                )
                f.create_dataset("Charge", data=df["Charge"].values.astype(np.int32))
                f.create_dataset(
                    "collision_energy",
                    data=df["collision_energy"].values.astype(np.int32),
                )
                f.create_dataset(
                    "Fragmentation",
                    data=df["Fragmentation"].astype(str).str.encode("utf-8").values.astype("S10"),
                )
                if "Length" in df.columns:
                    f.create_dataset("Length", data=df["Length"].values.astype(np.int32))
                f.create_dataset("Intpredict", data=predictions)

            with self._lock:
                job.status = JobStatus.COMPLETED
                job.processed = job.total_samples
                job.finished_at = datetime.now(timezone.utc)

        except Exception as e:
            with self._lock:
                job.status = JobStatus.FAILED
                job.error = str(e)
                job.finished_at = datetime.now(timezone.utc)

    def cleanup_old_jobs(self) -> int:
        """Remove jobs older than JOB_RETENTION_HOURS. Returns count removed."""
        now = datetime.now(timezone.utc)
        to_remove: list[str] = []

        with self._lock:
            for job_id, job in self._jobs.items():
                age_hours = (now - job.created_at).total_seconds() / 3600
                if age_hours > JOB_RETENTION_HOURS:
                    to_remove.append(job_id)

            for job_id in to_remove:
                del self._jobs[job_id]
                job_dir = JOBS_DIR / job_id
                if job_dir.exists():
                    shutil.rmtree(job_dir, ignore_errors=True)

        return len(to_remove)


# Module-level singleton
job_manager = JobManager()

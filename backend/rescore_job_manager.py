"""Rescore job manager — async job queue for the 6-step rescore pipeline."""

from __future__ import annotations

import shutil
import threading
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Any, Callable, Optional

from config import JOBS_DIR, JOB_RETENTION_HOURS


class RescoreJobStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


@dataclass
class RescoreJobInfo:
    job_id: str
    job_dir: str
    status: RescoreJobStatus = RescoreJobStatus.PENDING
    current_step: int = 0
    total_steps: int = 6
    step_message: str = ""
    msms_total: int = 0
    msms_filtered: int = 0
    accepted_psms: int = 0
    accepted_peptides: int = 0
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    error: Optional[str] = None
    result_files: list[str] = field(default_factory=list)

    @property
    def elapsed_seconds(self) -> float:
        if self.started_at is None:
            return 0.0
        end = self.finished_at or datetime.now(timezone.utc)
        return (end - self.started_at).total_seconds()


class RescoreJobManager:
    """Thread-safe manager for rescore jobs. Limits concurrency to 1."""

    def __init__(self) -> None:
        self._jobs: dict[str, RescoreJobInfo] = {}
        self._lock = threading.Lock()
        self._running = False

    def submit(
        self,
        session_id: str,
        file_params: list[dict],
        advanced_params: dict,
        pipeline_fn: Callable,
    ) -> RescoreJobInfo:
        """Create a rescore job and start it in a background thread.

        Args:
            session_id: Upload session ID (directory under JOBS_DIR).
            file_params: Per-file parameters from the Table Form.
            advanced_params: Global advanced parameters (rng, folds, etc.).
            pipeline_fn: Callable that runs the pipeline.
        """
        job_id = f"rsc_{uuid.uuid4().hex[:8]}"
        src_dir = JOBS_DIR / session_id
        job_dir = JOBS_DIR / job_id

        # Rename upload session directory to job directory
        if src_dir.exists():
            src_dir.rename(job_dir)
        else:
            job_dir.mkdir(parents=True, exist_ok=True)

        job = RescoreJobInfo(job_id=job_id, job_dir=str(job_dir))

        with self._lock:
            self._jobs[job_id] = job

        thread = threading.Thread(
            target=self._run_job,
            args=(job, file_params, advanced_params, pipeline_fn),
            daemon=True,
        )
        thread.start()
        return job

    def get_status(self, job_id: str) -> Optional[RescoreJobInfo]:
        with self._lock:
            return self._jobs.get(job_id)

    def _run_job(
        self,
        job: RescoreJobInfo,
        file_params: list[dict],
        advanced_params: dict,
        pipeline_fn: Callable,
    ) -> None:
        with self._lock:
            job.status = RescoreJobStatus.RUNNING
            job.started_at = datetime.now(timezone.utc)
            self._running = True

        def progress_callback(step: int, total: int, msg: str, **kwargs: Any) -> None:
            with self._lock:
                job.current_step = step
                job.total_steps = total
                job.step_message = msg
                for k, v in kwargs.items():
                    if hasattr(job, k):
                        setattr(job, k, v)

        try:
            result = pipeline_fn(
                job_dir=job.job_dir,
                file_params=file_params,
                progress_callback=progress_callback,
                **advanced_params,
            )

            with self._lock:
                job.status = RescoreJobStatus.COMPLETED
                job.current_step = job.total_steps
                job.step_message = "Done"
                job.finished_at = datetime.now(timezone.utc)
                job.msms_total = result.get("msms_total", job.msms_total)
                job.msms_filtered = result.get("msms_filtered", job.msms_filtered)
                job.accepted_psms = result.get("accepted_psms", 0)
                job.accepted_peptides = result.get("accepted_peptides", 0)
                job.result_files = result.get("result_files", [])

        except Exception as e:
            with self._lock:
                job.status = RescoreJobStatus.FAILED
                job.error = str(e)
                job.finished_at = datetime.now(timezone.utc)
        finally:
            with self._lock:
                self._running = False

    def cleanup_old_jobs(self) -> int:
        """Remove jobs older than JOB_RETENTION_HOURS."""
        now = datetime.now(timezone.utc)
        to_remove: list[str] = []

        with self._lock:
            for job_id, job in self._jobs.items():
                age_hours = (now - job.created_at).total_seconds() / 3600
                if age_hours > JOB_RETENTION_HOURS:
                    to_remove.append(job_id)

            for job_id in to_remove:
                job = self._jobs.pop(job_id)
                job_dir = Path(job.job_dir)
                if job_dir.exists():
                    shutil.rmtree(job_dir, ignore_errors=True)

        return len(to_remove)


# Module-level singleton
rescore_job_manager = RescoreJobManager()

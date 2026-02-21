"""Pydantic request / response models for the MS2Int web API."""

from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator

from config import (
    MAX_PEPTIDE_LENGTH,
    VALID_CHARGES,
    VALID_COLLISION_ENERGIES,
    VALID_FRAGMENTATIONS,
)


# ── Single mode ────────────────────────────────────────────────────────────

class PredictRequest(BaseModel):
    sequence: str = Field(..., min_length=1, description="Peptide sequence (MS2Int notation)")
    charge: int = Field(..., ge=1, le=6, description="Precursor charge state")
    collision_energy: int = Field(..., description="Collision energy")
    fragmentation: str = Field(..., description="Fragmentation method: HCD or CID")

    @field_validator("collision_energy")
    @classmethod
    def validate_ce(cls, v: int) -> int:
        if v not in VALID_COLLISION_ENERGIES:
            raise ValueError(
                f"collision_energy must be one of {VALID_COLLISION_ENERGIES}, got {v}"
            )
        return v

    @field_validator("fragmentation")
    @classmethod
    def validate_frag(cls, v: str) -> str:
        v = v.upper()
        if v not in VALID_FRAGMENTATIONS:
            raise ValueError(
                f"fragmentation must be one of {VALID_FRAGMENTATIONS}, got {v}"
            )
        return v


class IonItem(BaseModel):
    label: str
    mz: float
    intensity: float
    type: str


class PredictResponse(BaseModel):
    sequence: str
    charge: int
    collision_energy: int
    fragmentation: str
    length: int
    spectrum_png: str = Field(..., description="Base64-encoded PNG image")
    ions: list[IonItem]


# ── Batch mode ─────────────────────────────────────────────────────────────

class JobSubmitResponse(BaseModel):
    job_id: str
    filename: str
    total_samples: int
    estimated_seconds: float
    status: str
    created_at: datetime


class JobStatusResponse(BaseModel):
    job_id: str
    status: Literal["pending", "running", "completed", "failed"]
    progress: float = Field(0.0, ge=0.0, le=1.0)
    processed: int = 0
    total: int = 0
    elapsed_seconds: float = 0.0
    estimated_remaining_seconds: float = 0.0
    error: Optional[str] = None
    filename: str = ""
    created_at: Optional[datetime] = None


class JobListItem(BaseModel):
    job_id: str
    filename: str
    total_samples: int
    status: str
    created_at: datetime


# ── Health ─────────────────────────────────────────────────────────────────

class HealthResponse(BaseModel):
    status: str
    model_loaded: bool
    device: str


class SupportedModificationsResponse(BaseModel):
    modifications: list[str]


# ── Rescore mode ──────────────────────────────────────────────────────────

class UploadedFileInfo(BaseModel):
    filename: str
    size_bytes: int
    type: str  # "msms" | "mgf"


class MsmsFileInfo(BaseModel):
    filename: str
    total_rows: int
    raw_files: list[str]


class RawFileInfo(BaseModel):
    raw_file: str
    mgf_file: str
    msms_file: str
    psm_count: int


class RescoreUploadResponse(BaseModel):
    session_id: str
    uploaded_files: list[UploadedFileInfo]
    msms_files: list[MsmsFileInfo]
    raw_files: list[RawFileInfo]
    unmatched_mgf_files: list[str] = []
    errors: list[str] = []


class FileParam(BaseModel):
    raw_file: str
    search_result: str
    fragmentation: str = "HCD"
    collision_energy: int = 30

    @field_validator("fragmentation")
    @classmethod
    def validate_frag(cls, v: str) -> str:
        v = v.upper()
        if v not in VALID_FRAGMENTATIONS:
            raise ValueError(
                f"fragmentation must be one of {VALID_FRAGMENTATIONS}, got {v}"
            )
        return v


class RescoreSubmitRequest(BaseModel):
    session_id: str
    file_params: list[FileParam]
    rng: int = 42
    folds: int = 2
    max_workers: int = 2
    train_fdr: float = 0.01
    test_fdr: float = 0.01
    add_basic: bool = True
    add_maxquant: bool = True


class RescoreSubmitResponse(BaseModel):
    job_id: str
    status: str
    total_steps: int
    created_at: datetime


class RescoreStatusResponse(BaseModel):
    job_id: str
    status: Literal["pending", "running", "completed", "failed"]
    current_step: int = 0
    total_steps: int = 6
    step_message: str = ""
    msms_total: int = 0
    msms_filtered: int = 0
    accepted_psms: int = 0
    accepted_peptides: int = 0
    elapsed_seconds: float = 0.0
    error: Optional[str] = None
    result_files: list[str] = []

"""MS2Int Web Server — FastAPI application."""

from __future__ import annotations

import asyncio
import base64
import io
import re
from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncGenerator

import pandas as pd
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from config import DEVICE, VALID_COLLISION_ENERGIES, VALID_FRAGMENTATIONS, VALID_CHARGES
from ion_labels import intensity_matrix_to_ion_list, tokenize_peptide, AA_MASS
from job_manager import JobStatus, job_manager
from predictor import load_model, predict_single, predict_batch_from_arrays
from schemas import (
    HealthResponse,
    IonItem,
    JobListItem,
    JobStatusResponse,
    JobSubmitResponse,
    PredictRequest,
    PredictResponse,
    SupportedModificationsResponse,
)
from spectrum_render import render_spectrum_png


# ── FASTA utilities ───────────────────────────────────────────────────────

def _parse_fasta(content: str) -> list[str]:
    """Return flat list of protein sequences from FASTA text."""
    sequences: list[str] = []
    current: list[str] = []
    for line in content.splitlines():
        line = line.strip()
        if line.startswith(">"):
            if current:
                sequences.append("".join(current))
                current = []
        elif line:
            current.append(line.upper())
    if current:
        sequences.append("".join(current))
    return sequences


def _digest_trypsin(sequence: str, missed_cleavages: int) -> list[str]:
    """Tryptic digest: cleave after K/R not followed by P."""
    parts = [p for p in re.split(r"(?<=[KR])(?!P)", sequence) if p]
    peptides: list[str] = []
    n = len(parts)
    for i in range(n):
        for j in range(1, missed_cleavages + 2):
            if i + j <= n:
                peptides.append("".join(parts[i : i + j]))
    return peptides


# ── Lifespan ───────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Load model on startup, cleanup on shutdown."""
    load_model()
    yield
    # Cleanup old jobs on shutdown
    job_manager.cleanup_old_jobs()


app = FastAPI(
    title="MS2Int Spectrum Prediction",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Health ─────────────────────────────────────────────────────────────────

@app.get("/api/health", response_model=HealthResponse)
async def health():
    from predictor import _model
    return HealthResponse(
        status="ok" if _model is not None else "model_not_loaded",
        model_loaded=_model is not None,
        device=DEVICE,
    )


# ── Supported modifications ───────────────────────────────────────────────

@app.get("/api/supported-modifications", response_model=SupportedModificationsResponse)
async def supported_modifications():
    from predictor import AA_VOCAB
    mods = sorted(set(
        k for k in AA_VOCAB
        if "[" in k and not k.startswith("[") and not k.startswith("-")
    ))
    return SupportedModificationsResponse(modifications=mods)


# ── Single prediction (sync) ──────────────────────────────────────────────

@app.post("/api/predict", response_model=PredictResponse)
async def predict(req: PredictRequest):
    # Validate sequence length
    try:
        tokens = tokenize_peptide(req.sequence)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid sequence: {e}")

    aa_count = len([
        t for t in tokens
        if not (t.startswith("[") and t.endswith("]-")) and t != "-[]"
    ])
    if aa_count > 30:
        raise HTTPException(
            status_code=400,
            detail=f"Peptide too long: {aa_count} residues (max 30)",
        )
    if aa_count == 0:
        raise HTTPException(status_code=400, detail="Empty peptide sequence")

    # Check for unsupported residues
    if "U" in req.sequence:
        raise HTTPException(status_code=400, detail="Selenocysteine (U) is not supported")

    # Run prediction in thread pool to avoid blocking
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        None,
        predict_single,
        req.sequence,
        req.charge,
        req.collision_energy,
        req.fragmentation,
    )

    intensity_matrix = result["intensity_matrix"]
    length = result["length"]

    # Generate spectrum image
    png_bytes = await loop.run_in_executor(
        None,
        render_spectrum_png,
        req.sequence,
        req.charge,
        intensity_matrix,
    )
    spectrum_png_b64 = base64.b64encode(png_bytes).decode("ascii")

    # Build ion list
    ions = intensity_matrix_to_ion_list(intensity_matrix, req.sequence, req.charge)

    return PredictResponse(
        sequence=req.sequence,
        charge=req.charge,
        collision_energy=req.collision_energy,
        fragmentation=req.fragmentation,
        length=length,
        spectrum_png=spectrum_png_b64,
        ions=[IonItem(**ion) for ion in ions],
    )


# ── Batch job submission (async) ──────────────────────────────────────────

@app.post("/api/jobs/submit", response_model=JobSubmitResponse)
async def submit_job(file: UploadFile = File(...)):
    if file.filename is None:
        raise HTTPException(status_code=400, detail="No filename provided")

    ext = Path(file.filename).suffix.lower()
    if ext not in (".csv", ".tsv"):
        raise HTTPException(status_code=400, detail="Only CSV/TSV files are supported")

    content = await file.read()
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Empty file")

    try:
        job = job_manager.submit(
            csv_bytes=content,
            filename=file.filename,
            predict_fn=predict_batch_from_arrays,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return JobSubmitResponse(
        job_id=job.job_id,
        filename=job.filename,
        total_samples=job.total_samples,
        estimated_seconds=job.estimated_seconds,
        status=job.status.value,
        created_at=job.created_at,
    )


# ── FASTA job submission ─────────────────────────────────────────────────

@app.post("/api/jobs/submit-fasta", response_model=JobSubmitResponse)
async def submit_fasta_job(
    file: UploadFile = File(...),
    charges: str = Form("2"),
    collision_energy: int = Form(30),
    fragmentation: str = Form("HCD"),
    missed_cleavages: int = Form(1),
    min_length: int = Form(6),
    max_length: int = Form(30),
):
    if file.filename is None:
        raise HTTPException(status_code=400, detail="No filename provided")

    ext = Path(file.filename).suffix.lower()
    if ext not in (".fasta", ".fa", ".faa", ".txt"):
        raise HTTPException(status_code=400, detail="Only FASTA files (.fasta/.fa/.faa/.txt) are supported")

    content_bytes = await file.read()
    if len(content_bytes) == 0:
        raise HTTPException(status_code=400, detail="Empty file")

    try:
        content_str = content_bytes.decode("utf-8")
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="File is not valid UTF-8 text")

    # Parse charges list
    try:
        charge_list = [int(c.strip()) for c in charges.split(",") if c.strip()]
        if not charge_list:
            raise ValueError
    except ValueError:
        raise HTTPException(status_code=400, detail="charges must be comma-separated integers e.g. '1,2,3'")

    if missed_cleavages < 0 or missed_cleavages > 3:
        raise HTTPException(status_code=400, detail="missed_cleavages must be 0-3")
    if collision_energy not in VALID_COLLISION_ENERGIES:
        raise HTTPException(status_code=400, detail=f"collision_energy must be one of {VALID_COLLISION_ENERGIES}")
    fragmentation = fragmentation.upper()
    if fragmentation not in VALID_FRAGMENTATIONS:
        raise HTTPException(status_code=400, detail=f"fragmentation must be one of {VALID_FRAGMENTATIONS}")

    # Digest all proteins
    proteins = _parse_fasta(content_str)
    if not proteins:
        raise HTTPException(status_code=400, detail="No protein sequences found in FASTA file")

    seen: set[str] = set()
    rows: list[dict] = []
    for protein_seq in proteins:
        peptides = _digest_trypsin(protein_seq, missed_cleavages)
        for pep in peptides:
            # Filter by length and skip non-standard residues
            pep_len = len(pep)
            if pep_len < min_length or pep_len > max_length:
                continue
            if "B" in pep or "X" in pep or "Z" in pep or "U" in pep:
                continue
            if pep in seen:
                continue
            seen.add(pep)
            for chg in charge_list:
                rows.append({
                    "Sequence": pep,
                    "Charge": chg,
                    "collision_energy": collision_energy,
                    "Fragmentation": fragmentation,
                })

    if not rows:
        raise HTTPException(
            status_code=400,
            detail=f"No peptides in length range [{min_length}-{max_length}] after digestion"
        )

    df = pd.DataFrame(rows)
    csv_bytes = df.to_csv(index=False).encode("utf-8")
    filename_csv = Path(file.filename).stem + "_tryptic.csv"

    try:
        job = job_manager.submit(
            csv_bytes=csv_bytes,
            filename=filename_csv,
            predict_fn=predict_batch_from_arrays,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return JobSubmitResponse(
        job_id=job.job_id,
        filename=job.filename,
        total_samples=job.total_samples,
        estimated_seconds=job.estimated_seconds,
        status=job.status.value,
        created_at=job.created_at,
    )


# ── Job status ─────────────────────────────────────────────────────────────

@app.get("/api/jobs/{job_id}", response_model=JobStatusResponse)
async def get_job_status(job_id: str):
    job = job_manager.get_status(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")

    return JobStatusResponse(
        job_id=job.job_id,
        status=job.status.value,
        progress=job.progress,
        processed=job.processed,
        total=job.total_samples,
        elapsed_seconds=round(job.elapsed_seconds, 2),
        estimated_remaining_seconds=round(job.estimated_remaining_seconds, 2),
        error=job.error,
        filename=job.filename,
        created_at=job.created_at,
    )


# ── Job result download ───────────────────────────────────────────────────

@app.get("/api/jobs/{job_id}/download")
async def download_job_result(job_id: str):
    result_path = job_manager.get_result_path(job_id)
    if result_path is None:
        job = job_manager.get_status(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
        if job.status == JobStatus.FAILED:
            raise HTTPException(status_code=500, detail=f"Job failed: {job.error}")
        raise HTTPException(
            status_code=409,
            detail=f"Job not yet completed (status: {job.status.value})",
        )

    return FileResponse(
        path=str(result_path),
        media_type="application/x-hdf5",
        filename=f"ms2int_result_{job_id}.h5",
    )


# ── Job list ───────────────────────────────────────────────────────────────

@app.get("/api/jobs", response_model=list[JobListItem])
async def list_jobs():
    jobs = job_manager.list_jobs()
    return [
        JobListItem(
            job_id=j.job_id,
            filename=j.filename,
            total_samples=j.total_samples,
            status=j.status.value,
            created_at=j.created_at,
        )
        for j in sorted(jobs, key=lambda x: x.created_at, reverse=True)
    ]

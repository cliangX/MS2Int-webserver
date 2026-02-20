"""MS2Int Web Server — configuration."""

from __future__ import annotations

import os
from pathlib import Path

# ── Paths ──────────────────────────────────────────────────────────────────
_WEBSERVER_ROOT = Path(__file__).resolve().parent.parent  # MS2Int-webserver/
MS2INT_REPO = _WEBSERVER_ROOT.parent / "MS2Int"           # 5.tools/MS2Int/
MS2INT_DIR = MS2INT_REPO / "MS2Int"                       # 5.tools/MS2Int/MS2Int/ (Python package)

CHECKPOINT_PATH = os.environ.get(
    "MS2INT_CHECKPOINT",
    str(MS2INT_REPO / "checkpoints" / "model_epoch_99_val_loss_0.1618_0129_135924.pth"),
)

JOBS_DIR = Path(__file__).resolve().parent / "jobs"
JOBS_DIR.mkdir(parents=True, exist_ok=True)

# ── GPU ────────────────────────────────────────────────────────────────────
GPU_ID = os.environ.get("MS2INT_GPU", "0")
DEVICE = f"cuda:{GPU_ID}"

# ── Model ──────────────────────────────────────────────────────────────────
BATCH_SIZE = 1024
NUM_WORKERS = 4

# ── Job Queue ──────────────────────────────────────────────────────────────
JOB_RETENTION_HOURS = 24
ESTIMATE_SEC_PER_SAMPLE = 0.005  # ~200 samples/sec on GPU

# ── Inference constraints ──────────────────────────────────────────────────
MAX_PEPTIDE_LENGTH = 30
VALID_CHARGES = list(range(1, 7))
VALID_COLLISION_ENERGIES = [10, 20, 23, 25, 26, 27, 28, 29, 30, 35, 40, 42]
VALID_FRAGMENTATIONS = ["HCD", "CID"]

"""MS2Int model loading and inference wrapper.

Encapsulates the prediction pipeline so the web server can call
``predict_single()`` or ``predict_batch()`` without touching H5 files.
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

import numpy as np
import torch

from config import (
    CHECKPOINT_PATH,
    DEVICE,
    MS2INT_DIR,
    MAX_PEPTIDE_LENGTH,
    VALID_CHARGES,
    VALID_COLLISION_ENERGIES,
    VALID_FRAGMENTATIONS,
)

# ── Make MS2Int package importable ─────────────────────────────────────────
_ms2int_str = str(MS2INT_DIR)
if _ms2int_str not in sys.path:
    sys.path.insert(0, _ms2int_str)

from mamba_ssm.models.config_mamba import MambaConfig  # type: ignore
from model import MambaLMHeadModel  # type: ignore
from utils import load_checkpoint, create_batch_loss_masks  # type: ignore
from preprocess import tokenize_peptide  # type: ignore

# ── Encoding tables (directly from preprocess.py to guarantee order) ────────
# CRITICAL: dict insertion order determines enumerate() indices.
# This MUST be an exact copy of the AA dict in preprocess.py.
_AA_ORDERED: dict[str, int] = {
    "A": 1, "C": 2, "D": 3, "E": 4, "F": 5, "G": 6, "H": 7, "I": 8,
    "K": 9, "L": 10, "M": 11, "N": 12, "P": 13, "Q": 14, "R": 15,
    "S": 16, "T": 17, "V": 18, "W": 19, "Y": 20,
    "[]-": 21, "-[]": 22,
    "[Acetyl]-": 38,
    "M[Oxidation]": 23, "S[Phospho]": 24, "T[Phospho]": 25,
    "Y[Phospho]": 26,
    "K[Dimethyl]": 40, "K[Trimethyl]": 41, "K[Formyl]": 42,
    "K[Propionyl]": 43, "K[Succinyl]": 46, "K[Biotin]": 50,
    "K[UNIMOD:737]": 55,
    "R[Dimethyl]": 51, "R[UNIMOD:36a]": 52,
    "P[Oxidation]": 53, "Y[Nitro]": 54,
    "K[Methyl]": 32, "T[HexNAc]": 35, "S[HexNAc]": 36,
    "C[Carbamidomethyl]": 37, "E[Glu->pyro-Glu]": 39,
    "R[Phospho]": 27, "K[Acetyl]": 28, "K[GG]": 29,
    "Q[Gln->pyro-Glu]": 30, "R[Methyl]": 31,
    "[UNIMOD:737]-": 56,
    "K[UNIMOD:1848]": 47, "K[UNIMOD:1363]": 48,
    "K[UNIMOD:1849]": 49, "K[UNIMOD:1289]": 44,
    "K[UNIMOD:747]": 45,
}

AA_VOCAB = _AA_ORDERED  # public alias
AA_TO_IDX: dict[str, int] = {key: idx + 1 for idx, key in enumerate(_AA_ORDERED)}

INSTRUMENT_TO_IDX: dict[str, int] = {inst: idx for idx, inst in enumerate(VALID_FRAGMENTATIONS)}
CHARGE_TO_IDX: dict[int, int] = {c: idx for idx, c in enumerate(VALID_CHARGES)}
CE_TO_IDX: dict[int, int] = {ce: idx for idx, ce in enumerate(VALID_COLLISION_ENERGIES)}


# ── Model singleton ────────────────────────────────────────────────────────

_model: MambaLMHeadModel | None = None
_device: str = DEVICE


def load_model() -> MambaLMHeadModel:
    """Load model from checkpoint and move to GPU. Call once at startup."""
    global _model
    if _model is not None:
        return _model

    mamba_config = MambaConfig(
        d_model=512,
        d_intermediate=0,
        n_layer=4,
        ssm_cfg={"layer": "Mamba2"},
        attn_layer_idx=[],
        attn_cfg={},
        rms_norm=True,
        residual_in_fp32=True,
        fused_add_norm=True,
        tie_embeddings=True,
    )
    model = MambaLMHeadModel(mamba_config)
    epoch, val_loss = load_checkpoint(CHECKPOINT_PATH, model)
    model = model.to(_device)
    model.eval()
    _model = model
    print(f"[predictor] Model loaded on {_device} (epoch={epoch}, val_loss={val_loss:.4f})")
    return _model


def _encode_peptide(sequence: str) -> list[int]:
    """Tokenize and encode a peptide sequence to index list."""
    tokens = tokenize_peptide(sequence)
    encoded = [AA_TO_IDX.get(tok, 0) for tok in tokens]
    # Pad or truncate to MAX_PEPTIDE_LENGTH
    if len(encoded) < MAX_PEPTIDE_LENGTH:
        encoded = encoded + [0] * (MAX_PEPTIDE_LENGTH - len(encoded))
    else:
        encoded = encoded[:MAX_PEPTIDE_LENGTH]
    return encoded


def _peptide_length(sequence: str) -> int:
    """Return the number of amino-acid residues (tokens) in a sequence."""
    tokens = tokenize_peptide(sequence)
    # Exclude N/C-term modification tokens from length count
    length = 0
    for tok in tokens:
        if tok.startswith("[") and tok.endswith("]-"):
            continue  # N-term mod
        if tok == "-[]":
            continue  # C-term mod
        length += 1
    return length


def predict_single(
    sequence: str,
    charge: int,
    collision_energy: int,
    fragmentation: str,
) -> dict[str, Any]:
    """Run inference for a single peptide.

    Returns {"intensity_matrix": np.ndarray (29, 31), "length": int}.
    """
    model = load_model()
    length = _peptide_length(sequence)

    seq_idx = _encode_peptide(sequence)
    inst_idx = INSTRUMENT_TO_IDX.get(fragmentation, 0)
    charge_idx = CHARGE_TO_IDX.get(charge, 0)
    ce_idx = CE_TO_IDX.get(collision_energy, 0)

    seq_t = torch.tensor([seq_idx], dtype=torch.long, device=_device)
    inst_t = torch.tensor([inst_idx], dtype=torch.long, device=_device)
    charge_t = torch.tensor([charge_idx], dtype=torch.long, device=_device)
    ce_t = torch.tensor([ce_idx], dtype=torch.long, device=_device)

    with torch.inference_mode():
        output = model(inst_t, charge_t, ce_t, seq_t)  # (1, 29, 31)
        mask = create_batch_loss_masks([length]).to(_device)
        output[output < 0] = 0
        output = output * mask

    intensity_matrix = output[0].cpu().numpy()  # (29, 31)
    return {"intensity_matrix": intensity_matrix, "length": length}


def predict_batch_from_arrays(
    sequences: list[str],
    charges: list[int],
    collision_energies: list[int],
    fragmentations: list[str],
    progress_callback: Any | None = None,
) -> np.ndarray:
    """Run inference on a batch of peptides.

    Returns ndarray of shape (N, 29, 31).
    ``progress_callback(processed, total)`` is called after each mini-batch.
    """
    model = load_model()
    n = len(sequences)

    lengths = [_peptide_length(s) for s in sequences]
    seq_indices = [_encode_peptide(s) for s in sequences]
    inst_indices = [INSTRUMENT_TO_IDX.get(f, 0) for f in fragmentations]
    charge_indices = [CHARGE_TO_IDX.get(c, 0) for c in charges]
    ce_indices = [CE_TO_IDX.get(ce, 0) for ce in collision_energies]

    all_outputs: list[torch.Tensor] = []
    batch_size = 1024
    processed = 0

    with torch.inference_mode():
        for start in range(0, n, batch_size):
            end = min(start + batch_size, n)
            bs = end - start

            seq_t = torch.tensor(seq_indices[start:end], dtype=torch.long, device=_device)
            inst_t = torch.tensor(inst_indices[start:end], dtype=torch.long, device=_device)
            charge_t = torch.tensor(charge_indices[start:end], dtype=torch.long, device=_device)
            ce_t = torch.tensor(ce_indices[start:end], dtype=torch.long, device=_device)

            output = model(inst_t, charge_t, ce_t, seq_t)  # (bs, 29, 31)
            mask = create_batch_loss_masks(lengths[start:end]).to(_device)
            output[output < 0] = 0
            output = output * mask
            all_outputs.append(output.cpu())

            processed = end
            if progress_callback is not None:
                progress_callback(processed, n)

    return torch.cat(all_outputs, dim=0).numpy()  # (N, 29, 31)

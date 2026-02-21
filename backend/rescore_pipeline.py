"""Rescore pipeline — 6-step workflow adapted for MGF input.

Wraps the CLI rescore scripts into callable Python functions.
Step 3 uses mgf_parser instead of pyopenms for mzML reading.
Step 4 reuses the webserver's already-loaded GPU model.
Steps 5-6 call the reference scripts via subprocess.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any, Callable, Optional

import h5py
import numpy as np
import pandas as pd

from config import MS2INT_REPO, CHECKPOINT_PATH
from mgf_parser import parse_mgf

# Reference code paths
_RESCORE_DIR = MS2INT_REPO / "spectrum_processing" / "rescore"
_UNMOD_DIR = MS2INT_REPO / "spectrum_processing" / "unmodficaiton"

# ── Ion annotation matrix (same as step3_generate_train_data.py) ──────────
ION_ROWS = 31
ION_COLS = 29


def _build_annotation():
    mat = np.full((ION_ROWS, ION_COLS), "", dtype=object)
    for i in range(ION_COLS):
        mat[0, i] = f"b{i+1}"
    for i in range(ION_COLS):
        mat[1, i] = f"b{i+1}^2"
    for i in range(ION_COLS):
        mat[2, i] = f"y{i+1}"
    for i in range(ION_COLS):
        mat[3, i] = f"y{i+1}^2"
    for row in range(4, ION_ROWS):
        for col in range(ION_COLS):
            m_start = col + 2
            m_end = m_start + (row - 2)
            if m_end <= ION_COLS:
                mat[row, col] = f"m{m_start}:{m_end}"
    mat[0, 28] = "IH"
    mat[1, 28] = "IR"
    mat[2, 28] = "IF"
    mat[3, 28] = "IY"
    ion_order = mat.ravel().tolist()
    index = {name: i for i, name in enumerate(ion_order) if name}
    return mat, ion_order, index


_, _, ION_TO_IDX = _build_annotation()


def run_rescore_pipeline(
    job_dir: str,
    file_params: list[dict],
    progress_callback: Optional[Callable] = None,
    rng: int = 42,
    folds: int = 2,
    max_workers: int = 2,
    train_fdr: float = 0.01,
    test_fdr: float = 0.01,
    add_basic: bool = True,
    add_maxquant: bool = True,
) -> dict:
    """Run the 6-step rescore pipeline.

    Args:
        job_dir: Path to job directory containing uploads/.
        file_params: List of dicts with keys: raw_file, search_result,
                     fragmentation, collision_energy.
        progress_callback: fn(step, total, msg, **kwargs) for status updates.
    """
    cb = progress_callback or (lambda *a, **kw: None)
    uploads = Path(job_dir) / "uploads"
    rescore = Path(job_dir) / "rescore"
    rescore.mkdir(parents=True, exist_ok=True)

    # Build param lookup: raw_file -> {search_result, fragmentation, ce}
    param_map = {fp["raw_file"]: fp for fp in file_params}

    # ── Step 1: Filter msms.txt ───────────────────────────────────────────
    cb(1, 6, "Filtering msms.txt ...")
    filtered_path, msms_total, msms_filtered = _step01_filter(
        uploads, rescore, param_map
    )
    cb(1, 6, f"Filtered {msms_total} → {msms_filtered} PSMs",
       msms_total=msms_total, msms_filtered=msms_filtered)

    # ── Step 2: Generate SpecId ───────────────────────────────────────────
    cb(2, 6, "Generating SpecId ...")
    specid_path = _step02_specid(filtered_path, rescore)
    cb(2, 6, f"{msms_filtered} SpecIds created")

    # ── Step 3: Parse MGF → match with msms → build H5 ───────────────────
    cb(3, 6, "Parsing MGF files & building H5 ...")
    h5_path = _step03_mgf_to_h5(filtered_path, uploads, rescore, param_map)
    cb(3, 6, "H5 built with train_data")

    # ── Step 4: MS2Int prediction (GPU) ───────────────────────────────────
    cb(4, 6, "Running MS2Int prediction (GPU) ...")
    _step04_predict(h5_path)
    cb(4, 6, "Intpredict added to H5")

    # ── Step 5: Compute MS2PIP features ───────────────────────────────────
    cb(5, 6, "Computing MS2PIP similarity features ...")
    features_path = _step05_features(h5_path, specid_path, max_workers)
    cb(5, 6, "MS2PIP features computed")

    # ── Step 6: Mokapot rescoring ─────────────────────────────────────────
    cb(6, 6, "Running Mokapot rescoring ...")
    result = _step06_mokapot(
        filtered_path, features_path, rescore,
        rng=rng, folds=folds, max_workers=max_workers,
        train_fdr=train_fdr, test_fdr=test_fdr,
        add_basic=add_basic, add_maxquant=add_maxquant,
    )

    result["msms_total"] = msms_total
    result["msms_filtered"] = msms_filtered
    return result


# ═══════════════════════════════════════════════════════════════════════════
# Step implementations
# ═══════════════════════════════════════════════════════════════════════════


def _step01_filter(
    uploads: Path, rescore: Path, param_map: dict
) -> tuple[Path, int, int]:
    """Filter msms.txt: keep Unmodified, Length<=30, no U."""
    # Collect all unique msms files referenced in param_map
    msms_files = set(fp["search_result"] for fp in param_map.values())
    dfs = []
    for msms_file in msms_files:
        msms_path = uploads / msms_file
        if msms_path.exists():
            df = pd.read_csv(msms_path, sep="\t", low_memory=False)
            dfs.append(df)

    if not dfs:
        raise FileNotFoundError("No msms.txt files found in uploads")

    combined = pd.concat(dfs, ignore_index=True)
    msms_total = len(combined)

    # Filter: Unmodified only
    required = ["Modifications", "Length", "Sequence"]
    for col in required:
        if col not in combined.columns:
            raise ValueError(f"Missing required column: {col}")

    mods = combined["Modifications"].astype(str).str.strip().str.lower()
    is_unmod = mods.eq("unmodified")

    length_num = pd.to_numeric(combined["Length"], errors="coerce")
    is_len_ok = length_num.le(30)

    seq_str = combined["Sequence"].astype(str)
    is_seq_ok = ~seq_str.str.contains("U", regex=False)

    mask = is_unmod & is_len_ok & is_seq_ok
    filtered = combined.loc[mask].copy()
    msms_filtered = len(filtered)

    out_path = rescore / "msms_filtered.txt"
    filtered.to_csv(out_path, sep="\t", index=False)
    return out_path, msms_total, msms_filtered


def _step02_specid(filtered_path: Path, rescore: Path) -> Path:
    """Generate SpecId TSV from filtered msms.txt."""
    df = pd.read_csv(filtered_path, sep="\t")

    required_cols = ["Raw file", "Scan number", "Sequence", "Charge"]
    for col in required_cols:
        if col not in df.columns:
            raise ValueError(f"Missing required column: {col}")

    df["Sequence_unimod"] = df["Sequence"].astype(str).str.replace(
        "C", "C[UNIMOD:4]", regex=False
    )
    df["SpecId"] = (
        df["Raw file"].astype(str)
        + "-" + df["Scan number"].astype(str)
        + "-" + df["Sequence_unimod"].astype(str)
        + "-" + df["Charge"].astype(str)
    )

    out_path = rescore / "msms_specid.tsv"
    df[["SpecId"]].to_csv(out_path, sep="\t", index=False)
    return out_path


def _step03_mgf_to_h5(
    filtered_path: Path,
    uploads: Path,
    rescore: Path,
    param_map: dict,
) -> Path:
    """Parse MGF files, match with msms.txt, build H5 with train_data.

    This replaces the mzML-based step2_process_df_h5 + step3_generate_train_data.
    """
    # Add reference code to path for theoretical fragment generation
    sys.path.insert(0, str(_UNMOD_DIR))
    from step2_process_df_h5 import (
        apply_modifications,
        parallel_process_with_cache,
        fast_intensity_matching,
    )

    df = pd.read_csv(filtered_path, sep="\t", low_memory=False)

    # Prepare annotate column
    if "Modified sequence" in df.columns:
        df["annotate"] = df["Modified sequence"].apply(apply_modifications)
    else:
        df["annotate"] = df["Sequence"].apply(
            lambda s: apply_modifications(f"_{s}_")
        )

    # Generate theoretical fragments
    theoretical = parallel_process_with_cache(
        df["annotate"].values.tolist(),
        num_processes=4,
        batch_size=500,
        prefer_threads=True,
        verbose=False,
        mode="unmodified",
    )
    df["theoretical_fragments"] = theoretical

    # Parse all MGF files and build scan lookup
    # mgf_scans: {raw_file: {scan_number: (mz_array, int_array)}}
    mgf_scans: dict[str, dict[int, tuple]] = {}
    for raw_file, params in param_map.items():
        # Find the MGF file for this raw_file
        mgf_candidates = list(uploads.glob(f"{raw_file}.mgf*"))
        if not mgf_candidates:
            continue
        mgf_path = mgf_candidates[0]
        spectra = parse_mgf(str(mgf_path))
        scan_lookup = {}
        for sp in spectra:
            if sp["scan"] is not None:
                scan_lookup[sp["scan"]] = (sp["mz_array"], sp["int_array"])
        mgf_scans[raw_file] = scan_lookup

    # Match experimental spectra and build train_data matrices
    train_data_list = []
    spec_ids = []
    lengths = []
    sequences = []
    charges = []
    collision_energies = []
    fragmentations = []

    for _, row in df.iterrows():
        raw_file = str(row["Raw file"])
        scan_num = int(row["Scan number"])
        length = int(row["Length"])
        charge = int(row["Charge"])
        seq = str(row["Sequence"])
        theory = row["theoretical_fragments"]

        # Get per-file params
        fp = param_map.get(raw_file, {})
        frag_method = fp.get("fragmentation", "HCD")
        ce = fp.get("collision_energy", 30)

        # Mass analyzer: default FTMS for MGF
        mass_analyzer = "FTMS"

        # Look up experimental spectrum
        scan_lookup = mgf_scans.get(raw_file, {})
        if scan_num in scan_lookup:
            mz_arr, int_arr = scan_lookup[scan_num]
        else:
            mz_arr, int_arr = np.array([]), np.array([])

        # Match theoretical fragments to experimental peaks
        matched = fast_intensity_matching(
            theory, mz_arr.tolist(), int_arr.tolist(), mass_analyzer,
            mode="unmodified"
        )

        # Build 31×29 matrix
        mat = np.zeros((ION_ROWS, ION_COLS), dtype=np.float32)
        if matched:
            flat = np.zeros(ION_ROWS * ION_COLS, dtype=np.float32)
            filled = np.zeros(ION_ROWS * ION_COLS, dtype=bool)
            for frag_name, intensity in matched:
                j = ION_TO_IDX.get(frag_name)
                if j is not None and not filled[j]:
                    flat[j] = float(intensity)
                    filled[j] = True
            mat = flat.reshape((ION_ROWS, ION_COLS))

        train_data_list.append(mat)

        # SpecId
        seq_unimod = seq.replace("C", "C[UNIMOD:4]")
        spec_id = f"{raw_file}-{scan_num}-{seq_unimod}-{charge}"
        spec_ids.append(spec_id)
        lengths.append(length)
        sequences.append(seq)
        charges.append(charge)
        collision_energies.append(ce)
        fragmentations.append(frag_method)

    # Write H5
    h5_path = rescore / "rescore.h5"
    train_data_arr = np.stack(train_data_list, axis=0).astype(np.float32)

    with h5py.File(str(h5_path), "w") as f:
        f.create_dataset("train_data", data=train_data_arr)
        f.create_dataset(
            "SpecId",
            data=np.array([s.encode("utf-8") for s in spec_ids], dtype="S256"),
        )
        f.create_dataset("Length", data=np.array(lengths, dtype=np.int32))
        f.create_dataset(
            "Sequence",
            data=np.array([s.encode("utf-8") for s in sequences], dtype="S128"),
        )
        f.create_dataset("Charge", data=np.array(charges, dtype=np.int32))
        f.create_dataset(
            "collision_energy", data=np.array(collision_energies, dtype=np.int32)
        )
        f.create_dataset(
            "Fragmentation",
            data=np.array([s.encode("utf-8") for s in fragmentations], dtype="S10"),
        )

    return h5_path


def _step04_predict(h5_path: Path) -> None:
    """Run MS2Int prediction using the webserver's loaded model."""
    from predictor import predict_batch_from_arrays

    with h5py.File(str(h5_path), "r") as f:
        sequences = [
            s.decode("utf-8") if isinstance(s, bytes) else str(s)
            for s in f["Sequence"][:]
        ]
        charges = f["Charge"][:].tolist()
        ces = f["collision_energy"][:].tolist()
        frags = [
            s.decode("utf-8") if isinstance(s, bytes) else str(s)
            for s in f["Fragmentation"][:]
        ]

    predictions = predict_batch_from_arrays(
        sequences=sequences,
        charges=charges,
        collision_energies=ces,
        fragmentations=frags,
    )

    with h5py.File(str(h5_path), "a") as f:
        if "Intpredict" in f:
            del f["Intpredict"]
        f.create_dataset("Intpredict", data=predictions)


def _step05_features(
    h5_path: Path, specid_path: Path, max_workers: int
) -> Path:
    """Compute MS2PIP features by calling the reference script."""
    output_path = h5_path.parent / "msms_specid_with_MS2PIP_m.tsv"

    cmd = [
        sys.executable,
        str(_RESCORE_DIR / "step03_calc_ms2pip_features_m.py"),
        "--h5_path", str(h5_path),
        "--tsv_path", str(specid_path),
        "--output", str(output_path),
        "--workers", str(max_workers),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", timeout=3600)
    if result.returncode != 0:
        raise RuntimeError(
            f"step03 feature calc failed: {result.stderr[-500:]}"
        )

    if not output_path.exists():
        raise FileNotFoundError(f"Feature output not found: {output_path}")

    return output_path


def _step06_mokapot(
    filtered_path: Path,
    features_path: Path,
    rescore: Path,
    rng: int = 42,
    folds: int = 2,
    max_workers: int = 2,
    train_fdr: float = 0.01,
    test_fdr: float = 0.01,
    add_basic: bool = True,
    add_maxquant: bool = True,
) -> dict:
    """Run mokapot rescoring by calling the reference script."""
    mokapot_dir = rescore / "mokapot"
    mokapot_dir.mkdir(parents=True, exist_ok=True)

    cmd = [
        sys.executable,
        str(_RESCORE_DIR / "step04_rescore_mamba_ms2pip_m.py"),
        "--msms", str(filtered_path),
        "--features", str(features_path),
        "--outdir", str(mokapot_dir),
        "--rng", str(rng),
        "--folds", str(folds),
        "--max_workers", str(max_workers),
        "--train_fdr", str(train_fdr),
        "--test_fdr", str(test_fdr),
    ]
    if add_basic:
        cmd.append("--add_basic")
    if add_maxquant:
        cmd.append("--add_maxquant")

    result = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", timeout=3600)
    if result.returncode != 0:
        raise RuntimeError(
            f"step04 mokapot failed: {result.stderr[-500:]}"
        )

    # Collect results
    result_files = []
    accepted_psms = 0
    accepted_peptides = 0

    psms_file = mokapot_dir / "mokapot.psms.txt"
    if psms_file.exists():
        result_files.append("mokapot.psms.txt")
        accepted_psms = sum(1 for _ in open(psms_file)) - 1  # minus header

    peptides_file = mokapot_dir / "mokapot.peptides.txt"
    if peptides_file.exists():
        result_files.append("mokapot.peptides.txt")
        accepted_peptides = sum(1 for _ in open(peptides_file)) - 1

    return {
        "accepted_psms": accepted_psms,
        "accepted_peptides": accepted_peptides,
        "result_files": result_files,
    }

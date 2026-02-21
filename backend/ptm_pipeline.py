"""PTM Location pipeline — 8-step FLR workflow for phosphosite localization.

Wraps the MS2Int_FLR pipeline scripts into callable Python functions.
Step 3 uses mgf_parser (same as Rescore) instead of pyopenms for mzML.
Step 5 reuses the webserver's already-loaded GPU model.
Steps 6-8 call the reference FLR scripts via subprocess.
"""

from __future__ import annotations

import os
import random
import re
import subprocess
import sys
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

import h5py
import numpy as np
import pandas as pd

from config import FLR_SCRIPT_DIR, MS2INT_REPO
from mgf_parser import parse_mgf

_PHOSPHO_DIR = MS2INT_REPO / "bkp" / "phosphorylation"

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


def _normalize_ion_name(name: str):
    if not name:
        return None
    base = str(name)
    charge_suffix = ""
    if "-H3PO4" in base:
        base = base.replace("-H3PO4", "")
    if "^" in base:
        parts = base.split("^", 1)
        base, charge_suffix = parts[0], "^" + parts[1]
    if not base:
        return None
    if base.startswith("m"):
        return base
    return base + charge_suffix


def _build_train_matrix(frag_int_pairs: List[Tuple[str, float]]) -> np.ndarray:
    flat_len = ION_ROWS * ION_COLS
    vec = np.zeros(flat_len, dtype=float)
    for name, inten in frag_int_pairs:
        norm_name = _normalize_ion_name(name)
        if norm_name is None:
            continue
        idx = ION_TO_IDX.get(norm_name)
        if idx is None:
            continue
        vec[idx] += float(inten)
    return vec.reshape((ION_ROWS, ION_COLS))


def _convert_deepflr_to_mamba(key_x: str) -> str:
    modification_map = {
        "1": "[Phospho]",
        "2": "[Oxidation]",
        "3": "[Carbamidomethyl]",
        "4": "[Acetyl]",
    }
    seq = key_x
    if seq.startswith("4"):
        seq = "[Acetyl]-" + seq[1:]
    for code, mod in modification_map.items():
        if code == "4":
            continue
        seq = re.sub(f"([A-Z]){code}", f"\\1{mod}", seq)
    return seq


def _ensure_phospho_modules():
    """Add phosphorylation module to sys.path if needed."""
    pdir = str(_PHOSPHO_DIR)
    if pdir not in sys.path:
        sys.path.insert(0, pdir)


# ═══════════════════════════════════════════════════════════════════════════
# Main pipeline
# ═══════════════════════════════════════════════════════════════════════════


def run_ptm_pipeline(
    job_dir: str,
    file_params: list[dict],
    progress_callback: Optional[Callable] = None,
    target_flr: float = 0.01,
) -> dict:
    """Run the 8-step PTM Location (FLR) pipeline.

    Args:
        job_dir: Path to job directory containing uploads/.
        file_params: List of dicts with keys: raw_file, search_result,
                     fragmentation, collision_energy.
        progress_callback: fn(step, total, msg, **kwargs) for status updates.
        target_flr: FLR cutoff for phosphosite export (default 0.01).
    """
    cb = progress_callback or (lambda *a, **kw: None)
    uploads = Path(job_dir) / "uploads"
    work = Path(job_dir) / "ptm_work"
    work.mkdir(parents=True, exist_ok=True)

    param_map = {fp["raw_file"]: fp for fp in file_params}

    # ── Step 1: Generate TD list ──────────────────────────────────────
    cb(1, 8, "Generating target/decoy phosphopeptide list ...")
    td_list_path, total_phospho, mono_phospho = _step01_generate_td_list(
        uploads, work, param_map
    )
    cb(1, 8, f"Found {mono_phospho} mono-phospho PSMs",
       total_phospho_psms=total_phospho, mono_phospho_psms=mono_phospho)

    # ── Step 2: Create TD DataFrame ───────────────────────────────────
    cb(2, 8, "Creating target/decoy DataFrame ...")
    td_df_path, td_candidates = _step02_create_td_df(td_list_path, work)
    cb(2, 8, f"{td_candidates} target/decoy candidates",
       td_candidates=td_candidates)

    # ── Step 3: Build reference H5 from MGF ───────────────────────────
    cb(3, 8, "Parsing MGF & building reference H5 ...")
    ref_h5_path = _step03_build_ref_h5(td_list_path, uploads, work, param_map)
    cb(3, 8, "Reference H5 built")

    # ── Step 4: Convert to Mamba H5 ───────────────────────────────────
    cb(4, 8, "Converting to Mamba H5 input format ...")
    mamba_h5_path = _step04_convert_to_mamba_h5(
        td_df_path, ref_h5_path, work, param_map
    )
    cb(4, 8, "Mamba H5 ready")

    # ── Step 5: MS2Int prediction (GPU) ───────────────────────────────
    cb(5, 8, "Running MS2Int prediction (GPU) ...")
    _step05_predict(mamba_h5_path)
    cb(5, 8, "Intpredict added to H5")

    # ── Step 6: Compute Cosine similarity ─────────────────────────────
    cb(6, 8, "Computing cosine similarity scores ...")
    score_csv_path = _step06_compute_cosine(mamba_h5_path, ref_h5_path, td_df_path, work)
    cb(6, 8, "Cosine scores computed")

    # ── Step 7: Compute FLR curve ─────────────────────────────────────
    cb(7, 8, "Computing FLR curve ...")
    flr_csv_path, psm_csv_path, flr_1pct, flr_5pct = _step07_compute_flr(
        score_csv_path, td_list_path, work
    )
    cb(7, 8, f"FLR ≤1%: {flr_1pct} PSMs, FLR ≤5%: {flr_5pct} PSMs",
       flr_1pct_psms=flr_1pct, flr_5pct_psms=flr_5pct)

    # ── Step 8: Export phosphosites ───────────────────────────────────
    cb(8, 8, "Exporting phosphosites ...")
    phospho_exported, result_files = _step08_export_phosphosites(
        score_csv_path, td_list_path, uploads, work, param_map, target_flr
    )
    result_files = [flr_csv_path.name, psm_csv_path.name] + result_files
    cb(8, 8, f"Exported {phospho_exported} phosphosites",
       phosphosites_exported=phospho_exported)

    return {
        "total_phospho_psms": total_phospho,
        "mono_phospho_psms": mono_phospho,
        "td_candidates": td_candidates,
        "flr_1pct_psms": flr_1pct,
        "flr_5pct_psms": flr_5pct,
        "phosphosites_exported": phospho_exported,
        "result_files": result_files,
    }


# ═══════════════════════════════════════════════════════════════════════════
# Step implementations
# ═══════════════════════════════════════════════════════════════════════════


def _step01_generate_td_list(
    uploads: Path, work: Path, param_map: dict
) -> Tuple[Path, int, int]:
    """Generate target/decoy phosphopeptide sequences from msms.txt."""
    msms_files = set(fp["search_result"] for fp in param_map.values())
    dfs = []
    for msms_file in msms_files:
        msms_path = uploads / msms_file
        if msms_path.exists():
            dfs.append(pd.read_csv(msms_path, sep="\t", low_memory=False))
    if not dfs:
        raise FileNotFoundError("No msms.txt files found in uploads")

    combined = pd.concat(dfs, ignore_index=True)

    out = pd.DataFrame()
    out["SourceFile"] = combined["Raw file"]
    out["Spectrum"] = combined["Scan number"]
    out["PP.Charge"] = combined["Charge"]
    out["Peptide"] = combined["Modified sequence"]
    out = out.drop_duplicates(keep="first").reset_index(drop=True)

    # Encode modifications
    out["Peptide"] = out["Peptide"].str.replace("_", "", regex=False)
    replacements = [
        ("(Phospho (STY))", "1"), ("(Phospho(Y))", "1"), ("(Phospho(S))", "1"),
        ("(Phospho(T))", "1"), ("(Phospho (Y))", "1"), ("(Phospho (S))", "1"),
        ("(Phospho (T))", "1"), ("(Oxidation (M))", "2"),
        ("(Acetyl (Protein N-term))", "4"),
    ]
    for old, new in replacements:
        out["Peptide"] = out["Peptide"].str.replace(old, new, regex=False)
    out["Peptide"] = out["Peptide"].str.replace("C", "C3", regex=False)

    # Filter out problematic acetyl combinations
    for pat in ["4M2", "4S", "4T", "4Y", "4C"]:
        out = out.loc[~out["Peptide"].str.contains(pat, regex=False)]

    out["exp_strip_sequence"] = out["Peptide"].str.replace(r"[1234]", "", regex=True)
    out["key"] = out["Peptide"].str.replace("1", "", regex=False)

    total_phospho = len(out)

    # Keep mono-phospho only
    out = out.loc[out["Peptide"].str.count("1") == 1].reset_index(drop=True)
    mono_phospho = len(out)

    sty_counts = (
        out["exp_strip_sequence"].str.count("S")
        + out["exp_strip_sequence"].str.count("T")
        + out["exp_strip_sequence"].str.count("Y")
    )
    df_multi = out.loc[sty_counts > 1].reset_index(drop=True)

    # Generate target + decoy sequences
    rows = []
    for k in range(len(df_multi)):
        sequence = list(df_multi.loc[k, "key"])
        src = df_multi.loc[k, "SourceFile"]
        spec = df_multi.loc[k, "Spectrum"]
        charge = df_multi.loc[k, "PP.Charge"]
        peptide = df_multi.loc[k, "Peptide"]
        exp_strip = df_multi.loc[k, "exp_strip_sequence"]

        y = list(range(len(sequence)))
        sty_list = []

        for x in range(len(sequence)):
            if sequence[x] in ["S", "T", "Y"]:
                sty_list.append(x)
                sequence.insert(x + 1, "1")
                rows.append([src, spec, charge, exp_strip, peptide, "".join(sequence)])
                sequence.remove("1")
                y_copy = [v for v in y]
                y.remove(x)
            elif sequence[x] == "2":
                if x in y: y.remove(x)
                if x - 1 in y: y.remove(x - 1)
            elif sequence[x] == "3":
                if x in y: y.remove(x)
                if x - 1 in y: y.remove(x - 1)
            elif sequence[x] == "4":
                if x in y: y.remove(x)
                if x + 1 in y: y.remove(x + 1)

            if x == len(sequence) - 1:
                stynum = 0
                sample_count = min(len(sty_list), len(y))
                if sample_count > 0:
                    b = random.sample(y, sample_count) if sample_count <= len(y) else y[:]
                    for c in b:
                        if stynum >= len(sty_list):
                            break
                        sty = sty_list[stynum]
                        sequence[c], sequence[sty] = sequence[sty], sequence[c]
                        sequence.insert(c + 1, "1")
                        stynum += 1
                        rows.append([src, spec, charge, exp_strip, peptide, "".join(sequence)])
                        sequence.remove("1")
                        sequence[c], sequence[sty] = sequence[sty], sequence[c]

    result = pd.DataFrame(
        rows, columns=["SourceFile", "Spectrum", "PP.Charge", "exp_strip_sequence", "Peptide", "key"]
    )

    out_path = work / "step1_TD_list.csv"
    result.to_csv(out_path, index=False)
    return out_path, total_phospho, mono_phospho


def _step02_create_td_df(td_list_path: Path, work: Path) -> Tuple[Path, int]:
    """Create target/decoy DataFrame with labeling."""
    df = pd.read_csv(td_list_path)

    modelresult = df.rename(columns={
        "Spectrum": "Fspectrum",
        "key": "key_x",
        "exp_strip_sequence": "PEP.StrippedSequence",
    })

    required_cols = ["SourceFile", "Fspectrum", "PP.Charge", "key_x", "PEP.StrippedSequence"]
    modelresult = modelresult[required_cols].copy()
    modelresult = modelresult.drop_duplicates().reset_index(drop=True)

    modelresult["Fspectrum"] = modelresult["Fspectrum"].astype(str)
    modelresult["SourceFile"] = modelresult["SourceFile"].astype(str)
    modelresult["PP.Charge"] = modelresult["PP.Charge"].astype(int)

    strip_key = modelresult["key_x"].astype(str)
    for ch in ["1", "2", "3", "4"]:
        strip_key = strip_key.str.replace(ch, "", regex=False)

    modelresult["strip_key"] = strip_key
    modelresult["is_decoy"] = modelresult["strip_key"] != modelresult["PEP.StrippedSequence"]
    modelresult["TD_label"] = modelresult["is_decoy"].map({False: "target", True: "decoy"})

    out_path = work / "step2_TD_df.csv"
    modelresult.to_csv(out_path, index=False)
    return out_path, len(modelresult)


def _step03_build_ref_h5(
    td_list_path: Path, uploads: Path, work: Path, param_map: dict
) -> Path:
    """Build reference H5 using MGF spectra instead of mzML.

    Uses phosphorylation-aware theoretical fragment generation from
    MS2Int_FLR/phosphorylation/step2_process_df_h5.py.
    """
    _ensure_phospho_modules()
    from step2_process_df_h5 import cached_process_single, fast_intensity_matching

    td = pd.read_csv(td_list_path)
    td["SourceFile"] = td["SourceFile"].astype(str)
    td["Spectrum"] = pd.to_numeric(td["Spectrum"], errors="coerce").astype("Int64")
    td["PP.Charge"] = pd.to_numeric(td["PP.Charge"], errors="coerce").astype("Int64")
    td["key"] = td["key"].astype(str)

    # Load msms.txt for mass analyzer info
    msms_files = set(fp["search_result"] for fp in param_map.values())
    msinfo: Dict[Tuple[str, int], str] = {}
    fraginfo: Dict[Tuple[str, int], str] = {}
    for msms_file in msms_files:
        msms_path = uploads / msms_file
        if not msms_path.exists():
            continue
        df_msms = pd.read_csv(msms_path, sep="\t", low_memory=False)
        if "Mass analyzer" in df_msms.columns:
            for _, row in df_msms.iterrows():
                raw = str(row.get("Raw file", ""))
                scan = row.get("Scan number")
                if pd.isna(scan):
                    continue
                key = (raw, int(scan))
                msinfo[key] = str(row["Mass analyzer"])
                if "Fragmentation" in df_msms.columns and not pd.isna(row.get("Fragmentation")):
                    fraginfo[key] = str(row["Fragmentation"])

    # Parse all MGF files
    mgf_scans: Dict[str, Dict[int, Tuple[np.ndarray, np.ndarray]]] = {}
    for raw_file, params in param_map.items():
        mgf_candidates = list(uploads.glob(f"{raw_file}.mgf*"))
        if not mgf_candidates:
            continue
        spectra = parse_mgf(str(mgf_candidates[0]))
        scan_lookup = {}
        for sp in spectra:
            if sp["scan"] is not None:
                scan_lookup[sp["scan"]] = (sp["mz_array"], sp["int_array"])
        mgf_scans[raw_file] = scan_lookup

    n_rows = len(td)
    train_mats = []
    ce_list = []
    frag_list = []
    analyzer_list = []

    for _, row in td.iterrows():
        raw = str(row["SourceFile"])
        scan = int(row["Spectrum"]) if not pd.isna(row["Spectrum"]) else -1
        key_seq = str(row["key"])

        fp = param_map.get(raw, {})
        default_frag = fp.get("fragmentation", "HCD")
        default_ce = fp.get("collision_energy", 30)

        annotate = _convert_deepflr_to_mamba(key_seq)
        theory_list = cached_process_single(annotate)

        scan_lookup = mgf_scans.get(raw, {})
        mz_int = scan_lookup.get(scan)

        analyzer = msinfo.get((raw, scan), "FTMS")
        frag = fraginfo.get((raw, scan), default_frag)

        if theory_list and mz_int is not None:
            mz_arr, int_arr = mz_int
            matched = fast_intensity_matching(
                theory_list, mz_arr, int_arr, analyzer,
            )
            if matched is not None:
                ion_pairs = [(str(n), float(v)) for n, v in matched]
                mat = _build_train_matrix(ion_pairs)
            else:
                mat = np.zeros((ION_ROWS, ION_COLS), dtype=float)
        else:
            mat = np.zeros((ION_ROWS, ION_COLS), dtype=float)

        train_mats.append(mat)
        analyzer_list.append(analyzer)
        frag_list.append(frag)

        ce_key = (raw, scan)
        ce_list.append(default_ce)

    train_array = np.stack(train_mats, axis=0).astype(np.float32)
    train_array = np.swapaxes(train_array, 1, 2)  # (N, 31, 29) -> (N, 29, 31)

    ref_h5_path = work / "step3_ref_spectra.h5"
    raw_files = td["SourceFile"].astype(str).to_numpy(dtype="S100")
    scans = td["Spectrum"].fillna(-1).astype("int64").to_numpy()
    charges = td["PP.Charge"].fillna(2).astype("int64").to_numpy()
    sequences = td["exp_strip_sequence"].astype(str).to_numpy(dtype="S128")
    keys = td["key"].astype(str).to_numpy(dtype="S256")

    with h5py.File(str(ref_h5_path), "w") as f:
        f.create_dataset("Raw_file", data=raw_files)
        f.create_dataset("MS2_Scan_Number", data=scans)
        f.create_dataset("Charge", data=charges)
        f.create_dataset("Sequence", data=sequences)
        f.create_dataset("key", data=keys)
        f.create_dataset("Mass_analyzer", data=np.array(analyzer_list, dtype="S32"))
        f.create_dataset("Fragmentation", data=np.array(frag_list, dtype="S16"))
        f.create_dataset("collision_energy", data=np.array(ce_list, dtype=np.float32))
        f.create_dataset("train_data", data=train_array)

    return ref_h5_path


def _step04_convert_to_mamba_h5(
    td_df_path: Path, ref_h5_path: Path, work: Path, param_map: dict
) -> Path:
    """Convert TD DataFrame to Mamba H5 input format."""
    df = pd.read_csv(td_df_path)
    n_samples = len(df)

    col_key_x = df["key_x"].to_numpy()
    col_strip = df["PEP.StrippedSequence"].to_numpy()
    col_charge = df["PP.Charge"].to_numpy()

    sequences = []
    lengths = []
    charges = []
    for idx in range(n_samples):
        sequences.append(_convert_deepflr_to_mamba(str(col_key_x[idx])).encode("utf-8"))
        lengths.append(len(str(col_strip[idx]).strip()))
        charges.append(int(col_charge[idx]))

    # Determine default CE/frag from first file_param
    first_fp = next(iter(param_map.values()), {})
    default_ce = first_fp.get("collision_energy", 30)
    default_frag = first_fp.get("fragmentation", "HCD")

    mamba_h5_path = work / "step4_mamba_input.h5"

    with h5py.File(str(mamba_h5_path), "w") as f:
        f.create_dataset("Sequence", data=np.array(sequences, dtype="S128"))
        f.create_dataset("Length", data=np.array(lengths, dtype=np.int32))
        f.create_dataset("Charge", data=np.array(charges, dtype=np.int32))
        f.create_dataset("Raw_file", data=np.array(
            df["SourceFile"].astype(str).str.encode("utf-8"), dtype="S100"
        ))
        f.create_dataset("MS2_Scan_Number", data=pd.to_numeric(
            df["Fspectrum"], errors="coerce"
        ).fillna(-1).astype(np.int32).to_numpy())

        # Copy train_data and metadata from ref_h5 if shapes match
        ce_data = np.full((n_samples,), default_ce, dtype=np.float32)
        frag_data = np.array([default_frag.encode("utf-8")] * n_samples, dtype="S10")

        if ref_h5_path.exists():
            with h5py.File(str(ref_h5_path), "r") as f_ref:
                if "train_data" in f_ref and f_ref["train_data"].shape[0] == n_samples:
                    f.create_dataset("train_data", data=f_ref["train_data"][()])
                if "collision_energy" in f_ref and f_ref["collision_energy"].shape[0] == n_samples:
                    ce_data = f_ref["collision_energy"][()].astype(np.float32)
                if "Fragmentation" in f_ref and f_ref["Fragmentation"].shape[0] == n_samples:
                    frag_data = f_ref["Fragmentation"][()]
                if "Mass_analyzer" in f_ref and f_ref["Mass_analyzer"].shape[0] == n_samples:
                    f.create_dataset("Mass_analyzer", data=f_ref["Mass_analyzer"][()])

        f.create_dataset("collision_energy", data=ce_data)
        f.create_dataset("Fragmentation", data=frag_data)

    return mamba_h5_path


def _step05_predict(h5_path: Path) -> None:
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


def _step06_compute_cosine(
    pred_h5_path: Path, ref_h5_path: Path, td_df_path: Path, work: Path
) -> Path:
    """Compute cosine similarity via subprocess call to step6."""
    score_csv_path = work / "step6_df_score.csv"

    cmd = [
        sys.executable,
        str(FLR_SCRIPT_DIR / "step6_compute_Cosine.py"),
        "--pred_h5", str(pred_h5_path),
        "--ref_h5", str(ref_h5_path),
        "--pred_key", "Intpredict",
        "--true_key", "train_data",
        "--n", "31",
        "--mode", "flatten",
        "--align", "index",
        "--template_csv", str(td_df_path),
    ]
    result = subprocess.run(
        cmd, capture_output=True, text=True, encoding="utf-8", timeout=3600
    )
    if result.returncode != 0:
        raise RuntimeError(f"step6 cosine failed: {result.stderr[-500:]}")

    if not score_csv_path.exists():
        raise FileNotFoundError(f"Score CSV not found: {score_csv_path}")

    return score_csv_path


def _step07_compute_flr(
    score_csv_path: Path, td_list_path: Path, work: Path
) -> Tuple[Path, Path, int, int]:
    """Compute FLR curve via subprocess call to step7."""
    flr_csv_path = work / "step7_flr_curve.csv"
    psm_csv_path = work / "step7_unique_psm.csv"

    cmd = [
        sys.executable,
        str(FLR_SCRIPT_DIR / "step7_compute_flr.py"),
        "--modelresultfile", str(score_csv_path),
        "--sequencefile", str(td_list_path),
        "--outputfile", str(flr_csv_path),
        "--psm_outputfile", str(psm_csv_path),
    ]
    result = subprocess.run(
        cmd, capture_output=True, text=True, encoding="utf-8", timeout=3600
    )
    if result.returncode != 0:
        raise RuntimeError(f"step7 FLR failed: {result.stderr[-500:]}")

    # Parse FLR curve to get counts at 1% and 5%
    flr_1pct = 0
    flr_5pct = 0
    if flr_csv_path.exists():
        flr_df = pd.read_csv(flr_csv_path)
        if "esti_FLR" in flr_df.columns and "PSMs" in flr_df.columns:
            at_1pct = flr_df.loc[flr_df["esti_FLR"] <= 0.01]
            if len(at_1pct) > 0:
                flr_1pct = int(at_1pct["PSMs"].max())
            at_5pct = flr_df.loc[flr_df["esti_FLR"] <= 0.05]
            if len(at_5pct) > 0:
                flr_5pct = int(at_5pct["PSMs"].max())

    return flr_csv_path, psm_csv_path, flr_1pct, flr_5pct


def _step08_export_phosphosites(
    score_csv_path: Path, td_list_path: Path, uploads: Path,
    work: Path, param_map: dict, target_flr: float,
) -> Tuple[int, list]:
    """Export phosphosites via subprocess call to step8 (if STY file present)."""
    # Find STY Sites file
    sty_path = None
    for f in uploads.iterdir():
        fname = f.name.lower()
        if "phospho" in fname and "sites" in fname and f.suffix == ".txt":
            sty_path = f
            break

    # Find msms.txt
    msms_files = set(fp["search_result"] for fp in param_map.values())
    msms_path = None
    for msms_file in msms_files:
        p = uploads / msms_file
        if p.exists():
            msms_path = p
            break

    result_files = []

    if sty_path is not None and msms_path is not None:
        # Compute delta cutoff from FLR curve
        flr_csv = work / "step7_flr_curve.csv"
        delta_cutoff = 0.0
        if flr_csv.exists():
            flr_df = pd.read_csv(flr_csv)
            at_target = flr_df.loc[flr_df["esti_FLR"] <= target_flr]
            if len(at_target) > 0:
                delta_cutoff = float(at_target["cutoff"].min())

        phospho_path = work / "step8_phosphosites.csv"
        cmd = [
            sys.executable,
            str(FLR_SCRIPT_DIR / "step8_export_phosphosites.py"),
            "--modelresultfile", str(score_csv_path),
            "--sequencefile", str(td_list_path),
            "--inputfile1", str(msms_path),
            "--inputfile2", str(sty_path),
            "--cutoff", str(delta_cutoff),
            "--outputresult", str(phospho_path),
        ]
        result = subprocess.run(
            cmd, capture_output=True, text=True, encoding="utf-8", timeout=3600
        )
        if result.returncode != 0:
            raise RuntimeError(f"step8 export failed: {result.stderr[-500:]}")

        if phospho_path.exists():
            result_files.append(phospho_path.name)
            df = pd.read_csv(phospho_path)
            return len(df), result_files

    return 0, result_files

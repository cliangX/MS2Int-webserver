"""Render annotated spectrum images using spectrum_utils.

Generates publication-quality PNG spectrum plots on the backend,
returned as bytes for base64 encoding to the frontend.
"""

from __future__ import annotations

import io
from typing import Optional

import matplotlib
matplotlib.use("Agg")  # headless backend
import matplotlib.pyplot as plt
import numpy as np

try:
    import spectrum_utils.spectrum as sus
    import spectrum_utils.plot as sup
    SPECTRUM_UTILS_AVAILABLE = True
except ImportError:
    sus = None  # type: ignore
    sup = None  # type: ignore
    SPECTRUM_UTILS_AVAILABLE = False

from ion_labels import (
    ANNOTATION_MATRIX,
    ION_COLS,
    ION_ROWS,
    tokenize_peptide,
    compute_theoretical_mz,
    PROTON_MASS,
)


def _build_mz_intensity_arrays(
    intensity_matrix: np.ndarray,
    sequence: str,
    charge: int,
    min_intensity: float = 1e-4,
) -> tuple[np.ndarray, np.ndarray, list[str]]:
    """Extract flat mz/intensity arrays from the 29×31 matrix.

    Returns (mz_array, intensity_array, labels) for peaks above min_intensity.
    """
    mz_map = compute_theoretical_mz(sequence, charge)
    mz_list: list[float] = []
    int_list: list[float] = []
    label_list: list[str] = []

    for pos in range(intensity_matrix.shape[0]):
        for ion_type in range(intensity_matrix.shape[1]):
            intensity = float(intensity_matrix[pos, ion_type])
            if intensity < min_intensity:
                continue
            label = str(ANNOTATION_MATRIX[ion_type, pos])
            if not label:
                continue
            mz = mz_map.get(label, 0.0)
            if mz <= 0:
                continue
            mz_list.append(mz)
            int_list.append(intensity)
            label_list.append(label)

    return np.array(mz_list), np.array(int_list), label_list


def render_spectrum_png(
    sequence: str,
    charge: int,
    intensity_matrix: np.ndarray,
    figsize: tuple[int, int] = (12, 6),
    dpi: int = 150,
) -> bytes:
    """Render an annotated spectrum as PNG bytes.

    If spectrum_utils is available, uses its annotated plotting.
    Otherwise, falls back to a simple matplotlib stick plot.
    """
    mz_arr, int_arr, labels = _build_mz_intensity_arrays(
        intensity_matrix, sequence, charge
    )

    if len(mz_arr) == 0:
        return _render_empty_plot(sequence, charge, figsize, dpi)

    if SPECTRUM_UTILS_AVAILABLE:
        return _render_with_spectrum_utils(
            sequence, charge, mz_arr, int_arr, figsize, dpi
        )
    else:
        return _render_fallback(
            sequence, charge, mz_arr, int_arr, labels, figsize, dpi
        )


def _render_with_spectrum_utils(
    sequence: str,
    charge: int,
    mz_arr: np.ndarray,
    int_arr: np.ndarray,
    figsize: tuple[int, int],
    dpi: int,
) -> bytes:
    """Use spectrum_utils for professional annotated spectrum."""
    # Compute precursor m/z (approximate)
    tokens = tokenize_peptide(sequence)
    total_residue_mass = sum(
        _token_mass(tok) for tok in tokens
    )
    precursor_mz = (total_residue_mass + 18.01056 + charge * PROTON_MASS) / charge

    spectrum = sus.MsmsSpectrum(
        identifier=f"{sequence}/{charge}",
        precursor_mz=precursor_mz,
        precursor_charge=charge,
        mz=mz_arr,
        intensity=int_arr,
    )
    spectrum.scale_intensity(max_intensity=1.0)

    # Try annotating with ProForma
    proforma_str = _to_proforma(sequence, charge)
    try:
        spectrum.annotate_proforma(
            proforma_str,
            fragment_tol_mass=0.5,
            fragment_tol_mode="Da",
            ion_types="by",
        )
    except Exception:
        pass  # If annotation fails, plot without annotation

    fig, ax = plt.subplots(figsize=figsize)
    sup.spectrum(spectrum, grid=False, ax=ax)
    ax.set_title(
        f"{sequence}/{charge}+",
        fontdict={"fontsize": 12, "fontweight": "bold"},
    )
    ax.spines["right"].set_visible(False)
    ax.spines["top"].set_visible(False)

    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=dpi, bbox_inches="tight",
                facecolor="white", transparent=False)
    plt.close(fig)
    buf.seek(0)
    return buf.read()


def _render_fallback(
    sequence: str,
    charge: int,
    mz_arr: np.ndarray,
    int_arr: np.ndarray,
    labels: list[str],
    figsize: tuple[int, int],
    dpi: int,
) -> bytes:
    """Simple matplotlib stick plot fallback when spectrum_utils is unavailable."""
    fig, ax = plt.subplots(figsize=figsize)

    colors = []
    for label in labels:
        if label.startswith("b"):
            colors.append("#3070f0")
        elif label.startswith("y"):
            colors.append("#e03030")
        else:
            colors.append("#909090")

    ax.vlines(mz_arr, 0, int_arr, colors=colors, linewidth=1.5)
    ax.set_xlabel("m/z", fontstyle="italic")
    ax.set_ylabel("Relative Intensity")
    ax.set_title(f"{sequence}/{charge}+", fontweight="bold")
    ax.set_ylim(bottom=0)
    ax.spines["right"].set_visible(False)
    ax.spines["top"].set_visible(False)

    # Annotate top peaks
    top_indices = np.argsort(int_arr)[-15:]
    for idx in top_indices:
        if int_arr[idx] > 0.05:
            ax.text(
                mz_arr[idx], int_arr[idx] + 0.02, labels[idx],
                ha="center", va="bottom", fontsize=7, rotation=45,
            )

    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=dpi, bbox_inches="tight",
                facecolor="white", transparent=False)
    plt.close(fig)
    buf.seek(0)
    return buf.read()


def _render_empty_plot(
    sequence: str,
    charge: int,
    figsize: tuple[int, int],
    dpi: int,
) -> bytes:
    """Render an empty spectrum plot."""
    fig, ax = plt.subplots(figsize=figsize)
    ax.set_xlabel("m/z", fontstyle="italic")
    ax.set_ylabel("Relative Intensity")
    ax.set_title(f"{sequence}/{charge}+ — No peaks predicted", fontweight="bold")
    ax.set_ylim(0, 1)
    ax.set_xlim(0, 1500)
    ax.spines["right"].set_visible(False)
    ax.spines["top"].set_visible(False)
    ax.text(0.5, 0.5, "No significant peaks predicted",
            ha="center", va="center", transform=ax.transAxes,
            fontsize=14, color="gray")

    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=dpi, bbox_inches="tight",
                facecolor="white", transparent=False)
    plt.close(fig)
    buf.seek(0)
    return buf.read()


# ── Helpers ────────────────────────────────────────────────────────────────

_MOD_MASS: dict[str, float] = {
    "Oxidation": 15.99491, "Carbamidomethyl": 57.02146,
    "Phospho": 79.96633, "Acetyl": 42.01057,
    "Dimethyl": 28.03130, "Trimethyl": 42.04695,
    "Formyl": 27.99492, "Methyl": 14.01565,
    "GG": 114.04293, "Glu->pyro-Glu": -18.01056,
    "Gln->pyro-Glu": -17.02655, "Propionyl": 56.02621,
    "Succinyl": 100.01604, "Biotin": 226.07760,
    "HexNAc": 203.07937, "Nitro": 44.98508,
}

_AA_MASS: dict[str, float] = {
    "G": 57.02146, "A": 71.03711, "V": 99.06841, "L": 113.08406,
    "I": 113.08406, "P": 97.05276, "F": 147.06841, "W": 186.07931,
    "M": 131.04049, "S": 87.03203, "T": 101.04768, "C": 103.00919,
    "Y": 163.06333, "H": 137.05891, "D": 115.02694, "E": 129.04259,
    "N": 114.04293, "Q": 128.05858, "K": 128.09496, "R": 156.10111,
}


def _token_mass(tok: str) -> float:
    """Compute mass for a single token."""
    if tok in ("[]-", "-[]"):
        return 0.0
    if tok.startswith("[") and tok.endswith("]-"):
        mod_name = tok[1:-2]
        return _MOD_MASS.get(mod_name, 0.0)
    aa = tok[0]
    base = _AA_MASS.get(aa, 0.0)
    if "[" in tok:
        mod_name = tok[2:-1]
        base += _MOD_MASS.get(mod_name, 0.0)
    return base


# MS2Int internal notation → ProForma mapping
_MOD_TO_PROFORMA: dict[str, str] = {
    "Oxidation": "[Oxidation]",
    "Carbamidomethyl": "[Carbamidomethyl]",
    "Phospho": "[Phospho]",
    "Acetyl": "[Acetyl]",
    "GG": "[GlyGly]",
    "Glu->pyro-Glu": "[Glu->pyro-Glu]",
    "Gln->pyro-Glu": "[Gln->pyro-Glu]",
    "Methyl": "[Methyl]",
    "Dimethyl": "[Dimethyl]",
    "Trimethyl": "[Trimethyl]",
    "Formyl": "[Formyl]",
    "HexNAc": "[HexNAc]",
    "Nitro": "[Nitro]",
    "Propionyl": "[Propionyl]",
    "Succinyl": "[Succinyl]",
    "Biotin": "[Biotin]",
}


def _to_proforma(sequence: str, charge: int) -> str:
    """Convert MS2Int internal sequence notation to ProForma 2.0 string."""
    tokens = tokenize_peptide(sequence)
    parts: list[str] = []
    nterm_mod = ""

    for tok in tokens:
        if tok.startswith("[") and tok.endswith("]-"):
            mod_name = tok[1:-2]
            pf = _MOD_TO_PROFORMA.get(mod_name, f"[{mod_name}]")
            nterm_mod = pf + "-"
            continue
        if tok == "-[]":
            continue
        if "[" in tok:
            aa = tok[0]
            mod_name = tok[2:-1]
            pf = _MOD_TO_PROFORMA.get(mod_name, f"[{mod_name}]")
            parts.append(f"{aa}{pf}")
        else:
            parts.append(tok)

    proforma = nterm_mod + "".join(parts) + f"/{charge}"
    return proforma

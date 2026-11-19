# /// script
# requires-python = ">=3.11"
# dependencies = ["duckdb==1.5.6", "networkx==3.6.1", "numpy==2.4.6", "scipy==1.17.1", "pyyaml==6.0.3",
#                 "brotli==1.1.0"]
# ///
"""The monthly explorer's data: rolling windows of 3, 6 and 12 months, gap filling after
IMF DOTS, divergence flags, and the tier-0 diagnostics of the windows.

    uv run scripts/build_windows.py                         # every monthly product, into data/
    uv run scripts/build_windows.py --only TOTAL,C:semiconductors:ics --workers 8

Run after build_snapshots.py (it reads data/meta.json and adds the windows to it). Writes, beside the
explorer's files:

    snap/W/<product>/<YYYY>.w<w>.json   the windows ending in the months of a year, w = 3, 6 or 12
    series/W/<product>.json            the strip per window length, with the estimated share of world trade
    nodes/W/<product>.json             exports and imports of the largest economies per window
    flows/W/<product>.json             share, mirror ratio and estimate code of the largest flows
    div/<product>.json                 the divergence flags of the flows on the maps, with matching events
    diag/<product>.json                the timing diagnostic and the splice backtest (checks.py reads them)

Rules:

- Windows: the sum of the w months ending in the month. No window boundary splits January from
  February, so a window never ends in January, nor in April (w = 3) or July (w = 6). PageRank,
  betweenness and communities only at w = 12.
- One side per flow: the importer's report (the side the one-side rule prefers) for every month the
  importer filed. Months the importer did not file but the exporter did are estimated, month by month, so
  that every window is a sum of one series:
    spliced       est(m) = κ(m) × partner(m), κ(m) = own₁₂(m − 12) / partner₁₂(m − 12), the ratio of the two
                  reports over the 12 months ending a year earlier (both filed every month); else over the
                  latest such 12 months ending within 24 months; else, for an importer that stopped filing (China
                  after December 2024), the last such 12 months it filed, however old: the value is flagged with
                  the anchor's year ("spliced on 2024"), so there is no step when the anchor
                  passes 24 months. Summed over a window this is the year-on-year
                  splice with the anchor taken on 12 months; the first form, own_W(t − 12) × partner_W(t)
                  / partner_W(t − 12), gives a month a different weight in each window, and the published
                  windows would then pin single months (the leak test found them); the backtest scores both;
    benchmarked   once the importer's annual file covers the year, the year's estimated months (spliced, and the
                  partner-only months of an importer that files annually but never monthly) are moved by
                  proportional Denton so that the year sums to the annual figure (reported months untouched);
    partner-only  no anchor at all, or a spliced month above SPLICE_MAX × the importer's own average month in
                  the anchor year: the exporter's report times 1.06 (CIF/FOB), for every importer (one factor
                  wherever an exporter's report stands in for the importer's, as the annual mirror rule).
  A reporter that filed a month but sent no row of the product (Japan's April 2026 file has no chapter 84 or 85
  rows) did not file the product that month: its zero is not a report, and the month is estimated from the partners
  (product_filed; L2). Without this the positive-every-month rule drops all its flows for a year of windows.
  Each flow carries its worst code; each economy the code of most of its estimated imports.
- No single month can be computed: a flow (and so an economy) enters a window only when its drawn value is
  positive in every month of the window, and the mirror ratio is published only when both reports are
  positive in every month. Every published window is then a sum of three-month blocks of one series inside
  a run of positive months; the builder also tests the largest flows' windows for a single month in their span.
- Divergence: the 12-month mirror ratio of each pair (both sides filed every month) is flagged when it lies
  outside median ± max(3 MAD, 10% of the median) of the 36 preceding months; all goods on TOTAL, the stages' HS2 chapters on the
  stages. Detect, never correct.
- Derived records only: shares, ranks, ratios, codes and aggregate totals; zero original records.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import shutil
import sys
import time
from concurrent.futures import ProcessPoolExecutor, as_completed
from datetime import date
from pathlib import Path

# one BLAS thread per worker: twenty workers each running a 24-thread BLAS (the leak test, Denton) swamp the machine
for _k in ("OPENBLAS_NUM_THREADS", "OMP_NUM_THREADS", "MKL_NUM_THREADS"):
    os.environ.setdefault(_k, "1")

import numpy as np  # noqa: E402
import yaml  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_snapshots as bs  # noqa: E402
from build_snapshots import NET, HERE, sig, write_json, read_json, add_months, month_index  # noqa: E402

WINDOWS = (3, 6, 12)
WIN_TOP = {                # flows kept per window snapshot; w = 12 as lens L
    "total": {12: 1500, 6: 600, 3: 600},
    "basket": {12: 600, 6: 300, 3: 300},
    "stage": {12: 300, 6: 300, 3: 300},
}
ANCHOR_MAX = 24            # months back the splice may anchor
SPLICE_MAX = 5             # a spliced month is at most 5 × the importer's own average month over the anchor 12 months;
                           # above it (a partner report that was near zero in the anchor year) the month is partner-only
CIF_FOB = bs.CIF_FOB       # wherever the exporter's report stands in for the importer's (IMF DOTS)
EST = ["reported", "benchmarked", "spliced", "partner-only", "interpolated"]   # codes 0-4, a flow takes its worst
# (4: a filed month with no row of the product, interpolated from the months around it: product_filed)
EDGE_EST_YEAR = "ky"       # spliced flows and economies: the year of the splice's anchor ("spliced on 2024")
# the band is median ± max(k MAD, floor × median): the 36 overlapping 12-month ratios before t are so smooth that
# k MAD alone is often under 1% of the ratio, and the flag would fire on ordinary drift (US-Mexico, ±0.01)
DIV = {"w": 12, "history": 36, "min_history": 24, "k": 3.0, "floor": 0.10, "min_share": 1e-4}
DIAG = {"from": 201501, "to": 202412, "min_share": 1e-4}
LEAK_TEST = {"irregular": 400, "regular": 50}   # flows tested per product: the largest odd ones, a random few
HISTORY = 60               # months loaded before the first window: anchors, the 36-month band, diagnostics
RETIRED = ("snap/M", "series/M", "nodes/M", "flows/M")   # the monthly lenses' files, no longer written or read (K4)


def valid_end(t: int, w: int) -> bool:
    """Whether the window of w months ending in t keeps January and February together."""
    a = add_months(t, -(w - 1))
    return t % 100 != 1 and a % 100 != 2


def window_ends(lo: int, hi: int, w: int) -> list[int]:
    out, t = [], lo
    while t <= hi:
        if valid_end(t, w):
            out.append(t)
        t = add_months(t, 1)
    return out


# -- the panel: one row per flow (exporter, importer), one column per month --------------------------


class Panel:
    """Both reports of every flow by month, and who filed. VM: the importer's report, VX: the exporter's
    (0 where none); FI, FX: the importer, the exporter filed the month (for HS products an HS file)."""

    def __init__(self, months: list[int], s, t, VM, VX, NF, never, unfiled=None):
        self.months = months
        self.col = {m: j for j, m in enumerate(months)}
        self.s, self.t = s, t
        self.VM, self.VX = VM, VX
        self.NF = NF                      # node x month: filed
        self.FI, self.FX = NF[t], NF[s]
        if unfiled is not None:           # suppressed customs cells: the importer's month counts as not filed
            self.FI = self.FI & ~unfiled
        self.never_imp = never[t]         # the importer never filed a monthly file
        self.B = np.full(VM.shape, np.nan)   # benchmarked monthly estimates (internal, never written)
        self.refresh()
        self.Y = self.C = self.POS = None     # the drawn series by month, its code, positive (composite())

    def refresh(self) -> None:
        """κ and its anchor from the filed months (again after FI or FX change: product_filed, chapter_filed)."""
        self.R12, self.O12 = rolling_ratio(self)    # own ÷ partner and own over the 12 months ending in each month
        # κ(m), the anchor's own 12-month sum, and the anchor's last month (column, -1 none)
        self.K, self.KA, self.KJ = splice_ratio(self.R12, self.O12)

    def __len__(self) -> int:
        return len(self.s)


def load_panel(L: bs.Layer, p: dict, lo: int, hi: int, n_nodes: int, name: str = "f") -> Panel | None:
    L.load(p, "M", lo, hi, name=name, fill=False)
    rows = L.con.execute(f"SELECT period, rep, par, flow, SUM(v) FROM {name} GROUP BY ALL").fetchnumpy()
    k = list(rows)
    per, rep, par, flow, v = (rows[k[0]].astype(np.int64), rows[k[1]].astype(np.int64), rows[k[2]].astype(np.int64),
                              np.asarray(rows[k[3]]), np.asarray(rows[k[4]], dtype=float))
    if not len(per):
        return None
    months, m = [], lo
    while m <= hi:
        months.append(m)
        m = add_months(m, 1)
    col = (per // 100 - lo // 100) * 12 + (per % 100) - (lo % 100)
    isx = flow == "X"
    exp = np.where(isx, rep, par)
    imp = np.where(isx, par, rep)
    key = exp * n_nodes + imp
    ukey, inv = np.unique(key, return_inverse=True)
    VM = np.zeros((len(ukey), len(months)))
    VX = np.zeros((len(ukey), len(months)))
    np.add.at(VX, (inv[isx], col[isx]), v[isx])
    np.add.at(VM, (inv[~isx], col[~isx]), v[~isx])
    filed = L.con.execute(f"SELECT period, node FROM rep_{name} WHERE period BETWEEN {lo} AND {hi}").fetchall()
    NF = np.zeros((n_nodes, len(months)), dtype=bool)
    for q, node in filed:
        NF[node, (q // 100 - lo // 100) * 12 + q % 100 - lo % 100] = True
    ever = {r[0] for r in L.con.execute(f"SELECT DISTINCT node FROM rep_{name}").fetchall()}
    never = np.ones(n_nodes, dtype=bool)
    never[list(ever)] = False
    s_, t_ = (ukey // n_nodes).astype(np.int64), (ukey % n_nodes).astype(np.int64)
    # a product with codes the customs statistics suppress (bs.KCS_SUPPRESSED): in a supplement's months, a flow
    # into its economy with no import row but an exporter's report is estimated from the partner (code 2 or 3)
    unfiled = None
    if bs.kcs_fill(p):
        kcs = L.con.execute(f"SELECT period, node FROM kcs_M WHERE period BETWEEN {lo} AND {hi}").fetchall()
        if kcs:
            K = np.zeros((n_nodes, len(months)), dtype=bool)
            for q, node in kcs:
                K[node, (q // 100 - lo // 100) * 12 + q % 100 - lo % 100] = True
            unfiled = K[t_] & (VM == 0) & (VX > 0)
    return Panel(months, s_, t_, VM, VX, NF, never, unfiled)


# -- benchmarking: proportional Denton on the estimated months ----------------------------------------


def denton_prop(ind: np.ndarray, grp: np.ndarray, targets: dict[int, float]) -> np.ndarray:
    """Proportional first-difference Denton: x = r × ind with r as smooth as possible (min Σ (r_k − r_{k−1})²)
    subject to Σ_{k in group g} x_k = targets[g]. ind > 0; grp gives each element's group, in order."""
    n = len(ind)
    groups = sorted(targets)
    if n == 1:
        return np.array([targets[groups[0]]])
    D = np.diff(np.eye(n), axis=0)
    C = np.zeros((len(groups), n))
    for i, g in enumerate(groups):
        C[i, grp == g] = ind[grp == g]
    K = np.block([[2 * D.T @ D, C.T], [C, np.zeros((len(groups), len(groups)))]])
    rhs = np.r_[np.zeros(n), [targets[g] for g in groups]]
    sol = np.linalg.lstsq(K, rhs, rcond=None)[0]
    return sol[:n] * ind


def rolling_ratio(P: Panel) -> tuple[np.ndarray, np.ndarray]:
    """own₁₂ / partner₁₂: the importer's report over the exporter's, summed over the 12 months ending in each month,
    where both filed all 12 and the exporter's sum is positive (NaN elsewhere); and own₁₂."""
    def roll(A):
        c = np.concatenate([np.zeros((A.shape[0], 1)), np.cumsum(A, axis=1)], axis=1)
        out = np.full(A.shape, np.nan)
        out[:, 11:] = c[:, 12:] - c[:, :-12]
        return out
    full = roll((P.FI & P.FX).astype(float)) == 12
    o, p = roll(P.VM), roll(P.VX)
    with np.errstate(divide="ignore", invalid="ignore"):
        return np.where(full & (p > 0), o / p, np.nan), o


def splice_ratio(R12: np.ndarray, O12: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """κ(m): R12 at m − 12 (the 12 months ending a year earlier), else at the latest m − k, k ≤ ANCHOR_MAX, else (an
    importer that stopped filing) at the latest m − k of any age; own₁₂ at the same anchor; and the anchor's
    column (the last month of its 12, -1 where there is none)."""
    T = R12.shape[1]
    K = np.full(R12.shape, np.nan)
    KA = np.full(R12.shape, np.nan)
    KJ = np.full(R12.shape, -1, dtype=np.int32)
    cols = np.broadcast_to(np.arange(T, dtype=np.int32), R12.shape)
    for k in [12] + [k for k in range(1, ANCHOR_MAX + 1) if k != 12]:
        if k >= T:
            continue
        gap = np.isnan(K[:, k:]) & np.isfinite(R12[:, :-k])
        K[:, k:][gap] = R12[:, :-k][gap]
        KA[:, k:][gap] = O12[:, :-k][gap]
        KJ[:, k:][gap] = cols[:, :-k][gap]
    # beyond ANCHOR_MAX: the last anchor the importer ever had, carried forward (no step when it passes 24 months)
    k = ANCHOR_MAX + 1
    if k < T:
        last = np.where(np.isfinite(R12), cols, -1)
        last = np.maximum.accumulate(last, axis=1)        # the latest column at or before each month with an R12
        src = last[:, :-k]                                  # ... at or before m − k
        gap = np.isnan(K[:, k:]) & (src >= 0)
        rows = np.nonzero(gap)[0]
        jj = src[gap]
        K[:, k:][gap] = R12[rows, jj]
        KA[:, k:][gap] = O12[rows, jj]
        KJ[:, k:][gap] = jj
    return K, KA, KJ


def product_filed(P: Panel, n: int) -> tuple[np.ndarray, int, int]:
    """A reporter that filed a month but sent no row of the product in a direction did not file the product that
    month (L2: Japan's April 2026 file carries no chapter 84 or 85 rows, so its chip imports read as zero and left
    every window holding the month). Such a month between two months that hold the product is interpolated from them,
    flow by flow (code 4, "interpolated"); any other such month counts as unfiled for that side and is estimated from
    the partners as usual (spliced, benchmarked or partner-only). Without this the positive-every-month rule drops all
    the reporter's flows of the product for a year of windows. The rule build_products used for the HS chapters
    (chapter_filed, 2 Nov 2026), now one rule for every monthly product. Returns the interpolated cells (flow x month)
    and the node-months interpolated and left to the partners."""
    J = len(P.months)
    has_m = np.zeros((n, J), dtype=bool)
    has_x = np.zeros((n, J), dtype=bool)
    np.logical_or.at(has_m, P.t, P.VM > 0)
    np.logical_or.at(has_x, P.s, P.VX > 0)
    interp = np.zeros(P.VM.shape, dtype=bool)
    n_int = n_out = 0
    for has, V, side in ((has_m, P.VM, P.t), (has_x, P.VX, P.s)):
        gap = P.NF & ~has & has.any(1)[:, None]   # filed, no row, on a side the node trades the product on
        mid = np.zeros_like(gap)
        mid[:, 1:-1] = gap[:, 1:-1] & has[:, :-2] & has[:, 2:]
        n_int += int(mid.sum())
        n_out += int((gap & ~mid).sum())
        cell = mid[side]
        rows, cols = np.nonzero(cell)
        V[rows, cols] = (V[rows, cols - 1] + V[rows, cols + 1]) / 2
        interp |= cell
        has |= mid
    P.FI = P.FI & has_m[P.t]
    P.FX = P.FX & has_x[P.s]
    P.refresh()
    return interp, n_int, n_out


def apply_rule(L: bs.Layer, p: dict, P: Panel, n: int) -> dict:
    """The one monthly rule on a loaded panel: a reporter with no row of the product
    (product_filed), the benchmark to the importers' annual files, the composite series and its
    codes (interpolated months code 4). Every monthly number is built through this: the windows here, the HS chapters
    of build_products.py and the stories of build_stories.py."""
    interp, n_int, n_out = product_filed(P, n)
    lo, hi = P.months[0], P.months[-1]
    L.load(p, "A", lo // 100, hi // 100, name="ann")   # not "a": DuckDB names ignore case, and rep_A exists
    annual = {(int(y), int(s), int(t)): float(v) for y, t, s, v in L.con.execute(
        "SELECT period, rep, par, SUM(v) FROM ann WHERE flow = 'M' GROUP BY ALL").fetchall()}
    filed_a = {(int(y), int(nd)) for y, nd in L.con.execute("SELECT period, node FROM rep_ann").fetchall()}
    bstats = benchmark(P, annual, filed_a)
    composite(P)
    P.MISS |= interp            # interpolated months count as estimated, with their own code
    P.C[interp] = 4
    return {"benchmark": bstats, "interpolated": n_int, "unfiled": n_out, "zero_reads": zero_reads(P, n)}


def zero_reads(P: Panel, n: int) -> int:
    """Check K5 (L2): flow-months drawn as the importer's own report although the importer sent no row of the product
    that month (it filed, but the zero is not a report). 0 once product_filed has run; build_windows refuses otherwise."""
    has = np.zeros((n, len(P.months)), dtype=bool)
    np.logical_or.at(has, P.t, P.VM > 0)
    return int((P.FI & ~has[P.t] & (P.C == 0)).sum())


def spliceable(P: Panel) -> np.ndarray:
    """Months whose splice has an anchor and stays within SPLICE_MAX × the anchor's own average month."""
    with np.errstate(invalid="ignore"):
        return np.isfinite(P.K) & (P.K * P.VX <= SPLICE_MAX * P.KA / 12)


def composite(P: Panel) -> None:
    """The drawn series by month (Y), its estimate code (C) and whether the month counts as positive (POS)."""
    miss = ~P.FI & P.FX
    bench = miss & ~np.isnan(P.B)
    spl = miss & ~bench & spliceable(P)
    po = miss & ~bench & ~spl
    P.Y = np.where(P.FI, P.VM, 0.0)
    P.Y = np.where(bench, np.nan_to_num(P.B), P.Y)
    P.Y = np.where(spl, np.nan_to_num(P.K) * P.VX, P.Y)
    P.Y = np.where(po, CIF_FOB * P.VX, P.Y)
    P.C = np.zeros(P.Y.shape, dtype=np.int8)
    P.C[bench], P.C[spl], P.C[po] = 1, 2, 3
    P.MISS = miss
    P.POS = (P.FI & (P.VM > 0)) | (miss & (P.VX > 0) & (P.Y > 0))
    # the anchor's year of each spliced month (0 elsewhere): "spliced on <year>"
    P.KY = np.where(spl & (P.KJ >= 0), np.asarray(P.months)[np.maximum(P.KJ, 0)] // 100, 0).astype(np.int32)


def benchmark(P: Panel, annual: dict[tuple[int, int, int], float], filed_a: set[tuple[int, int]]) -> dict:
    """Fills P.B: for each flow and year in which the importer filed its annual file, the months the importer
    did not file but the exporter did (spliced or partner-only: the partner-only months of an importer that files
    annually but not, or no longer, monthly are benchmarked too) are moved by proportional Denton so that the
    year's reported months plus these sum to the annual figure. Years with a month nobody filed, or with a target at
    or below zero, keep their spliced (or partner-only) months; so does a year whose target is above SPLICE_MAX times
    those months' estimate before benchmarking (an importer's annual record far above anything its partner shipped,
    as Algeria's 2008 car imports from Romania, 600 times Romania's report: a benchmark never multiplies an estimate
    more than a splice may)."""
    years = sorted({m // 100 for m in P.months})
    miss = ~P.FI & P.FX
    spl = spliceable(P)
    nobody = ~P.FI & ~P.FX
    stats = {"pair_years": 0, "skipped": 0}
    rows = np.flatnonzero(miss.any(1))
    yc = {y: [j for j, m in enumerate(P.months) if m // 100 == y] for y in years}
    for i in rows:
        s, t = int(P.s[i]), int(P.t[i])
        idx, grp, targets = [], [], {}
        for y in years:
            js = yc[y]
            if len(js) < 12 or (y, t) not in filed_a:
                continue
            mj = [j for j in js if miss[i, j]]
            if not mj or nobody[i, js].any() or (~P.FI[i, js] & ~miss[i, js]).any():
                continue
            target = annual.get((y, s, t), 0.0) - float((P.VM[i, js] * P.FI[i, js]).sum())
            ind = P.VX[i, mj]
            pre = float((np.where(spl[i, mj], np.nan_to_num(P.K[i, mj]), CIF_FOB) * ind).sum())   # the estimate before it
            if target <= 0 or ind.sum() <= 0 or target > SPLICE_MAX * pre:
                stats["skipped"] += 1
                continue
            keep = [j for j in mj if P.VX[i, j] > 0]
            idx += keep
            grp += [y] * len(keep)
            targets[y] = target
        if not idx:
            continue
        x = denton_prop(P.VX[i, idx], np.array(grp), targets)
        P.B[i, idx] = np.maximum(x, 0.0)
        stats["pair_years"] += len(targets)
    return stats


# -- one window --------------------------------------------------------------------------------------


def window_values(P: Panel, j: int, w: int) -> dict:
    """Every flow's value over the window of w months ending at column j (the sum of the drawn series Y: reported
    months plus estimated ones); the estimated part; the worst estimate code; whether every month is positive; the
    mirror ratio where both reports are positive in every month."""
    c = slice(j - w + 1, j + 1)
    fi, fx, vm, vx = P.FI[:, c], P.FX[:, c], P.VM[:, c], P.VX[:, c]
    value = P.Y[:, c].sum(1)
    est = np.where(P.MISS[:, c], P.Y[:, c], 0.0).sum(1)
    code = P.C[:, c].max(1)
    pos = P.POS[:, c].all(1) & (value > 0)
    ky = np.where(P.C[:, c] == 2, P.KY[:, c], 9999).min(1)   # the oldest anchor among the window's spliced months
    ky = np.where(ky == 9999, 0, ky)
    both = fi.all(1) & fx.all(1) & (vm > 0).all(1) & (vx > 0).all(1)
    px = vx.sum(1)
    with np.errstate(divide="ignore", invalid="ignore"):
        mr = np.where(both & (code == 0), value / px, np.nan)
    return {"value": value, "est": est, "code": code, "pos": pos, "mr": mr, "vx": np.where(both, px, np.nan), "ky": ky}


def edges_from(P: Panel, V: dict) -> dict:
    """The window's flows as build_snapshots.metrics() reads them (published flows only)."""
    keep = V["pos"]
    vm = np.where(np.isfinite(V["mr"]), V["value"], np.nan)[keep]
    vx = V["vx"][keep]
    src = V["code"][keep] == 0    # the importer's own report; estimates are flagged by their code
    return {"s": P.s[keep], "t": P.t[keep], "w": V["value"][keep], "vx": vx, "vm": vm, "src": src,
            "kg": np.zeros(int(keep.sum())), "vk": np.zeros(int(keep.sum())),
            "code": V["code"][keep], "est": V["est"][keep], "ky": V["ky"][keep], "idx": np.flatnonzero(keep)}


# -- the leak test -----------------------------------------------------------------------------------


def single_month_in_span(rows: list[np.ndarray]) -> bool:
    """Whether some unit vector (a single month of one report) lies in the span of the published rows."""
    if not rows:
        return False
    A = np.vstack(rows)
    used = np.flatnonzero(np.abs(A).sum(0) > 0)
    A = A[:, used]
    ev, vec = np.linalg.eigh(A.T @ A)
    Vr = vec[:, ev > ev.max() * 1e-10]
    # the projection of e_j on the row space has length² = Σ Vr[j]²; 1 means e_j lies in it
    return bool(((Vr ** 2).sum(1) > 1 - 1e-6).any())


def flow_rows(P: Panel, i: int, published: list[tuple[int, int, bool]]) -> list[np.ndarray]:
    """The coefficient rows a reader has for flow i. Unknowns: the drawn series and the exporter's report in each
    month (2T). A published window (j, w, mirror ratio shown) gives the drawn value's row, and the exporter's sum
    when the mirror ratio is shown (value ÷ ratio)."""
    T = len(P.months)
    rows = []
    for j, w, has_mr in published:
        r = np.zeros(2 * T)
        r[j - w + 1:j + 1] = 1.0
        rows.append(r)
        if has_mr:
            r2 = np.zeros(2 * T)
            r2[T + j - w + 1:T + j + 1] = 1.0
            rows.append(r2)
    return rows


# -- divergence ----------------------------------------------------------------------------------------


def divergence(P: Panel, ends: list[int]) -> dict[int, dict[tuple[int, int], list]]:
    """{t: {(s, t): [ratio, median, MAD, direction]}} for the flagged flows: the 12-month mirror ratio (both sides
    filed every month, both positive) outside median ± k MAD of the 36 preceding months' ratios."""
    w = DIV["w"]
    T = len(P.months)
    R = np.full((len(P), T), np.nan)
    world = np.full(T, np.nan)
    for j in range(w - 1, T):
        c = slice(j - w + 1, j + 1)
        ok = (P.FI[:, c] & P.FX[:, c]).all(1) & (P.VM[:, c] > 0).all(1) & (P.VX[:, c] > 0).all(1)
        R[ok, j] = P.VM[ok, c].sum(1) / P.VX[ok, c].sum(1)
        world[j] = np.maximum(P.VM[:, c].sum(1), P.VX[:, c].sum(1)).sum()
    out: dict[int, dict] = {}
    for t in ends:
        j = P.col.get(t)
        if j is None or j < DIV["history"] + w - 1:
            continue
        hist = R[:, j - DIV["history"]:j]
        n = np.isfinite(hist).sum(1)
        cur = R[:, j]
        size = np.maximum(P.VM[:, j - w + 1:j + 1].sum(1), P.VX[:, j - w + 1:j + 1].sum(1))
        cand = np.flatnonzero(np.isfinite(cur) & (n >= DIV["min_history"]) & (size >= DIV["min_share"] * world[j]))
        if not len(cand):
            continue
        med = np.nanmedian(hist[cand], axis=1)
        mad = np.nanmedian(np.abs(hist[cand] - med[:, None]), axis=1)
        half = np.maximum(DIV["k"] * mad, DIV.get("floor", 0.0) * med)
        lo, hi = med - half, med + half
        flag = (half > 0) & ((cur[cand] < lo) | (cur[cand] > hi))
        d = {}
        for i, f, m_, md in zip(cand[flag], cur[cand][flag], med[flag], mad[flag]):
            d[(int(P.s[i]), int(P.t[i]))] = [sig(f, 3), sig(m_, 3), sig(md, 3), 1 if f < m_ else 2]
        if d:
            out[t] = d
    return out


# -- diagnostics (tier 0, offline) ----------------------------------------------------------------------


def diagnostics(P: Panel, node_size: np.ndarray) -> dict:
    """The timing diagnostic and the splice backtest over complete months (DIAG). Only aggregates are returned."""
    T = len(P.months)
    lo, hi = P.col.get(DIAG["from"]), P.col.get(DIAG["to"])
    if lo is None or hi is None:
        return {}
    both = P.FI & P.FX & (P.VM > 0) & (P.VX > 0)
    # timing: within-flow variance of the log mirror ratio at w = 1, 3, 12 (flows with both sides every month)
    timing = {}
    full = both[:, lo:hi + 1].all(1)
    sel = np.flatnonzero(full)
    if len(sel):
        size = P.VM[sel, lo:hi + 1].sum(1)
        big = size >= DIAG["min_share"] * P.VM[:, lo:hi + 1].sum()
        sel, size = sel[big], size[big]
    for w in (1, 3, 12):
        if not len(sel):
            break
        ends = [j for j in range(lo + w - 1, hi + 1) if valid_end(P.months[j], w) or w == 1]
        L = np.array([np.log(P.VM[sel, j - w + 1:j + 1].sum(1) / P.VX[sel, j - w + 1:j + 1].sum(1)) for j in ends]).T
        var = L.var(axis=1)
        timing[w] = {"pooled": float(np.average(var, weights=size)), "median": float(np.median(var))}
    if timing:
        timing_out = {"flows": int(len(sel)), "var": {str(w): {k: sig(v, 3) for k, v in d.items()} for w, d in timing.items()},
                      "share_w3": sig(1 - timing[3]["pooled"] / timing[1]["pooled"], 3),
                      "share_w12": sig(1 - timing[12]["pooled"] / timing[1]["pooled"], 3),
                      "share_w3_median": sig(float(np.median(1 - _ratio(P, sel, lo, hi, 3) )), 3)}
    else:
        timing_out = {"flows": 0}
    # backtest: hide windows the importer did report, splice them, compare with the partner's report as is
    q = np.quantile(node_size[node_size > 0], [0.25, 0.5, 0.75]) if (node_size > 0).any() else np.zeros(3)
    back = {}
    K12, A12 = np.full(P.R12.shape, np.nan), np.full(P.R12.shape, np.nan)
    K12[:, 12:], A12[:, 12:] = P.R12[:, :-12], P.O12[:, :-12] / 12
    for w in WINDOWS:
        errs, errm, base, sizes = [], [], [], []
        for j in range(max(lo, w - 1 + 12), hi + 1):
            if not valid_end(P.months[j], w):
                continue
            c, c0 = slice(j - w + 1, j + 1), slice(j - w + 1 - 12, j + 1 - 12)
            ok = both[:, c].all(1) & both[:, c0].all(1)
            O, Pn = P.VM[ok, c].sum(1), P.VX[ok, c].sum(1)
            O0, P0 = P.VM[ok, c0].sum(1), P.VX[ok, c0].sum(1)
            world = P.VM[:, c].sum()
            big = O >= DIAG["min_share"] * world
            est = O0[big] * Pn[big] / P0[big]
            errs.append(np.abs(est / O[big] - 1))
            # as built: κ(m) × partner(m) summed over the window, κ from the 12 months ending a year earlier
            km, cap, px = K12[ok, c][big], SPLICE_MAX * A12[ok, c][big], P.VX[ok, c][big]
            with np.errstate(invalid="ignore"):
                ym = np.where(np.nan_to_num(km) * px <= cap, np.nan_to_num(km) * px, px)   # the cap: partner-only
            estm = np.where(np.isfinite(km).all(1), ym.sum(1), np.nan)
            errm.append(np.abs(estm / O[big] - 1))
            base.append(np.abs(Pn[big] / O[big] - 1))
            sizes.append(node_size[P.t[ok][big]])
        if not errs:
            continue
        e, em, b, sz = np.concatenate(errs), np.concatenate(errm), np.concatenate(base), np.concatenate(sizes)
        bucket = np.searchsorted(q, sz, side="right")   # 0 smallest quartile of importers ... 3 largest

        def score(x):
            x = x[np.isfinite(x)]
            return {"n": int(len(x)), "mdape": sig(float(np.median(x)) * 100, 3) if len(x) else None,
                    "p90": sig(float(np.quantile(x, 0.9)) * 100, 3) if len(x) else None}

        cells = {"all": np.ones(len(e), dtype=bool)} | {f"q{k + 1}": bucket == k for k in range(4)}
        back[str(w)] = {name: {"n": int(sel.sum()), "splice": score(em[sel]), "splice_window": score(e[sel]),
                               "partner": score(b[sel])} for name, sel in cells.items()}
    return {"months": [DIAG["from"], DIAG["to"]], "timing": timing_out, "backtest": back,
            "size_quartiles_usd": [sig(float(x), 3) for x in q]}


def _ratio(P: Panel, sel: np.ndarray, lo: int, hi: int, w: int) -> np.ndarray:
    """Per flow: var(log mirror ratio at w) / var(at w = 1)."""
    def var(w_):
        ends = [j for j in range(lo + w_ - 1, hi + 1) if w_ == 1 or valid_end(P.months[j], w_)]
        L = np.array([np.log(P.VM[sel, j - w_ + 1:j + 1].sum(1) / P.VX[sel, j - w_ + 1:j + 1].sum(1)) for j in ends]).T
        return L.var(axis=1)
    v1 = var(1)
    return np.where(v1 > 0, var(w) / np.where(v1 > 0, v1, 1), 1.0)


# -- one product ---------------------------------------------------------------------------------------


# Nodes add `est`, the code of most of the economy's estimated imports. The estimated share of an economy's imports
# is not written: with it, the reported part of a partly filed window would be a sum over fewer months than the window.
EDGE_COLS_W = ["s", "t", "w", "ro", "ri", "mr", "src", "est", "dv", EDGE_EST_YEAR]

_LAYER: bs.Layer | None = None
_CTX: dict = {}


def _init(node_index: dict[str, int], ctx: dict) -> None:
    global _LAYER, _CTX
    _LAYER = bs.Layer(node_index)
    _CTX = ctx


def hs2_product(p: dict) -> dict | None:
    """The HS2 chapters of a chain stage, as one pseudo product (the divergence guard's level for stages)."""
    if p["kind"] != "stage":
        return None
    chs = sorted({c[:2] for c in p["codes"]})
    return {"id": "HS2:" + ",".join(chs), "kind": "chapter", "codes": chs}


def div_job(key: str, p: dict) -> dict:
    """Divergence flags of a pseudo product (all goods or a stage's chapters), for every 12-month window end."""
    L, ctx = _LAYER, _CTX
    first = bs.FIRST_MONTH["TOTAL" if p["kind"] == "total" else "other"]
    lo = max(200001, add_months(first, -HISTORY))
    P = load_panel(L, p, lo, ctx["last"], ctx["n_nodes"], name="d")
    if P is None:
        return {"key": key, "flags": {}}
    flags = divergence(P, window_ends(first, ctx["last"], 12))
    return {"key": key, "flags": {t: {f"{a}>{b}": v for (a, b), v in d.items()} for t, d in flags.items()}}


def build_product(p: dict, div_flags: dict[int, dict[str, list]], events: list[dict]) -> dict:
    L, ctx = _LAYER, _CTX
    out = Path(ctx["out"])
    t0 = time.time()
    total = p["kind"] == "total"
    first = bs.FIRST_MONTH["TOTAL" if total else "other"]
    hi = ctx["last"]
    lo = max(200001, add_months(first, -HISTORY))
    P = load_panel(L, p, lo, hi, ctx["n_nodes"])
    if P is None:
        return {"id": p["id"], "bytes": 0, "files": 0}
    rule = apply_rule(L, p, P, ctx["n_nodes"])   # the one monthly rule: no-row months, benchmark, composite
    bstats = rule["benchmark"]
    # importer size for the backtest buckets: imports in 2024 from the panel
    c24 = [P.col[m] for m in P.months if m // 100 == 2024]
    node_size = np.bincount(P.t, weights=P.VM[:, c24].sum(1) if c24 else np.zeros(len(P)), minlength=ctx["n_nodes"])

    nbytes = nfiles = 0
    series: dict[str, list] = {}
    node_x: dict[str, dict[int, dict[int, float]]] = {}
    node_m: dict[str, dict[int, dict[int, float]]] = {}
    flow_w: dict[str, dict[tuple[int, int], dict[int, float]]] = {}
    flow_mr: dict[str, dict[tuple[int, int], dict[int, float]]] = {}
    flow_est: dict[str, dict[tuple[int, int], dict[int, int]]] = {}
    periods: dict[str, list[int]] = {}
    published: dict[int, list] = {}         # flow row -> [(j, w, code, κ, mr shown)] for the leak test
    div_out: dict[str, dict[str, list]] = {}
    est_world: dict[str, dict[int, list]] = {}
    pos_drop: dict[str, list[float]] = {}
    node_c: dict[str, dict[int, np.ndarray]] = {}
    for w in WINDOWS:
        track = bs.Completeness(ctx["n_nodes"], lambda q: add_months(q, -12))
        top = WIN_TOP[p["kind"]][w]
        wk = str(w)
        for year in range(first // 100, hi // 100 + 1):
            snaps = []
            for mm in range(1, 13):
                t = year * 100 + mm
                if t < first or t > hi or not valid_end(t, w):
                    continue
                j = P.col[t]
                V = window_values(P, j, w)
                E = edges_from(P, V)
                if not len(E["w"]):
                    continue
                allv = float(V["value"][V["value"] > 0].sum())
                pos_drop.setdefault(wk, []).append(1 - float(E["w"].sum()) / allv if allv else 0.0)
                reported = {int(n) for n in np.flatnonzero(P.NF[:, j - w + 1:j + 1].all(1))}
                res = bs.metrics(E, reported, full=(w == 12), top=top)
                world = res["world"]
                # estimate columns: per edge, per node
                code_of = {(int(a), int(b)): (int(c), int(y)) for a, b, c, y in zip(E["s"], E["t"], E["code"], E["ky"])}
                flags = div_flags.get(t, {}) if w == 12 else div_flags.get(_last_12(t), {})
                ids = [int(r[0]) for r in res["nodes"]]
                est_imp = np.bincount(E["t"], weights=E["est"], minlength=ctx["n_nodes"])
                by_code = np.zeros((5, ctx["n_nodes"]))
                for c in (1, 2, 3, 4):
                    sel = E["code"] == c
                    by_code[c] = np.bincount(E["t"][sel], weights=E["est"][sel], minlength=ctx["n_nodes"])
                ky_of = anchor_year_by_node(E["t"], E["code"], E["est"], E["ky"])
                for r, g in zip(res["nodes"], ids):
                    ncode = int(np.argmax(by_code[1:, g]) + 1) if est_imp[g] > 0 else 0
                    r += [ncode, ky_of.get(g) if ncode == 2 else None]
                for r in res["edges"]:
                    key = f"{r[0]}>{r[1]}"
                    c, ky = code_of[(r[0], r[1])]
                    r += [c, flags[key][3] if key in flags else 0, ky if c == 2 and ky else None]
                    if key in flags and w == 12:
                        evs = match_events(events, p, meta_nodes(ctx), r[0], r[1], t)
                        div_out.setdefault(str(t), {})[key] = flags[key] + [evs]
                est_tot = float(E["est"].sum())
                by = [sig(float(E["est"][E["code"] == c].sum()) / world, 3) for c in (1, 2, 3, 4)]
                res["tot"]["est"] = sig(est_tot / world, 3)
                res["tot"]["est_by"] = by
                res["tot"]["dv"] = sum(1 for r in res["edges"] if r[-1])
                est_world.setdefault(wk, {})[t] = by
                snaps.append({"t": t, "win": [add_months(t, -(w - 1)), t], "world": round(world), "tot": res["tot"],
                              "comm": res["comm"], "nodes": res["nodes"], "edges": res["edges"]})
                periods.setdefault(wk, []).append(t)
                tot = res["tot"]
                c, cw = track.add(t, E["s"], E["t"], E["w"])
                node_c.setdefault(wk, {})[t] = c
                series.setdefault(wk, []).append([
                    t, round(world), tot["edges"], tot["nodes"], tot["reporters"], tot["imp_rep"], tot["hhi"],
                    tot["top1"], tot["top1_id"], tot["top5"], tot["hhi_sup"], tot["exporters"], tot["est"], tot["dv"],
                    round(cw, 2)])
                for g, v in res["_exports"].items():
                    node_x.setdefault(wk, {}).setdefault(g, {})[t] = v
                for g, v in res["_imports"].items():
                    node_m.setdefault(wk, {}).setdefault(g, {})[t] = v
                fs, ft, fw = E["s"], E["t"], E["w"]
                for k in np.argsort(-fw)[:2000]:
                    k2 = (int(fs[k]), int(ft[k]))
                    flow_w.setdefault(wk, {}).setdefault(k2, {})[t] = fw[k] / world
                    flow_est.setdefault(wk, {}).setdefault(k2, {})[t] = int(E["code"][k])
                    if np.isfinite(E["vm"][k]) and E["vx"][k] > 0:
                        flow_mr.setdefault(wk, {}).setdefault(k2, {})[t] = E["vm"][k] / E["vx"][k]
                n = ctx["n_nodes"]
                kept = np.array([r[0] * n + r[1] for r in res["edges"]], dtype=np.int64)
                mask = np.isin(E["s"] * n + E["t"], kept)
                mask[np.argsort(-fw)[:2000]] = True
                for i in E["idx"][mask]:
                    published.setdefault(int(i), []).append((j, w, bool(np.isfinite(V["mr"][i]))))
            if snaps:
                bundle = {"v": 1, "p": p["id"], "f": "W", "w": w, "year": year, "rule": "window",
                          "ncols": (bs.NODE_COLS_FULL if w == 12 else bs.NODE_COLS) + ["est", EDGE_EST_YEAR],
                          "ecols": EDGE_COLS_W, "snaps": snaps}
                nbytes += write_json(out / "snap" / "W" / p["slug"] / f"{year}.w{w}.json", bundle)
                nfiles += 1
    cols = ["t", "world", "edges", "nodes", "reporters", "imp_rep", "hhi", "top1", "top1_id", "top5", "hhi_sup",
            "exporters", "est", "dv", "cmp"]
    nbytes += write_json(out / "series" / "W" / f"{p['slug']}.json", {"p": p["id"], "f": "W", "cols": cols, "rows": series})
    nodes_out = {}
    for wk in node_x:
        peak: dict[int, float] = {}
        for d in (node_x[wk], node_m.get(wk, {})):
            for g, by in d.items():
                peak[g] = max(peak.get(g, 0.0), max(by.values()))
        ids = sorted(peak, key=lambda g: -peak[g])[:bs.SERIES_NODES]
        ps = periods.get(wk, [])
        nodes_out[wk] = {"t": ps, "ids": ids,
                         "x": [[sig(node_x[wk].get(g, {}).get(q), 4) for q in ps] for g in ids],
                         "m": [[sig(node_m.get(wk, {}).get(g, {}).get(q), 4) for q in ps] for g in ids],
                         "c": [[round(float(node_c[wk][q][g]), 2) for q in ps] for g in ids]}
    nbytes += write_json(out / "nodes" / "W" / f"{p['slug']}.json", {"p": p["id"], "f": "W", **nodes_out})
    flows_out = {}
    for wk, by in flow_w.items():
        peak2 = {k2: max(v.values()) for k2, v in by.items()}
        keys2 = sorted(peak2, key=lambda k2: -peak2[k2])[:bs.SERIES_FLOWS]
        ps = periods.get(wk, [])
        flows_out[wk] = {"t": ps, "flows": [list(k2) for k2 in keys2],
                         "w": [[sig(by[k2].get(q), 3) for q in ps] for k2 in keys2],
                         "mr": [[sig(flow_mr.get(wk, {}).get(k2, {}).get(q), 3) for q in ps] for k2 in keys2],
                         "est": [[flow_est.get(wk, {}).get(k2, {}).get(q) for q in ps] for k2 in keys2]}
    nbytes += write_json(out / "flows" / "W" / f"{p['slug']}.json", {"p": p["id"], "f": "W", **flows_out})
    nfiles += 3
    level = "TOTAL" if total else ("HS2" if p["kind"] == "stage" else None)
    if level:
        nbytes += write_json(out / "div" / f"{p['slug']}.json",
                             {"p": p["id"], "level": level, "rule": DIV, "cols": ["r", "med", "mad", "dir", "events"],
                              "t": div_out})
        nfiles += 1
    # the leak test: the largest flows with an estimated or partly filed window, and a sample of the others
    leaks, tested = [], 0
    rng = np.random.default_rng(7)
    irregular, regular = [], []
    for i, pub in published.items():
        odd = not all(P.FI[i, j - w + 1:j + 1].all() for j, w, _ in pub)
        (irregular if odd else regular).append(i)
    peak = P.VM.max(1) + P.VX.max(1)
    irregular.sort(key=lambda i: -peak[i])
    sample = irregular[:LEAK_TEST["irregular"]] + list(rng.permutation(regular)[:LEAK_TEST["regular"]])
    for i in sample:
        tested += 1
        if single_month_in_span(flow_rows(P, int(i), published[int(i)])):
            leaks.append(f"{ctx['nodes'][int(P.s[i])]}>{ctx['nodes'][int(P.t[i])]}")
    diag = diagnostics(P, node_size)
    diag.update({"p": p["id"], "benchmark": bstats, "rowless": {"interpolated": rule["interpolated"], "unfiled": rule["unfiled"], "zero_reads": rule["zero_reads"]}, "leak_test": {"flows": tested, "single_month": len(leaks), "examples": leaks[:10]},
                 "dropped_share": {wk: sig(float(np.mean(v)), 3) for wk, v in pos_drop.items()},
                 "est_world": {wk: {str(t): v for t, v in d.items()} for wk, d in est_world.items()}})
    nbytes += write_json(out / "diag" / f"{p['slug']}.json", diag)
    nfiles += 1
    return {"id": p["id"], "periods": periods, "bytes": nbytes, "files": nfiles, "sec": round(time.time() - t0, 1),
            "leaks": len(leaks), "leak_tested": tested, "zero_reads": rule["zero_reads"]}


def anchor_year_by_node(side: np.ndarray, code: np.ndarray, est: np.ndarray, ky: np.ndarray) -> dict[int, int]:
    """Per economy (the `side` of each flow: importers for imports), the anchor year holding most of its spliced
    value: "spliced on <year>"."""
    sel = (code == 2) & (ky > 0)
    if not sel.any():
        return {}
    acc: dict[tuple[int, int], float] = {}
    for g, y, v in zip(side[sel].tolist(), ky[sel].tolist(), est[sel].tolist()):
        acc[(g, y)] = acc.get((g, y), 0.0) + v
    best: dict[int, tuple[float, int]] = {}
    for (g, y), v in acc.items():
        if g not in best or v > best[g][0]:
            best[g] = (v, y)
    return {g: y for g, (v, y) in best.items()}


def _last_12(t: int) -> int:
    """The divergence flags shown at a 3- or 6-month window are those of the 12-month window ending in the same
    month (or the month before, when the 12-month window may not end there)."""
    return t if valid_end(t, 12) else add_months(t, -1)


def meta_nodes(ctx: dict) -> list[str]:
    return ctx["nodes"]


def match_events(events: list[dict], p: dict, nodes: list[str], s: int, t: int, end: int) -> list[str]:
    """The events whose code bundle includes the product and that overlap the 12-month window ending in `end`;
    when an event names economies, one end of the flow must be among them."""
    a = add_months(end, -11)
    out = []
    for e in events:
        if p["id"] not in e.get("products", []) and not set(p.get("aliases", [])) & set(e.get("products", [])):
            continue
        st = int(str(e["start"])[:7].replace("-", ""))
        en = int(str(e["end"])[:7].replace("-", "")) if e.get("end") else 999912
        if st > end or en < a:
            continue
        ecs = e.get("economies") or []
        if ecs and nodes[s] not in ecs and nodes[t] not in ecs:
            continue
        out.append(e["id"])
    return out


# -- meta ------------------------------------------------------------------------------------------------


def add_to_meta(out: Path) -> dict:
    """Adds the windows to meta.json: each product's first and last window, the window ends, the estimate codes
    and the rules. Called by this script and by build_snapshots.py when it rewrites meta.json."""
    meta = read_json(out / "meta.json")
    for p in meta["products"]:
        sf = out / "series" / "W" / f"{p['slug']}.json"
        if not sf.with_name(sf.name + ".br").exists():
            p.pop("W", None)
            p.pop("M", None)
            continue
        raw = read_json(sf)
        rows = raw["rows"].get("12", [])
        if rows:
            # one monthly rule: a product's months are its windows' ends
            p["W"] = p["M"] = [rows[0][0], rows[-1][0]]
            if p["id"] == "TOTAL" and "cmp" in raw["cols"]:
                shown = bs.shown_period(rows, raw["cols"])
                meta.setdefault("shown", {})["W"] = meta["shown"]["M"] = shown
    for p in meta["products"]:
        p.pop("lenses", None)   # the monthly lenses (snap/M) are retired
    meta["windows"] = {"w": list(WINDOWS), "default": 12, "est": EST, "cif_fob": CIF_FOB, "anchor_max": ANCHOR_MAX,
                       "anchor_kept": True,
                       "div": DIV, "skip": {str(w): sorted({m for m in range(1, 13) if not valid_end(2020 * 100 + m, w)})
                                            for w in WINDOWS}}
    write_json(out / "meta.json", meta)
    return meta


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--out", default=str(HERE / "data"))
    ap.add_argument("--only", help="comma list of product ids (default: every monthly product)")
    ap.add_argument("--workers", type=int, default=max(1, (os.cpu_count() or 4) - 4))
    a = ap.parse_args()
    out = Path(a.out)
    t0 = time.time()
    meta = read_json(out / "meta.json")
    node_index = {n["id"]: i for i, n in enumerate(meta["nodes"])}
    net_cfg = yaml.safe_load(bs.NETWORK_YAML.read_text())
    chains = yaml.safe_load((HERE / "config" / "chains.yaml").read_text())["chains"]
    names_path = HERE / "config" / "names.yaml"
    names = yaml.safe_load(names_path.read_text()) if names_path.exists() else {}
    events = yaml.safe_load((HERE / "config" / "events.yaml").read_text())["events"]
    events = [{k: e.get(k) for k in ("id", "start", "end", "products", "economies")} for e in events]
    products = [p for p in bs.load_products(net_cfg, chains, names) if p["kind"] in ("total", "basket", "stage")]
    if a.only:
        want = set(a.only.split(","))
        products = [p for p in products if p["id"] in want or set(p.get("aliases", [])) & want]
    ctx = {"out": str(out), "last": meta["last"]["M"], "n_nodes": len(meta["nodes"]),
           "nodes": [n["id"] for n in meta["nodes"]]}

    # pass 1: divergence flags, all goods and the stages' chapters
    div_keys: dict[str, dict] = {}
    for p in products:
        if p["kind"] == "total":
            div_keys["TOTAL"] = p
        h = hs2_product(p)
        if h:
            div_keys[h["id"]] = h
    flags: dict[str, dict] = {}
    with ProcessPoolExecutor(max_workers=a.workers, initializer=_init, initargs=(node_index, ctx)) as pool:
        futs = {pool.submit(div_job, k, p): k for k, p in div_keys.items()}
        for i, fut in enumerate(as_completed(futs), 1):
            r = fut.result()
            flags[r["key"]] = {int(t): d for t, d in r["flags"].items()}
            print(f"[div {i}/{len(futs)}] {r['key']}: {sum(len(d) for d in r['flags'].values())} flagged flow-months",
                  file=sys.stderr, flush=True)
    # pass 2: the windows
    weight = {"total": 0, "basket": 1, "stage": 2}
    products.sort(key=lambda p: weight[p["kind"]])
    results = []
    with ProcessPoolExecutor(max_workers=a.workers, initializer=_init, initargs=(node_index, ctx)) as pool:
        futs = {}
        for p in products:
            key = "TOTAL" if p["kind"] == "total" else (hs2_product(p) or {}).get("id")
            futs[pool.submit(build_product, p, flags.get(key, {}), events)] = p["id"]
        for i, fut in enumerate(as_completed(futs), 1):
            r = fut.result()
            results.append(r)
            print(f"[{i}/{len(futs)}] {r['id']}: {r['files']} files, {r['bytes'] / 1e6:.1f} MB, {r.get('sec', 0)} s,"
                  f" leak test {r.get('leaks', 0)}/{r.get('leak_tested', 0)}", file=sys.stderr, flush=True)
    meta = add_to_meta(out)
    if not a.only:   # the monthly lenses are retired: no stale copy is served
        for d in RETIRED:
            shutil.rmtree(out / d, ignore_errors=True)
    # the chain files' monthly strips read series/W: written again from the new windows
    all_products = bs.load_products(net_cfg, chains, names)
    bs.assemble_chains(out, chains, names, all_products, node_index, meta["complete"]["A"])
    bs.write_surface(out, meta)   # the shown window changed with the series
    leaks = sum(r.get("leaks", 0) for r in results)
    build = {"built_at": date.today().isoformat(), "sec": round(time.time() - t0),
             "files": sum(r["files"] for r in results), "bytes": sum(r["bytes"] for r in results),
             "records": meta["records"], "leaks": leaks,
             "jobs": [{k: r[k] for k in ("id", "files", "bytes", "sec", "leaks", "leak_tested") if k in r} for r in results]}
    write_json(out / "build-windows.json", build)
    print(f"done: {build['files']} files, {build['bytes'] / 1e6:.1f} MB, {build['sec']} s; original records"
          f" {meta['records']['originals']}; single months in span: {leaks}", file=sys.stderr)
    if leaks:
        print("refusing: a single month can be computed from the published windows (see diag/*.json)", file=sys.stderr)
        return 1
    zr = {r["id"]: r["zero_reads"] for r in results if r.get("zero_reads")}
    if zr:   # K5: a filed month with no row of the product read as a reported zero (L2)
        print(f"refusing: flow-months read as reported zeros where the importer sent no row (K5): {zr}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

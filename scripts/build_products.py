# /// script
# requires-python = ">=3.11"
# dependencies = ["duckdb==1.5.6", "networkx==3.6.1", "numpy==2.4.6", "scipy==1.17.1", "pyyaml==6.0.3",
#                 "brotli==1.1.0"]
# ///
"""Exports and imports by HS chapter of each economy over 12-month windows: data/products.json (the export surface
global-network's country sheets and Overview read; docs/SURFACES.md).

    uv run scripts/build_products.py                 # after build_windows.py; writes data/products.json.br
    uv run scripts/build_products.py --workers 8 --only 27,30,87

Moved from global-network/scripts/build_products.py on 2 Nov 2026. The windows are this
site's (`build_windows.py`), run on the HS chapters it does not window itself: the importer's report where it
filed, else the exporter's report spliced, benchmarked or taken as is; a flow counts in a window only when positive in
every month. One addition for chapters: a reporter that filed a month but sent no row of the chapter in a direction did
not file that chapter; the month is interpolated from its neighbours (code 4) or left to the partners
(chapter_filed). An economy's exports in a chapter are the sum of its published flows as exporter, its imports the sum
as importer; the world total is the sum of every published flow. Chapters are `load_products`' (77, 98 and 99 are
left out, so they stay in the residual "other" on the pages).

Window ends: the 36 months to the shown month (`meta.shown.W`) and the year before them, so a reader can pick each
economy's own shown month (the last window complete for it, up to two years before the world's) and its year-earlier
window. Economies: those with an all-goods 12-month line (`nodes/W/TOTAL.json`, the 100 largest by peak trade). The
file carries aggregates by economy and chapter and internal estimate shares; readers publish values, shares of the
economy's total and changes only.

Check: at the shown month, each economy's chapter sum (the 96 chapters plus chapter 99, windowed here for the check
only, never written) is compared with its all-goods 12-month window from `snap/W/TOTAL`; the extremes are printed,
and the build fails when an economy with at least CHECK_MIN_USD on a side is outside CHECK_TOL and not in
CHECK_EXCEPTIONS. The ratios are written under `check` so a reader can show them.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import sys
import time
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

for _k in ("OPENBLAS_NUM_THREADS", "OMP_NUM_THREADS", "MKL_NUM_THREADS"):
    os.environ.setdefault(_k, "1")

import numpy as np  # noqa: E402
import yaml  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_snapshots as bs  # noqa: E402
import build_windows as bw  # noqa: E402

HERE = bs.HERE
SPAN = 36   # window ends: the 36 months to the shown month (an economy's own month can lag the world's by two years: China)
BACK = SPAN + 12 + 24 + 12   # months loaded: the year-earlier window, the 24-month splice anchor and its own 12 months
CHECK_CHAPTERS = ["99"]      # windowed for the check only (the monthly HS2 layer holds no 77 or 98)
CHECK_TOL = 0.02             # the world: |Σ chapter world totals / all-goods world − 1| allowed at the shown month (0.988 on 2 Nov 2026)
CHECK_BAND = (0.90, 1.07)    # an economy's side: chapter sum / all-goods window, where it reported every month
CHECK_MIN_USD = 1e9          # a side under this in the all-goods window is not checked (thin economies)
# economies outside CHECK_BAND for a known reason, by ISO3: {side: reason}; side "x" exports, "m" imports
CHECK_EXCEPTIONS: dict[str, dict[str, str]] = {
    "GEO": {"x": "re-exported cars (HS 87) to Kyrgyzstan and Kazakhstan, whose import files hold a fraction of Georgia's"
                 " figure for some months only, so the chapter and the all-goods windows draw different sides (0.65 on 2 Nov 2026)"},
    "AZE": {"x": "crude oil (HS 27): the chapter flows to its European buyers fall short of the same partners' all-goods"
                 " flows under the positive-months rule (0.87 on 2 Nov 2026)"},
    "KAZ": {"x": "crude oil (HS 27, 8.4 of 69.5 bn USD at the importers), copper (74), salt and sulphur (25) and inorganic"
                 " chemicals (28): cargoes that miss months at the importers fall out of the chapter windows under the"
                 " positive-months rule, as for AZE (0.86 on 12 Nov 2026, the first build in which Kazakhstan reported"
                 " every month of the window, to 2026-08)"},
    "HKG": {"x": "re-exports to importers that stopped filing monthly (Vietnam after 2023-12, the United Arab Emirates after"
                 " 2019-12): since 17 Nov 2026 a splice keeps the importer's last anchor however old, so"
                 " the all-goods flows read Hong Kong's exports to them at the importers' own level (Vietnam about a sixth of"
                 " Hong Kong's report), while many chapter flows have no anchor of their own and stay at Hong Kong's report"
                 " times 1.06 (1.18 on 17 Nov 2026)"},
    "UZB": {"x": "gold (HS 71): nearly every gold flow the importers report misses a month in the window (5.7 bn USD over"
                 " the 12 months to 2026-07), so the chapter drops out under the positive-months rule while all goods"
                 " stays (0.65 on 12 Nov 2026, the first build in which Uzbekistan reported every month)"},
}

_L = None
_CTX: dict = {}


def _init(node_index: dict[str, int], ctx: dict) -> None:
    global _L, _CTX
    _L = bs.Layer(node_index)
    _CTX = ctx


def chapter_filed(P: "bw.Panel", n: int) -> tuple[np.ndarray, int, int]:
    """A reporter that filed a month but sent no row of the chapter (Japan's April 2026 imports carry no chapter 84 or
    85): build_windows.product_filed, the one rule for every monthly product since 17 Nov 2026."""
    return bw.product_filed(P, n)


def chapter_job(p: dict) -> dict:
    """One chapter: per window end, the world total and each economy's exports and imports with their estimated parts."""
    L, ctx = _L, _CTX
    lo, hi, n = ctx["lo"], ctx["hi"], ctx["n_nodes"]
    P = bw.load_panel(L, p, lo, hi, n)
    out = {"ch": p["codes"][0], "world": {}, "econ": {}, "interpolated": 0, "unfiled": 0}
    if P is None:
        return out
    rule = bw.apply_rule(L, p, P, n)   # the one monthly rule (build_windows): no-row months, benchmark, composite
    out["interpolated"], out["unfiled"] = rule["interpolated"], rule["unfiled"]
    want = ctx["econ_idx"]
    for t in ctx["ends"]:
        if t not in P.col:
            continue
        V = bw.window_values(P, P.col[t], 12)
        E = bw.edges_from(P, V)
        if not len(E["w"]):
            continue
        out["world"][t] = float(E["w"].sum())
        x = np.bincount(E["s"], weights=E["w"], minlength=n)
        m = np.bincount(E["t"], weights=E["w"], minlength=n)
        xe = np.bincount(E["s"], weights=E["est"], minlength=n)
        me = np.bincount(E["t"], weights=E["est"], minlength=n)
        # the code holding most of the estimated value, per side (1 benchmarked, 2 spliced, 3 partner-only, 4 interpolated)
        bx = np.zeros((5, n))
        bm = np.zeros((5, n))
        for c in (1, 2, 3, 4):
            sel = E["code"] == c
            bx[c] = np.bincount(E["s"][sel], weights=E["est"][sel], minlength=n)
            bm[c] = np.bincount(E["t"][sel], weights=E["est"][sel], minlength=n)
        # spliced sides: the anchor's year ("spliced on 2024")
        kyx = bw.anchor_year_by_node(E["s"], E["code"], E["est"], E["ky"])
        kym = bw.anchor_year_by_node(E["t"], E["code"], E["est"], E["ky"])
        for iso, i in want.items():
            if x[i] <= 0 and m[i] <= 0:
                continue
            cx = int(np.argmax(bx[1:, i]) + 1) if xe[i] > 0 else 0
            cm = int(np.argmax(bm[1:, i]) + 1) if me[i] > 0 else 0
            out["econ"].setdefault(iso, {})[t] = [
                round(float(x[i])), round(float(m[i])),
                round(float(xe[i] / x[i]), 3) if x[i] > 0 else None, cx,
                round(float(me[i] / m[i]), 3) if m[i] > 0 else None, cm,
                kyx.get(i) if cx == 2 else None, kym.get(i) if cm == 2 else None]
    return out


def all_goods_window(out: Path, t: int) -> tuple[dict[int, tuple[float, float, int]], float]:
    """Each economy's exports and imports (USD) in the all-goods 12-month window ending in t and whether it reported
    every month of it (`r`), from the W snapshot; and the world total."""
    f = bs.read_json(out / "snap" / "W" / "TOTAL" / f"{t // 100}.w12.json")
    nc = {c: i for i, c in enumerate(f["ncols"])}
    s = next(s for s in f["snaps"] if s["t"] == t)
    return {r[nc["i"]]: (r[nc["x"]] * s["world"], r[nc["m"]] * s["world"], r[nc["r"]]) for r in s["nodes"]}, s["world"]


def chapter_sum_check(res: dict, econ_idx: dict[str, int], out: Path, shown: int, partial: bool) -> tuple[dict, list[str]]:
    """The chapter sums (the published chapters plus CHECK_CHAPTERS) against the all-goods window at the shown month.

    The two cannot agree to the percent by construction: a flow counts in a window only when positive in every month,
    and a chapter flow is lumpy where the all-goods flow is not (gold from Kyrgyzstan, soybeans into China, oil cargoes),
    so the chapter sum falls short of all goods by a few percent for reporters and by much more for economies whose
    all-goods window is itself the partners' estimate; chapter-specific splices can also put the sum a little above.
    What is enforced: the world within CHECK_TOL, and every reported side of at least CHECK_MIN_USD inside CHECK_BAND
    (a missing or broken chapter of a large economy falls outside it), unless listed in CHECK_EXCEPTIONS. Every ratio
    is printed at its extremes and written under `check`."""
    totals, world = all_goods_window(out, shown)
    ratios, fails = {}, []
    for iso, i in econ_idx.items():
        X, M, rep = totals.get(i, (0.0, 0.0, 0))
        sx = sum(r["econ"].get(iso, {}).get(shown, [0, 0])[0] for r in res.values())
        sm = sum(r["econ"].get(iso, {}).get(shown, [0, 0])[1] for r in res.values())
        row = {"x": round(sx / X, 4) if X else None, "m": round(sm / M, 4) if M else None, "r": rep}
        ratios[iso] = row
        if partial or not rep:
            continue
        for side, tot in (("x", X), ("m", M)):
            r = row[side]
            if tot < CHECK_MIN_USD or r is None or CHECK_BAND[0] <= r <= CHECK_BAND[1]:
                continue
            why = CHECK_EXCEPTIONS.get(iso, {}).get(side)
            if why:
                print(f"  check: {iso} {side} {r:.4f} of all goods, listed exception: {why}", file=sys.stderr)
            else:
                fails.append(f"{iso} {side} {r:.4f}")
    for side, word in (("x", "exports"), ("m", "imports")):
        for rep, kind in ((1, "reported"), (0, "estimated")):
            vals = sorted((v[side], iso) for iso, v in ratios.items() if v[side] is not None and v["r"] == rep)
            if vals:
                print(f"  check: chapters sum to {vals[0][0]:.4f} ({vals[0][1]}) - {vals[-1][0]:.4f} ({vals[-1][1]}) of"
                      f" {word} at {shown}, {len(vals)} economies with {kind} windows", file=sys.stderr)
    w_sum = sum(r["world"].get(shown, 0.0) for r in res.values())
    w_ratio = round(w_sum / world, 4) if world else None
    print(f"  check: the chapters' world totals sum to {w_ratio} of the all-goods world at {shown}", file=sys.stderr)
    if not partial and w_ratio is not None and abs(w_ratio - 1) > CHECK_TOL:
        fails.append(f"world {w_ratio}")
    return {"shown": shown, "tol": CHECK_TOL, "band": list(CHECK_BAND), "min_usd": CHECK_MIN_USD, "with": CHECK_CHAPTERS,
            "world": w_ratio, "econ": ratios, "exceptions": CHECK_EXCEPTIONS, "fails": fails}, fails


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--out", default=str(HERE / "data"))
    ap.add_argument("--workers", type=int, default=max(1, min(12, (os.cpu_count() or 4) - 4)))
    ap.add_argument("--only", help="comma list of chapters, e.g. 27,30 (default: every chapter; the check is then not enforced)")
    a = ap.parse_args()
    out = Path(a.out)
    t0 = time.time()
    meta = bs.read_json(out / "meta.json")
    node_index = {nd["id"]: i for i, nd in enumerate(meta["nodes"])}
    lines = bs.read_json(out / "nodes" / "W" / "TOTAL.json")["12"]
    # economies only: Asia, n.e.s. (meta.nodes[].nes) has no country sheet, though it is in the node series
    econs = [meta["nodes"][i]["id"] for i in lines["ids"] if not meta["nodes"][i].get("nes")]
    shown = meta["shown"]["W"]
    ends = [e for k in range(SPAN + 12 - 1, -1, -1) if bw.valid_end(e := bs.add_months(shown, -k), 12)]
    ctx = {"lo": bs.add_months(shown, -BACK), "hi": shown, "n_nodes": len(meta["nodes"]), "ends": ends,
           "econ_idx": {e: node_index[e] for e in econs}}
    net_cfg = yaml.safe_load(bs.NETWORK_YAML.read_text())
    chains = yaml.safe_load((HERE / "config" / "chains.yaml").read_text())["chains"]
    names = yaml.safe_load((HERE / "config" / "names.yaml").read_text())
    chapters = [p for p in bs.load_products(net_cfg, chains, names) if p["kind"] == "chapter"]
    if a.only:
        keep = set(a.only.split(","))
        chapters = [p for p in chapters if p["codes"][0] in keep]
    check_only = [{"id": f"HS:{ch}", "slug": f"HS-{ch}", "kind": "chapter", "codes": [ch], "en": ch, "ko": ch}
                  for ch in CHECK_CHAPTERS if not a.only]
    print(f"build_products: {len(chapters)} chapters (+{len(check_only)} for the check), {len(econs)} economies, "
          f"window ends {ends[0]}-{ends[-1]}, months {ctx['lo']}-{shown}, {a.workers} workers", file=sys.stderr)
    res, res_check = {}, {}
    with ProcessPoolExecutor(max_workers=a.workers, initializer=_init, initargs=(node_index, ctx)) as pool:
        futs = {pool.submit(chapter_job, p): p["codes"][0] for p in chapters + check_only}
        for i, fut in enumerate(as_completed(futs), 1):
            r = fut.result()
            (res_check if r["ch"] in CHECK_CHAPTERS else res)[r["ch"]] = r
            print(f"[{i}/{len(futs)}] HS {r['ch']}: {len(r['econ'])} economies, {r['interpolated']} node-months interpolated, {r['unfiled']} left to partners, {round(time.time() - t0)} s", file=sys.stderr, flush=True)
    econ: dict[str, dict] = {e: {} for e in econs}
    for ch, r in sorted(res.items()):
        for iso, by in r["econ"].items():
            econ[iso][ch] = {str(t): v for t, v in by.items()}
    check, fails = chapter_sum_check({**res, **res_check}, ctx["econ_idx"], out, shown, partial=bool(a.only))
    doc = {"read": dt.date.today().isoformat(), "trade_flow_built": meta.get("built_at"),
           "shown": shown, "ends": ends, "window": 12,
           "cols": ["x", "m", "x_est_share", "x_est_code", "m_est_share", "m_est_code", "x_est_year", "m_est_year"],
           "chapters": {ch: {"en": p["en"], "ko": p["ko"]} for p in chapters for ch in p["codes"][:1]},
           "world": {ch: {str(t): round(v) for t, v in r["world"].items()} for ch, r in sorted(res.items())},
           "econ": econ, "rule": "trade-flow build_windows: window_values + edges_from, 12 months",
           "check": check}
    if fails:
        print(f"refusing: {len(fails)} sides outside the band {CHECK_BAND} of the all-goods window at {shown} (the world:"
              f" {CHECK_TOL:.0%}) and not in CHECK_EXCEPTIONS: {', '.join(fails)}", file=sys.stderr)
        return 1
    if a.only:
        print("partial run (--only): data/products.json not written", file=sys.stderr)
        return 0
    size = bs.write_json(out / "products.json", doc)
    print(f"done: {out / 'products.json.br'} ({size / 1e6:.1f} MB) in {round(time.time() - t0)} s", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())

# /// script
# requires-python = ">=3.11"
# dependencies = ["duckdb==1.5.6", "networkx==3.6.1", "numpy==2.4.6", "scipy==1.17.1", "pyyaml==6.0.3",
#                 "brotli==1.1.0"]
# ///
"""The data of trade-flow.datasteg.com, precomputed from the Comtrade network layer.

    uv run scripts/build_snapshots.py                          # everything, into data/
    uv run scripts/build_snapshots.py --only TOTAL,C:batteries:cells --freqs A
    uv run scripts/build_snapshots.py --workers 20 --out /tmp/tf-data
    uv run scripts/build_snapshots.py --volume-only            # data/volume.json alone (the portal's Data chart)

Reads the network layer ($TRADE_COLLECTOR_DATA_ROOT/comtrade/network, default
data-in/comtrade/network, built by `comtrade network build`), config/chains.yaml,
config/names.yaml and trade-collector's config/network.yaml (groups, baskets). Monthly reads add the
Korea Customs Service supplement ($TRADE_COLLECTOR_DATA_ROOT/kcs/network, `kcs supplement`) for the
months Korea has not filed with Comtrade yet; Comtrade wins wherever it holds a month (layer(); --no-supplement reads Comtrade alone). Writes
brotli-compressed JSON (<path>.json.br) under data/, which the app serves at /data/<path>.json:

    meta.json                          economies, groups, products, the chains' ladders, periods, coverage, record count
    snap/A/<product>/<YYYY>.json       one year's network (TOTAL also .importer and .exporter)
    series/A/<product>.json            the strip: world trade, concentration, reporters per year
    nodes/A/<product>.json             exports and imports of the largest economies per year
    flows/A/<product>.json             share and mirror ratio of the largest flows per year

The months are build_windows.py's (snap/W, series/W, nodes/W, flows/W): one monthly rule (since
17 Nov 2026). The monthly lenses this script wrote before (snap/M, series/M, nodes/M, flows/M) are retired; check K4
fails if anything reads them.
    stages/<product>.json              chain stages: weight, unit value, top traders, two-way traders
    chains/<chain>.json, index.json    the chains (from the stage files) and the index page's lines
    econ/<chain>/<year>.json           every economy at every stage of a chain (for a focus economy)
    groups/memberships.json            regions, trade blocs and clubs with dated memberships
    build.json                         what was built, sizes, the record count, the checks
    volume.json                        plain JSON, not served: rows and bytes of each publisher's data as collected
                                       (also meta.volume), read by the www portal

Products: TOTAL (all goods), HS:<chapter>, B:<basket> (network.yaml) and C:<chain>:<stage>
(chains.yaml; a stage shared by two chains with the same codes is one product, named after the
first chain). File names write ':' as '-'.

Rules, as the local dashboard's (trade-collector/web/dashboard/netdata.py):

- Mirror rule (the annual rule): the importer's report where the importer filed for the year (HS files for HS
  products), else the exporter's report times CIF_FOB (1.06: the factor the monthly windows use wherever an
  exporter's report stands in for the importer's).
- Partner 490 ("Other Asia, not elsewhere specified") is its own node, ASIA_NES, never named Taiwan: a partner
  like any other in every measure, flagged `nes` so economy pages and lists leave it out.
- Backbone candidates: rank 10 or better among the exporter's destinations or the importer's
  suppliers, or at least 0.05% of world trade.
- Derived records: a flow is stored as its share of the product's world trade (3 significant
  digits), its two ranks and its mirror ratio; the snapshot carries one world total. No original
  bilateral record is written, and the build fails if more than 90,000 are.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import re
import sqlite3
import sys
import time
from collections.abc import Callable
from contextlib import closing
from concurrent.futures import ProcessPoolExecutor, as_completed
from datetime import UTC, datetime
from zoneinfo import ZoneInfo
from pathlib import Path

import brotli
import duckdb
import networkx as nx
import numpy as np
import scipy.sparse as sp
import yaml

HERE = Path(__file__).resolve().parent.parent
NET = Path(os.environ.get("TRADE_COLLECTOR_DATA_ROOT", "data-in")) / "comtrade" / "network"
# Korea's customs months that Comtrade does not hold yet (trade-collector `kcs supplement`)
KCS = Path(os.environ.get("TRADE_COLLECTOR_DATA_ROOT", "data-in")) / "kcs" / "network"
KCS_SOURCE = {"en": "Korea Customs Service, trade by item and country (data.go.kr)",
              "ko": "관세청 품목별 국가별 수출입실적(공공데이터포털)",
              "url": "https://www.data.go.kr/data/15100475/openapi.do"}
NETWORK_YAML = Path(os.environ.get(
    "TRADE_COLLECTOR_CONFIG",
    HERE.parent / "trade-collector" / "config" / "network.yaml"))

FIRST_YEAR = {"TOTAL": 1962, "other": 1995}
FIRST_MONTH = {"TOTAL": 200601, "other": 201401}  # snapshots; the first year serves as a base
LENS_MONTHS = {"L": 12, "M": 3, "S": 1}
RANK_KEEP = 10            # backbone candidates: rank <= 10 on either side ...
LARGE_SHARE = 5e-4        # ... or at least 0.05% of world trade
SERIES_NODES = 100        # node series for the 100 largest economies of a product
SERIES_FLOWS = 300        # flow series for the 300 largest flows
RECORD_BUDGET = 90_000    # original records allowed in the bundle (the FAQ's line is 100,000)
CHOKE_MIN_WORLD = 1e9     # a chokepoint stage trades at least $1bn ...
CHOKE_MIN_HHI = 0.25      # ... with an exporter HHI above 0.25
KG_COVERAGE_MIN = 0.8     # unit values only where net weight covers at least 80% of the value
# Two-way traders: an economy both imports and exports a stage when its Grubel-Lloyd index is at least gl and
# both its exports and its imports are at least `share` of world trade in the stage. The app reads the flags
# from the chain files; packages/net/src/twoway.ts holds the same numbers for the "reports disagree" marker.
TWO_WAY = {"gl": 0.3, "share": 0.02}
# One CIF/FOB factor wherever an exporter's report stands in for the importer's: the
# exporter's FOB report times 1.06 (the IMF DOTS convention), so every flow is valued CIF, as the importer records
# it. The annual mirror rule here and the monthly windows (build_windows.py) use the same factor.
CIF_FOB = 1.06
# Comtrade partner 490, "Other Asia, not elsewhere specified". trade-collector's
# nodes.parquet maps it to Taiwan; trade-flow reads it as a partner node of its own, named "Asia, not elsewhere
# specified" and never Taiwan. Taiwan does not report to UN Comtrade, so most importers book their Taiwan trade here,
# and Gulf exporters book unnamed Asian destinations here. It is a partner like any other in flows, shares, rankings,
# HHI and counts; it has no position, region or groups, and it is left out only where an economy identity is needed
# (the economies list and economy views, the find box, lender matching: meta.nodes[].nes). The node id is Comtrade's
# own code for the area; the measures registry (family/measures.json) names it asia_nes.
ASIA_NES = "S19"
NES_NODES = (ASIA_NES,)
NES_NAMES = {ASIA_NES: {"en": "Asia, not elsewhere specified"}}   # names on the pages: config/names.yaml
_CODE = re.compile(r"^\d{2}$|^\d{4}$|^\d{6}$")


def sig(x: float | None, n: int = 4) -> float | None:
    """x rounded to n significant digits (None and non-finite values as None)."""
    if x is None or not math.isfinite(x):
        return None
    if x == 0:
        return 0
    return float(f"{x:.{n}g}")


def slug(pid: str) -> str:
    return pid.replace(":", "-")


def write_json(path: Path, obj) -> int:
    """Write obj as <path>.br (brotli, quality 11, 16 MB window); returns the compressed size."""
    path.parent.mkdir(parents=True, exist_ok=True)
    raw = json.dumps(obj, separators=(",", ":"), ensure_ascii=False, allow_nan=False,
                     default=lambda o: o.isoformat() if hasattr(o, "isoformat") else str(o)).encode()
    data = brotli.compress(raw, quality=11, lgwin=24)
    out = path.with_name(path.name + ".br")
    tmp = out.with_name(out.name + ".tmp")
    tmp.write_bytes(data)
    tmp.replace(out)
    return len(data)


def month_index(p: int) -> int:
    return (p // 100) * 12 + p % 100 - 1


def from_month_index(i: int) -> int:
    return (i // 12) * 100 + i % 12 + 1


def add_months(p: int, k: int) -> int:
    return from_month_index(month_index(p) + k)


def window(freq: str, t: int, lens: str | None) -> tuple[int, int, int]:
    """(first, last, number of periods) of the window a period stands for."""
    if freq == "A":
        return t, t, 1
    n = LENS_MONTHS[lens]
    if lens == "S" and t % 100 == 2:   # January and February are one period
        n = 2
    return add_months(t, -(n - 1)), t, n


# -- products --------------------------------------------------------------------------------------


def ladder(chain: dict) -> list[dict]:
    """The chain's rungs as the app reads them (chains.yaml `levels`): name and who makes it, both languages."""
    return [{"en": lv["en"], "ko": lv["ko"], "who": {"en": lv["who"]["en"], "ko": lv["who"]["ko"]}}
            for lv in chain["levels"]]


def check_ladders(chains: dict) -> None:
    """Every product sits on a rung of its chain's ladder, every rung has a product, every feed exists."""
    for ck, ch in chains.items():
        n = len(ch.get("levels") or [])
        if n < 2:
            raise ValueError(f"{ck}: a ladder needs at least two levels")
        keys = {s["key"] for s in ch["stages"]}
        used = set()
        for s in ch["stages"]:
            if not 1 <= s["stage"] <= n:
                raise ValueError(f"{ck}:{s['key']}: stage {s['stage']} is off a ladder of {n}")
            used.add(s["stage"])
            for f in s.get("feeds", []):
                if f not in keys:
                    raise ValueError(f"{ck}:{s['key']} feeds unknown stage {f!r}")
        empty = [i for i in range(1, n + 1) if i not in used]
        if empty:
            raise ValueError(f"{ck}: no product on level(s) {empty}")


def load_products(net_cfg: dict, chains: dict, names: dict) -> list[dict]:
    check_ladders(chains)
    products = [{"id": "TOTAL", "kind": "total", "en": "All goods", "ko": "전체 상품", "codes": []}]
    chapters = names.get("chapters") or reference_chapters()
    for ch in sorted(chapters):
        if ch in ("77", "98", "99"):   # reserved, special use, not specified by kind
            continue
        products.append({"id": f"HS:{ch}", "kind": "chapter", "codes": [ch],
                         "en": chapters[ch]["en"], "ko": chapters[ch]["ko"]})
    bnames = names.get("baskets", {})
    for key, b in net_cfg.get("baskets", {}).items():
        products.append({"id": f"B:{key}", "kind": "basket", "codes": list(b["codes"]),
                         "en": bnames.get(key, {}).get("en", b["label"]),
                         "ko": bnames.get(key, {}).get("ko", b["label"]),
                         "label_long": b["label"]})
    snames = names.get("stages", {})
    seen: dict[tuple, dict] = {}
    for ck, ch in chains.items():
        for s in ch["stages"]:
            codes, old = list(s["codes"]), s.get("codes_pre2022")
            for c in codes + (old or []):
                if not _CODE.match(c):
                    raise ValueError(f"bad code {c!r} in {ck}:{s['key']}")
            key = (s["key"], tuple(codes), tuple(old) if old is not None else None)
            if key in seen:  # the same stage in a second chain: one product, an alias
                seen[key]["aliases"].append(f"C:{ck}:{s['key']}")
                seen[key]["chains"].append(ck)
                continue
            p = {"id": f"C:{ck}:{s['key']}", "kind": "stage", "chain": ck, "chains": [ck],
                 "stage_key": s["key"], "stage": s["stage"], "codes": codes,
                 "codes_pre2022": old, "en": s["label"],
                 "ko": snames.get(f"{ck}:{s['key']}", {}).get("ko", s["label"]), "aliases": []}
            seen[key] = p
            products.append(p)
    for p in products:
        p["slug"] = slug(p["id"])
    return products


def nodes_table() -> str:
    """The FROM item for trade-collector's node list (code -> node), with partner 490 as its own node (ASIA_NES)."""
    src = f"read_parquet('{NET / 'nodes.parquet'}')"
    nes = "code = '490'"
    return (f"(SELECT * REPLACE (CASE WHEN {nes} THEN '{ASIA_NES}' ELSE node END AS node,"
            f" CASE WHEN {nes} THEN '{NES_NAMES[ASIA_NES]['en']}' ELSE node_name END AS node_name,"
            f" CASE WHEN {nes} THEN 'nes' ELSE kind END AS kind,"
            f" CASE WHEN {nes} THEN NULL::VARCHAR ELSE region END AS region,"
            f" CASE WHEN {nes} THEN NULL::VARCHAR ELSE subregion END AS subregion,"
            f" CASE WHEN {nes} THEN NULL::DOUBLE ELSE lat END AS lat,"
            f" CASE WHEN {nes} THEN NULL::DOUBLE ELSE lon END AS lon,"
            f" CASE WHEN {nes} THEN NULL::VARCHAR ELSE groups END AS groups) FROM {src})")


def nes_index(node_index: dict[str, int]) -> frozenset[int]:
    """The node indices of the partner areas that are not economies (NES_NODES)."""
    return frozenset(node_index[n] for n in NES_NODES if n in node_index)


def reference_chapters() -> dict:
    """HS chapter names from Comtrade's code list, where config/names.yaml has none."""
    ref = json.loads((NET.parent / "reference" / "H6.json").read_text())
    rows = ref["results"] if isinstance(ref, dict) else ref
    return {r["id"]: {"en": r["text"].split(" - ", 1)[-1], "ko": r["text"].split(" - ", 1)[-1]}
            for r in rows if len(str(r["id"])) == 2 and str(r["id"]).isdigit()}


def layer(freq: str, name: str) -> str:
    """The FROM item for a network-layer file (`name` = total, hs2, watch, reporting). Monthly files add the
    supplement's rows for the (reporter, month) pairs Comtrade does not hold, so Comtrade always wins and a
    Comtrade rebuild that brings a supplement month never doubles it. TRADE_FLOW_NO_SUPPLEMENT=1
    (--no-supplement) reads Comtrade alone."""
    own = f"read_parquet('{NET / freq / f'{name}.parquet'}', hive_partitioning = false)"
    sup = KCS / freq / f"{name}.parquet"
    if freq != "M" or os.environ.get("TRADE_FLOW_NO_SUPPLEMENT") or not sup.exists():
        return own
    return (f"(SELECT * FROM {own} UNION ALL BY NAME SELECT k.* FROM read_parquet('{sup}') k ANTI JOIN"
            f" (SELECT DISTINCT reporter, period FROM read_parquet('{NET / 'M' / 'reporting.parquet'}')"
            f" WHERE NOT excluded) c USING (reporter, period))")


# Cells the customs service's item statistics leave out, found on 2024-2025 against Korea's own
# Comtrade file: phosphate rock (all partners), lithium carbonate (Argentina), tungsten powder (China). In the customs
# months a flow into the supplement's economy that these codes leave empty is read from the exporter's report
# (Layer.load; build_windows marks it as an estimate), the partner-report fill.
KCS_SUPPRESSED = ("251010", "283691", "810110")


def kcs_fill(p: dict) -> bool:
    """Whether a product holds a code the customs statistics suppress (a heading or chapter covers its subheadings)."""
    codes = list(p.get("codes") or []) + list(p.get("codes_pre2022") or [])
    return p.get("kind") in ("stage", "basket") and any(c.startswith(k) or k.startswith(c) for c in codes for k in KCS_SUPPRESSED)


# The customs service revises its latest months: the last KCS_PRELIMINARY months of a supplement are shown as
# preliminary (dashed, "KCS, preliminary") until a later fetch leaves them older than that.
KCS_PRELIMINARY = 2


def supplements(node_index: dict[str, int]) -> list[dict]:
    """meta.supplements: the months each economy's monthly records come from a supplement, not Comtrade, with the
    collection vintage of each run of months and the first preliminary month."""
    if os.environ.get("TRADE_FLOW_NO_SUPPLEMENT") or not (KCS / "M" / "reporting.parquet").exists():
        return []
    rows = duckdb.sql(f"""SELECT n.node, list(r.period ORDER BY r.period), max(r.publication_date)
        FROM {layer('M', 'reporting')} r JOIN {nodes_table()} n ON n.code = r.reporter
        WHERE r.source = 'KCS' GROUP BY 1""").fetchall()
    seoul = ZoneInfo("Asia/Seoul")   # the fetch's day where the customs service publishes
    day = lambda f: datetime.strptime(f, "%Y%m%dT%H%M%SZ").replace(tzinfo=UTC).astimezone(seoul).strftime("%Y-%m-%d")  # noqa: E731
    try:
        fetched = json.loads((KCS / "M" / "build.json").read_text()).get("fetched", {})
    except (OSError, ValueError):
        fetched = {}
    out = []
    for nd, periods, f in rows:
        if nd not in node_index:
            continue
        ranges: list[list[int]] = []   # runs of consecutive months (2000-2012 and the latest months are apart)
        for q in map(int, periods):
            if ranges and add_months(ranges[-1][1], 1) == q:
                ranges[-1][1] = q
            else:
                ranges.append([q, q])
        vint: list[list] = []   # runs of months fetched on the same day: [first, last, YYYY-MM-DD]
        for q in map(int, periods):
            d = day(fetched[str(q)]) if str(q) in fetched else None
            if vint and vint[-1][2] == d and add_months(vint[-1][1], 1) == q:
                vint[-1][1] = q
            else:
                vint.append([q, q, d])
        last = ranges[-1][1]
        out.append({"node": node_index[nd], "source": "KCS", **KCS_SOURCE, "M": [ranges[0][0], last],
                    "ranges": ranges, "vintages": vint,
                    "preliminary_from": max(ranges[-1][0], add_months(last, 1 - KCS_PRELIMINARY)),
                    "fetched": datetime.fromisoformat(f.replace("Z", "+00:00")).astimezone(seoul).strftime("%Y-%m-%d")})
    return out


def code_filter(codes: list[str]) -> str:
    """SQL condition on `cmd` for six-digit codes, headings (4) and chapters (2) (chain_stats.py)."""
    if not codes:
        return "FALSE"
    parts = []
    exact = [c for c in codes if len(c) == 6]
    if exact:
        parts.append("cmd IN (" + ", ".join(f"'{c}'" for c in exact) + ")")
    parts += [f"cmd LIKE '{c}%'" for c in codes if len(c) < 6]
    return "(" + " OR ".join(parts) + ")"


def source_sql(p: dict, freq: str) -> tuple[str, bool]:
    """SQL with columns period, reporter, partner, flow, value, kg, v_kg for a product; and whether
    it is HS-coded (then only HS files count as reported)."""
    kg = "NULL::DOUBLE AS kg, NULL::DOUBLE AS v_kg"
    if p["kind"] == "total":
        return (f"SELECT period, reporter, partner, flow, value, {kg}"
                f" FROM {layer(freq, 'total')}"), False
    if p["kind"] == "stage" and freq == "A":
        # As chain_stats.py: HS6 rows (with net weight), the pre-2022 codes for older files.
        codes, old = p["codes"], p["codes_pre2022"] if p.get("codes_pre2022") is not None else p["codes"]
        chapters = sorted({c[:2] for c in codes + old})
        files = ", ".join(f"'{NET}/A/hs6/ch={ch}/data.parquet'" for ch in chapters)
        cond = f"((cl = 'H6' AND {code_filter(codes)}) OR (cl <> 'H6' AND {code_filter(old)}))"
        return (f"SELECT period, reporter, partner, flow, value,"
                f" CASE WHEN netwgt > 0 THEN netwgt END AS kg,"
                f" CASE WHEN netwgt > 0 THEN value END AS v_kg"
                f" FROM read_parquet([{files}], hive_partitioning = false) WHERE {cond}"), True
    if p["kind"] == "stage":   # monthly: codes kept at their own level in watch.parquet / hs2
        codes, old = p["codes"], p["codes_pre2022"] if p.get("codes_pre2022") is not None else p["codes"]
        parts = []
        for lst, cl in ((codes, "cl = 'H6'"), (old, "cl <> 'H6'")):
            two = [c for c in lst if len(c) == 2]
            rest = [c for c in lst if len(c) > 2]
            if two:
                parts.append(f"SELECT period, reporter, partner, flow, value, {kg}"
                             f" FROM {layer('M', 'hs2')}"
                             f" WHERE {cl} AND cmd IN ({', '.join(repr(c) for c in two)})")
            if rest:
                parts.append(f"SELECT period, reporter, partner, flow, value, {kg}"
                             f" FROM {layer('M', 'watch')}"
                             f" WHERE {cl} AND cmd IN ({', '.join(repr(c) for c in rest)})")
        return " UNION ALL ".join(parts) or "SELECT NULL LIMIT 0", True
    parts = []
    for code in p["codes"]:
        if freq == "A":
            path = (NET / "A" / "hs2.parquet" if len(code) == 2
                    else NET / "A" / f"hs{len(code)}" / f"ch={code[:2]}" / "data.parquet")
            src = f"read_parquet('{path}', hive_partitioning = false)"
        else:
            src = layer("M", "hs2" if len(code) == 2 else "watch")
        parts.append(f"SELECT period, reporter, partner, flow, value, {kg} FROM {src} WHERE cmd = '{code}'")
    return " UNION ALL ".join(parts), True


# -- metrics ---------------------------------------------------------------------------------------


def grubel_lloyd(x: float, m: float) -> float | None:
    """Grubel-Lloyd index 1 - |X - M| / (X + M): 1 when exports equal imports, 0 when one side is zero."""
    if not (x + m > 0):
        return None
    return 1.0 - abs(x - m) / (x + m)


def report_gap(vx: float | None, vm: float | None) -> float | None:
    """How far a flow's two reports disagree: |importer's - exporter's| / the larger (0 = equal, 1 = one is 0).
    None unless both sides reported."""
    if vx is None or vm is None or not (vx > 0 and vm > 0):
        return None
    return abs(vm - vx) / max(vm, vx)


def unit_value(v_kg: float, kg: float, value: float, min_cov: float = KG_COVERAGE_MIN) -> float | None:
    """USD per kg from the value that has a weight (v_kg) and that weight, when weight covers at least
    min_cov of the whole value; else None."""
    if not (kg > 0 and value > 0) or v_kg / value < min_cov:
        return None
    return v_kg / kg


def two_way(x_share: float, m_share: float, gl: float | None) -> bool:
    """Whether an economy is a two-way trader of a stage (TWO_WAY)."""
    return gl is not None and gl >= TWO_WAY["gl"] and x_share >= TWO_WAY["share"] and m_share >= TWO_WAY["share"]


def pagerank(n: int, s: np.ndarray, t: np.ndarray, w: np.ndarray, d: float = 0.85,
             tol: float = 1e-10, max_iter: int = 200) -> np.ndarray:
    """Weighted PageRank by power iteration over links s -> t (as networkx: dangling mass spread
    evenly), on the n nodes indexed 0..n-1."""
    if not n or not len(s):
        return np.zeros(n)
    out_w = np.bincount(s, weights=w, minlength=n)
    M = sp.csr_matrix((w / out_w[s], (t, s)), shape=(n, n))
    dangling = out_w == 0
    pr = np.full(n, 1.0 / n)
    for _ in range(max_iter):
        nxt = d * (M @ pr) + (1 - d) / n + d * pr[dangling].sum() / n
        err = np.abs(nxt - pr).sum()
        pr = nxt
        if err < n * tol:
            break
    return pr


def group_ranks(key: np.ndarray, w: np.ndarray) -> np.ndarray:
    """Rank (1 = largest w) of each element within its key group."""
    order = np.lexsort((-w, key))
    ranks = np.empty(len(w), dtype=np.int64)
    k = key[order]
    start = np.r_[0, np.flatnonzero(k[1:] != k[:-1]) + 1]
    pos = np.arange(len(w)) - np.repeat(start, np.diff(np.r_[start, len(w)]))
    ranks[order] = pos + 1
    return ranks


def nth_largest(key: np.ndarray, w: np.ndarray, rank: np.ndarray, nth: int, n: int) -> np.ndarray:
    """Per node: the w of its nth-ranked element (0 where it has fewer)."""
    out = np.zeros(n)
    sel = rank == nth
    out[key[sel]] = w[sel]
    return out


def metrics(E: dict, reported: set[int], full: bool, top: int | None = None, unit: bool = False) -> dict:
    """Node measures on the full graph of the period and the backbone candidates.

    E: arrays s, t (node indices), w (drawn value), vx, vm (the two reports, NaN if missing),
    src (True where w is the importer's report), kg and vk (net weight and the value that has one, on the
    drawn side). full: also PageRank, betweenness, communities. unit: also unit values ($/kg) of each flow
    and of each economy's exports and imports (annual chain stages, the HS6 files that carry net weight).
    A partner area that is not an economy (ASIA_NES) is a node like any other here: ranked, counted and in the HHI.
    """
    s, t, w = E["s"], E["t"], E["w"]
    ids = np.unique(np.r_[s, t])
    if not len(ids):
        return {"world": 0.0, "nodes": [], "edges": [], "comm": [], "tot": {"edges": 0, "nodes": 0}}
    # local indices 0..n-1
    loc = {g: i for i, g in enumerate(ids)}
    ls = np.fromiter((loc[x] for x in s), dtype=np.int64, count=len(s))
    lt = np.fromiter((loc[x] for x in t), dtype=np.int64, count=len(t))
    n = len(ids)
    world = float(w.sum())
    exports = np.bincount(ls, weights=w, minlength=n)
    imports = np.bincount(lt, weights=w, minlength=n)
    out_deg = np.bincount(ls, minlength=n)
    in_deg = np.bincount(lt, minlength=n)
    with np.errstate(divide="ignore", invalid="ignore"):
        si = w / imports[lt]
        sm = w / exports[ls]
    hhi_sup = np.bincount(lt, weights=si * si, minlength=n)
    hhi_mkt = np.bincount(ls, weights=sm * sm, minlength=n)
    ro = group_ranks(ls, w)
    ri = group_ranks(lt, w)
    top_sup = np.full(n, -1)
    top_sup_share = np.zeros(n)
    first_in = ri == 1
    top_sup[lt[first_in]] = ls[first_in]
    top_sup_share[lt[first_in]] = si[first_in]
    d10 = nth_largest(ls, w, ro, RANK_KEEP, n)
    s10 = nth_largest(lt, w, ri, RANK_KEEP, n)
    keep = (ro <= RANK_KEEP) | (ri <= RANK_KEEP) | (w >= LARGE_SHARE * world)

    pr_sup = pr_buy = btw = None
    comm_of = np.full(n, -1)
    comm_list = []
    total = exports + imports
    if full:
        pr_buy = pagerank(n, ls, lt, w)
        pr_sup = pagerank(n, lt, ls, w)
        # betweenness on a sparse backbone (top 3 each way), distance = -ln(share of exporter's exports)
        B = nx.DiGraph()
        B.add_nodes_from(range(n))
        sparse = keep & ((ro <= 3) | (ri <= 3))
        for i in np.flatnonzero(sparse):
            B.add_edge(int(ls[i]), int(lt[i]), d=-math.log(max(sm[i], 1e-12)) + 1e-9)
        bt = nx.betweenness_centrality(B, weight="d", normalized=True) if B.number_of_edges() else {}
        btw = np.array([bt.get(i, 0.0) for i in range(n)])
        # communities on the symmetrised graph, each named after its largest member
        a, b = np.minimum(ls, lt), np.maximum(ls, lt)
        pair = a * n + b
        upair, inv = np.unique(pair, return_inverse=True)
        uw = np.bincount(inv, weights=w)
        U = nx.Graph()
        U.add_nodes_from(range(n))
        U.add_weighted_edges_from(zip((upair // n).tolist(), (upair % n).tolist(), uw.tolist()), weight="w")
        comms = nx.community.louvain_communities(U, weight="w", seed=7)
        for c in sorted(comms, key=lambda c: -sum(total[i] for i in c)):
            anchor = max(c, key=lambda i: total[i])
            idx = len(comm_list)
            comm_list.append([int(ids[anchor]), len(c), sig(sum(total[i] for i in c) / (2 * world), 3)])
            for i in c:
                comm_of[i] = idx

    if unit:
        kg, vk = E["kg"], E["vk"]
        kg_x, vk_x = np.bincount(ls, weights=kg, minlength=n), np.bincount(ls, weights=vk, minlength=n)
        kg_m, vk_m = np.bincount(lt, weights=kg, minlength=n), np.bincount(lt, weights=vk, minlength=n)

    nodes = []
    for i in range(n):
        g = int(ids[i])
        rec = [g, sig(exports[i] / world), sig(imports[i] / world),
               int(out_deg[i]), int(in_deg[i]),
               sig(hhi_sup[i], 3) if imports[i] > 0 else None,
               sig(hhi_mkt[i], 3) if exports[i] > 0 else None,
               int(ids[top_sup[i]]) if top_sup[i] >= 0 else -1, sig(top_sup_share[i], 3),
               1 if g in reported else 0, sig(d10[i] / world), sig(s10[i] / world)]
        if full:
            rec += [sig(pr_sup[i], 3), sig(pr_buy[i], 3), sig(btw[i], 3), int(comm_of[i])]
        if unit:
            rec += [sig(unit_value(vk_x[i], kg_x[i], exports[i]), 3), sig(unit_value(vk_m[i], kg_m[i], imports[i]), 3)]
        nodes.append(rec)
    kept = np.flatnonzero(keep)
    if top is not None and len(kept) > top:   # top=0: no flows (series only)
        kept = kept[np.argsort(-w[kept])[:top]]
    vx, vm, src = E["vx"], E["vm"], E["src"]
    edges = []
    for i in kept[np.argsort(-w[kept])]:
        mr = vm[i] / vx[i] if vx[i] > 0 and vm[i] > 0 else None
        row = [int(s[i]), int(t[i]), sig(w[i] / world, 3), int(ro[i]), int(ri[i]), sig(mr, 3), 1 if src[i] else 0]
        if unit:
            row.append(sig(unit_value(E["vk"][i], E["kg"][i], w[i]), 3))
        edges.append(row)
    ex_sorted = np.sort(exports)[::-1]
    from_imp = float(w[src].sum())
    hhi_imp = float((hhi_sup * imports).sum() / world)
    tot = {
        "nodes": int(n), "edges": int(len(w)), "reporters": len(reported),
        "hhi": sig(float(((exports / world) ** 2).sum()), 4),
        "top1": sig(float(ex_sorted[0] / world), 4), "top1_id": int(ids[np.argmax(exports)]),
        "top5": sig(float(ex_sorted[:5].sum() / world), 4),
        "hhi_sup": sig(hhi_imp, 4),
        "density": sig(len(w) / (n * (n - 1)), 3) if n > 1 else None,
        "imp_rep": sig(from_imp / world, 3),
        "exporters": int((exports > 0).sum()),
    }
    return {"world": world, "nodes": nodes, "edges": edges, "comm": comm_list, "tot": tot,
            "_exports": dict(zip(ids.tolist(), exports.tolist())),
            "_imports": dict(zip(ids.tolist(), imports.tolist())),
            "_flows": (s, t, w, vx, vm)}


# -- completeness ------------------------------------------------


COMPLETE_SHARE = 0.90     # R2: an economy's period under this share of its usual trade is incomplete
SHOWN_MIN = 0.85          # R2: the last period offered (meta.shown) has at least this world completeness
COMPLETE_STEPS = 2        # a thin reference steps back a year at most this many times


class Completeness:
    """How much of an economy's usual trade a period holds: the value, a year earlier, of the economy's flows (in
    and out) that are present in the period, over the value of all its flows a year earlier. A fall in trade does
    not lower it; a partner that has not filed does. Where the year-earlier period was itself under COMPLETE_SHARE
    for the economy, the reference steps back another year (at most COMPLETE_STEPS times), so a reporter that
    stopped filing (China after 2024) is measured against a year it filed. The world's is the same sum over all
    flows. add() takes the periods in order, each with every flow of the period (not only the stored ones)."""

    def __init__(self, n_nodes: int, back: Callable[[int], int]):
        self.n, self.back = n_nodes, back
        self.flows: dict[int, tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]] = {}
        self.node: dict[int, np.ndarray] = {}
        self.world: dict[int, float] = {}

    def _plain(self, cur: np.ndarray, ref: int) -> tuple[np.ndarray, float]:
        keys, s, t, w = self.flows[ref]
        there = np.isin(keys, cur)
        tot = np.bincount(s, weights=w, minlength=self.n) + np.bincount(t, weights=w, minlength=self.n)
        have = np.bincount(s, weights=w * there, minlength=self.n) + np.bincount(t, weights=w * there, minlength=self.n)
        with np.errstate(divide="ignore", invalid="ignore"):
            c = np.where(tot > 0, have / tot, 1.0)
        return c, (float((w * there).sum() / w.sum()) if w.sum() > 0 else 1.0)

    def add(self, period: int, s: np.ndarray, t: np.ndarray, w: np.ndarray) -> tuple[np.ndarray, float]:
        s, t = np.asarray(s, dtype=np.int64), np.asarray(t, dtype=np.int64)
        keys = s * self.n + t
        ref = self.back(period)
        c, cw = np.ones(self.n), 1.0
        if ref in self.flows:
            c, cw = self._plain(keys, ref)
            thin, wthin, r = self.node[ref] < COMPLETE_SHARE, self.world[ref] < COMPLETE_SHARE, ref
            for _ in range(COMPLETE_STEPS):
                r = self.back(r)
                if r not in self.flows or not (thin.any() or wthin):
                    break
                c2, cw2 = self._plain(keys, r)
                c = np.where(thin, c2, c)
                if wthin:
                    cw = cw2
                thin, wthin = thin & (self.node[r] < COMPLETE_SHARE), wthin and self.world[r] < COMPLETE_SHARE
        self.flows[period] = (keys, s, t, np.asarray(w, dtype=float))
        self.node[period], self.world[period] = c, cw
        # keep the references a later period can reach: COMPLETE_STEPS + 1 years back
        old = period
        for _ in range(COMPLETE_STEPS + 1):
            old = self.back(old)
        for p in [p for p in self.flows if p < old]:
            del self.flows[p]
        return c, cw


def shown_period(rows: list[list], cols: list[str]) -> int | None:
    """meta.shown: the last period of a series (all goods) whose world completeness is at least SHOWN_MIN."""
    if not rows:
        return None
    k = cols.index("cmp")
    ok = [r[0] for r in rows if r[k] is None or r[k] >= SHOWN_MIN]
    return int(ok[-1]) if ok else int(rows[-1][0])


NODE_COLS = ["i", "x", "m", "od", "id", "hs", "hm", "ts", "tss", "r", "d10", "s10"]
NODE_COLS_FULL = NODE_COLS + ["pv", "pb", "bt", "c"]
EDGE_COLS = ["s", "t", "w", "ro", "ri", "mr", "src"]
UNIT_NODE_COLS = ["ux", "um"]    # annual chain stages: unit value of exports and of imports, $/kg
UNIT_EDGE_COLS = ["uv"]          # ... and of each flow


# -- the layer -------------------------------------------------------------------------------------


class Layer:
    """One DuckDB connection over the network layer, per worker process."""

    def __init__(self, node_index: dict[str, int]):
        self.n_nodes = len(node_index)
        self.con = duckdb.connect()
        self.con.execute("SET threads = 2")
        self.con.execute("CREATE TABLE nodemap (node VARCHAR, idx INTEGER)")
        self.con.executemany("INSERT INTO nodemap VALUES (?, ?)", list(node_index.items()))
        self.con.execute(f"""CREATE TABLE nodes AS SELECT n.code, m.idx FROM
            {nodes_table()} n JOIN nodemap m ON m.node = n.node""")
        self.nes = nes_index(node_index)   # partner areas that are not economies (NES_NODES): no economy identity
        for f in ("A", "M"):
            self.con.execute(f"""CREATE TABLE rep_{f} AS
                SELECT r.period, n.idx AS node, bool_or(r.cl LIKE 'H%') AS hs
                FROM {layer(f, 'reporting')} r JOIN nodes n ON n.code = r.reporter
                WHERE NOT r.excluded GROUP BY 1, 2""")
        # the (month, economy) pairs read from a supplement, where suppressed cells are filled from the partner
        with_sup = not os.environ.get("TRADE_FLOW_NO_SUPPLEMENT") and (KCS / "M" / "reporting.parquet").exists()
        self.con.execute(f"""CREATE TABLE kcs_M AS SELECT DISTINCT r.period, n.idx AS node
            FROM {layer('M', 'reporting')} r JOIN nodes n ON n.code = r.reporter
            WHERE {"r.source = 'KCS'" if with_sup else 'FALSE'}""")

    def load(self, p: dict, freq: str, lo: int, hi: int, name: str = "f", fill: bool = True) -> bool:
        """Table <name>(period, rep, par, flow, v, kg, v_kg) for the product, node indices, and the view
        rep_<name> of who reported (HS files for HS products). fill: in a supplement's months, a product with
        suppressed codes takes the exporter's report where the supplement's economy has no import row (KCS_SUPPRESSED);
        build_windows passes False and marks those months as estimates instead."""
        src, hs = source_sql(p, freq)
        self.con.execute(f"""CREATE OR REPLACE TEMP TABLE {name} AS
            SELECT t.period, rn.idx AS rep, pn.idx AS par, t.flow, SUM(t.value) AS v,
                   SUM(t.kg) AS kg, SUM(t.v_kg) AS v_kg
            FROM ({src}) t JOIN nodes rn ON rn.code = t.reporter JOIN nodes pn ON pn.code = t.partner
            WHERE t.period BETWEEN {lo} AND {hi} AND rn.idx <> pn.idx AND t.value > 0
            GROUP BY ALL""")
        self.con.execute(f"""CREATE OR REPLACE TEMP VIEW rep_{name} AS
            SELECT period, node FROM rep_{freq} WHERE {'hs' if hs else 'TRUE'}""")
        if fill and freq == "M" and kcs_fill(p):
            self.con.execute(f"""INSERT INTO {name}
                SELECT x.period, x.par, x.rep, 'M', x.v, x.kg, x.v_kg FROM {name} x
                JOIN kcs_M k ON k.node = x.par AND k.period = x.period
                WHERE x.flow = 'X' AND NOT EXISTS (SELECT 1 FROM {name} y WHERE y.flow = 'M' AND y.rep = x.par
                                                   AND y.par = x.rep AND y.period = x.period)""")
        return hs

    def periods(self, name: str = "f") -> list[int]:
        return [r[0] for r in self.con.execute(f"SELECT DISTINCT period FROM {name} ORDER BY 1").fetchall()]

    def edges(self, lo: int, hi: int, rule: str = "mirror", name: str = "f", months: int | None = None) -> dict:
        """Flows of the window [lo, hi] with one side per flow, as numpy arrays. months: the window's length; when
        given, a flow is kept only if its drawn side is positive in each of the months, and its two reports are
        returned only if both are (no single month can be computed from the windows). Under the mirror rule a flow
        drawn from the exporter's report is valued CIF: the report times CIF_FOB, as is the value that carries a
        net weight; vx and vm stay the two reports as filed (the mirror ratio)."""
        pf = f"period BETWEEN {lo} AND {hi}"
        fx = CIF_FOB if rule == "mirror" else 1.0   # the exporter's report standing in for the importer's
        need = months if months is not None else 0
        side = {"mirror": "COALESCE(ri.n, 0) > 0 AND COALESCE(ri.n, 0) >= COALESCE(rx.n, 0)",
                "importer": "TRUE", "exporter": "FALSE"}[rule]
        rows = self.con.execute(f"""
            WITH x AS (SELECT rep AS exp, par AS imp, SUM(v) AS v, SUM(kg) AS kg, SUM(v_kg) AS vk,
                              COUNT(DISTINCT period) FILTER (WHERE v > 0) AS n
                       FROM {name} WHERE flow = 'X' AND {pf} GROUP BY 1, 2),
            m AS (SELECT par AS exp, rep AS imp, SUM(v) AS v, SUM(kg) AS kg, SUM(v_kg) AS vk,
                         COUNT(DISTINCT period) FILTER (WHERE v > 0) AS n
                  FROM {name} WHERE flow = 'M' AND {pf} GROUP BY 1, 2),
            e0 AS (SELECT COALESCE(x.exp, m.exp) AS exp, COALESCE(x.imp, m.imp) AS imp,
                          x.v AS vx, m.v AS vm, x.kg AS kx, m.kg AS km, x.vk AS vkx, m.vk AS vkm,
                          COALESCE(x.n, 0) AS nx, COALESCE(m.n, 0) AS nm
                   FROM x FULL JOIN m ON x.exp = m.exp AND x.imp = m.imp),
            e AS (SELECT exp, imp, kx, km, vkx, vkm, nx, nm,
                         CASE WHEN {need} = 0 OR (nx >= {need} AND nm >= {need}) THEN vx
                              WHEN nm >= {need} THEN NULL ELSE vx END AS vx,
                         CASE WHEN {need} = 0 OR (nx >= {need} AND nm >= {need}) THEN vm
                              WHEN nx >= {need} THEN NULL ELSE vm END AS vm
                  FROM e0),
            r AS (SELECT node, COUNT(*) AS n FROM rep_{name} WHERE {pf} GROUP BY 1),
            s AS (SELECT e.*, {side} AS by_imp FROM e
                  LEFT JOIN r ri ON ri.node = e.imp LEFT JOIN r rx ON rx.node = e.exp)
            SELECT exp, imp, COALESCE(vx, 'NaN'::DOUBLE), COALESCE(vm, 'NaN'::DOUBLE),
                   CASE WHEN by_imp THEN vm ELSE vx * {fx} END AS w, by_imp,
                   COALESCE(CASE WHEN by_imp THEN km ELSE kx END, 0),
                   COALESCE(CASE WHEN by_imp THEN vkm ELSE vkx * {fx} END, 0)
            FROM s WHERE (CASE WHEN by_imp THEN vm ELSE vx END) > 0
              AND (CASE WHEN by_imp THEN nm ELSE nx END) >= {need}""").fetchnumpy()
        rep_n = dict(self.con.execute(f"SELECT node, COUNT(*) FROM rep_{name} WHERE {pf} GROUP BY 1").fetchall())
        keys = list(rows)
        out = {"s": rows[keys[0]].astype(np.int64), "t": rows[keys[1]].astype(np.int64),
               "vx": np.asarray(rows[keys[2]], dtype=float), "vm": np.asarray(rows[keys[3]], dtype=float),
               "w": np.asarray(rows[keys[4]], dtype=float), "src": np.asarray(rows[keys[5]], dtype=bool),
               "kg": np.asarray(rows[keys[6]], dtype=float), "vk": np.asarray(rows[keys[7]], dtype=float)}
        out["rep_n"] = rep_n
        return out


# -- one product -----------------------------------------------------------------------------------


_LAYER: Layer | None = None
_CTX: dict = {}


def _init(node_index: dict[str, int], ctx: dict) -> None:
    global _LAYER, _CTX
    _LAYER = Layer(node_index)
    _CTX = ctx


ECON_COLS = ["i", "x", "m", "ts", "tss", "ux", "um"]   # econ/<chain>/<year>.json rows, one per economy


def stage_summary(E: dict, world: float) -> dict:
    """chain_stats.py's numbers for one stage-year: weight, unit value, top traders, the flows; the two-way
    traders (TWO_WAY) with their unit values and main partners; and one row per economy (ECON_COLS: exports
    and imports as shares of world trade, top supplier and its share of the economy's imports, unit values),
    which assemble_chains() moves to the econ files read for a focus economy. Asia, n.e.s. (ASIA_NES) is a partner
    like any other here."""
    s, t, w = E["s"].tolist(), E["t"].tolist(), E["w"].tolist()
    kg, vk = E["kg"].tolist(), E["vk"].tolist()
    exp: dict[int, float] = {}
    imp: dict[int, float] = {}
    side: dict[tuple[int, str], list[float]] = {}   # (economy, x|m) -> [kg, value with a weight]
    sup: dict[int, dict[int, float]] = {}            # importer -> supplier -> value
    buy: dict[int, dict[int, float]] = {}            # exporter -> buyer -> value
    for a, b, v, k, q in zip(s, t, w, kg, vk):
        exp[a] = exp.get(a, 0.0) + v
        imp[b] = imp.get(b, 0.0) + v
        for key in ((a, "x"), (b, "m")):
            acc = side.setdefault(key, [0.0, 0.0])
            acc[0] += k
            acc[1] += q
        sup.setdefault(b, {})[a] = sup.get(b, {}).get(a, 0.0) + v
        buy.setdefault(a, {})[b] = buy.get(a, {}).get(b, 0.0) + v
    top = lambda d, n: [[k, sig(v / world, 4)] for k, v in sorted(d.items(), key=lambda x: -x[1])[:n]]  # noqa: E731
    largest = lambda d, n: [k for k, _ in sorted(d.items(), key=lambda x: -x[1])[:n]]  # noqa: E731

    def uv(i: int, sd: str, total: float) -> float | None:
        k, q = side.get((i, sd), (0.0, 0.0))
        return sig(unit_value(q, k, total), 4)

    econ, tw = [], []
    for i in sorted(set(exp) | set(imp), key=lambda i: -(exp.get(i, 0.0) + imp.get(i, 0.0))):
        x, m = exp.get(i, 0.0), imp.get(i, 0.0)
        ts = max(sup[i], key=sup[i].get) if i in sup else -1
        ux, um = uv(i, "x", x), uv(i, "m", m)
        econ.append([i, sig(x / world, 4), sig(m / world, 4), ts, sig(sup[i][ts] / m, 3) if ts >= 0 else None, ux, um])
        gl = grubel_lloyd(x, m)
        if two_way(x / world, m / world, gl):
            tw.append({"i": i, "x": sig(x / world, 4), "m": sig(m / world, 4), "gl": sig(gl, 3), "ux": ux, "um": um,
                       "sup": largest(sup.get(i, {}), 3), "buy": largest(buy.get(i, {}), 3)})
    kgs, vks = float(E["kg"].sum()), float(E["vk"].sum())
    order = np.argsort(-E["w"])[:8]
    return {
        "world": round(world), "kg": round(kgs), "usd_per_kg": sig(vks / kgs, 4) if kgs else None,
        "kg_coverage": sig(vks / world, 3), "exporters": len(exp),
        "hhi": sig(sum((v / world) ** 2 for v in exp.values()), 4),
        "top_exporters": top(exp, 5), "top_importers": top(imp, 5),
        "importer_reported": sig(float(E["w"][E["src"]].sum()) / world, 3),
        "flows": [[int(E["s"][i]), int(E["t"][i]), sig(E["w"][i] / world, 4)] for i in order],
        "two_way": sorted(tw, key=lambda r: -(r["x"] + r["m"])),
        "econ": econ,
    }


def has_units(p: dict, freq: str) -> bool:
    """Whether a product's snapshots carry unit values: annual chain stages (HS6 files with net weight)."""
    return p["kind"] == "stage" and freq == "A"


def snapshot(L: Layer, p: dict, freq: str, period: int, lens: str | None, rule: str) -> dict | None:
    """One period's network: compact node and edge rows, totals, communities."""
    a, b, nwin = window(freq, period, lens)
    E = L.edges(a, b, rule, months=nwin if freq == "M" else None)
    if not len(E["w"]):
        return None
    reported = {k for k, v in E["rep_n"].items() if v >= nwin}
    full = freq == "A" or lens == "L"
    top = None
    res = metrics(E, reported, full=full, top=top, unit=has_units(p, freq))
    res["E"] = E
    res["snap"] = {"t": period, "win": [a, b] if freq == "M" else None, "world": round(res["world"]),
                   "tot": res["tot"], "comm": res["comm"], "nodes": res["nodes"], "edges": res["edges"]}
    return res


def build_product(p: dict, freq: str) -> dict:
    """All snapshots, series and summaries of one product, annual (the monthly windows: build_windows.py)."""
    L, ctx = _LAYER, _CTX
    out_dir = Path(ctx["out"])
    t0 = time.time()
    total = p["kind"] == "total"
    if freq == "A":
        lo = FIRST_YEAR["TOTAL" if total else "other"]
        hi = ctx["last"]["A"]
    else:
        lo = add_months(FIRST_MONTH["TOTAL" if total else "other"], -11)
        hi = ctx["last"]["M"]
    L.load(p, freq, lo, hi)
    have = L.periods()
    if not have:
        return {"id": p["id"], "freq": freq, "periods": {}, "bytes": 0, "files": 0}
    unit = has_units(p, freq)
    nbytes = nfiles = 0
    series: dict[str, list] = {}
    node_x: dict[str, dict[int, dict[int, float]]] = {}
    node_m: dict[str, dict[int, dict[int, float]]] = {}
    flow_w: dict[str, dict[tuple[int, int], dict[int, float]]] = {}
    flow_mr: dict[str, dict[tuple[int, int], dict[int, float]]] = {}
    stages: dict[int, dict] = {}
    periods_done: dict[str, list[int]] = {}
    back = (lambda q: q - 1) if freq == "A" else (lambda q: add_months(q, -12))
    trackers: dict[str, Completeness] = {}
    node_c: dict[str, dict[int, np.ndarray]] = {}

    def record(key: str, period: int, res: dict, nodes_key: str | None, flows_key: str | None) -> None:
        periods_done.setdefault(key, []).append(period)
        tot = res["tot"]
        fs, ft, fw = res["_flows"][:3]
        c, cw = trackers.setdefault(key, Completeness(L.n_nodes, back)).add(period, fs, ft, fw)
        series.setdefault(key, []).append([
            period, round(res["world"]), tot["edges"], tot["nodes"], tot["reporters"], tot["imp_rep"],
            tot["hhi"], tot["top1"], tot["top1_id"], tot["top5"], tot["hhi_sup"], tot["exporters"], round(cw, 2)])
        if nodes_key:
            node_c.setdefault(nodes_key, {})[period] = c
            for g, v in res["_exports"].items():
                node_x.setdefault(nodes_key, {}).setdefault(g, {})[period] = v
            for g, v in res["_imports"].items():
                node_m.setdefault(nodes_key, {}).setdefault(g, {})[period] = v
        if flows_key:
            fs, ft, fw, fvx, fvm = res["_flows"]
            for i in np.argsort(-fw)[:2000]:
                k2 = (int(fs[i]), int(ft[i]))
                flow_w.setdefault(flows_key, {}).setdefault(k2, {})[period] = fw[i] / res["world"]
                if fvx[i] > 0 and fvm[i] > 0:
                    flow_mr.setdefault(flows_key, {}).setdefault(k2, {})[period] = fvm[i] / fvx[i]

    if freq == "A":
        rules = ("mirror", "importer", "exporter") if total else ("mirror",)
        for year in range(max(lo, have[0]), hi + 1):
            for rule in rules:
                res = snapshot(L, p, "A", year, None, rule)
                if res is None:
                    continue
                snap = {"v": 1, "p": p["id"], "f": "A", "rule": rule,
                        "ncols": NODE_COLS_FULL + (UNIT_NODE_COLS if unit else []),
                        "ecols": EDGE_COLS + (UNIT_EDGE_COLS if unit else []), **res["snap"]}
                name = f"{year}.json" if rule == "mirror" else f"{year}.{rule}.json"
                nbytes += write_json(out_dir / "snap" / "A" / p["slug"] / name, snap)
                nfiles += 1
                mirror = rule == "mirror"
                record(rule, year, res, "A" if mirror else None, "A" if mirror else None)
                if p["kind"] == "stage" and mirror:
                    stages[year] = stage_summary(res["E"], res["world"])
    else:   # the monthly data are build_windows.py's windows; snap/M is not written
        raise ValueError("build_snapshots builds the annual snapshots only; months are build_windows.py's")

    cols = ["t", "world", "edges", "nodes", "reporters", "imp_rep", "hhi", "top1", "top1_id",
            "top5", "hhi_sup", "exporters", "cmp"]
    nbytes += write_json(out_dir / "series" / freq / f"{p['slug']}.json",
                         {"p": p["id"], "f": freq, "cols": cols, "rows": series})
    # node series: the largest economies by peak trade
    nodes_out = {}
    for nk in node_x:
        peak: dict[int, float] = {}
        for d in (node_x[nk], node_m.get(nk, {})):
            for g, by in d.items():
                peak[g] = max(peak.get(g, 0.0), max(by.values()))
        ids = sorted(peak, key=lambda g: -peak[g])[:SERIES_NODES]
        ps = periods_done.get("mirror" if freq == "A" else nk, [])
        nodes_out[nk] = {"t": ps, "ids": ids,
                         "x": [[sig(node_x[nk].get(g, {}).get(q), 4) for q in ps] for g in ids],
                         "m": [[sig(node_m.get(nk, {}).get(g, {}).get(q), 4) for q in ps] for g in ids],
                         "c": [[round(float(node_c[nk][q][g]), 2) if q in node_c.get(nk, {}) else None for q in ps]
                               for g in ids]}
    nbytes += write_json(out_dir / "nodes" / freq / f"{p['slug']}.json", {"p": p["id"], "f": freq, **nodes_out})
    # flow series: the largest flows by peak share, with the mirror ratio
    flows_out = {}
    for fk, by in flow_w.items():
        peak2 = {k2: max(v.values()) for k2, v in by.items()}
        keys2 = sorted(peak2, key=lambda k2: -peak2[k2])[:SERIES_FLOWS]
        ps = periods_done.get("mirror" if freq == "A" else "L", [])
        flows_out[fk] = {"t": ps, "flows": [list(k2) for k2 in keys2],
                         "w": [[sig(by[k2].get(q), 3) for q in ps] for k2 in keys2],
                         "mr": [[sig(flow_mr.get(fk, {}).get(k2, {}).get(q), 3) for q in ps] for k2 in keys2]}
    nbytes += write_json(out_dir / "flows" / freq / f"{p['slug']}.json", {"p": p["id"], "f": freq, **flows_out})
    nfiles += 3
    if stages:
        nbytes += write_json(out_dir / "stages" / f"{p['slug']}.json", {"p": p["id"], "years": stages})
        nfiles += 1
    return {"id": p["id"], "freq": freq, "periods": periods_done, "bytes": nbytes, "files": nfiles,
            "sec": round(time.time() - t0, 1)}


# -- meta: periods, completeness, coverage ---------------------------------------------------------


COMPLETE_MIN_COVERAGE = 0.98   # and a complete period holds at least 98% of the coverage base


def coverage(con) -> dict:
    """Coverage of each period: the share of 2024 exports (each reporter's exports to the world in
    its annual 2024 file) held by the economies that have filed the period, against all annual
    reporters of 2024 (years) or the economies that filed monthly in 2024 (months);
    the number of reporters per period; the last complete period: the last one in which the ten
    largest traders all reported (as the dashboard) and coverage is at least 98%."""
    out = {}
    w24 = dict(con.execute(f"""SELECT reporter, SUM(world_x) FROM read_parquet('{NET / 'A' / 'reporting.parquet'}')
        WHERE period = 2024 AND NOT excluded AND world_x > 0 GROUP BY 1""").fetchall())
    monthly24 = {r[0] for r in con.execute(f"""SELECT DISTINCT reporter FROM read_parquet('{NET / 'M' / 'reporting.parquet'}')
        WHERE period BETWEEN 202401 AND 202412 AND NOT excluded""").fetchall()}
    for f in ("A", "M"):
        base = w24 if f == "A" else {r: v for r, v in w24.items() if r in monthly24}
        denom = sum(base.values())
        rows = con.execute(f"""SELECT period, list(DISTINCT reporter) FROM {layer(f, 'reporting')}
            WHERE NOT excluded GROUP BY 1 ORDER BY 1""").fetchall()
        cov = {int(p): sig(sum(base.get(r, 0.0) for r in reps) / denom, 3) for p, reps in rows}
        nrep = {int(p): len(reps) for p, reps in rows}
        recent = [int(p) for p, _ in rows][-(36 if f == "M" else 5):]
        last = con.execute(f"""
            WITH r AS (SELECT n.node, r.period, r.world_m FROM {layer(f, 'reporting')} r
                       JOIN {nodes_table()} n ON n.code = r.reporter
                       WHERE n.node IS NOT NULL AND NOT r.excluded),
            top AS (SELECT node FROM r WHERE period >= {recent[0]} GROUP BY 1
                    ORDER BY SUM(world_m) DESC NULLS LAST LIMIT 10)
            SELECT MIN(last) FROM (SELECT node, MAX(period) AS last FROM r
                                   WHERE node IN (SELECT node FROM top) GROUP BY 1)""").fetchone()[0]
        last = max(p for p in cov if p <= last and cov[p] >= COMPLETE_MIN_COVERAGE)
        out[f] = {"coverage": cov, "reporters": nrep, "complete": int(last), "last": max(cov)}
    return out


def _month(p) -> str | None:
    """A period as the portal prints it: 202609 → "2026-09", 2025 → "2025"."""
    s = str(p) if p is not None else ""
    return f"{s[:4]}-{s[4:6]}" if len(s) == 6 else (s or None)


def volume() -> dict:
    """Rows and bytes of each publisher's data as collected, read from
    trade-collector's manifests, never estimated; written to data/volume.json and meta.volume for the www portal.

    UN Comtrade: the files the network layer reads (trade-collector comtrade/network.py source_files: final data,
    goods, annual and monthly, downloaded, superseded and tariff-line files left out), one per reporter and period
    (the latest publication where two are held); rows = gz_lines less the header line, bytes = gz_bytes (gzip as
    stored). Korea Customs Service: months.rows (the stored version of each month), bytes = the raw .xml.gz files
    its calls wrote. A column with a gap gives null, not a partial sum."""
    def ro(path: Path):
        return closing(sqlite3.connect(f"file:{path}?mode=ro", uri=True))

    items = []
    man = NET.parent / "manifest.sqlite"
    with ro(man) as db:
        n, gaps, rows, size, last_m, last_a = db.execute("""
            SELECT COUNT(*), SUM(gz_lines IS NULL OR gz_bytes IS NULL), SUM(gz_lines - 1), SUM(gz_bytes),
                   MAX(CASE WHEN freq_code = 'M' THEN p END), MAX(CASE WHEN freq_code = 'A' THEN p END)
            FROM (SELECT freq_code, gz_lines, gz_bytes, COALESCE(period_file, period) AS p,
                         ROW_NUMBER() OVER (PARTITION BY freq_code, reporter_code, COALESCE(period_file, period)
                                            ORDER BY substr(publication_date, 1, 19) DESC, downloaded_at DESC) AS k
                  FROM files WHERE dataset = 'final' AND type_code = 'C' AND freq_code IN ('A', 'M')
                   AND status IN ('downloaded', 'converted') AND gz_path IS NOT NULL)
            WHERE k = 1""").fetchone()
    items.append({"id": "comtrade", "publisher": "UN Comtrade", "rows": None if gaps else rows,
                  "bytes": None if gaps else size, "files": n, "newest": _month(last_m or last_a),
                  "row_is": "record of a final goods file (reporter, partner, flow, product code)",
                  "read_from": str(man)})
    kman = KCS.parent / "manifest.sqlite"
    with ro(kman) as db:
        months, empty, rows, last = db.execute(
            "SELECT COUNT(*), SUM(rows IS NULL), SUM(rows), MAX(period) FROM months").fetchone()
        raw = [Path(r[0]) for r in db.execute("SELECT DISTINCT raw_path FROM calls WHERE raw_path IS NOT NULL")]
    held = [f for f in raw if f.is_file()]
    if len(held) < len(raw):
        print(f"volume: {len(raw) - len(held)} of {len(raw)} KCS raw files missing; bytes null", file=sys.stderr)
    items.append({"id": "kcs", "publisher": "Korea Customs Service", "rows": None if empty else rows,
                  "bytes": sum(f.stat().st_size for f in held) if len(held) == len(raw) else None,
                  "files": len(held), "newest": _month(last), "row_is": "record of one HS item, country and month",
                  "read_from": str(kman)})

    def total(k):
        return None if any(i[k] is None for i in items) else sum(i[k] for i in items)
    return {"schema": 1, "app": "trade-flow", "measured_at": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "items": items, "rows": total("rows"), "bytes": total("bytes")}


def write_volume(out: Path, vol: dict) -> Path:
    """data/volume.json, plain JSON (the portal reads it with the standard library, no brotli)."""
    out.mkdir(parents=True, exist_ok=True)
    path = out / "volume.json"
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(json.dumps(vol, ensure_ascii=False, indent=1) + "\n")
    tmp.replace(path)
    return path


def read_json(path: Path):
    return json.loads(brotli.decompress(path.with_name(path.name + ".br").read_bytes()))


SURFACE = "1.0"   # the export surface's version (global-network/docs/SURFACES.md); a major change breaks readers
SURFACE_FILES = ["meta.json", "snap/W/*", "series/W/*", "nodes/W/*", "flows/W/*", "chains/*", "events/*", "cases/*",
                 "products.json", "changes.json", "checks/*", "build.json"]


def write_surface(out: Path, meta: dict) -> Path:
    """data/surface.json (plain JSON, not brotli): the manifest a reader checks before anything else. Written by
    build_snapshots.py (full and --meta-only) and by build_windows.py, which sets the shown window."""
    doc = {"surface": SURFACE, "built": datetime.now().astimezone().isoformat(timespec="seconds"),
           "shown": meta.get("shown", {}).get("W"), "complete_a": meta.get("complete", {}).get("A"), "files": SURFACE_FILES}
    missing = [f for f in SURFACE_FILES if not ((out / f[:-2]).is_dir() if f.endswith("/*") else (out / (f + ".br")).exists())]
    if missing:
        print(f"surface.json: not on disk yet: {', '.join(missing)}", file=sys.stderr)
    path = out / "surface.json"
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(json.dumps(doc, separators=(",", ":")) + "\n")
    tmp.replace(path)
    return path


def assemble_chains(out: Path, chains: dict, names: dict, products: list[dict], node_index: dict,
                    complete_year: int) -> None:
    """chains/<chain>.json: the stages with their codes, feeds, caveats, use shares and the yearly
    stage numbers; the chokepoint of each year; the monthly 12-month sum and HHI of each stage.
    econ/<chain>/<year>.json: every economy's row (ECON_COLS) at every stage, read for a focus economy.
    chains/index.json: one line per chain for the index page."""
    by_alias = {}
    for p in products:
        if p["kind"] == "stage":
            for pid in [p["id"], *p.get("aliases", [])]:
                by_alias[pid] = p
    snames = names.get("stages", {})
    index = []
    for ck, ch in chains.items():
        stages = []
        years: set[int] = set()
        econ: dict[int, dict[str, list]] = {}
        for st in ch["stages"]:
            prod = by_alias[f"C:{ck}:{st['key']}"]
            f = out / "stages" / f"{prod['slug']}.json"
            yrs = read_json(f)["years"] if f.with_name(f.name + ".br").exists() else {}
            yrs = {int(y): v for y, v in yrs.items()}
            for y, v in yrs.items():
                econ.setdefault(y, {})[st["key"]] = v.pop("econ", [])
            years |= set(yrs)
            # the monthly strip: the 12-month windows of build_windows.py (one monthly rule)
            monthly = None
            sf = out / "series" / "W" / f"{prod['slug']}.json"
            if sf.with_name(sf.name + ".br").exists():
                ser = read_json(sf)
                cols = ser["cols"]
                rows = ser["rows"].get("12", [])
                monthly = {"w": 12, "t": [r[0] for r in rows], "world": [r[cols.index("world")] for r in rows],
                           "hhi": [r[cols.index("hhi")] for r in rows]}
                for k in ("est", "cmp"):   # estimated share of world trade; world completeness
                    if k in cols:
                        monthly[k] = [r[cols.index(k)] for r in rows]
            cav = st.get("caveat")
            ko = snames.get(f"{ck}:{st['key']}", {})
            stages.append({
                "key": st["key"], "product": prod["id"], "stage": st["stage"],
                "en": st["label"], "ko": ko.get("ko", st["label"]),
                "codes": st["codes"], "codes_pre2022": st.get("codes_pre2022"),
                "feeds": st.get("feeds", []), "shared": st.get("shared", []),
                "role": st.get("role"), "use_share": st.get("use_share"),
                "caveat": {"en": cav, "ko": ko.get("caveat_ko", cav)} if cav else None,
                "residual": bool(cav and ("residual" in cav.lower() or "no code of its own" in cav.lower()))
                            or "no own code" in st["label"].lower(),
                "years": yrs, "monthly": monthly,
            })
        choke = {}
        for y in sorted(years):
            cand = [(s["years"][y]["hhi"], s["key"]) for s in stages
                    if y in s["years"] and s.get("role") != "feedstock"
                    and s["years"][y]["world"] >= CHOKE_MIN_WORLD and (s["years"][y]["hhi"] or 0) > CHOKE_MIN_HHI]
            choke[y] = max(cand)[1] if cand else None
        doc = {"id": ck, "en": ch["label"], "ko": ch.get("label_ko", ch["label"]), "levels": ladder(ch),
               "years": sorted(years), "stages": stages, "chokepoint": choke}
        write_json(out / "chains" / f"{ck}.json", doc)
        for y, by_stage in econ.items():
            write_json(out / "econ" / ck / f"{y}.json", {"chain": ck, "year": y, "cols": ECON_COLS, "stages": by_stage})
        last = max(years) if years else None
        complete = [y for y in sorted(years) if y <= complete_year]
        ly = complete[-1] if complete else last
        index.append({"id": ck, "en": doc["en"], "ko": doc["ko"], "levels": doc["levels"], "stages": len(stages),
                      "year": ly, "chokepoint": choke.get(ly),
                      "world": {s["key"]: s["years"].get(ly, {}).get("world") for s in stages},
                      "two_way": most_two_way(stages, ly)})
    write_json(out / "chains" / "index.json", {"chains": index})


def most_two_way(stages: list[dict], year: int | None) -> dict | None:
    """The chain's most two-way stage in a year: among the two-way traders that are top-five exporters or
    importers of a stage (feedstocks left out), the one with the highest Grubel-Lloyd index."""
    best = None
    for s in stages:
        y = s["years"].get(year) if year is not None else None
        if not y or s.get("role") == "feedstock":
            continue
        top5 = {i for i, _ in y["top_exporters"]} | {i for i, _ in y["top_importers"]}
        for r in y.get("two_way", []):
            if r["i"] in top5 and (best is None or r["gl"] > best["gl"]):
                best = {"stage": s["key"], "i": r["i"], "gl": r["gl"]}
    return best


def write_groups(out: Path, nodes: list[dict]) -> int:
    """groups/memberships.json from config/groups.yaml and config/memberships.csv: every grouping with its
    names, colour and members as [ISO3, first day, last day] (null: no date; regions are static); the
    sources of each group's dates. Returns the number of membership rows."""
    import csv

    cfg = yaml.safe_load((HERE / "config" / "groups.yaml").read_text())
    known = {n["id"] for n in nodes}
    groups: dict[str, dict] = {}
    for key, g in cfg["regions"].items():
        subs = set(g["subregions"])
        groups[key] = {"kind": "region", "en": g["en"], "ko": g["ko"], "colour": g["colour"], "note": None,
                       "members": [[n["id"], None, None] for n in nodes if n["subregion"] in subs], "sources": []}
    for kind in ("blocs", "clubs"):
        for key, g in cfg[kind].items():
            groups[key] = {"kind": kind[:-1], "en": g["en"], "ko": g["ko"], "colour": g["colour"],
                           "note": g.get("note"), "members": [], "sources": []}
    rows = 0
    path = HERE / "config" / "memberships.csv"
    if path.exists():
        with path.open(newline="", encoding="utf-8") as fh:
            for r in csv.DictReader(fh):
                g = groups.get(r["group"])
                if g is None or g["kind"] == "region":
                    raise ValueError(f"memberships.csv: unknown group {r['group']!r}")
                if r["iso3"] not in known:
                    raise ValueError(f"memberships.csv: unknown economy {r['iso3']!r}")
                for d in (r["join"], r["leave"]):
                    if d and not re.fullmatch(r"\d{4}-\d{2}-\d{2}", d):
                        raise ValueError(f"memberships.csv: bad date {d!r}")
                g["members"].append([r["iso3"], r["join"] or None, r["leave"] or None])
                if r["source_url"] and r["source_url"] not in g["sources"]:
                    g["sources"].append(r["source_url"])
                rows += 1
    doc = {"v": 1, "schemes": {"region": list(cfg["regions"]), "bloc": list(cfg["blocs"]), "club": list(cfg["clubs"])},
           "custom": cfg["custom"], "groups": groups}
    write_json(out / "groups" / "memberships.json", doc)
    return rows


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--out", default=str(HERE / "data"))
    ap.add_argument("--only", help="comma list of product ids (default: all)")
    ap.add_argument("--freqs", default="A", help="A (the annual snapshots); the monthly data are build_windows.py's")
    ap.add_argument("--workers", type=int, default=max(1, (os.cpu_count() or 4) - 4))
    ap.add_argument("--meta-only", action="store_true", help="rewrite meta.json and the chain files only")
    ap.add_argument("--no-supplement", action="store_true",
                    help="Comtrade alone: leave out the Korea Customs Service months")
    ap.add_argument("--volume-only", action="store_true",
                    help="write data/volume.json (rows and bytes as collected) and nothing else")
    a = ap.parse_args()
    if a.volume_only:
        vol = volume()
        print(f"{write_volume(Path(a.out), vol)}: {vol['rows']:,} rows, {vol['bytes']:,} bytes"
              if vol["rows"] is not None and vol["bytes"] is not None else f"volume.json with gaps: {vol}",
              file=sys.stderr)
        return 0
    if a.no_supplement:
        os.environ["TRADE_FLOW_NO_SUPPLEMENT"] = "1"   # read by layer() here and in the workers
    out = Path(a.out)
    t0 = time.time()

    net_cfg = yaml.safe_load(NETWORK_YAML.read_text())
    chains = yaml.safe_load((HERE / "config" / "chains.yaml").read_text())["chains"]
    names_path = HERE / "config" / "names.yaml"
    names = yaml.safe_load(names_path.read_text()) if names_path.exists() else {}
    products = load_products(net_cfg, chains, names)
    if a.only:
        want = set(a.only.split(","))
        products = [p for p in products if p["id"] in want or set(p.get("aliases", [])) & want]
    freqs = a.freqs.split(",")
    if "M" in freqs:   # one monthly rule, the windows of build_windows.py; snap/M is retired
        print("--freqs M: the monthly lenses (snap/M, series/M, nodes/M, flows/M) are no longer built; the monthly"
              " data are build_windows.py's windows (snap/W, series/W, nodes/W, flows/W)", file=sys.stderr)
        freqs = [f for f in freqs if f != "M"]

    con = duckdb.connect()
    nodes = con.execute(f"""SELECT node, any_value(node_name), any_value(region), any_value(subregion),
            any_value(lat), any_value(lon), any_value(groups), bool_and(historical)
        FROM {nodes_table()} WHERE node IS NOT NULL GROUP BY 1 ORDER BY 1""").fetchall()
    node_index = {r[0]: i for i, r in enumerate(nodes)}
    enames = names.get("economies", {})
    cov = coverage(con)
    ctx = {"out": str(out), "last": {f: cov[f]["last"] for f in ("A", "M")}}

    jobs = [(p, f) for p in products for f in freqs
            if f == "A" or p["kind"] in ("total", "basket", "stage")]
    # the heaviest first, so the pool ends together
    weight = {"total": 0, "chapter": 1, "basket": 2, "stage": 3}
    jobs.sort(key=lambda j: (weight[j[0]["kind"]], j[1] != "M"))
    results = []
    if a.meta_only:
        jobs = []
    with ProcessPoolExecutor(max_workers=a.workers, initializer=_init, initargs=(node_index, ctx)) as pool:
        futs = {pool.submit(build_product, p, f): (p["id"], f) for p, f in jobs}
        for i, fut in enumerate(as_completed(futs), 1):
            pid, f = futs[fut]
            r = fut.result()
            results.append(r)
            print(f"[{i}/{len(jobs)}] {pid} {f}: {r['files']} files, {r['bytes'] / 1e6:.1f} MB,"
                  f" {r.get('sec', 0)} s", file=sys.stderr, flush=True)

    meta_products = []
    for p in products:
        entry = {k: p[k] for k in ("id", "slug", "kind", "en", "ko", "codes") if k in p}
        for k in ("chain", "chains", "stage", "stage_key", "codes_pre2022", "aliases", "label_long"):
            if p.get(k) is not None:
                entry[k] = p[k]
        sf = out / "series" / "A" / f"{p['slug']}.json"   # the years on disk, from the series file
        if sf.with_name(sf.name + ".br").exists():
            ps = [r[0] for r in read_json(sf)["rows"].get("mirror", [])]
            if ps:
                entry["A"] = [ps[0], ps[-1]]
        # the months ("M", "W") come from the windows' series: build_windows.add_to_meta below
        meta_products.append(entry)
    # the last period offered in the explorers: all goods' world completeness
    shown = {}
    for f, key in (("A", "mirror"),):   # the months' shown period is the windows' (add_to_meta)
        sf = out / "series" / f / "TOTAL.json"
        if sf.with_name(sf.name + ".br").exists():
            raw = read_json(sf)
            if "cmp" in raw["cols"]:
                shown[f] = shown_period(raw["rows"].get(key, []), raw["cols"])
        shown.setdefault(f, cov[f]["last"])
    shown["M"] = cov["M"]["last"]   # build_windows.add_to_meta sets the windows' shown month (M and W)
    groups = [{"key": k, "en": names.get("groups", {}).get(k, {}).get("en", g["label"]),
               "ko": names.get("groups", {}).get(k, {}).get("ko", g["label"]),
               "label_long": g["label"], "members": [node_index[m] for m in g["members"] if m in node_index]}
              for k, g in net_cfg.get("groups", {}).items()]
    meta = {
        "v": 1, "built_at": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "layer_built": {f: json.loads((NET / f / "build.json").read_text())["built_at"] for f in ("A", "M")},
        "nodes": [{"id": r[0], "en": enames.get(r[0], {}).get("en", r[1]),
                   "ko": enames.get(r[0], {}).get("ko", r[1]), "name": r[1], "region": r[2],
                   "subregion": r[3], "lat": r[4], "lon": r[5],
                   "groups": [g for g in (r[6] or "").split(",") if g], "hist": bool(r[7])}
                  | ({"nes": True} if r[0] in NES_NODES else {}) for r in nodes],
        "groups": groups,
        "products": meta_products,
        "chains": [{"id": ck, "en": ch["label"], "ko": ch.get("label_ko", ch["label"]), "levels": ladder(ch)}
                   for ck, ch in chains.items()],
        "complete": {f: cov[f]["complete"] for f in ("A", "M")},
        "last": {f: cov[f]["last"] for f in ("A", "M")},
        "shown": shown,
        "coverage": {f: cov[f]["coverage"] for f in ("A", "M")},
        "reporters": {f: cov[f]["reporters"] for f in ("A", "M")},
        "lenses": {"L": 12, "M": 3},
        "supplements": supplements(node_index),
        "records": {"originals": 0, "budget": RECORD_BUDGET, "line": 100_000},
        "volume": volume(),
    }
    write_json(out / "meta.json", meta)
    write_volume(out, meta["volume"])
    if (out / "series" / "W").exists():   # keep the monthly explorer's windows (build_windows.py)
        from build_windows import add_to_meta
        meta = add_to_meta(out)
    print(f"groups: {write_groups(out, meta['nodes'])} membership rows", file=sys.stderr)
    if not a.only:
        assemble_chains(out, chains, names, products, node_index, meta["complete"]["A"])
    write_surface(out, meta)
    if a.meta_only:
        print("meta.json, surface.json and the chain files rewritten", file=sys.stderr)
        return 0
    build = {"built_at": meta["built_at"], "sec": round(time.time() - t0),
             "files": sum(r["files"] for r in results), "bytes": sum(r["bytes"] for r in results),
             "records": meta["records"],
             "jobs": [{k: r[k] for k in ("id", "freq", "files", "bytes", "sec") if k in r} for r in results]}
    if meta["records"]["originals"] > RECORD_BUDGET:
        print(f"refusing: {meta['records']['originals']} original records > {RECORD_BUDGET}", file=sys.stderr)
        return 1
    write_json(out / "build.json", build)
    print(f"done: {build['files']} files, {build['bytes'] / 1e6:.1f} MB gz, {build['sec']} s;"
          f" original records 0 of {RECORD_BUDGET}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())

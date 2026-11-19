# /// script
# requires-python = ">=3.11"
# dependencies = ["duckdb==1.5.6", "networkx==3.6.1", "numpy==2.4.6", "scipy==1.17.1", "pyyaml==6.0.3",
#                 "brotli==1.1.0"]
# ///
"""The ladder of checks: every product's numbers against other sources, written
to data/checks/ for the Checks panel and /method/checks.

    uv run scripts/checks.py fetch          # tiers 1 and 2: validator series into validators/
    uv run scripts/checks.py run            # every check that can run -> data/checks/

Run `run` after build_snapshots.py (it reads data/meta.json). `fetch` calls the articles
pipeline's FRED and ECOS skill scripts (fred.py, ecos.py), which validate each series against
published anchors before writing it; their keys come from articles/.env. A check that cannot run
(no validator, too few months) is written as "not run", never as "pass".

Tiers: 0 Comtrade against itself (twelve monthly files against the annual file, the monthly
mirror ratio, coverage, the HS breaks, files set aside); 1 national customs (Korea's export value
index from the Bank of Korea, US imports by origin from the Census via FRED); 2 prices and output
(IMF commodity prices and US industrial production via FRED, unit values on the layer, exchange
rates); 3 firms (the cathode makers' revenue from DART filings kept in a private company-filings store that is
not part of the public snapshot,
against Korea's cathode exports; the segment table for the other chain companies is not built
yet); 4 physical balances (not yet: USGS, IEA);
5 papers (the case studies' anchors, written by build_stories.py).

What a check shows: gaps in percent, ratios and correlations, and series as indexes (= 100 at a
base), never a reporter's original values.
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import re
import subprocess
import sys
from datetime import UTC, datetime
from pathlib import Path

import duckdb
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_snapshots import KCS, NET, HERE, add_months, layer, read_json, sig, source_sql, write_json  # noqa: E402
import build_snapshots as bs  # noqa: E402

SKILLS = HERE.parent / "articles" / ".claude" / "skills"
FRED = SKILLS / "fetch-fred" / "scripts" / "fred.py"
ECOS = SKILLS / "fetch-ecos" / "scripts" / "ecos.py"
VALIDATORS = HERE / "validators"

GAP_WATCH, GAP_FAIL = 0.01, 0.05          # twelve monthly files against the annual file
MIRROR_LO, MIRROR_HI = 0.8, 1.25          # a flow-card note outside this band
CORR_PASS = 0.8                            # y/y changes against a national series, 24 months

# Tier 1 and 2 series: (dataset id, provider, arguments for fetch, what it checks).
# Anchors are the ones that passed in the articles runs of 20-23 Oct 2026.
SERIES = [
    ("ecos-403y001-aa-m", "ecos", ["403Y001", "M", "*AA", "--from", "201001", "--unit", "2020=100",
                                   "--range", "10,800"], "Korea export value index, all goods"),
    ("ecos-403y001-3091aa-m", "ecos", ["403Y001", "M", "3091AA", "--from", "201001", "--unit", "2020=100",
                                       "--range", "10,800", "--anchor", "202608=557.9:12"],
     "Korea export value index, semiconductors"),
    ("ecos-403y001-31211aa-m", "ecos", ["403Y001", "M", "31211AA", "--from", "201001", "--unit", "2020=100",
                                        "--range", "10,800"], "Korea export value index, motor vehicles"),
    ("ecos-403y001-3071aa-m", "ecos", ["403Y001", "M", "3071AA", "--from", "201001", "--unit", "2020=100",
                                       "--range", "10,800"], "Korea export value index, primary steel products"),
    ("ecos-901y118-t002-m", "ecos", ["901Y118", "M", "T002", "--from", "200001"], "Korea customs exports, total (Korea Customs Service via ECOS)"),
    ("ecos-901y118-t004-m", "ecos", ["901Y118", "M", "T004", "--from", "200001"], "Korea customs imports, total (Korea Customs Service via ECOS)"),
    ("fred-us-imports-china-m", "fred", ["IMPCH"], "US goods imports from China, customs basis"),
    ("fred-us-imports-mexico-m", "fred", ["IMPMX"], "US goods imports from Mexico, customs basis"),
    ("fred-us-imports-korea-m", "fred", ["IMPKR"], "US goods imports from Korea, customs basis"),
    ("fred-us-imports-japan-m", "fred", ["IMPJP"], "US goods imports from Japan, customs basis"),
    ("fred-us-imports-vietnam-m", "fred", ["IMP5520"], "US goods imports from Vietnam, customs basis"),
    ("fred-us-imports-taiwan-m", "fred", ["IMP5830"], "US goods imports from Taiwan, customs basis"),
    ("fred-us-imports-eu-m", "fred", ["IMP0003"], "US goods imports from the European Union, customs basis"),
    ("fred-nickel-price-m", "fred", ["PNICKUSDM"], "Global price of nickel (IMF)"),
    ("fred-copper-price-m", "fred", ["PCOPPUSDM"], "Global price of copper (IMF)"),
    ("fred-aluminium-price-m", "fred", ["PALUMUSDM"], "Global price of aluminium (IMF)"),
    ("fred-iron-ore-price-m", "fred", ["PIORECRUSDM"], "Global price of iron ore (IMF)"),
    ("fred-brent-price-m", "fred", ["POILBREUSDM"], "Global price of Brent crude (IMF)"),
    ("fred-eu-gas-price-m", "fred", ["PNGASEUUSDM"], "Global price of natural gas, EU (IMF)"),
    ("fred-us-ip-semiconductors-m", "fred", ["IPG3344S"], "US industrial production: semiconductors and components"),
    ("fred-us-ip-motor-vehicles-m", "fred", ["IPG3361T3S"], "US industrial production: motor vehicles and parts"),
    ("fred-us-ip-chemicals-m", "fred", ["IPG325S"], "US industrial production: chemicals"),
    ("fred-us-ip-primary-metals-m", "fred", ["IPG331S"], "US industrial production: primary metals"),
    ("fred-krw-per-usd-m", "fred", ["DEXKOUS", "--to-freq", "m", "--aggregation", "avg"], "Won per US dollar, monthly average"),
    ("fred-jpy-per-usd-m", "fred", ["DEXJPUS", "--to-freq", "m", "--aggregation", "avg"], "Yen per US dollar, monthly average"),
    ("fred-usd-per-eur-m", "fred", ["DEXUSEU", "--to-freq", "m", "--aggregation", "avg"], "US dollars per euro, monthly average"),
    ("fred-cny-per-usd-m", "fred", ["DEXCHUS", "--to-freq", "m", "--aggregation", "avg"], "Yuan per US dollar, monthly average"),
]
# Census annual totals that passed as anchors (millions of dollars), checked as annual sums.
CENSUS_ANCHORS = {"IMPCH": ["2018-01-01=539500:3000", "2024-01-01=438900:3000"],
                  "IMPMX": ["2019-01-01=358000:3000", "2024-01-01=505900:3000"],
                  "IMPKR": ["2019-01-01=77500:1500", "2024-01-01=131500:1500"],
                  "IMPJP": ["2019-01-01=143600:1500", "2024-01-01=148200:1500"],
                  "IMP5520": ["2019-01-01=66600:1500", "2024-01-01=136600:1500"],
                  "IMP5830": ["2019-01-01=54300:1500", "2024-01-01=116300:1500"],
                  "IMP0003": ["2022-01-01=553300:5000", "2024-01-01=605800:5000"]}

# Korea's exports by product against the Bank of Korea's export value index (tier 1).
KOREA_INDEX = {"TOTAL": "ecos-403y001-aa-m", "B:semiconductors": "ecos-403y001-3091aa-m",
               "B:cars": "ecos-403y001-31211aa-m", "HS:72": "ecos-403y001-3071aa-m"}
# US imports from a partner against the Census (tier 1), all goods.
US_IMPORTS = {"CHN": "fred-us-imports-china-m", "MEX": "fred-us-imports-mexico-m",
              "KOR": "fred-us-imports-korea-m", "JPN": "fred-us-imports-japan-m",
              "VNM": "fred-us-imports-vietnam-m", "TWN": "fred-us-imports-taiwan-m",
              "EU27": "fred-us-imports-eu-m"}
# Unit values of chain stages against world prices (tier 2).
PRICES = {"C:batteries:nickel_ore": "fred-nickel-price-m", "C:copper:cu_cathode": "fred-copper-price-m",
          "C:copper:cu_conc": "fred-copper-price-m", "C:aluminium:al_unwrought": "fred-aluminium-price-m",
          "C:steel:iron_ore": "fred-iron-ore-price-m", "C:plastics:crude": "fred-brent-price-m",
          "C:fertiliser:gas": "fred-eu-gas-price-m"}
OUTPUT = {"B:semiconductors": "fred-us-ip-semiconductors-m", "C:semiconductors:ics": "fred-us-ip-semiconductors-m",
          "B:cars": "fred-us-ip-motor-vehicles-m", "C:steel:cars": "fred-us-ip-motor-vehicles-m",
          "C:plastics:polymers": "fred-us-ip-chemicals-m", "C:aluminium:al_unwrought": "fred-us-ip-primary-metals-m",
          "C:steel:flat": "fred-us-ip-primary-metals-m"}
FX = {"KOR": ("fred-krw-per-usd-m", False), "JPN": ("fred-jpy-per-usd-m", False),
      "CHN": ("fred-cny-per-usd-m", False), "EU27": ("fred-usd-per-eur-m", True)}


def status_word(ok: bool | None, watch: bool = False) -> str:
    if ok is None:
        return "not run"
    return "pass" if ok else ("watch" if watch else "fail")


# -- fetch -----------------------------------------------------------------------------------------


def fetch_firms() -> int:
    """Tier 3: the cathode makers' quarterly revenue (DART filings) comes from a private company-filings store
    that is not part of the public snapshot. The check reads validators/firms/cathode-revenue.json when it is
    there ({retrieved, source, unit, companies: {name: {YYYYQn: KRW}}}) and is written as "not run" otherwise."""
    if not (VALIDATORS / "firms" / "cathode-revenue.json").exists():
        print("firm revenue: not available in the public snapshot (tier 3 not run)", file=sys.stderr)
    return 0


def fetch() -> int:
    VALIDATORS.mkdir(exist_ok=True)
    bad = fetch_firms()
    for ds, prov, args, what in SERIES:
        if prov == "fred":
            cmd = [sys.executable, str(FRED), "fetch", *args, "--out", str(VALIDATORS), "--indicator", what,
                   "--dataset-id", ds, "--start", "2010-01-01", "--max-stale-days", "120"]
            if "--to-freq" in args:
                cmd += ["--freq", "M"]
            # monthly Census series have no monthly anchors: their annual sums are checked below
        else:
            cmd = [sys.executable, str(ECOS), "fetch", *args, "--out", str(VALIDATORS), "--indicator", what,
                   "--dataset-id", ds, "--publishable"]
        r = subprocess.run(cmd, capture_output=True, text=True, cwd=HERE.parent / "articles")
        try:
            verdict = json.loads(r.stdout).get("validation", {}).get("verdict") or json.loads(r.stdout).get("verdict")
        except json.JSONDecodeError:
            verdict = None
        print(f"{ds}: exit {r.returncode}, verdict {verdict}", file=sys.stderr)
        if r.returncode != 0:
            bad += 1
            print(r.stdout[-600:] + r.stderr[-600:], file=sys.stderr)
    # the Census anchors, on annual sums
    for sid, anchors in CENSUS_ANCHORS.items():
        cmd = [sys.executable, str(FRED), "validate", sid, "--to-freq", "a", "--aggregation", "sum",
               "--start", "2015-01-01", *[x for an in anchors for x in ("--anchor", an)]]
        r = subprocess.run(cmd, capture_output=True, text=True, cwd=HERE.parent / "articles")
        try:
            verdict = json.loads(r.stdout).get("verdict")
        except json.JSONDecodeError:
            verdict = None
        print(f"{sid} annual sums: verdict {verdict}", file=sys.stderr)
        bad += verdict not in ("pass", "warn")   # warn: the current year is incomplete
    return 1 if bad else 0


def load_series(ds: str) -> dict[int, float]:
    """A fetched validator as {YYYYMM: value}."""
    path = next(VALIDATORS.glob(f"**/{ds}.csv"), None)
    if not path:
        return {}
    out = {}
    with path.open() as fh:
        for row in csv.DictReader(fh):
            if row["value"] in ("", None):
                continue
            d = row["date"]
            out[int(d[:4]) * 100 + int(d[5:7])] = float(row["value"])
    return out


# -- helpers ---------------------------------------------------------------------------------------


def sum3(by: dict[int, float], t: int) -> float | None:
    vals = [by.get(add_months(t, -k)) for k in range(3)]
    return sum(vals) if all(v is not None for v in vals) else None


def yoy3(by: dict[int, float], t: int) -> float | None:
    a, b = sum3(by, t), sum3(by, add_months(t, -12))
    return a / b - 1 if a is not None and b else None


def corr(x: list[float], y: list[float]) -> float | None:
    if len(x) < 12:
        return None
    a, b = np.array(x), np.array(y)
    if a.std() == 0 or b.std() == 0:
        return None
    return float(np.corrcoef(a, b)[0, 1])


def index_series(by: dict[int, float], months: list[int], base: list[int]) -> list[float | None]:
    b = [by[m] for m in base if m in by]
    if len(b) < len(base):
        return [None] * len(months)
    ref = sum(b) / len(b)
    return [sig(by[m] / ref * 100, 4) if m in by else None for m in months]


# -- run -------------------------------------------------------------------------------------------


class Checker:
    def __init__(self, meta: dict):
        self.meta = meta
        self.con = duckdb.connect()
        self.con.execute("SET threads = 8")
        idx = {n["id"]: i for i, n in enumerate(meta["nodes"])}
        self.idx = idx
        self.con.execute("CREATE TABLE nodemap (node VARCHAR, idx INTEGER)")
        self.con.executemany("INSERT INTO nodemap VALUES (?, ?)", list(idx.items()))
        self.con.execute(f"""CREATE TABLE nodes AS SELECT n.code, m.idx FROM
            {bs.nodes_table()} n JOIN nodemap m ON m.node = n.node""")   # partner 490 its own node
        for f in ("A", "M"):
            self.con.execute(f"""CREATE TABLE rep_{f} AS
                SELECT r.period, n.idx AS node, bool_or(r.cl LIKE 'H%') AS hs
                FROM {layer(f, 'reporting')} r JOIN nodes n ON n.code = r.reporter
                WHERE NOT r.excluded GROUP BY 1, 2""")
        self.complete = meta["complete"]
        self.series = {ds: load_series(ds) for ds, *_ in SERIES}
        eu = next(g for g in meta["groups"] if g["key"] == "EU27")
        self.eu = eu["members"]

    def load(self, p: dict, freq: str, name: str, lo: int, hi: int) -> None:
        src, _ = source_sql(p, freq)
        self.con.execute(f"""CREATE OR REPLACE TEMP TABLE {name} AS
            SELECT t.period, rn.idx AS rep, pn.idx AS par, t.flow, SUM(t.value) AS v
            FROM ({src}) t JOIN nodes rn ON rn.code = t.reporter JOIN nodes pn ON pn.code = t.partner
            WHERE t.period BETWEEN {lo} AND {hi} AND rn.idx <> pn.idx AND t.value > 0 GROUP BY ALL""")

    def own(self, table: str, node: int, flow: str, partners: list[int] | None = None) -> dict[int, float]:
        """A reporter's own report of its exports (X) or imports (M) by period, over all partners or some."""
        pf = f" AND par IN ({', '.join(map(str, partners))})" if partners else ""
        return dict(self.con.execute(f"SELECT period, SUM(v) FROM {table} WHERE rep = {node} AND flow = '{flow}'{pf}"
                                     " GROUP BY 1").fetchall())

    def product(self, p: dict) -> dict:
        ya, ym = self.complete["A"], self.complete["M"]
        has_m = "M" in p
        self.load(p, "A", "fa", 2015, self.meta["last"]["A"])
        if has_m:
            self.load(p, "M", "fm", 201501, self.meta["last"]["M"])
        tiers = {0: [], 1: [], 2: [], 3: [], 4: [], 5: []}
        names = self.meta["nodes"]

        # tier 0.1: twelve monthly files against the annual file, the ten largest exporters and Korea
        top = [r[0] for r in self.con.execute(f"""SELECT rep FROM fa WHERE period = {ya} AND flow = 'X'
            GROUP BY 1 ORDER BY SUM(v) DESC LIMIT 10""").fetchall()]
        if self.idx["KOR"] not in top:
            top.append(self.idx["KOR"])
        rows, missing, by_year = [], [], {}
        if has_m:
            for node in top:
                ann = self.own("fa", node, "X")
                mon = self.own("fm", node, "X")
                filed = {r[0] for r in self.con.execute(f"SELECT period FROM rep_M WHERE node = {node}").fetchall()}
                for y in range(2017, ya + 1):
                    months = [y * 100 + m for m in range(1, 13)]
                    if y not in ann or not all(m in filed for m in months):
                        continue
                    msum = sum(mon.get(m, 0.0) for m in months)
                    if msum <= 0:   # the monthly files carry no detail for the product
                        missing.append([names[node]["id"], y])
                        continue
                    gap = msum / ann[y] - 1
                    rows.append([names[node]["id"], y, sig(gap, 3), abs(gap) > GAP_FAIL])
                    a, g = by_year.get(y, (0.0, 0.0))
                    by_year[y] = (a + ann[y], g + abs(msum - ann[y]))
        # the product's gap: value-weighted over the reporters, per year; its status from the worst year
        years = {y: g / a for y, (a, g) in sorted(by_year.items()) if a}
        worst = max(years.values()) if years else None
        tiers[0].append({
            "id": "monthly_sum", "rows": rows, "cols": ["node", "year", "gap", "over_fail"],
            "years": [[y, sig(v, 3)] for y, v in years.items()], "missing": missing,
            "status": "not run" if worst is None else ("pass" if worst <= GAP_WATCH else "watch" if worst <= GAP_FAIL else "fail"),
            "worst": sig(worst, 3) if worst is not None else None, "threshold": [GAP_WATCH, GAP_FAIL],
            "rule": "value-weighted mean absolute gap of the largest exporters' twelve monthly files against their annual file, per year"})

        # tier 0.2: the monthly mirror ratio of the five largest flows, 24 complete months
        mrows = []
        if has_m:
            flows = self.con.execute(f"""WITH x AS (SELECT rep AS e, par AS i, SUM(v) AS v FROM fa
                    WHERE period = {ya} AND flow = 'X' GROUP BY 1, 2)
                SELECT e, i FROM x ORDER BY v DESC LIMIT 5""").fetchall()
            lo = add_months(ym, -23)
            for e, i in flows:
                r = self.con.execute(f"""WITH x AS (SELECT period, SUM(v) AS vx FROM fm WHERE rep = {e} AND par = {i}
                        AND flow = 'X' AND period BETWEEN {lo} AND {ym} GROUP BY 1),
                    m AS (SELECT period, SUM(v) AS vm FROM fm WHERE rep = {i} AND par = {e} AND flow = 'M'
                        AND period BETWEEN {lo} AND {ym} GROUP BY 1)
                    SELECT m.vm / x.vx FROM x JOIN m USING (period) WHERE x.vx > 0""").fetchall()
                ratios = [q[0] for q in r]
                if len(ratios) >= 12:
                    a = np.array(ratios)
                    mrows.append([names[e]["id"], names[i]["id"], len(a), sig(a.mean(), 3), sig(a.min(), 3),
                                  sig(a.max(), 3), sig(a.std(), 3)])
        tiers[0].append({
            "id": "mirror_monthly", "rows": mrows, "cols": ["exp", "imp", "months", "mean", "min", "max", "sd"],
            "period": [add_months(ym, -23), ym], "band": [MIRROR_LO, MIRROR_HI],
            "status": "not run" if not mrows else
            ("pass" if all(MIRROR_LO <= r[3] <= MIRROR_HI for r in mrows) else "watch")})

        # tier 0.3: the HS breaks of 2017 and 2022 in world trade
        ser = read_json(HERE / "data" / "series" / "A" / f"{p['slug']}.json") if p.get("A") else None
        brk = None
        if ser:
            cols = ser["cols"]
            w = {r[0]: r[cols.index("world")] for r in ser["rows"]["mirror"]}
            ch = {y: w[y] / w[y - 1] - 1 for y in w if y - 1 in w and w[y - 1] and 2002 <= y <= ya}
            normal = [abs(v) for y, v in ch.items() if y not in (2017, 2022)]
            med = float(np.median(normal)) if normal else None
            jumps = {y: sig(ch[y], 3) for y in (2017, 2022) if y in ch}
            flagged = [y for y, v in jumps.items() if med and abs(v) > max(3 * med, 0.15)]
            brk = {"id": "hs_breaks", "jumps": jumps, "median_abs": sig(med, 3),
                   "status": "not run" if not jumps else ("pass" if not flagged else "watch"), "flagged": flagged}
        tiers[0].append(brk or {"id": "hs_breaks", "status": "not run"})

        # tiers 0.4-0.6: the monthly explorer's windows, from build_windows.py's diag file
        tiers[0] += self.windows(p)
        # tier 0.7: the Korea Customs Service supplement (`kcs check`)
        if p["id"] == "TOTAL":
            tiers[0] += kcs_checks()
            tiers[0].append(completeness_check())

        # tier 0.8: the customs records against Korea's Comtrade file, this product (B5)
        if p["kind"] in ("stage", "basket"):
            tiers[0].append(kcs_stage_check(p["id"]))

        # tier 1: Korea's exports against the Bank of Korea's export value index
        if p["id"] in KOREA_INDEX:
            tiers[1].append(self.korea_index(p, KOREA_INDEX[p["id"]]))
        if p["id"] == "TOTAL":
            for partner, ds in US_IMPORTS.items():
                tiers[1].append(self.us_imports(partner, ds))
            for node, (ds, inverse) in FX.items():
                tiers[2].append(self.fx(node, ds, inverse))
        # tier 2: unit values against prices; value against volume; output
        st = HERE / "data" / "stages" / f"{p['slug']}.json"
        if st.with_name(st.name + ".br").exists():
            years = {int(y): v for y, v in read_json(st)["years"].items()}
            tiers[2].append(self.value_volume(years))
            if p["id"] in PRICES:
                tiers[2].append(self.price(years, PRICES[p["id"]]))
        if p["id"] in OUTPUT and ser:
            tiers[2].append(self.output(ser, OUTPUT[p["id"]]))
        if p["id"] == "C:batteries:cathode":
            tiers[3].append(self.firms_cathode())
        else:
            tiers[3].append({"id": "firms", "status": "not run",
                             "note": "segment table of the Korean chain companies (company filings) not built yet"})
        tiers[4].append({"id": "physical", "status": "not run", "note": "USGS and IEA balances not collected yet"})
        return {"p": p["id"], "run_at": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
                "tiers": [{"tier": k, "checks": v} for k, v in tiers.items() if v]}

    def windows(self, p: dict) -> list[dict]:
        """The timing diagnostic, the splice backtest and the single-month guard of the monthly explorer."""
        f = HERE / "data" / "diag" / f"{p['slug']}.json"
        if not f.with_name(f.name + ".br").exists():
            return [{"id": k, "status": "not run"} for k in ("timing_share", "splice_backtest", "windows_guard")] if "W" in p else []
        d = read_json(f)
        out = []
        tm = d.get("timing", {})
        out.append({"id": "timing_share", "status": "info" if tm.get("flows") else "not run", "months": d.get("months"),
                    "flows": tm.get("flows"), "share_w3": tm.get("share_w3"), "share_w12": tm.get("share_w12"),
                    "share_w3_median": tm.get("share_w3_median"), "var": tm.get("var")})
        bt = d.get("backtest", {})
        rows = []
        for w, cells in bt.items():
            for size, c in cells.items():
                rows.append([int(w), size, c["n"], c["splice"]["mdape"], c["splice"]["p90"], c["splice_window"]["mdape"],
                             c["splice_window"]["p90"], c["partner"]["mdape"], c["partner"]["p90"]])
        alls = [r for r in rows if r[1] == "all" and r[3] is not None and r[7] is not None]
        better = all(r[3] < r[7] for r in alls)
        out.append({"id": "splice_backtest", "months": d.get("months"), "rows": rows,
                    "cols": ["w", "size", "n", "splice_mdape", "splice_p90", "window_mdape", "window_p90",
                             "partner_mdape", "partner_p90"],
                    "status": "not run" if not alls else ("pass" if better else "watch"),
                    "size_quartiles_usd": d.get("size_quartiles_usd")})
        lt = d.get("leak_test", {})
        out.append({"id": "windows_guard", "status": "pass" if lt.get("flows") and not lt.get("single_month") else
                    ("fail" if lt.get("single_month") else "not run"),
                    "tested": lt.get("flows"), "single_month": lt.get("single_month"),
                    "dropped_share": d.get("dropped_share"), "benchmark": d.get("benchmark")})
        return out

    def korea_index(self, p: dict, ds: str) -> dict:
        kor = self.idx["KOR"]
        if p["kind"] == "chapter":   # not a monthly product: read the chapter from the monthly layer
            self.load({"kind": "basket", "codes": p["codes"]}, "M", "fm2", 201501, self.meta["last"]["M"])
            ours = self.own("fm2", kor, "X")
        else:
            ours = self.own("fm", kor, "X")
        theirs = self.series.get(ds, {})
        if not theirs or not ours:
            return {"id": "korea_index", "against": ds, "status": "not run"}
        months = sorted(m for m in ours if m in theirs and m >= 201601)
        pairs = [(yoy3(ours, m), yoy3(theirs, m)) for m in months]
        pairs = [(m, a, b) for m, (a, b) in zip(months, pairs) if a is not None and b is not None]
        last24 = pairs[-24:]
        c = corr([a for _, a, _ in last24], [b for _, _, b in last24])
        disagree = [m for (m, a, b) in last24 if (a > 0) != (b > 0)]
        run2 = any(add_months(m, 1) in disagree for m in disagree)
        base = [201901 + k for k in range(12)]
        show = [m for m in months if m >= 201901]
        return {"id": "korea_index", "against": ds, "lens": "M", "months": [last24[0][0], last24[-1][0]] if last24 else None,
                "corr": sig(c, 3), "sign_disagree": disagree,
                "status": "not run" if c is None else ("pass" if c >= CORR_PASS and not run2 else "watch"),
                "pair": {"t": show, "base": "2019", "a": index_series(ours, show, base),
                         "b": index_series(theirs, show, base)},
                "last": [[m, sig(a, 3), sig(b, 3)] for m, a, b in pairs[-6:]]}

    def us_imports(self, partner: str, ds: str) -> dict:
        usa = self.idx["USA"]
        parts = self.eu if partner == "EU27" else [self.idx[partner]]
        ours = self.own("fm", usa, "M", parts)
        theirs = {m: v * 1e6 for m, v in self.series.get(ds, {}).items()}
        if not theirs or not ours:
            return {"id": "us_imports", "partner": partner, "against": ds, "status": "not run"}
        months = sorted(m for m in ours if m in theirs and m >= 201601)
        gaps = [ours[m] / theirs[m] - 1 for m in months if theirs[m]]
        last24 = months[-24:]
        g24 = [ours[m] / theirs[m] - 1 for m in last24]
        pairs = [(yoy3(ours, m), yoy3(theirs, m)) for m in last24]
        pairs = [(a, b) for a, b in pairs if a is not None and b is not None]
        c = corr([a for a, _ in pairs], [b for _, b in pairs])
        show = [m for m in months if m >= 201901]
        base = [201901 + k for k in range(12)]
        mean_gap = float(np.mean(g24)) if g24 else None
        return {"id": "us_imports", "partner": partner, "against": ds, "months": [last24[0], last24[-1]] if last24 else None,
                "gap_mean": sig(mean_gap, 3), "gap_range": [sig(min(g24), 3), sig(max(g24), 3)] if g24 else None,
                "corr": sig(c, 3), "all_months": len(gaps),
                "status": "not run" if c is None else ("pass" if c >= CORR_PASS and abs(mean_gap) <= GAP_FAIL else "watch"),
                "pair": {"t": show, "base": "2019", "a": index_series(ours, show, base), "b": index_series(theirs, show, base)}}

    def fx(self, node: str, ds: str, inverse: bool) -> dict:
        s = self.series.get(ds, {})
        if not s:
            return {"id": "fx", "node": node, "against": ds, "status": "not run"}
        months = sorted(m for m in s if m >= 201901)
        # national currency per dollar, so a dollar value times the rate is the value at home
        rate = {m: (1 / s[m] if inverse else s[m]) for m in months}
        return {"id": "fx", "node": node, "against": ds, "status": "info",
                "t": months, "per_usd": [sig(rate[m], 5) for m in months],
                "yoy": [sig(rate[m] / rate[add_months(m, -12)] - 1, 3) if add_months(m, -12) in rate else None
                        for m in months]}

    def firms_cathode(self) -> dict:
        """Korea's cathode exports (its own report, quarterly, in won) against the cathode makers'
        revenue (DART), year on year: the makers sell at home too, so the levels differ and the
        changes are compared."""
        path = VALIDATORS / "firms" / "cathode-revenue.json"
        if not path.exists():
            return {"id": "firms_cathode", "status": "not run", "note": "company-filings validator not available"}
        firms = json.loads(path.read_text())["companies"]
        krw = self.series.get("fred-krw-per-usd-m", {})
        exp = self.own("fm", self.idx["KOR"], "X")
        q_exp: dict[str, float] = {}
        filed = {r[0] for r in self.con.execute(f"SELECT period FROM rep_M WHERE node = {self.idx['KOR']}").fetchall()}
        for y in range(2019, self.meta["last"]["M"] // 100 + 1):
            for q in range(1, 5):
                ms = [y * 100 + 3 * (q - 1) + k for k in (1, 2, 3)]
                if all(m in filed and m in krw for m in ms):
                    q_exp[f"{y}Q{q}"] = sum(exp.get(m, 0.0) * krw[m] for m in ms)
        rev: dict[str, float] = {}
        for by in firms.values():
            for k, v in by.items():
                rev[k] = rev.get(k, 0.0) + v
        def prev(k: str) -> str:
            return f"{int(k[:4]) - 1}{k[4:]}"
        keys = sorted(k for k in q_exp if k in rev and prev(k) in q_exp and prev(k) in rev)
        pairs = [(k, q_exp[k] / q_exp[prev(k)] - 1, rev[k] / rev[prev(k)] - 1) for k in keys]
        c = corr([a for _, a, _ in pairs], [b for _, _, b in pairs]) if len(pairs) >= 8 else None
        base = [k for k in sorted(q_exp) if k.startswith("2021") and k in rev]
        show = [k for k in sorted(q_exp) if k in rev]
        idx = lambda d: [sig(d[k] / (sum(d[b] for b in base) / len(base)) * 100, 4) if base else None for k in show]  # noqa: E731
        return {"id": "firms_cathode", "against": "firms:cathode-revenue", "companies": sorted(firms),
                "quarters": [keys[0], keys[-1]] if keys else None, "corr": sig(c, 3),
                "status": "not run" if c is None else ("pass" if c >= 0.7 else "watch"),
                "rows": [[k, sig(a, 3), sig(b, 3)] for k, a, b in pairs], "cols": ["quarter", "exports", "revenue"],
                "pair": {"t": show, "base": "2021", "a": idx(q_exp) if base else None, "b": idx(rev) if base else None},
                "note": "Korea's cathode exports (2841.90, 2842.90, its own report, converted at the monthly won rate) "
                        "against the consolidated revenue of the cathode makers in the filings store, year on year"}

    def value_volume(self, years: dict) -> dict:
        ys = sorted(y for y in years if years[y].get("kg") and (years[y].get("kg_coverage") or 0) >= 0.8)
        if len(ys) < 3:
            return {"id": "value_volume", "status": "not run", "note": "net weight covers under 80% of value"}
        rows = []
        for y in ys:
            if y - 1 not in years or not years[y - 1].get("kg") or not years[y - 1].get("usd_per_kg"):
                continue
            dv = math.log(years[y]["world"] / years[y - 1]["world"])
            du = math.log(years[y]["usd_per_kg"] / years[y - 1]["usd_per_kg"]) if years[y]["usd_per_kg"] else None
            if du is None:
                continue
            share = du / dv if abs(dv) > 0.05 else None
            rows.append([y, sig(math.exp(dv) - 1, 3), sig(math.exp(du) - 1, 3), sig(math.exp(dv - du) - 1, 3),
                         sig(share, 3), bool(share is not None and share > 0.5)])
        base = ys[0]
        return {"id": "value_volume", "status": "info", "cols": ["year", "value", "unit_value", "volume", "price_share", "price_driven"],
                "rows": rows, "pair": {"t": ys, "base": str(base),
                                       "a": [sig(years[y]["world"] / years[base]["world"] * 100, 4) for y in ys],
                                       "b": [sig(years[y]["kg"] / years[base]["kg"] * 100, 4) for y in ys]}}

    def price(self, years: dict, ds: str) -> dict:
        s = self.series.get(ds, {})
        ann = {}
        for m, v in s.items():
            ann.setdefault(m // 100, []).append(v)
        ann = {y: sum(v) / len(v) for y, v in ann.items() if len(v) == 12}
        ys = sorted(y for y in years if y in ann and years[y].get("usd_per_kg") and (years[y].get("kg_coverage") or 0) >= 0.8)
        if len(ys) < 6:
            return {"id": "price", "against": ds, "status": "not run"}
        ch = [(y, years[y]["usd_per_kg"] / years[y - 1]["usd_per_kg"] - 1, ann[y] / ann[y - 1] - 1)
              for y in ys if y - 1 in ys]
        c = corr([a for _, a, _ in ch], [b for _, _, b in ch]) if len(ch) >= 6 else None
        base = ys[0]
        return {"id": "price", "against": ds, "corr": sig(c, 3) if c is not None else None,
                "status": "not run" if c is None else ("pass" if c >= 0.7 else "watch"),
                "rows": [[y, sig(a, 3), sig(b, 3)] for y, a, b in ch], "cols": ["year", "unit_value", "price"],
                "pair": {"t": ys, "base": str(base),
                         "a": [sig(years[y]["usd_per_kg"] / years[base]["usd_per_kg"] * 100, 4) for y in ys],
                         "b": [sig(ann[y] / ann[base] * 100, 4) for y in ys]}}

    def output(self, ser: dict, ds: str) -> dict:
        s = self.series.get(ds, {})
        ann = {}
        for m, v in s.items():
            ann.setdefault(m // 100, []).append(v)
        ann = {y: sum(v) / len(v) for y, v in ann.items() if len(v) == 12}
        cols = ser["cols"]
        w = {r[0]: r[cols.index("world")] for r in ser["rows"]["mirror"]}
        ys = sorted(y for y in w if y in ann and y <= self.complete["A"])
        if len(ys) < 6:
            return {"id": "output", "against": ds, "status": "not run"}
        ch = [(y, w[y] / w[y - 1] - 1, ann[y] / ann[y - 1] - 1) for y in ys if y - 1 in ys]
        c = corr([a for _, a, _ in ch], [b for _, _, b in ch]) if len(ch) >= 6 else None
        base = ys[0]
        return {"id": "output", "against": ds, "status": "info", "corr": sig(c, 3),
                "note": "context: US output in volume against world trade in dollars",
                "pair": {"t": ys, "base": str(base), "a": [sig(w[y] / w[base] * 100, 4) for y in ys],
                         "b": [sig(ann[y] / ann[base] * 100, 4) for y in ys]}}


CHECKS = {   # what each check is, for /method/checks
    "monthly_sum": {"tier": 0, "en": "Twelve monthly files against the annual file (exports of the ten largest exporters and Korea, 2017–2024)",
                    "ko": "월별 파일 12개 합계와 연간 파일 비교(상위 10개 수출국과 한국의 수출, 2017~2024년)",
                    "threshold": {"en": "the value-weighted gap of any year: watch above 1%, fail above 5%; each reporter's gap is listed",
                                  "ko": "어느 해든 금액 가중 평균 차이가 1%를 넘으면 주의, 5%를 넘으면 실패. 신고국별 차이도 함께 보인다"}},
    "mirror_monthly": {"tier": 0, "en": "Monthly mirror ratio of the five largest flows (importer's report ÷ exporter's)",
                       "ko": "상위 5개 교역 흐름의 월별 미러 비율(수입국 신고 ÷ 수출국 신고)",
                       "threshold": {"en": "note outside 0.8–1.25", "ko": "0.8–1.25 밖이면 표시"}},
    "hs_breaks": {"tier": 0, "en": "Jumps in world trade at the HS breaks of 2017 and 2022",
                  "ko": "2017년·2022년 HS 개정 시점의 세계 교역 급변",
                  "threshold": {"en": "watch above three times the usual yearly change and 15%", "ko": "평소 연간 변화의 3배와 15%를 넘으면 주의"}},
    "timing_share": {"tier": 0, "en": "Timing share: how much of the month-to-month noise in the mirror ratio (importer's report ÷ exporter's) goes when months are summed in threes",
                     "ko": "시점 몫: 미러 비율(수입국 신고 ÷ 수출국 신고)의 월별 흔들림 가운데 3개월 합계에서 사라지는 몫",
                     "threshold": {"en": "context: 1 − var(log ratio, 3-month sums) ÷ var(log ratio, single months), flows both sides filed, 2015–2024",
                                   "ko": "참고. 1 − 분산(3개월 합계 로그 비율) ÷ 분산(단월 로그 비율). 양쪽 모두 신고한 흐름, 2015~2024년"}},
    "splice_backtest": {"tier": 0, "en": "Splice backtest: reported windows hidden, estimated, and compared with the report (median absolute % error and 90th percentile)",
                        "ko": "이어 붙이기 역검증: 신고된 기간을 숨기고 추정해 실제 신고와 비교(절대 오차율 중앙값과 90분위)",
                        "threshold": {"en": "pass when the splice beats the partner's report as is at every window length",
                                      "ko": "모든 합계 기간에서 상대국 신고를 그대로 쓸 때보다 오차가 작으면 통과"}},
    "windows_guard": {"tier": 0, "en": "No single month can be computed from the published windows (rank test of the largest flows)",
                      "ko": "공개한 합계에서 어느 한 달의 값도 계산할 수 없음(상위 흐름의 계수 검사)",
                      "threshold": {"en": "fail if any tested flow has a single month in the span of its windows",
                                    "ko": "검사한 흐름 하나라도 단월 값이 풀리면 실패"}},
    "kcs_complete": {"tier": 0, "en": "Korea Customs Service supplement: every month from the first to the last stored, each with every country that traded",
                     "ko": "관세청 보충 자료: 첫 달부터 마지막 달까지 빠짐없이, 달마다 교역한 모든 국가 포함",
                     "threshold": {"en": "fail on a missing month or country", "ko": "빠진 달이나 국가가 있으면 실패"}},
    "kcs_world": {"tier": 0, "en": "Korea Customs Service: the sum over countries against Korea's trade with the world, by month and flow",
                  "ko": "관세청: 국가별 합계와 세계 전체 교역 비교(월·수출입별)",
                  "threshold": {"en": "pass within 0.1%, fail above 0.5%; watch when any HS6 code is off by more than 1%",
                                "ko": "0.1% 이내면 통과, 0.5%를 넘으면 실패. HS6 코드 하나라도 1% 넘게 어긋나면 주의"}},
    "kcs_codes": {"tier": 0, "en": "Korea Customs Service: value on country codes not mapped to an economy (Areas n.e.s. included)",
                  "ko": "관세청: 경제권에 대응하지 않는 국가 코드의 금액(‘달리 분류되지 않은 지역’ 포함)",
                  "threshold": {"en": "pass up to 0.1% of the month, fail above 1% or on an unknown code",
                                "ko": "그 달의 0.1%까지 통과, 1%를 넘거나 모르는 코드가 있으면 실패"}},
    "kcs_revisions": {"tier": 0, "en": "Korea Customs Service: revisions at the last fetch to months older than three",
                      "ko": "관세청: 마지막 수집에서 석 달 넘은 달의 수정 폭",
                      "threshold": {"en": "watch above 0.5% of a month", "ko": "한 달의 0.5%를 넘으면 주의"}},
    "kcs_overlap": {"tier": 0, "en": "Korea Customs Service against Korea's Comtrade file on the months both hold: partners, partner × HS chapter, watch codes",
                    "ko": "두 자료가 모두 있는 달의 관세청 자료와 한국의 Comtrade 파일 비교(상대국, 상대국×HS 류, 감시 코드)",
                    "threshold": {"en": "pass within 0.1% for all goods, fail above 0.5%; watch on a partner-chapter pair over US$10 m off by more than 1%",
                                  "ko": "전체 상품 0.1% 이내면 통과, 0.5%를 넘으면 실패. 1천만 달러가 넘는 상대국·류 쌍이 1% 넘게 어긋나면 주의"}},
    "kcs_fresh": {"tier": 0, "en": "Korea Customs Service: the newest month stored against the calendar (after the 25th, last month's)",
                  "ko": "관세청: 저장된 최신 달과 달력 비교(25일 이후에는 지난달까지)",
                  "threshold": {"en": "watch when late", "ko": "늦으면 주의"}},
    "kcs_history": {"tier": 0, "en": "Korea Customs Service, 2000–2012 (before Korea's first Comtrade monthly file), summed by year against Korea's annual Comtrade file: the world, partners, watch HS6 codes",
                    "ko": "관세청 2000~2012년(한국의 첫 Comtrade 월별 파일 이전)을 연도별로 합해 한국의 연간 Comtrade 파일과 비교(세계, 상대국, 감시 HS6 코드)",
                    "threshold": {"en": "pass within 0.1% (world), 0.5% (partners) and 1% (watch codes); else watch",
                                  "ko": "세계 0.1%, 상대국 0.5%, 감시 코드 1% 이내면 통과, 아니면 주의"}},
    "kcs_seam": {"tier": 0, "en": "Where Korea's series changes source (customs ↔ Comtrade): the month-to-month change against the usual change between the same two months",
                 "ko": "한국 시계열의 출처가 바뀌는 곳(관세청 ↔ Comtrade): 그달의 전월 대비 변화와 같은 두 달 사이의 평소 변화 비교",
                 "threshold": {"en": "pass within 10% of the usual change", "ko": "평소 변화의 10% 이내면 통과"}},
    "kcs_stage": {"tier": 0, "en": "Korea Customs Service against Korea's Comtrade file for this product, every month both hold: exports and imports",
                  "ko": "두 자료가 모두 있는 달마다 이 품목의 관세청 자료와 한국의 Comtrade 파일 비교(수출·수입)",
                  "threshold": {"en": "watch when a month over US$1 m is off by more than 1%", "ko": "100만 달러가 넘는 달이 1% 넘게 어긋나면 주의"}},
    "kcs_stages": {"tier": 0, "en": "Korea Customs Service against Korea's Comtrade file for every chain stage and basket: the distribution of the monthly gaps (median, 95th percentile, largest)",
                   "ko": "모든 사슬 단계와 코드 묶음에서 관세청 자료와 한국의 Comtrade 파일 비교: 월별 차이의 분포(중앙값, 95백분위, 최대)",
                   "threshold": {"en": "watch when any product-month over US$1 m is off by more than 1%", "ko": "100만 달러가 넘는 품목·월 하나라도 1% 넘게 어긋나면 주의"}},
    "kcs_headline": {"tier": 0, "en": "Korea Customs Service records summed over every code and country against the service's own monthly export and import totals (ECOS 901Y118), month by month",
                     "ko": "관세청 기록을 모든 코드와 국가에 걸쳐 합한 값과 관세청의 월별 수출입 총액(ECOS 901Y118) 비교, 달마다",
                     "threshold": {"en": "each month passes within 0.1%; watch when any month fails", "ko": "달마다 0.1% 이내면 통과, 실패한 달이 있으면 주의"}},
    "kcs_handover": {"tier": 0, "en": "When Korea's Comtrade file replaces the customs months: the switch logged, and each year's gap between the two sources",
                     "ko": "한국의 Comtrade 파일이 관세청 자료를 대신할 때: 전환 기록과 연도별 두 자료의 차이",
                     "threshold": {"en": "watch when a year's exports or imports differ by more than 0.5%", "ko": "연간 수출이나 수입이 0.5% 넘게 다르면 주의"}},
    "completeness": {"tier": 0, "en": "Incomplete periods: no drawn point of an economy's 12-month line falls by 30% or more while its completeness falls; economy-months flagged in 2015–2024; the last month offered",
                     "ko": "불완전한 시점: 경제권의 12개월 선에서 그린 점이 완전성이 떨어지면서 30% 넘게 줄어든 곳이 없음. 2015~2024년에 표시된 경제권·월 수, 마지막으로 고를 수 있는 달",
                     "threshold": {"en": "watch on any such fall", "ko": "그런 감소가 하나라도 있으면 주의"}},
    # consistency
    "k1_growth_base": {"tier": 0, "en": "Growth over the year: every growth base window ends exactly 12 months before its window (changes.json, recomputed from the 12-month windows)",
                       "ko": "",
                       "threshold": {"en": "fail on any base that is not 12 months earlier, or a growth that differs from the windows", "ko": ""}},
    "k4_retired_files": {"tier": 0, "en": "One monthly rule: no page, component or script reads the retired monthly lenses (snap/M, series/M, nodes/M, flows/M), and none is on disk",
                         "ko": "",
                         "threshold": {"en": "fail on any read or file", "ko": ""}},
    "k5_reported_zero": {"tier": 0, "en": "No reported zero: a month an importer filed without a row of the product is never read as its report of zero (it is interpolated from the months around it, or estimated from the partners)",
                         "ko": "",
                         "threshold": {"en": "fail on any such flow-month in any monthly product", "ko": ""}},
    "korea_index": {"tier": 1, "en": "Korea's exports against the Bank of Korea's export value index (3-month sums, year on year)",
                    "ko": "한국 수출과 한국은행 수출금액지수 비교(3개월 합계 전년동기비)",
                    "threshold": {"en": "pass with correlation ≥ 0.8 over 24 months and no two months running of opposite signs",
                                  "ko": "24개월 상관계수 0.8 이상, 부호가 두 달 연속 어긋나지 않으면 통과"}},
    "us_imports": {"tier": 1, "en": "US imports by origin against the Census (FRED), all goods",
                   "ko": "미국의 원산지별 수입과 미국 센서스국 통계(FRED) 비교",
                   "threshold": {"en": "pass with correlation ≥ 0.8 and a mean level gap within 5%", "ko": "상관계수 0.8 이상, 평균 수준 차 5% 이내면 통과"}},
    "fx": {"tier": 2, "en": "Exchange rates (FRED H.10): the change at home next to the change in dollars",
           "ko": "환율(FRED H.10): 달러 기준 변화와 자국 통화 기준 변화", "threshold": {"en": "context", "ko": "참고"}},
    "value_volume": {"tier": 2, "en": "Value against volume (net weight); price-driven when the unit value explains more than half",
                     "ko": "금액과 물량(순중량) 비교: 단가가 변화의 절반 이상을 설명하면 가격 요인",
                     "threshold": {"en": "context", "ko": "참고"}},
    "price": {"tier": 2, "en": "Unit values against world prices (IMF primary commodity prices, FRED)",
              "ko": "단가와 국제 가격(IMF 원자재 가격, FRED) 비교",
              "threshold": {"en": "pass with a correlation of yearly changes ≥ 0.7", "ko": "연간 변화의 상관계수 0.7 이상이면 통과"}},
    "output": {"tier": 2, "en": "US industrial output of the industry (FRED) against world trade in the product",
               "ko": "미국 해당 산업 생산(FRED)과 세계 교역 비교", "threshold": {"en": "context", "ko": "참고"}},
    "firms": {"tier": 3, "en": "Firms: Korean chain companies' segment revenue (DART)", "ko": "기업: 한국 공급망 기업의 부문별 매출(DART)",
              "threshold": {"en": "not built yet", "ko": "아직 구축 전"}},
    "firms_cathode": {"tier": 3, "en": "Korea's cathode exports against the cathode makers' revenue (DART filings), quarterly, year on year",
                      "ko": "한국 양극재 수출과 양극재 기업 매출(DART 공시) 비교, 분기, 전년동기비",
                      "threshold": {"en": "pass with a correlation of yearly changes ≥ 0.7", "ko": "전년동기비 상관계수 0.7 이상이면 통과"}},
    "physical": {"tier": 4, "en": "Physical balances: production against traded tonnage (USGS, IEA)", "ko": "물량 수지: 생산량과 교역 물량(USGS, IEA)",
                 "threshold": {"en": "not built yet", "ko": "아직 구축 전"}},
}


KCS_SHOWN = ("kcs_complete", "kcs_world", "kcs_codes", "kcs_revisions", "kcs_overlap", "kcs_fresh", "kcs_history",
             "kcs_seam")
CLIFF = 0.30   # a drawn 12-month window this much below the one before it, while completeness fell, is a cliff left


def completeness_check() -> dict:
    """The incomplete-period rule on the monthly explorer's 12-month windows of
    all goods: no drawn point (completeness at least MIN, up to meta.shown) falls by CLIFF or more from the window before
    it while its completeness fell; economy-months flagged in 2015-2024 (economies over US$100 bn); the last offered
    month and the economies incomplete in it."""
    f = HERE / "data" / "nodes" / "W" / "TOTAL.json"
    if not f.with_name(f.name + ".br").exists():
        return {"id": "completeness", "status": "not run"}
    meta = read_json(HERE / "data" / "meta.json")
    b = read_json(f).get("12") or {}
    if "c" not in b:
        return {"id": "completeness", "status": "not run", "note": "nodes/W carries no completeness"}
    ids = [n["id"] for n in meta["nodes"]]
    shown = (meta.get("shown") or {}).get("W") or meta["last"]["M"]
    ts = b["t"]
    cliffs, flagged, tested, now_low = [], 0, 0, []
    for k, g in enumerate(b["ids"]):
        tot = [(x or 0) + (m or 0) for x, m in zip(b["x"][k], b["m"][k])]
        c = b["c"][k]
        prev = None
        for j, t in enumerate(ts):
            if t > shown:
                break
            if 201501 <= t <= 202412 and tot[j] >= 100e9:
                tested += 1
                flagged += (c[j] or 1) < bs.COMPLETE_SHARE
            if (c[j] if c[j] is not None else 1) < bs.COMPLETE_SHARE:
                continue
            if prev is not None and tot[prev] > 0 and tot[j] < (1 - CLIFF) * tot[prev] and (c[j] or 1) < (c[prev] or 1) - 0.05:
                cliffs.append([ids[g], t, round(tot[j] / tot[prev] - 1, 3), c[prev], c[j]])
            prev = j
        if shown in ts:
            cj = c[ts.index(shown)]
            if cj is not None and cj < bs.COMPLETE_SHARE and tot[ts.index(shown)] >= 50e9:
                now_low.append([ids[g], cj])
    return {"id": "completeness", "status": "pass" if not cliffs else "watch", "shown": shown,
            "flagged_2015_2024": [flagged, tested], "cliffs": cliffs[:20], "incomplete_at_shown": sorted(now_low, key=lambda r: r[1])}


def kcs_checks() -> list[dict]:
    """The supplement's checks as `kcs check` last wrote them (<data root>/kcs/checks.json), with subject KOR, and the
    three run here: the stages and baskets against Korea's Comtrade file, the headline totals, the hand-over."""
    path = KCS.parent / "checks.json"
    if not path.exists():
        base = [{"id": k, "status": "not run", "node": "KOR"} for k in KCS_SHOWN]
    else:
        d = json.loads(path.read_text())
        base = [{**c, "node": "KOR", "run_at": d["run_at"]} for c in d["checks"] if c["id"] in KCS_SHOWN]
    return base + [{**c, "node": "KOR"} for c in (kcs_stages_summary(), kcs_headline(), kcs_handover())]


KCS_STORE = KCS.parent / "store"
KCS_REPORTER = "410"
STAGE_GAP = 0.01          # a stage-month off by more than this is flagged (B5)
STAGE_MIN = 1e6           # ... when Korea's Comtrade value that month is at least US$1 m
HEADLINE_TOL = 0.001      # the customs records summed against the service's own monthly totals (B9)


def _kcs_items() -> str:
    return f"read_parquet('{KCS_STORE / 'items'}/*/*.parquet', hive_partitioning = false)"


_GAPS: dict | None = None


def kcs_stage_gaps() -> dict:
    """Every chain stage and basket, on every month both the customs store and Korea's Comtrade file hold: Korea's
    exports and imports summed from the customs records (HS10 to the product's codes, all countries) against
    Korea's own Comtrade report to the world. {pid: {months, x, m (gap by month, signed:
    customs ÷ Comtrade − 1), x_all, m_all}} plus "_months"."""
    global _GAPS
    if _GAPS is not None:
        return _GAPS
    _GAPS = {}
    if not (KCS_STORE / "items").exists():
        return _GAPS
    con = duckdb.connect()
    store = {r[0] for r in con.execute(f"SELECT DISTINCT period FROM {_kcs_items()}").fetchall()}
    ct = {r[0] for r in con.execute(f"""SELECT DISTINCT period FROM read_parquet('{NET / 'M' / 'reporting.parquet'}')
        WHERE reporter = '{KCS_REPORTER}' AND NOT excluded""").fetchall()}
    both = sorted(store & ct)
    if not both:
        return _GAPS
    pl = ", ".join(map(str, both))
    meta = read_json(HERE / "data" / "meta.json")
    con.execute(f"CREATE TEMP TABLE k AS SELECT period, hs10, sum(x) x, sum(m) m FROM {_kcs_items()} WHERE period IN ({pl}) GROUP BY 1, 2")
    for p in meta["products"]:
        if p["kind"] not in ("stage", "basket") or not p.get("codes"):
            continue
        codes = p["codes"]
        kc = " OR ".join(f"hs10 LIKE '{c}%'" for c in codes)
        two = [c for c in codes if len(c) == 2]
        rest = [c for c in codes if len(c) > 2]
        parts = []
        if rest:
            parts.append(f"""SELECT period, value, flow FROM read_parquet('{NET / 'M' / 'watch.parquet'}')
                WHERE reporter = '{KCS_REPORTER}' AND partner = '0' AND cmd IN ({', '.join(repr(c) for c in rest)})""")
        if two:
            parts.append(f"""SELECT period, value, flow FROM read_parquet('{NET / 'M' / 'hs2.parquet'}')
                WHERE reporter = '{KCS_REPORTER}' AND partner = '0' AND cmd IN ({', '.join(repr(c) for c in two)})""")
        rows = con.execute(f"""
            WITH a AS (SELECT period, sum(x) x, sum(m) m FROM k WHERE {kc} GROUP BY 1),
                 b AS (SELECT period, sum(value) FILTER (flow = 'X') x, sum(value) FILTER (flow = 'M') m
                       FROM ({' UNION ALL '.join(parts)}) WHERE period IN ({pl}) GROUP BY 1)
            SELECT b.period, coalesce(a.x, 0), coalesce(a.m, 0), coalesce(b.x, 0), coalesce(b.m, 0)
            FROM b LEFT JOIN a USING (period) ORDER BY 1""").fetchall()
        if not rows:
            continue
        gap = lambda a, b: sig(a / b - 1, 4) if b >= STAGE_MIN else None  # noqa: E731
        ax, am, bx, bm = (sum(r[i] for r in rows) for i in (1, 2, 3, 4))
        _GAPS[p["id"]] = {"months": [r[0] for r in rows], "x": [gap(r[1], r[3]) for r in rows],
                          "m": [gap(r[2], r[4]) for r in rows],
                          "x_all": sig(ax / bx - 1, 4) if bx else None, "m_all": sig(am / bm - 1, 4) if bm else None}
    _GAPS["_months"] = both
    return _GAPS


def kcs_stage_check(pid: str) -> dict:
    """One product's customs-against-Comtrade gaps, by month and flow (B5); watch when a month is off by > 1%."""
    g = kcs_stage_gaps().get(pid)
    if not g:
        return {"id": "kcs_stage", "status": "not run", "node": "KOR"}
    vals = [abs(v) for v in g["x"] + g["m"] if v is not None]
    worst = max(vals, default=0.0)
    return {"id": "kcs_stage", "status": "pass" if worst <= STAGE_GAP else "watch", "node": "KOR",
            "months": [g["months"][0], g["months"][-1], len(g["months"])], "worst": sig(worst, 3),
            "x_all": g["x_all"], "m_all": g["m_all"],
            "flagged": [[t, f, v] for t, xs, ms in zip(g["months"], g["x"], g["m"]) for f, v in (("X", xs), ("M", ms))
                        if v is not None and abs(v) > STAGE_GAP][:24]}


def kcs_stages_summary() -> dict:
    """The distribution of the stage-month gaps over every stage and basket (median, p95, max), and the products
    with a month off by more than 1% (B5)."""
    g = {k: v for k, v in kcs_stage_gaps().items() if k != "_months"}
    if not g:
        return {"id": "kcs_stages", "status": "not run", "note": "no month in both the customs store and Korea's Comtrade file"}
    vals = np.array([abs(v) for x in g.values() for v in x["x"] + x["m"] if v is not None])
    flagged = sorted({k for k, x in g.items() if any(v is not None and abs(v) > STAGE_GAP for v in x["x"] + x["m"])})
    ms = kcs_stage_gaps()["_months"]
    return {"id": "kcs_stages", "status": "pass" if not flagged else "watch",
            "months": [ms[0], ms[-1], len(ms)], "products": len(g), "cells": int(vals.size),
            "median": sig(float(np.median(vals)), 3), "p95": sig(float(np.percentile(vals, 95)), 3),
            "max": sig(float(vals.max()), 3), "flagged": flagged}


def kcs_headline() -> dict:
    """The customs records summed over every code and country against the customs service's own monthly export and
    import totals (ECOS 901Y118, independent of the item API), per month (B9)."""
    hx, hm = load_series("ecos-901y118-t002-m"), load_series("ecos-901y118-t004-m")
    if not hx or not (KCS_STORE / "items").exists():
        return {"id": "kcs_headline", "status": "not run", "note": "ECOS 901Y118 not fetched (checks.py fetch)"}
    rows = duckdb.sql(f"SELECT period, sum(x), sum(m) FROM {_kcs_items()} GROUP BY 1 ORDER BY 1").fetchall()
    by = {}
    for t, x, m in rows:
        if t in hx and t in hm:
            gx, gm = x / (hx[t] * 1000) - 1, m / (hm[t] * 1000) - 1   # ECOS in thousands of dollars
            by[str(t)] = [sig(gx, 3), sig(gm, 3), "pass" if max(abs(gx), abs(gm)) <= HEADLINE_TOL else "fail"]
    if not by:
        return {"id": "kcs_headline", "status": "not run", "note": "no month in both"}
    fails = [t for t, v in by.items() if v[2] == "fail"]
    later = sorted(set(int(t) for t, *_ in rows) - set(int(t) for t in by))
    return {"id": "kcs_headline", "status": "pass" if not fails else "watch", "months": len(by),
            "worst": sig(max(max(abs(v[0]), abs(v[1])) for v in by.values()), 3), "fails": fails,
            "not_yet_in_ecos": later, "by_month": by}


def kcs_handover() -> dict:
    """The months the customs service filled and Comtrade now holds (Korea's file arrived): logged once, with each
    year's gap between the two (World exports and imports), kept in <data root>/kcs/handover.json (B4)."""
    try:
        b = json.loads((KCS / "M" / "build.json").read_text())
    except (OSError, ValueError):
        return {"id": "kcs_handover", "status": "not run"}
    path = KCS.parent / "handover.json"
    log = json.loads(path.read_text()) if path.exists() else {"supplied": [], "events": []}
    now_sup = sorted(int(t) for t in b.get("months", []))
    held = sorted(int(t) for t in b.get("skipped_comtrade", []))
    gone = sorted(set(log["supplied"]) - set(now_sup))      # supplied last time, Comtrade's now
    con = duckdb.connect()
    years = sorted({t // 100 for t in held})
    gaps = {}
    for y in years:
        r = con.execute(f"""WITH a AS (SELECT sum(x) x, sum(m) m FROM {_kcs_items()} WHERE period BETWEEN {y}01 AND {y}12),
            b AS (SELECT sum(value) FILTER (flow = 'X') x, sum(value) FILTER (flow = 'M') m
                  FROM read_parquet('{NET / 'M' / 'total.parquet'}') WHERE reporter = '{KCS_REPORTER}' AND partner = '0'
                  AND period BETWEEN {y}01 AND {y}12)
            SELECT a.x / b.x - 1, a.m / b.m - 1 FROM a, b""").fetchone()
        if r and r[0] is not None:
            gaps[str(y)] = [sig(r[0], 3), sig(r[1], 3)]
    if gone:
        log["events"].append({"at": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"), "months": gone,
                              "gap_by_year": {k: v for k, v in gaps.items() if int(k) in {t // 100 for t in gone}}})
    log["supplied"] = now_sup
    path.write_text(json.dumps(log, indent=1))
    return {"id": "kcs_handover", "status": "pass" if all(max(abs(a), abs(b)) <= 0.005 for a, b in gaps.values()) else "watch",
            "comtrade_holds": [held[0], held[-1], len(held)] if held else None, "gap_by_year": gaps,
            "events": log["events"][-5:]}


def windows_summary() -> dict | None:
    """The monthly explorer's diagnostics for /method/checks: all goods in full, and the medians over the products."""
    d = HERE / "data" / "diag"
    if not d.exists():
        return None
    files = sorted(d.glob("*.json.br"))
    diags = [read_json(f.with_name(f.name[:-3])) for f in files]
    total = next((x for x in diags if x.get("p") == "TOTAL"), None)
    med = {}
    for w in ("3", "6", "12"):
        cells = [x["backtest"][w]["all"] for x in diags if w in x.get("backtest", {})]
        def m(path):
            v = [c[path[0]][path[1]] for c in cells if c[path[0]][path[1]] is not None]
            return sig(float(np.median(v)), 3) if v else None
        med[w] = {"products": len(cells), "splice_mdape": m(("splice", "mdape")), "splice_p90": m(("splice", "p90")),
                  "partner_mdape": m(("partner", "mdape")), "partner_p90": m(("partner", "p90"))}
    shares = [x["timing"]["share_w3"] for x in diags if x.get("timing", {}).get("share_w3") is not None]
    return {"total": {k: total.get(k) for k in ("months", "timing", "backtest", "size_quartiles_usd", "leak_test",
                                                "dropped_share", "benchmark")} if total else None,
            "products": len(diags), "backtest_median": med,
            "timing_share_median": sig(float(np.median(shares)), 3) if shares else None,
            "leaks": sum(x.get("leak_test", {}).get("single_month", 0) for x in diags),
            "leak_tested": sum(x.get("leak_test", {}).get("flows", 0) for x in diags)}


# -- consistency checks: K1, K4, K5 -----------------------------------------------

RETIRED_READS = [   # reads of the retired monthly lenses (K4): a path literal or a loader asked for "M"
    re.compile(r"""[\"'`/](?:snap|series|nodes|flows)/M/"""),
    re.compile(r"""/\s*["'](?:snap|series|nodes|flows)["']\s*/\s*["']M["']"""),
    re.compile(r"""load(?:Series|NodeSeries|FlowSeries)\([^)]*["']M["']\s*\)"""),
]
K4_SCAN = [(".claude/skills", ("*.py",)), ("apps/web/app", ("*.ts", "*.tsx")), ("apps/web/components", ("*.ts", "*.tsx")), ("apps/web/lib", ("*.ts", "*.tsx")),
           ("packages/net/src", ("*.ts", "*.tsx")), ("scripts", ("*.py",))]


def _code_only(line: str, py: bool) -> str:
    """A source line without its comment (approximately: '#' for Python, '//' and block-comment lines for TS)."""
    t = line.strip()
    if py:
        return line.split("#", 1)[0]
    if t.startswith(("*", "/*", "//")):
        return ""
    return line.split("//", 1)[0] if "//" in line and "://" not in line else line


def k4_retired() -> dict:
    """K4: nothing reads the retired monthly lenses, and their folders are gone from data/."""
    hits = []
    for rel, globs in K4_SCAN:
        for g in globs:
            for f in sorted((HERE / rel).rglob(g)):
                if "node_modules" in f.parts or "tests" in f.parts or f.name == "checks.py":
                    continue
                for k, line in enumerate(f.read_text().splitlines(), 1):
                    code = _code_only(line, f.suffix == ".py")
                    if any(r.search(code) for r in RETIRED_READS):
                        hits.append(f"{f.relative_to(HERE)}:{k}")
    on_disk = [d for d in ("snap/M", "series/M", "nodes/M", "flows/M") if (HERE / "data" / d).exists()]
    return {"id": "k4_retired_files", "status": "fail" if hits or on_disk else "pass", "reads": hits[:20], "on_disk": on_disk}


def k1_growth_base() -> dict:
    """K1: changes.json's export momentum compares each 12-month window with the window ending exactly 12 months
    earlier; the growth is recomputed here from nodes/W/TOTAL."""
    cf = HERE / "data" / "changes.json"
    if not cf.with_name(cf.name + ".br").exists():
        return {"id": "k1_growth_base", "status": "not run"}
    ch = read_json(cf)
    meta = read_json(HERE / "data" / "meta.json")
    nw = read_json(HERE / "data" / "nodes" / "W" / "TOTAL.json")["12"]
    ids = {n["id"]: i for i, n in enumerate(meta["nodes"])}
    pos = {t: q for q, t in enumerate(nw["t"])}
    bad, tested = [], 0
    for it in ch.get("items", []):
        if it.get("kind") != "export_sign":
            continue
        t = it["t"]
        k = pos.get(t)
        base = it.get("base") or [None, None]
        prev = nw["t"][k - 1] if k else None
        for (tt, b, v) in ((prev, base[0], it["mom"][0]), (t, base[1], it["mom"][1])):
            tested += 1
            if b is None or add_months(b, 12) != tt:
                bad.append(f"{it['eco']} {tt}: base {b}")
                continue
            j = nw["ids"].index(ids[it["eco"]]) if ids.get(it["eco"]) in nw["ids"] else None
            x = nw["x"][j] if j is not None else None
            if x and x[pos[tt]] and x[pos[b]] and abs(100 * (x[pos[tt]] / x[pos[b]] - 1) - v) > 0.06:
                bad.append(f"{it['eco']} {tt}: {v} against {round(100 * (x[pos[tt]] / x[pos[b]] - 1), 1)} from the windows")
    return {"id": "k1_growth_base", "status": "fail" if bad else "pass", "tested": tested, "bad": bad[:20]}


def k5_reported_zero() -> dict:
    """K5 (L2): no flow-month is drawn as the importer's own report where the importer filed the month but sent no row
    of the product (Japan's April 2026 file without chapters 84 and 85: its chip imports read as zero and left every
    window holding the month). build_windows.zero_reads counts them per product after the one monthly rule
    (build_windows.apply_rule) and writes the count into diag/<product>.json; any count above zero fails."""
    d = HERE / "data" / "diag"
    files = sorted(d.glob("*.json.br")) if d.exists() else []
    if not files:
        return {"id": "k5_reported_zero", "status": "not run"}
    bad, tested, interp, unfiled = {}, 0, 0, 0
    for f in files:
        x = read_json(f.with_name(f.name[:-3]))
        rl = x.get("rowless")
        if rl is None or "zero_reads" not in rl:
            bad[x.get("p", f.name)] = "no count (built before 17 Nov 2026)"
            continue
        tested += 1
        interp += rl.get("interpolated", 0)
        unfiled += rl.get("unfiled", 0)
        if rl["zero_reads"]:
            bad[x["p"]] = rl["zero_reads"]
    return {"id": "k5_reported_zero", "status": "fail" if bad else "pass", "products": tested, "bad": bad,
            "rowless_node_months": {"interpolated": interp, "left_to_partners": unfiled}}


def consistency(write: bool = True) -> tuple[list[dict], bool]:
    """K1, K4 and K5, written to data/checks/consistency.json; whether all passed."""
    res = [k1_growth_base(), k4_retired(), k5_reported_zero()]
    ok = all(r["status"] in ("pass", "not run") for r in res)
    if write:
        write_json(HERE / "data" / "checks" / "consistency.json",
                   {"run_at": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"), "plan": "the flow sites' consistency rules",
                    "checks": res, "ok": ok})
    for r in res:
        print(f"consistency {r['id']}: {r['status']}" + (f" {r.get('reads') or r.get('on_disk') or r.get('bad') or r.get('cases')}"
                                                         if r["status"] == "fail" else ""), file=sys.stderr)
    return res, ok


def run() -> int:
    meta = read_json(HERE / "data" / "meta.json")
    ck = Checker(meta)
    out = HERE / "data" / "checks"
    summary = []
    products = [p for p in meta["products"] if p["kind"] in ("total", "basket", "stage") or p["id"] in KOREA_INDEX]
    for i, p in enumerate(products, 1):
        res = ck.product(p)
        write_json(out / f"{p['slug']}.json", res)
        for t in res["tiers"]:
            for c in t["checks"]:
                summary.append([p["id"], t["tier"], c["id"], c["status"], c.get("partner") or c.get("node")])
        print(f"[{i}/{len(products)}] {p['id']}", file=sys.stderr, flush=True)
    # each stage's and basket's customs-against-Comtrade gap over the months both hold, for the chain pages'
    # note on the customs months (B6: suppressed cells understate Korea's imports there)
    gaps = {k: {"x": v["x_all"], "m": v["m_all"], "months": [v["months"][0], v["months"][-1]]}
            for k, v in kcs_stage_gaps().items() if k != "_months"}
    write_json(out / "kcs_gaps.json", {"run_at": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"), "products": gaps})
    counts: dict[str, dict[str, int]] = {}
    for _, _, cid, st, _ in summary:
        counts.setdefault(cid, {}).setdefault(st, 0)
        counts[cid][st] += 1
    write_json(out / "index.json", {
        "run_at": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"), "checks": CHECKS, "counts": counts,
        "rows": summary, "cols": ["p", "tier", "check", "status", "subject"],
        "coverage": {"complete": meta["complete"], "last": meta["last"]},
        "records": meta["records"],
        "windows": windows_summary(),
        "validators": [{"id": ds, "what": what, "fetched": bool(ck.series.get(ds)),
                        "last": max(ck.series[ds]) if ck.series.get(ds) else None} for ds, _, _, what in SERIES]})
    print(f"checks: {len(summary)} results for {len(products)} products", file=sys.stderr)
    _, ok = consistency()   # C5: a consistency check that fails stops the build (daily.sh runs it again after build_stories)
    return 0 if ok else 1


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("action", choices=["fetch", "run", "consistency"])
    a = ap.parse_args()
    if a.action == "consistency":   # K1, K4, K5 alone (after build_stories, which writes changes.json)
        return 0 if consistency()[1] else 1
    return fetch() if a.action == "fetch" else run()


if __name__ == "__main__":
    sys.exit(main())

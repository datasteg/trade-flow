"""Stage statistics for the product chains in config/chains.yaml, from the Comtrade network layer.

For each stage and year: world trade (USD), net weight, unit value, the top exporters and
importers, exporter concentration (HHI) and Korea's place. Edges follow the dashboard's mirror
rule: the importer's report when the importer reported that year in HS, else the exporter's.

Run with the trade-collector environment (DuckDB, PyYAML):

    uv run --with duckdb --with pyyaml python scripts/chain_stats.py \
        --years 2019,2024 --out /tmp/chain-stats.json

The network layer is read from $TRADE_COLLECTOR_DATA_ROOT/comtrade/network
(default data-in/comtrade/network).
"""

import argparse
import json
import os
import re
import sys
from pathlib import Path

import duckdb
import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_snapshots as bs  # noqa: E402   the node mapping (partner 490) and the CIF/FOB factor

HERE = Path(__file__).resolve().parent.parent
NET = Path(os.environ.get("TRADE_COLLECTOR_DATA_ROOT", "data-in")) / "comtrade" / "network"
_CODE = re.compile(r"^\d{2}$|^\d{4}$|^\d{6}$")


def code_filter(codes: list[str]) -> str:
    """SQL condition on `cmd` for six-digit codes, headings (4) and chapters (2)."""
    if not codes:
        return "FALSE"
    parts = []
    exact = [c for c in codes if len(c) == 6]
    if exact:
        parts.append("cmd IN (" + ", ".join(f"'{c}'" for c in exact) + ")")
    parts += [f"cmd LIKE '{c}%'" for c in codes if len(c) < 6]
    return "(" + " OR ".join(parts) + ")"


def stage_sql(stage: dict, year: int) -> str:
    codes = stage["codes"]
    old = stage.get("codes_pre2022", codes)
    for c in codes + old:
        if not _CODE.match(c):
            raise ValueError(f"bad code {c!r} in {stage['key']}")
    chapters = sorted({c[:2] for c in codes + old})
    files = ", ".join(f"'{NET}/A/hs6/ch={ch}/data.parquet'" for ch in chapters)
    cond = f"((t.cl = 'H6' AND {code_filter(codes)}) OR (t.cl <> 'H6' AND {code_filter(old)}))"
    return f"""
WITH f AS (
  SELECT rn.node AS rep, pn.node AS par, t.flow, SUM(t.value) AS v,
         SUM(CASE WHEN t.netwgt > 0 THEN t.netwgt END) AS kg,
         SUM(CASE WHEN t.netwgt > 0 THEN t.value END) AS v_kg
  FROM read_parquet([{files}]) t
  JOIN nodes rn ON rn.code = t.reporter
  JOIN nodes pn ON pn.code = t.partner
  WHERE t.period = {year} AND {cond}
    AND rn.node IS NOT NULL AND pn.node IS NOT NULL AND rn.node <> pn.node
  GROUP BY ALL),
x AS (SELECT rep AS exp, par AS imp, v, kg, v_kg FROM f WHERE flow = 'X'),
m AS (SELECT par AS exp, rep AS imp, v, kg, v_kg FROM f WHERE flow = 'M'),
e AS (SELECT COALESCE(x.exp, m.exp) AS exp, COALESCE(x.imp, m.imp) AS imp,
             x.v AS vx, m.v AS vm, x.kg AS kx, m.kg AS km, x.v_kg AS vkx, m.v_kg AS vkm
      FROM x FULL JOIN m ON x.exp = m.exp AND x.imp = m.imp)
SELECT e.exp, e.imp,
       CASE WHEN r.node IS NOT NULL THEN e.vm ELSE e.vx * {bs.CIF_FOB} END AS w,
       CASE WHEN r.node IS NOT NULL THEN e.km ELSE e.kx END AS kg,
       CASE WHEN r.node IS NOT NULL THEN e.vkm ELSE e.vkx * {bs.CIF_FOB} END AS v_kg,
       r.node IS NOT NULL AS imp_reported
FROM e LEFT JOIN rep r ON r.period = {year} AND r.node = e.imp"""


def summarise(rows: list[tuple]) -> dict:
    rows = [r for r in rows if r[2] and r[2] > 0]
    world = sum(r[2] for r in rows)
    if not world:
        return {"world": 0}
    kg = sum(r[3] or 0 for r in rows)
    v_kg = sum(r[4] or 0 for r in rows)
    exp, imp = {}, {}
    for e, i, w, *_ in rows:   # Asia, n.e.s. (bs.ASIA_NES) is a partner like any other
        exp[e] = exp.get(e, 0) + w
        imp[i] = imp.get(i, 0) + w
    top = lambda d, n: [[k, round(v / world, 4)] for k, v in sorted(d.items(), key=lambda x: -x[1])[:n]]
    rank = lambda d, k: 1 + sorted(d, key=lambda x: -d[x]).index(k) if k in d else None
    kor_sup = {e: w for e, i, w, *_ in rows if i == "KOR"}
    ks = sum(kor_sup.values())
    return {
        "world": round(world),
        "kg": round(kg),
        "usd_per_kg": round(v_kg / kg, 2) if kg else None,
        "kg_coverage": round(v_kg / world, 3),
        "exporters": len(exp),
        "hhi": round(sum((v / world) ** 2 for v in exp.values()), 4),
        "top_exporters": top(exp, 5),
        "top_importers": top(imp, 3),
        "importer_reported": round(sum(r[2] for r in rows if r[5]) / world, 3),
        "kor": {
            "exports": round(exp.get("KOR", 0)), "export_rank": rank(exp, "KOR"),
            "export_share": round(exp.get("KOR", 0) / world, 4),
            "imports": round(imp.get("KOR", 0)), "import_rank": rank(imp, "KOR"),
            "import_share": round(imp.get("KOR", 0) / world, 4),
            "top_supplier": (max(kor_sup, key=kor_sup.get) if kor_sup else None),
            "top_supplier_share": round(max(kor_sup.values()) / ks, 3) if ks else None,
        },
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--years", default="2019,2024")
    ap.add_argument("--chains", default=None, help="comma list; default all")
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    years = [int(y) for y in a.years.split(",")]
    cfg = yaml.safe_load((HERE / "config" / "chains.yaml").read_text())["chains"]
    keys = a.chains.split(",") if a.chains else list(cfg)

    c = duckdb.connect()
    c.execute(f"CREATE TABLE nodes AS SELECT code, node FROM {bs.nodes_table()}")   # partner 490 its own node
    c.execute(f"""CREATE TABLE rep AS
        SELECT r.period, n.node FROM read_parquet('{NET}/A/reporting.parquet') r
        JOIN nodes n ON n.code = r.reporter
        WHERE n.node IS NOT NULL AND NOT r.excluded AND r.cl LIKE 'H%' GROUP BY 1, 2""")
    reporters = dict(c.execute("SELECT period, count(*) FROM rep GROUP BY 1").fetchall())

    out = {"source": str(NET), "years": years,
           "reporters": {y: reporters.get(y) for y in years}, "chains": {}}
    for k in keys:
        ch = cfg[k]
        out["chains"][k] = {"label": ch["label"], "stages": {}}
        for s in ch["stages"]:
            res = {}
            for y in years:
                res[y] = summarise(c.execute(stage_sql(s, y)).fetchall())
            out["chains"][k]["stages"][s["key"]] = res
            w = {y: round(res[y]["world"] / 1e9, 1) for y in years}
            print(f"{k:14s} {s['key']:15s} " + "  ".join(f"{y}: ${w[y]}bn" for y in years),
                  file=sys.stderr)
    Path(a.out).write_text(json.dumps(out, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())

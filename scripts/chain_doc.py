"""Build docs/PRODUCT-CHAINS.html from docs/src/product-chains.html, config/chains.yaml and the
stage statistics written by chain_stats.py.

    python3 scripts/chain_doc.py --stats /tmp/chain-stats.json

Markers in the template, each an HTML comment:
    <!--@styles-->            design/tokens.css and design/larch.css, inlined
    <!--@summary-->           one row per chain: size, chokepoint, Korea's best place
    <!--@korea-->             Korea's top-three places as exporter and importer
    <!--@trail:CHAIN-->       the chain's ChainTrail for the latest year
    <!--@table:CHAIN-->       the chain's stage table, latest year against the first
    <!--@caveats:CHAIN-->     the chain's caveats as Notices
The prose in the template carries its own numbers; rerun chain_stats.py and check them when the
data are updated.
"""

import argparse
import html
import json
from pathlib import Path

import yaml

HERE = Path(__file__).resolve().parent.parent
CHOKE_MIN_WORLD = 1e9      # a chokepoint stage trades at least $1bn
CHOKE_MIN_HHI = 0.25       # and its exporter HHI is high
UV_MIN_COVERAGE = 0.8      # unit value only where net weight covers 80% of value
NAMES = {"KOR": "Korea", "USA": "US", "DEU": "Germany", "CHN": "China"}

WARN = ('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" '
        'stroke-linejoin="round" aria-hidden="true"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/>'
        '<path d="M12 9v4"/><path d="M12 17h.01"/></svg>')


def money(v: float) -> str:
    v = v / 1e9
    if v >= 1000:
        return f"${v:,.0f}bn"
    return f"${v:,.1f}bn" if v >= 1 else f"${v * 1000:,.0f}m"


def hs(code: str) -> str:
    return code if len(code) < 6 else f"{code[:4]}.{code[4:]}"


def stage_var(n: int, total: int) -> str:
    """The colour of rung n of a ladder of `total` rungs, as @larch/net's stageToken: the five stage tokens
    spread over the ramp for ladders of five or fewer, else the derived steps in design/larch.css."""
    if total <= 5:
        return f"var(--stage-{1 + round((n - 1) * 4 / (total - 1)) if total > 1 else 1})"
    return f"var(--stage-{n}-of-{total})"


def chip(code: str, residual: bool = False, ver: str = "") -> str:
    v = f' <span class="lr-hs__ver">{ver}</span>' if ver else ""
    return f'<span class="lr-hs{" lr-hs--residual" if residual else ""}">{hs(code)}{v}</span>'


def is_residual(stage: dict) -> bool:
    c = (stage.get("caveat") or "").lower()
    return "residual" in c or "no code of its own" in c or "no own code" in stage["label"].lower()


def codes_html(stage: dict) -> str:
    res = is_residual(stage)
    out = [chip(c, res, "H6" if "codes_pre2022" in stage else "") for c in stage["codes"]]
    if stage.get("codes_pre2022"):
        out += [chip(c, res, "H5") for c in stage["codes_pre2022"]]
    return " ".join(out)


def pct(x: float) -> str:
    return f"{round(100 * x)}%"


def share(x: float) -> str:
    return pct(x) if x >= 0.095 else f"{100 * x:.1f}%"


def chokepoint(chain: dict, st: dict, year: str) -> str | None:
    big = {s["key"]: st[s["key"]][year] for s in chain["stages"] if st[s["key"]][year].get("world", 0) >= CHOKE_MIN_WORLD}
    if not big:
        return None
    k = max(big, key=lambda x: big[x]["hhi"])
    return k if big[k]["hhi"] > CHOKE_MIN_HHI else None


def sharebar(d: dict, h: int = 8) -> str:
    segs = "".join(f'<span class="lr-sharebar__seg" style="width:{round(100 * s)}%;background:var(--viz-{i + 1})"></span>'
                   for i, (_, s) in enumerate(d["top_exporters"]))
    other = max(0, 100 - sum(round(100 * s) for _, s in d["top_exporters"]))
    segs += f'<span class="lr-sharebar__seg" style="width:{other}%;background:var(--viz-context)"></span>'
    label = ", ".join(f"{k} {pct(v)}" for k, v in d["top_exporters"])
    return f'<div class="lr-sharebar__bar" style="height:{h}px" role="img" aria-label="{label}">{segs}</div>'


def trail(key: str, chain: dict, st: dict, year: str) -> str:
    choke = chokepoint(chain, st, year)
    levels = chain["levels"]
    cols = []
    for n in range(1, len(levels) + 1):
        cards = []
        for s in [s for s in chain["stages"] if s["stage"] == n]:
            d = st[s["key"]][year]
            if not d.get("world"):
                cards.append(f'<div class="lr-way lr-way--empty" data-key="{s["key"]}">{html.escape(s["label"])}: not traded in {year}</div>')
                continue
            uv = (f' · <b>${d["usd_per_kg"]:,.1f}</b>/kg' if d.get("usd_per_kg") and d["kg_coverage"] >= UV_MIN_COVERAGE else "")
            top = d["top_exporters"][0]
            c = s["key"] == choke
            cards.append(f'''<div class="lr-way{" lr-way--choke" if c else ""}" data-key="{s["key"]}">
  <p class="lr-way__name">{html.escape(s["label"])}</p>
  <div class="lr-way__codes">{codes_html(s)}</div>
  <div class="lr-way__nums"><span><b>{money(d["world"])}</b>{uv}</span><span>{top[0]} <b>{pct(top[1])}</b></span></div>
  {sharebar(d)}
  {f'<span class="lr-way__choke">Chokepoint · HHI {d["hhi"]:.2f}</span>' if c else ""}
</div>''')
        if not cards:
            cards.append('<div class="lr-way lr-way--empty">No traded form</div>')
        cols.append(f'''<div class="lr-trail__col">
  <div class="lr-trail__stage" style="--stage: {stage_var(n, len(levels))}"><span class="lr-marker"></span><b>S{n}</b> {html.escape(levels[n - 1]["en"])}</div>
  {"".join(cards)}
</div>''')
    feeds = [[s["key"], f] for s in chain["stages"] for f in s.get("feeds", [])]
    return (f'<div class="lr-trail{" lr-trail--long" if len(levels) > 6 else ""}" style="--levels: {len(levels)}" data-feeds=\'{json.dumps(feeds)}\'>'
            f'<svg class="lr-trail__feeds" aria-hidden="true"></svg>{"".join(cols)}</div>')


def table(key: str, chain: dict, st: dict, y0: str, y1: str) -> str:
    choke = chokepoint(chain, st, y1)
    rows = []
    for s in sorted(chain["stages"], key=lambda s: s["stage"]):
        a, b = st[s["key"]][y0], st[s["key"]][y1]
        if not b.get("world"):
            continue
        mult = f'×{b["world"] / a["world"]:.1f}' if a.get("world") else "new"
        uv = f'{b["usd_per_kg"]:,.2f}' if b.get("usd_per_kg") and b["kg_coverage"] >= UV_MIN_COVERAGE else "–"
        tops = " ".join(f'<span class="lr-iso">{k}</span>&nbsp;{pct(v)}' for k, v in b["top_exporters"][:3])
        k = b["kor"]
        kx = f'exports #{k["export_rank"]} · {share(k["export_share"])}' if k["export_rank"] else "exports –"
        km = (f'imports #{k["import_rank"]} · {share(k["import_share"])}' + (f' <span class="lr-caption">({k["top_supplier"]} {pct(k["top_supplier_share"])})</span>' if k["top_supplier"] else "")) if k["import_rank"] else "imports –"
        hhi = f'{b["hhi"]:.2f}'
        if s["key"] == choke:
            hhi = f'<b style="color:var(--rowan)">{hhi}</b>'
        rows.append(f'''<tr><td><span class="lr-stage-pill"><i style="background:{stage_var(s["stage"], len(chain["levels"]))}"></i>S{s["stage"]}</span></td>
<td>{html.escape(s["label"])}</td><td>{codes_html(s)}</td>
<td class="num">{money(b["world"])}</td><td class="num">{mult}</td>
<td class="num">{uv}</td><td class="num">{hhi}</td><td>{tops}</td><td>{kx}<br>{km}</td></tr>''')
    return f'''<div class="lr-tablewrap"><table class="lr-table doc-stages">
<thead><tr><th>Stage</th><th>Product</th><th>HS codes</th><th class="num">World {y1}</th><th class="num">vs {y0}</th>
<th class="num">$/kg</th><th class="num">HHI</th><th>Top exporters {y1}</th><th>Korea (top supplier)</th></tr></thead>
<tbody>{"".join(rows)}</tbody>
<caption>World trade is the sum of bilateral flows under the mirror rule, USD. Unit value only where net weight covers at least 80% of value. HHI on exporters' shares; in red, the chain's chokepoint (worth at least $1bn, HHI above 0.25). Korea: rank and share of world exports and imports, and the share of its imports from its top supplier. Source: UN Comtrade, Final data, HS6.</caption>
</table></div>'''


def caveats(chain: dict) -> str:
    out = []
    for s in chain["stages"]:
        if s.get("caveat"):
            out.append(f'<div class="lr-notice lr-notice--warning" role="note">{WARN}'
                       f'<p class="lr-notice__title" style="grid-column:2">S{s["stage"]} · {html.escape(s["label"])}</p>'
                       f'<p>{html.escape(" ".join(s["caveat"].split()))}</p></div>')
    return f'<div class="doc-caveats">{"".join(out)}</div>' if out else ""


def summary(cfg: dict, st: dict, y0: str, y1: str) -> str:
    rows = []
    for key, ch in cfg.items():
        s = st[key]
        largest = max(ch["stages"], key=lambda x: s[x["key"]][y1].get("world", 0))
        choke = chokepoint(ch, s, y1)
        cd = s[choke][y1] if choke else None
        best = None
        for x in ch["stages"]:
            k = s[x["key"]][y1].get("kor") or {}
            if k.get("export_rank") and (best is None or k["export_rank"] < best[1]):
                best = (x["label"], k["export_rank"], k["export_share"])
        rows.append(f'''<tr><td><a href="#{key}">{html.escape(ch["label"])}</a></td><td class="num">{len(ch["stages"])}</td>
<td>{html.escape(largest["label"])} <span class="lr-caption">{money(s[largest["key"]][y1]["world"])}</span></td>
<td>{f'{html.escape(next(x["label"] for x in ch["stages"] if x["key"] == choke))} <span class="lr-caption">{cd["top_exporters"][0][0]} {pct(cd["top_exporters"][0][1])} · HHI {cd["hhi"]:.2f}</span>' if choke else '<span class="lr-caption">none above HHI 0.25</span>'}</td>
<td>{f'{html.escape(best[0])} <span class="lr-caption">#{best[1]} · {share(best[2])}</span>' if best else "–"}</td></tr>''')
    return f'''<div class="lr-tablewrap"><table class="lr-table">
<thead><tr><th>Chain</th><th class="num">Products</th><th>Largest stage, {y1}</th><th>Chokepoint, {y1}</th><th>Korea's best place as exporter</th></tr></thead>
<tbody>{"".join(rows)}</tbody>
<caption>Chokepoint: the stage worth at least $1bn with the highest exporter HHI, when that HHI is above 0.25. Source: UN Comtrade, Final data, HS6; mirror rule.</caption>
</table></div>'''


def korea(cfg: dict, st: dict, y1: str) -> str:
    ex, im, seen_x, seen_m = [], [], set(), set()
    for key, ch in cfg.items():
        for s in ch["stages"]:
            d = st[key][s["key"]][y1]
            k = d.get("kor") or {}
            same = s["codes"][0]   # a stage shared between chains, or a residual code reused, counts once
            if k.get("export_rank") and k["export_rank"] <= 3 and same not in seen_x:
                seen_x.add(same); ex.append((k["export_rank"], -k["export_share"], s["label"], ch["label"], d["world"], k["export_share"]))
            if k.get("import_rank") and k["import_rank"] <= 3 and same not in seen_m:
                seen_m.add(same); im.append((k["import_rank"], -k["import_share"], s["label"], ch["label"], d["world"], k["import_share"], k["top_supplier"], k["top_supplier_share"]))
    rx = "".join(f'<tr><td class="num">#{r}</td><td>{html.escape(l)}</td><td class="lr-caption">{html.escape(c)}</td><td class="num">{100 * sh:.1f}%</td><td class="num">{money(w)}</td></tr>'
                 for r, _, l, c, w, sh in sorted(ex))
    rm = "".join(f'<tr><td class="num">#{r}</td><td>{html.escape(l)}</td><td class="lr-caption">{html.escape(c)}</td><td class="num">{100 * sh:.1f}%</td><td><span class="lr-iso">{ts}</span> {pct(tss)}</td></tr>'
                 for r, _, l, c, w, sh, ts, tss in sorted(im))
    return f'''<div class="doc-two">
<div class="lr-tablewrap"><table class="lr-table"><thead><tr><th class="num">Rank</th><th>Korea exports</th><th>Chain</th><th class="num">Share</th><th class="num">World</th></tr></thead><tbody>{rx}</tbody></table></div>
<div class="lr-tablewrap"><table class="lr-table"><thead><tr><th class="num">Rank</th><th>Korea imports</th><th>Chain</th><th class="num">Share</th><th>Top supplier</th></tr></thead><tbody>{rm}</tbody></table></div>
</div>'''


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--stats", required=True)
    ap.add_argument("--first", default="2019")
    ap.add_argument("--last", default="2024")
    a = ap.parse_args()
    cfg = yaml.safe_load((HERE / "config" / "chains.yaml").read_text())["chains"]
    stats = json.loads(Path(a.stats).read_text())
    st = {k: v["stages"] for k, v in stats["chains"].items()}
    page = (HERE / "docs" / "src" / "product-chains.html").read_text()
    styles = ("<style>\n" + (HERE / "design" / "larch.css").read_text() + "\n</style>\n<style>\n"
              + (HERE / "design" / "tokens.css").read_text() + "\n</style>")
    page = page.replace("<!--@styles-->", styles)
    page = page.replace("<!--@summary-->", summary(cfg, st, a.first, a.last))
    page = page.replace("<!--@korea-->", korea(cfg, st, a.last))
    for key, ch in cfg.items():
        page = page.replace(f"<!--@trail:{key}-->", trail(key, ch, st[key], a.last))
        page = page.replace(f"<!--@table:{key}-->", table(key, ch, st[key], a.first, a.last))
        page = page.replace(f"<!--@caveats:{key}-->", caveats(ch))
    left = [m for m in ("<!--@",) if m in page]
    if left:
        raise SystemExit("unfilled markers left in the template")
    (HERE / "docs" / "PRODUCT-CHAINS.html").write_text(page)
    print("wrote docs/PRODUCT-CHAINS.html", len(page) // 1024, "KB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

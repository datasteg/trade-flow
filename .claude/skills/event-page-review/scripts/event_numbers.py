# /// script
# requires-python = ">=3.11"
# dependencies = ["brotli==1.1.0"]
# ///
"""The numbers an event page shows, recomputed from data/ the way the page computes them
(apps/web/app/[lang]/events/[event]/page.tsx), so a critique or a "Reading the numbers" item can quote them exactly.

    uv run .claude/skills/event-page-review/scripts/event_numbers.py us-chip-controls-2022
    uv run ... us-chip-controls-2022 --at 202403      # every series' partner shares and y/y at another period
    uv run ... us-chip-controls-2022 --levels         # USD levels from the snapshots: named economies, largest flows
    uv run ... us-chip-controls-2022 --json           # the same, as JSON (for diffing after a data rebuild)

Reads data/meta.json, data/events/<slug>.json, data/series/{A,W}/<product>.json and, for --levels, the snapshots
(data/snap/A/<product>/<YYYY>.json; months: data/snap/W/<product>/<YYYY>.w<w>.json, the one monthly rule since 17 Nov
2026, lens M = the 3-month window, lens L = the 12-month window; the retired snap/M and series/M are not read). Shares are fractions in the files and percentages here; periods are YYYY or YYYYMM.
Run from anywhere; the data folder is found from this file's location (or pass --root).
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import brotli

ROOT = Path(__file__).resolve().parents[4]          # trade-flow/
LENS_MONTHS = {"L": 12, "M": 3, "S": 1}
LENS_TEXT = {"L": "12-month window", "M": "3-month window against the one ending 12 months earlier", "S": "single month"}
LENS_W = {"L": "12", "M": "3"}   # the window of the one monthly rule a lens stands for (series/W, snap/W)
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def read_json(root: Path, rel: str):
    p = root / "data" / (rel + ".json.br")
    if not p.exists():
        raise FileNotFoundError(p)
    return json.loads(brotli.decompress(p.read_bytes()))


# -- formatting, as @larch/ui/format does it (EN) --------------------------------------------------------------------
def rnd(x: float, d: int) -> float:
    return round(x + 0.0, d)


def share(v, d: int | None = None) -> str:
    if v is None:
        return "–"
    if d is None:
        d = 2 if 0 < abs(v) < 0.01 else 1          # measures.tsx fs()
    return f"{rnd(v * 100, d):.{d}f}%"


def pp(v, d: int = 1) -> str:
    if v is None:
        return "–"
    r = rnd(v * 100, d)
    return f"{'+' if r > 0 else '−' if r < 0 else ''}{abs(r):.{d}f} pp"


def pct(v, d: int = 1) -> str:
    if v is None:
        return "–"
    r = rnd(v * 100, d)
    return f"{'+' if r > 0 else '−' if r < 0 else ''}{abs(r):.{d}f}%"


def usd(v, d: int = 1) -> str:
    if v is None:
        return "–"
    s = "−" if v < 0 else ""
    a = abs(v)
    for size, unit in ((1e12, "tn"), (1e9, "bn"), (1e6, "m"), (1e3, "k")):
        if a >= size:
            return f"{s}${a / size:,.{d}f}{unit}"
    return f"{s}${a:,.0f}"


def period(p: int, ko: bool = False) -> str:
    if p < 10000:
        return f"{p}년" if ko else str(p)
    y, m = divmod(p, 100)
    return f"{y}년 {m}월" if ko else f"{MONTHS[m - 1]} {y}"


def add_months(p: int, k: int) -> int:
    y, m = divmod(p, 100)
    n = y * 12 + (m - 1) + k
    return (n // 12) * 100 + n % 12 + 1


def window(p: int, f: str, lens: str | None) -> str:
    """The months a period stands for: lens M at 202309 is Jul–Sep 2023."""
    if f == "A" or not lens or lens == "S":
        return period(p)
    a = add_months(p, -(LENS_MONTHS[lens] - 1))
    ya, ma = divmod(a, 100)
    yb, mb = divmod(p, 100)
    return f"{MONTHS[ma - 1]}{'' if ya == yb else ' ' + str(ya)}–{MONTHS[mb - 1]} {yb}"


# -- the page's rules -------------------------------------------------------------------------------------------------
def erratic(s: dict) -> bool:
    """page.tsx erratic(): the largest partner's share jumps by more than 12 points a period on average."""
    v = [x for x in (s["series"][0]["share"] if s["series"] else []) if x is not None]
    if len(v) < 3:
        return False
    return sum(abs(v[i] - v[i - 1]) for i in range(1, len(v))) / (len(v) - 1) > 0.12


def readable_at(s: dict, i: int, j: int, complete: int) -> bool:
    """page.tsx readableAt(): importers must have filed both periods; an exporter is read through its partners
    only up to the last complete period."""
    if erratic(s):
        return False
    if s["role"] == "importer":
        return i >= 0 and j >= 0 and s["filed"][i] and s["filed"][j]
    return i >= 0 and j >= 0 and (s["filed"][i] or s["t"][i] <= complete)


def idx(seq: list, x) -> int:
    try:
        return seq.index(x)
    except ValueError:
        return -1


class Names:
    def __init__(self, meta: dict):
        self.meta = meta
        self.by_id = {n["id"]: k for k, n in enumerate(meta["nodes"])}
        self.products = {}
        for p in meta["products"]:
            self.products[p["id"]] = p
            for a in p.get("aliases") or []:
                self.products[a] = p

    def econ(self, ref, lang="en") -> str:
        if isinstance(ref, int):
            n = self.meta["nodes"][ref]
            return n.get(lang) or n["en"]
        if ref in self.by_id:
            return self.econ(self.by_id[ref], lang)
        for g in self.meta.get("groups", []):
            if g["key"] == ref:
                return g.get(lang) or g["en"]
        return str(ref)

    def product(self, pid: str, lang="en") -> str:
        p = self.products.get(pid)
        return (p.get(lang) or p["en"]) if p else pid


def lead(root: Path, N: Names, v: dict, meta: dict) -> dict | None:
    """The lead strip's reading: world trade in the view product, change on a year earlier at base and t, and the low
    after the base (page.tsx leadSeries / leadReading)."""
    p = N.products.get(v["p"])
    if not p:
        return None
    f = "M" if v["f"] == "M" and p.get("M") else "A"
    try:
        raw = read_json(root, f"series/{'W' if f == 'M' else 'A'}/{p['slug']}")
    except FileNotFoundError:
        return None
    lens = "M" if v.get("lens") == "M" else "L"
    key = LENS_W[lens] if f == "M" else "mirror"
    rows = raw["rows"].get(key) or []
    ti, wi = raw["cols"].index("t"), raw["cols"].index("world")
    world = {r[ti]: r[wi] for r in rows}
    lo = add_months(v["base"], -24) if f == "M" else v["base"] - 6
    cov = meta["coverage"][f]
    periods = [r[ti] for r in rows if r[ti] >= lo and cov.get(str(r[ti]), 1) >= 0.5]
    back = (lambda x: add_months(x, -12)) if f == "M" else (lambda x: x - 1)
    vals = {}
    for x in periods:
        a, b = world.get(x), world.get(back(x))
        vals[x] = a / b - 1 if a is not None and b else None
    complete = meta["complete"][f]
    after = [(x, y) for x, y in vals.items() if x > v["base"] and y is not None and x <= max(v["t"], complete)]
    low = min(after, key=lambda z: z[1]) if after else None
    return {"f": f, "lens": lens if f == "M" else None, "base": vals.get(v["base"]), "t": vals.get(v["t"]),
            "world_base": world.get(v["base"]), "world_t": world.get(v["t"]),
            "low": low if low and low[0] != v["t"] and low[1] < 0 else None, "last_period": periods[-1] if periods else None}


def flows_table(doc: dict, N: Names, complete: int) -> list[dict]:
    """The diversion list: every partner share change of the view product's readable series (page.tsx flows)."""
    v = doc["view"]
    out = []
    for s in doc["series"]:
        if s["product"] != v["p"]:
            continue
        i, j = idx(s["t"], v["t"]), idx(s["t"], v["base"])
        if not readable_at(s, i, j, complete):
            continue
        for sl in s["series"]:
            a, b = sl["share"][j], sl["share"][i]
            if a is None or b is None:
                continue
            econ, partner = N.econ(s["economy"]), N.econ(sl["id"])
            flow = f"{partner} → {econ}" if s["role"] == "importer" else f"{econ} → {partner}"
            out.append({"flow": flow, "role": s["role"], "economy": s["economy"], "partner": sl["id"],
                        "base": a, "t": b, "d": b - a,
                        "share_of": f"{econ}'s {'imports' if s['role'] == 'importer' else 'exports'}"})
    return sorted(out, key=lambda r: -abs(r["d"]))


def levels(root: Path, N: Names, doc: dict, meta: dict, top: int = 7, floor: float = 0.01) -> dict:
    """USD levels at base and t for the view product from the snapshots: the named economies' exports and imports,
    the largest flows by absolute USD change (a flow counts if it is at least `floor` of world trade in either
    window), and the top gainers and losers among all economies."""
    v = doc["view"]
    p = N.products.get(v["p"])
    f = v["f"]
    lens = None
    if f == "M":
        lens = "M" if v.get("lens") == "M" else "L"

    def snap(t: int) -> dict | None:
        if f == "A":
            try:
                return read_json(root, f"snap/A/{p['slug']}/{t}")
            except FileNotFoundError:
                return None
        try:
            y = read_json(root, f"snap/W/{p['slug']}/{t // 100}.w{LENS_W[lens]}")
        except FileNotFoundError:
            return None
        return next((s for s in y["snaps"] if s["t"] == t), None) | {"ncols": y["ncols"], "ecols": y["ecols"]}

    a, b = snap(v["base"]), snap(v["t"])
    if not a or not b:
        return {"error": f"no snapshot for {v['p']} at {v['base']} or {v['t']} (f={f}, lens={lens})", "lens": lens}

    def nodes(s):
        c = {k: n for n, k in enumerate(s["ncols"])}
        return {r[c["i"]]: {"x": r[c["x"]] * s["world"], "m": r[c["m"]] * s["world"], "xs": r[c["x"]], "ms": r[c["m"]],
                            "d10": r[c["d10"]], "s10": r[c["s10"]], "filed": bool(r[c["r"]])} for r in s["nodes"]}

    def edges(s):
        c = {k: n for n, k in enumerate(s["ecols"])}
        return {(r[c["s"]], r[c["t"]]): {"w": r[c["w"]], "usd": r[c["w"]] * s["world"], "mr": r[c["mr"]], "src": r[c["src"]]}
                for r in s["edges"]}

    na, nb, ea, eb = nodes(a), nodes(b), edges(a), edges(b)
    named = [N.by_id[e] for e in doc["economies"] if e in N.by_id]
    econ_rows = []
    for i in named:
        ra, rb = na.get(i), nb.get(i)
        econ_rows.append({"economy": N.econ(i), "iso": N.meta["nodes"][i]["id"],
                          "x_base": ra["x"] if ra else None, "x_t": rb["x"] if rb else None,
                          "m_base": ra["m"] if ra else None, "m_t": rb["m"] if rb else None,
                          "filed_base": ra["filed"] if ra else None, "filed_t": rb["filed"] if rb else None})
    named_set_early = set(named)
    rows = []
    for key in set(ea) | set(eb):
        xa, xb = ea.get(key), eb.get(key)
        s, t = key
        small = max(xa["w"] if xa else 0, xb["w"] if xb else 0) < floor
        if small and not (s in named_set_early and t in named_set_early):
            continue
        bound_a = min(na.get(s, {}).get("d10", 0.0005) or 0.0005, na.get(t, {}).get("s10", 0.0005) or 0.0005, 0.0005)
        bound_b = min(nb.get(s, {}).get("d10", 0.0005) or 0.0005, nb.get(t, {}).get("s10", 0.0005) or 0.0005, 0.0005)
        ua = xa["usd"] if xa else None
        ub = xb["usd"] if xb else None
        rows.append({
            "flow": f"{N.econ(s)} → {N.econ(t)}", "s": N.meta["nodes"][s]["id"], "t": N.meta["nodes"][t]["id"],
            "usd_base": ua, "usd_t": ub,
            "absent_base_bound": None if xa else bound_a * a["world"], "absent_t_bound": None if xb else bound_b * b["world"],
            "d_usd": (ub if ub is not None else 0) - (ua if ua is not None else 0),
            "pct": (ub / ua - 1) if ua and ub is not None else None,
            "of_exporter_base": (xa["w"] / na[s]["xs"]) if xa and na.get(s) and na[s]["xs"] else None,
            "of_exporter_t": (xb["w"] / nb[s]["xs"]) if xb and nb.get(s) and nb[s]["xs"] else None,
            "of_importer_base": (xa["w"] / na[t]["ms"]) if xa and na.get(t) and na[t]["ms"] else None,
            "of_importer_t": (xb["w"] / nb[t]["ms"]) if xb and nb.get(t) and nb[t]["ms"] else None,
            "reported_by_base": None if not xa else ("importer" if xa["src"] == 1 else "exporter"),
            "reported_by_t": None if not xb else ("importer" if xb["src"] == 1 else "exporter"),
            "mirror_ratio_t": xb["mr"] if xb else None,
        })
    rows.sort(key=lambda r: -abs(r["d_usd"]))
    named_set = set(named)
    big = [r for r in rows if max(r["usd_base"] or 0, r["usd_t"] or 0) >= floor * max(a["world"], b["world"]) * 0.999]
    touching = [r for r in big if N.by_id[r["s"]] in named_set or N.by_id[r["t"]] in named_set]
    # every flow between two named economies, whatever its size (the page's partner-share charts show these)
    between = sorted([r for r in rows if N.by_id[r["s"]] in named_set and N.by_id[r["t"]] in named_set], key=lambda r: -abs(r["d_usd"]))
    gains = []
    for i in set(na) | set(nb):
        for k in ("x", "m"):
            va, vb = (na.get(i) or {}).get(k), (nb.get(i) or {}).get(k)
            if va is None or vb is None:
                continue
            gains.append({"economy": N.econ(i), "role": "exports" if k == "x" else "imports", "base": va, "t": vb, "d": vb - va,
                          "pct": vb / va - 1 if va else None})
    gains.sort(key=lambda r: r["d"])
    return {"lens": lens, "window_base": window(v["base"], f, lens), "window_t": window(v["t"], f, lens),
            "world_base": a["world"], "world_t": b["world"], "floor": floor,
            "economies": econ_rows, "top_flows": big[:top], "top_flows_touching_named": touching[:top], "between_named": between,
            "losers": gains[:3], "gainers": gains[-3:][::-1]}


def compute(root: Path, slug: str, at: int | None, want_levels: bool) -> dict:
    meta = read_json(root, "meta")
    N = Names(meta)
    doc = read_json(root, f"events/{slug}")
    v = doc["view"]
    f = v["f"]
    lens = v.get("lens") if f == "M" else None
    complete = meta["complete"][f]
    out = {"id": doc["id"], "num": doc["num"], "title": doc["title"], "start": doc["start"], "end": doc["end"],
           "view": {**v, "product": N.product(v["p"]), "product_ko": N.product(v["p"], "ko"),
                    "window_base": window(v["base"], f, lens), "window_t": window(v["t"], f, lens),
                    "lens_text": LENS_TEXT.get(lens, "annual") if lens else "annual"},
           "store": {"complete": meta["complete"], "last": meta["last"], "built_at": meta.get("built_at")},
           "economies": [{"iso": e, "name": N.econ(e), "ko": N.econ(e, "ko")} for e in doc["economies"]],
           "products": [{"id": p, "en": N.product(p), "ko": N.product(p, "ko"),
                         "ko_selector_label": N.product(p, "ko").split("(")[0].strip(),
                         "en_selector_label": N.product(p).split("(")[0].strip()} for p in doc["products"]]}
    out["lead"] = lead(root, N, v, meta)

    # the named economies' change on a year earlier at t, view product (yoy bars)
    yoy = []
    for s in doc["series"]:
        i = idx(s["t"], v["t"])
        if i < 0 or s["yoy"][i] is None:
            continue
        yoy.append({"product": s["product"], "economy": N.econ(s["economy"]), "iso": s["economy"], "role": s["role"],
                    "yoy": s["yoy"][i], "filed": s["filed"][i], "erratic": erratic(s),
                    "in_view_chart": s["product"] == v["p"]})
    out["yoy"] = sorted(yoy, key=lambda r: (not r["in_view_chart"], r["yoy"]))
    out["series_range"] = {"from": min(s["t"][0] for s in doc["series"]), "to": max(s["t"][-1] for s in doc["series"])} if doc["series"] else None

    # diversion
    out["diversion"] = flows_table(doc, N, complete)
    dropped = []
    for s in doc["series"]:
        if s["product"] != v["p"]:
            continue
        i, j = idx(s["t"], v["t"]), idx(s["t"], v["base"])
        if not readable_at(s, i, j, complete):
            why = "erratic" if erratic(s) else ("period missing" if i < 0 or j < 0 else "not filed (importer)" if s["role"] == "importer" else "exporter unfiled after the last complete period")
            dropped.append({"economy": N.econ(s["economy"]), "role": s["role"], "why": why})
    out["diversion_dropped"] = dropped

    # movers
    movers = []
    seen = set()
    for m in doc["measures"]:
        if m.get("kind") != "movers" or not (m.get("up") or m.get("down")):
            continue
        name = N.product(m["product"])
        if name in seen:
            continue
        seen.add(name)
        items = [{"economy": N.econ(i), "d": d, "base": s - d, "t": s} for i, d, s in (m.get("up") or []) + (m.get("down") or [])][:10]
        movers.append({"product": m["product"], "name": name, "base": m.get("base"), "t": m.get("t"), "lens": m.get("lens"),
                       "world_change": m.get("world_change"), "items": items})
    out["movers"] = movers

    # partner shares, product by product (the charts' readings)
    shares = []
    for s in doc["series"]:
        i, j = idx(s["t"], v["t"]), idx(s["t"], v["base"])
        row = {"product": s["product"], "economy": N.econ(s["economy"]), "iso": s["economy"], "role": s["role"], "lens": s.get("lens"),
               "erratic": erratic(s), "filed_base": s["filed"][j] if j >= 0 else None, "filed_t": s["filed"][i] if i >= 0 else None,
               "ever_unfiled": not all(s["filed"]), "partners": []}
        for sl in s["series"]:
            a, b = (sl["share"][j] if j >= 0 else None), (sl["share"][i] if i >= 0 else None)
            row["partners"].append({"partner": N.econ(sl["id"]), "iso": sl["id"], "base": a, "t": b,
                                    "d": (b - a) if a is not None and b is not None else None})
        oa, ob = (s["other"][j] if j >= 0 else None), (s["other"][i] if i >= 0 else None)
        row["other"] = {"base": oa, "t": ob}
        shares.append(row)
    out["shares"] = shares
    out["missing"] = [{"economy": N.econ(m["economy"]), "iso": m["economy"], "product": m["product"], "role": m["role"]} for m in doc["missing"]]
    out["sources"] = [{"n": s["n"], "date": s.get("date") or f"accessed {s.get('accessed')}", "publisher": s["publisher"], "url": s["url"]} for s in doc["sources"]]
    out["timeline"] = [{"date": x["date"], "en": x["en"], "source": x.get("source")} for x in doc["timeline"]]
    out["reading"] = doc.get("reading")

    if at is not None:
        rows = []
        for s in doc["series"]:
            i = idx(s["t"], at)
            if i < 0:
                continue
            rows.append({"product": s["product"], "economy": N.econ(s["economy"]), "role": s["role"], "yoy": s["yoy"][i], "filed": s["filed"][i],
                         "partners": [{"partner": N.econ(sl["id"]), "share": sl["share"][i]} for sl in s["series"]], "other": s["other"][i]})
        out["at"] = {"period": at, "rows": rows}
    if want_levels:
        out["levels"] = levels(root, N, doc, meta)
    return out


def show(o: dict) -> None:
    v = o["view"]
    P = period
    print(f"# {o['id']} (event {o['num']}): {o['title']['en']}")
    print(f"  {o['start']} → {o['end'] or 'ongoing'}")
    print(f"  view: {v['product']} [{v['p']}], {v['f']}, lens {v.get('lens') or '–'} ({v['lens_text']}); base {P(v['base'])} = {v['window_base']}; t {P(v['t'])} = {v['window_t']}")
    st = o["store"]
    print(f"  store: complete {st['complete']}, last {st['last']}, built {st['built_at']}; series run {o['series_range']}")
    print(f"  economies: {', '.join(e['name'] for e in o['economies'])}")
    print("  products:")
    for p in o["products"]:
        print(f"    {p['id']:34} EN {p['en']!r:60} KO {p['ko']!r}  (selector: {p['en_selector_label']} / {p['ko_selector_label']})")
    labels = [p["ko_selector_label"] for p in o["products"]]
    dup = {x for x in labels if labels.count(x) > 1}
    if dup:
        print(f"  ! duplicate KO product-selector labels: {', '.join(sorted(dup))}")
    labels = [p["en_selector_label"] for p in o["products"]]
    dup = {x for x in labels if labels.count(x) > 1}
    if dup:
        print(f"  ! duplicate EN product-selector labels: {', '.join(sorted(dup))}")

    L = o.get("lead")
    if L:
        print(f"\n## Lead strip: world {v['product']}, {LENS_TEXT.get(L['lens'], 'annual') if L['lens'] else 'annual'}")
        print(f"  {P(v['base'])}: {pct(L['base'])} (world {usd(L['world_base'])});  {P(v['t'])}: {pct(L['t'])} (world {usd(L['world_t'])})")
        if L["low"]:
            print(f"  lowest since the base: {pct(L['low'][1])} in {P(L['low'][0])}")

    print(f"\n## Named economies, change on a year earlier at {P(v['t'])} (the bars show the view product; * = grey/muted on the page)")
    for r in o["yoy"]:
        flag = "" if r["filed"] and not r["erratic"] else " *" + ("not filed" if not r["filed"] else "") + (" erratic" if r["erratic"] else "")
        print(f"  {'[chart] ' if r['in_view_chart'] else '        '}{r['economy']} {r['role']:8} {r['product']:32} {pct(r['yoy']):>8}{flag}")

    print(f"\n## Diversion: partner shares, {P(v['base'])} → {P(v['t'])} (top 10 drawn; the page labels the flow but not whose share it is)")
    for k, r in enumerate(o["diversion"]):
        print(f"  {'top' if k < 10 else '   '} {r['flow']:34} {r['share_of']:28} {share(r['base']):>7} → {share(r['t']):>7}  {pp(r['d']):>9}")
    for d in o["diversion_dropped"]:
        print(f"  dropped: {d['economy']} {d['role']} ({d['why']})")
    flows = [r["flow"] for r in o["diversion"][:10]]
    dups = {x for x in flows if flows.count(x) > 1}
    if dups:
        print(f"  ! the same flow label appears twice in the top 10 (importer's and exporter's share): {', '.join(sorted(dups))}")

    for m in o["movers"]:
        print(f"\n## Movers: share of world {m['name']} exports, {P(m['base']) if m['base'] else '?'} → {P(m['t']) if m['t'] else '?'} (world change {pct(m['world_change'])})")
        for it in m["items"]:
            print(f"  {it['economy']:28} {share(it['base']):>7} → {share(it['t']):>7}  {pp(it['d']):>9}")

    print(f"\n## Partner shares at {P(v['base'])} → {P(v['t'])}, series by series (first partner = the chart's reading sentence)")
    for s in o["shares"]:
        tag = " (NOT DRAWN: erratic)" if s["erratic"] else ""
        tag += "" if s["filed_t"] else " (not filed at t: read from partners)"
        print(f"  {s['economy']} {s['role']} · {s['product']}{tag}")
        for q in s["partners"]:
            print(f"      {q['partner']:28} {share(q['base']):>7} → {share(q['t']):>7}  {pp(q['d']):>9}")
        print(f"      {'Other':28} {share(s['other']['base']):>7} → {share(s['other']['t']):>7}")
    if o["missing"]:
        print("\n## Missing (not filed the last three months of the series): " + "; ".join(f"{m['economy']} {m['role']} {m['product']}" for m in o["missing"]))
    print("\n## Sources")
    for s in o["sources"]:
        print(f"  [{s['n']}] {s['date']} · {s['publisher']} · {s['url']}")
    if o.get("reading"):
        print(f"\n## Reading section in the data: {len(o['reading'].get('items', []))} items" + (" + window line" if o["reading"].get("window") else ""))

    if "at" in o:
        a = o["at"]
        print(f"\n## At {P(a['period'])}")
        for r in a["rows"]:
            parts = ", ".join(f"{q['partner']} {share(q['share'])}" for q in r["partners"])
            print(f"  {r['economy']} {r['role']} · {r['product']}: y/y {pct(r['yoy'])}{'' if r['filed'] else ' (not filed)'}; {parts}; other {share(r['other'])}")

    if "levels" in o:
        Lv = o["levels"]
        if Lv.get("error"):
            print(f"\n## Levels: {Lv['error']}")
            return
        print(f"\n## Levels (snapshots, lens {Lv['lens'] or 'annual'}): {Lv['window_base']} → {Lv['window_t']}; world {usd(Lv['world_base'])} → {usd(Lv['world_t'])} ({pct(Lv['world_t'] / Lv['world_base'] - 1)})")
        for e in Lv["economies"]:
            def ch(a, b):
                return f"{usd(a):>9} → {usd(b):>9} ({pct(b / a - 1) if a and b is not None else '–'})"
            print(f"  {e['economy']:16} exports {ch(e['x_base'], e['x_t'])};  imports {ch(e['m_base'], e['m_t'])}{'' if e['filed_t'] else '  (not filed at t)'}")
        print(f"  largest flows by USD change (flow ≥ {Lv['floor']:.0%} of world in either window):")
        for r in Lv["top_flows"]:
            a = usd(r["usd_base"]) if r["usd_base"] is not None else f"≤{usd(r['absent_base_bound'])}"
            b = usd(r["usd_t"]) if r["usd_t"] is not None else f"≤{usd(r['absent_t_bound'])}"
            print(f"    {r['flow']:30} {a:>9} → {b:>9}  {usd(r['d_usd']):>9} ({pct(r['pct'])});  of exporter {share(r['of_exporter_base'])} → {share(r['of_exporter_t'])};  of importer {share(r['of_importer_base'])} → {share(r['of_importer_t'])};  reported by {r['reported_by_t']}" + (f", mirror ratio {r['mirror_ratio_t']}" if r['mirror_ratio_t'] is not None else ""))
        if Lv["top_flows_touching_named"] != Lv["top_flows"]:
            print("  largest flows touching the named economies:")
            for r in Lv["top_flows_touching_named"]:
                a = usd(r["usd_base"]) if r["usd_base"] is not None else f"≤{usd(r['absent_base_bound'])}"
                b = usd(r["usd_t"]) if r["usd_t"] is not None else f"≤{usd(r['absent_t_bound'])}"
                print(f"    {r['flow']:30} {a:>9} → {b:>9}  {usd(r['d_usd']):>9} ({pct(r['pct'])});  of exporter {share(r['of_exporter_base'])} → {share(r['of_exporter_t'])};  of importer {share(r['of_importer_base'])} → {share(r['of_importer_t'])}")
        print("  flows between the named economies (any size above the floor):")
        for r in Lv["between_named"]:
            a = usd(r["usd_base"]) if r["usd_base"] is not None else f"≤{usd(r['absent_base_bound'])}"
            b = usd(r["usd_t"]) if r["usd_t"] is not None else f"≤{usd(r['absent_t_bound'])}"
            print(f"    {r['flow']:30} {a:>9} → {b:>9}  {usd(r['d_usd']):>9} ({pct(r['pct'])});  of exporter {share(r['of_exporter_base'])} → {share(r['of_exporter_t'])};  of importer {share(r['of_importer_base'])} → {share(r['of_importer_t'])}")
        print("  gainers: " + "; ".join(f"{g['economy']} {g['role']} {usd(g['d'])} ({pct(g['pct'])})" for g in Lv["gainers"]))
        print("  losers:  " + "; ".join(f"{g['economy']} {g['role']} {usd(g['d'])} ({pct(g['pct'])})" for g in Lv["losers"]))


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("slug")
    ap.add_argument("--at", type=int, help="another period (YYYYMM or YYYY) to print every series at")
    ap.add_argument("--levels", action="store_true", help="USD levels from the snapshots")
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--root", type=Path, default=ROOT, help="the trade-flow folder (default: found from this file)")
    a = ap.parse_args()
    try:
        o = compute(a.root, a.slug, a.at, a.levels)
    except FileNotFoundError as e:
        print(f"missing: {e}", file=sys.stderr)
        return 1
    if a.json:
        json.dump(o, sys.stdout, ensure_ascii=False, indent=1)
    else:
        show(o)
    return 0


if __name__ == "__main__":
    sys.exit(main())

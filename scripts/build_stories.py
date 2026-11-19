# /// script
# requires-python = ">=3.11"
# dependencies = ["duckdb==1.5.6", "networkx==3.6.1", "numpy==2.4.6", "scipy==1.17.1", "pyyaml==6.0.3",
#                 "brotli==1.1.0"]
# ///
"""Events and case studies: the numbers and series their pages show, measured on the network layer.

    uv run scripts/build_stories.py                 # after build_snapshots.py
    uv run scripts/build_stories.py --only covid-2020,hormuz-2026

Reads config/events.yaml and config/cases.yaml and data/meta.json; writes data/events/index.json,
data/events/<id>.json, data/cases/index.json, data/cases/<id>.json, the papers' anchors as
tier-5 checks (data/checks/papers.json), and data/changes.json: what changed in the shown 12-month
window against the one before (export momentum changed sign, a top-five destination reported
differently) and the chokepoint moves between the last two complete years, for every economy with
an all-goods 12-month line (docs/SURFACES.md; ported from global-network's build.py on 2 Nov 2026).
Each event in the index carries `replay`: whether global-network replays it (its data/surface.json,
else config/shocks.yaml).

Every number follows the site's rules: years the annual mirror rule (build_snapshots.py); months the one monthly
rule of the explorer, the windows of build_windows.py: each flow the importer's report where
it filed, else the exporter's report spliced (κ), benchmarked or times 1.06, kept in a window only when positive in
every month. Lenses name the window: L the 12-month window, M the 3-month window (compared with the window ending 12
months earlier), on the windows' grid of end months (none in January, nor April for 3 months; R4); S, the single
month (January and February together), is read internally by the case studies only. Shares and changes only: no
original bilateral record is written. An economy that did not file the months in question is listed under
`missing`, never filled in. A change on a year earlier is given only where the economy's reporting side is the same at
both ends (L10).
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_windows as bw  # noqa: E402
from build_snapshots import HERE, FIRST_MONTH, Layer, add_months, nes_index, read_json, sig, window, write_json  # noqa: E402

GULF = ["SAU", "ARE", "IRQ", "KWT", "QAT", "IRN", "OMN", "BHR"]
TOP_PARTNERS = 5
COMPLETE = 0.90      # an economy's 12-month window counts where its completeness `c` is at least this (nodes/W)
CHANGE_DESTS = 5     # divergence: among the economy's five largest destinations
LENS_W = {"L": 12, "M": 3, "S": 1}   # a lens's window in the monthly rule (S: internal, the case studies' months)
GN = HERE.parent / "global-network"


class Measure:
    """The layer for any number of products, with the meta's names and groups."""

    def __init__(self, meta: dict):
        self.meta = meta
        self.idx = {n["id"]: i for i, n in enumerate(meta["nodes"])}
        self.groups = {g["key"]: g["members"] for g in meta["groups"]}
        self.products = {}
        for p in meta["products"]:
            self.products[p["id"]] = p
            for a in p.get("aliases", []):
                self.products[a] = p
        self.L = Layer(self.idx)
        self.nes = nes_index(self.idx)    # partner areas that are not economies: ranked as partners; no economy page
        self.loaded: dict[tuple[str, str], str] = {}
        self.cache: dict[tuple, dict] = {}
        self.panels: dict[tuple[str, bool], bw.Panel | None] = {}


    # -- names ----------------------------------------------------------------------------------

    def nodes(self, spec) -> list[int]:
        """ISO3, a group key, "GULF", or a list of those -> node indices."""
        if spec is None:
            return []
        if isinstance(spec, list):
            return sorted({i for s in spec for i in self.nodes(s)})
        if spec == "GULF":
            return [self.idx[c] for c in GULF if c in self.idx]
        if spec in self.groups:
            return list(self.groups[spec])
        if spec in self.idx:
            return [self.idx[spec]]
        raise KeyError(f"unknown economy or group {spec!r}")

    def label(self, spec) -> str:
        if isinstance(spec, str):
            return spec
        if sorted(spec) == sorted(GULF):
            return "GULF"
        return "+".join(spec)

    def subset(self, pid: str, codes: list[str]) -> str:
        """A product restricted to some of its codes (pipeline gas apart from LNG), as a basket."""
        sid = f"{self.products[pid]['id']}|{','.join(codes)}"
        if sid not in self.products:
            self.products[sid] = {"id": sid, "slug": sid, "kind": "basket", "codes": list(codes),
                                  "M": self.products[pid].get("M")}
        return sid

    def prelim_from(self, me: list[int]) -> int | None:
        sups = [x for x in self.meta.get("supplements") or [] if x["node"] in me and x.get("preliminary_from")]
        return max(x["preliminary_from"] for x in sups) if sups else None

    def shown(self, freq: str) -> int:
        """The last period pages read: meta.shown, else the last with any data."""
        return (self.meta.get("shown") or {}).get(freq) or self.meta["last"][freq]

    def table(self, pid: str, freq: str) -> str:
        p = self.products[pid]
        key = (p["id"], freq)
        if key not in self.loaded:
            name = f"t{len(self.loaded)}"
            lo, hi = (1995, self.meta["last"]["A"]) if freq == "A" else (200501, self.meta["last"]["M"])
            if p["kind"] == "total" and freq == "A":
                lo = 1962
            self.L.load(p, freq, lo, hi, name=name)
            self.loaded[key] = name
        return self.loaded[key]

    def panel(self, pid: str, early: bool = False) -> "bw.Panel | None":
        """The monthly rule's panel of a product, as build_windows.build_product builds it (the same months, the
        reporter-with-no-row rule, the annual benchmark, the composite), so a window here equals the explorer's.
        early: the same rule on months from 2000, for windows before the explorer's first (an event in 2008 on a
        basket whose windows start in 2014); those windows have no explorer value to match."""
        p = self.products[pid]
        key = (p["id"], early)
        if key not in self.panels:
            first = FIRST_MONTH["TOTAL" if p["kind"] == "total" else "other"]
            lo, hi = (200001 if early else max(200001, add_months(first, -bw.HISTORY))), self.meta["last"]["M"]
            name = f"w{len(self.panels)}"
            P = bw.load_panel(self.L, p, lo, hi, len(self.idx), name=name)
            if P is not None:
                bw.apply_rule(self.L, p, P, len(self.idx))
            self.panels[key] = P
        return self.panels[key]

    def flows(self, pid: str, freq: str, t: int, lens: str | None = "M") -> dict:
        """The flows of the window a period stands for, with who filed it: years under the annual mirror rule;
        months under the monthly rule (the explorer's windows: `panel`), the window of LENS_W[lens] months."""
        key = (pid, freq, t, lens)
        if key not in self.cache:
            if freq == "A":
                name = self.table(pid, freq)
                a, b, n = window(freq, t, None)
                E = self.L.edges(a, b, "mirror", name=name)
                E["filed"] = {k for k, v in E["rep_n"].items() if v >= n}
                E["win"] = [a, b]
            else:
                P, w = self.panel(pid), LENS_W[lens or "M"]
                first = FIRST_MONTH["TOTAL" if self.products[pid]["kind"] == "total" else "other"]
                if t < first:   # before the explorer's windows: the same rule on the months from 2000
                    P = self.panel(pid, early=True)
                j = P.col.get(t) if P is not None else None
                if j is None or j < w - 1:
                    E = {"s": np.zeros(0, np.int64), "t": np.zeros(0, np.int64), "w": np.zeros(0), "src": np.zeros(0, bool),
                         "filed": set()}
                else:
                    E = bw.edges_from(P, bw.window_values(P, j, w))
                    E["filed"] = {int(k) for k in np.flatnonzero(P.NF[:, j - w + 1:j + 1].all(1))}
                E["win"] = [add_months(t, 1 - w), t]
            self.cache[key] = E
        return self.cache[key]

    def own_last(self, me: list[int]) -> int | None:
        """The last month of a supplement that holds all of `me` (Korea's customs months): an economy's own series
        runs there, past meta.shown, which keeps the world's 85% rule."""
        sups = [x for x in self.meta.get("supplements") or [] if x["node"] in me]
        return min(x["M"][1] for x in sups) if me and len(sups) == len(set(me)) else None

    def periods(self, freq: str, lo: int, hi: int, lens: str | None = "M", own: list[int] | None = None) -> list[int]:
        """The periods of a series: years, or the end months of the monthly rule's windows (R4: none in January,
        nor in April for 3 months; lens S: single months, January and February together)."""
        last = self.own_last(own or []) if freq == "M" else None
        hi = min(hi, max(self.shown(freq), last or 0))
        if freq == "A":
            return list(range(lo, hi + 1))
        w = LENS_W[lens or "M"]
        out, m = [], lo
        while m <= hi:
            if (m % 100 != 1) if w == 1 else bw.valid_end(m, w):
                out.append(m)
            m = add_months(m, 1)
        return out

    def back(self, freq: str, t: int, years: int = 1) -> int:
        return t - years if freq == "A" else add_months(t, -12 * years)

    # -- measures -------------------------------------------------------------------------------

    def partner_shares(self, pid: str, freq: str, lo: int, hi: int, importer=None, exporter=None,
                       partners=None, lens: str = "M", top: int = TOP_PARTNERS) -> dict:
        """An importer's imports (or an exporter's exports) by partner over time: shares of the
        named partners (or the largest ones over the span) and Other, the total's change on a
        year earlier, and whether the economy filed each window itself."""
        me = self.nodes(importer if importer is not None else exporter)
        side_me, side_other = ("t", "s") if importer is not None else ("s", "t")
        ps = self.periods(freq, lo, hi, lens, own=me)
        by_t: dict[int, dict[int, float]] = {}
        filed = {}
        for t in ps:
            E = self.flows(pid, freq, t, lens)
            sel = np.isin(E[side_me], me) & ~np.isin(E[side_other], me)
            d: dict[int, float] = {}
            for o, w in zip(E[side_other][sel].tolist(), E["w"][sel].tolist()):
                d[o] = d.get(o, 0.0) + w
            by_t[t] = d
            filed[t] = all(m in E["filed"] for m in me)
        if partners:
            groups = [(self.label(sp), self.nodes(sp)) for sp in partners]
        else:
            tot: dict[int, float] = {}
            for d in by_t.values():
                for o, w in d.items():
                    tot[o] = tot.get(o, 0.0) + w
            groups = [(self.meta["nodes"][o]["id"], [o]) for o in sorted(tot, key=lambda o: -tot[o])[:top]]
        total = [sum(by_t[t].values()) for t in ps]
        series = []
        for name, members in groups:
            v = [sum(by_t[t].get(o, 0.0) for o in members) for t in ps]
            series.append({"id": name, "share": [sig(x / tt, 4) if tt else None for x, tt in zip(v, total)]})
        named = {o for _, mm in groups for o in mm}
        other = [sum(w for o, w in by_t[t].items() if o not in named) for t in ps]
        # the change on the window ending 12 months earlier, only where the economy's reporting side is the same at
        # both ends (L10): its own report at both, or its partners' at both
        yoy = []
        for i, t in enumerate(ps):
            b = self.back(freq, t)
            if b in by_t:
                tb, fb = sum(by_t[b].values()), filed[b]
            else:
                Eb = self.flows(pid, freq, b, lens) if b >= (199501 if freq == "M" else 1962) else None
                tb = float(Eb["w"][np.isin(Eb[side_me], me) & ~np.isin(Eb[side_other], me)].sum()) if Eb else 0.0
                fb = all(m in Eb["filed"] for m in me) if Eb else None
            yoy.append(sig(total[i] / tb - 1, 3) if tb and fb == filed[t] else None)
        return {"kind": "partner_shares", "product": pid, "freq": freq, "lens": lens,
                "role": "importer" if importer is not None else "exporter",
                "economy": self.label(importer if importer is not None else exporter),
                "t": ps, "series": series, "other": [sig(x / tt, 4) if tt else None for x, tt in zip(other, total)],
                "yoy": yoy, "filed": [filed[t] for t in ps],
                # the economy's own months past meta.shown, from a supplement: preliminary from here
                "prelim_from": self.prelim_from(me) if freq == "M" and ps and ps[-1] > self.shown(freq) else None}

    def world_change(self, pid: str, freq: str, periods: list[int], importers="complete", lens: str = "M",
                     span: tuple[int, int] | None = None, base: int | None = None, partner=None,
                     others: bool = False, outside: bool = False) -> dict:
        """Imports of a set of importers (their own reports) in some periods against the same
        periods a year earlier (or against `base`), from everyone or from one partner.
        importers="complete": the economies that filed every month of `span`; "all": world trade in
        the product under the mirror rule. others=True: from every partner except `partner`; outside=True:
        the partner's own members left out as importers (their trade with one another is inside a closed bloc)."""
        name = self.table(pid, freq)
        if importers == "all":
            out = []
            for t in periods:
                ref = base if base is not None else self.back(freq, t)
                E, Eb = self.flows(pid, freq, t, lens), self.flows(pid, freq, ref, lens)
                out.append({"t": t, "against": ref,
                            "change": sig(E["w"].sum() / Eb["w"].sum() - 1, 3) if Eb["w"].sum() else None})
            return {"kind": "world_change", "product": pid, "freq": freq, "lens": lens if freq == "M" else None,
                    "importers": {"all": True}, "values": out}
        par = f" AND par {'NOT IN' if others else 'IN'} ({', '.join(map(str, self.nodes(partner)))})" if partner else ""
        if importers == "complete":
            lo, hi = span or (min(periods) - 100 if freq == "A" else add_months(min(periods), -24),
                              max(periods))
            want = (hi - lo + 1) if freq == "A" else (
                (hi // 100 - lo // 100) * 12 + hi % 100 - lo % 100 + 1)
            rows = self.L.con.execute(f"""SELECT node FROM rep_{name} WHERE period BETWEEN {lo} AND {hi}
                GROUP BY 1 HAVING COUNT(DISTINCT period) = {want}""").fetchall()
            imp = [r[0] for r in rows]
            if outside and partner:
                imp = [i for i in imp if i not in set(self.nodes(partner))]
            label = {"complete": True, "n": len(imp), "span": [lo, hi]}
        else:
            imp = self.nodes(importers)
            label = {"complete": False, "n": len(imp), "economies": importers}
        out = []
        for t in periods:
            ref = base if base is not None else self.back(freq, t)
            a, b, _ = window(freq, t, lens if freq == "M" else None)
            ra, rb, _ = window(freq, ref, lens if freq == "M" else None)
            q = lambda lo2, hi2: self.L.con.execute(  # noqa: E731
                f"SELECT SUM(v) FROM {name} WHERE flow = 'M' AND period BETWEEN {lo2} AND {hi2}"
                f" AND rep IN ({', '.join(map(str, imp)) or '-1'}){par}").fetchone()[0] or 0.0
            now, then = q(a, b), q(ra, rb)
            out.append({"t": t, "against": ref, "change": sig(now / then - 1, 3) if then else None})
        return {"kind": "world_change", "product": pid, "freq": freq, "lens": lens if freq == "M" else None,
                "importers": label, "partner": self.label(partner) if partner else None, "values": out}

    def partner_split(self, pid: str, freq: str, periods: list[int], partner, lens: str = "S",
                      span: tuple[int, int] | None = None, outside: bool = False) -> dict:
        """The same importers' imports from one partner and from all the others, each against a year earlier:
        whether a fall came from that supplier more than from everyone else (a supplier-lockdown test)."""
        a = self.world_change(pid, freq, periods, "complete", lens, span, partner=partner, outside=outside)
        b = self.world_change(pid, freq, periods, "complete", lens, span, partner=partner, others=True, outside=outside)
        return {"kind": "partner_split", "product": pid, "freq": freq, "lens": a["lens"], "importers": a["importers"],
                "partner": self.label(partner), "outside": outside,
                "values": [{"t": x["t"], "against": x["against"], "from": x["change"], "others": y["change"]}
                           for x, y in zip(a["values"], b["values"])]}

    def top_exporters(self, pid: str, freq: str, t: int, n: int = 10, lens: str = "L", base: int | None = None,
                      group=None) -> dict:
        E = self.flows(pid, freq, t, lens)
        ex = np.bincount(E["s"], weights=E["w"], minlength=len(self.idx))
        world = ex.sum()
        order = np.argsort(-ex)[:n]
        rows = [[int(i), sig(ex[i] / world, 4)] for i in order if ex[i] > 0]
        out = {"kind": "top_exporters", "product": pid, "freq": freq, "t": t, "lens": lens if freq == "M" else None,
               "rows": rows, "kor": sig(ex[self.idx["KOR"]] / world, 4) if world else None,
               "kor_rank": int((ex > ex[self.idx["KOR"]]).sum() + 1)}
        if group is not None:
            out["group"] = self.label(group)
            out["group_share"] = sig(ex[self.nodes(group)].sum() / world, 4) if world else None
        if base is not None:
            Eb = self.flows(pid, freq, base, lens)
            exb = np.bincount(Eb["s"], weights=Eb["w"], minlength=len(self.idx))
            wb = exb.sum()
            out["base"] = base
            out["base_share"] = [sig(exb[i] / wb, 4) if wb else None for i, _ in rows]
        return out

    def movers(self, pid: str, freq: str, base: int, t: int, lens: str = "M", n: int = 5) -> dict:
        """Exporters whose share of world exports rose or fell most between base and t (the world change is the
        explorer's: the sum of the windows' flows)."""
        E, Eb = self.flows(pid, freq, t, lens), self.flows(pid, freq, base, lens)
        ex = np.bincount(E["s"], weights=E["w"], minlength=len(self.idx))
        exb = np.bincount(Eb["s"], weights=Eb["w"], minlength=len(self.idx))
        if not ex.sum() or not exb.sum():
            return {"kind": "movers", "product": pid, "rows": []}
        d = ex / ex.sum() - exb / exb.sum()
        up = [[int(i), sig(d[i], 3), sig(ex[i] / ex.sum(), 3)] for i in np.argsort(-d)[:n] if d[i] > 0]
        down = [[int(i), sig(d[i], 3), sig(ex[i] / ex.sum(), 3)] for i in np.argsort(d)[:n] if d[i] < 0]
        return {"kind": "movers", "product": pid, "freq": freq, "lens": lens, "base": base, "t": t,
                "world_change": sig(ex.sum() / exb.sum() - 1, 3), "up": up, "down": down}

    def between_groups(self, pid: str, freq: str, a, b, lo: int, hi: int, lens: str = "L") -> dict:
        A, B = set(self.nodes(a)), set(self.nodes(b))
        ps = self.periods(freq, lo, hi, lens)
        rows = []
        for t in ps:
            E = self.flows(pid, freq, t, lens)
            sa, sb = np.isin(E["s"], list(A)), np.isin(E["s"], list(B))
            ta, tb = np.isin(E["t"], list(A)), np.isin(E["t"], list(B))
            w, W = E["w"], E["w"].sum()
            rows.append([t, sig(w[sa & ta].sum() / W, 4), sig(w[sb & tb].sum() / W, 4),
                         sig(w[(sa & tb) | (sb & ta)].sum() / W, 4)])
        return {"kind": "between_groups", "product": pid, "freq": freq, "lens": lens, "a": self.label(a),
                "b": self.label(b), "cols": ["t", "within_a", "within_b", "between"], "rows": rows}

    def connector_scatter(self, pid: str, freq: str, a, b, w0: list[int], w1: list[int]) -> dict:
        """Gopinath et al. (2024, Fig. 4A): for each third economy, the change between two windows
        in its share of A's imports and in its share of B's exports (window means)."""
        A, B = self.nodes(a), self.nodes(b)

        def shares(win):
            sa: dict[int, float] = {}
            sb: dict[int, float] = {}
            ps = self.periods(freq, win[0], win[1], None if freq == "A" else "S")
            for t in ps:
                E = self.flows(pid, freq, t, None if freq == "A" else "S")
                ma = np.isin(E["t"], A) & ~np.isin(E["s"], A)
                mb = np.isin(E["s"], B) & ~np.isin(E["t"], B)
                ta, tb = E["w"][ma].sum(), E["w"][mb].sum()
                for k, w in zip(E["s"][ma].tolist(), E["w"][ma].tolist()):
                    sa[k] = sa.get(k, 0.0) + w / ta / len(ps)
                for k, w in zip(E["t"][mb].tolist(), E["w"][mb].tolist()):
                    sb[k] = sb.get(k, 0.0) + w / tb / len(ps)
            return sa, sb

        a0, b0 = shares(w0)
        a1, b1 = shares(w1)
        keys = (set(a0) | set(a1)) & (set(b0) | set(b1))
        keys -= set(A) | set(B)
        pts = [[k, sig(a1.get(k, 0) - a0.get(k, 0), 3), sig(b1.get(k, 0) - b0.get(k, 0), 3),
                sig(a1.get(k, 0), 3)] for k in keys]
        pts.sort(key=lambda r: -(abs(r[1] or 0) + abs(r[2] or 0)))
        return {"kind": "connector_scatter", "product": pid, "freq": freq, "a": self.label(a), "b": self.label(b),
                "w0": w0, "w1": w1, "cols": ["node", "d_share_of_a_imports", "d_share_of_b_exports", "share_of_a_imports"],
                "points": pts[:60]}

    def share_change(self, pid: str, freq: str, importer, supplier, periods: list[int], lens: str = "M") -> dict:
        me, sup = self.nodes(importer), self.nodes(supplier)
        vals = []
        for t in periods:
            E = self.flows(pid, freq, t, lens)
            sel = np.isin(E["t"], me) & ~np.isin(E["s"], me)
            tot = E["w"][sel].sum()
            vals.append([t, sig(E["w"][sel & np.isin(E["s"], sup)].sum() / tot, 4) if tot else None,
                         all(m in E["filed"] for m in me)])
        return {"kind": "share_change", "product": pid, "freq": freq, "lens": lens, "importer": self.label(importer),
                "supplier": self.label(supplier), "cols": ["t", "share", "filed"], "rows": vals}

    def korea_exposure(self, pid: str, freq: str, t: int, supplier=None, lens: str = "L") -> dict:
        kor = self.idx["KOR"]
        E = self.flows(pid, freq, t, lens)
        sel = E["t"] == kor
        tot = E["w"][sel].sum()
        world = E["w"].sum()
        sup = np.bincount(E["s"][sel], weights=E["w"][sel], minlength=len(self.idx))
        top = [[int(i), sig(sup[i] / tot, 3)] for i in np.argsort(-sup)[:5] if sup[i] > 0] if tot else []
        out = {"kind": "korea_exposure", "product": pid, "freq": freq, "t": t, "lens": lens,
               "share_of_world_imports": sig(tot / world, 3) if world else None, "top_suppliers": top,
               "filed": kor in E["filed"]}
        if supplier is not None:
            out["supplier"] = self.label(supplier)
            out["supplier_share"] = sig(sup[self.nodes(supplier)].sum() / tot, 3) if tot else None
        return out

    def fragility_rank(self, year: int) -> dict:
        """All chain stages ranked by exporter concentration, with the import-weighted supplier HHI,
        the top exporter, and Korea's dependence on its top supplier (from the chain and econ files)."""
        rows = []
        idx = read_json(HERE / "data" / "chains" / "index.json")["chains"]
        kor = self.idx["KOR"]
        seen = set()
        for c in idx:
            ch = read_json(HERE / "data" / "chains" / f"{c['id']}.json")
            ef = HERE / "data" / "econ" / c["id"] / f"{year}.json"
            econ = read_json(ef) if ef.with_name(ef.name + ".br").exists() else {"cols": [], "stages": {}}
            for st in ch["stages"]:
                if st["product"] in seen:
                    continue
                seen.add(st["product"])
                y = st["years"].get(str(year)) or st["years"].get(year)
                if not y:
                    continue
                ser = read_json(HERE / "data" / "series" / "A" / f"{st['product'].replace(':', '-')}.json")
                hs = {r[0]: r[ser["cols"].index("hhi_sup")] for r in ser["rows"]["mirror"]}.get(year)
                me = next((dict(zip(econ["cols"], r)) for r in econ["stages"].get(st["key"], []) if r[0] == kor), {})
                rows.append([st["product"], c["id"], st["stage"], y["world"], y["hhi"], hs,
                             y["top_exporters"][0][0] if y["top_exporters"] else None,
                             y["top_exporters"][0][1] if y["top_exporters"] else None,
                             me.get("m"), me.get("ts") if me.get("ts", -1) >= 0 else None, me.get("tss")])
        rows.sort(key=lambda r: -(r[4] or 0))
        kor = [(r[3] * (r[8] or 0), r[4]) for r in rows if r[4] is not None]
        wsum = sum(w for w, _ in kor)
        return {"kind": "fragility_rank", "year": year,
                "kor_score": sig(sum(w * h for w, h in kor) / wsum, 3) if wsum else None,
                "world_score": sig(sum(r[3] * r[4] for r in rows if r[4]) / sum(r[3] for r in rows if r[4]), 3),
                "cols": ["product", "chain", "stage", "world", "hhi", "hhi_sup", "top_exporter", "top_share",
                         "kor_import_share", "kor_top_supplier", "kor_top_supplier_share"], "rows": rows}

    def scenario(self, pid: str, freq: str, t: int, n_importers: int = 40, lens: str = "L") -> dict:
        """What the scenario control needs: each large importer's supplier shares and its share of
        world imports, and each exporter's share of world exports (first-round arithmetic is done in
        the page: exposure = supplier share x cut)."""
        E = self.flows(pid, freq, t, lens)
        world = E["w"].sum()
        imp = np.bincount(E["t"], weights=E["w"], minlength=len(self.idx))
        ex = np.bincount(E["s"], weights=E["w"], minlength=len(self.idx))
        importers = []
        for i in np.argsort(-imp)[:n_importers]:
            if imp[i] <= 0:
                continue
            sel = E["t"] == i
            sup = np.bincount(E["s"][sel], weights=E["w"][sel], minlength=len(self.idx))
            rows = [[int(k), sig(sup[k] / imp[i], 3)] for k in np.argsort(-sup)[:12] if sup[k] / imp[i] >= 0.005]
            importers.append({"i": int(i), "share": sig(imp[i] / world, 3), "suppliers": rows,
                              "filed": bool(i in E["filed"])})
        if self.idx["KOR"] not in [x["i"] for x in importers] and imp[self.idx["KOR"]] > 0:
            i = self.idx["KOR"]
            sel = E["t"] == i
            sup = np.bincount(E["s"][sel], weights=E["w"][sel], minlength=len(self.idx))
            importers.append({"i": i, "share": sig(imp[i] / world, 3),
                              "suppliers": [[int(k), sig(sup[k] / imp[i], 3)] for k in np.argsort(-sup)[:12]
                                            if sup[k] / imp[i] >= 0.005], "filed": bool(i in E["filed"])})
        exporters = [[int(k), sig(ex[k] / world, 3)] for k in np.argsort(-ex)[:25] if ex[k] > 0]
        return {"product": pid, "freq": freq, "t": t, "lens": lens if freq == "M" else None,
                "importers": importers, "exporters": exporters}


# -- events ----------------------------------------------------------------------------------------


def event_numbers(M: Measure, ev: dict) -> dict:
    """The measured numbers of an event page: the product's change on a year earlier, the named
    economies' imports and exports and their partner shares around the event, and who gained."""
    v = ev["view"]
    f, base, t = v["f"], v["base"], v["t"]
    lens = v.get("lens", "M") if f == "M" else None
    last = M.shown(f)   # an event's "now" goes no later than the explorers' last offered period
    t = min(t, last)
    out = {"view": {**v, "t": t}, "series": [], "measures": [], "missing": []}
    products = [p for p in ev.get("products", []) if p in M.products][:3] or [v["p"]]
    lo = M.back(f, base, 1)
    hi = min(last, (add_months(t, 6) if f == "M" else t + 1))
    economies = [e for e in ev.get("economies", []) if e in M.idx][:8]   # the first eight, in the order given
    for pid in products:
        p = M.products[pid]
        pf = f if (f == "A" or "M" in p) else "A"
        plo, phi, pbase, pt = (lo, hi, base, t) if pf == f else (base // 100 - 1, min(t // 100 + 1, M.shown("A")),
                                                               base // 100, t // 100)
        plens = (lens or "M") if pf == "M" else None
        out["measures"].append(M.movers(pid, pf, pbase, pt, lens=plens or "M") if pf == "M"
                               else M.movers(pid, "A", pbase, pt, lens=None))
        for e in economies:
            for role in ("importer", "exporter"):
                kw = {role: e}
                try:
                    s = M.partner_shares(pid, pf, plo, phi, lens=plens or "M", **kw) if pf == "M" else \
                        M.partner_shares(pid, "A", plo, phi, lens=None, **kw)
                except KeyError:
                    continue
                if not any(x is not None for x in s["yoy"]):
                    continue
                out["series"].append(s)
                if not all(s["filed"][-3:]):
                    out["missing"].append({"economy": e, "product": pid, "role": role})
    return out


def events_strip(M: Measure, lo: int = 201801, complete_to: int | None = None) -> dict:
    """The strip of the events page: monthly imports, all goods, of the economies
    that filed every month from `lo` to the last complete month, in USD (an aggregate of their own
    reports); after it, the imports of those of them that have filed, with their number."""
    complete_to = complete_to or M.meta["complete"]["M"]
    name = M.table("TOTAL", "M")
    want = (complete_to // 100 - lo // 100) * 12 + complete_to % 100 - lo % 100 + 1
    nodes = [r[0] for r in M.L.con.execute(f"""SELECT node FROM rep_{name} WHERE period BETWEEN {lo} AND {complete_to}
        GROUP BY 1 HAVING COUNT(DISTINCT period) = {want}""").fetchall()]
    lst = ", ".join(map(str, nodes))
    rows = M.L.con.execute(f"""SELECT period, SUM(v), COUNT(DISTINCT rep) FROM {name}
        WHERE flow = 'M' AND rep IN ({lst}) AND period >= {lo} GROUP BY 1 ORDER BY 1""").fetchall()
    return {"from": lo, "complete_to": complete_to, "economies": len(nodes),
            "t": [r[0] for r in rows], "imports": [sig(r[1], 4) for r in rows], "filed": [r[2] for r in rows]}


def build_events(M: Measure, out: Path, only: set[str] | None) -> list[dict]:
    path = HERE / "config" / "events.yaml"
    if not path.exists():
        print("no config/events.yaml: events skipped", file=sys.stderr)
        return []
    events = yaml.safe_load(path.read_text())["events"]
    replays = replay_ids()
    index = []
    for ev in events:
        if only and ev["id"] not in only:
            continue
        num = event_numbers(M, ev)
        doc = {**{k: v for k, v in ev.items() if k != "view"}, **num}
        write_json(out / "events" / f"{ev['id']}.json", _plain(doc))
        index.append({k: _plain(ev.get(k)) for k in ("id", "num", "start", "end", "ongoing", "kind", "title", "dek",
                                                     "products", "economies")} | {"view": num["view"], "replay": ev["id"] in replays})
        print(f"event {ev['id']}: {len(num['series'])} series", file=sys.stderr, flush=True)
    if not only:   # a filtered run leaves the index as it is
        write_json(out / "events" / "index.json", {"events": index, "strip": events_strip(M)})
        print(f"events: {sum(1 for e in index if e['replay'])} of {len(index)} replayed by global-network", file=sys.stderr)
    return index


def replay_ids() -> set[str]:
    """The events global-network replays: its data/surface.json (`replays`), else the ids under `replays:` in its
    config/shocks.yaml, else none."""
    plain, packed = GN / "data" / "surface.json", GN / "data" / "surface.json.br"
    if plain.exists() or packed.exists():
        raw = json.loads(plain.read_text()) if plain.exists() else read_json(plain)
        return set(raw.get("replays") or [])
    shocks = GN / "config" / "shocks.yaml"
    if shocks.exists():
        return {r["id"] for r in (yaml.safe_load(shocks.read_text()) or {}).get("replays", []) if r.get("id")}
    return set()


def _r(x, n=2):
    return None if x is None else round(x, n)


def year_ago(ts: list[int], k: int) -> int | None:
    """The index in `ts` (window end months, YYYYMM) of the window ending exactly 12 months before ts[k]: month
    arithmetic, never list positions, since the lists skip January; None when it is not there."""
    t = add_months(ts[k], -12)
    lo, hi = 0, k
    while lo < hi:   # ts is sorted
        mid = (lo + hi) // 2
        if ts[mid] < t:
            lo = mid + 1
        else:
            hi = mid
    return lo if lo < k and ts[lo] == t else None


def growth_on_year(ts: list[int], vals: list, k: int) -> float | None:
    """The change in % of vals[k] against the window ending 12 months earlier (year_ago), one decimal; None where either
    window is missing or incomplete (None or 0). Check K1: the base ends exactly 12 months before."""
    b = year_ago(ts, k)
    if b is None or not vals[b] or vals[k] is None:
        return None
    if add_months(ts[b], 12) != ts[k]:
        raise SystemExit(f"growth base of {ts[k]} is {ts[b]}, not 12 months earlier (K1)")
    return _r(100 * (vals[k] / vals[b] - 1), 1)


def build_changes(M: Measure, out: Path) -> dict:
    """data/changes.json: {shown, prev, items}. Ported from global-network/scripts/build.py (the trade dict and the
    "what changed (E3)" trade block, 2 Nov 2026) so the numbers match; every economy with an all-goods 12-month
    line (nodes/W/TOTAL, the 100 largest), not only the board set.

    export_sign: the economy's export momentum (its 12-month exports against the 12-month window ending exactly 12
    months earlier, by month arithmetic; null where either window is incomplete) changed sign
    between its own shown window and the one before. The economy's own shown window is the last at or before the world's shown month
    whose completeness is at least COMPLETE; an economy without one takes the world's.
    divergence: one of its five largest destinations in that window carries the divergence flag `dv` (1 below the
    pair's band, 2 above), with the mirror ratio.
    chokepoint: a chain's chokepoint stage differs between the chain's year and the year before."""
    meta, nodes = M.meta, M.meta["nodes"]
    shown = meta["shown"]["W"]
    nw = read_json(out / "nodes" / "W" / "TOTAL.json")["12"]
    w_t = nw["t"]
    cutoff = w_t.index(shown)
    prev = w_t[cutoff - 1] if cutoff else None
    snaps: dict[int, dict] = {}

    def snap(t: int) -> dict:
        """One 12-month snapshot indexed: edges by exporter, column indexes."""
        if t not in snaps:
            f = read_json(out / "snap" / "W" / "TOTAL" / f"{t // 100}.w12.json")
            s = next(s for s in f["snaps"] if s["t"] == t)
            ec = {c: i for i, c in enumerate(f["ecols"])}
            by_s: dict[int, list] = {}
            for e in s["edges"]:
                by_s.setdefault(e[ec["s"]], []).append(e)
            snaps[t] = {"ec": ec, "by_s": by_s}
        return snaps[t]

    def base_of(k: int) -> int | None:
        return year_ago(w_t, k)

    def mom(arr, k):
        return growth_on_year(w_t, arr, k)

    items = []
    n_sign = n_div = 0
    for j, i in enumerate(nw["ids"]):
        if i in M.nes:   # Asia, n.e.s. has no economy page: no "what changed" item of its own
            continue
        eco = nodes[i]["id"]
        c_raw = nw["c"][j][: cutoff + 1]
        ok = [v is not None and v >= COMPLETE for v in c_raw]
        x = [v if o else None for v, o in zip(nw["x"][j][: cutoff + 1], ok)]
        own_k = max((k for k, o in enumerate(ok) if o), default=None)
        own_t = w_t[own_k] if own_k is not None else shown
        k = w_t.index(own_t)
        mx = [mom(x, q) for q in range(len(x))]
        if k >= 1 and mx[k] is not None and mx[k - 1] is not None and (mx[k] < 0) != (mx[k - 1] < 0):
            items.append({"eco": eco, "side": "trade", "kind": "export_sign", "t": own_t, "mom": [mx[k - 1], mx[k]],
                          "base": [w_t[base_of(k - 1)], w_t[base_of(k)]]})
            n_sign += 1
        sc = snap(own_t)
        ec = sc["ec"]
        for ed in sorted(sc["by_s"].get(i, []), key=lambda z: -z[ec["w"]])[:CHANGE_DESTS]:
            if ed[ec["dv"]]:
                items.append({"eco": eco, "side": "trade", "kind": "divergence", "t": own_t, "partner": nodes[ed[ec["t"]]]["id"],
                              "dir": ed[ec["dv"]], "mr": _r(ed[ec["mr"]], 2) if ed[ec["mr"]] is not None else None})
                n_div += 1
    n_choke = 0
    for ch in read_json(out / "chains" / "index.json")["chains"]:
        cj = read_json(out / "chains" / f"{ch['id']}.json")
        sn = {s["key"]: {"en": s["en"], "ko": s["ko"]} for s in cj["stages"]}
        h = {y: k for y, k in cj["chokepoint"].items() if k}
        y1, y0 = str(ch["year"]), str(ch["year"] - 1)
        if h.get(y1) != h.get(y0):
            items.append({"side": "trade", "kind": "chokepoint", "chain": ch["id"], "chain_name": {"en": ch["en"], "ko": ch["ko"]},
                          "year": ch["year"], "from": h.get(y0), "to": h.get(y1),
                          "from_name": sn.get(h.get(y0) or "", None), "to_name": sn.get(h.get(y1) or "", None)})
            n_choke += 1
    doc = {"shown": shown, "prev": prev, "items": items}
    write_json(out / "changes.json", doc)
    print(f"changes: {shown} against {prev}: {n_sign} export_sign, {n_div} divergence, {n_choke} chokepoint "
          f"({len(nw['ids'])} economies)", file=sys.stderr)
    return doc


# -- cases -----------------------------------------------------------------------------------------


def case_measure(M: Measure, net: dict, m: dict):
    """One measure of a case (config/cases.yaml), or a list when it has `each:` or several periods."""
    if m.get("each"):
        key, vals = next(iter(m["each"].items()))
        rest = {k: v for k, v in m.items() if k != "each"}
        out = []
        for v in vals:
            r = case_measure(M, net, {**rest, key: v})
            out.append({"kind": m["kind"], "items": r, "each": {key: v}} if isinstance(r, list) else {**r, "each": {key: v}})
        return out
    kind = m["kind"]
    f = m.get("freq") or net.get("freq", "A")
    pid = m.get("product") or (net.get("products") or ["TOTAL"])[0]
    if m.get("codes"):
        pid = M.subset(pid, m["codes"])
    lo, hi = m.get("from", net.get("from")), m.get("to", net.get("to"))
    lens = m.get("lens", "M" if f == "M" else None)
    if kind in ("top_exporters", "korea_exposure") and m.get("periods") and len(m["periods"]) > 1 and "period" not in m:
        return [case_measure(M, net, {**m, "periods": None, "period": t}) for t in m["periods"]]
    period = m.get("period") or (m.get("periods") or [None])[0] or hi
    if period is not None and kind in ("top_exporters", "korea_exposure", "movers"):
        f = "A" if period <= 9999 else "M"
        lens = lens if f == "M" else None
    if kind == "world_change":
        periods = m.get("periods") or [hi]
        f = "A" if periods[0] <= 9999 else "M"
        span = tuple(m.get("window") or m.get("span")) if (m.get("window") or m.get("span")) else None
        base = m.get("against") if isinstance(m.get("against"), int) else None
        return M.world_change(pid, f, periods, m.get("importers", "complete"), lens or "M", span, base,
                              partner=m.get("partner"))
    if kind == "partner_split":
        periods = m["periods"]
        f = "A" if periods[0] <= 9999 else "M"
        span = tuple(m.get("window") or m.get("span")) if (m.get("window") or m.get("span")) else None
        return M.partner_split(pid, f, periods, m["partner"], lens or "S", span, outside=bool(m.get("outside")))
    if kind == "partner_shares":
        f = "A" if lo <= 9999 else "M"
        partners = m.get("partners")
        if partners and m.get("sum_partners"):
            partners = [partners]
        return M.partner_shares(pid, f, lo, hi, importer=m.get("importer"), exporter=m.get("exporter"),
                                partners=partners, lens=(lens or "M") if f == "M" else None)
    if kind == "share_change":
        periods = m.get("periods") or [lo, hi]
        f = "A" if periods[0] <= 9999 else "M"
        return M.share_change(pid, f, m["importer"], m["supplier"], periods, (lens or "M") if f == "M" else None)
    if kind == "top_exporters":
        return M.top_exporters(pid, f, period, m.get("n", 10), lens or "L", m.get("base"), group=m.get("group"))
    if kind == "between_groups":
        return M.between_groups(pid, f, m["a"], m["b"], lo, hi, lens or "L")
    if kind == "connector_scatter":
        w0, w1 = m.get("windows") or [m["w0"], m["w1"]]
        f = "A" if w0[0] <= 9999 else "M"
        return M.connector_scatter(pid, f, m["a"], m["b"], list(w0), list(w1))
    if kind == "korea_exposure":
        return M.korea_exposure(pid, f, period, m.get("supplier"), lens or "L")
    if kind == "fragility_rank":
        years = range(m.get("from", M.meta["complete"]["A"]), m.get("to", M.meta["complete"]["A"]) + 1)
        ranks = [M.fragility_rank(y) for y in years]
        if m.get("importer") == "KOR":
            return {"kind": "fragility_korea", "years": list(years),
                    "kor_score": [r["kor_score"] for r in ranks], "world_score": [r["world_score"] for r in ranks]}
        return {"kind": "fragility_rank", "years": list(years), "latest": ranks[-1],
                "top10": [[r["year"], [row[0] for row in r["rows"][:10]]] for r in ranks]}
    if kind == "movers":
        return M.movers(pid, f, m["base"], period, lens or "M")
    raise ValueError(f"unknown measure kind {kind!r}")


def scenario_data(M: Measure, sc: dict) -> dict | None:
    """The tables the scenario control works on: each large importer's suppliers, for the product,
    the products cut with it, the other products of a closed route and the stages one step down."""
    if sc.get("kind") in (None, "none") or sc.get("product") not in M.products:
        return None
    period = sc.get("period") or M.meta["complete"]["A"]
    f = "A" if period <= 9999 else "M"

    def table(pid):
        if pid not in M.products:
            return None
        if f == "M" and "M" not in M.products[pid]:
            return M.scenario(pid, "A", period // 100)
        return M.scenario(pid, f, period)

    pid = M.subset(sc["product"], sc["codes"]) if sc.get("codes") else sc["product"]
    out = {"spec": _plain(sc), "base": table(pid)}
    for key in ("also_cut", "other_products"):
        if sc.get(key):
            out[key] = [t for t in (table(q) for q in sc[key]) if t]
    down = sc.get("down_stage")
    if down:
        out["down"] = [t for t in (table(q) for q in (down if isinstance(down, list) else [down])) if t]
    return out


def build_cases(M: Measure, out: Path, only: set[str] | None) -> tuple[list[dict], list[dict]]:
    path = HERE / "config" / "cases.yaml"
    if not path.exists():
        print("no config/cases.yaml: cases skipped", file=sys.stderr)
        return [], []
    cfg = yaml.safe_load(path.read_text())
    index, anchors = [], []
    repeat_log: dict[str, list[dict]] = {}
    for c in cfg["cases"]:
        c = {k: v for k, v in c.items()}
        if only and c["id"] not in only:
            continue
        net = c.get("network") or {}
        results = []
        for m in net.get("measures", []):
            try:
                r = case_measure(M, net, m)
                r = {"kind": m["kind"], "spec": _plain(m), "items": r} if isinstance(r, list) else {**r, "spec": _plain(m)}
            except (KeyError, ValueError, TypeError) as e:
                r = {"kind": m.get("kind"), "spec": _plain(m), "error": f"{type(e).__name__}: {e}"}
                print(f"case {c['id']}: measure {m.get('kind')} failed: {e}", file=sys.stderr)
            results.append(r)
        try:
            scen = scenario_data(M, c.get("scenario") or {})
        except (KeyError, ValueError, TypeError) as e:
            scen = {"error": f"{type(e).__name__}: {e}"}
            print(f"case {c['id']}: scenario failed: {e}", file=sys.stderr)
        rep = repeats(c["id"], results, [str(x) for x in (net.get("reviewed_repeats") or {}).get("values", [])])
        if rep:
            repeat_log[c["id"]] = rep
        doc = {**_plain(c), "measured": results, "scenario_data": scen}
        write_json(out / "cases" / f"{c['id']}.json", doc)
        index.append({k: _plain(c.get(k)) for k in ("id", "num", "events", "title", "question")}
                     | {"papers": len(c.get("papers", []))})
        for pp in c.get("papers", []):
            anchors.append({"case": c["id"], "ref": pp.get("ref"), "authors": pp.get("authors"), "year": pp.get("year"),
                            "verified": pp.get("verified"), "quote": pp.get("quote")})
        print(f"case {c['id']}: {len(results)} measures", file=sys.stderr, flush=True)
    if not only:
        write_json(out / "checks" / "repeats.json", {"built_at": datetime.now(UTC).isoformat(timespec="seconds"),
                                                     "rule": "one decimal, adjacent periods or across series of a case",
                                                     "cases": repeat_log})
        write_json(out / "cases" / "index.json", {"cases": index, "further_reading": _plain(cfg.get("further_reading")),
                                                  "gaps": _plain(cfg.get("gaps"))})
    return index, anchors


def _series(results: list[dict]) -> list[tuple[str, list[tuple[int, float]]]]:
    """The change series a case shows (world_change, partner_split), each as (label, [(period, change)])."""
    out = []
    for r in results:
        for x in (r.get("items") or [r]):
            if not isinstance(x, dict):
                continue
            if x.get("kind") == "world_change":
                out.append((f"{x['product']}", [(v["t"], v["change"]) for v in x.get("values", []) if v.get("change") is not None]))
            elif x.get("kind") == "partner_split":
                for side in ("from", "others"):
                    out.append((f"{x['product']} {side} {x['partner']}",
                                [(v["t"], v[side]) for v in x.get("values", []) if v.get(side) is not None]))
    return out


def repeats(cid: str, results: list[dict], reviewed: list[str]) -> list[dict]:
    """Figures that repeat to one decimal (as the page prints them) in adjacent periods of one series or across
    series of one case: a copied or cached value looks like this, so each one is listed for a person to check
    against the layer before publishing. `reviewed` (cases.yaml) holds the ones already checked and genuine."""
    shown = lambda v: f"{v * 100:+.1f}%"  # noqa: E731
    seen: dict[str, list[str]] = {}
    flags = []
    for label, vals in _series(results):
        for k, (t, v) in enumerate(vals):
            seen.setdefault(shown(v), []).append(f"{label} {t}")
            if k and shown(v) == shown(vals[k - 1][1]):
                flags.append({"value": shown(v), "where": [f"{label} {vals[k - 1][0]}", f"{label} {t}"], "rule": "adjacent"})
    for val, where in seen.items():
        if len({w.rsplit(' ', 1)[0] for w in where}) > 1:
            flags.append({"value": val, "where": where, "rule": "across series"})
    for f in flags:
        f["reviewed"] = f["value"] in reviewed
        if not f["reviewed"]:
            print(f"case {cid}: REVIEW repeated figure {f['value']} ({f['rule']}): {', '.join(f['where'])}", file=sys.stderr)
    return flags


def _plain(o):
    """YAML dates and other objects as JSON-safe values."""
    if isinstance(o, dict):
        return {str(k): _plain(v) for k, v in o.items()}
    if isinstance(o, list):
        return [_plain(v) for v in o]
    if hasattr(o, "isoformat"):
        return o.isoformat()
    return o


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--only", help="comma list of event and case ids")
    a = ap.parse_args()
    only = set(a.only.split(",")) if a.only else None
    out = HERE / "data"
    meta = read_json(out / "meta.json")
    M = Measure(meta)
    build_events(M, out, only)
    _, anchors = build_cases(M, out, only)
    if not only:
        build_changes(M, out)
    if anchors and not only:
        write_json(out / "checks" / "papers.json", {
            "run_at": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"), "tier": 5, "anchors": anchors,
            "verified": sum(1 for x in anchors if x.get("verified")), "papers": len(anchors)})
    return 0


if __name__ == "__main__":
    sys.exit(main())

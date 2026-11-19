# /// script
# requires-python = ">=3.11"
# dependencies = ["pyyaml>=6", "pytest>=8"]
# ///
"""The licence gate of trade-flow's /svc/v1 views: every
view's example in api.yaml and a set of variants, in English and Korean, answer with derived records only (shares,
ranks, ratios, HHI: no USD value of a flow, an economy or the world, no UN Comtrade record field, no dollar amount in
the prose), within the view's max_bytes and the list caps, and nothing lists the data folder.

Against a running build (port 3512 as in the README's check):

    SVC_BASE=http://127.0.0.1:3512 uv run --with pytest --with pyyaml pytest trade-flow/scripts/tests/test_svc_licence.py

Skipped when SVC_BASE is not set (the builders' pytest run has no server).
"""
from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

import pytest
import yaml

BASE = os.environ.get("SVC_BASE", "").rstrip("/")
pytestmark = pytest.mark.skipif(not BASE, reason="SVC_BASE not set: no trade-flow server to test")
MANIFEST = yaml.safe_load((Path(__file__).resolve().parents[2] / "api.yaml").read_text(encoding="utf-8"))
VIEWS = {v["id"]: v for v in MANIFEST["views"]}

# Keys that would carry a value rather than a share: the decoded snapshot's USD fields, UN Comtrade's record fields
# (comtradeplus API names, lower-cased), totals.
FORBIDDEN = {
    "value", "values_usd", "vx", "vm", "world", "usd", "kg", "net", "total", "world_total", "exports_usd", "imports_usd",
    "trade_value", "primaryvalue", "cifvalue", "fobvalue", "netwgt", "grosswgt", "qty", "altqty", "reportercode",
    "partnercode", "cmdcode", "flowcode", "refperiodid", "x_bn", "m_bn",
}
ALLOWED = {"unit_value_usd_per_kg"}  # a ratio of two world totals, as the chain page prints it
VALUE_KEY = re.compile(r"(_usd|_bn|_value|_tn)$|^usd|^value$", re.I)
# Dollar amounts with a scale, English and Korean (escaped), as prose.py takes them out.
EN_AMOUNT = re.compile(r"\$\s?\d[\d,]*(?:\.\d+)?(?:\s?[–-]\s?\$?\d[\d,]*(?:\.\d+)?)?\s?(?:tn|bn|m|k|trillion|billion|million|thousand)(?![a-z])")
KO_AMOUNT = re.compile("\\d[\\d,]*(?:\\.\\d+)?\\s?(?:\uC870|\uC5B5|\uB9CC)\\s?(?:\uD64D\uCF69\\s?)?\uB2EC\uB7EC")
# List caps: one chart's worth.
CAPS = {"partners": 25, "products": 100, "a_to_b": 10, "b_to_a": 10, "periods": 121, "top_exporters": 10, "top_importers": 10,
        "importers": 13, "items": 20, "gained": 5, "lost": 5, "top_flows": 5, "exporters": 25, "headline": 8}
GENERIC_CAP = 300


def get(path: str, host: str = "trade-flow") -> tuple[int, bytes]:
    req = urllib.request.Request(BASE + path, headers={"Host": host, "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def fill(view: dict, example: dict) -> str:
    q = dict(example)
    path = re.sub(r"\{(\w+)\}", lambda m: urllib.parse.quote(str(q.pop(m.group(1))), safe=""), view["path"])
    return f"/svc/v1{path}" + (f"?{urllib.parse.urlencode(q)}" if q else "")


def walk(x, path="$", key=""):
    """(path, key, value) for every key, and for every item of a list (under the list's key)."""
    if isinstance(x, dict):
        for k, v in x.items():
            yield path, k, v
            yield from walk(v, f"{path}.{k}", k)
    elif isinstance(x, list):
        for i, v in enumerate(x):
            if not isinstance(v, (dict, list)):
                yield f"{path}[{i}]", f"{key}[]", v
            yield from walk(v, f"{path}[{i}]", key)


# Third-party words passed on verbatim: the titles of the dated sources an event cites, and the papers' titles,
# findings and quotes (cases); their dollar amounts are the publishers', not UN Comtrade records. In an item's
# Markdown, the "Sources" and "Papers" sections hold the same.
VERBATIM = re.compile(r"\.(sources|papers)\[\d+\]$")
VERBATIM_KEYS = {"title", "finding", "quote", "quote[]"}
HEADLINE = re.compile(r"^\$\.data\.headline\[\d+\]$")
CITED = re.compile(r"^## (Sources|Papers)\n.*?(?=^## |\Z)", re.M | re.S)


def check_answer(body: dict, max_bytes: int, size: int, where: str) -> None:
    assert size <= max_bytes, f"{where}: {size:,} bytes over {max_bytes:,}"
    # the economy hook's headline is { label, value, unit, period } by contract: its values must be shares or ranks
    for h in (body.get("data") or {}).get("headline") or []:
        assert h["unit"] in ("%", "rank", "% of exports", "% of imports"), f"{where}: headline unit {h['unit']}"
    for path, k, v in walk(body):
        key = str(k).lower()
        if k == "value" and HEADLINE.search(path):
            continue
        assert key not in FORBIDDEN or k in ALLOWED, f"{where}: value field {path}.{k}"
        assert k in ALLOWED or not VALUE_KEY.search(key), f"{where}: value-like field {path}.{k}"
        if isinstance(v, (int, float)) and not isinstance(v, bool) and not key.endswith("_pct"):
            assert abs(v) < 100_000, f"{where}: {path}.{k} = {v} looks like a value, not a share, rank or ratio"
        if isinstance(v, list) and not (k == "economies" and path == "$.data"):
            cap = CAPS.get(k, GENERIC_CAP)
            assert len(v) <= cap, f"{where}: {path}.{k} holds {len(v)} items (cap {cap})"
        if isinstance(v, str) and not (VERBATIM.search(path) and k in VERBATIM_KEYS):
            t = CITED.sub("", v) if k == "text" else v
            assert not EN_AMOUNT.search(t), f"{where}: dollar amount in {path}.{k}: {EN_AMOUNT.search(t).group(0)}"
            assert not KO_AMOUNT.search(t), f"{where}: dollar amount (ko) in {path}.{k}"
    table = body.get("table") or {}
    cols = [c["id"] for c in table.get("columns") or []]
    for row in table.get("rows") or []:
        for cid, c in zip(cols, row):
            if isinstance(c, (int, float)) and not isinstance(c, bool) and not cid.endswith("_pct"):
                assert abs(c) < 100_000, f"{where}: table column {cid} = {c} looks like a value"
            if isinstance(c, str):
                assert not EN_AMOUNT.search(c) and not KO_AMOUNT.search(c), f"{where}: dollar amount in table column {cid}"


def calls() -> list[tuple[str, str]]:
    """(view id, path) for every example and the variants."""
    out = [(v["id"], fill(v, v.get("example") or {})) for v in MANIFEST["views"]]
    out += [
        ("economy", "/svc/v1/economies/KOR?direction=imports&limit=25"),
        ("economy", "/svc/v1/economies/USA?period=2024"),
        ("economy", "/svc/v1/economies/CHN?product=HS%3A85"),
        ("economy", "/svc/v1/economies/DEU?product=B%3Asemiconductors&period=2025-12"),
        ("economy", "/svc/v1/economies/NGA?period=2023&direction=imports"),
        ("bilateral", "/svc/v1/flows/CHN/USA?period=2023"),
        ("bilateral", "/svc/v1/flows/KOR/JPN?product=C%3Asemiconductors%3Aphotoresist"),
        ("bilateral", "/svc/v1/flows/IDN/CHN?product=C%3Abatteries%3Anickel_ore&period=2020"),
        ("products", "/svc/v1/products?kind=stage&limit=100"),
        ("products", "/svc/v1/products?limit=100&cursor=100"),
        ("product", "/svc/v1/products/TOTAL"),
        ("product", "/svc/v1/products/HS-27?period=2023"),
        ("chain", "/svc/v1/chains/batteries"),
        ("chain", "/svc/v1/chains/steel?year=2019&economy=AUS"),
        ("supplier_cut", "/svc/v1/tools/cut-supplier"),
        ("supplier_cut", "/svc/v1/tools/cut-supplier?stage=batteries/li_hydroxide&exporter=CHN&cut=50"),
    ]
    s, b = get("/svc/v1/events")
    out += [("event", f"/svc/v1/events/{e['id']}") for e in json.loads(b)["data"]["events"]]
    s, b = get("/svc/v1/cases")
    out += [("case", f"/svc/v1/cases/{c['id']}") for c in json.loads(b)["data"]["cases"]]
    return out


HOOKS = [
    "/svc/v1/search?q=korea&limit=20", "/svc/v1/search?q=HS%3A85", "/svc/v1/economy/KOR", "/svc/v1/economy/USA", "/svc/v1/economy/ZZZ",
    "/svc/v1/economies", "/svc/v1/item?id=economy%3AKOR", "/svc/v1/item?id=product%3AHS%3A85", "/svc/v1/item?id=chain%3Abatteries",
    "/svc/v1/item?id=event%3Airan-war-2026", "/svc/v1/item?id=case%3Ahormuz",
]


@pytest.fixture(scope="module")
def answers() -> list[tuple[str, str, int, bytes]]:
    out = []
    for view, path in calls() + [("hook", h) for h in HOOKS]:
        for lang in ("en", "ko"):
            p = path + ("&" if "?" in path else "?") + f"lang={lang}"
            s, b = get(p)
            out.append((view, p, s, b))
    return out


def test_every_call_answers(answers):
    bad = [(p, s, b[:200]) for _, p, s, b in answers if s != 200]
    assert not bad, bad


def test_derived_records_only_and_caps(answers):
    fails = []
    for view, p, s, b in answers:
        if s != 200:
            continue
        cap = int(VIEWS[view].get("max_bytes", 60000)) if view in VIEWS else 60000
        try:
            check_answer(json.loads(b), cap, len(b), p)
        except AssertionError as e:
            fails.append(str(e).split("\n")[0])
    assert not fails, "\n".join(fails)


def test_manifest_counts_no_original_records():
    s, b = get("/svc/v1/manifest")
    assert s == 200
    assert json.loads(b)["records"]["originals"] == 0


def test_limits_are_capped():
    for p in ("/svc/v1/economies/KOR?limit=26", "/svc/v1/products?limit=101", "/svc/v1/search?q=a&limit=21"):
        s, b = get(p)
        assert s == 400, (p, s)
        assert json.loads(b)["error"]["type"] == "bad-parameter"


def test_no_listing_of_the_data_folder():
    for p in ("/svc/v1/data", "/svc/v1/files", "/svc/v1/snap", "/svc/v1/products.json"):
        s, b = get(p)
        assert s == 404, (p, s)
    for p in ("/data/", "/data/snap/", "/data/snap/A/"):
        s, b = get(p)
        assert s != 200 or b"snap/" not in b, (p, s)


def test_redaction_keeps_shares():
    s, b = get("/svc/v1/events/indonesia-nickel-ban-2020")
    items = json.loads(b)["data"]["reading"]["items"]
    text = " ".join(i["numbers"] for i in items)
    assert "%" in text and not EN_AMOUNT.search(text)


if __name__ == "__main__":
    import sys
    sys.exit(pytest.main([__file__, "-q"]))

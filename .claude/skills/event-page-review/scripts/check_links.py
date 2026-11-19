# /// script
# requires-python = ">=3.11"
# dependencies = ["pyyaml==6.0.3"]
# ///
"""Do an event's source links resolve? Reads config/events.yaml and requests every source URL of the event
(HEAD, then GET when HEAD is refused), printing the status, the final URL when it redirected, and the page title.

    uv run .claude/skills/event-page-review/scripts/check_links.py us-chip-controls-2022
    uv run ... --all                      # every event
    uv run ... us-chip-controls-2022 --urls https://example.org/a https://example.org/b   # candidate sources, too

A 403 or 429 from a site that blocks scripts (sec.gov, some publishers) is not a dead link: open it with WebFetch
or a browser. A 200 that lands on the site's home page, or on a different host, is flagged as a suspected soft 404.
"""
from __future__ import annotations

import argparse
import re
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

import yaml

ROOT = Path(__file__).resolve().parents[4]
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36 datasteg-link-check"


def fetch(url: str, timeout: float) -> dict:
    out = {"url": url, "status": None, "final": None, "title": None, "note": ""}
    for method in ("HEAD", "GET"):
        req = Request(url, method=method, headers={"User-Agent": UA, "Accept": "text/html,application/pdf,*/*;q=0.8",
                                                   "Accept-Language": "en,ko;q=0.8"})
        try:
            with urlopen(req, timeout=timeout) as r:
                out["status"] = r.status
                out["final"] = r.geturl()
                if method == "GET" and "html" in (r.headers.get("Content-Type") or ""):
                    head = r.read(200_000).decode("utf-8", "replace")
                    m = re.search(r"<title[^>]*>(.*?)</title>", head, re.S | re.I)
                    out["title"] = re.sub(r"\s+", " ", m.group(1)).strip()[:120] if m else None
                if method == "HEAD" and out["status"] == 200:
                    continue          # one GET for the title
                break
        except HTTPError as e:
            out["status"] = e.code
            out["final"] = e.geturl()
            if method == "HEAD" and e.code in (403, 405, 404, 429, 500, 501, 503):
                continue              # some servers refuse HEAD; try GET
            break
        except URLError as e:
            out["note"] = f"error: {e.reason}"
            break
        except Exception as e:  # noqa: BLE001
            out["note"] = f"error: {e}"
            break
    if out["final"] and out["final"] != url:
        a, b = urlsplit(url), urlsplit(out["final"])
        if a.netloc != b.netloc and "web.archive.org" not in a.netloc:
            out["note"] += " redirected to another host"
        if b.path in ("", "/") and a.path not in ("", "/"):
            out["note"] += " landed on the home page (soft 404?)"
    if out["status"] in (403, 429):
        out["note"] += " blocked for scripts: open it by hand"
    if out["title"] and re.match(r"^(lock|just a moment|access denied|attention required|are you a robot|verify you are human|403 forbidden|404)", out["title"], re.I):
        out["note"] += f" bot challenge or error page (title {out['title']!r}): open it by hand"
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("slug", nargs="?")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--urls", nargs="*", default=[], help="extra URLs to check (candidate sources)")
    ap.add_argument("--timeout", type=float, default=25)
    ap.add_argument("--root", type=Path, default=ROOT)
    a = ap.parse_args()
    events = yaml.safe_load((a.root / "config" / "events.yaml").read_text())["events"]
    todo: list[tuple[str, str, str]] = []
    for ev in events:
        if a.all or ev["id"] == a.slug:
            for s in ev.get("sources", []):
                todo.append((ev["id"], f"[{s['n']}]", s["url"]))
    for u in a.urls:
        todo.append((a.slug or "-", "[new]", u))
    if not todo:
        print("nothing to check: give an event id, --all or --urls", file=sys.stderr)
        return 2
    with ThreadPoolExecutor(8) as ex:
        results = list(ex.map(lambda t: fetch(t[2], a.timeout), todo))
    bad = 0
    for (ev, n, url), r in zip(todo, results):
        ok = r["status"] is not None and r["status"] < 400 and not any(k in r["note"] for k in ("soft 404", "another host", "bot challenge"))
        bad += 0 if ok else 1
        mark = "ok " if ok else "!! "
        line = f"{mark}{ev} {n} {r['status']} {url}"
        if r["final"] and r["final"] != url:
            line += f"\n      → {r['final']}"
        if r["title"]:
            line += f"\n      title: {r['title']}"
        if r["note"]:
            line += f"\n      {r['note'].strip()}"
        print(line)
    print(f"\n{len(todo) - bad} ok, {bad} to look at")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())

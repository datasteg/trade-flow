"""Tests of the completeness measure in build_snapshots.py: a partner that has
not filed lowers it, a fall in trade does not, a thin reference year steps back, and meta.shown.

    uv run --with pytest --with duckdb==1.5.6 --with networkx==3.6.1 --with numpy==2.4.6 --with scipy==1.17.1 \
        --with pyyaml==6.0.3 --with brotli==1.1.0 pytest scripts/tests/test_completeness.py
"""

import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import build_snapshots as bs  # noqa: E402

# four economies; flows as (exporter, importer, value)
YEAR = [(0, 1, 60.0), (2, 1, 30.0), (1, 3, 10.0), (2, 3, 50.0)]


def add(c: bs.Completeness, period: int, flows: list[tuple[int, int, float]]):
    s, t, w = (np.array(x) for x in zip(*flows)) if flows else (np.array([], int), np.array([], int), np.array([]))
    return c.add(period, s, t, w)


def tracker() -> bs.Completeness:
    return bs.Completeness(4, lambda y: y - 1)


def test_first_period_is_complete():
    c, cw = add(tracker(), 2020, YEAR)
    assert np.allclose(c, 1.0) and cw == 1.0


def test_a_fall_in_trade_does_not_lower_it():
    tr = tracker()
    add(tr, 2020, YEAR)
    c, cw = add(tr, 2021, [(s, t, w / 3) for s, t, w in YEAR])
    assert np.allclose(c, 1.0) and cw == pytest.approx(1.0)


def test_a_missing_partner_lowers_both_ends():
    tr = tracker()
    add(tr, 2020, YEAR)
    c, cw = add(tr, 2021, [f for f in YEAR if f[:2] != (0, 1)])   # 0 -> 1 is gone
    assert c[0] == pytest.approx(0.0)                 # economy 0 traded only with 1
    assert c[1] == pytest.approx(40 / 100)            # 1's flows a year earlier: 60 + 30 + 10
    assert c[2] == pytest.approx(1.0) and c[3] == pytest.approx(1.0)
    assert cw == pytest.approx(90 / 150)


def test_a_thin_reference_steps_back():
    tr = tracker()
    add(tr, 2019, YEAR)
    thin = [f for f in YEAR if 1 not in f[:2]]        # economy 1 stops filing: its flows vanish
    c20, _ = add(tr, 2020, thin)
    assert c20[1] == pytest.approx(0.0)
    c21, _ = add(tr, 2021, thin)
    # against 2020 economy 1 would look complete (nothing to miss); measured against 2019 it is empty
    assert c21[1] == pytest.approx(0.0)
    # its partners keep missing their flows with 1, also against 2019
    assert c21[2] == pytest.approx(50 / 80) and c21[3] == pytest.approx(50 / 60)


def test_old_references_are_dropped():
    tr = tracker()
    for y in range(2010, 2020):
        add(tr, y, YEAR)
    assert min(tr.flows) == 2019 - bs.COMPLETE_STEPS - 1


def test_shown_period():
    cols = ["t", "world", "cmp"]
    rows = [[202605, 1, 0.95], [202606, 1, 0.90], [202607, 1, 0.87], [202608, 1, 0.55], [202609, 1, 0.08]]
    assert bs.shown_period(rows, cols) == 202607
    assert bs.shown_period([[202601, 1, None]], cols) == 202601

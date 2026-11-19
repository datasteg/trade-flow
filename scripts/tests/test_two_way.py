"""Tests of the two-way trade measures in build_snapshots.py: the Grubel-Lloyd index, the gap between a flow's
two reports, unit values under the weight-coverage rule, the two-way flag and the stage summary.

    uv run --with pytest --with duckdb==1.5.6 --with networkx==3.6.1 --with numpy==2.4.6 --with scipy==1.17.1 \
        --with pyyaml==6.0.3 --with brotli==1.1.0 pytest scripts/tests
"""

import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import build_snapshots as bs  # noqa: E402


def test_grubel_lloyd():
    assert bs.grubel_lloyd(100, 100) == 1.0
    assert bs.grubel_lloyd(100, 0) == 0.0
    assert bs.grubel_lloyd(0, 100) == 0.0
    assert bs.grubel_lloyd(0, 0) is None
    # quartz, China 2024: exports $215m, imports $957m
    assert bs.grubel_lloyd(215, 957) == pytest.approx(1 - 742 / 1172)
    assert bs.grubel_lloyd(3, 1) == bs.grubel_lloyd(1, 3) == pytest.approx(0.5)


def test_report_gap():
    assert bs.report_gap(100, 100) == 0.0
    assert bs.report_gap(100, 50) == pytest.approx(0.5)
    assert bs.report_gap(50, 100) == pytest.approx(0.5)
    # the importer's report 17.2 times the exporter's
    assert bs.report_gap(1, 17.2) == pytest.approx(1 - 1 / 17.2)
    assert bs.report_gap(None, 100) is None
    assert bs.report_gap(100, 0) is None
    assert bs.report_gap(float("nan"), 100) is None


def test_unit_value_coverage():
    # $800 of a $1,000 flow has a weight of 400 kg: covered 80%, $2/kg
    assert bs.unit_value(800, 400, 1000) == pytest.approx(2.0)
    assert bs.unit_value(799, 400, 1000) is None          # below 80%
    assert bs.unit_value(800, 0, 1000) is None            # no weight
    assert bs.unit_value(0, 0, 0) is None


def test_two_way_flag():
    t = bs.TWO_WAY
    assert bs.two_way(0.13, 0.58, bs.grubel_lloyd(0.13, 0.58))
    assert not bs.two_way(0.13, 0.58, t["gl"] - 0.01)                       # GL below the threshold
    assert not bs.two_way(t["share"] - 0.001, 0.03, 0.9)                    # exports too small
    assert not bs.two_way(0.03, t["share"] - 0.001, 0.9)                    # imports too small
    assert bs.two_way(t["share"], t["share"], t["gl"])                      # thresholds are inclusive
    assert not bs.two_way(0.5, 0.5, None)


def _edges(rows):
    s, t, w, kg, vk = (np.array(c, dtype=float) for c in zip(*rows))
    return {"s": s.astype(np.int64), "t": t.astype(np.int64), "w": w, "kg": kg, "vk": vk,
            "src": np.ones(len(rows), dtype=bool)}


def test_stage_summary_two_way():
    # economies 0..3: 0 imports 600 (from 1 and 2) and exports 300 (to 3): GL 2/3, a two-way trader
    E = _edges([
        (1, 0, 400, 100, 400),     # 1 -> 0, $4/kg
        (2, 0, 200, 100, 200),     # 2 -> 0, $2/kg
        (0, 3, 300, 600, 300),     # 0 -> 3, $0.5/kg
        (1, 3, 100, 0, 0),         # no weight
    ])
    world = float(E["w"].sum())
    y = bs.stage_summary(E, world)
    assert y["world"] == 1000
    tw = {r["i"]: r for r in y["two_way"]}
    assert set(tw) == {0}
    r = tw[0]
    assert r["x"] == pytest.approx(0.3) and r["m"] == pytest.approx(0.6)
    assert r["gl"] == pytest.approx(round(1 - 300 / 900, 3))
    assert r["ux"] == pytest.approx(0.5)              # 300 / 600 kg
    assert r["um"] == pytest.approx(600 / 200)        # 600 / 200 kg
    assert r["sup"] == [1, 2] and r["buy"] == [3]
    econ = {row[0]: dict(zip(bs.ECON_COLS, row)) for row in y["econ"]}
    assert econ[0]["ts"] == 1 and econ[0]["tss"] == pytest.approx(round(400 / 600, 3))
    assert econ[1]["ux"] == pytest.approx(4.0)        # 1's exports: $400 of $500 weighed (80%), 100 kg
    assert econ[3]["um"] is None                      # 3's imports: $300 of $400 weighed (75%)
    assert econ[3]["ts"] == 0
    assert econ[2]["m"] == 0 and econ[2]["ts"] == -1

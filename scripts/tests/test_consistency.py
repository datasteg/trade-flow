"""The consistency checks of the flow sites' consistency rules that trade-flow runs (K1, K4, K5), each tested
against a deliberate mismatch: a growth base 13 months back, a read of a retired monthly lens.

    uv run --with pytest --with duckdb==1.5.6 --with networkx==3.6.1 --with numpy==2.4.6 --with scipy==1.17.1 \
        --with pyyaml==6.0.3 --with brotli==1.1.0 pytest scripts/tests/test_consistency.py
"""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import build_stories as st  # noqa: E402
import build_windows as bw  # noqa: E402
import checks  # noqa: E402


def ends(lo: int, hi: int, w: int = 12) -> list[int]:
    return bw.window_ends(lo, hi, w)


def test_k1_growth_base_is_twelve_months_back_on_a_list_without_january():
    ts = ends(202302, 202607)                          # no January: list positions are not months
    for k, t in enumerate(ts):
        b = st.year_ago(ts, k)
        if b is not None:
            assert bw.add_months(ts[b], 12) == t
    k = ts.index(202506)
    assert ts[st.year_ago(ts, k)] == 202406
    assert ts[k - 12] == 202405                        # the old position rule: 13 months back (L1)
    vals = [100.0 + i for i in range(len(ts))]
    assert st.growth_on_year(ts, vals, k) == round(100 * (vals[k] / vals[ts.index(202406)] - 1), 1)
    k2 = ts.index(202403)                              # its base, 2023-03, is in the list; 2023-01 would not be
    assert ts[st.year_ago(ts, k2)] == 202303
    assert st.year_ago(ts, ts.index(202302)) is None   # no window 12 months before the first
    vals[ts.index(202406)] = None                      # an incomplete base window: no growth
    assert st.growth_on_year(ts, vals, k) is None


def test_k1_growth_base_on_three_month_windows():
    ts = ends(202302, 202607, 3)                       # no January, no April
    assert 202404 not in ts and 202401 not in ts
    k = ts.index(202505)
    assert ts[st.year_ago(ts, k)] == 202405


def test_k4_finds_reads_of_the_retired_lenses():
    bad = ["  return `snap/M/${p.slug}/${y}.L.json`;", "loadNodeSeries(meta, product, 'M').then(", "sf = out / \"series\" / \"M\" / slug",
           "readData('nodes/M/B-chips_ic.json')"]
    good = ["return `snap/W/${p.slug}/${y}.w12.json`;", "loadNodeSeries(meta, product, 'W')", "out / \"series\" / \"W\"",
            "freq === 'M' ? 'W' : 'A'"]
    assert all(any(r.search(x) for r in checks.RETIRED_READS) for x in bad)
    assert not any(any(r.search(x) for r in checks.RETIRED_READS) for x in good)


def test_k4_tree_reads_no_retired_lens():
    assert checks.k4_retired()["reads"] == []


def test_k5_counts_a_filed_month_without_a_row_read_as_zero():
    """The L2 pattern fails K5 before the rule and passes after it."""
    import numpy as np
    T = 30
    VM = np.array([np.full(T, 110.0), np.full(T, 50.0)])
    VM[:, 24] = 0.0                                  # the importer filed, but sent no row of the product
    VX = np.array([np.full(T, 100.0), np.full(T, 45.0)])
    NF = np.ones((3, T), dtype=bool)
    mk = lambda: bw.Panel([bw.add_months(202401, k) for k in range(T)], np.array([0, 2]), np.array([1, 1]),  # noqa: E731
                          VM.copy(), VX.copy(), NF, np.array([False] * 3))
    P = mk()
    bw.composite(P)                                  # the old reading: a reported zero
    assert bw.zero_reads(P, 3) == 2
    P = mk()
    interp, _, _ = bw.product_filed(P, 3)
    bw.composite(P)
    P.C[interp] = 4
    assert bw.zero_reads(P, 3) == 0


@pytest.mark.skipif(not (checks.HERE / "data" / "diag").exists(), reason="no data/ built")
def test_k5_no_reported_zero_in_the_built_windows():
    r = checks.k5_reported_zero()
    assert r["status"] == "pass", r["bad"]

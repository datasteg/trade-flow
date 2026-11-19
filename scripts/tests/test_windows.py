"""Tests of the monthly explorer's rules in build_windows.py: window ends that keep January and February
together, proportional Denton, the year-on-year splice, the divergence band and the single-month leak test.

    uv run --with pytest --with statsmodels --with duckdb==1.5.6 --with networkx==3.6.1 --with numpy==2.4.6 \
        --with scipy==1.17.1 --with pyyaml==6.0.3 --with brotli==1.1.0 pytest scripts/tests
"""

import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import build_windows as bw  # noqa: E402


def months(lo: int, n: int) -> list[int]:
    out = [lo]
    while len(out) < n:
        out.append(bw.add_months(out[-1], 1))
    return out


def panel(VM, VX, FI, FX, never_imp=False) -> bw.Panel:
    """One flow, exporter node 0 and importer node 1, with its drawn series built."""
    T = len(VM)
    NF = np.zeros((2, T), dtype=bool)
    NF[1], NF[0] = FI, FX
    never = np.array([False, never_imp])
    P = bw.Panel(months(201901, T), np.array([0]), np.array([1]), np.array([VM], float), np.array([VX], float), NF, never)
    bw.composite(P)
    return P


def test_window_ends_keep_january_and_february_together():
    assert [m for m in range(1, 13) if not bw.valid_end(2024 * 100 + m, 12)] == [1]
    assert [m for m in range(1, 13) if not bw.valid_end(2024 * 100 + m, 6)] == [1, 7]
    assert [m for m in range(1, 13) if not bw.valid_end(2024 * 100 + m, 3)] == [1, 4]
    for w in bw.WINDOWS:
        for t in bw.window_ends(202001, 202412, w):
            ms = months(bw.add_months(t, -(w - 1)), w)
            for y in {m // 100 for m in ms}:
                assert (y * 100 + 1 in ms) == (y * 100 + 2 in ms)


def test_denton_sums_to_the_targets_and_matches_statsmodels():
    rng = np.random.default_rng(1)
    ind = rng.uniform(50, 150, 36)
    targets = {2019: 1300.0, 2020: 1150.0, 2021: 1400.0}
    grp = np.repeat([2019, 2020, 2021], 12)
    x = bw.denton_prop(ind, grp, targets)
    for y, v in targets.items():
        assert x[grp == y].sum() == pytest.approx(v)
    sm = pytest.importorskip("statsmodels.tsa.interp.denton")
    ref = sm.dentonm(ind, np.array(list(targets.values())), freq="other", k=12)
    assert np.allclose(x, ref, rtol=1e-6)


def test_splice_is_own_a_year_earlier_times_partner_growth():
    T = 36
    VM = np.r_[np.full(24, 110.0), np.zeros(12)]          # the importer stops filing after two years
    VX = np.r_[np.full(12, 100.0), np.full(12, 100.0), np.full(12, 130.0)]
    FI = np.r_[np.ones(24, bool), np.zeros(12, bool)]
    FX = np.ones(T, bool)
    P = panel(VM, VX, FI, FX)
    V = bw.window_values(P, T - 1, 12)
    # est = own(t − 12) × partner(t) / partner(t − 12) = 1320 × 1560 / 1200 (κ = 1.1 in every month)
    assert V["value"][0] == pytest.approx(1320 * 1560 / 1200)
    assert P.K[0, -1] == pytest.approx(1.1)
    assert V["code"][0] == 2
    assert np.isnan(V["mr"][0])
    # a window the importer filed is its own report, untouched
    V0 = bw.window_values(P, 23, 12)
    assert V0["value"][0] == pytest.approx(1320) and V0["code"][0] == 0 and V0["mr"][0] == pytest.approx(1.1)


def test_kappa_falls_back_to_the_latest_12_months_and_is_kept_beyond_24():
    T = 60
    VM = np.r_[np.full(24, 120.0), np.zeros(36)]
    FI = np.r_[np.ones(24, bool), np.zeros(36, bool)]
    P = panel(VM, np.full(T, 100.0), FI, np.ones(T, bool))
    assert P.K[0, 35] == pytest.approx(1.2)     # 12 months ending a year earlier (month 23) were filed
    assert P.K[0, 47] == pytest.approx(1.2)     # anchored on months 12-23, 24 months back
    # beyond 24 months the last anchor is kept, flagged with its year: no step at month 48
    assert P.K[0, 48] == pytest.approx(1.2) and P.K[0, 59] == pytest.approx(1.2)
    assert P.KJ[0, 48] == 23 and P.KY[0, 48] == P.months[23] // 100
    V = bw.window_values(P, 50, 3)
    assert V["code"][0] == 2 and V["ky"][0] == P.months[23] // 100
    w = [bw.window_values(P, j, 12)["value"][0] for j in (47, 48, 49)]
    assert w[0] == pytest.approx(w[1]) == pytest.approx(w[2]) == pytest.approx(1440)


def test_lapsed_filer_has_no_step_when_its_anchor_passes_24_months():
    """China's case (L: last monthly file 2024-12): partner reports flat, the importer's level 1.27 times them; the
    12-month windows run on at the same level past the 24th month after the last file."""
    T = 72
    VX = np.full(T, 100.0)
    VM = np.r_[np.full(36, 127.0), np.zeros(36)]
    FI = np.r_[np.ones(36, bool), np.zeros(36, bool)]
    P = panel(VM, VX, FI, np.ones(T, bool))
    vals = [bw.window_values(P, j, 12)["value"][0] for j in range(47, T)]
    assert max(vals) == pytest.approx(min(vals)) == pytest.approx(12 * 127.0)


def test_splice_never_amplifies_a_near_zero_anchor():
    T = 36
    VM = np.r_[np.full(24, 50.0), np.zeros(12)]
    VX = np.r_[np.full(24, 0.001), np.full(12, 2.0)]     # the exporter reported almost nothing in the anchor year
    FI = np.r_[np.ones(24, bool), np.zeros(12, bool)]
    P = panel(VM, VX, FI, np.ones(T, bool))
    V = bw.window_values(P, T - 1, 3)
    assert V["code"][0] == 3 and V["value"][0] == pytest.approx(6.0 * bw.CIF_FOB)   # partner-only, not 50,000 × 2


def test_partly_filed_window_keeps_reported_months():
    T = 30
    VM = np.full(T, 110.0)
    VX = np.full(T, 100.0)
    FI = np.ones(T, bool)
    FI[-2:] = False                                       # the last two months not yet filed
    P = panel(VM, VX, FI, np.ones(T, bool))
    V = bw.window_values(P, T - 1, 3)
    assert V["value"][0] == pytest.approx(110 + 2 * 110)   # one reported month, two spliced at the 1.1 ratio
    assert V["code"][0] == 2


def test_partner_only_is_cif_for_every_importer():
    """One CIF/FOB factor wherever the exporter's report stands in for the importer's."""
    T = 30
    VX = np.full(T, 100.0)
    for never in (False, True):
        P = panel(np.zeros(T), VX, np.zeros(T, bool), np.ones(T, bool), never_imp=never)
        V = bw.window_values(P, T - 1, 3)
        assert V["code"][0] == 3 and V["value"][0] == pytest.approx(300 * bw.CIF_FOB)
    assert bw.CIF_FOB == bw.bs.CIF_FOB == 1.06   # the annual mirror rule uses the same factor


def test_partner_only_months_of_an_annual_only_importer_are_benchmarked():
    """An importer that files annually but not monthly (UAE, Iran, Iraq): its partner-only months are moved to its
    annual figure where the annual file covers the year."""
    T = 24
    VX = np.r_[np.full(12, 100.0), np.full(12, 120.0)]
    NF = np.zeros((2, T), dtype=bool)
    NF[0] = True                                   # the exporter files every month, the importer none
    P = bw.Panel(months(202201, T), np.array([0]), np.array([1]), np.zeros((1, T)), np.array([VX]), NF,
                 np.array([False, True]))
    bw.benchmark(P, {(2022, 0, 1): 1500.0}, {(2022, 1)})   # the importer's annual file for 2022 only
    bw.composite(P)
    V = bw.window_values(P, 11, 12)
    assert V["value"][0] == pytest.approx(1500.0) and V["code"][0] == 1
    V = bw.window_values(P, 23, 12)                 # 2023: no annual file, partner-only times 1.06
    assert V["value"][0] == pytest.approx(1440 * bw.CIF_FOB) and V["code"][0] == 3


def test_a_filed_reporter_with_no_row_of_the_product_is_not_a_reported_zero():
    """L2 / K5: Japan filed April 2026 but sent no chapter 84 or 85 rows. The month must not be read as zero (which
    would take every flow out of every window holding the month): between two months that hold the product it is
    interpolated (code 4); at the end of the panel it is estimated from the partner (spliced)."""
    T = 30
    NF = np.ones((3, T), dtype=bool)                # all three file every month (an all-goods file)

    def two_flows(gap: int):
        VM = np.array([np.full(T, 110.0), np.full(T, 50.0)])
        VM[:, gap] = 0.0                            # importer 1 sent no row of the product that month
        VX = np.array([np.full(T, 100.0), np.full(T, 45.0)])
        return bw.Panel(months(202401, T), np.array([0, 2]), np.array([1, 1]), VM, VX, NF, np.array([False] * 3))

    P = two_flows(24)
    interp, n_int, n_out = bw.product_filed(P, 3)
    assert n_int == 1 and n_out == 0 and interp[:, 24].all()
    bw.composite(P)
    P.MISS |= interp
    P.C[interp] = 4
    V = bw.window_values(P, 29, 12)
    assert V["pos"].all() and V["value"][0] == pytest.approx(12 * 110) and V["code"][0] == 4
    P = two_flows(T - 1)                            # the last month: nothing after it to interpolate from
    interp, n_int, n_out = bw.product_filed(P, 3)
    assert n_int == 0 and n_out == 1 and not P.FI[0, T - 1]
    bw.composite(P)
    V = bw.window_values(P, T - 1, 12)
    assert V["pos"].all() and V["value"][0] == pytest.approx(12 * 110) and V["code"][0] == 2   # spliced at κ = 1.1
    # a zero the importer did report (it has a row from another partner that month) stays a zero
    VM = np.array([np.full(T, 110.0), np.full(T, 50.0)])
    VM[0, 24] = 0.0
    P2 = bw.Panel(months(202401, T), np.array([0, 2]), np.array([1, 1]), VM, np.array([np.full(T, 100.0), np.full(T, 45.0)]),
                  NF, np.array([False] * 3))
    bw.product_filed(P2, 3)
    bw.composite(P2)
    assert P2.FI[0, 24] and not bw.window_values(P2, 29, 12)["pos"][0]

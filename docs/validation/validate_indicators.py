#!/usr/bin/env python3
"""Independent check of the dashboard indicators (issue #22).

Recomputes M1-M5, X1-X4, A1 and the monthly trend straight from the original
CSVs with pandas, then compares every number with what the running API
returns. It shares no code with the API or the ETL: the rules come from
docs/spec.md and the ADRs, written again here.

Usage:
    python validate_indicators.py --data-dir ../../data --api http://localhost:3001 \
        --out report-output.md

The API must already be running on a database loaded by the ETL. Nothing is
written to the CSVs or to the database.
"""
import argparse
import json
import math
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, timedelta

import pandas as pd

TOL = 1e-9
UNKNOWN_AISLES = {"C", "E", "Z", "G"}  # spec A1: rare aisles, own bucket


# ----------------------------------------------------------------- loading
def load(data_dir):
    def read(name):
        df = pd.read_csv(
            f"{data_dir}/{name}.csv",
            sep=";",
            encoding="utf-8-sig",
            dtype=str,
            keep_default_na=False,
        )
        df.columns = [c.strip() for c in df.columns]
        for c in df.columns:
            df[c] = df[c].str.strip()
        return df

    co = read("Customer_Order")
    pw = read("Picking_Wave")
    prod = read("Product")

    # exact duplicate = identical in all columns to an earlier row (ADR 0003)
    co["dup"] = co.duplicated(keep="first")
    co["qty"] = co["quantity (units)"].astype(int)
    co["valid"] = co["qty"] > 0
    co["created"] = pd.to_datetime(co["creationDate"], format="%d/%m/%Y %H:%M")
    co["day"] = co["created"].dt.date
    co = co.rename(
        columns={
            "codCustomer": "customer",
            "orderNumber": "order",
            "Reference": "reference",
            "waveNumber": "wave",
        }
    )

    pw["qty"] = pw["quantityToPick (units)"].astype(int)
    pw["aisle"] = pw["locations"].str[0].str.upper()
    pw = pw.rename(columns={"waveNumber": "wave"})

    # wave start = earliest valid order line of the wave (spec/#13 decision)
    wave_start = co[co["valid"]].groupby("wave")["created"].min().dt.date
    pw["wave_day"] = pw["wave"].map(wave_start)
    return co, pw, prod


# ----------------------------------------------------------------- filters
def F(**kw):
    base = dict(
        frm=None, to=None, reference=None, customer=None, operator=None,
        aisle=None, abc_class=None, excl=False, basis="lines", a=80, b=95,
    )
    base.update(kw)
    return base


def date_mask(df, daycol, f):
    m = pd.Series(True, index=df.index)
    if f["frm"]:
        m &= df[daycol].map(lambda d: d is not None and d == d and d >= f["frm"])
    if f["to"]:
        m &= df[daycol].map(lambda d: d is not None and d == d and d <= f["to"])
    return m


def base_lines(co, f):
    """Valid lines, duplicates toggle, date range: what ABC is computed on."""
    m = co["valid"].copy()
    if f["excl"]:
        m &= ~co["dup"]
    m &= date_mask(co, "day", f)
    return co[m]


# --------------------------------------------------------------------- ABC
def rank(co, f):
    """Ranking on the date range only (ADR 0002). Integer arithmetic."""
    b = base_lines(co, f)
    g = b.groupby("reference").agg(lines=("qty", "size"), units=("qty", "sum")).reset_index()
    key = "lines" if f["basis"] == "lines" else "units"
    g = g.sort_values([key, "reference"], ascending=[False, True]).reset_index(drop=True)
    total = int(g[key].sum())
    g["rank"] = g.index + 1
    g["cum_before"] = g[key].cumsum() - g[key]
    g["share"] = g[key] * 100.0 / total if total else None
    g["cum_before_pct"] = g["cum_before"] * 100.0 / total if total else None

    def cls(cb):
        if cb * 100 < f["a"] * total:
            return "A"
        if cb * 100 < f["b"] * total:
            return "B"
        return "C"

    g["cls"] = g["cum_before"].map(cls)
    return g


def selected_refs(co, f, rk):
    """References chosen by reference/customer/operator/abcClass (ADR 0002)."""
    refs = set(rk["reference"])
    if f["reference"]:
        refs &= {f["reference"]}
    if f["customer"] or f["operator"]:
        b = base_lines(co, f)
        if f["customer"]:
            b = b[b["customer"] == f["customer"]]
        if f["operator"]:
            b = b[b["operator"] == f["operator"]]
        refs &= set(b["reference"])
    if f["abc_class"]:
        refs &= set(rk[rk["cls"] == f["abc_class"]]["reference"])
    return refs


def order_lines(co, f, rk):
    """Lines the order indicators run on."""
    b = base_lines(co, f)
    if f["reference"]:
        b = b[b["reference"] == f["reference"]]
    if f["customer"]:
        b = b[b["customer"] == f["customer"]]
    if f["operator"]:
        b = b[b["operator"] == f["operator"]]
    if f["abc_class"]:
        b = b[b["reference"].isin(set(rk[rk["cls"] == f["abc_class"]]["reference"]))]
    return b


# -------------------------------------------------------------- indicators
def order_indicators(b, sector_of):
    orders = b["order"].nunique()
    lines = len(b)
    units = int(b["qty"].sum())
    waves = b["wave"].nunique()
    pairs = len(b[["wave", "order"]].drop_duplicates())
    waves_per_order = b.groupby("order")["wave"].nunique()
    split = int((waves_per_order > 1).sum())
    out = dict(orders=orders, lines=lines, units=units, waves=waves, pairs=pairs, split=split)
    out["m2"] = units / orders if orders else None
    out["x1"] = lines / orders if orders else None
    out["m3"] = pairs / waves if waves else None
    out["x2"] = split * 100.0 / orders if orders else None
    sec = b["reference"].map(sector_of)
    if orders:
        per_sector = b.assign(sector=sec).groupby("sector").agg(
            units=("qty", "sum"), lines=("qty", "size"), orders=("order", "nunique")
        )
        out["m4"] = {
            s: dict(units=int(r.units), lines=int(r.lines), orders=int(r.orders),
                    share=r.units * 100.0 / units)
            for s, r in per_sector.iterrows()
        }
        sectors_per_order = b.assign(sector=sec).groupby("order")["sector"].nunique()
        out["multi"] = int((sectors_per_order > 1).sum())
        out["m5"] = out["multi"] * 100.0 / orders
    else:
        out["m4"] = {}
        out["multi"] = 0
        out["m5"] = None
    return out


# ------------------------------------------------------------------- picks
def selected_picks(pw, f, rk):
    m = date_mask(pw, "wave_day", f)
    p = pw[m]
    if f["reference"]:
        p = p[p["reference"] == f["reference"]]
    if f["operator"]:
        p = p[p["operator"] == f["operator"]]
    if f["aisle"]:
        p = p[p["aisle"] == f["aisle"]]
    cls_of = dict(zip(rk["reference"], rk["cls"]))
    p = p.assign(cls=p["reference"].map(cls_of).fillna("unclassified"))
    if f["abc_class"]:
        p = p[p["cls"] == f["abc_class"]]
    return p


# -------------------------------------------------------------------- API
class Api:
    def __init__(self, base):
        self.base = base.rstrip("/")

    def get(self, path, f):
        q = {"basis": f["basis"], "thresholdA": f["a"], "thresholdB": f["b"],
             "excludeDuplicates": "true" if f["excl"] else "false"}
        for k, name in [("frm", "from"), ("to", "to"), ("reference", "reference"),
                        ("customer", "customer"), ("operator", "operator"),
                        ("aisle", "aisle"), ("abc_class", "abcClass")]:
            if f[k]:
                q[name] = str(f[k])
        url = f"{self.base}/{path}?{urllib.parse.urlencode(q)}"
        try:
            with urllib.request.urlopen(url, timeout=120) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            return {"_http_error": e.code, "_body": e.read().decode()[:300]}


# ---------------------------------------------------------------- compare
class Report:
    def __init__(self):
        self.rows = []  # (scenario, indicator, check, expected, actual, ok)

    def check(self, scen, ind, name, exp, act):
        if exp is None or act is None:
            ok = exp is None and act is None
        elif isinstance(exp, str) or isinstance(act, str):
            ok = exp == act
        else:
            ok = math.isclose(float(exp), float(act), rel_tol=TOL, abs_tol=TOL)
        self.rows.append((scen, ind, name, exp, act, ok))
        return ok


def pct_or_none(x):
    return None if x is None else float(x)


def check_orders(rep, s, api, f, co, rk, sector_of):
    exp = order_indicators(order_lines(co, f, rk), sector_of)

    r = api.get("indicators/order-size", f)
    for k, key in [("orders", "orders"), ("lines", "lines"), ("units", "units")]:
        rep.check(s, "M2/X1", k, exp[key], r.get(k))
    rep.check(s, "M2", "m2", exp["m2"], r.get("m2AverageOrderSize"))
    rep.check(s, "X1", "x1", exp["x1"], r.get("x1LinesPerOrder"))

    r = api.get("indicators/wave-split", f)
    rep.check(s, "M3/X2", "orders", exp["orders"], r.get("orders"))
    rep.check(s, "M3/X2", "waves", exp["waves"], r.get("waves"))
    rep.check(s, "M3/X2", "waveOrderPairs", exp["pairs"], r.get("waveOrderPairs"))
    rep.check(s, "M3/X2", "splitOrders", exp["split"], r.get("splitOrders"))
    rep.check(s, "M3", "m3", exp["m3"], r.get("m3AverageOrdersPerWave"))
    rep.check(s, "X2", "x2", exp["x2"], r.get("x2SplitOrdersPercent"))

    r = api.get("indicators/sector", f)
    rep.check(s, "M4/M5", "orders", exp["orders"], r.get("orders"))
    rep.check(s, "M5", "multiSectorOrders", exp["multi"], r.get("multiSectorOrders"))
    rep.check(s, "M5", "m5", exp["m5"], r.get("m5MultiSectorOrdersPercent"))
    api_m4 = {x["sector"]: x for x in r.get("m4SectorShare", [])}
    rep.check(s, "M4", "sectors", ",".join(sorted(exp["m4"])), ",".join(sorted(api_m4)))
    for sec, e in exp["m4"].items():
        a = api_m4.get(sec, {})
        rep.check(s, "M4", f"{sec} units", e["units"], a.get("units"))
        rep.check(s, "M4", f"{sec} share", e["share"], a.get("sharePercent"))


def check_abc(rep, s, api, f, co, rk):
    sel = selected_refs(co, f, rk)
    r = api.get("indicators/abc", f)
    rep.check(s, "M1", "ranked references", len(rk), r.get("ranked", {}).get("references"))
    rep.check(s, "M1", "ranked lines", int(rk["lines"].sum()), r.get("ranked", {}).get("lines"))
    rep.check(s, "M1", "ranked units", int(rk["units"].sum()), r.get("ranked", {}).get("units"))
    api_refs = {x["reference"]: x for x in r.get("references", [])}
    rep.check(s, "M1", "selected set", ",".join(sorted(sel)), ",".join(sorted(api_refs)))
    bad = 0
    for _, row in rk[rk["reference"].isin(sel)].iterrows():
        a = api_refs.get(row["reference"], {})
        ok = (
            a.get("rank") == row["rank"]
            and a.get("abcClass") == row["cls"]
            and a.get("lines") == row["lines"]
            and a.get("units") == row["units"]
            and a.get("sharePercent") is not None
            and math.isclose(a["sharePercent"], row["share"], rel_tol=TOL, abs_tol=TOL)
            and math.isclose(a["cumulativeBeforePercent"], row["cum_before_pct"], rel_tol=TOL, abs_tol=TOL)
        )
        if not ok:
            bad += 1
            rep.check(s, "M1", f"ref {row['reference']}",
                      f"rank {row['rank']} {row['cls']} {row['lines']}/{row['units']}", json.dumps(a)[:160])
    rep.check(s, "M1", "references wrong (rank, class, lines, units, shares)", 0, bad)
    api_cls = {x["abcClass"]: x for x in r.get("classes", [])}
    for c in "ABC":
        sub = rk[rk["reference"].isin(sel) & (rk["cls"] == c)]
        a = api_cls.get(c, {})
        rep.check(s, "M1", f"class {c} references", len(sub), a.get("references"))
        rep.check(s, "M1", f"class {c} lines", int(sub["lines"].sum()), a.get("lines"))
        rep.check(s, "M1", f"class {c} units", int(sub["units"].sum()), a.get("units"))


def check_x4(rep, s, api, f, co, prod, rk):
    sel = selected_refs(co, f, rk) if (f["customer"] or f["operator"] or f["abc_class"]) else None
    r = api.get("indicators/abc-comparison", f)
    cls_of = dict(zip(rk["reference"], rk["cls"]))
    rows = {}
    for _, p in prod.iterrows():
        ref = p["Reference"]
        if f["reference"] and ref != f["reference"]:
            continue
        if f["customer"] or f["operator"]:
            if ref not in sel:  # needs a matching order line
                continue
        c = cls_of.get(ref)
        if f["abc_class"] and c != f["abc_class"]:
            continue
        ab = p["ABCCOD"].upper()
        status = "not-ranked" if c is None else ("match" if c == ab else "mismatch")
        rows[ref] = (c, ab, status)
    matches = sum(1 for v in rows.values() if v[2] == "match")
    mism = sum(1 for v in rows.values() if v[2] == "mismatch")
    nr = sum(1 for v in rows.values() if v[2] == "not-ranked")
    summ = r.get("summary", {})
    rep.check(s, "X4", "products", len(rows), summ.get("products"))
    rep.check(s, "X4", "compared", matches + mism, summ.get("compared"))
    rep.check(s, "X4", "matches", matches, summ.get("matches"))
    rep.check(s, "X4", "mismatches", mism, summ.get("mismatches"))
    rep.check(s, "X4", "notRanked", nr, summ.get("notRanked"))
    rep.check(s, "X4", "matchPercent",
              (matches * 100.0 / (matches + mism)) if matches + mism else None,
              summ.get("matchPercent"))
    api_rows = {x["reference"]: x for x in r.get("references", [])}
    rep.check(s, "X4", "product set", ",".join(sorted(rows)), ",".join(sorted(api_rows)))
    bad = 0
    for ref, (c, ab, st) in rows.items():
        a = api_rows.get(ref, {})
        if (a.get("computedClass"), a.get("abccod"), a.get("status")) != (c, ab, st):
            bad += 1
            rep.check(s, "X4", f"product {ref}", f"{c}/{ab}/{st}",
                      f"{a.get('computedClass')}/{a.get('abccod')}/{a.get('status')}")
    rep.check(s, "X4", "products wrong (class, ABCCOD, status)", 0, bad)


def check_aisle(rep, s, api, f, pw, rk):
    p = selected_picks(pw, f, rk)
    r = api.get("indicators/aisle-picks", f)
    total = len(p)
    rep.check(s, "X3/A1", "total picks", total, r.get("totals", {}).get("picks"))
    rep.check(s, "X3/A1", "total units", int(p["qty"].sum()), r.get("totals", {}).get("units"))
    main = p[~p["aisle"].isin(UNKNOWN_AISLES)]
    api_aisles = {x["aisle"]: x for x in r.get("aisles", [])}
    exp_aisles = sorted(main["aisle"].unique())
    rep.check(s, "X3", "aisle set", ",".join(exp_aisles), ",".join(sorted(api_aisles)))
    for ai in exp_aisles:
        sub = main[main["aisle"] == ai]
        a = api_aisles.get(ai, {})
        rep.check(s, "X3", f"{ai} picks", len(sub), a.get("picks"))
        rep.check(s, "X3", f"{ai} units", int(sub["qty"].sum()), a.get("units"))
        rep.check(s, "A1", f"{ai} share", len(sub) * 100.0 / total, a.get("sharePercent"))
        for c in ["A", "B", "C", "unclassified"]:
            n = int((sub["cls"] == c).sum())
            rep.check(s, "X3", f"{ai} class {c} picks", n, a.get("byClass", {}).get(c, {}).get("picks"))
    unk = p[p["aisle"].isin(UNKNOWN_AISLES)]
    u = r.get("unknownAisles", {})
    rep.check(s, "A1", "unknown bucket picks", len(unk), u.get("picks"))
    rep.check(s, "A1", "unknown bucket share", (len(unk) * 100.0 / total) if total else None, u.get("sharePercent"))
    api_unk = {x["aisle"]: x["picks"] for x in u.get("aisles", [])}
    for ai in sorted(UNKNOWN_AISLES):
        n = int((unk["aisle"] == ai).sum())
        if n or ai in api_unk:
            rep.check(s, "A1", f"unknown aisle {ai} picks", n, api_unk.get(ai))
    api_c = {x["abcClass"]: x for x in r.get("classes", [])}
    for c in ["A", "B", "C", "unclassified"]:
        n = int((p["cls"] == c).sum())
        a = api_c.get(c, {})
        rep.check(s, "X3", f"class {c} picks", n, a.get("picks"))
        rep.check(s, "X3", f"class {c} share", (n * 100.0 / total) if total else None, a.get("sharePercent"))


def month_range(first, last):
    y, m = first.year, first.month
    while (y, m) <= (last.year, last.month):
        yield y, m
        m += 1
        if m == 13:
            y, m = y + 1, 1


def check_monthly(rep, s, api, f, co, rk, sector_of, data_first, data_last):
    b = order_lines(co, f, rk)
    r = api.get("indicators/monthly-trend", f)
    # months are limited to the part of the range that the data covers
    lo = max(f["frm"], data_first) if f["frm"] else data_first
    hi = min(f["to"], data_last) if f["to"] else data_last
    n_months = len(list(month_range(lo, hi))) if lo <= hi else 0
    api_m = {m["month"]: m for m in r.get("months", [])}
    for y, m in (month_range(lo, hi) if lo <= hi else []):
        key = f"{y}-{m:02d}"
        sub = b[(b["created"].dt.year == y) & (b["created"].dt.month == m)]
        e = order_indicators(sub, sector_of)
        a = api_m.get(key, {})
        rep.check(s, "Trend", f"{key} orders", e["orders"], a.get("orders"))
        rep.check(s, "Trend", f"{key} lines", e["lines"], a.get("lines"))
        rep.check(s, "Trend", f"{key} units", e["units"], a.get("units"))
        rep.check(s, "Trend", f"{key} waves", e["waves"], a.get("waves"))
        for ek, ak in [("m2", "m2AverageOrderSize"), ("m3", "m3AverageOrdersPerWave"),
                       ("x1", "x1LinesPerOrder"), ("x2", "x2SplitOrdersPercent")]:
            rep.check(s, "Trend", f"{key} {ek}", e[ek], a.get(ak))
        # partial month: data does not cover the whole calendar month
        first_day = date(y, m, 1)
        nxt = date(y + (m == 12), m % 12 + 1, 1)
        last_day = nxt - timedelta(days=1)
        partial = data_first > first_day or data_last < last_day
        rep.check(s, "Trend", f"{key} partial", str(partial), str(a.get("partial")))
    rep.check(s, "Trend", "month count", n_months, len(api_m))

    # comparison: previous period of equal length immediately before the range
    if f["frm"] and f["to"]:
        days = (f["to"] - f["frm"]).days + 1
        pto = f["frm"] - timedelta(days=1)
        pfrom = pto - timedelta(days=days - 1)
        comp = r.get("comparison", {})
        if pfrom < data_first:
            rep.check(s, "Trend", "comparison status", "no-data", comp.get("status"))
        else:
            fp = dict(f, frm=pfrom, to=pto)
            e = order_indicators(order_lines(co, fp, rk), sector_of)
            if e["orders"] == 0:
                rep.check(s, "Trend", "comparison status", "no-data", comp.get("status"))
            else:
                rep.check(s, "Trend", "comparison status", "ok", comp.get("status"))
                ind = comp.get("indicators") or {}
                for ek, ak in [("m2", "m2AverageOrderSize"), ("m3", "m3AverageOrdersPerWave"),
                               ("x1", "x1LinesPerOrder"), ("x2", "x2SplitOrdersPercent")]:
                    rep.check(s, "Trend", f"comparison {ek}", e[ek], ind.get(ak))


# --------------------------------------------------------------- scenarios
def build_scenarios(co):
    valid = co[co["valid"]]
    top_ref = valid["reference"].value_counts().idxmax()
    low_ref = valid["reference"].value_counts().idxmin()
    top_cust = valid["customer"].value_counts().idxmax()
    ops = sorted(valid["operator"].unique())
    d = date
    return [
        ("S01 full period, lines, duplicates kept", F()),
        ("S02 full period, lines, duplicates excluded", F(excl=True)),
        ("S03 full period, units, duplicates kept", F(basis="units")),
        ("S04 full period, units, duplicates excluded", F(basis="units", excl=True)),
        ("S05 dates 2023-03-01..2023-06-30", F(frm=d(2023, 3, 1), to=d(2023, 6, 30))),
        ("S06 January only (partial month, starts before data)", F(frm=d(2023, 1, 1), to=d(2023, 1, 31))),
        ("S07 dates 2023-06-01..2023-08-31, units, duplicates excluded",
         F(frm=d(2023, 6, 1), to=d(2023, 8, 31), basis="units", excl=True)),
        (f"S08 reference {top_ref} (top product)", F(reference=top_ref)),
        (f"S09 reference {low_ref} (least ordered)", F(reference=low_ref)),
        ("S10 abcClass A, lines", F(abc_class="A")),
        ("S11 abcClass B, lines, dates 2023-02-01..2023-09-30",
         F(abc_class="B", frm=d(2023, 2, 1), to=d(2023, 9, 30))),
        ("S12 abcClass C, units, thresholds 70/90, duplicates excluded",
         F(abc_class="C", basis="units", a=70, b=90, excl=True)),
        ("S13 thresholds 60/90, lines", F(a=60, b=90)),
        (f"S14 customer {top_cust}", F(customer=top_cust)),
        (f"S15 operator {ops[0]}, dates 2023-04-01..2023-09-30",
         F(operator=ops[0], frm=d(2023, 4, 1), to=d(2023, 9, 30))),
        ("S16 aisle I (picks only)", F(aisle="I")),
        ("S17 aisle I + abcClass A + operator " + ops[1], F(aisle="I", abc_class="A", operator=ops[1])),
        (f"S18 customer {top_cust} + operator {ops[2]} + abcClass A",
         F(customer=top_cust, operator=ops[2], abc_class="A")),
        ("S19 empty range 2024-01-01..2024-02-01", F(frm=d(2024, 1, 1), to=d(2024, 2, 1))),
        ("S20 one day 2023-05-10", F(frm=d(2023, 5, 10), to=d(2023, 5, 10))),
    ]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data-dir", required=True)
    ap.add_argument("--api", default="http://localhost:3001")
    ap.add_argument("--out", help="write the markdown report here")
    args = ap.parse_args()

    co, pw, prod = load(args.data_dir)
    sector_of = dict(zip(prod["Reference"], prod["Sector"]))
    api = Api(args.api)
    data_first, data_last = co["day"].min(), co["day"].max()

    # own recount of the facts in docs/data-profile.md, so a loader error shows up
    facts = {
        "Customer_Order rows": (len(co), 122370),
        "quantity 0 rows": (int((~co["valid"]).sum()), 33),
        "exact duplicate rows": (int(co["dup"].sum()), 2559),
        "Picking_Wave rows": (len(pw), 215192),
        "Product rows": (len(prod), 208),
        "Distinct orders (valid)": (co[co["valid"]]["order"].nunique(), 32632),
    }
    rep = Report()
    for k, (got, want) in facts.items():
        rep.check("Data profile", "recount", k, want, got)

    scenarios = build_scenarios(co)
    for name, f in scenarios:
        print(f"running {name}", file=sys.stderr)
        rk = rank(co, f)
        check_orders(rep, name, api, f, co, rk, sector_of)
        check_abc(rep, name, api, f, co, rk)
        check_x4(rep, name, api, f, co, prod, rk)
        check_aisle(rep, name, api, f, pw, rk)
        check_monthly(rep, name, api, f, co, rk, sector_of, data_first, data_last)

    write_report(rep, scenarios, args.out)
    failed = [r for r in rep.rows if not r[5]]
    sys.exit(1 if failed else 0)


def write_report(rep, scenarios, out):
    lines = []
    total = len(rep.rows)
    failed = [r for r in rep.rows if not r[5]]
    lines.append(f"Checks: {total}; passed: {total - len(failed)}; failed: {len(failed)}\n")
    lines.append("| Scenario | Checks | Failed |")
    lines.append("|---|---|---|")
    names = ["Data profile"] + [n for n, _ in scenarios]
    for n in names:
        rows = [r for r in rep.rows if r[0] == n]
        lines.append(f"| {n} | {len(rows)} | {sum(1 for r in rows if not r[5])} |")
    lines.append("")
    inds = sorted({r[1] for r in rep.rows})
    lines.append("| Indicator | Checks | Failed |")
    lines.append("|---|---|---|")
    for i in inds:
        rows = [r for r in rep.rows if r[1] == i]
        lines.append(f"| {i} | {len(rows)} | {sum(1 for r in rows if not r[5])} |")
    if failed:
        lines.append("\nFailures:\n")
        lines.append("| Scenario | Indicator | Check | Expected (CSV script) | API |")
        lines.append("|---|---|---|---|---|")
        for r in failed[:200]:
            lines.append(f"| {r[0]} | {r[1]} | {r[2]} | {str(r[3])[:80]} | {str(r[4])[:80]} |")
        if len(failed) > 200:
            lines.append(f"\n... {len(failed) - 200} more")
    text = "\n".join(lines)
    print(text)
    if out:
        with open(out, "w", encoding="utf-8") as fh:
            fh.write(text + "\n")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
Phase 3.1 — real VRS data ingest (replaces synthetic generation).

Source: P:\\TPG\\Dollar General\\VRS Web\\Data  (Ken's extracts)
  REBATE_VENDOR.csv 122k · REBATE_PROGRAM.csv 39k · REBATE_VENDOR_DEPT.csv 143k
  CALCULATE_RESULT_2024/2025/2026.csv ~851k  + RebateProgramExtact.csv (Source)

Target: local Postgres (docker vrs-postgres) via `psql \\copy` (fast bulk).
Generated UUIDs + in-memory FK maps; orphan rows are skipped + counted, never
crash the load. Earnings normalized positive (value to DG), legacy sign kept.

Mapping decisions are documented inline; genuine unknowns accumulate as Ken
questions in docs/19 (none new required so far — schema relaxed instead).

Usage:  python real_ingest.py <stage>
  stages: ref | vendors | programs | links | depts | calc | all
Run order matters (FKs). `all` does every stage in order.
"""
import csv, io, os, subprocess, sys, uuid, datetime

DATA = r"P:\TPG\Dollar General\VRS Web\Data"
EXTRACT = r"P:\TPG\Dollar General\VRS Web\RebateProgramExtact.csv"
PSQL = ["docker", "exec", "-e", "PGCLIENTENCODING=UTF8", "-i", "vrs-postgres",
        "psql", "-U", "vrs", "-d", "vrs", "-q"]
csv.field_size_limit(10_000_000)

# id maps (built across stages, persisted to /tmp between invocations)
import json, pathlib
STATE = pathlib.Path(os.environ.get("TEMP", "/tmp")) / "vrs_ingest_ids.json"


def load_state():
    return json.loads(STATE.read_text()) if STATE.exists() else {}


def save_state(s):
    STATE.write_text(json.dumps(s))


def psql_c(sql: str):
    subprocess.run(PSQL + ["-c", sql], check=True)


def copy_in(table: str, cols: list[str], rows):
    """Stream rows (list of tuples) into Postgres via \\copy FROM STDIN csv."""
    buf = io.StringIO()
    w = csv.writer(buf, lineterminator="\n")
    n = 0
    for r in rows:
        w.writerow(r)
        n += 1
    if n == 0:
        print(f"  {table}: 0 rows")
        return 0
    qcols = ",".join(f'"{c}"' for c in cols)
    cmd = PSQL + ["-c", f"\\copy \"{table}\" ({qcols}) FROM STDIN WITH (FORMAT csv, NULL '')"]
    p = subprocess.run(cmd, input=buf.getvalue().encode("utf-8"),
                        capture_output=True)
    if p.returncode != 0:
        print(p.stderr.decode("utf-8", "replace")[:3000])
        raise SystemExit(f"COPY {table} failed")
    print(f"  {table}: {n} rows")
    return n


def rd(path):
    return csv.DictReader(open(path, newline="", encoding="utf-8-sig", errors="replace"))


def dt(s):
    s = (s or "").strip()
    if not s:
        return None
    s = s.split(" ")[0] if "/" in s and " " in s else s
    for fmt in ("%m/%d/%Y", "%Y-%m-%d", "%m/%d/%y"):
        try:
            return datetime.datetime.strptime(s, fmt).date().isoformat()
        except ValueError:
            pass
    return None


def num(s):
    s = (s or "").strip()
    try:
        return float(s) if s not in ("", "NULL") else 0.0
    except ValueError:
        return 0.0


NOW = datetime.datetime.utcnow().isoformat()
EPOCH = "1970-01-01"

# ── Known real userids → role (rest default AP_ANALYST; processes → SYSTEM) ──
AP_MANAGERS = {"lscoggin", "areidl"}
PROCESSES = {"finalize", "upload", "queue", "batch-exec", "s5s5_calculate",
             "rebate_owner", "unsale create", "load est", "convert", "system"}


def main():
    stage = sys.argv[1] if len(sys.argv) > 1 else "all"
    st = load_state()

    if stage in ("ref", "all"):
        print("STAGE ref — RebateType / ProgramType / User")
        rtypes, ptypes, uids = set(), set(), set()
        for row in rd(os.path.join(DATA, "REBATE_PROGRAM.csv")):
            rtypes.add((row["rebate_type"] or "").strip() or "UNSPEC")
            ptypes.add((row["rebate_category_type"] or "").strip() or "UNSPEC")
            for k in ("userid_created", "userid_updated"):
                u = (row.get(k) or "").strip()
                if u:
                    uids.add(u)
        for row in rd(os.path.join(DATA, "REBATE_VENDOR.csv")):
            for k in ("userid_created", "userid_updated"):
                u = (row.get(k) or "").strip()
                if u:
                    uids.add(u)
        psql_c('TRUNCATE "CalculateResultAdjustment","BatchItem","Batch",'
               '"CalculateResult","RebateVendorDept","RebateVendor","RebateTier",'
               '"RebateProgram","Agreement","Invoice","Check","Deduction",'
               '"AnalyticsSummary","Notification","ReportJob","VendorPortalUser",'
               '"AcctControlMaster","Vendor","RebateType","ProgramType","User" '
               'RESTART IDENTITY CASCADE;')
        copy_in("RebateType", ["code", "description", "usedByMdse", "active"],
                ([c, c, True, True] for c in sorted(rtypes)))
        pt_id = {}
        pt_rows = []
        for c in sorted(ptypes):
            i = str(uuid.uuid4()); pt_id[c] = i
            pt_rows.append([i, c, c, True])
        copy_in("ProgramType", ["id", "code", "name", "active"], pt_rows)
        u_id, u_rows = {}, []
        for u in sorted(uids):
            i = str(uuid.uuid4()); u_id[u] = i
            lu = u.lower()
            role = ("AP_MANAGER" if lu in AP_MANAGERS else
                    "READ_ONLY" if lu in PROCESSES else "AP_ANALYST")
            u_rows.append([i, f"{u}@dollargeneral.com", u, u[:18], role,
                           True, NOW, NOW])
        copy_in("User", ["id", "email", "name", "analystCode", "role",
                          "active", "createdAt", "updatedAt"], u_rows)
        st["pt"] = pt_id; st["u"] = u_id
        st["rt"] = sorted(rtypes)
        save_state(st)

    if stage in ("vendors", "all"):
        print("STAGE vendors")
        seen, rows, vmap = set(), [], {}
        for row in rd(os.path.join(DATA, "REBATE_VENDOR.csv")):
            vn = (row["vendor_num"] or "").strip()
            if not vn or vn in seen:
                continue
            seen.add(vn)
            i = str(uuid.uuid4()); vmap[vn] = i
            ip = (row.get("ip_vendor_num") or "").strip()
            rows.append([i, int(vn) if vn.isdigit() else abs(hash(vn)) % 10**9,
                         vn[:9].zfill(9),
                         int(ip) if ip.isdigit() else "",
                         (row["vendor_name"] or vn).strip()[:120], True, NOW, NOW])
        copy_in("Vendor", ["id", "vendorNumber", "apNumber", "ipNumber",
                            "name", "active", "createdAt", "updatedAt"], rows)
        st["v"] = vmap; save_state(st)

    if stage in ("programs", "all"):
        print("STAGE programs")
        src = {}
        for row in rd(EXTRACT):
            rid = (row.get("Rebate ID") or "").strip()
            s = (row.get("Source") or "").strip().lower()
            if rid and s and rid not in src:
                src[rid] = ("R" if "receipt" in s else "S" if "sales" in s else
                            "D" if "drop" in s else "C" if "discount" in s else
                            "T" if "transfer" in s else "N" if "no source" in s
                            else "")
        pt, uu = st["pt"], st["u"]
        pmap, rows = {}, []
        for row in rd(os.path.join(DATA, "REBATE_PROGRAM.csv")):
            rid = (row["rebate_id"] or "").strip()
            if not rid or rid in pmap:
                continue
            i = str(uuid.uuid4()); pmap[rid] = i
            an = (row.get("userid_created") or "").strip()
            rows.append([
                i, int(rid) if rid.isdigit() else abs(hash(rid)) % 10**9,
                (row.get("description") or rid).strip()[:200],
                (row["rebate_type"] or "").strip() or "UNSPEC",
                pt.get((row["rebate_category_type"] or "").strip() or "UNSPEC"),
                src.get(rid) or "",
                uu.get(an) or next(iter(uu.values())),
                dt(row.get("rebate_beg_date")) or EPOCH,
                dt(row.get("rebate_end_date")) or EPOCH,
                dt(row.get("extract_beg_date")) or "",
                dt(row.get("extract_end_date")) or "",
                False if (row.get("delete_flag") or "").strip() else True,
                NOW, NOW,
            ])
        copy_in("RebateProgram", ["id", "programNumber", "description",
                "rebateTypeCode", "programTypeId", "source", "analystId",
                "startDate", "endDate", "extractBeginDate", "extractEndDate",
                "active", "createdAt", "updatedAt"], rows)
        st["p"] = pmap; save_state(st)

    if stage in ("links", "all"):
        print("STAGE links — RebateVendor")
        pmap, vmap = st["p"], st["v"]
        seen, rows, rvmap, orph = set(), [], {}, 0
        for row in rd(os.path.join(DATA, "REBATE_VENDOR.csv")):
            rid = (row["rebate_id"] or "").strip()
            vn = (row["vendor_num"] or "").strip()
            key = rid + "|" + vn
            if key in seen:
                continue
            if rid not in pmap or vn not in vmap:
                orph += 1; continue
            seen.add(key)
            i = str(uuid.uuid4()); rvmap[key] = i
            rows.append([i, pmap[rid], vmap[vn], True, NOW, NOW])
        copy_in("RebateVendor", ["id", "rebateProgramId", "vendorId",
                "active", "createdAt", "updatedAt"], rows)
        print(f"  orphans skipped: {orph}")
        st["rv"] = rvmap; save_state(st)

    if stage in ("depts", "all"):
        print("STAGE depts — RebateVendorDept")
        rvmap = st["rv"]
        seen, rvdmap, orph = set(), {}, 0

        def gen():
            nonlocal orph
            for row in rd(os.path.join(DATA, "REBATE_VENDOR_DEPT.csv")):
                rid = (row["rebate_id"] or "").strip()
                vn = (row["vendor_num"] or "").strip()
                dnum = (row["dept_num"] or "").strip()
                cls = (row["class_num"] or "").strip()
                rvk = rid + "|" + vn
                if rvk not in rvmap:
                    orph += 1; continue
                # preserve real dept+class granularity in a composite code
                dcode = f"{dnum}.{cls}"
                uniq = rvk + "|" + dcode
                if uniq in seen:
                    continue
                seen.add(uniq)
                i = str(uuid.uuid4()); rvdmap[uniq] = i
                ip = (row.get("ip_vendor_num") or "").strip()
                yield [i, rvmap[rvk], dcode, f"Dept {dnum}", cls or "-1",
                       int(ip) if ip.isdigit() else "",
                       (row.get("active") or "").strip() != "N", NOW, NOW]
        copy_in("RebateVendorDept", ["id", "rebateVendorId", "departmentCode",
                "departmentName", "classCode", "ipVendorNum", "active",
                "createdAt", "updatedAt"], gen())
        print(f"  orphans skipped: {orph}")
        st["rvd"] = rvdmap; save_state(st)

    if stage in ("calc", "all"):
        print("STAGE calc — CalculateResult (streamed, 3 FYs)")
        rvdmap = st["rvd"]
        total, orph = 0, 0
        seen_cr: set[str] = set()  # (rvd|period|year) — unique constraint guard
        for yr in ("2024", "2025", "2026"):
            fn = os.path.join(DATA, f"CALCULATE_RESULT_{yr}.csv")
            if not os.path.exists(fn):
                continue

            def gen():
                nonlocal orph
                for row in rd(fn):
                    rid = (row["rebate_id"] or "").strip()
                    vn = (row["vendor_num"] or "").strip()
                    dnum = (row["dept_num"] or "").strip()
                    cls = (row["class_num"] or "").strip()
                    key = f"{rid}|{vn}|{dnum}.{cls}"
                    rvd = rvdmap.get(key)
                    if not rvd:
                        orph += 1; continue
                    crk = f"{rvd}|{row['period']}|{row['year']}"
                    if crk in seen_cr:
                        orph += 1; continue
                    seen_cr.add(crk)
                    raw = num(row.get("cur_earned"))
                    pmu, mar = num(row["curr_pmu"]), num(row["curr_mar"])
                    adv, oth = num(row["curr_adv"]), num(row["curr_oth"])
                    tot = num(row.get("curr_period_tot"))
                    st_ = ("FINALIZED" if (row.get("sent") or row.get("batched")) == "Y"
                           else "APPROVED" if row.get("approved") == "Y"
                           else "REVIEWED" if row.get("reviewed") == "Y"
                           else "OPEN")
                    yield [str(uuid.uuid4()), rvd,
                           int(row["period"] or 0), int(row["year"] or 0),
                           -pmu, -mar, -adv, -oth, -tot, 0, -raw, raw,
                           st_, NOW, NOW]
            n = copy_in("CalculateResult", ["id", "rebateVendorDeptId",
                "fiscalPeriod", "fiscalYear", "pmuEarnings", "marginEarnings",
                "advcoopEarnings", "otherCoopEarnings", "totalEarnings",
                "adjustmentAmount", "finalEarnings", "finalEarningsLegacy",
                "status", "createdAt", "updatedAt"], gen())
            total += n
        print(f"  CalculateResult total: {total}  orphans skipped: {orph}")

    print("done.")


if __name__ == "__main__":
    main()

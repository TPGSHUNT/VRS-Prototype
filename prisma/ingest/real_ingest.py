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
UNAPPROVED = r"P:\TPG\Dollar General\VRS Web\UnapprovedExtract.csv"
MERCH = {"ADVCOOP","BOPIS","CLPSTP","COMMISSN","COMMTG","COTRKT","CPRPR",
 "CSTINCAF","DGMEDIAN","DGRACING","DMGDC","ENDCAP","EXCLUSIV","FIXTURES",
 "FREIGHT","FRONTEND","LABRFUND","MILKICE","MKTSTORE","MRKDWNC","MRKDWNNC",
 "NEWITEM","NSA","OTHER","PLCALLOW","POSTAUDT","PREPAID","PRIVBRND","RECALL",
 "S5S5","SCAN","SCNBK","SIDEWING","SUPCHAIN","TPR","VOLCOKE","VOLGRWTH",
 "VOLPEPSI","VOLUME"}


def agmt_status(s: str) -> str:
    s = (s or "").lower()
    if "reject" in s: return "REJECTED"
    if "pending ap" in s: return "PENDING_AP_APPROVAL"
    if "pending dmm" in s: return "PENDING_DMM_APPROVAL"
    if "pending gmm" in s: return "PENDING_GMM_APPROVAL"
    if "assign" in s: return "ASSIGNED"
    if "expire" in s: return "EXPIRED"
    if "cancel" in s: return "CANCELLED"
    return "PRE_NEGOTIATION"


import re
usedEmails: set[str] = set()
usedCodes: set[str] = set()


def slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", ".", (s or "").strip().lower()).strip(".")


def mkEmail(local: str) -> str:
    e = f"{local or 'x'}@dollargeneral.com"
    n = 1
    while e in usedEmails:
        e = f"{local}{n}@dollargeneral.com"
        n += 1
    usedEmails.add(e)
    return e


def mkCode(seed: str) -> str:
    base = re.sub(r"[^A-Za-z]", "", seed or "").upper()
    c = base[:3] or "XX"
    n = 1
    while c in usedCodes:
        c = (base[:2] or "X") + str(n)
        n += 1
    usedCodes.add(c)
    return c


def q(sql: str):
    out = subprocess.run(PSQL + ["-t", "-A", "-F", "\t", "-c", sql],
                         capture_output=True, text=True, check=True).stdout
    return [ln.split("\t") for ln in out.splitlines() if ln.strip()]
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

    if stage in ("agreements", "all"):
        # Real agreements from UnapprovedExtract (~250 rows, the only real
        # agreement source). Creates real Buyer/DMM/SVP Users so MDSE seat-
        # scoping + contract value have a real basis. SVP → GMM slot (prototype
        # enum has no SVP; SVP is the real above-DMM escalation).
        print("STAGE agreements — UnapprovedExtract")
        for em, cd in q('SELECT email, COALESCE("analystCode",\'\') FROM "User"'):
            usedEmails.add(em)
            if cd:
                usedCodes.add(cd)
        vid = {nm.strip().upper(): i for i, nm in
               q('SELECT id, name FROM "Vendor"')}
        unspec = q("SELECT id FROM \"ProgramType\" WHERE code='UNSPEC'")
        pt_unspec = unspec[0][0] if unspec else q('SELECT id FROM "ProgramType" LIMIT 1')[0][0]

        people: dict[str, tuple[str, str]] = {}  # name -> (id, role)

        def person(name: str, role: str):
            name = (name or "").strip()
            if not name or name.lower() == "kbanks":
                return None
            if name not in people:
                i = str(uuid.uuid4())
                people[name] = (i, role)
            return people[name][0]

        agr = []
        skip = 0
        for row in rd(UNAPPROVED):
            vn = (row.get("Vendor Name") or "").strip().upper()
            v = vid.get(vn)
            if not v:
                skip += 1
                continue
            b = person(row.get("Buyer"), "BUYER")
            d = person(row.get("DMM"), "DMM")
            s = person(row.get("SVP"), "GMM")
            if not b:
                skip += 1
                continue
            aid = (row.get("Agmt ID") or "").strip()
            mt = (row.get("Merch Type") or "").strip().upper()
            agr.append([
                str(uuid.uuid4()),
                int(aid) if aid.isdigit() else abs(hash(aid)) % 10**9,
                v, mt if mt in MERCH else "OTHER", "",
                f"{row.get('Category') or mt} — {row.get('Vendor Name')}"[:200],
                b, pt_unspec, num(row.get("Forecast")),
                dt(row.get("Begin Date")) or EPOCH,
                dt(row.get("End Date")) or EPOCH,
                agmt_status(row.get("Status")),
                d or "", s or "", NOW, NOW,
            ])
        # create the real MDSE Users
        urows = []
        for nm, (i, role) in people.items():
            urows.append([i, mkEmail(slug(nm)), nm, mkCode(nm), role,
                          True, NOW, NOW])
        copy_in("User", ["id", "email", "name", "analystCode", "role",
                          "active", "createdAt", "updatedAt"], urows)
        copy_in("Agreement", ["id", "agmtId", "vendorId", "merchType",
                "source", "description", "buyerId", "programTypeId",
                "estimatedValue", "startDate", "endDate", "status",
                "dmmApprovedBy", "gmmApprovedBy", "createdAt", "updatedAt"], agr)
        print(f"  agreements: {len(agr)}  users: {len(urows)}  skipped(no vendor match): {skip}")

    if stage in ("periods", "all"):
        # Real period calendar (K12). Derived from CalculateResult: every dated
        # (year,period) in the real extract is 100% finalized → closed; the
        # year=0/period=0 VRS "current period" sentinel is the only open one.
        # 4-5-4 dates synthesized per FY (real per-period dates not in extract;
        # not surfaced by health, which keys off isClosed + year/period).
        print("STAGE periods — real FiscalPeriod from CalculateResult")
        out = subprocess.run(
            PSQL + ["-t", "-A", "-F", ",", "-c",
                    'SELECT DISTINCT "fiscalYear","fiscalPeriod" '
                    'FROM "CalculateResult" ORDER BY 1,2'],
            capture_output=True, text=True, check=True).stdout
        pw = [4, 5, 4, 4, 5, 4, 4, 5, 4, 4, 5, 4]

        def fp_rows():
            import datetime as _dt
            for line in out.splitlines():
                line = line.strip()
                if not line:
                    continue
                y, p = (int(x) for x in line.split(","))
                if y == 0:  # current-period sentinel → the one open period
                    yield [str(uuid.uuid4()), p, y, "2026-03-01",
                           "2026-03-28", False, "", ""]
                    continue
                cur = _dt.date(y, 2, 1)
                for i in range(1, p):
                    cur += _dt.timedelta(weeks=pw[(i - 1) % 12])
                end = cur + _dt.timedelta(weeks=pw[(p - 1) % 12]) - _dt.timedelta(days=1)
                yield [str(uuid.uuid4()), p, y, cur.isoformat(),
                       end.isoformat(), True, end.isoformat(), "Finalize"]
        psql_c('TRUNCATE "FiscalPeriod" RESTART IDENTITY CASCADE;')
        copy_in("FiscalPeriod", ["id", "fiscalPeriod", "fiscalYear",
                "periodStart", "periodEnd", "isClosed", "closedAt",
                "closedBy"], fp_rows())

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

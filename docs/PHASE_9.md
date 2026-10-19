# Phase 9 — Hardening and Deployment

Built 2026-10-19. This phase makes the ERP ready to run a real crushing season:
- a full season of demo data, and the database indexes that season needs, measured before and after
- a health check, the guest endpoints audited, go-live security settings
- the production setup guide with backups and a restore drill
- manuals for every role, in the app
- signed Android release builds

## A full season of demo data — 2025-26

`bench --site sugarcane.local sc-season-demo` builds a complete, **closed** crushing season, 1 Nov 2025 – 20 Mar 2026, behind the live 2026-27 demo.

- **How:**
  - every document goes through the same code as the screens, as the demo users
  - one crushing day is committed at a time; it can be stopped and run again (`--until 2025-12-31` stops after that day)
  - `--reset` removes it
- **The season:**
  - **Surveys and indents:** the 2026-27 demo fields re-surveyed for 2025-26 (yield ±12 %); indent ranges and rules a year earlier; indents generated for the whole season and authorised.
  - **Every crushing day:**
    - gate tokens on that day's indents, following a season curve (two weeks' ramp-up, the peak in Dec–Jan, a tail in March)
    - gross and tare on the weighbridge, CPRs, the bilties mostly paid the next morning
    - the day closed with its purchase invoice
    - lab samples every 6 hours, 0–2 stoppages, the DMR approved and production posted
  - **Every Monday:** a bank payment scroll (cheque for growers without an IBAN).
  - **Every month:** road cess deposited; molasses sold to the distillery; bagasse burnt in the boilers.
  - **Every Saturday:** most of the week's sugar sold to the dealers (Delivery Note + GST invoice).
  - **At the end:** the season is marked *Closed*.
- **Messages** are off while it runs, so no 2025 SMS are logged.

**Result:**
- **Cane:** 140 crushing days; **4,542 CPRs, 1,222,832 maund** (about 48,900 t)
- **Production:** 140 approved DMRs, **99,305 bags**
- **Payments:** 46 payment scrolls
- **Sales:** 101 sales invoices
- **Season status:** Closed
- **Run time:** about 1 h 20 min (0.4 s a load, plus the day close, DMR and production per day)

## Performance — indexes

Frappe indexes only `name` and `creation`. Every screen that filters by season, crushing day, grower, circle, status or a linked document read the whole table.

`sugarcane/setup/indexes.py` adds **74 indexes** on 26 tables, on every migrate (idempotent):
- CPR: season + date, date, grower, circle, payment status, token, indent, day close, scroll, depot, cess deposit
- tokens, weighments, bilties
- indents, batches, surveys, growers (CNIC, mobile)
- loans and their entries, depot dispatches, LP registrations
- the weighment reading log, lab samples, stoppages, DMRs
- the message log, gate passes, sales weighments, generated documents

**Benchmark.** `bench --site … execute sugarcane.setup.benchmark.run`: median of 3 runs, milliseconds, on the site with both seasons (4,657 CPRs, 8,337 journals, 54,002 GL entries).

| Screen / report | Before | After |
|---|---:|---:|
| MIS wall snapshot (peak day) | 24.2 | 19.7 |
| Procurement insights (peak day) | 13.7 | 7.3 |
| Yard board | 5.2 | 2.5 |
| Cane accounts dashboard | 130.7 | 125.4 |
| Unpaid CPRs (scroll builder) | 2.1 | 0.9 |
| Circle performance (season) | 26.3 | 21.4 |
| Keyword reply BAL (top grower) | 3.2 | 0.3 |
| Sales dashboard | 5.2 | 2.6 |
| Finance dashboard | 58.3 | 62.9 |
| Report: CPR Register (season) | 38.8 | 37.4 |
| Report: Season Progress | 16.5 | 13.1 |
| Report: Grower Supply Ranking | 16.4 | 27.3 |
| Report: Grower Payable Aging | 3.8 | 2.8 |
| Report: Grower Ledger (top grower) | 6.2 | 6.7 |
| Report: Cane Day Close (peak day) | 112.0 | 139.2 |

**What the numbers say.**
- **Already fast without indexes.** At this volume every screen answers in 0.3–140 ms. Full-table scans of 4,600 CPRs cost little.
- **Clear gains:** the daily gate and yard screens and the keyword reply roughly halve or better (0.3–7 ms after).
- **No change:** the accounts dashboard, finance dashboard and day-close report. They are bound by ERPNext's own balance queries on the GL, which ERPNext already indexes.
- **Where the indexes matter:** a real mill is 30–40 times this demo's peak. There, unindexed season and day filters would scan hundreds of thousands of rows.

## Health check and monitoring

`GET /api/method/sugarcane.api.v1.health.status`:
- **For anyone:** only `{"ok": true}`, for an uptime monitor.
- **For a System Manager / Cane Admin:** every check with its detail:
  - database, Redis
  - scheduler (a job in the last 15 minutes)
  - job-queue depth
  - **the last backup under 26 h old**
  - disk free, errors in 24 h
  - **every real weighbridge agent reporting**
  - past crushing days closed
  - no message stuck in the queue
- `deploy/healthcheck.sh` wraps it for cron and alerts.
- On this development machine it warns that the scheduler and workers are off, as they are by design.

## Security

- **Guest endpoints audited.** A test lists every endpoint open without sign-in. Each one must be known, and each that takes input must be rate-limited:

  | Endpoint | Why it may be open |
  |---|---|
  | app boot, shell boot | who is signed in (nothing for a guest) |
  | field-app login | password + device; already rate-limited (10 a minute) |
  | SMS inbound | shared token, constant-time compare; **now rate-limited** (300 a minute) |
  | biometric punch | shared token; **now rate-limited** (600 a minute) |
  | health status | ok / not ok only for a guest; rate-limited (60 a minute) |

- **Go-live settings** (`bench --site … execute sugarcane.setup.hardening.apply`; `…report` shows the state):
  - password policy score 3
  - 5 wrong passwords → 15 minutes locked
  - 12-hour sessions; no login by email link
  - **two-factor sign-in** (authenticator app) for System Manager, Cane Admin, Cane Manager, Accounts Manager, Cane Accountant and HR Manager

  It refuses to run on a site with demo data, so it was not applied here. `report` on the demo site lists what production must change: score 2→3, attempts 10→5, session 170 h→12 h, two-factor on, email-link login off, `developer_mode` and `allow_tests` off.

## Deployment (`docs/DEPLOYMENT.md`, `deploy/`)

For the mill's IT team:
1. **Server and install:** sizing for the season peak (8 vCPU / 32 GB / 500 GB SSD) and why the server sits at the mill. Ubuntu packages, MariaDB settings, bench / apps / site install, the React build, and keeping the **encryption key** with the backups.
2. **Production setup:** `bench setup production` (Nginx + Supervisor), Socket.IO, **Let's Encrypt SSL**, worker counts, the firewall (only 80 / 443, SSH from the office), and the weighbridge IP check behind Nginx.
3. **Scheduler:** what the scheduled jobs do.
4. **Backups:**
   - `deploy/backup.sh` nightly, with files; 14 days on the server and an **off-site copy with rclone**
   - `deploy/restore-drill.sh` monthly: restores the newest backup into a throw-away site, compares CPR / GL / grower counts, drops it
   - how to restore for real
5. **Monitoring:** the health check and the crontab.
6. **Weighbridge PCs:** `deploy/sugarcane-wb-agent@.service`, one systemd service per indicator, restarted on failure, its own API user and IP.
7. **Android:** release builds, the keystore, distribution, approving phones.
8. **Updates:** backup, maintenance mode, migrate, tests on a staging copy.
9. **Gateways:** SMS, WhatsApp, biometric clocks, email, bank files.
10. **The go-live checklist.**

## User manuals (Help)

16 manuals in `sugarcane/manuals/*.md`, shown on the **Help** page (`/sugar/help`, Desktop tile *Help*):
- Each person sees the manuals for their roles, marked *yours*. Managers see all.
- The page prints.
- Manuals:
  - Getting started
  - **Field:** Surveyor (EagleEye app), Circle officer
  - **Cane intake:** Indent clerk, Loading point operator and ELP auditor, Token clerk, Weighman and yard supervisor, Cane cashier, Depot user
  - **Plant:** Lab chemist and production manager
  - **Accounts:** Cane accountant
  - **ERPNext office:** Store keeper and purchase, Sales officer, Accounts manager, HR officer
  - Cane manager / admin / management

## Android release builds

- **Signing:** both apps are signed with **MicroMax's own release key** (`CN=MicroMax Sugar Mills, O=MicroMax Sugar Mills Ltd`, RSA 4096, valid 27 years).
  - The keystore is at `~/.micromax-keys/micromax-release.jks`, with its passwords in `~/.gradle/gradle.properties`. Both are outside the repository.
  - Without them, a build falls back to the debug key.
- **APKs:** `MicroMax-EagleEye-1.0.0.apk` (2.8 MB) and `MicroMax-ELP-1.0.0.apk` (2.4 MB). They are minified, and `apksigner` verified the signature.
- **Default server:** the development address. Build with `-PsugarServer=https://<production domain>` once the domain exists. Users can also change it on the sign-in screen.

## Tested

- **4 new tests** (`tests/test_hardening.py`):
  - indexes in place and idempotent
  - every guest endpoint known and the input ones rate-limited
  - the health check: guest sees only `ok`, an administrator sees every check
  - manuals by role: a weighman sees theirs but not the accountant's; path tricks refused
- **Full suite: 153 green** (107 integration + 40 unit + 6 costing-calculation).

## Open points (need your input)

1. **Production server:** hosting at the mill or a data centre, the domain name, and who holds the root and Administrator passwords.
2. **Off-site backup target:** S3 / Backblaze / Google Drive / the head office over SFTP. Keep at least one copy outside the mill.
3. **The Android release key:** two copies of `micromax-release.jks` and its password off this machine (a safe, the head office). Losing it means the apps can never be updated in place.
4. **Data migration:** growers, passbooks, bank accounts, opening grower balances and loans, the chart of accounts opening. Send the current system's exports.
5. **Training plan:** who trains whom, per role, before the season.
6. **Real load:** a mill at 12,000 TCD takes ~1,500 loads a day, 30–40 times this demo's peak. The indexes cover the daily screens. A load test at that volume on the production server is recommended before the first season.

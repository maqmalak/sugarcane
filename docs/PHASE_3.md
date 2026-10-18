# Phase 3 — Gate, Weighbridge, CPR and TPT Bilty

Built 2026-10-18. The path from the gate to the ledgers:

**Token → Gross → Yard → Tare → CPR (+ Journal Entry) → TPT Bilty → cash counter → Daily Cane Purchase invoice**

## The flow

| Step | Screen (React `/sugar/procurement/…`) | Who | What happens |
|---|---|---|---|
| 1. Gate token | **Gate · token issue** (`/gate`) | Token Clerk | The clerk scans the grower's **indent** or the **ELP slip**, or types the vehicle no. The screen shows the grower, the indent's validity, the ELP status, problems that block the token, and the **rates that will be copied to the token**. Issuing prints the token (A6, barcode); the indent becomes *Used*. |
| 2. Gross | **Weighbridge** (`/weighbridge`) | Gross Weighman | The PC is recognised by its IP as a Weighbridge Terminal. The live weight comes from the indicator agent; the token is scanned, and **Take Gross** stores the latest *stable, fresh* reading. |
| 3. Yard | **Yard board** (`/yard`) | Yard Supervisor | Vehicles waiting for gross and waiting for tare, by lane, with time inside. Over *max yard hours* → red, and a home alert. |
| 4. Tare → CPR | Weighbridge | Tare Weighman | **Take Tare** submits the weighment. The **CPR** is created and submitted at once, with its **Journal Entry**, and a **TPT Bilty** when TPT > 0. The CPR slip prints (A4, barcode). |
| 5. Cash counter | **TPT cash counter** (`/counter`) | Cane Cashier | Scan the bilty, CPR, vehicle no. or driver CNIC. **Pay** posts *Dr TPT-Bilty Payable / Cr Cash Counter - Cane* and prints the bilty slip. A Cane Admin can reverse a payment, giving a reason. |
| 6. Day close | **Day close** (`/day-close`) | Cane Accountant | One **Purchase Invoice** per crushing day (07:00 → 07:00), `update_stock`, credit **Cane Purchase Clearing**. The day's CPR journal rows are then **reconciled** against it, so clearing returns to 0. The control-account checks are shown on top. |
| — | **Intake dashboard** (`/procurement`) | everyone in procurement | The crushing day's intake: by hour, ELP vs gate, daily trend, by circle and by source, latest CPRs, season progress. |

## Rules

**Rates are copied when the token is issued.** The most specific level wins: Vehicle Type (binding / garbage) → Loading Point → Source (road cess, TPT row for the vehicle type) → Circle (subsidy) → Season.
- A 0 on a circle, source or vehicle type means "not set", so the season value applies.
- A TPT row for a vehicle type is explicit, so a 0 there is a real 0.
- Where each rate came from is stored on the token and the CPR (`rate_levels`).

**ELP and TPT.** Sugar Settings → *Loading-point TPT only for ELP-verified loads* is on by default.
- A load the audit team accepted gets its **loading point's source** rates. The entry type is *ELP Verified*.
- Any other load (no ELP, still in transit, waiting for the audit, or rejected) is paid at the **mill gate's** rates (the *Factory Gate* source). The entry type is *Gate*.
- A load that was registered at an LP but is not verified needs the clerk's **reason** before it can be taken at gate rates.

**Gate checks:**
- The indent must be authorized and not used. A gate-entry indent must also be valid on the crushing day.
- One token per indent and per ELP load.
- No second open token for the same vehicle. Numbers are compared ignoring spaces and hyphens.
- Blacklisted vehicles are refused.
- If the load was registered at an LP, the vehicle must match the one registered there.

**Weighbridge.** Weights are never typed in by the weighman:
- The terminal must be registered for the request's IP. If the terminal names an API user, it must also be that user.
- It must be allowed to take that weight (Gross / Tare / Gross and Tare / All).
- The reading must be stable, newer than *weight_fresh_seconds* (10 s), and above *min_weight_kg* (200).
- The weight must be inside the vehicle type's limits.
- Tare must be less than gross.
- A **Cane Admin** may type a weight (for example, indicator offline) or accept an out-of-limit weight, but only **with a note**. The weighment is flagged *typed in*, and the note shows in the Weighment Register.
- Every weight used is written to the insert-only **Weighment Reading Log**: terminal, IP, user, raw frame and time.

**CPR.** Every amount is recomputed from the weights and the token's rates using `calc/cpr.py` (the approved formula, unit-tested), so nothing typed in survives.

Journal Entry, posted on the crushing day:

| Side | Account | Amount | Party |
|---|---|---|---|
| Dr | Cane Purchase Clearing | govt value | Supplier "Daily Cane Purchase" |
| Dr | Subsidy Purchase | subsidy | |
| Dr | Additional Subsidy | additional subsidy | |
| Dr | Road Cess – Mill Share | mill's share of cess | |
| Cr | Road Cess Payable – Govt | total cess | |
| Cr | TPT-Bilty Payable | TPT | |
| Cr | Grower Payable | payable | Grower |

Cancelling a CPR is for a **Cane Admin** only. It is refused when the CPR is paid, when its bilty is paid, or when its day is already invoiced. Otherwise it cancels the bilty and the journal. A CPR can then be amended.

**Day close.** One invoice line holds the day's payable kg at Σ govt value ÷ kg. The rate is stored to 9 decimals: a property setter on *Purchase Invoice Item* rate, so the line equals Σ govt value to the paisa. The invoice's rounded total is off.
- A day can't be closed before 07:00 the next morning, except by a Cane Admin ("Close early").
- Cancelling the Daily Cane Purchase unlinks the reconciliation and cancels the invoice.

**Control checks** (Day close page, *Cane Day Close* report, and a test):

| Account | Should equal |
|---|---|
| Clearing | 0 once every day is closed |
| TPT-Bilty Payable | unpaid bilties |
| Road Cess Payable | cess on CPRs not yet deposited |
| Grower Payable | unpaid CPRs |

## Where things are

| Area | Items |
|---|---|
| DocTypes — Cane Procurement | Cane Token · Cane Purchase Receipt · TPT Bilty · Daily Cane Purchase (+ Item) |
| DocTypes — Weighbridge | Cane Weighment · Weighment Reading Log (insert-only) · Weighbridge Terminal (Phase 0) |
| Code | `cane_procurement/procurement.py` (all rules) · `printing.py` + `templates/procurement/slip.html` · `api/v1/procurement.py` · `calc/rates.py` (vehicle-type level added) |
| Settings | Sugar Settings → *Gate, Weighbridge and CPR*: TPT only for ELP-verified loads, reading freshness, lowest weight, yard alert hours, close the day automatically |
| Indicator agent | `weighbridge/agent/wb_agent.py` runs on the weighbridge PC. It reads the indicator's serial output (or `--simulate`) and posts readings with the terminal's API key. On a *Simulator* terminal the weighbridge screen has "Put the vehicle on" / "Empty bridge" buttons instead. |
| Reports (Report Centre → *Procurement*, desk workspace *Cane Procurement*) | CPR Register · Daily Cane Purchase Summary · Circle Wise Cane Purchase · Source Wise Cane Purchase · TPT Bilty Register · Cane Day Close · Token Register · Weighment Register |
| Desk | Workspace, sidebar and desktop icon *Cane Procurement*; print actions on the token, CPR and bilty forms in React |
| Home | Tile "maund bought today"; alerts *Vehicles in the yard over 12 h* and *Crushing days not closed*; CPRs and day closes in the activity feed; quick link *Gate token* |
| Scheduler | 07:15 daily: close yesterday when *Close the crushing day automatically* is on (the scheduler is not running on this machine) |

## Demo

`sc-demo` (and `sc-reset-demo`) now also run `setup/demo_procurement.py`. Everything goes through the same code as the screens, signed in as the demo users (token clerk, gross and tare weighmen, cashier, accountant).

What it creates, for 2–6 Nov:
- **67 tokens**:
  - 14 ELP-verified (the accepted ELP loads)
  - 3 at gate rates with a reason (the rejected ELP loads)
  - 50 straight to the gate on their indents
- **62 CPRs** with journals, and **57 bilties** (most paid for 2–4 Nov)
- **2–5 Nov closed**: 4 invoices, all reconciled
- **6 Nov open**: 2 vehicles waiting for gross, 3 waiting for tare

The development terminal *WB-1 Gross* (127.0.0.1) is set to *Gross and Tare*, so one PC can take both weights.

## Tested

- **6 new integration tests** (`tests/test_procurement.py`):
  - rates and the ELP rule (gate vs verified TPT, the audit-pending refusal)
  - gate checks (validity, the indent again, the vehicle inside, cancelling gives the indent back)
  - weighbridge rules (moving, stale, over the limit, tare before gross, the insert-only log, typed-in weights need a Cane Admin and a note)
  - the CPR worked example (14,162 kg / 150,471.25) with a balanced journal and the right parties
  - bilty pay, refusal to pay twice, reversal, and refusal to cancel a CPR whose bilty is paid
  - day close: the invoice equals Σ govt value, outstanding 0, reconciled, clearing back where it was, all checks OK, the day closed twice refused, and cancel
  - slips and the API
- **Full suite: 119 green** (84 integration + 35 unit).
- **Smoke test:** the whole path end to end, then rolled back.
- **HTTP:** the terminal is recognised by IP; another IP is refused; readings and the simulator work.

## Open points (need your input)

1. **TPT rule.** Loads not verified by ELP are paid at the mill-gate rates; for check posts without loading points this means the gate rate too. The rule can be switched off in Sugar Settings (then the indent's source rates apply). Confirm it.
2. **Posting date.** CPR journals and the daily invoice are posted on the **crushing day**, so a CPR at 03:00 on 2 Nov posts on 1 Nov. Bilty payments post on the actual payment date.
3. **CPR cancelled after its day is invoiced.** This is refused for now: cancel the Daily Cane Purchase, fix the CPR, and close the day again. The architecture's automatic debit note can be added if you prefer.
4. **Weighbridge security in production.** The terminal check uses the client IP, which Frappe reads from `X-Forwarded-For`. nginx must overwrite that header with the real address, and each terminal should have its own API user (the agent's key). Indicator frame formats, LCD output and camera snapshots need the real hardware models.
5. **Village TPT subsidy / deduction and circle deduction %** are on the masters but not used by the CPR formula yet. Say how they should apply.
6. **Loan deduction** on the CPR stays 0 until Grower Loans (Phase 6). Bank payment scrolls and the road cess deposit are Phase 6 too.
7. **Not built from the Phase 3 list:**
   - Misc Weighment (non-cane items over the bridge)
   - In-Gate Pass / Yard Balance Log documents (the yard board shows the live state instead)
   - Contractor Allotment / Cane Officer Quota / Source Target
   - a separate Seasonal Rate Setup (rates come from the existing masters)

   Say which of these you want next.
8. **Demo dates.** The demo lives in November 2026 (the season), so "today" screens (tokens today, the yard's minutes, home tiles) look empty until the season starts or you pick a November date on the dashboard.

# Phase 4 — Depot Purchase

Built 2026-10-18. Phase 4 in the architecture is "Vehicle Tracking & Depot". Vehicle tracking (ELP) was built before Phase 3 (see `ELP.md`). This phase adds the depots.

A **depot buys cane through the same path as the mill gate** (token → weighment → CPR → journal → bilty). It holds that cane in its own warehouse and **sends it to the mill in contractor trucks**. Each truck is weighed out at the depot and in at the mill. The difference is the **transit shortage**.

## The flow

| Step | Screen (React) | Who | What happens |
|---|---|---|---|
| 1. Buy | **Gate in depot mode** (`/procurement/gate?depot=…`) | Depot User of that depot | Scan the grower's indent. The token is an entry of type *Depot*, at the **depot's source rates** (road cess, and TPT for the vehicle type). |
| 2. Weigh the grower's load | **Weighbridge** on the depot's PC | Depot User | The terminal must be registered **at that depot**. A depot token can't be weighed at the mill, nor a mill token at a depot. Tare → **CPR** with its Journal Entry and bilty, as at the mill. The cane is in the **depot's warehouse**. |
| 3. Send a truck | **Dispatch trucks** (`/depot/dispatch?depot=…`) | Depot User | Start a dispatch (truck, driver, contractor). Weigh it **empty**, then **loaded**, on the depot's weighbridge. *Dispatched* = loaded − empty. A truck can't carry more than the depot holds (bought − already sent, +2 %, +200 kg). A Cane Admin can accept more with a note. The truck is then **In Transit**, expected at *loaded time + the depot's journey time*. |
| 4. Receive at the mill | **Weighbridge** at the mill (scan `DSP-…`) | Gross / Tare Weighman | Weigh it **loaded** (At Mill), then **empty** (Received). *Received* = loaded − empty; *shortage* = dispatched − received, and the part above the depot's **allowed shortage %** is *shortage above allowance*. |
| 5. Day close | **Day close** (`/procurement/day-close`) | Cane Accountant | The day's invoice now has **one line per warehouse** (Cane Yard and each depot). The depot postings follow (below). **Days close in order** and reopen from the latest. |
| — | **Depots** (`/depot`) | managers, depot users, MIS | Bought, held, on the road, received, shortage % (red above the allowance), freight and recovery per depot; trend of bought / sent / received with the shortage line; trucks not yet received. |

## Postings at day close

All of these are posted after the day's purchase invoice and before midnight, in order, one second apart, so nothing is back-dated.

| What | Voucher | Entry |
|---|---|---|
| Trucks loaded that day | Stock Entry (Material Transfer) | depot warehouse → **Cane In Transit**, dispatched kg |
| … if the depot's books hold less than was weighed out | Stock Entry (Material Receipt, zero value) | the difference into the depot. Binding and trash are weighed but not paid, so the books are in payable kg. |
| Trucks received that day | Stock Entry (Material Transfer) | Cane In Transit → **Cane Yard**, received kg |
| … shortage | Stock Entry (Material Issue) | from Cane In Transit, shortage kg, expense **Cane Transit Shortage** (at stock value) |
| … freight and recovery | Journal Entry | Dr **Cane Freight – Depots** (received maund × freight rate) · Cr Creditors, party **contractor** (freight − recovery) · Cr Cane Transit Shortage (recovery) |
| Depot commission | Journal Entry | Dr **Depot Commission** · Cr Creditors, party contractor = payable maund bought at the depot that day × the depot's commission rate |

The **recovery** is the shortage above the allowance, at its stock value:

*recovery = shortage value × shortage above allowance ÷ shortage*

Every voucher is listed in the Daily Cane Purchase → **Depot Postings** table. Cancelling the day cancels them in reverse order and marks the trucks unposted.

## Where things are

| Area | Items |
|---|---|
| DocTypes | **Depot Dispatch** (Depot Purchase module) · Daily Cane Purchase → **Postings** (Daily Cane Purchase Posting) |
| Fields added | Cane Token / CPR: `purchase_depot`, entry type *Depot*; CPR: `warehouse`. Weighbridge Terminal: `depot`. Weighment Reading Log: `dispatch` and the four dispatch steps. Cane Depot: commission (the old *depot rate*), **freight rate**, **allowed shortage %**, **warehouse** (created automatically). Sugar Settings: in-transit warehouse, freight, commission and shortage accounts. |
| Setup | `setup.accounts` creates **Cane Freight – Depots**, **Depot Commission** and **Cane Transit Shortage** under Cane Cost of Sales, the **Cane In Transit** warehouse, and a warehouse per depot |
| Code | `depot_purchase/depot.py` (dispatch weights, depot balance, day-close postings) · `cane_procurement/procurement.py` (depot rules on the token / weighment; `take_weight` shared by the token and the dispatch) · `api/v1/depot.py` |
| Roles | **Depot User**: issues tokens and weighs only at **their** depots (Cane Depot → Users); can't work at the mill gate. Mill weighmen receive dispatch trucks. A Cane Admin can type a weight or pass an over-the-balance load with a note. |
| Reports (Report Centre → *Depot*, desk workspace *Depots*) | Depot Dispatch Register · Transit Shortage · Depot Stock · Depot Purchase Summary |
| Home | Tile "trucks on the road"; alert *Depot trucks overdue*; dispatches in the activity feed |

## Demo

`sc-demo` / `sc-reset-demo` now also:
- set up the depot terminals **DP-1 Kot Momin, DP-2 Quaidabad, DP-3 Ahmedpur Sial** (simulators)
- give the user `depot.user@` all three depots
- set freight rates of 12 / 14 / 18 per maund and allowances of 1 / 1 / 1.5 %

What it creates, for 2–6 Nov:
- **60 growers' loads bought at depots** (34 Kot Momin, 23 Quaidabad, 3 Ahmedpur Sial)
- **34 trucks**: 31 received, 2 still on the road (6 Nov evening), 1 waiting for a full load at Ahmedpur Sial
- average shortage 0.91 %; 1,326 kg above the allowance
- **2–5 Nov closed** with all depot postings

## Tested

- **3 new integration tests** (`tests/test_depot.py`):
  - depot rates and token; a depot token refused on the mill's weighbridge; CPR into the depot warehouse; a user of another depot and a depot user at the mill gate refused
  - dispatch:
    - over the depot's balance refused
    - the mill terminal refused at a depot step
    - the shortage example: 500 kg on 22,500 kg with 1 % allowed, so 275 kg recovered
  - day close:
    - 4 stock entries, freight journal with the contractor, commission
    - depot and transit back to 0
    - reconciled
    - cancel reverses everything
  - days close in order (a truck loaded on day 1 and received on day 2); reopen from the latest
- **Full suite: 122 green** (87 integration + 35 unit). The Phase 3 tests now share a base class with these.
- **Smoke test** (rolled back): depot purchase → dispatch → mill receipt → close → cancel.

## Open points (need your input)

1. **Depot rates.** A depot purchase uses the depot's *source* rates: road cess, and TPT for the vehicle type (a 0 row means no TPT). Confirm whether growers selling at a depot get the same govt rate and subsidies as at the gate, or a lower depot rate.
2. **Freight as cost.** Freight and commission are expensed (Cane Cost of Sales), not added to the cane's stock value. Say if they should be capitalised into the cane cost for production costing (Phase 6).
3. **Shortage recovery** is taken from the contractor through the freight journal (a net credit). If the contractor should be invoiced separately, or the rule is per trip vs. per day, say so.
4. **Depot weighbridges without an indicator.** A Cane Admin can type weights with a note. If depots use platform scales without any link to a PC, a "depot clerk may type weights" setting can be added.
5. **Android depot app with Bluetooth slip printing** (architecture §8) is not built. Depots use the React screens on a PC; the ELP app already registers depot loads.

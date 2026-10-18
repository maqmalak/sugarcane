# Phase 5 — Laboratory and Production

Built 2026-10-18. The lab measures every stream and the mill's time. It writes the **Daily Manufacturing Report (DMR)**, and the approved DMR **posts production into stock**: cane out of the yard, sugar into the godown, by-products at NRV.

## The flow

| Step | Screen (React) | Who | What happens |
|---|---|---|---|
| Hourly samples | **Hourly samples** (`/lab/entry?day=`) | Lab Chemist | Pick the hour and enter each stream's analysis. Purity = pol ÷ brix × 100 is computed. A value outside the stream's limits is **flagged, not refused**. There is one sample per stream per hour; a correction is an amendment. The day's grid shows every stream × hour, with out-of-range cells in red. |
| Vehicle samples | **Vehicle samples** (`/lab/vehicle`) | Lab Chemist | A core sample of a load (a CPR): juice brix and pol, fibre % cane → **CCS** and **estimated recovery** (CCS × the recovery factor, 0.95). Grower, circle, source and **variety** (from the indent) come with the CPR. |
| Stoppages | **Mill stoppages** (`/lab/stoppages`) | Lab Chemist | Stop / restart, with category, section and reason. Stoppages can't overlap. One across 07:00 is split between the two crushing days. Home shows "The mill is stopped" while one is open. |
| Plant levels | **Plant levels** (`/production/plant`) | Lab Chemist | Each point's latest reading against its normal range, an hourly entry, and a 5-day history of any point. Out-of-range values are flagged. |
| DMR | **DMR** (`/lab/dmr?day=`) | Lab Chemist prepares, **Production Manager approves** | Built from the day (see below). The lab enters the closing yard, the bags, the by-products and (optionally) pol % cane, then **Prepare**. The Production Manager **Approves** (submits). |
| Production | **DMR** or **Production** (`/production`) | Production Manager | **Post production** for an approved day once its cane day is closed. This creates a **Work Order** for the bags against the season's bag BOM and a **Stock Entry (Manufacture)**. |
| — | **Lab dashboard** (`/lab`), **Production** | managers, lab, MIS | Lab dashboard: recovery and crushing trend, mixed juice hour by hour, the day's averages, recovery by variety, stoppages by cause, out-of-range list. Production page: stock of sugar, by-products, packing bags and yard cane, bags and cost per bag per day. |

## The DMR

| Figure | From |
|---|---|
| Cane received | gate CPRs (payable kg) + depot trucks received at the mill that day |
| Yard opening | the previous DMR's closing |
| Yard closing | entered by the lab |
| Cane crushed | opening + received − closing |
| Running hours / crush rate | 24 h − stoppage minutes in the day · crushed t ÷ running h · % of the mill's capacity (Sugar Settings) |
| Recovery | bags × bag weight ÷ cane crushed |
| By-products % cane | molasses, bagasse, press mud kg ÷ cane crushed |
| Average analyses | the mean of each stream's samples; purity recomputed from the mean pol and brix |
| Pol losses % cane | bagasse, press mud and molasses: stream % cane × the stream's average pol. Undetermined = pol % cane − recovery − known losses. Pol % cane defaults to the vehicle samples' average of pol × (1 − (fibre + 5) / 100). |
| Season to date | the approved DMRs before it + this one |

Every figure is recomputed whenever the draft is saved. An approved DMR can't be cancelled while production is posted from it, or while a later DMR (whose opening comes from it) is approved.

## Production posting (§5)

1. **Before anything is written**, it checks:
   - the role
   - that the **cane day is closed** (the daily purchase invoice brought the cane into stock)
   - that there is enough cane in the yard and enough packing bags on the books
2. **Work Order** for *bags* against the season's **bag BOM**. The BOM is made automatically:
   - cane = 50 kg ÷ standard recovery (10 % → 500 kg)
   - 1 packing bag
   - by-products at the expected % cane and their NRV
   - It is remade when the season's standard recovery, expected by-products or NRVs change.
3. **Stock Entry (Manufacture)**:
   - **the cane actually crushed** (not the BOM's standard) comes out of the Cane Yard
   - the packing bags come out of the Packing Store
   - sugar goes into the **Sugar Godown**
   - molasses, bagasse and press mud go into the **By-products Store**, at the DMR's actual kg × the season's NRV
   - The sugar carries what is left of the cost. That is the **cost per bag**, shown on the entry and the Production page.
4. Cancelling the entry cancels the Stock Entry and the Work Order. Entries cancel from the latest.

The BOM's standard cost uses the price list **Cane Standard Cost** (cane at govt rate + subsidies ÷ 40 per kg). The real cost comes from stock.

## Where things are

| Area | Items |
|---|---|
| DocTypes — Cane Laboratory | Lab Sample Type (+ Lab Parameter Limit) · Lab Sample · Vehicle Recovery Sample · Mill Stoppage · Daily Manufacturing Report (+ DMR Analysis) |
| DocTypes — Sugar Production / Sugar MIS | Daily Production Entry · Plant Point · Plant Level Reading (+ Plant Level Value) |
| Calculations | `calc/lab.py`: purity, CCS, recovery, cane crushed, crush rate, averages, losses, bag BOM. Unit-tested and rounded half-up with Decimal. |
| Code | `cane_laboratory/lab.py` · `sugar_production/production.py` · `sugar_mis/plant.py` · `setup/production.py` (items, warehouses, BOM) · `setup/lab_setup.py` (standard sample types and plant points) · `stock.py` (stock quantities without the Item-read permission) · `api/v1/lab.py` |
| Masters created on migrate | **10 sample types** with normal ranges (Primary / Mixed / Clear Juice, Syrup, A / C Massecuite, Final Molasses, Bagasse, Press Mud, Sugar) · **10 plant points** · items **SUGAR-50KG, PACKING-BAG, MOLASSES, BAGASSE, PRESS-MUD** · Sugar Godown, Packing Store, By-products Store |
| Settings | Sugar Settings → *Laboratory and Production*: the items and stores, the CCS recovery factor (0.95), mill capacity (t/day). Crushing Season: expected molasses / bagasse / mud % cane, the bag BOM. |
| Roles | **Lab Chemist** records and prepares; **Production Manager** approves the DMR and posts production; MIS Viewer reads |
| Reports (Report Centre → *Laboratory* / *Production*, desk workspaces *Laboratory* and *Sugar Production*) | Daily Manufacturing Summary · Hourly Lab Analysis · Variety Wise Recovery (also by circle / grower / source) · Mill Stoppage Report · Daily Production Register |
| Home | Tiles: season recovery, bags in the godown. Alerts: *DMRs waiting for approval*, *Approved days not posted to production*, *The mill is stopped*. |

## Demo

`sc-demo` / `sc-reset-demo` now also run `setup/demo_lab.py` for 2–6 Nov:
- **510 lab samples** (about 1 % out of range)
- **38 vehicle samples** (varieties differ in recovery)
- 1–3 stoppages a day
- plant readings every two hours
- 20,000 packing bags bought on 1 Nov
- **DMRs 2–5 Nov approved and posted to production**: about 1,560 bags, recovery 9.8–10.4 %, cost around Rs 3,100–3,300 a bag
- **6 Nov prepared**, waiting for the Production Manager

The demo buys only a sample of a real mill's cane, so the demo sets the mill capacity to 350 t/day and the *Cane Crush Rate* plant point to 8–16 t/h. Set the real figures before going live.

## Tested

- **5 new unit tests** (`test_calc.TestLabCalc`): purity, CCS example (12.96), crushed / recovery / crush rate / losses, averages with recomputed purity, bag BOM.
- **3 new integration tests** (`tests/test_lab.py`):
  - **samples:** purity, same hour refused, out of range flagged, pol > brix refused
  - **vehicle samples and stoppages:** vehicle sample CCS and variety from the indent; overlapping stoppage refused; a stoppage split at 07:00
  - **DMR → production:** received and crushed; prepare needs bags; approve needs prepared; production refused before the day is closed; Manufacture with the actual cane, the bags, by-products at NRV; yard stock down by the cane crushed; cost per bag = (cane + bags − by-products) ÷ bags; DMR cancel refused while production exists; production cancel restores the yard
- **Full suite: 130 green** (90 integration + 40 unit).

## Open points (need your input)

1. **The CCS formula and the recovery factor (0.95)** are the common ones. Give your lab's formula if it differs.
2. **Sample types and limits** are standard figures. Your chief chemist should set the real ranges and frequencies (desk or React → Lab → Sample Types & Limits).
3. **Instruments.** Analyses are typed in. A polarimeter / refractometer or the plant SCADA can post directly once the models are known.
4. **Sugar grades.** One sugar item (50 kg bag). If you bag several grades (e.g. A / B / refined), each needs its own item and DMR line.
5. **Costing.** By-products are valued at NRV and the sugar carries the rest of the cane, packing and nothing else. Freight, commission and overheads are expensed (Phase 6 costing can add them). Bagasse burnt in the boilers is still credited at its NRV; say if it should be valued differently.
6. **DMR print.** The DMR prints with the desk's standard print format. A designed A4 report can be added.

# Phase 2 — Cane Indenting

An **indent** is a supply permit for one vehicle load of cane on a given day. Phase 2 turns the season's survey into
indents for every grower. The indents are spread over the season and fitted to the mill's daily intake. A Cane Manager
authorizes them in batches, and they are printed with a barcode so the gate can scan them.

## How it works

1. **Set up the season** (Crushing Season → *Indenting*):

   | Setting | Default |
   |---|---|
   | Load per indent | 200 md |
   | Days an indent is valid | 3 |
   | Part load counted from | 50 % |
   | Daily intake | empty = crushing target ÷ season days. For 2026-27 that is 119,205 md, or 596 indents a day |
   | Indenting start date | the season start |

2. **Quota rules** (`Indent Quota Rule`). Each rule sets what share of the surveyed cane becomes indents, and in which
   supply window. A rule matches on circle, grower type, plant/ratoon and variety maturity. Conditions left empty
   match everything. The most specific matching rule wins: a circle counts most, then the number of other conditions,
   then the rule's priority. A field that no rule matches gets 100 % over the whole season.
3. **Number ranges** (`Indent Range`). Each circle has a range of serial numbers per season, for example
   `26-001-100001 … 26-001-102000`, and there can be one mill-wide fallback range. Numbers are taken under a row lock
   and never reused. A cancelled or rejected indent leaves a gap, as a pre-printed permit book would.
4. **Generate** (React → Indenting → *Generate indents*). Pick the supply dates (at most 62 days) and a circle, or
   all circles. The **preview** shows:
   - indents per day against capacity
   - indents per circle against the numbers left in its range
   - fields held back for an overlap review
   - warnings

   *Generate* then creates **one draft Indent Batch per circle**, holding its draft Cane Indents.
5. **Authorize** a batch from the Approvals inbox, the batch page, or the Desktop. Authorizing the batch authorizes all
   of its indents at once. **Reject** deletes a draft batch together with its indents.
6. **Print**: a PDF with 4 indents per A4 page, each with a Code 128 barcode of its number. Only authorized indents
   print. The first print marks them *Printed*. A reprint is printed as "DUPLICATE n", needs a Cane Manager and a
   reason, and is logged on the indent.
7. **At the gate**, *Look up an indent* (scan or type the number) shows whether the indent is valid today. In Phase 3
   the token screen will mark it *Used*.
8. **Expiry**: a daily scheduled job marks authorized or printed indents *Expired* once their last valid day has passed.

### The calculation (`sugarcane/calc/indent.py`, pure functions with unit tests)

```
entitled md  = Σ expected md of the grower's surveyed fields × quota % of each field's rule
               × circle factor   (when the circle's entitlement exceeds its season quota, every grower is scaled down)
loads        = ⌊entitled ÷ load⌋, plus one more when the remainder ≥ the part-load %
supply dates = loads spread evenly through the rule's window, then fitted to the daily capacity
               (the ideal day if it has room, otherwise the nearest day in the window: later first, then earlier)
```

The whole season is planned the same way every time. Indents already issued keep their day and use up its capacity;
only loads that don't have an indent yet are placed again. So a run for next week and a later run for the week after
agree, and a re-run creates nothing twice. Each load has a `plan_key` (season · grower · window · n). Loads that were
cancelled are not issued again.

**Which fields count:** submitted company surveys of the season, with a grower and expected cane.
- **Held back:** fields still under overlap review. They get indents once the review is decided.
- **Left out:** rejected overlaps, competitor fields and disabled growers.

**Delivery point:** each indent goes to the nearest active Cane Source (gate, check post or depot) to the grower's
village pin.

## What was built

| Area | Items |
|---|---|
| DocTypes (module Cane Indenting) | Indent Range · Indent Quota Rule · **Cane Indent** (submittable; status Draft → Authorized → Printed → Used / Expired / Cancelled) · **Indent Batch** (submittable) + Indent Batch Day · Crushing Season → *Indenting* section |
| Server | `cane_indenting/generator.py` (plan, preview, generate, expire_due) · `numbering.py` · `printing.py` + `templates/indent/indents.html` · `api.py` (preview, generate, authorize_batch, reject_batch, print_pdf, lookup, cancel_indents, batch_detail, insights, grower_balance) · `calc/indent.py`, `calc/barcode.py` |
| Reports | Indent Register · Circle Wise Indent Summary · Grower Indent Balance · Daily Indent Schedule. All four are in the React Report Centre (group *Indenting*) and the desk |
| Desk | *Cane Indenting* workspace, sidebar and desktop icon · Print / Reprint buttons on batches and indents |
| React (`/sugar/indenting`) | Insights · Generate (with preview) · Look up · Batch page (indents by day, Authorize / Reject / Print / Reprint) · Indent page (barcode, valid today, Print) · Quota Rules / Ranges lists |
| Cross-app | **Approvals inbox:** draft batches with Authorize / Reject · **Desktop:** "Indent batches to authorize", "Authorized indents not printed", an Indenting tile figure (indents valid today), Indenting activity and module share · **Bell:** a new batch notifies managers; an authorized batch notifies Indent Clerks |
| Demo (`sc-demo`) | Ranges for every circle plus a mill-wide range, 6 quota rules, the first week of 2026-27 (246 indents in 12 batches): 2 drafts, 6 authorized, 4 printed |
| Tests | 10 unit (rules, loads, cap, dates, placement, barcode) + 7 integration (ranges, generate / authorize / print / reprint / expire, cancel keeps used indents, held overlaps and circle cap, capacity, inbox, permissions) |

### Roles

| Role | Can |
|---|---|
| Indent Clerk | generate, print (first print), look up |
| Cane Manager / Cane Admin | the above, plus authorize or reject batches, reprint, cancel, quota rules and ranges |
| Circle Officer, MIS Viewer, Cane Accountant | read, look up |
| Token Clerk | read, look up (and mark indents used in Phase 3) |

## Decisions made for you (please confirm)

These are configurable; I chose defaults because the spec gave only the outline.

| # | Decision | Change it in |
|---|---|---|
| 1 | One indent = one load of **200 maund** | Crushing Season → Load per Indent |
| 2 | Indents are **valid for 3 days** from the supply date | Crushing Season |
| 3 | A part load gets an indent when it is **≥ 50 %** of a load | Crushing Season |
| 4 | Daily capacity = **crushing target ÷ season days** unless you enter a daily intake | Crushing Season |
| 5 | **Batch authorization:** one batch per circle and generation run is authorized as a whole, rather than a workflow on each of thousands of indents | — |
| 6 | **Season quotas cap** each circle's indents (Phase 1 *Season Quotas*) | Season Quotas page |
| 7 | **Cancelled indents are not re-issued** automatically; generate again after deleting the plan key if a grower should get the load back | — |
| 8 | Demo rules: ratoon first (Nov–mid Jan), early varieties Nov–Jan, mid-season Dec–Feb, late Jan–Mar, non-passbook growers 80 %, Kot Momin (affiliated) 90 % | Indent Quota Rule |
| 9 | Deliver to the **nearest source** by straight line from the village pin | edit the indent |

## Not in Phase 2

- Marking an indent *Used* happens at the token gate (Phase 3). The API checks the status and dates already.
- **SMS** to growers when an indent is issued is Phase 8. Printed slips are handed out by the circle staff.
- **The daily expiry job** needs `bench schedule` running for this site. Until then, managers can run *Expire now*
  (`sugarcane.cane_indenting.api.expire_now`), and lookups and insights expire due indents on the fly.

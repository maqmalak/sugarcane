---
title: Indent clerk
roles: Indent Clerk, Cane Manager
order: 30
---
# Indent clerk

An **indent** is the mill's permission for one grower to bring **one vehicle load** (200 maund) on a given day. It is valid for 3 days. Indents call the growers' cane to the mill as the mill can crush it.

The full guide with screenshots and the video are in **Help → Guides & videos → Indenting**.

## Before the season (Cane Admin / Cane Manager)
1. **Setup → Crushing Seasons → the season → Indenting**:
   - *Load per Indent* (200 md), *Indent Valid For* (3 days), *Count a Part Load From* (50 %);
   - *Daily Cane Intake*: empty = crushing target ÷ season days;
   - *Indenting Starts On*: empty = the season start.
2. **Circle quotas**: E-Survey → Season Quotas. Type each circle's quota, or scale by %, match the survey or spread the target. Save.
3. **Quota rules**: Indenting → Rules & Ranges → Quota Rules (see below).
4. **Indent ranges**: Indenting → Rules & Ranges → Indent Ranges. Add one range per circle, e.g. prefix `26-003-`, 100001–102000, and one mill-wide range (no circle).

## Quota and quota rules
- The **quota** is the most cane a circle may supply in the season. If the growers of a circle are entitled to more, all of them are scaled down by the same factor.
- A **quota rule** sets what **%** of a field's surveyed cane becomes indents, and the **supply window** (dates). It can apply to every field, or only to:
  - a circle;
  - Passbook or Non-Passbook growers;
  - plant or ratoon cane;
  - Early, Mid or Late varieties.
- The most specific rule wins:
  - a circle counts 4 points, each other condition 1 point;
  - on a tie, the higher *Priority* wins.
- A field no rule matches gets 100 % over the whole season.
- Worked out:
  - entitled = surveyed md × rule %, then the circle cap;
  - loads = entitled ÷ 200 md (a last part load counts from 50 %);
  - the loads are spread evenly through the window, at most the daily intake a day.

## Generating indents (usually weekly)
1. **Indenting → Generate indents.** Choose the supply dates (at most 62 days) and, if needed, a circle. Click **Preview**.
2. The **preview** shows:
   - the indents that would be created, the season's entitlement and how much is already issued;
   - the indents per day against the mill's daily intake;
   - per circle: indents, growers, maund and the **numbers left** in its indent range;
   - fields **held back** for an overlap review, and any warnings.
3. **Generate.** The indents are made in one *Indent Batch* per circle, as drafts, with their numbers.
4. The **Cane Manager authorises** each batch on the batch, or from **E-Survey → Approvals inbox → Indent batches**. A batch can also be rejected: its draft indents are deleted and their numbers stay unused.
   - On authorisation each grower gets an SMS with the indent number, the load and the days it is valid.
5. **Print** the authorised indents: A4, four slips a page, each with a barcode. Circle staff hand them out. A reprint asks for a reason and says DUPLICATE.

## Rules
- Running the generator twice for the same dates issues nothing new.
- An indent is valid only for its days. The day after, it **expires**.
- A used indent shows its gate token. It can't be used again or cancelled.
- Cancelling an authorised batch cancels its unused indents; used ones stay.

## Looking up an indent
**Look up an indent**: scan the barcode or type the number. It shows the grower, validity, status and, once used, the token and CPR.

## Expired indents
**Indenting → Expired indents** lists every indent that ran out unused. For each it shows:
- the grower and his mobile;
- the circle and village;
- how many days ago it expired;
- **Later Indents**: whether the grower has a newer indent.

Call the growers with none.

## Reports
*Indent Register*, *Expired Indents*, *Daily Indent Schedule*, *Circle Wise Indent Summary*, *Grower Indent Balance*.

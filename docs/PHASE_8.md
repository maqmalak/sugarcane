# Phase 8 — Grower Messages and MIS

Built 2026-10-19. This phase covers:
- SMS / WhatsApp to growers and drivers on what happens to their cane, indents, money and loans
- the keyword replies (a grower texts *BAL* and gets their balance)
- a live MIS screen for the mill, and three season reports

Everything is on the React app's **MIS** app (`/sugar/mis`) and the desk workspace *Sugar MIS*.

## Messages (`/mis/messages`)

### When a message goes

| Event | To | When | Text (built-in, English) |
|---|---|---|---|
| Indent Issued | grower | each indent authorised (batch or single) | indent no., maund, valid from / to |
| Indent Expiring | grower | daily job: the indent ends tomorrow and is unused (once) | indent no., last day |
| Token Issued | grower | the truck gets its gate token | vehicle, token, time |
| CPR Posted | grower | CPR submitted | CPR, day, maund, value, payable, loan deducted |
| Bilty Ready | driver | TPT bilty made | bilty, vehicle, maund × rate = amount, "collect at the counter" |
| Payment Sent | grower | payment scroll paid, one per grower | amount, CPRs, cheque / transfer, bank ****last 4, scroll |
| Loan Disbursed | grower | loan disbursed | loan, amount, markup %, recovery % |
| Keyword Reply | the sender | an incoming keyword | the answer |

The *Loan Markup* and *Survey Recorded* events have built-in texts. Nothing sends them yet; see open point 4.

### Rules
- **Every message is a *Sugar SMS Log* row** (insert-only): direction, status, event, mobile, grower, the record it is about, text, parts, attempts, gateway response.
- **Statuses:**
  - *Mocked*: Mock gateway, nothing left the server
  - *Queued*: waiting for a real gateway
  - *Sent*
  - *Failed*: tried again, at most 3 times
  - *Skipped*: no valid number, or over the daily limit
- **Numbers** are normalised to `923XXXXXXXXX`. Accepted forms: 0300-1234567, +92 300…, 0092…, 3001234567. Anything else is skipped.
- **Parts:** 160 / 153 characters per SMS. A message with Urdu letters uses 70 / 67.
- **Gateway** (Sugar Settings → *SMS and WhatsApp*):
  - **Mock**: the demo and the tests use it.
  - **Frappe SMS Settings**: the HTTP gateway set up in the desk's *SMS Settings*, which suits any Pakistani SMS aggregator.
  - **WhatsApp**: a *WhatsApp Message* through the installed whatsapp app.
- **Queue:** with a real gateway, messages are queued and the scheduler sends them every few minutes. It holds them during **quiet hours** (22:00–07:00 by default). Keyword replies go at once.
- **Daily limit:** a number gets at most **10 messages a day** (setting). Keyword replies don't count.
- **Test mode:** set a test number and every message goes to it. The log notes the real number.
- **Never blocks the work:** a messaging failure is written to the Error Log. The CPR, scroll or loan still posts.

### Templates
- Each event has a built-in text in English, Roman Urdu and Urdu.
- A **Sugar SMS Template** for an event and language replaces the built-in text. It is a Jinja body, and it can be limited to an audience (grower / driver / guarantor / staff).
- The default language is in Sugar Settings.
- The Templates tab shows the fields available for each event, a **live preview with sample data**, and the characters and SMS parts.
- Demo templates:
  - *CPR Posted – Roman Urdu*
  - a friendlier *Payment Sent – English*, which the demo uses

### Keywords
A grower texts the mill. The first word is the keyword, in any case. The grower is found by their mobile on the Grower record.

| Keyword | Reply |
|---|---|
| BAL | unpaid amount and number of unpaid CPRs, plus loan outstanding |
| CPR | the last CPR: day, maund, amount, paid / unpaid |
| IND | open indents with their validity (up to 3) |
| LOAN | outstanding of each open loan |
| PAY | the last payment: amount, day, scroll |
| HELP / anything else | the list of keywords |

- An unregistered number is told to visit the circle office.
- Keywords are records (*SMS Keyword*). Each can point at a reply template that wraps the answer.

**Inbound endpoint** for the gateway:

```
POST /api/method/sugarcane.api.v1.sms.inbound?token=<Inbound Token>&from=<mobile>&text=<message>
```

- It accepts `mobile` / `from` / `sender` / `msisdn` and `message` / `text` / `body` / `msg`.
- The shared token is compared in constant time.
- The page has a **keyword simulator** (a chat box) and a **test message** box.

## MIS wall (`/mis`)

One screen for the mill. Tiles:

| Tile | Shows |
|---|---|
| Cane bought | maund, loads and growers; gate and depot loads |
| In the yard | trucks before gross / tare, the oldest truck, cane yard stock |
| On the road | depot trucks and maund, when the first left |
| Unpaid to growers | CPRs, the oldest, paid today, unpaid bilties |
| Sugar | the last DMR: bags, recovery against standard, crushed, capacity |
| In stock | sugar bags, molasses, loans outstanding |

Below the tiles:
- **cane by hour** of the crushing day
- **season:** maund against the target, days, average per day, growers, bags, recovery, days to target
- **last 14 days:** maund bars and a bags line
- **plant points out of range**, today's **stoppages**, and a red banner while the mill is stopped
- **circles:** supplied against quota and survey, indents used
- **depots today**
- messages sent today

The wall updates itself:
- Each CPR, token, scroll, stoppage, DMR or depot dispatch sends the realtime event **`sugar_mis`** after commit.
- The page reloads at most every 5 s, and every 60 s anyway.
- **Wall mode** hides the menus for a TV.
- When today has no cane yet, the wall shows the last day with cane and says so; this is how the demo looks.

## Reports (Report Centre → *MIS*)

| Report | What it shows |
|---|---|
| **Season Progress** | Per day:<br>• bought (gate / depot) and % of the daily intake<br>• payable, crushed, bags, recovery, stoppage, capacity, DMR status<br>• running season maund, % of target, crushed and bags<br>A chart of bought against crushed. |
| **Circle Wise Performance** | Per circle:<br>• surveyed fields, acres and expected maund, and the quota<br>• indents issued / used / expired<br>• loads, growers and supplied maund<br>• **% of quota** and **% of survey** |
| **Grower Supply Ranking** | Growers ranked by maund: survey expected, % of survey, payable / paid / unpaid, loan recovered and outstanding, first / last day |

The *Survey vs Actual Yield* report now takes the variety from the CPR's indent, so the actual cane is split by variety.

## Home and desk
- **Desktop:** the **MIS** tile goes live (it was "Phase 8").
- **Sidebar:**
  - *Mill right now*
  - *Grower messages*
  - Messaging records: log, templates, keywords
  - MIS reports
- **Desk:** a *Sugar MIS* workspace and sidebar.

## Demo

`sc-demo` / `sc-reset-demo`:
- The generator runs with messages off. `demo_messages` then replays every event for the demo records through the Mock gateway, each dated at its record's own time.
- The result: 216 indent, 119 token, 114 CPR, 104 bilty, 57 payment and 24 loan messages.
- Seven keyword conversations: BAL, CPR, PAY, "bal please", LOAN, an unknown keyword, and an unregistered number.
- A few messages are *Skipped* because the grower has no mobile.

## Tested

- **3 new integration tests** (`tests/test_mis.py`):
  - **Rules:**
    - numbers, SMS parts (English and Urdu), quiet hours across midnight
    - Mock → *Mocked*; a bad number → *Skipped*
    - the daily limit, with keyword replies exempt; test mode; messaging off
    - a real gateway: queued, held in quiet hours, and one attempt by the scheduler
  - **Events and keywords:**
    - indent, token and CPR messages with the right number and the CPR's payable
    - BAL / CPR / unknown / unregistered replies, and the reply linked to the incoming message
    - the inbound endpoint refuses a wrong token and answers with the right one
  - **MIS:** the snapshot (cane by hour adds up), circle performance, and the three reports (running totals, ranks).
- **Full suite: 137 green** (97 integration + 40 unit).

## Open points (need your input)

1. **SMS provider.** Which aggregator (Jazz, Telenor, Zong, or a reseller such as EOcean / Ufone Bulk), and its API? If its HTTP API fits Frappe *SMS Settings*, it is configuration only. Otherwise a small adapter is needed. Also needed: the sender ID / mask and the registered short code for keywords.
2. **WhatsApp.** Meta requires approved templates for messages the mill starts. The texts here would need registering in the whatsapp app's account.
3. **Language.** One default language for all growers, or a language per grower (a field on Grower)?
4. **More events.** Monthly markup and survey-recorded texts exist but aren't sent. Also say whether guarantors should be told when a loan they guarantee is disbursed, and whether staff alerts are wanted (mill stopped, yard over 12 h).
5. **Cost.** Every token and CPR sends a message (about 4 per load with indent and bilty). Turn some events off if SMS cost matters.

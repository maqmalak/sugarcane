# Phase 6 — Cane Accounts, Grower Loans, Contractors, Bank Documents and Costing

Built 2026-10-19. This phase covers:
- paying growers through the bank, with the bank's documents
- depositing road cess
- grower loans, recovered from the cane
- contractor bills (unloading with idle payment, loading, depot freight)
- a document vault
- the cane-cost and cost-per-bag reports

Everything is on the React app's **Cane Accounts** app (`/sugar/accounts`) and the desk workspace *Cane Accounts*.

## Paying growers — the payment scroll

| Step | What happens |
|---|---|
| **Build** (`/accounts/scroll`) | Start a scroll from the unpaid CPRs (up to a date; those with an IBAN), or an empty one, then scan CPR barcodes — or type a grower ID / CNIC to add all their unpaid CPRs. A CPR can sit on one scroll only, and duplicates are dropped. The scroll groups the CPRs into **one payment per grower**. |
| **Pay** | Submit. Refused for a bank transfer while any grower has no IBAN (pay those by a cheque scroll). Each grower gets a **Payment Entry**: Dr Grower Payable (party Grower) · Cr the bank, **allocated against each CPR's journal**, so the grower's ledger shows every CPR settled. The CPRs become *Paid* (scroll, date). A paid CPR can't be cancelled. Cancelling the scroll cancels the payments. |
| **Bank file** | CSV, one line per grower: beneficiary, CNIC, bank, IBAN, amount, reference *scroll/grower*, CPR numbers. |

### Bank documents

All bank documents are on the letterhead in the real-estate app's style. Each one has a QR code that opens the record in the React app, and every print is kept in the vault.

| Document | Where | What |
|---|---|---|
| **Bank payment schedule** | scroll page | Debit account, summary per beneficiary bank, a table per bank (beneficiary, CNIC, IBAN, CPRs, amount), total in words, two signatories |
| **Bank instruction letters** | scroll page | **One letter per beneficiary bank** to our bank: debit our account, credit the annexed accounts; amount in words; signatories; annexure with references. Lines with a stop request are left out. |
| **Bank scroll — unpaid CPRs** | unpaid list on the scroll page | All unpaid CPRs (optionally up to a date / circle), grouped by the growers' banks, each CPR with its day and age; "No bank account" listed last |
| **Stop-payment letter** | a payment line of a paid scroll → *stop payment* | To our bank: stop the cheque / transfer (reference, beneficiary, IBAN, amount in words, reason). The request is recorded on the line (reason, time, letter number) and on the scroll's timeline. |

Our bank, branch, account title, account number, IBAN, letter reference prefix, signatories and the letterhead address are in **Sugar Settings → Bank Letters**.

## Road cess

The **Road cess** page (`/accounts/cess`) shows the cess to deposit by month: the grower's share deducted on the CPRs plus the mill's share.
- **Deposit**: give the CPR period, the deposit date and the challan number. A Journal Entry posts Dr Road Cess Payable – Govt · Cr the bank, and those CPRs are marked deposited.
- A CPR whose cess is deposited can't be cancelled.
- Cancelling the deposit reverses it.

## Grower loans

| Step | What happens |
|---|---|
| **Types** | markup % a year, % of each CPR recovered, largest loan, largest per surveyed acre |
| **Apply** (`/accounts/loans`) | Grower, type, amount, guarantor. **Eligibility** shows before applying, and an amount above it is refused. |
| **Approve** | The Cane Manager may lower the amount (never above what was applied for), then approves (submit). The approver and time are recorded. |
| **Disburse** | Journal Entry Dr Grower Loan Receivable (party Grower) · Cr bank |
| **Recovery** | Every CPR takes each open loan's share — up to its type's % of the CPR's net after TPT, oldest loan first, never more than owed. The CPR journal carries the line Cr Grower Loan Receivable, and a *Grower Loan Entry* records the share. Cancelling the CPR gives it back. |
| **Markup** | Monthly (scheduler, or *Accrue markup* for a month): outstanding × % ÷ 365 × days; one journal Dr Grower Loan Receivable (each grower) · Cr Loan Markup Income. A month is never accrued twice. |
| **Repayment / write-off** | Cash or bank repayment at the counter; a write-off with a reason (Cane Admin) |
| **Application (PDF)** | the loan application form (below) |

**Eligibility** is the lowest of:
- the type's largest loan
- the per-acre limit × surveyed acres
- the type's recovery % of the expected cane value (survey maund × govt rate)

…less this type's loans taken this season and other open loans.

It also runs these checks:
- the grower is active
- cane was surveyed this season
- no loan was written off before
- open loans can be recovered from the expected cane
- the guarantor grows cane this season
- the guarantor guarantees at most 2 other loans

**Loan application (PDF)** contains:
- the applicant, with bank details
- the guarantor: their own outstanding loans and the loans they already guarantee
- the eligibility table and checks
- applied for / eligible / approved, markup and recovery
- previous loans and their history
- cane supplied by season, with the loans recovered from it
- the loan's own **ledger with a running balance** (disbursed, markup, recoveries, repayments)
- the undertaking and four signature blocks

The ERPNext party type *Grower* is Payable, and ERPNext only allows a party on an account of the party type's kind. So **Grower Loan Receivable is a Payable-type account under the assets** (a debit balance per grower). The setup switches it while it has no entries.

## Contractor bills (`/accounts/contractors`)

| Bill | Lines | Posting |
|---|---|---|
| **Unloading at Mill** | every gate CPR (net maund unloaded) and, if the contract says so, every depot truck received, at the **Unloading Contract** rate for its vehicle type (per maund, plus per vehicle) — the contract in force that day, else Sugar Settings. **Idle payment**: every mill stoppage of a paid category and at least the minimum length, hours × the idle rate, capped per day | JE Dr Cane Loading and Unloading · Cr Creditors (contractor) |
| **Loading at Loading Point** | every CPR loaded at the contractor's points × the point's loading rate | same |
| **Depot Freight and Commission** | the contractor's depot trucks received (freight, less shortage recovered) and the depot commission | **statement only** — already posted with each crushing day |

A CPR, truck, stoppage or commission journal is billed once per bill type. Every bill prints (letterhead PDF, in the vault).

**Unloading Contract** fields:
- contract number, contractor and validity (no overlapping active contracts)
- security deposit
- rate per maund, and rates by vehicle type
- whether depot trucks are included
- idle rate per hour, minimum stoppage, daily idle cap, and the stoppage categories that are paid
- terms

## Document vault (`/accounts/documents`)

- **Generated documents**: every bank schedule, instruction letter, unpaid scroll, stop-payment letter, loan application and contractor bill printed is stored as a **private PDF, a new version each time** (*Sugar Generated Document*, insert-only). It is also attached to its record (scroll, loan, bill), so the record's attachments keep the history.
- **Vault**: papers from outside — CNIC copies, fard / land records, passbook copies, loan agreements, guarantee deeds, bank advices, road cess challans, contractor agreements, licences / NOCs, insurance. Each has an authority, a reference, an issue / expiry date and the alert days.
  - A daily job marks them *Expiring Soon* / *Expired*.
  - The home page warns, and they can be linked to a grower or any record.

## Depot excess / short (weight)

Report **Depot Excess Short**: per depot (season to date) and per day, **weight received at the mill − weight bought at the depot**. It shows:
- bought (payable / net, with binding) and sent
- received
- the depot part (sent − bought net) and the transit part (received − sent)
- cane still **held** at the depot and **on the road**

The result adds back held cane and trucks on the road, so a depot still holding cane isn't shown short.

Demo: Kot Momin −2,665 kg (−0.68 %), Quaidabad −1,121 kg (−0.45 %), Ahmedpur Sial even (all still held).

## Reports (Report Centre → *Cane Accounts*, *Costing*, *Depot*)

| Report | What it shows |
|---|---|
| Grower Ledger | cane + loan ledgers with a running balance |
| Grower Payable Aging | 0–7 / 8–15 / 16–30 / 31–60 / 60+ days; the total ties to the Grower Payable ledger |
| Grower Trial Balance | opening, CPRs credited, paid, closing, loan outstanding |
| CPR Paid Unpaid | each CPR with its scroll, paid date, days to pay, cess deposited |
| Road Cess Deducted vs Deposited | by month |
| Grower Loan Register | every loan with its markup, recoveries and outstanding |
| **Cane Cost per Maund** | govt value + subsidies + the mill's cess + depot freight + commission + transit shortage, per payable maund; TPT shown as the grower's own cost |
| **Cost of Production per Bag** | cane at stock cost + packing + the expensed cane costs shared by the cane crushed − by-products → the full cost of a bag, beside the stock cost |
| Depot Excess Short | as above |

## Home

- **Tile:** *Cane Accounts*
- **Alerts:**
  - *CPRs unpaid for more than 15 days*
  - *Vault papers expiring or expired*
- **Day-close controls:** a fifth check, **Grower Loan Receivable = outstanding loans**

## Demo

`sc-demo` / `sc-reset-demo`:
- **Loans first:** 3 loan types and 24 October loans (approved by the Cane Manager, disbursed by the accountant), with October's markup. The season's CPRs then recover them: 18 CPRs, Rs 5.87 lac, 3 loans fully recovered.
- **Payment scrolls on 5–6 Nov:**
  - bank transfer for growers with an IBAN
  - a cheque scroll for the others
  - a draft scroll for 5 Nov
- **Cess and repayments:** a cess deposit for 1–4 Nov (challan RC-2026-11-001) and one cash repayment.
- **Bank letter settings:** Habib Bank Limited and the two signatories.
- **Generated documents:** the bank schedules and instruction letters, one stop-payment letter, the unpaid scroll, loan applications, and the contractor bills.
- **Contractors:**
  - unloading contract UC-2026-01 for Haider Transport, with an unloading bill for 2–5 Nov including 6 idle hours
  - 3 loading bills and 3 depot statements
- **Vault papers:** 23 (CNIC copies, loan agreements, the cess challan), one contract expiring soon, and one weighbridge certificate expired.

All five control accounts tie.

## Tested

- **4 new integration tests** (`tests/test_accounts.py`):
  - **Scroll:**
    - duplicates dropped; the IBAN rule; a CPR can't be on two scrolls
    - Payment Entry allocated to the CPR journals; grower balance back to 0; CPR paid and not cancellable
    - CSV, schedule, letters, stop-payment record, vault versions and attachment; cancel restores
  - **Cess deposit:** totals, journal, CPRs marked, nothing left to deposit, a deposited CPR not cancellable, cancel.
  - **Loans:**
    - per-acre limit; eligibility; approval; disbursement journal; markup once per month
    - CPR recovery = min(owed, 50 % of the net after TPT) with the journal line; repayment; application PDF
    - CPR cancel gives the recovery back
  - **Unloading bill:** contract rate; idle only for a long enough stoppage of a paid category, 1.5 h × 1,000; posted with the contractor; billed once.
- **Full suite: 134 green** (94 integration + 40 unit).

## Open points (need your input)

1. **Bank formats.** The bank file is a generic CSV. Send your bank's bulk-transfer format (HBL / MCB / UBL portals differ) and it can be written exactly. Letters use one signatory pair from Sugar Settings.
2. **Payment per grower vs per CPR.** One Payment Entry per grower per scroll, allocated to each CPR. Confirm.
3. **Loans in kind.** Fertilizer or seed given from the mill's store (not cash) would need a stock issue instead of the bank journal.
4. **Loan account type.** Grower Loan Receivable is a Payable-type ledger under the assets, because of how ERPNext ties party types to account types. It works in every report here; the ERPNext *Accounts Receivable* report won't list it.
5. **Idle payment rule.** Paid categories, minimum minutes, rate and the daily cap are on the contract. Confirm whether "No Cane" stoppages are paid.
6. **Depot excess.** A depot that is over (more weighed out than bought) is shown as excess. Say whether the contractor or the depot staff are credited or charged for it.
7. **Overheads in the cost per bag.** Salaries, power and stores come from the general ledger, so the "full cost" here is the full *cane* cost. A cost-centre allocation can be added.

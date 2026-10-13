## Sugarcane — MicroMax Sugar Mills ERP

Frappe / ERPNext v16 app for a Pakistani sugar mill: cane survey, indenting, procurement, weighbridge, CPR, TPT bilty,
road cess, laboratory, production, cane accounting, grower loans, costing and MIS. Growers are an ERPNext **Party Type**;
cane purchases post through Journal Entries and one daily cane Purchase Invoice.

- Architecture and decisions: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Phase notes: [docs/PHASE_0.md](docs/PHASE_0.md)

### Install

```bash
bench get-app https://github.com/maqmalak/sugarcane.git
bench --site <site> install-app sugarcane      # needs erpnext and hrms
bench --site <site> execute sugarcane.setup.company.ensure_company   # optional: MicroMax Sugar Mills Ltd. + cane ledgers
bench --site <site> sc-demo                     # optional: demo masters (500 growers)
```

### Develop

```bash
bench --site sugarcane.local run-tests --app sugarcane
cd frontend && npm install && npm run dev       # http://sugarcane.local:5179  → proxies to :8006
npm run build                                   # → sugarcane/public/frontend + www/sugar.html (/sugar)
```

### License

mit

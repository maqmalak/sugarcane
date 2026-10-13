# React app (`/sugar`)

The web portal is a fork of the real-estate MicroMax frontend, so it has the same look and the same building blocks:
- the app shell: sidebar, global search (Ctrl K), theme toggle and the Desktop tiles
- forms and lists generated from DocType meta
- the report centre
- the analytics kit

The sugar-specific code lives in `frontend/src/sc`.

| URL | What |
|---|---|
| `/sugar/home` | Desktop: tiles per app group, recent activity |
| `/sugar/survey` | Survey insights: KPIs, season comparison, trend, variety / circle / disease mix, measuring accuracy, top growers, overlaps |
| `/sugar/survey/quota` | Season quotas: each circle's quota for a season next to the survey's expected cane. You can edit one circle or several at once (scale by %, match the survey, spread the season target), then save with a reason. Saved quotas go in Crushing Season → Circle Quotas, recording the previous value, who changed it and when. A circle without a row uses the circle's own quota. Insights and the Circle Wise report read the season figure. Only Cane Manager, Cane Admin and System Manager can edit, and a Closed season is read-only |
| `/sugar/survey/map`, `/survey/geo`, `/survey/growers` | Survey Map (`?layers=attendance,tracks` adds layers), Area Map (pins + boundaries for every level), grower registry |
| `/sugar/field-force` | Field-force insights: attendance trend, today's board, check-in times, status mix |
| `/sugar/field-force/users` | Field users, circles, devices (approve / block) |
| `/sugar/setup` | Setup home: area hierarchy, sources, growers, crop, vehicles; each opens a generated list / form at `/setup/d/<doctype>` |
| `/sugar/reports` | Report centre: every Script Report in the sugar modules, with filters, preview, chart, Excel and PDF |
| `/sugar/mill/*` | Later phases (coming soon) |

## Backend endpoints

| Endpoint | Purpose |
|---|---|
| `sugarcane.api.v1.spa` | boot, form meta, quick entry |
| `sugarcane.api.v1.activity`, `connections`, `ledger` | ported from the real-estate app |
| `sugarcane.api.v1.insights.survey(season)`, `.field_force(days)` | data for the insights pages |
| `sugarcane.api.v1.quota.view(season)`, `.save(season, changes, reason)`, `.reset(season, circles)` | season quota adjustment |
| `sugarcane.exports.catalogue / preview / download` | report centre; new reports in the sugar modules show up automatically |

The shell also calls `mm_core` (home tiles, search), so **mm_core is installed on sugarcane.local**.

## Development

- **Dev server:** `cd frontend && npm run dev` serves port 5179. It proxies to :8006 and works on both sugarcane.local and sugarcane.localhost.
- **Production build:** `npm run build` writes to `sugarcane/public/frontend` and `sugarcane/www/sugar.html`. The built app is served at `http://sugarcane.local:8006/sugar`.

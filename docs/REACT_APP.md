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
| `/sugar/indenting` | Indenting (Phase 2): insights, `/generate` (preview + generate), `/lookup` (scan an indent), batches and indents at `/indenting/d/…` — see `docs/PHASE_2.md` |
| `/sugar/approvals/inbox` | Indent batches to authorize, overlap reviews, workflow / HR approvals |
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

## Maps on the setup pages

- **Area pages** (Division, District, Zone, Circle, Sector, Village, Competitor Mill):
  - each list has a map of every record, folded or open as you last left it; click a shape to open that record
  - each form has the pin and boundary editor, with the parent's outline dashed in yellow
  - the Area sidebar group opens with **Area Map** (`/setup/area-map`)
- **Sources, Depots and Loading Points:**
  - the list map shows each pin and its road route
  - the form's **Journey to mill** panel sets the location pin and draws the road route from the source to the mill
  - it shows straight-line km, road km, standard time to the mill (loaded), time back (empty) and the round trip
  - the server works these out on Save in `sugarcane.journey`, using Sugar Settings → *Cane Journey Standards*: road factor, loaded speed, empty speed and allowance
  - changing the mill pin or the standards recalculates every source
- **Back navigation:** links that open the full maps add `?from=`, and a **Back** button returns to the page you came from.

## Desktop, Connections, bell

- **Desktop:** `mm_core.home.get_home` is replaced by `sugarcane.api.v1.home.get_home` on this app's sites.
  - Needs Attention lists open overlaps, phones to approve, old drafts, surveyors not checked in, check-ins outside the circle, circles below 60% of quota, sources without a pin, and approvals.
  - Recent Activity and the tiles show cane work.
- **Connections tab:** `mm_core.connections.get_connections` is replaced by `sugarcane.api.v1.connections.get_connections`, which lists every sugar DocType linking to the record.
- **Bell:** `sugarcane.notify` writes Notification Logs, straight away rather than through the queue, for:
  - an overlap review opening (to the circle officer and managers)
  - an overlap review being decided (to the surveyors)
  - a phone waiting for approval (to the managers)
  - a check-in outside the circle (to the circle officer)
  - season quota changes (to the other managers)

  Demo records never notify. CRM notifications are only read where the CRM app is installed.

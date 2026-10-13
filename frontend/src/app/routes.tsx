import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "@/components/layout/app-shell";
import { ComingSoonPage, FullPageLoader } from "@/pages/common/ComingSoonPage";
import { LoginPage } from "@/pages/Auth/LoginPage";
import { ScProviders } from "@/sc/ScProviders";

// Heavier / less-frequently visited pages are code-split.
const DesktopPage = lazy(() => import("@/pages/Desktop/DesktopPage").then((m) => ({ default: m.DesktopPage })));
const SurveyInsightsPage = lazy(() => import("@/sc/pages/SurveyInsightsPage").then((m) => ({ default: m.SurveyInsightsPage })));
const ApprovalsInboxPage = lazy(() => import("@/sc/pages/ApprovalsInboxPage").then((m) => ({ default: m.ApprovalsInboxPage })));
const SeasonQuotaPage = lazy(() => import("@/sc/pages/SeasonQuotaPage").then((m) => ({ default: m.SeasonQuotaPage })));
const FieldForceInsightsPage = lazy(() => import("@/sc/pages/FieldForceInsightsPage").then((m) => ({ default: m.FieldForceInsightsPage })));
const SurveyMapPage = lazy(() => import("@/sc/pages/SurveyMapPage").then((m) => ({ default: m.SurveyMapPage })));
const AreaMapPage = lazy(() => import("@/sc/pages/AreaMapPage").then((m) => ({ default: m.AreaMapPage })));
const FieldForcePage = lazy(() => import("@/sc/pages/FieldForcePage").then((m) => ({ default: m.FieldForcePage })));
const GrowersPage = lazy(() => import("@/sc/pages/GrowersPage").then((m) => ({ default: m.GrowersPage })));
const SetupHomePage = lazy(() => import("@/sc/pages/SetupHomePage").then((m) => ({ default: m.SetupHomePage })));
const ReportsPage = lazy(() => import("@/sc/pages/Reports").then((m) => ({ default: m.ReportsPage })));
const MetaDocPage = lazy(() => import("@/sc/meta/MetaDocPage").then((m) => ({ default: m.MetaDocPage })));

const lazyPage = (node: ReactNode) => <Suspense fallback={<FullPageLoader />}>{node}</Suspense>;
const sugar = (node: ReactNode) => lazyPage(<ScProviders>{node}</ScProviders>);

const PHASES: [string, string, string][] = [
  ["indenting", "Indenting", "Phase 2 — indents from surveyed area × yield × quota, bulk printing with authorisation"],
  ["tokens", "Token issue", "Phase 3 — cane tokens with rates applied at issue, barcode slips"],
  ["yard", "Yard board", "Phase 3 — realtime inner / outer yard positions and hourly balance"],
  ["weighbridge", "Gate & Weighbridge", "Phase 3 — gross / tare from the hardware agent, camera snapshots, LCD"],
  ["cpr", "CPR & Bilty", "Phase 3 — cane purchase receipts, TPT bilty cash counter, daily cane purchase invoice"],
  ["depots", "Depots & Vehicles", "Phase 4 — loading-point vehicle registration and depot purchase"],
  ["lab", "Laboratory & Production", "Phase 5 — hourly samples, daily manufacturing report, production entries"],
  ["plant", "Plant", "Phase 5 — steam, juice, water and molasses levels"],
  ["accounts", "Cane Accounts & Loans", "Phase 6 — payment scrolls, road cess deposits, grower ledgers and loans"],
  ["mis", "MIS", "Phase 8 — realtime crushing and management dashboards"],
];

/** /sugar/* (BrowserRouter basename) — the MicroMax Sugar Mills app. */
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<Navigate to="/home" replace />} />
      <Route element={<AppShell />}>
        <Route path="home" element={lazyPage(<DesktopPage />)} />

        {/* EagleEye Survey */}
        <Route path="survey" element={sugar(<SurveyInsightsPage />)} />
        <Route path="survey/map" element={sugar(<SurveyMapPage />)} />
        <Route path="survey/quota" element={sugar(<SeasonQuotaPage />)} />
        <Route path="survey/geo" element={sugar(<AreaMapPage />)} />
        <Route path="survey/growers" element={sugar(<GrowersPage />)} />
        <Route path="survey/d/:slug" element={sugar(<MetaDocPage mode="list" />)} />
        <Route path="survey/d/:slug/:name" element={sugar(<MetaDocPage mode="form" />)} />

        {/* Field force */}
        <Route path="field-force" element={sugar(<FieldForceInsightsPage />)} />
        <Route path="field-force/users" element={sugar(<FieldForcePage />)} />
        <Route path="field-force/d/:slug" element={sugar(<MetaDocPage mode="list" />)} />
        <Route path="field-force/d/:slug/:name" element={sugar(<MetaDocPage mode="form" />)} />

        {/* Setup */}
        <Route path="setup" element={sugar(<SetupHomePage />)} />
        <Route path="setup/area-map" element={sugar(<AreaMapPage />)} />
        <Route path="setup/d/:slug" element={sugar(<MetaDocPage mode="list" />)} />
        <Route path="setup/d/:slug/:name" element={sugar(<MetaDocPage mode="form" />)} />

        {/* Reports */}
        <Route path="reports" element={sugar(<ReportsPage />)} />

        {/* later phases */}
        {PHASES.map(([path, title, description]) => (
          <Route key={path} path={`mill/${path}`} element={<ComingSoonPage title={title} description={description} />} />
        ))}

        {/* old paths from the first sugar app */}
        <Route path="survey/dashboard" element={<Navigate to="/survey" replace />} />
        <Route path="geo" element={<Navigate to="/survey/geo" replace />} />
        <Route path="growers" element={<Navigate to="/survey/growers" replace />} />
        <Route path="approvals" element={<Navigate to="/approvals/inbox" replace />} />
        <Route path="approvals/inbox" element={sugar(<ApprovalsInboxPage />)} />
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Route>
    </Routes>
  );
}

import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "@/components/layout/app-shell";
import { ComingSoonPage, FullPageLoader } from "@/pages/common/ComingSoonPage";
import { LoginPage } from "@/pages/Auth/LoginPage";
import { ScProviders } from "@/sc/ScProviders";

// Heavier / less-frequently visited pages are code-split.
const DesktopPage = lazy(() => import("@/pages/Desktop/DesktopPage").then((m) => ({ default: m.DesktopPage })));
const SurveyInsightsPage = lazy(() => import("@/sc/pages/SurveyInsightsPage").then((m) => ({ default: m.SurveyInsightsPage })));
const IndentInsightsPage = lazy(() => import("@/sc/pages/IndentInsightsPage").then((m) => ({ default: m.IndentInsightsPage })));
const IndentGeneratePage = lazy(() => import("@/sc/pages/IndentGeneratePage").then((m) => ({ default: m.IndentGeneratePage })));
const IndentLookupPage = lazy(() => import("@/sc/pages/IndentLookupPage").then((m) => ({ default: m.IndentLookupPage })));
const ElpDashboardPage = lazy(() => import("@/sc/pages/ElpPages").then((m) => ({ default: m.ElpDashboardPage })));
const ElpBoardPage = lazy(() => import("@/sc/pages/ElpPages").then((m) => ({ default: m.ElpBoardPage })));
const ElpGatePage = lazy(() => import("@/sc/pages/ElpPages").then((m) => ({ default: m.ElpGatePage })));
const proc = (name: string) => lazy(() => import("@/sc/pages/ProcurementPages").then((m) => ({ default: (m as unknown as Record<string, () => JSX.Element>)[name] })));
const ProcurementDashboardPage = proc("ProcurementDashboardPage");
const GatePage = proc("GatePage");
const WeighbridgePage = proc("WeighbridgePage");
const YardPage = proc("YardPage");
const CounterPage = proc("CounterPage");
const DayClosePage = proc("DayClosePage");
const DepotDashboardPage = lazy(() => import("@/sc/pages/DepotPages").then((m) => ({ default: m.DepotDashboardPage })));
const DispatchPage = lazy(() => import("@/sc/pages/DepotPages").then((m) => ({ default: m.DispatchPage })));
const labPage = (name: string) => lazy(() => import("@/sc/pages/LabPages").then((m) => ({ default: (m as unknown as Record<string, () => JSX.Element>)[name] })));
const LabDashboardPage = labPage("LabDashboardPage");
const LabEntryPage = labPage("LabEntryPage");
const VehicleSamplesPage = labPage("VehicleSamplesPage");
const StoppagesPage = labPage("StoppagesPage");
const DmrPage = labPage("DmrPage");
const ProductionPage = labPage("ProductionPage");
const PlantPage = labPage("PlantPage");
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
        <Route path="indenting" element={sugar(<IndentInsightsPage />)} />
        <Route path="indenting/generate" element={sugar(<IndentGeneratePage />)} />
        <Route path="indenting/lookup" element={sugar(<IndentLookupPage />)} />
        <Route path="indenting/d/:slug" element={sugar(<MetaDocPage mode="list" />)} />
        <Route path="indenting/d/:slug/:name" element={sugar(<MetaDocPage mode="form" />)} />
        <Route path="mill/indenting" element={<Navigate to="/indenting" replace />} />
        <Route path="elp" element={sugar(<ElpDashboardPage />)} />
        <Route path="elp/board" element={sugar(<ElpBoardPage />)} />
        <Route path="elp/gate" element={sugar(<ElpGatePage />)} />
        <Route path="elp/d/:slug" element={sugar(<MetaDocPage mode="list" />)} />
        <Route path="elp/d/:slug/:name" element={sugar(<MetaDocPage mode="form" />)} />
        <Route path="mill/depots" element={<Navigate to="/elp" replace />} />
        <Route path="procurement" element={sugar(<ProcurementDashboardPage />)} />
        <Route path="procurement/gate" element={sugar(<GatePage />)} />
        <Route path="procurement/weighbridge" element={sugar(<WeighbridgePage />)} />
        <Route path="procurement/yard" element={sugar(<YardPage />)} />
        <Route path="procurement/counter" element={sugar(<CounterPage />)} />
        <Route path="procurement/day-close" element={sugar(<DayClosePage />)} />
        <Route path="procurement/d/:slug" element={sugar(<MetaDocPage mode="list" />)} />
        <Route path="procurement/d/:slug/:name" element={sugar(<MetaDocPage mode="form" />)} />
        <Route path="depot" element={sugar(<DepotDashboardPage />)} />
        <Route path="depot/dispatch" element={sugar(<DispatchPage />)} />
        <Route path="depot/d/:slug" element={sugar(<MetaDocPage mode="list" />)} />
        <Route path="depot/d/:slug/:name" element={sugar(<MetaDocPage mode="form" />)} />
        <Route path="lab" element={sugar(<LabDashboardPage />)} />
        <Route path="lab/entry" element={sugar(<LabEntryPage />)} />
        <Route path="lab/vehicle" element={sugar(<VehicleSamplesPage />)} />
        <Route path="lab/stoppages" element={sugar(<StoppagesPage />)} />
        <Route path="lab/dmr" element={sugar(<DmrPage />)} />
        <Route path="lab/d/:slug" element={sugar(<MetaDocPage mode="list" />)} />
        <Route path="lab/d/:slug/:name" element={sugar(<MetaDocPage mode="form" />)} />
        <Route path="production" element={sugar(<ProductionPage />)} />
        <Route path="production/plant" element={sugar(<PlantPage />)} />
        <Route path="production/d/:slug" element={sugar(<MetaDocPage mode="list" />)} />
        <Route path="production/d/:slug/:name" element={sugar(<MetaDocPage mode="form" />)} />
        <Route path="mill/lab" element={<Navigate to="/lab" replace />} />
        <Route path="mill/plant" element={<Navigate to="/production/plant" replace />} />
        <Route path="mill/tokens" element={<Navigate to="/procurement/gate" replace />} />
        <Route path="mill/yard" element={<Navigate to="/procurement/yard" replace />} />
        <Route path="mill/weighbridge" element={<Navigate to="/procurement/weighbridge" replace />} />
        <Route path="mill/cpr" element={<Navigate to="/procurement" replace />} />
        <Route path="approvals" element={<Navigate to="/approvals/inbox" replace />} />
        <Route path="approvals/inbox" element={sugar(<ApprovalsInboxPage />)} />
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Route>
    </Routes>
  );
}

import { FrappeProvider } from "frappe-react-sdk";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Toaster } from "sonner";
import { SessionProvider, useSession } from "@/lib/session";
import { AppShell } from "@/components/layout/AppShell";
import { Spinner } from "@/components/ui/spinner";
import { LoginPage } from "@/pages/LoginPage";
import { HomePage } from "@/pages/HomePage";
import { GrowersPage } from "@/pages/GrowersPage";
import { ComingSoonPage } from "@/pages/ComingSoonPage";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { SurveyMapPage } from "@/pages/SurveyMapPage";
import { SurveyDashboardPage } from "@/pages/SurveyDashboardPage";
import { AreaMapPage } from "@/pages/AreaMapPage";
import { BUILT_PHASE, NAVIGATION } from "@/app/navigation";

const SITE = window.sugar_site && !window.sugar_site.startsWith("{{") ? window.sugar_site : "sugarcane.local";

export function App() {
  return (
    <FrappeProvider url="" siteName={SITE} enableSocket={false} swrConfig={{ revalidateOnFocus: false }}>
      <SessionProvider>
        <BrowserRouter basename="/sugar">
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/*" element={<RequireLogin />} />
          </Routes>
        </BrowserRouter>
        <Toaster richColors position="top-right" />
      </SessionProvider>
    </FrappeProvider>
  );
}

function RequireLogin() {
  const { boot, isLoading } = useSession();
  const location = useLocation();
  if (isLoading && !boot) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <Spinner size={22} />
      </div>
    );
  }
  if (!boot?.user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!boot.is_staff) return <NotFoundPage title="No access" message="Your account has no sugar mill role yet. Ask the Cane Admin to add one." />;
  const later = NAVIGATION.flatMap((g) => g.items).filter((i) => i.phase > BUILT_PHASE);
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/growers" element={<GrowersPage />} />
        <Route path="/survey" element={<SurveyMapPage />} />
        <Route path="/survey/dashboard" element={<SurveyDashboardPage />} />
        <Route path="/geo" element={<AreaMapPage />} />
        {later.map((item) => (
          <Route key={item.path} path={item.path} element={<ComingSoonPage item={item} />} />
        ))}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </AppShell>
  );
}

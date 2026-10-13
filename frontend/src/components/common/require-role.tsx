import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { EmptyState } from "./empty-state";
import { FullPageLoader } from "@/pages/common/ComingSoonPage";

/**
 * Client-side UX gate for admin-only routes. Frappe still enforces the real
 * permission on every API call underneath — this only avoids flashing admin
 * UI at users who can't act on it.
 */
export function RequireRole({ roles, children }: { roles: string[]; children: ReactNode }) {
  const { isLoading, hasRole } = useAuth();
  const navigate = useNavigate();

  if (isLoading) return <FullPageLoader />;

  if (!hasRole(...roles)) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="Access restricted"
        description={`This area requires the ${roles.join(" or ")} role.`}
        actionLabel="Back to Desktop"
        onAction={() => navigate("/home")}
      />
    );
  }

  return <>{children}</>;
}

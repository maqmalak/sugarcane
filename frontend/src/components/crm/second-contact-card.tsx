import { Link } from "react-router-dom";
import { Briefcase, Mail, Pencil, Phone, User, UserPlus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { avatarTone } from "@/components/common/avatar-tone";
import { WhatsAppIcon } from "@/components/common/whatsapp-icon";
import { whatsappUrl } from "@/utils/whatsapp";

export interface SecondContact {
  name?: string | null; gender?: string | null; designation?: string | null; email?: string | null; mobile?: string | null;
}

/** A lead's second contact person (custom `second_contact_*` fields): name, gender, designation, email and cell no. */
export function SecondContactCard({ contact, editUrl, organization, onWhatsApp }: {
  contact: SecondContact; editUrl: string; organization?: string | null; onWhatsApp?: (phone: string) => void;
}) {
  const { name, gender, designation, email, mobile } = contact;
  if (!name && !email && !mobile) {
    return (
      <Card className="flex flex-col items-center gap-3 px-6 py-12 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary"><UserPlus className="h-6 w-6" /></span>
        <div>
          <p className="font-semibold">No second contact yet</p>
          <p className="text-sm text-muted-foreground">Add another person at {organization || "this organization"} — e.g. a finance or CSR head.</p>
        </div>
        <Link to={editUrl} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          <UserPlus className="h-4 w-4" /> Add second contact
        </Link>
      </Card>
    );
  }
  const row = (icon: React.ReactNode, label: string, value: React.ReactNode) => (
    <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5">
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        <div className="truncate text-sm font-medium">{value || <span className="text-muted-foreground">—</span>}</div>
      </div>
    </div>
  );
  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center gap-3">
        <Avatar name={name || email || "?"} size="md" className={avatarTone(name || email || "?")} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-bold">{name || "—"}</p>
          <p className="truncate text-sm text-muted-foreground">{[designation, organization].filter(Boolean).join(" · ") || "Second contact person"}</p>
        </div>
        <Link to={editUrl} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-input px-3 text-xs font-medium hover:bg-muted">
          <Pencil className="h-3.5 w-3.5" /> Edit
        </Link>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {row(<User className="h-4 w-4" />, "Person name", name)}
        {row(<User className="h-4 w-4" />, "Gender", gender)}
        {row(<Briefcase className="h-4 w-4" />, "Designation", designation)}
        {row(<Mail className="h-4 w-4" />, "Email", email && <a href={`mailto:${email}`} className="text-primary hover:underline">{email}</a>)}
        {row(<Phone className="h-4 w-4" />, "Cell no", mobile && (
          <span className="flex items-center gap-2">
            <a href={`tel:${mobile.replace(/\s+/g, "")}`} className="hover:underline">{mobile}</a>
            {whatsappUrl(mobile) && onWhatsApp && (
              <button type="button" title="Call on WhatsApp" onClick={() => onWhatsApp(mobile)} className="text-emerald-600 hover:text-emerald-500 dark:text-emerald-400">
                <WhatsAppIcon className="h-4 w-4" />
              </button>
            )}
          </span>
        ))}
      </div>
    </Card>
  );
}

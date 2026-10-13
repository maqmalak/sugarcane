import type { ReactNode } from "react";
import { Mail, Phone } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { avatarTone } from "@/components/common/avatar-tone";
import { StatusBadge } from "@/components/common/status-badge";
import { WhatsAppIcon } from "@/components/common/whatsapp-icon";
import { whatsappUrl } from "@/utils/whatsapp";

/**
 * Compact contact header for a Lead / Deal: the name in bold with its status, then email, mobile (tap to call,
 * WhatsApp button) and one extra fact (organization, deal value…) on a single line — instead of four cards.
 */
export function CrmContactCard({ name, status, email, phone, extra, onWhatsApp }: {
  name: string; status?: string | null; email?: string | null; phone?: string | null; extra?: ReactNode; onWhatsApp?: () => void;
}) {
  const item = "flex min-w-0 items-center gap-1.5 text-sm";
  return (
    <Card className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <Avatar name={name} size="sm" className={avatarTone(name)} />
        <span className="truncate text-base font-bold">{name}</span>
        {status && <StatusBadge status={status} />}
      </div>
      <div className={item}>
        <Mail className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        {email ? <a href={`mailto:${email}`} className="truncate text-primary hover:underline">{email}</a> : <span className="text-muted-foreground">—</span>}
      </div>
      <div className={item}>
        <Phone className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        {phone ? <a href={`tel:${phone.replace(/\s+/g, "")}`} className="truncate font-medium hover:underline">{phone}</a> : <span className="text-muted-foreground">—</span>}
        {phone && whatsappUrl(phone) && onWhatsApp && (
          <button type="button" title="Call on WhatsApp" onClick={onWhatsApp} className="shrink-0 text-emerald-600 hover:text-emerald-500 dark:text-emerald-400">
            <WhatsAppIcon className="h-4 w-4" />
          </button>
        )}
      </div>
      {extra && <div className={`${item} ml-auto`}>{extra}</div>}
    </Card>
  );
}

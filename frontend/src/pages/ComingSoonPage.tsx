import { Construction } from "lucide-react";
import type { NavItem } from "@/app/navigation";
import { Card, CardContent } from "@/components/ui/card";

export function ComingSoonPage({ item }: { item: NavItem }) {
  return (
    <div className="mx-auto max-w-xl pt-10">
      <Card>
        <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
          <div className="rounded-full bg-amber-500/10 p-3 text-amber-600"><Construction className="h-7 w-7" /></div>
          <h1 className="text-lg font-semibold">{item.label}</h1>
          <p className="text-sm text-muted-foreground">This screen is built in phase {item.phase}.</p>
        </CardContent>
      </Card>
    </div>
  );
}

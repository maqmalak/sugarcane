import { useFrappeGetCall } from "frappe-react-sdk";
import { Link } from "react-router-dom";
import { Building2, Car, CircleDot, House, MapPin, Notebook, Users, Warehouse } from "lucide-react";
import { useSession } from "@/lib/session";
import { fmtDate, fmtInt, fmtMoney } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface Home {
  counts: Record<string, number | null>;
  circles: { name: string; circle_code: string; zone: string; affiliation: string; quota_maund: number; growers: number }[];
}

const TILES = [
  { key: "growers", label: "Growers", icon: Users },
  { key: "passbooks", label: "Active passbooks", icon: Notebook },
  { key: "circles", label: "Circles", icon: CircleDot },
  { key: "villages", label: "Villages", icon: House },
  { key: "sources", label: "Sources", icon: Building2 },
  { key: "loading_points", label: "Loading points", icon: MapPin },
  { key: "depots", label: "Depots", icon: Warehouse },
  { key: "vehicles", label: "Vehicles", icon: Car },
];

export function HomePage() {
  const { boot } = useSession();
  const { data, isLoading } = useFrappeGetCall<{ message: Home }>("sugarcane.api.v1.app.home", undefined, "sugar-home");
  const home = data?.message;
  const season = boot?.season;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Assalam-o-Alaikum, {boot?.full_name?.split(" ")[0]}</h1>
        <p className="text-sm text-muted-foreground">{boot?.company}</p>
      </div>

      {season && (
        <Card>
          <CardContent className="grid gap-4 p-5 sm:grid-cols-4">
            <Stat label="Crushing season" value={season.name} />
            <Stat label="Period" value={`${fmtDate(season.start_date)} – ${fmtDate(season.end_date)}`} />
            <Stat label="Govt rate (per 40 kg)" value={fmtMoney(season.govt_rate, boot?.currency)} />
            <Stat label="Crushing target" value={`${fmtInt(season.crushing_target_maund)} maund`} />
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {TILES.map((t) => {
          const value = home?.counts[t.key];
          if (home && value === null) return null;
          return (
            <Card key={t.key}>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="rounded-lg bg-primary/10 p-2.5 text-primary">
                  <t.icon className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">{t.label}</div>
                  {isLoading ? <Skeleton className="mt-1 h-6 w-16" /> : (
                    <div className="text-xl font-semibold tabular-nums">{fmtInt(value)}</div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {!!home?.circles.length && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Circles</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Circle</TableHead>
                  <TableHead>Zone</TableHead>
                  <TableHead>Affiliation</TableHead>
                  <TableHead className="text-right">Quota (maund)</TableHead>
                  <TableHead className="text-right">Growers</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {home.circles.map((c) => (
                  <TableRow key={c.name}>
                    <TableCell className="font-mono">{c.circle_code}</TableCell>
                    <TableCell>
                      <Link className="hover:underline" to={`/growers?circle=${encodeURIComponent(c.name)}`}>{c.name}</Link>
                    </TableCell>
                    <TableCell>{c.zone}</TableCell>
                    <TableCell>
                      <Badge variant={c.affiliation === "Own" ? "success" : c.affiliation === "Free" ? "warning" : "info"}>
                        {c.affiliation}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{fmtInt(c.quota_maund)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtInt(c.growers)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}

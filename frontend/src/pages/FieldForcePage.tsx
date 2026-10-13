/** Field force: surveyors and circle officers, their circles, devices, targets and today's attendance. */
import { useFrappeGetCall, useFrappePostCall } from "frappe-react-sdk";
import { CheckCircle2, MapPinned, Smartphone, UserPlus, Users } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { Dialog } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtInt } from "@/lib/format";

interface FieldUser {
  user: string; full_name: string; enabled: number; mobile?: string | null; roles: string[]; circles: string[]; devices: string[];
  today: { status: string; time_in: string; time_out: string | null; inside: number; km: number; attendance: string } | null;
  last_point: string | null; target_acres: number; target_surveys: number; done_acres: number; done_surveys: number;
}
interface Device {
  name: string; android_id: string; device_name?: string; app: string; status: string; assigned_user?: string | null;
  app_version?: string | null; os_version?: string | null; registered_on?: string | null; last_sync?: string | null;
}
interface Overview {
  season: string; users: FieldUser[]; devices: Device[]; circles: { name: string; circle_code: string }[]; can_manage: boolean;
  counts: { field_users: number; present: number; pending_devices: number };
}

export function FieldForcePage() {
  const { data, isLoading, mutate } = useFrappeGetCall<{ message: Overview }>("sugarcane.api.v1.field_force.overview");
  const { call: setDevice } = useFrappePostCall("sugarcane.api.v1.field_force.set_device_status");
  const { call: setEnabled } = useFrappePostCall("sugarcane.api.v1.field_force.set_enabled");
  const [circlesFor, setCirclesFor] = useState<FieldUser | null>(null);
  const [adding, setAdding] = useState(false);
  const d = data?.message;

  const run = async (p: Promise<unknown>, ok: string) => {
    try { await p; toast.success(ok); await mutate(); } catch (e) { toast.error((e as { message?: string })?.message ?? "Failed"); }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h1 className="text-2xl font-semibold">Field force</h1>
          <p className="text-sm text-muted-foreground">Surveyors, devices and today's attendance · season {d?.season ?? "…"}</p>
        </div>
        <Link to="/survey" className="inline-flex h-9 items-center gap-2 rounded-md border-[1.5px] border-input bg-input-bg px-4 text-sm font-medium hover:bg-accent">
          <MapPinned className="size-4" />Attendance on map
        </Link>
        {d?.can_manage && <Button onClick={() => setAdding(true)}><UserPlus />Add field user</Button>}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Tile icon={Users} label="Field users" value={d?.counts.field_users} />
        <Tile icon={CheckCircle2} label="Checked in today" value={d?.counts.present} />
        <Tile icon={Smartphone} label="Devices waiting for approval" value={d?.counts.pending_devices} tone={d?.counts.pending_devices ? "text-amber-600" : ""} />
      </div>

      <section className="form-card">
        <div className="form-card-head">Field users</div>
        {isLoading ? <Skeleton className="m-4 h-40" /> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead><TableHead>Circles</TableHead><TableHead>Today</TableHead><TableHead>Last GPS</TableHead>
                <TableHead className="text-right">Target</TableHead><TableHead>Devices</TableHead><TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(d?.users ?? []).map((u) => {
                const pct = u.target_acres ? Math.round((100 * u.done_acres) / u.target_acres) : 0;
                return (
                  <TableRow key={u.user} className={u.enabled ? "" : "opacity-50"}>
                    <TableCell>
                      <div className="font-medium">{u.full_name}</div>
                      <div className="text-xs text-muted-foreground">{u.user}</div>
                      <div className="mt-1 flex gap-1">{u.roles.map((r) => <Badge key={r} tone={r === "Surveyor" ? "blue" : "violet"}>{r}</Badge>)}</div>
                    </TableCell>
                    <TableCell className="max-w-[14rem]">
                      <div className="flex flex-wrap gap-1">{u.circles.length ? u.circles.map((c) => <Badge key={c}>{c}</Badge>) : <span className="text-xs text-muted-foreground">all circles</span>}</div>
                    </TableCell>
                    <TableCell>
                      {u.today ? (
                        <div className="text-xs">
                          <Badge tone={u.today.status === "Present" ? "green" : u.today.status === "Out of Area" ? "red" : "amber"}>{u.today.status}</Badge>
                          <div className="mt-1">In {u.today.time_in.slice(11, 16)}{u.today.time_out ? ` · out ${u.today.time_out.slice(11, 16)}` : " · in the field"}</div>
                          <div className="text-muted-foreground">{u.today.inside ? "inside geofence" : "outside geofence"} · {u.today.km ?? 0} km</div>
                        </div>
                      ) : <span className="text-xs text-muted-foreground">not checked in</span>}
                    </TableCell>
                    <TableCell className="text-xs">{u.last_point ? u.last_point.slice(11, 16) : "—"}</TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      <div>{fmtInt(u.done_acres)} / {fmtInt(u.target_acres)} acres</div>
                      <div className="text-muted-foreground">{u.done_surveys} / {u.target_surveys} fields · {pct}%</div>
                    </TableCell>
                    <TableCell className="text-xs">{u.devices.join(", ") || "—"}</TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      {d?.can_manage && (
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="outline" onClick={() => setCirclesFor(u)}>Circles</Button>
                          <Button size="sm" variant="ghost" onClick={() => run(setEnabled({ user: u.user, enabled: u.enabled ? 0 : 1 }),
                            u.enabled ? "Login disabled, devices blocked" : "Login enabled")}>{u.enabled ? "Disable" : "Enable"}</Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </section>

      <section className="form-card">
        <div className="form-card-head">Devices</div>
        <Table>
          <TableHeader>
            <TableRow><TableHead>Device</TableHead><TableHead>User</TableHead><TableHead>App</TableHead><TableHead>Registered</TableHead><TableHead>Last sync</TableHead><TableHead>Status</TableHead><TableHead /></TableRow>
          </TableHeader>
          <TableBody>
            {(d?.devices ?? []).map((x) => (
              <TableRow key={x.name}>
                <TableCell><div className="font-medium">{x.device_name ?? x.name}</div><div className="font-mono text-[11px] text-muted-foreground">{x.name} · {x.android_id}</div></TableCell>
                <TableCell className="text-xs">{x.assigned_user ?? "—"}</TableCell>
                <TableCell className="text-xs">{x.app} {x.app_version ?? ""}{x.os_version ? ` · Android ${x.os_version}` : ""}</TableCell>
                <TableCell className="text-xs">{x.registered_on?.slice(0, 16) ?? "—"}</TableCell>
                <TableCell className="text-xs">{x.last_sync?.slice(0, 16) ?? "never"}</TableCell>
                <TableCell><Badge tone={x.status === "Approved" ? "green" : x.status === "Pending" ? "amber" : "red"}>{x.status}</Badge></TableCell>
                <TableCell className="text-right">
                  {d?.can_manage && (
                    <div className="flex justify-end gap-1">
                      {x.status !== "Approved" && <Button size="sm" variant="success" onClick={() => run(setDevice({ name: x.name, status: "Approved" }), `${x.name} approved`)}>Approve</Button>}
                      {x.status !== "Blocked" && <Button size="sm" variant="outline" onClick={() => run(setDevice({ name: x.name, status: "Blocked" }), `${x.name} blocked`)}>Block</Button>}
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      {circlesFor && d && <CirclesDialog user={circlesFor} circles={d.circles} onClose={() => setCirclesFor(null)} onSaved={() => mutate()} />}
      {adding && d && <AddUserDialog circles={d.circles} onClose={() => setAdding(false)} onSaved={() => mutate()} />}
    </div>
  );
}

function Tile({ icon: Icon, label, value, tone }: { icon: typeof Users; label: string; value?: number; tone?: string }) {
  return (
    <Card><CardContent className="flex items-center gap-3 p-4">
      <div className="rounded-lg bg-primary/10 p-2.5 text-primary"><Icon className="size-5" /></div>
      <div><div className="text-xs text-muted-foreground">{label}</div><div className={`text-xl font-semibold tabular-nums ${tone ?? ""}`}>{fmtInt(value)}</div></div>
    </CardContent></Card>
  );
}

function CircleChecks({ circles, value, onChange }: { circles: { name: string; circle_code: string }[]; value: Set<string>; onChange: (s: Set<string>) => void }) {
  return (
    <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
      {circles.map((c) => (
        <label key={c.name} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted">
          <input type="checkbox" checked={value.has(c.name)} onChange={() => { const s = new Set(value); if (s.has(c.name)) s.delete(c.name); else s.add(c.name); onChange(s); }} />
          <span className="font-mono text-xs text-muted-foreground">{c.circle_code}</span>{c.name}
        </label>
      ))}
    </div>
  );
}

function CirclesDialog({ user, circles, onClose, onSaved }: { user: FieldUser; circles: { name: string; circle_code: string }[]; onClose: () => void; onSaved: () => void }) {
  const [value, setValue] = useState(new Set(user.circles));
  const { call, loading } = useFrappePostCall("sugarcane.api.v1.field_force.set_circles");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={`Circles · ${user.full_name}`}>
      <p className="mb-3 text-sm text-muted-foreground">The user sees growers, villages and surveys of these circles only, on the web and on the phone. Their attendance geofence comes from their target circles.</p>
      <CircleChecks circles={circles} value={value} onChange={setValue} />
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button disabled={loading} onClick={async () => {
          try { await call({ user: user.user, circles: JSON.stringify([...value]) }); toast.success("Circles saved"); onSaved(); onClose(); }
          catch (e) { toast.error((e as { message?: string })?.message ?? "Failed"); }
        }}>Save</Button>
      </div>
    </Dialog>
  );
}

function AddUserDialog({ circles, onClose, onSaved }: { circles: { name: string; circle_code: string }[]; onClose: () => void; onSaved: () => void }) {
  const [v, setV] = useState({ email: "", first_name: "", last_name: "", mobile: "", role: "Surveyor", password: "" });
  const [sel, setSel] = useState(new Set<string>());
  const { call, loading } = useFrappePostCall("sugarcane.api.v1.field_force.create_field_user");
  const field = (k: keyof typeof v, label: string, type = "text") => (
    <div><Label className="text-xs">{label}</Label><Input type={type} value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} /></div>
  );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Add field user">
      <div className="grid gap-3 sm:grid-cols-2">
        {field("email", "Email", "email")}
        <div><Label className="text-xs">Role</Label><Select value={v.role} onChange={(e) => setV({ ...v, role: e.target.value })}><option>Surveyor</option><option>Circle Officer</option></Select></div>
        {field("first_name", "First name")}{field("last_name", "Last name")}{field("mobile", "Mobile")}
        {field("password", "Password (empty = email a set-password link)", "password")}
      </div>
      <Label className="mt-4 text-xs">Circles</Label>
      <CircleChecks circles={circles} value={sel} onChange={setSel} />
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button disabled={loading || !v.email || !v.first_name} onClick={async () => {
          try {
            await call({ ...v, password: v.password || undefined, circles: JSON.stringify([...sel]) });
            toast.success(`${v.email} created — they sign in on the EagleEye app; approve the phone here`); onSaved(); onClose();
          } catch (e) { toast.error((e as { message?: string })?.message ?? "Failed"); }
        }}>Create</Button>
      </div>
    </Dialog>
  );
}

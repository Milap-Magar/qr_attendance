import { useEffect, useState } from "react";
import { Link, useFetcher } from "react-router";
import { CalendarClockIcon, Loader2Icon, PlusIcon, ScanLineIcon } from "lucide-react";
import { toast } from "sonner";

import type { Route } from "./+types/sessions";
import { FieldError } from "~/components/auth-shell";
import { CloseSessionButton } from "~/components/close-session-button";
import { EmptyState, PageHeader, StatusBadge } from "~/components/shared";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { api, toActionError } from "~/lib/api";
import { can, requireUser } from "~/lib/auth";
import { formatDateTime } from "~/lib/format";
import type { AttendanceSession } from "~/lib/types";

export const handle = { title: "Sessions" };

export async function clientLoader() {
  const me = await requireUser("sessions:manage");
  const sessions = await api<AttendanceSession[]>("/api/attendance/sessions");
  return { sessions, canScan: can(me, "attendance:scan") };
}

// one action, several buttons: the hidden "intent" field says which one was pressed
export async function clientAction({ request }: Route.ClientActionArgs) {
  const form = await request.formData();
  try {
    switch (form.get("intent")) {
      case "create": {
        const minutes = Number(form.get("duration"));
        const session = await api<AttendanceSession>("/api/attendance/sessions", {
          method: "POST",
          body: { title: form.get("title"), closesAt: new Date(Date.now() + minutes * 60_000).toISOString() },
        });
        return { ok: true as const, message: `"${session.title}" is open for ${minutes} minutes` };
      }
      case "close": {
        await api(`/api/attendance/sessions/${form.get("id")}/close`, { method: "PATCH" });
        return { ok: true as const, message: "Session closed" };
      }
      default:
        throw new Response("Unknown intent", { status: 400 });
    }
  } catch (error) {
    return toActionError(error);
  }
}

export default function Sessions({ loaderData }: Route.ComponentProps) {
  const { sessions, canScan } = loaderData;

  return (
    <>
      <PageHeader title="Sessions" description="A session is a class window. Scans only count while it's open.">
        <NewSessionDialog />
      </PageHeader>

      {sessions.length === 0 ? (
        <EmptyState icon={CalendarClockIcon} title="No sessions yet" description="Create your first session to start taking attendance.">
          <NewSessionDialog />
        </EmptyState>
      ) : (
        <Card className="py-0">
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Title</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden md:table-cell">Opens</TableHead>
                  <TableHead className="hidden md:table-cell">Closes</TableHead>
                  <TableHead className="text-right">Checked in</TableHead>
                  <TableHead className="pr-4 text-right">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="pl-4 font-medium">
                      <Link to={`/sessions/${s.id}`} className="hover:underline">
                        {s.title}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={s.status} />
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">{formatDateTime(s.opensAt)}</TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">{formatDateTime(s.closesAt)}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.checkedInCount}</TableCell>
                    <TableCell className="pr-4">
                      <div className="flex justify-end gap-2">
                        {s.status === "open" && canScan && (
                          <Button asChild size="sm" variant="outline">
                            <Link to={`/scan?session=${s.id}`}>
                              <ScanLineIcon /> Scan
                            </Link>
                          </Button>
                        )}
                        {s.status !== "closed" && <CloseSessionButton id={s.id} />}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </>
  );
}

const DURATIONS = [
  { minutes: 15, label: "15 minutes" },
  { minutes: 30, label: "30 minutes" },
  { minutes: 60, label: "1 hour" },
  { minutes: 90, label: "1.5 hours" },
  { minutes: 120, label: "2 hours" },
  { minutes: 180, label: "3 hours" },
];

function NewSessionDialog() {
  const [open, setOpen] = useState(false);
  const fetcher = useFetcher<typeof clientAction>();
  const busy = fetcher.state !== "idle";
  const error = fetcher.data && !fetcher.data.ok ? fetcher.data : undefined;

  // close the dialog once the session was created
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok) {
      toast.success(fetcher.data.message);
      setOpen(false);
    }
  }, [fetcher.state, fetcher.data]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <PlusIcon /> New session
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <fetcher.Form method="post" action="/sessions" className="grid gap-4">
          <DialogHeader>
            <DialogTitle>New session</DialogTitle>
            <DialogDescription>It opens right away and stops accepting scans when the time is up.</DialogDescription>
          </DialogHeader>
          <input type="hidden" name="intent" value="create" />
          <div className="grid gap-2">
            <Label htmlFor="title">Title</Label>
            <Input id="title" name="title" placeholder="Physics · Grade 10" required autoFocus />
            <FieldError errors={error?.fieldErrors?.title} />
          </div>
          <div className="grid gap-2">
            <Label>Duration</Label>
            <Select name="duration" defaultValue="60">
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DURATIONS.map((d) => (
                  <SelectItem key={d.minutes} value={String(d.minutes)}>
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {error && !error.fieldErrors && <p className="text-sm text-destructive">{error.error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2Icon className="animate-spin" />}
              Open session
            </Button>
          </DialogFooter>
        </fetcher.Form>
      </DialogContent>
    </Dialog>
  );
}

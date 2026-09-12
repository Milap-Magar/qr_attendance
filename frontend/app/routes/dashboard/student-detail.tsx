import { useEffect, useState } from "react";
import { Link, redirect, useFetcher } from "react-router";
import { ArrowLeftIcon, BanIcon, CalendarCheckIcon, CreditCardIcon, Loader2Icon, QrCodeIcon, Trash2Icon, TriangleAlertIcon } from "lucide-react";
import { toast } from "sonner";

import type { Route } from "./+types/student-detail";
import { FieldError } from "~/components/auth-shell";
import { QrCardDialog, type PrintableCard } from "~/components/qr-card-dialog";
import { EmptyState, PageHeader, StatCard } from "~/components/shared";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "~/components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { api, toActionError } from "~/lib/api";
import { can, requireUser } from "~/lib/auth";
import { formatDate, formatDay, formatTime } from "~/lib/format";
import type { ClassRow, Credential, IssuedCard, Student, StudentAttendance } from "~/lib/types";

export const handle = { title: "Student" };

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  const me = await requireUser("students:read");
  const canManageCards = can(me, "credentials:manage");
  const [student, classes, attendance, credentials] = await Promise.all([
    api<Student>(`/api/students/${params.studentId}`),
    api<ClassRow[]>("/api/classes"),
    can(me, "reports:read") ? api<StudentAttendance[]>(`/api/attendance/students/${params.studentId}`) : null,
    canManageCards ? api<Credential[]>(`/api/qr/credentials?studentId=${params.studentId}`) : null,
  ]);
  return {
    student,
    classes,
    attendance,
    credentials,
    schoolName: me.organization?.name ?? "",
    canManage: can(me, "students:manage"),
    canManageCards,
  };
}

export async function clientAction({ request, params }: Route.ClientActionArgs) {
  const form = await request.formData();
  const id = params.studentId;
  try {
    switch (form.get("intent")) {
      case "update": {
        const student = await api<Student>(`/api/students/${id}`, {
          method: "PATCH",
          body: {
            name: form.get("name"),
            rollNo: form.get("rollNo"),
            gender: form.get("gender"),
            classId: form.get("classId"),
            isActive: form.get("isActive") === "true",
          },
        });
        return { ok: true as const, intent: "update" as const, student };
      }
      case "reissue": {
        const card = await api<IssuedCard>("/api/qr/credentials", { method: "POST", body: { studentId: id } });
        return { ok: true as const, intent: "reissue" as const, card };
      }
      case "revoke": {
        await api(`/api/qr/credentials/${form.get("credentialId")}/revoke`, { method: "PATCH" });
        return { ok: true as const, intent: "revoke" as const };
      }
      case "delete": {
        await api(`/api/students/${id}`, { method: "DELETE" });
        return redirect(`/classes/${form.get("classId")}`);
      }
      default:
        throw new Response("Unknown intent", { status: 400 });
    }
  } catch (error) {
    return toActionError(error);
  }
}

export default function StudentDetail({ loaderData }: Route.ComponentProps) {
  const { student, classes, attendance, credentials, schoolName, canManage, canManageCards } = loaderData;
  const [issued, setIssued] = useState<PrintableCard | null>(null);

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2">
        <Link to={`/classes/${student.classId}`}>
          <ArrowLeftIcon /> {student.class.label}
        </Link>
      </Button>

      <PageHeader title={student.name} description={`Roll ${student.rollNo} · ${student.class.label} · ${student.class.academicYear}`}>
        {student.isActive ? <Badge variant="secondary">Enrolled</Badge> : <Badge variant="outline">Left</Badge>}
        {canManage && <DeleteStudentButton classId={student.classId} name={student.name} />}
      </PageHeader>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Days present" value={attendance?.length ?? "–"} hint="all time" icon={CalendarCheckIcon} />
        <StatCard label="Last seen" value={attendance?.[0] ? formatDay(attendance[0].attendanceDate) : "–"} hint={attendance?.[0] ? formatTime(attendance[0].scannedAt) : "never scanned"} icon={CalendarCheckIcon} />
        <StatCard label="Card" value={student.hasActiveCard ? "Active" : "None"} hint={student.hasActiveCard ? "can be scanned" : "issue one below"} icon={CreditCardIcon} />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <DetailsCard student={student} classes={classes} canManage={canManage} />

        <div className="grid content-start gap-6 lg:col-span-2">
          {canManageCards && <CardPanel student={student} credentials={credentials ?? []} onIssued={setIssued} />}

          <Card>
            <CardHeader>
              <CardTitle>Attendance</CardTitle>
              <CardDescription>Every day this student was marked present</CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              {attendance === null ? (
                <p className="px-6 py-4 text-sm text-muted-foreground">You don't have access to attendance reports.</p>
              ) : attendance.length === 0 ? (
                <p className="px-6 py-4 text-sm text-muted-foreground">No check-ins yet.</p>
              ) : (
                <div className="max-h-80 overflow-y-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-card">
                      <TableRow>
                        <TableHead className="pl-6">Day</TableHead>
                        <TableHead>Session</TableHead>
                        <TableHead className="pr-6 text-right">Time</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {attendance.map((day) => (
                        <TableRow key={day.id}>
                          <TableCell className="pl-6 font-medium">{formatDay(day.attendanceDate)}</TableCell>
                          <TableCell className="truncate text-muted-foreground">{day.session.title}</TableCell>
                          <TableCell className="pr-6 text-right tabular-nums">{formatTime(day.scannedAt)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <QrCardDialog card={issued} schoolName={schoolName} onClose={() => setIssued(null)} />
    </>
  );
}

const GENDERS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Prefer not to say" },
];

function DetailsCard({ student, classes, canManage }: { student: Student; classes: ClassRow[]; canManage: boolean }) {
  const fetcher = useFetcher<typeof clientAction>();
  const busy = fetcher.state !== "idle";
  const error = fetcher.data && !fetcher.data.ok ? fetcher.data : undefined;

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok && fetcher.data.intent === "update") toast.success("Saved");
  }, [fetcher.state, fetcher.data]);

  return (
    <Card className="lg:col-span-3">
      <CardHeader>
        <CardTitle>Details</CardTitle>
        <CardDescription>Roll number and class decide how this student is sorted and grouped in the register.</CardDescription>
      </CardHeader>
      <CardContent>
        {/* key: reset the inputs whenever the saved values change */}
        <fieldset disabled={!canManage} className="contents">
          <fetcher.Form method="post" className="grid gap-4" key={`${student.name}-${student.rollNo}-${student.classId}-${student.isActive}`}>
            <input type="hidden" name="intent" value="update" />
            <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
              <div className="grid gap-2">
                <Label htmlFor="rollNo">Roll no</Label>
                <Input id="rollNo" name="rollNo" defaultValue={student.rollNo} required />
                <FieldError errors={error?.fieldErrors?.rollNo} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="name">Full name</Label>
                <Input id="name" name="name" defaultValue={student.name} required />
                <FieldError errors={error?.fieldErrors?.name} />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Class</Label>
                <Select name="classId" defaultValue={student.classId}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {classes.map((row) => (
                      <SelectItem key={row.id} value={row.id}>
                        {row.label} · {row.academicYear}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Gender</Label>
                <Select name="gender" defaultValue={student.gender}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GENDERS.map((g) => (
                      <SelectItem key={g.value} value={g.value}>
                        {g.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Enrolment</Label>
              <Select name="isActive" defaultValue={String(student.isActive)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Enrolled</SelectItem>
                  <SelectItem value="false">Left the school</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                A student who left keeps their attendance history but can't be scanned, and drops out of the register.
              </p>
            </div>
            {error && !error.fieldErrors && <p className="text-sm text-destructive">{error.error}</p>}
            {canManage && (
              <Button type="submit" disabled={busy} className="justify-self-start">
                {busy && <Loader2Icon className="animate-spin" />}
                Save
              </Button>
            )}
          </fetcher.Form>
        </fieldset>
      </CardContent>
    </Card>
  );
}

// Re-issuing is the "lost card" flow, and it is destructive: the server hashes the new token and
// forgets the old one, so the card in the student's bag stops scanning the moment this succeeds.
function CardPanel({ student, credentials, onIssued }: { student: Student; credentials: Credential[]; onIssued: (card: PrintableCard) => void }) {
  const [confirming, setConfirming] = useState(false);
  const fetcher = useFetcher<typeof clientAction>();
  const busy = fetcher.state !== "idle";
  const active = credentials.find((credential) => !credential.revokedAt);

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    if (!fetcher.data.ok) return void toast.error(fetcher.data.error);
    if (fetcher.data.intent === "reissue") {
      setConfirming(false);
      onIssued({
        token: fetcher.data.card.token,
        createdAt: fetcher.data.card.createdAt,
        student: { name: student.name, rollNo: student.rollNo, classLabel: student.class.label },
      });
    } else if (fetcher.data.intent === "revoke") {
      toast.success("Card revoked");
    }
  }, [fetcher.state, fetcher.data]);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>QR card</CardTitle>
          <CardDescription>{active ? `Issued ${formatDate(active.createdAt)}` : "No working card — this student can't be scanned."}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm">
          {credentials.length === 0 ? (
            <p className="text-muted-foreground">No card has ever been issued.</p>
          ) : (
            credentials.slice(0, 4).map((credential) => (
              <div key={credential.id} className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">{formatDate(credential.createdAt)}</span>
                {credential.revokedAt ? <Badge variant="outline">Replaced</Badge> : <Badge variant="secondary">Active</Badge>}
              </div>
            ))
          )}
        </CardContent>
        <CardFooter className="flex-wrap gap-2 border-t">
          <Button onClick={() => setConfirming(true)} disabled={busy}>
            {busy ? <Loader2Icon className="animate-spin" /> : <QrCodeIcon />}
            {active ? "Re-issue card" : "Issue card"}
          </Button>
          {active && (
            <Button variant="ghost" disabled={busy} onClick={() => fetcher.submit({ intent: "revoke", credentialId: active.id }, { method: "post" })}>
              <BanIcon /> Revoke
            </Button>
          )}
        </CardFooter>
      </Card>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{active ? "Issue a replacement card?" : "Issue a card?"}</DialogTitle>
            <DialogDescription className="grid gap-2">
              {active && (
                <span className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-left text-amber-700 dark:text-amber-400">
                  <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
                  The card {student.name} is holding now stops working immediately. Only do this if it was lost or damaged.
                </span>
              )}
              <span>The new code is shown once, on the next screen. Print it before closing.</span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button disabled={busy} onClick={() => fetcher.submit({ intent: "reissue" }, { method: "post" })}>
              {busy && <Loader2Icon className="animate-spin" />}
              {active ? "Replace card" : "Issue card"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function DeleteStudentButton({ classId, name }: { classId: string; name: string }) {
  const [confirming, setConfirming] = useState(false);
  const fetcher = useFetcher<typeof clientAction>();
  const busy = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data && !fetcher.data.ok) toast.error(fetcher.data.error);
  }, [fetcher.state, fetcher.data]);

  return (
    <>
      <Button variant="ghost" size="icon" onClick={() => setConfirming(true)} aria-label={`Delete ${name}`}>
        <Trash2Icon />
      </Button>
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete {name}?</DialogTitle>
            <DialogDescription>
              This throws away their card and their whole attendance history. To record that they left the school, set enrolment to "Left" instead.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button variant="destructive" disabled={busy} onClick={() => fetcher.submit({ intent: "delete", classId }, { method: "post" })}>
              {busy && <Loader2Icon className="animate-spin" />}
              Delete for good
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

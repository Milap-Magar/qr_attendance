import { useEffect, useState } from "react";
import { Link, useFetcher } from "react-router";
import { ArrowLeftIcon, ClipboardCheckIcon, CreditCardIcon, Loader2Icon, PrinterIcon, UserPlusIcon, UsersIcon } from "lucide-react";
import { toast } from "sonner";

import type { Route } from "./+types/class-detail";
import { FieldError } from "~/components/auth-shell";
import { CardSheet, type SheetCard } from "~/components/card-sheet";
import { ImportStudentsDialog } from "~/components/import-students-dialog";
import { QrCardDialog, type PrintableCard } from "~/components/qr-card-dialog";
import { EmptyState, PageHeader, StatCard } from "~/components/shared";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "~/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "~/components/ui/dropdown-menu";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { api, toActionError } from "~/lib/api";
import { can, requireUser } from "~/lib/auth";
import { genderLabel } from "~/lib/format";
import type { ClassCards, ClassRow, ImportResult, Student, StudentWithCard } from "~/lib/types";
import { cn } from "~/lib/utils";

export const handle = { title: "Class" };

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  const me = await requireUser("classes:read");
  const [group, students] = await Promise.all([
    api<ClassRow>(`/api/classes/${params.classId}`),
    api<Student[]>(`/api/classes/${params.classId}/students`),
  ]);
  return {
    group,
    students,
    schoolName: me.organization?.name ?? "",
    canManageStudents: can(me, "students:manage"),
    canManageCards: can(me, "credentials:manage"),
    canSeeReports: can(me, "reports:read"),
  };
}

export async function clientAction({ request, params }: Route.ClientActionArgs) {
  const form = await request.formData();
  try {
    switch (form.get("intent")) {
      case "add-student": {
        const result = await api<StudentWithCard>("/api/students", {
          method: "POST",
          body: { classId: params.classId, rollNo: form.get("rollNo"), name: form.get("name"), gender: form.get("gender") },
        });
        return { ok: true as const, intent: "add-student" as const, result };
      }
      case "import": {
        const result = await api<ImportResult>("/api/students/import", {
          method: "POST",
          body: { classId: params.classId, rows: JSON.parse(String(form.get("rows"))) },
        });
        return { ok: true as const, intent: "import" as const, result };
      }
      case "issue-cards": {
        const result = await api<ClassCards>(`/api/classes/${params.classId}/cards`, {
          method: "POST",
          body: { only: form.get("only") },
        });
        return { ok: true as const, intent: "issue-cards" as const, result };
      }
      default:
        throw new Response("Unknown intent", { status: 400 });
    }
  } catch (error) {
    return toActionError(error);
  }
}

export default function ClassDetail({ loaderData }: Route.ComponentProps) {
  const { group, students, schoolName, canManageStudents, canManageCards, canSeeReports } = loaderData;
  // the plain tokens live only in these two pieces of state, until the user prints them
  const [sheet, setSheet] = useState<{ cards: SheetCard[] } | null>(null);
  const [issued, setIssued] = useState<PrintableCard | null>(null);

  const active = students.filter((student) => student.isActive);
  const withoutCard = active.filter((student) => !student.hasActiveCard).length;

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2">
        <Link to="/classes">
          <ArrowLeftIcon /> All classes
        </Link>
      </Button>

      <PageHeader title={group.label} description={`Academic year ${group.academicYear}`}>
        {canSeeReports && (
          <Button asChild variant="outline">
            <Link to={`/register?classId=${group.id}`}>
              <ClipboardCheckIcon /> Register
            </Link>
          </Button>
        )}
        {canManageCards && <PrintCardsButton missing={withoutCard} onIssued={(result) => setSheet({ cards: toSheetCards(result) })} />}
        {canManageStudents && (
          <>
            <ImportStudentsDialog classId={group.id} onImported={(result) => onImported(result, setSheet)} />
            <AddStudentDialog onIssued={setIssued} classLabel={group.label} />
          </>
        )}
      </PageHeader>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Students" value={active.length} hint={students.length > active.length ? `${students.length - active.length} left the class` : "on the roster"} icon={UsersIcon} />
        <StatCard label="With a card" value={active.length - withoutCard} hint="can be scanned" icon={CreditCardIcon} />
        <StatCard label="Waiting for a card" value={withoutCard} hint={withoutCard > 0 ? "print their cards" : "everyone has one"} icon={PrinterIcon} />
      </div>

      {students.length === 0 ? (
        <EmptyState icon={UsersIcon} title="No students yet" description="Add them one by one, or import the class list as a CSV. Each one gets a QR card immediately.">
          {canManageStudents && <AddStudentDialog onIssued={setIssued} classLabel={group.label} />}
        </EmptyState>
      ) : (
        <Card className="py-0">
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24 pl-4">Roll no</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="hidden sm:table-cell">Gender</TableHead>
                  <TableHead>Card</TableHead>
                  <TableHead className="pr-4">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {students.map((student) => (
                  <TableRow key={student.id} className={cn(!student.isActive && "opacity-60")}>
                    <TableCell className="pl-4 font-mono text-xs">{student.rollNo}</TableCell>
                    <TableCell className="font-medium">
                      <Link to={`/students/${student.id}`} className="hover:underline">
                        {student.name}
                      </Link>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground sm:table-cell">{genderLabel[student.gender]}</TableCell>
                    <TableCell>
                      {student.hasActiveCard ? (
                        <Badge variant="secondary">Issued</Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">
                          None
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="pr-4">{student.isActive ? "Enrolled" : <span className="text-muted-foreground">Left</span>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <QrCardDialog card={issued} schoolName={schoolName} onClose={() => setIssued(null)} />
      {sheet && <CardSheet cards={sheet.cards} classLabel={group.label} schoolName={schoolName} onClose={() => setSheet(null)} />}
    </>
  );
}

const toSheetCards = (result: ClassCards) => result.cards.map(({ student, card }) => ({ name: student.name, rollNo: student.rollNo, token: card.token }));

// An import answers with both halves: what went in (with their one-time tokens) and what didn't.
function onImported(result: ImportResult, setSheet: (sheet: { cards: SheetCard[] } | null) => void) {
  if (result.skippedCount > 0) {
    toast.warning(`${result.skippedCount} row${result.skippedCount === 1 ? "" : "s"} skipped: ${result.skipped.map((row) => row.rollNo).join(", ")}`);
  }
  if (result.imported === 0) return void toast.error("Nothing was imported.");
  toast.success(`${result.imported} student${result.imported === 1 ? "" : "s"} added`);
  setSheet({ cards: result.created.map(({ student, card }) => ({ name: student.name, rollNo: student.rollNo, token: card.token })) });
}

const GENDERS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Prefer not to say" },
];

function AddStudentDialog({ classLabel, onIssued }: { classLabel: string; onIssued: (card: PrintableCard) => void }) {
  const [open, setOpen] = useState(false);
  const fetcher = useFetcher<typeof clientAction>();
  const busy = fetcher.state !== "idle";
  const error = fetcher.data && !fetcher.data.ok ? fetcher.data : undefined;

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data?.ok || fetcher.data.intent !== "add-student") return;
    const { student, card } = fetcher.data.result;
    setOpen(false);
    // straight to the card: it is the only moment the token can be read
    onIssued({ token: card.token, createdAt: card.createdAt, student: { name: student.name, rollNo: student.rollNo, classLabel } });
  }, [fetcher.state, fetcher.data]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <UserPlusIcon /> Add student
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <fetcher.Form method="post" className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Add a student to {classLabel}</DialogTitle>
            <DialogDescription>Their QR card is issued at the same time, and shown once so you can print it.</DialogDescription>
          </DialogHeader>
          <input type="hidden" name="intent" value="add-student" />
          <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
            <div className="grid gap-2">
              <Label htmlFor="rollNo">Roll no</Label>
              <Input id="rollNo" name="rollNo" placeholder="07" required autoFocus />
              <FieldError errors={error?.fieldErrors?.rollNo} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="student-name">Full name</Label>
              <Input id="student-name" name="name" placeholder="Sita Kumari" required />
              <FieldError errors={error?.fieldErrors?.name} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Gender</Label>
            <Select name="gender" defaultValue="other">
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
          {error && !error.fieldErrors && <p className="text-sm text-destructive">{error.error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2Icon className="animate-spin" />}
              Add and issue card
            </Button>
          </DialogFooter>
        </fetcher.Form>
      </DialogContent>
    </Dialog>
  );
}

// "missing" is the safe default: it only prints for students who hold no working card.
// "all" reprints the class and kills every card already in a student's hand, so it asks first.
function PrintCardsButton({ missing, onIssued }: { missing: number; onIssued: (result: ClassCards) => void }) {
  const [confirming, setConfirming] = useState(false);
  const fetcher = useFetcher<typeof clientAction>();
  const busy = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    if (!fetcher.data.ok) return void toast.error(fetcher.data.error);
    if (fetcher.data.intent !== "issue-cards") return;
    setConfirming(false);
    const result = fetcher.data.result;
    if (result.issued === 0) toast.info("Everyone already holds a working card.");
    else onIssued(result);
  }, [fetcher.state, fetcher.data]);

  const issue = (only: "missing" | "all") => fetcher.submit({ intent: "issue-cards", only }, { method: "post" });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" disabled={busy}>
            {busy ? <Loader2Icon className="animate-spin" /> : <PrinterIcon />}
            Print cards
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuItem onSelect={() => issue("missing")}>
            <PrinterIcon />
            <span>
              Missing cards only
              <span className="block text-xs text-muted-foreground">{missing} student{missing === 1 ? "" : "s"} without one</span>
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirming(true)}>
            <PrinterIcon />
            <span>
              Reprint the whole class
              <span className="block text-xs opacity-80">Replaces every card</span>
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Reprint every card?</DialogTitle>
            <DialogDescription>
              Every card this class is holding stops working the moment the new ones are issued. Only do this when you are handing out a fresh batch.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button variant="destructive" disabled={busy} onClick={() => issue("all")}>
              {busy && <Loader2Icon className="animate-spin" />}
              Reprint all
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

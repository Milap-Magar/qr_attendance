import { useMemo } from "react";
import { Link, useSearchParams } from "react-router";
import { CheckCircle2Icon, ClipboardCheckIcon, DownloadIcon, LayersIcon, PercentIcon, ScanLineIcon, UserXIcon, UsersIcon } from "lucide-react";

import type { Route } from "./+types/register";
import { EmptyState, PageHeader, StatCard } from "~/components/shared";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { api } from "~/lib/api";
import { can, requireUser } from "~/lib/auth";
import { downloadCsv, toCsv } from "~/lib/csv";
import { formatDay, genderLabel } from "~/lib/format";
import type { ClassRow, DailyRegister } from "~/lib/types";
import { cn } from "~/lib/utils";

export const handle = { title: "Register" };

type Show = "all" | "present" | "absent";

// Class and date live in the URL: a teacher can bookmark "my class, today", and yesterday's
// register is a link you can send to the head teacher.
export async function clientLoader({ request }: Route.ClientLoaderArgs) {
  const me = await requireUser("reports:read");
  const params = new URL(request.url).searchParams;
  const classes = await api<ClassRow[]>("/api/classes");

  // no class chosen yet → the first one, so the page is never an empty form
  const classId = params.get("classId") ?? classes[0]?.id;
  const date = params.get("date");
  const register = classId
    ? await api<DailyRegister>(`/api/attendance/register?classId=${classId}${date ? `&date=${date}` : ""}`)
    : null;

  return { classes, register, canScan: can(me, "attendance:scan") };
}

export default function Register({ loaderData }: Route.ComponentProps) {
  const { classes, register, canScan } = loaderData;
  const [searchParams, setSearchParams] = useSearchParams();
  const show = (searchParams.get("show") ?? "all") as Show;

  const setParam = (key: string, value: string | null) =>
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (value === null) next.delete(key);
      else next.set(key, value);
      return next;
    });

  const rows = useMemo(
    () => (register?.students ?? []).filter((student) => (show === "all" ? true : show === "present" ? student.present : !student.present)),
    [register, show],
  );

  if (classes.length === 0) {
    return (
      <>
        <PageHeader title="Daily register" />
        <EmptyState icon={LayersIcon} title="No classes yet" description="The register lists one class at a time, so a class has to exist first.">
          <Button asChild>
            <Link to="/classes">Go to classes</Link>
          </Button>
        </EmptyState>
      </>
    );
  }

  const rate = register && register.total > 0 ? Math.round((register.present / register.total) * 100) : 0;

  function exportCsv() {
    if (!register) return;
    const csv = toCsv([
      ["Roll no", "Name", "Gender", "Status", "Time in"],
      ...register.students.map((student) => [
        student.rollNo,
        student.name,
        genderLabel[student.gender] ?? "",
        student.present ? "Present" : "Absent",
        student.scannedAt ? new Date(student.scannedAt).toLocaleTimeString() : "",
      ]),
    ]);
    downloadCsv(`register-${register.class.label.replace(/\s+/g, "-")}-${register.date}.csv`, csv);
  }

  return (
    <>
      <PageHeader title="Daily register" description="Who was present, class by class. One scan anywhere in the day marks a student present.">
        <Select value={register?.class.id ?? classes[0]!.id} onValueChange={(value) => setParam("classId", value)}>
          <SelectTrigger className="w-44">
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
        <Input
          type="date"
          className="w-40"
          aria-label="Date"
          value={register?.date ?? ""}
          onChange={(event) => setParam("date", event.target.value || null)}
        />
        {searchParams.has("date") && (
          <Button variant="ghost" onClick={() => setParam("date", null)}>
            Today
          </Button>
        )}
      </PageHeader>

      {register && (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Present" value={register.present} hint={formatDay(register.date)} icon={CheckCircle2Icon} />
            <StatCard label="Absent" value={register.absent} hint={register.absent === 0 ? "full house" : "not scanned today"} icon={UserXIcon} />
            <StatCard label="On roll" value={register.total} hint={`${register.class.label} · ${register.class.academicYear}`} icon={UsersIcon} />
            <StatCard label="Attendance" value={`${rate}%`} hint="of the class" icon={PercentIcon} />
          </div>

          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <Select value={show} onValueChange={(value) => setParam("show", value === "all" ? null : value)}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Everyone</SelectItem>
                <SelectItem value="present">Present only</SelectItem>
                <SelectItem value="absent">Absent only</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              {canScan && (
                <Button asChild variant="outline">
                  <Link to="/scan">
                    <ScanLineIcon /> Scanner
                  </Link>
                </Button>
              )}
              <Button variant="secondary" onClick={exportCsv} disabled={register.total === 0}>
                <DownloadIcon /> Export CSV
              </Button>
            </div>
          </div>

          {register.total === 0 ? (
            <EmptyState icon={UsersIcon} title="Nobody on this roster" description="Add students to the class and they'll appear here every day.">
              <Button asChild variant="outline">
                <Link to={`/classes/${register.class.id}`}>Open the class</Link>
              </Button>
            </EmptyState>
          ) : rows.length === 0 ? (
            <EmptyState
              icon={ClipboardCheckIcon}
              title={show === "absent" ? "Nobody is absent" : "Nobody is present yet"}
              description={show === "absent" ? "Every student on this roster was scanned today." : "No card has been scanned into an open session today."}
            />
          ) : (
            <Card className="py-0">
              <CardContent className="px-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16 pl-4">Roll</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead className="hidden sm:table-cell">Gender</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="pr-4 text-right">Time in</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((student) => (
                      <TableRow key={student.id} className={cn(!student.present && "bg-muted/30")}>
                        <TableCell className="pl-4 font-mono text-xs">{student.rollNo}</TableCell>
                        <TableCell className="font-medium">
                          <Link to={`/students/${student.id}`} className="hover:underline">
                            {student.name}
                          </Link>
                        </TableCell>
                        <TableCell className="hidden text-muted-foreground sm:table-cell">{genderLabel[student.gender]}</TableCell>
                        <TableCell>
                          {student.present ? (
                            <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                              Present
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-muted-foreground">
                              Absent
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="pr-4 text-right tabular-nums">
                          {student.scannedAt ? new Date(student.scannedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </>
  );
}

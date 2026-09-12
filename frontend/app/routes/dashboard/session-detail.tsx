import { Link } from "react-router";
import { ArrowLeftIcon, CalendarClockIcon, LayersIcon, LockIcon, ScanLineIcon, TimerIcon, UsersIcon } from "lucide-react";

import type { Route } from "./+types/session-detail";
import { CloseSessionButton } from "~/components/close-session-button";
import { EmptyState, PageHeader, StatCard, StatusBadge } from "~/components/shared";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { api } from "~/lib/api";
import { can, requireUser } from "~/lib/auth";
import { formatDateTime, formatTime } from "~/lib/format";
import type { AttendanceRecord, AttendanceSession } from "~/lib/types";

export const handle = { title: "Session" };

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  const me = await requireUser("sessions:manage");
  const canSeeRecords = can(me, "reports:read");
  const [session, records] = await Promise.all([
    api<AttendanceSession>(`/api/attendance/sessions/${params.sessionId}`),
    canSeeRecords ? api<AttendanceRecord[]>(`/api/attendance/sessions/${params.sessionId}/records`) : null,
  ]);
  return { session, records, canScan: can(me, "attendance:scan") };
}

// Scans arrive in whatever order students walk past the camera. Grouped by class and then by
// roll number, the list can be read against the paper register the office already keeps.
const byClassThenRoll = (a: AttendanceRecord, b: AttendanceRecord) =>
  a.class.label.localeCompare(b.class.label, undefined, { numeric: true }) ||
  a.student.rollNo.localeCompare(b.student.rollNo, undefined, { numeric: true });

export default function SessionDetail({ loaderData }: Route.ComponentProps) {
  const { session, records, canScan } = loaderData;
  const sorted = records && [...records].sort(byClassThenRoll);
  const classCount = new Set(records?.map((record) => record.class.id)).size;

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2">
        <Link to="/sessions">
          <ArrowLeftIcon /> All sessions
        </Link>
      </Button>

      <PageHeader title={session.title} description={`Opened ${formatDateTime(session.opensAt)}`}>
        <StatusBadge status={session.status} />
        {session.status === "open" && canScan && (
          <Button asChild>
            <Link to={`/scan?session=${session.id}`}>
              <ScanLineIcon /> Open scanner
            </Link>
          </Button>
        )}
        {/* posts to the /sessions route's action, which handles "close" */}
        {session.status !== "closed" && <CloseSessionButton id={session.id} />}
      </PageHeader>

      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <StatCard label="Checked in" value={session.checkedInCount} icon={UsersIcon} />
        <StatCard label="Classes" value={records ? classCount : "–"} hint="seen in this session" icon={LayersIcon} />
        <StatCard label="Opens" value={formatTime(session.opensAt)} hint={formatDateTime(session.opensAt)} icon={CalendarClockIcon} />
        <StatCard label="Closes" value={formatTime(session.closesAt)} hint={formatDateTime(session.closesAt)} icon={TimerIcon} />
      </div>

      <Card className="gap-0 pb-0">
        <CardHeader className="pb-6">
          <CardTitle>Scans</CardTitle>
          <CardDescription>Grouped by class, then roll number. A class's full present/absent list is on the register.</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {sorted === null ? (
            <EmptyState icon={LockIcon} title="Reports only" description="You can't see who checked in. The total above is still live." />
          ) : sorted.length === 0 ? (
            <EmptyState icon={UsersIcon} title="No one yet" description="Scanned students will show up here." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16 pl-6">Roll</TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead className="pr-6 text-right">Scanned at</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="pl-6 font-mono text-xs">{r.student.rollNo}</TableCell>
                    <TableCell className="font-medium">
                      <Link to={`/students/${r.student.id}`} className="hover:underline">
                        {r.student.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{r.class.label}</Badge>
                    </TableCell>
                    <TableCell className="pr-6 text-right tabular-nums">{formatTime(r.scannedAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}

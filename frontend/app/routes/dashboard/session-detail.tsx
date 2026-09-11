import { Link } from "react-router";
import { ArrowLeftIcon, CalendarClockIcon, LockIcon, ScanLineIcon, TimerIcon, UsersIcon } from "lucide-react";

import type { Route } from "./+types/session-detail";
import { CloseSessionButton } from "~/components/close-session-button";
import { EmptyState, PageHeader, StatCard, StatusBadge } from "~/components/shared";
import { Avatar, AvatarFallback } from "~/components/ui/avatar";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { api } from "~/lib/api";
import { can, requireUser } from "~/lib/auth";
import { formatDateTime, formatTime, initials } from "~/lib/format";
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

export default function SessionDetail({ loaderData }: Route.ComponentProps) {
  const { session, records, canScan } = loaderData;

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

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Checked in" value={session.checkedInCount} icon={UsersIcon} />
        <StatCard label="Opens" value={formatTime(session.opensAt)} hint={formatDateTime(session.opensAt)} icon={CalendarClockIcon} />
        <StatCard label="Closes" value={formatTime(session.closesAt)} hint={formatDateTime(session.closesAt)} icon={TimerIcon} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Attendance</CardTitle>
          <CardDescription>Students who checked in, in scan order</CardDescription>
        </CardHeader>
        <CardContent>
          {records === null ? (
            <EmptyState icon={LockIcon} title="Admins only" description="Only admins can see who checked in. The total above is still live." />
          ) : records.length === 0 ? (
            <EmptyState icon={UsersIcon} title="No one yet" description="Scanned students will show up here." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead className="text-right">Checked in at</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.map((r, i) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-muted-foreground tabular-nums">{i + 1}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="size-8">
                          <AvatarFallback className="text-xs">{initials(r.student.name)}</AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-medium">{r.student.name}</div>
                          <div className="text-xs text-muted-foreground">{r.student.email}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatTime(r.scannedAt)}</TableCell>
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

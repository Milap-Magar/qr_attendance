import { Link, redirect } from "react-router";
import { ArrowRightIcon, CalendarCheckIcon, CalendarClockIcon, ClipboardCheckIcon, QrCodeIcon, RadioIcon, ScanLineIcon, UsersIcon } from "lucide-react";

import type { Route } from "./+types/home";
import { EmptyState, PageHeader, StatCard, StatusBadge } from "~/components/shared";
import { Button } from "~/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { api } from "~/lib/api";
import { can, requireUser } from "~/lib/auth";
import { formatDate, formatDateTime, formatTime } from "~/lib/format";
import type { AttendanceSession, MyAttendance, User } from "~/lib/types";

export const handle = { title: "Overview" };

// fetch only what this user is allowed to see, all in parallel
export async function clientLoader() {
  const me = await requireUser();
  if (can(me, "platform:manage")) throw redirect("/schools"); // the platform operator has no school to show
  const [sessions, students, myAttendance] = await Promise.all([
    can(me, "sessions:manage") ? api<AttendanceSession[]>("/api/attendance/sessions") : null,
    can(me, "users:read") ? api<User[]>("/api/users?role=users") : null,
    me.role === "users" ? api<MyAttendance[]>("/api/attendance/me") : null,
  ]);
  return { me, sessions, studentCount: students?.length, myAttendance };
}

function greeting() {
  const hour = new Date().getHours();
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const { me, sessions, studentCount, myAttendance } = loaderData;
  const firstName = me.name.split(" ")[0];

  return (
    <>
      <PageHeader title={`${greeting()}, ${firstName}`} description={formatDate(new Date().toISOString())}>
        {can(me, "qr:self") && (
          <Button asChild size="lg">
            <Link to="/my-qr">
              <QrCodeIcon /> Show my QR
            </Link>
          </Button>
        )}
      </PageHeader>
      {sessions ? (
        <StaffOverview sessions={sessions} studentCount={studentCount} canScan={can(me, "attendance:scan")} />
      ) : (
        <StudentOverview attendance={myAttendance ?? []} />
      )}
    </>
  );
}

function StaffOverview({ sessions, studentCount, canScan }: { sessions: AttendanceSession[]; studentCount?: number; canScan: boolean }) {
  const open = sessions.filter((s) => s.status === "open");
  const today = new Date().toDateString();
  const checkedInToday = sessions
    .filter((s) => new Date(s.opensAt).toDateString() === today)
    .reduce((sum, s) => sum + s.checkedInCount, 0);

  return (
    <div className="grid gap-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Open now" value={open.length} hint="accepting scans" icon={RadioIcon} />
        <StatCard label="Checked in today" value={checkedInToday} hint="across today's sessions" icon={CalendarCheckIcon} />
        <StatCard label="Students" value={studentCount ?? "–"} hint="registered" icon={UsersIcon} />
        <StatCard label="Sessions" value={sessions.length} hint="all time" icon={CalendarClockIcon} />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Open sessions</CardTitle>
            <CardDescription>Start scanning cards for a live session</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {open.length === 0 ? (
              <EmptyState icon={RadioIcon} title="Nothing open right now" description="Open a session to start taking attendance.">
                <Button asChild size="sm">
                  <Link to="/sessions">Go to sessions</Link>
                </Button>
              </EmptyState>
            ) : (
              open.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{s.title}</p>
                    <p className="text-xs text-muted-foreground">
                      until {formatTime(s.closesAt)} · {s.checkedInCount} checked in
                    </p>
                  </div>
                  {canScan && (
                    <Button asChild size="sm">
                      <Link to={`/scan?session=${s.id}`}>
                        <ScanLineIcon /> Scan
                      </Link>
                    </Button>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Recent sessions</CardTitle>
            <CardDescription>The latest five</CardDescription>
            <CardAction>
              <Button asChild variant="ghost" size="sm">
                <Link to="/sessions">
                  View all <ArrowRightIcon />
                </Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            {sessions.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No sessions yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Session</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Checked in</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sessions.slice(0, 5).map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>
                        <Link to={`/sessions/${s.id}`} className="font-medium hover:underline">
                          {s.title}
                        </Link>
                        <div className="text-xs text-muted-foreground">{formatDateTime(s.opensAt)}</div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={s.status} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{s.checkedInCount}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StudentOverview({ attendance }: { attendance: MyAttendance[] }) {
  const now = new Date();
  const thisMonth = attendance.filter((a) => {
    const d = new Date(a.scannedAt);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;
  const last = attendance[0];

  return (
    <div className="grid gap-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Total check-ins" value={attendance.length} icon={ClipboardCheckIcon} />
        <StatCard label="This month" value={thisMonth} icon={CalendarCheckIcon} />
        <StatCard label="Last check-in" value={last ? formatTime(last.scannedAt) : "–"} hint={last ? formatDate(last.scannedAt) : "no check-ins yet"} icon={CalendarClockIcon} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent attendance</CardTitle>
          <CardDescription>Sessions you checked in to</CardDescription>
          <CardAction>
            <Button asChild variant="ghost" size="sm">
              <Link to="/attendance">
                View all <ArrowRightIcon />
              </Link>
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          {attendance.length === 0 ? (
            <EmptyState icon={QrCodeIcon} title="No check-ins yet" description="Show your QR card or phone to your teacher's scanner at the start of class." />
          ) : (
            <ul className="divide-y">
              {attendance.slice(0, 5).map((a) => (
                <li key={a.id} className="flex items-center justify-between py-3">
                  <span className="font-medium">{a.session.title}</span>
                  <span className="text-sm text-muted-foreground">{formatDateTime(a.scannedAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

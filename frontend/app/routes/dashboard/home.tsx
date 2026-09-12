import { Link, redirect } from "react-router";
import { ArrowRightIcon, CheckCircle2Icon, LayersIcon, PercentIcon, RadioIcon, ScanLineIcon, UsersIcon } from "lucide-react";

import type { Route } from "./+types/home";
import { EmptyState, PageHeader, StatCard, StatusBadge } from "~/components/shared";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { api } from "~/lib/api";
import { can, requireUser } from "~/lib/auth";
import { formatDate, formatDateTime, formatDay, formatTime } from "~/lib/format";
import type { AttendanceSession, DailySummary } from "~/lib/types";

export const handle = { title: "Overview" };

// fetch only what this user is allowed to see, all in parallel
export async function clientLoader() {
  const me = await requireUser();
  if (can(me, "platform:manage")) throw redirect("/schools"); // the platform operator has no school to show
  const [sessions, summary] = await Promise.all([
    can(me, "sessions:manage") ? api<AttendanceSession[]>("/api/attendance/sessions") : null,
    can(me, "reports:read") ? api<DailySummary>("/api/attendance/summary") : null,
  ]);
  return { me, sessions, summary, canScan: can(me, "attendance:scan") };
}

function greeting() {
  const hour = new Date().getHours();
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const { me, sessions, summary, canScan } = loaderData;
  const firstName = me.name.split(" ")[0];
  const open = sessions?.filter((s) => s.status === "open") ?? [];
  const rate = summary && summary.total > 0 ? Math.round((summary.present / summary.total) * 100) : 0;

  return (
    <>
      <PageHeader title={`${greeting()}, ${firstName}`} description={summary ? formatDay(summary.date) : formatDate(new Date().toISOString())}>
        {canScan && open.length > 0 && (
          <Button asChild size="lg">
            <Link to={`/scan?session=${open[0]!.id}`}>
              <ScanLineIcon /> Open the scanner
            </Link>
          </Button>
        )}
      </PageHeader>

      {/* a legacy student account: nothing here is for them any more */}
      {!sessions && !summary && (
        <EmptyState icon={UsersIcon} title="Nothing to show" description="This account has no access to attendance. Ask your school's admin about it." />
      )}

      <div className="grid gap-6">
        {summary && (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Present today" value={summary.present} hint={`of ${summary.total} on the rolls`} icon={CheckCircle2Icon} />
            <StatCard label="Attendance" value={`${rate}%`} hint="whole school" icon={PercentIcon} />
            <StatCard label="Open now" value={open.length} hint="accepting scans" icon={RadioIcon} />
            <StatCard label="Classes" value={summary.classes.length} hint="this school" icon={LayersIcon} />
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-5">
          {summary && (
            <Card className="gap-0 pb-0 lg:col-span-3">
              <CardHeader className="pb-6">
                <CardTitle>Today by class</CardTitle>
                <CardDescription>Open a class to see exactly who is missing</CardDescription>
                <CardAction>
                  <Button asChild variant="ghost" size="sm">
                    <Link to="/register">
                      Register <ArrowRightIcon />
                    </Link>
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent className="px-0">
                {summary.classes.length === 0 ? (
                  <EmptyState icon={LayersIcon} title="No classes yet" description="Create a class, add its students, and today's tally shows up here.">
                    <Button asChild size="sm">
                      <Link to="/classes">Go to classes</Link>
                    </Button>
                  </EmptyState>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="pl-6">Class</TableHead>
                        <TableHead className="text-right">Present</TableHead>
                        <TableHead className="text-right">Absent</TableHead>
                        <TableHead className="pr-6 text-right">On roll</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {summary.classes.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="pl-6 font-medium">
                            <Link to={`/register?classId=${row.id}`} className="hover:underline">
                              {row.label}
                            </Link>
                            <Badge variant="outline" className="ml-2">
                              {row.academicYear}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{row.present}</TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">{row.absent}</TableCell>
                          <TableCell className="pr-6 text-right tabular-nums">{row.total}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          )}

          {sessions && (
            <div className="grid content-start gap-6 lg:col-span-2">
              <Card>
                <CardHeader>
                  <CardTitle>Open sessions</CardTitle>
                  <CardDescription>Scans only count while one is open</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3">
                  {open.length === 0 ? (
                    <EmptyState icon={RadioIcon} title="Nothing open" description="Open a session to start taking attendance.">
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
                            until {formatTime(s.closesAt)} · {s.checkedInCount} scanned
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

              <Card>
                <CardHeader>
                  <CardTitle>Recent sessions</CardTitle>
                  <CardDescription>The latest five</CardDescription>
                  <CardAction>
                    <Button asChild variant="ghost" size="sm">
                      <Link to="/sessions">
                        All <ArrowRightIcon />
                      </Link>
                    </Button>
                  </CardAction>
                </CardHeader>
                <CardContent>
                  {sessions.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">No sessions yet.</p>
                  ) : (
                    <ul className="divide-y">
                      {sessions.slice(0, 5).map((s) => (
                        <li key={s.id} className="flex items-center justify-between gap-3 py-2.5">
                          <div className="min-w-0">
                            <Link to={`/sessions/${s.id}`} className="truncate font-medium hover:underline">
                              {s.title}
                            </Link>
                            <div className="text-xs text-muted-foreground">{formatDateTime(s.opensAt)}</div>
                          </div>
                          <StatusBadge status={s.status} />
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

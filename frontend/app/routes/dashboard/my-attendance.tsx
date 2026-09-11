import { ClipboardCheckIcon } from "lucide-react";

import type { Route } from "./+types/my-attendance";
import { EmptyState, PageHeader } from "~/components/shared";
import { Card, CardContent } from "~/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { api } from "~/lib/api";
import { requireUser } from "~/lib/auth";
import { formatDate, formatTime } from "~/lib/format";
import type { MyAttendance } from "~/lib/types";

export const handle = { title: "My attendance" };

export async function clientLoader() {
  await requireUser();
  return { attendance: await api<MyAttendance[]>("/api/attendance/me") };
}

export default function MyAttendancePage({ loaderData }: Route.ComponentProps) {
  const { attendance } = loaderData;

  return (
    <>
      <PageHeader title="My attendance" description={`You've checked in to ${attendance.length} session${attendance.length === 1 ? "" : "s"}.`} />
      {attendance.length === 0 ? (
        <EmptyState icon={ClipboardCheckIcon} title="No check-ins yet" description="Show your QR card or phone to your teacher's scanner at the start of class." />
      ) : (
        <Card className="py-0">
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Session</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="pr-4 text-right">Checked in at</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {attendance.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="pl-4 font-medium">{a.session.title}</TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(a.scannedAt)}</TableCell>
                    <TableCell className="pr-4 text-right tabular-nums">{formatTime(a.scannedAt)}</TableCell>
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

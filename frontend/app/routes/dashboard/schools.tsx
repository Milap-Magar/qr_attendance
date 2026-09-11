import { Building2Icon, CalendarClockIcon, GraduationCapIcon, UsersIcon } from "lucide-react";

import type { Route } from "./+types/schools";
import { EmptyState, PageHeader, StatCard } from "~/components/shared";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent } from "~/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { api } from "~/lib/api";
import { requireUser } from "~/lib/auth";
import { BRAND } from "~/lib/brand";
import { capitalize, formatDate, formatJoinCode, orgNoun } from "~/lib/format";
import type { PlatformOrganization } from "~/lib/types";

export const handle = { title: "Schools" };

// the platform operator's view: every school / college using the product
export async function clientLoader() {
  await requireUser("platform:manage");
  return { schools: await api<PlatformOrganization[]>("/api/organizations") };
}

export default function Schools({ loaderData }: Route.ComponentProps) {
  const { schools } = loaderData;
  const sum = (key: "students" | "staff" | "sessions") => schools.reduce((total, s) => total + s[key], 0);

  return (
    <>
      <PageHeader title="Schools" description={`Every school and college on ${BRAND.name}.`} />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Schools" value={schools.length} icon={Building2Icon} />
        <StatCard label="Students" value={sum("students")} icon={GraduationCapIcon} />
        <StatCard label="Staff" value={sum("staff")} hint="admins + teachers" icon={UsersIcon} />
        <StatCard label="Sessions" value={sum("sessions")} hint="all time" icon={CalendarClockIcon} />
      </div>

      {schools.length === 0 ? (
        <EmptyState icon={Building2Icon} title="No schools yet" description="Schools appear here as soon as they sign up at /signup." />
      ) : (
        <Card className="py-0">
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Students</TableHead>
                  <TableHead className="text-right">Staff</TableHead>
                  <TableHead className="text-right">Sessions</TableHead>
                  <TableHead className="hidden md:table-cell">Join code</TableHead>
                  <TableHead className="hidden pr-4 md:table-cell">Joined</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {schools.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="pl-4 font-medium">{s.name}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{capitalize(orgNoun[s.type]!)}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{s.students}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.staff}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.sessions}</TableCell>
                    <TableCell className="hidden font-mono text-xs md:table-cell">{formatJoinCode(s.joinCode)}</TableCell>
                    <TableCell className="hidden pr-4 text-muted-foreground md:table-cell">{formatDate(s.createdAt)}</TableCell>
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

import { Form, Link, useSearchParams } from "react-router";
import { GraduationCapIcon, SearchIcon } from "lucide-react";

import type { Route } from "./+types/students";
import { EmptyState, PageHeader } from "~/components/shared";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { api } from "~/lib/api";
import { requireUser } from "~/lib/auth";
import { genderLabel } from "~/lib/format";
import type { ClassRow, Student } from "~/lib/types";
import { cn } from "~/lib/utils";

export const handle = { title: "Students" };

const ALL_CLASSES = "all";

// Every filter lives in the URL, so a search can be bookmarked and the back button works.
export async function clientLoader({ request }: Route.ClientLoaderArgs) {
  await requireUser("students:read");
  const params = new URL(request.url).searchParams;
  const query = new URLSearchParams();
  if (params.get("q")) query.set("q", params.get("q")!);
  if (params.get("classId")) query.set("classId", params.get("classId")!);
  if (params.get("includeInactive") === "1") query.set("includeInactive", "true");

  const [students, classes] = await Promise.all([api<Student[]>(`/api/students?${query}`), api<ClassRow[]>("/api/classes")]);
  return { students, classes };
}

export default function Students({ loaderData }: Route.ComponentProps) {
  const { students, classes } = loaderData;
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get("q") ?? "";

  // keep the other filters when one of them changes
  const setParam = (key: string, value: string | null) =>
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (value === null) next.delete(key);
      else next.set(key, value);
      return next;
    });

  return (
    <>
      <PageHeader title="Students" description="Search the whole school by name or roll number.">
        <Select value={searchParams.get("classId") ?? ALL_CLASSES} onValueChange={(value) => setParam("classId", value === ALL_CLASSES ? null : value)}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_CLASSES}>All classes</SelectItem>
            {classes.map((row) => (
              <SelectItem key={row.id} value={row.id}>
                {row.label} · {row.academicYear}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={searchParams.get("includeInactive") === "1" ? "1" : "0"} onValueChange={(value) => setParam("includeInactive", value === "1" ? "1" : null)}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="0">Enrolled</SelectItem>
            <SelectItem value="1">Include left</SelectItem>
          </SelectContent>
        </Select>
      </PageHeader>

      {/* a plain form, so Enter searches and the query ends up in the URL */}
      <Form
        className="mb-4 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const value = new FormData(event.currentTarget).get("q");
          setParam("q", String(value ?? "").trim() || null);
        }}
      >
        <div className="relative flex-1">
          <SearchIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input name="q" defaultValue={search} key={search} placeholder="Name or roll number" className="pl-9" />
        </div>
        <Button type="submit" variant="secondary">
          Search
        </Button>
        {search && (
          <Button type="button" variant="ghost" onClick={() => setParam("q", null)}>
            Clear
          </Button>
        )}
      </Form>

      {students.length === 0 ? (
        <EmptyState
          icon={GraduationCapIcon}
          title={search ? `Nobody matches "${search}"` : "No students yet"}
          description={search ? "Try part of a name, or the roll number on their card." : "Students are added inside a class."}
        >
          <Button asChild variant="outline">
            <Link to="/classes">Go to classes</Link>
          </Button>
        </EmptyState>
      ) : (
        <Card className="py-0">
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24 pl-4">Roll no</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead className="hidden sm:table-cell">Gender</TableHead>
                  <TableHead className="pr-4">Card</TableHead>
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
                      {!student.isActive && <span className="ml-2 text-xs text-muted-foreground">left</span>}
                    </TableCell>
                    <TableCell>
                      <Link to={`/classes/${student.classId}`} className="text-muted-foreground hover:underline">
                        {student.class.label}
                      </Link>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground sm:table-cell">{genderLabel[student.gender]}</TableCell>
                    <TableCell className="pr-4">
                      {student.hasActiveCard ? (
                        <Badge variant="secondary">Issued</Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">
                          None
                        </Badge>
                      )}
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

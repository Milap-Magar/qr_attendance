import { useEffect, useState } from "react";
import { Link, useFetcher, useSearchParams } from "react-router";
import { LayersIcon, Loader2Icon, MoreHorizontalIcon, PlusIcon, Trash2Icon, UsersIcon } from "lucide-react";
import { toast } from "sonner";

import type { Route } from "./+types/classes";
import { FieldError } from "~/components/auth-shell";
import { EmptyState, PageHeader } from "~/components/shared";
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
import type { ClassRow } from "~/lib/types";

export const handle = { title: "Classes" };

const ALL_YEARS = "all";

// ?academicYear=2026 lives in the URL so the loader re-runs (and the filter survives a refresh)
export async function clientLoader({ request }: Route.ClientLoaderArgs) {
  const me = await requireUser("classes:read");
  const year = new URL(request.url).searchParams.get("academicYear");
  const [classes, years] = await Promise.all([
    api<ClassRow[]>(year ? `/api/classes?academicYear=${encodeURIComponent(year)}` : "/api/classes"),
    api<string[]>("/api/classes/academic-years"),
  ]);
  return { classes, years, canManage: can(me, "classes:manage") };
}

export async function clientAction({ request }: Route.ClientActionArgs) {
  const form = await request.formData();
  try {
    switch (form.get("intent")) {
      case "create": {
        const created = await api<ClassRow>("/api/classes", {
          method: "POST",
          body: { grade: form.get("grade"), section: form.get("section"), academicYear: form.get("academicYear") },
        });
        return { ok: true as const, intent: "create" as const, created };
      }
      case "delete": {
        await api(`/api/classes/${form.get("id")}`, { method: "DELETE" });
        return { ok: true as const, intent: "delete" as const };
      }
      default:
        throw new Response("Unknown intent", { status: 400 });
    }
  } catch (error) {
    return toActionError(error);
  }
}

export default function Classes({ loaderData }: Route.ComponentProps) {
  const { classes, years, canManage } = loaderData;
  const [searchParams, setSearchParams] = useSearchParams();
  const year = searchParams.get("academicYear") ?? ALL_YEARS;

  return (
    <>
      <PageHeader title="Classes" description="Every class in your school. Students, their cards and the register all hang off these.">
        {years.length > 0 && (
          <Select value={year} onValueChange={(value) => setSearchParams(value === ALL_YEARS ? {} : { academicYear: value })}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_YEARS}>All years</SelectItem>
              {years.map((y) => (
                <SelectItem key={y} value={y}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {canManage && <NewClassDialog years={years} />}
      </PageHeader>

      {classes.length === 0 ? (
        <EmptyState
          icon={LayersIcon}
          title={year === ALL_YEARS ? "No classes yet" : `No classes in ${year}`}
          description="Create a class first — students are added to one, and every report is grouped by it."
        >
          {canManage && <NewClassDialog years={years} />}
        </EmptyState>
      ) : (
        <Card className="py-0">
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Class</TableHead>
                  <TableHead className="hidden sm:table-cell">Grade</TableHead>
                  <TableHead className="hidden sm:table-cell">Section</TableHead>
                  <TableHead>Year</TableHead>
                  <TableHead className="text-right">Students</TableHead>
                  {canManage && (
                    <TableHead className="pr-4">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {classes.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="pl-4 font-medium">
                      <Link to={`/classes/${row.id}`} className="hover:underline">
                        {row.label}
                      </Link>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground sm:table-cell">{row.grade}</TableCell>
                    <TableCell className="hidden text-muted-foreground sm:table-cell">{row.section || "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{row.academicYear}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{row.studentCount}</TableCell>
                    {canManage && (
                      <TableCell className="pr-4 text-right">
                        <DeleteClassMenu row={row} />
                      </TableCell>
                    )}
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

// the current year is the sensible default for a new class, e.g. "2026"
const thisYear = String(new Date().getFullYear());

function NewClassDialog({ years }: { years: string[] }) {
  const [open, setOpen] = useState(false);
  const fetcher = useFetcher<typeof clientAction>();
  const busy = fetcher.state !== "idle";
  const error = fetcher.data && !fetcher.data.ok ? fetcher.data : undefined;

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok && fetcher.data.intent === "create") {
      toast.success(`${fetcher.data.created.label} created`);
      setOpen(false);
    }
  }, [fetcher.state, fetcher.data]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <PlusIcon /> New class
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <fetcher.Form method="post" action="/classes" className="grid gap-4">
          <DialogHeader>
            <DialogTitle>New class</DialogTitle>
            <DialogDescription>Grade and section are free text — "10", "Nursery" or "BSc CS 3rd Sem" are all fine.</DialogDescription>
          </DialogHeader>
          <input type="hidden" name="intent" value="create" />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="grade">Grade</Label>
              <Input id="grade" name="grade" placeholder="10" required autoFocus />
              <FieldError errors={error?.fieldErrors?.grade} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="section">Section</Label>
              <Input id="section" name="section" placeholder="A" />
              <p className="text-xs text-muted-foreground">Leave empty if the grade isn't split.</p>
              <FieldError errors={error?.fieldErrors?.section} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="academicYear">Academic year</Label>
            <Input id="academicYear" name="academicYear" list="known-years" defaultValue={years[0] ?? thisYear} required />
            <datalist id="known-years">
              {years.map((y) => (
                <option key={y} value={y} />
              ))}
            </datalist>
            <FieldError errors={error?.fieldErrors?.academicYear} />
          </div>
          {error && !error.fieldErrors && <p className="text-sm text-destructive">{error.error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2Icon className="animate-spin" />}
              Create class
            </Button>
          </DialogFooter>
        </fetcher.Form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteClassMenu({ row }: { row: ClassRow }) {
  const [confirming, setConfirming] = useState(false);
  const fetcher = useFetcher<typeof clientAction>();
  const busy = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    // CLASS_NOT_EMPTY is the common answer: the message names how many students are in the way
    if (!fetcher.data.ok) toast.error(fetcher.data.error);
    else if (fetcher.data.intent === "delete") {
      setConfirming(false);
      toast.success(`${row.label} deleted`);
    }
  }, [fetcher.state, fetcher.data]);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm">
            <MoreHorizontalIcon />
            <span className="sr-only">Actions for {row.label}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link to={`/classes/${row.id}`}>
              <UsersIcon /> Open roster
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirming(true)}>
            <Trash2Icon /> Delete class
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete {row.label}?</DialogTitle>
            <DialogDescription>
              {row.studentCount > 0
                ? `${row.studentCount} student${row.studentCount === 1 ? " is" : "s are"} still in this class. Move or remove them first.`
                : "This class is empty, so nothing else is affected."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button variant="destructive" disabled={busy} onClick={() => fetcher.submit({ intent: "delete", id: row.id }, { method: "post", action: "/classes" })}>
              {busy && <Loader2Icon className="animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

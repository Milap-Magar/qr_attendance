import { useEffect, useState } from "react";
import { useFetcher, useSearchParams } from "react-router";
import { Loader2Icon, UserPlusIcon, UsersIcon } from "lucide-react";
import { toast } from "sonner";

import type { Route } from "./+types/users";
import { FieldError } from "~/components/auth-shell";
import { EmptyState, PageHeader } from "~/components/shared";
import { Avatar, AvatarFallback } from "~/components/ui/avatar";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { api, toActionError } from "~/lib/api";
import { can, requireUser } from "~/lib/auth";
import { formatDate, initials, roleLabel } from "~/lib/format";
import type { Role, User } from "~/lib/types";

export const handle = { title: "Staff" };

// Students are roster rows, not accounts, so this page is only ever about admins and teachers.
const ROLE_FILTERS = [
  { value: "all", label: "Everyone" },
  { value: "teachers", label: "Teachers" },
  { value: "admin", label: "Admins" },
];

// the role filter lives in the URL (?role=teachers), so the loader re-runs when it changes
export async function clientLoader({ request }: Route.ClientLoaderArgs) {
  const me = await requireUser("users:read");
  const role = new URL(request.url).searchParams.get("role");
  const staff = await api<User[]>(role ? `/api/users?role=${role}` : "/api/users");
  return { staff, canCreate: can(me, "users:create") };
}

export async function clientAction({ request }: Route.ClientActionArgs) {
  const form = await request.formData();
  try {
    const user = await api<User>("/api/users", {
      method: "POST",
      body: { name: form.get("name"), email: form.get("email"), password: form.get("password"), role: form.get("role") },
    });
    return { ok: true as const, user };
  } catch (error) {
    return toActionError(error);
  }
}

export default function Staff({ loaderData }: Route.ComponentProps) {
  const { staff, canCreate } = loaderData;
  const [searchParams, setSearchParams] = useSearchParams();

  return (
    <>
      <PageHeader title="Staff" description="Everyone who can log in. Students don't have accounts — they live on the class rosters.">
        <Select value={searchParams.get("role") ?? "all"} onValueChange={(value) => setSearchParams(value === "all" ? {} : { role: value })}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ROLE_FILTERS.map((f) => (
              <SelectItem key={f.value} value={f.value}>
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {canCreate && <AddStaffDialog />}
      </PageHeader>

      {staff.length === 0 ? (
        <EmptyState icon={UsersIcon} title="Nobody found" description="Try a different filter." />
      ) : (
        <Card className="py-0">
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="hidden pr-4 md:table-cell">Joined</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {staff.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="pl-4">
                      <div className="flex items-center gap-3">
                        <Avatar className="size-8">
                          <AvatarFallback className="text-xs">{initials(user.name)}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <div className="truncate font-medium">{user.name}</div>
                          <div className="truncate text-xs text-muted-foreground">{user.email}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={user.role === "admin" ? "secondary" : "outline"}>{roleLabel[user.role]}</Badge>
                    </TableCell>
                    <TableCell className="hidden pr-4 text-muted-foreground md:table-cell">{formatDate(user.createdAt)}</TableCell>
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

const CREATABLE_ROLES: { value: Role; label: string; hint: string }[] = [
  { value: "teachers", label: "Teacher", hint: "Scans cards, opens sessions, reads the register." },
  { value: "admin", label: "Admin", hint: "Everything a teacher can do, plus classes, students, cards and settings." },
];

// only for accounts with users:create (school admins by default). The account joins the admin's school.
function AddStaffDialog() {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<Role>("teachers");
  const fetcher = useFetcher<typeof clientAction>();
  const busy = fetcher.state !== "idle";
  const error = fetcher.data && !fetcher.data.ok ? fetcher.data : undefined;

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok) {
      toast.success(`${fetcher.data.user.name} was added`);
      setOpen(false);
    }
  }, [fetcher.state, fetcher.data]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <UserPlusIcon /> Add staff
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <fetcher.Form method="post" className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Add staff</DialogTitle>
            <DialogDescription>Create a teacher or admin account in your school. Share the password with them.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="new-name">Full name</Label>
            <Input id="new-name" name="name" required />
            <FieldError errors={error?.fieldErrors?.name} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="new-email">Email</Label>
            <Input id="new-email" name="email" type="email" required />
            <FieldError errors={error?.fieldErrors?.email} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="new-password">Temporary password</Label>
            <Input id="new-password" name="password" type="text" autoComplete="off" required />
            <FieldError errors={error?.fieldErrors?.password} />
          </div>
          <div className="grid gap-2">
            <Label>Role</Label>
            <Select name="role" value={role} onValueChange={(value) => setRole(value as Role)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CREATABLE_ROLES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{CREATABLE_ROLES.find((r) => r.value === role)?.hint}</p>
          </div>
          {error && !error.fieldErrors && <p className="text-sm text-destructive">{error.error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2Icon className="animate-spin" />}
              Add staff
            </Button>
          </DialogFooter>
        </fetcher.Form>
      </DialogContent>
    </Dialog>
  );
}

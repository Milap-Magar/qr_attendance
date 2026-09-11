import { useEffect, useState } from "react";
import { useFetcher, useSearchParams } from "react-router";
import { BanIcon, Loader2Icon, MoreHorizontalIcon, QrCodeIcon, UserPlusIcon, UsersIcon } from "lucide-react";
import { toast } from "sonner";

import type { Route } from "./+types/users";
import { FieldError } from "~/components/auth-shell";
import { QrCardDialog, type IssuedCard } from "~/components/qr-card-dialog";
import { EmptyState, PageHeader } from "~/components/shared";
import { Avatar, AvatarFallback } from "~/components/ui/avatar";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "~/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "~/components/ui/dropdown-menu";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { api, toActionError } from "~/lib/api";
import { can, requireUser } from "~/lib/auth";
import { formatDate, initials, roleLabel } from "~/lib/format";
import type { Credential, Role, User } from "~/lib/types";

export const handle = { title: "Users" };

const ROLE_FILTERS = [
  { value: "all", label: "Everyone" },
  { value: "users", label: "Students" },
  { value: "teachers", label: "Teachers" },
  { value: "admin", label: "Admins" },
];

// the role filter lives in the URL (?role=users), so the loader re-runs when it changes
export async function clientLoader({ request }: Route.ClientLoaderArgs) {
  const me = await requireUser("users:read");
  const role = new URL(request.url).searchParams.get("role");
  const canManageCards = can(me, "credentials:manage");

  const [users, credentials] = await Promise.all([
    api<User[]>(role ? `/api/users?role=${role}` : "/api/users"),
    canManageCards ? api<Credential[]>("/api/qr/credentials") : [],
  ]);

  // userId → their active (not revoked) printed card. Phone QRs (method "device") are the student's own business.
  const activeCards = Object.fromEntries(credentials.filter((c) => !c.revokedAt && c.method === "card").map((c) => [c.userId, c]));
  return { users, activeCards, canManageCards, canCreate: can(me, "users:create") };
}

export async function clientAction({ request }: Route.ClientActionArgs) {
  const form = await request.formData();
  try {
    switch (form.get("intent")) {
      case "issue-card": {
        const card = await api<Credential & { token: string }>("/api/qr/credentials", {
          method: "POST",
          body: { userId: form.get("userId") },
        });
        return { ok: true as const, intent: "issue-card" as const, card };
      }
      case "revoke-card": {
        await api(`/api/qr/credentials/${form.get("credentialId")}/revoke`, { method: "PATCH" });
        return { ok: true as const, intent: "revoke-card" as const };
      }
      case "create-user": {
        const user = await api<User>("/api/users", {
          method: "POST",
          body: { name: form.get("name"), email: form.get("email"), password: form.get("password"), role: form.get("role") },
        });
        return { ok: true as const, intent: "create-user" as const, user };
      }
      default:
        throw new Response("Unknown intent", { status: 400 });
    }
  } catch (error) {
    return toActionError(error);
  }
}

export default function Users({ loaderData }: Route.ComponentProps) {
  const { users, activeCards, canManageCards, canCreate } = loaderData;
  const [searchParams, setSearchParams] = useSearchParams();
  const cardFetcher = useFetcher<typeof clientAction>();
  const [issued, setIssued] = useState<IssuedCard | null>(null);

  // react to "issue card" / "revoke card" results
  useEffect(() => {
    const data = cardFetcher.data;
    if (cardFetcher.state !== "idle" || !data) return;
    if (!data.ok) {
      toast.error(data.error);
    } else if (data.intent === "issue-card") {
      const user = users.find((u) => u.id === data.card.userId);
      if (user) setIssued({ token: data.card.token, createdAt: data.card.createdAt, user });
    } else if (data.intent === "revoke-card") {
      toast.success("Card revoked");
    }
  }, [cardFetcher.state, cardFetcher.data]);

  const issueCard = (userId: string) => cardFetcher.submit({ intent: "issue-card", userId }, { method: "post" });
  const revokeCard = (credentialId: string) => cardFetcher.submit({ intent: "revoke-card", credentialId }, { method: "post" });

  return (
    <>
      <PageHeader title="Users" description={canManageCards ? "Everyone in your school. Issue and manage their QR cards here." : "Everyone in your school."}>
        <Select
          value={searchParams.get("role") ?? "all"}
          onValueChange={(value) => setSearchParams(value === "all" ? {} : { role: value })}
        >
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
        {canCreate && <AddUserDialog />}
      </PageHeader>

      {users.length === 0 ? (
        <EmptyState icon={UsersIcon} title="No users found" description="Try a different filter." />
      ) : (
        <Card className="py-0">
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Name</TableHead>
                  <TableHead>Role</TableHead>
                  {canManageCards && <TableHead>QR card</TableHead>}
                  <TableHead className="hidden md:table-cell">Joined</TableHead>
                  {canManageCards && (
                    <TableHead className="pr-4">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => {
                  const card = activeCards[user.id];
                  const busy = cardFetcher.state !== "idle" && cardFetcher.formData?.get("userId") === user.id;
                  return (
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
                        <Badge variant={user.role === "users" ? "secondary" : "outline"}>{roleLabel[user.role]}</Badge>
                      </TableCell>
                      {canManageCards && (
                        <TableCell>
                          {card ? (
                            <span className="text-sm">Active · {formatDate(card.createdAt)}</span>
                          ) : (
                            <span className="text-sm text-muted-foreground">No card</span>
                          )}
                        </TableCell>
                      )}
                      <TableCell className="hidden text-muted-foreground md:table-cell">{formatDate(user.createdAt)}</TableCell>
                      {canManageCards && (
                        <TableCell className="pr-4 text-right">
                          {busy ? (
                            <Loader2Icon className="ml-auto size-4 animate-spin text-muted-foreground" />
                          ) : (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon-sm">
                                  <MoreHorizontalIcon />
                                  <span className="sr-only">Actions</span>
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onSelect={() => issueCard(user.id)}>
                                  <QrCodeIcon /> {card ? "Issue new card" : "Issue card"}
                                </DropdownMenuItem>
                                {card && (
                                  <DropdownMenuItem variant="destructive" onSelect={() => revokeCard(card.id)}>
                                    <BanIcon /> Revoke card
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <QrCardDialog card={issued} onClose={() => setIssued(null)} />
    </>
  );
}

const CREATABLE_ROLES: { value: Role; label: string }[] = [
  { value: "users", label: "Student" },
  { value: "teachers", label: "Teacher" },
  { value: "admin", label: "Admin" },
];

// only for accounts with users:create (school admins by default). The account joins the admin's school.
function AddUserDialog() {
  const [open, setOpen] = useState(false);
  const fetcher = useFetcher<typeof clientAction>();
  const busy = fetcher.state !== "idle";
  const error = fetcher.data && !fetcher.data.ok ? fetcher.data : undefined;

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok && fetcher.data.intent === "create-user") {
      toast.success(`${fetcher.data.user.name} was added`);
      setOpen(false);
    }
  }, [fetcher.state, fetcher.data]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <UserPlusIcon /> Add user
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <fetcher.Form method="post" className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Add user</DialogTitle>
            <DialogDescription>Create a student, teacher or admin account in your school. Share the password with them.</DialogDescription>
          </DialogHeader>
          <input type="hidden" name="intent" value="create-user" />
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
            <Select name="role" defaultValue="users">
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
          </div>
          {error && !error.fieldErrors && <p className="text-sm text-destructive">{error.error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2Icon className="animate-spin" />}
              Add user
            </Button>
          </DialogFooter>
        </fetcher.Form>
      </DialogContent>
    </Dialog>
  );
}

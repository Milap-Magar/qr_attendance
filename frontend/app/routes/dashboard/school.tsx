import { useEffect, useState } from "react";
import { Link, useFetcher, useSearchParams } from "react-router";
import { CalendarClockIcon, CopyIcon, Loader2Icon, MonitorIcon, PartyPopperIcon, RefreshCwIcon, UserPlusIcon, UsersIcon } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";

import type { Route } from "./+types/school";
import { FieldError } from "~/components/auth-shell";
import { PageHeader } from "~/components/shared";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "~/components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { api, toActionError } from "~/lib/api";
import { requireUser, resetMe } from "~/lib/auth";
import { capitalize, formatJoinCode, orgNoun } from "~/lib/format";
import type { ManagedOrganization, OrganizationType } from "~/lib/types";

export const handle = { title: "School" };

const TYPES: { value: OrganizationType; label: string }[] = [
  { value: "school", label: "School" },
  { value: "college", label: "College" },
  { value: "university", label: "University" },
  { value: "other", label: "Other" },
];

export async function clientLoader() {
  await requireUser("organization:manage");
  return { org: await api<ManagedOrganization>("/api/organizations/current") };
}

export async function clientAction({ request }: Route.ClientActionArgs) {
  const form = await request.formData();
  try {
    if (form.get("intent") === "regenerate") {
      await api<ManagedOrganization>("/api/organizations/current/join-code", { method: "POST" });
      return { ok: true as const, intent: "regenerate" as const };
    }
    await api<ManagedOrganization>("/api/organizations/current", {
      method: "PATCH",
      body: { name: form.get("name"), type: form.get("type") },
    });
    resetMe(); // the sidebar shows the school name from the cached /me
    return { ok: true as const, intent: "update" as const };
  } catch (error) {
    return toActionError(error);
  }
}

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copied`);
  } catch {
    toast.error("Couldn't copy. Select it and copy by hand.");
  }
}

export default function School({ loaderData }: Route.ComponentProps) {
  const { org } = loaderData;
  const noun = orgNoun[org.type]!;
  const [searchParams] = useSearchParams();
  const joinLink = `${window.location.origin}/register?code=${org.joinCode}`;
  const [projecting, setProjecting] = useState(false);

  return (
    <>
      <PageHeader title={org.name} description={`Invite students and manage your ${noun}.`} />

      {searchParams.has("welcome") && <WelcomeCard name={org.name} />}

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Invite students</CardTitle>
            <CardDescription>
              Students sign up with this code and land in {org.name}. Share the link, or show the QR in class and they scan it with their phone.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6 sm:grid-cols-[auto_1fr] sm:items-center">
            <div className="mx-auto rounded-xl border bg-white p-3">
              <QRCodeSVG value={joinLink} size={148} marginSize={1} />
            </div>
            <div className="grid gap-4">
              <div className="grid gap-1.5">
                <Label>Join code</Label>
                <div className="flex items-center gap-2">
                  <code className="rounded-lg bg-muted px-3 py-2 font-mono text-2xl font-semibold tracking-widest">{formatJoinCode(org.joinCode)}</code>
                  <Button variant="ghost" size="icon" onClick={() => copy(org.joinCode, "Join code")} aria-label="Copy join code">
                    <CopyIcon />
                  </Button>
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="join-link">Join link</Label>
                <div className="flex gap-2">
                  <Input id="join-link" value={joinLink} readOnly onFocus={(e) => e.target.select()} className="font-mono text-xs" />
                  <Button variant="outline" onClick={() => copy(joinLink, "Join link")}>
                    <CopyIcon /> Copy
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex flex-wrap gap-2 border-t">
            <Button onClick={() => setProjecting(true)}>
              <MonitorIcon /> Show on projector
            </Button>
            <RegenerateButton />
          </CardFooter>
        </Card>

        <DetailsCard org={org} />
      </div>

      <Dialog open={projecting} onOpenChange={setProjecting}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader className="text-center sm:text-center">
            <DialogTitle className="text-2xl">Join {org.name}</DialogTitle>
            <DialogDescription>Scan with your phone camera, or go to the sign-up page and enter the code.</DialogDescription>
          </DialogHeader>
          <div className="mx-auto w-full max-w-sm rounded-2xl border bg-white p-5">
            <QRCodeSVG value={joinLink} size={512} marginSize={1} className="h-auto w-full" />
          </div>
          <p className="text-center font-mono text-4xl font-bold tracking-[0.2em]">{formatJoinCode(org.joinCode)}</p>
        </DialogContent>
      </Dialog>
    </>
  );
}

function WelcomeCard({ name }: { name: string }) {
  return (
    <Card className="mb-6 border-primary/30 bg-primary/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PartyPopperIcon className="size-5 text-primary" /> {name} is ready
        </CardTitle>
        <CardDescription>Three steps and you're taking attendance.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-3">
        {[
          { icon: UsersIcon, title: "1. Invite students", text: "Share the join code or link below." },
          { icon: UserPlusIcon, title: "2. Add teachers", text: "Create their accounts on the Users page.", to: "/users" },
          { icon: CalendarClockIcon, title: "3. Open a session", text: "Then scan cards or phones at the door.", to: "/sessions" },
        ].map((step) => (
          <div key={step.title} className="flex gap-3 rounded-lg border bg-background p-3">
            <step.icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div className="text-sm">
              <p className="font-medium">{step.to ? <Link to={step.to} className="hover:underline">{step.title}</Link> : step.title}</p>
              <p className="text-muted-foreground">{step.text}</p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function RegenerateButton() {
  const fetcher = useFetcher<typeof clientAction>();
  const [open, setOpen] = useState(false);
  const busy = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    if (!fetcher.data.ok) toast.error(fetcher.data.error);
    else if (fetcher.data.intent === "regenerate") {
      setOpen(false);
      toast.success("New join code created");
    }
  }, [fetcher.state, fetcher.data]);

  return (
    <>
      <Button variant="ghost" onClick={() => setOpen(true)}>
        <RefreshCwIcon /> New code
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Create a new join code?</DialogTitle>
            <DialogDescription>
              The current code and link stop working for new sign-ups. Students who already joined aren't affected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button onClick={() => fetcher.submit({ intent: "regenerate" }, { method: "post" })} disabled={busy}>
              {busy && <Loader2Icon className="animate-spin" />}
              New code
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function DetailsCard({ org }: { org: ManagedOrganization }) {
  const fetcher = useFetcher<typeof clientAction>();
  const busy = fetcher.state !== "idle";
  const error = fetcher.data && !fetcher.data.ok ? fetcher.data : undefined;

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok && fetcher.data.intent === "update") toast.success("Saved");
  }, [fetcher.state, fetcher.data]);

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle>Details</CardTitle>
        <CardDescription>Shown to students when they join, and in the sidebar.</CardDescription>
      </CardHeader>
      <CardContent>
        {/* key: reset the inputs when the saved values change */}
        <fetcher.Form method="post" className="grid gap-4" key={`${org.name}-${org.type}`}>
          <div className="grid gap-2">
            <Label htmlFor="org-name">Name</Label>
            <Input id="org-name" name="name" defaultValue={org.name} required />
            <FieldError errors={error?.fieldErrors?.name} />
          </div>
          <div className="grid gap-2">
            <Label>Type</Label>
            <Select name="type" defaultValue={org.type}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Only changes wording, e.g. "{capitalize(orgNoun.college!)}" in the menu.</p>
          </div>
          {error && !error.fieldErrors && <p className="text-sm text-destructive">{error.error}</p>}
          <Button type="submit" disabled={busy} className="justify-self-start">
            {busy && <Loader2Icon className="animate-spin" />}
            Save
          </Button>
        </fetcher.Form>
      </CardContent>
    </Card>
  );
}

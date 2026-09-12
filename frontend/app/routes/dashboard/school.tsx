import { useEffect, useState } from "react";
import { Link, useFetcher, useSearchParams } from "react-router";
import { CalendarClockIcon, ClockIcon, CopyIcon, GraduationCapIcon, LayersIcon, Loader2Icon, PartyPopperIcon, RefreshCwIcon } from "lucide-react";
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

// Intl.supportedValuesOf is not in every runtime (and not in TS's older Intl typings), so ask for
// it defensively and fall back to the zones this product is actually used in.
const FALLBACK_TIMEZONES = ["UTC", "Asia/Kathmandu", "Asia/Kolkata", "Asia/Dhaka", "Asia/Dubai", "Asia/Singapore", "Europe/London", "America/New_York"];

function timezoneOptions(current: string) {
  let zones = FALLBACK_TIMEZONES;
  try {
    const supported = (Intl as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.("timeZone");
    if (supported?.length) zones = supported;
  } catch {
    // keep the fallback
  }
  // the saved value must be selectable even if this browser has never heard of it
  return zones.includes(current) ? zones : [current, ...zones];
}

// what "today" currently means for this school — the whole point of the setting
function todayIn(timezone: string) {
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "full", timeStyle: "short", timeZone: timezone }).format(new Date());
  } catch {
    return "—";
  }
}

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
      body: { name: form.get("name"), type: form.get("type"), timezone: form.get("timezone") },
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

  return (
    <>
      <PageHeader title={org.name} description={`Settings for your ${noun}.`} />

      {searchParams.has("welcome") && <WelcomeCard />}

      <div className="grid gap-6 lg:grid-cols-5">
        <DetailsCard org={org} />

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>School code</CardTitle>
            <CardDescription>Identifies your {noun} to us. Quote it if you ever ask for support.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <code className="rounded-lg bg-muted px-3 py-2 font-mono text-2xl font-semibold tracking-widest">{formatJoinCode(org.joinCode)}</code>
              <Button variant="ghost" size="icon" onClick={() => copy(org.joinCode, "School code")} aria-label="Copy school code">
                <CopyIcon />
              </Button>
            </div>
          </CardContent>
          <CardFooter className="border-t">
            <RegenerateButton />
          </CardFooter>
        </Card>
      </div>
    </>
  );
}

function WelcomeCard() {
  return (
    <Card className="mb-6 border-primary/30 bg-primary/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PartyPopperIcon className="size-5 text-primary" /> You're set up
        </CardTitle>
        <CardDescription>Three steps and you're taking attendance. Students never log in — you add them and print their cards.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-3">
        {[
          { icon: LayersIcon, title: "1. Create your classes", text: "Grade, section and academic year.", to: "/classes" },
          { icon: GraduationCapIcon, title: "2. Add students", text: "One by one or from a CSV. Print their QR cards.", to: "/students" },
          { icon: CalendarClockIcon, title: "3. Open a session", text: "Then scan cards at the door.", to: "/sessions" },
        ].map((step) => (
          <div key={step.title} className="flex gap-3 rounded-lg border bg-background p-3">
            <step.icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div className="text-sm">
              <p className="font-medium">
                <Link to={step.to} className="hover:underline">
                  {step.title}
                </Link>
              </p>
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
      toast.success("New school code created");
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
            <DialogTitle>Create a new school code?</DialogTitle>
            <DialogDescription>The current code stops being yours. Students, staff and cards are not affected.</DialogDescription>
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
  // previewed live, so the consequence of changing the zone is visible before saving
  const [timezone, setTimezone] = useState(org.timezone);

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok && fetcher.data.intent === "update") toast.success("Saved");
  }, [fetcher.state, fetcher.data]);

  return (
    <Card className="lg:col-span-3">
      <CardHeader>
        <CardTitle>Details</CardTitle>
        <CardDescription>The name in the sidebar, and the clock every attendance day is measured against.</CardDescription>
      </CardHeader>
      <CardContent>
        {/* key: reset the inputs when the saved values change */}
        <fetcher.Form method="post" className="grid gap-4" key={`${org.name}-${org.type}-${org.timezone}`}>
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
          <div className="grid gap-2">
            <Label>Timezone</Label>
            <Select name="timezone" value={timezone} onValueChange={setTimezone}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {timezoneOptions(org.timezone).map((zone) => (
                  <SelectItem key={zone} value={zone}>
                    {zone.replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="flex items-start gap-2 text-xs text-muted-foreground">
              <ClockIcon className="mt-0.5 size-3.5 shrink-0" />
              <span>
                This decides when one school day ends and the next begins. A scan just after midnight here counts for the new day.
                <br />
                Right now it is <span className="font-medium text-foreground">{todayIn(timezone)}</span> at your {orgNoun[org.type]}.
              </span>
            </p>
            <FieldError errors={error?.fieldErrors?.timezone} />
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

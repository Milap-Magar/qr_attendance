import { useEffect, useState } from "react";
import { Form, Link, redirect, useNavigation } from "react-router";
import { CheckCircle2Icon, Loader2Icon } from "lucide-react";

import type { Route } from "./+types/register";
import { AuthShell, FieldError } from "~/components/auth-shell";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { api, toActionError, tokens } from "~/lib/api";
import { resetMe } from "~/lib/auth";
import { pageTitle } from "~/lib/brand";
import { orgNoun } from "~/lib/format";
import type { AuthResponse, Organization } from "~/lib/types";

export const meta: Route.MetaFunction = () => [{ title: pageTitle("Join your school") }];

// "K7QM-x2pd " → "K7QMX2PD" (the server does the same)
const normalize = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, "");
const lookup = (code: string) => api<Organization>(`/api/organizations/lookup?code=${encodeURIComponent(code)}`).catch(() => null);

// students arrive here from the join link their school shares: /register?code=K7QMX2PD
export async function clientLoader({ request }: Route.ClientLoaderArgs) {
  if (tokens.access) throw redirect("/dashboard");
  const code = new URL(request.url).searchParams.get("code") ?? "";
  return { code, school: code ? await lookup(normalize(code)) : null };
}

// the backend creates a student account in the school that owns the join code, and logs it in
export async function clientAction({ request }: Route.ClientActionArgs) {
  const form = await request.formData();
  try {
    const result = await api<AuthResponse>("/api/auth/register", {
      method: "POST",
      body: { name: form.get("name"), email: form.get("email"), password: form.get("password"), joinCode: form.get("joinCode") },
    });
    tokens.save(result);
    resetMe();
    return redirect("/dashboard");
  } catch (error) {
    return toActionError(error);
  }
}

export default function Register({ loaderData, actionData }: Route.ComponentProps) {
  const submitting = useNavigation().state === "submitting";
  const [code, setCode] = useState(loaderData.code);
  // the lookup result, remembered together with the code it belongs to
  const [found, setFound] = useState({ code: normalize(loaderData.code), school: loaderData.school });

  // look the school up while the student types, so they see WHICH school they're joining
  const normalized = normalize(code);
  const complete = normalized.length >= 8;
  const checking = complete && found.code !== normalized;
  const school = complete && !checking ? found.school : null;

  useEffect(() => {
    if (!checking) return;
    let cancelled = false; // an older, slower lookup must not overwrite a newer one
    const timer = setTimeout(async () => {
      const result = await lookup(normalized);
      if (!cancelled) setFound({ code: normalized, school: result });
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [normalized, checking]);

  const errors = actionData?.fieldErrors;
  const badCode = actionData?.code === "INVALID_JOIN_CODE";
  const joinCodeErrors = errors?.joinCode ?? (badCode ? [actionData.error] : undefined);
  const noun = school ? orgNoun[school.type] : "school";

  return (
    <AuthShell
      title={school ? `Join ${school.name}` : "Join your school"}
      description={school ? `Create your student account at this ${noun}.` : "Ask your teacher or school office for the join code."}
    >
      <Form method="post" className="grid gap-4">
        {actionData?.error && !errors && !badCode && (
          <Alert variant="destructive">
            <AlertDescription>{actionData.error}</AlertDescription>
          </Alert>
        )}
        <div className="grid gap-2">
          <Label htmlFor="joinCode">Join code</Label>
          <Input
            id="joinCode"
            name="joinCode"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="K7QM-X2PD"
            autoCapitalize="characters"
            autoComplete="off"
            className="font-mono tracking-widest uppercase"
            required
          />
          {joinCodeErrors ? (
            <FieldError errors={joinCodeErrors} />
          ) : checking ? (
            <p className="text-xs text-muted-foreground">Checking…</p>
          ) : school ? (
            <p className="flex items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-400">
              <CheckCircle2Icon className="size-4" /> {school.name}
            </p>
          ) : complete ? (
            <p className="text-sm text-destructive">No school found with that code.</p>
          ) : null}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="name">Full name</Label>
          <Input id="name" name="name" placeholder="Sita Kumari" autoComplete="name" required />
          <FieldError errors={errors?.name} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" placeholder="you@example.com" autoComplete="email" required />
          <FieldError errors={errors?.email} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="password">Password</Label>
          <Input id="password" name="password" type="password" autoComplete="new-password" required />
          {errors?.password ? (
            <FieldError errors={errors.password} />
          ) : (
            <p className="text-xs text-muted-foreground">8+ characters with upper & lower case, a number and a symbol.</p>
          )}
        </div>
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting && <Loader2Icon className="animate-spin" />}
          Create account
        </Button>
        <div className="grid gap-1 text-center text-sm text-muted-foreground">
          <p>
            Already have an account?{" "}
            <Link to="/login" className="font-medium text-foreground underline-offset-4 hover:underline">
              Log in
            </Link>
          </p>
          <p>
            Signing up a whole school?{" "}
            <Link to="/signup" className="font-medium text-foreground underline-offset-4 hover:underline">
              Start here
            </Link>
          </p>
        </div>
      </Form>
    </AuthShell>
  );
}

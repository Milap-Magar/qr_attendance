import { Form, Link, redirect, useNavigation } from "react-router";
import { Loader2Icon } from "lucide-react";

import type { Route } from "./+types/login";
import { AuthShell, FieldError } from "~/components/auth-shell";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { api, toActionError, tokens } from "~/lib/api";
import { resetMe } from "~/lib/auth";
import { pageTitle } from "~/lib/brand";
import type { AuthResponse } from "~/lib/types";

export const meta: Route.MetaFunction = () => [{ title: pageTitle("Log in") }];

// already logged in? skip the form
export async function clientLoader() {
  if (tokens.access) throw redirect("/dashboard");
  return null;
}

// runs when the <Form> below is submitted
export async function clientAction({ request }: Route.ClientActionArgs) {
  const form = await request.formData();
  try {
    const result = await api<AuthResponse>("/api/auth/login", {
      method: "POST",
      body: { email: form.get("email"), password: form.get("password") },
    });
    tokens.save(result);
    resetMe();
    return redirect("/dashboard");
  } catch (error) {
    return toActionError(error);
  }
}

export default function Login({ actionData }: Route.ComponentProps) {
  const submitting = useNavigation().state === "submitting";

  return (
    <AuthShell title="Welcome back" description="Log in with your email and password">
      <Form method="post" className="grid gap-4">
        {actionData?.error && !actionData.fieldErrors && (
          <Alert variant="destructive">
            <AlertDescription>{actionData.error}</AlertDescription>
          </Alert>
        )}
        <div className="grid gap-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" placeholder="you@school.com" autoComplete="email" required />
          <FieldError errors={actionData?.fieldErrors?.email} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="password">Password</Label>
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
          <FieldError errors={actionData?.fieldErrors?.password} />
        </div>
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting && <Loader2Icon className="animate-spin" />}
          Log in
        </Button>
        <div className="grid gap-1 text-center text-sm text-muted-foreground">
          <p>
            New school or college?{" "}
            <Link to="/signup" className="font-medium text-foreground underline-offset-4 hover:underline">
              Start free
            </Link>
          </p>
          <p>Students don't log in — they just show their card.</p>
        </div>
      </Form>
    </AuthShell>
  );
}

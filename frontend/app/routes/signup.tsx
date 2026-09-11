import { Form, Link, redirect, useNavigation } from "react-router";
import { Loader2Icon } from "lucide-react";

import type { Route } from "./+types/signup";
import { AuthShell, FieldError } from "~/components/auth-shell";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { Separator } from "~/components/ui/separator";
import { api, toActionError, tokens } from "~/lib/api";
import { resetMe } from "~/lib/auth";
import { BRAND, pageTitle } from "~/lib/brand";
import type { AuthResponse, OrganizationType } from "~/lib/types";

export const meta: Route.MetaFunction = () => [{ title: pageTitle("Start free") }];

const TYPES: { value: OrganizationType; label: string }[] = [
  { value: "school", label: "School" },
  { value: "college", label: "College" },
  { value: "university", label: "University" },
  { value: "other", label: "Other (coaching, institute…)" },
];

export async function clientLoader() {
  if (tokens.access) throw redirect("/dashboard");
  return null;
}

// creates the school AND the caller's admin account, then logs in.
// First stop: the school page, where the join code for students is.
export async function clientAction({ request }: Route.ClientActionArgs) {
  const form = await request.formData();
  try {
    const result = await api<AuthResponse>("/api/auth/register-school", {
      method: "POST",
      body: {
        schoolName: form.get("schoolName"),
        schoolType: form.get("schoolType"),
        name: form.get("name"),
        email: form.get("email"),
        password: form.get("password"),
      },
    });
    tokens.save(result);
    resetMe();
    return redirect("/school?welcome=1");
  } catch (error) {
    return toActionError(error);
  }
}

export default function Signup({ actionData }: Route.ComponentProps) {
  const submitting = useNavigation().state === "submitting";
  const errors = actionData?.fieldErrors;

  return (
    <AuthShell title="Start taking attendance" description="Set up your school in a minute. Free while you try it." wide>
      <Form method="post" className="grid gap-4">
        {actionData?.error && !errors && (
          <Alert variant="destructive">
            <AlertDescription>{actionData.error}</AlertDescription>
          </Alert>
        )}

        <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
          <div className="grid gap-2">
            <Label htmlFor="schoolName">School or college name</Label>
            <Input id="schoolName" name="schoolName" placeholder="Sunrise Academy" autoComplete="organization" required />
            <FieldError errors={errors?.schoolName} />
          </div>
          <div className="grid gap-2">
            <Label>Type</Label>
            <Select name="schoolType" defaultValue="school">
              <SelectTrigger className="w-full sm:w-36">
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
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <Separator className="flex-1" /> Your admin account <Separator className="flex-1" />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="name">Your name</Label>
          <Input id="name" name="name" placeholder="Gita Sharma" autoComplete="name" required />
          <FieldError errors={errors?.name} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="email">Work email</Label>
          <Input id="email" name="email" type="email" placeholder="you@school.edu.np" autoComplete="email" required />
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
          Create my school
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          Already on {BRAND.name}?{" "}
          <Link to="/login" className="font-medium text-foreground underline-offset-4 hover:underline">
            Log in
          </Link>
        </p>
      </Form>
    </AuthShell>
  );
}

import { Link } from "react-router";
import { Logo } from "~/components/logo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { cn } from "~/lib/utils";

// centered card used by the login, sign-up and register pages
export function AuthShell({ title, description, children, wide }: { title: string; description: React.ReactNode; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted/40 p-6">
      <Link to="/" aria-label="Home">
        <Logo />
      </Link>
      <Card className={cn("w-full", wide ? "max-w-md" : "max-w-sm")}>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </div>
  );
}

// a label + input + the server's error message for that field
export function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;
  return <p className="text-sm text-destructive">{errors[0]}</p>;
}

import { isRouteErrorResponse, Link, Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";
import { Loader2Icon } from "lucide-react";

import type { Route } from "./+types/root";
import { Button } from "~/components/ui/button";
import { Toaster } from "~/components/ui/sonner";
import { TooltipProvider } from "~/components/ui/tooltip";
import { BRAND, pageTitle } from "~/lib/brand";
import "./app.css";

export const meta: Route.MetaFunction = () => [
  { title: pageTitle() },
  { name: "description", content: BRAND.description },
  { name: "theme-color", content: "#4f46e5" },
];

export const links: Route.LinksFunction = () => [{ rel: "icon", href: "/favicon.svg", type: "image/svg+xml" }];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return (
    <TooltipProvider>
      <Outlet />
      <Toaster position="top-right" richColors />
    </TooltipProvider>
  );
}

// SPA mode: shown while the first clientLoaders run
export function HydrateFallback() {
  return (
    <div className="flex min-h-svh items-center justify-center">
      <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
    </div>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let title = "Something went wrong";
  let details = "An unexpected error occurred.";

  if (isRouteErrorResponse(error)) {
    title = error.status === 404 ? "Page not found" : `Error ${error.status}`;
    details = error.status === 404 ? "The page you're looking for doesn't exist." : error.statusText || details;
  } else if (error instanceof Error) {
    details = error.message;
  }

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="max-w-md text-muted-foreground">{details}</p>
      <Button asChild variant="outline" className="mt-2">
        <Link to="/dashboard">Back to dashboard</Link>
      </Button>
    </main>
  );
}

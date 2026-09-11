import { Outlet, useMatches } from "react-router";

import type { Route } from "./+types/layout";
import { AppSidebar } from "~/components/app-sidebar";
import { Separator } from "~/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "~/components/ui/sidebar";
import { requireUser } from "~/lib/auth";

// runs before any dashboard page renders: no user → redirect to /login
export async function clientLoader() {
  const me = await requireUser();
  return { me };
}

export default function DashboardLayout({ loaderData }: Route.ComponentProps) {
  // each page exports `handle = { title }`, shown in the top bar
  const title = useMatches()
    .map((match) => (match.handle as { title?: string } | undefined)?.title)
    .findLast(Boolean);

  return (
    <SidebarProvider>
      <AppSidebar me={loaderData.me} />
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-1 data-vertical:h-4 data-vertical:self-center" />
          <span className="text-sm font-medium">{title}</span>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}

// Small building blocks reused across dashboard pages
import type { LucideIcon } from "lucide-react";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { cn } from "~/lib/utils";
import type { SessionStatus } from "~/lib/types";

export function PageHeader({ title, description, children }: { title: string; description?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}

export function StatCard({ label, value, hint, icon: Icon }: { label: string; value: React.ReactNode; hint?: string; icon: LucideIcon }) {
  return (
    <Card className="gap-2">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardDescription>{label}</CardDescription>
        <Icon className="size-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <CardTitle className="text-3xl font-semibold tabular-nums">{value}</CardTitle>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

const statusStyles: Record<SessionStatus, string> = {
  open: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  upcoming: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
  closed: "bg-muted text-muted-foreground",
};

export function StatusBadge({ status }: { status: SessionStatus }) {
  return (
    <Badge variant="secondary" className={cn("capitalize", statusStyles[status])}>
      {status === "open" && <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />}
      {status}
    </Badge>
  );
}

export function EmptyState({ icon: Icon, title, description, children }: { icon: LucideIcon; title: string; description?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-6 py-12 text-center">
      <div className="mb-1 flex size-10 items-center justify-center rounded-full bg-muted">
        <Icon className="size-5 text-muted-foreground" />
      </div>
      <p className="font-medium">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      {children && <div className="mt-2">{children}</div>}
    </div>
  );
}

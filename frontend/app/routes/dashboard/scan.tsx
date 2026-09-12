import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Link, useFetcher, useSearchParams } from "react-router";
import { AlertTriangleIcon, CameraOffIcon, CheckCircle2Icon, RadioIcon, ScanLineIcon, XCircleIcon } from "lucide-react";

import type { Route } from "./+types/scan";
import { EmptyState, PageHeader } from "~/components/shared";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { Skeleton } from "~/components/ui/skeleton";
import { api, toActionError } from "~/lib/api";
import { requireUser } from "~/lib/auth";
import { formatTime } from "~/lib/format";
import type { AttendanceSession, ScanResult } from "~/lib/types";
import { cn } from "~/lib/utils";

// the camera library is big and browser-only → load it only when this page opens
const QrScanner = lazy(() => import("@yudiel/react-qr-scanner").then((m) => ({ default: m.Scanner })));

export const handle = { title: "Scanner" };

export async function clientLoader({ request }: Route.ClientLoaderArgs) {
  await requireUser("attendance:scan");
  const sessions = (await api<AttendanceSession[]>("/api/attendance/sessions")).filter((s) => s.status === "open");
  // /scan?session=<id> picks the session, otherwise the first open one
  const wanted = new URL(request.url).searchParams.get("session");
  const selected = sessions.find((s) => s.id === wanted) ?? sessions[0] ?? null;
  return { sessions, selected };
}

// the server does every check (session open? card valid? already scanned?)
export async function clientAction({ request }: Route.ClientActionArgs) {
  const form = await request.formData();
  try {
    const result = await api<ScanResult>("/api/qr/scan", {
      method: "POST",
      body: { sessionId: form.get("sessionId"), token: form.get("token") },
    });
    return { ok: true as const, result };
  } catch (error) {
    return toActionError(error);
  }
}

type LogEntry = { key: number; tone: "success" | "warning" | "error"; title: string; detail: string; at: Date };

// The scanner never decides who belongs in the room: any teacher may scan any student, and the
// first scan of the day into any open session is what marks them present.
function toEntry(data: NonNullable<Awaited<ReturnType<typeof clientAction>>>): LogEntry {
  if (data.ok) {
    const { student } = data.result;
    return { key: Date.now(), tone: "success", title: student.name, detail: `Roll ${student.rollNo} · ${student.class.label}`, at: new Date() };
  }
  // ALREADY_PRESENT is not a failure — the student IS present. The server's message already
  // names them and the time they were first scanned, so show it as-is.
  const tone = data.code === "ALREADY_PRESENT" ? "warning" : "error";
  return { key: Date.now(), tone, title: data.error, detail: hint(data.code), at: new Date() };
}

export default function Scan({ loaderData }: Route.ComponentProps) {
  const { sessions, selected } = loaderData;
  const [, setSearchParams] = useSearchParams();
  const fetcher = useFetcher<typeof clientAction>();
  const [log, setLog] = useState<LogEntry[]>([]);
  const [cameraError, setCameraError] = useState(false);
  const lastScan = useRef({ token: "", at: 0 });

  function submitToken(token: string) {
    token = token.trim();
    if (!token || !selected || fetcher.state !== "idle") return;
    // the camera sees the same card many times per second → ignore repeats for 3s
    if (token === lastScan.current.token && Date.now() - lastScan.current.at < 3000) return;
    lastScan.current = { token, at: Date.now() };
    fetcher.submit({ sessionId: selected.id, token }, { method: "post" });
  }

  // every finished scan goes to the top of the log
  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    setLog((prev) => [toEntry(fetcher.data!), ...prev].slice(0, 20));
  }, [fetcher.state, fetcher.data]);

  if (!selected) {
    return (
      <>
        <PageHeader title="Scanner" />
        <EmptyState icon={RadioIcon} title="No open session" description="Open a session first. The scanner records check-ins into it.">
          <Button asChild>
            <Link to="/sessions">Go to sessions</Link>
          </Button>
        </EmptyState>
      </>
    );
  }

  const busy = fetcher.state !== "idle";

  return (
    <>
      <PageHeader title="Scanner" description="Hold a student's card up to the camera. Any student, any teacher — the first scan of the day marks them present.">
        <Select value={selected.id} onValueChange={(id) => setSearchParams({ session: id })}>
          <SelectTrigger className="w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {sessions.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>{selected.title}</CardTitle>
            <CardDescription>
              {selected.checkedInCount} checked in · open until {formatTime(selected.closesAt)}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {cameraError ? (
              <div className="flex aspect-video flex-col items-center justify-center gap-2 rounded-lg bg-muted text-center text-sm text-muted-foreground">
                <CameraOffIcon className="size-6" />
                Camera unavailable. Allow camera access, or type the code below.
              </div>
            ) : (
              <div className="mx-auto w-full max-w-md overflow-hidden rounded-lg">
                <Suspense fallback={<Skeleton className="aspect-square w-full" />}>
                  <QrScanner
                    formats={["qr_code"]}
                    allowMultiple
                    scanDelay={1000}
                    paused={busy}
                    onScan={(codes) => codes[0] && submitToken(codes[0].rawValue)}
                    onError={() => setCameraError(true)}
                    styles={{ container: { width: "100%", aspectRatio: "1" } }}
                  />
                </Suspense>
              </div>
            )}

            {/* manual entry: also works with USB barcode scanners, which "type" the code + Enter */}
            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                const input = event.currentTarget.elements.namedItem("token") as HTMLInputElement;
                lastScan.current = { token: "", at: 0 }; // typed codes are never ignored as repeats
                submitToken(input.value);
                input.value = "";
              }}
            >
              <Input name="token" placeholder="Or type / paste a code" autoComplete="off" />
              <Button type="submit" variant="secondary" disabled={busy}>
                Check in
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="grid content-start gap-6 lg:col-span-2">
          <ResultPanel entry={log[0]} busy={busy} />

          <Card>
            <CardHeader>
              <CardTitle>Recent scans</CardTitle>
              <CardDescription>On this device</CardDescription>
            </CardHeader>
            <CardContent>
              {log.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">Nothing scanned yet.</p>
              ) : (
                <ul className="divide-y">
                  {log.map((entry) => (
                    <li key={entry.key} className="flex items-center gap-3 py-2.5">
                      <ToneIcon tone={entry.tone} className="size-4 shrink-0" />
                      <span className="flex-1 truncate text-sm">{entry.title}</span>
                      <span className="text-xs text-muted-foreground tabular-nums">{formatTime(entry.at.toISOString())}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

const toneStyles = {
  success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  warning: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  error: "border-destructive/30 bg-destructive/10 text-destructive",
};

function ResultPanel({ entry, busy }: { entry?: LogEntry; busy: boolean }) {
  if (busy || !entry) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-8 text-center text-muted-foreground">
        <ScanLineIcon className={cn("size-8", busy && "animate-pulse")} />
        <p className="text-sm">{busy ? "Checking…" : "Waiting for a card…"}</p>
      </div>
    );
  }
  return (
    <div key={entry.key} className={cn("flex flex-col items-center gap-2 rounded-xl border p-8 text-center animate-in fade-in zoom-in-95", toneStyles[entry.tone])}>
      <ToneIcon tone={entry.tone} className="size-10" />
      {entry.tone === "success" ? (
        <>
          <p className="text-xs font-medium tracking-wide uppercase opacity-80">Marked present</p>
          <p className="text-2xl font-semibold">{entry.title}</p>
          <p className="text-sm opacity-80">{entry.detail}</p>
        </>
      ) : (
        <>
          <p className="text-lg font-semibold text-balance">{entry.title}</p>
          <p className="text-sm opacity-80">{entry.detail}</p>
        </>
      )}
    </div>
  );
}

function ToneIcon({ tone, className }: { tone: LogEntry["tone"]; className?: string }) {
  if (tone === "success") return <CheckCircle2Icon className={cn("text-emerald-600", className)} />;
  if (tone === "warning") return <AlertTriangleIcon className={cn("text-amber-600", className)} />;
  return <XCircleIcon className={cn("text-destructive", className)} />;
}

// friendlier second line for each error code the backend can return
function hint(code?: string) {
  switch (code) {
    case "ALREADY_PRESENT":
      return "No need to scan again today.";
    case "QR_NOT_FOUND":
      return "This code isn't a student card.";
    case "QR_REVOKED":
      return "This card was replaced or reported lost. The office can print a new one.";
    case "STUDENT_INACTIVE":
      return "This student has left the school.";
    case "SESSION_CLOSED":
    case "SESSION_NOT_OPEN":
      return "Pick an open session.";
    default:
      return "Try again.";
  }
}

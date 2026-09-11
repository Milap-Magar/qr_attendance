import { useEffect, useState } from "react";
import { useFetcher } from "react-router";
import { Loader2Icon, QrCodeIcon, RefreshCwIcon, SmartphoneIcon, SunIcon } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";

import type { Route } from "./+types/my-qr";
import { EmptyState, PageHeader } from "~/components/shared";
import { Button } from "~/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { useWakeLock } from "~/hooks/use-wake-lock";
import { api, toActionError } from "~/lib/api";
import { requireUser } from "~/lib/auth";
import { phoneQr } from "~/lib/phone-qr";
import type { Credential } from "~/lib/types";

export const handle = { title: "My QR" };

export async function clientLoader() {
  const me = await requireUser("qr:self");
  return { me, token: phoneQr.get(me.id) };
}

// "Use this phone as my card": the server issues a device credential and returns its token once.
// Doing it again replaces the QR on any previous phone; the printed card keeps working.
export async function clientAction() {
  try {
    const me = await requireUser("qr:self");
    const credential = await api<Credential & { token: string }>("/api/qr/credentials/me", { method: "POST" });
    phoneQr.save(me.id, credential.token);
    return { ok: true as const };
  } catch (error) {
    return toActionError(error);
  }
}

export default function MyQr({ loaderData }: Route.ComponentProps) {
  const { me, token } = loaderData;
  const fetcher = useFetcher<typeof clientAction>();
  const busy = fetcher.state !== "idle";
  const [confirming, setConfirming] = useState(false);
  useWakeLock(token !== null);

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    if (fetcher.data.ok) {
      setConfirming(false);
      toast.success("This phone is now your QR card");
    } else {
      toast.error(fetcher.data.error);
    }
  }, [fetcher.state, fetcher.data]);

  const setUp = () => fetcher.submit(null, { method: "post" });

  if (!token) {
    return (
      <>
        <PageHeader title="My QR" description="Check in by showing your phone to the scanner." />
        <EmptyState
          icon={SmartphoneIcon}
          title="Use this phone as your card"
          description="Your QR code will be saved on this phone. Setting it up on another phone later turns this one off. Your printed card keeps working either way."
        >
          <Button onClick={setUp} disabled={busy}>
            {busy ? <Loader2Icon className="animate-spin" /> : <QrCodeIcon />}
            Set up this phone
          </Button>
        </EmptyState>
      </>
    );
  }

  return (
    <>
      <PageHeader title="My QR" description="Hold this up to your teacher's scanner." />

      <div className="mx-auto flex max-w-sm flex-col items-center gap-4">
        {/* always white: scanners need dark-on-light contrast, even in dark mode */}
        <div className="w-full rounded-2xl border bg-white p-6 text-neutral-900 shadow-sm">
          <QRCodeSVG value={token} size={512} marginSize={2} className="h-auto w-full" />
          <div className="mt-4 text-center">
            <p className="text-lg font-semibold">{me.name}</p>
            <p className="text-sm text-neutral-500">{me.email}</p>
          </div>
        </div>

        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <SunIcon className="size-4" /> Turn your screen brightness up if it doesn't scan.
        </p>

        <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>
          <RefreshCwIcon /> Set up again
        </Button>
      </div>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Set up a new QR?</DialogTitle>
            <DialogDescription>
              Do this if the scanner says your QR was revoked. Your current phone QR stops working and this phone gets a new one.
              Your printed card isn't affected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button onClick={setUp} disabled={busy}>
              {busy && <Loader2Icon className="animate-spin" />}
              Get a new QR
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

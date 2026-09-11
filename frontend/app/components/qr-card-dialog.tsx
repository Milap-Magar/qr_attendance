import { QRCodeSVG } from "qrcode.react";
import { PrinterIcon, QrCodeIcon } from "lucide-react";

import { Button } from "~/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { formatDate } from "~/lib/format";

export type IssuedCard = { token: string; createdAt: string; user: { name: string; email: string } };

// Shows a freshly issued card. The token is only returned ONCE by the server,
// so this is the moment to print it.
export function QrCardDialog({ card, onClose }: { card: IssuedCard | null; onClose: () => void }) {
  return (
    <Dialog open={card !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>QR card issued</DialogTitle>
          <DialogDescription>Print it now. This code is shown only once, and any older card stops working.</DialogDescription>
        </DialogHeader>

        {card && (
          <div className="print-area mx-auto w-72 overflow-hidden rounded-xl border bg-white text-neutral-900 shadow-sm">
            <div className="flex items-center gap-2 bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white">
              <QrCodeIcon className="size-4" /> Student ID
            </div>
            <div className="flex flex-col items-center gap-3 p-5">
              <QRCodeSVG value={card.token} size={180} marginSize={1} />
              <div className="text-center">
                <p className="font-semibold">{card.user.name}</p>
                <p className="text-xs text-neutral-500">{card.user.email}</p>
                <p className="mt-1 text-[10px] uppercase tracking-wide text-neutral-400">Issued {formatDate(card.createdAt)}</p>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Done
          </Button>
          <Button onClick={() => window.print()}>
            <PrinterIcon /> Print
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

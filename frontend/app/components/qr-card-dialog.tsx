import { QRCodeSVG } from "qrcode.react";
import { PrinterIcon, QrCodeIcon } from "lucide-react";

import { Button } from "~/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { formatDate } from "~/lib/format";

export type PrintableCard = {
  token: string;
  createdAt: string;
  student: { name: string; rollNo: string; classLabel: string };
};

// Shows one freshly issued student card. The server returns the token ONCE and keeps only its
// hash, so this dialog is the only chance to print it — closing it means issuing another card,
// which kills this one.
export function QrCardDialog({ card, schoolName, onClose }: { card: PrintableCard | null; schoolName?: string; onClose: () => void }) {
  return (
    <Dialog open={card !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>QR card issued</DialogTitle>
          <DialogDescription>Print it now. This code is shown only once, and any older card for this student has stopped working.</DialogDescription>
        </DialogHeader>

        {card && (
          <div className="print-area mx-auto w-72 overflow-hidden rounded-xl border bg-white text-neutral-900 shadow-sm">
            <div className="flex items-center gap-2 bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white">
              <QrCodeIcon className="size-4" /> {schoolName ?? "Student card"}
            </div>
            <div className="flex flex-col items-center gap-3 p-5">
              <QRCodeSVG value={card.token} size={180} marginSize={1} bgColor="#ffffff" fgColor="#000000" />
              <div className="text-center">
                <p className="font-semibold">{card.student.name}</p>
                <p className="text-xs text-neutral-500">
                  Roll {card.student.rollNo} · {card.student.classLabel}
                </p>
                <p className="mt-1 text-[10px] tracking-wide text-neutral-400 uppercase">Issued {formatDate(card.createdAt)}</p>
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

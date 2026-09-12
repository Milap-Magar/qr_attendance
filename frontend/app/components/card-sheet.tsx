import { createPortal } from "react-dom";
import { QRCodeSVG } from "qrcode.react";
import { AlertTriangleIcon, PrinterIcon, XIcon } from "lucide-react";

import { Button } from "~/components/ui/button";

export type SheetCard = { name: string; rollNo: string; token: string };

// A whole class's QR cards, laid out three to a row on A4 (see the @media print block in app.css).
//
// The tokens in `cards` came back from the ONE response that ever contains them (an import, or
// "print cards" for a class). They are not stored anywhere and cannot be fetched again, so this
// panel takes over the screen: closing it without printing means re-issuing the cards, which
// invalidates whatever was already handed out.
export function CardSheet({
  cards,
  classLabel,
  schoolName,
  onClose,
}: {
  cards: SheetCard[];
  classLabel: string;
  schoolName: string;
  onClose: () => void;
}) {
  if (cards.length === 0) return null;

  return createPortal(
    <div className="card-sheet fixed inset-0 z-50 overflow-auto bg-white p-4 text-neutral-900 sm:p-8">
      <div className="no-print mx-auto mb-6 flex max-w-4xl flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4">
        <div className="flex items-start gap-3">
          <AlertTriangleIcon className="mt-0.5 size-5 shrink-0 text-amber-600" />
          <div className="text-sm">
            <p className="font-semibold">
              {cards.length} card{cards.length === 1 ? "" : "s"} for {classLabel} — print them now
            </p>
            <p className="text-neutral-600">These codes are shown once and cannot be looked up again. Close this and they are gone for good.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose}>
            <XIcon /> Close
          </Button>
          <Button onClick={() => window.print()}>
            <PrinterIcon /> Print
          </Button>
        </div>
      </div>

      <div className="card-sheet-grid mx-auto grid max-w-4xl grid-cols-2 gap-4 sm:grid-cols-3">
        {cards.map((card) => (
          <div key={card.token} className="qr-card flex flex-col items-center justify-between rounded-lg border border-neutral-300 p-3 text-center">
            <p className="w-full truncate text-[10px] font-medium tracking-wide text-neutral-500 uppercase">{schoolName}</p>
            {/* always dark-on-white: a scanner needs the contrast, whatever theme the browser is in */}
            <QRCodeSVG value={card.token} size={256} marginSize={1} bgColor="#ffffff" fgColor="#000000" className="my-2 h-auto w-full max-w-[34mm]" />
            <div className="w-full">
              <p className="truncate text-sm font-semibold">{card.name}</p>
              <p className="truncate text-xs text-neutral-500">
                Roll {card.rollNo} · {classLabel}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>,
    document.body,
  );
}

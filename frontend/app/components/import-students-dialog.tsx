import { useEffect, useState } from "react";
import { useFetcher } from "react-router";
import { AlertCircleIcon, FileUpIcon, Loader2Icon, UploadIcon } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import type { ActionError } from "~/lib/api";
import { parseStudentCsv, type ParsedRow } from "~/lib/csv";
import { genderLabel } from "~/lib/format";
import type { ImportResult } from "~/lib/types";
import { cn } from "~/lib/utils";

const MAX_ROWS = 500; // the API's limit for one request

// what the route's clientAction answers for intent "import"
export type ImportResponse = { ok: true; intent: "import"; result: ImportResult } | ActionError;

// The file is parsed in the browser and shown as a preview first: a roll number typo in row 40
// would otherwise only surface as a "skipped" line after half the class had already been created
// (and cards printed for them).
export function ImportStudentsDialog({ classId, onImported }: { classId: string; onImported: (result: ImportResult) => void }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [parseError, setParseError] = useState<string>();
  const fetcher = useFetcher<ImportResponse>();
  const busy = fetcher.state !== "idle";

  const valid = rows.filter((row) => row.errors.length === 0);
  const broken = rows.length - valid.length;

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    if (!fetcher.data.ok) return void toast.error(fetcher.data.error);
    if (fetcher.data.intent !== "import") return;
    setOpen(false);
    onImported(fetcher.data.result);
  }, [fetcher.state, fetcher.data]);

  // reset when the dialog closes, so the next import doesn't open on the last file's preview
  function change(next: boolean) {
    setOpen(next);
    if (!next) {
      setRows([]);
      setFileName("");
      setParseError(undefined);
    }
  }

  async function readFile(file: File) {
    setFileName(file.name);
    const parsed = parseStudentCsv(await file.text());
    setRows(parsed.rows);
    setParseError(parsed.error);
  }

  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <FileUpIcon /> Import CSV
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85svh] gap-4 overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import students</DialogTitle>
          <DialogDescription>
            A CSV with a header row naming the columns: <code className="font-mono">rollNo</code> (or roll_no / roll),{" "}
            <code className="font-mono">name</code>, and optionally <code className="font-mono">gender</code>. Column order doesn't matter.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          <Label htmlFor="csv-file">CSV file</Label>
          <Input
            id="csv-file"
            type="file"
            accept=".csv,text/csv,text/plain"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void readFile(file);
            }}
          />
        </div>

        {parseError && (
          <p className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircleIcon className="size-4 shrink-0" /> {parseError}
          </p>
        )}

        {rows.length > 0 && (
          <>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="secondary">{fileName}</Badge>
              <span className="text-muted-foreground">
                {valid.length} ready{broken > 0 && `, ${broken} to fix`}
                {valid.length > MAX_ROWS && ` — only the first ${MAX_ROWS} will be sent`}
              </span>
            </div>

            <div className="max-h-72 overflow-y-auto rounded-lg border">
              <Table>
                <TableHeader className="sticky top-0 bg-background">
                  <TableRow>
                    <TableHead className="w-14 pl-4">Line</TableHead>
                    <TableHead className="w-24">Roll no</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead className="w-20">Gender</TableHead>
                    <TableHead className="pr-4">Problem</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.line} className={cn(row.errors.length > 0 && "bg-destructive/5")}>
                      <TableCell className="pl-4 text-muted-foreground tabular-nums">{row.line}</TableCell>
                      <TableCell className="font-mono text-xs">{row.rollNo || "—"}</TableCell>
                      <TableCell>{row.name || "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{genderLabel[row.gender]}</TableCell>
                      <TableCell className="pr-4 text-xs text-destructive">{row.errors.join(" · ")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}

        <p className="text-xs text-muted-foreground">
          Every imported student gets their QR card straight away. The codes are shown once, on the print sheet that opens next — print it before closing.
        </p>

        <DialogFooter>
          <Button
            disabled={busy || valid.length === 0}
            onClick={() =>
              fetcher.submit(
                { intent: "import", classId, rows: JSON.stringify(valid.slice(0, MAX_ROWS).map(({ rollNo, name, gender }) => ({ rollNo, name, gender }))) },
                { method: "post" },
              )
            }
          >
            {busy ? <Loader2Icon className="animate-spin" /> : <UploadIcon />}
            Import {valid.length > 0 && `${Math.min(valid.length, MAX_ROWS)} student${valid.length === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

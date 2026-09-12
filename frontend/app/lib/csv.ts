// CSV in (student import) and CSV out (the daily register).
//
// The import is parsed HERE, in the browser, so the office sees a preview with per-row errors and
// can fix a typo before anything is written — the API only ever receives JSON it can accept.
import type { Gender } from "./types";

// A tiny RFC-4180 reader: handles "quoted, fields", "" escapes inside them, CRLF, and a
// trailing newline. Schools export these from Excel, so quoted commas are the normal case.
// Each row keeps the line it came from, so "Line 12" in the preview points at line 12 of the
// file the user is about to reopen — blank lines are skipped, but they still count.
type RawRow = { cells: string[]; line: number };

function splitRows(text: string): RawRow[] {
  const rows: RawRow[] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let line = 1;

  const endRow = () => {
    row.push(field);
    rows.push({ cells: row, line });
    row = [];
    field = "";
  };

  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    if (quoted) {
      if (char !== '"') field += char;
      else if (text[i + 1] === '"') (field += '"'), i++; // "" is one literal quote
      else quoted = false;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ",") (row.push(field), (field = ""));
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      endRow();
      line++;
    } else field += char;
  }
  endRow();

  // drop blank lines: a file pasted from a spreadsheet is full of them
  return rows.filter(({ cells }) => cells.some((cell) => cell.trim() !== ""));
}

// column name → what we call it. Schools write the same column five different ways.
const HEADERS: Record<string, "rollNo" | "name" | "gender"> = {
  rollno: "rollNo",
  roll_no: "rollNo",
  "roll no": "rollNo",
  roll: "rollNo",
  rollnumber: "rollNo",
  roll_number: "rollNo",
  "roll number": "rollNo",
  name: "name",
  studentname: "name",
  student_name: "name",
  "student name": "name",
  fullname: "name",
  full_name: "name",
  "full name": "name",
  gender: "gender",
  sex: "gender",
};

const GENDERS: Record<string, Gender> = { male: "male", m: "male", boy: "male", female: "female", f: "female", girl: "female", other: "other", o: "other" };

export type ParsedRow = { line: number; rollNo: string; name: string; gender: Gender; errors: string[] };
export type ParsedCsv = { rows: ParsedRow[]; error?: string };

// Same rules the API enforces, so a preview with no errors always imports cleanly.
export function parseStudentCsv(text: string): ParsedCsv {
  const table = splitRows(text);
  if (table.length === 0) return { rows: [], error: "That file is empty." };

  const header = table[0]!.cells.map((cell) => HEADERS[cell.trim().toLowerCase().replace(/^﻿/, "")]);
  const column = {
    rollNo: header.indexOf("rollNo"),
    name: header.indexOf("name"),
    gender: header.indexOf("gender"),
  };
  if (column.rollNo === -1 || column.name === -1) {
    return { rows: [], error: "The first row must name the columns, and must include a roll number column and a name column." };
  }

  const seen = new Set<string>();
  const rows = table.slice(1).map(({ cells, line }): ParsedRow => {
    const rollNo = (cells[column.rollNo] ?? "").trim();
    const name = (cells[column.name] ?? "").trim();
    const rawGender = column.gender === -1 ? "" : (cells[column.gender] ?? "").trim().toLowerCase();
    const errors: string[] = [];

    if (!rollNo) errors.push("Roll number is required");
    else if (rollNo.length > 32) errors.push("Roll number is too long");
    else if (seen.has(rollNo)) errors.push("Repeated in this file");
    seen.add(rollNo);

    if (!name) errors.push("Name is required");
    else if (name.length > 255) errors.push("Name is too long");

    if (rawGender && !GENDERS[rawGender]) errors.push(`"${rawGender}" isn't male, female or other`);

    return { line, rollNo, name, gender: GENDERS[rawGender] ?? "other", errors };
  });

  return rows.length === 0 ? { rows, error: "The file has a header row but no students." } : { rows };
}

// ---------- export ----------

const escape = (value: string | number) => {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

export const toCsv = (rows: (string | number)[][]) => rows.map((row) => row.map(escape).join(",")).join("\r\n");

// Excel only reads UTF-8 correctly when the file starts with a BOM, and these registers
// carry Devanagari names.
export function downloadCsv(filename: string, csv: string) {
  const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  const link = Object.assign(document.createElement("a"), { href: url, download: filename });
  link.click();
  URL.revokeObjectURL(url);
}

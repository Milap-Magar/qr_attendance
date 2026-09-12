// "Present once a day" needs an answer to "which day?", and that answer depends on where the
// school is. A scan at 9am in Kathmandu is 03:15 UTC the same date, but an evening class at 7pm
// in New York is already the NEXT date in UTC — which would mark a student present for tomorrow.
//
// So the day is always the school's own local calendar date, never the server's.

// "2026-09-12" for the given instant, in the school's timezone.
// en-CA is the locale whose date format IS ISO (YYYY-MM-DD), so no reassembling is needed.
export function schoolDay(timezone: string, now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

// An unknown timezone makes every later schoolDay() call throw, which would break scanning
// for the whole school. Checked when an admin sets it, so it can never be stored wrong.
export function isValidTimezone(timezone: string) {
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

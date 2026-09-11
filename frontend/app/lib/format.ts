const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
const time = new Intl.DateTimeFormat(undefined, { timeStyle: "short" });
const date = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

export const formatDateTime = (iso: string) => dateTime.format(new Date(iso));
export const formatTime = (iso: string) => time.format(new Date(iso));
export const formatDate = (iso: string) => date.format(new Date(iso));

export const initials = (name: string) =>
  name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

export const roleLabel: Record<string, string> = {
  system: "Platform owner",
  admin: "Admin",
  teachers: "Teacher",
  users: "Student",
};

// what to call an organization in UI copy: "your school" / "your college"
export const orgNoun: Record<string, string> = {
  school: "school",
  college: "college",
  university: "university",
  other: "organization",
};

export const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

// "K7QMX2PD" → "K7QM-X2PD" (easier to read out loud / off a projector). The API accepts both.
export const formatJoinCode = (code: string) => code.replace(/^(.{4})(.+)$/, "$1-$2");

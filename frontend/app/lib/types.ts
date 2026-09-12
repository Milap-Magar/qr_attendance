// Shapes returned by the backend (see ../../API.md)
//
// Students are roster rows, NOT accounts: only staff (admin / teachers / system) log in.

export type Role = "system" | "admin" | "teachers" | "users";

export type Permission =
  | "users:read"
  | "users:create"
  | "users:update"
  | "users:delete"
  | "profile:read"
  | "profile:update"
  | "classes:read"
  | "classes:manage"
  | "students:read"
  | "students:manage"
  | "reports:read"
  | "credentials:manage"
  | "sessions:manage"
  | "attendance:scan"
  | "organization:manage"
  | "platform:manage";

export type Gender = "male" | "female" | "other";

export type OrganizationType = "school" | "college" | "university" | "other";

// what everyone in a school may see about it
export type Organization = { id: string; name: string; type: OrganizationType };

// GET /api/organizations/current as the school's admin.
// `timezone` (IANA) decides which calendar day a scan is counted for.
export type ManagedOrganization = Organization & { joinCode: string; timezone: string; createdAt: string };

// GET /api/organizations (platform operator)
export type PlatformOrganization = ManagedOrganization & { students: number; staff: number; sessions: number };

// a staff account. Students never have one.
export type User = {
  id: string;
  name: string;
  email: string;
  gender: Gender;
  role: Role;
  organizationId: string | null; // null only for `system` (the platform operator)
  isActive: boolean;
  createdAt: string;
};

export type Me = User & { permissions: Permission[]; organization: Organization | null };

// ---------- classes ----------

// `label` is "10 A", or just "10" when the grade isn't split into sections
export type ClassRef = { id: string; grade: string; section: string; academicYear: string; label: string };

export type ClassRow = {
  id: string;
  organizationId: string;
  grade: string;
  section: string;
  academicYear: string;
  createdAt: string;
  studentCount: number;
  label: string;
};

// ---------- students ----------

export type Student = {
  id: string;
  organizationId: string;
  classId: string;
  rollNo: string;
  name: string;
  gender: Gender;
  isActive: boolean;
  createdAt: string;
  class: ClassRef;
  hasActiveCard: boolean;
};

// ---------- QR cards ----------

export type Credential = { id: string; studentId: string; createdAt: string; revokedAt: string | null };

// The ONLY response that ever carries the plain token. It is never readable again —
// the server keeps a hash — so whatever receives this must offer to print it immediately.
export type IssuedCard = Credential & { token: string };

// POST /api/students
export type StudentWithCard = { student: Student; card: IssuedCard };

// POST /api/students/import
export type ImportResult = {
  created: StudentWithCard[];
  skipped: { rollNo: string; name: string; reason: string }[];
  imported: number;
  skippedCount: number;
};

// POST /api/classes/:id/cards
export type ClassCards = {
  class: { id: string; label: string; academicYear: string };
  issued: number;
  skipped: number;
  cards: { student: { id: string; name: string; rollNo: string }; card: IssuedCard }[];
};

// ---------- attendance ----------

export type SessionStatus = "upcoming" | "open" | "closed";

export type AttendanceSession = {
  id: string;
  title: string;
  openedBy: string;
  opensAt: string;
  closesAt: string;
  createdAt: string;
  checkedInCount: number;
  status: SessionStatus;
};

export type AttendanceRecord = {
  id: string;
  scannedAt: string;
  scannedBy: string;
  attendanceDate: string;
  student: { id: string; name: string; rollNo: string };
  class: { id: string; grade: string; section: string; label: string };
};

export type ScanResult = {
  message: string;
  student: { id: string; name: string; rollNo: string; isActive: boolean; class: { id: string; grade: string; section: string; label: string } };
  session: { id: string; title: string };
  record: { id: string; scannedAt: string; attendanceDate: string };
};

// GET /api/attendance/register — the daily register for one class
export type RegisterEntry = {
  id: string;
  name: string;
  rollNo: string;
  gender: Gender;
  present: boolean;
  scannedAt: string | null;
  sessionId: string | null;
};

export type DailyRegister = {
  date: string; // "2026-09-12", the school's own day
  class: { id: string; label: string; academicYear: string };
  present: number;
  absent: number;
  total: number;
  students: RegisterEntry[];
};

// GET /api/attendance/summary — every class's tally for one day
export type DailySummary = {
  date: string;
  present: number;
  total: number;
  classes: { id: string; grade: string; section: string; academicYear: string; label: string; total: number; present: number; absent: number }[];
};

// GET /api/attendance/students/:id
export type StudentAttendance = { id: string; attendanceDate: string; scannedAt: string; session: { id: string; title: string } };

export type AuthResponse = { user: User; accessToken: string; refreshToken: string };

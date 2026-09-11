// Shapes returned by the backend (see ../../API.md)

export type Role = "system" | "admin" | "teachers" | "users";

export type Permission =
  | "users:read"
  | "users:create"
  | "users:update"
  | "users:delete"
  | "profile:read"
  | "profile:update"
  | "reports:read"
  | "credentials:manage"
  | "sessions:manage"
  | "attendance:scan"
  | "qr:self"
  | "organization:manage"
  | "platform:manage";

export type OrganizationType = "school" | "college" | "university" | "other";

// what everyone in a school may see about it
export type Organization = { id: string; name: string; type: OrganizationType };

// GET /api/organizations/current as the school's admin
export type ManagedOrganization = Organization & { joinCode: string; createdAt: string };

// GET /api/organizations (platform operator)
export type PlatformOrganization = ManagedOrganization & { students: number; staff: number; sessions: number };

export type User = {
  id: string;
  name: string;
  email: string;
  gender: "male" | "female" | "other";
  role: Role;
  organizationId: string | null; // null only for `system` (the platform operator)
  isActive: boolean;
  createdAt: string;
};

export type Me = User & { permissions: Permission[]; organization: Organization | null };

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
  student: { id: string; name: string; email: string };
};

export type MyAttendance = {
  id: string;
  scannedAt: string;
  session: { id: string; title: string; opensAt: string };
};

export type Credential = {
  id: string;
  userId: string;
  method: "card" | "device";
  createdAt: string;
  revokedAt: string | null;
};

export type ScanResult = {
  message: string;
  student: { id: string; name: string; email: string };
  session: { id: string; title: string };
  record: { id: string; scannedAt: string };
};

export type AuthResponse = { user: User; accessToken: string; refreshToken: string };

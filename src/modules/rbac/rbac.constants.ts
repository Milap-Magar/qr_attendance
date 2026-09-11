import type { Permission, Role } from "./rbac.types";

export const PERMISSIONS = [
    "users:read",
    "users:create",
    "users:update",
    "users:delete",
    "profile:read",
    "profile:update",
    "reports:read",        // see who checked in to a session
    "credentials:manage",  // issue / list / revoke student QR cards
    "sessions:manage",     // open / close attendance sessions
    "attendance:scan",     // operate the scanner laptop
] as const;

// THE POLICY — which role can do what.
// To change who can do something, edit ONLY this map. Routes never check role names.
export const rolePermission: Record<Role, readonly Permission[]> = {
    users: [
        "profile:read",
        "profile:update",
    ],

    admin: [
        "profile:read",
        "profile:update",
        "users:read",
        "users:update",
        "users:delete",
        "reports:read",
        "credentials:manage",
        "sessions:manage",
        "attendance:scan",
    ],

    system: [
        "profile:read",
        "profile:update",
        "users:read",
        "users:create",
        "users:update",
        "users:delete",
        "reports:read",
        "credentials:manage",
        "sessions:manage",
        "attendance:scan",
    ],

    teachers: [
        "profile:read",
        "profile:update",
        "users:read",
        "users:update",
        "sessions:manage",
        "attendance:scan",
    ],
};

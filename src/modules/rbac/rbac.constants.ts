import type { Permission, Role } from "./rbac.types";

export const PERMISSIONS = [
    "users:read",
    "users:create",
    "users:update",
    "users:delete",
    "profile:read",
    "profile:update",
    "reports:read",          // see who checked in to a session
    "credentials:manage",    // issue / list / revoke student QR cards
    "sessions:manage",       // open / close attendance sessions
    "attendance:scan",       // operate the scanner laptop
    "qr:self",               // show my own QR on my phone
    "organization:manage",   // edit my school's name/type, see + regenerate its join code
    "platform:manage",       // see every school on the platform (the SaaS operator)
] as const;

// THE POLICY — which role can do what.
// To change who can do something, edit ONLY this map. Routes never check role names.
//
// Every permission except platform:manage is about the caller's OWN school:
// the routes scope every query to request.user.orgId.
export const rolePermission: Record<Role, readonly Permission[]> = {
    // students
    users: [
        "profile:read",
        "profile:update",
        "qr:self",
    ],

    // a school's administrator. The person who signs the school up is the first one.
    admin: [
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
        "organization:manage",
    ],

    // the platform operator (you). Belongs to no school, so has no school permissions.
    system: [
        "profile:read",
        "profile:update",
        "platform:manage",
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

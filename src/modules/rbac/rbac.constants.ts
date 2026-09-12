import type { Permission, Role } from "./rbac.types";

export const PERMISSIONS = [
    "users:read",
    "users:create",
    "users:update",
    "users:delete",
    "profile:read",
    "profile:update",
    "classes:read",          // see the school's classes and their rosters
    "classes:manage",        // create / rename / delete classes
    "students:read",         // see student roster entries
    "students:manage",       // add students (one by one or by CSV import), edit, remove
    "reports:read",          // see who was present
    "credentials:manage",    // issue / list / revoke student QR cards
    "sessions:manage",       // open / close attendance sessions
    "attendance:scan",       // operate the scanner laptop
    "organization:manage",   // edit my school's name/type/timezone, see + regenerate its join code
    "platform:manage",       // see every school on the platform (the SaaS operator)
] as const;

// THE POLICY — which role can do what.
// To change who can do something, edit ONLY this map. Routes never check role names.
//
// Every permission except platform:manage is about the caller's OWN school:
// the routes scope every query to request.user.orgId.
//
// Only STAFF have roles at all. Students are roster rows, not accounts — they never log in,
// so they appear nowhere in this map.
export const rolePermission: Record<Role, readonly Permission[]> = {
    // LEGACY. Students used to be user accounts with this role. Nothing creates one any more;
    // it stays so that any account left over from before can still log in and see nothing harmful.
    users: [
        "profile:read",
        "profile:update",
    ],

    // a school's administrator. The person who signs the school up is the first one.
    admin: [
        "profile:read",
        "profile:update",
        "users:read",
        "users:create",
        "users:update",
        "users:delete",
        "classes:read",
        "classes:manage",
        "students:read",
        "students:manage",
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

    // Any teacher can scan any student — attendance is school-wide, not per class.
    // They can read rosters and reports (they need the class-wise present/absent list),
    // but they don't add students or issue cards; that's the office's job.
    teachers: [
        "profile:read",
        "profile:update",
        "users:read",
        "users:update",
        "classes:read",
        "students:read",
        "reports:read",
        "sessions:manage",
        "attendance:scan",
    ],
};

export const User = {
    ADMIN: "admin",
    SYSTEM:  "system",
    TEACHERS: "teachers",
    USERS: "users"
} as const;

export const PERMISSIONS = {
    USERS_READ: "users:read",
    USERS_CREATE: "users:create",
    USERS_UPDATE: "users:update",
    USERS_DELETE: "users:delete",

    PROFILE_READ: "profile:read",
    PROFILE_UPDATE: "profile:update",

    REPORTS_READ: "reports:read",
} as const

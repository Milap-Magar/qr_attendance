export type Role =
    | "admin"
    | "system"
    | "techers"
    | "users"

export type Permission =
    | "users:read"
    | "users:create"
    | "users:update"
    | "users:delete"
    | "profile:read"
    | "profile:update"
    | "reports:read"
// derived, never retyped by hand — the source lists live in
// common.types.ts (roles) and rbac.constants.ts (permissions)
export type { Role } from "../../common/types/common.types";

import type { PERMISSIONS } from "./rbac.constants";
export type Permission = (typeof PERMISSIONS)[number];

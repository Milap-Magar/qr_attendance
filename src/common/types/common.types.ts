import { z } from "zod";

// defining enums - using as const because it might not infer the exact values of each elements of arrays of values:
export const genderEnum = ["male", "female", "other"] as const;
// same order as the "role" enum already in the DB (drizzle/0000_massive_archangel.sql)
export const roleEnum = ["system", "admin", "teachers", "users"] as const;

// derived from the array above, so a typo'd role is a compile error
export type Role = (typeof roleEnum)[number];

// what kind of place an organization (tenant) is. Only changes wording in the UI.
export const organizationTypeEnum = ["school", "college", "university", "other"] as const;
export type OrganizationType = (typeof organizationTypeEnum)[number];

// for routes like /:id — rejects "abc" with a 400 before it reaches Postgres
// (Postgres would throw "invalid input syntax for type uuid" → 500)
export const idParamSchema = z.object({ id: z.uuid() });

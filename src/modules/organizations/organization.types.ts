import { z } from "zod";
import { organizationTypeEnum } from "../../common/types/common.types";
import { normalizeJoinCode } from "../../common/crypto";
import { isValidTimezone } from "../../common/school-day";

export const organizationNameSchema = z.string().trim().min(3, "Name must be at least 3 characters").max(255);

// accepts "k7qm-x2pd" as well as "K7QMX2PD"
export const joinCodeSchema = z.string({ error: "Join code is required" })
    .transform(normalizeJoinCode)
    .pipe(z.string().min(4, "Enter the join code your school gave you").max(16, "That join code is too long"));

// GET /api/organizations/lookup?code=... — which school does this join code belong to?
export const lookupQuerySchema = z.object({
    code: joinCodeSchema,
})

// An IANA name like "Asia/Kathmandu". Validated against what this runtime actually knows,
// because a name Intl can't resolve would throw on every scan from then on.
export const timezoneSchema = z.string().trim().min(1).max(64)
    .refine(isValidTimezone, "Unknown timezone. Use an IANA name like Asia/Kathmandu");

// PATCH /api/organizations/current
export const updateOrganizationSchema = z.object({
    name: organizationNameSchema.optional(),
    type: z.enum(organizationTypeEnum).optional(),
    timezone: timezoneSchema.optional(),
}).refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: "Send at least one field to update",
})

export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;

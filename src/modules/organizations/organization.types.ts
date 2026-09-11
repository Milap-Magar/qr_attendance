import { z } from "zod";
import { organizationTypeEnum } from "../../common/types/common.types";
import { normalizeJoinCode } from "../../common/crypto";

export const organizationNameSchema = z.string().trim().min(3, "Name must be at least 3 characters").max(255);

// accepts "k7qm-x2pd" as well as "K7QMX2PD"
export const joinCodeSchema = z.string({ error: "Join code is required" })
    .transform(normalizeJoinCode)
    .pipe(z.string().min(4, "Enter the join code your school gave you").max(16, "That join code is too long"));

// GET /api/organizations/lookup?code=... — which school does this join code belong to?
export const lookupQuerySchema = z.object({
    code: joinCodeSchema,
})

// PATCH /api/organizations/current
export const updateOrganizationSchema = z.object({
    name: organizationNameSchema.optional(),
    type: z.enum(organizationTypeEnum).optional(),
}).refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: "Send at least one field to update",
})

export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;

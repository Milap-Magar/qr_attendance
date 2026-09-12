// Create any user from the terminal.
//
// The platform operator (you) — belongs to no school, sees every school:
//   bun run create-user --name "Platform Owner" --email you@hajir.app --password 'Admin@123' --role system
//
// Someone inside a school (schools normally sign up at /signup, this is the fallback):
//   bun run create-user --school K7QM-X2PD --name "Admin" --email admin@school.com --password 'Admin@123' --role admin
//
// roles: system | admin | teachers   (default: admin). --school = the school's join code.
// Students are NOT made here: they are roster rows a school adds in the app, never accounts.
import { parseArgs } from "node:util";
import { ZodError, z } from "zod";
import { client } from "../src/db";

import { createUserSchemas, schoolRoleEnum } from "../src/modules/users/user.types";
import { userServices } from "../src/modules/users/user.service";
import { joinCodeSchema } from "../src/modules/organizations/organization.types";
import { organizationServices } from "../src/modules/organizations/organization.services";

// every role this script may create: a school's staff, plus the platform operator.
// `users` (the old student role) is deliberately absent — students aren't accounts.
const staffRoleEnum = [...schoolRoleEnum, "system"] as const;

const { values } = parseArgs({
  options: {
    name: { type: "string" },
    email: { type: "string" },
    password: { type: "string" },
    role: { type: "string" },
    gender: { type: "string" },
    school: { type: "string" },
  },
});

// same validation as the API (password rules etc.), but the CLI may also create `system`
const cliSchema = createUserSchemas.extend({
  role: z.enum(staffRoleEnum).default("admin"),
  school: joinCodeSchema.optional(),
}).refine((v) => (v.role === "system") === (v.school === undefined), {
  message: "--school <join code> is required for every role except system (and not allowed for system)",
  path: ["school"],
});

try {
  const { school, ...input } = cliSchema.parse(values);
  const organization = school ? await organizationServices.findByJoinCode(school) : null;
  const user = await userServices.addUsers(input, organization?.id ?? null);
  console.log("✅ User created:", { ...user, school: organization?.name ?? "(platform)" });
} catch (error) {
  if (error instanceof ZodError) console.error("❌ Invalid input:\n" + z.prettifyError(error));
  else console.error("❌", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await client.end();
}

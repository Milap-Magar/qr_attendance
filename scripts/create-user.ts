// Create any user from the terminal — this is how you get your FIRST admin,
// since the public /register endpoint only ever creates students.
//
//   bun run create-user --name "Admin" --email admin@school.com --password 'Admin@123' --role admin
//
// roles: system | admin | teachers | users   (default: users)
import { parseArgs } from "node:util";
import { ZodError, z } from "zod";
import { client } from "../src/db";
import { createUserSchemas } from "../src/modules/users/user.types";
import { userServices } from "../src/modules/users/user.service";

const { values } = parseArgs({
  options: {
    name: { type: "string" },
    email: { type: "string" },
    password: { type: "string" },
    role: { type: "string" },
    gender: { type: "string" },
  },
});

try {
  // same validation as the API, so the password rules etc. still apply
  const input = createUserSchemas.parse(values);
  const user = await userServices.addUsers(input);
  console.log("✅ User created:", user);
} catch (error) {
  if (error instanceof ZodError) console.error("❌ Invalid input:\n" + z.prettifyError(error));
  else console.error("❌", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await client.end();
}

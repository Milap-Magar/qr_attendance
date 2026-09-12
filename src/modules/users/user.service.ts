import { and, asc, eq, isNull, ne } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "../../db";
import { users } from "../../db/schema";
import { AppError } from "../../common/errors";
import type { Role } from "../../common/types/common.types";
import type { NewUserType, UpdateUserType } from "./user.types";

// The ONLY columns we ever send to a client. Use it in every select/returning,
// so password_hash can't leak by accident.
export const publicUserColumns = {
  id: users.id,
  name: users.name,
  email: users.email,
  gender: users.gender,
  role: users.role,
  organizationId: users.organizationId,
  isActive: users.is_active,
  createdAt: users.createdAt,
};

// "in the same school as the caller". orgId null = the caller is `system`, who only ever sees themselves.
const inOrg = (orgId: string | null) => (orgId ? eq(users.organizationId, orgId) : isNull(users.organizationId));

// `db` or a transaction (see authServices.registerSchool)
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export const userServices = {
  // The school's STAFF (optionally one role). Accounts with the legacy "users" role are left out:
  // students used to be accounts, and any row left over from then is not staff and must not show
  // up on the staff page. Ask for role="users" explicitly if you ever need to find them.
  async getAllUsers(orgId: string, role?: Role) {
    return await db.select(publicUserColumns)
      .from(users)
      .where(and(
        eq(users.organizationId, orgId),
        role ? eq(users.role, role) : ne(users.role, "users"),
      ))
      .orderBy(asc(users.name));
  },

  // NOT scoped to a school: only for "who am I" and internal lookups by a trusted id
  async getUserById(id : string){
    const [selectedUser] = await db.select(publicUserColumns).from(users).where(eq(users.id, id));
    if(!selectedUser){
      throw new AppError(404, "User not found!", "USER_NOT_FOUND");
    }
    return selectedUser;
  },

  // a user in the caller's school. Someone from another school is a 404, exactly like a missing user,
  // so ids from other schools can't even be confirmed to exist.
  async getUserInOrg(id: string, orgId: string | null) {
    const [selectedUser] = await db.select(publicUserColumns).from(users).where(and(eq(users.id, id), inOrg(orgId)));
    if(!selectedUser){
      throw new AppError(404, "User not found!", "USER_NOT_FOUND");
    }
    return selectedUser;
  },

  async assertEmailFree(email: string) {
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
    if(existing){
      throw new AppError(409, "Email is already registered", "EMAIL_TAKEN");
    }
  },

  // add a user to a school (password gets hashed). organizationId null only for `system`.
  async addUsers(data: NewUserType, organizationId: string | null, tx: Tx | typeof db = db) {
    if ((data.role === "system") !== (organizationId === null)) {
      throw new AppError(400, "Only system accounts exist outside a school", "INVALID_ORGANIZATION");
    }
    await userServices.assertEmailFree(data.email);
    const hash = await bcrypt.hash(data.password, 10);
    const [newUser] = await tx.insert(users)
      .values({ ...data, organizationId, password: hash })
      .returning(publicUserColumns);
    return newUser!;
  },

  // update a user in the caller's school
  async updateUsers(id: string, orgId: string | null, updateData: UpdateUserType){
    // returning() gives an array, so [updatedUser] picks the first (and only) row
    const [updatedUser] = await db.update(users)
      .set(updateData)
      .where(and(eq(users.id, id), inOrg(orgId)))
      .returning(publicUserColumns);
    if(!updatedUser){
      throw new AppError(404, "User not found!", "USER_NOT_FOUND");
    }
    return updatedUser;
  },
}

import { asc, eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "../../db";
import { users } from "../../db/schema";
import { AppError } from "../../common/errors";
import type { Role } from "../../common/types/common.types";
import type { CreateUserType, UpdateUserType } from "./user.types";

// The ONLY columns we ever send to a client. Use it in every select/returning,
// so password_hash can't leak by accident.
export const publicUserColumns = {
  id: users.id,
  name: users.name,
  email: users.email,
  gender: users.gender,
  role: users.role,
  isActive: users.is_active,
  createdAt: users.createdAt,
};

export const userServices = {
  // fetch all the users (optionally only one role)
  async getAllUsers (role?: Role) {
    return await db.select(publicUserColumns)
      .from(users)
      .where(role ? eq(users.role, role) : undefined)
      .orderBy(asc(users.name));
  },

  // fetch user by Id
  async getUserById(id : string){
    const [selectedUser] = await db.select(publicUserColumns).from(users).where(eq(users.id, id));
    if(!selectedUser){
      throw new AppError(404, "User not found!", "USER_NOT_FOUND");
    }
    return selectedUser;
  },

  // add users (password gets hashed, same as register)
  async addUsers(data: CreateUserType) {
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, data.email));
    if(existing){
      throw new AppError(409, "Email is already registered", "EMAIL_TAKEN");
    }
    const hash = await bcrypt.hash(data.password, 10);
    const [newUser] = await db.insert(users).values({ ...data, password: hash }).returning(publicUserColumns);
    return newUser!;
  },

  // update users
  async updateUsers(id: string, updateData: UpdateUserType){
    // returning() gives an array, so [updatedUser] picks the first (and only) row
    const [updatedUser] = await db.update(users).set(updateData).where(eq(users.id, id)).returning(publicUserColumns);
    if(!updatedUser){
      throw new AppError(404, "User not found!", "USER_NOT_FOUND");
    }
    return updatedUser;
  },
}

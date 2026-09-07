import { eq } from "drizzle-orm";
import { db } from "../../db";
import { users } from "../../db/schema";
import type { CreateUserType, UpdateUserType } from "./user.types";




export const userServices = {
  // fetch all the users
  async getAllUsers () {
    return await db.select({
      id: users.id,
      name: users.name,
      email: users.email,
      gender: users.gender,
      role: users.role,
      isActive: users.is_active,
    }).from(users); 
  },

  // fetch all user by Id
  async getUserById(id : string){
    const [selectedUser] = await db.select({
      id: users.id,
      name: users.name,
      email: users.email,
    }).from(users).where(eq(users.id, id));
    if(selectedUser){
      return selectedUser;
    }
  },

  // add users
  async addUsers(data: CreateUserType) {
    const [newUser] = await db.insert(users).values(data as any).returning();
    return newUser;
  },

  // update users
  async updateUsers(updateData: UpdateUserType){
    const {id, name} = updateData;
    const selectedId = await db.select().from(users).where(eq(users.id, id));

    if(selectedId){
      // update the user
      // returning() gives as array like [] so no need to give like [user] or it might get like [[user]]
      const updatedUser = await db.update(users).set({ name: name}).where(eq(users.id, id)).returning();
      return updatedUser;
    }
  },
}
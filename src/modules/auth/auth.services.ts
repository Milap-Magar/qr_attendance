import { and, eq, gt, isNull } from "drizzle-orm"
import { db } from "../../db"
import { refreshTokens, users } from "../../db/schema"
import type { loginUserTypes, registerUserTypes } from "./auth.types";
import bcrypt from 'bcryptjs';
import { AppError } from "../../common/errors";
import { generateToken, hashToken } from "../../common/crypto";
import { config } from "../../config";
import { publicUserColumns } from "../users/user.service";

const DAY_MS = 24 * 60 * 60 * 1000;

export const authServices = {
    // register services — always creates a normal "users" account.
    // (the role is never taken from the request, otherwise anyone could sign up as admin)
    async register(user: registerUserTypes ){
        // check whether the email exists or not?
        const [existingUser] = await db.select({ id: users.id }).from(users).where(eq(users.email, user.email));
        if(existingUser){
            throw new AppError(409, "Email is already registered", "EMAIL_TAKEN");
        }
        // hash the password — 10 = salt rounds (how slow the hash is, on purpose)
        const hash = await bcrypt.hash(user.password, 10);
        // insert and return only safe columns (never send password_hash back)
        const [newUser] = await db.insert(users)
            .values({ name: user.name, email: user.email, gender: user.gender, password: hash })
            .returning(publicUserColumns);
        return newUser!;
    },

    //login services
    async login({ email, password }: loginUserTypes){
        // adding [] brackets gives either 1 response data or 0 (non).
        const [data] = await db.select({ ...publicUserColumns, passwordHash: users.password })
            .from(users).where(eq(users.email, email));

        // same message for "no such email" and "wrong password", so an attacker
        // can't use the login form to find out which emails are registered
        const isValid = data ? await bcrypt.compare(password, data.passwordHash) : false;
        if(!data || !isValid){
            throw new AppError(401, "Invalid email or password", "INVALID_CREDENTIALS");
        }

        // strip the hash before returning
        const { passwordHash, ...user } = data;
        return user;
    },

    // creates a refresh token for this user and returns the PLAIN token (only time we ever see it)
    async createRefreshToken(userId: string){
        const token = generateToken();
        await db.insert(refreshTokens).values({
            userId,
            tokenHash: hashToken(token),
            expiresAt: new Date(Date.now() + config.refreshTokenTtlDays * DAY_MS),
        });
        return token;
    },

    // ROTATION: a refresh token works exactly once.
    // We revoke the old one and the caller gets a brand-new one.
    async rotateRefreshToken(token: string){
        // one atomic UPDATE: "revoke this token IF it is still valid".
        // If two requests race with the same token, only one of them gets a row back.
        const [old] = await db.update(refreshTokens)
            .set({ revokedAt: new Date() })
            .where(and(
                eq(refreshTokens.tokenHash, hashToken(token)),
                isNull(refreshTokens.revokedAt),
                gt(refreshTokens.expiresAt, new Date()),
            ))
            .returning({ userId: refreshTokens.userId });

        if(!old){
            throw new AppError(401, "Invalid or expired refresh token", "INVALID_REFRESH_TOKEN");
        }

        // read the user fresh from the DB, so a role change shows up in the next access token
        const [user] = await db.select(publicUserColumns).from(users).where(eq(users.id, old.userId));
        if(!user){
            throw new AppError(401, "Invalid or expired refresh token", "INVALID_REFRESH_TOKEN");
        }

        const refreshToken = await authServices.createRefreshToken(user.id);
        return { user, refreshToken };
    },

    // logout: revoke the token. Doing it twice (or with a junk token) is harmless.
    async revokeRefreshToken(token: string){
        await db.update(refreshTokens)
            .set({ revokedAt: new Date() })
            .where(and(eq(refreshTokens.tokenHash, hashToken(token)), isNull(refreshTokens.revokedAt)));
    },
}

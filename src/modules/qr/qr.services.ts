import crypto from "node:crypto";
import { eq } from "drizzle-orm";

import { db } from "../../db";
import { qrSessions } from "../../db/schema";

export const qrServices = {

  //fetching the qr
  async getQr(){
    const token = crypto.randomBytes(32).toString("hex");

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    const expiresAt = new Date(Date.now());

    const [qr] = await db.insert(qrSessions).values({token: tokenHash, isActive: true, expiresAt,}).returning();

    return {
      status: 200,
      message: "QR genereated",
      data:{
        qrSessionId: qr?.id,
        token,
        expiresAt
      }
    }
  },
  
  // verifying the qr
  async verifyQr(token: string) {
    // 1. Hash the incoming token
    const tokenHash = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    // 2. Find QR session
    const [qr] = await db
      .select()
      .from(qrSessions)
      .where(eq(qrSessions.token, tokenHash));

    // 3. Check whether it exists
    if (!qr) {
      return {
        status: 404,
        message: "Invalid QR code",
      };
    }

    // 4. Check whether it is active
    if (!qr.isActive) {
      return {
        status: 401,
        message: "QR code is no longer active",
      };
    }

    // 5. Check expiration
    if (qr.expiresAt <= new Date()) {
      return {
        status: 401,
        message: "QR code has expired",
      };
    }

    // 6. Return verification result
    return {
      status: 200,
      message: "QR verified",
      data: {
        qrSessionId: qr.id,
      },
    };
  },
};
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../../db";
import { credentials } from "../../db/schema";
import { generateToken, hashToken } from "../../common/crypto";

// The low-level card operations, with NO permission or school checks of their own.
//
// This file exists so that `students` (which issues a card the moment a student is added) and
// `qr` (which re-issues and revokes them) can both use it without importing each other.
// Anything reached from a route goes through qrServices or studentServices, which do the checks.

// safe columns — token_hash is never sent to anyone
export const credentialColumns = {
  id: credentials.id,
  studentId: credentials.studentId,
  createdAt: credentials.createdAt,
  revokedAt: credentials.revokedAt,
};

// `db` or a transaction, so a student and their card are created together or not at all
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Give this student a card, revoking whichever one they had.
//
// Returns the plain `token` — the ONLY time it is ever readable, because the row stores just its
// sha256 hash. Whoever calls this must print or display it now; there is no way to look it up later.
export async function issueCardFor(studentId: string, tx: Tx | typeof db = db) {
  const token = generateToken();

  // one active card per student. Re-issuing (lost card) kills the old one, so a card
  // someone else found stops working the moment a replacement is printed.
  await tx.update(credentials)
    .set({ revokedAt: new Date() })
    .where(and(eq(credentials.studentId, studentId), isNull(credentials.revokedAt)));

  const [created] = await tx.insert(credentials)
    .values({ studentId, tokenHash: hashToken(token) })
    .returning(credentialColumns);

  return { ...created!, token };
}

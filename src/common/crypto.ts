import { createHash, randomBytes } from "node:crypto";

// A long random string that is impossible to guess (32 bytes = 256 bits).
// Used for refresh tokens and for the token printed inside a QR code.
export function generateToken() {
  return randomBytes(32).toString("base64url");
}

// We store only the HASH of a token in the DB, never the token itself.
// If the DB leaks, the attacker gets hashes that can't be used as tokens.
//
// sha256 (not bcrypt) is correct here: bcrypt is slow on purpose to protect
// weak human passwords. These tokens are already random and unguessable, so a
// fast hash is enough, and it lets us look the token up with `WHERE token_hash = ?`.
export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

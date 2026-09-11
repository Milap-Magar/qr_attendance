import { createHash, randomBytes } from "node:crypto";

// A long random string that is impossible to guess (32 bytes = 256 bits).
// Used for refresh tokens and for the token printed inside a QR code.
export function generateToken() {
  return randomBytes(32).toString("base64url");
}

// Short code a student types to join a school, e.g. "K7QMX2PD" (shown as "K7QM-X2PD").
// No 0/O or 1/I, so it can be read off a projector. 32 symbols → 256 % 32 = 0, so no modulo bias.
const JOIN_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function generateJoinCode(length = 8) {
  return Array.from(randomBytes(length), (byte) => JOIN_CODE_ALPHABET[byte % JOIN_CODE_ALPHABET.length]).join("");
}

// what people type: "k7qm-x2pd ", "K7QM X2PD" → "K7QMX2PD"
export function normalizeJoinCode(input: string) {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
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

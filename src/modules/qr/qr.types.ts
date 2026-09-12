import { z } from "zod";

// POST /api/qr/credentials — re-issue a student's QR card (lost / damaged / never printed)
export const issueCredentialSchema = z.object({
    studentId: z.uuid(),
})

// GET /api/qr/credentials?studentId=... — optional filter
export const listCredentialsQuerySchema = z.object({
    studentId: z.uuid().optional(),
})

// POST /api/qr/scan — what the scanner laptop sends after decoding a QR image.
// No date here on purpose: WHICH day this counts for is decided by the server from the
// school's timezone, never by the scanning laptop's clock.
export const scanSchema = z.object({
    sessionId: z.uuid(),
    token: z.string().trim().min(1, "token is required"), // the raw text inside the QR code
})

export type ScanInput = z.infer<typeof scanSchema>;

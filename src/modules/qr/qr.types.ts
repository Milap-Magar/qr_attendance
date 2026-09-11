import { z } from "zod";

// POST /api/qr/credentials — issue a QR card for this student
export const issueCredentialSchema = z.object({
    userId: z.uuid(),
})

// GET /api/qr/credentials?userId=... — optional filter
export const listCredentialsQuerySchema = z.object({
    userId: z.uuid().optional(),
})

// POST /api/qr/scan — what the scanner laptop sends after decoding a QR image
export const scanSchema = z.object({
    sessionId: z.uuid(),
    token: z.string().trim().min(1, "token is required"), // the raw text inside the QR code
})

export type ScanInput = z.infer<typeof scanSchema>;

import z from "zod";

export const verifyQrSchema = z.object({
  token: z.string().min(1),
});

export type qrTypes = z.infer<typeof verifyQrSchema>
import { z } from "zod";

export const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

export type LoginInput = z.infer<typeof loginSchema>;

// Supabase stores a bcrypt hash, which reads at most 72 bytes; the minimum
// matches signup.
export const passwordSchema = z.string().min(8).max(72);

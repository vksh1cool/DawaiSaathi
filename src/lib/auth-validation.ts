import { z } from "zod";

/**
 * Shared email/password auth schemas. These have no "server-only" import so
 * the same validation runs both in the API routes and in the client
 * components that call them — client-side checks are just a fast-fail UX
 * layer; the server copy is what actually enforces the rule.
 */

export const authEmailSchema = z.string().trim().toLowerCase().email("Enter a valid email address.").max(254);

export const authPasswordSchema = z.string().min(8, "Password must be at least 8 characters.");

export const signUpSchema = z.object({
  email: authEmailSchema,
  password: authPasswordSchema,
  next: z.string().max(2048).optional(),
});

export const loginSchema = z.object({
  email: authEmailSchema,
  password: z.string().min(1, "Enter your password."),
});

export const resetRequestSchema = z.object({
  email: authEmailSchema,
  next: z.string().max(2048).optional(),
});

export const newPasswordSchema = z
  .object({
    password: authPasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export type SignUpInput = z.infer<typeof signUpSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ResetRequestInput = z.infer<typeof resetRequestSchema>;
export type NewPasswordInput = z.infer<typeof newPasswordSchema>;

import { z } from "zod";

export const Email = z.string().email();
export const Password = z.string().min(10);

export const RegisterSchema = z.object({
  email: Email,
  password: Password,
  displayName: z.string().min(2),
});

export const LoginSchema = z.object({
  email: Email,
  password: z.string().min(1),
});

export const SiweVerifySchema = z.object({
  nonceId: z.string().uuid(),
  message: z.string().min(1),
  signature: z.string().min(1),
});

/**
 * For linking we reuse the same SIWE verify payload.
 * You can extend this later with "label" or "makePrimary".
 */
export const WalletLinkSchema = SiweVerifySchema;

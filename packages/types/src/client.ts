import { z } from "zod";

export const CreateClientSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/, "slug must be lowercase alphanumeric with hyphens"),
  practiceState: z.string().length(2).toUpperCase().optional(),
  primaryCredential: z
    .enum(["LCSW", "LMFT", "LPC", "PsyD", "PhD", "MD", "Other"])
    .optional(),
  instagramHandle: z.string().optional(),
});

export const UpdateClientSchema = CreateClientSchema.partial();

export type CreateClientInput = z.infer<typeof CreateClientSchema>;
export type UpdateClientInput = z.infer<typeof UpdateClientSchema>;

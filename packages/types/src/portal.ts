import { z } from "zod";

export const MagicLinkSchema = z.object({
  email: z.string().email(),
  clientSlug: z.string().min(1),
});
export type MagicLinkInput = z.infer<typeof MagicLinkSchema>;

export const CommentSchema = z.object({
  body: z.string().min(1).max(2000),
  parentId: z.string().uuid().optional(),
});
export type CommentInput = z.infer<typeof CommentSchema>;

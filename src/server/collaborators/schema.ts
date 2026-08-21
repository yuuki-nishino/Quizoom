import { z } from "zod";

export const inviteRequestSchema = z.object({
  email: z.string().min(1),
});
export type InviteRequest = z.infer<typeof inviteRequestSchema>;

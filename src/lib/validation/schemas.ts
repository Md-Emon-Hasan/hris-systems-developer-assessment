import { z } from "zod";

export const loginSchema = z.object({
  email: z.email().max(254).transform((s) => s.trim().toLowerCase()),
  password: z.string().min(1).max(200),
});

export const requestSchema = z.object({
  title: z.string().trim().min(4).max(120),
  description: z.string().trim().min(10).max(3000),
  category: z.enum(["IT_EQUIPMENT", "SOFTWARE_ACCESS", "HR_QUERY", "FACILITIES", "OTHER"]),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]),
});

export const commentSchema = z.object({ body: z.string().trim().min(1).max(2000) });
export const transitionSchema = z.object({
  action: z.enum(["ASSIGN", "START", "RESOLVE", "CLOSE", "REOPEN"]),
  assigneeId: z.string().optional(), note: z.string().trim().max(500).optional(),
});

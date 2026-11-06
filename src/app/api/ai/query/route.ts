import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/permissions";
import { executeSmartQuery, generateAnswer } from "@/lib/ai/smart-query";
import { apiError } from "@/lib/auth/permissions";
import { z } from "zod";
import { checkRateLimit } from "@/lib/security/rate-limit";

const schema = z.object({ question: z.string().trim().min(5).max(500) });

export async function POST(request: Request) {
  try {
    const user = await requireRole("HR_ADMIN");
    const limit = checkRateLimit(`ai:${user.id}`, 20, 60_000);
    if (!limit.allowed) return NextResponse.json({ error: { code: "RATE_LIMITED", message: "Please wait a moment before asking another question." } }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: { code: "INVALID_INPUT", message: "Ask a question between 5 and 500 characters." } }, { status: 400 });
    const result = await executeSmartQuery(parsed.data.question);
    if (!result) return NextResponse.json({ error: { code: "UNSUPPORTED_QUERY", message: "Try a question about request counts, overdue onboarding tasks, or employee headcount." } }, { status: 422 });
    try {
      const generated = await generateAnswer(parsed.data.question, result);
      return NextResponse.json({ data: { answer: generated.answer, sources: [result.provenance], provider: generated.provider, generatedAt: new Date().toISOString() } });
    } catch (error) {
      console.error("Smart Query text generation failed", error instanceof Error ? error.message : "unknown provider error");
      return NextResponse.json({ data: { answer: result.summary, sources: [result.provenance], provider: "database-fallback", generatedAt: new Date().toISOString(), notice: "AI text generation is temporarily unavailable; this answer is calculated directly from current database records." } });
    }
  } catch (error) { return apiError(error); }
}

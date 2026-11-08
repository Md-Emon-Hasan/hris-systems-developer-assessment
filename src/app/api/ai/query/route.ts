import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/permissions";
import { executePlannedQuery, executeSmartQuery, generateAnswer, planSmartQuery } from "@/lib/ai/smart-query";
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
    let result = null;
    if (process.env.GROQ_API_KEY) {
      try {
        const plan = await planSmartQuery(parsed.data.question);
        if (plan) result = await executePlannedQuery(plan);
      } catch (error) {
        console.error("Smart Query planning failed; trying the built-in query patterns", error instanceof Error ? error.message : "unknown planner error");
      }
    }
    result ??= await executeSmartQuery(parsed.data.question);
    if (!result) return NextResponse.json({ error: { code: "UNSUPPORTED_QUERY", message: "I could not map that question to the HR records available here. Ask about employees, service requests, onboarding progress, overdue tasks, or task owners; include a country, department, name, or status when helpful." } }, { status: 422 });
    try {
      const generated = await generateAnswer(parsed.data.question, result);
      const answer = generated.provider === "groq" ? generated.answer : result.summary;
      return NextResponse.json({ data: { answer, summary: result.summary, results: result.data, sources: [result.provenance], provider: generated.provider, generatedAt: new Date().toISOString() } });
    } catch (error) {
      console.error("Smart Query text generation failed", error instanceof Error ? error.message : "unknown provider error");
      return NextResponse.json({ data: { answer: result.summary, summary: result.summary, results: result.data, sources: [result.provenance], provider: "database-fallback", generatedAt: new Date().toISOString(), notice: "AI text generation is temporarily unavailable; this answer is calculated directly from current database records." } });
    }
  } catch (error) {
    if (error instanceof Response && error.status === 403) {
      return NextResponse.json({ error: { code: "FORBIDDEN", message: "The AI assistant is available only to HR Admin accounts. Sign in with the HR Admin demo account to continue." } }, { status: 403 });
    }
    return apiError(error);
  }
}

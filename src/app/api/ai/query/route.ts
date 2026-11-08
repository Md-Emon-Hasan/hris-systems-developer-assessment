import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/permissions";
import { executeDeterministicQuery, executeSqlQuery, generateAnswer, planSqlQuery } from "@/lib/ai/smart-query";
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
    const useDeterministicFallback = process.env.HRIS_NEXT_DIST_DIR === ".next-e2e";
    if (!process.env.GROQ_API_KEY?.trim() && !useDeterministicFallback) return NextResponse.json({ error: { code: "AI_NOT_CONFIGURED", message: "Smart Query needs GROQ_API_KEY. Set it in the local environment or in Vercel Project Settings → Environment Variables, then restart or redeploy." } }, { status: 503 });
    let result;
    try {
      if (useDeterministicFallback && !process.env.GROQ_API_KEY?.trim()) {
        result = await executeDeterministicQuery(parsed.data.question);
        if (!result) return NextResponse.json({ error: { code: "QUERY_NOT_GENERATED", message: "I could not map that question to the live HR records. Please rephrase it with employee, request, or onboarding details." } }, { status: 422 });
      } else {
        let sql = await planSqlQuery(parsed.data.question);
        if (!sql) return NextResponse.json({ error: { code: "QUERY_NOT_GENERATED", message: "I could not translate that question into a database query. Try rephrasing it with the employee, request, or onboarding details you want." } }, { status: 422 });
        try {
          result = await executeSqlQuery(sql);
        } catch (error) {
          const reason = error instanceof Error ? error.message : "The query failed validation.";
          if (!reason.includes("generated SQL")) throw error;
          sql = await planSqlQuery(parsed.data.question, reason);
          if (!sql) return NextResponse.json({ error: { code: "QUERY_NOT_GENERATED", message: "Groq could not produce a safe query for that question. Please rephrase it with the employee, request, or onboarding details you want." } }, { status: 422 });
          result = await executeSqlQuery(sql);
        }
      }
      let generated;
      try {
        generated = await generateAnswer(parsed.data.question, result);
      } catch (error) {
        console.error("Smart Query answer formatting failed", error instanceof Error ? error.message : "unknown provider error");
        return NextResponse.json({ error: { code: "AI_PROVIDER_UNAVAILABLE", message: "Groq could not generate an answer from the live query results. No offline answer was returned; please retry shortly." } }, { status: 503 });
      }
      return NextResponse.json({ data: { answer: generated.answer, summary: result.summary, results: result.data, sources: [result.provenance], provider: generated.provider, generatedAt: new Date().toISOString() } });
    } catch (error) {
      console.error("Live SQL query failed", error instanceof Error ? error.message : "unknown query error");
      if (error instanceof Error && /Groq/i.test(error.message)) return NextResponse.json({ error: { code: "AI_PROVIDER_UNAVAILABLE", message: "Groq could not plan a live query. No offline answer was returned; please retry shortly." } }, { status: 503 });
      return NextResponse.json({ error: { code: "LIVE_QUERY_FAILED", message: "I could not safely run a live query for that question. Please rephrase it and try again." } }, { status: 422 });
    }
  } catch (error) {
    if (error instanceof Response && error.status === 403) {
      return NextResponse.json({ error: { code: "FORBIDDEN", message: "The AI assistant is available only to HR Admin accounts. Sign in with the HR Admin demo account to continue." } }, { status: 403 });
    }
    return apiError(error);
  }
}

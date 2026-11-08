# Debugging Error Log

## Overview

This log records three corrected defects, their root causes, the applied fixes, and the regression coverage that prevents them from returning.

## Contents

- [Assigned employees could not access service requests](#1-an-assigned-employee-could-not-access-a-service-request)
- [Smart Query ignored an employee name in its fallback query](#2-smart-query-ignored-an-employee-name-in-its-fallback-query)
- [Assessment seed could erase existing data](#3-running-the-assessment-seed-could-erase-existing-data)

These are three corrected defects from development. Each entry records the user-visible symptom, investigation, cause, fix, and prevention. Existing tests are identified where they cover the behavior; prevention work that is not yet covered is described as a follow-up rather than claimed as completed.

## 1. An assigned employee could not access a service request

**Symptom.** A request had the employee's ID in `assigneeId`, but that employee could not find it in the request list or open it to comment or start work.

**Investigation.** The first hypothesis was a failed assignment write. The first check was the saved record; it contained the expected assignee ID, so the write was ruled out. The list query, request detail handler, and comment handler were then checked against their access predicates. They granted requester, team, or HR access but did not consistently include the explicit assignee.

**Root cause.** Read, detail, and comment access were not using one shared rule. An assigned employee was therefore treated as unrelated to the request in some routes.

**Fix.** Centralized the request access decision and applied it to list/detail/comment paths. The rule includes requester, explicit assignee, requester's Manager, and HR Admin.

```ts
return principal.role === "HR_ADMIN" || request.requester.id === principal.id ||
  request.assigneeId === principal.id ||
  (principal.role === "MANAGER" && request.requester.managerId === principal.id);
```

**Prevention.** `src/lib/domains/request-access.test.ts` covers requester, assignee, Manager, HR Admin, and unrelated-user access. Keep the same scope helper on every endpoint that reads or mutates a request.

## 2. Smart Query ignored an employee name in its fallback query

**Symptom.** An HR Admin could ask Smart Query for open requests associated with a named employee, but the deterministic fallback returned the count for the broader request set because it did not apply a person filter.

**Investigation.** The first hypothesis was that query planning recognized the request intent but dropped the person's name. I checked the deterministic fallback's Prisma `where` construction against the supported question: it applied category, priority, status, and country filters, but had no requester or assignee name condition. That isolated the defect to query construction and showed it would persist whenever the fallback ran, regardless of the LLM planner's output.

**Root cause.** The fallback recognized request intent and some structured filters but did not ground a person mentioned in natural language against the shared user directory. Treating a successful database response as a successful answer hid the missing constraint.

**Fix.** Added `findMentionedPerson` to normalize the question, match full or uniquely identifying name tokens against directory records, and include a resolved name in the fixed Prisma filters. The optional LLM can classify a question or phrase the result, but it never constructs or executes SQL.

```ts
const mentionedPerson = await findMentionedPerson(question);
const filters = [
  ...(status ? [{ status }] : []),
  ...(country ? [{ requester: { country } }] : []),
  ...(mentionedPerson ? [{ OR: [
    { requester: { fullName: { contains: normalizeSearchText(mentionedPerson) } } },
    { assignee: { fullName: { contains: normalizeSearchText(mentionedPerson) } } },
  ] }] : []),
];
```

**Prevention.** Add integration coverage for exact names, ambiguous partial names, requester versus assignee matches, and both Groq-enabled and deterministic-fallback paths. Assert the returned records and provenance against known database rows; a fluent model answer alone is not evidence that the query applied every requested filter.

## 3. Running the assessment seed could erase existing data

**Symptom.** Running the seed against a populated database could delete existing users and workflow records before inserting demo data.

**Investigation.** The first hypothesis was that the seed reset data only when creating a fresh assessment database. Inspecting the previous `prisma/seed.ts` ruled that out: it began with a transaction of `deleteMany` calls across comments, requests, onboarding records, templates, sessions, and users, without first checking whether the database was empty.

**Root cause.** The seed assumed it owned the target database and did not distinguish an empty local demo database from existing user data.

**Fix.** Seeding is now decided from table counts. An empty database is seeded; a complete assessment seed is skipped; any other populated database is refused without modifying records.

```ts
if (!populated) return "seed";
if (counts.hasAssessmentAdmin && counts.users >= 109 && counts.requests >= 30 &&
    counts.onboardings >= 5 && counts.templates >= 1) return "skip";
throw new Error("Refusing to seed a populated database...");
```

The guard lives in `src/lib/domains/seed-safety.ts` and is used before record creation in `prisma/seed.ts`.

**Prevention.** `src/lib/domains/seed-safety.test.ts` covers empty, complete, partial, and unrelated populated databases. Keep seed writes additive and fail closed when the target does not match the expected empty or complete-demo state.

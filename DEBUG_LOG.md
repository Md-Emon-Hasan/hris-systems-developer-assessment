# Debugging Error Log

## Overview

This log records three corrected defects, their root causes, the applied fixes, and the regression coverage that prevents them from returning.

## Contents

- [Assigned employees could not access service requests](#1-an-assigned-employee-could-not-access-a-service-request)
- [Managers could update tasks they did not own](#2-a-manager-could-update-an-onboarding-task-they-did-not-own)
- [Assessment seed could erase existing data](#3-running-the-assessment-seed-could-erase-existing-data)

These are three corrected defects from the build. The notes below distinguish observed behavior, the code path checked, the cause, and the regression coverage. The tests listed here are present in the repository; this document does not claim they were run for this review.

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

## 2. A Manager could update an onboarding task they did not own

**Symptom.** A Manager could start or complete a task on a direct report's onboarding even when the task was assigned to a different person.

**Investigation.** The first hypothesis was that the task owner was not being checked. Comparing the status-update guard with the saved `ownerId` confirmed that the previous API rule treated the employee's `managerId` relationship as sufficient task permission. The reporting relationship, rather than task ownership, was the decisive condition.

**Root cause.** Reporting scope is appropriate for monitoring a plan, but it was incorrectly reused as execution permission.

**Fix.** Task status changes now require the task owner. HR Admin may reopen a completed task only with a note; Manager status alone does not grant execution rights.

```ts
if (task.ownerId === actor.id) return true;
return actor.role === "HR_ADMIN" && task.status === "COMPLETED" &&
  nextStatus === "IN_PROGRESS" && Boolean(note?.trim());
```

**Prevention.** `src/lib/domains/request-state.test.ts` covers owner-only task execution and audited HR reopening. Keep monitoring visibility and write permission as separate checks when changing onboarding scope.

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

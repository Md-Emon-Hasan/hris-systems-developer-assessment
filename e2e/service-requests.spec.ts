import { expect, test } from "@playwright/test";

test("employee signs in and submits a service request", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email address").fill("employee010@northstar.example");
  await page.getByLabel("Password").fill("Welcome2026!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: /good morning/i })).toBeVisible();
  await page.getByRole("button", { name: /new request/i }).click();
  await page.getByLabel("Request title").fill("Laptop dock not connecting");
  await page.getByLabel("Details").fill("My laptop dock stopped connecting to the external display today.");
  await page.getByLabel("Request category").selectOption("IT_EQUIPMENT");
  await page.getByLabel("Request priority").selectOption("MEDIUM");
  await page.getByRole("button", { name: "Submit request" }).click();
  await expect(page.getByText("Laptop dock not connecting")).toBeVisible();
});

test("employee session is limited to its authorized records and actions", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email address").fill("employee010@northstar.example");
  await page.getByLabel("Password").fill("Welcome2026!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: /good morning/i })).toBeVisible();
  const people = await page.evaluate(async () => {
    const response = await fetch("/api/users");
    return { status: response.status, body: await response.json() };
  });
  expect(people.status).toBe(200);
  expect(people.body.data).toHaveLength(1);
  const aiResponse = await page.evaluate(async () => {
    const response = await fetch("/api/ai/query", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: "How many unresolved IT requests are there?" }) });
    return response.status;
  });
  expect(aiResponse).toBe(403);
});

test("manager assigns a team request and the employee moves it through resolution", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email address").fill("manager1@northstar.example");
  await page.getByLabel("Password").fill("Welcome2026!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: /good morning/i })).toBeVisible();
  const assignment = await page.evaluate(async () => {
    const [requestResponse, peopleResponse] = await Promise.all([fetch("/api/service-requests"), fetch("/api/users")]);
    const requestRows = (await requestResponse.json()).data;
    const people = (await peopleResponse.json()).data;
    const row = requestRows.find((item: { title: string; status: string }) => item.title === "Laptop dock not connecting" && item.status === "SUBMITTED");
    const employee = people.find((person: { email: string }) => person.email === "employee010@northstar.example");
    if (!row || !employee) return { status: 404 };
    const response = await fetch(`/api/service-requests/${row.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "ASSIGN", assigneeId: employee.id }) });
    return { status: response.status };
  });
  expect(assignment.status).toBe(200);
  await page.evaluate(async () => { await fetch("/api/auth/logout", { method: "POST" }); });
  await page.goto("/login");
  await page.getByLabel("Email address").fill("employee010@northstar.example");
  await page.getByLabel("Password").fill("Welcome2026!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: /good morning/i })).toBeVisible();
  const transitions = await page.evaluate(async () => {
    const response = await fetch("/api/service-requests");
    const rows = (await response.json()).data;
    const row = rows.find((item: { title: string; status: string }) => item.title === "Laptop dock not connecting" && item.status === "ASSIGNED");
    if (!row) return [];
    const results = [];
    for (const action of ["START", "RESOLVE", "CLOSE"]) {
      const result = await fetch(`/api/service-requests/${row.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      results.push(result.status);
    }
    return results;
  });
  expect(transitions).toEqual([200, 200, 200]);
});

test("onboarding tasks stay blocked until their dependency is complete", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email address").fill("hr.admin@northstar.example");
  await page.getByLabel("Password").fill("Welcome2026!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: /good morning/i })).toBeVisible();
  const result = await page.evaluate(async () => {
    const response = await fetch("/api/onboarding");
    const plans = (await response.json()).data;
    const plan = plans.find((item: { tasks: { status: string; dependsOn: { id: string; status: string } | null }[] }) => item.tasks.some((task) => task.status === "BLOCKED" && task.dependsOn && task.dependsOn.status === "IN_PROGRESS"));
    const blocked = plan?.tasks.find((task: { status: string; dependsOn: { id: string; status: string } | null }) => task.status === "BLOCKED" && task.dependsOn?.status === "IN_PROGRESS");
    if (!blocked?.dependsOn) return { ready: false };
    const denied = await fetch(`/api/onboarding/tasks/${blocked.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "IN_PROGRESS" }) });
    const prerequisite = await fetch(`/api/onboarding/tasks/${blocked.dependsOn.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "COMPLETED" }) });
    const started = await fetch(`/api/onboarding/tasks/${blocked.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "IN_PROGRESS" }) });
    return { ready: true, denied: denied.status, prerequisite: prerequisite.status, started: started.status };
  });
  expect(result).toEqual({ ready: true, denied: 409, prerequisite: 200, started: 200 });
});

test("HR Admin AI query reflects a service request created in the same session", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email address").fill("hr.admin@northstar.example");
  await page.getByLabel("Password").fill("Welcome2026!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: /good morning/i })).toBeVisible();
  const ask = async () => page.evaluate(async () => {
    const response = await fetch("/api/ai/query", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: "How many unresolved IT requests are there in Bangladesh?" }) });
    return { status: response.status, body: await response.json() };
  });
  const before = await ask();
  expect(before.status).toBe(200);
  const countBefore = Number(before.body.data.answer.match(/\d+/)?.[0]);
  const created = await page.evaluate(async () => {
    const response = await fetch("/api/service-requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Live AI count verification", description: "Temporary request used to verify current database reads.", category: "IT_EQUIPMENT", priority: "LOW" }) });
    return response.status;
  });
  expect(created).toBe(201);
  const after = await ask();
  expect(after.status).toBe(200);
  console.log(`Smart Query provider used: ${after.body.data.provider}`);
  expect(Number(after.body.data.answer.match(/\d+/)?.[0])).toBe(countBefore + 1);
  expect(after.body.data.sources[0]).toContain("Live ServiceRequest query");
});

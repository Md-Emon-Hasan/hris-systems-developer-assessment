import { expect, test, type Page } from "@playwright/test";

type TestRequest = { id: string; title: string; status: string; category: string; priority: string; requester: { id: string; country: string }; assignee?: { id: string } | null };
type TestPerson = { id: string; email: string; role: string; department: string; employmentStatus: string; managerId: string | null };
type TestTask = { id: string; status: string; dueDate: string; ownerId: string | null; dependsOn: { id: string; status: string } | null };
type TestPlan = { id: string; status: string; startDate: string; employee: { id: string; fullName: string; country: string; managerId?: string | null }; tasks: TestTask[] };
type TestQuery = { status: number; answer: string; summary: string; source: string; count: number; results: unknown[]; expectedHires?: string[] };

async function signIn(page: Page, email: string, ipSuffix: number) {
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `192.0.2.${ipSuffix}` });
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill("Welcome2026!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: /good morning/i })).toBeVisible();
}

test("employee signs in and submits a service request", async ({ page }) => {
  await signIn(page, "nur.aisyah@nextventures.example", 21);
  const title = `Laptop dock not connecting ${Date.now()}`;
  await page.getByRole("button", { name: /new request/i }).click();
  await page.getByLabel("Request title").fill(title);
  await page.getByLabel("Details").fill("My laptop dock stopped connecting to the external display today.");
  await page.getByLabel("Request category").selectOption("IT_EQUIPMENT");
  await page.getByLabel("Request priority").selectOption("MEDIUM");
  await page.getByRole("button", { name: "Submit request" }).click();
  const createdRequest = page.getByRole("row").filter({ hasText: title });
  await expect(createdRequest).toBeVisible();
  await createdRequest.click();
  await page.getByPlaceholder("Add a comment…").fill("I have attached the docking station details.");
  await page.getByRole("button", { name: "Comment" }).click();
  const newComment = page.locator(".modal .hire-row").filter({ hasText: "I have attached the docking station details." });
  await expect(newComment).toBeVisible();
  await expect(newComment.getByText("· Nur Aisyah")).toBeVisible();
  await page.reload();
  await page.getByRole("row").filter({ hasText: title }).click();
  await expect(page.locator(".modal .hire-row").filter({ hasText: "I have attached the docking station details." })).toBeVisible();
});

test("employee session is limited to its authorized records and actions", async ({ page }) => {
  await signIn(page, "nur.aisyah@nextventures.example", 22);
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

test("protected APIs reject unauthenticated reads and writes", async ({ request }) => {
  const dashboard = await request.get("http://127.0.0.1:3001/api/dashboard");
  const requests = await request.get("http://127.0.0.1:3001/api/service-requests");
  const createTemplate = await request.post("http://127.0.0.1:3001/api/onboarding/templates", { data: {} });
  expect([dashboard.status(), requests.status(), createTemplate.status()]).toEqual([401, 401, 401]);
});

test("login rejects invalid input and invalid credentials without account enumeration", async ({ request }) => {
  const cases = [
    [{ email: "", password: "Welcome2026!" }, 400],
    [{ email: "not-an-email", password: "Welcome2026!" }, 400],
    [{ email: "nur.aisyah@nextventures.example", password: "" }, 400],
    [{ email: "nur.aisyah@nextventures.example", password: "incorrect-password" }, 401],
    [{ email: "missing-account@nextventures.example", password: "incorrect-password" }, 401],
  ] as const;
  for (let index = 0; index < cases.length; index++) {
    const response = await request.post("http://127.0.0.1:3001/api/auth/login", { headers: { "x-forwarded-for": `198.51.100.${index + 20}` }, data: cases[index]![0] });
    expect(response.status()).toBe(cases[index]![1]);
    if (response.status() === 401) expect((await response.json()).error.message).toBe("Email or password is incorrect.");
  }
});

test("API rejects invalid requests and duplicate employee identifiers", async ({ page }) => {
  await signIn(page, "nur.aisyah@nextventures.example", 48);
  const requestStatuses = await page.evaluate(async () => {
    const cases = [
      { title: "", description: "A sufficiently long description for this invalid request.", category: "IT_EQUIPMENT", priority: "LOW" },
      { title: "Short", description: "Too short", category: "IT_EQUIPMENT", priority: "LOW" },
      { title: "Valid title", description: "A sufficiently long description for this invalid request.", category: "UNKNOWN", priority: "LOW" },
    ];
    const statuses = [];
    for (const data of cases) statuses.push((await fetch("/api/service-requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })).status);
    return statuses;
  });
  expect(requestStatuses).toEqual([400, 400, 400]);

  await page.evaluate(async () => { await fetch("/api/auth/logout", { method: "POST" }); });
  await signIn(page, "mira.chowdhury@nextventures.example", 49);
  const duplicateStatus = await page.evaluate(async () => {
    const existing = (await (await fetch("/api/users")).json()).data[0] as TestPerson & { employeeNumber: string };
    const response = await fetch("/api/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      fullName: "Duplicate Validation Record", email: existing.email, employeeNumber: "NS-DUPLICATE", country: "Bangladesh", department: "Engineering", role: "EMPLOYEE", employmentStatus: "ACTIVE", joiningDate: "2026-10-01", managerId: null, password: "TemporaryPassword2026!",
    }) });
    return response.status;
  });
  expect(duplicateStatus).toBe(409);
});

test("logout clears the session and protects pages after refresh", async ({ page }) => {
  await signIn(page, "nur.aisyah@nextventures.example", 43);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  expect(await page.evaluate(async () => (await fetch("/api/auth/session")).status)).toBe(401);
});

test("manager cannot read an unrelated employee record", async ({ page }) => {
  await signIn(page, "mira.chowdhury@nextventures.example", 31);
  const unrelatedId = await page.evaluate(async () => {
    const rows = (await (await fetch("/api/users")).json()).data;
    const manager = rows.find((person: { email: string }) => person.email === "aisha.rahman@nextventures.example");
    return rows.find((person: { role: string; managerId: string | null }) => person.role === "EMPLOYEE" && person.managerId !== manager.id).id as string;
  });
  await page.evaluate(async () => { await fetch("/api/auth/logout", { method: "POST" }); });
  await signIn(page, "aisha.rahman@nextventures.example", 32);
  const status = await page.evaluate(async (id) => (await fetch(`/api/users/${id}`)).status, unrelatedId);
  expect(status).toBe(404);
});

test("manager can monitor direct-report onboarding but only the task owner can execute it", async ({ page }) => {
  await signIn(page, "mira.chowdhury@nextventures.example", 46);
  const setup = await page.evaluate(async () => {
    const users = (await (await fetch("/api/users")).json()).data as TestPerson[];
    const hire = users.find((person) => person.email === "nur.aisyah@nextventures.example");
    const manager = users.find((person) => person.email === "aisha.rahman@nextventures.example");
    if (!hire || !manager) return null;
    const tasks = Array.from({ length: 8 }, (_, index) => ({ title: `Owner scope task ${index + 1}`, description: `Verify onboarding task owner permissions for task ${index + 1}.`, department: "Engineering", ownerRole: index === 2 ? "EMPLOYEE" : "MANAGER", dueOffsetDays: index, dependsOnIndex: index === 1 ? 0 : null }));
    const templateResponse = await fetch("/api/onboarding/templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: `Owner scope ${Date.now()}`, description: "Task owner and manager scope regression.", tasks }) });
    const template = (await templateResponse.json()).data;
    const assignedResponse = await fetch("/api/onboarding", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ employeeId: hire.id, templateId: template.id, startDate: new Date().toISOString().slice(0, 10) }) });
    const assigned = (await assignedResponse.json()).data;
    const employeeTask = assigned.tasks[2];
    const ownerResponse = await fetch(`/api/onboarding/tasks/${employeeTask.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ownerId: hire.id }) });
    return { hireId: hire.id, managerEmail: manager.email, planId: assigned.id, employeeTaskId: employeeTask.id, statuses: [templateResponse.status, assignedResponse.status, ownerResponse.status] };
  });
  expect(setup?.statuses).toEqual([201, 201, 200]);
  await page.evaluate(async () => { await fetch("/api/auth/logout", { method: "POST" }); });
  await signIn(page, setup!.managerEmail, 50);
  const result = await page.evaluate(async ({ employeeTaskId, hireId, planId }) => {
    const plans = (await (await fetch("/api/onboarding")).json()).data as TestPlan[];
    const plan = plans.find((item) => item.id === planId);
    const response = await fetch(`/api/onboarding/tasks/${employeeTaskId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "IN_PROGRESS" }) });
    return { status: response.status, canMonitorHire: plan?.employee.id === hireId, taskCount: plan?.tasks.length };
  }, setup!);
  expect(result).toMatchObject({ status: 403, canMonitorHire: true, taskCount: 8 });
});

test("employee can view every task in their own onboarding checklist", async ({ page }) => {
  await signIn(page, "employee030@nextventures.example", 23);
  const result = await page.evaluate(async () => {
    const [response, sessionResponse] = await Promise.all([fetch("/api/onboarding"), fetch("/api/auth/session")]);
    const body = await response.json();
    const session = await sessionResponse.json();
    return { status: response.status, own: body.data.find((row: { employee: { id: string }; tasks: unknown[] }) => row.employee.id === session.data.user.id) };
  });
  expect(result.status).toBe(200);
  expect(result.own?.tasks).toHaveLength(10);
});

test("task owners can see their owned tasks across onboarding plans", async ({ page }) => {
  await signIn(page, "aisha.rahman@nextventures.example", 42);
  const result = await page.evaluate(async () => {
    const [plansResponse, sessionResponse] = await Promise.all([fetch("/api/onboarding?myTasks=true"), fetch("/api/auth/session")]);
    const plans = (await plansResponse.json()).data as TestPlan[];
    const session = (await sessionResponse.json()).data.user as { id: string };
    const task = plans.flatMap((plan: TestPlan) => plan.tasks).find((item) => item.status === "NOT_STARTED" && !item.dependsOn);
    if (!task) return { status: plansResponse.status, hireCount: 0, tasksAreOwned: false, transitions: [] };
    const started = await fetch(`/api/onboarding/tasks/${task.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "IN_PROGRESS" }) });
    const completed = await fetch(`/api/onboarding/tasks/${task.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "COMPLETED" }) });
    return { status: plansResponse.status, hireCount: new Set(plans.map((plan: { employee: { id: string } }) => plan.employee.id)).size, tasksAreOwned: plans.every((plan: { tasks: { ownerId: string | null }[] }) => plan.tasks.every((item) => item.ownerId === session.id)), transitions: [started.status, completed.status] };
  });
  expect(result.status).toBe(200);
  expect(result.hireCount).toBeGreaterThan(1);
  expect(result.tasksAreOwned).toBe(true);
  expect(result.transitions).toEqual([200, 200]);
});

test("manager assigns a team request and the employee moves it through resolution", async ({ page }) => {
  const requestTitle = `Assigned workflow request ${Date.now()}`;
  await signIn(page, "nur.aisyah@nextventures.example", 54);
  await page.getByRole("button", { name: /new request/i }).click();
  await page.getByLabel("Request title").fill(requestTitle);
  await page.getByLabel("Details").fill("Please route this access request to a teammate and record the resolution in the service desk.");
  await page.getByLabel("Request category").selectOption("SOFTWARE_ACCESS");
  await page.getByLabel("Request priority").selectOption("MEDIUM");
  await page.getByRole("button", { name: "Submit request" }).click();
  await expect(page.getByRole("row").filter({ hasText: requestTitle })).toBeVisible();
  await page.evaluate(async () => { await fetch("/api/auth/logout", { method: "POST" }); });
  await signIn(page, "aisha.rahman@nextventures.example", 24);
  const assignment = await page.evaluate(async (requestTitle) => {
    const [requestResponse, peopleResponse] = await Promise.all([fetch("/api/service-requests"), fetch("/api/users")]);
    const requests = (await requestResponse.json()).data as TestRequest[];
    const people = (await peopleResponse.json()).data as TestPerson[];
    const row = requests.find((item) => item.title === requestTitle && item.status === "SUBMITTED");
    const employee = people.find((person) => person.role === "EMPLOYEE" && person.id !== row?.requester.id);
    return row && employee ? { requestId: row.id, title: row.title, requesterId: row.requester.id, assigneeId: employee.id, assigneeEmail: employee.email } : null;
  }, requestTitle);
  expect(assignment).not.toBeNull();
  await page.getByRole("button", { name: "Service requests", exact: true }).click();
  await page.getByRole("row").filter({ hasText: assignment!.title }).click();
  await page.getByLabel("Assignee").selectOption(assignment!.assigneeId);
  await page.getByRole("button", { name: "Assign request" }).click();
  await expect(page.locator(".modal .status-pill")).toContainText("Assigned");
  await page.evaluate(async () => { await fetch("/api/auth/logout", { method: "POST" }); });
  await signIn(page, "nur.aisyah@nextventures.example", 41);
  const requesterStart = await page.evaluate(async (id) => (await fetch(`/api/service-requests/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "START" }) })).status, assignment!.requestId);
  expect(requesterStart).toBe(409);
  await page.evaluate(async () => { await fetch("/api/auth/logout", { method: "POST" }); });
  await signIn(page, assignment!.assigneeEmail, 25);
  await page.getByRole("button", { name: "Service requests", exact: true }).click();
  await page.getByRole("row").filter({ hasText: assignment!.title }).click();
  await page.getByPlaceholder(/Add a comment/).fill("I have started the assigned work.");
  await page.getByRole("button", { name: "Comment" }).click();
  await expect(page.locator(".modal .hire-row").filter({ hasText: "I have started the assigned work." })).toBeVisible();
  await page.getByRole("button", { name: "Start work" }).click();
  await expect(page.locator(".modal .status-pill")).toContainText("In Progress");
  await page.getByRole("button", { name: "Mark resolved" }).click();
  await expect(page.locator(".modal .status-pill")).toContainText("Resolved");
  await page.evaluate(async () => { await fetch("/api/auth/logout", { method: "POST" }); });
  await signIn(page, "nur.aisyah@nextventures.example", 33);
  await page.getByRole("button", { name: "Service requests", exact: true }).click();
  await page.getByRole("row").filter({ hasText: assignment!.title }).click();
  await expect(page.locator(".modal .status-pill")).toContainText("Resolved");
  await page.getByRole("button", { name: "Close request" }).click();
  await expect(page.locator(".modal .status-pill")).toContainText("Closed");
  await page.reload();
  await page.getByRole("button", { name: "Service requests", exact: true }).click();
  await page.getByRole("row").filter({ hasText: assignment!.title }).click();
  await expect(page.locator(".modal .status-pill")).toContainText("Closed");
  expect(await page.evaluate(async (id) => (await fetch(`/api/service-requests/${id}`)).status, assignment!.requestId)).toBe(200);
  await page.evaluate(async () => { await fetch("/api/auth/logout", { method: "POST" }); });
  await signIn(page, "employee011@nextventures.example", 38);
  expect(await page.evaluate(async (id) => (await fetch(`/api/service-requests/${id}`)).status, assignment!.requestId)).toBe(404);
});

test("unrelated employee cannot read an assigned request and request filters intersect", async ({ page }) => {
  await signIn(page, "mira.chowdhury@nextventures.example", 34);
  const result = await page.evaluate(async () => {
    const all = (await (await fetch("/api/service-requests")).json()).data as TestRequest[];
    const combinations = [
      ["country"], ["status"], ["category"], ["priority"],
      ["country", "status"], ["country", "category"], ["country", "priority"], ["status", "category"], ["status", "priority"], ["category", "priority"],
      ["country", "status", "category"], ["country", "category", "priority"], ["country", "status", "priority"], ["country", "status", "category", "priority"],
    ];
    const read = (row: TestRequest, field: string): string => field === "country" ? row.requester.country : field === "status" ? row.status : field === "category" ? row.category : row.priority;
    const outcomes = [];
    for (const fieldsToUse of combinations) {
      const params = new URLSearchParams();
      for (const field of fieldsToUse) params.set(field, read(all[0], field));
      const response = await fetch(`/api/service-requests?${params}`);
      const rows = (await response.json()).data;
      outcomes.push({ ok: response.ok && (rows as TestRequest[]).every((row) => fieldsToUse.every((field) => read(row, field) === params.get(field))) });
    }
    const invalid = await fetch("/api/service-requests?priority=SUPER_HIGH");
    const countries = ["Bangladesh", "Malaysia", "Sri Lanka", "Cyprus"];
    const statuses = ["SUBMITTED", "ASSIGNED", "IN_PROGRESS", "RESOLVED", "CLOSED"];
    const categories = ["IT_EQUIPMENT", "SOFTWARE_ACCESS", "HR_QUERY", "FACILITIES", "OTHER"];
    const priorities = ["LOW", "MEDIUM", "HIGH", "URGENT"];
    let emptyParams: URLSearchParams | null = null;
    for (const c of countries) for (const s of statuses) for (const cat of categories) for (const p of priorities) {
      if (!all.some((row) => row.requester.country === c && row.status === s && row.category === cat && row.priority === p)) {
        emptyParams = new URLSearchParams({ country: c, status: s, category: cat, priority: p }); break;
      }
    }
    const empty = emptyParams ? await fetch(`/api/service-requests?${emptyParams}`) : null;
    return { outcomes, invalid: invalid.status, emptyCount: empty ? ((await empty.json()).data as TestRequest[]).length : -1 };
  });
  expect(result.outcomes.every((item: { ok: boolean }) => item.ok)).toBe(true);
  expect(result.invalid).toBe(400);
  expect(result.emptyCount).toBe(0);
});

test("manager cannot assign a request to an employee outside the manager's team", async ({ page }) => {
  await signIn(page, "mira.chowdhury@nextventures.example", 39);
  const outsiderId = await page.evaluate(async () => {
    const users = (await (await fetch("/api/users")).json()).data;
    const manager = users.find((person: { email: string }) => person.email === "aisha.rahman@nextventures.example");
    return users.find((person: { role: string; managerId: string | null }) => person.role === "EMPLOYEE" && person.managerId !== manager.id).id;
  });
  await page.evaluate(async () => { await fetch("/api/auth/logout", { method: "POST" }); });
  await signIn(page, "aisha.rahman@nextventures.example", 40);
  const result = await page.evaluate(async (assigneeId) => {
    const request = await fetch("/api/service-requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Out of team assignment test", description: "This request verifies manager assignee scope enforcement.", category: "OTHER", priority: "LOW" }) });
    const created = (await request.json()).data;
    const response = await fetch(`/api/service-requests/${created.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "ASSIGN", assigneeId }) });
    return { created: request.status, assignment: response.status };
  }, outsiderId);
  expect(result).toEqual({ created: 201, assignment: 403 });
});

test("onboarding tasks stay blocked until their dependency is complete", async ({ page }) => {
  await signIn(page, "mira.chowdhury@nextventures.example", 26);
  const setup = await page.evaluate(async () => {
    const users = (await (await fetch("/api/users")).json()).data as TestPerson[];
    const hire = users.find((person) => person.email === "employee011@nextventures.example");
    if (!hire) return null;
    const tasks = Array.from({ length: 8 }, (_, index) => ({ title: `Dependency workflow ${index + 1}`, description: `Verify dependency workflow task ${index + 1} follows the prerequisite.`, department: hire.department, ownerRole: "MANAGER", dueOffsetDays: index, dependsOnIndex: index === 1 ? 0 : null }));
    const templateResponse = await fetch("/api/onboarding/templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: `Dependency workflow ${Date.now()}`, description: "Owner-driven dependency regression.", tasks }) });
    const template = (await templateResponse.json()).data;
    const assignedResponse = await fetch("/api/onboarding", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ employeeId: hire.id, templateId: template.id, startDate: new Date().toISOString().slice(0, 10) }) });
    const plan = (await assignedResponse.json()).data;
    return { managerEmail: users.find((person) => person.id === hire.managerId)?.email, planId: plan.id, prerequisiteId: plan.tasks[0].id, dependentId: plan.tasks[1].id, statuses: [templateResponse.status, assignedResponse.status] };
  });
  expect(setup).not.toBeNull();
  await page.evaluate(async () => { await fetch("/api/auth/logout", { method: "POST" }); });
  await signIn(page, setup!.managerEmail!, 47);
  const blockedInitially = await page.evaluate(async (blockedId) => (await fetch(`/api/onboarding/tasks/${blockedId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "IN_PROGRESS" }) })).status, setup!.dependentId);
  const prerequisiteStarted = await page.evaluate(async (id) => (await fetch(`/api/onboarding/tasks/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "IN_PROGRESS" }) })).status, setup!.prerequisiteId);
  const prerequisiteCompleted = await page.evaluate(async (id) => (await fetch(`/api/onboarding/tasks/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "COMPLETED" }) })).status, setup!.prerequisiteId);
  const dependentStarted = await page.evaluate(async (id) => (await fetch(`/api/onboarding/tasks/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "IN_PROGRESS" }) })).status, setup!.dependentId);
  const completion = await page.evaluate(async ({ planId, dependentId }) => {
    const plans = (await (await fetch("/api/onboarding")).json()).data as TestPlan[];
    const plan = plans.find((item) => item.id === planId);
    if (!plan) return { taskStatuses: [], planStatus: null };
    const statuses = [await (await fetch(`/api/onboarding/tasks/${dependentId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "COMPLETED" }) })).status];
    for (const task of plan.tasks.filter((item) => item.id !== dependentId && item.status !== "COMPLETED")) {
      if (task.status === "NOT_STARTED") statuses.push((await fetch(`/api/onboarding/tasks/${task.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "IN_PROGRESS" }) })).status);
      statuses.push((await fetch(`/api/onboarding/tasks/${task.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "COMPLETED" }) })).status);
    }
    const after = await (await fetch("/api/onboarding")).json();
    const visible = (after.data as TestPlan[]).find((item) => item.id === planId);
    return { taskStatuses: statuses, planStatus: visible?.status, count: visible?.tasks.length };
  }, { planId: setup!.planId, dependentId: setup!.dependentId });
  expect([blockedInitially, prerequisiteStarted, prerequisiteCompleted, dependentStarted]).toEqual([409, 200, 200, 200]);
  expect(completion).toMatchObject({ planStatus: "COMPLETED", count: 8 });
  await page.evaluate(async () => { await fetch("/api/auth/logout", { method: "POST" }); });
  await signIn(page, "employee011@nextventures.example", 53);
  const completedChecklist = await page.evaluate(async (planId) => {
    const rows = (await (await fetch("/api/onboarding")).json()).data as TestPlan[];
    const plan = rows.find((item) => item.id === planId);
    return { status: plan?.status, taskCount: plan?.tasks.length, completedTasks: plan?.tasks.filter((task) => task.status === "COMPLETED").length };
  }, setup!.planId);
  expect(completedChecklist).toEqual({ status: "COMPLETED", taskCount: 8, completedTasks: 8 });
});

test("template API rejects self and forward dependency indexes without creating a template", async ({ page }) => {
  await signIn(page, "mira.chowdhury@nextventures.example", 35);
  const result = await page.evaluate(async () => {
    const makeTasks = (dependency: number) => Array.from({ length: 8 }, (_, index) => ({ title: `Cycle validation task ${index + 1}`, description: "Validate dependency indexes at the server boundary.", department: "Engineering", ownerRole: "MANAGER", dueOffsetDays: 1, dependsOnIndex: index === 1 ? dependency : null }));
    const before = (await (await fetch("/api/onboarding/templates")).json()).data.length;
    const responses = [];
    for (const dependency of [1, 7]) {
      const response = await fetch("/api/onboarding/templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: `Invalid dependency ${Date.now()} ${dependency}`, description: "Must be rejected by API validation.", tasks: makeTasks(dependency) }) });
      responses.push(response.status);
    }
    const after = (await (await fetch("/api/onboarding/templates")).json()).data.length;
    return { responses, before, after };
  });
  expect(result.responses).toEqual([400, 400]);
  expect(result.after).toBe(result.before);
});

test("Smart Query returns deterministic totals and rates from live records", async ({ page }) => {
  await signIn(page, "mira.chowdhury@nextventures.example", 36);
  const report = await page.evaluate(async () => {
    const [requestResponse, planResponse] = await Promise.all([fetch("/api/service-requests"), fetch("/api/onboarding")]);
    const requests = (await requestResponse.json()).data as TestRequest[];
    const plans = ((await planResponse.json()).data as TestPlan[]).filter((plan) => plan.status === "IN_PROGRESS");
    const today = new Date(); today.setUTCHours(0, 0, 0, 0);
    const open = ["SUBMITTED", "ASSIGNED", "IN_PROGRESS"];
    const overdueHires = plans.filter((plan) => plan.tasks.some((task) => task.status !== "COMPLETED" && new Date(task.dueDate) < today)).map((plan) => plan.employee.fullName);
    const targets = [
      { question: "How many IT requests are unresolved in Cyprus?", count: requests.filter((r) => r.category === "IT_EQUIPMENT" && open.includes(r.status) && r.requester.country === "Cyprus").length },
      { question: "Which new hires have overdue onboarding tasks?", count: plans.reduce((sum, p) => sum + p.tasks.filter((t) => t.status !== "COMPLETED" && new Date(t.dueDate) < today).length, 0), expectedHires: overdueHires },
      { question: "How many requests are currently assigned?", count: requests.filter((r) => r.status === "ASSIGNED").length },
      { question: "Which country has the highest onboarding completion rate?", count: 0 },
      { question: "How many urgent requests are still open?", count: requests.filter((r) => r.priority === "URGENT" && open.includes(r.status)).length },
    ];
    const result: TestQuery[] = [];
    for (const target of targets) {
      const response = await fetch("/api/ai/query", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: target.question }) });
      const body = await response.json(); result.push({ status: response.status, answer: body.data?.answer, summary: body.data?.summary, results: body.data?.results ?? [], source: body.data?.sources?.[0], count: target.count, ...( "expectedHires" in target ? { expectedHires: target.expectedHires } : {}) });
    }
    const countries = ["Bangladesh", "Malaysia", "Sri Lanka", "Cyprus"];
    const rates = countries.map((country) => {
      const tasks = plans.filter((p) => p.employee.country === country).flatMap((p) => p.tasks);
      return { country, rate: tasks.length ? tasks.filter((t) => t.status === "COMPLETED").length / tasks.length : -1 };
    }).filter((r) => r.rate >= 0);
    const topRate = Math.max(...rates.map((r) => r.rate));
    const leaders = rates.filter((r) => r.rate === topRate).map((r) => r.country);
    return { result, leaders, plans, requests };
  });
  expect(report.result.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
  expect(report.result[0].answer).toContain(String(report.result[0].count));
  expect(report.result[1].answer).toContain(String(report.result[1].count));
  expect(report.result[1].source).toContain("grouped by onboarding");
  expect(report.result[1].results).toHaveLength(report.result[1].expectedHires?.length ?? -1);
  for (const hire of report.result[1].expectedHires ?? []) expect(report.result[1].answer).toContain(hire);
  expect(report.result[2].answer).toContain(String(report.result[2].count));
  for (const country of report.leaders) expect(report.result[3].answer).toContain(country);
  for (const country of ["Bangladesh", "Malaysia", "Sri Lanka", "Cyprus"]) if (report.result[3].results.some((row) => JSON.stringify(row).includes(country))) expect(report.result[3].summary).toContain(country);
  expect(report.result[4].answer).toContain(String(report.result[4].count));
  expect(report.result.every((r) => r.source)).toBe(true);
});

test("Smart Query returns zero honestly and urgent counts follow live request mutations", async ({ page }) => {
  await signIn(page, "mira.chowdhury@nextventures.example", 37);
  const result = await page.evaluate(async () => {
    const ask = async (question: string) => {
      const response = await fetch("/api/ai/query", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question }) });
      return { status: response.status, ...(await response.json()) };
    };
    const [requestBody, peopleBody] = await Promise.all([(await fetch("/api/service-requests")).json(), (await fetch("/api/users")).json()]);
    const requestRows = requestBody.data as TestRequest[];
    const people = peopleBody.data as TestPerson[];
    const open = ["SUBMITTED", "ASSIGNED", "IN_PROGRESS"];
    const choices = [
      ["IT Equipment", "IT_EQUIPMENT"], ["Software Access", "SOFTWARE_ACCESS"], ["HR Query", "HR_QUERY"], ["Facilities", "FACILITIES"],
    ];
    let zeroQuestion = "";
    for (const country of ["Bangladesh", "Malaysia", "Sri Lanka", "Cyprus"]) for (const [label, category] of choices) {
      if (!requestRows.some((r) => r.requester.country === country && r.category === category && r.priority === "URGENT" && open.includes(r.status))) {
        zeroQuestion = `How many urgent ${label} requests are still open in ${country}?`; break;
      }
    }
    const zero = await ask(zeroQuestion);
    const before = await ask("How many urgent requests are still open?");
    const previousCount = Number(before.data.answer.match(/\d+/)?.[0]);
    const created = await fetch("/api/service-requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: `AI live urgent count ${Date.now()}`, description: "Temporary urgent request for live query mutation verification.", category: "IT_EQUIPMENT", priority: "URGENT" }) });
    const request = (await created.json()).data;
    const after = await ask("How many urgent requests are still open?");
    const assignee = people.find((person) => person.role === "EMPLOYEE" && person.employmentStatus === "ACTIVE");
    if (!assignee) throw new Error("Seeded data has no active employee assignee.");
    const transitionStatuses = [];
    for (const body of [{ action: "ASSIGN", assigneeId: assignee.id }, { action: "START" }, { action: "RESOLVE" }, { action: "CLOSE" }]) {
      transitionStatuses.push((await fetch(`/api/service-requests/${request.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })).status);
    }
    const closed = await ask("How many urgent requests are still open?");
    const edges = await Promise.all([
      ask(""), ask("     "), ask("What will the weather be tomorrow?"), ask("gibberish abc xyz"),
    ]);
    return { zeroQuestion, zero, before: before.data.answer, after: after.data.answer, closed: closed.data.answer, previousCount, createdStatus: created.status, transitionStatuses, edgeStatuses: edges.map((edge) => edge.status), provider: before.data.provider };
  });
  expect(result.zeroQuestion).toBeTruthy();
  expect(result.zero.status).toBe(200);
  expect(result.zero.data.answer).toContain("0");
  expect(result.createdStatus).toBe(201);
  expect(result.after).toContain(String(result.previousCount + 1));
  expect(result.transitionStatuses).toEqual([200, 200, 200, 200]);
  expect(result.closed).toContain(String(result.previousCount));
  expect(result.edgeStatuses).toEqual([400, 400, 422, 422]);
  expect(result.provider).toBe("database-summary");
});

test("HR Admin dashboard reports open requests and can assign a dependency-aware checklist", async ({ page }) => {
  await signIn(page, "mira.chowdhury@nextventures.example", 27);

  const dashboard = await page.evaluate(async () => {
    const response = await fetch("/api/dashboard");
    return (await response.json()).data;
  });
  expect(dashboard.headcountByCountry.map((row: { country: string }) => row.country).sort()).toEqual(["Bangladesh", "Cyprus", "Malaysia", "Sri Lanka"]);
  expect(dashboard.requests.byStatus.every((row: { status: string }) => ["SUBMITTED", "ASSIGNED", "IN_PROGRESS"].includes(row.status))).toBe(true);
  expect(dashboard.requests.byCategory.reduce((sum: number, row: { count: number }) => sum + row.count, 0)).toBe(dashboard.requests.byStatus.reduce((sum: number, row: { count: number }) => sum + row.count, 0));
  expect(dashboard.onboarding.hires.every((hire: { total: number; completed: number; pending: number; overdue: number; blocked: number }) => hire.completed + hire.pending + hire.blocked === hire.total && hire.overdue >= 0)).toBe(true);

  const result = await page.evaluate(async () => {
    const [peopleResponse, plansResponse] = await Promise.all([fetch("/api/users"), fetch("/api/onboarding")]);
    const people = (await peopleResponse.json()).data;
    const plans = (await plansResponse.json()).data;
    const employee = people.find((person: { role: string; employmentStatus: string; id: string }) => person.role === "EMPLOYEE" && person.employmentStatus === "ACTIVE" && !plans.some((plan: { employee: { id: string } }) => plan.employee.id === person.id));
    if (!employee) return { error: "No unassigned active employee" };
    const tasks = Array.from({ length: 8 }, (_, index) => ({ title: `Assessment onboarding task ${index + 1}`, description: `Complete assessment onboarding task ${index + 1} with the assigned team.`, department: index === 0 ? "People & Culture" : index === 1 ? "Engineering" : ["Finance", "Marketing"][index % 2]!, ownerRole: index === 0 ? "HR_ADMIN" : index === 1 ? "MANAGER" : "EMPLOYEE", dueOffsetDays: index === 0 ? 0 : index === 1 ? 7 : 30, dependsOnIndex: index === 1 ? 0 : null }));
    const templateResponse = await fetch("/api/onboarding/templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: `Assessment checklist ${Date.now()}`, description: "Browser verification of onboarding assignment and dependencies.", tasks }) });
    const templateBody = await templateResponse.json();
    if (!templateResponse.ok) return { templateStatus: templateResponse.status };
    const startDate = "2026-10-01";
    const assignedResponse = await fetch("/api/onboarding", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ employeeId: employee.id, templateId: templateBody.data.id, startDate }) });
    const assignedBody = await assignedResponse.json();
    if (!assignedResponse.ok) return { assignStatus: assignedResponse.status };
    const startTask = assignedBody.data.tasks.find((task: { title: string }) => task.title === "Assessment onboarding task 1");
    const dependentTask = assignedBody.data.tasks.find((task: { title: string }) => task.title === "Assessment onboarding task 2");
    const manager = people.find((person: { role: string; department: string; employmentStatus: string }) => person.role === "MANAGER" && person.department === "Engineering" && person.employmentStatus === "ACTIVE");
    const admin = people.find((person: { role: string }) => person.role === "HR_ADMIN");
    const ownerResponse = await fetch(`/api/onboarding/tasks/${dependentTask.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ownerId: manager.id }) });
    const denied = await fetch(`/api/onboarding/tasks/${dependentTask.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "IN_PROGRESS" }) });
    const started = await fetch(`/api/onboarding/tasks/${startTask.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "IN_PROGRESS" }) });
    const completed = await fetch(`/api/onboarding/tasks/${startTask.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "COMPLETED" }) });
    const plansAfter = (await (await fetch("/api/onboarding")).json()).data;
    const createdPlan = plansAfter.find((plan: { id: string }) => plan.id === assignedBody.data.id);
    return { taskStatuses: createdPlan.tasks.slice(0, 2).map((task: { status: string }) => task.status), taskOwner: createdPlan.tasks.find((task: { id: string }) => task.id === dependentTask.id).ownerId, expectedOwner: manager.id, initialOwner: startTask.ownerId, expectedInitialOwner: admin.id, unassignedCount: assignedBody.meta.unassignedTasks, dueDates: assignedBody.data.tasks.map((task: { dueDate: string }) => task.dueDate.slice(0, 10)), ownerStatus: ownerResponse.status, denied: denied.status, started: started.status, completed: completed.status };
  });
  expect(result).not.toHaveProperty("error");
  expect(result).not.toHaveProperty("templateStatus");
  expect(result).not.toHaveProperty("assignStatus");
  expect(result).toMatchObject({ taskStatuses: ["COMPLETED", "NOT_STARTED"], ownerStatus: 200, denied: 403, started: 200, completed: 200 });
  expect(result.initialOwner).toBe(result.expectedInitialOwner);
  expect(result.unassignedCount).toBeGreaterThan(0);
  expect(result.taskOwner).toBe(result.expectedOwner);
  expect(result.dueDates.slice(0, 3)).toEqual(["2026-10-01", "2026-10-08", "2026-10-31"]);
});

test("HR Admin can create and edit reusable checklist task definitions", async ({ page }) => {
  await signIn(page, "mira.chowdhury@nextventures.example", 30);
  await page.getByRole("button", { name: "Onboarding", exact: true }).click();
  await page.getByRole("button", { name: "New template" }).click();
  const templateName = `UI assessment checklist ${Date.now()}`;
  await page.getByLabel("Template name").fill(templateName);
  await page.getByLabel("Template description").fill("Reusable checklist created through the HR workflow.");
  await page.getByLabel("Task 1 title").fill("Prepare employee welcome session");
  await page.getByLabel("Task 1 description").fill("Schedule a welcome session with the employee and their direct team.");
  await page.getByLabel("Task 1 department").fill("People & Culture");
  await page.getByLabel("Task 1 owner role").selectOption("MANAGER");
  await page.getByLabel("Task 1 deadline offset").fill("2");
  await page.getByLabel("Task 2 dependency").selectOption("0");
  await page.getByRole("button", { name: "Create template" }).click();
  await expect(page.getByText(templateName, { exact: true })).toBeVisible();

  await page.getByRole("button", { name: `Edit template ${templateName}` }).click();
  await expect(page.getByRole("heading", { name: "Edit template" })).toBeVisible();
  await page.getByLabel("Template name").fill(`${templateName} revised`);
  await page.getByLabel("Task 1 title").fill("Prepare the revised welcome session");
  await page.getByLabel("Task 1 deadline offset").fill("3");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText(`${templateName} revised`, { exact: true })).toBeVisible();

  const saved = await page.evaluate(async (name) => {
    const response = await fetch("/api/onboarding/templates");
    const rows = (await response.json()).data;
    const template = rows.find((row: { name: string }) => row.name === name);
    return { taskCount: template?.tasks.length, firstTitle: template?.tasks[0]?.title, firstOffset: template?.tasks[0]?.dueOffsetDays, dependency: template?.tasks[1]?.dependsOnId, firstId: template?.tasks[0]?.id };
  }, `${templateName} revised`);
  expect(saved).toEqual({ taskCount: 10, firstTitle: "Prepare the revised welcome session", firstOffset: 3, dependency: saved.firstId, firstId: saved.firstId });
});

test("HR Admin adds a new employee and assigns an onboarding checklist through the UI", async ({ page }) => {
  await signIn(page, "mira.chowdhury@nextventures.example", 55);
  const fullName = `Assessment New Hire ${Date.now()}`;
  const email = `assessment-newhire-${Date.now()}@nextventures.example`;
  const employeeNumber = `NS-${Date.now()}`;
  await page.getByRole("button", { name: "People", exact: true }).click();
  await page.getByRole("button", { name: "Add employee", exact: true }).click();
  const dialog = page.locator(".modal");
  await dialog.getByLabel("Full name").fill(fullName);
  await dialog.getByLabel("Work email").fill(email);
  await dialog.getByLabel("Employee ID").fill(employeeNumber);
  await dialog.getByLabel("Country").selectOption("Bangladesh");
  await dialog.getByLabel("Department").selectOption("Engineering");
  await dialog.getByLabel("Role").selectOption("EMPLOYEE");
  const manager = await page.evaluate(async () => (await (await fetch("/api/users")).json()).data.find((person: { email: string }) => person.email === "aisha.rahman@nextventures.example"));
  await dialog.locator('select[name="managerId"]').selectOption({ label: manager.fullName });
  await dialog.getByLabel("Joining date").fill(new Date().toISOString().slice(0, 10));
  await dialog.getByLabel("Temporary password").fill("TemporaryAssessment2026!");
  await dialog.getByRole("button", { name: "Add employee", exact: true }).click();
  await expect(page.getByText(email)).toBeVisible();
  const employeeId = await page.evaluate(async (email) => (await (await fetch("/api/users")).json()).data.find((person: { email: string; id: string }) => person.email === email)?.id, email);
  expect(employeeId).toBeTruthy();

  await page.getByRole("button", { name: "Onboarding", exact: true }).click();
  await page.getByRole("button", { name: "Assign onboarding", exact: true }).click();
  const assignmentDialog = page.locator(".modal");
  await assignmentDialog.getByLabel("Employee").selectOption(employeeId!);
  const standardTemplate = await page.evaluate(async () => {
    const templates = (await (await fetch("/api/onboarding/templates")).json()).data as { name: string; tasks: { id: string }[] }[];
    const template = templates.find((item) => item.name.startsWith("International New Hire"));
    return template ? `${template.name} (${template.tasks.length} tasks)` : null;
  });
  expect(standardTemplate).toBeTruthy();
  await assignmentDialog.getByLabel("Checklist template").selectOption({ label: standardTemplate! });
  await assignmentDialog.getByLabel("Start date").fill(new Date().toISOString().slice(0, 10));
  await assignmentDialog.getByRole("button", { name: "Create plan", exact: true }).click();
  await expect(page.getByRole("button").filter({ hasText: fullName })).toBeVisible();
  await page.getByRole("button").filter({ hasText: fullName }).click();
  await expect(page.getByText("Welcome and team introduction", { exact: true })).toBeVisible();
  const persisted = await page.evaluate(async (employeeId) => {
    const plans = (await (await fetch("/api/onboarding")).json()).data as TestPlan[];
    const plan = plans.find((item) => item.employee.id === employeeId);
    return { planId: plan?.id, taskCount: plan?.tasks.length, startDate: plan?.startDate.slice(0, 10) };
  }, employeeId);
  expect(persisted.taskCount).toBeGreaterThanOrEqual(8);
  await page.reload();
  await page.getByRole("button", { name: "Onboarding", exact: true }).click();
  await expect(page.getByRole("button").filter({ hasText: fullName })).toBeVisible();
});

test("workspace has no page-level horizontal overflow at assessment viewport widths", async ({ page }) => {
  await signIn(page, "mira.chowdhury@nextventures.example", 28);
  for (const width of [375, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.screenshot({ path: `test-results/workspace-${width}.png`, fullPage: true });
    const metrics = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth, overflow: Array.from(document.querySelectorAll("body *")).map((element) => ({ tag: element.tagName, className: typeof element.className === "string" ? element.className : "", text: element.textContent?.slice(0, 40), right: Math.round(element.getBoundingClientRect().right), width: Math.round(element.getBoundingClientRect().width) })).filter((element) => element.right > document.documentElement.clientWidth + 1).slice(0, 12) }));
    expect(metrics.scroll, `viewport ${width}px, overflow: ${JSON.stringify(metrics.overflow)}`).toBeLessThanOrEqual(metrics.client);
  }
});

test("HR Admin AI query reflects a service request created in the same session", async ({ page }) => {
  await signIn(page, "mira.chowdhury@nextventures.example", 29);
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
  expect(after.body.data.sources[0]).toContain("Live ServiceRequest count");
  await page.getByRole("button", { name: "Smart query", exact: true }).click();
  await page.getByLabel("Your question").fill("How many urgent requests are still open?");
  await page.getByRole("button", { name: "Ask assistant" }).click();
  await expect(page.locator(".insight-card")).toContainText("urgent open service requests");
});

import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";
import { seedAction } from "../src/lib/domains/seed-safety";

const prisma = new PrismaClient();
const countries = ["Bangladesh", "Malaysia", "Sri Lanka", "Cyprus"];
const departments = ["Engineering", "People & Culture", "Finance", "Marketing"];
const names = [
  "Aisha Rahman", "Tan Wei Ming", "Nadeesha Perera", "Elena Georgiou", "Arif Hossain", "Mei Ling Tan", "Kavindu Silva", "Andreas Nicolaou", "Farhana Islam", "Nur Aisyah", "Ishara Fernando", "Maria Christou", "Rafiul Karim", "Daniel Wong", "Tharushi Jayawardena", "Andri Hadjicosta", "Sadia Akter", "Amirul Hakim", "Sahan Wickramasinghe", "Eleni Michael", "Imran Chowdhury", "Chong Kai", "Dinithi Gunasekara", "Petros Antoniou", "Nusrat Jahan", "Siti Nur", "Lakshan Fernando", "Katerina Ioannou", "Mahmudul Hasan", "Lim Jia Hui", "Piumi Rathnayake", "Christos Savva", "Tania Sultana", "Faris Aziz", "Ruwan Senanayake", "Alexandros Panayi", "Jannatul Ferdous", "Leong Jun", "Anushka Dias", "Sophia Georgiou", "Saif Ahmed", "Syafiq Roslan", "Mihiri Abeysekara", "Andreas Christodoulou", "Maliha Khan", "Chua Wen", "Dulani Senanayake", "Nikos Petrou", "Samiha Tasnim", "Fatin Nabila", "Charith Fernando", "Anna Kyriakou", "Rakibul Islam", "Koh Zhi", "Sachini Perera", "Marios Andreou", "Tasnim Ahmed", "Aiman Iskandar", "Hasini Silva", "Elias Georgiou", "Sabbir Hossain", "Nurul Izzah", "Kasun Perera", "Marina Loizou", "Nabila Rahman", "Jason Teo", "Nimali Fernando", "Stavros Ioannou", "Abdullah Al Mamun", "Afiqah Zainal", "Dinuka Perera", "Christina Demetriou", "Jubayer Ahmed", "Lee Xin", "Sanduni Silva", "Michalis Georgiou", "Sabrina Islam", "Irfan Hakim", "Chathura Silva", "Andria Constantinou", "Shakib Hasan", "Nur Syazwani", "Kavisha Fernando", "Yiannis Michael", "Rumana Akter", "Zulkifli Omar", "Praveen Kumar", "Maria Andreou", "Emon Hossain", "Michelle Lim", "Anjali Perera", "Constantinos Loizou", "Sanjida Islam", "Haziq Rahman", "Nethmi Silva", "Dimitra Pappas", "Fahim Rahman", "Amelia Tan", "Thilini Perera", "Pavlos Georgiou",
  "Siti Amina", "Ruwan Wijesinghe", "Andreas Kyriakou", "Nadia Karim", "Lim Wei Jie", "Thilak Perera", "Eleni Christou", "Faridah Hassan", "Kamal Hossain",
];
const emailDomain = "nextventures.example";
const employeeEmail = (fullName: string) => `${fullName.toLowerCase().replaceAll(" ", ".")}@${emailDomain}`;
const employeeNumber = (fullName: string, sequence: number) => {
  const parts = fullName.split(" ");
  const firstName = parts[0]!;
  const lastName = parts[parts.length - 1]!;
  return `NV-${firstName[0]}${lastName[0]}-${String(sequence).padStart(4, "0")}`.toUpperCase();
};
const categories = ["IT_EQUIPMENT", "SOFTWARE_ACCESS", "HR_QUERY", "FACILITIES", "OTHER"];
const priorities = ["LOW", "MEDIUM", "HIGH", "URGENT"];
const statuses = ["SUBMITTED", "ASSIGNED", "IN_PROGRESS", "RESOLVED", "CLOSED"];
const taskSpecs = [
  ["Welcome and team introduction", "Meet your manager and team; review the first-week plan.", "People & Culture", "MANAGER", 0, null],
  ["Collect laptop and accessories", "Receive your laptop, charger, and security key.", "Engineering", "MANAGER", 0, null],
  ["Set up company accounts", "Activate email, identity verification, and collaboration tools.", "Engineering", "MANAGER", 1, 1],
  ["Complete employment paperwork", "Review and submit required employment documents.", "People & Culture", "MANAGER", 3, null],
  ["Payroll and benefits enrollment", "Provide payroll information and review benefit options.", "Finance", "MANAGER", 5, 4],
  ["Security and privacy training", "Complete the required data protection and security modules.", "Engineering", "MANAGER", 5, 3],
  ["Role-specific access review", "Confirm access needed for your role with your manager.", "Engineering", "MANAGER", 7, 3],
  ["Department introduction", "Meet partner teams and review how work is coordinated.", "Marketing", "MANAGER", 7, 1],
  ["First-month check-in", "Discuss progress, questions, and support needs.", "People & Culture", "MANAGER", 14, 1],
  ["30-day feedback", "Share feedback on your onboarding experience.", "People & Culture", "MANAGER", 30, 9],
] as const;

async function main() {
  const [existingUsers, existingRequests, existingPlans, existingTemplates] = await Promise.all([
    prisma.user.count(), prisma.serviceRequest.count(), prisma.onboarding.count(), prisma.onboardingTemplate.count(),
  ]);
  const seededAdmin = await prisma.user.findUnique({ where: { email: employeeEmail("Mira Chowdhury") }, select: { id: true } });
  const action = seedAction({ users: existingUsers, requests: existingRequests, onboardings: existingPlans, templates: existingTemplates, hasAssessmentAdmin: Boolean(seededAdmin) });
  if (action === "skip") { console.info("Assessment seed already exists; leaving all database records unchanged."); return; }
  const passwordHash = await argon2.hash("Welcome2026!", { type: argon2.argon2id });
  const createdUsers = [];
  const admin = await prisma.user.create({ data: {
    email: employeeEmail("Mira Chowdhury"), passwordHash, fullName: "Mira Chowdhury", employeeNumber: employeeNumber("Mira Chowdhury", 1),
    country: "Bangladesh", department: "People & Culture", role: "HR_ADMIN", employmentStatus: "ACTIVE", joiningDate: new Date("2020-01-15T00:00:00Z"),
  } });
  createdUsers.push(admin);
  const managers = [];
  for (let i = 0; i < 8; i++) {
    const country = countries[i % countries.length];
    const department = departments[i % departments.length];
    const m = await prisma.user.create({ data: {
      email: employeeEmail(names[i]), passwordHash, fullName: names[i], employeeNumber: employeeNumber(names[i], i + 2),
      country, department, role: "MANAGER", employmentStatus: "ACTIVE", joiningDate: new Date("2022-02-01T00:00:00Z"), managerId: admin.id,
    } });
    managers.push(m); createdUsers.push(m);
  }
  for (let i = 9; i < 109; i++) {
    const department = departments[(i - 9) % departments.length];
    const country = countries[Math.floor((i - 9) / 4) % countries.length];
    const employmentStatus = i % 29 === 0 ? "ON_PROBATION" : i % 37 === 0 ? "ON_NOTICE" : "ACTIVE";
    const user = await prisma.user.create({ data: {
      email: employeeEmail(names[i]), passwordHash, fullName: names[i],
      employeeNumber: employeeNumber(names[i], i + 2), country, department, role: "EMPLOYEE", employmentStatus,
      joiningDate: new Date("2021-03-01T00:00:00Z"), managerId: managers[(i - 9) % managers.length]!.id,
    } });
    createdUsers.push(user);
  }
  const employees = createdUsers.filter((u) => u.role === "EMPLOYEE");
  const day = 86400_000;
  for (let i = 0; i < 36; i++) {
    const requester = i < 7 ? employees[20 + i]! : employees[(i * 7) % employees.length]!;
    const status = statuses[i % statuses.length]!;
    const assigneeId = ["ASSIGNED", "IN_PROGRESS", "RESOLVED", "CLOSED"].includes(status) ? managers[i % managers.length]!.id : null;
    const created = await prisma.serviceRequest.create({ data: {
      requestNumber: `SR-${String(20260001 + i)}`, requesterId: requester.id, assigneeId,
      title: ["Laptop replacement request", "Access to analytics workspace", "Question about leave balance", "Meeting room display not working", "Ergonomic chair assessment", "VPN connection assistance"][i % 6]!,
      description: `Please help me with this ${categories[i % categories.length]!.replaceAll("_", " ").toLowerCase()} request. This is needed for my work with the ${requester.department} team.`,
      category: categories[i % categories.length]!, priority: priorities[i % priorities.length]!, status,
      createdAt: new Date(Date.now() - (i * 3 + 1) * day),
      ...(status === "RESOLVED" || status === "CLOSED" ? { resolvedAt: new Date(Date.now() - (i * 3) * day) } : {}),
      ...(status === "CLOSED" ? { closedAt: new Date(Date.now() - (i * 3 - 1) * day) } : {}),
    } });
    const history = ["SUBMITTED", ...(status === "SUBMITTED" ? [] : ["ASSIGNED"]), ...(status === "IN_PROGRESS" || status === "RESOLVED" || status === "CLOSED" ? ["IN_PROGRESS"] : []), ...(status === "RESOLVED" || status === "CLOSED" ? ["RESOLVED"] : []), ...(status === "CLOSED" ? ["CLOSED"] : [])];
    for (let j = 0; j < history.length; j++) {
      await prisma.requestStatusHistory.create({ data: { requestId: created.id, actorId: j === 0 ? requester.id : managers[i % managers.length]!.id, fromStatus: j ? history[j - 1]! : null, toStatus: history[j]!, createdAt: created.createdAt } });
    }
    if (i < 5) for (let j = 0; j < 3; j++) await prisma.requestComment.create({ data: {
      requestId: created.id, authorId: j % 2 ? managers[i % managers.length]!.id : requester.id,
      body: ["Thanks, I have logged the details.", "I have shared the information our team needs.", "I will follow up with the next update."][j]!,
      createdAt: new Date(created.createdAt.getTime() + (j + 1) * 3600_000),
    } });
  }

  const template = await prisma.onboardingTemplate.create({ data: {
    name: "International New Hire — Standard", description: "A consistent first-month checklist for new colleagues across all four offices.", createdById: admin.id, version: 1,
  } });
  const templateTasks = [];
  for (const [idx, spec] of taskSpecs.entries()) templateTasks.push(await prisma.templateTask.create({ data: {
    templateId: template.id, title: spec[0], description: spec[1], department: spec[2], ownerRole: spec[3], dueOffsetDays: spec[4], sortOrder: idx + 1,
    dependsOnId: spec[5] ? undefined : null,
  } }));
  // Assign dependencies after all template tasks exist to satisfy foreign keys.
  for (let idx = 0; idx < taskSpecs.length; idx++) if (taskSpecs[idx]![5] !== null) {
    await prisma.templateTask.update({ where: { id: templateTasks[idx]!.id }, data: { dependsOnId: templateTasks[taskSpecs[idx]![5] as number - 1]!.id } });
  }
  const hires = employees.slice(20, 27);
  for (let h = 0; h < hires.length; h++) {
    const employee = hires[h]!;
    const startDate = new Date(Date.now() - (48 - h * 3) * day);
    await prisma.user.update({ where: { id: employee.id }, data: { joiningDate: startDate } });
    const onboarding = await prisma.onboarding.create({ data: { employeeId: employee.id, templateId: template.id, createdById: admin.id, startDate } });
    const tasks = [];
    for (let idx = 0; idx < taskSpecs.length; idx++) {
      const spec = taskSpecs[idx]!;
      const onboardingStatuses = ["COMPLETED", "COMPLETED", "COMPLETED", h % 3 === 0 ? "COMPLETED" : "IN_PROGRESS", h % 3 === 0 ? "IN_PROGRESS" : "BLOCKED", h % 3 === 0 ? (h % 2 === 0 ? "IN_PROGRESS" : "NOT_STARTED") : "BLOCKED", "NOT_STARTED", "NOT_STARTED", "NOT_STARTED", "NOT_STARTED"] as const;
      const desiredStatus = onboardingStatuses[idx] ?? "NOT_STARTED";
      const dependencyIndex = spec[5] === null ? null : spec[5] - 1;
      const dependencyStatus = dependencyIndex === null ? null : onboardingStatuses[dependencyIndex];
      const status = dependencyStatus && dependencyStatus !== "COMPLETED" ? "BLOCKED" : desiredStatus;
      const manager = managers.find((m) => m.department === spec[2]) ?? managers[0]!;
      tasks.push(await prisma.onboardingTask.create({ data: {
        onboardingId: onboarding.id, templateTaskId: templateTasks[idx]!.id, title: spec[0], description: spec[1], department: spec[2],
        dueOffsetDays: spec[4], dueDate: new Date(startDate.getTime() + spec[4] * day), ownerId: manager.id, status,
      completedAt: status === "COMPLETED" ? new Date(startDate.getTime() + Math.max(0, spec[4] - 1) * day) : null,
      } }));
    }
    for (let idx = 0; idx < taskSpecs.length; idx++) if (taskSpecs[idx]![5] !== null) {
      await prisma.onboardingTask.update({ where: { id: tasks[idx]!.id }, data: { dependsOnId: tasks[taskSpecs[idx]![5] as number - 1]!.id } });
    }
  }
  console.info(`Seed complete: ${employees.length} employees across ${createdUsers.length} user accounts, 36 requests, ${hires.length} onboardings.`);
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; }).finally(async () => prisma.$disconnect());

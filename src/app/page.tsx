import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import Workspace, { type Tab } from "@/components/workspace";

export default async function HomePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const requestedTab = (await searchParams).tab;
  const allowedTabs: Tab[] = ["Overview", "Service requests", "Onboarding"];
  if (user.role === "HR_ADMIN" || user.role === "MANAGER") allowedTabs.push("People");
  if (user.role === "HR_ADMIN") allowedTabs.push("Smart query");
  const initialTab = allowedTabs.includes(requestedTab as Tab) ? requestedTab as Tab : "Overview";
  return <Workspace user={user} initialTab={initialTab} />;
}

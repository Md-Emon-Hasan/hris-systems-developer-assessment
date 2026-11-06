import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import Workspace from "@/components/workspace";

export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return <Workspace user={user} />;
}

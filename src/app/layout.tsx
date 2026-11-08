import type { Metadata } from "next";
import Providers from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "NEXT Ventures | People Operations",
  description: "Service requests and employee onboarding in one place.",
  icons: { icon: "/next-ventures-favicon.svg", apple: "/next-ventures-favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body suppressHydrationWarning><Providers>{children}</Providers></body></html>;
}

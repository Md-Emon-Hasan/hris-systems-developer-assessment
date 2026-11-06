"use client";
import type { ReactNode } from "react";
import QueryProvider from "@/components/query-provider";
export default function Providers({ children }: { children: ReactNode }) { return <QueryProvider>{children}</QueryProvider>; }

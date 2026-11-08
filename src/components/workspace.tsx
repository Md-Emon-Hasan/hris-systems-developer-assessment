"use client";

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Activity, ArrowUpRight, Bot, ChevronDown, CircleHelp, ClipboardList, Clock3, FilePlus2, LayoutDashboard, LogOut, Menu, MessageSquareText, Search, ShieldCheck, Sparkles, Users, X } from "lucide-react";
import type { CurrentUser } from "@/lib/auth/session";
import { requestSchema } from "@/lib/validation/schemas";

type RequestItem = { id: string; requestNumber: string; title: string; description: string; category: string; priority: string; status: string; createdAt: string; requester: { id: string; fullName: string; country: string; department: string; managerId: string | null }; assignee: { id: string; fullName: string } | null; _count?: { comments: number } };
type DashboardData = { headcountByCountry: { country: string; count: number }[]; requests: { total: number; byStatus: { status: string; count: number }[]; byCategory: { category: string; count: number }[] }; onboarding: { inProgress: number; overdueTasks: number; hires: { id: string; name: string; country: string; total: number; completed: number; pending: number; overdue: number; blocked: number }[] }; crossModule: { requestNumber: string; title: string; requester: string; country: string; status: string }[] };
type Task = { id: string; title: string; description: string; department: string; ownerRole: string; status: string; dueDate: string; ownerId: string | null; owner: { id: string; fullName: string } | null; dependsOn: { id: string; title: string; status: string } | null };
type OnboardingItem = { id: string; status: string; employee: { id: string; fullName: string; country: string; department: string; joiningDate: string }; template: { name: string }; tasks: Task[] };
type TemplateTaskOption = { id: string; title: string; description: string; department: string; ownerRole: string; dueOffsetDays: number; dependsOnId: string | null };
type TemplateOption = { id: string; name: string; description: string; active: boolean; tasks: TemplateTaskOption[] };
type TemplateTaskDraft = { title: string; description: string; department: string; ownerRole: string; dueOffsetDays: number; dependsOnIndex: number | null };
type Person = { id: string; fullName: string; email: string; employeeNumber: string; country: string; department: string; role: string; employmentStatus: string };
export type Tab = "Overview" | "Service requests" | "Onboarding" | "People" | "Smart query";

async function getData<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message ?? "Unable to load records.");
  return body.data as T;
}
const cap = (s: string) => s.toLowerCase().split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
const dateLabel = (value: string) => new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(value));
const taskCounts = (tasks: Task[]) => {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const completed = tasks.filter((task) => task.status === "COMPLETED").length;
  const blocked = tasks.filter((task) => task.status === "BLOCKED").length;
  return { completed, blocked, pending: tasks.length - completed - blocked, overdue: tasks.filter((task) => task.status !== "COMPLETED" && new Date(task.dueDate) < today).length };
};

export default function Workspace({ user, initialTab }: { user: CurrentUser; initialTab: Tab }) {
  const router = useRouter();
  const [tab, setTabState] = useState<Tab>(initialTab);
  const [requestOpen, setRequestOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const roleName = user.role === "HR_ADMIN" ? "HR Admin" : user.role === "MANAGER" ? "Manager" : "Employee";
  const nav: { label: Tab; icon: ReactNode }[] = [
    { label: "Overview", icon: <LayoutDashboard size={16} /> },
    { label: "Service requests", icon: <MessageSquareText size={16} /> },
    { label: "Onboarding", icon: <ClipboardList size={16} /> },
    ...(user.role === "HR_ADMIN" || user.role === "MANAGER" ? [{ label: "People" as Tab, icon: <Users size={16} /> }] : []),
    ...(user.role === "HR_ADMIN" ? [{ label: "Smart query" as Tab, icon: <Sparkles size={16} /> }] : []),
  ];
  const availableTabs = useMemo(() => new Set<Tab>([
    "Overview", "Service requests", "Onboarding",
    ...(user.role === "HR_ADMIN" || user.role === "MANAGER" ? ["People" as Tab] : []),
    ...(user.role === "HR_ADMIN" ? ["Smart query" as Tab] : []),
  ]), [user.role]);
  const setTab = (nextTab: Tab) => {
    setTabState(nextTab);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (nextTab === "Overview") url.searchParams.delete("tab");
      else url.searchParams.set("tab", nextTab);
      window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    }
  };
  useEffect(() => {
    const syncTab = () => {
      const requestedTab = new URLSearchParams(window.location.search).get("tab") as Tab | null;
      setTabState(requestedTab && availableTabs.has(requestedTab) ? requestedTab : "Overview");
    };
    syncTab();
    window.addEventListener("popstate", syncTab);
    return () => window.removeEventListener("popstate", syncTab);
  }, [availableTabs]);
  useEffect(() => {
    if (!mobileNavOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setMobileNavOpen(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [mobileNavOpen]);
  const dashboard = useQuery({ queryKey: ["dashboard"], queryFn: () => getData<DashboardData>("/api/dashboard") });
  const requests = useQuery({ queryKey: ["requests"], queryFn: () => getData<RequestItem[]>("/api/service-requests") });
  const onboardings = useQuery({ queryKey: ["onboarding"], queryFn: () => getData<OnboardingItem[]>("/api/onboarding") });
  const people = useQuery({ queryKey: ["people"], queryFn: () => getData<Person[]>("/api/users") , enabled: tab === "People" });
  const refresh = () => { void queryClient.invalidateQueries(); };

  return <div className="workspace">
    <button type="button" className={`mobile-nav-backdrop${mobileNavOpen ? " is-open" : ""}`} aria-label="Close navigation" tabIndex={mobileNavOpen ? 0 : -1} onClick={() => setMobileNavOpen(false)} />
    <aside id="workspace-navigation" className={`sidebar${mobileNavOpen ? " mobile-nav-open" : ""}`}>
      <div className="sidebar-brand"><span className="sidebar-brand-logo"><Image src="/next-ventures-logo.svg" alt="NEXT Ventures" width={92} height={32} priority /></span><span className="brand-text">NEXT VENTURES<small>PEOPLE OPERATIONS</small></span></div>
      <div className="nav-label">WORKSPACE</div>
      {nav.map((item) => <button key={item.label} className={`nav-link ${tab === item.label ? "active" : ""}`} onClick={() => { setTab(item.label); setMobileNavOpen(false); }}>{item.icon}{item.label}</button>)}
      <div className="nav-label" style={{ marginTop: 15 }}>YOUR ACCOUNT</div>
      <button className="nav-link" onClick={() => { setProfileOpen(true); setMobileNavOpen(false); }}><ShieldCheck size={16} />My profile</button>
      <div className="sidebar-bottom"><div className="user-chip"><span className="avatar">{user.fullName.split(" ").map((s) => s[0]).slice(0, 2).join("")}</span><div><div className="user-name">{user.fullName}</div><div className="user-role">{roleName} · {user.country}</div></div></div><button className="nav-link" onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); router.push("/login"); router.refresh(); }}><LogOut size={15} />Sign out</button></div>
    </aside>
    <main className="main-area">
      <header className="topbar"><button type="button" className="mobile-menu-toggle" aria-label={mobileNavOpen ? "Close navigation menu" : "Open navigation menu"} aria-expanded={mobileNavOpen} aria-controls="workspace-navigation" onClick={() => setMobileNavOpen((open) => !open)}>{mobileNavOpen ? <X size={20} /> : <Menu size={20} />}</button><div className="crumb">People Operations <span style={{ margin: "0 8px", color: "#bdc5be" }}>/</span><strong>{tab}</strong></div><div className="topbar-right"><span className="date-label">{new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric" }).format(new Date())}</span><span className="avatar">{user.fullName.split(" ").map((s) => s[0]).slice(0, 2).join("")}</span></div></header>
      <div className="page-content">
        <div className="page-heading"><div><p className="eyebrow green">{tab === "Overview" ? "YOUR PEOPLE OPERATIONS" : "NEXT VENTURES WORKSPACE"}</p><h1>{tab === "Overview" ? `Good morning, ${user.fullName.split(" ")[0]}` : tab}</h1><p>{tab === "Overview" ? "A clear view of requests, people, and the work ahead." : pageSubtitle(tab, user.role)}</p></div><div className="heading-actions"><button className="button secondary" onClick={() => setTab("Service requests")}><Search size={15} />Find support</button><button className="button primary" onClick={() => setRequestOpen(true)}><FilePlus2 size={15} />New request</button></div></div>
        {(tab === "Overview" || tab === "Service requests") && <>
          <Stats dashboard={dashboard.data} loading={dashboard.isLoading} role={user.role} />
          {tab === "Overview" && <Overview dashboard={dashboard.data} loading={dashboard.isLoading} setTab={setTab} role={user.role} />}
          <RequestList items={requests.data ?? []} loading={requests.isLoading} role={user.role} onOpen={setSelectedRequest} />
        </>}
        {tab === "Onboarding" && <OnboardingView rows={onboardings.data ?? []} loading={onboardings.isLoading} role={user.role} userId={user.id} refresh={refresh} />}
        {tab === "People" && <PeopleView rows={people.data ?? []} loading={people.isLoading} role={user.role} refresh={refresh} />}
        {tab === "Smart query" && <SmartQuery />}
        {(dashboard.error || requests.error || onboardings.error || people.error) && <p className="form-error" style={{ marginTop: 14 }}>Could not load the latest data. Refresh the page to retry.</p>}
      </div>
    </main>
    {requestOpen && <RequestDialog close={() => setRequestOpen(false)} onCreated={() => { setRequestOpen(false); refresh(); setTab("Service requests"); }} />}
    {selectedRequest && <RequestDetail id={selectedRequest} user={user} close={() => setSelectedRequest(null)} refresh={refresh} />}
    {profileOpen && <ProfileDialog user={user} close={() => setProfileOpen(false)} />}
  </div>;
}

function pageSubtitle(tab: Tab, role: string) {
  if (tab === "Service requests") return role === "EMPLOYEE" ? "Track the support requests you have raised." : "Review, route, and resolve requests across your scope.";
  if (tab === "Onboarding") return role === "EMPLOYEE" ? "Your checklist, due dates, and next steps." : "Keep new teammates moving with clear owners and due dates.";
  if (tab === "People") return "Find colleagues and review team details.";
  if (tab === "Smart query") return "Ask a question about live company data.";
  return "Your people operations at a glance.";
}

function Stats({ dashboard, loading, role }: { dashboard?: DashboardData; loading: boolean; role: string }) {
  const totalPeople = dashboard?.headcountByCountry.reduce((sum, c) => sum + c.count, 0) ?? 0;
  const openCount = dashboard?.requests.byStatus.filter((s) => ["SUBMITTED", "ASSIGNED", "IN_PROGRESS"].includes(s.status)).reduce((sum, s) => sum + s.count, 0) ?? 0;
  const cards = [
    { label: role === "EMPLOYEE" ? "My requests" : "Open requests", value: openCount, foot: "Across your workspace", icon: <MessageSquareText size={15} /> },
    { label: role === "EMPLOYEE" ? "My onboarding" : "New hires in progress", value: dashboard?.onboarding.inProgress ?? 0, foot: "Active onboarding plans", icon: <ClipboardList size={15} /> },
    { label: "Overdue tasks", value: dashboard?.onboarding.overdueTasks ?? 0, foot: "Need a follow-up", icon: <Clock3 size={15} /> },
    { label: role === "EMPLOYEE" ? "My location" : "People in scope", value: role === "EMPLOYEE" ? "—" : totalPeople, foot: role === "HR_ADMIN" ? "Across 4 countries" : "Direct reports", icon: <Users size={15} /> },
  ];
  return <div className="stat-grid">{cards.map((c) => <div key={c.label} className="stat-card"><div className="stat-top"><span>{c.label}</span><span className="stat-icon">{c.icon}</span></div><div className="stat-number">{loading ? "—" : c.value}</div><div className="stat-foot">{c.foot}</div></div>)}</div>;
}

function Overview({ dashboard, loading, setTab, role }: { dashboard?: DashboardData; loading: boolean; setTab: (tab: Tab) => void; role: string }) {
  const chartData = useMemo(() => (dashboard?.requests.byStatus ?? []).map((s) => ({ name: cap(s.status), requests: s.count })), [dashboard]);
  const max = Math.max(1, ...(dashboard?.headcountByCountry.map((c) => c.count) ?? [1]));
  const maxCategory = Math.max(1, ...(dashboard?.requests.byCategory.map((item) => item.count) ?? [1]));
  return <div className="content-grid">
    <section className="panel"><div className="panel-heading"><div><h2 className="panel-title">Open request activity</h2><p className="panel-subtitle">See the requests still being worked on in your scope.</p></div><button className="button ghost" onClick={() => setTab("Service requests")}>View all <ArrowUpRight size={13} /></button></div><div className="chart-box">{loading ? <div className="empty-state">Loading activity…</div> : <ResponsiveContainer width="100%" height="100%"><BarChart data={chartData} margin={{ top: 4, right: 8, left: -22, bottom: 0 }}><CartesianGrid vertical={false} stroke="#eef1ee" /><XAxis dataKey="name" tick={{ fontSize: 11, fill: "#909a93" }} axisLine={false} tickLine={false} /><YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#909a93" }} axisLine={false} tickLine={false} /><Tooltip cursor={{ fill: "#f5f8f5" }} contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e8ece8" }} /><Bar dataKey="requests" fill="#4b9672" radius={[4, 4, 0, 0]} maxBarSize={42} /></BarChart></ResponsiveContainer>}</div><h3 className="panel-title" style={{ margin: "12px 0" }}>Open requests by category</h3><div className="country-list">{(dashboard?.requests.byCategory ?? []).map((item) => <div className="country-row" key={item.category}><span className="country-name">{cap(item.category)}</span><div className="progress-track"><div className="progress-fill" style={{ width: `${(item.count / maxCategory) * 100}%` }} /></div><span className="country-count">{item.count}</span></div>)}</div></section>
    <section className="panel"><div className="panel-heading"><div><h2 className="panel-title">Headcount by country</h2><p className="panel-subtitle">{role === "HR_ADMIN" ? "Active employees across NEXT Ventures" : role === "MANAGER" ? "Active employees in your team" : "Your office location"}</p></div><Users size={15} color="#8b968e" /></div><div className="country-list">{(dashboard?.headcountByCountry ?? []).map((c) => <div className="country-row" key={c.country}><span className="country-name">{c.country}</span><div className="progress-track"><div className="progress-fill" style={{ width: `${(c.count / max) * 100}%` }} /></div><span className="country-count">{c.count}</span></div>)}</div>
      {role === "HR_ADMIN" && <div className="insight-card" style={{ marginTop: 20 }}><div className="insight-kicker"><Activity size={13} />Cross-module insight</div><p>{dashboard?.crossModule.length ? `${dashboard.crossModule.length} new hire${dashboard.crossModule.length === 1 ? "" : "s"} have an open IT equipment request.` : "No new hires currently have an open IT equipment request."}</p></div>}
    </section>
    <section className="panel" style={{ gridColumn: "1 / -1" }}><div className="panel-heading"><div><h2 className="panel-title">Onboarding progress</h2><p className="panel-subtitle">Track completed tasks, upcoming work, and overdue items.</p></div><button className="button ghost" onClick={() => setTab("Onboarding")}>Open onboarding <ArrowUpRight size={13} /></button></div>
      {dashboard?.onboarding.hires.length ? dashboard.onboarding.hires.slice(0, 5).map((h) => <div className="hire-row" key={h.id}><div><div className="hire-name">{h.name}<span style={{ color: "#9aa39d", fontWeight: 400 }}> · {h.country}</span></div><div className="hire-progress">{h.completed} completed · {h.pending} pending · {h.overdue} overdue · {h.blocked} blocked</div></div><div style={{ minWidth: 100, alignSelf: "center" }}><div className="progress-track"><div className="progress-fill" style={{ width: `${h.total ? (h.completed / h.total) * 100 : 0}%` }} /></div></div></div>) : <div className="empty-state">No active onboarding plans in your scope.</div>}
    </section>
  </div>;
}

function RequestList({ items, loading, role, onOpen }: { items: RequestItem[]; loading: boolean; role: string; onOpen: (id: string) => void }) {
  const [status, setStatus] = useState("ALL"); const [category, setCategory] = useState("ALL"); const [priority, setPriority] = useState("ALL"); const [country, setCountry] = useState("ALL"); const [search, setSearch] = useState("");
  const shown = items.filter((r) => (status === "ALL" || r.status === status) && (category === "ALL" || r.category === category) && (priority === "ALL" || r.priority === priority) && (country === "ALL" || r.requester.country === country) && (!search || `${r.title} ${r.requestNumber} ${r.requester.fullName}`.toLowerCase().includes(search.toLowerCase())));
  return <section className="panel section-gap"><div className="panel-heading"><div><h2 className="panel-title">Recent service requests</h2><p className="panel-subtitle">{role === "EMPLOYEE" ? "Your support request history" : "Requests awaiting attention"}</p></div><span className="status-pill status-in_progress">{shown.length} records</span></div>
    <div className="request-toolbar"><div className="filter-group"><input className="field" aria-label="Search requests" placeholder="Search requests" value={search} onChange={(e) => setSearch(e.target.value)} style={{ minHeight: 38 }} /><select className="select-field" aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}><option value="ALL">All statuses</option>{["SUBMITTED", "ASSIGNED", "IN_PROGRESS", "RESOLVED", "CLOSED"].map((v) => <option key={v} value={v}>{cap(v)}</option>)}</select><select className="select-field" aria-label="Filter by category" value={category} onChange={(e) => setCategory(e.target.value)}><option value="ALL">All categories</option>{["IT_EQUIPMENT", "SOFTWARE_ACCESS", "HR_QUERY", "FACILITIES", "OTHER"].map((v) => <option key={v} value={v}>{cap(v)}</option>)}</select><select className="select-field" aria-label="Filter by priority" value={priority} onChange={(e) => setPriority(e.target.value)}><option value="ALL">All priorities</option>{["LOW", "MEDIUM", "HIGH", "URGENT"].map((v) => <option key={v} value={v}>{cap(v)}</option>)}</select>{role === "HR_ADMIN" && <select className="select-field" aria-label="Filter by country" value={country} onChange={(e) => setCountry(e.target.value)}><option value="ALL">All countries</option>{["Bangladesh", "Malaysia", "Sri Lanka", "Cyprus"].map((c) => <option key={c}>{c}</option>)}</select>}</div><span className="muted" style={{ alignSelf: "center", fontSize: 10 }}>Select a row to view details</span></div>
    <div className="table-wrap"><table className="request-table"><thead><tr><th>Request</th><th>Requester</th><th>Priority</th><th>Status</th><th>Updated</th></tr></thead><tbody>{loading ? <tr><td colSpan={5} className="empty-state">Loading requests…</td></tr> : shown.slice(0, 12).map((r) => <tr key={r.id} onClick={() => onOpen(r.id)} style={{ cursor: "pointer" }}><td className="request-title">{r.title}<div className="request-meta">{r.requestNumber} · {cap(r.category)}{r._count?.comments ? ` · ${r._count.comments} comments` : ""}</div></td><td>{r.requester.fullName}<div className="request-meta">{r.requester.country}</div></td><td><span className={`priority priority-${r.priority.toLowerCase()}`}>{cap(r.priority)}</span></td><td><span className={`status-pill status-${r.status.toLowerCase()}`}>{cap(r.status)}</span></td><td>{dateLabel(r.createdAt)}</td></tr>)}{!loading && shown.length === 0 && <tr><td colSpan={5} className="empty-state">No requests match these filters.</td></tr>}</tbody></table></div>
  </section>;
}

function RequestDialog({ close, onCreated }: { close: () => void; onCreated: () => void }) {
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const form = useForm<z.infer<typeof requestSchema>>({ resolver: zodResolver(requestSchema), defaultValues: { title: "", description: "", category: "IT_EQUIPMENT", priority: "MEDIUM" } });
  async function submit(values: z.infer<typeof requestSchema>) {
    setError(""); setBusy(true);
    const response = await fetch("/api/service-requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
    const body = await response.json(); setBusy(false);
    if (!response.ok) { setError(body.error?.message ?? "Could not create request."); return; } onCreated();
  }
  return <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="new-request-title"><div className="modal-header"><div><p className="eyebrow green">SERVICE DESK</p><h2 id="new-request-title">Raise a request</h2></div><button className="button ghost" aria-label="Close" onClick={close}><X size={17} /></button></div><form className="modal-form" onSubmit={form.handleSubmit(submit)}><label className="form-label">Request title<input className="field" {...form.register("title")} placeholder="What do you need help with?" />{form.formState.errors.title && <span className="form-error">{form.formState.errors.title.message}</span>}</label><label className="form-label">Details<textarea className="textarea-field" {...form.register("description")} placeholder="Add a few details so we can route your request." />{form.formState.errors.description && <span className="form-error">{form.formState.errors.description.message}</span>}</label><div className="two-col"><label className="form-label">Category<select aria-label="Request category" className="select-field" style={{ height: 42 }} {...form.register("category")}>{[["IT_EQUIPMENT", "IT Equipment"], ["SOFTWARE_ACCESS", "Software Access"], ["HR_QUERY", "HR Query"], ["FACILITIES", "Facilities"], ["OTHER", "Other"]].map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select></label><label className="form-label">Priority<select aria-label="Request priority" className="select-field" style={{ height: 42 }} {...form.register("priority")}>{["LOW", "MEDIUM", "HIGH", "URGENT"].map((v) => <option key={v} value={v}>{cap(v)}</option>)}</select></label></div>{error && <p className="form-error">{error}</p>}<div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 5 }}><button type="button" className="button secondary" onClick={close}>Cancel</button><button disabled={busy} className="button primary">{busy ? "Submitting…" : "Submit request"}</button></div></form></section></div>;
}

function RequestDetail({ id, user, close, refresh }: { id: string; user: CurrentUser; close: () => void; refresh: () => void }) {
  const queryClient = useQueryClient(); const [comment, setComment] = useState(""); const [busy, setBusy] = useState(false); const [message, setMessage] = useState(""); const [assigneeId, setAssigneeId] = useState("");
  const detail = useQuery({ queryKey: ["request", id], queryFn: () => getData<RequestItem & { comments: { id: string; body: string; createdAt: string; author: { fullName: string } }[]; history: { id: string; fromStatus: string | null; toStatus: string; createdAt: string }[] }>(`/api/service-requests/${id}`) });
  const people = useQuery({ queryKey: ["people"], queryFn: () => getData<Person[]>("/api/users"), enabled: user.role !== "EMPLOYEE" });
  async function update(action: string) {
    if (!detail.data) return; setBusy(true); setMessage("");
    const response = await fetch(`/api/service-requests/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...(action === "ASSIGN" ? { assigneeId } : {}), ...(action === "REOPEN" ? { note: "Additional work is needed." } : {}) }) });
    const body = await response.json(); setBusy(false); if (!response.ok) { setMessage(body.error?.message ?? "Update failed."); return; }
    await queryClient.invalidateQueries({ queryKey: ["request", id] }); refresh();
  }
  async function sendComment(e: FormEvent) { e.preventDefault(); if (!comment.trim()) return; setBusy(true); const response = await fetch(`/api/service-requests/${id}/comments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: comment }) }); const body = await response.json(); setBusy(false); if (!response.ok) { setMessage(body.error?.message ?? "Comment failed."); return; } setComment(""); await queryClient.invalidateQueries({ queryKey: ["request", id] }); refresh(); }
  const row = detail.data;
  return <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}><section className="modal" style={{ maxHeight: "90vh", overflow: "auto" }} role="dialog" aria-modal="true"><div className="modal-header"><div><p className="eyebrow green">{row?.requestNumber ?? "REQUEST"}</p><h2>{row?.title ?? "Loading request…"}</h2></div><button className="button ghost" onClick={close}><X size={17} /></button></div>{row && <><div style={{ display: "flex", gap: 8, marginBottom: 15 }}><span className={`status-pill status-${row.status.toLowerCase()}`}>{cap(row.status)}</span><span className={`priority priority-${row.priority.toLowerCase()}`}>{cap(row.priority)} priority</span></div><p style={{ lineHeight: 1.6, color: "#657168", fontSize: 12 }}>{row.description}</p><p className="request-meta">Raised by {row.requester.fullName} · {row.requester.country} · {cap(row.category)}{row.assignee ? ` · Assigned to ${row.assignee.fullName}` : ""}</p><div className="panel" style={{ padding: 13, margin: "16px 0" }}><h3 className="panel-title">Activity</h3>{row.comments.map((c) => <div key={c.id} className="hire-row"><span>{c.body}<span className="request-meta"> · {c.author.fullName}</span></span><span className="request-meta">{dateLabel(c.createdAt)}</span></div>)}{!row.comments.length && <div className="empty-state">No comments yet.</div>}</div>{(user.role === "HR_ADMIN" || user.role === "MANAGER") && row.status === "SUBMITTED" && <div className="request-toolbar"><select className="select-field" aria-label="Assignee" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}><option value="">Choose an assignee</option>{(people.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.fullName} · {p.department}</option>)}</select><button className="button primary" disabled={!assigneeId || busy} onClick={() => update("ASSIGN")}>Assign request</button></div>}{row.status === "ASSIGNED" && row.assignee?.id === user.id && <button className="button primary" disabled={busy} onClick={() => update("START")}>Start work</button>}{row.status === "IN_PROGRESS" && row.assignee?.id === user.id && <button className="button primary" disabled={busy} onClick={() => update("RESOLVE")}>Mark resolved</button>}{row.status === "RESOLVED" && (row.requester.id === user.id || user.role === "HR_ADMIN") && <button className="button primary" disabled={busy} onClick={() => update("CLOSE")}>Close request</button>}<form onSubmit={sendComment} style={{ display: "flex", gap: 8, marginTop: 15 }}><input className="field" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add a comment…" maxLength={2000} /><button className="button secondary" disabled={busy || !comment.trim()}>Comment</button></form>{message && <p className="form-error" style={{ marginTop: 10 }}>{message}</p>}</>}</section></div>;
}

function OnboardingPlanCard({ row, role, userId, people, busy, notice, updateTask }: { row: OnboardingItem; role: string; userId: string; people: Person[]; busy: boolean; notice: string; updateTask: (taskId: string, update: { status?: string; ownerId?: string | null }) => Promise<void> }) {
  const [expanded, setExpanded] = useState(false);
  const { completed, pending, overdue, blocked } = taskCounts(row.tasks);
  const tasksId = `onboarding-tasks-${row.id}`;
  return <section className="onboarding-plan-card">
    <div className="onboarding-plan-summary">
      <div><div className="hire-name">{row.employee.fullName}<span className="onboarding-plan-country"> · {row.employee.country}</span></div><div className="hire-progress">{row.template.name} · Started {dateLabel(row.employee.joiningDate)} · {completed} completed · {pending} pending · {overdue} overdue · {blocked} blocked</div></div>
      <div className="onboarding-plan-progress"><div className="progress-track"><div className="progress-fill" style={{ width: `${row.tasks.length ? completed / row.tasks.length * 100 : 0}%` }} /></div><div className="request-meta" style={{ textAlign: "right" }}>{completed}/{row.tasks.length} complete</div></div>
      <button type="button" className={`accordion-toggle${expanded ? " is-open" : ""}`} aria-label={`${expanded ? "Hide" : "Show"} onboarding tasks for ${row.employee.fullName}`} aria-expanded={expanded} aria-controls={tasksId} onClick={() => setExpanded((open) => !open)}><ChevronDown size={18} /></button>
    </div>
    <div className="onboarding-accordion" id={tasksId} hidden={!expanded}>
      <div className="accordion-heading"><div><h3 className="panel-title">{row.employee.fullName} onboarding tasks</h3><p className="panel-subtitle">See each task owner, deadline, prerequisite, and status.</p></div></div>
      {role === "HR_ADMIN" && row.tasks.some((task) => !task.ownerId) && <p className="form-error">{row.tasks.filter((task) => !task.ownerId).length} task{row.tasks.filter((task) => !task.ownerId).length === 1 ? " needs" : "s need"} an owner. Assign each unowned task below.</p>}
      {row.tasks.map((task) => <div key={task.id} className="onboarding-task-row"><div className="onboarding-task-copy"><div className="hire-name">{task.title}</div><div className="hire-progress">{task.department} · {cap(task.ownerRole)} owner · due {dateLabel(task.dueDate)} · {task.owner?.fullName ?? "Unassigned"}{task.dependsOn ? ` · after ${task.dependsOn.title}` : ""}</div></div>
        {role === "HR_ADMIN" && <select className="select-field" aria-label={`Owner for ${task.title}`} value={task.ownerId ?? ""} onChange={(event) => void updateTask(task.id, { ownerId: event.target.value || null })}><option value="">Unassigned</option>{people.filter((person) => person.role === task.ownerRole && person.department === task.department).map((person) => <option key={person.id} value={person.id}>{person.fullName}</option>)}</select>}
        <span className={`status-pill status-${task.status.toLowerCase()}`}>{cap(task.status)}</span>
        {task.status !== "COMPLETED" && task.ownerId === userId && <button className="button secondary" disabled={busy || task.status === "BLOCKED" || Boolean(task.dependsOn && task.dependsOn.status !== "COMPLETED")} onClick={() => void updateTask(task.id, { status: task.status === "NOT_STARTED" ? "IN_PROGRESS" : "COMPLETED" })}>{task.status === "NOT_STARTED" ? "Start" : "Complete"}</button>}
      </div>)}{notice && <p className="form-error">{notice}</p>}
    </div>
  </section>;
}

function OnboardingView({ rows, loading, role, userId, refresh }: { rows: OnboardingItem[]; loading: boolean; role: string; userId: string; refresh: () => void }) {
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState(""); const [busy, setBusy] = useState(false); const [dialog, setDialog] = useState<"assign" | "template" | null>(null); const [editingTemplate, setEditingTemplate] = useState<TemplateOption | null>(null);
  const assignablePeople = useQuery({ queryKey: ["assignable-people"], queryFn: () => getData<Person[]>("/api/users"), enabled: role === "HR_ADMIN" || role === "MANAGER" });
  const templates = useQuery({ queryKey: ["templates"], queryFn: () => getData<TemplateOption[]>("/api/onboarding/templates"), enabled: role === "HR_ADMIN" });
  async function updateTask(taskId: string, update: { status?: string; ownerId?: string | null }) {
    setBusy(true); setNotice(""); const response = await fetch(`/api/onboarding/tasks/${taskId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(update) }); const body = await response.json(); setBusy(false); if (!response.ok) { setNotice(body.error?.message ?? "Task update failed."); return; } refresh();
  }
  async function archiveTemplate(templateId: string, active: boolean) {
    const response = await fetch(`/api/onboarding/templates/${templateId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !active }) });
    if (response.ok) void templates.refetch();
  }
  if (loading) return <div className="panel empty-state">Loading onboarding plans…</div>;
  return <>
    <div className="panel">
      <div className="panel-heading"><div><h2 className="panel-title">Onboarding plans</h2><p className="panel-subtitle">Open a plan to see its tasks, owners, deadlines, and progress.</p></div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>{role === "HR_ADMIN" && <><button className="button secondary" onClick={() => { setEditingTemplate(null); setDialog("template"); }}>New template</button><button className="button primary" onClick={() => setDialog("assign")}>Assign onboarding</button></>}{role === "HR_ADMIN" && <span className="status-pill status-completed">{rows.length} plans</span>}</div>
      </div>
      {rows.length === 0 ? <div className="empty-state">No onboarding plans are assigned in your scope.</div> : <div className="onboarding-plan-list">{rows.map((row) => <OnboardingPlanCard key={row.id} row={row} role={role} userId={userId} people={assignablePeople.data ?? []} busy={busy} notice={notice} updateTask={updateTask} />)}</div>}
      {role === "HR_ADMIN" && <div className="section-gap"><div className="panel-heading"><div><h3 className="panel-title">Checklist templates</h3><p className="panel-subtitle">{(templates.data ?? []).length} available templates</p></div></div>{(templates.data ?? []).map((template) => <div key={template.id} className="hire-row"><div><div className="hire-name">{template.name}</div><div className="hire-progress">{template.tasks.length} tasks · {template.description}</div></div><span className={`status-pill ${template.active ? "status-completed" : "status-closed"}`}>{template.active ? "Active" : "Archived"}</span><button aria-label={`Edit template ${template.name}`} className="button secondary" onClick={() => { setEditingTemplate(template); setDialog("template"); }}>Edit</button><button className="button secondary" onClick={() => void archiveTemplate(template.id, template.active)}>{template.active ? "Archive" : "Activate"}</button></div>)}</div>}
    </div>
    {dialog === "assign" && <AssignOnboardingDialog people={assignablePeople.data ?? []} activeEmployeeIds={new Set(rows.filter((row) => row.status === "IN_PROGRESS").map((row) => row.employee.id))} templates={(templates.data ?? []).filter((template) => template.active)} close={() => setDialog(null)} onDone={async () => { await queryClient.refetchQueries({ queryKey: ["onboarding"], type: "active" }); setDialog(null); void templates.refetch(); }} />}
    {dialog === "template" && <TemplateDialog initial={editingTemplate} close={() => setDialog(null)} onDone={() => { setDialog(null); setEditingTemplate(null); void templates.refetch(); }} />}
  </>;
}

function AssignOnboardingDialog({ people, activeEmployeeIds, templates, close, onDone }: { people: Person[]; activeEmployeeIds: Set<string>; templates: TemplateOption[]; close: () => void; onDone: () => Promise<void> }) {
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const eligiblePeople = people.filter((person) => person.role === "EMPLOYEE" && person.employmentStatus !== "INACTIVE" && !activeEmployeeIds.has(person.id));
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); const values = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/onboarding", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ employeeId: values.get("employeeId"), templateId: values.get("templateId"), startDate: values.get("startDate") }) });
      const body = await response.json(); if (!response.ok) { setError(body.error?.message ?? "Could not assign onboarding."); return; } await onDone();
    } catch { setError("The server could not be reached. Check your connection and try again."); }
    finally { setBusy(false); }
  }
  return <div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true"><div className="modal-header"><div><p className="eyebrow green">NEW HIRE</p><h2>Assign onboarding</h2></div><button className="button ghost" onClick={close}><X size={17} /></button></div><form className="modal-form" onSubmit={submit}>
    <label className="form-label">Employee<select className="select-field" style={{ height: 42 }} name="employeeId" required disabled={!eligiblePeople.length}><option value="">{eligiblePeople.length ? "Choose an employee" : "No employees available for onboarding"}</option>{eligiblePeople.map((person) => <option key={person.id} value={person.id}>{person.fullName} · {person.country}</option>)}</select></label>
    <label className="form-label">Checklist template<select className="select-field" style={{ height: 42 }} name="templateId" required disabled={!templates.length}>{templates.length ? templates.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.tasks.length} tasks)</option>) : <option value="">No active templates available</option>}</select></label>
    <label className="form-label">Start date<input className="field" type="date" name="startDate" defaultValue={new Date().toISOString().slice(0, 10)} required /></label>
    {error && <p className="form-error">{error}</p>}<div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}><button type="button" className="button secondary" onClick={close}>Cancel</button><button className="button primary" disabled={busy || !templates.length || !eligiblePeople.length}>{busy ? "Assigning…" : "Create plan"}</button></div>
  </form></section></div>;
}

function TemplateDialog({ initial, close, onDone }: { initial: TemplateOption | null; close: () => void; onDone: () => void }) {
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const defaults: TemplateTaskDraft[] = [
    { title: "Welcome and team introduction", description: "Meet your manager and team; review the first-week plan.", department: "People & Culture", ownerRole: "MANAGER", dueOffsetDays: 0, dependsOnIndex: null },
    { title: "Collect laptop and accessories", description: "Receive your laptop, charger, and security key.", department: "Engineering", ownerRole: "MANAGER", dueOffsetDays: 0, dependsOnIndex: null },
    { title: "Set up company accounts", description: "Activate email, identity verification, and collaboration tools.", department: "Engineering", ownerRole: "MANAGER", dueOffsetDays: 1, dependsOnIndex: 1 },
    { title: "Complete employment paperwork", description: "Review and submit required employment documents.", department: "People & Culture", ownerRole: "MANAGER", dueOffsetDays: 3, dependsOnIndex: null },
    { title: "Payroll and benefits enrollment", description: "Provide payroll information and review benefit options.", department: "Finance", ownerRole: "MANAGER", dueOffsetDays: 5, dependsOnIndex: 3 },
    { title: "Security and privacy training", description: "Complete the required data protection and security modules.", department: "Engineering", ownerRole: "MANAGER", dueOffsetDays: 5, dependsOnIndex: 3 },
    { title: "Role-specific access review", description: "Confirm access needed for your role with your manager.", department: "Engineering", ownerRole: "MANAGER", dueOffsetDays: 7, dependsOnIndex: 3 },
    { title: "Department introduction", description: "Meet partner teams and review how work is coordinated.", department: "Marketing", ownerRole: "MANAGER", dueOffsetDays: 7, dependsOnIndex: 1 },
    { title: "First-month check-in", description: "Discuss progress, questions, and support needs.", department: "People & Culture", ownerRole: "MANAGER", dueOffsetDays: 14, dependsOnIndex: 1 },
    { title: "30-day feedback", description: "Share feedback on your onboarding experience.", department: "People & Culture", ownerRole: "MANAGER", dueOffsetDays: 30, dependsOnIndex: 8 },
  ];
  const [tasks, setTasks] = useState<TemplateTaskDraft[]>(() => initial ? initial.tasks.map((task) => {
    const dependencyIndex = initial.tasks.findIndex((candidate) => candidate.id === task.dependsOnId);
    return { title: task.title, description: task.description, department: task.department, ownerRole: task.ownerRole, dueOffsetDays: task.dueOffsetDays, dependsOnIndex: dependencyIndex < 0 ? null : dependencyIndex };
  }) : defaults);
  function updateTask(index: number, field: keyof TemplateTaskDraft, value: string) {
    setTasks((current) => current.map((task, taskIndex) => taskIndex === index ? { ...task, [field]: field === "dueOffsetDays" ? Number(value) : field === "dependsOnIndex" ? (value === "" ? null : Number(value)) : value } : task));
  }
  function removeTask(index: number) {
    setTasks((current) => current.filter((_, taskIndex) => taskIndex !== index).map((task) => ({ ...task, dependsOnIndex: task.dependsOnIndex === index ? null : task.dependsOnIndex !== null && task.dependsOnIndex > index ? task.dependsOnIndex - 1 : task.dependsOnIndex })));
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setBusy(true); const values = new FormData(event.currentTarget);
    const payload = { name: values.get("name"), description: values.get("description"), tasks };
    const response = await fetch(initial ? `/api/onboarding/templates/${initial.id}` : "/api/onboarding/templates", { method: initial ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const body = await response.json(); setBusy(false); if (!response.ok) { setError(body.error?.message ?? "Could not save template."); return; } onDone();
  }
  return <div className="modal-backdrop"><section className="modal template-modal" role="dialog" aria-modal="true" aria-labelledby="template-dialog-title"><div className="modal-header"><div><p className="eyebrow green">CHECKLIST DESIGN</p><h2 id="template-dialog-title">{initial ? "Edit template" : "Create a template"}</h2></div><button type="button" className="button ghost" aria-label="Close" onClick={close}><X size={17} /></button></div><form className="modal-form" onSubmit={submit}>
    <label className="form-label">Template name<input className="field" name="name" minLength={3} maxLength={120} defaultValue={initial?.name ?? ""} required /></label><label className="form-label">Template description<textarea aria-label="Template description" className="textarea-field" style={{ minHeight: 65 }} name="description" maxLength={500} defaultValue={initial?.description ?? ""} /></label>
    <div className="template-task-list"><div className="template-task-heading"><div><h3 className="panel-title">Tasks</h3><p className="panel-subtitle">Set an owner role, department, relative deadline, and an optional earlier prerequisite.</p></div><span className="status-pill status-in_progress">{tasks.length}/12</span></div>
      {tasks.map((task, index) => <fieldset className="template-task" key={index}><legend>Task {index + 1}</legend><label className="form-label">Title<input className="field" aria-label={`Task ${index + 1} title`} value={task.title} onChange={(event) => updateTask(index, "title", event.target.value)} minLength={3} maxLength={120} required /></label><label className="form-label">Description<textarea className="textarea-field" aria-label={`Task ${index + 1} description`} value={task.description} onChange={(event) => updateTask(index, "description", event.target.value)} minLength={5} maxLength={1000} required /></label><div className="template-task-grid"><label className="form-label">Owning department<input className="field" aria-label={`Task ${index + 1} department`} value={task.department} onChange={(event) => updateTask(index, "department", event.target.value)} minLength={2} maxLength={80} required /></label><label className="form-label">Owner role<select className="select-field" aria-label={`Task ${index + 1} owner role`} value={task.ownerRole} onChange={(event) => updateTask(index, "ownerRole", event.target.value)}><option value="EMPLOYEE">Employee</option><option value="MANAGER">Manager</option><option value="HR_ADMIN">HR Admin</option></select></label><label className="form-label">Due after (days)<input className="field" aria-label={`Task ${index + 1} deadline offset`} type="number" min={0} max={365} value={task.dueOffsetDays} onChange={(event) => updateTask(index, "dueOffsetDays", event.target.value)} required /></label><label className="form-label">Depends on<select className="select-field" aria-label={`Task ${index + 1} dependency`} value={task.dependsOnIndex ?? ""} onChange={(event) => updateTask(index, "dependsOnIndex", event.target.value)}><option value="">No dependency</option>{tasks.slice(0, index).map((earlier, earlierIndex) => <option key={earlierIndex} value={earlierIndex}>Task {earlierIndex + 1}: {earlier.title}</option>)}</select></label></div>{tasks.length > 8 && <button type="button" className="button ghost" onClick={() => removeTask(index)}>Remove task</button>}</fieldset>)}
      <button type="button" className="button secondary" disabled={tasks.length >= 12} onClick={() => setTasks((current) => [...current, { title: "", description: "", department: "People & Culture", ownerRole: "MANAGER", dueOffsetDays: 0, dependsOnIndex: null }])}>Add task</button>
    </div>
    {error && <p className="form-error">{error}</p>}<div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}><button type="button" className="button secondary" onClick={close}>Cancel</button><button className="button primary" disabled={busy}>{busy ? "Saving?" : initial ? "Save changes" : "Create template"}</button></div>
  </form></section></div>;
}
function PeopleView({ rows, loading, role, refresh }: { rows: Person[]; loading: boolean; role: string; refresh: () => void }) {
  const [search, setSearch] = useState(""); const [country, setCountry] = useState("ALL"); const [department, setDepartment] = useState("ALL"); const [personRole, setPersonRole] = useState("ALL"); const [employmentStatus, setEmploymentStatus] = useState("ALL"); const [creating, setCreating] = useState(false);
  async function updateStatus(id: string, employmentStatus: string) { const response = await fetch(`/api/users/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ employmentStatus }) }); if (response.ok) refresh(); }
  const filtered = rows.filter((p) => p.fullName.toLowerCase().includes(search.toLowerCase()) && (country === "ALL" || p.country === country) && (department === "ALL" || p.department === department) && (personRole === "ALL" || p.role === personRole) && (employmentStatus === "ALL" || p.employmentStatus === employmentStatus));
  return <><section className="panel"><div className="panel-heading"><div><h2 className="panel-title">{role === "MANAGER" ? "My direct reports" : "Employee directory"}</h2><p className="panel-subtitle">Search employees and filter by country, department, role, or status.</p></div><div style={{ display: "flex", gap: 8, alignItems: "center" }}>{role === "HR_ADMIN" && <button className="button primary" onClick={() => setCreating(true)}>Add employee</button>}<span className="status-pill status-in_progress">{filtered.length} people</span></div></div><div className="request-toolbar"><input className="field" style={{ maxWidth: 240 }} placeholder="Search name…" value={search} onChange={(e) => setSearch(e.target.value)} /><select aria-label="Country" className="select-field" value={country} onChange={(e) => setCountry(e.target.value)}><option value="ALL">All countries</option>{["Bangladesh", "Malaysia", "Sri Lanka", "Cyprus"].map((c) => <option key={c}>{c}</option>)}</select>{role === "HR_ADMIN" && <><select aria-label="Department" className="select-field" value={department} onChange={(e) => setDepartment(e.target.value)}><option value="ALL">All departments</option>{["Engineering", "People & Culture", "Finance", "Marketing"].map((d) => <option key={d}>{d}</option>)}</select><select aria-label="Role" className="select-field" value={personRole} onChange={(e) => setPersonRole(e.target.value)}><option value="ALL">All roles</option>{["EMPLOYEE", "MANAGER", "HR_ADMIN"].map((r) => <option key={r} value={r}>{cap(r)}</option>)}</select><select aria-label="Employment status" className="select-field" value={employmentStatus} onChange={(e) => setEmploymentStatus(e.target.value)}><option value="ALL">All statuses</option>{["ACTIVE", "ON_PROBATION", "ON_NOTICE", "INACTIVE"].map((s) => <option key={s}>{s}</option>)}</select></>}</div><div className="table-wrap"><table className="request-table"><thead><tr><th>Employee</th><th>Department</th><th>Country</th><th>Role</th><th>Status</th></tr></thead><tbody>{loading ? <tr><td colSpan={5} className="empty-state">Loading directory…</td></tr> : filtered.map((p) => <tr key={p.id}><td className="request-title">{p.fullName}<div className="request-meta">{p.employeeNumber} · {p.email}</div></td><td>{p.department}</td><td>{p.country}</td><td>{cap(p.role)}</td><td>{role === "HR_ADMIN" ? <select aria-label={`Employment status for ${p.fullName}`} className="select-field" value={p.employmentStatus} onChange={(e) => void updateStatus(p.id, e.target.value)}>{["ACTIVE", "ON_PROBATION", "ON_NOTICE", "INACTIVE"].map((s) => <option key={s}>{s}</option>)}</select> : <span className="status-pill status-in_progress">{cap(p.employmentStatus)}</span>}</td></tr>)}</tbody></table></div></section>{creating && <EmployeeDialog managers={rows.filter((p) => p.role === "MANAGER")} close={() => setCreating(false)} onDone={() => { setCreating(false); refresh(); }} />}</>;
}

function EmployeeDialog({ managers, close, onDone }: { managers: Person[]; close: () => void; onDone: () => void }) {
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); const values = new FormData(event.currentTarget);
    const response = await fetch("/api/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fullName: values.get("fullName"), email: values.get("email"), employeeNumber: values.get("employeeNumber"), country: values.get("country"), department: values.get("department"), role: values.get("role"), employmentStatus: "ACTIVE", joiningDate: values.get("joiningDate"), managerId: values.get("managerId") || null, password: values.get("password") }) });
    const body = await response.json(); setBusy(false); if (!response.ok) { setError(body.error?.message ?? "Could not create employee."); return; } onDone();
  }
  return <div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true"><div className="modal-header"><div><p className="eyebrow green">EMPLOYEE DIRECTORY</p><h2>Add an employee</h2></div><button className="button ghost" onClick={close}><X size={17} /></button></div><form className="modal-form" onSubmit={submit}>
    <label className="form-label">Full name<input className="field" name="fullName" minLength={2} maxLength={100} required /></label><div className="two-col"><label className="form-label">Work email<input className="field" name="email" type="email" required /></label><label className="form-label">Employee ID<input className="field" name="employeeNumber" minLength={3} maxLength={30} required /></label></div>
    <div className="two-col"><label className="form-label">Country<select className="select-field" style={{ height: 42 }} name="country">{["Bangladesh", "Malaysia", "Sri Lanka", "Cyprus"].map((c) => <option key={c}>{c}</option>)}</select></label><label className="form-label">Department<select className="select-field" style={{ height: 42 }} name="department">{["Engineering", "People & Culture", "Finance", "Marketing"].map((d) => <option key={d}>{d}</option>)}</select></label></div>
    <div className="two-col"><label className="form-label">Role<select className="select-field" style={{ height: 42 }} name="role"><option value="EMPLOYEE">Employee</option><option value="MANAGER">Manager</option></select></label><label className="form-label">Manager<select className="select-field" style={{ height: 42 }} name="managerId"><option value="">No manager</option>{managers.map((m) => <option key={m.id} value={m.id}>{m.fullName}</option>)}</select></label></div>
    <div className="two-col"><label className="form-label">Joining date<input className="field" type="date" name="joiningDate" defaultValue={new Date().toISOString().slice(0, 10)} required /></label><label className="form-label">Temporary password<input className="field" type="password" name="password" minLength={12} autoComplete="new-password" required /></label></div>
    {error && <p className="form-error">{error}</p>}<div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}><button type="button" className="button secondary" onClick={close}>Cancel</button><button className="button primary" disabled={busy}>{busy ? "Saving…" : "Add employee"}</button></div>
  </form></section></div>;
}

function ProfileDialog({ user, close }: { user: CurrentUser; close: () => void }) {
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && close()}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="profile-title"><div className="modal-header"><div><p className="eyebrow green">YOUR ACCOUNT</p><h2 id="profile-title">My profile</h2></div><button className="button ghost" onClick={close}><X size={17} /></button></div><div className="country-list">{[["Full name", user.fullName], ["Work email", user.email], ["Employee ID", user.employeeNumber], ["Role", cap(user.role)], ["Department", user.department], ["Country", user.country]].map(([label, value]) => <div className="hire-row" key={label}><span className="muted">{label}</span><strong className="hire-name">{value}</strong></div>)}</div><p className="login-help"><CircleHelp size={14} />Contact HR Admin to update your employee record.</p></section></div>;
}

type SmartQueryRow = Record<string, unknown>;

function AnswerContent({ answer }: { answer: string }) {
  return <div className="smart-query-answer-content">{answer.split(/\r?\n/).filter((line) => line.trim()).map((line, index) => {
    const clean = line.replace(/^#{1,3}\s*/, "").replace(/\*\*(.*?)\*\*/g, "$1").trim();
    if (line.trim().startsWith("- ") || line.trim().startsWith("• ")) return <div className="answer-bullet" key={index}><span />{clean.replace(/^[-•]\s*/, "")}</div>;
    if (/^[^.!?]{2,60}:$/.test(clean) || line.trim().startsWith("#")) return <h3 className="answer-heading" key={index}>{clean.replace(/:$/, "")}</h3>;
    return <p key={index}>{clean}</p>;
  })}</div>;
}

function SmartQuery() {
  const examples = ["How many urgent requests are still open in Bangladesh?", "Which hires have overdue onboarding tasks?", "Which country has the highest onboarding completion rate?", "Which department has the most active employees?"];
  const [question, setQuestion] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [answer, setAnswer] = useState<{ answer: string; summary: string; results: SmartQueryRow[] | SmartQueryRow; sources: string[]; provider: string; notice?: string } | null>(null);
  async function ask(e: FormEvent) {
    e.preventDefault(); if (!question.trim()) return; setBusy(true); setError(""); setAnswer(null);
    try {
      const response = await fetch("/api/ai/query", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question }) });
      const body = await response.json();
      if (!response.ok) { setError(body.error?.message ?? "Could not answer that question."); return; }
      setAnswer(body.data);
    } catch { setError("The AI assistant could not be reached. No answer was generated; please try again shortly."); }
    finally { setBusy(false); }
  }
  const resultRows = answer ? (Array.isArray(answer.results) ? answer.results : [answer.results]).filter((value): value is SmartQueryRow => Boolean(value) && typeof value === "object") : [];
  const resultColumns = [...new Set(resultRows.flatMap((row) => Object.keys(row)))];
  const showValue = (value: unknown) => value === null || value === undefined ? "—" : typeof value === "object" ? JSON.stringify(value) : String(value);
  const columnLabel = (key: string) => key.replaceAll(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
  const renderResultValue = (column: string, value: unknown): ReactNode => {
    if (value === null || value === undefined) return <span className="result-empty">—</span>;
    if (typeof value === "object" && !Array.isArray(value)) return <div className="result-object">{Object.entries(value).map(([key, nestedValue]) => <span key={key}><b>{columnLabel(key)}:</b> {showValue(nestedValue)}</span>)}</div>;
    const text = showValue(value);
    const normalized = text.toLowerCase();
    if (column.toLowerCase().includes("priority")) return <span className={`priority priority-${normalized}`}>{text}</span>;
    if (column.toLowerCase().includes("status")) return <span className={`status-pill status-${normalized.replaceAll(" ", "_")}`}>{columnLabel(text)}</span>;
    if (column.toLowerCase().includes("date") && !Number.isNaN(Date.parse(text))) return dateLabel(text);
    return text;
  };
  return <div className="content-grid"><section className="panel smart-query-panel" style={{ gridColumn: "1 / -1", maxWidth: 1040 }}><div className="panel-heading"><div><div className="stat-icon" style={{ display: "inline-grid", marginBottom: 13 }}><Bot size={17} /></div><h2 className="panel-title">Ask your people data</h2><p className="panel-subtitle">Ask in your own words about current employees, service requests, onboarding progress, deadlines, or task owners. Answers use the latest database records.</p></div><span className="status-pill status-completed">HR Admin only</span></div><form onSubmit={ask} className="modal-form"><label className="form-label">Your question<textarea className="textarea-field" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="For example: Which requests are still open in Bangladesh?" maxLength={500} /></label><div className="smart-query-examples">{examples.map((example) => <button type="button" key={example} className="button secondary" onClick={() => setQuestion(example)}>{example}</button>)}</div>{error && <p className="form-error">{error}</p>}<div><button className="button primary" disabled={busy || question.trim().length < 5}><Sparkles size={15} />{busy ? "Checking current records…" : "Ask assistant"}</button></div></form>{answer && <div className="smart-query-answer"><div className="insight-kicker"><Bot size={14} />AI answer · Groq</div><AnswerContent answer={answer.answer} />{resultRows.length > 0 && resultColumns.length > 0 && <div className="smart-query-data"><div className="smart-query-data-heading"><div><h3>Verified live data</h3><p>These rows come directly from the current database.</p></div><span className="status-pill status-in_progress">{resultRows.length} {resultRows.length === 1 ? "row" : "rows"}</span></div><div className="table-wrap"><table className="request-table"><thead><tr>{resultColumns.map((column) => <th key={column}>{columnLabel(column)}</th>)}</tr></thead><tbody>{resultRows.map((row, index) => <tr key={index}>{resultColumns.map((column) => <td key={column}>{renderResultValue(column, row[column])}</td>)}</tr>)}</tbody></table></div></div>}<p className="request-meta">Source: {answer.sources.join(" ")}</p></div>}<p className="login-help"><CircleHelp size={14} />For the clearest answer, include a person, country, department, request status, or priority.</p></section></div>;
}

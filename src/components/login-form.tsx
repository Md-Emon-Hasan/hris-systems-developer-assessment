"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Building2, CircleHelp, LockKeyhole } from "lucide-react";

export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("hr.admin@northstar.example");
  const [password, setPassword] = useState("Welcome2026!");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setBusy(true);
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "Unable to sign in.");
      router.push("/");
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to sign in."); setBusy(false); }
  }

  return <main className="login-shell">
    <section className="login-panel">
      <div className="brand-mark"><Building2 size={20} strokeWidth={2.4} /></div>
      <p className="eyebrow">NORTHSTAR PEOPLE</p>
      <h1>Good work<br />starts here.</h1>
      <p className="login-copy">A clearer way to get support and help new teammates feel at home.</p>
      <div className="login-proof"><span className="proof-dot" /> Supporting teams across four countries</div>
    </section>
    <section className="login-form-side">
      <div className="login-form-wrap">
        <p className="eyebrow muted">YOUR WORKSPACE</p>
        <h2>Welcome back</h2>
        <p className="muted">Sign in to your Northstar account.</p>
        <form onSubmit={submit} className="login-form">
          <label>Email address<input autoComplete="username" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
          <label>Password<input autoComplete="current-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
          {error && <div className="form-error" role="alert">{error}</div>}
          <button className="button primary full" disabled={busy}>{busy ? "Signing in…" : "Sign in"}<ArrowRight size={17} /></button>
        </form>
        <div className="demo-box"><div className="demo-head"><LockKeyhole size={16} /><strong>Assessment access</strong></div><p>Demo password: <code>Welcome2026!</code></p><p>Admin: <code>hr.admin@northstar.example</code></p><p>Manager: <code>manager1@northstar.example</code></p><p>Employee: <code>employee010@northstar.example</code></p></div>
        <p className="login-help"><CircleHelp size={14} /> Need access? Contact People &amp; Culture.</p>
      </div>
    </section>
  </main>;
}

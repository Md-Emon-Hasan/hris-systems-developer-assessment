"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ArrowRight, CircleHelp, LockKeyhole } from "lucide-react";

export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("mira.chowdhury@nextventures.example");
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
      <Image className="login-brand-logo" src="/next-ventures-logo.svg" alt="NEXT Ventures" width={118} height={40} priority />
      <p className="eyebrow">PEOPLE OPERATIONS</p>
      <h1>Changing lives<br />through vision<br />&amp; innovation.</h1>
      <p className="login-copy">A simple place for our people to get support, manage onboarding, and keep work moving.</p>
      <div className="login-proof"><span className="proof-dot" /> One workspace for teams across four countries</div>
    </section>
    <section className="login-form-side">
      <div className="login-form-wrap">
        <p className="eyebrow muted">NEXT VENTURES · PEOPLE</p>
        <h2>Welcome back</h2>
        <p className="muted">Sign in to your People Operations workspace.</p>
        <form onSubmit={submit} className="login-form">
          <label>Email address<input autoComplete="username" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
          <label>Password<input autoComplete="current-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
          {error && <div className="form-error" role="alert">{error}</div>}
          <button className="button primary full" disabled={busy}>{busy ? "Signing in…" : "Sign in"}<ArrowRight size={17} /></button>
        </form>
        <div className="demo-box"><div className="demo-head"><LockKeyhole size={16} /><strong>Assessment demo accounts</strong></div><p>Shared demo password: <code>Welcome2026!</code></p><p>HR Admin: <code>mira.chowdhury@nextventures.example</code></p><p>Manager: <code>aisha.rahman@nextventures.example</code></p><p>Employee: <code>nur.aisyah@nextventures.example</code></p></div>
        <p className="login-help"><CircleHelp size={14} /> Need an account? Contact People &amp; Culture.</p>
      </div>
    </section>
  </main>;
}

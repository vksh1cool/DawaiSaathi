"use client";

import { FormEvent, useState } from "react";

export function UnlockForm({ nextPath }: { nextPath: string }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/access/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!response.ok) throw new Error("That access code is not correct.");
      window.location.assign(nextPath);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Please try again.");
      setPassword("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-8 space-y-5">
      <label className="block text-left text-base font-semibold text-slate-900" htmlFor="access-code">
        Access code <span className="font-normal text-slate-600">/ प्रवेश कोड</span>
      </label>
      <input
        id="access-code"
        name="access-code"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        className="min-h-14 w-full rounded-2xl border border-slate-300 bg-white px-4 text-lg text-slate-900 shadow-sm outline-none transition focus:border-teal-700 focus:ring-4 focus:ring-teal-100"
        required
        autoFocus
      />
      {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-left text-sm text-red-800" role="alert">{error}</p> : null}
      <button
        type="submit"
        disabled={loading}
        className="min-h-14 w-full rounded-2xl bg-teal-700 px-5 text-lg font-bold text-white shadow-sm transition hover:bg-teal-800 focus:outline-none focus:ring-4 focus:ring-teal-200 disabled:cursor-wait disabled:opacity-60"
      >
        {loading ? "Checking…" : "Continue / आगे बढ़ें"}
      </button>
    </form>
  );
}

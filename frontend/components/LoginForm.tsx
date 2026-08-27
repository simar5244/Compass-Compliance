"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { login } from "@/lib/auth";

const fieldClass =
  "h-11 rounded-[3px] border border-[#e5e5e5] bg-white px-3 text-sm text-black shadow-none outline-none placeholder:text-[#9ca3af] focus-visible:border-black focus-visible:ring-0";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError("Invalid email or password.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email" className="text-[#6b7280]">
          Email address
        </Label>
        <Input
          id="email"
          type="text"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={fieldClass}
          placeholder="admin"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password" className="text-[#6b7280]">
          Password
        </Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={fieldClass}
          placeholder="••••••••"
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Button
        type="submit"
        disabled={submitting}
        className="h-11 w-full rounded-[3px] border-0 bg-black text-sm font-medium text-white shadow-none hover:bg-[#262626] focus-visible:ring-0 focus-visible:ring-offset-0 disabled:opacity-60"
      >
        {submitting ? "Logging in…" : "Continue"}
      </Button>
    </form>
  );
}

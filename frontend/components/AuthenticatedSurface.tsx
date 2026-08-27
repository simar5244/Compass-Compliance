"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CompassLoader } from "@/components/CompassLoader";
import { getMe } from "@/lib/auth";

export function AuthenticatedSurface({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let active = true;
    getMe()
      .then(() => { if (active) setAllowed(true); })
      .catch(() => { if (active) router.replace("/login"); });
    return () => { active = false; };
  }, [router]);

  if (!allowed) {
    return (
      <main className="light-theme flex min-h-screen items-center justify-center bg-white">
        <CompassLoader label="Loading…" size="lg" />
      </main>
    );
  }

  return children;
}

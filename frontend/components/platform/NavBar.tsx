"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Globe } from "lucide-react";
import type { Me } from "@/lib/auth";
import { CompassMark } from "@/components/CompassMark";
import { ProfileDrawer } from "@/components/platform/ProfileDrawer";

/** Slim top bar: Websites link + profile. Search and Inspect live in the site sidebar. */
export function NavBar({ user, showLogo = false }: { user: Me; showLogo?: boolean }) {
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const initials = (user.name || user.email).slice(0, 2).toUpperCase();

  return (
    <>
      <header className="flex h-14 flex-none items-center border-b border-[var(--border-soft)] bg-black px-0 text-white">
        {showLogo && (
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="grid h-14 w-[72px] shrink-0 place-items-center hover:bg-white/10"
            aria-label="Texas Tech — go to websites"
          >
            <CompassMark size={28} decorative />
          </button>
        )}
        <div className="flex w-full items-center justify-end gap-1 px-4">
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium hover:bg-white/10"
          >
            <Globe aria-hidden className="h-[18px] w-[18px]" />
            <span className="hidden sm:inline">Websites</span>
          </button>
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open profile menu"
            aria-haspopup="dialog"
            className="ml-1 grid h-9 w-9 place-items-center rounded-[3px] border border-white/30 bg-white/10 text-xs font-semibold text-white"
          >
            {initials}
          </button>
        </div>
      </header>

      <ProfileDrawer user={user} open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  );
}

"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CompassLoader } from "@/components/CompassLoader";
import { CompassMark } from "@/components/CompassMark";
import { AppSidebarTools } from "@/components/platform/AppSidebarTools";
import { getMe, type Me } from "@/lib/auth";
import { NavBar } from "@/components/platform/NavBar";

const UserContext = createContext<Me | null>(null);
export const useUser = () => useContext(UserContext);

/** Client auth gate + chrome for every platform screen. Redirects to /login on
 * 401 so unauthenticated users never see platform data. */
export function PlatformShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() || "";
  const onSite = pathname.includes("/sites/");
  const onDashboard = pathname === "/dashboard";
  const [user, setUser] = useState<Me | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "denied">("loading");

  useEffect(() => {
    getMe()
      .then((me) => { setUser(me); setState("ready"); })
      .catch(() => { setState("denied"); router.replace("/login"); });
  }, [router]);

  if (state === "loading") {
    return (
      <div className="platform flex min-h-screen items-center justify-center">
        <CompassLoader label="Loading…" size="lg" />
      </div>
    );
  }
  if (state === "denied" || !user) return null;

  return (
    <UserContext.Provider value={user}>
      {onSite ? (
        children
      ) : onDashboard ? (
        <div className="platform flex min-h-screen flex-col">
          <NavBar user={user} showLogo />
          <div className="flex-1">{children}</div>
        </div>
      ) : (
        <div className="platform flex min-h-screen">
          <aside className="sticky top-0 z-40 flex h-screen w-[72px] shrink-0 flex-col bg-black text-white">
            <button
              type="button"
              onClick={() => router.push("/dashboard")}
              className="grid h-14 w-[72px] shrink-0 place-items-center hover:bg-white/10"
              aria-label="Texas Tech — go to websites"
            >
              <CompassMark size={28} decorative />
            </button>
            <div className="flex-1" />
            <AppSidebarTools expanded={false} />
          </aside>
          <div className="flex min-h-screen min-w-0 flex-1 flex-col">
            <NavBar user={user} />
            <div className="flex-1">{children}</div>
          </div>
        </div>
      )}
    </UserContext.Provider>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { CompassLogo } from "@/components/CompassLogo";
import { LoginForm } from "@/components/LoginForm";

export const metadata: Metadata = {
  title: "Compass | Log in",
  description: "Log in to Compass",
};

export default function LoginPage() {
  return (
    <main className="light-theme flex min-h-screen flex-col items-center justify-center bg-white px-6 py-16 text-black">
      <div className="w-full max-w-md rounded-[3px] border border-[#e5e5e5] bg-white px-10 py-10">
        <div className="mb-8 flex flex-col items-center gap-6 text-center">
          <CompassLogo size="lg" />
          <div className="flex flex-col gap-1">
            <h1 className="text-xl font-semibold text-black">Welcome back</h1>
            <p className="text-sm text-[#6b7280]">Please log in to continue</p>
          </div>
        </div>

        <LoginForm />
      </div>

      <p className="mt-8 text-sm text-[#6b7280]">
        Trouble logging in?{" "}
        <Link href="#" className="font-semibold text-black underline underline-offset-2">
          Contact support
        </Link>
      </p>
    </main>
  );
}

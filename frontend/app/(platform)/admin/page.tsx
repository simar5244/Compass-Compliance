"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  adminAssign, adminCreateUser, adminDeleteUser, adminListUsers,
  adminResetPassword, adminSetRole, adminUnassign, getDashboard,
  type AdminUser, type SiteCard,
} from "@/lib/auth";
import { useUser } from "@/components/platform/PlatformShell";
import { Modal, fieldCls, fieldStyle } from "@/components/platform/Modal";
import { AddSiteForm } from "@/components/platform/AddSiteForm";

const PAGE_SIZE = 10;

const btnGhost =
  "rounded-[3px] border border-[#e5e5e5] bg-white px-3 py-2 text-sm font-medium text-black transition-colors hover:bg-[#f5f5f5]";
const btnPrimary =
  "rounded-[3px] bg-black px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#262626]";
const btnTiny =
  "rounded-[3px] border border-[#e5e5e5] bg-white px-3 py-1.5 text-xs font-medium text-black hover:bg-[#f5f5f5]";

export default function AdminPage() {
  const user = useUser();
  const router = useRouter();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [sites, setSites] = useState<SiteCard[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [showAddSite, setShowAddSite] = useState(false);
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    try {
      const [u, d] = await Promise.all([adminListUsers(), getDashboard()]);
      setUsers(u.users); setSites(d.sites);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to load"); }
  }, []);

  useEffect(() => {
    if (user && user.role !== "admin") { router.replace("/dashboard"); return; }
    load();
  }, [user, router, load]);

  const adminCount = useMemo(() => users.filter((u) => u.role === "admin").length, [users]);
  const pageCount = Math.max(1, Math.ceil(users.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const visible = users.slice((safePage - 1) * PAGE_SIZE, (safePage - 1) * PAGE_SIZE + PAGE_SIZE);

  useEffect(() => {
    setPage((p) => Math.min(p, pageCount));
  }, [pageCount]);

  if (user && user.role !== "admin") return null;

  return (
    <div className="min-h-screen bg-white text-black">
      <section className="border-b border-[#e5e5e5] bg-white px-6 py-10 lg:px-12 lg:py-14">
        <div className="mx-auto max-w-5xl">
          <p className="text-[11px] uppercase tracking-[0.18em] text-[#737373]">Workspace</p>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-[48px] font-semibold leading-[0.92] tracking-[-0.05em] lg:text-[64px]">Admin</h1>
              <p className="mt-4 max-w-xl text-sm text-[#737373]">Manage users, roles, sites, and assignments.</p>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowAddSite(true)} className={btnGhost}>+ Add site</button>
              <button type="button" onClick={() => setShowCreateUser(true)} className={btnPrimary}>+ Create user</button>
            </div>
          </div>

          <div className="mt-10 grid grid-cols-3 gap-3 rounded-[3px] border border-[#e5e5e5] p-5">
            <div>
              <p className="text-[11px] uppercase tracking-[0.14em] text-[#737373]">Users</p>
              <p className="mt-1 text-3xl font-semibold tracking-tight">{users.length}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.14em] text-[#737373]">Admins</p>
              <p className="mt-1 text-3xl font-semibold tracking-tight">{adminCount}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.14em] text-[#737373]">Sites</p>
              <p className="mt-1 text-3xl font-semibold tracking-tight">{sites.length}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-10 lg:px-12">
        {error && <p className="mb-4 text-sm text-[#525252]">{error}</p>}

        <div className="mb-3 flex items-baseline justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#737373]">Users</p>
          <p className="text-sm text-[#737373]">
            {users.length === 0 ? "0" : `${(safePage - 1) * PAGE_SIZE + 1}–${Math.min(safePage * PAGE_SIZE, users.length)} of ${users.length}`}
          </p>
        </div>

        {users.length === 0 ? (
          <div className="rounded-[3px] border border-[#e5e5e5] bg-[#fafafa] px-5 py-10 text-sm text-[#737373]">
            No users yet — create one to get started.
          </div>
        ) : (
          <div className="overflow-hidden rounded-[3px] border border-[#e5e5e5] bg-white">
            {visible.map((u) => (
              <UserCard
                key={u.id}
                u={u}
                sites={sites}
                me={user?.id ?? ""}
                open={expanded === u.id}
                onToggle={() => setExpanded(expanded === u.id ? null : u.id)}
                reload={load}
              />
            ))}
          </div>
        )}

        {users.length > PAGE_SIZE && (
          <div className="mt-4 flex items-center justify-end gap-2 text-sm">
            <button
              type="button"
              onClick={() => { setPage((p) => Math.max(1, p - 1)); setExpanded(null); }}
              disabled={safePage <= 1}
              className="grid size-9 place-items-center rounded-[3px] border border-[#e5e5e5] disabled:opacity-30"
              aria-label="Previous page"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="min-w-[7rem] text-center text-[#525252]">
              Page {safePage} of {pageCount}
            </span>
            <button
              type="button"
              onClick={() => { setPage((p) => Math.min(pageCount, p + 1)); setExpanded(null); }}
              disabled={safePage >= pageCount}
              className="grid size-9 place-items-center rounded-[3px] border border-[#e5e5e5] disabled:opacity-30"
              aria-label="Next page"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        )}
      </section>

      <Modal open={showCreateUser} onClose={() => setShowCreateUser(false)} title="Create user">
        <CreateUserForm onDone={() => { setShowCreateUser(false); load(); }} />
      </Modal>
      <Modal open={showAddSite} onClose={() => setShowAddSite(false)} title="Add a site to monitor">
        <AddSiteForm onDone={() => { setShowAddSite(false); load(); }} />
      </Modal>
    </div>
  );
}

function UserCard({ u, sites, me, open, onToggle, reload }: {
  u: AdminUser; sites: SiteCard[]; me: string; open: boolean; onToggle: () => void; reload: () => void;
}) {
  const isMe = u.id === me;
  const initials = (u.name || u.email).slice(0, 2).toUpperCase();
  const [sitePage, setSitePage] = useState(1);
  const sitePageCount = Math.max(1, Math.ceil(sites.length / PAGE_SIZE));
  const safeSitePage = Math.min(sitePage, sitePageCount);
  const visibleSites = sites.slice((safeSitePage - 1) * PAGE_SIZE, (safeSitePage - 1) * PAGE_SIZE + PAGE_SIZE);

  async function toggleAssign(siteId: string) {
    if (u.assigned_site_ids.includes(siteId)) await adminUnassign(u.id, siteId);
    else await adminAssign(u.id, siteId);
    reload();
  }
  return (
    <div className="border-b border-[#e5e5e5] last:border-b-0">
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-[#fafafa]">
        <span className="grid h-9 w-9 flex-none place-items-center rounded-[3px] bg-black text-[11px] font-bold text-white">{initials}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-semibold text-black">{u.name || u.email}</span>
            <span className="rounded-[3px] bg-[#f5f5f5] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#525252]">{u.role}</span>
            {isMe && <span className="text-[10px] text-[#737373]">(you)</span>}
          </div>
          <div className="truncate text-xs text-[#737373]">{u.email} · {u.assigned_site_ids.length} site{u.assigned_site_ids.length === 1 ? "" : "s"}</div>
        </div>
        <span aria-hidden className="text-[#737373]">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className="border-t border-[#e5e5e5] bg-white px-4 py-4">
          <div className="mb-4 flex flex-wrap gap-2">
            <button type="button" onClick={async () => { await adminSetRole(u.id, u.role === "admin" ? "user" : "admin"); reload(); }}
              className={btnTiny}>
              Make {u.role === "admin" ? "user" : "admin"}
            </button>
            <button type="button" onClick={async () => { const pw = prompt("New password (min 6 chars):"); if (pw && pw.length >= 6) { await adminResetPassword(u.id, pw); alert("Password reset. New password: " + pw); } }}
              className={btnTiny}>Reset password</button>
            {!isMe && (
              <button type="button" onClick={async () => { if (confirm(`Delete ${u.email}?`)) { await adminDeleteUser(u.id); reload(); } }}
                className={btnTiny}>Delete user</button>
            )}
          </div>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#737373]">Assigned sites</div>
          {sites.length === 0 ? <div className="text-xs text-[#737373]">No sites yet — add one.</div> : (
            <>
              <div className="flex flex-wrap gap-2">
                {visibleSites.map((s) => {
                  const on = u.assigned_site_ids.includes(s.id);
                  return (
                    <button
                      type="button"
                      key={s.id}
                      onClick={() => toggleAssign(s.id)}
                      className="rounded-[3px] border px-3 py-1.5 text-xs"
                      style={{
                        borderColor: on ? "black" : "#e5e5e5",
                        color: on ? "black" : "#737373",
                        fontWeight: on ? 600 : 400,
                        backgroundColor: on ? "#f5f5f5" : "transparent",
                      }}
                    >
                      {on ? "✓ " : "+ "}{s.name}
                    </button>
                  );
                })}
              </div>
              {sites.length > PAGE_SIZE && (
                <div className="mt-3 flex items-center justify-end gap-2 text-sm">
                  <button
                    type="button"
                    onClick={() => setSitePage((p) => Math.max(1, p - 1))}
                    disabled={safeSitePage <= 1}
                    className="grid size-8 place-items-center rounded-[3px] border border-[#e5e5e5] disabled:opacity-30"
                    aria-label="Previous sites page"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <span className="min-w-[6rem] text-center text-xs text-[#525252]">
                    {safeSitePage} / {sitePageCount}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSitePage((p) => Math.min(sitePageCount, p + 1))}
                    disabled={safeSitePage >= sitePageCount}
                    className="grid size-8 place-items-center rounded-[3px] border border-[#e5e5e5] disabled:opacity-30"
                    aria-label="Next sites page"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function CreateUserForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("user");
  const [err, setErr] = useState<string | null>(null);
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(null);
    if (password.length < 6) return setErr("Password must be at least 6 characters.");
    try {
      await adminCreateUser(email.trim(), password, role, name.trim());
      setCreated({ email: email.trim(), password });
    } catch (e2) { setErr(e2 instanceof Error ? e2.message : "Could not create user"); }
  }

  if (created) {
    const creds = `Email: ${created.email}\nPassword: ${created.password}`;
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-[3px] border border-[#e5e5e5] bg-[#f5f5f5] p-4 text-sm">
          <div className="mb-2 font-semibold text-black">User created</div>
          <div className="font-mono text-xs text-[#525252]"><div>Email: {created.email}</div><div>Password: {created.password}</div></div>
        </div>
        <button type="button" onClick={async () => { await navigator.clipboard.writeText(creds); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
          className={`${btnPrimary} py-2`}>
          {copied ? "Copied!" : "Copy credentials"}
        </button>
        <button type="button" onClick={onDone} className={`${btnGhost} py-2`}>Done</button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <label className="text-xs font-medium text-[#737373]">Name<input value={name} onChange={(e) => setName(e.target.value)} className={`mt-1 ${fieldCls} !rounded-[3px]`} style={fieldStyle} placeholder="Jane Doe" /></label>
      <label className="text-xs font-medium text-[#737373]">Email<input value={email} onChange={(e) => setEmail(e.target.value)} required className={`mt-1 ${fieldCls} !rounded-[3px]`} style={fieldStyle} placeholder="jane@example.com" /></label>
      <label className="text-xs font-medium text-[#737373]">Password<input value={password} onChange={(e) => setPassword(e.target.value)} required type="text" className={`mt-1 ${fieldCls} !rounded-[3px]`} style={fieldStyle} placeholder="min 6 characters" /></label>
      <label className="text-xs font-medium text-[#737373]">Role
        <select value={role} onChange={(e) => setRole(e.target.value)} className={`mt-1 ${fieldCls} !rounded-[3px]`} style={fieldStyle}>
          <option value="user">User</option><option value="admin">Admin</option>
        </select>
      </label>
      {err && <p className="text-xs text-[#525252]">{err}</p>}
      <button type="submit" className={`mt-1 ${btnPrimary} py-2`}>Create user</button>
    </form>
  );
}

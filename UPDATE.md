# Local / pre-prod tracking

**Purpose:** Log every file or change added for local development that must **not** ship to production. Review this file before every push.

---

## Pre-push cleanup (2026-08-27 — Azure DevOps)

**Removed from repo (do not re-add):**

| Item | Location | Notes |
|------|----------|--------|
| Synthetic UI seed script | `backend/scripts/seed_demo_ui.py` | **Deleted** — local-only fake scans/issues |

**Never commit / exclude from push:**

| Item | Location | Notes |
|------|----------|--------|
| Root env | `.env` | Local compose secrets — **gitignored** |
| Docker override | `docker-compose.override.yml` | Local dev API on `127.0.0.1:8001` — **gitignored** |
| Node / build output | `frontend/node_modules/`, `frontend/.next/` | Regenerated in CI |
| Scan artifacts | `backend/artifacts/` | **gitignored** — multi-GB |
| UI scratch screenshots | `frontend/ss/` | **gitignored** |

**Still on disk locally (fine — not in repo):**

| Item | Location | Notes |
|------|----------|--------|
| Demo Postgres data | `C:\Users\simarsin\Desktop\demodata\` | Outside repo; optional local bind-mount |

---

## Safe to push (this release)

- **`frontend/**`** — Compass UI rebrand, site sidebar, routing bridges, pagination, HTML formatting, webpack dev script (`next dev --webpack` — dev only; production uses `next build`)
- **`backend/app/seed.py`** — normal idempotent startup seed (admin/viewer + default site); **not** mock UI data
- **`calibration/`** — scanner calibration fixtures (product tooling)
- **`.cursor/rules/prod-workflow.mdc`** — agent guidance only; no runtime effect
- **`UPDATE.md`** — optional; delete later if team does not want it in repo

---

## Azure / compose deploy reminders

1. **Frontend build args** (required at image build time, not runtime):
   - `NEXT_PUBLIC_API_URL=/compass/api` (or your nginx path)
   - `BACKEND_API_URL=http://backend:8001` (internal compose hostname — **not** `127.0.0.1`)
2. **Session cookies** behind TLS: `SESSION_COOKIE_SECURE=1`, `SESSION_COOKIE_PATH=/compass`
3. **Do not** copy local `.env` to the server — use `.env.example` as template
4. Run **staging smoke test** before prod: login → dashboard → one site → one nested route (e.g. Content → Pages)

---

## Production testing checklist

### Pre-push (developer)

- [x] `seed_demo_ui.py` removed
- [x] `.env` and `docker-compose.override.yml` gitignored
- [ ] `cd frontend && npm run build` succeeds
- [ ] Only intended paths in the changeset

### Staging

- [ ] App loads at `https://<host>/compass`
- [ ] Login works
- [ ] Site list + one module sub-page (nested route)
- [ ] No console errors on login → site → checks

### Production

- [ ] Same artifact as staging
- [ ] Smoke test after deploy

---

## Changelog

| Date | Action |
|------|--------|
| 2026-08-27 | Compass UI rebrand, sidebar/nav changes, route bridges, webpack dev fix |
| 2026-08-27 | Pre-push: deleted `seed_demo_ui.py`, gitignored `docker-compose.override.yml` |

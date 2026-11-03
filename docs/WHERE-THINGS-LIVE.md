# Where things live

Update this whenever anything is created or changed on Render, GitHub or Sentry. Secrets are never written here: they live in Render environment variables and Sadie's password manager.

| Thing | Where | Notes |
|---|---|---|
| Code | GitHub `sadiebuckingham/signifii-connectors` (private), branch `main` (renamed from `media-plan-connector`; old links redirect) | One repo for every connector |
| Demo service | Render `signifii-demos` (`srv-dbk9hl0ae00c73880s20`), Frankfurt, Starter, workspace "My Workspace" | **https://demos.signifii.com** (own domain: CNAME `demos` → `signifii-demos.onrender.com` in Squarespace DNS; Render certificate). Old address https://signifii-demos.onrender.com still works but Chrome flags it. Auto-deploys from `main` · `CONNECTOR=media-plan` |
| Media Plan connector URL | `https://demos.signifii.com/mcp/media-plan/<CONNECTOR_TOKEN>` | Token in Render env + password manager |
| Media Plan web plan links | `https://demos.signifii.com/p/<plan link token>` | One unguessable link per plan (`get_plan_link`) |
| Media Plan admin | `https://demos.signifii.com/admin/media-plan/sources` | `ADMIN_PASSWORD` |
| Demo database | Render Postgres `signifii-demos-db` (`dpg-dbk9hg49v7es73c48id0-a`) | **Not used: delete it** (Sadie). Decision 3 Nov: everything is saved in the client's folder, no database |
| Demo client folder | On the `signifii-demos` server: a working copy of `sample-data/media-plan/Media Plans` | Plans and decisions are saved here. Wiped on every deploy, and by Reset (`/admin/media-plan/reset`) |
| Old spike service | Render `media-plan-connector` (`srv-dbk6p03bc2fs73ej4usg`), Frankfurt, Starter | https://media-plan-connector.onrender.com · no longer used: the connector points at `signifii-demos` (confirmed 2 Nov). **Delete it** (Sadie) |
| Sentry | Organisation `signifii` (EU, https://signifii.sentry.io), project `signifii-demos` | Server and in-Claude view. `SENTRY_DSN` set in Render. No personal data sent |
| Media Plan connector, OneDrive version | `https://demos.signifii.com/mcp/media-plan-onedrive` | Microsoft sign-in; reads and saves in the person's OneDrive `Media Plans` folder. Live once `MS_CLIENT_ID` / `MS_CLIENT_SECRET` are set |
| Microsoft app registration | Not created yet: steps in `docs/microsoft-sign-in-setup.md` | Under `sadie@signifii.com`. Return address `https://demos.signifii.com/auth/microsoft/callback`. `MS_CLIENT_ID` / `MS_CLIENT_SECRET` go in Render |

# Where things live

Update this whenever anything is created or changed on Render, GitHub or Sentry. Secrets are never written here: they live in Render environment variables and Sadie's password manager.

| Thing | Where | Notes |
|---|---|---|
| Code | GitHub `sadiebuckingham/signifii-connectors` (private), branch `main` (renamed from `media-plan-connector`; old links redirect) | One repo for every connector |
| Demo service | Render `signifii-demos` (`srv-dbk9hl0ae00c73880s20`), Frankfurt, Starter, workspace "My Workspace" | https://signifii-demos.onrender.com · auto-deploys from `main` · `CONNECTOR=media-plan` |
| Media Plan connector URL | `https://signifii-demos.onrender.com/mcp/media-plan/<CONNECTOR_TOKEN>` | Token in Render env + password manager |
| Media Plan web plan links | `https://signifii-demos.onrender.com/p/<plan link token>` | One unguessable link per plan (`get_plan_link`) |
| Media Plan admin | `https://signifii-demos.onrender.com/admin/media-plan/sources` | `ADMIN_PASSWORD` |
| Demo database | Render Postgres `signifii-demos-db` (`dpg-dbk9hg49v7es73c48id0-a`), Frankfurt, Basic 256 MB, Postgres 17 | Not used by code yet (saving, Wednesday). No outside access (empty IP allow list) |
| Old spike service | Render `media-plan-connector` (`srv-dbk6p03bc2fs73ej4usg`), Frankfurt, Starter | https://media-plan-connector.onrender.com · no longer used: the connector points at `signifii-demos` (confirmed 2 Nov). **Delete it** (Sadie) |
| Sentry | Organisation `signifii` (EU, https://signifii.sentry.io), project `signifii-demos` | Server and in-Claude view. `SENTRY_DSN` set in Render. No personal data sent |
| Microsoft app registration | Not created yet: steps in `docs/microsoft-sign-in-setup.md` | Under `sadie@signifii.com`. Return address `https://signifii-demos.onrender.com/auth/microsoft/callback`. `MS_CLIENT_ID` / `MS_CLIENT_SECRET` go in Render |

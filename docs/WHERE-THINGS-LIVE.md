# Where things live

Update this whenever anything is created or changed on Render, GitHub or Sentry. Secrets are never written here: they live in Render environment variables and Sadie's password manager.

| Thing | Where | Notes |
|---|---|---|
| Code | GitHub `sadiebuckingham/media-plan-connector` (private), branch `main`. **To be renamed `signifii-connectors`** (Sadie, GitHub → Settings → Rename) | One repo for every connector |
| Demo service | Render `signifii-demos` (`srv-dbk9hl0ae00c73880s20`), Frankfurt, Starter, workspace "My Workspace" | https://signifii-demos.onrender.com · auto-deploys from `main` · `CONNECTOR=media-plan` |
| Media Plan connector URL | `https://signifii-demos.onrender.com/mcp/media-plan/<CONNECTOR_TOKEN>` | Token in Render env + password manager |
| Media Plan web plan link | `https://signifii-demos.onrender.com/p/<PLAN_LINK_TOKEN>` | |
| Media Plan admin | `https://signifii-demos.onrender.com/admin/media-plan/sources` | `ADMIN_PASSWORD` |
| Demo database | Render Postgres `signifii-demos-db` (`dpg-dbk9hg49v7es73c48id0-a`), Frankfurt, Basic 256 MB, Postgres 17 | Not used by code yet (saving, Wednesday). No outside access (empty IP allow list) |
| Old spike service | Render `media-plan-connector` (`srv-dbk6p03bc2fs73ej4usg`), Frankfurt, Starter | https://media-plan-connector.onrender.com · **delete once the connector is re-added on `signifii-demos`** |
| Sentry | Not set up yet | Needed for every service (server + browser) |
| Microsoft app registration | Not created yet | Under `sadie@signifii.com`, Tuesday |

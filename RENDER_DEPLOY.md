# Render deployment

Use the `render.yaml` file in the CKMedWare project root when creating the Render service.

## Required Render environment variables

Set these in the Render dashboard:

- `DATABASE_URL`
- `DIRECT_URL`
- `ADMIN_NAME`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `SESSION_TTL_DAYS`

`SESSION_TTL_DAYS` can stay as `90`.

## Manual Render settings

If you do not use the blueprint, configure the service manually:

- Root Directory: `backend`
- Build Command: `pnpm install --frozen-lockfile && pnpm build`
- Pre-Deploy Command: `pnpm prisma:migrate:deploy`
- Start Command: `pnpm start`
- Health Check Path: `/health`

The mobile app currently expects the backend at:

```text
https://ckmedware.onrender.com
```

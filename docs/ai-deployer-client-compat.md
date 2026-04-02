# AI Deployer Client Compatibility

This project now includes a minimal compatibility layer for the `AI Deployer V1.0.4` desktop client.

Client-facing endpoints:

- `GET /api/client_config`
- `POST /api/redeem`
- `POST /api/usage`

Admin endpoints:

- `GET /api/client_license`
- `GET /api/client_license/search`
- `GET /api/client_license/:id`
- `POST /api/client_license`
- `PUT /api/client_license`
- `DELETE /api/client_license/:id`

Web admin entry:

- `/console/client-license`

These endpoints are designed to work with the recovered client in:

- `D:\AI\Codex\ai-deployer-v1.0.4-decompile\AI Deployer V1.0.4.originalized.py`

## What It Does

- Seeds an optional demo client card code
- Resolves a card code into a real `new-api` token
- Binds the card to a device hash on first successful redeem
- Returns usage and expiry information in the shape expected by the desktop client

## Environment Variables

Compatibility switch and remote config:

- `AI_DEPLOYER_CLIENT_ENABLED=true`
- `AI_DEPLOYER_CLIENT_NOTICE=`
- `AI_DEPLOYER_CLIENT_MIN_VERSION=1.0.0`
- `AI_DEPLOYER_CLIENT_LATEST_VERSION=1.0.4`
- `AI_DEPLOYER_CLIENT_UPDATE_URL=https://your-domain.example/downloads/ai-deployer`
- `AI_DEPLOYER_CLIENT_DEFAULT_MODEL=gpt-5.3-codex`
- `AI_DEPLOYER_CLIENT_DEFAULT_OC_MODEL=openai/gpt-5.3-codex`
- `AI_DEPLOYER_CLIENT_DEFAULT_SMALL_MODEL=openai/gpt-4.1-mini`

Service account used to own issued tokens:

- `AI_DEPLOYER_CLIENT_SERVICE_USERNAME=ai_deployer_bot`
- `AI_DEPLOYER_CLIENT_SERVICE_GROUP=default`
- `AI_DEPLOYER_CLIENT_SERVICE_USER_QUOTA=1000000000`

Optional seeded demo card:

- `AI_DEPLOYER_CLIENT_SEED_CODE=CDX-DEMO-0001`
- `AI_DEPLOYER_CLIENT_SEED_NAME=starter`
- `AI_DEPLOYER_CLIENT_SEED_UNLIMITED=true`
- `AI_DEPLOYER_CLIENT_SEED_QUOTA=0`
- `AI_DEPLOYER_CLIENT_SEED_DURATION_DAYS=0`
- `AI_DEPLOYER_CLIENT_SEED_EXPIRES_AT=2026-12-31T23:59:59Z`

If `AI_DEPLOYER_CLIENT_SEED_CODE` is blank, automatic seed creation is disabled.

## Behavior Notes

- The returned `key` from `/api/redeem` is a real `new-api` token key.
- The desktop client writes that key into local Codex/OpenCode config.
- For usage display, quota is converted with `common.QuotaPerUnit` so the client can render `$...` style values.
- A disabled or expired client card will also mark its mapped token disabled/expired when the compatibility endpoints are hit.
- If `duration_days > 0`, the validity window starts from the first successful activation, not from creation time.
- The admin UI now supports batch creation, auto-generated codes, and custom random code length.

## Current Limitation

This patch adds the client compatibility layer and persistent card table, but it does not yet add a dedicated admin UI for managing client cards. Additional cards can be created through database inserts or a later admin API/UI patch.

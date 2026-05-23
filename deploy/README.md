# deploy/

Production deployment configuration for Flock-Avoid. For the full operator
walkthrough, see [`docs/DEPLOYMENT.md`](../docs/DEPLOYMENT.md).

## Files

| File | What it is |
|---|---|
| `Caddyfile` | Top-level Caddy v2 config. Site block, env interpolation, reverse-proxy rules, cache headers, SPA fallback. |
| `Caddyfile.snippets` | Reusable named snippets imported by `Caddyfile`. Holds the CSP, HSTS, Permissions-Policy, and the rest of the security headers. |
| `docker-compose.prod.yml` | Production stack overlay. Merged with the repo-root `docker-compose.yml` to add caddy + the hermetic SPA builder; does not stand alone. |
| `.env.prod.example` | Operator-supplied env vars (domain, ACME email). Copy to `.env.prod` and edit. Never commit `.env.prod`. |

## TL;DR

```bash
cp deploy/.env.prod.example deploy/.env.prod
# edit deploy/.env.prod
docker compose \
  -f docker-compose.yml \
  -f deploy/docker-compose.prod.yml \
  --env-file deploy/.env.prod \
  up -d
```

## Optional offline lint

`npm run deploy:caddy:validate` runs `caddy validate` in a transient Docker
container. Detects Caddyfile syntax errors. Skip if Docker isn't available;
not required for CI.

## What this directory does NOT contain

- No `.env.prod`. Operator-supplied; gitignored.
- No live secrets, certs, or keys.
- No live-deployment scripts. The product owner performs go-live.

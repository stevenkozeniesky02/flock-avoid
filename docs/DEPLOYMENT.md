# Flock-Avoid deployment guide

> Operator-facing reference for the production deployment. For the design
> rationale and decision history see
> [`docs/superpowers/specs/2026-05-22-flock-avoid-phase-0b-3b-deploy.md`](superpowers/specs/2026-05-22-flock-avoid-phase-0b-3b-deploy.md).

## TL;DR

```bash
cp deploy/.env.prod.example deploy/.env.prod
# edit deploy/.env.prod (set FLOCK_DOMAIN, optionally FLOCK_ACME_EMAIL)
docker compose \
  -f docker-compose.yml \
  -f deploy/docker-compose.prod.yml \
  --env-file deploy/.env.prod \
  up -d
```

That brings up the full stack: a Caddy reverse proxy that terminates HTTPS
and serves the SPA, the Valhalla routing container, and a one-shot
web-builder that produces a fresh `dist/` bundle from the current source.

---

## What this gets you

A privacy-preserving production deployment:

- **HTTPS** with an automatically-issued, automatically-renewed certificate
  from Let's Encrypt (or ZeroSSL fallback).
- **Same-origin proxies** for routing (`/valhalla/*`), geocoding
  (`/photon/*`), and the camera dataset (`/dataset/*`). The browser only
  ever talks to your origin; the upstream hosts are invisible to it.
  This reproduces the Vite dev proxy 1:1 — see `vite.config.ts` for the
  contract.
- **A strict Content-Security-Policy** that pins the same-origin posture at
  the browser level. `default-src 'self'`, no `'unsafe-eval'`, no
  `'unsafe-inline'` on scripts, no third-party CDN, no analytics.
- **HSTS, X-Content-Type-Options, Referrer-Policy `no-referrer`,
  Permissions-Policy** that blocks sensors and advertising-cohort tagging,
  `X-Frame-Options: DENY`, `Cross-Origin-Opener-Policy: same-origin`.
- **Service-worker-aware caching:** `/sw.js` is `no-store` (so a stuck SW
  can never become permanent); hashed `/assets/*` is `immutable` with a
  one-year max-age; everything else is `no-cache, must-revalidate`.
- **Privacy-redacted access logs:** Caddy logs status code + method +
  path, but redacts the query string (Photon search terms),
  User-Agent, Cookie, and Authorization.

---

## What you must supply

| Thing | Why |
|---|---|
| A domain name | You need an A or AAAA record pointing at the server. Caddy uses it for the ACME challenge and for the site label in the Caddyfile. |
| A server | Any VPS / bare metal / cloud host with public IPv4 and ports 80 + 443 reachable. 4 GB RAM minimum for Atlanta-only Valhalla; 8 GB+ if running the full-US Valhalla container. |
| Docker 24+ with Compose v2 | For `docker compose`. No Node, no nginx, nothing else required on the host. |
| The Valhalla tile data | One of: (a) accept the Atlanta-only default (~250 MB OSM download on first start, 10-20 min build), or (b) the full-US tile build (~80 GB, 4-10 hours, ~30-40 GB steady state). See [`docs/VALHALLA.md`](./VALHALLA.md). |
| Optional: an email address for Let's Encrypt notifications | Set `FLOCK_ACME_EMAIL` in `deploy/.env.prod`. If you leave it blank, Caddy falls back to ZeroSSL (no email needed). |

What you do NOT need to supply:

- A separate build server. The `web-builder` service in the compose file
  runs `npm ci && npm run build` inside the stack.
- A separate TLS certificate. Caddy obtains one automatically.
- A CDN. The SPA is served by Caddy from a local volume.

---

## Prerequisites

```bash
# Docker version (24+)
docker --version

# Compose v2 (the `docker compose` plugin, not the legacy `docker-compose`)
docker compose version
```

DNS pointing at the server:

```bash
dig +short A flock-avoid.example.com
# should print your server's public IPv4
```

Ports 80 and 443 reachable from the public internet:

```bash
# from any host with a public IP
curl -v http://flock-avoid.example.com/  # before deploy, expect connection refused
```

If port 80 is firewalled, Caddy cannot complete the HTTP-01 ACME challenge
and will not issue a certificate. Open both 80 and 443.

---

## Step-by-step bring-up

1. Clone the repo on the server:

   ```bash
   git clone https://github.com/stevenkozeniesky02/flock-avoid.git
   cd flock-avoid
   ```

2. Copy and edit the env file:

   ```bash
   cp deploy/.env.prod.example deploy/.env.prod
   $EDITOR deploy/.env.prod
   ```

   At minimum set `FLOCK_DOMAIN`. Optionally set `FLOCK_ACME_EMAIL`.

3. Bring up Valhalla first (separately, so its 10-20 min tile build is
   observable on its own):

   ```bash
   ./scripts/build-valhalla-tiles.sh
   ```

   For nationwide routing instead of Atlanta-only, run
   `./scripts/build-valhalla-tiles-us.sh` (much longer; see
   `docs/VALHALLA.md`).

4. Bring up the full stack:

   ```bash
   docker compose \
     -f docker-compose.yml \
     -f deploy/docker-compose.prod.yml \
     --env-file deploy/.env.prod \
     up -d
   ```

   The `web-builder` container runs `npm ci && npm run build`, writes
   `dist/` into the `flock-dist` named volume, then exits. Caddy waits for
   it to complete (depends_on: service_completed_successfully) before
   starting.

5. Watch the logs until ACME succeeds and Caddy reports serving:

   ```bash
   docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml \
     logs -f caddy
   ```

   The first start takes 30-90 seconds to obtain the cert. Look for
   `certificate obtained successfully`.

---

## Verifying

Once Caddy reports ready, sanity-check from any client:

```bash
# Headers — verify the security posture you committed
curl -I https://flock-avoid.example.com/

# expected (subset):
#   strict-transport-security: max-age=63072000; includeSubDomains
#   content-security-policy: default-src 'self'; ...
#   x-content-type-options: nosniff
#   referrer-policy: no-referrer
#   x-frame-options: DENY
#   permissions-policy: geolocation=(), camera=(), ...
#   cross-origin-opener-policy: same-origin

# SPA reachable
curl -s https://flock-avoid.example.com/ | head -5
# should be index.html

# Service worker headers
curl -I https://flock-avoid.example.com/sw.js
# expected:
#   content-type: application/javascript; charset=utf-8
#   cache-control: no-cache, no-store, must-revalidate

# Manifest
curl -I https://flock-avoid.example.com/manifest.webmanifest
# expected:
#   content-type: application/manifest+json
#   cache-control: no-cache, must-revalidate

# Routing proxy reaches Valhalla
curl -s https://flock-avoid.example.com/valhalla/status | python3 -m json.tool | head -10
# expected: JSON with `version`, `tileset_last_modified`, etc.

# Hashed asset gets immutable cache
curl -I https://flock-avoid.example.com/assets/index-XXXX.js  # pick any hashed asset
# expected:
#   cache-control: public, max-age=31536000, immutable
```

Then open `https://flock-avoid.example.com/` in a browser:

- The map renders.
- The welcome modal appears.
- Pan the map — tiles load.
- DevTools → Application → Service Workers shows `sw.js` registered.
- DevTools → Application → Cache Storage shows `app-shell-v1`,
  `osm-tiles-v1`, etc. after a few interactions.
- DevTools → Network filter set to "All" — verify the only cross-origin
  hosts are `*.tile.openstreetmap.org`. Routing, geocoding, and dataset
  requests should all show `flock-avoid.example.com` as the host.

If the map does not render, the most likely cause is that the CSP is
blocking something the app uses. See "Troubleshooting" below.

---

## TLS / certificates

By default Caddy uses automatic HTTPS:

1. On first start, Caddy listens on :80 and resolves the ACME HTTP-01
   challenge.
2. If `FLOCK_ACME_EMAIL` is a real address, Let's Encrypt issues a cert.
3. If `FLOCK_ACME_EMAIL` is blank (or the placeholder), Let's Encrypt
   refuses and Caddy falls back to ZeroSSL automatically.
4. Certificates renew 30 days before expiry, indefinitely.

The certificate material lives in the `caddy-data` named volume. Treat
this volume as sensitive backup data — losing it means re-issuing certs
on next start (which is fine but rate-limited by the CA).

### Operator-supplied certificates

To use a corporate CA, an air-gapped pre-issued cert, or any other manual
cert source:

1. Set `FLOCK_TLS_CERT_PATH` and `FLOCK_TLS_KEY_PATH` in `deploy/.env.prod`
   to paths inside the caddy container.
2. Uncomment the `(operator_tls)` snippet in
   `deploy/Caddyfile.snippets` and add `import operator_tls` inside the
   site block of `deploy/Caddyfile`.
3. Bind-mount the cert + key into the caddy container via a small
   additional compose override file.

### Localhost / staging

Set `FLOCK_DOMAIN=localhost` in `deploy/.env.prod`. Caddy uses its
internal CA and issues a self-signed cert. Browsers will warn; trust it
manually if you need to test the production HTTPS path locally.

---

## Rolling back

A roll-back is a `git checkout` + `up`:

```bash
# from the repo on the server
git fetch
git checkout <previous-commit-sha>
docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml \
  --env-file deploy/.env.prod up -d --build web-builder
```

The `--build web-builder` flag re-runs the SPA build at the older commit.
Caddy picks up any Caddyfile changes on its next start; if only the
Caddyfile changed:

```bash
docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml \
  --env-file deploy/.env.prod restart caddy
```

The cert and Valhalla tiles persist across roll-backs (they live in named
volumes).

---

## Logging and privacy

Caddy logs to its own stdout/stderr in JSON. The Caddyfile's `log
format filter` block deletes the following fields before they reach the
log stream:

| Field | Why redacted |
|---|---|
| `query` | Photon search queries contain user-typed text — addresses, place names. Logging them defeats the no-account privacy story. |
| `User-Agent` | Personally-recognizable across visits. |
| `Cookie` | Should be empty (the app sets no cookies) but redacted defensively. |
| `Authorization` | Should be empty (no auth) but redacted defensively. |

What remains in the log: timestamp, method, status code, request size,
response size, **path** (without query string), client IP (Caddy is the
terminating proxy, so this is the real client IP).

The client IP is privacy-sensitive. If your threat model requires NOT
logging it (e.g. you serve a population that wants to be unidentifiable
to a server compromise), edit the Caddyfile `log format` block to also
delete `request>remote_ip`.

### Centralized log shipping is your call

Forwarding access logs to a third-party SaaS observability tool means
that SaaS sees every path every user requests. For a privacy product, the
default is: don't. If you must (compliance, ops requirements), pick a
self-hosted destination (Loki, Vector to a local file, etc.) or one
operated by an organization whose threat model aligns with yours.

The compose stack does **not** ship any log forwarder by default.

---

## Multi-host deployments

The single-host stack is the recommended starting point. If you outgrow
it — Valhalla on the full-US tile build is the most likely reason — the
split is straightforward:

1. Move the `valhalla` service to its own host. The dev compose file
   (`docker-compose.yml` at the repo root) can run there standalone.
2. In `deploy/Caddyfile`, change the `/valhalla/*` reverse-proxy upstream
   from `valhalla:8002` to your Valhalla host's private DNS name (e.g.
   `valhalla.internal:8002`). Use a private network or VPN — Valhalla
   itself has no auth, and putting it on the public internet would expose
   routing requests directly.
3. Remove the `valhalla` service overlay from
   `deploy/docker-compose.prod.yml` (drop the `valhalla:` block under
   `services:` and the `include` of the dev compose).
4. Restart caddy.

Horizontal scaling of Caddy itself (multiple Caddy instances behind a
load balancer) is possible but adds operational complexity (shared cert
storage, session affinity for ACME challenges); document your own
runbook.

---

## Troubleshooting

| Symptom | Likely cause | Recovery |
|---|---|---|
| `curl -I https://...` returns connection refused or times out | DNS not resolving, ports 80/443 not reachable, Caddy not started | `dig +short A $FLOCK_DOMAIN`; `docker compose ... ps`; check firewall rules for tcp/80 and tcp/443. |
| ACME error: `unable to satisfy challenge: HTTP request returned status: 503` | Port 80 is firewalled; Caddy cannot serve the HTTP-01 challenge | Open port 80 in your cloud provider's security group AND on the host firewall (`ufw status`, `iptables -L`). Caddy will retry automatically. |
| ACME error: `unable to authorize the order: rate limited` | Too many failed cert requests in a short window | Wait an hour. Use staging ACME by setting `acme_ca https://acme-staging-v02.api.letsencrypt.org/directory` inside the global block until issues are resolved. |
| Map renders blank, console shows CSP violations | A new third-party host was introduced upstream (e.g. font CDN, telemetry SDK) — the CSP is doing its job | Decide whether the new host is acceptable for the privacy posture. If yes, add it to `Caddyfile.snippets`' CSP AND to `src/privacy/networkAllowlist.ts`, AND update the privacy invariant test. If no, revert the change that introduced the third-party fetch. |
| `web-builder` container exits with code 1 | `npm ci` or `npm run build` failed | `docker compose ... logs web-builder`. Common causes: out of memory (peak ~1.5 GB during build), missing `package-lock.json` in the checked-out commit. |
| Service worker registration fails | HTTPS not yet active, or `/sw.js` is being served with the wrong MIME type | `curl -I https://.../sw.js` — verify `content-type: application/javascript`. Verify HTTPS is fully active (browsers will not register a SW over HTTP except on localhost). |
| Service worker is stuck on an old version | A previous deploy with a long-cache `sw.js` is still cached at an intermediary | Verify the Caddyfile is in effect: `curl -I https://.../sw.js` should report `cache-control: no-cache, no-store, must-revalidate`. If there is another reverse proxy or CDN in front of Caddy, it must not override these headers. |
| Valhalla `/route` returns `error_code: 442` ("no path found") | The endpoints are outside the loaded tile graph (e.g. Atlanta-only tiles, request outside Georgia) | See `docs/VALHALLA.md`. Switch to the full-US tile build. |
| Caddy memory usage grows unboundedly | Almost always not Caddy itself — check the other services | `docker stats`. Valhalla holds tiles in memory; on the full-US build, ~6-8 GB is normal. |

---

## What this doc does NOT cover

- **A CI/CD workflow that auto-deploys.** Not in scope. The product owner
  performs each deploy intentionally.
- **A managed-Valhalla path.** The privacy story depends on running
  Valhalla yourself; outsourcing routing to a third-party API gives them
  every route request.
- **Kubernetes.** This stack is `docker compose`-shaped. A k8s rewrite is
  several PRs of work and is not required for small deployments.
- **Multi-region / global anycast.** Same — beyond scope for the single-
  host posture this project ships.
- **Backup automation.** Everything important is reproducible: the SPA
  from source, the Valhalla tiles from the OSM extract (see
  `docs/VALHALLA.md`), the camera dataset from the nightly GitHub
  Action. The only stateful data is the Caddy cert volume (`caddy-data`);
  cert re-issuance is rate-limited but always possible.
- **A `/tiles/*` same-origin proxy for OSM tiles.** A real privacy
  improvement, but it requires changes to `src/ui/mapView.ts` and
  `src/privacy/networkAllowlist.ts` that are out of scope for this PR.
  Documented as a follow-up sub-project.
- **Rate limiting on `/valhalla` or `/photon`.** Useful for abuse
  mitigation; the Caddyfile is intentionally bare here. Add a `rate_limit`
  block to the relevant `handle_path` if your deployment needs it.
- **Detailed observability beyond Caddy's own stdout.** Privacy-sensitive
  call. Pick a destination that aligns with your users' threat model.

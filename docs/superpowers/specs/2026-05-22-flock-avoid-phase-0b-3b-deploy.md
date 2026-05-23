# Flock-Avoid — Phase 0b-3b · Sub-project E: public deployment + reverse proxy

**Status:** Draft for review
**Author:** Steven (with Claude as AI cofounder)
**Date:** 2026-05-22
**Parent spec:** [`2026-05-15-flock-avoid-design.md`](./2026-05-15-flock-avoid-design.md)
**Prior sub-projects:**
- Sub-project A — Wayfinding UX (PR #3 / PR #4 stacked, branch `feat/phase-0b-3b-wayfinding`)
- Sub-project B — Turn-by-turn directions (PR #5 stacked on A, branch `feat/phase-0b-3b-directions`)
- Sub-project C — Full-US Valhalla setup (PR #6 stacked on B, branch `feat/phase-0b-3b-full-us-valhalla`)
- Sub-project D — PWA + offline (PR #8 stacked on C, branch `feat/phase-0b-3b-pwa`)
**Stacks on:** `feat/phase-0b-3b-pwa`
**Branch:** `feat/phase-0b-3b-deploy`

---

## 1. Why this exists

Everything shipped through Sub-projects A–D runs on `localhost:5173` behind a Vite dev server. That has been fine for development — Vite's same-origin proxy enforces the one privacy invariant that matters most (the browser only ever talks to its own origin), the service worker registers cleanly on `http://localhost`, and the routing container is a `docker compose up` away.

None of that survives contact with the public internet. A user who visits `https://flock-avoid.example.com` from a phone in their car needs a reverse proxy that terminates TLS, serves the built SPA, and reproduces the `/valhalla`, `/dataset`, and `/photon` same-origin proxies that the Vite dev server provides today. A Service Worker only registers under HTTPS (or `localhost`); the manifest's `start_url: /` is only meaningful when there is a real origin. The CSP we ship is the difference between "the same-origin posture is a development convention" and "the same-origin posture is a header the browser enforces."

Sub-project E ships the configuration — reverse proxy, container orchestration, security headers, deployment doc — that takes the work from Sub-projects A–D and makes it deployable. It does **not** actually deploy anything. It does not register a domain, provision a server, or stand up a public origin. The deliverable is committed configuration + an operator guide; the actual go-live is the product owner's call, on the product owner's infrastructure, after this PR is merged.

## 2. Scope

**In:**

- A production reverse proxy configuration at `deploy/Caddyfile` (Caddy v2) that:
  - Serves the built static SPA from `dist/` at the document root.
  - Reverse-proxies `/valhalla/*`, `/dataset/*`, and `/photon/*` to mirror the Vite dev proxy exactly — same paths, same upstream rewrites, same hosts.
  - Terminates HTTPS via Caddy's built-in ACME (Let's Encrypt by default).
  - Sets a strict Content-Security-Policy plus HSTS, X-Content-Type-Options, Referrer-Policy, frame-ancestors via CSP (with X-Frame-Options as a legacy companion), and Permissions-Policy.
  - Serves `/sw.js` and `/manifest.webmanifest` with correct Content-Type and a cache policy that lets the service worker update.
  - Serves Vite's hashed `/assets/*` with immutable long-cache headers; serves unhashed `index.html` with `no-cache`.
- A production `deploy/docker-compose.prod.yml` that orchestrates the full stack:
  - `valhalla` (from the existing `docker-compose.yml` via `include:`).
  - `caddy` (the reverse proxy).
  - `web-builder` (a one-shot service that runs `npm ci && npm run build` into a shared volume, so a fresh `up` always serves a fresh SPA — no separate "build then deploy" step).
- `deploy/.env.prod.example` documenting the operator-supplied values: domain name, optional ACME email, optional Cloudflare/staging overrides.
- A deployment guide at `docs/DEPLOYMENT.md`: prerequisites, what the operator must supply, build steps, TLS approach, how to bring the stack up, how to verify, how to roll back, troubleshooting.
- A vitest unit test (`tests/unit/deploy/caddyfile.test.ts`) that parses `deploy/Caddyfile` as text and pins:
  - The three reverse-proxy targets (`/valhalla/*`, `/dataset/*`, `/photon/*`) point at the expected upstreams with the expected rewrites.
  - The CSP header is present and includes `default-src 'self'`, `frame-ancestors 'none'`, `object-src 'none'`, and `base-uri 'self'`.
  - HSTS includes `max-age=` and `includeSubDomains`.
  - `X-Content-Type-Options: nosniff` is present.
  - `Referrer-Policy: no-referrer` is present.
  - `Permissions-Policy` denies the privacy-sensitive sensors (geolocation, camera, microphone, etc.).
  - `/sw.js` has a no-store-style cache directive (so a stuck SW does not become permanent).
  - The Caddyfile does NOT reference any host that is not already in `src/privacy/networkAllowlist.ts` plus the new same-origin proxy upstreams (Valhalla service name, photon.komoot.io, github.com).
- A second vitest unit test (`tests/unit/deploy/csp.test.ts`) that parses the CSP directive out of the Caddyfile and asserts:
  - No directive uses `*` as the only source.
  - `script-src` does not include `'unsafe-inline'` or `'unsafe-eval'`.
  - `connect-src` includes `'self'` and the OSM tile hosts (the one cross-origin endpoint the browser already contacts in dev).
  - `img-src` includes `'self'`, `data:`, `blob:`, and the OSM tile hosts.
  - `frame-ancestors` is `'none'`.
- An npm script `deploy:caddy:validate` that runs `caddy validate` in a transient Docker container against the committed Caddyfile (offline lint; optional, documented in README).
- A small README update pointing at `docs/DEPLOYMENT.md` for the production story.

**Out (this sub-project):**

- **Actually deploying to a public origin.** No domain registration, no cloud resources, no `caddy run` against the open internet. The product owner performs the live deployment on their own.
- **A GitHub Actions workflow that auto-deploys.** Explicitly out per the task. A production-build-check could be added but is also deferred to keep this PR focused on configuration.
- **A managed-Valhalla path.** The existing `docker-compose.yml` is the source of truth for Valhalla today. Sub-project E composes that file into the prod stack; replacing self-hosted Valhalla with a managed routing API is a different question with different privacy properties.
- **Tile distribution at scale / CDN.** OSM raster tiles still come from `*.tile.openstreetmap.org` directly to the browser, as they have since day one. Self-hosting a tile server, switching to vector tiles, or fronting tiles through the same-origin proxy are all distinct sub-projects.
- **A `/tiles/*` same-origin reverse proxy.** The current architecture has `*.tile.openstreetmap.org` in the network allowlist with the same status as it had on day one. Proxying tiles same-origin would also be a real improvement to the privacy posture, but: (a) it is not what the Vite dev proxy does today, and the task says "replicate the dev proxy exactly"; (b) the network allowlist already records these hosts as the documented exception; (c) doing it here would require modifying `src/ui/mapView.ts` and removing entries from `src/privacy/networkAllowlist.ts`, both of which are explicitly off-limits in this PR's guardrails. Documented as a follow-up.
- **A `nginx.conf` alternate.** Caddy is the only reverse proxy this PR ships; see §3 for the rationale. A second config covering the same surface would double-maintain.
- **Container images published to a registry.** The compose stack builds locally on the operator's machine. Publishing pre-built images is an operator concern that mixes infrastructure with the project's release process and is deferred.
- **Multi-instance / horizontal scaling.** Single-host, single-Caddy, single-Valhalla is what this PR delivers. Horizontal scaling is several PRs of work and bumps up against the dataset-volume question and the stateful Valhalla tile mount.
- **Backup / disaster recovery automation.** Documented at the prose level in `docs/DEPLOYMENT.md` — Valhalla tiles are reproducible from PBF + scripts; the SPA is reproducible from source; the dataset is reproducible from the nightly GitHub Action. The operator does not need a backup story to recover.
- **Authentication / accounts on the production origin.** Hard product line: no accounts.
- **Rate limiting on `/valhalla` or `/photon`.** Useful in production for abuse mitigation but not strictly required for first-deploy. Documented as a follow-up; placeholder hooks in the Caddyfile would invite scope creep.
- **Real-time crash / log forwarding to a SaaS observability tool.** Privacy-sensitive — every reachable observability SaaS is one more host that learns about every request. Caddy's local stdout/stderr logging is what we ship; any centralized log shipping is the operator's call against their own threat model.

## 3. Decisions captured during design

| Question | Decision | Why |
|---|---|---|
| Caddy or nginx? | **Caddy v2.** | Three reasons that compound: (a) automatic HTTPS via ACME is a single line of Caddyfile vs ~150 lines of nginx + certbot + a renewal cron; less surface area = less operator error = safer for a small-team privacy project. (b) The Caddyfile is dramatically more legible — `reverse_proxy /valhalla/* valhalla:8002` is what it looks like, vs the nginx `location` + `proxy_pass` + `proxy_set_header` dance. The whole config fits on one screen; that legibility is itself a security property because a reviewer can read it end-to-end. (c) Caddy's CSP / header configuration uses a single `header` directive with snippet support; nginx requires per-`location` repetition or `include` files. The tradeoff is operator familiarity (more devs have nginx muscle memory) and the slightly smaller community for niche modules, neither of which moves the needle for this app's surface. |
| Multiple compose files (dev + prod) or merge with `-f`? | Separate file at `deploy/docker-compose.prod.yml` that uses `include:` to pull in `docker-compose.yml`. | Zero behavior change to existing dev flows: `docker compose up` still does what it does today. The prod file pulls in valhalla from the existing file (no duplication, no drift), and adds the caddy + builder services on top. `include:` is supported in Compose v2.20+ which is what every operator who can run docker compose today already has. |
| Build the SPA inside docker, or have the operator run `npm run build` host-side? | Inside docker, via a one-shot `web-builder` service that writes `dist/` to a shared named volume the caddy service mounts read-only. | Two operational wins: (a) the operator doesn't need Node installed to deploy — the build is hermetic to the docker stack. (b) a `docker compose up --build web-builder` from a fresh checkout always produces the same build that ships, removing host-Node-version drift as a failure mode. The cost is one extra service in the compose file and a small named volume; both are documented. |
| ACME (Let's Encrypt) vs operator-supplied cert? | ACME by default; documented escape hatch for operators who must supply a cert (corporate CA, air-gapped staging). | Caddy's default is the right default — automatic, free, renews itself. The escape hatch is one line of Caddyfile (`tls /path/to/cert /path/to/key`) and a volume mount; documented but not in the main path. |
| What is the production CSP? | See §4.3. Strict `default-src 'self'`. No `'unsafe-eval'`. `'unsafe-inline'` allowed for `style-src` only, for the reasons in §4.4. | The CSP is the production teeth on the same-origin posture. It must be strict enough that an injected script cannot phone home to an unallowlisted host, but lenient enough that MapLibre's worker chunks, the inline style attributes already in `index.html`, the service worker, and the OSM tile fetches continue to work. The detail is in §4.3. |
| Should the CSP block OSM tile hosts? | No. | OSM raster tile fetches are the one cross-origin call the browser makes today, recorded in the network allowlist since day one. Blocking them in the CSP would break the map. Moving tiles same-origin is a separate scoped follow-up. The CSP allows `*.tile.openstreetmap.org` in `img-src` and `connect-src` specifically; everything else cross-origin is blocked. |
| Should `/sw.js` and `/manifest.webmanifest` be no-cache, short-cache, or hashed? | `/sw.js`: `Cache-Control: no-cache, no-store, must-revalidate`. `/manifest.webmanifest`: `Cache-Control: no-cache`. | A SW that gets cached at the CDN/intermediary for a year is a SW the user can never update — that's the worst failure mode for a PWA. The hash-busting story for `sw.js` doesn't work because the URL is fixed (`/sw.js` is the registration target). `no-cache` for the SW + manifest is the standard mitigation; the actual SW body is tiny so cost is negligible. |
| `/assets/*` cache headers? | `Cache-Control: public, max-age=31536000, immutable`. | Vite emits content-hashed filenames under `/assets/`. They never need revalidation once a build is out — a new build emits new hashes. `immutable` removes even the conditional revalidation round-trip. |
| `index.html` cache headers? | `Cache-Control: no-cache, must-revalidate`. | The HTML is what wires up the hashed asset URLs. A stale `index.html` references old hashed bundles that are no longer on disk → 404 → broken app. The SPA-shell HTML is small; `no-cache` lets the SW + CDN do their freshness check on every navigation. |
| Service worker scope | `/` (the SW is at `/sw.js` and `scope` defaults to its own path). | Matches what the SW already registers with in Sub-project D. No `Service-Worker-Allowed` header needed. |
| HSTS preload-list opt-in? | Configurable via env (`FLOCK_HSTS_PRELOAD=1`). Default off. | Preloading is a one-way ratchet: once submitted to the Chrome preload list, the domain is HTTPS-only for years, including for any subdomain the operator might later want to use for staging or a non-TLS internal tool. Defaulting it on would be a footgun for an operator running their first deployment. Default off, documented, easy to flip on once the operator is confident in the long-lived HTTPS commitment. |
| `Permissions-Policy` — block which features? | `geolocation`, `camera`, `microphone`, `payment`, `usb`, `accelerometer`, `gyroscope`, `magnetometer` all set to `()` (empty allowlist = block from everywhere). | The app legitimately uses `navigator.geolocation` via the existing "use my location" flow, so technically `geolocation=(self)` would be more correct. However, the Permissions-Policy header applies to embedded iframes too, and we already block framing via `frame-ancestors 'none'`. Blocking all sensor permissions universally is a defense-in-depth posture: even if an injected script bypasses the script CSP, it cannot get a geolocation read or activate a camera without a user gesture that the browser will permission-prompt anyway. Trading off a small UX clarity loss (the prompt still works because the page itself requests it from the same origin) for a meaningful hardening. Documented in §4.3. |
| Block other cross-origin features (FLoC, federated identity, etc.)? | Add `interest-cohort=()` and `browsing-topics=()` to the Permissions-Policy. | Free privacy hardening. Costs nothing; signals to browsers that this site opts out of advertising-cohort tagging. |
| Should we set `Cross-Origin-Opener-Policy` / `Cross-Origin-Embedder-Policy`? | `COOP: same-origin`. **No** `COEP`. | COOP `same-origin` is a small isolation win with no UX cost. COEP `require-corp` would break opaque OSM raster tiles (which lack the CORP header) — same family of breakage as moving tiles same-origin would imply. Skip COEP for now; revisit when tiles are same-origin. |
| Build inside this PR's CI? | No new workflow. | The existing `.github/workflows/build-camera-dataset.yml` is the only workflow; adding a "build the app and publish a deploy artifact" workflow is a useful next step but is its own scope (it implies a release process, artifact storage, and authentication to the host) and conflicts with the "no live deployment" guardrail. |
| Should the prod compose run on the same machine as the Valhalla US tile build? | Documented as the operator's choice; not enforced. | Single-host is simplest and matches the smallest deployments. Splitting Valhalla onto a beefier box and Caddy onto a smaller one is straightforward — `valhalla:8002` in the Caddyfile becomes `valhalla.internal:8002`. Documented in §4.5. |
| `web-builder` security: it runs `npm ci` from package-lock.json | Pinned image, no untrusted scripts beyond what the lockfile carries. | Same trust posture as any local `npm ci` on the operator's machine; no new attack surface. |
| Should the prod compose expose port 8002 (Valhalla) to the host? | No. Valhalla is only reachable via the Caddy `/valhalla` proxy on the docker bridge network. | Reduces the public-internet surface of the routing service to zero direct exposure. The browser sees only Caddy's TLS endpoint. This is a hardening over the dev compose (which binds `127.0.0.1:8002` for local curl-debugging). |
| Network allowlist changes | **None.** | Same reasoning as Sub-project D: the production deploy does not introduce a new browser-facing host. The Caddy proxy hops to upstreams server-side; those upstreams are not in the browser's allowlist because the browser never sees them. |

## 4. Architecture

### 4.1 What changes

```
README.md                                       MODIFY · brief link to docs/DEPLOYMENT.md
package.json                                    MODIFY · add deploy:caddy:validate npm script
deploy/                                         NEW DIR
  Caddyfile                                     NEW   · reverse proxy + headers + TLS
  Caddyfile.snippets                            NEW   · reusable header/CSP snippets imported by Caddyfile
  docker-compose.prod.yml                       NEW   · includes ../docker-compose.yml; adds caddy + web-builder
  .env.prod.example                             NEW   · documents operator-supplied env (FLOCK_DOMAIN, FLOCK_ACME_EMAIL, ...)
  README.md                                     NEW   · 30-line orientation pointing at docs/DEPLOYMENT.md
docs/
  DEPLOYMENT.md                                 NEW   · operator-facing deployment guide
  superpowers/specs/2026-05-22-flock-avoid-phase-0b-3b-deploy.md   NEW · this spec
  superpowers/plans/2026-05-22-flock-avoid-phase-0b-3b-deploy.md   NEW · companion plan
tests/
  unit/deploy/
    caddyfile.test.ts                           NEW   · pin upstreams, header presence, no leaks
    csp.test.ts                                 NEW   · pin CSP directive composition
```

### 4.2 What does NOT change

- `src/privacy/networkAllowlist.ts` — unchanged. The deploy preserves the existing browser-facing host list verbatim.
- `vite.config.ts` — unchanged. Dev proxy continues to be the source of truth that the prod Caddyfile replicates.
- `docker-compose.yml` (the dev compose for Valhalla) — unchanged. The prod compose `include`s it.
- `public/sw.js`, `public/manifest.webmanifest`, `public/icons/*` — unchanged. The Caddyfile serves them with the correct headers.
- `src/main.ts`, all of `src/`, `index.html` — unchanged. No app-side changes are needed to make the build deployable.
- `package.json` dependencies — unchanged. The only `package.json` edit is one new script.
- `.gitignore` — unchanged (the new files do not need ignoring; the env file is `.env.prod.example`, not `.env.prod`).
- Existing tests — unchanged. The new tests are additive.

### 4.3 Security headers

All headers are set by the Caddyfile. The exact text shipped is in `deploy/Caddyfile.snippets`; this section is the human-readable rationale.

| Header | Value | Why |
|---|---|---|
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains` (preload appended when `FLOCK_HSTS_PRELOAD=1`) | Two-year max-age, all subdomains. HSTS only takes effect on the second visit; a long max-age extends the protection across realistic visit gaps. |
| `Content-Security-Policy` | See expansion below | The production teeth on the same-origin posture. |
| `X-Content-Type-Options` | `nosniff` | Prevents MIME-sniffing-based XSS. |
| `Referrer-Policy` | `no-referrer` | Maximum privacy. We do not want the destination URL of any link the user clicks to leak to a third party. |
| `X-Frame-Options` | `DENY` | Legacy companion to `frame-ancestors 'none'`. Defense-in-depth. |
| `Permissions-Policy` | `geolocation=(), camera=(), microphone=(), payment=(), usb=(), accelerometer=(), gyroscope=(), magnetometer=(), interest-cohort=(), browsing-topics=()` | Sensor blocking + opt-out of advertising cohorts. See §3 decision row. |
| `Cross-Origin-Opener-Policy` | `same-origin` | Tab isolation. Cheap hardening. |
| `Cache-Control` for `/sw.js` and `/manifest.webmanifest` | `no-cache, no-store, must-revalidate` | A stuck SW cannot become permanent. |
| `Cache-Control` for `/assets/*` | `public, max-age=31536000, immutable` | Hashed asset URLs never need revalidation. |
| `Cache-Control` for everything else (HTML, icons) | `no-cache, must-revalidate` | Frequent revalidation; safe default. |

**The CSP, expanded:**

```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob: https://a.tile.openstreetmap.org https://b.tile.openstreetmap.org https://c.tile.openstreetmap.org;
connect-src 'self' https://a.tile.openstreetmap.org https://b.tile.openstreetmap.org https://c.tile.openstreetmap.org;
font-src 'self';
worker-src 'self' blob:;
manifest-src 'self';
object-src 'none';
base-uri 'self';
form-action 'self';
frame-ancestors 'none';
upgrade-insecure-requests
```

Every directive that isn't `'self'`-only is justified below:

- `style-src 'self' 'unsafe-inline'` — `index.html` carries `style="..."` attributes (`#app`, `#sidebar`, `#map`), and several `src/ui/*` components set inline styles on DOM nodes at runtime (e.g. for transient animation states). Removing all inline styles from the app to allow a stricter `style-src` is a real cleanup but is not scoped to a deployment PR. Documented as a follow-up.
- `img-src` and `connect-src` allowlists `*.tile.openstreetmap.org` — MapLibre fetches raster tiles from these hosts. Removing them would break the map. Moving tiles same-origin is the only way to drop these from the CSP and is explicitly out of scope (§2).
- `img-src` also allows `data:` and `blob:` — MapLibre uses these for sprite atlases and dynamically-generated tile placeholders.
- `worker-src 'self' blob:` — MapLibre instantiates its tile-decoding workers via Blob URLs.
- `script-src 'self'` does **not** include `'unsafe-inline'` or `'unsafe-eval'`. The app uses ES modules (`type="module"`); nothing inline.
- `frame-ancestors 'none'` makes the site unembeddable in iframes — clickjacking defense and a small privacy win (no embedding in an upstream surveillance-friendly product).
- `upgrade-insecure-requests` — any accidental `http://` reference (in user-pasted address text rendered into the page, for instance) gets force-upgraded by the browser.

The CSP does **not** include `report-uri` or `report-to`. Reporting endpoints are themselves third-party network calls; we accept the absence of CSP violation telemetry as the price of zero phone-home.

### 4.4 Reverse proxy mapping (1:1 with Vite dev proxy)

The Vite dev proxy lives at `vite.config.ts` and proxies three paths. The Caddyfile mirrors them:

| Browser-side request | Caddyfile rule | Upstream (server-side) | Notes |
|---|---|---|---|
| `GET /valhalla/route` | `handle_path /valhalla/*` → `reverse_proxy valhalla:8002` | `http://valhalla:8002/route` on the docker bridge | `handle_path` strips `/valhalla` before proxying, matching Vite's `rewrite: path.replace(/^\/valhalla/, '')`. Valhalla is not exposed on the host; only Caddy can reach it. |
| `GET /photon/api?q=...` | `handle_path /photon/*` → `reverse_proxy https://photon.komoot.io` (with `header_up Host photon.komoot.io`) | `https://photon.komoot.io/api?q=...` | Matches Vite's `changeOrigin: true`. The browser never sees `photon.komoot.io`. |
| `GET /dataset/cameras-us.json` | `handle_path /dataset/*` → `reverse_proxy https://github.com` (path rewrite to release asset URL) | `https://github.com/stevenkozeniesky02/flock-avoid/releases/latest/download/cameras-us.json` (which redirects to the actual asset CDN) | Matches Vite's `/dataset` rewrite. Caddy follows redirects, so the browser sees only Caddy's TLS endpoint. |

What the browser sees in production:
- Same-origin: `/`, `/assets/*`, `/sw.js`, `/manifest.webmanifest`, `/icons/*`, `/valhalla/*`, `/dataset/*`, `/photon/*`.
- Cross-origin: `*.tile.openstreetmap.org` for raster basemap tiles (unchanged from dev, unchanged from day one, allowlisted explicitly).
- Nothing else.

That set is identical to what the browser sees against the dev server today. The privacy invariant is preserved by construction.

### 4.5 Container topology

```
                            (public internet)
                                   │  443/tcp
                                   ▼
                          ┌────────────────┐
                          │  Caddy (TLS)   │  serves /, /assets/*, /sw.js, /manifest
                          │  Caddyfile     │  reverse-proxies /valhalla, /dataset, /photon
                          └─┬───────┬──────┘
                            │       │
              dist/  RO mnt │       │ docker bridge net
                            │       ▼
                            │  ┌────────────┐
                            │  │ valhalla   │  (from ../docker-compose.yml)
                            │  │ :8002      │
                            │  └────────────┘
                            │
                            │       (one-shot, exits clean once dist/ is written)
                            ▼
                    ┌────────────────┐
                    │  web-builder   │  `npm ci && npm run build`
                    │  node:20-alpine│  output → dist named volume
                    └────────────────┘
```

`web-builder` runs once on `docker compose up`, exits with status 0, and is restarted only when the operator re-runs `docker compose up --build web-builder` (e.g. after `git pull`). The named volume `flock-dist` is shared read-write to web-builder and read-only to caddy.

`valhalla` is imported from the existing `docker-compose.yml` via the Compose v2 `include:` keyword. No copy/paste; the dev compose remains the single source of truth for the Valhalla service definition. The prod compose only changes how Valhalla is exposed: it joins the docker bridge net and does **not** publish `127.0.0.1:8002` to the host (that publish is overridden away).

The compose network is `flock-net` (a single user-defined bridge). All three services join. DNS-resolved service names are: `caddy`, `valhalla`, `web-builder`.

The compose stack is single-host. Multi-host deployments — Valhalla on a beefier box, Caddy on a smaller one — work by changing the `valhalla:8002` upstream in the Caddyfile to a private DNS name, and removing the `valhalla` service from the prod compose. Documented in `docs/DEPLOYMENT.md`.

### 4.6 TLS

Caddy v2 enables automatic HTTPS by default. The operator supplies:
- `FLOCK_DOMAIN=flock-avoid.example.com` (required)
- `FLOCK_ACME_EMAIL=ops@example.com` (recommended; Let's Encrypt uses it for expiry reminders)

On first start, Caddy:
1. Listens on :80 and :443.
2. Resolves the ACME HTTP-01 challenge over :80.
3. Obtains a certificate from Let's Encrypt.
4. Begins serving HTTPS.
5. Auto-renews 30 days before expiry, indefinitely.

Cert storage lives in a persistent named volume `caddy-data` (private-key material; the operator should treat this volume as sensitive backup).

For internal staging / localhost testing, Caddy uses its internal CA if `FLOCK_DOMAIN=localhost`. Documented.

For operator-supplied certs (corporate CA, air-gapped), `deploy/.env.prod.example` documents the `FLOCK_TLS_CERT_PATH` and `FLOCK_TLS_KEY_PATH` overrides, and `Caddyfile.snippets` carries the alternate `tls` directive commented in.

### 4.7 Service worker delivery

Three constraints:

1. **MIME type:** `/sw.js` must be served with `Content-Type: application/javascript` (or `text/javascript`). Caddy's default is correct based on the `.js` extension; explicit in the Caddyfile for safety.
2. **Scope:** the SW registers with `scope: '/'`. Because `/sw.js` is at the document root, no `Service-Worker-Allowed` header is needed.
3. **Cacheability:** `/sw.js` gets `Cache-Control: no-cache, no-store, must-revalidate`. This is the standard mitigation for the "stuck-SW" failure mode.

`/manifest.webmanifest` is similarly handled:
1. `Content-Type: application/manifest+json` (explicit; Caddy's mime DB does not always include `.webmanifest`).
2. `Cache-Control: no-cache, must-revalidate`.

## 5. Privacy posture

The deployment configuration is the privacy invariant's production embodiment. It must reproduce, not weaken, the same-origin guarantee that Vite enforces in dev.

- **Browser-facing host list — unchanged.** The Caddy upstream list (`valhalla:8002`, `photon.komoot.io`, `github.com`) is invisible to the browser. The browser sees its own origin plus the three OSM tile hosts that have been in the allowlist since day one.
- **The CSP enforces it.** `default-src 'self'` denies any new origin by default; `connect-src` and `img-src` add only the OSM tile hosts; nothing else is reachable from a script injected into the page.
- **No third-party CDN for app code.** `dist/` is served by Caddy from a local volume. No `unpkg`, no `cdn.jsdelivr`, no `cdn.skypack`.
- **No analytics.** No GA, no Plausible, no umami, no first-party telemetry. The compose stack ships zero observability beyond Caddy's own stdout/stderr.
- **No log shipping.** Caddy logs to its own stdout/stderr; the operator chooses whether to pipe that to a local file or a SaaS, and the doc warns about the latter.
- **No tracking pixels / preconnect / DNS-prefetch hints to any host.** The shipped HTML is unchanged from Sub-project D.
- **HSTS + COOP + strict CSP + Permissions-Policy** form a defense-in-depth package: even if a future PR accidentally introduces an inline script or a new third-party fetch, the CSP refuses it at the browser.
- **Referrer-Policy `no-referrer`** prevents any outbound link the user clicks (e.g. a future "open in OpenStreetMap" link, if we ever ship one) from leaking the path of the source page.
- **Valhalla is not publicly exposed.** Routing requests reach Valhalla only through the Caddy proxy, which means the only thing the public internet can see is Caddy's HTTPS endpoint. The dev compose's `127.0.0.1:8002` bind is intentionally overridden away in the prod compose.
- **Privacy invariant test is unaffected.** It runs against `localhost:5173` (the Vite dev server) by design; the production headers are unit-tested separately so a Caddyfile change that weakened the same-origin posture would fail in CI without needing a live origin.

## 6. Testing approach

**Unit (vitest):**

- `tests/unit/deploy/caddyfile.test.ts` — read `deploy/Caddyfile` and `deploy/Caddyfile.snippets` as text; assert:
  - The three `handle_path` blocks for `/valhalla/*`, `/photon/*`, `/dataset/*` exist with the expected upstreams.
  - The CSP header line is present and contains the directives listed in §4.3.
  - HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, X-Frame-Options are all present with the expected values.
  - `/sw.js` matcher sets `Cache-Control: no-cache, no-store, must-revalidate`.
  - `/assets/*` matcher sets the immutable long-cache header.
  - No host appears in the file except the documented set (`valhalla`, `photon.komoot.io`, `github.com`, the OSM tile hosts in CSP).
- `tests/unit/deploy/csp.test.ts` — extract the CSP value out of the snippet file, parse it into a directive map, and assert directive-by-directive:
  - `default-src` is exactly `'self'`.
  - `script-src` is exactly `'self'` (no `'unsafe-inline'`, no `'unsafe-eval'`).
  - `connect-src` and `img-src` include `'self'` plus the OSM tile hosts; no other hosts.
  - `frame-ancestors` is `'none'`.
  - `object-src` is `'none'`.
  - `base-uri` is `'self'`.
  - `worker-src` allows `blob:` (MapLibre requirement).

**Offline lint (optional, documented; not in CI):**

- `npm run deploy:caddy:validate` runs `caddy validate` in a transient docker container against the committed Caddyfile. Detects syntax errors and unknown directives. Skipped if Docker is not available; operator-facing.

**E2E + privacy (Playwright):**

- Unchanged. The existing privacy invariant test runs against the dev server and continues to verify the runtime same-origin posture. Verifying the production posture would require standing up Caddy in CI, which adds substantial test infrastructure for a config-only change; the unit tests above pin the config statically.

**Build:**

- `npm run build` must continue to succeed. (Sub-project E does not touch any TS source.)

**Manual / operator verification (documented, not run in CI):**

- The deployment guide walks through `curl -I https://flock-avoid.example.com/` and confirming the headers, plus `curl https://flock-avoid.example.com/valhalla/status` and confirming the proxy reaches Valhalla. Owner-driven.

## 7. Acceptance criteria

Sub-project E is "done" when:

1. `deploy/Caddyfile`, `deploy/Caddyfile.snippets`, `deploy/docker-compose.prod.yml`, `deploy/.env.prod.example`, and `deploy/README.md` exist with the documented content.
2. `docs/DEPLOYMENT.md` exists and covers prerequisites, what the operator must supply, build steps, TLS, bring-up, verification, rollback, and troubleshooting.
3. `tests/unit/deploy/caddyfile.test.ts` and `tests/unit/deploy/csp.test.ts` exist and pass.
4. `npx tsc --noEmit` clean. `npm run lint` clean (no new warnings). `npm test` passes. `npx playwright test tests/privacy/ tests/e2e/` passes. `npm run build` succeeds.
5. The Atlanta benchmark is no worse than it was on `feat/phase-0b-3b-pwa` (the pre-existing PR #4 sibling-fix issue is documented; no new regression introduced here).
6. `src/privacy/networkAllowlist.ts` is unchanged.
7. `vite.config.ts` is unchanged.
8. `docker-compose.yml` (the dev compose) is unchanged.
9. `package.json` has exactly one new script (`deploy:caddy:validate`); no dependency changes.
10. No live deployment was performed. No domain was registered. No cloud resources were provisioned. The PR body says so explicitly.
11. If the author ran `caddy validate` offline against the committed Caddyfile (in a docker container with no network access), the result is reported in the PR body.

## 8. Out of scope explicitly

- **Actually deploying anything to a live public origin.** Hardest line in the spec. Configuration + docs only.
- **A `/tiles/*` same-origin proxy.** Real privacy improvement; out of scope due to the no-allowlist-edits / no-mapView-edits guardrails. Documented as a follow-up.
- **Rate limiting on the proxy paths.** Useful in production; deferred to a focused follow-up.
- **CI auto-deploy.** Off by spec.
- **Pre-built container images / a release pipeline.** The compose stack builds from source.
- **Multi-host / horizontal scale.** Single-host is what we ship.
- **Centralized log shipping or APM.** Privacy-sensitive; left to operator discretion.
- **Backup automation.** Doc-only; everything is reproducible from source + the nightly dataset Action.
- **nginx alternate.** Caddy only; doubling the config surface is the wrong tradeoff.
- **A separate staging-origin config.** Same Caddyfile covers staging by varying `FLOCK_DOMAIN`. Documented.

## 9. Risk register

| Risk | Likelihood | Mitigation |
|---|---|---|
| The CSP breaks MapLibre in production but the unit test passes (the unit test does not load MapLibre). | Medium | The Playwright e2e tests run against `localhost:5173` and exercise the map. They do not exercise the production CSP directly, but they do prove that the listed CSP allowances cover MapLibre's actual fetch/worker behavior. Operator-side, the deployment guide says to load `/` in a browser and confirm the map renders before declaring go-live successful — a 30-second check. |
| A future PR adds an inline `<script>` tag to `index.html`; the CSP blocks it; the app silently fails to boot in prod but works in dev. | Medium | The CSP unit test pins `script-src 'self'` with no `'unsafe-inline'`. Anyone trying to weaken it has to touch the test. The CSP rationale section in this spec explains why. |
| Caddy auto-renews the cert and the new key triggers some pinning-style failure downstream. | Low | We don't ship any certificate pinning. HSTS pins the policy of "use HTTPS," not a specific cert. Re-issuance is invisible to clients. |
| `web-builder` runs `npm ci` and the lockfile resolves to a new transitive version (supply-chain risk). | Low (lockfile pins) | `npm ci` is strict-lockfile mode; same set of bytes as the host-side build. The container itself is a pinned base image. |
| The prod compose's `include: ../docker-compose.yml` breaks if the dev compose changes incompatibly. | Low | The include is documented; the prod compose pins the path; a `compose config` check is part of the deployment guide. |
| Operator uses Caddy's internal CA in prod by mistake. | Low | `FLOCK_DOMAIN=localhost` is the only way to opt in; the example file's default value is a placeholder domain, not `localhost`. The doc calls this out. |
| A future Caddyfile edit accidentally drops a security header. | Low | Unit test pins every header by exact name. A regression fails the test, not silently the prod posture. |
| The CSP test passes locally, the operator strips it via reverse-proxy-in-front-of-Caddy (e.g. a load balancer), and the prod site ships with no CSP. | Documented | The deployment guide explicitly warns: "if you put another reverse proxy in front of Caddy, that proxy must not strip Caddy's response headers." |
| Memory: Valhalla on full-US tiles + Caddy + Node-build on the same VM exhausts RAM. | Medium | `docs/DEPLOYMENT.md` documents the sizing: 8 GB RAM minimum if the operator runs the full-US Valhalla container; 4 GB is enough for Atlanta-only. The `web-builder` runs once and exits; its peak is brief. |
| The deployment guide gets stale as the stack evolves. | Medium | Acceptance criterion #10 in the spec keeps the doc honest about state-at-write-time. Reviewable by operators on first go-live. |
| Logs include user-typed Photon queries via the proxy and the operator forwards them to a third party. | Medium if the operator wires log shipping | `docs/DEPLOYMENT.md` § "Logging and privacy" calls this out: by default we log status code + method + path; the query string for `/photon/*` is **redacted** at Caddy via a `log_format` directive. Documented + enforced by the Caddyfile. |

## 10. Open questions

| Q | Default unless told otherwise |
|---|---|
| Should we ship a sample `systemd` unit that wraps `docker compose up`? | No — adds OS-coupling. The deployment guide gives the snippet as copy-paste prose. |
| Should the Caddyfile include a default error page? | Caddy's default is fine. Custom error pages are polish. |
| Should we redact the User-Agent in Caddy's logs? | Yes — `log_format` strips it by default. |
| Should we add `/healthz` for Kubernetes-style probes? | Not yet. The compose stack is not k8s-shaped. A simple `curl https://.../` is the operator's health check. |
| Should the CSP block `eval` in workers as well? | Already covered by `script-src 'self'` (which applies to workers); MapLibre does not eval. |
| Should `Caddyfile` `auto_https off` for staging? | Configurable via env (`FLOCK_AUTO_HTTPS=off`); default on. Documented. |
| Should we ship a "deploy-check" script that confirms expected headers after bring-up? | Out of scope (live origin); documented as a curl-based recipe in the guide. |
| Should we pre-build a `caddy:2-alpine`-derived image with our config baked in? | No. The Caddyfile is mounted in. Bake-in is a release-pipeline question. |
| Should the deployment guide link to a specific cloud provider's setup? | No — pure infrastructure-agnostic doc. Caddy + docker compose work the same on a $5 VPS or a beefy bare metal box. |

---

**Next step after spec approval:** implement task-by-task per the companion plan (`docs/superpowers/plans/2026-05-22-flock-avoid-phase-0b-3b-deploy.md`).

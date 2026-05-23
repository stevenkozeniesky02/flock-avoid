# Phase 0b-3b · Sub-project E — Public Deployment + Reverse Proxy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a production-ready Caddy reverse proxy configuration, a docker compose stack that orchestrates Caddy + Valhalla + a hermetic build of the SPA, security headers + a strict CSP that enforces the same-origin posture in production, and an operator deployment guide — without performing any live deployment, registering any domain, or provisioning any cloud resources.

**Spec:** `docs/superpowers/specs/2026-05-22-flock-avoid-phase-0b-3b-deploy.md`
**Branch:** `feat/phase-0b-3b-deploy` (stacked on `feat/phase-0b-3b-pwa`)
**Baseline:** vitest + Playwright (privacy + e2e) green on `feat/phase-0b-3b-pwa`. Atlanta benchmark in a known pre-existing red state (PR #4 sibling fix not yet merged down); do not regress further.

---

## File Structure (created or modified by this plan)

```
README.md                                       MODIFY · one-paragraph link to docs/DEPLOYMENT.md
package.json                                    MODIFY · add deploy:caddy:validate npm script

deploy/                                         NEW DIR
  Caddyfile                                     NEW   · top-level config; site block, imports, env interpolation
  Caddyfile.snippets                            NEW   · header + CSP snippets used by Caddyfile
  docker-compose.prod.yml                       NEW   · include ../docker-compose.yml; add caddy + web-builder
  .env.prod.example                             NEW   · documented operator-supplied env (no real values)
  README.md                                     NEW   · 30-line orientation pointing at docs/DEPLOYMENT.md

docs/
  DEPLOYMENT.md                                 NEW   · operator-facing guide
  superpowers/specs/2026-05-22-flock-avoid-phase-0b-3b-deploy.md   (spec, exists)
  superpowers/plans/2026-05-22-flock-avoid-phase-0b-3b-deploy.md   (this file)

tests/
  unit/deploy/
    caddyfile.test.ts                           NEW
    csp.test.ts                                 NEW
```

**Dependency graph (task order):**

```
01 (deploy/Caddyfile.snippets)        — CSP + headers, the heart of the security posture
02 (deploy/Caddyfile)                  — uses 01
03 (deploy/docker-compose.prod.yml)    — includes ../docker-compose.yml + adds caddy + web-builder
04 (deploy/.env.prod.example + deploy/README.md)  — orientation
05 (tests/unit/deploy/csp.test.ts)     — pins the CSP composition  (TDD: write before 01 stabilizes)
06 (tests/unit/deploy/caddyfile.test.ts) — pins headers + upstreams (TDD: write before 02 stabilizes)
07 (docs/DEPLOYMENT.md)                — operator guide
08 (README.md + package.json edits)
09 (verification: tsc, lint, vitest, playwright, build, caddy validate)
10 (commit, push, PR)
```

Tasks 01 and 05 are intertwined (TDD); same for 02 and 06.

---

## Pre-flight (before Task 1)

- [ ] Confirm you are on `feat/phase-0b-3b-deploy` (created off `feat/phase-0b-3b-pwa`).
- [ ] Run baseline:
      `npx tsc --noEmit` → 0 errors.
      `npm run lint` → 0 errors; one pre-existing warning is acceptable; do not introduce new ones.
      `npm test` → all tests pass.
      `npm run build` → succeeds.
      `npx playwright test tests/privacy/ tests/e2e/` → passes (Valhalla running; expected for some specs to skip otherwise).
- [ ] If baseline fails for reasons unrelated to the documented benchmark issue, STOP and report; do not start until green.

---

## Task 1 — CSP + headers snippet: `deploy/Caddyfile.snippets` (TDD with Task 5)

**Why:** The CSP and security headers are the production teeth on the same-origin posture. They are the part of the deployment that's most security-relevant and most testable statically. Extracting them into a snippet file keeps the main Caddyfile small and makes the CSP unit test trivially target one file.

**Files:**
- Create: `deploy/Caddyfile.snippets`
- Create: `tests/unit/deploy/csp.test.ts` (Task 5 — write tests first)

- [ ] **Step 1: Write `tests/unit/deploy/csp.test.ts` first (RED).** Pin the CSP composition:
  - Extract the CSP value from the snippet file via a deterministic regex (e.g. matching `Content-Security-Policy "..."`).
  - Parse the value into a directive map (split on `;`, trim, split on first whitespace).
  - Assert `default-src` is exactly `['\'self\'']`.
  - Assert `script-src` is exactly `['\'self\'']`; does not contain `'unsafe-inline'` or `'unsafe-eval'`.
  - Assert `style-src` contains `'self'` and `'unsafe-inline'` (the only allowance, justified in spec §4.3).
  - Assert `connect-src` contains `'self'`, `https://a.tile.openstreetmap.org`, `https://b.tile.openstreetmap.org`, `https://c.tile.openstreetmap.org`; contains no other host.
  - Assert `img-src` contains `'self'`, `data:`, `blob:`, and the same OSM tile hosts; contains no other host.
  - Assert `font-src` is exactly `['\'self\'']`.
  - Assert `worker-src` contains `'self'` and `blob:`.
  - Assert `manifest-src` is exactly `['\'self\'']`.
  - Assert `object-src` is exactly `['\'none\'']`.
  - Assert `base-uri` is exactly `['\'self\'']`.
  - Assert `form-action` is exactly `['\'self\'']`.
  - Assert `frame-ancestors` is exactly `['\'none\'']`.
  - Assert `upgrade-insecure-requests` is present (boolean directive).
- [ ] **Step 2: Run the test — it should FAIL (RED).** No snippet file exists yet.
- [ ] **Step 3: Write `deploy/Caddyfile.snippets`.** A Caddy snippet block (`(security_headers) { header { ... } }`) that emits:
  - `Strict-Transport-Security "max-age=63072000; includeSubDomains"`
  - `Content-Security-Policy "..."` — the directive list exactly as the test pins it
  - `X-Content-Type-Options "nosniff"`
  - `Referrer-Policy "no-referrer"`
  - `X-Frame-Options "DENY"`
  - `Permissions-Policy "geolocation=(), camera=(), microphone=(), payment=(), usb=(), accelerometer=(), gyroscope=(), magnetometer=(), interest-cohort=(), browsing-topics=()"`
  - `Cross-Origin-Opener-Policy "same-origin"`
  - Remove `Server` header.
- [ ] **Step 4: Run the CSP test — it should PASS (GREEN).**
- [ ] **Step 5: Verify lint passes.** The new test should not introduce ESLint errors.

**Acceptance:** `tests/unit/deploy/csp.test.ts` is green; `deploy/Caddyfile.snippets` contains the named snippet and a documented header block.

---

## Task 2 — `deploy/Caddyfile` (TDD with Task 6)

**Why:** The Caddyfile is the production reverse proxy. It must (a) serve the built SPA, (b) reverse-proxy the three same-origin paths, (c) import the security-headers snippet, (d) set the right cache headers on `/sw.js`, `/manifest.webmanifest`, `/assets/*`, and (e) terminate HTTPS via ACME.

**Files:**
- Create: `deploy/Caddyfile`
- Create: `tests/unit/deploy/caddyfile.test.ts` (Task 6 — write tests first)

- [ ] **Step 1: Write `tests/unit/deploy/caddyfile.test.ts` first (RED).** Pin the Caddyfile structure:
  - Read `deploy/Caddyfile` as text.
  - Assert it imports the `security_headers` snippet.
  - Assert it has `handle_path /valhalla/* { reverse_proxy valhalla:8002 }` (or equivalent — match by regex tolerant of whitespace).
  - Assert it has `handle_path /photon/* { reverse_proxy https://photon.komoot.io { header_up Host photon.komoot.io ... } }`.
  - Assert it has a `handle_path /dataset/*` block that proxies to `https://github.com` with a `rewrite` that produces `/stevenkozeniesky02/flock-avoid/releases/latest/download/...`.
  - Assert it has a `@swfile` matcher (path `/sw.js`) with `Cache-Control "no-cache, no-store, must-revalidate"`.
  - Assert it has a `@manifest` matcher (path `/manifest.webmanifest`) with `Cache-Control "no-cache, must-revalidate"` and `Content-Type "application/manifest+json"`.
  - Assert it has an `@assets` matcher (path `/assets/*`) with `Cache-Control "public, max-age=31536000, immutable"`.
  - Assert it has a `file_server` directive serving `dist`.
  - Assert it has a `log` block whose `format` filter strips the `query` field (privacy: do not log Photon search strings).
  - Assert it does NOT contain any host that isn't in the documented set (`valhalla`, `photon.komoot.io`, `github.com`, the OSM tile hosts mentioned only in CSP).
- [ ] **Step 2: Run the test — it should FAIL (RED).** No Caddyfile yet.
- [ ] **Step 3: Write `deploy/Caddyfile`.** Structure:
  ```
  {
    email {$FLOCK_ACME_EMAIL}
    auto_https {$FLOCK_AUTO_HTTPS:on}
  }

  import Caddyfile.snippets

  {$FLOCK_DOMAIN:localhost} {
    root * /srv/dist
    encode gzip zstd
    import security_headers

    log {
      output stdout
      format filter {
        wrap json
        fields {
          query delete
          request>headers>User-Agent delete
          request>headers>Cookie delete
          request>headers>Authorization delete
        }
      }
    }

    @swfile path /sw.js
    header @swfile Cache-Control "no-cache, no-store, must-revalidate"
    header @swfile Content-Type "application/javascript; charset=utf-8"

    @manifest path /manifest.webmanifest
    header @manifest Cache-Control "no-cache, must-revalidate"
    header @manifest Content-Type "application/manifest+json"

    @assets path /assets/*
    header @assets Cache-Control "public, max-age=31536000, immutable"

    handle_path /valhalla/* {
      reverse_proxy valhalla:8002
    }

    handle_path /photon/* {
      reverse_proxy https://photon.komoot.io {
        header_up Host photon.komoot.io
        header_up -X-Forwarded-For
        header_up -X-Real-IP
      }
    }

    handle_path /dataset/* {
      rewrite * /stevenkozeniesky02/flock-avoid/releases/latest/download{path}
      reverse_proxy https://github.com {
        header_up Host github.com
        header_up -X-Forwarded-For
        header_up -X-Real-IP
      }
    }

    handle {
      try_files {path} /index.html
      file_server
    }
  }
  ```
  Notes:
  - `email {$FLOCK_ACME_EMAIL}` reads from env; safe default empty (Caddy still functions for `localhost`).
  - `{$FLOCK_DOMAIN:localhost}` site label uses Caddy's `:default` env syntax.
  - `auto_https {$FLOCK_AUTO_HTTPS:on}` allows operators to disable ACME for staging.
  - `header_up -X-Forwarded-For` and `header_up -X-Real-IP` strip Caddy's added client-IP headers from upstream requests. This means the upstream services (photon.komoot.io, github.com) see only Caddy's IP, not the end user's. Privacy-positive — and matches what the Vite proxy does today (it does not forward the original IP through `changeOrigin: true`).
  - Query string redaction in the log format prevents Photon search terms from appearing in operator logs.
- [ ] **Step 4: Run the test — it should PASS (GREEN).**

**Acceptance:** `tests/unit/deploy/caddyfile.test.ts` is green; `deploy/Caddyfile` covers the documented surface.

---

## Task 3 — `deploy/docker-compose.prod.yml`

**Why:** Single command to bring the full prod stack up: includes the existing Valhalla compose service unchanged, adds Caddy with the new Caddyfile mounted, and adds a one-shot `web-builder` that produces the `dist/` volume.

**Files:**
- Create: `deploy/docker-compose.prod.yml`

- [ ] **Step 1: Write the compose file.** Structure:
  ```yaml
  include:
    - ../docker-compose.yml

  services:
    valhalla:
      networks: [flock-net]
      ports: !reset []   # override the dev compose's 127.0.0.1:8002 bind — only reachable on the bridge net

    web-builder:
      image: node:20-alpine
      working_dir: /src
      volumes:
        - ../:/src:ro
        - flock-dist:/src/dist
      command: sh -c "cp -r /src/* /work/ && cd /work && npm ci && npm run build && cp -r dist/* /out/"
      # The above command pattern is documented; alternate cleaner approaches noted below.
      networks: [flock-net]
      restart: "no"

    caddy:
      image: caddy:2-alpine
      depends_on:
        web-builder:
          condition: service_completed_successfully
        valhalla:
          condition: service_started
      ports:
        - "80:80"
        - "443:443"
        - "443:443/udp"
      volumes:
        - ./Caddyfile:/etc/caddy/Caddyfile:ro
        - ./Caddyfile.snippets:/etc/caddy/Caddyfile.snippets:ro
        - flock-dist:/srv/dist:ro
        - caddy-data:/data
        - caddy-config:/config
      environment:
        FLOCK_DOMAIN: "${FLOCK_DOMAIN:-localhost}"
        FLOCK_ACME_EMAIL: "${FLOCK_ACME_EMAIL:-}"
        FLOCK_AUTO_HTTPS: "${FLOCK_AUTO_HTTPS:-on}"
      networks: [flock-net]
      restart: unless-stopped

  volumes:
    flock-dist:
    caddy-data:
    caddy-config:

  networks:
    flock-net:
      driver: bridge
  ```
- [ ] **Step 2: Re-think the web-builder command.** The cleanest approach: bind-mount the source read-only, build into a named volume mounted at a separate path.
  Revised command:
  ```
  command: sh -c "cp -r /src/. /build && cd /build && npm ci && npm run build && rm -rf /out/* && cp -r /build/dist/. /out/"
  ```
  with bind mounts `../:/src:ro` and `flock-dist:/out`, plus a tmpfs at `/build` (or a scratch named volume). The doc explains why we copy rather than building in-place at `/src` (read-only mount).
  Simpler: `volumes: ../:/src:ro, flock-dist:/out` and command `sh -c "cp -a /src /build && cd /build && npm ci && npm run build && cp -a dist/. /out/"`.
- [ ] **Step 3: Spot-check syntactic validity** by running `docker compose -f deploy/docker-compose.prod.yml config` if Docker is available. (If not, document as a manual operator step.)

**Acceptance:** `deploy/docker-compose.prod.yml` exists with `include: ../docker-compose.yml`, adds caddy + web-builder, overrides the valhalla host port bind, and uses named volumes for `dist`, ACME data, and Caddy config.

---

## Task 4 — `deploy/.env.prod.example` + `deploy/README.md`

**Why:** Discoverability and operator clarity. The example env file documents the toggles; the README is the entry point for someone who opens `deploy/` cold.

**Files:**
- Create: `deploy/.env.prod.example`
- Create: `deploy/README.md`

- [ ] **Step 1: Write `deploy/.env.prod.example`.** Content (no real values):
  ```
  # Copy to deploy/.env.prod and edit. NEVER commit deploy/.env.prod.

  # REQUIRED. The public domain the SPA will be served from.
  # For localhost / internal-CA testing, set to: localhost
  FLOCK_DOMAIN=flock-avoid.example.com

  # RECOMMENDED. Let's Encrypt uses this address for expiry notifications.
  # Leave empty for ZeroSSL fallback (Caddy default).
  FLOCK_ACME_EMAIL=

  # Set to "off" to disable automatic HTTPS (use with FLOCK_DOMAIN=localhost
  # or with FLOCK_TLS_CERT_PATH + FLOCK_TLS_KEY_PATH for operator-supplied certs).
  FLOCK_AUTO_HTTPS=on

  # OPTIONAL. Submit the site to the HSTS preload list — one-way ratchet.
  # Do not enable until you are confident in the long-lived HTTPS commitment.
  FLOCK_HSTS_PRELOAD=0
  ```
- [ ] **Step 2: Write `deploy/README.md`.** ~30 lines: what this directory is, what files it contains, point at `docs/DEPLOYMENT.md` as the source of truth, and the one-command bring-up summary.

**Acceptance:** Both files exist; example file documents every env the Caddyfile consumes.

---

## Task 5 — `tests/unit/deploy/csp.test.ts`

Already written in Task 1's TDD pair. This task is the formal task-list slot.

**Acceptance:** Green; covers every CSP directive listed in §4.3 of the spec.

---

## Task 6 — `tests/unit/deploy/caddyfile.test.ts`

Already written in Task 2's TDD pair. This task is the formal task-list slot.

**Acceptance:** Green; covers every directive listed in §4.4 and §4.7 of the spec.

---

## Task 7 — `docs/DEPLOYMENT.md`

**Why:** The operator's manual. Reading order: prerequisites → what to supply → bring up → verify → roll back → troubleshoot. Plus the privacy + logging discussion that gives the operator the threat model the spec assumes.

**Files:**
- Create: `docs/DEPLOYMENT.md`

- [ ] **Step 1: Write the doc.** Sections:
  - **TL;DR** — three-line summary: `cp deploy/.env.prod.example deploy/.env.prod`; edit; `docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.prod up -d`.
  - **What this gets you** — a privacy-preserving deployment with same-origin routing/geocoding/dataset proxies, automatic HTTPS, a hand-rolled SW, and a CSP that the unit tests pin.
  - **What you must supply** — domain, server, optionally the full-US Valhalla tile build (or accept Atlanta-only).
  - **Prerequisites** — Docker 24+ with Compose v2.20+ (for `include:`), at least 4 GB RAM (8 GB if running full-US Valhalla), DNS A/AAAA record pointing at the server, ports 80 + 443 reachable from the public internet.
  - **Step-by-step** — `git clone`, `cp deploy/.env.prod.example deploy/.env.prod`, edit, `docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.prod up -d`.
  - **Verifying** — `curl -I https://<domain>/` expected headers (HSTS, CSP, X-Content-Type-Options, Referrer-Policy, Permissions-Policy); `curl https://<domain>/valhalla/status` expected JSON; `curl -I https://<domain>/sw.js` expected `Cache-Control: no-cache, no-store, must-revalidate`.
  - **TLS / certificates** — Caddy's auto-HTTPS by default; ZeroSSL fallback; how to supply a manual cert via `FLOCK_TLS_CERT_PATH`/`FLOCK_TLS_KEY_PATH` (commented snippet in `Caddyfile.snippets`).
  - **Rolling back** — `git checkout <prev-commit>` + `docker compose ... up -d --build web-builder` rebuilds the SPA at the old commit; Caddyfile changes are pulled in on Caddy restart.
  - **Logging and privacy** — what we log (status + method + path), what we redact (query string, User-Agent, Cookie, Authorization), and why centralized log shipping should be evaluated against the operator's own threat model.
  - **Multi-host deploys** — how to split Valhalla off to its own box (change the `valhalla:8002` upstream).
  - **Troubleshooting** — common failure modes (port 80/443 blocked, DNS not resolving, web-builder OOM, ACME rate limit on retry).
  - **What this doc does NOT cover** — auto-deploy via CI, managed-Valhalla, k8s, multi-region, log shipping setup, backup automation. Pointers to where each becomes relevant.
- [ ] **Step 2: Run a final read-through.** Verify it is honest about what the operator must supply (domain, server, tiles), matches the file structure in §4.1 of the spec, and does not promise anything the configuration doesn't deliver.

**Acceptance:** A ~300-line operator-facing guide. Pure prose; no live URLs or credentials.

---

## Task 8 — README.md + package.json edits

**Why:** Discoverability from the project root and the optional Caddy validate script.

**Files:**
- Modify: `README.md` (add a one-paragraph "Deploying" link pointing at `docs/DEPLOYMENT.md`)
- Modify: `package.json` (add `deploy:caddy:validate` script)

- [ ] **Step 1: Add the README paragraph.** Place it near the existing run-locally section, before the data section. Keep it to ~3 sentences.
- [ ] **Step 2: Add the npm script.** `"deploy:caddy:validate": "docker run --rm -v $(pwd)/deploy:/etc/caddy:ro caddy:2-alpine caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile"`. Document in `deploy/README.md` and `docs/DEPLOYMENT.md` that this is optional and requires Docker.

**Acceptance:** README has the link; `package.json` has exactly one new script.

---

## Task 9 — Verification

- [ ] `npx tsc --noEmit` → 0 errors.
- [ ] `npm run lint` → 0 new errors / warnings.
- [ ] `npm test` → all tests pass (new CSP + Caddyfile tests included).
- [ ] `npx playwright test tests/privacy/ tests/e2e/` → passes (Valhalla running).
- [ ] `npm run build` → succeeds; `dist/` emitted.
- [ ] OPTIONAL: `npm run deploy:caddy:validate` → "Valid configuration". If Docker is unavailable, document as "not run in this PR" in the PR body.
- [ ] Benchmark suite not worse than baseline: re-run the same Atlanta benchmark step taken at pre-flight; same outcome (no new failures introduced).

---

## Task 10 — Commit, push, PR

- [ ] Stage changes in small logical commits (one per file group):
  - `chore(deploy): add Caddy reverse proxy config and snippets`
  - `chore(deploy): add prod docker-compose stack with hermetic builder`
  - `docs(deploy): add operator deployment guide`
  - `test(deploy): pin CSP composition and Caddyfile structure`
  - `docs(deploy): spec + plan for Phase 0b-3b Sub-project E`
  - `chore(deploy): add validate script and README link`
- [ ] Push branch.
- [ ] Open PR with `--base feat/phase-0b-3b-pwa`. Body includes:
  - Stack context (siblings + parents of this PR in the Phase 0b-3b stack).
  - Privacy story: how the production deploy preserves the same-origin posture and reproduces the dev proxy 1:1.
  - The full CSP, expanded.
  - What the operator must supply to go live.
  - Explicit statement: **NO live deployment was performed.** No domain registered. No cloud resources provisioned.
  - Test results: tsc, lint, vitest, playwright, build, optional `caddy validate`.
  - Note that this stacks on PR #8 and depends on PRs #3-#8 landing first.

---

## Definition of Done

- All ten tasks above complete and verified.
- All ten acceptance criteria from spec §7 met.
- PR opened against `feat/phase-0b-3b-pwa`, not `master`.
- No live deployment was performed.

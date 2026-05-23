# Phase 0b-3b · Sub-project C — Full-US Valhalla Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Valhalla routing capable of serving the entire continental United States, behind a switchable configuration that preserves today's zero-friction Atlanta dev flow as the default.

**Spec:** `docs/superpowers/specs/2026-05-22-flock-avoid-phase-0b-3b-full-us-valhalla.md`
**Branch:** `feat/phase-0b-3b-full-us-valhalla` (stacked on `feat/phase-0b-3b-directions`)
**Baseline:** vitest + Playwright (privacy + e2e) passing on `feat/phase-0b-3b-directions`. Atlanta benchmark passes; cross-city benchmarks skip cleanly.

---

## File Structure (created or modified by this plan)

```
docker-compose.yml                  MODIFY · parameterize tile_urls / volume / container_name with env defaults
.env.example                        NEW    · documents VALHALLA_* env vars
.gitignore                          MODIFY · valhalla_tiles/ → valhalla_tiles*/

scripts/
  build-valhalla-tiles.sh           MODIFY · honor VALHALLA_* env vars; extend readiness timeout
  build-valhalla-tiles-us.sh        NEW    · executable wrapper that exports full-US env + execs above

package.json                        MODIFY · add valhalla:up:full-us, valhalla:down:full-us, valhalla:build-tiles:us

docs/
  VALHALLA.md                       NEW    · operator-facing build + ops doc

README.md                           MODIFY · brief link to docs/VALHALLA.md

tests/benchmark/routes/
  memphis.spec.ts                   MODIFY · skip message points at docs/VALHALLA.md
  detroit.spec.ts                   MODIFY · same
  dallas.spec.ts                    MODIFY · same
  sanfrancisco.spec.ts              MODIFY · same

docs/superpowers/specs/2026-05-22-flock-avoid-phase-0b-3b-full-us-valhalla.md   (spec, exists)
docs/superpowers/plans/2026-05-22-flock-avoid-phase-0b-3b-full-us-valhalla.md   (this file)
```

**Dependency graph (task order):**
```
01 (docker-compose parameterize) ─ pure config; preserves Georgia defaults
02 (build-valhalla-tiles.sh modify) ── needs 01 (compose contract)
03 (build-valhalla-tiles-us.sh new) ── needs 02
04 (package.json scripts) ── needs 01, 03
05 (.env.example + .gitignore) ── needs 01
06 (docs/VALHALLA.md) ── needs 01–05 (cites them)
07 (README.md link) ── needs 06
08 (cross-city skip messages) ── needs 06 (cites the doc)
09 (verification: tsc + lint + vitest + playwright) ── needs all of the above
10 (optional: attempt full-US build) ── needs 09 passing AND adequate disk/RAM
11 (commit + push + PR) ── needs 09 passing
```

---

## Pre-flight (before Task 1)

- [ ] Confirm you are on `feat/phase-0b-3b-full-us-valhalla` (created off `feat/phase-0b-3b-directions`).
- [ ] Run baseline:
      `npx tsc --noEmit` → 0 errors.
      `npm test` → all green.
      `npm run lint` → 0 errors.
      `npx playwright test tests/privacy/ tests/e2e/` → all green (assumes Atlanta Valhalla is up; otherwise privacy + e2e cleanly skip).
- [ ] Confirm the existing Atlanta Valhalla container is running: `curl -sf http://localhost:8002/status > /dev/null && echo OK`. If it's down, that's fine for this work, but note it for the verification phase.
- [ ] If the typecheck or lint baseline fails, stop and report — do not start until green.

---

## Task 1 — Parameterize `docker-compose.yml`

**Why:** Today's compose file hard-codes the Georgia URL, the mount, and the container name. Parameterizing each with env defaults that equal the current values gives us the switchable full-US mode without breaking the existing dev flow.

**Files:**
- Modify: `docker-compose.yml`

- [ ] **Step 1: Rewrite `docker-compose.yml`** to the form in spec §4.3. Specifically:
  - `container_name: ${VALHALLA_CONTAINER_NAME:-flock-avoid-valhalla}`
  - `volumes: - ${VALHALLA_TILES_DIR:-./valhalla_tiles}:/custom_files`
  - `environment: - tile_urls=${VALHALLA_TILE_URLS:-https://download.geofabrik.de/north-america/us/georgia-latest.osm.pbf}`
  - `environment: - server_threads=${VALHALLA_SERVER_THREADS:-2}`
  - All other env vars (`serve_tiles`, `build_admins`, `build_time_zones`, `force_rebuild`, `use_tiles_ignore_pbf`) and the port mapping stay exactly as they are.
- [ ] **Step 2: Validate the YAML.**
      `docker compose config -q` (no output = OK).
- [ ] **Step 3: Validate Georgia defaults are byte-equivalent.**
      `docker compose config | grep -E 'container_name|tile_urls|/custom_files'` — the values must match the pre-PR file.

**Done when:** the file parses, `docker compose config` shows the original Georgia values when no env is set, and `VALHALLA_TILE_URLS=foo VALHALLA_TILES_DIR=bar VALHALLA_CONTAINER_NAME=baz docker compose config` shows `foo`, `bar`, `baz` substituted in.

---

## Task 2 — Update `scripts/build-valhalla-tiles.sh` to be env-aware

**Why:** The script's banner text says "downloads ~250MB Georgia OSM PBF" — accurate for the default but wrong when the operator invokes it under the full-US env vars. The script's readiness timeout (30 min) is also too short for any non-Georgia build. We make the script honest by reading the same env vars the compose file does and tuning its banner + timeout accordingly.

**Files:**
- Modify: `scripts/build-valhalla-tiles.sh`

- [ ] **Step 1: Read the env vars at the top of the script.**
      Add (just below `cd "$(dirname "$0")/.."`):
      ```bash
      TILE_URLS="${VALHALLA_TILE_URLS:-https://download.geofabrik.de/north-america/us/georgia-latest.osm.pbf}"
      TILES_DIR="${VALHALLA_TILES_DIR:-./valhalla_tiles}"
      CONTAINER_NAME="${VALHALLA_CONTAINER_NAME:-flock-avoid-valhalla}"
      WAIT_LOOPS="${VALHALLA_WAIT_LOOPS:-180}"          # 180 * 10s = 30 min for Georgia
      ```
- [ ] **Step 2: Make the mkdir + banner text honor the env.**
      Change `mkdir -p valhalla_tiles` to `mkdir -p "$TILES_DIR"`.
      Change the banner text to reference `$TILE_URLS` and `$CONTAINER_NAME` (use printf with %s rather than echoing literal "Georgia" so the script is honest in both modes).
- [ ] **Step 3: Make the readiness loop use the configurable bound.**
      Change `for i in $(seq 1 180); do` to `for i in $(seq 1 "$WAIT_LOOPS"); do`.
      Change the timeout message at the bottom to compute "approximately $((WAIT_LOOPS * 10 / 60)) minutes" rather than hard-coding 30.
      Change the log-tail hint from `docker logs -f flock-avoid-valhalla` to `docker logs -f "$CONTAINER_NAME"`.
- [ ] **Step 4: Re-test Georgia default behavior end-to-end** (only if the existing Georgia Valhalla container is reachable on `localhost:8002`).
      Run the script with no env vars exported. It should detect the running container (or the already-built tiles, depending on state), pass through to `docker compose up -d`, and reach the "Valhalla is ready" branch within a few seconds. Do NOT tear down the existing container.

**Done when:** the script defaults to the same Georgia behavior as today; setting the env vars at invocation time substitutes them correctly into the banners and the readiness loop; the existing container remains untouched.

---

## Task 3 — New `scripts/build-valhalla-tiles-us.sh`

**Why:** The full-US wrapper. Sets the env vars, prints the resource-budget warning, and execs the main script. Two files instead of one flag because (a) the operator wants a clearly-named command they can grep for in `package.json`, and (b) we want a separate landing point for the resource warning that's specific to the full-US mode.

**Files:**
- Create: `scripts/build-valhalla-tiles-us.sh`

- [ ] **Step 1: Create the script.** Content:
      ```bash
      #!/usr/bin/env bash
      set -euo pipefail

      # Full-US Valhalla tile build wrapper. See docs/VALHALLA.md for the resource budget.

      cd "$(dirname "$0")/.."

      cat <<'WARN'
      ============================================================
      Full-US Valhalla tile build
      ============================================================
      This will download ~9 GB (us-latest.osm.pbf from Geofabrik)
      and build a continental US tile graph.

      Plan for:
        - 80–120 GB free disk during build
        - 8–16 GB Docker memory limit
        - 4–10 hours wall clock on a typical workstation
        - First-run only; subsequent boots start in minutes.

      Press Ctrl-C in the next 10 seconds to abort.
      See docs/VALHALLA.md for full operator notes.
      ============================================================
      WARN

      sleep 10

      export VALHALLA_TILE_URLS="https://download.geofabrik.de/north-america/us-latest.osm.pbf"
      export VALHALLA_TILES_DIR="./valhalla_tiles_us"
      export VALHALLA_CONTAINER_NAME="flock-avoid-valhalla-us"
      # 1080 loops * 10s = 3 hours of polling; manual `docker logs` if you need to wait longer.
      export VALHALLA_WAIT_LOOPS="${VALHALLA_WAIT_LOOPS:-1080}"

      exec ./scripts/build-valhalla-tiles.sh
      ```
- [ ] **Step 2: chmod +x** `scripts/build-valhalla-tiles-us.sh`.
- [ ] **Step 3: Smoke-check (do NOT actually invoke against Docker unless intentionally building).**
      Run `bash -n scripts/build-valhalla-tiles-us.sh` to confirm syntactic validity. Do not run the script to completion unless you have the resources from §5 of the spec.

**Done when:** the script exists, is executable, parses cleanly, and exports the documented env vars.

---

## Task 4 — Update `package.json` scripts

**Why:** Operator-facing entry points. Mirror the existing `valhalla:up` / `valhalla:down` / `valhalla:build-tiles` shape exactly so the convention is consistent.

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add three new scripts in the `scripts` block:**
      ```jsonc
      "valhalla:up:full-us": "VALHALLA_TILE_URLS=https://download.geofabrik.de/north-america/us-latest.osm.pbf VALHALLA_TILES_DIR=./valhalla_tiles_us VALHALLA_CONTAINER_NAME=flock-avoid-valhalla-us docker compose up -d",
      "valhalla:down:full-us": "VALHALLA_CONTAINER_NAME=flock-avoid-valhalla-us docker compose down",
      "valhalla:build-tiles:us": "./scripts/build-valhalla-tiles-us.sh"
      ```
      Place them adjacent to the existing `valhalla:*` scripts for readability.
- [ ] **Step 2: Sanity-check JSON validity:**
      `node -e "JSON.parse(require('fs').readFileSync('package.json','utf8'))"` — exits 0.

**Done when:** `npm run | grep valhalla` lists six entries (`up`, `up:full-us`, `down`, `down:full-us`, `build-tiles`, `build-tiles:us`).

---

## Task 5 — `.env.example` + `.gitignore`

**Why:** Make the toggle discoverable without forcing the operator to read the docs first. Broaden `.gitignore` so the new tile dir doesn't leak into commits.

**Files:**
- Create: `.env.example`
- Modify: `.gitignore`

- [ ] **Step 1: Create `.env.example`** with:
      ```
      # Valhalla container configuration. Copy this file to `.env` and uncomment
      # one of the modes to switch.
      #
      # Default (no .env required): Atlanta-area routing via the Georgia OSM extract.
      # See docs/VALHALLA.md for resource requirements and operator workflow.

      # --- Mode: full continental US ---
      # VALHALLA_TILE_URLS=https://download.geofabrik.de/north-america/us-latest.osm.pbf
      # VALHALLA_TILES_DIR=./valhalla_tiles_us
      # VALHALLA_CONTAINER_NAME=flock-avoid-valhalla-us

      # --- Per-container tuning (both modes) ---
      # VALHALLA_SERVER_THREADS=2
      ```
- [ ] **Step 2: Modify `.gitignore`** to replace `valhalla_tiles/` with `valhalla_tiles*/`. Leave the other entries alone.
- [ ] **Step 3: Verify `.env` itself is gitignored.** It's not in the current `.gitignore`; if `.env` is the only env file in use by Vite/Node, we should add a `.env` entry so the operator's actual env file doesn't leak. Add `.env` (and optionally `.env.local`) below the `valhalla_tiles*/` entry.

**Done when:** `git status` shows no untracked tile dirs even when both `valhalla_tiles/` and `valhalla_tiles_us/` exist; `.env.example` is tracked but `.env` would not be.

---

## Task 6 — Operator doc `docs/VALHALLA.md`

**Why:** Single source of truth for the operator. Holds the resource budget, the workflow recipes, the verification commands, the fallback mirrors, and the cleanup procedures. Linked from README and from the cross-city benchmark skip messages.

**Files:**
- Create: `docs/VALHALLA.md`

- [ ] **Step 1: Write the doc** with the following sections, in order:
  1. **TL;DR** — three-line summary: default is Atlanta; full-US is a multi-hour build behind one extra npm script; pick the mode that matches the work you're doing.
  2. **Modes** — table comparing the two:
     - Default / Atlanta: extract URL, dir, container name, disk, RAM, time, when to use.
     - Full continental US: same columns, with the resource numbers from spec §5.
  3. **Prerequisites for full-US** — checklist: `df -h .` shows ≥120 GB free on the partition containing `./valhalla_tiles_us/`; `docker info` shows ≥8 GB memory available; `docker ps` shows no container already bound to `127.0.0.1:8002` (kill or use the existing `npm run valhalla:down` first).
  4. **Workflow: starting the default (Atlanta) container** — paste the existing two-line invocation; nothing new here, just repeated so this doc is self-contained.
  5. **Workflow: starting the full-US container** — `npm run valhalla:down` (if Georgia is up), then `npm run valhalla:build-tiles:us`, then wait, then `npm run dev`.
  6. **Verifying** — after `/status` returns 200, run a sample `/route` request via `curl` that should succeed only against full-US tiles (Memphis → Nashville pair, for example); if you get `400 no_route_found`, the tiles aren't covering the requested area.
  7. **Switching back to Atlanta** — `npm run valhalla:down:full-us` then `npm run valhalla:up`. The Georgia tiles are still in `./valhalla_tiles/` from before (assuming nothing was deleted), so the boot is fast.
  8. **Running both at the same time** — section header but explicit "you can't, both bind 127.0.0.1:8002; this is intentional". Plain English why.
  9. **If the build fails** — common modes: out-of-disk (`df -h` mid-build), Docker OOM (raise memory limit in Docker Desktop preferences and try again), Geofabrik 502/503 (wait, or use the documented mirror), partial-state cleanup (`docker compose down --volumes` + `rm -rf valhalla_tiles_us/`).
  10. **Mirrors** — known-good alternates for the `tile_urls` env var: `download.openstreetmap.fr/extracts/north-america/us-latest.osm.pbf`, BBBike note. Mirror the existing README's tone.
  11. **What this doesn't cover** — Alaska, Hawaii, US territories, Canada, Mexico are excluded by Geofabrik's `us-latest`. Adding them is an env var change (comma-separate the `tile_urls`) plus a fresh build; left as an exercise / future PR.
  12. **Cross-city benchmarks** — explicit "even after this build completes, the benchmark specs in `tests/benchmark/routes/{memphis,detroit,dallas,sanfrancisco}.spec.ts` will still skip until the harness gains cross-city centering. That refactor is a separate sub-project."
- [ ] **Step 2: No emojis.** Per project convention.
- [ ] **Step 3: Cross-link.** The doc cites the spec for design rationale and the plan for implementation history.

**Done when:** the doc covers every operator question raised in the spec's §5 and §10, plus the verification curl recipe.

---

## Task 7 — README update

**Why:** Make the new doc discoverable from the front door.

**Files:**
- Modify: `README.md`

- [ ] **Step 1: In the "Run locally" section,** add one line after the existing Valhalla bring-up block:
      `For nationwide routing instead of Atlanta-only, see [docs/VALHALLA.md](docs/VALHALLA.md).`
- [ ] **Step 2: In the existing "If `build-valhalla-tiles.sh` fails with `502`/`503` from Geofabrik" section,** add one sentence at the end noting that the same mirror trick applies to the full-US build, with a forward-pointer to `docs/VALHALLA.md` for the full mirror list.
- [ ] **Step 3: Do NOT replace the existing Atlanta-first narrative.** The default flow stays the default flow; the full-US is an opt-in.

**Done when:** the README links to `docs/VALHALLA.md` without rearranging the existing happy-path instructions.

---

## Task 8 — Refresh cross-city benchmark skip messages

**Why:** The current messages reference "(2) full-US Valhalla container is available". This PR delivers that as a configurable build step. The remaining blocker is (1) the harness's lack of cross-city centering. Refreshing the messages makes the prerequisite clearer and points the next operator at the right doc.

**Files:**
- Modify: `tests/benchmark/routes/memphis.spec.ts`
- Modify: `tests/benchmark/routes/detroit.spec.ts`
- Modify: `tests/benchmark/routes/dallas.spec.ts`
- Modify: `tests/benchmark/routes/sanfrancisco.spec.ts`

- [ ] **Step 1: Update each file's `test.beforeAll` skip message** to read (city name varied):
      ```
      Memphis benchmark scaffolded but not yet runnable. Prereqs: (1) benchmark harness supports cross-city centering (search-and-flyTo before pixel click) — tracked in a follow-up sub-project; (2) Valhalla running with continental-US tiles per docs/VALHALLA.md. Sub-project C (this PR) delivers (2) as configuration; (1) remains.
      ```
- [ ] **Step 2: Do NOT change the test bodies.** The pixel-click route data stays as-is — it will be reused as soon as centering lands.
- [ ] **Step 3: Confirm the skips still register cleanly** by running `npx playwright test tests/benchmark/routes/ --list` — each cross-city spec should list its tests and Playwright reports them as `skipped` once executed.

**Done when:** each skipped spec carries a message that's actionable (says exactly what's missing and which doc to read) and the test count Playwright reports is unchanged from before this PR.

---

## Task 9 — Verify

**Why:** Guard against breakage. The whole spec hinges on the existing Georgia path being unaffected.

- [ ] **Step 1: TypeScript.** `npx tsc --noEmit` → 0 errors.
- [ ] **Step 2: Lint.** `npm run lint` → 0 errors.
- [ ] **Step 3: Vitest.** `npm test` → all green.
- [ ] **Step 4: Playwright privacy + e2e.** `npx playwright test tests/privacy/ tests/e2e/` → all green (assumes the existing Atlanta Valhalla container is still running; otherwise these gracefully skip per the existing harness logic).
- [ ] **Step 5: Atlanta benchmark unaffected.** `npx playwright test tests/benchmark/routes/atlanta.spec.ts tests/benchmark/aggregate.spec.ts` → all green (same caveat about the Atlanta container).
- [ ] **Step 6: Cross-city benchmarks still skip cleanly.** `npx playwright test tests/benchmark/routes/dallas.spec.ts tests/benchmark/routes/detroit.spec.ts tests/benchmark/routes/memphis.spec.ts tests/benchmark/routes/sanfrancisco.spec.ts` → reported as skipped, no errors, new message visible in the output.
- [ ] **Step 7: Docker compose still parses with no env file.**
      `docker compose config -q` → no output, exit 0.
- [ ] **Step 8: Docker compose substitutes env vars.**
      `VALHALLA_TILE_URLS=foo VALHALLA_TILES_DIR=bar VALHALLA_CONTAINER_NAME=baz docker compose config | grep -E 'foo|bar|baz'` → all three present.
- [ ] **Step 9: New scripts are executable + syntactically valid.**
      `bash -n scripts/build-valhalla-tiles.sh && bash -n scripts/build-valhalla-tiles-us.sh && test -x scripts/build-valhalla-tiles-us.sh`.

**Done when:** every check above passes.

---

## Task 10 — Optional: attempt the full-US build

**Why:** If (and only if) the implementer's environment is provisioned per spec §5, actually running the build proves the configuration end-to-end. If not, the documented config is the deliverable; the build is the operator's job.

- [ ] **Step 1: Capacity check.**
      `df -h .` → at least 120 GB free in the worktree's filesystem.
      `docker info | grep -iE 'memory|cpus'` → ≥8 GB memory and ≥4 CPUs configured for the Docker engine.
- [ ] **Step 2: If both pass, AND the operator is willing to spend the hours,** run `npm run valhalla:build-tiles:us` after first stopping the existing Atlanta container with `npm run valhalla:down`. Keep the existing tile dir intact for later switch-back.
- [ ] **Step 3: After completion, verify with a Memphis-area `/route` request** as documented in `docs/VALHALLA.md` §Verifying.
- [ ] **Step 4: Restore the Atlanta container if you took it down.**
      `npm run valhalla:down:full-us` then `npm run valhalla:up`.
- [ ] **Step 5: Report the actual measured numbers** (PBF download time, build wall clock, peak memory, final disk usage) in the PR body and update `docs/VALHALLA.md`'s resource table if the observed numbers materially differ from §5.

**If either capacity check fails:** skip this task entirely. The configuration deliverable is complete. Note in the PR body that the build was not run, and why.

**Done when:** either the build completes and the verification curl succeeds, or the task is explicitly deferred with a documented reason.

---

## Task 11 — Commit, push, open PR

- [ ] **Step 1: Stage by logical chunk.** Suggested commits, in order:
  1. `chore(docker): parameterize valhalla compose with env defaults` — `docker-compose.yml` + `.env.example` + `.gitignore`.
  2. `feat(scripts): env-aware build script + full-US wrapper` — `scripts/build-valhalla-tiles.sh` + `scripts/build-valhalla-tiles-us.sh` + `package.json`.
  3. `docs(valhalla): operator-facing build + ops doc` — `docs/VALHALLA.md` + `README.md` link.
  4. `test(benchmark): refresh cross-city skip messages` — the four spec files.
  5. `docs: Phase 0b-3b Sub-project C — full-US Valhalla spec + plan` — the spec and plan in `docs/superpowers/`.
- [ ] **Step 2: No emojis in any commit message.** Project convention.
- [ ] **Step 3: Push.** `git push -u origin feat/phase-0b-3b-full-us-valhalla`.
- [ ] **Step 4: Open PR with `--base feat/phase-0b-3b-directions`.** Body sections:
  - **Why.** One paragraph: nationwide routing was blocked on tile coverage; this PR delivers the configuration.
  - **What changed.** Bullet list of the files in §"File Structure" above.
  - **How to use.** The three operator workflows from spec §4.5.
  - **Resource budget.** The table from spec §5.
  - **Did you actually build?** Yes / No, with the environment numbers (disk, RAM, observed wall clock) or the reason for deferral.
  - **Test results.** The output of every check in Task 9.
  - **Stacking.** "Stacks on PRs #3 / #4 / #5. Do not merge to master until the parent branches land or this PR is rebased onto master."
  - **Privacy posture.** One paragraph confirming no allowlist change, no new browser-facing host, no new request shape.

**Done when:** the PR is open against `feat/phase-0b-3b-directions`, the body is complete, and the URL is reported back to the requester.

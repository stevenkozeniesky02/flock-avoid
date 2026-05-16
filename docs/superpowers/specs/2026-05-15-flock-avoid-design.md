# Flock-Avoid — Design Spec

**Status:** Draft for review
**Author:** Steven (with Claude as AI cofounder)
**Date:** 2026-05-15
**Working name:** Flock-Avoid (subject to change)

---

## 1. Product Vision

A privacy-first map and navigation app that helps users avoid mass-surveillance infrastructure. The core mechanic is Waze-style routing — but the thing being routed around is *being-watched*, not traffic.

**Scope, v1 surveillance types:**
- Automated License Plate Readers (Flock, Motorola Vigilant, Rekor, Genetec, etc.)
- Government CCTV (municipal, police-operated)
- DOT / traffic cameras
- Speed and red-light cameras

**Roadmap surveillance types (Phase 3):**
- Opt-in private networks: Ring/Neighbors, Fusus-integrated business cameras

**Out of scope (hard line):**
- Private residential cameras as a default layer
- Facial recognition of any kind
- Targeting of individual officers, employees, or residents
- Real-time evasion of active law-enforcement pursuits

## 2. Audience & Threat Profiles

One app, one codebase, a configurable threat profile chosen at onboarding. v1 ships four profiles:

| Preset | ALPR weight | CCTV weight | Detour tolerance | Use case |
|---|---|---|---|---|
| **Commuter** | Medium | Low | Low (≤5% extra time) | Avoid worst clusters without big detours |
| **Activist** | High | High | Medium (≤15%) | Detour around courthouses, embassies, sensitive sites |
| **Vulnerable** | Max | Medium | High (≤50%, optionally unbounded) | Accept significant detours to avoid ICE-adjacent / border-zone ALPRs |
| **Custom** | User-set | User-set | User-set | Power users |

Profile is stored locally only — even in Lite mode, the server never receives it.

## 3. Roadmap (no time commitments — sequence only)

**Phase 0 — Web Router (validation).**
Web PWA. Browse cameras on map + plan-a-route from point A to point B with surveillance-aware costing. Read-only data from DeFlock + OSM. No accounts, no submissions, no live pings.
*Gate to Phase 1: routes are usable, not absurd detours; demonstrated public interest.*

**Phase 1 — Android Launch (real product).**
Capacitor shell over the web codebase. Native turn-by-turn navigation. Photo + GPS submissions. Live community pings (Waze-style). Install-time choice between Private (on-device routing) and Lite (server-routed) modes. Distributed via Play Store + F-Droid + direct APK.
*Gate to Phase 2: Android retention is real; product survives in Play Store or successfully operates via F-Droid/APK if removed.*

**Phase 2 — iOS via Capacitor.** Same codebase. Plan for App Store review friction. PWA via Safari as the floor.

**Phase 3 — Data moat + private cameras (ongoing).** FOIA-ingestion pipeline for publicly-disclosed Flock contracts. Opt-in Ring/Neighbors/Fusus layer for power users.

## 4. Architecture

**Single web codebase, multiple shells.** TypeScript. Packaged as a PWA for web, wrapped in Capacitor for Android (Phase 1) and iOS (Phase 2).

### 4.1 Device side
| Component | Choice | Notes |
|---|---|---|
| Map rendering | MapLibre GL JS | No Mapbox/Google — both have telemetry and pricing conflicts |
| Map tiles | Self-hosted Protomaps PMTiles (OSM-derived) | Hosted on object storage + CDN |
| Routing engine | Valhalla compiled to WebAssembly | Runs on-device in Private mode |
| Custom costing | Per-edge surveillance penalty derived from nearby camera density × user's threat profile weights | Plugs into Valhalla's custom-costing API; no router rewrite |
| Local store | IndexedDB (web) / SQLite (mobile shells) | Map tiles, routing graph, camera dataset, threat profile |

### 4.2 Server side (minimal surface area)
| Service | Phase | Notes |
|---|---|---|
| Static dataset CDN | 0 | Signed PMTiles + versioned JSON snapshots of camera locations |
| Data pipeline (cron) | 0 | Pulls DeFlock + OSM `man_made=surveillance` daily, normalizes, publishes |
| Submission intake | 1 | Thin Go/Rust service; receives photo+GPS, writes to moderation queue |
| Live ping relay | 1 | Stateless, in-memory, no DB writes, no logging |
| FOIA pipeline | 3 | Ingests publicly-disclosed Flock contracts |

### 4.3 Privacy boundary (the rule)

**Routing mode (install-time choice):**
- **Private mode (default):** trip from→to coordinates are computed locally and never sent to the server. Recommended; ships as the default.
- **Lite mode (opt-in):** trip from→to coordinates are sent to the server for computation. Coords are rounded; requests are not logged. The user explicitly chose this tradeoff at install for lower storage usage.

**Mode-independent user actions** (apply in both Private and Lite mode):
- **Submitting a camera (Phase 1):** sends a photo + that one GPS point to submission intake. Explicit, opt-in action.
- **Tapping "camera ahead" (Phase 1):** sends a rounded GPS point to the stateless live-ping relay. Explicit, opt-in action; live-ping participation can be disabled in settings.

**Retention rules:**
- Live ping relay retains nothing: ephemeral, in-memory, coords rounded to ~100m, no user/session identifier carried.
- Submission intake retains only what is published in the dataset (camera location + type + photo + optional pseudonym).
- Lite-mode route requests are not logged.

**Onboarding obligation:** the Phase 1 first-launch flow must explicitly name every location-touching surface that applies to the user's chosen mode.

### 4.4 Camera data schema (normalized)
```
Camera {
  id: stable opaque identifier
  type: "alpr_government" | "alpr_private" | "cctv_municipal"
      | "cctv_dot_traffic" | "speed_camera" | "red_light_camera"
      | "ring_neighbors" | "fusus_business"
  lat, lon: float
  confidence: 0..1
  source: "deflock" | "osm" | "submission" | "foia"
  first_seen, last_seen: ISO date
  optional: photo_hash, notes
}
```

### 4.5 Threat profile schema (device-local only)
```
ThreatProfile {
  preset: "commuter" | "activist" | "vulnerable" | "custom"
  weights: { [CameraType]: 0..100 }
  detour_tolerance: "low" | "medium" | "high" | "unlimited"
  avoid_zones: GeoPolygon[]   // user-drawn exclusion areas, optional
}
```

### 4.6 Costing model
For each road edge `e` in the routing graph:
```
surveillance_penalty(e) = Σ (weight[c.type] × visibility_factor(e, c))
                         for each camera c within visibility radius

edge_cost(e) = base_cost(e) + detour_multiplier × surveillance_penalty(e)
```
`visibility_factor` is initially a simple distance falloff; line-of-sight and orientation are explicit roadmap items, not v1. `detour_multiplier` is set by the user's `detour_tolerance`.

## 5. UX — Key Surfaces

- **Onboarding:** profile picker (Commuter / Activist / Vulnerable / Custom) + (Phase 1) Private/Lite mode picker + (Phase 1) consent screen naming the two location-sending moments.
- **Map view:** MapLibre map with camera pins filtered by profile + optional heatmap overlay (toggle).
- **Route planner:** enter origin + destination → produces side-by-side **Shortest** vs **Private** routes with diff line ("+8 min, –47 cameras avoided"). The shareable moment.
- **Navigation (Phase 1):** native turn-by-turn with surveillance pins shown along the way; "camera ahead" tap for live ping.
- **Settings:** edit profile weights, manage downloaded regions, toggle live-ping participation, export/erase local data.

## 6. Community Data Layer (Phase 1)

### 6.1 Submission flow
1. User taps **Add camera** → camera overlay captures photo + GPS + type
2. POSTed to submission intake → moderation queue (status `pending`)
3. Auto-promote when corroborated by N independent reports OR reviewed by moderator
4. Verified submissions land in next dataset publish AND get contributed back to OSM (with user permission)
5. Anonymous by default; optional pseudonym for trust-building, no email/PII required

### 6.2 Anti-poisoning controls
- Outliers (far from any existing cluster) require **extra** corroboration
- Pseudonym-linked reputation accelerates auto-promotion for trusted submitters
- Photo-hash deduplication
- Roadmap: lightweight on-device ML camera-detection check on the photo before submission
- Per-IP and per-pseudonym rate-limiting

### 6.3 Live ping flow
1. User taps **Camera ahead** during navigation → marks current GPS (rounded ~100m)
2. POSTed to stateless relay → pushed via WebSocket/SSE to users within ~5km
3. Ping expires in 30 min unless corroborated (≥2 reports → promoted to candidate submission in mod queue)
4. Server retains nothing — no user ID, no IP, no session log

### 6.4 Public moderation policy
- Policy is **versioned in git, publicly readable**, so anyone can audit our rules
- Accept: government-operated and publicly-deployed commercial surveillance infrastructure
- Reject: private-residential cameras (default), targeted harassment submissions, anything that doxes an individual

## 7. Testing Strategy

| Layer | Coverage | Tooling |
|---|---|---|
| Unit | Costing math, profile serialization, dataset normalization, schema validators | Vitest |
| Integration | Data pipeline E2E, submission intake validation, mod-queue state machine, Valhalla WASM produces a path | Vitest + testcontainers |
| Routing-quality benchmark | Hand-curated test routes across high-deployment cities asserting properties ("Commuter: extra time ≤10%, ALPRs avoided ≥50%"); **open-sourced as its own repo for independent verification** | Custom harness |
| Privacy invariants | Network recording asserts only allowlisted endpoints contacted in Private mode; no request body carries lat/lon pairs; submission/ping requests carry no user identifier | Playwright + mitmproxy / HAR diffing |
| E2E | PWA install → set profile → plan route → see comparison. Phase 1: submit camera → mod queue, live ping reaches other client | Playwright |
| Adversarial / red-team | Submission poisoning (500 fake cameras in one cell), rate-limit evasion, outlier injection | Custom + Playwright, run in CI |

**Discipline:**
- TDD for costing function and privacy invariants (privacy invariant tests written **before** any new server endpoint)
- Coverage target: 80% overall, **100% endpoint coverage** on the privacy-invariant suite
- Routing-quality benchmark runs nightly; regressions block merge

## 8. Legal & Risk Posture

### 8.1 Legal footing
Mapping publicly-visible surveillance infrastructure on public roads is First-Amendment-protected speech. Waze was sued by police over showing speed traps and **won** — same legal logic. The product is positioned as journalism + civil-liberties tooling.

Public ToS messaging: *"We publish public information about public infrastructure on public roads."*

### 8.2 The architecture IS the legal defense
On-device routing means there is no trip record to subpoena, because trip records do not exist. Submission and live-ping endpoints retain nothing beyond what's been published. The default response to most law-enforcement asks is literally *"we don't have that data."*

### 8.3 Subpoena / legal-request policy
- Annual transparency report (counts of requests, contested, complied)
- Warrant canary
- Contest overbroad requests; notify users when legally permitted
- Require valid US legal process for any data we do hold (e.g. published submissions tied to a pseudonym)

### 8.4 Corporate / hosting
- Delaware C-corp for v1 (no need to incorporate offshore)
- Object storage + CDN: Cloudflare R2 + Cloudflare
- Phase 1 submission service: hosted with a provider with a track record of contesting unreasonable subpoenas (Hetzner / OVH preferred over AWS for that service)
- 2FA + hardware keys on all production access; minimum-access principle; annual third-party security audit once revenue allows

### 8.5 App-store risk and fallbacks
- **Android:** Play Store + F-Droid + direct APK with Obtainium-style auto-update (redundant distribution)
- **iOS (Phase 2):** Plan for rejection; TestFlight fallback; PWA via Safari is the floor

### 8.6 Hard lines (in ToS and in code)
- No real-time evasion of active law-enforcement pursuits
- No facial recognition. Ever.
- No targeting of individual officers, employees, or residents
- No private-residential cameras as a default layer (Phase 3 opt-in only)

### 8.7 Liability stance
- Data accuracy disclaimed (cameras move, are added, removed)
- Use at your own risk
- Explicit anti-misuse ToS clause: app may not be used to evade lawful pursuit or commit crimes (unenforceable but positions us correctly)

## 9. Business Model

Free + donations (Open Collective or similar) for v1.
- No ads, no tracking, no data sales — ever
- No accounts or billing infrastructure required for v1
- Donations are a separate link, not an in-app flow
- If sustainability becomes an issue post-launch, freemium subscription (Pro tier for multi-region offline downloads, advanced threat profiles, CarPlay/Android Auto) and B2B licensing (dataset + routing API for journalists, NGOs, law firms) are roadmap options — explicitly NOT in v1

## 10. Open Questions / Deferred Decisions

These need answers before or during implementation, but didn't need to block the design:
- Final product name (Flock-Avoid is a working name)
- Specific tile vendor choice (Protomaps vs self-hosted Tileserver-GL)
- Exact `N` for submission corroboration threshold (calibrated empirically Phase 1)
- Visibility radius and falloff curve for `visibility_factor` (tune against routing benchmark)
- Number and selection of cities for the v0 routing-quality benchmark corpus
- Whether to ship a public-facing transparency page from day one or wait until first request

## 11. Success Criteria

**Phase 0 (Web Router) ships successfully when:**
- A user can load the PWA, pick a profile, enter A→B, and see Shortest vs Private routes
- Routing-quality benchmark passes for at least 3 high-deployment cities (Atlanta, Memphis, Detroit suggested)
- Privacy invariant tests pass with 100% endpoint coverage
- Camera dataset is refreshed daily without manual intervention

**Phase 0 → Phase 1 gate:**
- Routes are usable: median Commuter-profile route adds ≤10% time, avoids ≥50% of ALPRs on shortest path
- Public interest demonstrated (organic traffic, journalist/EFF/ACLU engagement, community feedback)

**Phase 1 (Android Launch) ships successfully when:**
- App installs cleanly on a mid-range Android device with on-device routing for at least one US state
- Submission → mod queue → publish loop works end-to-end with anti-poisoning controls passing red-team tests
- Live pings round-trip between two devices in under 5 seconds
- Distributed via Play Store, F-Droid, AND direct APK simultaneously

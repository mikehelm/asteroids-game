# Admin Rules and Permissions

This document describes the current (lightweight) admin model for the Flipit Asteroids project and proposes an extensible structure for future features.

## 1. Roles
- **guest**
  - Unauthenticated visitor. Can play the game in the browser with default settings.
- **user**
  - Authenticated player (planned). May persist preferences (e.g., background brightness, music volume) and view personal scores.
- **admin**
  - Project maintainers/developers. Can toggle debug overlays, spawn entities for testing, and deploy builds.

> Current state: The project is a static frontend without a live auth backend. Roles are conceptual for future expansion and local tooling.

## 2. Authentication Method
- **Current**: None. The game runs client-side only; no login is required.
- **Planned**:
  - Lightweight token-based or OAuth provider for dashboard-style features.
  - Environment-guarded debug mode (`VITE_ENV` and `GAME_MODE`) enabling admin-only tools in non-production builds.
  - Optional localStorage-based preference persistence for users (non-sensitive settings only).

## 3. Permissions by Role
- **guest**
  - Play the game (all core features).
  - Adjust runtime visual settings in-session (no persistence by default).
  - No access to debug/test-only controls.

- **user** (planned)
  - All guest permissions.
  - Persist basic preferences (e.g., `bgBrightness`, `bgOpacity`, `bgContrast`, music/SFX volumes) to localStorage.
  - View personal bests/scores (if a backend is introduced later).

- **admin**
  - All user permissions.
  - Access developer tools in non-production builds:
    - Toggle debug overlays (phase timestamps, performance, hitboxes).
    - Force-spawn entities (e.g., special asteroid, reward ship).
    - Trigger tractor beam sequences and end-of-level ducking.
  - Manage deployments (Netlify) and environment configuration.

> Implementation note: Admin-only controls should be gated by build-time flags (e.g., `GAME_MODE=development`, `VITE_ENV=local`) to ensure they do not appear in production.

## 4. Planned Improvements
- **Type-safe role model**
  - Define `Role = 'guest' | 'user' | 'admin'` and central permission map.
  - Create helper guards: `canSpawnEntities(role)`, `canSeeDebugOverlays(role)`, etc.
- **Feature flags**
  - Environment-driven flags (e.g., `VITE_ENABLE_WARP_TRAILS`) with a small feature-flag utility.
- **Auth integration (optional)**
  - Add OAuth or token-based auth if a user profile, leaderboards, or cloud saves are introduced.
  - Use secure storage for tokens; never expose secrets in client code.
- **Admin dashboard (optional)**
  - A protected in-app panel to toggle debug modes, spawn scenarios, and view logs.
- **Audit & telemetry (optional)**
  - Track usage of admin tools (only in development/test) to aid QA.

## 5. Extension Guidelines
- Keep admin-only code behind environment checks and clear UI labels (e.g., "Debug", "Dev Tools").
- Avoid shipping admin panels to production builds. Prefer build-time stripping or runtime guards.
- Favor non-destructive debug actions (no irreversible state changes) unless explicitly intended.

## 6. Operational Notes (Updated)
- Info Popup: The `InfoPopup` opens at most once per browser session. It pauses gameplay while open (rendering continues). We persist a session flag in `sessionStorage` so auto-open is never retriggered by music changes or other UI events.
- Music Footer Marquee: Title changes are handled via a controlled transition — old title fades out, new title slides in from the right, then stops at the left. Honors `prefers-reduced-motion`.
- Music Safety Guard: All music start calls go through `safePlayMusic()` to avoid duplicate starts (e.g., level one double-start). Manual selection still allowed via `selectMusicTrack` when muted.
- Restart & Ports: Use `restart.sh` to run the dev server on `http://localhost:4000`. Any local backend must run on `http://localhost:4001` per project rules.

## 7. Naming and Docs Hygiene
- Avoid double file extensions (e.g., `name.md.md`). Prefer a single `.md`. If such files appear, rename to a single extension as part of routine cleanup.

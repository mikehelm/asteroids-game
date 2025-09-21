Master PRD — Flipit Asteroids
1. Overview

Flipit Asteroids is a modern, browser-based reinterpretation of the classic arcade game. Built with React + TypeScript and rendered with the HTML5 Canvas, it emphasizes responsive controls, polished audio/visual effects, and a signature tractor beam sequence that reveals a per-asteroid “Flipit reward” percentage.

Live Site: https://testflipitrewardsgame.netlify.app

2. Objectives

Deliver smooth, jitter-free arcade gameplay that feels natural and fun.

Showcase a memorable tractor beam + Flipit reward experience that is consistent, readable, and surprising.

Maintain fast load times and stable performance across modern browsers.

Provide a modular, maintainable codebase for rapid iteration and expansion.

3. Target Audience

Casual players on desktop browsers.

Retro arcade enthusiasts looking for modern polish.

Streamers and creators who want sharable, “wow-moment” gameplay.

4. Core Gameplay Loop

Spawn into a stage with large asteroids.

Pilot a ship (rotate, thrust, shoot) to destroy asteroids that split into smaller ones.

Avoid collisions and enemy fire; collect bonuses.

Encounter a designated special asteroid that can trigger the tractor beam.

Complete the stage; repeat at increasing difficulty.

5. Mechanics
5.1 Ship Controls and Combat

Movement: inertia-based thrust and rotation.

Shooting: player bullets with lifetime; collisions reduce asteroid/alien health.

Collisions: radius-based detection; debris and explosions on impact.

5.2 Asteroids

Sizes: large → medium → small (splitting on destruction).

Attributes: position, velocity, rotation, health.

Special asteroid: once per stage; locked flipitChance between 1%–10%.

5.3 Tractor Beam + Flipit Reward

Phases: approaching → locking → attached → displaying → pushing.

Jitter mitigation: exponential damping during approach, velocities zeroed at lock.

Reward display: shows the locked flipitChance during displaying phase.

Post-push Flipit text: “drops” at last position, drifts, holds 3s, fades 1s.

Code references: src/Game.tsx (tractor beam system), createStageAsteroids().

6. Systems and Architecture

src/Game.tsx: main loop, rendering, tractor beam, HUD.

src/gameObjects.ts: entities (player, asteroids, aliens, bonuses, explosions).

src/sounds.ts: music and SFX system with ducking.

src/utils.ts: vector math, collisions, utilities.

src/types.ts: types; pending work includes replacing any casts.

src/effects/ExplosionDistortion.ts: optional visual effect.

Deployment: Netlify (Node 18, SPA redirect), built with Vite.

7. UX and UI

HUD: score, stage, missiles, toasts.

Tractor beam overlays and status text.

Background controls: brightness, contrast, opacity (default brightness = 0.4).

Optional warp trails and explosion distortions.

Planned: motion-reduction toggle and text readability improvements.

8. Audio

Playlist management, SFX mixing, ducking during tractor beam and transitions.

Implemented in src/sounds.ts.

9. Performance Requirements

Target 60 FPS on modern desktop browsers.

Avoid GC churn; refs to bypass React re-renders in the loop.

Tractor beam jitter controlled with damping/velocity reset.

10. Controls (Desktop)

Keyboard: thrust, rotate, shoot, missile.

Mouse: optional for UI.

11. Configuration

.env.example: runtime vars (e.g., VITE_DEFAULT_BG_BRIGHTNESS).

Planned persistence: background/effects stored in localStorage.

12. Integrations and Tooling

Hosting: Netlify.

Build: Vite + TypeScript + Tailwind.

Linting: ESLint.

Planned integrations: analytics, Sentry, optional backend endpoints.

13. Non-Functional Requirements

Reliability: prevent stuck tractor phases with timeouts/logging.

Usability: overlays readable on all backdrops; consider outlines.

Security: client-only; no secrets in client env.

Port rules: frontend on localhost:4000; backend (if added) on localhost:4001.

14. Constraints

Browser-only, client-side React app.

Mobile support desirable but not yet optimized.

Large asset bundle — optimize loading/caching.

15. Roadmap

M1: Stabilize tractor beam state machine (guards, logs, resets).

M2: Type safety and modularization (TractorBeamState, extract modules).

M3: UX polish (motion reduction toggle, text readability, persistence).

M4: Optional integrations (analytics, error monitoring, backend APIs).

16. Pending Work (Known Issues)

Replace (special as any) and other casts with strong types.

ESLint cleanup (unused imports/vars).

Refactor src/Game.tsx into smaller modules.

Improve UX readability under bright backgrounds.

Add persistence for user preferences.

Cross-browser QA and performance profiling.

17. Risks & Mitigations

Risk: Tractor beam “step still running.”

Mitigation: timeouts, logging, state guards.

Risk: Performance dips during heavy effects.

Mitigation: budget effects, toggles.

Risk: Inconsistent Flipit reward.

Mitigation: locked flipitChance during stage creation.

18. Acceptance Criteria

Tractor beam runs full cycle without jitter/stalls.

Flipit reward % consistent per asteroid.

Post-push text drops, drifts, holds, fades correctly.

Background brightness defaults to 40%.

App builds/deploys cleanly to Netlify.

19. Glossary

Flipit Chance: Per-special-asteroid probability shown during tractor beam.

Dropped Text: Flipit UI text left after push; drifts before fading.

20. Recent Updates (Dev Notes)

- Song List UI: Restored original pill-style list; now hidden by default and toggled via the “Song List” button. No dropdown/panel introduced.
- Footer Marquee: Controlled transition — prior title fades; new title slides in from the right and stops at the left; respects `prefers-reduced-motion`.
- Music Safety: Introduced `safePlayMusic()` to prevent duplicate starts (e.g., level one playing twice). Manual selection uses `selectMusicTrack` when muted.
- InfoPopup: Opens at most once per browser session and pauses gameplay while open (render continues). Session flag stored in `sessionStorage`.
- Level 1 Triple-Shooter: Whole Level 1 fires three shots per press (center and ±spread) without speed penalties from temporary powerups.
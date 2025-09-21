# Integrations List

This document lists APIs, SDKs, and third‑party integrations used or planned for the Flipit Asteroids project.

## Netlify (Hosting & Deployment)
- Purpose: Static hosting, CI/CD, SPA routing.
- Status: Implemented
- Example usage:
  - Config: `netlify.toml` (build command `npm run build`, publish `dist/`, SPA redirect)
  - CLI deploy:
    ```bash
    npm run build
    netlify deploy --prod --dir=dist --site <SITE_ID>
    ```

## Browser APIs
- Purpose: Core runtime for rendering, animation, and timing.
- Status: Implemented
- Includes:
  - `requestAnimationFrame` (game loop)
  - `CanvasRenderingContext2D` (drawing)
  - `performance.now()` (precise timestamps)
- Example usage (`src/Game.tsx`):
  ```ts
  const now = performance.now();
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  requestAnimationFrame(loop);
  ```

### UI Behaviors (Marquee & Popup)
- Music marquee in the footer uses a controlled transition (fade-out old, slide-in new, stop-left) and respects `prefers-reduced-motion`.
- InfoPopup opens at most once per browser session and pauses gameplay while open (rendering continues).

## Web Audio / HTMLAudio via Custom Wrapper
- Purpose: Music playback, SFX, ducking/boost control.
- Status: Implemented
- Example usage (`src/sounds.ts` + `src/Game.tsx`):
  ```ts
  import { soundSystem } from './sounds';
  soundSystem.setMusicVolume(0.6);
  soundSystem.playMusic();
  soundSystem.setSfxVolume(0.8);
  // Duck during tractor beam
  soundSystem.setMusicVolume(0.08);
  ```

## Vite Runtime Env Vars
- Purpose: Build-time configuration; expose safe client vars via `import.meta.env`.
- Status: Implemented
- Example variables (`.env.example`): `VITE_ENV`, `VITE_DEFAULT_BG_BRIGHTNESS`, `VITE_ENABLE_WARP_TRAILS`.
- Example usage (`src/Game.tsx`):
  ```ts
  const env = (import.meta as any).env;
  const defaultBrightness = Number(env.VITE_DEFAULT_BG_BRIGHTNESS ?? 0.4);
  ```

### Restart & Ports
- Dev server is started via `restart.sh` and runs at `http://localhost:4000`.
- Any future local backend must use `http://localhost:4001` per project rules.

## Tailwind CSS
- Purpose: Utility-first styling for UI overlays/controls.
- Status: Implemented
- Example usage:
  - Config: `tailwind.config.js`
  - Styles: `src/index.css`
  - Component classes (in `BackgroundDropdown` within `src/Game.tsx`):
    ```tsx
    <div className="fixed right-4 top-1/2 -translate-y-1/2 z-40">...</div>
    ```

## ESLint + typescript-eslint
- Purpose: Linting and code quality.
- Status: Implemented
- Example usage:
  ```bash
  npm run lint
  ```

## Lucide React (Icons)
- Purpose: Optional iconography for UI controls.
- Status: Partial/available (dependency included; minimal usage currently)
- Example usage:
  ```tsx
  import { Settings } from 'lucide-react';
  <Settings className="w-4 h-4" />
  ```

## Analytics (Placeholder)
- Purpose: Telemetry and usage analytics for UX improvements.
- Status: Planned
- Example wiring (future):
  ```ts
  const key = import.meta.env.VITE_ANALYTICS_KEY;
  if (key) initAnalytics(key);
  ```

## Error Monitoring (Sentry Placeholder)
- Purpose: Capture runtime errors in production.
- Status: Planned
- Example wiring (future):
  ```ts
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (dsn) Sentry.init({ dsn });
  ```

## Backend API (Placeholder)
- Purpose: User profiles, leaderboards, or cloud saves.
- Status: Planned
- Notes: Per project rules, local backend should use `http://localhost:4001`.
- Example usage (future):
  ```ts
  const base = import.meta.env.VITE_API_BASE_URL;
  const res = await fetch(`${base}/scores`);
  ```

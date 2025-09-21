# Tech Stack and Integrations

## 1) Frontend Frameworks and Libraries
- React 18 (functional components, hooks)
  - Entry: `src/main.tsx`
  - App shell: `src/App.tsx`
  - Game component: `src/Game.tsx`
- TypeScript
  - Types for core entities in `src/types.ts`
- Vite 5 (dev server and build tool)
  - Fast HMR for local development
  - Build command: `npm run build`
- Tailwind CSS 3
  - Utility-first styling
  - Config: `tailwind.config.js`, `postcss.config.js`
  - Styles: `src/index.css`
- ESLint 9 + typescript-eslint
  - Config: `eslint.config.js`
  - Script: `npm run lint`
- Lucide React (icon library; available for UI as needed)

## 2) Backend (If Applicable)
- No backend service at this time.
- The app is a static, client-only game deployed on Netlify.
- Per project rules, any future backend should use `localhost:4001` for local development.

## 3) Game Engine / Graphics
- HTML5 Canvas 2D rendering pipeline
  - All gameplay visuals drawn via `CanvasRenderingContext2D` inside `src/Game.tsx` draw functions
  - Custom, frame-by-frame game loop using `requestAnimationFrame`
- Custom game logic/engine (no third-party engine)
  - Entities and updates implemented in `src/gameObjects.ts`
  - Utility math and helpers in `src/utils.ts`
- Visual Effects
  - Explosion distortion manager: `src/effects/ExplosionDistortion.ts`
  - Starfield and background image rendering (`images/` directory)
- Asset Pipeline
  - Images: `images/` (backdrops, logo)
  - Sounds/Music: `sounds/` and `sounds/music/`

## 4) Database / State Management
- In-memory state via React + refs
  - `gameStateRef` holds primary `GameState` (player, asteroids, aliens, bullets, bonuses, visuals, stage)
  - Additional refs for timers, UI fades, music ducking, tractor beam phases
- TypeScript interfaces for entities in `src/types.ts`
- No Redux/MobX or external state library
- No database; no persistence by default (future option: localStorage for user settings)

## 5) APIs, SDKs, External Integrations
- Netlify (hosting and deployment)
  - Config: `netlify.toml`
  - Publish directory: `dist/`
  - Build command: `npm run build`
  - SPA redirect: `/* -> /index.html 200`
- Browser APIs
  - `requestAnimationFrame` for the game loop
  - `CanvasRenderingContext2D` for rendering
  - `performance.now()` for precise timing
- Audio (Web Audio via HTMLAudioElement usage in a custom wrapper)
  - `src/sounds.ts` implements a `soundSystem` for music selection, SFX playback, and ducking/boost logic
- No third-party game services or data APIs currently

## 6) Tooling and Build System
- Node.js 18 (enforced on Netlify)
- Vite React plugin: `@vitejs/plugin-react`
- PostCSS + Autoprefixer
- TypeScript configuration: `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`

## 7) Development and Local Ports
- Local development server: `npm run dev`
  - Runs on `http://localhost:4000` (per project rules)
- If a backend is introduced later: `http://localhost:4001`

## 8) Deployment
- Target: Netlify static hosting
- Live site: https://testflipitrewardsgame.netlify.app
- CLI (optional): `netlify deploy --prod --dir=dist --site <SITE_ID>`

## 9) Source Layout (Pointers)
- `src/Game.tsx` — main component with loop, draw/update routines, tractor beam system, UI overlays
- `src/gameObjects.ts` — creation/update logic for player, asteroids, aliens, bullets, bonuses, explosions
- `src/utils.ts` — vector math, collision helpers, and utilities
- `src/sounds.ts` — music/SFX control and ducking
- `src/effects/ExplosionDistortion.ts` — explosion warp effect
- `images/` — backdrops and logo
- `sounds/` + `sounds/music/` — SFX and music assets

## 10) Operational Notes (Recent)
- Dev server is orchestrated via `restart.sh` and runs on `http://localhost:4000`.
- Any future local backend must run on `http://localhost:4001`.
- Footer music marquee uses a controlled transition (fade-out, slide-in, stop-left) and respects `prefers-reduced-motion`.
- `InfoPopup` opens once per session (persisted in `sessionStorage`) and pauses gameplay while open.

# Version Control and Hosting

## 1. Repository Details and Structure
- Repository type: Git (standard)
- Primary language: TypeScript (React)
- Build system: Vite
- Linting: ESLint + typescript-eslint
- Key directories and files:
  - `src/` — application source code
    - `Game.tsx` — main game loop and rendering
    - `gameObjects.ts` — entity creation and update logic
    - `utils.ts` — math and helpers
    - `types.ts` — TypeScript types for entities/state
    - `effects/ExplosionDistortion.ts` — visual effect
    - `sounds.ts` — audio system wrapper
  - `images/`, `sounds/` — static game assets
  - `index.html` — Vite entry HTML
  - `netlify.toml` — deployment configuration
  - `package.json` — scripts and dependencies
  - `tailwind.config.js`, `postcss.config.js` — styling toolchain
  - `tsconfig*.json` — TypeScript configs

Practical notes:
- Keep new modules small and focused. Prefer adding new files over growing `Game.tsx` further.
- Store large binary assets under `images/` and `sounds/` and avoid renaming without need to preserve deploy diffs.

## 2. Branching Strategy
- Default: simple trunk-based development unless otherwise required.
  - Work directly on `main` for small, low-risk changes.
  - For larger features or refactors, create short-lived feature branches: `feature/<short-description>`.
- Example workflow:
  - `git checkout -b feature/tractor-beam-typing`
  - commit iteratively with atomic changes
  - open a PR to `main` (or merge fast-forward if working solo)

Practical notes:
- Keep branches short-lived to reduce merge conflicts.
- Rebase locally before merging to keep a clean history: `git pull --rebase`.

## 3. Commit Guidelines
- Write atomic, descriptive commits that explain the “why” and “what”.
- Recommended format:
  - Short imperative subject (<= 72 chars)
  - Blank line
  - Body with reasoning, context, and any follow-ups
- Examples:
  - `fix(tractor): lock Flipit chance per special asteroid`
  - `feat(ui): dropped Flipit text drift + hold 3s then fade`
  - `chore(bg): default brightness 40% and update label`
- Group related file changes together; avoid drive-by edits in unrelated areas.
- Run lints and ensure build passes before committing:
  - `npm run lint`
  - `npm run build`

Practical notes:
- Reference files and functions in the body when relevant (e.g., `createStageAsteroids()`, `drawUI`).
- Prefer smaller commits and PRs for easier review.

## 4. Hosting / Deployment Process
- Host: Netlify (static site)
- Live URL: https://testflipitrewardsgame.netlify.app
- Build & publish settings (from `netlify.toml`):
  - Build command: `npm run build`
  - Publish directory: `dist/`
  - SPA redirect: `/* -> /index.html 200`
  - Dev server: `npm run dev` on `localhost:4000`

## 5. Operational Notes
- Local orchestration: Use `restart.sh` to stop any existing dev process, free port 4000, start Vite, and verify health.
- Port policy: Frontend must run on `http://localhost:4000`. Any future backend must run on `http://localhost:4001`.
- Documentation hygiene: avoid double extensions (e.g., rename `*.md.md` to `*.md`).

### Deployment Options
1) Netlify UI (auto from connected repo)
- Connect the repo to Netlify and set build command/publish dir to match `netlify.toml`.
- Pushing to the default branch triggers a production deploy.

2) Netlify CLI (manual)
- Requirements: Logged in to Netlify CLI and linked to the correct site.
- Commands:
  ```bash
  npm ci
  npm run build
  netlify deploy --prod --dir=dist --site <SITE_ID>
  ```
- This updates the existing site without affecting local dev.

Practical notes:
- Verify the app locally before deploying: `npm run dev` → http://localhost:4000
- Ensure large assets are checked in and referenced correctly.
- Keep Node version at 18 (as configured) for consistent builds.

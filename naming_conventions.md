# Naming Conventions and Style Rules

This document defines the naming and formatting standards for the Flipit Asteroids project. Follow these rules for all new and updated code.

## 1) File Naming Rules
- React components: `PascalCase` file names with `.tsx` (e.g., `Game.tsx`, `App.tsx`).
- Modules (utilities, services, logic): `camelCase` with `.ts` (e.g., `gameObjects.ts`, `sounds.ts`, `utils.ts`, `types.ts`).
- Effect/feature folders: `kebab-case` directory names (e.g., `effects/`), files follow the rule above.
- Assets: lowercase with underscores or hyphens; keep extensions (e.g., `backdrop_1.png`, `asteroid_explosion-1.wav`).
- Tests (if added later): mirror source path, suffix `.test.ts` or `.test.tsx`.

## 2) Variable and Function Naming Rules
- Variables & functions: `camelCase`.
  - Booleans: prefix with `is`, `has`, `can`, `should` (e.g., `isActive`, `hasFuel`).
  - Timestamps: suffix with `At` or `Time` (ms-based), e.g., `startTime`, `attachStartTime`.
  - Durations: suffix with `Ms`, e.g., `displayDurationMs`.
  - Refs: suffix with `Ref`, e.g., `gameStateRef`, `tractionBeamRef`.
  - React state setters: `setX` for state `x` (e.g., `bgBrightness`, `setBgBrightness`).
- Constants: `UPPER_SNAKE_CASE` for global/shared constants (e.g., `CANVAS_WIDTH`).
- Types & interfaces: `PascalCase` (e.g., `GameState`, `Asteroid`, `TractorBeamState`).
- Enums and union type aliases: `PascalCase` (e.g., `Phase`, `TractorBeamPhase`).
- Event handlers: prefix with `handle` (e.g., `handleMusicVolume`).
- Factory/creators: prefix with `create` (e.g., `createAsteroid`, `createExplosion`).
- Updaters/tickers: prefix with `update` (e.g., `updateAsteroid`).

## 3) Component and Asset Naming Rules
- React components: `PascalCase` names, default export one component per file where practical.
- Hooks (if custom hooks are added): prefix with `use` (e.g., `useAudioDuck`).
- Props & state interfaces: `PascalCase` with `Props`/`State` suffix when used (e.g., `BackgroundDropdownProps`).
- Images & audio: descriptive lowercase names; use hyphens/underscores for separators; avoid spaces.
- Special gameplay fields:
  - Tractor beam: `phase`, `orbitAngle`, `orbitRadius`, `flipitChance`, `pushStartTime`, `displayStartTime`, dropped text fields `textAnchorX`, `textAnchorY`, `textVelX`, `textVelY`, `textHoldUntil`, `textFadeUntil`.
  - Asteroid extension fields (if typed): `special`, `glowColor`, `specialSpawn`, `flipitChance`.

## 3.1) Documentation Files
- Markdown files use a single `.md` extension (avoid `*.md.md`).
- Use `kebab-case` for multi-word docs (e.g., `project-prd.md`) or `snake_case` when grouping with code-generation tools.
- Prefer concise, descriptive names: `version_control.md`, `tech_stack.md`, `integration_list.md`.

## 4) Code Formatting Guidelines
- Indentation: 2 spaces. No tabs.
- Line length: target 100–120 columns; wrap thoughtfully for readability.
- Semicolons: required.
- Quotes: single quotes for strings; backticks for template strings.
- Imports:
  - Group by: Node/third-party → absolute/project → relative.
  - No unused imports; keep order stable.
- Spacing:
  - One space after commas and colons; around binary operators (`+ - * / && ||`).
  - Blank lines between logical sections.
- Objects/arrays: trailing commas where supported.
- Comments:
  - Use `//` for brief notes; `/** JSDoc */` for functions with non-trivial behavior, parameters, or returns.
  - Tag TODO/FIXME with context and owner if applicable.
- TypeScript:
  - Avoid `any`. Prefer explicit interfaces/types. If unavoidable, isolate casts and add a TODO to type properly.
  - Prefer readonly where meaningful; keep function signatures typed.
  - Narrow types with predicates/guards rather than frequent type assertions.
- React:
  - Components are pure where possible; side-effects in `useEffect`.
  - Use refs for animation/game loop state; avoid frequent React re-renders from the render loop.
  - Name state clearly: `const [bgBrightness, setBgBrightness] = useState(0.4)`.
- Canvas/game loop:
  - Keep per-frame allocations to a minimum.
  - Separate update vs draw concerns for clarity.

Adhering to these conventions will keep the codebase consistent and approachable for future contributors.

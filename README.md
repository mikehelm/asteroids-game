# Mike's Hemorrhoids Game

A classic Asteroids-style space shooter game built with React, TypeScript, and HTML5 Canvas.

## Features

- **Classic Asteroids Gameplay**: Navigate your ship through space, destroying asteroids and alien ships
- **Progressive Difficulty**: Each stage increases in difficulty with more asteroids and faster enemies
- **Power-ups**: Collect shield, heal, and double shooter bonuses
- **Sound Effects**: Immersive audio using Web Audio API
- **Smooth Graphics**: 60 FPS gameplay with particle effects and animations
- **Responsive Controls**: Keyboard controls for movement and shooting

## Controls

- **Arrow Keys** or **WASD**: Move and rotate ship
- **Spacebar**: Shoot
- **Enter**: Start game / Restart after game over

## How to Play

1. Destroy all asteroids to complete a stage
2. Avoid collisions with asteroids and alien bullets
3. Collect power-ups for temporary advantages:
   - **Shield** (Blue): Temporary invulnerability
   - **Heal** (Green): Restore health
   - **Double Shooter** (Red): Fire two bullets at once
4. Survive as long as possible and achieve the highest score!

## Development

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn

### Installation

```bash
npm install
```

### Running the Game

```bash
npm run dev
```

Open your browser and navigate to `http://localhost:4000`

### Building for Production

```bash
npm run build
```

The built files will be in the `dist` directory.

## Technologies Used

- **React 18** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **HTML5 Canvas** - Game rendering
- **Web Audio API** - Sound effects
- **Tailwind CSS** - Styling

## Game Architecture

- `src/Game.tsx` - Main game component and game loop
- `src/gameObjects.ts` - Game object creation and update logic
- `src/types.ts` - TypeScript type definitions
- `src/utils.ts` - Utility functions for physics and math
- `src/sounds.ts` - Sound system using Web Audio API

## License

This project is open source and available under the MIT License.
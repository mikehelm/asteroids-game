import { DEV_MODE } from './logger';

export function installDevHotkeys(getters: {
  getGameState: () => any | undefined;
  appendDebugLine: (s: string) => void;
  getFrameCounter: () => number;
}): () => void {
  if (!DEV_MODE) {
    return () => {};
  }

  const onKey = (e: KeyboardEvent) => {
    const gs = getters.getGameState();
    if (!gs) return;

    // Backtick ` or 'd' key will dump a quick summary line
    if (e.key === '`' || e.key === 'd' || e.key === 'D') {
      const tractorPhase = (gs as unknown as { tractorBeam?: { phase?: string } })?.tractorBeam?.phase ?? 'idle';
      const bg = (gs as unknown as { bgBrightness?: number })?.bgBrightness ?? 0.4;
      const summary = `[manual] f=${getters.getFrameCounter()} ast=${gs?.asteroids?.length ?? 0} bul=${gs?.bullets?.length ?? 0} deb=${gs?.visualDebris?.length ?? 0} exp=${gs?.explosions?.length ?? 0} phase=${tractorPhase} bg=${bg}`;
      getters.appendDebugLine(summary);
      return;
    }

    // 'T' dumps tile info for quick triage
    if (e.key === 't' || e.key === 'T') {
      const tx = gs.worldTileX ?? 0;
      const ty = gs.worldTileY ?? 0;
      const fuel = gs.refuelStation ? `(${gs.refuelStation.tileX},${gs.refuelStation.tileY})` : 'n/a';
      const reward = gs.rewardShip ? `(${gs.rewardShip.tileX},${gs.rewardShip.tileY})` : 'n/a';
      const line = `[tiles] cur=(${tx},${ty}) fuel=${fuel} reward=${reward}`;
      getters.appendDebugLine(line);
      // eslint-disable-next-line no-console
      console.log(line);
      return;
    }
  };

  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}

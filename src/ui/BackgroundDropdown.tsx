import React from 'react';

export interface BackgroundDropdownProps {
  open: boolean;
  onToggle: () => void;
  onNextBackground: () => void;
  bgOpacity: number;
  bgBrightness: number;
  setBgOpacity: (v: number) => void;
  setBgBrightness: (v: number) => void;
  effectsApply: { background: boolean; stars: boolean; distantStars: boolean; warpTrails: boolean };
  setEffectsApply: (
    fn: (prev: { background: boolean; stars: boolean; distantStars: boolean; warpTrails: boolean }) => {
      background: boolean; stars: boolean; distantStars: boolean; warpTrails: boolean;
    }
  ) => void;
  trailsEnabled: boolean;
  setTrailsEnabled: (v: boolean) => void;
  trailsTargets: { player: boolean; ufos: boolean; asteroids: boolean };
  setTrailsTargets: (
    fn: (prev: { player: boolean; ufos: boolean; asteroids: boolean }) => {
      player: boolean; ufos: boolean; asteroids: boolean;
    }
  ) => void;
}

const BackgroundDropdown: React.FC<BackgroundDropdownProps> = ({
  open,
  onToggle,
  onNextBackground,
  bgOpacity,
  bgBrightness,
  setBgOpacity,
  setBgBrightness,
  effectsApply,
  setEffectsApply,
  trailsEnabled,
  setTrailsEnabled,
  trailsTargets,
  setTrailsTargets,
}) => {
  return (
    <div className="relative z-40">
      {!open && (
        <button
          type="button"
          onClick={onToggle}
          className="px-3 py-1.5 text-xs rounded bg-cyan-700 hover:bg-cyan-600 text-white border border-cyan-400 shadow opacity-20 hover:opacity-100 transition-opacity"
        >
          Effects / CPU usage ▸
        </button>
      )}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-72 p-3 rounded bg-gray-900/95 border border-cyan-700 shadow-xl">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-semibold text-cyan-300">Effects / CPU usage</div>
            <div className="flex items-center gap-2">
              <button onClick={onNextBackground} className="px-2 py-0.5 text-xs rounded bg-cyan-700 hover:bg-cyan-600 border border-cyan-400">Change</button>
              <button 
                onClick={onToggle}
                className="w-6 h-6 flex items-center justify-center text-white bg-red-600 hover:bg-red-500 rounded border border-red-400 font-bold text-sm transition-colors"
                aria-label="Close"
              >
                ×
              </button>
            </div>
          </div>
          <div className="space-y-2 mb-2">
            <div className="text-xs text-gray-300 font-semibold">Affect these items:</div>
            <label className="flex items-center gap-2 text-xs text-gray-200">
              <input type="checkbox" checked={effectsApply.background} onChange={(e)=>setEffectsApply(p=>({...p, background: e.target.checked}))} /> Background
            </label>
            <label className="flex items-center gap-2 text-xs text-gray-200">
              <input type="checkbox" checked={effectsApply.stars} onChange={(e)=>setEffectsApply(p=>({...p, stars: e.target.checked}))} /> Stars
            </label>
            <label className="flex items-center gap-2 text-xs text-gray-200">
              <input type="checkbox" checked={effectsApply.distantStars} onChange={(e)=>setEffectsApply(p=>({...p, distantStars: e.target.checked}))} /> Distant stars
            </label>
            <label className="flex items-center gap-2 text-xs text-gray-200">
              <input type="checkbox" checked={effectsApply.warpTrails} onChange={(e)=>setEffectsApply(p=>({...p, warpTrails: e.target.checked}))} /> Warp trails
            </label>
          </div>
          <div className="space-y-1 mb-3 pt-2 border-t border-cyan-800/50">
            <label className="flex items-center gap-2 text-xs text-gray-200">
              <input type="checkbox" checked={trailsEnabled} onChange={(e)=>setTrailsEnabled(e.target.checked)} /> Motion trails (frame accumulation)
            </label>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 pl-5">
              <label className="flex items-center gap-2 text-xs text-gray-200">
                <input type="checkbox" checked={trailsTargets.player} onChange={(e)=>setTrailsTargets(p=>({...p, player: e.target.checked}))} disabled={!trailsEnabled} /> Player
              </label>
              <label className="flex items-center gap-2 text-xs text-gray-200">
                <input type="checkbox" checked={trailsTargets.ufos} onChange={(e)=>setTrailsTargets(p=>({...p, ufos: e.target.checked}))} disabled={!trailsEnabled} /> UFOs
              </label>
              <label className="flex items-center gap-2 text-xs text-gray-200">
                <input type="checkbox" checked={trailsTargets.asteroids} onChange={(e)=>setTrailsTargets(p=>({...p, asteroids: e.target.checked}))} disabled={!trailsEnabled} /> Asteroids
              </label>
            </div>
          </div>
          <label className="block text-xs text-gray-300">
            Blur effect: {Math.round(bgOpacity * 100)}%
            <input
              className="w-full"
              type="range"
              min={0}
              max={1.0}
              step={0.01}
              value={bgOpacity}
              onChange={(e) => setBgOpacity(parseFloat(e.target.value))}
            />
          </label>
          <label className="block text-xs text-gray-300">
            Brightness: {Math.round(bgBrightness * 100)}%
            <input
              className="w-full"
              type="range"
              min={0}
              max={1.0}
              step={0.01}
              value={bgBrightness}
              onChange={(e) => setBgBrightness(parseFloat(e.target.value))}
            />
          </label>
        </div>
      )}
    </div>
  );
};

export default BackgroundDropdown;

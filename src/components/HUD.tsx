import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Play, Pause, RotateCcw, Volume2, VolumeX, Award, Coins, HelpCircle, 
  Magnet, Shield, Zap, ChevronsRight, Target, Users, Gift, Lock, CheckCircle2, Sparkles 
} from 'lucide-react';
import { GameState } from '../types';

interface HUDProps {
  gameState: GameState;
  score: number;
  distance: number;
  coins: number;
  highScore: number;
  isMuted: boolean;
  onStart: () => void;
  onResume: () => void;
  onPause: () => void;
  onRestart: () => void;
  onToggleMute: () => void;
  activePowerUps?: {
    magnet: number;
    shield: boolean;
    multiplier: number;
    boost: number;
  };
  
  // Premium Progress Save States
  bankedCoins: number;
  selectedCharacter: string;
  unlockedCharacters: string[];
  accumulatedDistance: number;
  accumulatedCoins: number;
  completedMissions: string[];
  unlockedAchievements: string[];
  dailyRStreak: number;
  lastClaimedRewardDate: string | null;
  onClaimMission: (id: string, reward: number) => void;
  onClaimDailyReward: (coinsEarned: number, nextStreak: number) => void;
  onUnlockCharacter: (id: string, cost: number) => void;
  onSelectCharacter: (id: string) => void;
}

const CHARACTERS_DATA = [
  { id: 'apex', name: 'APEX ORIGIN', cost: 0, description: 'Default elite tactical speedsuit.', skin: '#06b6d4' },
  { id: 'phantom', name: 'NEON PHANTOM', cost: 150, description: 'Electro neon violet skin.', skin: '#22c55e' },
  { id: 'ninja', name: 'CYBER NINJA', cost: 350, description: 'Carbon alloy plates & sensors.', skin: '#ef4444' },
  { id: 'vaporwave', name: 'VAPOR WAVE', cost: 600, description: 'Chill retro summer synthwave.', skin: '#ec4599' },
  { id: 'aureum', name: 'AUREUM LORD', cost: 1000, description: 'Liquid virtual gold chromium.', skin: '#f59e0b' }
];

const MISSIONS_LIST = [
  { id: 'mission_speed', name: 'Speed Starter', requirement: 250, desc: 'Reach a personal best of 250m.', reward: 60, type: 'distance' },
  { id: 'mission_coins', name: 'Coin Sweeper', requirement: 120, desc: 'Collect 120 total lifetime coins.', reward: 80, type: 'lifetime_coins' },
  { id: 'mission_accum', name: 'Apex Marathon', requirement: 2000, desc: 'Accumulate 2,000m total run.', reward: 150, type: 'lifetime_distance' }
];

const ACHIEVEMENTS_LIST = [
  { id: 'ach_novice', name: 'Novice Marathoner', requirement: 500, desc: 'Total cumulative distance run.', reward: 50, type: 'lifetime_distance' },
  { id: 'ach_magnet', name: 'Magneto Master', requirement: 50, desc: 'Collect 50 total coins lifetime.', reward: 100, type: 'lifetime_coins' },
  { id: 'ach_speedster', name: 'Metro Speedster', requirement: 500, desc: 'Reach a distance highscore of 500m.', reward: 150, type: 'high_score' },
  { id: 'ach_supernova', name: 'Supernova Legend', requirement: 5000, desc: 'Accumulate 5,000m total run.', reward: 300, type: 'lifetime_distance' },
  { id: 'ach_wardrobe', name: 'Wardrobe Legend', requirement: 3, desc: 'Unlock 3 distinct skins.', reward: 500, type: 'skins' }
];

const DAILY_REWARDS_AMOUNTS = [50, 100, 150, 200, 300, 400, 600];

export default function HUD({
  gameState,
  score,
  distance,
  coins,
  highScore,
  isMuted,
  onStart,
  onResume,
  onPause,
  onRestart,
  onToggleMute,
  activePowerUps = { magnet: 0, shield: false, multiplier: 0, boost: 0 },
  
  bankedCoins,
  selectedCharacter,
  unlockedCharacters,
  accumulatedDistance,
  accumulatedCoins,
  completedMissions,
  unlockedAchievements,
  dailyRStreak,
  lastClaimedRewardDate,
  onClaimMission,
  onClaimDailyReward,
  onUnlockCharacter,
  onSelectCharacter,
}: HUDProps) {
  // Format numbers with commas for high production feel
  const formatNum = (num: number) => num.toLocaleString();

  // Selected state for tabs navigation in START menu
  const [activeTab, setActiveTab] = useState<'run' | 'missions' | 'achievements' | 'characters' | 'rewards'>('run');

  const checkDailyClaimable = () => {
    if (!lastClaimedRewardDate) return true;
    try {
      const lastClaim = new Date(lastClaimedRewardDate);
      const now = new Date();
      return lastClaim.toDateString() !== now.toDateString();
    } catch {
      return true;
    }
  };

  const isDailyClaimable = checkDailyClaimable();

  // Helpers to fetch current progress metrics for display
  const getMissionProgress = (type: string, req: number) => {
    if (type === 'distance') return Math.min(req, highScore);
    if (type === 'lifetime_coins') return Math.min(req, accumulatedCoins);
    if (type === 'lifetime_distance') return Math.min(req, accumulatedDistance);
    return 0;
  };

  const getAchievementProgress = (type: string, req: number) => {
    if (type === 'lifetime_distance') return Math.min(req, accumulatedDistance);
    if (type === 'lifetime_coins') return Math.min(req, accumulatedCoins);
    if (type === 'high_score') return Math.min(req, highScore);
    if (type === 'skins') return Math.min(req, unlockedCharacters.length);
    return 0;
  };

  return (
    <div className="absolute inset-0 pointer-events-none font-sans flex flex-col justify-between p-4 sm:p-5 select-none z-10">
      
      {/* --- TOP HEADER (STATS & CONTROLS DISPLAY DURING CRITERIA) --- */}
      <div className="w-full flex justify-between items-start pointer-events-auto z-20">
        
        {/* Left Side: Core Stats */}
        <div className="flex flex-col gap-1 px-3 py-2 bg-slate-950/75 backdrop-blur-md rounded-2xl border border-slate-800/40 shadow-lg">
          <div className="flex items-center gap-1.5">
            <Award className="w-4 h-4 text-cyan-400" />
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Score</span>
            <span id="hud-score" className="text-sm font-black text-white font-mono leading-none text-right">
              {formatNum(score)}
            </span>
          </div>
          
          <div className="flex items-center gap-1.5 border-t border-slate-800/10 pt-1">
            <Coins className="w-4 h-4 text-amber-400 animate-pulse" />
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Coins</span>
            <span id="hud-coins" className="text-sm font-black text-amber-400 font-mono leading-none text-right">
              {coins}
            </span>
          </div>
        </div>

        {/* Center: Pause Button & Audio Controls */}
        <div className="flex gap-1.5">
          {gameState === 'RUNNING' && (
            <button
              onClick={onPause}
              id="pause-button"
              className="p-2 bg-slate-950/70 hover:bg-slate-900/90 border border-slate-800/50 backdrop-blur-md text-white rounded-xl shadow-lg transition-all active:scale-95 cursor-pointer"
              title="Pause Game"
            >
              <Pause className="w-4 h-4" />
            </button>
          )}
          {gameState === 'PAUSED' && (
            <button
              onClick={onResume}
              id="resume-button-top"
              className="p-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-xl shadow-lg transition-all active:scale-95 cursor-pointer"
              title="Resume Game"
            >
              <Play className="w-4 h-4 fill-current animate-pulse" />
            </button>
          )}
          <button
            onClick={onToggleMute}
            id="mute-button"
            className="p-2 bg-slate-950/70 hover:bg-slate-900/90 border border-slate-800/50 backdrop-blur-md text-slate-405 rounded-xl shadow-lg transition-all active:scale-95 cursor-pointer"
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-rose-500" /> : <Volume2 className="w-4 h-4 text-cyan-400" />}
          </button>
        </div>

        {/* Right Side: Distance Gauge */}
        <div className="flex flex-col items-end bg-slate-950/75 backdrop-blur-md px-3 py-2 rounded-2xl border border-slate-800/40 shadow-lg text-right">
          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">Distance</span>
          <div className="flex items-baseline gap-0.5 font-mono">
            <span id="hud-distance" className="text-base font-black text-white leading-none">
              {formatNum(distance)}
            </span>
            <span className="text-[9px] font-black text-cyan-400">m</span>
          </div>
        </div>
      </div>

      {/* --- ACTIVE POWER-UPS HUD (BOTTOM-CENTER) --- */}
      {gameState === 'RUNNING' && (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 pointer-events-none z-20 flex flex-col items-center gap-2">
          <span className="sr-only">Active Power-Ups Grid</span>
          <div className="flex gap-2.5 items-center justify-center flex-wrap max-w-xs sm:max-w-md">
            <AnimatePresence>
              {activePowerUps.boost > 0 && (
                <motion.div
                  key="powerup-boost"
                  initial={{ opacity: 0, scale: 0.8, y: 15 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.8, y: 10 }}
                  transition={{ type: "spring", stiffness: 350, damping: 25 }}
                  className="flex items-center gap-2 bg-slate-950/90 text-cyan-405 px-3 py-1.5 rounded-xl border border-cyan-500/30 shadow-[0_4px_16px_rgba(6,182,212,0.2)] font-black text-[10px] tracking-wide pointer-events-auto"
                >
                  <div className="p-1 rounded-lg bg-cyan-550/15 text-cyan-400 border border-cyan-500/20">
                    <ChevronsRight className="w-3.5 h-3.5 animate-pulse" />
                  </div>
                  <div className="flex flex-col text-left">
                    <span className="text-[7.5px] font-sans text-cyan-400/60 font-black tracking-widest uppercase leading-none">BOOST</span>
                    <span className="leading-none mt-0.5 text-white font-mono">{Math.ceil(activePowerUps.boost)}s</span>
                  </div>
                </motion.div>
              )}

              {activePowerUps.multiplier > 0 && (
                <motion.div
                  key="powerup-multiplier"
                  initial={{ opacity: 0, scale: 0.8, y: 15 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.8, y: 10 }}
                  transition={{ type: "spring", stiffness: 350, damping: 25 }}
                  className="flex items-center gap-2 bg-slate-950/90 text-amber-405 px-3 py-1.5 rounded-xl border border-amber-500/30 shadow-[0_4px_16px_rgba(245,158,11,0.2)] font-black text-[10px] tracking-wide pointer-events-auto"
                >
                  <div className="p-1 rounded-lg bg-amber-550/15 text-amber-400 border border-amber-500/20">
                    <Zap className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex flex-col text-left">
                    <span className="text-[7.5px] font-sans text-amber-400/60 font-black tracking-widest uppercase leading-none">SPEED X2</span>
                    <span className="leading-none mt-0.5 text-white font-mono">{Math.ceil(activePowerUps.multiplier)}s</span>
                  </div>
                </motion.div>
              )}

              {activePowerUps.magnet > 0 && (
                <motion.div
                  key="powerup-magnet"
                  initial={{ opacity: 0, scale: 0.8, y: 15 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.8, y: 10 }}
                  transition={{ type: "spring", stiffness: 350, damping: 25 }}
                  className="flex items-center gap-2 bg-slate-950/90 text-red-405 px-3 py-1.5 rounded-xl border border-red-500/30 shadow-[0_4px_16px_rgba(239,68,68,0.2)] font-black text-[10px] tracking-wide pointer-events-auto"
                >
                  <div className="p-1 rounded-lg bg-red-550/15 text-red-400 border border-red-500/20">
                    <Magnet className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex flex-col text-left">
                    <span className="text-[7.5px] font-sans text-red-400/60 font-black tracking-widest uppercase leading-none">MAGNET</span>
                    <span className="leading-none mt-0.5 text-white font-mono">{Math.ceil(activePowerUps.magnet)}s</span>
                  </div>
                </motion.div>
              )}

              {activePowerUps.shield && (
                <motion.div
                  key="powerup-shield"
                  initial={{ opacity: 0, scale: 0.8, y: 15 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.8, y: 10 }}
                  transition={{ type: "spring", stiffness: 350, damping: 25 }}
                  className="flex items-center gap-2 bg-slate-950/90 text-emerald-405 px-3 py-1.5 rounded-xl border border-emerald-500/30 shadow-[0_4px_16px_rgba(16,185,129,0.2)] font-black text-[10px] tracking-wide pointer-events-auto"
                >
                  <div className="p-1 rounded-lg bg-emerald-555/15 text-emerald-400 border border-emerald-500/20">
                    <Shield className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex flex-col text-left">
                    <span className="text-[7.5px] font-sans text-emerald-400/60 font-black tracking-widest uppercase leading-none">SHIELD</span>
                    <span className="leading-none mt-0.5 text-emerald-400 font-black tracking-widest uppercase text-[9px]">ACTIVE</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* --- OVERLAYS ON THE APPLET CENTER --- */}
      <div className="absolute inset-0 flex items-center justify-center p-3">
        
        <AnimatePresence mode="wait">
          
          {/* 1. START GAME/DASHBOARD OVERLAY */}
          {gameState === 'START' && (
            <motion.div
              key="start-screen"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.04 }}
              className="w-full max-w-[350px] bg-slate-950/95 border border-slate-800/80 backdrop-blur-xl rounded-[24px] shadow-2xl pointer-events-auto flex flex-col h-[75%] max-h-[500px]"
            >
              {/* Card Header Profile Details */}
              <div className="px-4 py-3 border-b border-slate-900/60 flex justify-between items-center bg-slate-950/50 shrink-0">
                <div className="flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                  <span className="text-[9px] font-black tracking-widest text-slate-400 uppercase">RUNNER PRO</span>
                </div>
                
                {/* Bank Purse */}
                <div className="flex items-center gap-1 bg-amber-500/10 text-amber-400 px-2.5 py-0.5 rounded-xl border border-amber-500/20 text-[11px] font-black font-mono">
                  <Coins className="w-3 h-3" />
                  <span>{formatNum(bankedCoins)}</span>
                </div>
              </div>

              {/* Central Tab-swapping Main Section */}
              <div className="flex-1 overflow-y-auto p-4 flex flex-col justify-start">
                
                {/* SUB TAB 1: RUN HOME */}
                {activeTab === 'run' && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-3.5 text-center items-center my-auto py-1">
                    <div className="w-12 h-12 bg-gradient-to-tr from-cyan-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-cyan-500/10 mb-1 animate-pulse">
                      <Play className="w-6 h-6 text-slate-950 fill-current ml-0.5" />
                    </div>
                    
                    <div>
                      <h1 className="text-xl font-black text-white tracking-tight uppercase leading-none">
                        CITY <span className="text-cyan-400 text-glow">RUN 3D</span>
                      </h1>
                      <span className="text-[9.5px] font-sans font-bold tracking-[0.14em] text-slate-400 uppercase leading-none block mt-1.5">
                        Powered by <span className="text-cyan-400 font-black">Rishu</span>
                      </span>
                      <p className="text-[10px] text-slate-400 max-w-[240px] mt-2.5 mx-auto leading-relaxed">
                        Ready your reflexes. Speed scales progresively in this high-fidelity 3D daytime metropolis.
                      </p>
                    </div>

                    {/* Active Character Quick Spotlight */}
                    <div className="w-full bg-slate-900/30 p-2.5 rounded-xl border border-slate-900 flex items-center justify-between text-left">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-slate-9c0 border border-slate-800 flex items-center justify-center relative overflow-hidden">
                          <div 
                            className="w-3 h-3 rounded-full" 
                            style={{ backgroundColor: CHARACTERS_DATA.find(c => c.id === selectedCharacter)?.skin || '#06b6d4' }}
                          />
                        </div>
                        <div>
                          <div className="text-[8px] font-bold text-slate-500 uppercase">SUIT CALIBRATION</div>
                          <div className="text-[11px] font-black text-white capitalize">{selectedCharacter === 'apex' ? 'Apex Original' : selectedCharacter}</div>
                        </div>
                      </div>
                      <div className="text-[9px] text-cyan-400 font-mono font-bold uppercase mr-1">
                        ACTIVE
                      </div>
                    </div>

                    {/* Instructions Panel */}
                    <div className="w-full bg-slate-900/10 p-2.5 rounded-xl border border-slate-950 text-left">
                      <div className="grid grid-cols-3 gap-1 text-[9px] text-center leading-none text-slate-400 font-mono">
                        <div className="p-1 px-0.5">
                          <span className="block font-bold text-cyan-400 text-[8px] mb-0.5">LANES</span>
                          <span>Left / Right (A/D)</span>
                        </div>
                        <div className="p-1 px-0.5 border-x border-slate-900">
                          <span className="block font-bold text-emerald-400 text-[8px] mb-0.5">VAULT JUMP</span>
                          <span>Up Swipe (W)</span>
                        </div>
                        <div className="p-1 px-0.5">
                          <span className="block font-bold text-amber-500 text-[8px] mb-0.5">SLIDE DUCT</span>
                          <span>Down (S)</span>
                        </div>
                      </div>
                    </div>

                    {/* Core Play Button */}
                    <button
                      onClick={onStart}
                      id="start-button"
                      className="w-full py-3 px-4 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-550 text-slate-950 font-black text-[11px] uppercase tracking-widest rounded-xl shadow-lg transition-all cursor-pointer"
                    >
                      LAUNCH SIMULATION
                    </button>
                  </motion.div>
                )}

                {/* SUB TAB 2: MISSIONS (DAILY/PROGRESSIVE) */}
                {activeTab === 'missions' && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-2.5 py-1">
                    <div className="text-left mb-1 shrink-0">
                      <h3 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-1">
                        <img src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2306b6d4' stroke-width='3' stroke-line-cap='round' stroke-linejoin='round'><circle cx='12' cy='12' r='10'/><circle cx='12' cy='12' r='6'/><circle cx='12' cy='12' r='2'/></svg>" className="w-3.5 h-3.5" referrerPolicy="no-referrer" />
                        <span>TACTICAL COMMANDS</span>
                      </h3>
                      <p className="text-[9px] text-slate-400 mt-0.5">Achieve metrics. Click to claim coin bonuses.</p>
                    </div>

                    <div className="flex flex-col gap-2 flex-grow overflow-y-auto">
                      {MISSIONS_LIST.map((m) => {
                        const prog = getMissionProgress(m.type, m.requirement);
                        const isDone = prog >= m.requirement;
                        const isClaimed = completedMissions.includes(m.id);
                        const percent = Math.min(100, Math.floor((prog / m.requirement) * 100));

                        return (
                          <div 
                            key={m.id} 
                            className={`p-2.5 rounded-xl border flex flex-col gap-1.5 transition ${
                              isDone && !isClaimed ? 'border-cyan-500/25 bg-cyan-950/10' : 'border-slate-900 bg-slate-950/20'
                            }`}
                          >
                            <div className="flex justify-between items-start gap-1">
                              <div>
                                <h4 className="text-[11px] font-black text-slate-100 flex items-center gap-1 text-glow">
                                  {isClaimed && <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />}
                                  <span>{m.name}</span>
                                </h4>
                                <p className="text-[9px] text-slate-400 leading-normal">{m.desc}</p>
                              </div>
                              <span className="text-[9px] font-bold text-amber-400 shrink-0 bg-amber-500/10 border border-amber-500/20 px-1 py-0.5 rounded leading-none">
                                +{m.reward}🪙
                              </span>
                            </div>

                            {/* Progress info */}
                            <div className="w-full mt-0.5 flex flex-col gap-1">
                              <div className="flex justify-between items-center text-[8px] font-mono text-slate-500 leading-none">
                                <span>Progress</span>
                                <span>{prog}/{m.requirement} ({percent}%)</span>
                              </div>
                              <div className="w-full h-1 bg-slate-900/60 rounded-full overflow-hidden border border-slate-950">
                                <div 
                                  className="h-full bg-gradient-to-r from-cyan-400 to-blue-500"
                                  style={{ width: `${percent}%` }}
                                />
                              </div>
                            </div>

                            {/* Action Button */}
                            {isDone && !isClaimed && (
                              <button
                                onClick={() => onClaimMission(m.id, m.reward)}
                                className="w-full py-1 text-slate-950 bg-gradient-to-r from-amber-400 to-yellow-500 rounded-lg text-[9px] font-extrabold uppercase tracking-wider hover:opacity-90 active:scale-95 cursor-pointer leading-tight mt-1"
                              >
                                CLAIM {m.reward} COINS
                              </button>
                            )}
                            {isClaimed && (
                              <div className="text-center text-[9px] text-emerald-400 font-bold tracking-widest py-0.5 bg-emerald-950/20 rounded border border-emerald-500/10">
                                ACTIVE REWARD CLAIMED ✓
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </motion.div>
                )}

                {/* SUB TAB 3: ACHIEVEMENTS */}
                {activeTab === 'achievements' && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-2.5 py-1">
                    <div className="text-left mb-1">
                      <h3 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-1">
                        <Award className="w-3.5 h-3.5 text-amber-400" />
                        <span>METALLURG MILESTONES</span>
                      </h3>
                      <p className="text-[9px] text-slate-400 mt-0.5">Lifetime rewards. Cash deposits unlock automatically.</p>
                    </div>

                    <div className="flex flex-col gap-2 flex-grow overflow-y-auto max-h-[220px] pr-0.5 custom-scrollbar">
                      {ACHIEVEMENTS_LIST.map((ach) => {
                        const prog = getAchievementProgress(ach.type, ach.requirement);
                        const isUnlocked = prog >= ach.requirement;
                        const percent = Math.min(100, Math.floor((prog / ach.requirement) * 100));

                        return (
                          <div 
                            key={ach.id} 
                            className={`p-2 rounded-xl border flex flex-col gap-1 transition-all ${
                              isUnlocked ? 'border-amber-500/20 bg-amber-950/5' : 'border-slate-900 bg-slate-950/20'
                            }`}
                          >
                            <div className="flex justify-between items-start gap-1">
                              <div>
                                <h4 className={`text-[10px] font-black leading-none ${isUnlocked ? 'text-amber-400' : 'text-slate-200'}`}>
                                  {ach.name}
                                </h4>
                                <p className="text-[8.5px] text-slate-400 mt-0.5">{ach.desc}</p>
                              </div>
                              <span className={`text-[8.5px] font-mono shrink-0 px-1 py-0.5 rounded leading-none ${
                                isUnlocked ? 'bg-amber-400/20 text-amber-400 font-bold' : 'bg-slate-900 text-slate-500'
                              }`}>
                                {isUnlocked ? 'DONE' : '+'+ach.reward+'🪙'}
                              </span>
                            </div>

                            <div className="w-full flex flex-col gap-0.5 mt-0.5">
                              <div className="flex justify-between text-[7.5px] font-mono text-slate-500 leading-none">
                                <span>Milestone</span>
                                <span>{prog}/{ach.requirement}</span>
                              </div>
                              <div className="w-full h-0.5 bg-slate-900/60 rounded-full overflow-hidden border border-slate-950">
                                <div 
                                  className={`h-full ${isUnlocked ? 'bg-amber-400' : 'bg-slate-700'}`}
                                  style={{ width: `${percent}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </motion.div>
                )}

                {/* SUB TAB 4: CHARACTERS SHOP */}
                {activeTab === 'characters' && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-2.5 py-1">
                    <div className="text-left mb-1">
                      <h3 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-1">
                        <Users className="w-3.5 h-3.5 text-purple-400" />
                        <span>SUIT CALIBRATOR</span>
                      </h3>
                      <p className="text-[9px] text-slate-400 mt-0.5">Acquire premium models with coins collected.</p>
                    </div>

                    <div className="flex flex-col gap-1.5 flex-grow overflow-y-auto max-h-[220px] pr-0.5 custom-scrollbar">
                      {CHARACTERS_DATA.map((char) => {
                        const isUnlocked = unlockedCharacters.includes(char.id);
                        const isEquipped = selectedCharacter === char.id;

                        return (
                          <div 
                            key={char.id} 
                            className={`p-2.5 rounded-xl border flex items-center justify-between gap-2.5 transition bg-slate-900/30 ${
                              isEquipped ? 'border-cyan-500/40 bg-cyan-950/5' : 'border-slate-900'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              {/* Glowing mannequin representation swatch */}
                              <div className="w-7 h-7 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-center shrink-0 relative overflow-hidden">
                                <div 
                                  className="w-3.5 h-3.5 rounded-full"
                                  style={{ backgroundColor: char.skin }}
                                />
                              </div>

                              <div className="min-w-0">
                                <h4 className="text-[10px] font-black text-white leading-none truncate">
                                  {char.name}
                                </h4>
                                <p className="text-[8.5px] text-slate-450 truncate mt-0.5">{char.description}</p>
                              </div>
                            </div>

                            {/* Action Button: BUY or SELECT or INSTALLED */}
                            <div className="shrink-0">
                              {isEquipped ? (
                                <span className="text-[8px] font-black text-cyan-400 bg-cyan-950/40 border border-cyan-500/20 px-2 py-0.5 rounded">
                                  EQUIP'D
                                </span>
                              ) : isUnlocked ? (
                                <button
                                  onClick={() => onSelectCharacter(char.id)}
                                  className="text-[8px] font-black text-white bg-slate-800 hover:bg-slate-700 px-2.5 py-1 rounded cursor-pointer transition-all"
                                >
                                  EQUIP
                                </button>
                              ) : (
                                <button
                                  onClick={() => {
                                    if (bankedCoins >= char.cost) {
                                      onUnlockCharacter(char.id, char.cost);
                                    } else {
                                      alert(`Need ${char.cost} coins! Run more marathons and swipe coins on track.`);
                                    }
                                  }}
                                  className="text-[8px] font-black text-slate-950 bg-gradient-to-r from-amber-400 to-yellow-500 rounded px-2 py-1 flex items-center gap-0.5 hover:scale-105 active:scale-95 transition-all cursor-pointer font-mono"
                                >
                                  <span>🪙</span>
                                  <span>{char.cost}</span>
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </motion.div>
                )}

                {/* SUB TAB 5: DAILY REWARDS */}
                {activeTab === 'rewards' && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-2.5 py-1">
                    <div className="text-left mb-1">
                      <h3 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-1">
                        <Gift className="w-3.5 h-3.5 text-emerald-400" />
                        <span>CHRONOS COMMENDATION</span>
                      </h3>
                      <p className="text-[9px] text-slate-400 mt-0.5">Consecutive loyalty deposits. Don't break your streak!</p>
                    </div>

                    {/* Weekly Board */}
                    <div className="grid grid-cols-4 gap-1.5 pt-1">
                      {DAILY_REWARDS_AMOUNTS.map((val, idx) => {
                        const dayNum = idx + 1;
                        const isClaimedDay = idx < dailyRStreak && !isDailyClaimable;
                        const isCurrentClaimable = idx === (dailyRStreak % 7) && isDailyClaimable;

                        return (
                          <div 
                            key={idx}
                            className={`p-1.5 rounded-lg border flex flex-col items-center text-center justify-between gap-0.5 transition ${
                              isCurrentClaimable 
                                ? 'border-amber-400 bg-slate-900 ring-1 ring-amber-400/50 animate-pulse'
                                : isClaimedDay 
                                  ? 'border-slate-900 bg-slate-950/60 opacity-50 text-emerald-400'
                                  : 'border-slate-900 bg-slate-950/10'
                            } ${dayNum === 7 ? 'col-span-2' : ''}`}
                          >
                            <span className="text-[7.5px] font-bold text-slate-500 leading-none">Day {dayNum}</span>
                            <div className="text-[10px] font-bold font-mono tracking-tight leading-none">
                              {isClaimedDay ? '✓' : '🪙'+val}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Claim Button */}
                    {isDailyClaimable ? (
                      <button
                        onClick={() => {
                          const bounty = DAILY_REWARDS_AMOUNTS[dailyRStreak % 7];
                          const nextStreak = dailyRStreak + 1;
                          onClaimDailyReward(bounty, nextStreak);
                        }}
                        className="w-full py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-black text-[10px] uppercase tracking-widest rounded-xl shadow-lg hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer flex items-center justify-center gap-1 animate-bounce"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>CLAIM DAY {dailyRStreak % 7 + 1} ({DAILY_REWARDS_AMOUNTS[dailyRStreak % 7]} COINS)</span>
                      </button>
                    ) : (
                      <div className="w-full text-center py-2.5 bg-slate-900/30 rounded-xl border border-slate-900 text-slate-400 text-[9px] font-bold tracking-widest uppercase">
                        REWARD CLAIMED GATHERED ✓ (REFRESHES DAILY)
                      </div>
                    )}
                  </motion.div>
                )}

              </div>

              {/* Card Footer: Premium Horizontal Tabs Row Menu */}
              <div className="px-2.5 py-1.5 border-t border-slate-900/80 bg-slate-150 rounded-b-[24px] h-12 shrink-0 flex justify-between items-center z-10 pointer-events-auto bg-slate-950">
                {/* 1. RUN TAB */}
                <button
                  onClick={() => setActiveTab('run')}
                  className={`flex flex-col items-center justify-center flex-1 h-full rounded-lg transition-all ${
                    activeTab === 'run' ? 'text-cyan-400 bg-slate-900/60 font-bold' : 'text-slate-500 hover:text-slate-350'
                  } cursor-pointer`}
                >
                  <Play className="w-4 h-4 mb-0.5 fill-current border-none" />
                  <span className="text-[7.5px] tracking-normal uppercase leading-none">RUN</span>
                </button>

                {/* 2. MISSIONS TAB */}
                <button
                  onClick={() => setActiveTab('missions')}
                  className={`flex flex-col items-center justify-center flex-1 h-full rounded-lg transition-all ${
                    activeTab === 'missions' ? 'text-cyan-400 bg-slate-900/60 font-bold' : 'text-slate-500 hover:text-slate-350'
                  } cursor-pointer`}
                >
                  <Target className="w-4 h-4 mb-0.5" />
                  <span className="text-[7.5px] tracking-normal uppercase leading-none">MISSIONS</span>
                </button>

                {/* 3. ACHIEVEMENTS TAB */}
                <button
                  onClick={() => setActiveTab('achievements')}
                  className={`flex flex-col items-center justify-center flex-1 h-full rounded-lg transition-all ${
                    activeTab === 'achievements' ? 'text-cyan-400 bg-slate-900/60 font-bold' : 'text-slate-500 hover:text-slate-350'
                  } cursor-pointer`}
                >
                  <Award className="w-4 h-4 mb-0.5" />
                  <span className="text-[7.5px] tracking-normal uppercase leading-none">HONORS</span>
                </button>

                {/* 4. CHARACTERS TAB */}
                <button
                  onClick={() => setActiveTab('characters')}
                  className={`flex flex-col items-center justify-center flex-1 h-full rounded-lg transition-all ${
                    activeTab === 'characters' ? 'text-cyan-400 bg-slate-900/60 font-bold' : 'text-slate-500 hover:text-slate-350'
                  } cursor-pointer`}
                >
                  <Users className="w-4 h-4 mb-0.5" />
                  <span className="text-[7.5px] tracking-normal uppercase leading-none">SUITS</span>
                </button>

                {/* 5. DAILY REWARDS TAB */}
                <button
                  onClick={() => setActiveTab('rewards')}
                  className={`flex flex-col items-center justify-center flex-1 h-full rounded-lg transition-all ${
                    activeTab === 'rewards' ? 'text-cyan-400 bg-slate-900/60 font-bold' : 'text-slate-500 hover:text-slate-350'
                  } cursor-pointer`}
                >
                  <Gift className="w-4 h-4 mb-0.5" />
                  <span className="text-[7.5px] tracking-normal uppercase leading-none">BONUS</span>
                </button>
              </div>
            </motion.div>
          )}

          {/* 2. PAUSE OVERLAY */}
          {gameState === 'PAUSED' && (
            <motion.div
              key="paused-screen"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              className="w-full max-w-[320px] bg-slate-950/90 border border-slate-800/80 backdrop-blur-xl p-6 rounded-[24px] shadow-2xl pointer-events-auto flex flex-col items-center text-center gap-5"
            >
              <div className="flex flex-col items-center">
                <div className="w-10 h-10 bg-slate-900 border border-slate-800 rounded-xl flex items-center justify-center mb-2">
                  <Pause className="w-4 h-4 text-cyan-400" />
                </div>
                <h2 className="text-lg font-black text-white tracking-widest uppercase">PAUSED</h2>
                <p className="text-[10px] text-zinc-400 mt-1 max-w-[200px]">
                  Take a breather. Your progression and score are safely held.
                </p>
              </div>

              <div className="w-full flex flex-col gap-2 shrink-0">
                <button
                  onClick={onResume}
                  id="resume-button"
                  className="w-full py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-black text-[10px] uppercase tracking-widest rounded-xl shadow-lg transition-all cursor-pointer"
                >
                  RESUME GAME
                </button>
                <button
                  onClick={onRestart}
                  id="restart-button"
                  className="w-full py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-white font-bold text-[10px] uppercase tracking-widest rounded-xl transition-all cursor-pointer"
                >
                  RESTART
                </button>
              </div>
            </motion.div>
          )}

          {/* 3. GAME OVER OVERLAY */}
          {gameState === 'GAMEOVER' && (
            <motion.div
              key="gameover-screen"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              className="w-full max-w-[325px] bg-slate-950/95 border border-rose-950/30 backdrop-blur-xl p-6 rounded-[24px] shadow-2xl pointer-events-auto flex flex-col items-center text-center gap-5"
            >
              <div className="flex flex-col items-center">
                <div className="w-11 h-11 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center justify-center mb-2 animate-bounce">
                  <RotateCcw className="w-5 h-5 text-rose-500" />
                </div>
                <h2 className="text-xl font-black text-rose-500 tracking-wider uppercase">CRASHED!</h2>
                <p className="text-[10.5px] text-zinc-400 mt-0.5">
                  An obstacle interrupted your session.
                </p>
              </div>

              {/* End Game Performance Panel */}
              <div className="w-full bg-slate-900/30 rounded-xl p-3 border border-slate-900 divide-y divide-slate-800/20 text-xs font-mono">
                <div className="flex justify-between py-1.5">
                  <span className="text-slate-450 font-sans">Final Score</span>
                  <span id="final-score" className="text-white font-black">{formatNum(score)}</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-slate-450 font-sans">Distance Run</span>
                  <span id="final-distance" className="text-white font-black">{formatNum(distance)}m</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-amber-500 font-sans">Coins Collected</span>
                  <span id="final-coins" className="text-amber-400 font-black">+{coins}</span>
                </div>
              </div>

              {/* High Score Celebration */}
              {distance >= highScore && distance > 0 && (
                <div className="w-full bg-cyan-950/20 border border-cyan-800/30 py-1.5 px-2 rounded-lg flex items-center justify-center gap-1.5">
                  <Award className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
                  <span className="text-[8.5px] font-black text-cyan-400 uppercase tracking-widest">
                    NEW HIGH RECORD GAINED!
                  </span>
                </div>
              )}

              {/* RUN AGAIN trigger */}
              <button
                onClick={onRestart}
                id="play-again-button"
                className="w-full py-3 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-black text-[11px] uppercase tracking-widest rounded-xl shadow-lg hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer"
              >
                RUN AGAIN
              </button>
            </motion.div>
          )}

        </AnimatePresence>
      </div>

      {/* --- FLOATING GESTURE WATERMARK INDICATOR --- */}
      <div className="w-full text-center py-1 select-none opacity-30">
        <span className="text-[9px] uppercase font-bold text-slate-500 tracking-wider">
          3D Endless Active Environment
        </span>
      </div>

    </div>
  );
}

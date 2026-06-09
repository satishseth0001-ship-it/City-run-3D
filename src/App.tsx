import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Award, Compass, Sparkles, RefreshCw, Volume2, Info, Keyboard } from 'lucide-react';
import GameCanvas from './components/GameCanvas';
import HUD from './components/HUD';
import { GameState } from './types';

export default function App() {
  const [gameState, setGameState] = useState<GameState>('START');
  const [score, setScore] = useState(0);
  const [distance, setDistance] = useState(0);
  const [coins, setCoins] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [activePowerUps, setActivePowerUps] = useState({
    magnet: 0,
    shield: false,
    multiplier: 0,
    boost: 0,
  });

  // Save Progress - Saved parameters
  const [bankedCoins, setBankedCoins] = useState(0);
  const [selectedCharacter, setSelectedCharacter] = useState('apex');
  const [unlockedCharacters, setUnlockedCharacters] = useState<string[]>(['apex']);
  const [accumulatedDistance, setAccumulatedDistance] = useState(0);
  const [accumulatedCoins, setAccumulatedCoins] = useState(0);
  const [completedMissions, setCompletedMissions] = useState<string[]>([]);
  const [unlockedAchievements, setUnlockedAchievements] = useState<string[]>([]);
  const [dailyRStreak, setDailyRStreak] = useState(0);
  const [lastClaimedRewardDate, setLastClaimedRewardDate] = useState<string | null>(null);

  // Initialize and read personal high score & profile from localStorage safely on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedHighScore = localStorage.getItem('marathon_high_score');
      if (storedHighScore) setHighScore(parseInt(storedHighScore, 10));

      const storedBanked = localStorage.getItem('runner_bank_coins');
      if (storedBanked) setBankedCoins(parseInt(storedBanked, 10));

      const storedSelected = localStorage.getItem('runner_selected_char');
      if (storedSelected) setSelectedCharacter(storedSelected);

      const storedUnlockedChars = localStorage.getItem('runner_unlocked_chars');
      if (storedUnlockedChars) {
        try {
          setUnlockedCharacters(JSON.parse(storedUnlockedChars));
        } catch (_) {}
      }

      const storedAccumDist = localStorage.getItem('runner_accum_distance');
      if (storedAccumDist) setAccumulatedDistance(parseInt(storedAccumDist, 10));

      const storedAccumCoins = localStorage.getItem('runner_accum_coins');
      if (storedAccumCoins) setAccumulatedCoins(parseInt(storedAccumCoins, 10));

      const storedMissions = localStorage.getItem('runner_completed_missions');
      if (storedMissions) {
        try {
          setCompletedMissions(JSON.parse(storedMissions));
        } catch (_) {}
      }

      const storedAch = localStorage.getItem('runner_unlocked_achieved');
      if (storedAch) {
        try {
          setUnlockedAchievements(JSON.parse(storedAch));
        } catch (_) {}
      }

      const storedStreak = localStorage.getItem('runner_streak_days');
      if (storedStreak) setDailyRStreak(parseInt(storedStreak, 10));

      const storedClaimDate = localStorage.getItem('runner_claimed_reward_date');
      if (storedClaimDate) setLastClaimedRewardDate(storedClaimDate);
    }
  }, []);

  const saveParam = (key: string, value: any) => {
    if (typeof window !== 'undefined') {
      if (typeof value === 'object') {
        localStorage.setItem(key, JSON.stringify(value));
      } else {
        localStorage.setItem(key, value.toString());
      }
    }
  };

  const handleStartGame = () => {
    setScore(0);
    setDistance(0);
    setCoins(0);
    setActivePowerUps({
      magnet: 0,
      shield: false,
      multiplier: 0,
      boost: 0,
    });
    setGameState('RUNNING');
  };

  const handleStatsUpdate = (
    s: number, 
    d: number, 
    c: number, 
    p?: { magnet: number; shield: boolean; multiplier: number; boost: number }
  ) => {
    setScore(s);
    setDistance(d);
    setCoins(c);
    if (p) {
      setActivePowerUps(p);
    }
  };

  const handleGameOver = (finalScore: number, finalDistance: number, finalCoins: number) => {
    setScore(finalScore);
    setDistance(finalDistance);
    setCoins(finalCoins);
    setGameState('GAMEOVER');
    setActivePowerUps({
      magnet: 0,
      shield: false,
      multiplier: 0,
      boost: 0,
    });

    let newHighScore = highScore;
    if (finalDistance > highScore) {
      newHighScore = finalDistance;
      setHighScore(finalDistance);
      saveParam('marathon_high_score', finalDistance);
    }

    // Accumulate stats
    const nextAccumDist = accumulatedDistance + finalDistance;
    const nextAccumCoins = accumulatedCoins + finalCoins;
    const nextBanked = bankedCoins + finalCoins;

    setAccumulatedDistance(nextAccumDist);
    saveParam('runner_accum_distance', nextAccumDist);

    setAccumulatedCoins(nextAccumCoins);
    saveParam('runner_accum_coins', nextAccumCoins);

    setBankedCoins(nextBanked);
    saveParam('runner_bank_coins', nextBanked);

    // Achievements calculation
    const newlyCompletedAch: string[] = [...unlockedAchievements];
    let extraRewards = 0;

    const ALL_ACHIEVEMENTS_LST = [
      { id: 'ach_novice', req: 500, val: nextAccumDist },
      { id: 'ach_magnet', req: 50, val: nextAccumCoins },
      { id: 'ach_speedster', req: 500, val: newHighScore },
      { id: 'ach_supernova', req: 5000, val: nextAccumDist },
      { id: 'ach_wardrobe', req: 3, val: unlockedCharacters.length }
    ];

    ALL_ACHIEVEMENTS_LST.forEach(ach => {
      if (ach.val >= ach.req && !newlyCompletedAch.includes(ach.id)) {
        newlyCompletedAch.push(ach.id);
        const achReward = ach.id === 'ach_novice' ? 50 : ach.id === 'ach_magnet' ? 100 : ach.id === 'ach_speedster' ? 150 : ach.id === 'ach_supernova' ? 300 : 500;
        extraRewards += achReward;
      }
    });

    if (extraRewards > 0) {
      const finalBanked = nextBanked + extraRewards;
      setBankedCoins(finalBanked);
      saveParam('runner_bank_coins', finalBanked);
      setUnlockedAchievements(newlyCompletedAch);
      saveParam('runner_unlocked_achieved', newlyCompletedAch);
    }
  };

  // Callback handers triggered by HUD menus
  const handleClaimMission = (id: string, reward: number) => {
    const nextCoins = bankedCoins + reward;
    setBankedCoins(nextCoins);
    saveParam('runner_bank_coins', nextCoins);

    const nextMissions = [...completedMissions, id];
    setCompletedMissions(nextMissions);
    saveParam('runner_completed_missions', nextMissions);
  };

  const handleClaimDailyReward = (coinsEarned: number, nextStreak: number) => {
    const nextCoins = bankedCoins + coinsEarned;
    setBankedCoins(nextCoins);
    saveParam('runner_bank_coins', nextCoins);

    setDailyRStreak(nextStreak);
    saveParam('runner_streak_days', nextStreak);

    const todayString = new Date().toDateString();
    setLastClaimedRewardDate(todayString);
    saveParam('runner_claimed_reward_date', todayString);
  };

  const handleUnlockCharacter = (id: string, cost: number) => {
    const nextCoins = bankedCoins - cost;
    setBankedCoins(nextCoins);
    saveParam('runner_bank_coins', nextCoins);

    const nextChars = [...unlockedCharacters, id];
    setUnlockedCharacters(nextChars);
    saveParam('runner_unlocked_chars', nextChars);

    setSelectedCharacter(id);
    saveParam('runner_selected_char', id);
  };

  const handleSelectCharacter = (id: string) => {
    setSelectedCharacter(id);
    saveParam('runner_selected_char', id);
  };

  const resetHighScore = () => {
    if (confirm('Are you sure you want to reset your high score?')) {
      setHighScore(0);
      localStorage.removeItem('marathon_high_score');
      
      setBankedCoins(0);
      localStorage.removeItem('runner_bank_coins');
      
      setUnlockedCharacters(['apex']);
      localStorage.removeItem('runner_unlocked_chars');
      
      setSelectedCharacter('apex');
      localStorage.removeItem('runner_selected_char');
      
      setAccumulatedDistance(0);
      localStorage.removeItem('runner_accum_distance');
      
      setAccumulatedCoins(0);
      localStorage.removeItem('runner_accum_coins');
      
      setCompletedMissions([]);
      localStorage.removeItem('runner_completed_missions');
      
      setUnlockedAchievements([]);
      localStorage.removeItem('runner_unlocked_achieved');
      
      setDailyRStreak(0);
      localStorage.removeItem('runner_streak_days');
      
      setLastClaimedRewardDate(null);
      localStorage.removeItem('runner_claimed_reward_date');
    }
  };

  return (
    <div className="min-h-screen w-full bg-slate-950 font-sans text-slate-100 flex flex-col items-center justify-center p-4 md:p-8 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-950/20 via-slate-950 to-slate-950 select-none">
      
      {/* Background visual ambience elements */}
      <div className="absolute top-1/4 left-10 w-96 h-96 bg-cyan-500/5 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-1/4 right-10 w-96 h-96 bg-indigo-500/5 blur-[120px] rounded-full pointer-events-none" />

      {/* Main double column workspace wrapper */}
      <div className="w-full max-w-5xl flex flex-col lg:flex-row items-center justify-center gap-8 z-10">
        
        {/* --- LEFT SIDEBAR: METRICS & CONTROLS PROFILE (HIDDEN ON VERTICAL LAYOUT MOBILE) --- */}
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6 }}
          className="hidden lg:flex flex-col gap-6 w-80 shrink-0 bg-slate-900/60 backdrop-blur-xl p-6 rounded-3xl border border-slate-800/80 shadow-2xl shadow-indigo-950/20 self-stretch justify-between"
        >
          {/* Header Branding */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-cyan-500/10 rounded-lg text-cyan-400 border border-cyan-500/20">
                <Compass className="w-4 h-4 animate-spin-slow" />
              </span>
              <span className="text-[10px] font-black tracking-widest text-cyan-400 uppercase">Metropolitan Core</span>
            </div>
            <h2 className="text-xl font-black text-white tracking-tight uppercase leading-none">
              CITY RUN <span className="text-cyan-400 font-mono">3D</span>
            </h2>
            <div className="text-[9px] font-sans font-bold tracking-[0.14em] text-slate-400 uppercase leading-none">
              Powered by <span className="text-cyan-400 font-black">Rishu</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed mt-1">
              Test your tactical swiping reflexes by switching lanes, jumping hurdles, and sliding below dangerous overhead warning bars.
            </p>
          </div>

          {/* Quick Guide Panel */}
          <div className="flex flex-col gap-4">
            <div className="text-xs font-bold text-slate-300 uppercase tracking-widest border-b border-slate-800 pb-2 flex items-center gap-1.5">
              <Keyboard className="w-4 h-4 text-slate-400" />
              <span>Keyboard Bindings</span>
            </div>
            
            <div className="flex flex-col gap-2 font-mono text-xs">
              <div className="flex justify-between items-center bg-slate-900/40 p-2 rounded-xl border border-slate-800/40">
                <span className="text-slate-450 font-sans">Move Lane</span>
                <span className="bg-slate-800 px-2 py-0.5 rounded text-white font-extrabold border border-slate-700">A / D</span>
              </div>
              <div className="flex justify-between items-center bg-slate-900/40 p-2 rounded-xl border border-slate-800/40">
                <span className="text-slate-450 font-sans">Jump obstacles</span>
                <span className="bg-slate-800 px-2 py-0.5 rounded text-white font-extrabold border border-slate-700">W / Space</span>
              </div>
              <div className="flex justify-between items-center bg-slate-900/40 p-2 rounded-xl border border-slate-800/40">
                <span className="text-slate-450 font-sans">Slide below underbars</span>
                <span className="bg-slate-800 px-2 py-0.5 rounded text-white font-extrabold border border-slate-700">S / Down</span>
              </div>
            </div>
          </div>

          {/* High Score Ledger */}
          <div className="flex flex-col gap-4">
            <div className="text-xs font-bold text-slate-300 uppercase tracking-widest border-b border-slate-800 pb-2 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Award className="w-4 h-4 text-amber-500" />
                <span>Leaderboard Record</span>
              </span>
              {highScore > 0 && (
                <button 
                  onClick={resetHighScore}
                  className="p-1 hover:bg-slate-800 text-rose-400 rounded transition"
                  title="Reset high score"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="bg-slate-900/40 rounded-2xl p-4 border border-slate-800/40 flex flex-col gap-1 text-center">
              <span className="text-[10px] font-bold text-slate-500 uppercase">Personal Best Distance</span>
              <div className="flex items-baseline justify-center gap-1 font-mono">
                <span className="text-3xl font-black text-white leading-none">
                  {highScore.toLocaleString()}
                </span>
                <span className="text-xs font-black text-cyan-400">m</span>
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                Records preserve locally on your terminal memory automatically.
              </p>
            </div>
          </div>

          {/* Aesthetic environmental footnotes */}
          <div className="text-[9px] text-slate-500 font-mono tracking-wider flex items-center gap-2">
            <Info className="w-3.5 h-3.5 text-slate-650" />
            <span> daytime-city-v1.4 • High FPS Engine</span>
          </div>

        </motion.div>

        {/* --- CENTRAL CORE: SLEEK SIMULATED SMARTPHONE FOR 3D ENDLESS GAMEPLAY --- */}
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, type: 'spring' }}
          className="relative w-full max-w-md aspect-[9/16] h-[82vh] sm:h-[780px] md:h-[800px] border-[6px] border-slate-800/90 rounded-[38px] bg-slate-950 shadow-[0_0_80px_rgba(6,182,212,0.06)] overflow-hidden"
        >
          {/* Top Speaker Bezel notch purely for high luxury polish */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-6 bg-slate-850 rounded-b-2xl z-30 flex items-center justify-center border-x border-b border-slate-800/40">
            <div className="w-12 h-1 bg-slate-800 rounded-full" />
          </div>

          {/* Game Canvas container viewport */}
          <div className="absolute inset-0 z-0">
            <GameCanvas
              gameState={gameState}
              onGameOver={handleGameOver}
              onStatsUpdate={handleStatsUpdate}
              isMuted={isMuted}
              selectedCharacter={selectedCharacter}
            />
          </div>

          {/* Real-time Overlay HUD */}
          <HUD
            gameState={gameState}
            score={score}
            distance={distance}
            coins={coins}
            highScore={highScore}
            isMuted={isMuted}
            onStart={handleStartGame}
            onResume={() => setGameState('RUNNING')}
            onPause={() => setGameState('PAUSED')}
            onRestart={handleStartGame}
            onToggleMute={() => setIsMuted(prev => !prev)}
            activePowerUps={activePowerUps}
            
            bankedCoins={bankedCoins}
            selectedCharacter={selectedCharacter}
            unlockedCharacters={unlockedCharacters}
            accumulatedDistance={accumulatedDistance}
            accumulatedCoins={accumulatedCoins}
            completedMissions={completedMissions}
            unlockedAchievements={unlockedAchievements}
            dailyRStreak={dailyRStreak}
            lastClaimedRewardDate={lastClaimedRewardDate}
            onClaimMission={handleClaimMission}
            onClaimDailyReward={handleClaimDailyReward}
            onUnlockCharacter={handleUnlockCharacter}
            onSelectCharacter={handleSelectCharacter}
          />

        </motion.div>

        {/* --- BOTTOM MOBILE PANEL: HELPER GESTURE TIP CARD (MOBILE VIEWPORT ONLY) --- */}
        <div className="lg:hidden w-full max-w-md flex flex-col gap-3 text-center bg-slate-900/50 backdrop-blur-md p-4 rounded-2xl border border-slate-850">
          <span className="text-xs font-black text-cyan-400 uppercase tracking-widest block mb-0.5">Control Tips</span>
          <p className="text-[11px] text-slate-400">
            Hold viewport vertically. Swipe **Left or Right** to choose lanes. Swipe **Up** to vault jumps. Swipe **Down** to crouch sliding.
          </p>
        </div>

      </div>
    </div>
  );
}

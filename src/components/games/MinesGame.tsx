import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Sparkles, Dices, ArrowLeft, ShieldAlert, Award } from 'lucide-react';
import { useGame } from '../../context/GameContext';
import { sound } from '../../utils/audio';
import { CashoutCardOverlay } from './GamePrimitives';

export const MinesGame: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const {
    activeCurrency,
    fromActiveAmount,
    deductBet,
    awardPayout,
    recordLoss,
    currencyLabel,
    currencyIcon,
    toActiveAmount,
    user,
    setAuthModalOpen,
    setActiveGameSession,
    checkCanPlayGame,
    startGameRound,
    resolveGameRound,
  } = useGame();

  const [betMode, setBetMode] = useState<'manual' | 'auto'>('manual');
  const [bet, setBet] = useState(activeCurrency === 'BGLS' ? '0.10' : '10');
  const [gridSize, setGridSize] = useState<number>(5); // 5, 6, 7, 8 (25, 36, 49, 64)
  const [mines, setMines] = useState<number>(3);
  const [playing, setPlaying] = useState(false);
  const [safe, setSafe] = useState<number[]>([]);
  const [mineMap, setMineMap] = useState<number[]>([]);
  const [explodedTile, setExplodedTile] = useState<number | null>(null);
  const [result, setResult] = useState<'win' | 'loss' | null>(null);
  const [roundBet, setRoundBet] = useState(0);
  const [roundId, setRoundId] = useState<string | null>(null);
  const [cashedOutInfo, setCashedOutInfo] = useState<{ multiplier: number; payout: number } | null>(null);

  const safeRef = useRef<number[]>([]);
  const mineMapRef = useRef<number[]>([]);
  const playingRef = useRef<boolean>(false);

  useEffect(() => {
    safeRef.current = safe;
  }, [safe]);

  useEffect(() => {
    mineMapRef.current = mineMap;
  }, [mineMap]);

  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  const totalTiles = gridSize * gridSize;

  // Restore game state from localStorage on page refresh
  useEffect(() => {
    const saved = localStorage.getItem('voidps_mines_state');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed?.mineMap?.length && parsed.roundBet > 0 && parsed.playing) {
          setGridSize(parsed.gridSize || 5);
          setMines(parsed.mines || 3);
          setMineMap(parsed.mineMap);
          setSafe(parsed.safe || []);
          setRoundBet(parsed.roundBet);
          setPlaying(true);
          safeRef.current = parsed.safe || [];
          mineMapRef.current = parsed.mineMap;
          playingRef.current = true;
          setActiveGameSession({ gameId: 'mines', gameTitle: 'Mines' });
        }
      } catch {}
    }
  }, []);

  const calculateMultiplier = (hits: number) => {
    if (hits <= 0) return 1.0;
    let prob = 1.0;
    for (let i = 0; i < hits; i++) {
      prob *= (totalTiles - mines - i) / (totalTiles - i);
    }
    const raw = 0.99 / prob;
    return Math.max(1.01, Number(raw.toFixed(2)));
  };

  const currentMultiplier = calculateMultiplier(safe.length);
  const nextMultiplier = calculateMultiplier(safe.length + 1);

  const tiles = useMemo(() => Array.from({ length: totalTiles }, (_, i) => i), [totalTiles]);

  const start = async () => {
    if (!user.isAuthenticated) { setAuthModalOpen(true); return; }
    if (!checkCanPlayGame('mines', 'Mines')) return;
    const b = fromActiveAmount(Number(bet)); if (!b || b <= 0) return;
    const started = await startGameRound('mines', b);
    if (!started.success || !started.roundId) return;
    setRoundId(started.roundId); setMineMap([]); setSafe([]); setExplodedTile(null); setResult(null); setCashedOutInfo(null); setRoundBet(b); setPlaying(true);
    safeRef.current=[]; mineMapRef.current=[]; playingRef.current=true;
    setActiveGameSession({gameId:'mines',gameTitle:'Mines'});
  };

  // Instant responsive multi-selection (rapid clicking)
  const pick = async (index: number) => {
    if (!playingRef.current || safeRef.current.includes(index) || !roundId) return;
    const resolved = await resolveGameRound(roundId,{selected:index,gridSize,mines,revealed:safeRef.current});
    if(!resolved.success || !resolved.result) return;
    const rr=resolved.result;
    if(rr.outcome==='loss'){
      playingRef.current=false; setMineMap(Array.isArray(rr.mineMap)?rr.mineMap:[]); setExplodedTile(index); setPlaying(false); setResult('loss'); sound.playExplosion(); setActiveGameSession(null); setRoundId(null); return;
    }
    sound.playGem();
    const next=[...safeRef.current,index]; safeRef.current=next; setSafe(next);
    if(rr.outcome==='win'){
      playingRef.current=false; setPlaying(false); setResult('win'); setCashedOutInfo({multiplier:Number(rr.multiplier),payout:Number(resolved.payoutDls||0)}); setActiveGameSession(null); setRoundId(null); sound.playCashout(); sound.playWin();
    }
  };

  const pickRandom = () => {
    if (!playingRef.current) return;
    const available = tiles.filter((i) => !safeRef.current.includes(i));
    if (available.length === 0) return;
    const randomPick = available[Math.floor(Math.random() * available.length)];
    pick(randomPick);
  };

  const cashout = async () => {
    if (!playingRef.current || !safeRef.current.length || !roundId) return;
    const resolved = await resolveGameRound(roundId,{cashout:true,final:true,selected:safeRef.current[safeRef.current.length-1],revealed:safeRef.current,gridSize,mines});
    if(!resolved.success) return;
    playingRef.current=false; setPlaying(false); setResult('win'); setCashedOutInfo({multiplier:Number(resolved.result?.multiplier||1),payout:Number(resolved.payoutDls||0)}); setActiveGameSession(null); setRoundId(null); sound.playCashout(); sound.playWin();
  };

  return (
    <div className="mx-auto w-full max-w-[1100px] flex flex-col gap-3 animate-in fade-in duration-200">
      {/* Top Breadcrumb Navigation */}
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onBack}
            className="w-8 h-8 rounded-xl bg-[#101928] border border-[#1b2b42] text-slate-400 hover:text-white flex items-center justify-center transition"
            title="Back to Games"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2">
            <img src="/assets/mines.png" alt="Mines" className="w-7 h-7 rounded-lg object-cover" />
            <h2 className="text-base font-black text-white tracking-wide">MINES</h2>
            <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-500/30">
              99% RTP
            </span>
          </div>
        </div>

        {/* Multiplier / Round Status indicator */}
        {playing && (
          <div className="flex items-center gap-2 text-xs font-mono font-bold bg-[#101b2a] px-3 py-1 rounded-xl border border-[#192b42]">
            <span className="text-slate-400">Current:</span>
            <span className="text-emerald-400 font-black">{currentMultiplier.toFixed(2)}×</span>
            <span className="text-slate-500">|</span>
            <span className="text-slate-400">Next:</span>
            <span className="text-cyan-400 font-black">{nextMultiplier.toFixed(2)}×</span>
          </div>
        )}
      </div>

      {/* Main Game Shell Console (matching media_1789394088411.png exactly) */}
      <div className="w-full rounded-2xl bg-[#0e1624] border border-[#1a283c] shadow-2xl overflow-hidden grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)] min-h-[500px]">
        {/* Left Sidebar Control Panel */}
        <div className="w-full bg-[#0b121e] border-b lg:border-b-0 lg:border-r border-[#162337] p-4 flex flex-col justify-between space-y-4">
          <div className="space-y-4">
            {/* Manual / Auto Tab Pill */}
            <div className="bg-[#080d16] p-1 rounded-xl flex items-center border border-[#141f30]">
              <button
                type="button"
                onClick={() => setBetMode('manual')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  betMode === 'manual'
                    ? 'bg-[#182638] text-white shadow-sm border border-[#2a3d58]'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Manual
              </button>
              <button
                type="button"
                onClick={() => setBetMode('auto')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  betMode === 'auto'
                    ? 'bg-[#182638] text-white shadow-sm border border-[#2a3d58]'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Auto
              </button>
            </div>

            {/* Bet Amount Input with Padlock & 1/2, 2x */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-400">
                <span>Bet Amount</span>
              </div>
              <div className="bg-[#0b121e] border border-[#1a2638] rounded-xl flex items-center px-3 py-2 focus-within:border-[#0074e4] transition-colors">
                <div className="w-5 h-5 flex items-center justify-center shrink-0">
                  <img src={currencyIcon} alt={currencyLabel} className="w-4 h-4 object-contain" />
                </div>
                <input
                  type="number"
                  step="1"
                  min="1"
                  value={bet}
                  disabled={playing}
                  onChange={(e) => setBet(e.target.value)}
                  className="w-full bg-transparent text-white font-mono font-bold text-sm outline-none px-2 disabled:opacity-50"
                />
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    disabled={playing}
                    onClick={() => setBet(String(Math.max(1, Number(((Number(bet) || 1) / 2).toFixed(2)))))}
                    className="text-xs font-bold text-slate-400 hover:text-white px-2 py-0.5 rounded hover:bg-white/10 transition-colors disabled:opacity-40 cursor-pointer"
                  >
                    ½
                  </button>
                  <button
                    type="button"
                    disabled={playing}
                    onClick={() => setBet(String(Number(((Number(bet) || 1) * 2).toFixed(2))))}
                    className="text-xs font-bold text-slate-400 hover:text-white px-2 py-0.5 rounded hover:bg-white/10 transition-colors disabled:opacity-40 cursor-pointer"
                  >
                    2×
                  </button>
                </div>
              </div>
            </div>

            {/* Mines Slider */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-400">
                <span>Mines</span>
                <span className="font-bold text-slate-200 font-mono">{mines}</span>
              </div>
              <input
                type="range"
                min={1}
                max={totalTiles - 1}
                value={mines}
                disabled={playing}
                onChange={(e) => setMines(Number(e.target.value))}
                className="stake-slider disabled:opacity-50 cursor-pointer"
                style={{
                  background: `linear-gradient(to right, #0074e4 0%, #0074e4 ${((mines - 1) / (totalTiles - 2)) * 100}%, #19273b ${((mines - 1) / (totalTiles - 2)) * 100}%, #19273b 100%)`
                }}
              />
            </div>

            {/* Grid Size Buttons: 25, 36, 49, 64 */}
            <div className="space-y-1.5">
              <span className="text-xs font-semibold text-slate-400">Grid Size</span>
              <div className="grid grid-cols-4 gap-1.5">
                {[
                  { size: 5, label: '25' },
                  { size: 6, label: '36' },
                  { size: 7, label: '49' },
                  { size: 8, label: '64' },
                ].map((g) => (
                  <button
                    key={g.size}
                    type="button"
                    disabled={playing}
                    onClick={() => {
                      setGridSize(g.size);
                      if (mines >= g.size * g.size) setMines(3);
                    }}
                    className={`py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      gridSize === g.size
                        ? 'bg-[#1c2b3e] border border-[#2c4360] text-white shadow-sm'
                        : 'bg-[#0b121e] border border-[#152234] text-slate-400 hover:text-slate-200'
                    } disabled:opacity-40`}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Primary Action Button (Vibrant Blue #0074e4 for both Bet and Cash Out matching screenshot) */}
          <div className="space-y-2 pt-2 border-t border-[#162337]">
            {!playing ? (
              <button
                type="button"
                onClick={start}
                className="w-full py-3.5 rounded-xl font-black text-sm bg-[#0074e4] hover:bg-[#0084ff] active:bg-[#0066cb] text-white shadow-lg shadow-blue-600/30 transition cursor-pointer"
              >
                Bet
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={cashout}
                  disabled={!safe.length}
                  className="w-full py-3.5 rounded-xl font-black text-sm bg-[#0074e4] hover:bg-[#0084ff] active:bg-[#0066cb] text-white shadow-lg shadow-blue-600/30 transition cursor-pointer disabled:opacity-40 disabled:pointer-events-none"
                >
                  Cash Out
                </button>
                <button
                  type="button"
                  onClick={pickRandom}
                  className="w-full py-2.5 rounded-xl text-xs font-bold text-slate-300 bg-[#162234] hover:bg-[#1c2c44] border border-[#23354f] flex items-center justify-center gap-1.5 transition cursor-pointer"
                >
                  <span>Pick Random</span>
                </button>
              </>
            )}

            {/* Next Multiplier Box matching media_1789396011586.png */}
            <div className="space-y-1 pt-1">
              <span className="text-xs font-semibold text-slate-400">Next Multiplier</span>
              <div className="bg-[#111927] border border-[#1c283a] rounded-xl px-3 py-2 text-xs text-slate-200 font-mono font-bold">
                {playing ? `${nextMultiplier.toFixed(2)}×` : '-'}
              </div>
            </div>

            {/* Current Payout Box matching media_1789396011586.png */}
            <div className="space-y-1">
              <span className="text-xs font-semibold text-slate-400">
                Current Payout {playing && safe.length > 0 ? `(${currentMultiplier.toFixed(2)}×)` : ''}
              </span>
              <div className="bg-[#111927] border border-[#1c283a] rounded-xl flex items-center px-3 py-2 text-xs text-slate-200 font-mono font-bold">
                <div className="w-4 h-4 flex items-center justify-center shrink-0 mr-2">
                  <img src={currencyIcon} alt={currencyLabel} className="w-3.5 h-3.5 object-contain" />
                </div>
                <span>
                  {playing && safe.length > 0
                    ? (roundBet * currentMultiplier).toFixed(2)
                    : '0'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Stage: Centered Tiles Board on Deep Dark Slate-Navy Background */}
        <div className="bg-[#070c14] p-4 sm:p-8 flex flex-col items-center justify-center relative overflow-hidden min-h-[440px]">
          {/* Win / Loss Result Toast Message */}
          {result === 'win' && (
            <div className="absolute top-4 bg-emerald-950/90 border border-emerald-500 text-emerald-300 px-4 py-1.5 rounded-xl text-xs font-bold shadow-lg animate-in fade-in zoom-in z-20 flex items-center gap-1.5">
              <Award className="w-4 h-4 text-amber-400" />
              <span>Cashed out {toActiveAmount(roundBet * currentMultiplier).toFixed(2)} {currencyLabel}!</span>
            </div>
          )}
          {result === 'loss' && (
            <div className="absolute top-4 bg-rose-950/90 border border-rose-500 text-rose-300 px-4 py-1.5 rounded-xl text-xs font-bold shadow-lg animate-in fade-in zoom-in z-20 flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4 text-rose-400" />
              <span>Bomb exploded! Round lost.</span>
            </div>
          )}

          {/* Centered Board Grid: Strictly locked square aspect-ratio */}
          <div className="w-full max-w-[420px] aspect-square flex items-center justify-center my-auto relative">
            <div
              className={`w-full h-full aspect-square grid ${
                gridSize >= 7 ? 'gap-1.5' : gridSize === 6 ? 'gap-2' : 'gap-2.5'
              }`}
              style={{
                gridTemplateColumns: `repeat(${gridSize}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${gridSize}, minmax(0, 1fr))`,
              }}
            >
              {tiles.map((i) => {
                const isSafe = safe.includes(i);
                const isMine = mineMap.includes(i);
                const revealed = isSafe || (!playing && result !== null);
                const isDeadBomb = i === explodedTile;

                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => pick(i)}
                    disabled={!playing || isSafe || revealed}
                    className={`w-full h-full aspect-square rounded-xl sm:rounded-2xl select-none relative overflow-hidden flex items-center justify-center cursor-pointer transition-all duration-150 ${
                      revealed
                        ? isMine
                          ? 'bg-[#2b1016] border-2 border-red-500/80 shadow-[0_0_15px_rgba(239,68,68,0.3)]'
                          : 'bg-[#0c2738] border-2 border-[#00d2ff]/70 shadow-[0_0_12px_rgba(0,210,255,0.25)]'
                        : 'bg-[#1c2838] hover:bg-[#25364c] active:bg-[#2a3c54] border border-[#26374d]'
                    }`}
                    style={{ aspectRatio: '1 / 1' }}
                  >
                    {revealed && (
                      <div className={`w-full h-full p-2 flex items-center justify-center pointer-events-none animate-in zoom-in-75 fade-in duration-200 ${!isSafe && result !== null ? 'opacity-40' : ''}`}>
                        {isMine ? (
                          <img
                            src="/assets/mine_bomb.png"
                            alt="Bomb"
                            className={`w-full h-full max-w-[80%] max-h-[80%] object-contain ${
                              isDeadBomb ? 'filter drop-shadow-[0_0_10px_rgba(239,68,68,0.9)] animate-pulse' : 'opacity-80'
                            }`}
                            draggable={false}
                          />
                        ) : (
                          <img
                            src="/assets/mine_gem.webp"
                            alt="Gem"
                            className="w-full h-full max-w-[85%] max-h-[85%] object-contain drop-shadow-[0_0_8px_rgba(0,210,255,0.8)]"
                            draggable={false}
                          />
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Stake-style Green Border Cashout Card Overlay matching media_1789397247491.png */}
            {result === 'win' && cashedOutInfo && (
              <CashoutCardOverlay
                multiplier={cashedOutInfo.multiplier}
                payout={cashedOutInfo.payout}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

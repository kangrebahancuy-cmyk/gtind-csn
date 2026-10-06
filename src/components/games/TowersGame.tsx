import React, { useState, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { useGame } from '../../context/GameContext';
import { sound } from '../../utils/audio';
import { ActionButton, BetInput, GameShell, ResultPill, ManualAutoTabs, PayoutMultiplierStats, CashoutCardOverlay } from './GamePrimitives';

type Difficulty = 'Easy' | 'Medium' | 'Hard' | 'Extreme';

interface DifficultyConfig {
  columns: number;
  traps: number;
  multipliers: number[];
}

const CONFIGS: Record<Difficulty, DifficultyConfig> = {
  Easy: {
    columns: 4,
    traps: 1,
    multipliers: [1.28, 1.65, 2.15, 2.80, 3.65, 4.80, 6.30, 8.30],
  },
  Medium: {
    columns: 3,
    traps: 1,
    multipliers: [1.45, 2.15, 3.20, 4.75, 7.05, 10.50, 15.60, 23.20],
  },
  Hard: {
    columns: 2,
    traps: 1,
    multipliers: [1.95, 3.85, 7.60, 15.00, 29.50, 58.00, 114.00, 225.00],
  },
  Extreme: {
    columns: 3,
    traps: 2,
    multipliers: [2.90, 8.50, 25.00, 74.00, 218.00, 645.00, 1900.00, 5600.00],
  },
};

const TOTAL_FLOORS = 8;

export const TowersGame: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const {
    activeCurrency,
    fromActiveAmount,
    deductBet,
    awardPayout,
    recordLoss,
    currencyLabel,
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
  const [difficulty, setDifficulty] = useState<Difficulty>('Easy');
  const [playing, setPlaying] = useState(false);
  const [floor, setFloor] = useState(0);
  const [traps, setTraps] = useState<number[][]>([]);
  const [userPicks, setUserPicks] = useState<{ floor: number; col: number }[]>([]);
  const [result, setResult] = useState<'win' | 'loss' | null>(null);
  const [roundBet, setRoundBet] = useState(0);
  const [roundId, setRoundId] = useState<string | null>(null);
  const [cashedOutInfo, setCashedOutInfo] = useState<{ multiplier: number; payout: number } | null>(null);
  const [deadPick, setDeadPick] = useState<{ floor: number; col: number } | null>(null);

  const cfg = CONFIGS[difficulty];
  const currentMultiplier = floor > 0 ? cfg.multipliers[floor - 1] : 1.00;
  const nextMultiplier = cfg.multipliers[Math.min(floor, TOTAL_FLOORS - 1)];

  /* Restore active climb from localStorage on refresh */
  useEffect(() => {
    const saved = localStorage.getItem('voidps_towers_state');
    if (saved) {
      try {
        const p = JSON.parse(saved);
        if (p?.traps?.length && p.roundBet > 0 && p.playing) {
          setDifficulty(p.difficulty || 'Easy');
          setFloor(p.floor || 0);
          setTraps(p.traps);
          setUserPicks(p.userPicks || []);
          setRoundBet(p.roundBet);
          setPlaying(true);
          setActiveGameSession({ gameId: 'towers', gameTitle: 'Towers' });
        }
      } catch {}
    }
  }, []);

  const startClimb = async () => {
    if (!user.isAuthenticated) { setAuthModalOpen(true); return; }
    if (!checkCanPlayGame('towers', 'Towers')) return;
    const b = fromActiveAmount(Number(bet)); if (!b || b <= 0) return;
    const started=await startGameRound('towers',b,undefined,{difficulty});
    if(!started.success||!started.roundId)return;
    setRoundId(started.roundId); setTraps([]); setFloor(0); setUserPicks([]); setRoundBet(b); setPlaying(true); setResult(null); setDeadPick(null); setCashedOutInfo(null); setActiveGameSession({gameId:'towers',gameTitle:'Towers'});
    sound.playClick();
  };

  const pickTile = async (fIdx: number, cIdx: number) => {
    if(!playing || fIdx!==floor || !roundId)return;
    const resolved=await resolveGameRound(roundId,{floor:fIdx,col:cIdx,columns:cfg.columns,traps:cfg.traps,multipliers:cfg.multipliers});
    if(!resolved.success||!resolved.result)return;
    const rr=resolved.result;
    if(rr.outcome==='loss'){setTraps(Array.isArray(rr.traps)?rr.traps:[]);setDeadPick({floor:fIdx,col:cIdx});setPlaying(false);setResult('loss');setActiveGameSession(null);setRoundId(null);sound.playExplosion();return;}
    setUserPicks(prev=>[...prev,{floor:fIdx,col:cIdx}]);sound.playGem();setFloor(Number(rr.floor||fIdx+1));
    if(rr.outcome==='win'){setPlaying(false);setResult('win');setCashedOutInfo({multiplier:Number(rr.multiplier),payout:Number(resolved.payoutDls||0)});setActiveGameSession(null);setRoundId(null);sound.playCashout();sound.playWin();}
  };

  const cashout = async () => {
    if(!playing||floor===0||!roundId)return;
    const resolved=await resolveGameRound(roundId,{cashout:true});
    if(!resolved.success)return;
    setPlaying(false);setResult('win');setCashedOutInfo({multiplier:Number(resolved.result?.multiplier||1),payout:Number(resolved.payoutDls||0)});setActiveGameSession(null);setRoundId(null);sound.playCashout();sound.playWin();
  };

  const pickRandom = () => {
    if (!playing) return;
    const randomCol = Math.floor(Math.random() * cfg.columns);
    pickTile(floor, randomCol);
  };

  return (
    <GameShell
      title="Towers"
      icon="/assets/towers.png"
      badge="98% RTP"
      onBack={onBack}
      controls={
        <>
          <div className="space-y-4">
            {/* Manual only pill */}
            <ManualAutoTabs mode={betMode} setMode={setBetMode} />

            {/* Bet Amount */}
            <BetInput value={bet} setValue={setBet} disabled={playing} />

            {/* Difficulty — clean names only */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400 block">Difficulty</label>
              <div className="relative">
                <select
                  value={difficulty}
                  disabled={playing}
                  onChange={(e) => {
                    sound.playClick();
                    setDifficulty(e.target.value as Difficulty);
                  }}
                  className="w-full bg-[#0b121e] border border-[#1a2638] rounded-xl px-3 py-2.5 text-xs text-white font-bold appearance-none cursor-pointer focus:outline-none focus:border-[#0074e4] transition disabled:opacity-50"
                >
                  {(Object.keys(CONFIGS) as Difficulty[]).map((d) => (
                    <option key={d} value={d} className="bg-[#0b1420] text-slate-100">{d}</option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Action buttons + Current Payout box only */}
          <div className="pt-2 space-y-2 border-t border-[#162337]">
            {!playing ? (
              <ActionButton tone="blue" onClick={startClimb}>Bet</ActionButton>
            ) : (
              <>
                <button
                  type="button"
                  disabled={floor === 0}
                  onClick={cashout}
                  className="w-full py-3.5 rounded-xl font-black text-sm uppercase tracking-wide bg-[#0074e4] hover:bg-[#0084ff] active:bg-[#0066cb] text-white shadow-lg shadow-blue-600/30 transition cursor-pointer disabled:opacity-40 disabled:pointer-events-none"
                >
                  Cash Out
                </button>
                <button
                  type="button"
                  onClick={pickRandom}
                  className="w-full py-2.5 rounded-xl text-xs font-bold text-slate-300 bg-[#162234] hover:bg-[#1c2c44] border border-[#23354f] transition cursor-pointer"
                >
                  Pick Random
                </button>
              </>
            )}

            {/* Current Payout box only matching reference screenshot */}
            <PayoutMultiplierStats
              hideNextMultiplier
              currentMultiplier={playing && floor > 0 ? currentMultiplier : (playing ? 1.00 : nextMultiplier)}
              currentPayout={playing && floor > 0 ? roundBet * currentMultiplier : 0}
            />
          </div>
        </>
      }
    >
      {/* ══════════════════════════════════════════════════════════
          Castle Portal Tower Board matching media_1789509384454.png
      ══════════════════════════════════════════════════════════ */}
      <div className="flex flex-col items-center justify-center w-full h-full py-2 px-2 select-none">

        {/* Win/Loss Pill */}
        {result === 'win' && (
          <div className="mb-2 animate-in fade-in">
            <ResultPill win>
              Climb complete — cashed out {toActiveAmount(roundBet * currentMultiplier).toFixed(2)} {currencyLabel}!
            </ResultPill>
          </div>
        )}
        {result === 'loss' && (
          <div className="mb-2 animate-in fade-in">
            <ResultPill>Skull hit on floor {floor + 1}! Round lost.</ResultPill>
          </div>
        )}

        {/* Pixel-perfect Castle Portal with strict viewport sizing and zero overflow */}
        <div
          className="relative select-none my-auto"
          style={{
            height: 'min(580px, calc(100vh - 200px))',
            aspectRatio: '713 / 949',
            maxWidth: '100%',
          }}
        >
          {/* Authentic Castle Stone Frame Graphic */}
          <img
            src="/assets/castle_frame.png"
            alt="Castle Frame"
            className="absolute inset-0 w-full h-full object-fill pointer-events-none z-20 select-none"
            draggable={false}
          />

          {/* Inner Grid Window strictly bounded inside the stone portal */}
          <div
            className="absolute z-10 grid gap-1.5 p-1.5 rounded-sm overflow-hidden"
            style={{
              top: '14.5%',
              bottom: '9.8%',
              left: '13.8%',
              right: '13.8%',
              backgroundColor: '#0c141e',
              gridTemplateRows: 'repeat(8, minmax(0, 1fr))',
            }}
          >
            {Array.from({ length: TOTAL_FLOORS }, (_, i) => {
              const fIdx = TOTAL_FLOORS - 1 - i;
              const isCurrentFloor = playing && fIdx === floor;
              const isPastFloor = fIdx < floor;
              const isGameOver = !playing && result !== null;

              return (
                <div
                  key={fIdx}
                  className="grid gap-1.5 h-full min-h-0"
                  style={{
                    gridTemplateColumns: `repeat(${cfg.columns}, minmax(0, 1fr))`,
                  }}
                >
                  {Array.from({ length: cfg.columns }, (_, cIdx) => {
                    const picked = userPicks.some((p) => p.floor === fIdx && p.col === cIdx);
                    const isTrap = traps[fIdx]?.includes(cIdx);
                    const isDead = deadPick?.floor === fIdx && deadPick?.col === cIdx;
                    // Reveal picked tiles, OR reveal ALL tiles on game over so player sees the full tower
                    const revealed = picked || isGameOver;
                    const isGem = revealed && !isTrap;

                    return (
                      <button
                        key={cIdx}
                        type="button"
                        disabled={!isCurrentFloor}
                        onClick={() => pickTile(fIdx, cIdx)}
                        className={`w-full h-full min-h-0 rounded-lg select-none transition-all duration-150 flex items-center justify-center relative overflow-hidden ${
                          isDead
                            ? 'bg-[#2b1016] border-2 border-[#ff1744] shadow-[0_0_12px_rgba(255,23,68,0.7)] z-10'
                            : isGem
                            ? 'bg-[#121a24] border border-[#1b2737]'
                            : revealed && isTrap
                            ? 'bg-[#121a24] border border-[#1b2737]'
                            : isCurrentFloor
                            ? 'bg-[#003d7a] hover:bg-[#004e9a] border-2 border-[#0074e4] shadow-[0_0_12px_rgba(0,116,228,0.55)] cursor-pointer'
                            : isPastFloor
                            ? 'bg-[#121a24] border border-[#1b2737] opacity-60'
                            : 'bg-[#121a24] border border-[#1b2737] opacity-40'
                        }`}
                      >
                        {revealed && (
                          <div className="w-full h-full flex items-center justify-center p-1">
                            {isTrap ? (
                              <img
                                src="/assets/skull.png"
                                alt="Skull"
                                className="max-w-[85%] max-h-[85%] w-auto h-auto object-contain drop-shadow-[0_0_8px_rgba(255,255,255,0.45)]"
                                draggable={false}
                              />
                            ) : (
                              <img
                                src="/assets/mine_gem.webp"
                                alt="Gem"
                                className="max-w-[85%] max-h-[85%] w-auto h-auto object-contain drop-shadow-[0_0_8px_rgba(0,210,255,0.85)]"
                                draggable={false}
                              />
                            )}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })}

            {/* Cashout overlay on win */}
            {result === 'win' && cashedOutInfo && (
              <CashoutCardOverlay multiplier={cashedOutInfo.multiplier} payout={cashedOutInfo.payout} />
            )}
          </div>
        </div>

        <p className="mt-2 text-center text-[11px] text-slate-600 font-medium">
          Pick one tile per floor · Cash out any time
        </p>
      </div>
    </GameShell>
  );
};

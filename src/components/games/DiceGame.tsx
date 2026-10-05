import React, { useState } from 'react';
import { Dices, ArrowLeftRight, History, Sparkles } from 'lucide-react';
import { useGame } from '../../context/GameContext';
import { sound } from '../../utils/audio';
import { ActionButton, BetInput, GameShell, ResultPill } from './GamePrimitives';

export const DiceGame: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const {
    fromActiveAmount,
    deductBet,
    awardPayout,
    recordLoss,
    currencyLabel,
    user,
    setAuthModalOpen,
    startGameRound,
    resolveGameRound,
  } = useGame();

  const [bet, setBet] = useState('10');
  const [mode, setMode] = useState<'under' | 'over'>('under');
  const [targetNumber, setTargetNumber] = useState<number>(50.0);
  const [rolling, setRolling] = useState(false);
  const [rolledNumber, setRolledNumber] = useState<number | null>(null);
  const [hasWon, setHasWon] = useState<boolean | null>(null);
  const [history, setHistory] = useState<{ roll: number; won: boolean }[]>([
    { roll: 42.15, won: true },
    { roll: 78.90, won: false },
    { roll: 12.04, won: true },
    { roll: 55.60, won: false },
  ]);

  // Win Chance & Multiplier calculation (99% RTP)
  const winChance = mode === 'under' ? targetNumber : 100 - targetNumber;
  const multiplier = Math.max(1.01, Number((99 / winChance).toFixed(4)));

  const toggleMode = () => {
    sound.playClick();
    setMode((m) => (m === 'under' ? 'over' : 'under'));
  };

  const rollDice = async () => {
    if (!user.isAuthenticated) { setAuthModalOpen(true); return; }
    if (rolling) return;
    const b = fromActiveAmount(Number(bet)); if (!b || b <= 0) return;
    const started = await startGameRound('dice', b);
    if (!started.success || !started.roundId) return;
    sound.playClick(); setRolling(true); setHasWon(null);
    const resolved = await resolveGameRound(started.roundId, { target:targetNumber, condition:mode });
    if (!resolved.success || !resolved.result) { setRolling(false); return; }
    const finalRoll=Number(resolved.result.roll); const isWin=resolved.result.outcome==='win';
    setRolledNumber(finalRoll); setHasWon(isWin); setRolling(false);
    setHistory(prev=>[{roll:finalRoll,won:isWin},...prev.slice(0,9)]);
    if(isWin){sound.playCashout();sound.playWin();}else sound.playExplosion();
  };

  return (
    <GameShell
      title="Dice"
      icon="/assets/VoidPs_Originals_dice.png"
      badge="99% RTP · Stake Odds"
      onBack={onBack}
      controls={
        <>
          {/* Bet Input */}
          <BetInput value={bet} setValue={setBet} disabled={rolling} />

          {/* Roll Mode Selector */}
          <div className="mt-3">
            <div className="flex items-center justify-between mb-1.5">
              <label className="vp-label text-xs font-bold text-slate-300">Condition</label>
              <button
                type="button"
                onClick={toggleMode}
                disabled={rolling}
                className="text-[10px] font-mono text-cyan-400 font-bold hover:underline flex items-center gap-1"
              >
                <ArrowLeftRight className="w-3 h-3" /> Flip (Roll {mode === 'under' ? 'Over' : 'Under'})
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                disabled={rolling}
                onClick={() => setMode('under')}
                className={`vp-choice py-2 text-xs ${mode === 'under' ? 'vp-choice-active font-black' : ''}`}
              >
                Roll Under {targetNumber.toFixed(2)}
              </button>
              <button
                type="button"
                disabled={rolling}
                onClick={() => setMode('over')}
                className={`vp-choice py-2 text-xs ${mode === 'over' ? 'vp-choice-active font-black' : ''}`}
              >
                Roll Over {targetNumber.toFixed(2)}
              </button>
            </div>
          </div>

          {/* Stats Box */}
          <div className="vp-statbox mt-3 py-2 text-xs">
            <div>
              <span>Multiplier</span>
              <b className="text-emerald-400 font-mono">{multiplier.toFixed(2)}×</b>
            </div>
            <div>
              <span>Win Chance</span>
              <b className="text-cyan-400 font-mono">{winChance.toFixed(2)}%</b>
            </div>
            <div>
              <span>Win Payout</span>
              <b className="text-white font-mono">
                {(Number(bet || 0) * multiplier).toFixed(2)} {currencyLabel}
              </b>
            </div>
          </div>

          {/* Roll Button */}
          <div className="mt-3">
            <ActionButton tone="blue" disabled={rolling} onClick={rollDice}>
              {rolling ? 'Rolling…' : 'Roll Dice'}
            </ActionButton>
          </div>
        </>
      }
    >
      {/* Dice Stage: Viewport fitted */}
      <div className="flex h-full max-h-[calc(100vh-170px)] flex-col items-center justify-between py-2 px-2 sm:px-4">
        {/* Recent Rolls Strip */}
        <div className="w-full max-w-xl flex items-center gap-1.5 overflow-x-auto py-1">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mr-1 flex items-center gap-1">
            <History className="w-3 h-3" /> Recent:
          </span>
          {history.map((h, idx) => (
            <span
              key={idx}
              className={`px-2 py-0.5 rounded text-[10px] font-mono font-black transition-all ${
                h.won
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                  : 'bg-[#121c2c] text-slate-400 border border-[#1d2d47]'
              }`}
            >
              {h.roll.toFixed(2)}
            </span>
          ))}
        </div>

        {/* Central Display Card */}
        <div className="w-full max-w-xl aspect-[16/9] max-h-[min(48vh,360px)] rounded-2xl bg-[#090f19] border border-[#16253c] flex flex-col items-center justify-center p-6 my-auto shadow-2xl relative select-none">
          {/* Large Result Number */}
          <div
            className={`text-6xl sm:text-7xl font-black font-mono tracking-tight transition-all ${
              hasWon === true
                ? 'text-[#10b981] drop-shadow-[0_0_25px_rgba(16,185,129,0.85)] scale-105'
                : hasWon === false
                ? 'text-[#ef4444] drop-shadow-[0_0_25px_rgba(239,68,68,0.8)]'
                : 'text-white drop-shadow-[0_0_20px_rgba(6,182,212,0.8)]'
            }`}
          >
            {rolledNumber !== null ? rolledNumber.toFixed(2) : '50.00'}
          </div>

          {/* Result Tag */}
          <div className="h-8 mt-2 flex items-center">
            {hasWon === true && (
              <span className="px-4 py-1 rounded-full text-xs font-mono font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 animate-in zoom-in">
                Won! Payout: {(Number(bet || 0) * multiplier).toFixed(2)} {currencyLabel}
              </span>
            )}
            {hasWon === false && (
              <span className="px-4 py-1 rounded-full text-xs font-mono font-black uppercase tracking-wider bg-red-500/20 text-red-400 border border-red-500/40 animate-in zoom-in">
                Missed target ({mode === 'under' ? `< ${targetNumber}` : `> ${targetNumber}`})
              </span>
            )}
          </div>

          {/* Interactive Slider Track */}
          <div className="w-full mt-6 px-4">
            <div className="relative w-full h-3 rounded-full bg-[#121d2d] overflow-hidden">
              {/* Green winning zone */}
              <div
                className="absolute top-0 bottom-0 bg-emerald-500/80 transition-all"
                style={
                  mode === 'under'
                    ? { left: 0, width: `${targetNumber}%` }
                    : { left: `${targetNumber}%`, right: 0 }
                }
              />
              {/* Red losing zone */}
              <div
                className="absolute top-0 bottom-0 bg-red-600/80 transition-all"
                style={
                  mode === 'under'
                    ? { left: `${targetNumber}%`, right: 0 }
                    : { left: 0, width: `${targetNumber}%` }
                }
              />
            </div>

            {/* Slider Input Handle */}
            <input
              type="range"
              min="2.00"
              max="98.00"
              step="0.5"
              value={targetNumber}
              disabled={rolling}
              onChange={(e) => setTargetNumber(Number(e.target.value))}
              className="w-full -mt-2 accent-white cursor-pointer relative z-10"
            />

            <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 mt-1">
              <span>0</span>
              <span>25</span>
              <span>50</span>
              <span>75</span>
              <span>100</span>
            </div>
          </div>
        </div>

        {/* Footer Subtext */}
        <p className="mt-2 text-center text-[11px] text-slate-500 font-medium">
          Drag slider to adjust target and win chance. Exact 99% RTP Stake formula.
        </p>
      </div>
    </GameShell>
  );
};

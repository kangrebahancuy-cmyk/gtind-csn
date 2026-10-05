import React, { useState, useRef, useEffect } from 'react';
import { useGame } from '../../context/GameContext';
import { sound } from '../../utils/audio';
import { GameShell, BetInput, ResultPill, ManualAutoTabs, PayoutMultiplierStats, CashoutCardOverlay } from './GamePrimitives';

const MULTIPLIERS = [1.92, 3.84, 7.68, 15.36, 30.72, 61.44, 122.88, 245.76, 491.52];
const TOTAL_STEPS = 9;

export const CoinflipGame: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const {
    activeCurrency,
    deductBet,
    awardPayout,
    recordLoss,
    currencyLabel,
    toActiveAmount,
    fromActiveAmount,
    user,
    setAuthModalOpen,
    setActiveGameSession,
    checkCanPlayGame,
    startGameRound,
    resolveGameRound,
  } = useGame();

  const [betMode, setBetMode] = useState<'manual' | 'auto'>('manual');
  const [bet, setBet] = useState(activeCurrency === 'BGLS' ? '0.10' : '10');
  const [side, setSide] = useState<'heads' | 'tails'>('heads');
  const [flipping, setFlipping] = useState(false);
  const [result, setResult] = useState<'heads' | 'tails' | null>(null);
  const [won, setWon] = useState<boolean | null>(null);
  const [cashedOutInfo, setCashedOutInfo] = useState<{ multiplier: number; payout: number } | null>(null);

  // 9-step pre-generated path for the round (revealed on loss)
  const [roundPath, setRoundPath] = useState<('heads' | 'tails')[]>([]);
  const [streak, setStreak] = useState(0);
  const [roundActive, setRoundActive] = useState(false);
  const [originalBet, setOriginalBet] = useState(0);
  const [currentPot, setCurrentPot] = useState(0);
  const [deadStep, setDeadStep] = useState<number | null>(null);
  const [serverRoundId, setServerRoundId] = useState<string | null>(null);

  // 3D Coin Rotation state
  const [coinRotation, setCoinRotation] = useState(0);

  const flipTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Restore active streak if page refreshed
  useEffect(() => {
    const saved = localStorage.getItem('voidps_coinflip_state');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed?.currentPot > 0 && parsed.roundActive && parsed.roundPath?.length) {
          setStreak(parsed.streak || 0);
          setRoundActive(true);
          setOriginalBet(parsed.originalBet || 0);
          setCurrentPot(parsed.currentPot);
          setRoundPath(parsed.roundPath);
          setActiveGameSession({ gameId: 'coinflip', gameTitle: 'Coinflip' });
        }
      } catch {}
    }
  }, []);

  useEffect(() => {
    return () => {
      if (flipTimeoutRef.current) clearTimeout(flipTimeoutRef.current);
    };
  }, []);

  const flip = async (overrideSide?: 'heads' | 'tails') => {
    if (!user.isAuthenticated) { setAuthModalOpen(true); return; }
    if (!roundActive && !checkCanPlayGame('coinflip', 'Coinflip')) return;
    if (flipping) return;

    const chosenSide = overrideSide ?? side;
    setSide(chosenSide);

    let baseBetDls = originalBet;
    let currentStep = streak;

    if (!roundActive) {
      const b = fromActiveAmount(Number(bet));
      if (!b || b <= 0) return;
      const started = await startGameRound('coinflip', b);
      if (!started.success || !started.roundId) {
        showToast(started.message || 'Unable to start round.', 'error', 'Coinflip');
        return;
      }
      baseBetDls = b;
      currentStep = 0;
      setOriginalBet(b);
      setRoundActive(true);
      setStreak(0);
      setDeadStep(null);
      setServerRoundId(started.roundId);
    }

    const roundId = serverRoundId || (await startGameRound('coinflip', baseBetDls)).roundId;
    if (!roundId) return;

    setFlipping(true);
    setResult(null);
    setWon(null);
    setCashedOutInfo(null);
    sound.playClick(); sound.playFlip(); sound.playCoinSpin();

    const resolved = await resolveGameRound(roundId, { choice: chosenSide, step: currentStep, final: false });
    if (!resolved.success || !resolved.result) {
      setFlipping(false);
      showToast(resolved.message || 'Unable to resolve round.', 'error', 'Coinflip');
      return;
    }

    const outcome = resolved.result.winningSide as 'heads' | 'tails';
    const isWin = resolved.result.outcome === 'win';
    const baseSpins = 6 + Math.floor(Math.random() * 2);
    const minTarget = coinRotation + baseSpins * 360;
    const targetAngle = outcome === 'heads'
      ? Math.ceil(minTarget / 360) * 360
      : Math.floor(minTarget / 360) * 360 + 180;
    setCoinRotation(targetAngle);

    flipTimeoutRef.current = setTimeout(() => {
      setResult(outcome);
      setWon(isWin);
      setFlipping(false);
      sound.playCoinLand(isWin);

      if (!isWin) {
        setDeadStep(currentStep);
        setRoundActive(false);
        setStreak(0);
        setServerRoundId(null);
        sound.playExplosion();
        setActiveGameSession(null);
        localStorage.removeItem('voidps_coinflip_state');
        return;
      }

      const nextStreak = currentStep + 1;
      const multiplier = MULTIPLIERS[Math.min(nextStreak - 1, MULTIPLIERS.length - 1)];
      const newPot = baseBetDls * multiplier;
      setStreak(nextStreak);
      setCurrentPot(newPot);
      sound.playCashout();

      if (nextStreak >= TOTAL_STEPS) {
        resolveGameRound(roundId, { choice: chosenSide, step: nextStreak, final: true }).then((finalResult) => {
          if (finalResult.success) {
            setCashedOutInfo({ multiplier, payout: finalResult.payoutDls || newPot });
            sound.playWin();
          }
        });
        setRoundActive(false);
        setServerRoundId(null);
        setActiveGameSession(null);
        localStorage.removeItem('voidps_coinflip_state');
      } else {
        setActiveGameSession({ gameId: 'coinflip', gameTitle: 'Coinflip' });
      }
    }, 1800);
  };

  // Cashout button handler
  const handleCashout = async () => {
    if (flipping || !roundActive || currentPot <= 0 || !serverRoundId) return;
    sound.playClick(); sound.playCashout(); sound.playWin();
    const multiplier = streak > 0 ? MULTIPLIERS[streak - 1] : 1;
    const resolved = await resolveGameRound(serverRoundId, { cashout:true, step:streak, final:true });
    if (!resolved.success) {
      showToast(resolved.message || 'Cashout failed.', 'error', 'Coinflip');
      return;
    }
    setCashedOutInfo({ multiplier, payout: resolved.payoutDls || currentPot });
    setRoundActive(false);
    setWon(true);
    setServerRoundId(null);
    setActiveGameSession(null);
    localStorage.removeItem('voidps_coinflip_state');
  };

  const activeMultiplier = streak > 0 ? MULTIPLIERS[streak - 1] : MULTIPLIERS[0];

  return (
    <GameShell
      title="Coin Flip"
      icon="/assets/coinflip.png"
      badge="1.92× Base"
      onBack={onBack}
      controls={
        <>
          <div className="space-y-4">
            {/* Manual / Auto Tabs */}
            <ManualAutoTabs mode={betMode} setMode={setBetMode} />

            {/* Bet Input */}
            <BetInput value={bet} setValue={setBet} disabled={flipping || roundActive} />

            {/* Select Coin Side: clicking Heads or Tails directly triggers the flip */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400 block">
                Select Coin Side
              </label>
              <div className="grid grid-cols-2 gap-2">
                {/* Heads Button — click directly flips heads */}
                <button
                  type="button"
                  disabled={flipping}
                  onClick={() => flip('heads')}
                  className={`flex items-center justify-center gap-2.5 py-3 px-3 rounded-xl border transition-all cursor-pointer ${
                    side === 'heads'
                      ? 'bg-[#152336] text-white border-amber-400/80 shadow-md shadow-amber-500/15 ring-1 ring-amber-400/40'
                      : 'bg-[#0b121e] border-[#1a2638] hover:border-slate-500 text-slate-400'
                  }`}
                >
                  <img
                    src="/assets/coin_heads.png"
                    alt="Heads"
                    className="w-6 h-6 object-contain"
                    draggable={false}
                  />
                  <span className="text-xs font-bold text-white">Heads</span>
                </button>

                {/* Tails Button — click directly flips tails */}
                <button
                  type="button"
                  disabled={flipping}
                  onClick={() => flip('tails')}
                  className={`flex items-center justify-center gap-2.5 py-3 px-3 rounded-xl border transition-all cursor-pointer ${
                    side === 'tails'
                      ? 'bg-[#152336] text-white border-cyan-400/80 shadow-md shadow-cyan-500/15 ring-1 ring-cyan-400/40'
                      : 'bg-[#0b121e] border-[#1a2638] hover:border-slate-500 text-slate-400'
                  }`}
                >
                  <img
                    src="/assets/coin_tails.png"
                    alt="Tails"
                    className="w-6 h-6 object-contain"
                    draggable={false}
                  />
                  <span className="text-xs font-bold text-white">Tails</span>
                </button>
              </div>
            </div>
          </div>

          {/* Action button & Current Payout box */}
          <div className="pt-2 space-y-2 border-t border-[#162337]">
            {roundActive ? (
              <button
                type="button"
                disabled={flipping || currentPot <= 0}
                onClick={handleCashout}
                className="w-full py-3.5 rounded-xl font-black text-sm uppercase tracking-wide bg-[#0074e4] hover:bg-[#0084ff] text-white shadow-lg shadow-blue-600/30 transition cursor-pointer disabled:opacity-50"
              >
                Cash Out
              </button>
            ) : (
              <button
                type="button"
                disabled={flipping}
                onClick={() => flip(side)}
                className="w-full py-3.5 rounded-xl font-black text-sm uppercase tracking-wide bg-[#0074e4] hover:bg-[#0084ff] text-white shadow-lg shadow-blue-600/30 transition cursor-pointer"
              >
                Bet
              </button>
            )}

            {/* Current Payout (1.92×) matching media_1789510076724.png */}
            <PayoutMultiplierStats
              hideNextMultiplier
              currentMultiplier={activeMultiplier}
              currentPayout={roundActive ? currentPot : 0}
            />
          </div>
        </>
      }
    >
      <div className="relative flex h-full flex-col items-center justify-between py-2 px-3 overflow-hidden select-none">

        {/* 3D Physical Coin — Center Stage */}
        <div className="relative z-10 flex flex-col items-center justify-center flex-1 py-4">
          <div
            className="relative flex items-center justify-center"
            style={{ perspective: '1200px', width: '220px', height: '220px' }}
          >
            {/* The 3D Coin Model */}
            <div
              className="relative w-44 h-44 sm:w-52 sm:h-52 select-none"
              style={{
                transformStyle: 'preserve-3d',
                transform: `translate3d(0, 0, 0) rotateY(${coinRotation}deg)`,
                transition: flipping
                  ? 'transform 1.8s cubic-bezier(0.2, 0.85, 0.25, 1)'
                  : 'transform 0.4s ease-out',
                willChange: 'transform',
              }}
            >
              {/* FRONT: Heads (Gold Star) */}
              <div
                className="absolute inset-0 rounded-full flex items-center justify-center overflow-hidden"
                style={{
                  backfaceVisibility: 'hidden',
                  transform: 'translateZ(5px)',
                  boxShadow: '0 4px 18px rgba(245,158,11,0.35)',
                }}
              >
                <img
                  src="/assets/coin_heads.png"
                  alt="Heads"
                  className="w-full h-full object-contain pointer-events-none"
                  draggable={false}
                />
              </div>

              {/* BACK: Tails (Silver Star) */}
              <div
                className="absolute inset-0 rounded-full flex items-center justify-center overflow-hidden"
                style={{
                  backfaceVisibility: 'hidden',
                  transform: 'rotateY(180deg) translateZ(5px)',
                  boxShadow: '0 4px 18px rgba(56,189,248,0.35)',
                }}
              >
                <img
                  src="/assets/coin_tails.png"
                  alt="Tails"
                  className="w-full h-full object-contain pointer-events-none"
                  draggable={false}
                />
              </div>

              {/* Rim */}
              <div
                className="absolute inset-0 rounded-full pointer-events-none"
                style={{
                  transform: 'translateZ(0px)',
                  border: '4px solid #ca8a04',
                  backgroundColor: '#eab308',
                }}
              />
            </div>

            {/* Static Ground Shadow */}
            <div className="absolute -bottom-6 w-36 h-5 bg-black/60 rounded-full pointer-events-none blur-[4px]" />

            {/* Stake-style Green Border Cashout Card Overlay */}
            {cashedOutInfo && !flipping && (
              <CashoutCardOverlay
                multiplier={cashedOutInfo.multiplier}
                payout={cashedOutInfo.payout}
              />
            )}
          </div>

          {/* Status announcement */}
          <div className="mt-8 flex flex-col items-center gap-1">
            <span className="text-xs font-mono font-black uppercase tracking-widest text-slate-300">
              {flipping ? (
                <span className="text-amber-400 animate-pulse">Flipping…</span>
              ) : result ? (
                <span className={result === 'heads' ? 'text-amber-400' : 'text-cyan-400'}>
                  Landed on {result.toUpperCase()}
                </span>
              ) : (
                <span className="text-slate-500">Pick side and flip</span>
              )}
            </span>
          </div>

          {/* Win / Loss Result Announcement */}
          {won !== null && !flipping && (
            <div className="relative z-10 mt-2 animate-in fade-in zoom-in duration-200">
              {won ? (
                <ResultPill win>
                  {streak > 0 && roundActive
                    ? `Step ${streak} Won! Pot: ${toActiveAmount(currentPot).toFixed(2)} ${currencyLabel}`
                    : `Cashed out ${toActiveAmount(currentPot || fromActiveAmount(Number(bet)) * activeMultiplier).toFixed(2)} ${currencyLabel}!`}
                </ResultPill>
              ) : (
                <ResultPill>
                  Landed on {result?.toUpperCase()} — Round lost.
                </ResultPill>
              )}
            </div>
          )}
        </div>

        {/* ── BOTTOM: 9-Coin Path Process matching user's screenshots ── */}
        <div className="w-full pt-2 pb-2 border-t border-[#141f2e]">
          {/* Flips counter above circles when streak > 0 during round */}
          {streak > 0 && roundActive && (
            <div className="text-center text-xs font-mono font-bold text-slate-400 mb-2">
              Flips: <span className="text-white">{streak}</span>
            </div>
          )}

          <div className="flex items-center justify-center gap-2 sm:gap-3 overflow-x-auto px-2">
            {Array.from({ length: TOTAL_STEPS }, (_, i) => {
              const mult = MULTIPLIERS[i];
              const slotOutcome = roundPath[i] ?? (i % 2 === 0 ? 'heads' : 'tails');
              const isWon = i < streak;
              const isLost = deadStep === i;
              const isDied = deadStep !== null; // Player died in this round!

              return (
                <div key={i} className="flex-shrink-0 flex items-center justify-center">
                  {/* ONLY WHEN DIED: reveal the full sequence of coins */}
                  {isDied ? (
                    <div
                      className={`relative rounded-full flex items-center justify-center transition-all duration-300 ${
                        isLost
                          ? 'ring-2 ring-red-500 shadow-[0_0_12px_rgba(239,68,68,0.7)]'
                          : isWon
                          ? 'shadow-[0_0_12px_rgba(245,158,11,0.55)] ring-2 ring-amber-400/80'
                          : 'opacity-40'
                      }`}
                      style={{ width: 56, height: 56 }}
                    >
                      <img
                        src={slotOutcome === 'heads' ? '/assets/coin_heads.png' : '/assets/coin_tails.png'}
                        alt={slotOutcome}
                        className="w-full h-full object-contain pointer-events-none"
                        draggable={false}
                      />
                    </div>
                  ) : isWon ? (
                    /* WON STEP: show bright won coin */
                    <div
                      className="relative rounded-full flex items-center justify-center shadow-[0_0_14px_rgba(245,158,11,0.55)] ring-2 ring-amber-400/80"
                      style={{ width: 56, height: 56 }}
                    >
                      <img
                        src={slotOutcome === 'heads' ? '/assets/coin_heads.png' : '/assets/coin_tails.png'}
                        alt={slotOutcome}
                        className="w-full h-full object-contain pointer-events-none"
                        draggable={false}
                      />
                    </div>
                  ) : (
                    /* NORMAL / PLAYING STATE: dark circular pill with multiplier text */
                    <div
                      className={`flex items-center justify-center rounded-full border transition-all ${
                        roundActive && i === streak
                          ? 'bg-[#0d1c2e] border-cyan-400/60 shadow-[0_0_10px_rgba(56,189,248,0.3)] text-cyan-300'
                          : 'bg-[#0a121e] border-[#152336] text-slate-400'
                      }`}
                      style={{ width: 56, height: 56 }}
                    >
                      <span className="text-xs font-mono font-black select-none">
                        {mult >= 100 ? `${Math.round(mult)}×` : `${mult.toFixed(2)}×`}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </GameShell>
  );
};

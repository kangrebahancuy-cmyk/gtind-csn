import React, { useState, useRef, useEffect } from 'react';
import { Trash2, RotateCcw, ChevronLeft, ChevronRight } from 'lucide-react';
import { useGame } from '../../context/GameContext';
import { sound } from '../../utils/audio';
import { GameShell, ManualAutoTabs, PayoutMultiplierStats } from './GamePrimitives';

// Standard European Roulette Wheel Numbers Order (37 pockets)
const EUROPEAN_WHEEL_NUMBERS = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
  5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26
];

const RED_NUMBERS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];

function isRed(num: number): boolean {
  return RED_NUMBERS.includes(num);
}

function getNumberColor(num: number): 'green' | 'red' | 'black' {
  if (num === 0) return 'green';
  return isRed(num) ? 'red' : 'black';
}

const DLS_CHIPS = [1, 10, 100, 1000];
const BGLS_CHIPS = [0.01, 0.1, 1, 10];

export const RouletteGame: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const {
    activeCurrency,
    fromActiveAmount,
    deductBet,
    awardPayout,
    recordLoss,
    currencyLabel,
    currencyIcon,
    user,
    setAuthModalOpen,
    checkCanPlayGame,
    balance,
    showToast,
    startGameRound,
    resolveGameRound,
  } = useGame();

  const CHIP_VALUES = activeCurrency === 'BGLS' ? BGLS_CHIPS : DLS_CHIPS;

  const [betMode, setBetMode] = useState<'manual' | 'auto'>('manual');
  const [selectedChipIndex, setSelectedChipIndex] = useState(0);
  const selectedChip = CHIP_VALUES[selectedChipIndex];

  // Bet Map: key -> amount in active currency
  const [bets, setBets] = useState<Record<string, number>>({});
  const [betHistory, setBetHistory] = useState<Record<string, number>[]>([]);

  // Wheel Animation State
  const [spinning, setSpinning] = useState(false);
  const [winningNumber, setWinningNumber] = useState<number | null>(null);
  const [payoutResult, setPayoutResult] = useState<{ totalWin: number; won: boolean } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Wheel rotation angles
  const wheelAngleRef = useRef<number>(0);
  const ballAngleRef = useRef<number>(0);
  const ballRadiusRef = useRef<number>(100);

  // Reset chip index when currency changes
  useEffect(() => {
    setSelectedChipIndex(0);
    setBets({});
  }, [activeCurrency]);

  // Total Bet in Active Currency
  const totalBetAmount = Number(Object.values(bets).reduce((acc, val) => acc + val, 0).toFixed(2));

  // Cycle chips with left/right arrows
  const prevChip = () => {
    setSelectedChipIndex((prev) => (prev > 0 ? prev - 1 : CHIP_VALUES.length - 1));
  };
  const nextChip = () => {
    setSelectedChipIndex((prev) => (prev < CHIP_VALUES.length - 1 ? prev + 1 : 0));
  };

  // Place Chip on Bet Spot
  const placeChip = (spotKey: string) => {
    if (spinning) return;
    if (!checkCanPlayGame('roulette', 'Roulette')) return;
    sound.playClick();
    setBets((prev) => {
      const current = prev[spotKey] || 0;
      const next = { ...prev, [spotKey]: Number((current + selectedChip).toFixed(2)) };
      setBetHistory((h) => [...h, prev]);
      return next;
    });
  };

  const clearAllBets = () => {
    if (spinning) return;
    sound.playClick();
    setBets({});
  };

  const undoLastBet = () => {
    if (spinning || betHistory.length === 0) return;
    sound.playClick();
    const last = betHistory[betHistory.length - 1];
    setBets(last);
    setBetHistory((h) => h.slice(0, -1));
  };

  // Halve and Double all placed bets
  const halveBets = () => {
    if (spinning || totalBetAmount <= 0) return;
    sound.playClick();
    setBets((prev) => {
      const next: Record<string, number> = {};
      for (const [k, v] of Object.entries(prev)) {
        next[k] = Number(Math.max(0.01, v / 2).toFixed(2));
      }
      return next;
    });
  };

  const doubleBets = () => {
    if (spinning || totalBetAmount <= 0) return;
    sound.playClick();
    if (totalBetAmount >= balance) {
      showToast('Cannot double bets: maximum available balance reached.', 'warning', 'Max Balance Reached');
      return;
    }
    const maxRatio = Math.min(2, balance / totalBetAmount);
    setBets((prev) => {
      const next: Record<string, number> = {};
      for (const [k, v] of Object.entries(prev)) {
        next[k] = Number((v * maxRatio).toFixed(2));
      }
      return next;
    });
  };

  // Draw Realistic European Roulette Wheel & Ball on Canvas
  const drawWheel = (wheelAngle: number, ballAngle: number, ballRadius: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const outerRadius = width / 2 - 8;
    const totalPockets = EUROPEAN_WHEEL_NUMBERS.length; // 37
    const pocketAngle = (Math.PI * 2) / totalPockets;

    ctx.clearRect(0, 0, width, height);

    // 1. Outer Dark Wooden/Metallic Rim
    ctx.save();
    ctx.beginPath();
    ctx.arc(centerX, centerY, outerRadius, 0, Math.PI * 2);
    ctx.fillStyle = '#0b111a';
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#1e2d42';
    ctx.stroke();

    // Subtle metallic gold track ring
    ctx.beginPath();
    ctx.arc(centerX, centerY, outerRadius - 3, 0, Math.PI * 2);
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#d4af37';
    ctx.stroke();
    ctx.restore();

    // 2. Rotating Wheel Pockets & Numbers
    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(wheelAngle);

    const pocketInnerR = outerRadius * 0.58;
    const pocketOuterR = outerRadius - 8;

    for (let i = 0; i < totalPockets; i++) {
      const num = EUROPEAN_WHEEL_NUMBERS[i];
      const startA = i * pocketAngle;
      const endA = startA + pocketAngle;
      const colorType = getNumberColor(num);

      // Pocket Wedge
      ctx.beginPath();
      ctx.arc(0, 0, pocketOuterR, startA, endA);
      ctx.arc(0, 0, pocketInnerR, endA, startA, true);
      ctx.closePath();

      if (colorType === 'green') {
        ctx.fillStyle = '#16a34a';
      } else if (colorType === 'red') {
        ctx.fillStyle = '#dc2626';
      } else {
        ctx.fillStyle = '#0f172a';
      }
      ctx.fill();

      // Pocket border
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Number Text
      ctx.save();
      ctx.rotate(startA + pocketAngle / 2);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 8px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(num.toString(), (pocketInnerR + pocketOuterR) / 2, 0);
      ctx.restore();
    }

    // 3. Wheel Center Hub with Gold Cross/Star
    ctx.beginPath();
    ctx.arc(0, 0, pocketInnerR, 0, Math.PI * 2);
    ctx.fillStyle = '#080d16';
    ctx.fill();
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Central circular gold ring
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
    ctx.strokeStyle = '#eab308';
    ctx.lineWidth = 3.5;
    ctx.stroke();

    // 4 curved gold handles extending outwards like in screenshot
    for (let k = 0; k < 4; k++) {
      ctx.save();
      ctx.rotate((k * Math.PI) / 2);
      ctx.beginPath();
      ctx.moveTo(14, -3);
      ctx.quadraticCurveTo(pocketInnerR * 0.45, -5, pocketInnerR * 0.72, 0);
      ctx.quadraticCurveTo(pocketInnerR * 0.45, 5, 14, 3);
      ctx.fillStyle = '#eab308';
      ctx.fill();
      ctx.restore();
    }

    ctx.restore();

    // 4. White Ball
    ctx.save();
    ctx.translate(centerX, centerY);
    const ballX = Math.cos(ballAngle) * ballRadius;
    const ballY = Math.sin(ballAngle) * ballRadius;

    ctx.beginPath();
    ctx.arc(ballX, ballY, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(255,255,255,0.9)';
    ctx.shadowBlur = 8;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(ballX - 1.5, ballY - 1.5, 2, 0, Math.PI * 2);
    ctx.fillStyle = '#f8fafc';
    ctx.fill();
    ctx.restore();
  };

  useEffect(() => {
    drawWheel(0, 0, 95);
  }, []);

  // Spin the European Roulette Wheel
  const spinWheel = async () => {
    if (!user.isAuthenticated) {
      setAuthModalOpen(true);
      return;
    }

    if (spinning || totalBetAmount <= 0) return;

    const totalBetDls = fromActiveAmount(totalBetAmount);
    if (!Number.isFinite(totalBetDls) || totalBetDls <= 0) return;
    const started = await startGameRound('roulette', totalBetDls);
    if (!started.success || !started.roundId) return;

    sound.playClick();
    setSpinning(true);
    setWinningNumber(null);
    setPayoutResult(null);

    const resolvedPromise = resolveGameRound(started.roundId, { bets });
    const resolved = await resolvedPromise;
    if (!resolved.success || !resolved.result) return;
    const targetWinNumber = Number(resolved.result.winningNumber);
    const winningIndex = EUROPEAN_WHEEL_NUMBERS.indexOf(targetWinNumber);

    const startTime = Date.now();
    const duration = 3600;
    const canvas = canvasRef.current;
    const outerTrackRadius = canvas ? canvas.width / 2 - 16 : 95;
    const pocketLandingRadius = outerTrackRadius - 26;

    const pocketAngle = (Math.PI * 2) / EUROPEAN_WHEEL_NUMBERS.length;
    const initialWheelAngle = wheelAngleRef.current;
    const totalWheelDelta = 4 * Math.PI * 2 + Math.random() * Math.PI;

    let lastTickTime = Date.now();

    const animateSpin = () => {
      const now = Date.now();
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      const easeOut = 1 - Math.pow(1 - progress, 2.5);

      const currentWheelAngle = initialWheelAngle + totalWheelDelta * easeOut;
      wheelAngleRef.current = currentWheelAngle;

      const targetPocketAngle = currentWheelAngle + winningIndex * pocketAngle + pocketAngle / 2;
      const remainingBallTurns = (1 - easeOut) * (6 * Math.PI * 2);
      const currentBallAngle = targetPocketAngle - remainingBallTurns;
      ballAngleRef.current = currentBallAngle;

      if (progress > 0.65) {
        const dropProgress = (progress - 0.65) / 0.35;
        const bounce = Math.sin(dropProgress * Math.PI * 3) * (1 - dropProgress) * 3;
        ballRadiusRef.current =
          outerTrackRadius - dropProgress * (outerTrackRadius - pocketLandingRadius) + bounce;
      } else {
        ballRadiusRef.current = outerTrackRadius;
      }

      if (now - lastTickTime > Math.max(65, 65 + progress * 260)) {
        lastTickTime = now;
        sound.playRouletteBallTick();
      }

      drawWheel(wheelAngleRef.current, ballAngleRef.current, ballRadiusRef.current);

      if (progress < 1) {
        animFrameRef.current = requestAnimationFrame(animateSpin);
      } else {
        setWinningNumber(targetWinNumber);
        setSpinning(false);

        const wonTotalDls = Number(resolved.payoutDls || 0);
        if (wonTotalDls > 0) {
          setPayoutResult({ totalWin: wonTotalDls, won: true });
          sound.playCashout();
          sound.playWin();
        } else {
          setPayoutResult({ totalWin: 0, won: false });
          sound.playExplosion();
        }

        setPayoutResult({ totalWin: wonTotalDls, won: true });
          sound.playCashout();
          sound.playWin();
        } else {
          recordLoss(totalBetDls, 'Roulette');
          setPayoutResult({ totalWin: 0, won: false });
          sound.playExplosion();
        }
      }
    };

    animFrameRef.current = requestAnimationFrame(animateSpin);
  };

  useEffect(() => {
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  // Chip Badge Renderer
  const renderChipBadge = (amount?: number) => {
    if (!amount || amount <= 0) return null;
    return (
      <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-4 px-1 rounded-full bg-amber-400 text-slate-950 font-black text-[9px] font-mono border border-amber-300 shadow-md flex items-center justify-center z-10 pointer-events-none">
        {amount >= 1 ? amount : amount.toFixed(2)}
      </span>
    );
  };

  return (
    <GameShell
      title="Roulette"
      icon="/assets/roulette.png"
      badge="97.3% RTP · European"
      onBack={onBack}
      controls={
        <>
          <div className="space-y-4">
            {/* Manual / Auto Pill */}
            <ManualAutoTabs mode={betMode} setMode={setBetMode} />

            {/* Chip Value Carousel with < and > matching media_1789396097691.png */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-400">
                <span>Chip Value</span>
                <span className="text-white font-mono font-bold">{selectedChip}</span>
                <img src={currencyIcon} alt={currencyLabel} className="w-3.5 h-3.5 object-contain" />
              </div>
              <div className="bg-[#080d16] border border-[#141f30] rounded-xl p-1.5 flex items-center justify-between gap-1">
                <button
                  type="button"
                  onClick={prevChip}
                  className="w-7 h-7 rounded-lg bg-[#111927] hover:bg-[#182335] text-slate-400 hover:text-white flex items-center justify-center transition cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <div className="flex items-center gap-1.5 overflow-x-auto py-0.5">
                  {CHIP_VALUES.slice(0, 4).map((val) => {
                    const isSelected = selectedChip === val;
                    return (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setSelectedChipIndex(CHIP_VALUES.indexOf(val))}
                        className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-[10px] font-mono transition-transform cursor-pointer ${
                          isSelected
                            ? 'bg-amber-400 text-slate-950 border-2 border-amber-300 shadow-md scale-110'
                            : 'bg-[#b8860b]/30 text-amber-300 border border-amber-500/40 hover:scale-105'
                        }`}
                      >
                        {val >= 1 ? val : val.toString().replace('0.', '.')}
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={nextChip}
                  className="w-7 h-7 rounded-lg bg-[#111927] hover:bg-[#182335] text-slate-400 hover:text-white flex items-center justify-center transition cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Total Bet Input with Padlock and 1/2, 2x matching media_1789396097691.png */}
            <div className="space-y-1.5">
              <span className="text-xs font-semibold text-slate-400">Total Bet</span>
              <div className="bg-[#0b121e] border border-[#1a2638] rounded-xl flex items-center px-3 py-2">
                <div className="flex items-center gap-1.5 flex-1">
                  <span className="text-white font-mono font-bold text-sm">{totalBetAmount}</span>
                  <img src={currencyIcon} alt={currencyLabel} className="w-4 h-4 object-contain" />
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={halveBets}
                    className="text-xs font-bold text-slate-400 hover:text-white px-2 py-0.5 rounded hover:bg-white/10 transition-colors cursor-pointer"
                  >
                    ½
                  </button>
                  <button
                    type="button"
                    onClick={doubleBets}
                    className="text-xs font-bold text-slate-400 hover:text-white px-2 py-0.5 rounded hover:bg-white/10 transition-colors cursor-pointer"
                  >
                    2×
                  </button>
                </div>
              </div>
            </div>

            {/* Undo & Clear Buttons */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={spinning || totalBetAmount === 0}
                onClick={undoLastBet}
                className="py-2 px-3 rounded-xl bg-[#142236] hover:bg-[#1a2d47] border border-[#203756] text-xs font-bold text-slate-300 transition flex items-center justify-center gap-1.5 disabled:opacity-40 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5 text-cyan-400" /> Undo
              </button>
              <button
                type="button"
                disabled={spinning || totalBetAmount === 0}
                onClick={clearAllBets}
                className="py-2 px-3 rounded-xl bg-[#142236] hover:bg-[#1a2d47] border border-[#203756] text-xs font-bold text-red-400 transition flex items-center justify-center gap-1.5 disabled:opacity-40 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" /> Clear All
              </button>
            </div>
          </div>

          {/* Action Button & Stats matching Mines */}
          <div className="pt-2 space-y-2 border-t border-[#162337]">
            <button
              type="button"
              disabled={spinning || totalBetAmount <= 0}
              onClick={spinWheel}
              className="w-full py-3.5 rounded-xl font-black text-sm uppercase tracking-wide bg-[#0074e4] hover:bg-[#0084ff] active:bg-[#0066cb] text-white shadow-lg shadow-blue-600/30 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {spinning ? 'Wheel Spinning…' : 'Bet'}
            </button>

            {/* Next Multiplier & Current Payout boxes matching media_1789396011586.png */}
            <PayoutMultiplierStats
              hideNextMultiplier
              currentMultiplier={payoutResult?.won ? (payoutResult.totalWin / fromActiveAmount(totalBetAmount)).toFixed(2) : undefined}
              currentPayout={payoutResult?.won ? payoutResult.totalWin : 0}
            />
          </div>
        </>
      }
    >
      {/* Central Wheel on top + European Table below matching media_1789396097691.png */}
      <div className="w-full flex flex-col items-center justify-center gap-4 py-2 px-2 select-none">
        {/* Real European Wheel Canvas */}
        <div className="relative flex flex-col items-center justify-center shrink-0">
          <canvas
            ref={canvasRef}
            width={230}
            height={230}
            className="w-48 h-48 sm:w-52 sm:h-52 select-none pointer-events-none rounded-full shadow-2xl"
          />
          {winningNumber !== null && !spinning && (
            <div
              className={`absolute inset-0 m-auto w-12 h-12 rounded-full flex flex-col items-center justify-center text-white font-mono font-black text-base border-2 shadow-2xl animate-in zoom-in-75 ${
                getNumberColor(winningNumber) === 'green'
                  ? 'bg-emerald-600 border-emerald-300'
                  : getNumberColor(winningNumber) === 'red'
                  ? 'bg-red-600 border-red-300'
                  : 'bg-slate-900 border-slate-500'
              }`}
            >
              {winningNumber}
            </div>
          )}
        </div>

        {/* European Betting Table matching media_1789397198583.png (Image 2) */}
        <div
          className="w-full max-w-[650px] select-none text-[11px] font-mono font-bold"
          style={{
            display: 'grid',
            gridTemplateColumns: '44px repeat(12, minmax(0, 1fr)) 42px',
            gridTemplateRows: 'repeat(5, 36px)',
            gap: '3px',
          }}
        >
          {/* Green 0 spanning 3 rows on the far left */}
          <button
            type="button"
            disabled={spinning}
            onClick={() => placeChip('num_0')}
            style={{ gridColumn: '1', gridRow: '1 / span 3' }}
            className="rounded-lg bg-[#22c55e] hover:bg-[#16a34a] text-white flex items-center justify-center text-sm font-black relative transition cursor-pointer shadow-sm"
          >
            0
            {renderChipBadge(bets['num_0'])}
          </button>

          {/* Row 1: Numbers 3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36 */}
          {[3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36].map((n, idx) => (
            <button
              key={n}
              type="button"
              disabled={spinning}
              onClick={() => placeChip(`num_${n}`)}
              style={{ gridColumn: `${idx + 2}`, gridRow: '1' }}
              className={`rounded-md flex items-center justify-center text-white relative transition hover:brightness-110 cursor-pointer text-xs font-bold ${
                isRed(n) ? 'bg-[#dc2626]' : 'bg-[#1e293b]'
              }`}
            >
              {n}
              {renderChipBadge(bets[`num_${n}`])}
            </button>
          ))}

          {/* Row 1, Column 14: 2:1 for Column 3 */}
          <button
            type="button"
            disabled={spinning}
            onClick={() => placeChip('col_3')}
            style={{ gridColumn: '14', gridRow: '1' }}
            className="rounded-md bg-[#111c2a] hover:bg-[#18283c] text-slate-300 border border-[#1e2d42] flex items-center justify-center text-[10px] relative cursor-pointer"
          >
            2:1
            {renderChipBadge(bets['col_3'])}
          </button>

          {/* Row 2: Numbers 2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35 */}
          {[2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35].map((n, idx) => (
            <button
              key={n}
              type="button"
              disabled={spinning}
              onClick={() => placeChip(`num_${n}`)}
              style={{ gridColumn: `${idx + 2}`, gridRow: '2' }}
              className={`rounded-md flex items-center justify-center text-white relative transition hover:brightness-110 cursor-pointer text-xs font-bold ${
                isRed(n) ? 'bg-[#dc2626]' : 'bg-[#1e293b]'
              }`}
            >
              {n}
              {renderChipBadge(bets[`num_${n}`])}
            </button>
          ))}

          {/* Row 2, Column 14: 2:1 for Column 2 */}
          <button
            type="button"
            disabled={spinning}
            onClick={() => placeChip('col_2')}
            style={{ gridColumn: '14', gridRow: '2' }}
            className="rounded-md bg-[#111c2a] hover:bg-[#18283c] text-slate-300 border border-[#1e2d42] flex items-center justify-center text-[10px] relative cursor-pointer"
          >
            2:1
            {renderChipBadge(bets['col_2'])}
          </button>

          {/* Row 3: Numbers 1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34 */}
          {[1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34].map((n, idx) => (
            <button
              key={n}
              type="button"
              disabled={spinning}
              onClick={() => placeChip(`num_${n}`)}
              style={{ gridColumn: `${idx + 2}`, gridRow: '3' }}
              className={`rounded-md flex items-center justify-center text-white relative transition hover:brightness-110 cursor-pointer text-xs font-bold ${
                isRed(n) ? 'bg-[#dc2626]' : 'bg-[#1e293b]'
              }`}
            >
              {n}
              {renderChipBadge(bets[`num_${n}`])}
            </button>
          ))}

          {/* Row 3, Column 14: 2:1 for Column 1 */}
          <button
            type="button"
            disabled={spinning}
            onClick={() => placeChip('col_1')}
            style={{ gridColumn: '14', gridRow: '3' }}
            className="rounded-md bg-[#111c2a] hover:bg-[#18283c] text-slate-300 border border-[#1e2d42] flex items-center justify-center text-[10px] relative cursor-pointer"
          >
            2:1
            {renderChipBadge(bets['col_1'])}
          </button>

          {/* Row 4: Dozens */}
          <button
            type="button"
            disabled={spinning}
            onClick={() => placeChip('1st_12')}
            style={{ gridColumn: '2 / span 4', gridRow: '4' }}
            className="rounded-md bg-[#111c2a] hover:bg-[#18283c] text-slate-300 border border-[#1e2d42] text-[10px] flex items-center justify-center relative transition cursor-pointer"
          >
            1 to 12
            {renderChipBadge(bets['1st_12'])}
          </button>
          <button
            type="button"
            disabled={spinning}
            onClick={() => placeChip('2nd_12')}
            style={{ gridColumn: '6 / span 4', gridRow: '4' }}
            className="rounded-md bg-[#111c2a] hover:bg-[#18283c] text-slate-300 border border-[#1e2d42] text-[10px] flex items-center justify-center relative transition cursor-pointer"
          >
            13 to 24
            {renderChipBadge(bets['2nd_12'])}
          </button>
          <button
            type="button"
            disabled={spinning}
            onClick={() => placeChip('3rd_12')}
            style={{ gridColumn: '10 / span 4', gridRow: '4' }}
            className="rounded-md bg-[#111c2a] hover:bg-[#18283c] text-slate-300 border border-[#1e2d42] text-[10px] flex items-center justify-center relative transition cursor-pointer"
          >
            25 to 36
            {renderChipBadge(bets['3rd_12'])}
          </button>

          {/* Row 5: Outside Bets */}
          <button
            type="button"
            disabled={spinning}
            onClick={() => placeChip('1_to_18')}
            style={{ gridColumn: '2 / span 2', gridRow: '5' }}
            className="rounded-md bg-[#111c2a] hover:bg-[#18283c] text-slate-300 border border-[#1e2d42] text-[10px] flex items-center justify-center relative transition cursor-pointer"
          >
            1 to 18
            {renderChipBadge(bets['1_to_18'])}
          </button>
          <button
            type="button"
            disabled={spinning}
            onClick={() => placeChip('even')}
            style={{ gridColumn: '4 / span 2', gridRow: '5' }}
            className="rounded-md bg-[#111c2a] hover:bg-[#18283c] text-slate-300 border border-[#1e2d42] text-[10px] flex items-center justify-center relative transition cursor-pointer"
          >
            Even
            {renderChipBadge(bets['even'])}
          </button>
          {/* Red Box */}
          <button
            type="button"
            disabled={spinning}
            onClick={() => placeChip('red')}
            style={{ gridColumn: '6 / span 2', gridRow: '5' }}
            className="rounded-md bg-[#dc2626] hover:bg-[#ef4444] text-white flex items-center justify-center relative transition cursor-pointer shadow-sm"
          >
            {renderChipBadge(bets['red'])}
          </button>
          {/* Black Box */}
          <button
            type="button"
            disabled={spinning}
            onClick={() => placeChip('black')}
            style={{ gridColumn: '8 / span 2', gridRow: '5' }}
            className="rounded-md bg-[#1e293b] hover:bg-[#334155] text-white flex items-center justify-center relative transition cursor-pointer shadow-sm"
          >
            {renderChipBadge(bets['black'])}
          </button>
          <button
            type="button"
            disabled={spinning}
            onClick={() => placeChip('odd')}
            style={{ gridColumn: '10 / span 2', gridRow: '5' }}
            className="rounded-md bg-[#111c2a] hover:bg-[#18283c] text-slate-300 border border-[#1e2d42] text-[10px] flex items-center justify-center relative transition cursor-pointer"
          >
            Odd
            {renderChipBadge(bets['odd'])}
          </button>
          <button
            type="button"
            disabled={spinning}
            onClick={() => placeChip('19_to_36')}
            style={{ gridColumn: '12 / span 2', gridRow: '5' }}
            className="rounded-md bg-[#111c2a] hover:bg-[#18283c] text-slate-300 border border-[#1e2d42] text-[10px] flex items-center justify-center relative transition cursor-pointer"
          >
            19 to 36
            {renderChipBadge(bets['19_to_36'])}
          </button>
        </div>
      </div>
    </GameShell>
  );
};

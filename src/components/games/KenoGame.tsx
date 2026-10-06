import React, { useState } from 'react';
import { useGame } from '../../context/GameContext';
import { sound } from '../../utils/audio';
import { GameShell, ManualAutoTabs, PayoutMultiplierStats, CashoutCardOverlay } from './GamePrimitives';

type RiskLevel = 'Classic' | 'Low' | 'Medium' | 'High';
const RISK_LEVELS: RiskLevel[] = ['Classic', 'Low', 'Medium', 'High'];

const KENO_PAYTABLES: Record<RiskLevel, Record<number, Record<number, number>>> = {
  Classic: {
    1: { 0: 0, 1: 3.8 },
    2: { 0: 0, 1: 1.7, 2: 5.2 },
    3: { 0: 0, 1: 1.0, 2: 2.7, 3: 26 },
    4: { 0: 0, 1: 0, 2: 1.8, 3: 8, 4: 80 },
    5: { 0: 0, 1: 0, 2: 1.4, 3: 4, 4: 25, 5: 300 },
    6: { 0: 0, 1: 0, 2: 0, 3: 3, 4: 12, 5: 90, 6: 800 },
    7: { 0: 0, 1: 0, 2: 0, 3: 1.8, 4: 6, 5: 30, 6: 250, 7: 2000 },
    8: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 4, 5: 18, 6: 100, 7: 600, 8: 3000 },
    9: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 2.5, 5: 10, 6: 45, 7: 250, 8: 1200, 9: 4500 },
    10: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 1.6, 5: 4.5, 6: 18, 7: 80, 8: 400, 9: 2000, 10: 7500 },
  },
  Low: {
    1: { 0: 0, 1: 1.95 },
    2: { 0: 0, 1: 1.95, 2: 3.9 },
    3: { 0: 0, 1: 1.1, 2: 2.2, 3: 13.5 },
    4: { 0: 0, 1: 0.5, 2: 1.6, 3: 4.2, 4: 24.5 },
    5: { 0: 0, 1: 0.5, 2: 1.2, 3: 2.5, 4: 12.0, 5: 120.0 },
    6: { 0: 0, 1: 0, 2: 1.0, 3: 2.0, 4: 6.0, 5: 30.0, 6: 350.0 },
    7: { 0: 0, 1: 0, 2: 0.8, 3: 1.5, 4: 3.5, 5: 14.0, 6: 90.0, 7: 700.0 },
    8: { 0: 0, 1: 0, 2: 0.5, 3: 1.2, 4: 2.5, 5: 8.0, 6: 45.0, 7: 250.0, 8: 1200.0 },
    9: { 0: 0, 1: 0, 2: 0, 3: 1.0, 4: 2.0, 5: 5.0, 6: 22.0, 7: 100.0, 8: 500.0, 9: 2500.0 },
    10: { 0: 0, 1: 0, 2: 0, 3: 0.8, 4: 1.5, 5: 3.5, 6: 12.0, 7: 45.0, 8: 200.0, 9: 1000.0, 10: 4000.0 },
  },
  Medium: {
    1: { 0: 0, 1: 3.8 },
    2: { 0: 0, 1: 1.75, 2: 4.95 },
    3: { 0: 0, 1: 1.0, 2: 2.8, 3: 28.0 },
    4: { 0: 0, 1: 0, 2: 1.75, 3: 8.5, 4: 85.0 },
    5: { 0: 0, 1: 0, 2: 1.4, 3: 4.0, 4: 27.0, 5: 350.0 },
    6: { 0: 0, 1: 0, 2: 0, 3: 3.0, 4: 12.5, 5: 95.0, 6: 900.0 },
    7: { 0: 0, 1: 0, 2: 0, 3: 1.8, 4: 6.5, 5: 32.0, 6: 275.0, 7: 2200.0 },
    8: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 4.2, 5: 19.0, 6: 110.0, 7: 650.0, 8: 3500.0 },
    9: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 2.5, 5: 11.0, 6: 48.0, 7: 280.0, 8: 1350.0, 9: 5000.0 },
    10: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 1.7, 5: 4.8, 6: 19.5, 7: 85.0, 8: 450.0, 9: 2200.0, 10: 8500.0 },
  },
  High: {
    1: { 0: 0, 1: 3.96 },
    2: { 0: 0, 1: 0, 2: 9.9 },
    3: { 0: 0, 1: 0, 2: 3.5, 3: 52.0 },
    4: { 0: 0, 1: 0, 2: 2.0, 3: 14.0, 4: 170.0 },
    5: { 0: 0, 1: 0, 2: 0, 3: 5.5, 4: 55.0, 5: 750.0 },
    6: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 20.0, 5: 180.0, 6: 2000.0 },
    7: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 9.0, 5: 65.0, 6: 600.0, 7: 5000.0 },
    8: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 35.0, 6: 250.0, 7: 1500.0, 8: 9000.0 },
    9: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 18.0, 6: 100.0, 7: 650.0, 8: 3200.0, 9: 15000.0 },
    10: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 8.5, 6: 40.0, 7: 200.0, 8: 1100.0, 9: 5500.0, 10: 25000.0 },
  },
};

export const KenoGame: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const {
    fromActiveAmount,
    deductBet,
    awardPayout,
    recordLoss,
    currencyLabel,
    currencyIcon,
    user,
    setAuthModalOpen,
    checkCanPlayGame,
    startGameRound,
    resolveGameRound,
  } = useGame();

  const [betMode, setBetMode] = useState<'manual' | 'auto'>('manual');
  const [bet, setBet] = useState('10');
  const [risk, setRisk] = useState<RiskLevel>('Medium');
  const [selectedNumbers, setSelectedNumbers] = useState<number[]>([9, 17]);
  const [drawnNumbers, setDrawnNumbers] = useState<number[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [hitCount, setHitCount] = useState(0);
  const [payoutResult, setPayoutResult] = useState<{ multiplier: number; won: boolean } | null>(null);
  const [cashedOutInfo, setCashedOutInfo] = useState<{ multiplier: number; payout: number } | null>(null);

  // Toggle Number Selection (1 to 10 numbers)
  const toggleNumber = (num: number) => {
    if (drawing) return;
    sound.playClick();
    if (selectedNumbers.includes(num)) {
      setSelectedNumbers((prev) => prev.filter((n) => n !== num));
    } else {
      if (selectedNumbers.length >= 10) return;
      setSelectedNumbers((prev) => [...prev, num]);
    }
  };

  const autoPick = () => {
    if (drawing) return;
    sound.playClick();
    const set = new Set<number>();
    while (set.size < 10) {
      set.add(Math.floor(Math.random() * 40) + 1);
    }
    setSelectedNumbers([...set]);
  };

  const clearSelection = () => {
    if (drawing) return;
    sound.playClick();
    setSelectedNumbers([]);
  };

  // Play Keno: Draw 10 numbers sequentially
  const playKeno = async () => {
    if (!user.isAuthenticated) { setAuthModalOpen(true); return; }
    if (!checkCanPlayGame('keno', 'Keno') || drawing || selectedNumbers.length === 0) return;
    const b = fromActiveAmount(Number(bet)); if (!b || b <= 0) return;
    sound.playClick(); setDrawing(true); setDrawnNumbers([]); setHitCount(0); setPayoutResult(null); setCashedOutInfo(null);
    const started = await startGameRound('keno', b);
    if (!started.success || !started.roundId) { setDrawing(false); return; }
    const resolved = await resolveGameRound(started.roundId, { picks:selectedNumbers, risk });
    if (!resolved.success || !resolved.result) { setDrawing(false); return; }
    const drawn = Array.isArray(resolved.result.drawn) ? resolved.result.drawn : [];
    drawn.forEach((n:number,i:number)=>setTimeout(()=>{ setDrawnNumbers(p=>[...p,n]); if(selectedNumbers.includes(n)){setHitCount(c=>c+1);sound.playGem();} },i*200));
    setTimeout(()=>{
      const hits=Number(resolved.result.hits||0), mult=Number(resolved.result.multiplier||0), payout=Number(resolved.payoutDls||0);
      setDrawing(false); setHitCount(hits);
      if(mult>0){setPayoutResult({multiplier:mult,won:true});setCashedOutInfo({multiplier:mult,payout});sound.playCashout();sound.playWin();}
      else {setPayoutResult({multiplier:0,won:false});sound.playExplosion();}
    }, drawn.length*200+350);
  };

  const picksCount = selectedNumbers.length;
  const currentPaytable = picksCount > 0 ? KENO_PAYTABLES[risk][picksCount] || {} : {};

  return (
    <GameShell
      title="Keno"
      icon="/assets/keno.png"
      badge="98% RTP · 40 Numbers"
      onBack={onBack}
      controls={
        <>
          <div className="space-y-4">
            {/* Manual / Auto Pill matching media_1789397308768.png */}
            <ManualAutoTabs mode={betMode} setMode={setBetMode} />

            {/* Bet Amount Input with Padlock and 1/2, 2x */}
            <div className="space-y-1.5">
              <span className="text-xs font-semibold text-slate-400">Bet Amount</span>
              <div className="bg-[#0b121e] border border-[#1a2638] rounded-xl flex items-center px-3 py-2">
                <div className="flex items-center gap-1.5 flex-1">
                  <img src={currencyIcon} alt={currencyLabel} className="w-4 h-4 object-contain shrink-0" />
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={bet}
                    disabled={drawing}
                    onChange={(e) => setBet(e.target.value)}
                    className="w-full bg-transparent text-white font-mono font-bold text-sm outline-none"
                  />
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    disabled={drawing}
                    onClick={() => setBet((prev) => Math.max(1, Math.floor(Number(prev) / 2)).toString())}
                    className="text-xs font-bold text-slate-400 hover:text-white px-2 py-0.5 rounded hover:bg-white/10 transition-colors cursor-pointer"
                  >
                    ½
                  </button>
                  <button
                    type="button"
                    disabled={drawing}
                    onClick={() => setBet((prev) => (Math.max(1, Number(prev) || 1) * 2).toString())}
                    className="text-xs font-bold text-slate-400 hover:text-white px-2 py-0.5 rounded hover:bg-white/10 transition-colors cursor-pointer"
                  >
                    2×
                  </button>
                </div>
              </div>
            </div>

            {/* Risk Slider matching media_1789397308768.png */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-400">
                <span>Risk</span>
                <span className="text-white font-bold">{risk}</span>
              </div>
              <input
                type="range"
                min="0"
                max="3"
                step="1"
                value={RISK_LEVELS.indexOf(risk)}
                disabled={drawing}
                onChange={(e) => {
                  sound.playClick();
                  setRisk(RISK_LEVELS[Number(e.target.value)]);
                }}
                className="w-full h-1.5 bg-[#141f30] rounded-lg appearance-none cursor-pointer accent-[#0074e4]"
              />
            </div>

            {/* Select Random & Clear Tiles buttons matching media_1789397308768.png */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={drawing}
                onClick={autoPick}
                className="py-2.5 px-3 rounded-xl bg-[#142338] hover:bg-[#1a2e4a] border border-[#20395c] text-xs font-bold text-slate-200 transition flex items-center justify-center cursor-pointer"
              >
                Select Random
              </button>
              <button
                type="button"
                disabled={drawing || selectedNumbers.length === 0}
                onClick={clearSelection}
                className="py-2.5 px-3 rounded-xl bg-[#142338] hover:bg-[#1a2e4a] border border-[#20395c] text-xs font-bold text-slate-200 transition flex items-center justify-center cursor-pointer disabled:opacity-40"
              >
                Clear Tiles
              </button>
            </div>
          </div>

          {/* Primary Action Button */}
          <div className="pt-2 space-y-2 border-t border-[#162337]">
            <button
              type="button"
              disabled={drawing || selectedNumbers.length === 0}
              onClick={playKeno}
              className="w-full py-3.5 rounded-xl font-black text-sm uppercase tracking-wide bg-[#0074e4] hover:bg-[#0084ff] active:bg-[#0066cb] text-white shadow-lg shadow-blue-600/30 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {drawing ? 'Drawing Numbers…' : 'Bet'}
            </button>

            {/* Next Multiplier & Current Payout */}
            <PayoutMultiplierStats
              hideNextMultiplier
              currentMultiplier={payoutResult?.won ? payoutResult.multiplier : undefined}
              currentPayout={payoutResult?.won ? fromActiveAmount(Number(bet)) * payoutResult.multiplier : 0}
            />
          </div>
        </>
      }
    >
      {/* 40-Number Board matching media_1789397308768.png */}
      <div className="flex flex-col items-center justify-center py-2 px-2 sm:px-4 w-full select-none">
        {/* The 40 Numbers Grid (8 columns x 5 rows) */}
        <div className="w-full max-w-[440px] aspect-[8/5] relative my-auto">
          <div className="w-full h-full grid grid-cols-8 gap-2 p-2 rounded-2xl bg-[#090f19] border border-[#16253c] shadow-2xl">
            {Array.from({ length: 40 }, (_, i) => {
              const num = i + 1;
              const isSelected = selectedNumbers.includes(num);
              const isDrawn = drawnNumbers.includes(num);
              const isGemHit = isSelected && isDrawn;

              return (
                <button
                  key={num}
                  type="button"
                  disabled={drawing}
                  onClick={() => toggleNumber(num)}
                  style={{ aspectRatio: '1 / 1' }}
                  className={`w-full aspect-square rounded-xl flex items-center justify-center font-mono font-black text-xs sm:text-sm relative overflow-hidden transition-all cursor-pointer ${
                    isGemHit
                      ? 'bg-[#1c2838] border-2 border-emerald-400 text-emerald-300 shadow-md shadow-emerald-500/20'
                      : isSelected
                      ? 'bg-[#0074e4] text-white border border-[#38bdf8] shadow-md shadow-blue-500/30 scale-100'
                      : isDrawn
                      ? 'bg-[#0e1624] border border-slate-700/40 text-slate-500'
                      : 'bg-[#131d2c] hover:bg-[#1a293d] active:bg-[#20324b] text-slate-200 border border-[#1d2d44]'
                  }`}
                >
                  {isGemHit ? (
                    <div className="w-full h-full p-1 flex items-center justify-center pointer-events-none select-none">
                      <img
                        src="/assets/mine_gem.webp"
                        alt="Gem Hit"
                        className="w-full h-full max-w-[85%] max-h-[85%] object-contain animate-in zoom-in-50 duration-200"
                        draggable={false}
                      />
                    </div>
                  ) : (
                    <span className="leading-none">{num}</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Stake-style Green Border Cashout Card Overlay matching media_1789397247491.png */}
          {payoutResult?.won && cashedOutInfo && (
            <CashoutCardOverlay
              multiplier={cashedOutInfo.multiplier}
              payout={cashedOutInfo.payout}
            />
          )}
        </div>

        {/* Bottom Multipliers Strip matching media_1789560828415.png (0.00x, 1.75x, 4.95x...) */}
        {picksCount > 0 && (
          <div className="w-full max-w-[540px] flex items-center justify-center gap-2 overflow-x-auto mt-4 py-1 px-1">
            {Object.entries(currentPaytable).map(([hits, mult]) => {
              const isCurrentHit = hitCount === Number(hits) && (drawing || payoutResult !== null);
              return (
                <div
                  key={hits}
                  className={`flex-1 min-w-[72px] py-3 px-2 rounded-2xl flex flex-col items-center justify-center border transition-all duration-200 select-none ${
                    isCurrentHit && Number(mult) > 0
                      ? 'bg-[#0a2e2d] border-2 border-emerald-400 text-emerald-300 shadow-[0_0_18px_rgba(16,185,129,0.35)] scale-105 z-10'
                      : 'bg-[#0a121e] border-[#18273c] text-white hover:border-slate-600'
                  }`}
                >
                  <span className="text-xs sm:text-sm font-mono font-black tracking-tight">{Number(mult).toFixed(2)}×</span>
                  <div className="flex items-center gap-1 mt-1 text-[11px] font-mono font-bold text-slate-400">
                    <span>{hits}×</span>
                    <img src="/assets/mine_gem.webp" alt="gem" className="w-3.5 h-3.5 object-contain drop-shadow-[0_0_4px_rgba(0,210,255,0.7)]" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </GameShell>
  );
};

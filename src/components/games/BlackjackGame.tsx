import React, { useState, useRef } from 'react';
import { Spade, RotateCcw, Award, ShieldCheck, Zap } from 'lucide-react';
import { useGame } from '../../context/GameContext';
import { sound } from '../../utils/audio';
import { ActionButton, BetInput, GameShell, ResultPill, ManualAutoTabs, PayoutMultiplierStats } from './GamePrimitives';

type CardSuit = '♠' | '♥' | '♦' | '♣';
type CardRank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';

interface Card {
  suit: CardSuit;
  rank: CardRank;
  value: number;
}

const SUITS: CardSuit[] = ['♠', '♥', '♦', '♣'];
const RANKS: { rank: CardRank; value: number }[] = [
  { rank: 'A', value: 11 },
  { rank: '2', value: 2 },
  { rank: '3', value: 3 },
  { rank: '4', value: 4 },
  { rank: '5', value: 5 },
  { rank: '6', value: 6 },
  { rank: '7', value: 7 },
  { rank: '8', value: 8 },
  { rank: '9', value: 9 },
  { rank: '10', value: 10 },
  { rank: 'J', value: 10 },
  { rank: 'Q', value: 10 },
  { rank: 'K', value: 10 },
];

function createShuffledDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const r of RANKS) {
      deck.push({ suit, rank: r.rank, value: r.value });
    }
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function calculateHandScore(cards: Card[]): { score: number; isSoft: boolean } {
  let total = 0;
  let aces = 0;

  for (const c of cards) {
    total += c.value;
    if (c.rank === 'A') aces++;
  }

  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }

  return { score: total, isSoft: aces > 0 };
}

export const BlackjackGame: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const {
    fromActiveAmount,
    toActiveAmount,
    deductBet,
    awardPayout,
    recordLoss,
    currencyLabel,
    user,
    setAuthModalOpen,
    checkCanPlayGame,
    startGameRound,
    resolveGameRound,
  } = useGame();

  const [betMode, setBetMode] = useState<'manual' | 'auto'>('manual');
  const [bet, setBet] = useState('10');
  const [deck, setDeck] = useState<Card[]>([]);
  const [playerHand, setPlayerHand] = useState<Card[]>([]);
  const [dealerHand, setDealerHand] = useState<Card[]>([]);
  
  // Game states: 'betting' | 'dealing' | 'player_turn' | 'dealer_turn' | 'finished'
  const [gameState, setGameState] = useState<'betting' | 'dealing' | 'player_turn' | 'dealer_turn' | 'finished'>('betting');
  const [roundBet, setRoundBet] = useState(0);
  const [roundId, setRoundId] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [resultTone, setResultTone] = useState<'win' | 'loss' | 'push' | null>(null);

  const playerScore = calculateHandScore(playerHand).score;
  const dealerScore = calculateHandScore(
    gameState === 'player_turn' || gameState === 'dealing' ? dealerHand.slice(0, 1) : dealerHand
  ).score;

  // 1. Realistic Sequential Deal with Card Sounds and Staggered Animations
  const dealHand = async () => {
    if (!user.isAuthenticated) { setAuthModalOpen(true); return; }
    if (!checkCanPlayGame('blackjack','Blackjack')) return;
    const b=fromActiveAmount(Number(bet)); if(!b||b<=0)return;
    const started=await startGameRound('blackjack',b); if(!started.success||!started.roundId)return;
    setRoundId(started.roundId);setRoundBet(b);setResultMessage(null);setResultTone(null);setGameState('dealing');setPlayerHand([]);setDealerHand([]);
    const resolved=await resolveGameRound(started.roundId,{type:'initial'});
    if(!resolved.success||!resolved.result)return;
    const rr=resolved.result; setPlayerHand(rr.player||[]);setDealerHand(rr.dealer||[]);setGameState(rr.phase==='finished'?'finished':'player_turn');
    if(rr.phase==='finished'){const p=Number(rr.payoutDls||0);setResultTone(p>0?'win':'push');setResultMessage(p>0?'NATURAL BLACKJACK!':'Both have Blackjack! Push (Bet Refunded).');setRoundId(null);}
  };

  // 2. Player Action: HIT
  const hit = async () => {
    if(gameState!=='player_turn'||!roundId)return;
    const resolved=await resolveGameRound(roundId,{type:'hit'}); if(!resolved.success||!resolved.result)return;
    const rr=resolved.result;setPlayerHand(rr.player||[]);setDealerHand(rr.dealer||[]);
    if(rr.outcome==='continue'){sound.playCard();return;}
    setGameState('finished');setRoundId(null);const p=Number(resolved.payoutDls||0);
    if(rr.outcome==='win'){setResultTone('win');setResultMessage(`You win ${rr.score} vs ${rr.dealerScore}!`);sound.playWin();sound.playCashout();}else{setResultTone('loss');setResultMessage(`Bust with ${rr.score}!`);sound.playExplosion();}
  };

  // 3. Player Action: STAND (Sequential Dealer Play)
  const stand = async () => {
    if(gameState!=='player_turn'||!roundId)return;
    setGameState('dealer_turn');const resolved=await resolveGameRound(roundId,{type:'stand'});if(!resolved.success||!resolved.result)return;
    const rr=resolved.result;setPlayerHand(rr.player||[]);setDealerHand(rr.dealer||[]);setGameState('finished');setRoundId(null);const p=Number(resolved.payoutDls||0);
    if(rr.outcome==='win'){setResultTone('win');setResultMessage(`You win ${rr.score} vs ${rr.dealerScore}! Paid 2.0x!`);sound.playWin();sound.playCashout();}
    else if(rr.outcome==='push'){setResultTone('push');setResultMessage(`Push at ${rr.score}! Bet returned.`);}
    else{setResultTone('loss');setResultMessage(`Dealer wins with ${rr.dealerScore} vs your ${rr.score}.`);sound.playExplosion();}
  };

  // 4. Player Action: DOUBLE DOWN
  const doubleDown = async () => {
    if(gameState!=='player_turn'||playerHand.length!==2||!roundId)return;
    const resolved=await resolveGameRound(roundId,{type:'double'});if(!resolved.success||!resolved.result)return;
    const rr=resolved.result;setPlayerHand(rr.player||[]);setDealerHand(rr.dealer||[]);setRoundBet(v=>v*2);setGameState('finished');setRoundId(null);
    if(rr.outcome==='win'){setResultTone('win');setResultMessage(`Double win ${rr.score} vs ${rr.dealerScore}! Paid 2.0x!`);sound.playWin();sound.playCashout();}
    else{setResultTone(rr.outcome==='push'?'push':'loss');setResultMessage(rr.outcome==='push'?'Double push — bet returned.':`Double lost with ${rr.score}.`);if(rr.outcome==='loss')sound.playExplosion();}
  };

  const renderCard = (card: Card, hidden = false, idx = 0) => {
    if (hidden) {
      return (
        <div
          key="hidden"
          className="w-16 h-24 sm:w-20 sm:h-28 rounded-xl bg-gradient-to-br from-[#1a2d47] to-[#0f1b2b] border-2 border-[#2b4c77] shadow-2xl flex items-center justify-center select-none animate-in fade-in zoom-in-90 duration-300"
          style={{
            transformOrigin: 'top right',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.6)',
          }}
        >
          <div className="w-12 h-20 sm:w-16 sm:h-24 rounded-lg border border-dashed border-cyan-500/40 flex items-center justify-center">
            <span className="text-sm font-mono font-black text-cyan-400/60 tracking-wider">VOID</span>
          </div>
        </div>
      );
    }

    const isRedSuit = card.suit === '♥' || card.suit === '♦';

    return (
      <div
        key={`${card.rank}-${card.suit}-${idx}`}
        className="w-16 h-24 sm:w-20 sm:h-28 rounded-xl bg-white text-slate-900 border-2 border-slate-200 shadow-2xl flex flex-col justify-between p-1.5 sm:p-2 select-none font-bold animate-in fade-in slide-in-from-top-6 duration-300 transform transition-transform hover:-translate-y-1"
        style={{
          boxShadow: '0 12px 28px -5px rgba(0, 0, 0, 0.5), inset 0 0 8px rgba(0,0,0,0.05)',
        }}
      >
        <div className="flex items-center justify-between leading-none">
          <span className={`text-xs sm:text-sm font-black ${isRedSuit ? 'text-red-600' : 'text-slate-900'}`}>
            {card.rank}
          </span>
          <span className={`text-xs sm:text-sm ${isRedSuit ? 'text-red-600' : 'text-slate-900'}`}>
            {card.suit}
          </span>
        </div>
        <div className={`text-center text-xl sm:text-2xl select-none ${isRedSuit ? 'text-red-600' : 'text-slate-900'}`}>
          {card.suit}
        </div>
        <div className="flex items-center justify-between rotate-180 leading-none">
          <span className={`text-xs sm:text-sm font-black ${isRedSuit ? 'text-red-600' : 'text-slate-900'}`}>
            {card.rank}
          </span>
          <span className={`text-xs sm:text-sm ${isRedSuit ? 'text-red-600' : 'text-slate-900'}`}>
            {card.suit}
          </span>
        </div>
      </div>
    );
  };

  return (
    <GameShell
      title="Blackjack"
      icon="/assets/blackjack.png"
      badge="99.5% RTP · Pays 3:2"
      onBack={onBack}
      controls={
        <>
          <ManualAutoTabs mode={betMode} setMode={setBetMode} />

          {/* Bet Input */}
          <BetInput
            value={bet}
            setValue={setBet}
            disabled={gameState !== 'betting' && gameState !== 'finished'}
          />

          {/* Clean Casino Stats Box */}
          <div className="vp-statbox mt-3 py-2 text-xs">
            <div>
              <span>YOUR SCORE</span>
              <b className="text-cyan-400 font-mono text-sm font-black">
                {playerHand.length ? playerScore : '-'}
              </b>
            </div>
            <div>
              <span>DEALER SHOWS</span>
              <b className="text-slate-200 font-mono text-sm font-black">
                {dealerHand.length
                  ? gameState === 'player_turn' || gameState === 'dealing'
                    ? `${dealerHand[0].value} + ?`
                    : dealerScore
                  : '-'}
              </b>
            </div>
            <div>
              <span>ROUND BET</span>
              <b className="text-emerald-400 font-mono text-sm font-black">
                {roundBet ? toActiveAmount(roundBet) : Number(bet) || 0} {currencyLabel}
              </b>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col gap-2 mt-3">
            {gameState === 'betting' || gameState === 'finished' ? (
              <ActionButton tone="blue" onClick={dealHand}>
                {gameState === 'finished' ? 'Deal Next Hand' : 'Deal Cards'}
              </ActionButton>
            ) : gameState === 'dealing' || gameState === 'dealer_turn' ? (
              <div className="w-full py-3 rounded-xl bg-[#111c2e] border border-[#1d2f4a] text-center text-xs font-bold text-slate-400 animate-pulse">
                {gameState === 'dealing' ? 'Dealing Cards…' : 'Dealer Playing…'}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={hit}
                  className="py-3 px-3 rounded-xl bg-cyan-600 hover:bg-cyan-500 font-black text-xs uppercase tracking-wider text-black transition shadow-lg shadow-cyan-500/30 active:scale-95 cursor-pointer"
                >
                  HIT (+ Card)
                </button>
                <button
                  type="button"
                  onClick={() => stand()}
                  className="py-3 px-3 rounded-xl bg-[#10b981] hover:bg-[#059669] font-black text-xs uppercase tracking-wider text-black transition shadow-lg shadow-emerald-500/30 active:scale-95 cursor-pointer"
                >
                  STAND
                </button>
                {playerHand.length === 2 && (
                  <button
                    type="button"
                    onClick={doubleDown}
                    className="col-span-2 py-2.5 px-3 rounded-xl bg-[#7c3aed] hover:bg-[#6d28d9] font-black text-xs uppercase tracking-wider text-white transition shadow-lg shadow-purple-500/30 active:scale-95 cursor-pointer"
                  >
                    DOUBLE DOWN (2× Bet)
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Current Payout only */}
          <PayoutMultiplierStats
            hideNextMultiplier
            currentMultiplier={
              gameState === 'finished' && resultTone === 'win'
                ? playerHand.length === 2 && playerScore === 21
                  ? '2.50×'
                  : '2.00×'
                : gameState === 'player_turn' || gameState === 'dealing'
                ? '1.00×'
                : undefined
            }
            currentPayout={
              gameState === 'finished' && resultTone === 'win'
                ? playerHand.length === 2 && playerScore === 21
                  ? (roundBet * 2.5).toFixed(2)
                  : (roundBet * 2).toFixed(2)
                : gameState === 'player_turn'
                ? (roundBet * 2).toFixed(2)
                : '0'
            }
          />
        </>
      }
    >
      {/* Felt Table Stage: Viewport fitted without scrolling */}
      <div className="flex h-full max-h-[calc(100vh-170px)] flex-col items-center justify-between py-2 px-2 sm:px-4">
        {/* Dealer Section */}
        <div className="w-full max-w-lg flex flex-col items-center gap-2 p-3.5 rounded-2xl bg-[#080f1a] border border-[#142337] shadow-xl">
          <div className="flex items-center justify-between w-full px-2">
            <span className="text-xs font-mono font-bold text-slate-400">DEALER (Stands on 17)</span>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-slate-400">Score:</span>
              <span className="px-2.5 py-0.5 rounded-lg bg-[#142339] border border-[#1f3759] text-white font-mono font-black text-xs">
                {dealerHand.length
                  ? gameState === 'player_turn' || gameState === 'dealing'
                    ? `${dealerHand[0].value} + ?`
                    : dealerScore
                  : '-'}
              </span>
            </div>
          </div>
          <div className="flex items-center justify-center gap-2.5 py-1 min-h-[115px]">
            {dealerHand.length === 0 ? (
              <span className="text-xs text-slate-600 font-mono">Dealer cards dealt here</span>
            ) : (
              dealerHand.map((card, idx) => (
                <React.Fragment key={idx}>
                  {renderCard(card, (gameState === 'player_turn' || gameState === 'dealing') && idx === 1, idx)}
                </React.Fragment>
              ))
            )}
          </div>
        </div>

        {/* Result Announcement Pill */}
        {resultMessage && (
          <div className="my-1 animate-in fade-in zoom-in">
            <ResultPill win={resultTone === 'win'}>
              {resultMessage}
            </ResultPill>
          </div>
        )}

        {/* Player Section */}
        <div className="w-full max-w-lg flex flex-col items-center gap-2 p-3.5 rounded-2xl bg-[#080f1a] border border-[#142337] shadow-xl">
          <div className="flex items-center justify-between w-full px-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold text-slate-400">PLAYER</span>
              <span className="text-[10px] font-mono font-bold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-500/30">
                PAYS 2.0x
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-slate-400">Score:</span>
              <span className={`px-2.5 py-0.5 rounded-lg border font-mono font-black text-xs ${
                playerScore === 21
                  ? 'bg-amber-500/20 border-amber-500 text-amber-300 shadow-[0_0_10px_rgba(245,158,11,0.5)]'
                  : playerScore > 21
                  ? 'bg-rose-950/60 border-rose-500 text-rose-300'
                  : 'bg-cyan-950/60 border-cyan-500 text-cyan-300'
              }`}>
                {playerHand.length ? playerScore : '-'}
              </span>
            </div>
          </div>
          <div className="flex items-center justify-center gap-2.5 py-1 min-h-[115px]">
            {playerHand.length === 0 ? (
              <span className="text-xs text-slate-600 font-mono">Your cards dealt here</span>
            ) : (
              playerHand.map((card, idx) => (
                <React.Fragment key={idx}>{renderCard(card, false, idx)}</React.Fragment>
              ))
            )}
          </div>
        </div>

        {/* Footer Subtext */}
        <p className="mt-1 text-center text-[11px] text-slate-500 font-medium">
          Casino 52-card Blackjack · Dealer stands on 17+ · Natural 21 pays 3:2 (+50% bonus)
        </p>
      </div>
    </GameShell>
  );
};

import React, { useEffect, useState } from 'react';
import { User, Trophy, TrendingUp, Coins, ShieldCheck, Copy, Check, Sparkles } from 'lucide-react';
import { useGame } from '../../context/GameContext';
import { sound } from '../../utils/audio';

export const PlayerProfileCard: React.FC = () => {
  const { user, balance, currencyLabel, formatBalance, toActiveAmount } = useGame();
  const [copied, setCopied] = useState(false);
  const [progression, setProgression] = useState<any>(null);
  useEffect(() => { if (!user.isAuthenticated) return; fetch('/api/profile/me',{credentials:'include'}).then(r=>r.json()).then(d=>{if(d.ok)setProgression(d.progression);}).catch(()=>{}); }, [user.isAuthenticated, user.username]);

  const handleCopyId = () => {
    sound.playClick();
    navigator.clipboard.writeText(`VP-${user.username}-77`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const wageredDls = Number(progression?.stats?.wageredDls || 0);
  const profitDls = Number(progression?.stats?.netProfitDls || 0);
  const level = Number(progression?.progression?.level || 1);
  const xpInto = Number(progression?.progression?.xpIntoLevel || 0);
  const xpNext = Number(progression?.progression?.xpToNextLevel || 100);
  const tier = progression?.progression?.tier?.name || 'Bronze';
  const wins = Number(progression?.stats?.wins || 0);
  const totalGames = Number(progression?.stats?.totalGames || 0);
  const winRate = totalGames ? (wins / totalGames) * 100 : 0;

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0d1624] via-[#101b2d] to-[#0a1019] border border-[#1e2f47] p-5 shadow-2xl group transition-all duration-300 hover:border-[#0074e4]/60">
      {/* Background Neon Ambient Glows */}
      <div className="absolute -top-10 -right-10 w-44 h-44 bg-[#0074e4]/15 rounded-full blur-3xl pointer-events-none group-hover:bg-[#0074e4]/25 transition duration-500" />
      <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-[#00ff88]/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
        {/* Left: Avatar with animated set.png & Player Info */}
        <div className="flex items-center gap-4">
          {/* Animated Avatar Frame */}
          <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-tr from-[#16273f] to-[#1c3558] border-2 border-[#0074e4] p-1 shadow-lg shadow-[#0074e4]/20 flex items-center justify-center overflow-hidden group-hover:scale-105 transition-transform duration-300">
            {/* Spinning Neon Gradient Ring in background */}
            <div className="absolute inset-0 bg-gradient-to-r from-[#0074e4] via-[#00ff88] to-[#38bdf8] opacity-20 animate-spin-slow" />

            <img
              src="/assets/set.png"
              alt="Avatar"
              className="w-full h-full object-contain relative z-10 filter drop-shadow animate-float-slow"
              style={{ imageRendering: 'pixelated' }}
            />

            {/* Online Status Pill */}
            <span className="absolute bottom-1 right-1 w-3 h-3 rounded-full bg-[#00ff88] border-2 border-[#0d1624] shadow-[0_0_8px_#00ff88] z-20" />
          </div>

          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <h3 className="text-base sm:text-lg font-black text-white tracking-wide">
                {user.username}
              </h3>
              <span className="text-[10px] font-black uppercase tracking-wider text-[#00ff88] bg-[#00ff88]/15 px-2 py-0.5 rounded-md border border-[#00ff88]/30 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" />
                <span>{tier} • Level {level}</span>
              </span>
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span className="font-mono">GrowID: <strong className="text-slate-200">{user.growId || user.username}</strong></span>
              <span>•</span>
              <button
                onClick={handleCopyId}
                className="flex items-center gap-1 text-[11px] text-[#38bdf8] hover:text-white font-mono transition"
                title="Copy Player UID"
              >
                {copied ? <Check className="w-3 h-3 text-[#00ff88]" /> : <Copy className="w-3 h-3" />}
                <span>UID</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right: Live Animated Player Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 w-full md:w-auto">
          {/* Stat 1: Balance */}
          <div className="bg-[#0a111b] border border-[#162337] p-2.5 rounded-xl flex flex-col gap-1 min-w-[105px]">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <Coins className="w-3 h-3 text-amber-400" /> Balance
            </span>
            <span className="text-xs sm:text-sm font-mono font-black text-white">
              {formatBalance()} {currencyLabel}
            </span>
          </div>

          {/* Stat 2: Total Wagered */}
          <div className="bg-[#0a111b] border border-[#162337] p-2.5 rounded-xl flex flex-col gap-1 min-w-[105px]">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <Trophy className="w-3 h-3 text-[#38bdf8]" /> Wagered
            </span>
            <span className="text-xs sm:text-sm font-mono font-black text-[#38bdf8]">
              {toActiveAmount(wageredDls).toLocaleString()} {currencyLabel}
            </span>
          </div>

          {/* Stat 3: All-Time Profit */}
          <div className="bg-[#0a111b] border border-[#162337] p-2.5 rounded-xl flex flex-col gap-1 min-w-[105px]">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <TrendingUp className="w-3 h-3 text-[#00ff88]" /> Net Profit
            </span>
            <span className="text-xs sm:text-sm font-mono font-black text-[#00ff88]">
              +{toActiveAmount(profitDls).toLocaleString()} {currencyLabel}
            </span>
          </div>

          {/* Stat 4: Win Rate */}
          <div className="bg-[#0a111b] border border-[#162337] p-2.5 rounded-xl flex flex-col gap-1 min-w-[105px]">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-purple-400" /> Win Rate
            </span>
            <span className="text-xs sm:text-sm font-mono font-black text-purple-300">
              {winRate.toFixed(1)}% ({wins} W)
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

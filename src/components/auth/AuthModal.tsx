import React, { useState } from 'react';
import { X, User, Key, ArrowRight, Check, Eye, EyeOff, ShieldCheck, AlertCircle } from 'lucide-react';
import { useGame } from '../../context/GameContext';
import { sound } from '../../utils/audio';

export const AuthModal: React.FC<{ isOpen: boolean; onClose: () => void; initialMode?: 'login' | 'register' }> = ({
  isOpen,
  onClose,
  initialMode = 'login',
}) => {
  const { login, register, currencyLabel, currencyIcon } = useGame();
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [growId, setGrowId] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const isUnameValid = username.trim().length >= 4;
  const isPassValid = password.length >= 8;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanUname = username.trim();
    if (!cleanUname || !password) {
      setError('Please fill in all required fields.');
      return;
    }

    if (mode === 'register') {
      if (cleanUname.length < 4) {
        setError('Username must be at least 4 characters long.');
        return;
      }
      if (password.length < 8) {
        setError('Password must be at least 8 characters long.');
        return;
      }

      const res = await register(cleanUname, password, growId.trim());
      if (res.success) {
        sound.playCashout();
        onClose();
      } else {
        setError(res.message);
      }
    } else {
      const res = await login(cleanUname, password);
      if (res.success) {
        sound.playClick();
        onClose();
      } else {
        setError(res.message);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-[#0d131f] border border-[#1e2a3f] rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1b263b] bg-[#0c111c]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#0074e4] flex items-center justify-center text-white shadow-md shadow-[#0074e4]/30">
              <User className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-white tracking-wide">
                {mode === 'login' ? 'Sign In to Supreme Casino' : 'Create Supreme Account'}
              </h3>
              <span className="text-[10px] text-slate-400">GTPS In-Game Cashier & Player Sync</span>
            </div>
          </div>
          <button
            onClick={() => {
              sound.playClick();
              onClose();
            }}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-[#162133] transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Switcher */}
        <div className="grid grid-cols-2 p-2 bg-[#090e18] border-b border-[#182335] text-xs font-bold gap-1">
          <button
            onClick={() => {
              sound.playClick();
              setMode('login');
              setError(null);
            }}
            className={`py-2.5 rounded-xl transition cursor-pointer ${
              mode === 'login'
                ? 'bg-[#18253b] text-white border border-[#2b3e60] shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-[#111927]'
            }`}
          >
            Login
          </button>
          <button
            onClick={() => {
              sound.playClick();
              setMode('register');
              setError(null);
            }}
            className={`py-2.5 rounded-xl transition cursor-pointer ${
              mode === 'register'
                ? 'bg-[#18253b] text-white border border-[#2b3e60] shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-[#111927]'
            }`}
          >
            Register
          </button>
        </div>

        {/* In-Game GTPS Notice for Register */}
        {mode === 'register' && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-gradient-to-r from-[#0074e4]/15 to-cyan-500/15 border border-[#0074e4]/30 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#142640] border border-[#234273] flex items-center justify-center p-1">
                <img src="/assets/BGLS.png" alt="BGLS" className="w-5 h-5 object-contain" />
              </div>
              <div>
                <span className="text-xs font-black text-white block">GTPS In-Game Cashier</span>
                <span className="text-[11px] text-cyan-300 font-bold">Port 25741 · Deposit & Withdraw In-Game</span>
              </div>
            </div>
            <span className="text-[10px] uppercase font-black px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
              Synced
            </span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
          {/* Username */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-300">Username</label>
              {mode === 'register' && (
                <span
                  className={`text-[10px] font-bold flex items-center gap-1 ${
                    isUnameValid ? 'text-emerald-400' : 'text-slate-400'
                  }`}
                >
                  {isUnameValid && <Check className="w-3 h-3 text-emerald-400" />}
                  4+ characters
                </span>
              )}
            </div>
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username (min 4 chars)"
                required
                className="w-full bg-[#111724] border border-[#1e2a3f] rounded-xl pl-9 pr-3 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#0074e4] transition"
              />
            </div>
          </div>

          {/* Password */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-300">Password</label>
              {mode === 'register' && (
                <span
                  className={`text-[10px] font-bold flex items-center gap-1 ${
                    isPassValid ? 'text-emerald-400' : 'text-slate-400'
                  }`}
                >
                  {isPassValid && <Check className="w-3 h-3 text-emerald-400" />}
                  8+ characters
                </span>
              )}
            </div>
            <div className="relative">
              <Key className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'register' ? 'Create password (min 8 chars)' : 'Enter password'}
                required
                className="w-full bg-[#111724] border border-[#1e2a3f] rounded-xl pl-9 pr-10 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#0074e4] transition"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition cursor-pointer"
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {mode === 'register' && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-300">GrowID (Optional for in-game cashier)</label>
              <input
                type="text"
                value={growId}
                onChange={(e) => setGrowId(e.target.value)}
                placeholder="e.g. MyGrowAccount"
                className="w-full bg-[#111724] border border-[#1e2a3f] rounded-xl px-3 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#0074e4] transition"
              />
            </div>
          )}

          {error && (
            <div className="p-3 rounded-xl bg-red-500/15 border border-red-500/30 text-red-400 text-xs font-medium flex items-center gap-2 animate-in fade-in">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            className="w-full py-3.5 rounded-xl bg-[#0074e4] hover:bg-[#0085ff] active:bg-[#0066cb] text-white font-extrabold text-xs uppercase tracking-wider shadow-lg shadow-[#0074e4]/30 transition flex items-center justify-center gap-2 mt-2 cursor-pointer"
          >
            <span>{mode === 'login' ? 'Sign In' : 'Create Account'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};

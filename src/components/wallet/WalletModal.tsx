import React, { useState, useEffect } from 'react';
import {
  X,
  Copy,
  Check,
  ArrowRight,
  ShieldCheck,
  AlertCircle,
  Server,
  Zap,
  Link2,
  Send,
  Key,
  Flame,
} from 'lucide-react';
import { useGame } from '../../context/GameContext';
import { sound } from '../../utils/audio';

export const WalletModal: React.FC = () => {
  const {
    walletModalOpen,
    setWalletModalOpen,
    walletTab,
    setWalletTab,
    user,
    activeCurrency,
    balance,
    formatBalance,
    toActiveAmount,
    fromActiveAmount,
    currencyLabel,
    currencyIcon,
    withdraw,
    tip,
    gtpsPort,
    updateUserGrowId,
    unlinkGtps,
  } = useGame();

  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [confirmUnlink, setConfirmUnlink] = useState(false);

  // Withdraw state
  const [withdrawAmount, setWithdrawAmount] = useState<string>('10');
  const [withdrawGrowId, setWithdrawGrowId] = useState<string>(user.growId || user.username || '');
  const [withdrawWorld, setWithdrawWorld] = useState<string>('SUPREMETRADE');
  const [withdrawMsg, setWithdrawMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Tip state
  const [tipTarget, setTipTarget] = useState<string>('');
  const [tipAmount, setTipAmount] = useState<string>('5');
  const [tipNote, setTipNote] = useState<string>('');
  const [tipMsg, setTipMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // NOTE: Semua hooks WAJIB dipanggil sebelum `if (!walletModalOpen) return null`.
  // Kalau useEffect ada di bawah early-return, jumlah hooks berubah antar render
  // -> React error #310 -> seluruh app crash (layar hitam saat buka wallet).
  const userLinkCode = user.linkCode || '839201';

  // Automatically register and sync verification code with backend & GTPS bridge
  useEffect(() => {
    if (!walletModalOpen || !userLinkCode) return;
    fetch('/api/gtps/register-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: user.username,
        code: userLinkCode,
        growId: user.growId || null,
      }),
    }).catch(() => {});
  }, [walletModalOpen, userLinkCode, user.username, user.growId]);

  // Real-time poller: Automatically detect when player runs /link in GTPS
  useEffect(() => {
    if (!walletModalOpen || walletTab !== 'link' || user.growId) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/gtps/check-link?code=${encodeURIComponent(userLinkCode)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.linked && data.growId) {
            updateUserGrowId(data.growId);
            sound.playSuccess();
          }
        }
      } catch {}
    }, 2000);

    return () => clearInterval(interval);
  }, [walletModalOpen, walletTab, userLinkCode, user.growId, updateUserGrowId, sound]);

  if (!walletModalOpen) return null;

  const handleCopy = (text: string, fieldId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldId);
    sound.playClick();
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleWithdraw = async () => {
    const val = parseFloat(withdrawAmount);
    if (isNaN(val) || val <= 0) {
      setWithdrawMsg({ type: 'error', text: 'Enter a valid amount.' });
      return;
    }
    const dlsVal = fromActiveAmount(val);
    setWithdrawMsg(null);
    const res = await withdraw(dlsVal, withdrawGrowId, withdrawWorld);
    if (res.success) {
      setWithdrawMsg({ type: 'success', text: res.message });
      setTimeout(() => setWithdrawMsg(null), 8000);
    } else {
      setWithdrawMsg({ type: 'error', text: res.message });
    }
  };

  const handleTip = () => {
    const val = parseFloat(tipAmount);
    if (isNaN(val) || val <= 0) {
      setTipMsg({ type: 'error', text: 'Enter a valid amount.' });
      return;
    }
    const dlsVal = fromActiveAmount(val);
    const res = tip(dlsVal, tipTarget, tipNote);
    if (res.success) {
      setTipMsg({ type: 'success', text: res.message });
      setTipTarget('');
      setTipNote('');
      setTimeout(() => setTipMsg(null), 6000);
    } else {
      setTipMsg({ type: 'error', text: res.message });
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-[#0d131f] border border-[#1d293d] rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1b263b] bg-[#0c111c]">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-black text-white tracking-wide">Wallet Cashier</h2>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[10px] font-bold text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>GTPS Port: {gtpsPort}</span>
            </div>
          </div>
          <button
            onClick={() => {
              sound.playClick();
              setWalletModalOpen(false);
            }}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-[#162134] transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 4 Tabs: Deposit, Withdraw, Link Account, Tip */}
        <div className="grid grid-cols-4 gap-1 p-2 bg-[#090e18] border-b border-[#182335] text-xs font-bold">
          <button
            onClick={() => {
              sound.playClick();
              setWalletTab('deposit');
            }}
            className={`py-2 rounded-xl transition cursor-pointer ${
              walletTab === 'deposit'
                ? 'bg-[#18253b] text-white shadow-sm border border-[#2b3e60]'
                : 'text-slate-400 hover:text-white hover:bg-[#111927]'
            }`}
          >
            Deposit
          </button>
          <button
            onClick={() => {
              sound.playClick();
              setWalletTab('withdraw');
            }}
            className={`py-2 rounded-xl transition cursor-pointer ${
              walletTab === 'withdraw'
                ? 'bg-[#18253b] text-white shadow-sm border border-[#2b3e60]'
                : 'text-slate-400 hover:text-white hover:bg-[#111927]'
            }`}
          >
            Withdraw
          </button>
          <button
            onClick={() => {
              sound.playClick();
              setWalletTab('link');
            }}
            className={`py-2 rounded-xl transition cursor-pointer flex items-center justify-center gap-1 ${
              walletTab === 'link'
                ? 'bg-[#18253b] text-white shadow-sm border border-[#2b3e60]'
                : 'text-slate-400 hover:text-white hover:bg-[#111927]'
            }`}
          >
            <Link2 className="w-3.5 h-3.5 text-[#38bdf8]" />
            <span>Link GTPS</span>
          </button>
          <button
            onClick={() => {
              sound.playClick();
              setWalletTab('tip');
            }}
            className={`py-2 rounded-xl transition cursor-pointer ${
              walletTab === 'tip'
                ? 'bg-[#18253b] text-white shadow-sm border border-[#2b3e60]'
                : 'text-slate-400 hover:text-white hover:bg-[#111927]'
            }`}
          >
            Tip
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto flex-1 flex flex-col gap-4">
          {/* TAB 1: DEPOSIT */}
          {walletTab === 'deposit' && (
            <div className="flex flex-col gap-4">
              {/* GTPS In-Game Deposit Quick Instructions */}
              <div className="bg-gradient-to-r from-[#0c182a] to-[#12223c] border border-[#213a62] rounded-2xl p-4 flex flex-col gap-3 shadow-lg">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-wider text-[#38bdf8] flex items-center gap-1.5">
                    <Zap className="w-4 h-4 text-amber-400" />
                    <span>In-Game GTPS Deposit (Port {gtpsPort})</span>
                  </span>
                  <span className="text-[10px] text-emerald-400 font-mono font-bold">0s Latency</span>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed">
                  Join our GTPS server on Port <strong className="text-white font-mono">{gtpsPort}</strong> and run this command anywhere in-game:
                </p>

                {/* Command snippets */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between bg-[#080d16] p-2.5 rounded-xl border border-[#1b2b44]">
                    <span className="font-mono text-xs text-white font-bold">/deposit 50 dl</span>
                    <button
                      onClick={() => handleCopy('/deposit 50 dl', 'cmd_dep_50')}
                      className="flex items-center gap-1 px-2 py-1 rounded bg-[#132238] hover:bg-[#1a2f4d] text-[11px] text-slate-300 font-bold transition cursor-pointer"
                    >
                      {copiedField === 'cmd_dep_50' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedField === 'cmd_dep_50' ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                  <div className="flex items-center justify-between bg-[#080d16] p-2.5 rounded-xl border border-[#1b2b44]">
                    <span className="font-mono text-xs text-white font-bold">/deposit 1 bgl</span>
                    <button
                      onClick={() => handleCopy('/deposit 1 bgl', 'cmd_dep_1bgl')}
                      className="flex items-center gap-1 px-2 py-1 rounded bg-[#132238] hover:bg-[#1a2f4d] text-[11px] text-slate-300 font-bold transition cursor-pointer"
                    >
                      {copiedField === 'cmd_dep_1bgl' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedField === 'cmd_dep_1bgl' ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-[#1b2b44] text-[10px] font-mono text-slate-400">
                  <span>Supported Items:</span>
                  <span>BGL: 7188 · DL: 1796 · WL: 242</span>
                </div>
              </div>

              {/* Anti-dupe: deposit HANYA via perintah in-game. Item benar-benar
                  dipotong dari inventory oleh Lua, lalu saldo web bertambah otomatis
                  lewat event GTPS_DEPOSIT. Tidak ada lagi tombol tambah saldo gratis. */}
              <div className="bg-[#101725] border border-[#1d2a3f] rounded-2xl p-4 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-200">Saldo web hanya dari deposit in-game</span>
                  <span className="text-[10px] text-emerald-400 font-mono font-bold">Anti-Dupe</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Jalankan perintah di atas di dalam game. Item dipotong langsung dari inventory kamu oleh sistem, dan saldo di website bertambah otomatis beberapa detik kemudian. Tidak ada deposit manual dari web.
                </p>
              </div>
            </div>
          )}

          {/* TAB 2: WITHDRAW */}
          {walletTab === 'withdraw' && (
            <div className="flex flex-col gap-4">
              {/* GTPS In-Game Withdraw Banner */}
              <div className="bg-gradient-to-r from-[#0c182a] to-[#12223c] border border-[#213a62] rounded-2xl p-4 flex flex-col gap-3 shadow-lg">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-wider text-[#38bdf8] flex items-center gap-1.5">
                    <Server className="w-4 h-4 text-emerald-400" />
                    <span>In-Game Backpack Withdraw (Port {gtpsPort})</span>
                  </span>
                  <span className="text-[10px] text-emerald-400 font-mono font-bold">Instant Bot Delivery</span>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed">
                  Type <strong className="text-white font-mono">/withdraw &lt;amount&gt; [wl|dl|bgl]</strong> in-game on Port {gtpsPort} to receive locks directly into your character backpack:
                </p>

                <div className="flex items-center justify-between bg-[#080d16] p-2.5 rounded-xl border border-[#1b2b44]">
                  <span className="font-mono text-xs text-white font-bold">/withdraw 10 dl</span>
                  <button
                    onClick={() => handleCopy('/withdraw 10 dl', 'cmd_with_10')}
                    className="flex items-center gap-1 px-2 py-1 rounded bg-[#132238] hover:bg-[#1a2f4d] text-[11px] text-slate-300 font-bold transition cursor-pointer"
                  >
                    {copiedField === 'cmd_with_10' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedField === 'cmd_with_10' ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              </div>

              {/* Web Cashier Withdraw Form */}
              <div className="bg-[#101725] border border-[#1d2a3f] rounded-2xl p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between pb-2 border-b border-[#182337]">
                  <span className="text-xs text-slate-400">Available Balance:</span>
                  <span className="text-sm font-bold text-white font-mono flex items-center gap-1.5">
                    <img src={currencyIcon} alt={currencyLabel} className="w-4 h-4 object-contain" />
                    {formatBalance()} {currencyLabel}
                  </span>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold text-slate-400">GrowID / Recipient Name:</label>
                  <input
                    type="text"
                    value={withdrawGrowId}
                    onChange={(e) => setWithdrawGrowId(e.target.value)}
                    placeholder="Enter GrowID"
                    className="w-full bg-[#090e18] border border-[#1f2c42] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#0074e4] transition"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold text-slate-400">Delivery World Name:</label>
                  <input
                    type="text"
                    value={withdrawWorld}
                    onChange={(e) => setWithdrawWorld(e.target.value)}
                    placeholder="e.g. SUPREMETRADE"
                    className="w-full bg-[#090e18] border border-[#1f2c42] rounded-xl px-3 py-2 text-sm text-white uppercase focus:outline-none focus:border-[#0074e4] transition"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-semibold text-slate-400">Withdraw Amount ({currencyLabel}):</label>
                    <button
                      onClick={() => setWithdrawAmount(balance.toString())}
                      className="text-[10px] text-[#38bdf8] font-bold hover:underline cursor-pointer"
                    >
                      MAX
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type="number"
                      step={activeCurrency === 'BGLS' ? '0.01' : '1'}
                      min="1"
                      value={withdrawAmount}
                      onChange={(e) => setWithdrawAmount(e.target.value)}
                      className="w-full bg-[#090e18] border border-[#1f2c42] rounded-xl px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-[#0074e4] transition"
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                      <img src={currencyIcon} alt={currencyLabel} className="w-4 h-4 object-contain" />
                      <span className="text-xs font-bold text-slate-300">{currencyLabel}</span>
                    </div>
                  </div>
                </div>

                {withdrawMsg && (
                  <div
                    className={`p-2.5 rounded-xl text-xs font-medium flex items-center gap-2 ${
                      withdrawMsg.type === 'success'
                        ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400'
                        : 'bg-red-500/15 border border-red-500/30 text-red-400'
                    }`}
                  >
                    {withdrawMsg.type === 'success' ? (
                      <Check className="w-4 h-4 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 shrink-0" />
                    )}
                    <span>{withdrawMsg.text}</span>
                  </div>
                )}

                <button
                  onClick={handleWithdraw}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-[#0074e4] to-[#0284c7] hover:brightness-110 active:brightness-95 text-white font-extrabold text-xs shadow-lg shadow-[#0074e4]/30 transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>Request Withdraw</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: LINK GTPS ACCOUNT */}
          {walletTab === 'link' && (
            <div className="flex flex-col gap-4">
              <div className="bg-gradient-to-br from-[#0d182b] to-[#142646] border border-[#234273] rounded-2xl p-5 flex flex-col gap-4 shadow-xl">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#0074e4]/20 border border-[#0074e4]/40 flex items-center justify-center text-[#38bdf8]">
                    <Key className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-white">Link GTPS In-Game Account</h3>
                    <p className="text-[11px] text-slate-300">Sync your character with GTPS Port {gtpsPort}</p>
                  </div>
                </div>

                <div className="bg-[#080d16] border border-[#1b2b44] rounded-2xl p-4 flex flex-col items-center gap-2 text-center">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Your Secret 6-Digit Link Code</span>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-3xl font-black text-emerald-400 tracking-widest">{userLinkCode}</span>
                    <button
                      onClick={() => handleCopy(`/link ${userLinkCode}`, 'link_code')}
                      className="p-2 rounded-xl bg-[#14233a] hover:bg-[#1d3356] border border-[#244270] text-slate-300 hover:text-white transition cursor-pointer"
                      title="Copy /link command"
                    >
                      {copiedField === 'link_code' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                  <span className="text-[11px] text-slate-400 font-mono">Run in-game: <strong className="text-white">/link {userLinkCode}</strong></span>
                </div>

                <div className="flex flex-col gap-2 text-xs text-slate-300">
                  <div className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-[#0074e4]/20 text-[#38bdf8] flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">1</span>
                    <span>Log in to Growtopia on our GTPS server (Port: <strong className="text-white">{gtpsPort}</strong>).</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-[#0074e4]/20 text-[#38bdf8] flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">2</span>
                    <span>Enter any world and type <strong className="text-white font-mono">/link {userLinkCode}</strong>.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-[#0074e4]/20 text-[#38bdf8] flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">3</span>
                    <span>Your avatar and casino balance will instantly link for seamless deposits and withdrawals!</span>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-[#090e18] border border-[#1a2940] flex items-center justify-between text-xs">
                  <span className="text-slate-400">Connection Status:</span>
                  {user.gtpsLinked && user.growId ? (
                    <span className="text-emerald-400 font-bold flex items-center gap-1">
                      <Check className="w-3.5 h-3.5" />
                      <span>Linked to {user.growId}</span>
                    </span>
                  ) : (
                    <span className="text-amber-400 font-bold flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span>Not Linked</span>
                    </span>
                  )}
                </div>

                {user.gtpsLinked && user.growId && (
                  confirmUnlink ? (
                    <div className="flex gap-2">
                      <button
                        onClick={async () => {
                          await unlinkGtps();
                          setConfirmUnlink(false);
                        }}
                        className="flex-1 py-2.5 rounded-xl bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-300 text-xs font-bold transition cursor-pointer"
                      >
                        Ya, Lepas Link
                      </button>
                      <button
                        onClick={() => setConfirmUnlink(false)}
                        className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition cursor-pointer"
                      >
                        Batal
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmUnlink(true)}
                      className="w-full py-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-300 text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>Unlink Account ({user.growId})</span>
                    </button>
                  )
                )}
              </div>
            </div>
          )}

          {/* TAB 4: TIP */}
          {walletTab === 'tip' && (
            <div className="flex flex-col gap-4">
              <div className="bg-[#101725] border border-[#1d2a3f] rounded-2xl p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between pb-2 border-b border-[#182337]">
                  <span className="text-xs text-slate-400">Available Balance:</span>
                  <span className="text-sm font-bold text-white font-mono flex items-center gap-1.5">
                    <img src={currencyIcon} alt={currencyLabel} className="w-4 h-4 object-contain" />
                    {formatBalance()} {currencyLabel}
                  </span>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold text-slate-400">Recipient Username:</label>
                  <input
                    type="text"
                    value={tipTarget}
                    onChange={(e) => setTipTarget(e.target.value)}
                    placeholder="Enter player's username"
                    className="w-full bg-[#090e18] border border-[#1f2c42] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#0074e4] transition"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold text-slate-400">Tip Amount ({currencyLabel}):</label>
                  <div className="relative">
                    <input
                      type="number"
                      step={activeCurrency === 'BGLS' ? '0.01' : '1'}
                      min="1"
                      value={tipAmount}
                      onChange={(e) => setTipAmount(e.target.value)}
                      className="w-full bg-[#090e18] border border-[#1f2c42] rounded-xl px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-[#0074e4] transition"
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                      <img src={currencyIcon} alt={currencyLabel} className="w-4 h-4 object-contain" />
                      <span className="text-xs font-bold text-slate-300">{currencyLabel}</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold text-slate-400">Message (Optional):</label>
                  <input
                    type="text"
                    value={tipNote}
                    onChange={(e) => setTipNote(e.target.value)}
                    placeholder="e.g. Good luck in Case Battles"
                    className="w-full bg-[#090e18] border border-[#1f2c42] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#0074e4] transition"
                  />
                </div>

                {tipMsg && (
                  <div
                    className={`p-2.5 rounded-xl text-xs font-medium flex items-center gap-2 ${
                      tipMsg.type === 'success'
                        ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400'
                        : 'bg-red-500/15 border border-red-500/30 text-red-400'
                    }`}
                  >
                    {tipMsg.type === 'success' ? (
                      <Check className="w-4 h-4 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 shrink-0" />
                    )}
                    <span>{tipMsg.text}</span>
                  </div>
                )}

                <button
                  onClick={handleTip}
                  className="w-full py-3 rounded-xl bg-[#0074e4] hover:bg-[#0085ff] active:bg-[#0066cb] text-white font-extrabold text-xs shadow-lg shadow-[#0074e4]/30 transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                  <span>Send Player Tip</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

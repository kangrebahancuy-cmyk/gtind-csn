import React, { useState } from 'react';
import {
  X,
  Shield,
  Users,
  PlusCircle,
  MinusCircle,
  Ban,
  VolumeX,
  Volume2,
  Server,
  Save,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Search,
  Key,
} from 'lucide-react';
import { useGame } from '../../context/GameContext';
import { sound } from '../../utils/audio';

export const AdminModal: React.FC = () => {
  const {
    adminModalOpen,
    setAdminModalOpen,
    accounts,
    adminAddBalance,
    adminRemoveBalance,
    adminToggleBan,
    adminToggleMute,
    gtpsPort,
    setGtpsPort,
    showToast,
    currencyLabel,
  } = useGame();

  const [activeTab, setActiveTab] = useState<'players' | 'gtps'>('players');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState<string>('');
  const [balanceAmount, setBalanceAmount] = useState<string>('100');
  const [customPort, setCustomPort] = useState<string>(gtpsPort.toString());
  const [portSaved, setPortSaved] = useState<boolean>(false);

  if (!adminModalOpen) return null;

  const filteredAccounts = accounts.filter(
    (a) =>
      a.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (a.growId && a.growId.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleAddBalance = async (username: string) => {
    const val = parseFloat(balanceAmount);
    if (isNaN(val) || val <= 0) {
      showToast('Please enter a valid amount.', 'error', 'Invalid Amount');
      return;
    }
    const ok = await adminAddBalance(username, val);
    if (ok) {
      sound.playCashout();
      showToast(`Added ${val} DLS to ${username}!`, 'success', 'Balance Added');
    }
  };

  const handleRemoveBalance = async (username: string) => {
    const val = parseFloat(balanceAmount);
    if (isNaN(val) || val <= 0) {
      showToast('Please enter a valid amount.', 'error', 'Invalid Amount');
      return;
    }
    const ok = await adminRemoveBalance(username, val);
    if (ok) {
      sound.playClick();
      showToast(`Deducted ${val} DLS from ${username}!`, 'info', 'Balance Deducted');
    }
  };

  const handleSavePort = () => {
    const p = parseInt(customPort, 10);
    if (isNaN(p) || p <= 0 || p > 65535) {
      showToast('Invalid port number (1-65535).', 'error', 'Invalid Port');
      return;
    }
    setGtpsPort(p);
    sound.playCashout();
    setPortSaved(true);
    showToast(`GTPS Port updated to ${p}!`, 'success', 'Port Updated');
    setTimeout(() => setPortSaved(false), 2500);

    // Also notify backend server
    fetch('/api/gtps/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ port: p }),
    }).catch(() => {});
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-4xl bg-[#0c121e] border border-[#1d2d46] rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1b273b] bg-[#0f1726]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500/20 to-red-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 font-bold shadow-lg">
              <Shield className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black text-white tracking-wide">Supreme Casino Administration</h2>
                <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                  ROOT
                </span>
              </div>
              <p className="text-[11px] text-slate-400">Manage players, balances, chat mutes, bans, and GTPS sync</p>
            </div>
          </div>
          <button
            onClick={() => {
              sound.playClick();
              setAdminModalOpen(false);
            }}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-[#1a263a] transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 px-6 pt-4 border-b border-[#182335] bg-[#0a0f19]">
          <button
            onClick={() => {
              sound.playClick();
              setActiveTab('players');
            }}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-xs font-black uppercase tracking-wider transition cursor-pointer border-b-2 ${
              activeTab === 'players'
                ? 'bg-[#121c2e] text-[#38bdf8] border-[#38bdf8]'
                : 'text-slate-400 hover:text-white border-transparent'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Player Management ({accounts.length})</span>
          </button>
          <button
            onClick={() => {
              sound.playClick();
              setActiveTab('gtps');
            }}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-xs font-black uppercase tracking-wider transition cursor-pointer border-b-2 ${
              activeTab === 'gtps'
                ? 'bg-[#121c2e] text-[#38bdf8] border-[#38bdf8]'
                : 'text-slate-400 hover:text-white border-transparent'
            }`}
          >
            <Server className="w-4 h-4" />
            <span>GTPS Port & Cloud Sync ({gtpsPort})</span>
          </button>
        </div>

        {/* Tab 1: Players Management */}
        {activeTab === 'players' && (
          <div className="p-6 flex flex-col gap-4 overflow-y-auto flex-1">
            {/* Quick Balance Mutate Bar */}
            <div className="p-4 rounded-2xl bg-[#090e18] border border-[#1b2940] flex flex-wrap items-center justify-between gap-3 shadow-inner">
              <div className="flex items-center gap-2 flex-1 min-w-[240px]">
                <label className="text-xs font-bold text-slate-300">Target User:</label>
                <select
                  value={selectedUser}
                  onChange={(e) => setSelectedUser(e.target.value)}
                  className="flex-1 bg-[#101928] border border-[#1d2a3f] rounded-xl px-3 py-2 text-xs font-bold text-white outline-none focus:border-[#38bdf8]"
                >
                  <option value="">-- Choose Player --</option>
                  {accounts.map((a) => (
                    <option key={a.username} value={a.username}>
                      {a.username} ({a.balanceDls} DLS)
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <label className="text-xs font-bold text-slate-300">Amount (DLS):</label>
                <input
                  type="number"
                  value={balanceAmount}
                  onChange={(e) => setBalanceAmount(e.target.value)}
                  className="w-28 bg-[#101928] border border-[#1d2a3f] rounded-xl px-3 py-2 text-xs font-mono font-bold text-white outline-none focus:border-[#38bdf8]"
                  placeholder="100"
                />
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    if (!selectedUser) {
                      showToast('Please select a player.', 'warning', 'No Player Selected');
                      return;
                    }
                    handleAddBalance(selectedUser);
                  }}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs uppercase tracking-wider transition shadow-md shadow-emerald-500/20 cursor-pointer"
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>Add Balance</span>
                </button>
                <button
                  onClick={() => {
                    if (!selectedUser) {
                      showToast('Please select a player.', 'warning', 'No Player Selected');
                      return;
                    }
                    handleRemoveBalance(selectedUser);
                  }}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-300 font-black text-xs uppercase tracking-wider transition cursor-pointer"
                >
                  <MinusCircle className="w-4 h-4" />
                  <span>Remove Balance</span>
                </button>
              </div>
            </div>

            {/* Search Filter */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search players by username or GrowID..."
                className="w-full bg-[#080d16] border border-[#172439] rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#38bdf8] transition"
              />
            </div>

            {/* Players Table */}
            <div className="border border-[#18263c] rounded-2xl overflow-hidden shadow-xl bg-[#080d16]">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-[#0f1929] border-b border-[#1c2c44] text-[11px] font-black uppercase text-slate-400 tracking-wider">
                    <th className="py-3 px-4">Player</th>
                    <th className="py-3 px-4">GrowID</th>
                    <th className="py-3 px-4">Link Code</th>
                    <th className="py-3 px-4">Balance</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Admin Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#131f31]">
                  {filteredAccounts.map((acc) => {
                    const isBanned = Boolean(acc.isBanned);
                    const isMuted = Boolean(acc.isMuted);

                    return (
                      <tr key={acc.username} className="hover:bg-[#0c1422] transition">
                        <td className="py-3.5 px-4 font-bold text-white flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-[#142236] border border-[#1e3250] flex items-center justify-center text-xs">
                            {acc.isAdmin ? '👑' : '👤'}
                          </div>
                          <span>{acc.username}</span>
                          {acc.isAdmin && (
                            <span className="text-[9px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1 rounded uppercase">
                              Admin
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-slate-300 font-mono">
                          {acc.growId || <span className="text-slate-600">Unlinked</span>}
                        </td>
                        <td className="py-3.5 px-4 text-cyan-400 font-mono font-bold">
                          {acc.linkCode || '123456'}
                        </td>
                        <td className="py-3.5 px-4 font-mono font-bold text-emerald-400">
                          {acc.balanceDls} DLS
                          <span className="text-[10px] text-slate-500 ml-1">
                            ({(acc.balanceDls / 100).toFixed(2)} BGL)
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {isBanned && (
                              <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30">
                                Banned
                              </span>
                            )}
                            {isMuted && (
                              <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
                                Muted
                              </span>
                            )}
                            {!isBanned && !isMuted && (
                              <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                                Active
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Quick +100 DLS */}
                            <button
                              onClick={() => adminAddBalance(acc.username, 100)}
                              className="px-2 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 font-mono text-[11px] font-bold transition cursor-pointer"
                              title="Quick +100 DLS"
                            >
                              +100
                            </button>

                            {/* Mute Chat Toggle */}
                            <button
                              onClick={() => {
                                adminToggleMute(acc.username);
                                sound.playClick();
                              }}
                              className={`p-1.5 rounded-lg border text-xs font-bold transition cursor-pointer ${
                                isMuted
                                  ? 'bg-amber-500 text-black border-amber-400'
                                  : 'bg-[#111c2e] hover:bg-[#192a46] text-slate-300 border-[#1f304e]'
                              }`}
                              title={isMuted ? 'Unmute Player from Chat' : 'Mute Player from Chat'}
                            >
                              {isMuted ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
                            </button>

                            {/* Ban Toggle */}
                            <button
                              onClick={() => {
                                adminToggleBan(acc.username);
                                sound.playExplosion();
                              }}
                              className={`p-1.5 rounded-lg border text-xs font-bold transition cursor-pointer ${
                                isBanned
                                  ? 'bg-red-500 text-white border-red-400'
                                  : 'bg-[#111c2e] hover:bg-red-500/20 hover:text-red-300 text-slate-300 border-[#1f304e]'
                              }`}
                              title={isBanned ? 'Unban Player Account' : 'Ban Player Account'}
                            >
                              <Ban className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 2: GTPS Port & Sync Configuration */}
        {activeTab === 'gtps' && (
          <div className="p-6 flex flex-col gap-6 overflow-y-auto flex-1">
            {/* Port Setting Card */}
            <div className="bg-[#090e18] border border-[#1b2940] rounded-2xl p-6 flex flex-col gap-4 shadow-xl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400 font-bold">
                  <Server className="w-5 h-5 text-cyan-400" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white">GTPS Server Connection Port</h3>
                  <p className="text-xs text-slate-400">
                    Set the active port of your Growtopia Private Server for automated in-game deposits and cashier
                  </p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mt-2">
                <div className="relative flex-1">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-500">
                    PORT:
                  </span>
                  <input
                    type="number"
                    value={customPort}
                    onChange={(e) => setCustomPort(e.target.value)}
                    className="w-full bg-[#101928] border border-[#1f2f4a] rounded-xl pl-16 pr-4 py-2.5 text-sm font-mono font-bold text-cyan-300 outline-none focus:border-cyan-400"
                    placeholder="25741"
                  />
                </div>
                <button
                  onClick={handleSavePort}
                  className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-xs uppercase tracking-wider transition shadow-lg shadow-cyan-500/20 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>{portSaved ? 'Saved!' : 'Save Port'}</span>
                </button>
              </div>

              <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3">
                <CheckCircle className="w-4 h-4 shrink-0 text-emerald-400" />
                <span>
                  Current active port is set to <strong className="font-mono font-bold">{gtpsPort}</strong>. In-game commands will route through this port automatically.
                </span>
              </div>
            </div>

            {/* In-Game Lua Script Cheat Sheet */}
            <div className="bg-[#090e18] border border-[#1b2940] rounded-2xl p-6 flex flex-col gap-3 shadow-xl">
              <h3 className="text-sm font-black text-white flex items-center gap-2">
                <Key className="w-4 h-4 text-amber-400" />
                <span>In-Game Commands for GTPS (Lua Engine)</span>
              </h3>
              <p className="text-xs text-slate-400">
                Script is saved in <code className="text-cyan-300">gtps_lua/supreme_sync.lua</code>. Players can execute:
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-[#0f1828] border border-[#1d2d48]">
                  <strong className="text-white font-mono block">/link &lt;6-digit-code&gt;</strong>
                  <span className="text-slate-400 text-[11px]">Links player GrowID directly to web account</span>
                </div>
                <div className="p-3 rounded-xl bg-[#0f1828] border border-[#1d2d48]">
                  <strong className="text-white font-mono block">/deposit &lt;amount&gt; [wl|dl|bgl]</strong>
                  <span className="text-slate-400 text-[11px]">Deducts locks from inventory and credits web wallet</span>
                </div>
                <div className="p-3 rounded-xl bg-[#0f1828] border border-[#1d2d48]">
                  <strong className="text-white font-mono block">/withdraw &lt;amount&gt; [wl|dl|bgl]</strong>
                  <span className="text-slate-400 text-[11px]">Delivers locks directly to player backpack</span>
                </div>
                <div className="p-3 rounded-xl bg-[#0f1828] border border-[#1d2d48]">
                  <strong className="text-white font-mono block">/balance</strong>
                  <span className="text-slate-400 text-[11px]">Displays player's web casino lock balance</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

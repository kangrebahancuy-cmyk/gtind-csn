import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import type { Currency, UserState, LiveBet } from '../types';
import { sound } from '../utils/audio';

export interface StoredAccount {
  username: string;
  password: string;
  growId?: string;
  balanceDls: number;
  linkCode?: string;
  isBanned?: boolean;
  isMuted?: boolean;
  isAdmin?: boolean;
}

export interface CrashRoomPlayer {
  id: string;
  name: string;
  betDls: number;
  cashedAt?: number;
}

export interface ChatMessage {
  id: string;
  user: string;
  text: string;
  time: string;
  isSystem?: boolean;
}

export interface ToastNotification {
  id: string;
  type: 'error' | 'warning' | 'info' | 'success';
  title?: string;
  message: string;
}

export interface UserCrashBet {
  amountDls: number;
  autoCashout: number;
  cashedAt?: number;
  status: 'queued' | 'active' | 'cashed' | 'busted';
}

export interface CrashRoomState {
  phase: 'betting' | 'flying' | 'crashed';
  countdown: number;
  currentMultiplier: number;
  crashPoint: number;
  history: number[];
  roomPlayers: CrashRoomPlayer[];
  userBet: UserCrashBet | null;
  joinNextRound: (betDls: number, autoCashout: number) => boolean;
  cancelQueuedBet: () => void;
  cashoutActiveBet: () => void;
}

interface GameContextType {
  user: UserState;
  activeCurrency: Currency;
  setActiveCurrency: (c: Currency) => void;
  selectedFiat: 'USD' | 'EUR';
  setSelectedFiat: (f: 'USD' | 'EUR') => void;
  balance: number;
  formatBalance: (dlsAmount?: number) => string;
  toActiveAmount: (dls: number) => number;
  fromActiveAmount: (amount: number) => number;
  currencyLabel: string;
  currencyIcon: string;
  isAdmin: boolean;

  // Admin & GTPS Panel
  adminModalOpen: boolean;
  setAdminModalOpen: (open: boolean) => void;
  gtpsPort: number;
  setGtpsPort: (port: number) => void;
  accounts: StoredAccount[];
  adminAddBalance: (username: string, amountDls: number) => boolean;
  adminRemoveBalance: (username: string, amountDls: number) => boolean;
  adminToggleBan: (username: string) => boolean;
  adminToggleMute: (username: string) => boolean;

  // Floating Balance Gain Animation (+10.00 DLS)
  balanceGainAnim: { id: number; amount: string; icon: string; currency: string } | null;
  triggerBalanceGain: (dlsAmount: number) => void;

  // Corner Toast Notifications
  toast: ToastNotification | null;
  showToast: (message: string, type?: 'error' | 'warning' | 'info' | 'success', title?: string) => void;
  hideToast: () => void;

  // Real Auth
  login: (username: string, pass: string) => { success: boolean; message: string };
  register: (username: string, pass: string, growId?: string) => { success: boolean; message: string };
  logout: () => void;
  authModalOpen: boolean;
  setAuthModalOpen: (open: boolean) => void;
  authMode: 'login' | 'register';
  setAuthMode: (m: 'login' | 'register') => void;

  // Wallet
  deposit: (dlsAmount: number) => void;
  withdraw: (dlsAmount: number, growId: string, world: string) => Promise<{ success: boolean; message: string }>;
  tip: (dlsAmount: number, targetUser: string, message?: string) => { success: boolean; message: string };
  updateUserGrowId: (growId: string) => void;
  unlinkGtps: () => Promise<{ success: boolean; message: string }>;

  // Gameplay
  canAfford: (dlsAmount: number) => boolean;
  deductBet: (dlsAmount: number) => boolean;
  awardPayout: (dlsPayout: number, gameName: string, multiplier: number, betDls: number) => void;
  recordLoss: (betDls: number, gameName: string) => void;

  // Live Bets
  liveBets: LiveBet[];

  // Active Game Session Lock & Persistence
  activeGameSession: { gameId: string; gameTitle: string } | null;
  setActiveGameSession: (session: { gameId: string; gameTitle: string } | null) => void;
  gameLockNotice: string | null;
  clearGameLockNotice: () => void;
  runningGameModal: { gameId: string; gameTitle: string } | null;
  setRunningGameModal: (modal: { gameId: string; gameTitle: string } | null) => void;
  checkCanPlayGame: (gameId: string, gameTitle: string) => boolean;
  clearRunningGameSession: () => void;

  // Navigation
  activeGame: string | null;
  setActiveGame: (game: string | null) => void;
  walletModalOpen: boolean;
  setWalletModalOpen: (open: boolean) => void;
  walletTab: 'deposit' | 'withdraw' | 'link' | 'tip';
  setWalletTab: (tab: 'deposit' | 'withdraw' | 'link' | 'tip') => void;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  soundMuted: boolean;
  setSoundMuted: (muted: boolean) => void;

  // 24/7 Global Synchronized Crash Room
  crashRoom: CrashRoomState;

  // Live Community Chat
  chatMessages: ChatMessage[];
  sendChatMessage: (text: string) => void;
}

function generateStakeCrashPoint(): number {
  const r = Math.random();
  if (r < 0.01) return 1.00;
  const result = 0.99 / (1 - r);
  return Math.max(1.00, Number(result.toFixed(2)));
}

const realtimeChannel = typeof window !== 'undefined' && 'BroadcastChannel' in window 
  ? new BroadcastChannel('supreme_casino_sync') 
  : null;


const GameContext = createContext<GameContextType | undefined>(undefined);

export const GameProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [accounts, setAccounts] = useState<StoredAccount[]>(() => {
    const defaultAccounts: StoredAccount[] = [
      { username: 'admin99', password: 'admin001', growId: 'admin99', balanceDls: 50000, isAdmin: true, linkCode: '999999' },
      { username: 'Mytegt', password: 'password', growId: 'Mytegt', balanceDls: 0, linkCode: '123456' },
    ];
    const saved = localStorage.getItem('supreme_registered_accounts') || localStorage.getItem('voidps_registered_accounts');
    if (saved) {
      try {
        const parsed: StoredAccount[] = JSON.parse(saved);
        if (!parsed.some((a) => a.username.toLowerCase() === 'admin99')) {
          parsed.unshift({ username: 'admin99', password: 'admin001', growId: 'admin99', balanceDls: 50000, isAdmin: true, linkCode: '999999' });
        }
        return parsed;
      } catch {}
    }
    return defaultAccounts;
  });

  const [currentUser, setCurrentUser] = useState<StoredAccount | null>(() => {
    const savedSession = localStorage.getItem('supreme_active_session') || localStorage.getItem('voidps_active_session');
    if (savedSession) {
      try {
        return JSON.parse(savedSession);
      } catch {}
    }
    return null;
  });

  // Ref agar handler WebSocket (yang terpasang sekali) selalu membaca user terbaru,
  // bukan user dari render pertama (stale closure).
  const currentUserRef = useRef<StoredAccount | null>(currentUser);
  currentUserRef.current = currentUser;

  const [gtpsPort, setGtpsPortState] = useState<number>(() => {
    const saved = localStorage.getItem('supreme_gtps_port');
    return saved ? parseInt(saved, 10) || 25741 : 25741;
  });

  const setGtpsPort = (port: number) => {
    setGtpsPortState(port);
    localStorage.setItem('supreme_gtps_port', port.toString());
  };

  const [adminModalOpen, setAdminModalOpen] = useState(false);

  const [activeCurrency, setActiveCurrencyState] = useState<Currency>(() => {
    const saved = localStorage.getItem('voidps_active_currency');
    return (saved === 'BGLS' || saved === 'DLS') ? saved : 'DLS';
  });

  const setActiveCurrency = (c: Currency) => {
    localStorage.setItem('voidps_active_currency', c);
    setActiveCurrencyState(c);
    window.location.reload();
  };
  const [selectedFiat, setSelectedFiat] = useState<'USD' | 'EUR'>('USD');
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [walletTab, setWalletTab] = useState<'deposit' | 'withdraw' | 'link' | 'tip'>('deposit');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [soundMuted, setSoundMuted] = useState(false);
  const [activeGame, setActiveGame] = useState<string | null>(null);
  const [gameLockNotice, setGameLockNotice] = useState<string | null>(null);
  const [liveBets, setLiveBets] = useState<LiveBet[]>(() => {
    const saved = localStorage.getItem('supreme_live_bets');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      } catch {}
    }
    return [];
  });

  const isGameActiveInStorage = (gameId: string): boolean => {
    try {
      if (gameId === 'mines') {
        const saved = localStorage.getItem('voidps_mines_state');
        if (!saved) return false;
        const parsed = JSON.parse(saved);
        return Boolean(parsed?.playing && !parsed?.result);
      }
      if (gameId === 'towers') {
        const saved = localStorage.getItem('voidps_towers_state');
        if (!saved) return false;
        const parsed = JSON.parse(saved);
        return Boolean(parsed?.playing && !parsed?.result);
      }
      if (gameId === 'coinflip') {
        const saved = localStorage.getItem('voidps_coinflip_state');
        if (!saved) return false;
        const parsed = JSON.parse(saved);
        return Boolean(parsed?.roundActive && (parsed?.currentPot > 0 || parsed?.streak > 0));
      }
    } catch {
      return false;
    }
    return false;
  };

  const [activeGameSession, setActiveGameSessionState] = useState<{ gameId: string; gameTitle: string } | null>(() => {
    try {
      const saved = localStorage.getItem('voidps_active_game_session');
      if (!saved) return null;
      const parsed = JSON.parse(saved);
      if (parsed?.gameId && isGameActiveInStorage(parsed.gameId)) {
        return parsed;
      }
      localStorage.removeItem('voidps_active_game_session');
      return null;
    } catch {
      localStorage.removeItem('voidps_active_game_session');
      return null;
    }
  });

  const setActiveGameSession = (session: { gameId: string; gameTitle: string } | null) => {
    setActiveGameSessionState(session);
    if (session) {
      localStorage.setItem('voidps_active_game_session', JSON.stringify(session));
    } else {
      localStorage.removeItem('voidps_active_game_session');
    }
  };

  const clearRunningGameSession = () => {
    if (activeGameSession) {
      if (activeGameSession.gameId === 'mines') localStorage.removeItem('voidps_mines_state');
      if (activeGameSession.gameId === 'towers') localStorage.removeItem('voidps_towers_state');
      if (activeGameSession.gameId === 'coinflip') localStorage.removeItem('voidps_coinflip_state');
    }
    setActiveGameSession(null);
    setRunningGameModal(null);
  };

  const [runningGameModal, setRunningGameModal] = useState<{ gameId: string; gameTitle: string } | null>(null);

  const checkCanPlayGame = (gameId: string, gameTitle: string): boolean => {
    if (!activeGameSession) return true;
    if (activeGameSession.gameId === gameId) return true;
    if (!isGameActiveInStorage(activeGameSession.gameId)) {
      setActiveGameSession(null);
      return true;
    }
    setRunningGameModal({ gameId: activeGameSession.gameId, gameTitle: activeGameSession.gameTitle });
    return false;
  };

  const clearGameLockNotice = () => setGameLockNotice(null);

  const balanceDls = currentUser ? currentUser.balanceDls : 0;

  const updateCurrentUserBalance = (newBalanceDls: number) => {
    const cu = currentUserRef.current;
    if (!cu) return;
    const rounded = Number(Math.max(0, newBalanceDls).toFixed(2));
    const updated: StoredAccount = { ...cu, balanceDls: rounded };
    setCurrentUser(updated);
    try {
      localStorage.setItem('supreme_active_session', JSON.stringify(updated));
      localStorage.setItem('voidps_active_session', JSON.stringify(updated));
    } catch {}

    setAccounts((prev) => {
      const updatedList = prev.map((acc) =>
        acc.username.toLowerCase() === cu.username.toLowerCase()
          ? { ...acc, balanceDls: rounded }
          : acc
      );
      try {
        localStorage.setItem('supreme_registered_accounts', JSON.stringify(updatedList));
        localStorage.setItem('voidps_registered_accounts', JSON.stringify(updatedList));
      } catch {}
      return updatedList;
    });
  };

  const toActiveAmount = (dls: number): number => {
    if (activeCurrency === 'BGLS') {
      return Number((dls / 100).toFixed(4));
    }
    return Number(dls.toFixed(2));
  };

  const fromActiveAmount = (amount: number): number => {
    if (activeCurrency === 'BGLS') {
      return Number((amount * 100).toFixed(2));
    }
    return Number(amount.toFixed(2));
  };

  const balance = toActiveAmount(balanceDls);

  const formatBalance = (dlsAmount?: number): string => {
    const dls = dlsAmount !== undefined ? dlsAmount : balanceDls;
    if (activeCurrency === 'BGLS') {
      const bgl = dls / 100;
      return bgl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
    }
    return dls.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const currencyLabel = activeCurrency === 'BGLS' ? 'BGL' : 'DLS';
  const currencyIcon = activeCurrency === 'BGLS' ? '/assets/BGLS.png' : '/assets/DLS.png';
  const isAdmin = currentUser?.username.toLowerCase() === 'admin99' || Boolean(currentUser?.isAdmin);

  const user: UserState = {
    username: currentUser ? currentUser.username : 'Guest',
    growId: currentUser?.growId,
    linkCode: currentUser?.linkCode,
    isAuthenticated: currentUser !== null,
    balanceDls,
    activeCurrency,
    selectedFiat,
  };

  const login = (uname: string, pass: string) => {
    const cleanUname = uname.trim().toLowerCase();
    const existing = accounts.find((a) => a.username.toLowerCase() === cleanUname);

    if (!existing) {
      return { success: false, message: 'Account does not exist. Please Sign Up first.' };
    }
    if (existing.password !== pass) {
      return { success: false, message: 'Incorrect password.' };
    }
    if (existing.isBanned) {
      return { success: false, message: 'This account has been banned by an administrator.' };
    }

    setCurrentUser(existing);
    try {
      localStorage.setItem('supreme_active_session', JSON.stringify(existing));
      localStorage.setItem('voidps_active_session', JSON.stringify(existing));
    } catch {}
    return { success: true, message: 'Logged in successfully.' };
  };

  const register = (uname: string, pass: string, gId?: string) => {
    const cleanUname = uname.trim();
    if (cleanUname.length < 4) {
      return { success: false, message: 'Username must be at least 4 characters.' };
    }
    if (pass.length < 8) {
      return { success: false, message: 'Password must be at least 8 characters.' };
    }

    const exists = accounts.some((a) => a.username.toLowerCase() === cleanUname.toLowerCase());
    if (exists) {
      return { success: false, message: 'Username is already taken. Please choose another.' };
    }

    const newAcc: StoredAccount = {
      username: cleanUname,
      password: pass,
      growId: gId?.trim() || cleanUname,
      balanceDls: 0, // No free 500 DLS - users deposit & link account
      linkCode: Math.floor(100000 + Math.random() * 900000).toString(),
      isBanned: false,
      isMuted: false,
      isAdmin: cleanUname.toLowerCase() === 'admin99',
    };

    setAccounts((prev) => {
      const updated = [...prev, newAcc];
      try {
        localStorage.setItem('supreme_registered_accounts', JSON.stringify(updated));
        localStorage.setItem('voidps_registered_accounts', JSON.stringify(updated));
      } catch {}
      return updated;
    });

    setCurrentUser(newAcc);
    try {
      localStorage.setItem('supreme_active_session', JSON.stringify(newAcc));
      localStorage.setItem('voidps_active_session', JSON.stringify(newAcc));
    } catch {}
    return { success: true, message: 'Account registered successfully! Please deposit or link your GTPS account.' };
  };

  const logout = () => {
    setCurrentUser(null);
    try {
      localStorage.removeItem('supreme_active_session');
      localStorage.removeItem('voidps_active_session');
    } catch {}
  };

  const updateUserGrowId = (growId: string) => {
    const cu = currentUserRef.current;
    if (!cu) return;
    const cleanGrow = String(growId || '').trim();
    if (!cleanGrow) return;
    const updated = { ...cu, growId: cleanGrow, isLinked: true };
    setCurrentUser(updated);
    try {
      localStorage.setItem('supreme_active_session', JSON.stringify(updated));
      localStorage.setItem('voidps_active_session', JSON.stringify(updated));
    } catch {}
    setAccounts((prev) => {
      const next = prev.map((a) => a.username.toLowerCase() === cu.username.toLowerCase() ? updated : a);
      try {
        localStorage.setItem('supreme_registered_accounts', JSON.stringify(next));
      } catch {}
      return next;
    });
    showToast(`Linked with GTPS Character: ${cleanGrow}!`, 'success', 'GTPS Account Connected');
  };

  // Lepas link GTPS dari web: server + bridge Lua ikut dilepas
  const unlinkGtps = async (): Promise<{ success: boolean; message: string }> => {
    const cu = currentUserRef.current;
    if (!cu) return { success: false, message: 'Please Sign In first.' };
    if (!cu.growId) return { success: false, message: 'Akun belum ter-link dengan GTPS.' };

    try {
      const res = await fetch('/api/gtps/unlink-web', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: cu.linkCode, growId: cu.growId }),
      });
      const data = await res.json().catch(() => ({ ok: false }));
      if (!data.ok) {
        return { success: false, message: 'Gagal unlink. Coba lagi.' };
      }
    } catch {
      return { success: false, message: 'Server casino tidak merespons.' };
    }

    const updated = { ...cu, growId: undefined };
    setCurrentUser(updated);
    try {
      localStorage.setItem('supreme_active_session', JSON.stringify(updated));
      localStorage.setItem('voidps_active_session', JSON.stringify(updated));
    } catch {}
    setAccounts((prev) => {
      const next = prev.map((a) =>
        a.username.toLowerCase() === cu.username.toLowerCase() ? { ...a, growId: undefined } : a
      );
      try {
        localStorage.setItem('supreme_registered_accounts', JSON.stringify(next));
      } catch {}
      return next;
    });
    showToast('Akun GTPS berhasil di-unlink. Saldo casino tetap aman.', 'success', 'GTPS Unlinked');
    return { success: true, message: 'Akun GTPS berhasil di-unlink.' };
  };

  // Sync user verification code to GTPS backend router
  useEffect(() => {
    if (currentUser?.linkCode) {
      fetch('/api/gtps/register-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: currentUser.username,
          code: currentUser.linkCode,
          growId: currentUser.growId || null,
        }),
      }).catch(() => {});
    }
  }, [currentUser?.username, currentUser?.linkCode, currentUser?.growId]);

  // Admin Controls
  const adminAddBalance = (username: string, amountDls: number): boolean => {
    setAccounts((prev) => {
      const updated = prev.map((a) => {
        if (a.username.toLowerCase() === username.toLowerCase()) {
          const newBal = Number(((a.balanceDls || 0) + amountDls).toFixed(2));
          return { ...a, balanceDls: newBal };
        }
        return a;
      });
      try {
        localStorage.setItem('supreme_registered_accounts', JSON.stringify(updated));
      } catch {}
      return updated;
    });

    if (currentUser && currentUser.username.toLowerCase() === username.toLowerCase()) {
      const newBal = Number(((currentUser.balanceDls || 0) + amountDls).toFixed(2));
      const updatedSession = { ...currentUser, balanceDls: newBal };
      setCurrentUser(updatedSession);
      try {
        localStorage.setItem('supreme_active_session', JSON.stringify(updatedSession));
      } catch {}
      triggerBalanceGain(amountDls);
    }
    return true;
  };

  const adminRemoveBalance = (username: string, amountDls: number): boolean => {
    setAccounts((prev) => {
      const updated = prev.map((a) => {
        if (a.username.toLowerCase() === username.toLowerCase()) {
          const newBal = Number(Math.max(0, (a.balanceDls || 0) - amountDls).toFixed(2));
          return { ...a, balanceDls: newBal };
        }
        return a;
      });
      try {
        localStorage.setItem('supreme_registered_accounts', JSON.stringify(updated));
      } catch {}
      return updated;
    });

    if (currentUser && currentUser.username.toLowerCase() === username.toLowerCase()) {
      const newBal = Number(Math.max(0, (currentUser.balanceDls || 0) - amountDls).toFixed(2));
      const updatedSession = { ...currentUser, balanceDls: newBal };
      setCurrentUser(updatedSession);
      try {
        localStorage.setItem('supreme_active_session', JSON.stringify(updatedSession));
      } catch {}
    }
    return true;
  };

  const adminToggleBan = (username: string): boolean => {
    setAccounts((prev) => {
      const updated = prev.map((a) => {
        if (a.username.toLowerCase() === username.toLowerCase()) {
          return { ...a, isBanned: !a.isBanned };
        }
        return a;
      });
      try {
        localStorage.setItem('supreme_registered_accounts', JSON.stringify(updated));
      } catch {}
      return updated;
    });

    if (currentUser && currentUser.username.toLowerCase() === username.toLowerCase()) {
      logout();
      showToast('Your account was banned by an administrator.', 'error', 'Account Banned');
    }
    return true;
  };

  const adminToggleMute = (username: string): boolean => {
    setAccounts((prev) => {
      const updated = prev.map((a) => {
        if (a.username.toLowerCase() === username.toLowerCase()) {
          return { ...a, isMuted: !a.isMuted };
        }
        return a;
      });
      try {
        localStorage.setItem('supreme_registered_accounts', JSON.stringify(updated));
      } catch {}
      return updated;
    });
    return true;
  };

  // Corner Toast Notifications state
  const [toast, setToast] = useState<ToastNotification | null>(null);
  const toastTimerRef = useRef<any>(null);

  const showToast = (message: string, type: 'error' | 'warning' | 'info' | 'success' = 'error', title?: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({
      id: Date.now().toString(),
      type,
      title: title || (type === 'error' ? 'Insufficient Balance' : type === 'warning' ? 'Notice' : 'Success'),
      message,
    });
    toastTimerRef.current = setTimeout(() => {
      setToast(null);
    }, 4000);
  };

  const hideToast = () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(null);
  };

  // Floating Balance Gain Animation state (+10.00 DLS)
  const [balanceGainAnim, setBalanceGainAnim] = useState<{
    id: number;
    amount: string;
    icon: string;
    currency: string;
  } | null>(null);
  const balanceAnimTimerRef = useRef<any>(null);

  const triggerBalanceGain = (dlsGain: number) => {
    if (dlsGain <= 0) return;
    if (balanceAnimTimerRef.current) clearTimeout(balanceAnimTimerRef.current);
    const activeGain = toActiveAmount(dlsGain);
    const formatted = activeCurrency === 'BGLS'
      ? activeGain.toFixed(2)
      : activeGain.toLocaleString(undefined, { maximumFractionDigits: 2 });

    setBalanceGainAnim({
      id: Date.now(),
      amount: `+${formatted}`,
      icon: currencyIcon,
      currency: currencyLabel,
    });

    balanceAnimTimerRef.current = setTimeout(() => {
      setBalanceGainAnim(null);
    }, 2500);
  };

  const canAfford = (dlsAmount: number) => {
    if (!currentUser) return false;
    return balanceDls >= dlsAmount && dlsAmount > 0;
  };

  const deductBet = (dlsAmount: number): boolean => {
    if (!currentUser) {
      setAuthMode('login');
      setAuthModalOpen(true);
      showToast('Please sign in to place your bet.', 'warning', 'Sign In Required');
      return false;
    }
    if (dlsAmount <= 0) return false;
    if (balanceDls < dlsAmount) {
      const needed = toActiveAmount(dlsAmount);
      const current = toActiveAmount(balanceDls);
      showToast(
        `Insufficient balance! You need ${needed} ${currencyLabel} (You have ${current} ${currencyLabel}). Please deposit to continue.`,
        'error',
        'Insufficient Balance'
      );
      sound.playExplosion();
      return false;
    }
    updateCurrentUserBalance(balanceDls - dlsAmount);
    return true;
  };

  const awardPayout = (dlsPayout: number, gameName: string, multiplier: number, betDls: number) => {
    if (!currentUser) return;
    updateCurrentUserBalance(balanceDls + dlsPayout);

    // Floating gain animation on header balance
    triggerBalanceGain(dlsPayout);

    const actualMult = multiplier > 0 ? multiplier : (betDls > 0 ? Number((dlsPayout / betDls).toFixed(2)) : 1);
    const newBet: LiveBet = {
      id: Date.now().toString() + '_' + Math.random().toString(36).substring(2, 6),
      game: gameName,
      player: user.username,
      betDls,
      multiplier: actualMult,
      payoutDls: dlsPayout,
      won: true,
      timestamp: 'Just now',
    };

    setLiveBets((prev) => {
      const updated = [newBet, ...prev.slice(0, 39)];
      try {
        localStorage.setItem('supreme_live_bets', JSON.stringify(updated));
      } catch {}
      return updated;
    });

    try {
      if (realtimeChannel) realtimeChannel.postMessage({ type: 'LIVE_BET', payload: newBet });
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'LIVE_BET', payload: newBet }));
      }
    } catch {}
  };

  const recordLoss = (betDls: number, gameName: string) => {
    if (!currentUser) return;
    const newBet: LiveBet = {
      id: Date.now().toString() + '_' + Math.random().toString(36).substring(2, 6),
      game: gameName,
      player: user.username,
      betDls,
      multiplier: 0,
      payoutDls: 0,
      won: false,
      timestamp: 'Just now',
    };

    setLiveBets((prev) => {
      const updated = [newBet, ...prev.slice(0, 39)];
      try {
        localStorage.setItem('supreme_live_bets', JSON.stringify(updated));
      } catch {}
      return updated;
    });

    try {
      if (realtimeChannel) realtimeChannel.postMessage({ type: 'LIVE_BET', payload: newBet });
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'LIVE_BET', payload: newBet }));
      }
    } catch {}
  };

  const deposit = (dlsAmount: number) => {
    if (!currentUser) return;
    if (dlsAmount <= 0) return;
    updateCurrentUserBalance(balanceDls + dlsAmount);
    triggerBalanceGain(dlsAmount);
    sound.playCashout();
    showToast(`Successfully deposited ${toActiveAmount(dlsAmount)} ${currencyLabel}!`, 'success', 'Deposit Confirmed');
  };

  // Withdraw nyata: server -> bridge Lua gtps.cloud -> item masuk backpack in-game.
  // Saldo hanya dipotong jika bridge konfirmasi item benar-benar terkirim.
  const withdraw = async (dlsAmount: number, growId: string, world: string): Promise<{ success: boolean; message: string }> => {
    const cu = currentUserRef.current;
    if (!cu) {
      return { success: false, message: 'Please Sign In to withdraw.' };
    }
    if (!growId.trim()) {
      return { success: false, message: 'Please enter a valid GrowID.' };
    }
    const amt = Math.floor(dlsAmount);
    if (amt <= 0 || amt !== dlsAmount) {
      return { success: false, message: 'Withdraw dari web harus kelipatan 1 DL.' };
    }
    if (balanceDls < dlsAmount) {
      return { success: false, message: 'Insufficient balance for this withdrawal.' };
    }

    try {
      const res = await fetch('/api/gtps/withdraw-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ growId: growId.trim(), currency: 'DL', amount: amt }),
      });
      const data = await res.json().catch(() => ({ ok: false, error: 'invalid_response' }));
      if (!data.ok) {
        const msgs: Record<string, string> = {
          player_offline: 'GrowID kamu tidak online di GTPS. Login ke game dulu, lalu coba lagi.',
          growid_belum_link: 'GrowID belum ter-link. Ketik /link <kode> di dalam game dulu.',
          saldo_ledger_tidak_cukup: 'Saldo deposit in-game tidak mencukupi. /deposit dulu di game.',
          backpack_penuh: 'Backpack di game penuh. Kosongkan slot dulu.',
          invalid_secret_key: 'Konfigurasi secretKey server salah. Hubungi admin.',
          bridge_unreachable: 'Server GTPS tidak bisa dihubungi. Coba lagi nanti.',
        };
        const msg = msgs[data.error] || `Withdraw gagal: ${data.error || res.status}`;
        return { success: false, message: msg };
      }
    } catch {
      return { success: false, message: 'Server casino tidak merespons. Coba lagi.' };
    }

    updateCurrentUserBalance(balanceDls - dlsAmount);
    const msg = `Withdraw berhasil! ${amt} DL dikirim ke backpack ${growId.trim()} in-game.`;
    showToast(msg, 'success', 'Withdraw Delivered');
    return { success: true, message: msg };
  };

  const tip = (dlsAmount: number, targetUser: string, message?: string) => {
    if (!currentUser) {
      return { success: false, message: 'Please Sign In to tip.' };
    }
    if (!targetUser.trim()) {
      return { success: false, message: 'Please enter recipient username.' };
    }
    if (targetUser.trim().toLowerCase() === user.username.toLowerCase()) {
      return { success: false, message: 'You cannot tip yourself.' };
    }
    if (dlsAmount <= 0) {
      return { success: false, message: 'Please enter a valid tip amount.' };
    }
    if (balanceDls < dlsAmount) {
      return { success: false, message: 'Insufficient balance to tip.' };
    }

    updateCurrentUserBalance(balanceDls - dlsAmount);

    // Credit recipient account if already registered in local accounts
    setAccounts((prev) =>
      prev.map((acc) => {
        if (acc.username.toLowerCase() === targetUser.trim().toLowerCase()) {
          return { ...acc, balanceDls: (acc.balanceDls || 0) + dlsAmount };
        }
        return acc;
      })
    );

    sound.playCashout();

    const formattedAmount = `${toActiveAmount(dlsAmount)} ${currencyLabel}`;

    const resMsg = `Tipped ${formattedAmount} to ${targetUser.trim()}! ${message ? `("${message}")` : ''}`;
    showToast(resMsg, 'success', 'Tip Sent');
    return {
      success: true,
      message: resMsg,
    };
  };

  // ==========================================
  // 💬 LIVE COMMUNITY CHAT ENGINE (100% REAL)
  // ==========================================
  const wsRef = useRef<WebSocket | null>(null);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() => {
    const saved = localStorage.getItem('supreme_chat_messages');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed.filter((m: ChatMessage) => !m.isSystem && !m.text.startsWith('💸 [TIP]'));
      } catch {}
    }
    return [];
  });

  // Real-time synchronization across browser tabs and WebSocket server
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // 1. Multi-tab BroadcastChannel
    if (realtimeChannel) {
      realtimeChannel.onmessage = (event) => {
        const { type, payload } = event.data || {};
        if (type === 'CHAT_MESSAGE' && payload) {
          setChatMessages((prev) => {
            if (prev.some((m) => m.id === payload.id)) return prev;
            const updated = [...prev.slice(-99), payload];
            try { localStorage.setItem('supreme_chat_messages', JSON.stringify(updated)); } catch {}
            return updated;
          });
        } else if (type === 'LIVE_BET' && payload) {
          setLiveBets((prev) => {
            if (prev.some((b) => b.id === payload.id)) return prev;
            const updated = [payload, ...prev.slice(0, 39)];
            try { localStorage.setItem('supreme_live_bets', JSON.stringify(updated)); } catch {}
            return updated;
          });
        }
      };
    }

    // 2. WebSocket for Render deployment
    let ws: WebSocket | null = null;
    let reconnectTimeout: any = null;

    const connect = () => {
      try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws`;
        ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'INIT_STATE') {
              if (data.payload?.chatHistory && data.payload.chatHistory.length > 0) {
                setChatMessages(data.payload.chatHistory);
              }
              if (data.payload?.liveBets && data.payload.liveBets.length > 0) {
                setLiveBets(data.payload.liveBets);
              }
            } else if (data.type === 'CHAT_MESSAGE' && data.payload) {
              setChatMessages((prev) => {
                if (prev.some((m) => m.id === data.payload.id)) return prev;
                const updated = [...prev.slice(-99), data.payload];
                try { localStorage.setItem('supreme_chat_messages', JSON.stringify(updated)); } catch {}
                return updated;
              });
            } else if (data.type === 'LIVE_BET' && data.payload) {
              setLiveBets((prev) => {
                if (prev.some((b) => b.id === data.payload.id)) return prev;
                const updated = [data.payload, ...prev.slice(0, 39)];
                try { localStorage.setItem('supreme_live_bets', JSON.stringify(updated)); } catch {}
                return updated;
              });
            } else if (data.type === 'GTPS_LINK' && data.payload) {
              const { growId, code } = data.payload;
              const cu = currentUserRef.current;
              // Hanya berlaku untuk akun yang kode link-nya cocok
              // (broadcast server dikirim ke SEMUA client)
              if (growId && cu && String(code || '') === String(cu.linkCode || '')) {
                updateUserGrowId(growId);
              }
            } else if (data.type === 'GTPS_UNLINK' && data.payload) {
              const cu = currentUserRef.current;
              const myGrow = String(cu?.growId || '').toLowerCase();
              if (cu && myGrow && String(data.payload.growId || '').toLowerCase() === myGrow) {
                const updated = { ...cu, growId: undefined };
                setCurrentUser(updated);
                try {
                  localStorage.setItem('supreme_active_session', JSON.stringify(updated));
                  localStorage.setItem('voidps_active_session', JSON.stringify(updated));
                } catch {}
                setAccounts((prev) => {
                  const next = prev.map((a) =>
                    a.username.toLowerCase() === cu.username.toLowerCase() ? { ...a, growId: undefined } : a
                  );
                  try {
                    localStorage.setItem('supreme_registered_accounts', JSON.stringify(next));
                  } catch {}
                  return next;
                });
                showToast('Link GTPS diputus dari sisi game.', 'info', 'GTPS Unlinked');
              }
            } else if (data.type === 'GTPS_DEPOSIT' && data.payload) {
              // Deposit in-game -> saldo web bertambah otomatis (real, bukan simulasi)
              const p = data.payload;
              const cu = currentUserRef.current;
              const myGrow = String(cu?.growId || '').toLowerCase();
              if (cu && myGrow && String(p.growId || '').toLowerCase() === myGrow) {
                const cur = String(p.currency || 'DL').toUpperCase();
                const dls = cur === 'BGL' ? Number(p.amount) * 100 : cur === 'WL' ? Number(p.amount) / 100 : Number(p.amount);
                if (dls > 0) {
                  updateCurrentUserBalance(cu.balanceDls + dls);
                  triggerBalanceGain(dls);
                  showToast(`Deposit in-game diterima: +${dls} DLS!`, 'success', 'GTPS Deposit');
                }
              }
            }
          } catch {}
        };

        ws.onclose = () => {
          reconnectTimeout = setTimeout(connect, 4000);
        };
        ws.onerror = () => {
          ws?.close();
        };
      } catch {}
    };

    connect();

    return () => {
      clearTimeout(reconnectTimeout);
      if (ws) ws.close();
    };
  }, []);

  const sendChatMessage = (text: string) => {
    if (!text.trim()) return;
    if (currentUser?.isMuted) {
      showToast('You are currently muted from chat by an administrator.', 'error', 'Chat Muted');
      return;
    }
    const newMsg: ChatMessage = {
      id: Date.now().toString() + '_' + Math.random().toString(36).substring(2, 6),
      user: user.isAuthenticated ? user.username : 'Guest_' + Math.floor(Math.random() * 899 + 100),
      text: text.trim(),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    setChatMessages((prev) => {
      const updated = [...prev.slice(-99), newMsg];
      try {
        localStorage.setItem('supreme_chat_messages', JSON.stringify(updated));
      } catch {}
      return updated;
    });

    try {
      if (realtimeChannel) realtimeChannel.postMessage({ type: 'CHAT_MESSAGE', payload: newMsg });
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'CHAT_MESSAGE', payload: newMsg }));
      }
    } catch {}
  };

  // ANTI-DUPE: file "pending battle" dari localStorage TIDAK PERNAH dipakai
  // membayar ulang - dulu bisa dipalsukan (precomputedWinnerIsUser + lootTotal)
  // untuk saldo gratis setiap reload. Sekarang cuma dibuang.
  useEffect(() => {
    try {
      localStorage.removeItem('supreme_active_battle_pending');
    } catch {}
  }, []);

  // ==========================================
  // 🚀 24/7 GLOBAL SYNCHRONIZED CRASH ROOM ENGINE
  // ==========================================
  const [crashPhase, setCrashPhase] = useState<'betting' | 'flying' | 'crashed'>('betting');
  const [crashCountdown, setCrashCountdown] = useState<number>(5.0);
  const [crashMultiplier, setCrashMultiplier] = useState<number>(1.00);
  const [crashPoint, setCrashPoint] = useState<number>(generateStakeCrashPoint());
  const [crashHistory, setCrashHistory] = useState<number[]>([1.45, 2.80, 1.15, 6.20, 1.98, 1.02, 3.44, 12.50]);
  const [crashRoomPlayers, setCrashRoomPlayers] = useState<CrashRoomPlayer[]>([]);
  const [userCrashBet, setUserCrashBet] = useState<UserCrashBet | null>(null);

  const flightStartTimeRef = useRef<number>(0);
  const currentCrashPointRef = useRef<number>(crashPoint);
  const userBetRef = useRef<UserCrashBet | null>(null);
  userBetRef.current = userCrashBet;

  // Run the crash game loop continuously at the root provider
  useEffect(() => {
    let timer: any = null;

    if (crashPhase === 'betting') {
      const startTime = Date.now();
      const duration = 5000;

      // Real room players only
      setCrashRoomPlayers(userBetRef.current ? [{
        id: `user-${Date.now()}`,
        name: user.username || 'You',
        betDls: userBetRef.current.amountDls,
      }] : []);

      timer = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const remaining = Math.max(0, (duration - elapsed) / 1000);
        setCrashCountdown(Number(remaining.toFixed(1)));

        if (remaining <= 0) {
          clearInterval(timer);
          // Transition to Flying Phase
          const nextCrash = generateStakeCrashPoint();
          currentCrashPointRef.current = nextCrash;
          setCrashPoint(nextCrash);
          setCrashMultiplier(1.00);
          setCrashPhase('flying');
          flightStartTimeRef.current = Date.now();

          // If user had queued bet, activate it
          if (userBetRef.current && userBetRef.current.status === 'queued') {
            setUserCrashBet({ ...userBetRef.current, status: 'active' });
          }
        }
      }, 100);
    } else if (crashPhase === 'flying') {
      timer = setInterval(() => {
        const elapsedSec = (Date.now() - flightStartTimeRef.current) / 1000;
        const mult = Math.max(1.00, Number(Math.exp(0.065 * elapsedSec * 1.5).toFixed(2)));

        if (mult >= currentCrashPointRef.current) {
          // CRASHED!
          clearInterval(timer);
          const finalPoint = currentCrashPointRef.current;
          setCrashMultiplier(finalPoint);
          setCrashPhase('crashed');
          setCrashHistory((h) => [finalPoint, ...h.slice(0, 11)]);

          // Post message to community chat
          setChatMessages((prev) => [
            ...prev.slice(-40),
            {
              id: Date.now().toString(),
              user: 'Server Supreme',
              text: `🚀 Crash round ended @ ${finalPoint.toFixed(2)}x!`,
              time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              isSystem: true,
            },
          ]);

          // Check if active user busted
          if (userBetRef.current && userBetRef.current.status === 'active') {
            setUserCrashBet({ ...userBetRef.current, status: 'busted' });
            recordLoss(userBetRef.current.amountDls, 'Crash');
            sound.playExplosion();
          }

          // 3.5s cooldown then restart betting
          setTimeout(() => {
            setCrashPhase('betting');
            setCrashCountdown(5.0);
            setUserCrashBet(null);
            setCrashRoomPlayers([]);
          }, 3500);
        } else {
          setCrashMultiplier(mult);

          // Check user auto-cashout
          if (userBetRef.current && userBetRef.current.status === 'active') {
            if (userBetRef.current.autoCashout > 1.01 && mult >= userBetRef.current.autoCashout) {
              const wonAmount = userBetRef.current.amountDls * userBetRef.current.autoCashout;
              awardPayout(wonAmount, 'Crash', userBetRef.current.autoCashout, userBetRef.current.amountDls);
              setUserCrashBet({ ...userBetRef.current, status: 'cashed', cashedAt: userBetRef.current.autoCashout });
              sound.playCashout();
              sound.playWin();
            }
          }
        }
      }, 50);
    }

    return () => clearInterval(timer);
  }, [crashPhase]);

  const joinNextRound = (betDls: number, autoCashout: number): boolean => {
    if (!currentUser) {
      setAuthMode('login');
      setAuthModalOpen(true);
      return false;
    }
    if (betDls <= 0 || !deductBet(betDls)) return false;

    const newBet: UserCrashBet = {
      amountDls: betDls,
      autoCashout: autoCashout > 1.01 ? autoCashout : 0,
      status: crashPhase === 'betting' ? 'queued' : 'queued',
    };
    setUserCrashBet(newBet);
    return true;
  };

  const cancelQueuedBet = () => {
    if (userCrashBet && userCrashBet.status === 'queued') {
      updateCurrentUserBalance(balanceDls + userCrashBet.amountDls);
      setUserCrashBet(null);
    }
  };

  const cashoutActiveBet = () => {
    if (userCrashBet && userCrashBet.status === 'active' && crashPhase === 'flying') {
      const payout = userCrashBet.amountDls * crashMultiplier;
      awardPayout(payout, 'Crash', crashMultiplier, userCrashBet.amountDls);
      setUserCrashBet({ ...userCrashBet, status: 'cashed', cashedAt: crashMultiplier });
      sound.playCashout();
      sound.playWin();
    }
  };

  return (
    <GameContext.Provider
      value={{
        user,
        activeCurrency,
        setActiveCurrency,
        selectedFiat,
        setSelectedFiat,
        balance,
        formatBalance,
        toActiveAmount,
        fromActiveAmount,
        currencyLabel,
        currencyIcon,
        isAdmin,
        adminModalOpen,
        setAdminModalOpen,
        gtpsPort,
        setGtpsPort,
        accounts,
        adminAddBalance,
        adminRemoveBalance,
        adminToggleBan,
        adminToggleMute,
        balanceGainAnim,
        triggerBalanceGain,
        toast,
        showToast,
        hideToast,
        login,
        register,
        logout,
        authModalOpen,
        setAuthModalOpen,
        authMode,
        setAuthMode,
        deposit,
        withdraw,
        tip,
        updateUserGrowId,
        unlinkGtps,
        canAfford,
        deductBet,
        awardPayout,
        recordLoss,
        liveBets,
        activeGameSession,
        setActiveGameSession,
        gameLockNotice,
        clearGameLockNotice,
        runningGameModal,
        setRunningGameModal,
        checkCanPlayGame,
        clearRunningGameSession,
        activeGame,
        setActiveGame,
        walletModalOpen,
        setWalletModalOpen,
        walletTab,
        setWalletTab,
        sidebarOpen,
        setSidebarOpen,
        soundMuted,
        setSoundMuted,
        crashRoom: {
          phase: crashPhase,
          countdown: crashCountdown,
          currentMultiplier: crashMultiplier,
          crashPoint,
          history: crashHistory,
          roomPlayers: crashRoomPlayers,
          userBet: userCrashBet,
          joinNextRound,
          cancelQueuedBet,
          cashoutActiveBet,
        },
        chatMessages,
        sendChatMessage,
      }}
    >
      {children}
    </GameContext.Provider>
  );
};

export const useGame = () => {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used within GameProvider');
  return ctx;
};

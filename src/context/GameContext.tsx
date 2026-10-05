import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import type { Currency, UserState, LiveBet } from '../types';
import { sound } from '../utils/audio';

export interface StoredAccount {
  username: string;
  password?: string;
  growId?: string;
  gtpsLinked?: boolean;
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
  roundId?: string;
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
  adminAddBalance: (username: string, amountDls: number) => Promise<boolean>;
  adminRemoveBalance: (username: string, amountDls: number) => Promise<boolean>;
  adminToggleBan: (username: string) => Promise<boolean>;
  adminToggleMute: (username: string) => Promise<boolean>;

  // Floating Balance Gain Animation (+10.00 DLS)
  balanceGainAnim: { id: number; amount: string; icon: string; currency: string } | null;
  triggerBalanceGain: (dlsAmount: number) => void;

  // Corner Toast Notifications
  toast: ToastNotification | null;
  showToast: (message: string, type?: 'error' | 'warning' | 'info' | 'success', title?: string) => void;
  hideToast: () => void;

  // Real Auth
  login: (username: string, pass: string) => Promise<{ success: boolean; message: string }>;
  register: (username: string, pass: string, growId?: string) => Promise<{ success: boolean; message: string }>;
  logout: () => void;
  authModalOpen: boolean;
  setAuthModalOpen: (open: boolean) => void;
  authMode: 'login' | 'register';
  setAuthMode: (m: 'login' | 'register') => void;

  // Wallet
  deposit: (dlsAmount: number) => void;
  withdraw: (dlsAmount: number, growId: string, world: string) => Promise<{ success: boolean; message: string }>;
  tip: (dlsAmount: number, targetUser: string, message?: string) => Promise<{ success: boolean; message: string }>;
  updateUserGrowId: (growId: string) => void;
  unlinkGtps: () => Promise<{ success: boolean; message: string }>;

  // Gameplay
  canAfford: (dlsAmount: number) => boolean;
  deductBet: (dlsAmount: number) => boolean;
  awardPayout: (dlsPayout: number, gameName: string, multiplier: number, betDls: number) => void;
  recordLoss: (betDls: number, gameName: string) => void;
  startGameRound: (gameId: string, betDls: number, clientSeed?: string, options?: Record<string, unknown>) => Promise<{ success:boolean; roundId?:string; serverSeedHash?:string; message?:string; balanceDls?:number }>;
  resolveGameRound: (roundId: string, action: Record<string, unknown>) => Promise<{ success:boolean; result?:any; payoutDls?:number; balanceDls?:number; finished?:boolean; serverSeed?:string; serverSeedHash?:string; message?:string }>;

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

const apiJson = async (url: string, options: RequestInit = {}) => {
  const response = await fetch(url, {
    credentials: 'include',
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
};

const realtimeChannel = typeof window !== 'undefined' && 'BroadcastChannel' in window 
  ? new BroadcastChannel('supreme_casino_sync') 
  : null;


const GameContext = createContext<GameContextType | undefined>(undefined);

export const GameProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [accounts, setAccounts] = useState<StoredAccount[]>([]);
  const [currentUser, setCurrentUser] = useState<StoredAccount | null>(null);

  // Ref agar handler WebSocket (yang terpasang sekali) selalu membaca user terbaru,
  // bukan user dari render pertama (stale closure).
  const currentUserRef = useRef<StoredAccount | null>(currentUser);
  currentUserRef.current = currentUser;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await apiJson('/api/auth/me');
        if (cancelled) return;
        if (data.authenticated && data.user) {
          setCurrentUser(data.user);
          currentUserRef.current = data.user;
          try {
            const adminRes = await apiJson('/api/admin/users');
            if (adminRes.data?.users) setAccounts(adminRes.data.users);
          } catch {}
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!currentUser?.isAdmin) return;
    apiJson('/api/admin/users').then(({ data }) => {
      if (Array.isArray(data?.users)) setAccounts(data.users);
    }).catch(() => {});
  }, [currentUser?.isAdmin]);

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
  const isAdmin = Boolean(currentUser?.isAdmin);

  const user: UserState = {
    username: currentUser ? currentUser.username : 'Guest',
    growId: currentUser?.growId,
    linkCode: currentUser?.linkCode,
    gtpsLinked: Boolean(currentUser?.gtpsLinked && currentUser?.growId),
    isAuthenticated: currentUser !== null,
    balanceDls,
    activeCurrency,
    selectedFiat,
  };

  const login = async (uname: string, pass: string) => {
    const cleanUname = uname.trim();
    try {
      let { response, data } = await apiJson('/api/auth/login', {
        method: 'POST', body: JSON.stringify({ username: cleanUname, password: pass })
      });
      if (!response.ok && data.error === 'invalid_credentials') {
        const legacy = await apiJson('/api/auth/migrate', {
          method: 'POST',
          body: JSON.stringify({
            username: cleanUname,
            password: pass,
            growId: '',
            balanceDls: 0
          })
        });
        if (legacy.response.ok) {
          data = legacy.data;
          response = legacy.response;
        }
      }
      if (!response.ok || !data.user) {
        const messages: Record<string,string> = {
          invalid_credentials: 'Incorrect username or password.',
          account_banned: 'This account has been banned by an administrator.',
        };
        return { success:false, message:messages[data.error] || 'Login failed.' };
      }
      setCurrentUser(data.user);
      currentUserRef.current = data.user;
      setAccounts(prev => prev.some(a => a.username.toLowerCase() === data.user.username.toLowerCase())
        ? prev.map(a => a.username.toLowerCase() === data.user.username.toLowerCase() ? data.user : a)
        : [...prev, data.user]);
      return { success:true, message:'Logged in successfully.' };
    } catch {
      return { success:false, message:'Server casino tidak merespons.' };
    }
  };

  const register = async (uname: string, pass: string, gId?: string) => {
    const cleanUname = uname.trim();
    if (cleanUname.length < 4) return { success:false, message:'Username must be at least 4 characters.' };
    if (pass.length < 8) return { success:false, message:'Password must be at least 8 characters.' };
    try {
      const { response, data } = await apiJson('/api/auth/register', {
        method:'POST',
        body:JSON.stringify({ username:cleanUname, password:pass, growId:gId?.trim() || '' })
      });
      if (!response.ok || !data.user) {
        const messages: Record<string,string> = { username_taken:'Username is already taken. Please choose another.' };
        return { success:false, message:messages[data.error] || 'Registration failed.' };
      }
      setCurrentUser(data.user);
      currentUserRef.current = data.user;
      setAccounts(prev => [...prev.filter(a => a.username.toLowerCase() !== data.user.username.toLowerCase()), data.user]);
      return { success:true, message:'Account registered successfully! Please deposit or link your GTPS account.' };
    } catch {
      return { success:false, message:'Server casino tidak merespons.' };
    }
  };

  const logout = async () => {
    try { await apiJson('/api/auth/logout', { method:'POST', body:'{}' }); } catch {}
    setCurrentUser(null);
    currentUserRef.current = null;
  };

  const updateUserGrowId = async (growId: string) => {
    const cu = currentUserRef.current;
    if (!cu) return;
    const cleanGrow = String(growId || '').trim();
    if (!cleanGrow) return;
    try {
      const { response, data } = await apiJson('/api/account/growid', {
        method:'POST', body:JSON.stringify({ growId:cleanGrow })
      });
      if (!response.ok || !data.user) {
        showToast(data.error === 'growid_already_linked' ? 'GrowID sudah terhubung ke akun lain.' : 'Gagal menyimpan GrowID.', 'error', 'GTPS Link');
        return;
      }
      setCurrentUser(data.user); currentUserRef.current = data.user;
      setAccounts(prev => prev.map(a => a.username.toLowerCase() === data.user.username.toLowerCase() ? data.user : a));
      showToast(`Linked with GTPS Character: ${cleanGrow}!`, 'success', 'GTPS Account Connected');
    } catch {
      showToast('Server casino tidak merespons.', 'error', 'GTPS Link');
    }
  };

  // Lepas link GTPS dari web: server + bridge Lua ikut dilepas
  const unlinkGtps = async (): Promise<{ success: boolean; message: string }> => {
    const cu = currentUserRef.current;
    if (!cu) return { success:false, message:'Please Sign In first.' };
    if (!cu.gtpsLinked || !cu.growId) return { success:false, message:'Akun belum ter-link dengan GTPS.' };
    try {
      const { response, data } = await apiJson('/api/account/unlink-growid', { method:'POST', body:'{}' });
      if (!response.ok || !data.user) return { success:false, message:'Gagal unlink. Coba lagi.' };
      setCurrentUser(data.user); currentUserRef.current = data.user;
      setAccounts(prev => prev.map(a => a.username.toLowerCase() === data.user.username.toLowerCase() ? data.user : a));
      showToast('Akun GTPS berhasil di-unlink. Saldo casino tetap aman.', 'success', 'GTPS Unlinked');
      return {success:true,message:'Akun GTPS berhasil di-unlink.'};
    } catch {
      return {success:false,message:'Server casino tidak merespons.'};
    }
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
  const adminAddBalance = async (username: string, amountDls: number): Promise<boolean> => {
    if (!currentUser?.isAdmin || amountDls <= 0) return false;
    try {
      const { response, data } = await apiJson('/api/admin/balance', {
        method:'POST', body:JSON.stringify({ username, amountDls, mode:'add' })
      });
      if (!response.ok) return false;
      setAccounts(prev => prev.map(acc => acc.username.toLowerCase() === username.toLowerCase() ? data.user : acc));
      if (data.user?.username?.toLowerCase() === currentUser.username.toLowerCase()) {
        setCurrentUser(data.user); currentUserRef.current = data.user; triggerBalanceGain(amountDls);
      }
      return true;
    } catch { return false; }
  };

  const adminRemoveBalance = async (username: string, amountDls: number): Promise<boolean> => {
    if (!currentUser?.isAdmin || amountDls <= 0) return false;
    try {
      const { response, data } = await apiJson('/api/admin/balance', {
        method:'POST', body:JSON.stringify({ username, amountDls, mode:'remove' })
      });
      if (!response.ok) return false;
      setAccounts(prev => prev.map(acc => acc.username.toLowerCase() === username.toLowerCase() ? data.user : acc));
      if (data.user?.username?.toLowerCase() === currentUser.username.toLowerCase()) {
        setCurrentUser(data.user); currentUserRef.current = data.user;
      }
      return true;
    } catch { return false; }
  };

  const adminToggleBan = async (username: string): Promise<boolean> => {
    if (!currentUser?.isAdmin) return false;
    try {
      const { response, data } = await apiJson('/api/admin/status', {
        method:'POST', body:JSON.stringify({ username, field:'isBanned' })
      });
      if (!response.ok) return false;
      setAccounts(prev => prev.map(acc => acc.username.toLowerCase() === username.toLowerCase() ? data.user : acc));
      return true;
    } catch { return false; }
  };

  const adminToggleMute = async (username: string): Promise<boolean> => {
    if (!currentUser?.isAdmin) return false;
    try {
      const { response, data } = await apiJson('/api/admin/status', {
        method:'POST', body:JSON.stringify({ username, field:'isMuted' })
      });
      if (!response.ok) return false;
      setAccounts(prev => prev.map(acc => acc.username.toLowerCase() === username.toLowerCase() ? data.user : acc));
      return true;
    } catch { return false; }
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

  const startGameRound = async (gameId: string, betDls: number, clientSeed?: string, options: Record<string, unknown> = {}) => {
    if (!currentUserRef.current) return {success:false,message:'Please Sign In first.'};
    try {
      const {response,data}=await apiJson('/api/games/start',{method:'POST',body:JSON.stringify({gameId,betDls,clientSeed,...options})});
      if(!response.ok) return {success:false,message:data.error||'Unable to start game.'};
      if(data.balanceDls !== undefined){
        const u={...currentUserRef.current,balanceDls:Number(data.balanceDls)};
        setCurrentUser(u); currentUserRef.current=u;
      }
      return {success:true,roundId:data.roundId,serverSeedHash:data.serverSeedHash,balanceDls:data.balanceDls};
    } catch { return {success:false,message:'Game server tidak merespons.'}; }
  };

  const resolveGameRound = async (roundId: string, action: Record<string, unknown>) => {
    try {
      const {response,data}=await apiJson('/api/games/resolve',{method:'POST',body:JSON.stringify({roundId,action})});
      if(!response.ok) return {success:false,message:data.error||'Unable to resolve game.'};
      if(data.balanceDls !== undefined){
        const u={...currentUserRef.current!,balanceDls:Number(data.balanceDls)};
        setCurrentUser(u); currentUserRef.current=u;
      }
      return {success:true,result:data.result,payoutDls:data.payoutDls,balanceDls:data.balanceDls,finished:data.finished,serverSeed:data.serverSeed,serverSeedHash:data.serverSeedHash};
    } catch { return {success:false,message:'Game server tidak merespons.'}; }
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

  const deposit = (_dlsAmount: number) => {
    showToast('Deposit diproses otomatis melalui GTPS /deposit. Jangan kredit saldo dari browser.', 'info', 'GTPS Deposit');
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

    if (data.user) { setCurrentUser(data.user); currentUserRef.current = data.user; }
    const msg = `Withdraw berhasil! ${amt} DL dikirim ke backpack ${String(data.user?.growId || growId).trim()} in-game.`;
    showToast(msg, 'success', 'Withdraw Delivered');
    return { success: true, message: msg };
  };

  const tip = async (dlsAmount: number, targetUser: string, message?: string) => {
    if (!currentUser) return { success:false, message:'Please Sign In to tip.' };
    if (!targetUser.trim() || targetUser.trim().toLowerCase() === user.username.toLowerCase()) {
      return { success:false, message:'Please enter a valid recipient username.' };
    }
    if (dlsAmount <= 0) return { success:false, message:'Please enter a valid tip amount.' };
    try {
      const { response, data } = await apiJson('/api/economy/tip', {
        method:'POST', body:JSON.stringify({ amountDls:dlsAmount, targetUser:targetUser.trim(), message:message || '' })
      });
      if (!response.ok) {
        const messages: Record<string,string> = { insufficient_balance:'Insufficient balance to tip.', recipient_not_found:'Recipient account does not exist.', self_tip:'You cannot tip yourself.' };
        return { success:false, message:messages[data.error] || 'Tip failed.' };
      }
      if (data.user) { setCurrentUser(data.user); currentUserRef.current = data.user; }
      setAccounts(prev => prev.map(a => a.username.toLowerCase() === targetUser.trim().toLowerCase() && data.recipient ? data.recipient : a));
      sound.playCashout();
      const formattedAmount = `${toActiveAmount(dlsAmount)} ${currencyLabel}`;
      const resMsg = `Tipped ${formattedAmount} to ${targetUser.trim()}!${message ? ` ("${message}")` : ''}`;
      showToast(resMsg, 'success', 'Tip Sent');
      return { success:true, message:resMsg };
    } catch {
      return { success:false, message:'Server casino tidak merespons.' };
    }
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

        ws.onmessage = async (event) => {
          let data: any;
          try { data = JSON.parse(event.data); } catch { return; }
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
                const updated = { ...cu, growId: undefined, gtpsLinked: false };
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
              const p = data.payload;
              const cu = currentUserRef.current;
              const myGrow = String(cu?.growId || '').toLowerCase();
              if (cu && myGrow && String(p.growId || '').toLowerCase() === myGrow) {
                try {
                  const walletRes = await apiJson('/api/economy/wallet');
                  if (walletRes.data?.user) {
                    setCurrentUser(walletRes.data.user);
                    currentUserRef.current = walletRes.data.user;
                    setAccounts(prev => prev.map(a => a.username.toLowerCase() === walletRes.data.user.username.toLowerCase() ? walletRes.data.user : a));
                    const cur = String(p.currency || 'DL').toUpperCase();
                    const dls = cur === 'BGL' ? Number(p.amount) * 100 : cur === 'WL' ? Number(p.amount) / 100 : Number(p.amount);
                    if (dls > 0) triggerBalanceGain(dls);
                    showToast(`Deposit in-game diterima: +${toActiveAmount(dls)} ${currencyLabel}!`, 'success', 'GTPS Deposit');
                  }
                } catch {}
              }
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

  // Crash is a single server-owned global room. The browser only renders server state.
  useEffect(() => {
    let stopped = false;
    const refresh = async () => {
      const data = await fetch('/api/crash/state', { credentials: 'include' }).then(r => r.json()).catch(() => null);
      if (stopped || !data?.ok) return;
      const s = data.state;
      setCrashPhase(s.phase);
      setCrashCountdown(Number(s.countdown || 0));
      setCrashMultiplier(Number(s.currentMultiplier || 1));
      setCrashPoint(Number(s.crashPoint || 1));
      setCrashHistory(Array.isArray(s.history) ? s.history : []);
      setCrashRoomPlayers(Array.isArray(s.players) ? s.players.map((p:any,i:number)=>({id:`${p.username}-${i}`,name:p.username,betDls:Number(p.amountDls||0)})) : []);
      if (data.userBet) setUserCrashBet(data.userBet);
      else if (s.phase === 'betting') setUserCrashBet(null);
    };
    refresh();
    const timer = window.setInterval(refresh, 250);
    return () => { stopped = true; window.clearInterval(timer); };
  }, []);

  const joinNextRound = (betDls: number, autoCashout: number): boolean => {
    if (!currentUser) { setAuthMode('login'); setAuthModalOpen(true); return false; }
    if (betDls <= 0) return false;
    fetch('/api/crash/join',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({betDls,autoCashout:autoCashout>1.01?autoCashout:0})})
      .then(r=>r.json()).then(d=>{
        if(!d?.ok){showToast(d?.error||'Unable to join Crash round','error','Crash');return;}
        setUserCrashBet(d.userBet);
        setCurrentUser(prev=>prev?{...prev,balanceDls:Number(d.balanceDls??prev.balanceDls)}:prev);
        sound.playClick();
      }).catch(()=>showToast('Unable to join Crash round','error','Crash'));
    return true;
  };

  const cancelQueuedBet = () => {
    const rb=userBetRef.current;
    if(!rb?.roundId)return;
    fetch('/api/crash/cancel',{method:'POST',credentials:'include'})
      .then(r=>r.json()).then(d=>{
        if(!d?.ok){showToast(d?.error||'Cancel failed','error','Crash');return;}
        setUserCrashBet(null);
        setCurrentUser(prev=>prev?{...prev,balanceDls:Number(d.balanceDls??prev.balanceDls)}:prev);
      });
  };

  const cashoutActiveBet = () => {
    const rb=userBetRef.current;
    if(!rb?.roundId||rb.status!=='active')return;
    fetch('/api/crash/cashout',{method:'POST',credentials:'include'})
      .then(r=>r.json()).then(d=>{
        if(!d?.ok){showToast(d?.error||'Cashout failed','error','Crash');return;}
        setCurrentUser(prev=>prev?{...prev,balanceDls:Number(d.balanceDls??prev.balanceDls)}:prev);
        if(d.result?.outcome==='win'){setUserCrashBet({...rb,status:'cashed',cashedAt:Number(d.result.current||1)});sound.playCashout();sound.playWin();}
      }).catch(()=>showToast('Cashout failed','error','Crash'));
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

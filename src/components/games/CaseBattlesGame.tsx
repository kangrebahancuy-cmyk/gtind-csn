import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Swords,
  Layers,
  Search,
  Plus,
  ArrowUpDown,
  ChevronDown,
  ChevronLeft,
  X,
  Check,
  RotateCcw,
  Trophy,
  Gift,
  Users,
  Sparkles,
  Bot,
  DollarSign,
  Lock,
  Zap,
  Star,
  Info,
  Play,
  Flame,
  Award,
} from 'lucide-react';
import { useGame } from '../../context/GameContext';
import { sound } from '../../utils/audio';
import type { CustomCase, CaseItemDrop } from './CasesGame';
import {
  DEFAULT_CASES,
  CurrencyDisplay,
  CaseChestDisplay,
} from './CasesGame';

export type BattleMode = 'normal' | 'bonus' | 'shared';
export type PlayerConfig = '1v1' | '1v1v1' | '1v1v1v1' | '1v1v1v1v1' | '2v2' | '3v3' | '2v2v2';

export const STARTER_BATTLE_CASES: CustomCase[] = [
  {
    id: 'starter_case_novice',
    name: 'Novice Relic',
    price: 10,
    color: '#0074e4',
    image: '/assets/cases.png',
    items: [
      { id: '15', name: 'Red Crystal', image: '/assets/items/15.png', price: 0.1, chance: 40, rarity: 'common', color: '#94a3b8' },
      { id: '64', name: 'Ancestral Seed of Life', image: '/assets/items/64.png', price: 1.5, chance: 30, rarity: 'uncommon', color: '#38bdf8' },
      { id: '94', name: 'Alaskan King Crab Crown', image: '/assets/items/94.png', price: 5.95, chance: 20, rarity: 'rare', color: '#a855f7' },
      { id: '9', name: "Rayman's Fist", image: '/assets/items/9.png', price: 35, chance: 10, rarity: 'legendary', color: '#ef4444' },
    ],
  },
  {
    id: 'starter_case_vault',
    name: 'High Roller Vault',
    price: 50,
    color: '#a855f7',
    image: '/assets/cases.png',
    items: [
      { id: '64', name: 'Ancestral Seed of Life', image: '/assets/items/64.png', price: 1.5, chance: 35, rarity: 'uncommon', color: '#38bdf8' },
      { id: '94', name: 'Alaskan King Crab Crown', image: '/assets/items/94.png', price: 5.95, chance: 35, rarity: 'rare', color: '#a855f7' },
      { id: '9', name: "Rayman's Fist", image: '/assets/items/9.png', price: 35, chance: 20, rarity: 'epic', color: '#f59e0b' },
      { id: '269', name: 'Golden Relic Dragon', image: '/assets/items/269.png', price: 180, chance: 10, rarity: 'legendary', color: '#ef4444' },
    ],
  },
  {
    id: 'starter_case_whale',
    name: 'Supreme High Roller',
    price: 200,
    color: '#ef4444',
    image: '/assets/cases.png',
    items: [
      { id: '94', name: 'Alaskan King Crab Crown', image: '/assets/items/94.png', price: 5.95, chance: 30, rarity: 'rare', color: '#a855f7' },
      { id: '9', name: "Rayman's Fist", image: '/assets/items/9.png', price: 35, chance: 40, rarity: 'epic', color: '#f59e0b' },
      { id: '269', name: 'Golden Relic Dragon', image: '/assets/items/269.png', price: 180, chance: 20, rarity: 'legendary', color: '#ef4444' },
      { id: 'bgl_chest', name: '10x Blue Gem Locks', image: '/assets/BGLS.png', price: 1000, chance: 10, rarity: 'legendary', color: '#ef4444' },
    ],
  },
];

export const STARTER_LOBBY_BATTLES: BattleInstance[] = [];

export interface BattlePlayer {
  id: string;
  name: string;
  avatar: string;
  isBot: boolean;
  isUser: boolean;
  unboxedItems: CaseItemDrop[];
  totalValue: number;
}

export interface BattleInstance {
  id: string;
  mode: BattleMode;
  playerConfig: PlayerConfig;
  cases: CustomCase[]; // Ordered list of cases per round
  players: BattlePlayer[];
  totalCostPerPlayer: number;
  totalPot: number;
  status: 'open' | 'in-progress' | 'finished';
  createdAt: number;
  winnerId?: string;
  // Modifiers
  jackpotMode?: boolean;
  crazyMode?: boolean;
  terminalMode?: boolean;
  biggestPull?: boolean;
  // More
  fastSpin?: boolean;
  bigPullAnimation?: boolean;
  isPrivate?: boolean;
}

export const CaseBattlesGame: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const {
    deductBet,
    awardPayout,
    toActiveAmount,
    currencyLabel,
    currencyIcon,
    checkCanPlayGame,
    showToast,
    user,
    setActiveGame,
  } = useGame();

  // Load cases from local storage or defaults
  const [availableCases] = useState<CustomCase[]>(() => {
    const saved = localStorage.getItem('voidps_custom_cases_v2');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch {}
    }
    return STARTER_BATTLE_CASES;
  });

  // Main View: 'lobby' | 'create' | 'arena' | 'blueprints'
  const [view, setView] = useState<'lobby' | 'create' | 'arena' | 'blueprints'>('lobby');

  // Lobby State
  const [activeTab, setActiveTab] = useState<'battles' | 'blueprints'>('battles');
  const [lobbyFilter, setLobbyFilter] = useState<'all' | 'open' | 'in-progress'>('all');
  const [affordableOnly, setAffordableOnly] = useState<boolean>(false);
  const [lobbySort, setLobbySort] = useState<'newest' | 'oldest' | 'price-desc' | 'price-asc'>('newest');

  // Active battles in lobby
  const [battles, setBattles] = useState<BattleInstance[]>(() => {
    const saved = localStorage.getItem('supreme_case_battles');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch {}
    }
    return STARTER_LOBBY_BATTLES;
  });

  // Precomputed Deterministic Engine Refs (Survives Refresh & Interruption)
  const precomputedRoundsRef = useRef<{ [roundIdx: number]: { [playerIdx: number]: CaseItemDrop } }>({});
  const precomputedWinnerRef = useRef<{ winner: BattlePlayer; totalLootWon: number } | null>(null);

  // ANTI-DUPE: tidak ada lagi payout otomatis dari localStorage -
  // dulu file supreme_active_battle_pending bisa dipalsukan untuk
  // saldo gratis setiap reload. Kemenangan hanya dibayar saat ronde
  // selesai secara live (finishBattle).

  // Create Battle Form State (Matches media_1789565632571.png)
  const [createMode, setCreateMode] = useState<BattleMode>('normal');
  const [createConfig, setCreateConfig] = useState<PlayerConfig>('1v1');
  const [createSelectedCases, setCreateSelectedCases] = useState<{ [caseId: string]: number }>({
    [availableCases[0]?.id || 'starter']: 1,
  });

  // Modifiers (Matches media_1789565632565.png)
  const [jackpotMode, setJackpotMode] = useState<boolean>(false);
  const [crazyMode, setCrazyMode] = useState<boolean>(false);
  const [terminalMode, setTerminalMode] = useState<boolean>(false);
  const [biggestPull, setBiggestPull] = useState<boolean>(false);

  // More (Matches media_1789565632565.png)
  const [borrowMode, setBorrowMode] = useState<boolean>(false);
  const [privateMode, setPrivateMode] = useState<boolean>(false);
  const [fastSpinMode, setFastSpinMode] = useState<boolean>(false);
  const [bigPullAnimation, setBigPullAnimation] = useState<boolean>(true);

  // Select Cases Modal State (Matches media_1789565632612.png)
  const [caseModalOpen, setCaseModalOpen] = useState<boolean>(false);
  const [caseSearch, setCaseSearch] = useState<string>('');
  const [caseModalSort, setCaseModalSort] = useState<'newest' | 'price-desc' | 'price-asc'>('newest');

  // Currently Active Battle Arena State
  const [activeBattle, setActiveBattle] = useState<BattleInstance | null>(null);
  const [currentRoundIdx, setCurrentRoundIdx] = useState<number>(0);
  const [arenaSpinning, setArenaSpinning] = useState<boolean>(false);
  const [roundWinnerItems, setRoundWinnerItems] = useState<{ [playerIdx: number]: CaseItemDrop }>({});
  const [arenaReels, setArenaReels] = useState<{ [playerIdx: number]: CaseItemDrop[] }>({});
  const [arenaOffsets, setArenaOffsets] = useState<{ [playerIdx: number]: number }>({});
  const [arenaTransitions, setArenaTransitions] = useState<{ [playerIdx: number]: string }>({});
  const [arenaFinished, setArenaFinished] = useState<boolean>(false);
  const [battleWinner, setBattleWinner] = useState<BattlePlayer | null>(null);

  // Computed: Number of slots for config (e.g. 1v1 => 2, 1v1v1 => 3, etc.)
  const totalPlayerSlots = useMemo(() => {
    switch (createConfig) {
      case '1v1': return 2;
      case '1v1v1': return 3;
      case '1v1v1v1': return 4;
      case '1v1v1v1v1': return 5;
      case '2v2': return 4;
      case '3v3': return 6;
      case '2v2v2': return 6;
      default: return 2;
    }
  }, [createConfig]);

  // Computed: Flattened array of cases for battle rounds
  const orderedSelectedCases = useMemo(() => {
    const list: CustomCase[] = [];
    Object.entries(createSelectedCases).forEach(([caseId, count]) => {
      const found = availableCases.find((c) => c.id === caseId);
      if (found) {
        for (let i = 0; i < count; i++) {
          list.push(found);
        }
      }
    });
    return list;
  }, [createSelectedCases, availableCases]);

  // Total battle cost per player
  const totalBattleCost = useMemo(() => {
    return Number(orderedSelectedCases.reduce((sum, c) => sum + c.price, 0).toFixed(2));
  }, [orderedSelectedCases]);

  // Filtered battles in lobby
  const filteredBattles = useMemo(() => {
    return battles
      .filter((b) => {
        if (lobbyFilter === 'open' && b.status !== 'open') return false;
        if (lobbyFilter === 'in-progress' && b.status !== 'in-progress') return false;
        if (affordableOnly && b.totalCostPerPlayer > user.balanceDls) return false;
        return true;
      })
      .sort((a, b) => {
        if (lobbySort === 'newest') return b.createdAt - a.createdAt;
        if (lobbySort === 'oldest') return a.createdAt - b.createdAt;
        if (lobbySort === 'price-desc') return b.totalCostPerPlayer - a.totalCostPerPlayer;
        return a.totalCostPerPlayer - b.totalCostPerPlayer;
      });
  }, [battles, lobbyFilter, affordableOnly, lobbySort, user.balanceDls]);

  // =========================================================================
  // ACTION: Create & Launch Battle
  // =========================================================================
  const handleCreateBattle = async () => {
    if (orderedSelectedCases.length === 0) {
      showToast('Please add at least 1 case for the battle.', 'error', 'No Cases');
      return;
    }
    if (!checkCanPlayGame('casebattles', 'Case Battles')) return;
    if (totalBattleCost <= 0) return;
    const start=await fetch('/api/games/start',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({gameId:'case-battles',betDls:totalBattleCost,caseIds:orderedSelectedCases.map(c=>c.id)})}).then(r=>r.json()).catch(()=>null);
    if(!start?.ok||!start.roundId){showToast(start?.error||'Server battle unavailable','error','Case Battles');return;}
    const resolved=await fetch('/api/games/resolve',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({roundId:start.roundId,action:{final:true}})}).then(r=>r.json()).catch(()=>null);
    if(!resolved?.ok){showToast(resolved?.error||'Battle settlement failed','error','Case Battles');return;}
    sound.playClick();

    // Create User Player (Real)
    const userPlayer: BattlePlayer = {
      id: user.username || 'You',
      name: user.username || 'You',
      avatar: '👤',
      isBot: false,
      isUser: true,
      unboxedItems: [],
      totalValue: 0,
    };

    const newBattle: BattleInstance = {
      id: `battle_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      mode: crazyMode ? 'crazy' : createMode,
      playerConfig: createConfig,
      cases: orderedSelectedCases,
      players: [userPlayer],
      totalCostPerPlayer: totalBattleCost,
      totalPot: totalBattleCost * 2,
      status: 'finished',
      createdAt: Date.now(),
      jackpotMode,
      crazyMode,
      terminalMode,
      biggestPull,
      fastSpin: fastSpinMode,
      bigPullAnimation,
      isPrivate: privateMode,
    };

    setBattles((prev) => {
      const updated = [newBattle, ...prev];
      try {
        localStorage.setItem('supreme_case_battles', JSON.stringify(updated));
      } catch {}
      return updated;
    });

    showToast(resolved.result?.outcome==='win' ? 'Server battle won! Settlement completed.' : 'Server battle lost. Settlement completed.', resolved.result?.outcome==='win'?'success':'info', 'Case Battle');
    setView('lobby');
  };

  // Join an open battle (Real player)
  const handleJoinBattle = (battle: BattleInstance) => {
    showToast('Client-side battle joining is disabled until server matchmaking is implemented.', 'warning', 'Server Authority');
    return;
    /*

    sound.playClick();

    const userPlayer: BattlePlayer = {
      id: user.username || 'Player 2',
      name: user.username || 'Player 2',
      avatar: '👤',
      isBot: false,
      isUser: true,
      unboxedItems: [],
      totalValue: 0,
    };

    const updatedPlayers = [...battle.players, userPlayer];
    const isFull = updatedPlayers.length >= (battle.playerConfig === '1v1' ? 2 : 3);

    const updatedBattle: BattleInstance = {
      ...battle,
      players: updatedPlayers,
      status: isFull ? 'in-progress' : 'open',
    };

    setBattles((prev) => {
      const updated = prev.map((b) => (b.id === battle.id ? updatedBattle : b));
      try {
        localStorage.setItem('supreme_case_battles', JSON.stringify(updated));
      } catch {}
      return updated;
    });

    if (isFull) {
      startArenaBattle(updatedBattle);
    } else {
      showToast('Joined battle! Waiting for remaining players.', 'success', 'Joined Battle');
    }
  }; */

  // Cancel an open battle created by the user
  const handleCancelBattle = (battle: BattleInstance) => {
    sound.playClick();
    awardPayout(battle.totalCostPerPlayer, 'Cancelled Case Battle', 1, battle.totalCostPerPlayer);
    setBattles((prev) => {
      const updated = prev.filter((b) => b.id !== battle.id);
      try {
        localStorage.setItem('supreme_case_battles', JSON.stringify(updated));
      } catch {}
      return updated;
    });
    showToast('Battle cancelled and bet refunded.', 'info', 'Battle Cancelled');
  };

  // Call bots to immediately fill empty slots and start battle
  const handleCallBotsAndStart = (battle: BattleInstance) => {
    sound.playClick();
    const maxSlots = battle.playerConfig === '1v1' ? 2 : battle.playerConfig === '1v1v1' ? 3 : battle.playerConfig === '1v1v1v1' ? 4 : 2;
    const needed = maxSlots - battle.players.length;
    if (needed <= 0) {
      startArenaBattle(battle);
      return;
    }

    const botNames = ['ShadowBot 🤖', 'VortexBot 🤖', 'GrowMaster 🤖', 'PixelPro 🤖'];
    const botAvatars = ['🤖', '⚡', '👑', '🔥'];
    const newBots: BattlePlayer[] = [];

    for (let i = 0; i < needed; i++) {
      newBots.push({
        id: `bot_${Date.now()}_${i}`,
        name: botNames[(battle.players.length + i) % botNames.length],
        avatar: botAvatars[(battle.players.length + i) % botAvatars.length],
        isBot: true,
        isUser: false,
        unboxedItems: [],
        totalValue: 0,
      });
    }

    const fullBattle: BattleInstance = {
      ...battle,
      players: [...battle.players, ...newBots],
      status: 'in-progress',
    };

    setBattles((prev) => prev.map((b) => (b.id === battle.id ? fullBattle : b)));
    startArenaBattle(fullBattle);
  };

  // =========================================================================
  // BATTLE ARENA ENGINE: Deterministic CS2 Simultaneous Spinning
  // =========================================================================
  const ARENA_WIN_INDEX = 45;

  const startArenaBattle = (battle: BattleInstance) => {
    // 1. Precompute all rounds deterministically
    const precomputedRounds: { [roundIdx: number]: { [playerIdx: number]: CaseItemDrop } } = {};
    const playerTotals: { [pIdx: number]: number } = {};
    const playerItems: { [pIdx: number]: CaseItemDrop[] } = {};

    battle.players.forEach((_, pIdx) => {
      playerTotals[pIdx] = 0;
      playerItems[pIdx] = [];
    });

    battle.cases.forEach((cCase, rIdx) => {
      precomputedRounds[rIdx] = {};
      const items = (cCase && cCase.items && cCase.items.length > 0) ? cCase.items : STARTER_BATTLE_CASES[0].items;
      const totalWeight = items.reduce((acc, it) => acc + (it.chance || 1), 0);

      battle.players.forEach((_, pIdx) => {
        let rand = Math.random() * totalWeight;
        let winnerItem = items[0];
        for (const it of items) {
          if (rand <= (it.chance || 1)) {
            winnerItem = it;
            break;
          }
          rand -= (it.chance || 1);
        }
        precomputedRounds[rIdx][pIdx] = winnerItem;
        playerTotals[pIdx] = Number((playerTotals[pIdx] + winnerItem.price).toFixed(2));
        playerItems[pIdx].push(winnerItem);
      });
    });

    // 2. Determine winner
    let finalWinner = battle.players[0];
    if (battle.crazyMode) {
      let minVal = Infinity;
      battle.players.forEach((p, pIdx) => {
        if (playerTotals[pIdx] < minVal) {
          minVal = playerTotals[pIdx];
          finalWinner = p;
        }
      });
    } else if (battle.biggestPull) {
      let maxSingle = -1;
      battle.players.forEach((p, pIdx) => {
        playerItems[pIdx].forEach((it) => {
          if (it.price > maxSingle) {
            maxSingle = it.price;
            finalWinner = p;
          }
        });
      });
    } else {
      let maxVal = -1;
      battle.players.forEach((p, pIdx) => {
        if (playerTotals[pIdx] > maxVal) {
          maxVal = playerTotals[pIdx];
          finalWinner = p;
        }
      });
    }

    // Total loot won across all players in the battle
    const totalLootWon = Number(Object.values(playerTotals).reduce((sum, val) => sum + val, 0).toFixed(2));

    precomputedRoundsRef.current = precomputedRounds;
    precomputedWinnerRef.current = { winner: finalWinner, totalLootWon };

    // Save pending battle to localStorage so reload/disconnect NEVER loses winnings!
    try {
      localStorage.setItem(
        'supreme_active_battle_pending',
        JSON.stringify({
          battleId: battle.id,
          precomputedWinnerId: finalWinner.id,
          precomputedWinnerIsUser: finalWinner.isUser,
          precomputedLootTotal: totalLootWon,
          payoutAwarded: false,
          timestamp: Date.now(),
        })
      );
    } catch {}

    setActiveBattle(battle);
    setCurrentRoundIdx(0);
    setArenaSpinning(false);
    setArenaFinished(false);
    setBattleWinner(null);
    setArenaOffsets({});
    setArenaTransitions({});
    setView('arena');

    // Run first round after short countdown
    setTimeout(() => {
      runBattleRound(battle, 0);
    }, 1000);
  };

  const runBattleRound = (battle: BattleInstance, roundIdx: number) => {
    if (roundIdx >= battle.cases.length) {
      finishBattle(battle);
      return;
    }

    setCurrentRoundIdx(roundIdx);
    const currentCase = battle.cases[roundIdx];
    const items = (currentCase && currentCase.items && currentCase.items.length > 0) ? currentCase.items : STARTER_BATTLE_CASES[0].items;

    const roundWinners: { [playerIdx: number]: CaseItemDrop } = {};
    const reels: { [playerIdx: number]: CaseItemDrop[] } = {};
    const resetOffsets: { [pIdx: number]: number } = {};
    const resetTransitions: { [pIdx: number]: string } = {};

    battle.players.forEach((_, pIdx) => {
      const winner = precomputedRoundsRef.current[roundIdx]?.[pIdx] || items[0];
      roundWinners[pIdx] = winner;

      // Build 60-card reel strip
      const strip: CaseItemDrop[] = [];
      for (let i = 0; i < 60; i++) {
        if (i === ARENA_WIN_INDEX) {
          strip.push(winner);
        } else {
          strip.push(items[Math.floor(Math.random() * items.length)]);
        }
      }
      reels[pIdx] = strip;
      resetOffsets[pIdx] = 0;
      resetTransitions[pIdx] = 'none';
    });

    setArenaReels(reels);
    setRoundWinnerItems(roundWinners);
    setArenaOffsets(resetOffsets);
    setArenaTransitions(resetTransitions);
    setArenaSpinning(true);

    const spinDuration = battle.fastSpin ? 2200 : 4500;
    const cardPitch = 104; // 96px width + 8px gap
    const cardWidth = 96;

    // Trigger hardware CSS transition
    setTimeout(() => {
      sound.playCaseRoll();
      const targetOffsets: { [pIdx: number]: number } = {};
      const targetTransitions: { [pIdx: number]: string } = {};

      battle.players.forEach((_, pIdx) => {
        const jitter = (Math.random() - 0.5) * (cardWidth * 0.5);
        targetOffsets[pIdx] = ARENA_WIN_INDEX * cardPitch + cardWidth / 2 - 160 + jitter;
        targetTransitions[pIdx] = `transform ${spinDuration}ms cubic-bezier(0.12, 0.8, 0.15, 1)`;
      });

      setArenaTransitions(targetTransitions);
      setArenaOffsets(targetOffsets);
    }, 40);

    // After spin finishes
    setTimeout(() => {
      setArenaSpinning(false);
      sound.playWin();

      // Update players unboxed items & total value
      const updatedPlayers = battle.players.map((p, pIdx) => {
        const itemWon = roundWinners[pIdx];
        const newUnboxed = [...p.unboxedItems, itemWon];
        const newTotal = Number((p.totalValue + itemWon.price).toFixed(2));
        return {
          ...p,
          unboxedItems: newUnboxed,
          totalValue: newTotal,
        };
      });

      const updatedBattle = { ...battle, players: updatedPlayers };
      setActiveBattle(updatedBattle);

      // Next round after 2 seconds reveal delay
      setTimeout(() => {
        runBattleRound(updatedBattle, roundIdx + 1);
      }, 2000);
    }, spinDuration + 100);
  };

  const finishBattle = (battle: BattleInstance) => {
    setArenaFinished(true);

    const { winner, totalLootWon } = precomputedWinnerRef.current || {
      winner: battle.players[0],
      totalLootWon: Number(battle.players.reduce((sum, p) => sum + p.totalValue, 0).toFixed(2)),
    };

    setBattleWinner(winner);

    // Check if recovery already awarded it
    let alreadyAwarded = false;
    try {
      const pendingStr = localStorage.getItem('supreme_active_battle_pending');
      if (pendingStr) {
        const parsed = JSON.parse(pendingStr);
        if (parsed.battleId === battle.id && parsed.payoutAwarded) {
          alreadyAwarded = true;
        }
      }
    } catch {}

    // If current user is the winner, award total loot won!
    // E.g. When paying 200 DL and getting 5 DL in loot, awards 5 DL (NOT 205 DL!)
    if (winner.isUser) {
      if (!alreadyAwarded) {
        sound.playCashout();
        const mult = battle.totalCostPerPlayer > 0 ? Number((totalLootWon / battle.totalCostPerPlayer).toFixed(2)) : 1;
        // Server already settled the real-money payout. Never credit from client state.
        showToast(`🏆 Victory! You won ${totalLootWon} DLS in unboxed items!`, 'success', 'Battle Won!');
        try {
          localStorage.setItem(
            'supreme_active_battle_pending',
            JSON.stringify({
              battleId: battle.id,
              precomputedWinnerId: winner.id,
              precomputedWinnerIsUser: true,
              precomputedLootTotal: totalLootWon,
              payoutAwarded: true,
            })
          );
        } catch {}
      }
    } else {
      sound.playExplosion();
      showToast(`${winner.name} won the battle with ${winner.totalValue} DLS total.`, 'info', 'Battle Finished');
    }
  };

  // =========================================================================
  // VIEW 1: CASE BATTLES LOBBY (Matches media_1789565632608.png)
  // =========================================================================
  if (view === 'lobby') {
    return (
      <div className="flex flex-col gap-6 max-w-7xl mx-auto animate-in fade-in duration-200">
        {/* Top Bar Navigation */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#0d1420] border border-[#1a2638] text-xs font-bold text-slate-300 hover:text-white hover:border-[#2b3e5c] transition cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Back to Games</span>
            </button>

            {/* Switch between Mystery Cases and Case Battles */}
            <div className="flex items-center bg-[#070c14] p-1 rounded-2xl border border-[#1b283d]">
              <button
                onClick={() => setActiveGame('cases')}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl font-bold text-xs text-slate-400 hover:text-white transition cursor-pointer"
              >
                <Gift className="w-4 h-4 text-purple-400" />
                <span>Mystery Cases</span>
              </button>
              <button
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl font-black text-xs bg-[#0074e4] text-white shadow-lg shadow-[#0074e4]/25 cursor-default"
              >
                <Swords className="w-4 h-4 text-amber-400" />
                <span>Case Battles</span>
              </button>
            </div>

            {/* Battles vs Blueprints Tabs */}
            <div className="flex items-center bg-[#070c14] p-1 rounded-2xl border border-[#1b283d]">
              <button
                onClick={() => setActiveTab('battles')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl font-black text-xs transition cursor-pointer ${
                  activeTab === 'battles'
                    ? 'bg-[#18263e] text-white shadow border border-[#273d62]'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Swords className="w-3.5 h-3.5" />
                <span>Battles</span>
              </button>

              <button
                onClick={() => setActiveTab('blueprints')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl font-black text-xs transition cursor-pointer ${
                  activeTab === 'blueprints'
                    ? 'bg-[#18263e] text-white shadow border border-[#273d62]'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Blueprints</span>
              </button>
            </div>
          </div>

          {/* Primary Create Case Battle Action Button */}
          <button
            onClick={() => {
              sound.playClick();
              setView('create');
            }}
            className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-gradient-to-r from-[#0074e4] to-[#0284c7] hover:brightness-110 text-white font-black text-xs uppercase tracking-wider shadow-lg shadow-[#0074e4]/30 transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Create Case Battle</span>
          </button>
        </div>

        {/* Title & Lobby Stats Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#182438] pb-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">Case Battles</h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Unbox simultaneous cases against players or bots · Winner takes all!
            </p>
          </div>

          <div className="flex items-center gap-4 text-xs font-bold text-slate-400">
            <div className="flex items-center gap-1.5 bg-[#0a121e] px-3 py-1.5 rounded-xl border border-[#182438]">
              <Users className="w-4 h-4 text-[#38bdf8]" />
              <span>8 In Lobby</span>
            </div>
            <div className="flex items-center gap-1.5 bg-[#0a121e] px-3 py-1.5 rounded-xl border border-[#182438]">
              <Swords className="w-4 h-4 text-emerald-400" />
              <span>{battles.filter((b) => b.status === 'in-progress').length} In Battles</span>
            </div>
          </div>
        </div>

        {/* Controls Bar: All / Open / In-progress, Affordable Switch, Sort Dropdown */}
        <div className="flex flex-wrap items-center justify-between gap-4 bg-[#0a101a] border border-[#18253a] rounded-2xl p-3.5 shadow-xl">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setLobbyFilter('all')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                lobbyFilter === 'all'
                  ? 'bg-[#152338] text-white border border-[#233a5c]'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              All {battles.length}
            </button>
            <button
              onClick={() => setLobbyFilter('open')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                lobbyFilter === 'open'
                  ? 'bg-[#152338] text-white border border-[#233a5c]'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Open {battles.filter((b) => b.status === 'open').length}
            </button>
            <button
              onClick={() => setLobbyFilter('in-progress')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                lobbyFilter === 'in-progress'
                  ? 'bg-[#152338] text-white border border-[#233a5c]'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              In-progress {battles.filter((b) => b.status === 'in-progress').length}
            </button>
          </div>

          <div className="flex items-center gap-4">
            {/* Affordable Switch */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-400">Affordable</span>
              <button
                type="button"
                onClick={() => setAffordableOnly(!affordableOnly)}
                className={`w-10 h-5 rounded-full p-0.5 transition-colors cursor-pointer ${
                  affordableOnly ? 'bg-[#0074e4]' : 'bg-[#1e2e44]'
                }`}
              >
                <div
                  className={`w-4 h-4 rounded-full bg-white transition-transform ${
                    affordableOnly ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Sort Dropdown */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-400">Sort By:</span>
              <select
                value={lobbySort}
                onChange={(e) => setLobbySort(e.target.value as any)}
                className="bg-[#070c14] border border-[#1b283d] rounded-xl px-3 py-1.5 text-xs font-bold text-white outline-none cursor-pointer"
              >
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
                <option value="price-desc">Cost: High → Low</option>
                <option value="price-asc">Cost: Low → High</option>
              </select>
            </div>
          </div>
        </div>

        {/* Battles List Cards */}
        {filteredBattles.length === 0 ? (
          <div className="bg-[#0b121e] border border-[#19263a] rounded-3xl p-16 text-center flex flex-col items-center gap-4 shadow-2xl">
            <div className="w-16 h-16 rounded-2xl bg-[#101b2d] flex items-center justify-center text-slate-500">
              <Swords className="w-8 h-8 text-slate-400" />
            </div>
            <div>
              <h3 className="text-base font-black text-white">There are no active battles right now, create one!</h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto mt-1">
                Pick your favorite cases, invite players or call realistic bots to battle round by round.
              </p>
            </div>
            <button
              onClick={() => setView('create')}
              className="px-6 py-3 rounded-2xl bg-[#0074e4] hover:bg-[#0085ff] text-white text-xs font-black uppercase tracking-wider transition shadow-lg shadow-[#0074e4]/30 cursor-pointer"
            >
              Create Case Battle
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {filteredBattles.map((battle) => {
              const userInBattle = battle.players.some((p) => p.isUser);

              return (
                <div
                  key={battle.id}
                  className="bg-[#0b121e] border border-[#1a283e] hover:border-[#223959] rounded-2xl p-4 sm:p-5 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 transition shadow-lg"
                >
                  {/* Left: Cases Thumbnails Row & Rounds */}
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="flex items-center -space-x-4 shrink-0">
                      {battle.cases.slice(0, 5).map((c, i) => (
                        <div
                          key={i}
                          className="w-14 h-14 rounded-xl bg-[#070c14] border border-[#1b283d] p-1 flex items-center justify-center shadow-md relative group"
                        >
                          <img src={c?.image || '/assets/cases.png'} alt={c?.name || 'Case'} className="w-full h-full object-contain" />
                        </div>
                      ))}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-white truncate">
                          {battle.cases.length} Rounds ({battle.cases[0]?.name || 'Mystery Case'})
                        </span>
                        {battle.crazyMode && (
                          <span className="text-[9px] font-black uppercase bg-purple-500/20 text-purple-400 border border-purple-500/30 px-2 py-0.5 rounded">
                            Crazy Mode
                          </span>
                        )}
                        {battle.jackpotMode && (
                          <span className="text-[9px] font-black uppercase bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded">
                            Jackpot
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 text-xs text-slate-400 mt-1 font-mono">
                        <span>Cost:</span>
                        <CurrencyDisplay amountDls={battle.totalCostPerPlayer} iconClassName="w-3.5 h-3.5" />
                        <span>·</span>
                        <span className="text-emerald-400 font-bold">
                          Pot: {battle.totalPot} DLS
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Center: Players & Slots */}
                  <div className="flex items-center gap-3 justify-center">
                    {battle.players.map((p, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#070c14] border border-[#1b283d]"
                        title={p.name}
                      >
                        <span className="text-base">{p.avatar}</span>
                        <span className="text-xs font-bold text-white max-w-[90px] truncate">{p.name}</span>
                      </div>
                    ))}

                    {/* Empty Slots (Safely guarded against negative lengths) */}
                    {battle.status === 'open' &&
                      Array.from({
                        length: Math.max(
                          0,
                          (battle.playerConfig === '1v1'
                            ? 2
                            : battle.playerConfig === '1v1v1'
                            ? 3
                            : battle.playerConfig === '1v1v1v1'
                            ? 4
                            : 2) - battle.players.length
                        ),
                      }).map((_, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#070c14]/50 border border-dashed border-[#1f2d42] text-slate-500 text-xs font-bold"
                        >
                          <Users className="w-3.5 h-3.5" />
                          <span>Empty</span>
                        </div>
                      ))}
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-center gap-2 justify-end shrink-0">
                    {battle.status === 'open' && !userInBattle && (
                      <button
                        onClick={() => handleJoinBattle(battle)}
                        className="px-4 py-2.5 rounded-xl bg-[#0074e4] hover:bg-[#0085ff] text-white text-xs font-black uppercase tracking-wider transition cursor-pointer shadow-md shadow-[#0074e4]/30"
                      >
                        Join Battle
                      </button>
                    )}

                    {battle.status === 'open' && userInBattle && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleCallBotsAndStart(battle)}
                          className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-black uppercase transition cursor-pointer shadow-md shadow-emerald-600/30"
                          title="Fill empty slots with bots and start battle immediately"
                        >
                          <Bot className="w-3.5 h-3.5" />
                          <span>Call Bots & Play</span>
                        </button>
                        <button
                          onClick={() => handleCancelBattle(battle)}
                          className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-300 text-xs font-black uppercase transition cursor-pointer"
                          title="Cancel battle and refund your bet"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>Cancel</span>
                        </button>
                      </div>
                    )}

                    {battle.status === 'in-progress' && (
                      <button
                        onClick={() => {
                          setActiveBattle(battle);
                          setView('arena');
                        }}
                        className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 text-xs font-black uppercase transition cursor-pointer"
                      >
                        <Play className="w-3.5 h-3.5" />
                        <span>Watch Battle</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // VIEW 2: CREATE CASE BATTLE (Matches media_1789565632571.png)
  // =========================================================================
  if (view === 'create') {
    return (
      <div className="flex flex-col gap-6 max-w-7xl mx-auto animate-in fade-in duration-200">
        {/* Top Header: Back, Save as Blueprint, Create Battle */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#182438]">
          <button
            onClick={() => {
              sound.playClick();
              setView('lobby');
            }}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#0d1420] border border-[#1a2638] text-xs font-bold text-slate-300 hover:text-white hover:border-[#2b3e5c] transition cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Create Case Battle</span>
          </button>

          <div className="flex items-center gap-3">
            <button
              onClick={() => showToast('Blueprint configuration saved to local storage.', 'success', 'Blueprint Saved')}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0f1828] border border-[#20324c] hover:border-[#0074e4] text-slate-300 hover:text-white text-xs font-bold transition cursor-pointer"
            >
              <Layers className="w-3.5 h-3.5 text-[#38bdf8]" />
              <span>Save as blueprint</span>
            </button>

            <button
              onClick={handleCreateBattle}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#0074e4] hover:bg-[#0085ff] text-white text-xs font-black uppercase tracking-wider transition shadow-lg shadow-[#0074e4]/30 cursor-pointer"
            >
              <span>Create Case Battle</span>
              <CurrencyDisplay amountDls={totalBattleCost} iconClassName="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Game Mode Selection (Normal, Bonus Mode, Shared Mode) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Normal Mode */}
          <button
            type="button"
            onClick={() => setCreateMode('normal')}
            className={`p-5 rounded-2xl border text-left flex items-start gap-4 transition cursor-pointer ${
              createMode === 'normal'
                ? 'bg-[#0f233f] border-[#0074e4] ring-1 ring-[#0074e4]'
                : 'bg-[#0b121e] border-[#182438] hover:border-[#223959]'
            }`}
          >
            <div className="w-10 h-10 rounded-xl bg-[#14294b] flex items-center justify-center text-[#38bdf8] shrink-0">
              <Trophy className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h3 className="text-sm font-black text-white">Normal</h3>
              <p className="text-xs text-slate-400 mt-0.5">Highest total value unboxed wins</p>
            </div>
          </button>

          {/* Bonus Mode */}
          <button
            type="button"
            onClick={() => setCreateMode('bonus')}
            className={`p-5 rounded-2xl border text-left flex items-start gap-4 transition cursor-pointer relative ${
              createMode === 'bonus'
                ? 'bg-[#0f233f] border-[#0074e4] ring-1 ring-[#0074e4]'
                : 'bg-[#0b121e] border-[#182438] hover:border-[#223959]'
            }`}
          >
            <div className="w-10 h-10 rounded-xl bg-[#2a1438] flex items-center justify-center text-pink-400 shrink-0">
              <Gift className="w-5 h-5 text-pink-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-black text-white">Bonus Mode</h3>
                <span className="text-[9px] font-black uppercase bg-pink-500/20 text-pink-400 border border-pink-500/30 px-1.5 py-0.2 rounded">
                  NEW
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">Unbox with a bonus twist</p>
            </div>
          </button>

          {/* Shared Mode */}
          <button
            type="button"
            onClick={() => setCreateMode('shared')}
            className={`p-5 rounded-2xl border text-left flex items-start gap-4 transition cursor-pointer ${
              createMode === 'shared'
                ? 'bg-[#0f233f] border-[#0074e4] ring-1 ring-[#0074e4]'
                : 'bg-[#0b121e] border-[#182438] hover:border-[#223959]'
            }`}
          >
            <div className="w-10 h-10 rounded-xl bg-[#14294b] flex items-center justify-center text-[#38bdf8] shrink-0">
              <Users className="w-5 h-5 text-[#38bdf8]" />
            </div>
            <div>
              <h3 className="text-sm font-black text-white">Shared Mode</h3>
              <p className="text-xs text-slate-400 mt-0.5">Share the winnings equally</p>
            </div>
          </button>
        </div>

        {/* Two-Column Stage: Left = Add Cases, Right = Add Players & Modifiers */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Add Cases Rounds */}
          <div className="lg:col-span-7 bg-[#0b121e] border border-[#18253a] rounded-3xl p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#162338]">
              <div className="flex items-center gap-2">
                <Gift className="w-4 h-4 text-[#38bdf8]" />
                <h3 className="text-sm font-black text-white uppercase tracking-wider">
                  Add Cases ({orderedSelectedCases.length} ROUNDS)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setCreateSelectedCases({})}
                className="text-xs text-slate-500 hover:text-red-400 font-bold transition"
              >
                Clear All
              </button>
            </div>

            {/* Cases Rounds Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {/* Add Case Card */}
              <button
                type="button"
                onClick={() => setCaseModalOpen(true)}
                className="min-h-[160px] rounded-2xl border border-dashed border-[#1f3048] hover:border-[#0074e4] hover:bg-[#0f1b2d] flex flex-col items-center justify-center gap-2.5 transition cursor-pointer p-4 group"
              >
                <div className="w-10 h-10 rounded-full bg-[#132238] group-hover:bg-[#0074e4] text-[#38bdf8] group-hover:text-white flex items-center justify-center transition">
                  <Plus className="w-5 h-5" />
                </div>
                <span className="text-xs font-black text-slate-300 group-hover:text-white uppercase tracking-wider">
                  + Add Case
                </span>
              </button>

              {/* Selected Cases Cards */}
              {orderedSelectedCases.map((c, idx) => (
                <div
                  key={idx}
                  className="rounded-2xl bg-[#070c14] border border-[#1a283e] p-3 flex flex-col items-center text-center relative group"
                >
                  <span className="absolute top-2 left-2 text-[9px] font-mono font-black text-slate-500 bg-[#0f1a28] px-1.5 py-0.5 rounded">
                    R{idx + 1}
                  </span>

                  <button
                    onClick={() => {
                      setCreateSelectedCases((prev) => {
                        const copy = { ...prev };
                        if (copy[c.id] > 1) copy[c.id]--;
                        else delete copy[c.id];
                        return copy;
                      });
                    }}
                    className="absolute top-2 right-2 p-1 rounded text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>

                  <div className="w-16 h-16 flex items-center justify-center my-2">
                    <img src={c.image} alt={c.name} className="w-full h-full object-contain filter drop-shadow" />
                  </div>

                  <span className="text-xs font-bold text-white truncate w-full">{c.name}</span>
                  <div className="mt-1">
                    <CurrencyDisplay amountDls={c.price} iconClassName="w-3 h-3" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right Column: Add Players, Call Bots, Modifiers, More */}
          <div className="lg:col-span-5 flex flex-col gap-4">
            {/* Add Players Box (Matches media_1789565632566.png) */}
            <div className="bg-[#0b121e] border border-[#18253a] rounded-3xl p-5 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-2">
                  <Users className="w-4 h-4 text-[#38bdf8]" />
                  <span>Add Players</span>
                </label>
              </div>

              {/* Player Config Selector */}
              <select
                value={createConfig}
                onChange={(e) => setCreateConfig(e.target.value as any)}
                className="w-full bg-[#070c14] border border-[#1b283d] rounded-xl px-3.5 py-2.5 text-xs font-black text-white outline-none focus:border-[#0074e4] transition cursor-pointer"
              >
                <option value="1v1">👤 ⚔ 👤 1v1 (2 Players)</option>
                <option value="1v1v1">👤 ⚔ 👤 ⚔ 👤 1v1v1 (3 Players)</option>
                <option value="1v1v1v1">👤 ⚔ 👤 ⚔ 👤 ⚔ 👤 1v1v1v1 (4 Players)</option>
                <option value="1v1v1v1v1">👤 ⚔ 👤 ⚔ 👤 ⚔ 👤 ⚔ 👤 1v1v1v1v1 (5 Players)</option>
                <option value="2v2">👥 ⚔ 👥 2v2 (Team Battle)</option>
                <option value="3v3">👥 ⚔ 👥 3v3 (Team Battle)</option>
                <option value="2v2v2">👥 ⚔ 👥 ⚔ 👥 2v2v2 (3 Teams)</option>
              </select>

              {/* Slots List */}
              <div className="space-y-2">
                {/* Slot 1: You */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-[#0f2138] border border-[#1a385f]">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-sm">
                      👤
                    </div>
                    <div>
                      <span className="text-xs font-black text-white block">Slot 1</span>
                      <span className="text-[10px] text-emerald-400 font-bold">You (Ready)</span>
                    </div>
                  </div>
                  <Check className="w-4 h-4 text-emerald-400" />
                </div>

                {/* Slot 2: Opponent / Bot */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-[#070c14] border border-[#19263a]">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[#141f30] text-slate-400 flex items-center justify-center font-bold text-sm">
                      {callAllBots ? '🤖' : '👥'}
                    </div>
                    <div>
                      <span className="text-xs font-black text-white block">Slot 2</span>
                      <span className="text-[10px] text-slate-400">
                        {callAllBots ? 'VoidBot_Rex (Auto-join)' : 'Empty (Waiting for player)'}
                      </span>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono text-slate-500">
                    {callAllBots ? 'Bot Ready' : 'Open'}
                  </span>
                </div>
              </div>

              {/* Call All Bots Toggle Switch */}
              <div className="flex items-center justify-between pt-2 border-t border-[#162338]">
                <div className="flex items-center gap-2">
                  <Bot className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-bold text-slate-300">Call all bots</span>
                </div>
                <button
                  type="button"
                  onClick={() => setCallAllBots(!callAllBots)}
                  className={`w-11 h-6 rounded-full p-0.5 transition-colors cursor-pointer ${
                    callAllBots ? 'bg-[#0074e4]' : 'bg-[#1b283d]'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-white transition-transform ${
                      callAllBots ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Modifiers Box (Matches media_1789565632565.png) */}
            <div className="bg-[#0b121e] border border-[#18253a] rounded-3xl p-5 shadow-xl space-y-3">
              <span className="text-xs font-black text-white uppercase tracking-wider block">
                Modifiers
              </span>

              {/* Jackpot Mode */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-[#070c14] border border-[#19263a]">
                <div className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-bold text-slate-300">Jackpot Mode</span>
                  <Info className="w-3 h-3 text-slate-500" />
                </div>
                <button
                  type="button"
                  onClick={() => setJackpotMode(!jackpotMode)}
                  className={`w-10 h-5 rounded-full p-0.5 transition-colors cursor-pointer ${
                    jackpotMode ? 'bg-[#0074e4]' : 'bg-[#1b283d]'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white transition-transform ${
                      jackpotMode ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Crazy Mode */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-[#070c14] border border-[#19263a]">
                <div className="flex items-center gap-2">
                  <RotateCcw className="w-4 h-4 text-purple-400" />
                  <span className="text-xs font-bold text-slate-300">Crazy Mode (Lowest Wins)</span>
                  <Info className="w-3 h-3 text-slate-500" />
                </div>
                <button
                  type="button"
                  onClick={() => setCrazyMode(!crazyMode)}
                  className={`w-10 h-5 rounded-full p-0.5 transition-colors cursor-pointer ${
                    crazyMode ? 'bg-[#0074e4]' : 'bg-[#1b283d]'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white transition-transform ${
                      crazyMode ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Terminal Mode */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-[#070c14] border border-[#19263a]">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-cyan-400" />
                  <span className="text-xs font-bold text-slate-300">Terminal Mode</span>
                  <Info className="w-3 h-3 text-slate-500" />
                </div>
                <button
                  type="button"
                  onClick={() => setTerminalMode(!terminalMode)}
                  className={`w-10 h-5 rounded-full p-0.5 transition-colors cursor-pointer ${
                    terminalMode ? 'bg-[#0074e4]' : 'bg-[#1b283d]'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white transition-transform ${
                      terminalMode ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Biggest Pull */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-[#070c14] border border-[#19263a]">
                <div className="flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-bold text-slate-300">Biggest Pull</span>
                  <Info className="w-3 h-3 text-slate-500" />
                </div>
                <button
                  type="button"
                  onClick={() => setBiggestPull(!biggestPull)}
                  className={`w-10 h-5 rounded-full p-0.5 transition-colors cursor-pointer ${
                    biggestPull ? 'bg-[#0074e4]' : 'bg-[#1b283d]'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white transition-transform ${
                      biggestPull ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* More Box (Matches media_1789565632565.png) */}
            <div className="bg-[#0b121e] border border-[#18253a] rounded-3xl p-5 shadow-xl space-y-3">
              <span className="text-xs font-black text-white uppercase tracking-wider block">
                More Options
              </span>

              {/* Fast Spin */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-[#070c14] border border-[#19263a]">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-yellow-400" />
                  <span className="text-xs font-bold text-slate-300">Fast Spin</span>
                </div>
                <button
                  type="button"
                  onClick={() => setFastSpinMode(!fastSpinMode)}
                  className={`w-10 h-5 rounded-full p-0.5 transition-colors cursor-pointer ${
                    fastSpinMode ? 'bg-[#0074e4]' : 'bg-[#1b283d]'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white transition-transform ${
                      fastSpinMode ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Big Pull Animation */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-[#070c14] border border-[#19263a]">
                <div className="flex items-center gap-2">
                  <Star className="w-4 h-4 text-cyan-400" />
                  <span className="text-xs font-bold text-slate-300">Big Pull Animation</span>
                </div>
                <button
                  type="button"
                  onClick={() => setBigPullAnimation(!bigPullAnimation)}
                  className={`w-10 h-5 rounded-full p-0.5 transition-colors cursor-pointer ${
                    bigPullAnimation ? 'bg-[#0074e4]' : 'bg-[#1b283d]'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white transition-transform ${
                      bigPullAnimation ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* SELECT CASES MODAL (Matches media_1789565632612.png) */}
        {caseModalOpen && (
          <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-[110] flex items-center justify-center p-4">
            <div className="bg-[#0b121e] border border-[#1b2b42] rounded-3xl p-6 max-w-4xl w-full shadow-2xl space-y-4 max-h-[90vh] flex flex-col">
              <div className="flex items-center justify-between pb-3 border-b border-[#182438]">
                <div>
                  <h3 className="text-base font-black text-white">Select Cases</h3>
                  <p className="text-xs text-slate-400">Add rounds of cases to this battle</p>
                </div>
                <button
                  onClick={() => setCaseModalOpen(false)}
                  className="p-1.5 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Search & Sort */}
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={caseSearch}
                    onChange={(e) => setCaseSearch(e.target.value)}
                    placeholder="Search for Case"
                    className="w-full bg-[#070c14] border border-[#1b283d] rounded-xl pl-9 pr-4 py-2 text-xs text-white outline-none focus:border-[#0074e4] transition"
                  />
                </div>
              </div>

              {/* Cases Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 overflow-y-auto pr-1 flex-1">
                {availableCases
                  .filter((c) => c.name.toLowerCase().includes(caseSearch.toLowerCase()))
                  .map((c) => {
                    const count = createSelectedCases[c.id] || 0;

                    return (
                      <div
                        key={c.id}
                        className="rounded-2xl bg-[#070c14] border border-[#1a283e] p-3 flex flex-col items-center text-center relative"
                      >
                        <div className="w-20 h-20 flex items-center justify-center my-2">
                          <img
                            src={c.image}
                            alt={c.name}
                            className="w-full h-full object-contain filter drop-shadow"
                          />
                        </div>

                        <span className="text-xs font-black text-white truncate w-full">{c.name}</span>
                        <div className="mt-1 mb-2">
                          <CurrencyDisplay amountDls={c.price} iconClassName="w-3.5 h-3.5" />
                        </div>

                        {/* Stepper: - count + */}
                        <div className="mt-auto flex items-center gap-2 bg-[#0c1422] border border-[#1e2e44] rounded-xl p-1">
                          <button
                            type="button"
                            onClick={() => {
                              setCreateSelectedCases((prev) => {
                                const copy = { ...prev };
                                if (copy[c.id] > 1) copy[c.id]--;
                                else delete copy[c.id];
                                return copy;
                              });
                            }}
                            className="w-6 h-6 rounded-lg bg-[#142034] hover:bg-[#1a2c47] text-white flex items-center justify-center font-black text-xs transition cursor-pointer"
                          >
                            -
                          </button>
                          <span className="w-6 font-mono font-black text-xs text-white text-center">
                            {count}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setCreateSelectedCases((prev) => ({
                                ...prev,
                                [c.id]: (prev[c.id] || 0) + 1,
                              }));
                            }}
                            className="w-6 h-6 rounded-lg bg-[#0074e4] hover:bg-[#0085ff] text-white flex items-center justify-center font-black text-xs transition cursor-pointer"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between pt-3 border-t border-[#182438]">
                <span className="text-xs font-bold text-slate-400">
                  Selected: <strong>{orderedSelectedCases.length} Rounds</strong> (
                  <CurrencyDisplay amountDls={totalBattleCost} iconClassName="w-3.5 h-3.5" />)
                </span>
                <button
                  onClick={() => setCaseModalOpen(false)}
                  className="px-6 py-2.5 rounded-xl bg-[#0074e4] hover:bg-[#0085ff] text-white text-xs font-black uppercase transition cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // VIEW 3: LIVE BATTLE ARENA (Simultaneous Round-by-Round Unboxing)
  // =========================================================================
  if (view === 'arena' && activeBattle) {
    const currentCase = activeBattle.cases[currentRoundIdx] || activeBattle.cases[0];

    return (
      <div className="flex flex-col gap-6 max-w-7xl mx-auto animate-in fade-in duration-200">
        {/* Arena Top Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-[#0a101a] border border-[#18253a] rounded-2xl p-4 shadow-xl">
          <button
            onClick={() => {
              sound.playClick();
              setView('lobby');
            }}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#0d1420] border border-[#1a2638] text-xs font-bold text-slate-300 hover:text-white transition cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Leave Battle</span>
          </button>

          <div className="text-center">
            <span className="text-xs font-black text-slate-400 uppercase tracking-widest block">
              Round {currentRoundIdx + 1} of {activeBattle.cases.length}
            </span>
            <h2 className="text-base font-black text-white">{currentCase.name}</h2>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <span className="text-[10px] text-slate-400 block font-bold uppercase">Total Pot</span>
              <CurrencyDisplay
                amountDls={activeBattle.totalPot}
                className="text-sm font-mono font-black text-emerald-400"
                iconClassName="w-4 h-4"
              />
            </div>
          </div>
        </div>

        {/* Players Columns Stage */}
        <div
          className={`grid gap-4 ${
            activeBattle.players.length === 2
              ? 'grid-cols-1 md:grid-cols-2'
              : 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3'
          }`}
        >
          {activeBattle.players.map((player, pIdx) => {
            const lastWon = roundWinnerItems[pIdx];

            return (
              <div
                key={player.id}
                className="bg-[#0b121e] border border-[#1a283e] rounded-3xl p-5 shadow-xl flex flex-col gap-4"
              >
                {/* Player Profile */}
                <div className="flex items-center justify-between pb-3 border-b border-[#162338]">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-[#121f33] border border-[#1b2f4c] flex items-center justify-center text-lg">
                      {player.avatar}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-black text-white">{player.name}</span>
                        {player.isUser && (
                          <span className="text-[9px] font-black uppercase bg-emerald-500/20 text-emerald-400 px-1.5 py-0.2 rounded">
                            You
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {player.unboxedItems.length} Items Won
                      </span>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 block font-bold">Unboxed</span>
                    <CurrencyDisplay
                      amountDls={player.totalValue}
                      className="text-xs font-mono font-black text-emerald-400"
                      iconClassName="w-3.5 h-3.5"
                    />
                  </div>
                </div>

                {/* CS2 Spinner Reel for this player */}
                <div className="relative rounded-2xl bg-[#070c14] border border-[#18263a] overflow-hidden p-4 min-h-[160px] flex items-center justify-center">
                  {/* Needles */}
                  <div className="absolute top-1 left-1/2 -translate-x-1/2 z-20 w-0 h-0 border-l-[7px] border-l-transparent border-r-[7px] border-r-transparent border-t-[9px] border-t-[#0084ff]" />
                  <div className="absolute bottom-1 left-1/2 -translate-x-1/2 z-20 w-0 h-0 border-l-[7px] border-l-transparent border-r-[7px] border-r-transparent border-b-[9px] border-b-[#0084ff]" />
                  <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[2px] bg-[#0084ff]/50 z-10 pointer-events-none" />

                  {/* Reel display */}
                  <div className="w-full overflow-hidden">
                    <div
                      className="flex items-center gap-2 will-change-transform"
                      style={{
                        width: 'max-content',
                        transform: `translate3d(-${arenaOffsets[pIdx] || 0}px, 0px, 0px)`,
                        transition: arenaTransitions[pIdx] || 'none',
                      }}
                    >
                      {(arenaReels[pIdx] || currentCase.items).map((it, i) => {
                        const isWonCard = i === ARENA_WIN_INDEX && !arenaSpinning && roundWinnerItems[pIdx]?.name === it.name;
                        return (
                          <div
                            key={i}
                            className={`w-24 h-28 rounded-xl bg-[#0c1422] border p-2 flex flex-col items-center justify-between shrink-0 transition-all duration-300 ${
                              isWonCard ? 'ring-2 ring-amber-400 shadow-lg shadow-amber-500/40 scale-105 z-10' : ''
                            }`}
                            style={{ borderColor: isWonCard ? '#f59e0b' : `${it.color}40` }}
                          >
                            <div className="w-12 h-12 flex items-center justify-center my-auto">
                              <img src={it.image} alt={it.name} className="w-full h-full object-contain" />
                            </div>
                            <span className="text-[9px] font-bold text-white truncate w-full text-center">
                              {it.name}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Unboxed History Row */}
                <div className="space-y-1.5 pt-2 border-t border-[#162338]">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                    Unboxed Items
                  </span>
                  <div className="flex flex-wrap items-center gap-2 max-h-32 overflow-y-auto">
                    {player.unboxedItems.map((it, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-1.5 p-1.5 rounded-xl bg-[#070c14] border border-[#1a283e]"
                        title={it.name}
                      >
                        <img src={it.image} alt={it.name} className="w-6 h-6 object-contain" />
                        <span className="text-[10px] font-mono font-bold text-emerald-400">
                          {it.price}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Battle Victory Modal */}
        {arenaFinished && battleWinner && (
          <div className="bg-[#0a1824] border-2 border-emerald-500/50 rounded-3xl p-6 shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-6 animate-in zoom-in-95 duration-300">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-amber-500 to-yellow-300 flex items-center justify-center text-3xl shadow-lg shadow-amber-500/30">
                👑
              </div>
              <div>
                <span className="text-xs font-black uppercase tracking-widest text-amber-400 block">
                  Battle Finished!
                </span>
                <h2 className="text-lg sm:text-xl font-black text-white">
                  {battleWinner.name} Won The Battle!
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Total unboxed: <strong>{battleWinner.totalValue} DLS</strong> · Winner claims full pot of{' '}
                  <strong className="text-emerald-400">{activeBattle.totalPot} DLS</strong>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <button
                onClick={() => setView('lobby')}
                className="px-6 py-3 rounded-2xl bg-[#0074e4] hover:bg-[#0085ff] text-white text-xs font-black uppercase tracking-wider transition shadow-lg shadow-[#0074e4]/30 cursor-pointer"
              >
                Back to Lobby
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
};

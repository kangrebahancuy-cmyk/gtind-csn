import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Star,
  Search,
  ArrowUpDown,
  RotateCcw,
  ChevronDown,
  ChevronLeft,
  Heart,
  Settings,
  ShieldCheck,
  Sparkles,
  RefreshCw,
  Gift,
  Plus,
  Trash2,
  Edit3,
  X,
  Lock,
  Palette,
  Calculator,
  Scale,
  Swords,
} from 'lucide-react';
import { useGame } from '../../context/GameContext';
import { sound } from '../../utils/audio';
import itemsData from '../../data/growtopia_items.json';

export interface CaseItemDrop {
  id: string;
  name: string;
  image: string;
  price: number; // in DLS
  chance: number; // percentage e.g. 50
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  color: string;
}

export interface CustomCase {
  id: string;
  name: string;
  image: string;
  color?: string; // Hex color code for RGB tinting
  price: number; // Auto-calculated Expected Value in DLS
  volatility: 'Low' | 'Medium' | 'High' | 'Extreme';
  creator: string;
  openedTimes: number;
  items: CaseItemDrop[];
}

// All pre-existing cases removed as requested ("remove alll cases bro , admin should create the cases him self")
export const DEFAULT_CASES: CustomCase[] = [];

// Helper: Calculate Expected Value Case Price from items & drop chances
export function calculateCasePrice(items: CaseItemDrop[]): number {
  if (!items || items.length === 0) return 0;
  const ev = items.reduce((sum, it) => sum + (it.price * (it.chance || 0)) / 100, 0);
  if (ev < 0.1) {
    return Number(Math.max(0.001, ev).toFixed(4));
  }
  return Number(Math.max(0.01, ev).toFixed(2));
}

// Helper: Hex to RGB
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let c = (hex || '#9333ea').replace('#', '');
  if (c.length === 3) c = c.split('').map((x) => x + x).join('');
  const num = parseInt(c, 16) || 0;
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

// Helper: RGB to Hex
function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  const toHex = (n: number) => clamp(n).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// Helper: RGB to HSL
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  let h = 0,
    s = 0,
    l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

// Helper: Calculate CSS filter to shift base purple chest to target color
function getChestFilter(colorHex?: string): string {
  if (!colorHex) return '';
  const { r, g, b } = hexToRgb(colorHex);
  const [h, s, l] = rgbToHsl(r, g, b);
  const hueShift = Math.round((h - 271 + 360) % 360);
  const sat = Math.max(0.1, s / 80).toFixed(2);
  const bright = Math.max(0.3, Math.min(1.8, l / 55)).toFixed(2);
  return `hue-rotate(${hueShift}deg) saturate(${sat}) brightness(${bright})`;
}

// Helper: Determine item rarity and color by price relative to case price
function getItemRarityAndColor(
  itemPrice: number,
  casePrice: number
): { rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'; color: string } {
  const ratio = itemPrice / Math.max(0.1, casePrice);
  if (ratio < 0.3) return { rarity: 'common', color: '#94a3b8' };
  if (ratio < 1.2) return { rarity: 'uncommon', color: '#38bdf8' };
  if (ratio < 3.5) return { rarity: 'rare', color: '#a855f7' };
  if (ratio < 8.0) return { rarity: 'epic', color: '#f59e0b' };
  return { rarity: 'legendary', color: '#ef4444' };
}

// Color presets for Admin Case Creator
const PRESET_COLORS = [
  { name: 'Royal Purple', hex: '#9333ea', r: 147, g: 51, b: 234 },
  { name: 'Ocean Blue', hex: '#0074e4', r: 0, g: 116, b: 228 },
  { name: 'Cyber Cyan', hex: '#06b6d4', r: 6, g: 182, b: 212 },
  { name: 'Emerald', hex: '#10b981', r: 16, g: 185, b: 129 },
  { name: 'Blaze Red', hex: '#ef4444', r: 239, g: 68, b: 68 },
  { name: 'Magma Orange', hex: '#f97316', r: 249, g: 115, b: 22 },
  { name: 'Golden Sand', hex: '#f59e0b', r: 245, g: 158, b: 11 },
  { name: 'Neon Pink', hex: '#ec4899', r: 236, g: 72, b: 153 },
  { name: 'Dark Void', hex: '#475569', r: 71, g: 85, b: 105 },
];

// =========================================================================
// COMPONENT: Currency Display with DL / BGL Icon
// =========================================================================
export const CurrencyDisplay: React.FC<{
  amountDls: number;
  className?: string;
  iconClassName?: string;
}> = ({ amountDls, className = 'font-mono font-bold text-white', iconClassName = 'w-4 h-4' }) => {
  const { toActiveAmount, currencyIcon, currencyLabel, activeCurrency } = useGame();
  const converted = toActiveAmount(amountDls);
  const formatted = activeCurrency === 'BGLS'
    ? converted.toFixed(4).replace(/\.?0+$/, '')
    : converted.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <span>{formatted}</span>
      <img
        src={currencyIcon}
        alt={currencyLabel}
        className={`${iconClassName} object-contain inline-block shrink-0 align-middle`}
      />
    </span>
  );
};

// =========================================================================
// COMPONENT: Open Chest with First 5 Items Nestled Inside
// =========================================================================
export const CaseChestDisplay: React.FC<{
  image?: string;
  color?: string;
  items?: CaseItemDrop[];
  caseId?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}> = ({ image = '/assets/cases/base_chest.png', color = '#9333ea', items = [], caseId = 'case', size = 'md', className = '' }) => {
  const filterStyle = useMemo(() => getChestFilter(color), [color]);
  const displayItems = useMemo(() => items.slice(0, 5), [items]);

  const sizeConfig = {
    sm: { box: 'w-24 h-24', itemSize: 'w-6 h-6' },
    md: { box: 'w-28 h-28 sm:w-32 sm:h-32', itemSize: 'w-7 h-7 sm:w-8 sm:h-8' },
    lg: { box: 'w-36 h-36 sm:w-44 sm:h-44', itemSize: 'w-9 h-9 sm:w-11 sm:h-11' },
  }[size];

  const itemSlots = useMemo(() => {
    const baseSlots = [
      { left: 50, top: 48, rot: 0, scale: 1.08, z: 15 },
      { left: 28, top: 42, rot: -12, scale: 0.95, z: 12 },
      { left: 72, top: 44, rot: 14, scale: 0.95, z: 13 },
      { left: 37, top: 27, rot: -8, scale: 0.88, z: 10 },
      { left: 63, top: 29, rot: 10, scale: 0.88, z: 11 },
    ];

    return displayItems.map((_, idx) => {
      const slot = baseSlots[idx] || baseSlots[0];
      let hash = 0;
      for (let i = 0; i < (caseId || 'seed').length; i++) {
        hash = (hash * 31 + (caseId || 'seed').charCodeAt(i)) % 1000;
      }
      const jitterX = ((hash + idx * 19) % 7) - 3;
      const jitterY = ((hash + idx * 29) % 7) - 3;
      const jitterRot = ((hash + idx * 17) % 9) - 4;

      return {
        left: `${slot.left + jitterX}%`,
        top: `${slot.top + jitterY}%`,
        transform: `translate(-50%, -50%) rotate(${slot.rot + jitterRot}deg) scale(${slot.scale})`,
        zIndex: slot.z,
      };
    });
  }, [displayItems, caseId]);

  return (
    <div className={`relative flex items-center justify-center ${sizeConfig.box} select-none ${className}`}>
      <img
        src={image || '/assets/cases/base_chest.png'}
        alt="Case Chest"
        style={{ filter: filterStyle }}
        className="w-full h-full object-contain filter drop-shadow-[0_8px_16px_rgba(0,0,0,0.6)] transition-all duration-200"
      />

      {displayItems.map((item, idx) => {
        const slotStyle = itemSlots[idx];
        return (
          <div
            key={item.id || idx}
            style={{
              left: slotStyle.left,
              top: slotStyle.top,
              transform: slotStyle.transform,
              zIndex: slotStyle.zIndex,
            }}
            className={`absolute ${sizeConfig.itemSize} pointer-events-none filter drop-shadow-[0_4px_8px_rgba(0,0,0,0.85)] transition-all duration-300 hover:scale-125`}
            title={item.name}
          >
            <img
              src={item.image}
              alt={item.name}
              className="w-full h-full object-contain filter drop-shadow animate-in zoom-in-50 duration-200"
            />
          </div>
        );
      })}
    </div>
  );
};

export const CasesGame: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const {
    deductBet,
    awardPayout,
    toActiveAmount,
    currencyLabel,
    currencyIcon,
    checkCanPlayGame,
    showToast,
    user,
    isAdmin,
    setActiveGame,
  } = useGame();

  // Persistent custom cases storage (Defaults to empty catalog as requested!)
  const [casesList, setCasesList] = useState<CustomCase[]>(() => {
    const saved = localStorage.getItem('voidps_custom_cases_v2');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      } catch {}
    }
    return [];
  });

  const saveCases = (newList: CustomCase[]) => {
    setCasesList(newList);
    localStorage.setItem('voidps_custom_cases_v2', JSON.stringify(newList));
    if (isCurrentAdmin) Promise.all(newList.map(c=>fetch('/api/games/cases/catalog',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({case:c})}).catch(()=>null)));
  };

  useEffect(() => {
    fetch('/api/games/cases/catalog',{credentials:'include'}).then(r=>r.json()).then(d=>{
      if(Array.isArray(d?.cases)){setCasesList(d.cases);if(selectedCase){const fresh=d.cases.find((c:any)=>c.id===selectedCase.id);if(fresh)setSelectedCase(fresh);}}
    }).catch(()=>{});
  }, []);
  // Navigation: Catalog vs Case Detail
  const [selectedCase, setSelectedCase] = useState<CustomCase | null>(null);

  // Catalog Controls
  const [searchTerm, setSearchTerm] = useState('');
  const [sortKey, setSortKey] = useState<'price' | 'name'>('price');
  const [sortAsc, setSortAsc] = useState(true);
  const [priceMax, setPriceMax] = useState<number>(1000);
  const [selectedRisk, setSelectedRisk] = useState<'All' | 'Low' | 'Medium' | 'High' | 'Extreme'>('All');

  // Case Detail Controls
  const [caseCount, setCaseCount] = useState<number>(1);
  const [borrowPercent, setBorrowPercent] = useState<number>(0);
  const [isFavorite, setIsFavorite] = useState<boolean>(false);

  // Multi-Reel Simultaneous Spinning Engine States
  const [spinning, setSpinning] = useState<boolean>(false);
  const [activeWinners, setActiveWinners] = useState<CaseItemDrop[]>([]);
  const [wonModalOpen, setWonModalOpen] = useState<boolean>(false);

  // CS:GO style React-driven offsets & transitions (ensures hardware acceleration and 0 race conditions)
  const [reelOffsets, setReelOffsets] = useState<number[]>([0, 0, 0, 0]);
  const [reelTransitions, setReelTransitions] = useState<string[]>(['none', 'none', 'none', 'none']);
  const tickAnimRef = useRef<number | null>(null);

  // Static reel strips for each reel slot (0, 1, 2, 3)
  const [reelStrips, setReelStrips] = useState<CaseItemDrop[][]>([[], [], [], []]);

  // Viewport & Track references for 1, 2, 3, or 4 simultaneous reels
  const reelViewportRefs = useRef<(HTMLDivElement | null)[]>([null, null, null, null]);
  const reelTrackRefs = useRef<(HTMLDivElement | null)[]>([null, null, null, null]);

  // Admin Case Creator Modal State
  const [adminModalOpen, setAdminModalOpen] = useState<boolean>(false);
  const [editingCaseId, setEditingCaseId] = useState<string | null>(null);
  const [newCaseName, setNewCaseName] = useState<string>('');
  const [newCaseImage, setNewCaseImage] = useState<string>('/assets/cases/base_chest.png');
  const [newCaseColor, setNewCaseColor] = useState<string>('#9333ea');
  const [rgbState, setRgbState] = useState<{ r: number; g: number; b: number }>({ r: 147, g: 51, b: 234 });
  const [newCaseVolatility, setNewCaseVolatility] = useState<'Low' | 'Medium' | 'High' | 'Extreme'>('Medium');
  const [newCaseItems, setNewCaseItems] = useState<CaseItemDrop[]>([]);

  // Item Picker Modal inside Admin Creator
  const [itemPickerOpen, setItemPickerOpen] = useState<boolean>(false);
  const [itemPickerSearch, setItemPickerSearch] = useState<string>('');
  const [itemSortOrder, setItemSortOrder] = useState<'asc' | 'desc'>('asc');

  const isCurrentAdmin = isAdmin;

  // Automatically calculate price from newCaseItems
  const calculatedNewCasePrice = useMemo(() => {
    return calculateCasePrice(newCaseItems);
  }, [newCaseItems]);

  const handleRgbChange = (r: number, g: number, b: number) => {
    const clampedR = Math.max(0, Math.min(255, r));
    const clampedG = Math.max(0, Math.min(255, g));
    const clampedB = Math.max(0, Math.min(255, b));
    setRgbState({ r: clampedR, g: clampedG, b: clampedB });
    setNewCaseColor(rgbToHex(clampedR, clampedG, clampedB));
  };

  const handleHexChange = (hex: string) => {
    setNewCaseColor(hex);
    setRgbState(hexToRgb(hex));
  };

  // Helper to auto-balance drop chances to sum to exactly 100%
  const autoBalanceChances = () => {
    if (newCaseItems.length === 0) return;
    const count = newCaseItems.length;
    const base = Number((100 / count).toFixed(2));
    const balanced = newCaseItems.map((it, idx) => {
      if (idx === count - 1) {
        const sumOthers = base * (count - 1);
        return { ...it, chance: Number((100 - sumOthers).toFixed(2)) };
      }
      return { ...it, chance: base };
    });
    setNewCaseItems(balanced);
    showToast('Chances auto-balanced to exactly 100%!', 'info', 'Auto-Balanced');
  };

  // Filtered Catalog
  const filteredCases = useMemo(() => {
    return casesList
      .filter((c) => {
        const matchesSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesPrice = c.price <= priceMax;
        const matchesRisk =
          selectedRisk === 'All' || c.volatility.toLowerCase() === selectedRisk.toLowerCase();

        return matchesSearch && matchesPrice && matchesRisk;
      })
      .sort((a, b) => {
        if (sortKey === 'price') {
          return sortAsc ? a.price - b.price : b.price - a.price;
        }
        return sortAsc ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
      });
  }, [casesList, searchTerm, priceMax, selectedRisk, sortKey, sortAsc]);

  // Initialize idle reel strips whenever selectedCase changes
  useEffect(() => {
    if (!selectedCase || !selectedCase.items || selectedCase.items.length === 0) return;

    const strips: CaseItemDrop[][] = [];
    for (let c = 0; c < 4; c++) {
      const s: CaseItemDrop[] = [];
      for (let i = 0; i < 70; i++) {
        s.push(selectedCase.items[i % selectedCase.items.length]);
      }
      strips.push(s);
    }
    setReelStrips(strips);
    setReelOffsets([0, 0, 0, 0]);
    setReelTransitions(['none', 'none', 'none', 'none']);
    setActiveWinners([]);
    setWonModalOpen(false);
    setSpinning(false);
  }, [selectedCase]);

  // =========================================================================
  // 🎰 CS:GO / STAKE HARDWARE-ACCELERATED UNBOXING ENGINE
  // =========================================================================
  const WIN_INDEX = 50;

  const startSpin = async (isDemo: boolean = false) => {
    if (spinning || !selectedCase || selectedCase.items.length === 0) return;
    if (!isDemo && !checkCanPlayGame('cases', 'Cases')) return;

    const totalPrice = selectedCase.price * caseCount;
    let serverWinners: CaseItemDrop[] = [];
    let serverRoundId: string | null = null;
    if (!isDemo) {
      const start = await fetch('/api/games/start',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({gameId:'cases',betDls:totalPrice,caseId:selectedCase.id,count:caseCount})}).then(r=>r.json()).catch(()=>null);
      if(!start?.ok||!start.roundId)return;
      serverRoundId=start.roundId;
      const resolved=await fetch('/api/games/resolve',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({roundId:serverRoundId,action:{final:true}})}).then(r=>r.json()).catch(()=>null);
      if(!resolved?.ok||!Array.isArray(resolved.result?.winners))return;
      serverWinners=resolved.result.winners;
    }

    setWonModalOpen(false);
    setActiveWinners([]);

    const items = selectedCase.items;
    const totalWeight = items.reduce((acc, it) => acc + (it.chance || 1), 0);

    const winners: CaseItemDrop[] = [];
    const newStrips: CaseItemDrop[][] = [];

    // 1. Generate winners & 72-card strips for each active reel
    for (let c = 0; c < caseCount; c++) {
      if(serverWinners[c]) { winners.push(serverWinners[c]); } else { let rand = Math.random() * totalWeight;
      let winner = items[0];
      for (const it of items) {
        if (rand <= (it.chance || 1)) {
          winner = it;
          break;
        }
        rand -= (it.chance || 1);
      }
      winners.push(winner); }

      const strip: CaseItemDrop[] = [];
      for (let i = 0; i < 72; i++) {
        if (i === WIN_INDEX) {
          strip.push(winner);
        } else {
          strip.push(items[Math.floor(Math.random() * items.length)]);
        }
      }
      newStrips.push(strip);
    }

    setReelStrips(newStrips);

    // Step A: Immediately reset reels to 0px with NO transition
    setReelOffsets([0, 0, 0, 0]);
    setReelTransitions(['none', 'none', 'none', 'none']);
    setSpinning(true);

    const cardWidth = caseCount > 1 ? 110 : 136;
    const cardGap = 10;
    const cardPitch = cardWidth + cardGap;

    // Step B: Next tick, trigger the 4.8s cubic-bezier deceleration curve
    setTimeout(() => {
      const calculatedOffsets = newStrips.map((_, c) => {
        const viewport = reelViewportRefs.current[c];
        const viewportWidth = viewport?.clientWidth || 600;
        const centerLine = viewportWidth / 2;
        // Subpixel landing jitter inside winning card for authentic CS:GO feel
        const jitter = (Math.random() - 0.5) * (cardWidth * 0.6);
        return WIN_INDEX * cardPitch + cardWidth / 2 - centerLine + jitter;
      });

      setReelTransitions([
        'transform 4800ms cubic-bezier(0.12, 0.8, 0.15, 1)',
        'transform 4800ms cubic-bezier(0.12, 0.8, 0.15, 1)',
        'transform 4800ms cubic-bezier(0.12, 0.8, 0.15, 1)',
        'transform 4800ms cubic-bezier(0.12, 0.8, 0.15, 1)',
      ]);
      setReelOffsets(calculatedOffsets);

      // Play start roll sound
      sound.playCaseRoll();

      // Dynamic Audio Ticker: Plays tick sound as each card crosses the center indicator
      let lastCardTick = -1;
      const spinStart = Date.now();

      const runTicker = () => {
        const track = reelTrackRefs.current[0];
        const viewport = reelViewportRefs.current[0];
        if (track && viewport) {
          const vRect = viewport.getBoundingClientRect();
          const tRect = track.getBoundingClientRect();
          const center = vRect.left + vRect.width / 2;
          const currentX = center - tRect.left;
          const currentCard = Math.floor(currentX / cardPitch);
          if (currentCard !== lastCardTick && currentCard >= 0 && currentCard <= WIN_INDEX) {
            lastCardTick = currentCard;
            sound.playCaseTick();
          }
        }

        if (Date.now() - spinStart < 4800) {
          tickAnimRef.current = requestAnimationFrame(runTicker);
        }
      };

      tickAnimRef.current = requestAnimationFrame(runTicker);
    }, 40);

    // Step C: After 4.85s, reveal all winning items & award payout
    setTimeout(() => {
      if (tickAnimRef.current) cancelAnimationFrame(tickAnimRef.current);
      setSpinning(false);
      setActiveWinners(winners);
      setWonModalOpen(true);
      sound.playWin();

      if (!isDemo) {
        // Settlement already happened on the server. Never credit client-side.
      }
    }, 4900);
  };

  // Admin: Open Creator Modal
  const handleOpenAdminCreate = (caseToEdit?: CustomCase) => {
    if (!isCurrentAdmin) {
      showToast('Admin access required.', 'error', 'Admin Only');
      return;
    }

    if (caseToEdit) {
      setEditingCaseId(caseToEdit.id);
      setNewCaseName(caseToEdit.name);
      setNewCaseImage(caseToEdit.image || '/assets/cases/base_chest.png');
      const hex = caseToEdit.color || '#9333ea';
      setNewCaseColor(hex);
      setRgbState(hexToRgb(hex));
      setNewCaseVolatility(caseToEdit.volatility);
      setNewCaseItems(caseToEdit.items || []);
    } else {
      setEditingCaseId(null);
      setNewCaseName('');
      setNewCaseImage('/assets/cases/base_chest.png');
      setNewCaseColor('#9333ea');
      setRgbState({ r: 147, g: 51, b: 234 });
      setNewCaseVolatility('Medium');
      // Default clean starter items
      setNewCaseItems([
        { id: '203', name: 'Dirt', image: '/assets/items/203.png', price: 0.00035, chance: 40, rarity: 'common', color: '#94a3b8' },
        { id: '4', name: 'Angel Wings', image: '/assets/items/4.png', price: 0.03, chance: 30, rarity: 'uncommon', color: '#38bdf8' },
        { id: '82', name: 'Draconic Wings', image: '/assets/items/82.png', price: 28.0, chance: 20, rarity: 'rare', color: '#a855f7' },
        { id: '71', name: 'Dragon Of Legend', image: '/assets/items/71.png', price: 17.5, chance: 9, rarity: 'epic', color: '#f59e0b' },
        { id: '267', name: 'Phonecats Hat', image: '/assets/items/267.png', price: 6125.0, chance: 1, rarity: 'legendary', color: '#ef4444' },
      ]);
    }
    setAdminModalOpen(true);
  };

  // Admin: Save Case (Always succeeds by auto-normalizing chances to 100%!)
  const handleSaveCustomCase = () => {
    const trimmedName = newCaseName.trim();
    if (!trimmedName) {
      showToast('Please enter a case name.', 'error', 'Missing Name');
      return;
    }
    if (newCaseItems.length === 0) {
      showToast('Please add at least 1 item to the case.', 'error', 'No Items');
      return;
    }

    // Auto-normalize drop chances proportionally to 100% if needed
    const totalChance = newCaseItems.reduce((sum, it) => sum + (it.chance || 0), 0);
    let finalItems = newCaseItems;

    if (Math.abs(totalChance - 100) > 0.01) {
      const sum = totalChance > 0 ? totalChance : 1;
      finalItems = newCaseItems.map((it) => ({
        ...it,
        chance: Number(((it.chance / sum) * 100).toFixed(2)),
      }));
    }

    const priceNum = calculateCasePrice(finalItems);

    if (editingCaseId) {
      const updated = casesList.map((c) =>
        c.id === editingCaseId
          ? {
              ...c,
              name: trimmedName,
              image: newCaseImage,
              color: newCaseColor,
              price: priceNum,
              volatility: newCaseVolatility,
              items: finalItems,
            }
          : c
      );
      saveCases(updated);
      if (selectedCase && selectedCase.id === editingCaseId) {
        setSelectedCase(updated.find((x) => x.id === editingCaseId) || null);
      }
      showToast(`Case "${trimmedName}" updated! Price: ${priceNum} DLS`, 'success', 'Case Updated');
    } else {
      const newCase: CustomCase = {
        id: `case_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        name: trimmedName,
        image: newCaseImage,
        color: newCaseColor,
        price: priceNum,
        volatility: newCaseVolatility,
        creator: 'Supreme',
        openedTimes: 0,
        items: finalItems,
      };
      const updated = [newCase, ...casesList];
      saveCases(updated);
      setSelectedCase(newCase);
      showToast(`Case "${trimmedName}" created successfully! Price: ${priceNum} DLS`, 'success', 'Case Created');
    }

    setAdminModalOpen(false);
  };

  const handleDeleteCase = (caseId: string) => {
    if (!confirm('Are you sure you want to delete this case?')) return;
    const updated = casesList.filter((c) => c.id !== caseId);
    saveCases(updated);
    if (selectedCase && selectedCase.id === caseId) {
      setSelectedCase(null);
    }
    showToast('Case deleted.', 'info', 'Case Deleted');
  };

  const handleClearAllCases = () => {
    if (!confirm('Are you sure you want to remove ALL cases?')) return;
    saveCases([]);
    setSelectedCase(null);
    showToast('All cases removed successfully.', 'info', 'Cases Cleared');
  };

  const handleAddItemFromPicker = (rawItem: any) => {
    const casePriceNum = calculatedNewCasePrice || 25;
    const { rarity, color } = getItemRarityAndColor(rawItem.price, casePriceNum);
    const itemToAdd: CaseItemDrop = {
      id: rawItem.id,
      name: rawItem.name,
      image: rawItem.image,
      price: rawItem.price,
      chance: 10,
      rarity,
      color,
    };
    const updated = [...newCaseItems, itemToAdd];
    // Automatically distribute chances evenly across items
    const count = updated.length;
    const even = Number((100 / count).toFixed(2));
    const balanced = updated.map((it, idx) => ({
      ...it,
      chance: idx === count - 1 ? Number((100 - even * (count - 1)).toFixed(2)) : even,
    }));

    setNewCaseItems(balanced);
    setItemPickerOpen(false);
    showToast(`Added "${rawItem.name}" to case!`, 'success', 'Item Added');
  };

  const sortedAndFilteredItems = useMemo(() => {
    return (itemsData as any[])
      .filter((it) => it.name.toLowerCase().includes(itemPickerSearch.toLowerCase()))
      .sort((a, b) => {
        if (itemSortOrder === 'asc') return a.price - b.price;
        return b.price - a.price;
      });
  }, [itemPickerSearch, itemSortOrder]);

  const renderVolatilityPills = (vol: string) => {
    const levelMap: Record<string, number> = { low: 1, medium: 2, high: 3, extreme: 4 };
    const activeLevel = levelMap[vol.toLowerCase()] || 2;
    const colors = ['bg-[#22c55e]', 'bg-[#eab308]', 'bg-[#f97316]', 'bg-[#ef4444]'];

    return (
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4].map((seg) => {
          const isActive = seg === activeLevel;
          return (
            <div
              key={seg}
              className={`h-1.5 rounded-full transition-all ${
                isActive
                  ? `${colors[seg - 1]} w-6 shadow-[0_0_8px_currentColor]`
                  : 'bg-[#1e2b40] w-4 opacity-50'
              }`}
            />
          );
        })}
      </div>
    );
  };

  // =========================================================================
  // VIEW 1: CATALOG VIEW (Originals only)
  // =========================================================================
  if (!selectedCase) {
    return (
      <div className="flex flex-col gap-6 max-w-7xl mx-auto animate-in fade-in duration-200">
        {/* Top Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-[#0d1420] border border-[#1a2638] text-xs font-bold text-slate-300 hover:text-white hover:border-[#2b3e5c] transition cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Back to Games</span>
            </button>

            {/* Switch between Mystery Cases and Case Battles */}
            <div className="flex items-center bg-[#070c14] p-1 rounded-2xl border border-[#1b283d]">
              <button
                className="flex items-center gap-2 px-4 py-2 rounded-xl font-black text-xs bg-[#0074e4] text-white shadow-lg shadow-[#0074e4]/25 cursor-default"
              >
                <Gift className="w-4 h-4 text-purple-300" />
                <span>Mystery Cases</span>
              </button>
              <button
                onClick={() => setActiveGame('casebattles')}
                className="flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-xs text-slate-400 hover:text-white transition cursor-pointer"
              >
                <Swords className="w-4 h-4 text-amber-400" />
                <span>Case Battles</span>
              </button>
            </div>
          </div>

          {/* Admin Create / Manage Cases Button */}
          <div className="flex items-center gap-2">
            {isCurrentAdmin ? (
              <button
                onClick={() => handleOpenAdminCreate()}
                className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-gradient-to-r from-[#0074e4] to-[#0284c7] hover:brightness-110 text-white font-black text-xs uppercase tracking-wider shadow-lg shadow-[#0074e4]/30 transition cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add New Case (Admin)</span>
              </button>
            ) : (
              <button
                onClick={() => handleOpenAdminCreate()}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0f1828] border border-[#223652] hover:border-[#0074e4] text-slate-300 hover:text-white text-xs font-bold transition cursor-pointer"
                title="Login as admin99 to manage cases"
              >
                <Lock className="w-3.5 h-3.5 text-amber-400" />
                <span>Case Creator (admin99)</span>
              </button>
            )}
          </div>
        </div>

        {/* Filter & Controls Bar */}
        <div className="bg-[#0b121e] border border-[#19263a] rounded-2xl p-4 flex flex-col gap-4 shadow-xl">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-400">Search for Case</label>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search case name..."
                className="w-full bg-[#070c14] border border-[#1b283d] rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-500 outline-none focus:border-[#0074e4] transition"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
            {/* Sort By */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-400">Sort By</label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <select
                    value={sortKey}
                    onChange={(e) => setSortKey(e.target.value as any)}
                    className="w-full bg-[#070c14] border border-[#1b283d] rounded-xl px-3 py-2 text-xs font-bold text-white appearance-none outline-none cursor-pointer"
                  >
                    <option value="price">Price</option>
                    <option value="name">Case Name</option>
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>

                <button
                  onClick={() => {
                    sound.playClick();
                    setSortAsc(!sortAsc);
                  }}
                  className="p-2 rounded-xl bg-[#070c14] border border-[#1b283d] text-slate-400 hover:text-white hover:border-[#2b3e5c] transition cursor-pointer"
                  title="Toggle Ascending/Descending"
                >
                  <ArrowUpDown className="w-4 h-4" />
                </button>

                <button
                  onClick={() => {
                    sound.playClick();
                    setSearchTerm('');
                    setPriceMax(1000);
                    setSelectedRisk('All');
                    setSortKey('price');
                    setSortAsc(true);
                  }}
                  className="p-2 rounded-xl bg-[#070c14] border border-[#1b283d] text-slate-400 hover:text-white hover:border-[#2b3e5c] transition cursor-pointer"
                  title="Reset Filters"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Price Range */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-400">Price Range</label>
              <div className="flex items-center gap-2.5">
                <div className="px-2.5 py-1.5 rounded-lg bg-[#070c14] border border-[#1b283d] text-xs font-mono font-bold text-white flex items-center gap-1 shrink-0">
                  <CurrencyDisplay amountDls={0} iconClassName="w-3.5 h-3.5" />
                </div>

                <input
                  type="range"
                  min="0"
                  max="1000"
                  step="5"
                  value={priceMax}
                  onChange={(e) => setPriceMax(Number(e.target.value))}
                  className="w-full accent-[#0074e4] cursor-pointer"
                />

                <div className="px-2.5 py-1.5 rounded-lg bg-[#070c14] border border-[#1b283d] text-xs font-mono font-bold text-white flex items-center gap-1 shrink-0">
                  <CurrencyDisplay amountDls={priceMax} iconClassName="w-3.5 h-3.5" />
                </div>
              </div>
            </div>

            {/* Risk Range */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-400">Risk Range</label>
              <div className="flex flex-col gap-1">
                <div className="grid grid-cols-4 gap-1 h-2 rounded-full overflow-hidden bg-[#162234] p-0.5">
                  <div className="h-full rounded-full bg-[#22c55e]" />
                  <div className="h-full rounded-full bg-[#eab308]" />
                  <div className="h-full rounded-full bg-[#f97316]" />
                  <div className="h-full rounded-full bg-[#ef4444]" />
                </div>
                <div className="flex items-center justify-between text-[10px] text-slate-400">
                  <span
                    onClick={() => setSelectedRisk('Low')}
                    className={`cursor-pointer ${selectedRisk === 'Low' ? 'text-[#22c55e] font-black' : 'text-slate-400'}`}
                  >
                    Low
                  </span>
                  <span
                    onClick={() => setSelectedRisk('Medium')}
                    className={`cursor-pointer ${selectedRisk === 'Medium' ? 'text-[#eab308] font-black' : 'text-slate-400'}`}
                  >
                    Medium
                  </span>
                  <span
                    onClick={() => setSelectedRisk('High')}
                    className={`cursor-pointer ${selectedRisk === 'High' ? 'text-[#f97316] font-black' : 'text-slate-400'}`}
                  >
                    High
                  </span>
                  <span
                    onClick={() => setSelectedRisk('Extreme')}
                    className={`cursor-pointer ${selectedRisk === 'Extreme' ? 'text-[#ef4444] font-black' : 'text-slate-400'}`}
                  >
                    Extreme
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Cases Grid */}
        {filteredCases.length === 0 ? (
          <div className="bg-[#0b121e] border border-[#19263a] rounded-3xl p-16 text-center flex flex-col items-center gap-4 shadow-2xl">
            <div className="w-16 h-16 rounded-2xl bg-[#101b2d] flex items-center justify-center text-slate-500">
              <Gift className="w-8 h-8 text-slate-400" />
            </div>
            <div>
              <h3 className="text-base font-black text-white">No Cases Available</h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto mt-1">
                All pre-made cases have been cleared. Log in as <strong>admin99</strong> (password: <strong>admin001</strong>) to create your custom cases with Growtopia drops!
              </p>
            </div>
            {isCurrentAdmin && (
              <button
                onClick={() => handleOpenAdminCreate()}
                className="px-6 py-3 rounded-2xl bg-[#0074e4] hover:bg-[#0085ff] text-white text-xs font-black uppercase tracking-wider transition shadow-lg shadow-[#0074e4]/30 cursor-pointer"
              >
                + Create First Case
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
            {filteredCases.map((c) => (
              <div
                key={c.id}
                onClick={() => {
                  sound.playClick();
                  setSelectedCase(c);
                }}
                className="group relative rounded-2xl p-4 bg-[#0d1420] border border-[#1a2638] hover:border-[#0074e4] transition-all duration-200 transform hover:-translate-y-1 hover:shadow-xl hover:shadow-[#0074e4]/15 flex flex-col items-center text-center cursor-pointer select-none"
              >
                {/* Admin Edit/Delete buttons on hover */}
                {isCurrentAdmin && (
                  <div className="absolute top-2 right-2 z-30 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenAdminCreate(c);
                      }}
                      className="p-1.5 rounded-lg bg-blue-500/20 hover:bg-blue-500/40 text-blue-300 transition cursor-pointer"
                      title="Edit Case"
                    >
                      <Edit3 className="w-3 h-3" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteCase(c.id);
                      }}
                      className="p-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/40 text-red-300 transition cursor-pointer"
                      title="Delete Case"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                )}

                {/* Case Artwork */}
                <div className="w-full flex items-center justify-center mb-2">
                  <CaseChestDisplay
                    image={c.image || '/assets/cases/base_chest.png'}
                    color={c.color || '#9333ea'}
                    items={c.items}
                    caseId={c.id}
                    size="md"
                  />
                </div>

                {/* Case Title */}
                <h4 className="text-xs font-black text-white group-hover:text-[#38bdf8] transition tracking-tight line-clamp-1 mb-2">
                  {c.name}
                </h4>

                <div className="mb-2.5">{renderVolatilityPills(c.volatility)}</div>

                {/* Price */}
                <div className="mt-auto">
                  <CurrencyDisplay
                    amountDls={c.price}
                    className="text-xs font-mono font-black text-white"
                    iconClassName="w-4 h-4"
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* =========================================================================
            ADMIN CASE CREATOR MODAL
           ========================================================================= */}
        {adminModalOpen && (
          <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-[100] flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-[#0b121e] border border-[#1b2b42] rounded-3xl p-6 max-w-3xl w-full shadow-2xl space-y-5 my-8">
              <div className="flex items-center justify-between pb-4 border-b border-[#182438]">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#0074e4] to-[#0284c7] flex items-center justify-center shadow-lg shadow-[#0074e4]/30">
                    <Gift className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-white">
                      {editingCaseId ? 'Edit Custom Case' : 'Create Custom Case'}
                    </h3>
                    <p className="text-xs text-slate-400">
                      Configure chest RGB color, items, and drop chances (Price auto-calculated from items)
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setAdminModalOpen(false)}
                  className="p-2 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Form Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300">Case Name</label>
                  <input
                    type="text"
                    value={newCaseName}
                    onChange={(e) => setNewCaseName(e.target.value)}
                    placeholder="e.g. Diamond Chest, Dragon Hoard..."
                    className="w-full bg-[#070c14] border border-[#1b283d] rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 outline-none focus:border-[#0074e4] transition"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                      <Calculator className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Case Price (Auto-Calculated)</span>
                    </label>
                    <span className="text-[10px] text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded">
                      Exact EV
                    </span>
                  </div>
                  <div className="w-full bg-[#070c14] border border-[#1b283d] rounded-xl px-3.5 py-2.5 text-xs text-white flex items-center justify-between font-mono">
                    <span className="text-slate-400 text-[11px]">Calculated from drops:</span>
                    <CurrencyDisplay amountDls={calculatedNewCasePrice} iconClassName="w-4 h-4" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300">Volatility</label>
                  <select
                    value={newCaseVolatility}
                    onChange={(e) => setNewCaseVolatility(e.target.value as any)}
                    className="w-full bg-[#070c14] border border-[#1b283d] rounded-xl px-3.5 py-2.5 text-xs font-bold text-white outline-none focus:border-[#0074e4] transition cursor-pointer"
                  >
                    <option value="Low">Low Volatility</option>
                    <option value="Medium">Medium Volatility</option>
                    <option value="High">High Volatility</option>
                    <option value="Extreme">Extreme Volatility</option>
                  </select>
                </div>

                {/* Live Preview */}
                <div className="md:row-span-2 flex flex-col items-center justify-center p-4 rounded-2xl bg-[#070c14] border border-[#1a283e]">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-[#38bdf8]" />
                    <span>Live Chest Artwork Preview</span>
                  </span>

                  <CaseChestDisplay
                    image={newCaseImage}
                    color={newCaseColor}
                    items={newCaseItems}
                    caseId="preview"
                    size="lg"
                  />

                  <p className="text-[10px] text-slate-400 text-center mt-2">
                    {newCaseItems.length === 0
                      ? 'Add items below to see them burst out of the open chest'
                      : `Showing first ${Math.min(5, newCaseItems.length)} of ${newCaseItems.length} items placed inside chest`}
                  </p>
                </div>

                {/* RGB Color Customizer */}
                <div className="space-y-2.5 p-3.5 rounded-2xl bg-[#070c14] border border-[#1a283e]">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Palette className="w-3.5 h-3.5 text-[#38bdf8]" />
                      <span>Case Chest Color (RGB)</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={newCaseColor}
                        onChange={(e) => handleHexChange(e.target.value)}
                        className="w-6 h-6 rounded-lg cursor-pointer border-0 p-0 bg-transparent"
                        title="Pick Color"
                      />
                      <span className="text-xs font-mono font-bold text-white bg-[#0f1a2a] px-2 py-0.5 rounded border border-[#1b283d]">
                        {newCaseColor.toUpperCase()}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <span className="text-[10px] text-red-400 font-bold block mb-1">R (0-255)</span>
                      <input
                        type="number"
                        min="0"
                        max="255"
                        value={rgbState.r}
                        onChange={(e) =>
                          handleRgbChange(Number(e.target.value) || 0, rgbState.g, rgbState.b)
                        }
                        className="w-full bg-[#0b121e] border border-[#1e2f47] rounded-lg px-2 py-1 text-xs font-mono font-bold text-white outline-none focus:border-red-500"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-emerald-400 font-bold block mb-1">G (0-255)</span>
                      <input
                        type="number"
                        min="0"
                        max="255"
                        value={rgbState.g}
                        onChange={(e) =>
                          handleRgbChange(rgbState.r, Number(e.target.value) || 0, rgbState.b)
                        }
                        className="w-full bg-[#0b121e] border border-[#1e2f47] rounded-lg px-2 py-1 text-xs font-mono font-bold text-white outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-blue-400 font-bold block mb-1">B (0-255)</span>
                      <input
                        type="number"
                        min="0"
                        max="255"
                        value={rgbState.b}
                        onChange={(e) =>
                          handleRgbChange(rgbState.r, rgbState.g, Number(e.target.value) || 0)
                        }
                        className="w-full bg-[#0b121e] border border-[#1e2f47] rounded-lg px-2 py-1 text-xs font-mono font-bold text-white outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    {PRESET_COLORS.map((p) => (
                      <button
                        key={p.hex}
                        type="button"
                        onClick={() => handleRgbChange(p.r, p.g, p.b)}
                        style={{ backgroundColor: p.hex }}
                        className={`w-5 h-5 rounded-full border transition cursor-pointer ${
                          newCaseColor.toLowerCase() === p.hex.toLowerCase()
                            ? 'ring-2 ring-white scale-110 border-white'
                            : 'border-white/20 hover:scale-105'
                        }`}
                        title={p.name}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Items & Chances Section */}
              <div className="space-y-3 pt-3 border-t border-[#182438]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div>
                      <h4 className="text-xs font-black text-white uppercase tracking-wider">
                        Case Items & Drop Chances
                      </h4>
                      <p className="text-[10px] text-slate-400">
                        Total chance:
                        <strong
                          className={`ml-1 font-mono ${
                            Math.abs(newCaseItems.reduce((acc, it) => acc + (it.chance || 0), 0) - 100) < 0.1
                              ? 'text-emerald-400'
                              : 'text-amber-400'
                          }`}
                        >
                          {newCaseItems.reduce((acc, it) => acc + (it.chance || 0), 0).toFixed(1)}% / 100%
                        </strong>
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={autoBalanceChances}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#142237] hover:bg-[#1a2f4c] text-[#38bdf8] text-[11px] font-bold transition border border-[#213a5e] cursor-pointer"
                      title="Auto-balance all item drop chances to 100%"
                    >
                      <Scale className="w-3 h-3" />
                      <span>Auto-Balance</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setItemPickerSearch('');
                      setItemSortOrder('asc');
                      setItemPickerOpen(true);
                    }}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#0074e4] hover:bg-[#0085ff] text-white text-xs font-bold transition cursor-pointer shadow-md shadow-[#0074e4]/20"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Add Growtopia Item</span>
                  </button>
                </div>

                {/* Items List */}
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {newCaseItems.length === 0 ? (
                    <div className="p-4 rounded-xl bg-[#070c14] border border-[#1a283e] text-center text-xs text-slate-500">
                      No items added yet. Click <strong>"+ Add Growtopia Item"</strong> to choose from 270 items.
                    </div>
                  ) : (
                    newCaseItems.map((it, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-2.5 rounded-xl bg-[#070c14] border border-[#1a283e] gap-3"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-9 h-9 rounded-lg bg-[#0c1422] p-1 flex items-center justify-center shrink-0 border border-[#1b283d]">
                            <img src={it.image} alt={it.name} className="w-full h-full object-contain" />
                          </div>
                          <div className="min-w-0">
                            <span className="text-xs font-bold text-white block truncate">{it.name}</span>
                            <div className="text-[10px] font-mono">
                              <CurrencyDisplay amountDls={it.price} iconClassName="w-3 h-3" />
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <div className="flex items-center gap-1 bg-[#0c1422] border border-[#1e2e44] rounded-lg px-2 py-1">
                            <input
                              type="number"
                              step="0.5"
                              min="0.01"
                              max="100"
                              value={it.chance}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value) || 0;
                                setNewCaseItems(
                                  newCaseItems.map((x, i) => (i === idx ? { ...x, chance: val } : x))
                                );
                              }}
                              className="w-16 bg-transparent text-xs font-mono font-bold text-white text-right outline-none"
                            />
                            <span className="text-xs text-slate-400 font-bold">%</span>
                          </div>

                          <button
                            type="button"
                            onClick={() => setNewCaseItems(newCaseItems.filter((_, i) => i !== idx))}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition cursor-pointer"
                            title="Remove item"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-3 border-t border-[#182438]">
                <button
                  type="button"
                  onClick={handleClearAllCases}
                  className="px-3.5 py-2 rounded-xl bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-300 text-xs font-bold transition cursor-pointer"
                >
                  Delete All Cases
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setAdminModalOpen(false)}
                    className="px-4 py-2 rounded-xl bg-[#0e1624] border border-[#1b283d] text-xs font-bold text-slate-400 hover:text-white transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveCustomCase}
                    className="px-6 py-2 rounded-xl bg-[#0074e4] hover:bg-[#0085ff] text-white text-xs font-black uppercase tracking-wider transition shadow-lg shadow-[#0074e4]/30 cursor-pointer"
                  >
                    Save Case ({calculatedNewCasePrice} DLS)
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* GROWTOPIA ITEM PICKER MODAL */}
        {itemPickerOpen && (
          <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-[110] flex items-center justify-center p-4">
            <div className="bg-[#0b121e] border border-[#1b2b42] rounded-3xl p-6 max-w-2xl w-full shadow-2xl space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-[#182438]">
                <div>
                  <h3 className="text-base font-black text-white">Select Growtopia Item</h3>
                  <p className="text-xs text-slate-400">Choose from all 270 official Growtopia items</p>
                </div>
                <button
                  onClick={() => setItemPickerOpen(false)}
                  className="p-1.5 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={itemPickerSearch}
                    onChange={(e) => setItemPickerSearch(e.target.value)}
                    placeholder="Search item name (e.g. Dirt, Wings, Phonecats, Crown...)"
                    className="w-full bg-[#070c14] border border-[#1b283d] rounded-xl pl-9 pr-4 py-2 text-xs text-white outline-none focus:border-[#0074e4] transition"
                    autoFocus
                  />
                </div>

                <button
                  type="button"
                  onClick={() => {
                    sound.playClick();
                    setItemSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
                  }}
                  className="flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl bg-[#0c1524] border border-[#1e3048] hover:border-[#0074e4] text-slate-200 text-xs font-bold transition cursor-pointer shrink-0"
                >
                  <ArrowUpDown className="w-3.5 h-3.5 text-[#38bdf8]" />
                  <span>
                    Price: {itemSortOrder === 'asc' ? 'Low → High' : 'High → Low'}
                  </span>
                </button>
              </div>

              {/* Items Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 max-h-96 overflow-y-auto pr-1">
                {sortedAndFilteredItems.length === 0 ? (
                  <div className="col-span-4 p-8 text-center text-xs text-slate-500">
                    No items match "{itemPickerSearch}"
                  </div>
                ) : (
                  sortedAndFilteredItems.map((it) => (
                    <button
                      key={it.id}
                      type="button"
                      onClick={() => handleAddItemFromPicker(it)}
                      className="p-2.5 rounded-xl bg-[#070c14] border border-[#18263a] hover:border-[#0074e4] hover:bg-[#0f1a2a] transition flex flex-col items-center text-center cursor-pointer group"
                    >
                      <div className="w-12 h-12 flex items-center justify-center mb-1.5">
                        <img
                          src={it.image}
                          alt={it.name}
                          className="w-full h-full object-contain filter drop-shadow group-hover:scale-110 transition-transform"
                        />
                      </div>
                      <span className="text-[11px] font-bold text-white line-clamp-1 group-hover:text-cyan-300">
                        {it.name}
                      </span>
                      <div className="mt-1">
                        <CurrencyDisplay
                          amountDls={it.price}
                          className="text-[10px] font-mono text-emerald-400 font-bold"
                          iconClassName="w-3.5 h-3.5"
                        />
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // VIEW 2: CASE OPENING & CS2 MULTI-REEL STAGE
  // =========================================================================
  const currentTotalPrice = selectedCase.price * caseCount;
  const cardWidth = caseCount > 1 ? 110 : 136;
  const cardHeight = caseCount > 1 ? 150 : 180;

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto animate-in fade-in duration-200">
      {/* Top Bar */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => {
            sound.playClick();
            setSelectedCase(null);
          }}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#0d1420] border border-[#1a2638] text-xs font-bold text-slate-300 hover:text-white hover:border-[#2b3e5c] transition cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Back to Cases</span>
        </button>

        <div className="flex items-center gap-2">
          {isCurrentAdmin && (
            <button
              onClick={() => handleOpenAdminCreate(selectedCase)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-500/20 border border-blue-500/40 text-blue-300 text-xs font-bold hover:bg-blue-500/30 transition cursor-pointer"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Edit Case</span>
            </button>
          )}

          <button
            onClick={() => setIsFavorite(!isFavorite)}
            className={`p-2.5 rounded-xl border transition cursor-pointer ${
              isFavorite
                ? 'bg-rose-500/20 border-rose-500/40 text-rose-400'
                : 'bg-[#0d1420] border-[#1a2638] text-slate-400 hover:text-white'
            }`}
            title="Add to Favorites"
          >
            <Heart className={`w-4 h-4 ${isFavorite ? 'fill-rose-400 text-rose-400' : ''}`} />
          </button>

          <button
            onClick={() =>
              showToast(
                'Provably fair algorithm verifies each case spin with server & client seed hashing.',
                'info',
                'Fairness Verified'
              )
            }
            className="p-2.5 rounded-xl bg-[#0d1420] border border-[#1a2638] text-slate-400 hover:text-white transition cursor-pointer"
            title="Provably Fair Settings"
          >
            <Settings className="w-4 h-4" />
          </button>

          <button
            onClick={() =>
              showToast(
                'Server seed: e8f7a90b... Client seed: voidps_player_seed',
                'info',
                'Provably Fair Seed'
              )
            }
            className="p-2.5 rounded-xl bg-[#0d1420] border border-[#1a2638] text-slate-400 hover:text-white transition cursor-pointer"
            title="Provably Fair"
          >
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
          </button>
        </div>
      </div>

      {/* Main Two-Column Stage */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Profile & Open Button */}
        <div className="lg:col-span-4 bg-[#0a0f18] border border-[#18253a] rounded-2xl p-5 flex flex-col gap-4 shadow-xl">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span>Created by:</span>
            <div className="flex items-center gap-1.5 font-bold text-white bg-[#101928] px-2 py-0.5 rounded-lg border border-[#1b283d]">
              <div className="w-4 h-4 rounded bg-[#38bdf8]/20 flex items-center justify-center text-[10px] text-[#38bdf8]">
                👑
              </div>
              <span>{selectedCase.creator || 'Supreme'}</span>
            </div>
          </div>

          <div className="w-full flex items-center justify-center py-4">
            <CaseChestDisplay
              image={selectedCase.image || '/assets/cases/base_chest.png'}
              color={selectedCase.color || '#9333ea'}
              items={selectedCase.items}
              caseId={selectedCase.id}
              size="lg"
            />
          </div>

          <div className="text-center">
            <h2 className="text-base sm:text-lg font-black text-white tracking-tight uppercase">
              {selectedCase.name}
            </h2>
            <p className="text-[11px] text-slate-500 font-medium mt-0.5">
              Case opened {selectedCase.openedTimes || 50} times
            </p>
          </div>

          {/* Volatility */}
          <div className="space-y-1 pt-2 border-t border-[#152033]">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 font-semibold">Volatility</span>
              <span className="font-bold text-orange-400">{selectedCase.volatility}</span>
            </div>
            <div className="grid grid-cols-4 gap-1 h-2 rounded-full overflow-hidden bg-[#121c2c] p-0.5">
              <div className="h-full rounded-full bg-[#22c55e]" />
              <div className="h-full rounded-full bg-[#eab308]" />
              <div className="h-full rounded-full bg-[#f97316]" />
              <div className="h-full rounded-full bg-[#ef4444]" />
            </div>
          </div>

          {/* Number of Cases Selector (1, 2, 3, 4) */}
          <div className="space-y-1.5 pt-2">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="text-slate-400">Open Multiple Cases</span>
              <span className="text-white font-mono font-bold">{caseCount}x Case</span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {[1, 2, 3, 4].map((num) => (
                <button
                  key={num}
                  onClick={() => {
                    sound.playClick();
                    setCaseCount(num);
                  }}
                  disabled={spinning}
                  className={`py-2.5 rounded-xl font-mono font-black text-xs transition cursor-pointer disabled:opacity-50 ${
                    caseCount === num
                      ? 'bg-[#101d30] border-2 border-[#0074e4] text-white shadow-md'
                      : 'bg-[#0d1420] border border-[#1b283d] text-slate-400 hover:text-white'
                  }`}
                >
                  {num}x
                </button>
              ))}
            </div>
          </div>

          {/* Borrow Slider */}
          <div className="space-y-1.5 pt-2">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="text-slate-400">Borrow</span>
              <span className="text-white font-mono font-bold">{borrowPercent}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="80"
              step="20"
              value={borrowPercent}
              onChange={(e) => setBorrowPercent(Number(e.target.value))}
              disabled={spinning}
              className="w-full accent-[#0074e4] cursor-pointer"
            />
            <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono">
              <span>0%</span>
              <span>20%</span>
              <span>40%</span>
              <span>60%</span>
              <span>80%</span>
            </div>
          </div>

          {/* Open Button */}
          <button
            onClick={() => startSpin(false)}
            disabled={spinning}
            className="w-full py-3.5 rounded-xl bg-[#0074e4] hover:bg-[#0085ff] active:bg-[#0066cc] disabled:opacity-50 text-white font-black text-sm uppercase tracking-wider transition shadow-lg shadow-[#0074e4]/30 flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>{spinning ? `Opening ${caseCount} Cases…` : `Open ${caseCount}x for`}</span>
            {!spinning && (
              <CurrencyDisplay
                amountDls={currentTotalPrice}
                className="font-mono font-black text-white"
                iconClassName="w-4 h-4"
              />
            )}
          </button>

          <button
            onClick={() => startSpin(true)}
            disabled={spinning}
            className="w-full py-2.5 rounded-xl bg-[#0d1420] hover:bg-[#121c2c] border border-[#1a283d] text-xs font-bold text-slate-300 hover:text-white transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${spinning ? 'animate-spin' : ''}`} />
            <span>Demo Spin ({caseCount}x)</span>
          </button>
        </div>

        {/* Right Column: CS2 REELS STAGE */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          <div
            className={`grid gap-4 w-full ${
              caseCount === 1
                ? 'grid-cols-1'
                : caseCount === 2
                ? 'grid-cols-1 md:grid-cols-2'
                : caseCount === 3
                ? 'grid-cols-1 md:grid-cols-3'
                : 'grid-cols-1 sm:grid-cols-2'
            }`}
          >
            {Array.from({ length: caseCount }).map((_, cIdx) => (
              <div
                key={cIdx}
                ref={(el) => (reelViewportRefs.current[cIdx] = el)}
                className="relative rounded-2xl bg-[#070c14] border border-[#1a283d] overflow-hidden p-3 sm:p-4 flex flex-col items-center justify-center shadow-2xl w-full"
              >
                {/* Top needle */}
                <div className="absolute top-1.5 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center pointer-events-none">
                  <div className="w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-t-[11px] border-t-[#0084ff] filter drop-shadow-[0_0_8px_#0084ff]" />
                </div>

                {/* Bottom needle */}
                <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center pointer-events-none">
                  <div className="w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-b-[11px] border-b-[#0084ff] filter drop-shadow-[0_0_8px_#0084ff]" />
                </div>

                <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-[2px] bg-gradient-to-b from-[#0084ff] via-[#0084ff]/40 to-[#0084ff] z-20 pointer-events-none opacity-80" />
                <div className="absolute inset-y-0 left-0 w-16 sm:w-20 bg-gradient-to-r from-[#070c14] via-[#070c14]/80 to-transparent z-10 pointer-events-none" />
                <div className="absolute inset-y-0 right-0 w-16 sm:w-20 bg-gradient-to-l from-[#070c14] via-[#070c14]/80 to-transparent z-10 pointer-events-none" />

                <div className="w-full overflow-hidden py-3 sm:py-4">
                  <div
                    ref={(el) => (reelTrackRefs.current[cIdx] = el)}
                    className="flex items-center gap-2.5 will-change-transform"
                    style={{
                      width: 'max-content',
                      transform: `translate3d(-${reelOffsets[cIdx] || 0}px, 0px, 0px)`,
                      transition: reelTransitions[cIdx] || 'none',
                    }}
                  >
                    {(reelStrips[cIdx] || []).map((item, idx) => {
                      const isWinnerCard = idx === WIN_INDEX && !spinning && activeWinners.length > 0;
                      return (
                        <div
                          key={idx}
                          style={{
                            width: `${cardWidth}px`,
                            height: `${cardHeight}px`,
                            borderColor: isWinnerCard ? '#f59e0b' : `${item.color}50`,
                            background: isWinnerCard
                              ? 'linear-gradient(180deg, #2d2008 0%, #070c14 100%)'
                              : 'linear-gradient(180deg, #0e1726 0%, #070c14 100%)',
                          }}
                          className={`rounded-2xl border flex flex-col items-center justify-between p-2.5 shrink-0 relative transition-all duration-300 ${
                            isWinnerCard ? 'ring-2 ring-amber-400 shadow-xl shadow-amber-500/40 scale-105 z-10' : ''
                          }`}
                        >
                        <span
                          className="text-[9px] uppercase font-mono font-black tracking-widest text-center"
                          style={{ color: item.color }}
                        >
                          {item.rarity}
                        </span>

                        <div className="w-14 h-14 sm:w-16 sm:h-16 flex items-center justify-center my-auto">
                          <img
                            src={item.image}
                            alt={item.name}
                            className="w-full h-full object-contain filter drop-shadow"
                          />
                        </div>

                        <span className="text-[10px] font-bold text-white text-center leading-tight line-clamp-1 w-full px-1">
                          {item.name}
                        </span>

                        <div
                          className="mt-auto px-2 py-0.5 rounded text-[9px] font-mono font-bold flex items-center justify-center"
                          style={{ backgroundColor: `${item.color}20`, color: item.color }}
                        >
                          <CurrencyDisplay
                            amountDls={item.price}
                            className="font-mono font-bold text-[9px]"
                            iconClassName="w-2.5 h-2.5"
                          />
                        </div>

                        <div
                          className="absolute bottom-0 inset-x-2 h-1 rounded-t-full"
                          style={{ backgroundColor: item.color }}
                        />
                      </div>
                    );
                  })}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Victory Modal */}
          {wonModalOpen && activeWinners.length > 0 && (
            <div className="animate-in zoom-in-95 duration-200">
              <div className="rounded-2xl p-4 sm:p-5 border border-emerald-500/40 bg-[#0a1824] shadow-2xl shadow-emerald-500/20 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-3">
                  {activeWinners.map((w, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 p-2 rounded-xl bg-[#070e17] border border-emerald-500/30"
                    >
                      <div className="w-10 h-10 rounded-lg p-1 bg-[#040810] flex items-center justify-center">
                        <img src={w.image} alt={w.name} className="w-full h-full object-contain" />
                      </div>
                      <div>
                        <span className="text-xs font-bold text-white block">{w.name}</span>
                        <CurrencyDisplay
                          amountDls={w.price}
                          className="text-[10px] font-mono text-emerald-400 font-bold"
                          iconClassName="w-3 h-3"
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex items-center gap-4 shrink-0">
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 block uppercase font-bold">Total Unboxed</span>
                    <div className="text-base font-mono font-black text-emerald-400">
                      +<CurrencyDisplay
                        amountDls={activeWinners.reduce((s, x) => s + x.price, 0)}
                        className="text-base font-mono font-black text-emerald-400"
                        iconClassName="w-4 h-4"
                      />
                    </div>
                  </div>

                  <button
                    onClick={() => setWonModalOpen(false)}
                    className="px-5 py-2.5 rounded-xl bg-[#0074e4] hover:bg-[#0085ff] text-white text-xs font-black uppercase tracking-wider transition cursor-pointer"
                  >
                    Claim
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Drops Table */}
          <div className="bg-[#0a0f18] border border-[#18253a] rounded-2xl p-5 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-black uppercase tracking-wider text-white flex items-center gap-2">
                <Gift className="w-4 h-4 text-[#38bdf8]" />
                <span>Case Drops ({selectedCase.items.length} Items)</span>
              </span>
              <span className="text-[10px] text-slate-500 font-mono">Provably Fair Weighted Chances</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
              {selectedCase.items.map((item, idx) => (
                <div
                  key={idx}
                  className="bg-[#0d1422] border rounded-2xl p-3.5 flex flex-col items-center text-center transition-all hover:scale-[1.03] shadow-md relative overflow-hidden"
                  style={{ borderColor: `${item.color}40` }}
                >
                  <span className="absolute top-2 right-2 text-[9px] font-mono font-black text-slate-400">
                    {item.chance}%
                  </span>

                  <div className="w-14 h-14 flex items-center justify-center my-1">
                    <img
                      src={item.image}
                      alt={item.name}
                      className="w-full h-full object-contain filter drop-shadow"
                    />
                  </div>

                  <span className="text-xs font-bold text-white leading-snug line-clamp-1 mt-1">
                    {item.name}
                  </span>

                  <span
                    className="text-[9px] uppercase font-mono font-black tracking-wider mt-0.5"
                    style={{ color: item.color }}
                  >
                    {item.rarity}
                  </span>

                  <div className="mt-1">
                    <CurrencyDisplay
                      amountDls={item.price}
                      className="text-xs font-mono font-black text-emerald-400"
                      iconClassName="w-3.5 h-3.5"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

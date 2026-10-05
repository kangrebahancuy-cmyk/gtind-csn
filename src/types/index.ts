export type Currency = 'DLS' | 'BGLS';

export interface UserState {
  username: string;
  growId?: string;
  linkCode?: string;
  gtpsLinked?: boolean;
  isAuthenticated: boolean;
  balanceDls: number;
  activeCurrency: Currency;
  selectedFiat: 'USD' | 'EUR';
}

export interface LiveBet {
  id: string;
  game: string;
  player: string;
  avatar?: string;
  betDls: number;
  multiplier: number;
  payoutDls: number;
  won: boolean;
  timestamp: string;
}

export interface CaseItem {
  id: string;
  name: string;
  rarity: 'Common' | 'Uncommon' | 'Rare' | 'Epic' | 'Legendary';
  valueDls: number;
  symbolType: 'gem' | 'lock' | 'crown' | 'sword' | 'shield' | 'star';
  color: string;
}

export interface MysteryCase {
  id: string;
  name: string;
  priceDls: number;
  image: string;
  items: CaseItem[];
}

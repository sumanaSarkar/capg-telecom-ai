export interface OfferCatalogItem {
  id: string;
  name: string;
  category: 'plan' | 'add-on' | 'feature' | 'bundle';
  price: number;
  tags: string[];
  description: string;
  segment: 'family' | 'traveler' | 'streamer' | 'business' | 'gamer' | 'premium' | 'general';
  compatibility: string[];
}

export const OFFER_CATALOG: OfferCatalogItem[] = [
  {
    id: 'plan-family',
    name: 'Family Infinity Plan',
    category: 'plan',
    price: 799,
    tags: ['family', 'unlimited', 'calls', 'shared'],
    description: 'Best for family sharing and multi-device households.',
    segment: 'family',
    compatibility: ['Unlimited Voice Pack', 'Family Entertainment Pack', 'Multi-device Hotspot'],
  },
  {
    id: 'plan-streamer',
    name: 'Youth Streamer Plan',
    category: 'plan',
    price: 499,
    tags: ['streaming', 'social', 'data'],
    description: 'Ideal for streaming-heavy and data-hungry lifestyles.',
    segment: 'streamer',
    compatibility: ['Premium OTT Bundle', 'Gaming Turbo Add-on'],
  },
  {
    id: 'plan-business',
    name: 'Business Pro Plan',
    category: 'plan',
    price: 999,
    tags: ['business', 'productivity', 'work'],
    description: 'Built for hybrid work and productivity-first users.',
    segment: 'business',
    compatibility: ['Multi-device Hotspot', 'Priority Support'],
  },
  {
    id: 'addon-voice',
    name: 'Unlimited Voice Pack',
    category: 'add-on',
    price: 149,
    tags: ['voice', 'calls', 'unlimited'],
    description: 'Adds broad voice coverage for frequent callers.',
    segment: 'general',
    compatibility: ['Family Infinity Plan', 'Youth Streamer Plan', 'Business Pro Plan'],
  },
  {
    id: 'addon-roaming',
    name: 'International Roaming Pass',
    category: 'add-on',
    price: 399,
    tags: ['roaming', 'travel', 'international'],
    description: 'Supports travel and international usage.',
    segment: 'traveler',
    compatibility: ['Family Infinity Plan', 'Youth Streamer Plan', 'Business Pro Plan'],
  },
  {
    id: 'addon-ott',
    name: 'Premium OTT Bundle',
    category: 'add-on',
    price: 249,
    tags: ['ott', 'netflix', 'streaming'],
    description: 'Covers premium streaming entertainment.',
    segment: 'streamer',
    compatibility: ['Youth Streamer Plan', 'Family Infinity Plan'],
  },
  {
    id: 'addon-family',
    name: 'Family Entertainment Pack',
    category: 'add-on',
    price: 349,
    tags: ['family', 'ott', 'entertainment'],
    description: 'Great for shared household entertainment.',
    segment: 'family',
    compatibility: ['Family Infinity Plan'],
  },
  {
    id: 'addon-gaming',
    name: 'Gaming Turbo Add-on',
    category: 'add-on',
    price: 129,
    tags: ['gaming', 'streaming', 'latency'],
    description: 'Provides smoother performance for gamers and streamers.',
    segment: 'gamer',
    compatibility: ['Youth Streamer Plan'],
  },
  {
    id: 'addon-hotspot',
    name: 'Multi-device Hotspot',
    category: 'add-on',
    price: 79,
    tags: ['hotspot', 'work', 'sharing'],
    description: 'Supports shared connectivity for work and travel.',
    segment: 'business',
    compatibility: ['Business Pro Plan', 'Family Infinity Plan'],
  },
  {
    id: 'addon-support',
    name: 'Priority Support',
    category: 'feature',
    price: 99,
    tags: ['support', 'priority', 'premium'],
    description: 'Premium support for customers who value service quality.',
    segment: 'premium',
    compatibility: ['Business Pro Plan', 'Family Infinity Plan'],
  },
];

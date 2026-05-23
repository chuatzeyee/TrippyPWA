export const C = {
  paper:          [250, 248, 243],
  white:          [255, 255, 255],
  ink:            [44, 42, 37],
  inkSecondary:   [107, 102, 96],
  inkGhost:       [154, 148, 136],
  terracotta:     [212, 115, 88],
  terracottaLight:[253, 242, 235],
  teal:           [74, 150, 132],
  tealLight:      [236, 247, 244],
  amber:          [208, 154, 72],
  amberLight:     [252, 247, 237],
  sage:           [95, 160, 114],
  divider:        [229, 225, 216],
  cardBorder:     [220, 216, 208],
};

export const DAY_COLORS = [
  [212, 115, 88],
  [74, 150, 132],
  [126, 110, 170],
  [208, 154, 72],
  [107, 148, 190],
  [192, 120, 114],
  [95, 160, 114],
];

export function dayColor(dayNum) {
  return DAY_COLORS[(dayNum - 1) % DAY_COLORS.length];
}

const BADGE_MAP = {
  food: { color: [212, 115, 88], label: 'DINING' },
  dining: { color: [212, 115, 88], label: 'DINING' },
  restaurant: { color: [212, 115, 88], label: 'DINING' },
  lunch: { color: [212, 115, 88], label: 'DINING' },
  dinner: { color: [212, 115, 88], label: 'DINING' },
  'food & drink': { color: [212, 115, 88], label: 'DINING' },
  breakfast: { color: [208, 154, 72], label: 'CAFE' },
  coffee: { color: [208, 154, 72], label: 'CAFE' },
  cafe: { color: [208, 154, 72], label: 'CAFE' },
  'coffee break': { color: [208, 154, 72], label: 'CAFE' },
  'coffee & culture': { color: [208, 154, 72], label: 'CAFE' },
  snack: { color: [208, 154, 72], label: 'CAFE' },
  culture: { color: [126, 110, 170], label: 'CULTURE' },
  museum: { color: [126, 110, 170], label: 'CULTURE' },
  art: { color: [126, 110, 170], label: 'CULTURE' },
  history: { color: [126, 110, 170], label: 'CULTURE' },
  sightseeing: { color: [107, 148, 190], label: 'EXPLORE' },
  'walking tour': { color: [107, 148, 190], label: 'EXPLORE' },
  walk: { color: [107, 148, 190], label: 'EXPLORE' },
  nature: { color: [95, 160, 114], label: 'NATURE' },
  park: { color: [95, 160, 114], label: 'NATURE' },
  garden: { color: [95, 160, 114], label: 'NATURE' },
  beach: { color: [95, 160, 114], label: 'NATURE' },
  shopping: { color: [192, 120, 114], label: 'SHOPPING' },
  market: { color: [192, 120, 114], label: 'SHOPPING' },
  transport: { color: [107, 102, 96], label: 'TRANSIT' },
  flight: { color: [107, 102, 96], label: 'TRANSIT' },
  transfer: { color: [107, 102, 96], label: 'TRANSIT' },
  arrival: { color: [107, 102, 96], label: 'TRANSIT' },
  departure: { color: [107, 102, 96], label: 'TRANSIT' },
  landing: { color: [107, 102, 96], label: 'TRANSIT' },
  stroll: { color: [107, 148, 190], label: 'EXPLORE' },
  'return to accommodation': { color: [74, 150, 132], label: 'STAY' },
  'free time': { color: [107, 148, 190], label: 'LEISURE' },
  leisure: { color: [107, 148, 190], label: 'LEISURE' },
  relaxation: { color: [74, 150, 132], label: 'WELLNESS' },
  'check-in': { color: [74, 150, 132], label: 'STAY' },
  'check-out': { color: [74, 150, 132], label: 'STAY' },
  accommodation: { color: [74, 150, 132], label: 'STAY' },
  hotel: { color: [74, 150, 132], label: 'STAY' },
  entertainment: { color: [126, 110, 170], label: 'NIGHTLIFE' },
  nightlife: { color: [126, 110, 170], label: 'NIGHTLIFE' },
  bar: { color: [126, 110, 170], label: 'NIGHTLIFE' },
  wellness: { color: [74, 150, 132], label: 'WELLNESS' },
  spa: { color: [74, 150, 132], label: 'WELLNESS' },
  sport: { color: [107, 148, 190], label: 'SPORT' },
  adventure: { color: [107, 148, 190], label: 'ADVENTURE' },
};

export function categoryBadge(cat) {
  return BADGE_MAP[(cat || '').toLowerCase()] || { color: [154, 148, 136], label: 'OTHER' };
}

/**
 * knowledgeBase.js
 * -----------------------------------------------------------------------------
 * The shared vocabulary of the platform.
 *
 * Intent extraction, the scoring engine and the merchant AI-profile generator
 * all read from this one file, so "anc" means exactly the same thing whether it
 * was typed by a shopper, stored by a merchant, or scored by the recommender.
 *
 * Adding a new category = adding one entry here.
 */

/* ------------------------------------------------------------- categories */

export const CATEGORY_SYNONYMS = {
  headphones: [
    'headphone', 'headphones', 'earphone', 'earphones', 'earbuds', 'earbud',
    'tws', 'headset', 'airpods', 'neckband',
  ],
  backpack: ['backpack', 'bag', 'bags', 'rucksack', 'laptop bag', 'college bag', 'school bag'],
  laptop: ['laptop', 'laptops', 'notebook computer', 'macbook', 'ultrabook', 'chromebook'],
  smartphone: ['phone', 'phones', 'smartphone', 'mobile', 'handset', 'iphone', 'android phone'],
  smartwatch: ['smartwatch', 'watch', 'fitness band', 'fitness tracker', 'smart watch'],
  keyboard: ['keyboard', 'keyboards', 'mechanical keyboard', 'typing keyboard'],
  monitor: ['monitor', 'display', 'screen', 'external monitor'],
  speaker: ['speaker', 'speakers', 'bluetooth speaker', 'soundbar', 'party speaker'],
};

/**
 * Brands and product lines that imply a category.
 *
 * A shopper who says "is the Vivo Y16 Pro any good?" has named a category
 * without using a category word. This is a WEAK hint - it is only consulted
 * when no ordinary category word was found.
 */
export const BRAND_CATEGORY = {
  smartphone: [
    'vivo', 'oppo', 'realme', 'redmi', 'xiaomi', 'poco', 'iqoo', 'oneplus',
    'motorola', 'moto', 'nokia', 'tecno', 'infinix', 'nothing phone', 'pixel',
    'galaxy s', 'galaxy m', 'galaxy a',
  ],
  laptop: [
    'macbook', 'thinkpad', 'ideapad', 'vivobook', 'zenbook', 'inspiron',
    'latitude', 'pavilion', 'victus', 'omen', 'chromebook',
  ],
  headphones: [
    'airpods', 'galaxy buds', 'wh-1000', 'wf-1000', 'boat', 'jbl',
    'sennheiser', 'skullcandy', 'boult', 'soundcore',
  ],
  smartwatch: ['fitbit', 'garmin', 'amazfit', 'apple watch', 'noise colorfit'],
  backpack: ['american tourister', 'skybags', 'wildcraft', 'safari', 'samsonite'],
  keyboard: ['keychron', 'logitech mx', 'ducky'],
};

/** Category implied by a brand or product line, or null. */
export function categoryFromBrand(text) {
  const lower = text.toLowerCase();
  let best = null;
  for (const [category, brands] of Object.entries(BRAND_CATEGORY)) {
    for (const brand of brands) {
      if (lower.includes(brand) && (!best || brand.length > best.length)) {
        best = { category, brand, length: brand.length };
      }
    }
  }
  return best;
}

/* --------------------------------------------------------------- use cases */

export const USE_CASES = {
  study: ['study', 'studying', 'studies', 'exam', 'revision', 'concentration', 'focus', 'library'],
  college: ['college', 'university', 'campus', 'student', 'school'],
  travel: ['travel', 'travelling', 'traveling', 'trip', 'commute', 'commuting', 'train', 'flight', 'journey'],
  office: ['office', 'work', 'professional', 'meetings', 'business', 'wfh'],
  gaming: ['gaming', 'games', 'gamer', 'game', 'esports', 'fps'],
  coding: ['coding', 'programming', 'development', 'developer', 'software', 'compile', 'code'],
  fitness: ['gym', 'fitness', 'running', 'workout', 'exercise', 'sports', 'jogging'],
  photography: ['photography', 'photos', 'photo', 'vlogging', 'content creation', 'reels'],
  entertainment: ['movies', 'netflix', 'music', 'entertainment', 'streaming', 'binge'],
};

/**
 * Attributes are the columns the recommender reasons over.
 *   boolean : the shopper either needs it or does not
 *   numeric : "at least N" style requirements, higher is better unless noted
 *   base weights are the default point values from the spec (25/30/25/20)
 */
export const ATTRIBUTES = {
  /* audio */
  anc: {
    label: 'Active noise cancellation',
    type: 'boolean',
    categories: ['headphones'],
    weight: 30,
    keywords: ['noise cancellation', 'noise cancelling', 'noise canceling', 'anc', 'noise isolation', 'block noise'],
  },
  battery: {
    label: 'Battery life',
    type: 'numeric',
    unit: 'hours',
    direction: 'higher',
    categories: ['headphones', 'smartphone', 'laptop', 'smartwatch', 'speaker'],
    weight: 25,
    keywords: ['battery', 'backup', 'playback', 'hours of battery', 'battery life', 'mah'],
  },
  wireless: {
    label: 'Wireless',
    type: 'boolean',
    categories: ['headphones', 'keyboard', 'speaker'],
    weight: 15,
    keywords: ['wireless', 'bluetooth', 'cordless', 'without wires'],
  },
  mic: {
    label: 'Built-in microphone',
    type: 'boolean',
    categories: ['headphones'],
    weight: 12,
    keywords: ['mic', 'microphone', 'calls', 'calling', 'meetings'],
  },
  /* bags */
  waterproof: {
    label: 'Waterproof / rain resistant',
    type: 'boolean',
    categories: ['backpack'],
    weight: 30,
    keywords: ['waterproof', 'water resistant', 'water-resistant', 'rain', 'monsoon', 'rainproof', 'wet'],
  },
  laptopCompartment: {
    label: 'Padded laptop compartment',
    type: 'numeric',
    unit: 'inch',
    direction: 'higher',
    categories: ['backpack'],
    weight: 25,
    keywords: ['laptop compartment', 'laptop sleeve', 'carry a laptop', 'laptop', 'inch laptop'],
  },
  antiTheft: {
    label: 'Anti-theft protection',
    type: 'boolean',
    categories: ['backpack'],
    weight: 15,
    keywords: ['anti theft', 'anti-theft', 'antitheft', 'lock', 'secure', 'pickpocket', 'safety'],
  },
  capacity: {
    label: 'Capacity',
    type: 'numeric',
    unit: 'litres',
    direction: 'higher',
    categories: ['backpack'],
    weight: 12,
    keywords: ['capacity', 'litre', 'liter', 'ltr', 'spacious', 'roomy', 'big bag'],
  },
  /* computing */
  ram: {
    label: 'RAM',
    type: 'numeric',
    unit: 'GB',
    direction: 'higher',
    categories: ['laptop', 'smartphone'],
    weight: 25,
    keywords: ['ram', 'memory', 'gb ram', 'multitasking'],
  },
  storage: {
    label: 'Storage',
    type: 'numeric',
    unit: 'GB',
    direction: 'higher',
    categories: ['laptop', 'smartphone'],
    weight: 18,
    keywords: ['storage', 'ssd', 'hard disk', 'rom', 'space', 'gb storage'],
  },
  processor: {
    label: 'Processor class',
    type: 'numeric',
    unit: 'score',
    direction: 'higher',
    categories: ['laptop', 'smartphone'],
    weight: 22,
    keywords: ['processor', 'cpu', 'performance', 'fast', 'speed', 'i5', 'i7', 'ryzen', 'snapdragon'],
  },
  weightKg: {
    label: 'Weight',
    type: 'numeric',
    unit: 'kg',
    direction: 'lower',
    categories: ['laptop', 'backpack'],
    weight: 12,
    keywords: ['light', 'lightweight', 'portable', 'carry around', 'heavy', 'weight'],
  },
  /* phones & cameras */
  camera: {
    label: 'Camera',
    type: 'numeric',
    unit: 'MP',
    direction: 'higher',
    categories: ['smartphone'],
    weight: 28,
    keywords: ['camera', 'photos', 'photography', 'megapixel', 'mp camera', 'selfie', 'picture quality'],
  },
  display: {
    label: 'Display quality',
    type: 'numeric',
    unit: 'score',
    direction: 'higher',
    categories: ['smartphone', 'laptop', 'monitor'],
    weight: 18,
    keywords: ['display', 'screen', 'amoled', 'refresh rate', 'resolution', 'panel'],
  },
  fiveG: {
    label: '5G support',
    type: 'boolean',
    categories: ['smartphone'],
    weight: 15,
    keywords: ['5g', 'five g'],
  },
  /* wearables & misc */
  waterResistant: {
    label: 'Water resistant',
    type: 'boolean',
    categories: ['smartwatch', 'speaker'],
    weight: 18,
    keywords: ['water resistant', 'waterproof', 'swim', 'sweat proof', 'ip67', 'ip68'],
  },
  heartRate: {
    label: 'Heart-rate monitoring',
    type: 'boolean',
    categories: ['smartwatch'],
    weight: 20,
    keywords: ['heart rate', 'heartrate', 'spo2', 'health tracking', 'bpm'],
  },
  backlit: {
    label: 'Backlit keys',
    type: 'boolean',
    categories: ['keyboard'],
    weight: 18,
    keywords: ['backlit', 'rgb', 'lighting', 'illuminated'],
  },
  mechanical: {
    label: 'Mechanical switches',
    type: 'boolean',
    categories: ['keyboard'],
    weight: 22,
    keywords: ['mechanical', 'switches', 'tactile', 'clicky'],
  },
};

/** Attributes relevant to one category, most important first. */
export function attributesForCategory(category) {
  return Object.entries(ATTRIBUTES)
    .filter(([, def]) => !category || def.categories.includes(category))
    .sort((a, b) => b[1].weight - a[1].weight)
    .map(([key, def]) => ({ key, ...def }));
}

/** Which single question is most worth asking next for this category. */
export const CLARIFYING_QUESTIONS = {
  budget: 'What budget are you working with?',
  useCase: 'What will you mainly use it for?',
  category: 'What kind of product are you looking for?',
  headphones: 'Do you need active noise cancellation, or is battery life more important?',
  backpack: 'Do you carry a laptop, and do you need it to survive the rain?',
  laptop: 'What will you run on it - coding, design, office work or gaming?',
  smartphone: 'Is the camera or the battery more important to you?',
  smartwatch: 'Do you want it mainly for fitness tracking or notifications?',
  keyboard: 'Is this for typing, or for gaming?',
  monitor: 'What size and what will you use it for?',
  speaker: 'Indoor listening or outdoor/party use?',
};

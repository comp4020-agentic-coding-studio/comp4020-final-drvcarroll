// game-design.md §9–11: trade, scoring, seasons, players.

export const TRADE = {
  envoyMultiplierPerScience: 0.15,
  earthDeliveryS: 30,
  offerTtlS: 300, // flagged: offer expiry isn't in game-design.md
};

export const SCORE = {
  perRegion: 5,
  perBody: 20,
  economyPer: 5, // 1 point per 5 production/min
  categoryCap: 0.4, // of the threshold
  threshold: 300, // flagged first guess; the sim tunes it (§10)
};

export const SEASON = {
  lengthS: 3600,
  lateJoinCutoffS: 3000,
  newsKept: 50,
};

export const EMPIRE = {
  nameMin: 3,
  nameMax: 24,
  colourClashDistance: 60, // flagged: RGB distance below this is a clash
  presets: [
    "#e6194b", "#3cb44b", "#ffe119", "#4363d8", "#f58231", "#911eb4",
    "#46f0f0", "#f032e6", "#bcf60c", "#fabebe", "#008080", "#e6beff",
    "#9a6324", "#fffac8", "#800000", "#aaffc3", "#808000", "#ffd8b1",
    "#000075", "#a9a9a9", "#ffffff", "#ff6f61", "#6b5b95", "#88b04b",
  ],
};

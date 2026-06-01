import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import batIconUrl from "./assets/images/bat-icon.svg";
import premiumMeterBadgeUrl from "./assets/images/premium-meter-badge.svg";

const STORAGE_KEY = "dream1-swing-tracker-v1";
const ALL = "__all__";
const RANGE_ALL = "all";
const RANGE_TODAY = "today";
const RANGE_WEEK = "week";
const RANGE_MONTH = "month";
const RANGE_YEAR = "year";
const RANGE_TOTAL = "total";
const kMinChartVisibleDays = 7;
const kMaxChartVisibleDays = 365;
const kCompactLayoutWidth = 390;
const kCompactLayoutHeight = 844;
const kScoreProgressAnimationDuration = 5000;
const kStartupSplashDuration = 1460;
const kStartupLogoMoveDelay = 760;
const CHALLENGE_RANGE_TABS = [
  { range: RANGE_WEEK, period: "今週" },
  { range: RANGE_MONTH, period: "今月" },
  { range: RANGE_YEAR, period: "今年" },
];
const RARITY_ORDER = ["D", "C", "B", "A", "S", "SS"];
const RARITY_LABELS = {
  D: "Dream",
  C: "Challenge",
  B: "Brave",
  A: "Ace",
  S: "Star",
  SS: "Super Star",
};
const RARITY_POINTS = {
  D: 1,
  C: 2,
  B: 5,
  A: 10,
  S: 25,
  SS: 100,
};
const RARITY_COLORS = {
  D: "#ab7b52",
  C: "#63b15f",
  B: "#55a9ff",
  A: "#ff7a45",
  S: "#dfe5ee",
  SS: "#ffd447",
};
const PUBLIC_ASSET_BASE = import.meta.env.BASE_URL || "./";
const ALL_BAT_FILTER_COLOR = "#0879f2";
function cssImageUrl(assetUrl) {
  if (typeof document === "undefined") return `url("${assetUrl}")`;
  return `url("${new URL(assetUrl, document.baseURI).href}")`;
}

const NEW_UI_ASSETS = {
  logo: `${PUBLIC_ASSET_BASE}images/logo.png`,
  background: `${PUBLIC_ASSET_BASE}images/field-bg.jpg`,
  pen: `${PUBLIC_ASSET_BASE}images/pen.svg`,
  recordPen: `${PUBLIC_ASSET_BASE}images/pen.png`,
  bat: `${PUBLIC_ASSET_BASE}images/bat.svg`,
  days: `${PUBLIC_ASSET_BASE}images/calendar.svg`,
  count: `${PUBLIC_ASSET_BASE}images/count.svg`,
  avg: `${PUBLIC_ASSET_BASE}images/average.svg`,
  best: `${PUBLIC_ASSET_BASE}images/best.svg`,
  badge: `${PUBLIC_ASSET_BASE}images/badge.svg`,
  flag: `${PUBLIC_ASSET_BASE}images/flag.svg`,
  trophy: `${PUBLIC_ASSET_BASE}images/trophy.svg`,
  navHome: `${PUBLIC_ASSET_BASE}images/icon_home_transparent.png`,
  navChallenge: `${PUBLIC_ASSET_BASE}images/icon_challenge_transparent.png`,
  navBadge: `${PUBLIC_ASSET_BASE}images/icon_badge_transparent.png`,
  navData: `${PUBLIC_ASSET_BASE}images/icon_data_transparent.png`,
  navSettings: `${PUBLIC_ASSET_BASE}images/icon_settings_transparent.png`,
};

const AUDIO_ASSETS = {
  error: `${PUBLIC_ASSET_BASE}audio/error.mp3`,
  get: `${PUBLIC_ASSET_BASE}audio/get.mp3`,
  popup: `${PUBLIC_ASSET_BASE}audio/popup.mp3`,
  score: `${PUBLIC_ASSET_BASE}audio/score.mp3`,
  start: `${PUBLIC_ASSET_BASE}audio/start.mp3`,
  switch: `${PUBLIC_ASSET_BASE}audio/switch.mp3`,
  tab: `${PUBLIC_ASSET_BASE}audio/tab.mp3`,
  tap: `${PUBLIC_ASSET_BASE}audio/tap.mp3`,
};

const AUDIO_PRELOAD_ORDER = ["tap", "tab", "switch", "score", "popup", "error", "get", "start"];
let effectAudioContext = null;
let effectPreloadStarted = false;
const effectAudioBuffers = new Map();
const effectDecodePromises = new Map();
let lastFormErrorSoundAt = 0;

function audioContextForEffects() {
  if (typeof window === "undefined") return null;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  if (effectAudioContext?.state === "closed") effectAudioContext = null;
  if (!effectAudioContext) effectAudioContext = new AudioContextClass();
  return effectAudioContext;
}

function decodeEffectSound(effect) {
  if (effectAudioBuffers.has(effect)) return Promise.resolve(effectAudioBuffers.get(effect));
  if (effectDecodePromises.has(effect)) return effectDecodePromises.get(effect);
  const context = audioContextForEffects();
  if (!context || !AUDIO_ASSETS[effect]) return Promise.resolve(null);
  const promise = fetch(AUDIO_ASSETS[effect], { cache: "force-cache" })
    .then((response) => response.arrayBuffer())
    .then((arrayBuffer) => context.decodeAudioData(arrayBuffer))
    .then((buffer) => {
      effectAudioBuffers.set(effect, buffer);
      return buffer;
    })
    .catch(() => null);
  effectDecodePromises.set(effect, promise);
  return promise;
}

function preloadEffectSounds() {
  if (effectPreloadStarted) return;
  effectPreloadStarted = true;
  AUDIO_PRELOAD_ORDER.forEach((effect) => {
    fetch(AUDIO_ASSETS[effect], { cache: "force-cache" }).catch(() => {});
  });
  const preloadDecodedAudio = () => {
    AUDIO_PRELOAD_ORDER.reduce(
      (chain, effect) => chain.then(() => decodeEffectSound(effect)),
      Promise.resolve(),
    );
  };
  if (typeof window !== "undefined" && "requestIdleCallback" in window) {
    window.requestIdleCallback(preloadDecodedAudio, { timeout: 1200 });
  } else {
    window.setTimeout(preloadDecodedAudio, 250);
  }
}

function playDecodedEffect(context, buffer) {
  try {
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    source.start();
  } catch {
    // Browser audio policy errors are harmless; the next user gesture can retry.
  }
}

function playEffectBuffer(effect, buffer, options = {}) {
  const { resume = true } = options;
  const context = audioContextForEffects();
  if (!context || !buffer) return;
  if (context.state === "running") {
    playDecodedEffect(context, buffer);
    return;
  }
  if (!resume) return;
  context.resume?.().then(() => playDecodedEffect(context, buffer)).catch(() => {});
}

function playEffectSound(effect, options = {}) {
  const context = audioContextForEffects();
  const buffer = effectAudioBuffers.get(effect);
  if (context && context.state !== "running" && options.resume !== false) {
    context.resume?.().catch(() => {});
  }
  if (!context || !buffer) {
    decodeEffectSound(effect).then((decodedBuffer) => playEffectBuffer(effect, decodedBuffer, options));
    return;
  }
  playEffectBuffer(effect, buffer, options);
}

function shouldPlayTapSound(element) {
  if (element?.closest?.("[data-sound-effect]")) return false;
  return Boolean(element?.closest?.("button, [role='button'], [role='tab'], input[type='submit'], .standard-ok-button, .file-control, select"));
}

function playFormErrorSound() {
  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  if (now - lastFormErrorSoundAt < 350) return;
  lastFormErrorSoundAt = now;
  playEffectSound("error");
}

const SCORE_CARD_SKINS = {
  count: { meterGlow: "#37a4ff" },
  avg: { meterGlow: "#44ce35" },
  best: { meterGlow: "#ff9d1b" },
  days: { meterGlow: "#e7333f" },
};
function scrollPageToTop() {
  if (typeof window === "undefined") return;
  const scroll = () => {
    document.scrollingElement?.scrollTo({ top: 0, left: 0, behavior: "auto" });
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  };
  scroll();
  window.requestAnimationFrame(scroll);
}
function scoreFontTokens(value) {
  const digitCount = String(Math.max(0, Math.trunc(Math.abs(Number(value) || 0)))).length;
  const scale = digitCount <= 3 ? 1 : digitCount === 4 ? 0.88 : digitCount === 5 ? 0.76 : digitCount === 6 ? 0.66 : 0.58;
  return {
    "--score-font-min": `${(2.16 * scale).toFixed(3)}rem`,
    "--score-font-mid": `${(2.82 * scale).toFixed(3)}rem`,
    "--score-font-max": `${(2.82 * scale).toFixed(3)}rem`,
  };
}
function growthValueFontTokens(value, baseRem) {
  const digitCount = String(Math.max(0, Math.trunc(Math.abs(Number(value) || 0)))).length;
  const scale = digitCount <= 5 ? 1 : digitCount === 6 ? 0.86 : digitCount === 7 ? 0.76 : 0.66;
  return { "--growth-value-font-size": `${(baseRem * scale).toFixed(3)}rem` };
}
const FIXED_UI_THEME = "#2f86ff";
const RARITY_IMAGE_URLS = {
  D: `${PUBLIC_ASSET_BASE}images/rarity_d.svg`,
  C: `${PUBLIC_ASSET_BASE}images/rarity_c.svg`,
  B: `${PUBLIC_ASSET_BASE}images/rarity_b.svg`,
  A: `${PUBLIC_ASSET_BASE}images/rarity_a.svg`,
  S: `${PUBLIC_ASSET_BASE}images/rarity_s.svg`,
  SS: `${PUBLIC_ASSET_BASE}images/rarity_ss.svg`,
};
const RARITY_NAMEPLATE_URLS = {
  D: `${PUBLIC_ASSET_BASE}images/D_bronze_nameplate.png?v=100`,
  C: `${PUBLIC_ASSET_BASE}images/C_green_nameplate.png?v=100`,
  B: `${PUBLIC_ASSET_BASE}images/B_blue_nameplate.png?v=100`,
  A: `${PUBLIC_ASSET_BASE}images/A_red_nameplate.png?v=100`,
  S: `${PUBLIC_ASSET_BASE}images/S_silver_nameplate.png?v=100`,
  SS: `${PUBLIC_ASSET_BASE}images/SS_gold_nameplate.png?v=100`,
};
const RARITY_CARD_URLS = {
  D: `${PUBLIC_ASSET_BASE}images/D_card.png?v=100`,
  C: `${PUBLIC_ASSET_BASE}images/C_card.png?v=100`,
  B: `${PUBLIC_ASSET_BASE}images/B_card.png?v=100`,
  A: `${PUBLIC_ASSET_BASE}images/A_card.png?v=100`,
  S: `${PUBLIC_ASSET_BASE}images/S_card.png?v=100`,
  SS: `${PUBLIC_ASSET_BASE}images/SS_card.png?v=100`,
};
const CATEGORY_ICON_URLS = {
  count: NEW_UI_ASSETS.count,
  average: NEW_UI_ASSETS.avg,
  best: NEW_UI_ASSETS.best,
  calendar: NEW_UI_ASSETS.days,
  badge: NEW_UI_ASSETS.badge,
  flag: NEW_UI_ASSETS.flag,
  trophy: NEW_UI_ASSETS.trophy,
};
const COLLECTION_CATEGORY_FILTERS = [
  { key: "count", label: "スイング数", icon: "count" },
  { key: "calendar", label: "練習日数", icon: "calendar" },
  { key: "average", label: "平均", icon: "average" },
  { key: "best", label: "ベスト", icon: "best" },
  { key: "all", label: "すべて", icon: "badge" },
];
const DEFAULT_SEASON_EVENT_SETTINGS = {
  spring: { startMonth: 3, startDay: 20, endMonth: 4, endDay: 7 },
  summer: { startMonth: 7, startDay: 20, endMonth: 8, endDay: 31 },
  winter: { startMonth: 12, startDay: 25, endMonth: 1, endDay: 7 },
};
const BADGE_PERIODS = [
  ["daily", "今日"],
  ["weekly", "今週"],
  ["monthly", "今月"],
  ["yearly", "今年"],
  ["special", "初突破"],
];
const SCORE_BAR_SCORE_START = 100;
const SCORE_BAR_HOME_SCORE_END = 999;
const DAILY_BADGE_DEFINITIONS = [
  ...[
    ["D", 25],
    ["D", 50],
    ["C", 75],
    ["B", 100],
  ].map(([rarity, target]) => makeThresholdBadge({
    id: `daily-count-${target}`,
    label: `今日のスイング ${target}回`,
    name: "今日のスイング",
    description: `今日のスイング回数が${target}回以上`,
    conditionText: `${target}回`,
    rarity,
    category: "count",
    period: RANGE_TODAY,
    metric: "count",
    target,
    type: "unique",
  })),
  ...[
    ["D", 250],
    ["D", 350],
    ["C", 450],
    ["B", 550],
    ["A", 650],
    ["S", 750],
  ].map(([rarity, target]) => makeThresholdBadge({
    id: `daily-avg-${target}`,
    label: `今日の平均スコア ${target}`,
    name: "今日の平均スコア",
    description: `今日の平均スコアが${target}点以上`,
    conditionText: `平均${target}以上`,
    rarity,
    category: "average",
    period: RANGE_TODAY,
    metric: "avg",
    target,
    type: "current",
  })),
  ...[
    ["D", 350],
    ["D", 450],
    ["C", 550],
    ["B", 650],
    ["A", 750],
    ["S", 850],
  ].map(([rarity, target]) => makeThresholdBadge({
    id: `daily-best-${target}`,
    label: `今日のベストスコア ${target}`,
    name: "今日のベストスコア",
    description: `今日のベストスコアが${target}点以上`,
    conditionText: `ベスト${target}以上`,
    rarity,
    category: "best",
    period: RANGE_TODAY,
    metric: "best",
    target,
    type: "unique",
  })),
];
const WEEKLY_BADGE_DEFINITIONS = [
  ...[
    ["D", 125],
    ["C", 250],
    ["B", 375],
    ["A", 500],
  ].map(([rarity, target]) => makeThresholdBadge({
    id: `weekly-count-${target}`,
    label: `今週のスイング ${target}回`,
    name: "今週のスイング",
    description: `今週のスイング回数が${target}回以上`,
    conditionText: `${target}回`,
    rarity,
    category: "count",
    period: RANGE_WEEK,
    metric: "count",
    target,
    type: "unique",
  })),
  ...[
    ["D", 1],
    ["C", 2],
    ["B", 3],
    ["A", 4],
    ["S", 5],
  ].map(([rarity, target]) => makeThresholdBadge({
    id: `weekly-days-${target}`,
    label: `今週の練習日数 ${target}日`,
    name: "今週の練習日数",
    description: `今週の練習日数が${target}日以上`,
    conditionText: `${target}日`,
    rarity,
    category: "calendar",
    period: RANGE_WEEK,
    metric: "days",
    target,
    type: "unique",
  })),
];
const MONTHLY_BADGE_DEFINITIONS = [
  ...[
    ["C", 500],
    ["B", 1000],
    ["A", 1500],
    ["S", 2000],
  ].map(([rarity, target]) => makeThresholdBadge({
    id: `monthly-count-${target}`,
    label: `今月のスイング ${target}回`,
    name: "今月のスイング",
    description: `今月のスイング回数が${target}回以上`,
    conditionText: `${target}回`,
    rarity,
    category: "count",
    period: RANGE_MONTH,
    metric: "count",
    target,
    type: "unique",
  })),
  ...[
    ["D", 4],
    ["C", 8],
    ["B", 12],
    ["A", 16],
    ["S", 20],
  ].map(([rarity, target]) => makeThresholdBadge({
    id: `monthly-days-${target}`,
    label: `今月の練習日数 ${target}日`,
    name: "今月の練習日数",
    description: `今月の練習日数が${target}日以上`,
    conditionText: `${target}日`,
    rarity,
    category: "calendar",
    period: RANGE_MONTH,
    metric: "days",
    target,
    type: "unique",
  })),
];
const YEARLY_COUNT_BADGE_DEFINITIONS = [
  ["B", 6000, "今年のスイング 6000回"],
  ["A", 12000, "今年のスイング 12000回"],
  ["S", 18000, "今年のスイング 18000回"],
  ["SS", 24000, "今年のスイング 24000回"],
].map(([rarity, target, name]) => makeThresholdBadge({
  id: `yearly-count-${target}`,
  label: name,
  name,
  description: `今年のスイング回数が${target}回以上`,
  conditionText: `今年${target}回`,
  rarity,
  category: "count",
  period: RANGE_YEAR,
  metric: "count",
  target,
  type: "unique",
}));
const YEARLY_DAYS_BADGE_DEFINITIONS = [
  ["D", 50, "今年の練習日数 50日"],
  ["C", 100, "今年の練習日数 100日"],
  ["B", 150, "今年の練習日数 150日"],
  ["A", 200, "今年の練習日数 200日"],
  ["S", 225, "今年の練習日数 225日"],
  ["SS", 250, "今年の練習日数 250日"],
].map(([rarity, target, name]) => makeThresholdBadge({
  id: `yearly-days-${target}`,
  label: name,
  name,
  description: `今年の練習日数が${target}日以上`,
  conditionText: `今年練習${target}日`,
  rarity,
  category: "calendar",
  period: RANGE_YEAR,
  metric: "days",
  target,
  type: "unique",
}));
const ALL_TIME_AVG_BADGE_DEFINITIONS = [
  ["D", 400],
  ["C", 500],
  ["B", 600],
  ["A", 700],
  ["S", 750],
  ["SS", 800],
].map(([rarity, target]) => makeThresholdBadge({
  id: `all-time-avg-${target}`,
  label: `初突破 平均 ${target}点`,
  name: "平均初突破",
  description: `そのバットでの平均スコアが初めて${target}点以上に到達`,
  conditionText: `平均${target}以上`,
  rarity,
  category: "average",
  period: "special",
  metric: "all-time-avg",
  target,
  type: "repeatable",
}));
const ALL_TIME_BEST_BADGE_DEFINITIONS = [
  ["D", 500],
  ["C", 600],
  ["B", 700],
  ["A", 800],
  ["S", 850],
  ["SS", 900],
].map(([rarity, target]) => makeThresholdBadge({
  id: `all-time-best-${target}`,
  label: `初突破 ベスト ${target}点`,
  name: "ベスト初突破",
  description: `そのバットでのベストスコアが初めて${target}点以上に到達`,
  conditionText: `ベスト${target}以上`,
  rarity,
  category: "best",
  period: "special",
  metric: "all-time-best",
  target,
  type: "repeatable",
}));
const BADGE_DEFINITIONS = [
  ...DAILY_BADGE_DEFINITIONS,
  ...WEEKLY_BADGE_DEFINITIONS,
  ...MONTHLY_BADGE_DEFINITIONS,
  ...YEARLY_COUNT_BADGE_DEFINITIONS,
  ...YEARLY_DAYS_BADGE_DEFINITIONS,
  ...ALL_TIME_AVG_BADGE_DEFINITIONS,
  ...ALL_TIME_BEST_BADGE_DEFINITIONS,
];
const BADGE_DEFINITION_MAP = new Map(BADGE_DEFINITIONS.map((definition) => [definition.label, definition]));
const HOME_BADGE_DEFINITIONS = [
  ...DAILY_BADGE_DEFINITIONS,
  ...WEEKLY_BADGE_DEFINITIONS.filter((definition) => ["count", "days"].includes(definition.metric)),
  ...MONTHLY_BADGE_DEFINITIONS.filter((definition) => ["count", "days"].includes(definition.metric)),
  ...YEARLY_COUNT_BADGE_DEFINITIONS,
  ...YEARLY_DAYS_BADGE_DEFINITIONS,
];

const defaultDb = {
  activeName: "",
  names: [],
  nameColors: {},
  bats: [],
  batColors: {},
  defaultBat: "",
  theme: "#ff7a45",
  fontTheme: "system",
  records: [],
  seasonEventSettings: DEFAULT_SEASON_EVENT_SETTINGS,
  badgeRewardGoal: "",
  badgeRewardText: "",
  testInputDefaults: false,
  testRandomGeneration: false,
  testDate: null,
};

function numericSeed(seed) {
  const text = String(seed ?? "");
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed, offset = 0) {
  const value = Math.sin((numericSeed(seed) + offset) * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

function randomPicker(seed = null) {
  if (seed === null || seed === undefined) return () => Math.random();
  return (offset = 0) => seededRandom(seed, offset);
}

function practiceValuesFromPicker(pick, scoreBias = 0) {
  const goodDay = pick(1) > 0.78;
  const count = Math.round(clamp(
    50 + pick(2) * 34 + (goodDay ? 12 + pick(3) * 14 : 0),
    50,
    108,
  ));
  const avg = Math.round(clamp(
    400 + scoreBias + (pick(4) - 0.5) * 72 + (goodDay ? 10 : 0),
    330,
    480,
  ));
  const best = Math.round(clamp(
    avg + 90 + pick(5) * 85 + (goodDay ? 16 : 0),
    avg + 65,
    650,
  ));
  return { count, avg, best };
}

function randomTestRecordValues(seed = null) {
  return practiceValuesFromPicker(randomPicker(seed));
}

function weekPracticeTarget(seed) {
  const pick = seededRandom(seed, 1);
  if (pick < 0.14) return 4;
  if (pick > 0.88) return 6;
  return 5;
}

function shouldPracticeOnDate(dateObj, seedPrefix = "demo") {
  const weekStart = startOfWeek(dateObj);
  const weekSeed = `${seedPrefix}-${toISO(weekStart)}`;
  const target = weekPracticeTarget(weekSeed);
  const dayOffset = Math.round((startOfDay(dateObj) - startOfDay(weekStart)) / 86400000);
  const skippedWeekday = Math.floor(seededRandom(weekSeed, 2) * 5);
  const extraWeekend = seededRandom(weekSeed, 3) < 0.52 ? 5 : 6;
  if (dayOffset >= 0 && dayOffset <= 4) return target !== 4 || dayOffset !== skippedWeekday;
  if (target === 6) return dayOffset === extraWeekend;
  return false;
}

function secondaryBatFor(bats, mainBat, seed) {
  const alternatives = bats.filter((bat) => bat && bat !== mainBat);
  if (!alternatives.length) return "";
  return alternatives[Math.floor(seededRandom(seed, 1) * alternatives.length)] || alternatives[0];
}

const BAT_COLOR_PALETTE = [
  "#ff3044",
  "#ff9f1c",
  "#f4d35e",
  "#8ac926",
  "#249c68",
  "#31c7c7",
  "#2f86ff",
  "#4d5bff",
  "#a26bff",
  "#f472b6",
  "#b8834b",
  "#8d95a4",
];
const BAT_AUTO_COLOR_PALETTE = [
  "#ff9f1c",
  "#f4d35e",
  "#8ac926",
  "#249c68",
  "#a26bff",
  "#f472b6",
  "#b8834b",
  "#8d95a4",
];

const FONT_THEMES = [
  ["system", "標準"],
  ["rounded", "まるめ"],
  ["clean", "きれいめ"],
  ["sport", "スポーツ"],
  ["friendly", "かわいい"],
];

function fontThemeKey(value) {
  return FONT_THEMES.some(([key]) => key === value) ? value : "system";
}

function normalizeHexColor(value, fallback = BAT_COLOR_PALETTE[0]) {
  const color = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color : fallback;
}

function hexToRgb(value) {
  const color = normalizeHexColor(value).slice(1);
  return {
    r: Number.parseInt(color.slice(0, 2), 16),
    g: Number.parseInt(color.slice(2, 4), 16),
    b: Number.parseInt(color.slice(4, 6), 16),
  };
}

function rgbStringForHex(value) {
  const { r, g, b } = hexToRgb(value);
  return `${r}, ${g}, ${b}`;
}

function darkenHex(value, ratio = 0.62) {
  const { r, g, b } = hexToRgb(value);
  const channel = (next) => Math.max(0, Math.min(255, Math.round(next * ratio))).toString(16).padStart(2, "0");
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

function themeColorFor(theme) {
  if (theme === "red") return "#ff7a45";
  if (theme === "blue") return "#4cc9f0";
  if (theme === "green") return "#7ddf8a";
  return normalizeHexColor(theme, BAT_COLOR_PALETTE[0]);
}

function themeStyleFor(theme) {
  const color = themeColorFor(theme);
  const rgb = rgbStringForHex(color);
  return {
    "--hot": color,
    "--hot-rgb": rgb,
    "--hot-dark": darkenHex(color),
    "--line-hot": `rgba(${rgb}, 0.36)`,
    "--app-bg": `radial-gradient(circle at 50% -14%, rgba(${rgb}, 0.2), transparent 32%), linear-gradient(180deg, #15161d 0%, #08090d 100%)`,
  };
}

function fallbackBatColor(bat, index = 0) {
  const name = String(bat || "");
  if (name.includes("黒")) return "#8d95a4";
  if (name.includes("緑")) return "#249c68";
  if (name.includes("黄") || name.includes("金")) return "#f6b73c";
  return BAT_AUTO_COLOR_PALETTE[index % BAT_AUTO_COLOR_PALETTE.length];
}

function normalizeBatColors(source, bats) {
  return bats.reduce((colors, bat, index) => ({
    ...colors,
    [bat]: normalizeHexColor(source?.[bat], fallbackBatColor(bat, index)),
  }), {});
}

function firstAvailableColor(usedColors, fallback = BAT_COLOR_PALETTE[0]) {
  return BAT_COLOR_PALETTE.find((color) => !usedColors.has(color)) || fallback;
}

function firstAvailableBatColor(usedColors, fallback = BAT_AUTO_COLOR_PALETTE[0]) {
  return BAT_AUTO_COLOR_PALETTE.find((color) => !usedColors.has(color)) || firstAvailableColor(usedColors, fallback);
}

function normalizeNameColors(source, names, legacyTheme = BAT_COLOR_PALETTE[0]) {
  const used = new Set();
  return names.reduce((colors, name, index) => {
    const fallback = index === 0 ? normalizeHexColor(legacyTheme, BAT_COLOR_PALETTE[0]) : firstAvailableColor(used);
    const color = normalizeHexColor(source?.[name], fallback);
    used.add(color);
    return {
      ...colors,
      [name]: color,
    };
  }, {});
}

function batColorFor(db, bat) {
  const index = Math.max(0, db.bats.indexOf(bat));
  return normalizeHexColor(db.batColors?.[bat], fallbackBatColor(bat, index));
}

function nameColorFor(db, name) {
  const legacyTheme = themeColorFor(db.theme);
  const index = Math.max(0, db.names.indexOf(name));
  return normalizeHexColor(db.nameColors?.[name], index === 0 ? legacyTheme : BAT_COLOR_PALETTE[index % BAT_COLOR_PALETTE.length]);
}

function playerNameFontSize(name, compact = false) {
  const length = [...String(name || "")].length;
  if (compact) {
    if (length >= 10) return "0.56rem";
    if (length >= 8) return "0.62rem";
    if (length >= 6) return "0.68rem";
    return "0.78rem";
  }
  if (length >= 14) return "0.56rem";
  if (length >= 12) return "0.6rem";
  if (length >= 10) return "0.64rem";
  if (length >= 8) return "0.69rem";
  return "0.78rem";
}

function SvgIcon({ type }) {
  const props = { viewBox: "0 0 24 24", "aria-hidden": "true" };
  if (type === "home") return <svg {...props}><path d="M3.8 11.2 12 4.6l8.2 6.6" /><path d="M6.2 10.2v9.1h11.6v-9.1" /><path d="M9.4 19.3v-5.2h5.2v5.2" /><path d="M9.4 7.2h5.2" /></svg>;
  if (type === "challenge") return <svg {...props}><path d="M7 5.2h10v5.1a5 5 0 0 1-10 0V5.2Z" /><path d="M7 7H4.4v2.1A3.4 3.4 0 0 0 7.8 12" /><path d="M17 7h2.6v2.1a3.4 3.4 0 0 1-3.4 2.9" /><path d="M12 15.2v3.2" /><path d="M8.6 20.2h6.8" /><path d="m10.2 9.2 1.2 1.2 2.5-2.6" /></svg>;
  if (type === "data") return <svg {...props}><path d="M4 19V5" /><path d="M4 19h16" /><rect x="7" y="11" width="2.8" height="5" rx="1" /><rect x="11" y="8" width="2.8" height="8" rx="1" /><rect x="15" y="5" width="2.8" height="11" rx="1" /></svg>;
  if (type === "log") return <svg {...props}><rect x="4" y="5" width="16" height="15" rx="3" /><path d="M8 3v4M16 3v4M4 10h16" /></svg>;
  if (type === "settings") return <svg {...props}><circle cx="12" cy="12" r="3.2" /><path d="M19 12a7 7 0 0 0-.1-1l2-1.6-2-3.4-2.4 1a7 7 0 0 0-1.8-1L14.4 3h-4.8l-.3 3a7 7 0 0 0-1.8 1l-2.4-1-2 3.4 2 1.6A7 7 0 0 0 5 12a7 7 0 0 0 .1 1l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 1.8 1l.3 3h4.8l.3-3a7 7 0 0 0 1.8-1l2.4 1 2-3.4-2-1.6c.1-.3.1-.7.1-1Z" /></svg>;
  if (type === "font") return <svg {...props}><rect x="4" y="5" width="16" height="14" rx="2.4" /><path d="M8 16 11.1 8h1.8L16 16" /><path d="M9.2 13h5.6" /><path d="M7 21h10" /></svg>;
  if (type === "collection") return <svg {...props}><circle cx="12" cy="9" r="5.6" /><path d="M9.1 13.8 7.3 20.4l4.7-2.7 4.7 2.7-1.8-6.6" /><path d="M12 5.9l.9 1.8 2 .3-1.5 1.4.4 2-1.8-1-1.8 1 .4-2L9.1 8l2-.3L12 5.9Z" /></svg>;
  if (type === "lock") return <svg {...props}><rect x="5" y="10" width="14" height="10" rx="2.4" /><path d="M8.4 10V7.5a3.6 3.6 0 0 1 7.2 0V10" /><path d="M12 14v2.4" /></svg>;
  if (type === "calendar") return <img className="bat-image-icon" src={NEW_UI_ASSETS.days} alt="" aria-hidden="true" />;
  if (type === "check") return <svg {...props}><path d="m5 12 4 4 10-10" /></svg>;
  if (type === "person") return <svg {...props}><circle cx="12" cy="7.4" r="3.4" /><path d="M5 21c.8-4.6 3.2-7 7-7s6.2 2.4 7 7" /></svg>;
  if (type === "count") return <img className="bat-image-icon" src={NEW_UI_ASSETS.count} alt="" aria-hidden="true" />;
  if (type === "avg") return <img className="bat-image-icon" src={NEW_UI_ASSETS.avg} alt="" aria-hidden="true" />;
  if (type === "best") return <img className="bat-image-icon" src={NEW_UI_ASSETS.best} alt="" aria-hidden="true" />;
  if (type === "flag") return <img className="bat-image-icon" src={NEW_UI_ASSETS.flag} alt="" aria-hidden="true" />;
  if (type === "trophy") return <img className="bat-image-icon" src={NEW_UI_ASSETS.trophy} alt="" aria-hidden="true" />;
  if (type === "bat") return <img className="bat-image-icon" src={batIconUrl} alt="" aria-hidden="true" />;
  if (type === "badge") return <svg {...props}><circle cx="12" cy="8" r="4" /><path d="m9 12-2 8 5-3 5 3-2-8" /></svg>;
  if (type === "plus") return <svg {...props}><path d="M12 5v14M5 12h14" /></svg>;
  if (type === "trash") return <svg {...props}><path d="M4 7h16" /><path d="M10 11v6M14 11v6" /><path d="M6 7l1 14h10l1-14" /><path d="M9 7V4h6v3" /></svg>;
  if (type === "download") return <svg {...props}><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></svg>;
  if (type === "chevronDown") return <svg {...props}><path d="m7 9 5 5 5-5" /></svg>;
  return <svg {...props}><path d="M12 21V9" /><path d="m7 14 5-5 5 5" /><path d="M5 3h14" /></svg>;
}

function Icon({ type }) {
  return <span className="icon"><SvgIcon type={type} /></span>;
}

function normalizeSeasonEventSettings(source) {
  const normalized = {};
  Object.entries(DEFAULT_SEASON_EVENT_SETTINGS).forEach(([key, base]) => {
    const candidate = source?.[key] || {};
    normalized[key] = {
      startMonth: clamp(Math.trunc(Number(candidate.startMonth) || base.startMonth), 1, 12),
      startDay: clamp(Math.trunc(Number(candidate.startDay) || base.startDay), 1, 31),
      endMonth: clamp(Math.trunc(Number(candidate.endMonth) || base.endMonth), 1, 12),
      endDay: clamp(Math.trunc(Number(candidate.endDay) || base.endDay), 1, 31),
    };
  });
  return normalized;
}

function makeThresholdBadge(definition) {
  return {
    type: "repeatable",
    trigger: "gte",
    sortOrder: 0,
    ...definition,
  };
}

function periodLabelForBadge(period) {
  if (period === RANGE_TODAY) return "今日";
  if (period === RANGE_WEEK) return "今週";
  if (period === RANGE_MONTH) return "今月";
  if (period === RANGE_YEAR) return "今年";
  return "";
}

function BatIcon({ color = "#8d95a4" }) {
  const iconColor = String(color || "").trim();
  const resolvedColor = iconColor.startsWith("var(") ? iconColor : normalizeHexColor(iconColor, "#8d95a4");
  return <span className="bat-color-icon" style={{ "--bat-icon-color": resolvedColor }} aria-hidden="true" />;
}

function ButtonIcon({ type }) {
  return <span className="button-icon"><SvgIcon type={type} /></span>;
}

function todayISO() {
  return toISO(new Date());
}

function toISO(date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function parseISO(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function startOfWeek(date) {
  const next = new Date(date);
  const day = next.getDay();
  next.setDate(next.getDate() - ((day + 6) % 7));
  return next;
}

function endOfWeek(date) {
  return addDays(startOfWeek(date), 6);
}

function monthLabel(date) {
  return `${date.getMonth() + 1}月`;
}

function formatRangeDate(date) {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function formatDataRangeDate(date) {
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
}

function formatJapaneseDate(date, includeMonth = true) {
  return includeMonth ? `${date.getMonth() + 1}月${date.getDate()}日` : `${date.getDate()}日`;
}

function formatJapaneseRange(start, end) {
  if (toISO(start) === toISO(end)) {
    return formatJapaneseDate(start);
  }
  if (start.getMonth() === end.getMonth()) {
    return `${formatJapaneseDate(start)}〜${formatJapaneseDate(end, false)}`;
  }
  return `${formatJapaneseDate(start)}〜${formatJapaneseDate(end)}`;
}

function formatJapaneseFullDate(date) {
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

function formatJapaneseMonthDay(date) {
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function formatSlashMonthDay(date) {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function formatSlashMonthDayWithWeekday(date) {
  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
  return `${formatSlashMonthDay(date)}（${weekdays[date.getDay()]}）`;
}

function formatSlashRange(start, end) {
  return `${formatSlashMonthDay(start)}〜${formatSlashMonthDay(end)}`;
}

function formatJapaneseMonthDayWithWeekday(date) {
  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
  return `${formatJapaneseMonthDay(date)}（${weekdays[date.getDay()]}）`;
}

function firstRecordDate(records = []) {
  const firstRecord = records
    .filter((record) => record.date <= todayISO())
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  return firstRecord ? parseISO(firstRecord.date) : null;
}

function addYearsFromDate(date, years) {
  return new Date(date.getFullYear() + years, date.getMonth(), date.getDate());
}

function challengeYearCycleAt(records = [], cycleIndex = 0, baseDate = parseISO(todayISO())) {
  const firstDate = firstRecordDate(records) || baseDate;
  const start = addYearsFromDate(firstDate, cycleIndex);
  const nextStart = addYearsFromDate(firstDate, cycleIndex + 1);
  const end = addDays(nextStart, -1);
  return { index: cycleIndex, start, end, label: `${start.getFullYear()}年` };
}

function currentChallengeYearIndex(records = [], baseDate = parseISO(todayISO())) {
  const firstDate = firstRecordDate(records);
  if (!firstDate || baseDate < firstDate) return 0;
  let index = Math.max(0, baseDate.getFullYear() - firstDate.getFullYear());
  while (baseDate < challengeYearCycleAt(records, index).start && index > 0) index -= 1;
  while (baseDate > challengeYearCycleAt(records, index).end) index += 1;
  return index;
}

function challengeYearWindow(records = [], baseDate = parseISO(todayISO())) {
  return challengeYearCycleAt(records, currentChallengeYearIndex(records, baseDate), baseDate);
}

function challengeYearWindowFromFirstDate(firstDate, baseDate = parseISO(todayISO())) {
  if (!firstDate || baseDate < firstDate) {
    const start = firstDate || baseDate;
    const end = addDays(addYearsFromDate(start, 1), -1);
    return { index: 0, start, end, label: `${start.getFullYear()}年` };
  }
  let index = Math.max(0, baseDate.getFullYear() - firstDate.getFullYear());
  const cycleAt = (cycleIndex) => {
    const start = addYearsFromDate(firstDate, cycleIndex);
    const end = addDays(addYearsFromDate(firstDate, cycleIndex + 1), -1);
    return { index: cycleIndex, start, end, label: `${start.getFullYear()}年` };
  };
  let window = cycleAt(index);
  while (baseDate < window.start && index > 0) {
    index -= 1;
    window = cycleAt(index);
  }
  while (baseDate > window.end) {
    index += 1;
    window = cycleAt(index);
  }
  return window;
}

function challengeYearHistoryWindows(records = [], baseDate = parseISO(todayISO())) {
  const currentIndex = currentChallengeYearIndex(records, baseDate);
  return Array.from({ length: currentIndex }, (_, offset) => {
    const age = offset + 1;
    const history = challengeYearCycleAt(records, currentIndex - age, baseDate);
    return {
      ...history,
      age,
      title: `${history.start.getFullYear()}年`,
    };
  });
}

function rangeWindow(range, baseDate = parseISO(todayISO())) {
  if (range === RANGE_WEEK) {
    const start = startOfWeek(baseDate);
    const end = endOfWeek(baseDate);
    return { start, end, title: "今週の実績", label: formatJapaneseRange(start, end) };
  }
  if (range === RANGE_MONTH) {
    const start = startOfMonth(baseDate);
    const end = endOfMonth(baseDate);
    return { start, end, title: "今月の実績", label: formatJapaneseRange(start, end) };
  }
  return { start: baseDate, end: baseDate, title: "今日の実績", label: formatJapaneseDate(baseDate) };
}

function viewWindowForRange(records, range = RANGE_TODAY, activeDate = todayISO()) {
  if (range === RANGE_YEAR) return challengeYearWindow(records, parseISO(activeDate));
  if (range === RANGE_WEEK || range === RANGE_MONTH) return rangeWindow(range, parseISO(activeDate));
  const date = parseISO(activeDate);
  return { start: date, end: date, label: formatJapaneseDate(date) };
}

function previousChallengeWindow(records, range, start, end) {
  if (range === RANGE_WEEK) return { start: addDays(start, -7), end: addDays(end, -7), label: "先週" };
  if (range === RANGE_MONTH) return { start: startOfMonth(addDays(start, -1)), end: endOfMonth(addDays(start, -1)), label: "先月" };
  if (range === RANGE_YEAR) {
    return { start: addYearsFromDate(start, -1), end: addDays(start, -1), label: "去年" };
  }
  return null;
}

function growthBadgeLabelsForRange(range) {
  if (range === RANGE_WEEK) return {
    previousLabel: "先週",
  };
  if (range === RANGE_MONTH) return {
    previousLabel: "先月",
  };
  return null;
}

function scoreBarDomainForCard(card, definitions) {
  const numericTargets = definitions
    .map((definition) => Number(definition.target))
    .filter((target) => Number.isFinite(target));
  const maxTarget = Math.max(...numericTargets, 1);
  if (card.metric === "count") return { start: 0, end: maxTarget };
  if (card.metric === "avg" || card.metric === "best") {
    if (card.range === RANGE_TODAY) return { start: SCORE_BAR_SCORE_START, end: SCORE_BAR_HOME_SCORE_END };
    const customStart = Math.min(...definitions
      .map((definition) => Number(definition.scoreBarStart))
      .filter((target) => Number.isFinite(target)));
    const customEnd = Math.max(...definitions
      .map((definition) => Number(definition.scoreBarEnd))
      .filter((target) => Number.isFinite(target)));
    if (Number.isFinite(customStart) && Number.isFinite(customEnd) && customEnd > customStart) {
      return { start: customStart, end: customEnd };
    }
    const firstTarget = Math.min(...numericTargets);
    return {
      start: Number.isFinite(firstTarget) ? firstTarget - 100 : SCORE_BAR_SCORE_START,
      end: Math.max(SCORE_BAR_SCORE_START + 1, ...numericTargets),
    };
  }
  return { start: 0, end: maxTarget };
}

function badgeFilterWindow(filter, baseDate = parseISO(todayISO()), records = []) {
  if (filter === RANGE_TODAY) return { start: baseDate, end: baseDate };
  if (filter === RANGE_WEEK) return { start: startOfWeek(baseDate), end: endOfWeek(baseDate) };
  if (filter === RANGE_MONTH) return { start: startOfMonth(baseDate), end: endOfMonth(baseDate) };
  if (filter === "year") {
    const { start, end } = challengeYearWindow(records, baseDate);
    return { start, end };
  }
  return { start: null, end: null };
}

function periodKeyForRange(range) {
  if (range === RANGE_WEEK) return 7;
  if (range === RANGE_MONTH) return 30;
  return 1;
}

function uid() {
  return `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

function loadDb() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(defaultDb);
    const parsed = JSON.parse(raw);
    const bats = Array.isArray(parsed.bats) ? parsed.bats : [];
    const names = Array.isArray(parsed.names) ? parsed.names : [];
    const legacyTheme = ["red", "blue", "green"].includes(parsed.theme) ? themeColorFor(parsed.theme) : normalizeHexColor(parsed.theme, BAT_COLOR_PALETTE[0]);
    return {
      activeName: parsed.activeName || names[0] || "",
      names,
      nameColors: normalizeNameColors(parsed.nameColors, names, legacyTheme),
      bats,
      batColors: normalizeBatColors(parsed.batColors, bats),
      defaultBat: parsed.bats?.includes(parsed.defaultBat) ? parsed.defaultBat : parsed.bats?.[0] || "",
      theme: legacyTheme,
      fontTheme: fontThemeKey(parsed.fontTheme),
      records: Array.isArray(parsed.records) ? parsed.records : [],
      seasonEventSettings: normalizeSeasonEventSettings(parsed.seasonEventSettings),
      badgeRewardGoal: String(parsed.badgeRewardGoal || ""),
      badgeRewardText: String(parsed.badgeRewardText || ""),
      testInputDefaults: Boolean(parsed.testInputDefaults),
      testRandomGeneration: Boolean(parsed.testRandomGeneration),
      testDate: /^\d{4}-\d{2}-\d{2}$/.test(parsed.testDate || "") ? parsed.testDate : null,
    };
  } catch {
    return structuredClone(defaultDb);
  }
}

function aggregate(records) {
  const map = new Map();
  records.forEach((record) => {
    const item = map.get(record.date) || { date: record.date, count: 0, avgTotal: 0, best: 0, bats: new Set() };
    item.count += record.count;
    item.avgTotal += record.avg * record.count;
    item.best = Math.max(item.best, record.best);
    item.bats.add(record.bat);
    map.set(record.date, item);
  });
  return [...map.values()].map((item) => ({
    date: item.date,
    count: item.count,
    avg: item.count ? Math.round(item.avgTotal / item.count) : 0,
    best: item.best,
    bats: [...item.bats],
  })).sort((a, b) => a.date.localeCompare(b.date));
}

function aggregateByBat(records) {
  const map = new Map();
  records.forEach((record) => {
    const item = map.get(record.bat) || { bat: record.bat, count: 0, avgTotal: 0, best: 0 };
    item.count += record.count;
    item.avgTotal += record.avg * record.count;
    item.best = Math.max(item.best, record.best);
    map.set(record.bat, item);
  });
  return [...map.values()].map((item) => ({
    bat: item.bat,
    count: item.count,
    avg: item.count ? Math.round(item.avgTotal / item.count) : 0,
    best: item.best,
  }));
}

function periodSummaryFromDaily(dailyMap, start, end, baseDate = todayISO()) {
  const today = parseISO(baseDate);
  const effectiveEnd = end > today ? today : end;
  const spanDays = Math.max(1, Math.floor((effectiveEnd - start) / 86400000) + 1);
  let count = 0;
  let weightedTotal = 0;
  let best = 0;
  let practiceDays = 0;
  let periodAverageTotal = 0;

  for (let offset = 0; offset < spanDays; offset += 1) {
    const date = toISO(addDays(start, offset));
    const day = dailyMap.get(date);
    if (!day) continue;
    count += day.count;
    weightedTotal += day.avg * day.count;
    best = Math.max(best, day.best || 0);
    periodAverageTotal += day.avg || 0;
    practiceDays += 1;
  }

  return {
    count,
    avg: count ? Math.round(weightedTotal / count) : 0,
    badgeAvg: Math.round(periodAverageTotal / spanDays),
    best,
    days: practiceDays,
    spanDays,
  };
}

function summaryForRecordsRange(records, range = RANGE_TODAY, activeDate = todayISO()) {
  if (range === RANGE_WEEK || range === RANGE_MONTH || range === RANGE_YEAR) {
    const { start, end } = viewWindowForRange(records, range, activeDate);
    const periodRecords = records.filter((record) => record.date >= toISO(start) && record.date <= toISO(end));
    const dailyMap = new Map(aggregate(periodRecords).map((day) => [day.date, day]));
    const summary = periodSummaryFromDaily(dailyMap, start, end, activeDate);
    const growthLabels = growthBadgeLabelsForRange(range);
    const previousWindow = previousChallengeWindow(records, range, start, end);
    if (growthLabels && previousWindow) {
      const previousStart = previousWindow.start;
      const previousEnd = previousWindow.end;
      const previousRecords = records.filter((record) => record.date >= toISO(previousStart) && record.date <= toISO(previousEnd));
      const previousDailyMap = new Map(aggregate(previousRecords).map((day) => [day.date, day]));
      const previousSummary = periodSummaryFromDaily(previousDailyMap, previousStart, previousEnd, toISO(previousEnd));
      if (previousRecords.length && previousSummary.count > 0) {
        summary.avgTarget = previousSummary.avg;
        summary.avgTargetPreviousLabel = growthLabels.previousLabel;
      }
      if (previousRecords.length && previousSummary.count > 0) {
        summary.bestTarget = previousSummary.best;
        summary.bestTargetPreviousLabel = growthLabels.previousLabel;
      }
    }
    return summary;
  }
  return aggregate(records.filter((record) => record.date === activeDate))[0] || emptyDailySummary(activeDate);
}

function recordsForViewRange(records, range = RANGE_TODAY, activeDate = todayISO()) {
  if (range === RANGE_WEEK || range === RANGE_MONTH || range === RANGE_YEAR) {
    const { start, end } = viewWindowForRange(records, range, activeDate);
    return records.filter((record) => record.date >= toISO(start) && record.date <= toISO(end));
  }
  return records.filter((record) => record.date === activeDate);
}

function streakByDate(daily) {
  const streaks = new Map();
  let previousDate = null;
  let currentStreak = 0;

  daily.forEach((day) => {
    const date = parseISO(day.date);
    const continued = previousDate && toISO(addDays(previousDate, 1)) === day.date;
    currentStreak = continued ? currentStreak + 1 : 1;
    streaks.set(day.date, currentStreak);
    previousDate = date;
  });

  return streaks;
}

function homeBadgeMetricValue(definition, summary) {
  if (definition.metric === "count") return summary.count;
  if (definition.metric === "avg") return summary.avg;
  if (definition.metric === "best") return summary.best;
  if (definition.metric === "days") return summary.days;
  return 0;
}

function homeBadgeTarget(definition, summary) {
  return definition.target;
}

function addHomeBadge(map, date, label) {
  map.set(date, [...(map.get(date) || []), label]);
}

function isHomeBadgeEarned(definition, summary) {
  const value = homeBadgeMetricValue(definition, summary);
  const target = homeBadgeTarget(definition, summary);
  return definition.trigger === "exact" ? value === target : value >= target;
}

function seasonWindowForYear(settings, year) {
  const start = new Date(year, settings.startMonth - 1, settings.startDay);
  const wraps = settings.endMonth < settings.startMonth || (
    settings.endMonth === settings.startMonth && settings.endDay < settings.startDay
  );
  const endYear = wraps ? year + 1 : year;
  const end = new Date(endYear, settings.endMonth - 1, settings.endDay);
  return { start, end, wraps };
}

function seasonSummaryForWindow(dailyMap, start, end) {
  let count = 0;
  let days = 0;
  for (let cursor = new Date(start); cursor <= end; cursor = addDays(cursor, 1)) {
    const day = dailyMap.get(toISO(cursor));
    if (!day) continue;
    count += day.count || 0;
    if ((day.count || 0) > 0) days += 1;
  }
  return { count, days };
}

function badgesFor(records, baseDate = todayISO()) {
  const daily = aggregate(records);
  const dailyMap = new Map(daily.map((day) => [day.date, day]));
  const byDate = new Map();

  daily.forEach((day) => {
    const summary = { ...day, days: day.count > 0 ? 1 : 0, spanDays: 1 };
    HOME_BADGE_DEFINITIONS
      .filter((definition) => definition.period === RANGE_TODAY)
      .forEach((definition) => {
        if (isHomeBadgeEarned(definition, summary)) {
          addHomeBadge(byDate, day.date, definition.label);
        }
      });
  });

  const batDayMap = new Map();
  records.forEach((record) => {
    if (!record.bat) return;
    const key = `${record.bat}\u0000${record.date}`;
    const item = batDayMap.get(key) || { bat: record.bat, date: record.date, count: 0, avgTotal: 0, best: 0 };
    item.count += record.count || 0;
    item.avgTotal += (record.avg || 0) * (record.count || 0);
    item.best = Math.max(item.best, record.best || 0);
    batDayMap.set(key, item);
  });
  const batBestMap = new Map();
  [...batDayMap.values()]
    .map((item) => ({
      bat: item.bat,
      date: item.date,
      avg: item.count ? Math.round(item.avgTotal / item.count) : 0,
      best: item.best,
    }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.bat.localeCompare(b.bat, "ja"))
    .forEach((day) => {
      const best = batBestMap.get(day.bat) || { avg: 0, best: 0 };
      if ((day.avg || 0) > best.avg) {
        ALL_TIME_AVG_BADGE_DEFINITIONS.forEach((definition) => {
          if ((day.avg || 0) >= definition.target && best.avg < definition.target) {
            addHomeBadge(byDate, day.date, definition.label);
          }
        });
      }
      if ((day.best || 0) > best.best) {
        ALL_TIME_BEST_BADGE_DEFINITIONS.forEach((definition) => {
          if ((day.best || 0) >= definition.target && best.best < definition.target) {
            addHomeBadge(byDate, day.date, definition.label);
          }
        });
      }
      batBestMap.set(day.bat, {
        avg: Math.max(best.avg, day.avg || 0),
        best: Math.max(best.best, day.best || 0),
      });
    });

  const periodKeys = new Map();
  daily.forEach((day) => {
    const dateValue = parseISO(day.date);
    const weekKey = toISO(startOfWeek(dateValue));
    const monthKey = day.date.slice(0, 7);
    periodKeys.set(`week:${weekKey}`, { period: RANGE_WEEK, start: startOfWeek(dateValue), end: endOfWeek(dateValue), earnedAt: day.date });
    periodKeys.set(`month:${monthKey}`, { period: RANGE_MONTH, start: startOfMonth(dateValue), end: endOfMonth(dateValue), earnedAt: day.date });
    periodKeys.set(`year:${dateValue.getFullYear()}`, {
      period: RANGE_YEAR,
      start: new Date(dateValue.getFullYear(), 0, 1),
      end: new Date(dateValue.getFullYear(), 11, 31),
      earnedAt: day.date,
    });
  });

  periodKeys.forEach((period) => {
    const summary = periodSummaryFromDaily(dailyMap, period.start, period.end, baseDate);
    HOME_BADGE_DEFINITIONS.filter((definition) => definition.period === period.period).forEach((definition) => {
      if (isHomeBadgeEarned(definition, summary)) {
        addHomeBadge(byDate, period.earnedAt, definition.label);
      }
    });

  });

  return byDate;
}

function pathFromPoints(points) {
  if (!points.length) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y} L ${points[0].x + 0.1} ${points[0].y}`;
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function scaleForVisibleDays(itemCount, visibleDays) {
  if (itemCount <= 1) {
    return 1;
  }
  const visibleCount = Math.max(2, Math.min(itemCount, visibleDays));
  return Math.max(1, (itemCount - 1) / (visibleCount - 1));
}

function constrainChartView(view, plotWidth, minScale = 1, maxScale = Infinity) {
  const scale = clamp(view.scale, minScale, maxScale);
  const minOffset = plotWidth - (plotWidth * scale);
  return {
    scale,
    offset: clamp(view.offset, minOffset, 0),
  };
}

function maxChartScale(itemCount) {
  return scaleForVisibleDays(itemCount, kMinChartVisibleDays);
}

function minChartScale(itemCount) {
  return scaleForVisibleDays(itemCount, kMaxChartVisibleDays);
}

function initialChartView(itemCount, range, plotWidth) {
  if (itemCount <= 1) {
    return { scale: 1, offset: 0 };
  }
  const scale = scaleForVisibleDays(itemCount, range === RANGE_ALL ? kMaxChartVisibleDays : range);
  return constrainChartView({
    scale,
    offset: plotWidth - (plotWidth * scale),
  }, plotWidth, minChartScale(itemCount), Math.max(maxChartScale(itemCount), scale));
}

function pointerDistance(first, second) {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

function compareLabel(index, range) {
  if (index === 0) {
    if (range === RANGE_TODAY) return "今日";
    if (range === RANGE_WEEK) return "今週";
    if (range === RANGE_MONTH) return "今月";
  }
  if (range === RANGE_TODAY) return index === 1 ? "昨日" : `${index}日前`;
  if (range === RANGE_WEEK) return `${index}週前`;
  if (range === RANGE_MONTH) return `${index}か月前`;
  return "";
}

function comparisonBuckets(daily, range, minimumBuckets = null, baseDate = parseISO(todayISO())) {
  const bucketRange = range === RANGE_WEEK ? 7 : range === RANGE_MONTH ? 30 : 1;
  const map = new Map(daily.map((day) => [day.date, day]));
  const today = baseDate;
  const earliest = daily.length ? parseISO(daily[0].date) : today;
  const startAnchor = range === RANGE_WEEK ? startOfWeek(today) : range === RANGE_MONTH ? startOfMonth(today) : today;
  const firstAnchor = range === RANGE_WEEK ? startOfWeek(earliest) : range === RANGE_MONTH ? startOfMonth(earliest) : earliest;
  const diffUnit = range === RANGE_MONTH
    ? ((startAnchor.getFullYear() - firstAnchor.getFullYear()) * 12) + (startAnchor.getMonth() - firstAnchor.getMonth())
    : Math.floor((startAnchor - firstAnchor) / 86400000 / bucketRange);
  const minBuckets = minimumBuckets ?? (range === RANGE_TODAY ? 8 : range === RANGE_WEEK ? 5 : range === RANGE_MONTH ? 6 : 7);
  const bucketCount = Math.max(minBuckets, diffUnit + 1);

  return Array.from({ length: bucketCount }, (_, bucketIndex) => {
    const start = range === RANGE_MONTH
      ? new Date(startAnchor.getFullYear(), startAnchor.getMonth() - bucketIndex, 1)
      : addDays(startAnchor, -(bucketIndex * bucketRange));
    const end = range === RANGE_MONTH ? endOfMonth(start) : addDays(start, bucketRange - 1);
    const spanDays = Math.floor((end - start) / 86400000) + 1;
    let count = 0;
    let avgTotal = 0;
    let avgDays = 0;
    let best = 0;

    for (let offset = 0; offset < spanDays; offset += 1) {
      const date = toISO(addDays(start, offset));
      const day = map.get(date);
      if (!day) continue;
      count += day.count;
      if (Number.isFinite(day.avg) && day.count > 0) {
        avgTotal += day.avg * day.count;
        avgDays += day.count;
      }
      best = Math.max(best, day.best || 0);
    }

    return {
      label: compareLabel(bucketIndex, range) || (range === RANGE_MONTH ? monthLabel(start) : formatRangeDate(start)),
      rangeLabel: `${toISO(start).slice(5).replace("-", "/")}-${toISO(end).slice(5).replace("-", "/")}`,
      avg: avgDays ? Math.round(avgTotal / avgDays) : null,
      best: count ? best : null,
      count,
    };
  });
}

function Metric({ icon, label, value, unit }) {
  return (
    <div className="metric-card">
      <div className="metric-label"><Icon type={icon} />{label}</div>
      <strong>{Number(value || 0).toLocaleString("ja-JP")}<span>{unit}</span></strong>
    </div>
  );
}

function progressInfo(kind, value, range, variableTarget, targets = null) {
  const definitions = targets
    ? targets.map((target) => (
        typeof target === "number"
          ? { target, progressTarget: target, label: `${target}`, description: `${target}達成` }
          : { ...target, progressTarget: target.target }
      ))
    : HOME_BADGE_DEFINITIONS
      .filter((definition) => (
        definition.period === range &&
        definition.metric === kind &&
        (typeof definition.target === "number" || (definition.target === "all" && variableTarget))
      ))
      .map((definition) => ({
        ...definition,
        progressTarget: definition.target === "all" ? variableTarget : definition.target,
      }));
  definitions.sort((a, b) => a.progressTarget - b.progressTarget);
  const fallback = definitions.at(-1) || { progressTarget: 1, label: "次のバッジ" };
  const next = definitions.find((definition) => value < definition.progressTarget) || fallback;
  const previous = [...definitions].reverse().find((definition) => definition.progressTarget < next.progressTarget)?.progressTarget || 0;
  return {
    goal: next.progressTarget,
    previous,
    remaining: Math.max(0, next.progressTarget - value),
    earned: definitions.filter((definition) => value >= definition.progressTarget).length,
    badgeLabel: next.label,
    badgeDescription: next.description || `${next.label}まであと${Math.max(0, next.progressTarget - value).toLocaleString("ja-JP")}`,
    badgeTarget: next.progressTarget,
  };
}

function progressRatioFor(info, value) {
  const span = Math.max(1, info.goal - info.previous);
  return clamp((Number(value || 0) - info.previous) / span, 0, 1);
}

function buildAchievementCard({ key, icon, label, value, unit, kind, range, variableTarget = null, pending = false, badgeEligible = true }) {
  const info = badgeEligible ? progressInfo(kind, Number(value || 0), range, variableTarget) : null;
  return {
    icon,
    key: key || kind,
    label,
    value: Number(value || 0),
    unit,
    kind,
    range,
    targets: null,
    variableTarget,
    pending,
    badgeEligible,
    info,
    ratio: info ? progressRatioFor(info, value) : -1,
  };
}

function buildAchievementCardWithTargets({ key, icon, label, value, unit, kind, range, targets }) {
  const info = progressInfo(kind, Number(value || 0), range, null, targets);
  return {
    icon,
    key: key || kind,
    label,
    value: Number(value || 0),
    unit,
    kind,
    range,
    targets,
    variableTarget: null,
    pending: false,
    badgeEligible: true,
    info,
    ratio: progressRatioFor(info, value),
  };
}

function progressUnitForKind(kind) {
  if (kind === "count") return "回";
  if (kind === "avg" || kind === "best") return "点";
  if (kind === "streak" || kind === "days") return "日";
  if (kind === "badge-points") return "pt";
  if (kind === "badge-types") return "種類";
  return "";
}

function ProgressMeter({ kind, value, range, variableTarget, targets, focus = false, showBadgeIcon = true, customGoal = null }) {
  const [selectedBadge, setSelectedBadge] = useState(null);
  const meterRef = useRef(null);
  const rawInfo = progressInfo(kind, Number(value || 0), range, variableTarget, targets);
  const customGoalValue = Number(customGoal);
  const hasCustomGoal = Number.isFinite(customGoalValue) && customGoalValue > 0;
  const info = hasCustomGoal ? {
    ...rawInfo,
    previous: 0,
    goal: customGoalValue,
    remaining: Math.max(0, Math.ceil(customGoalValue - Number(value || 0))),
  } : rawInfo;
  const targetBadge = makeBadgeDefinition(info.badgeLabel, {
    description: info.badgeDescription,
  });
  const span = Math.max(1, info.goal - info.previous);
  const ratio = clamp((Number(value || 0) - info.previous) / span, 0, 1);
  const circumference = 169.65;
  const gap = 22;
  const arc = circumference - gap;
  const valueArc = arc * ratio;
  const meterRotation = "rotate(-90 36 36)";

  return (
    <div className={`progress-meter ${kind}`} ref={meterRef}>
      <div className="meter-ring">
        <svg viewBox="0 0 72 72" aria-hidden="true">
          <circle
            className="meter-track"
            cx="36"
            cy="36"
            r="27"
            strokeDasharray={`${arc} ${gap}`}
            transform={meterRotation}
          />
          <circle
            className="meter-glow meter-glow-wide"
            cx="36"
            cy="36"
            r="27"
            strokeDasharray={`${valueArc} ${circumference - valueArc}`}
            transform={meterRotation}
          />
          <circle
            className="meter-glow meter-glow-core"
            cx="36"
            cy="36"
            r="27"
            strokeDasharray={`${valueArc} ${circumference - valueArc}`}
            transform={meterRotation}
          />
          <circle
            className="meter-value"
            cx="36"
            cy="36"
            r="27"
            strokeDasharray={`${valueArc} ${circumference - valueArc}`}
            transform={meterRotation}
          />
        </svg>
        {focus ? (
          <div className="meter-premium-badge">
            <img src={premiumMeterBadgeUrl} alt="" aria-hidden="true" />
          </div>
        ) : (
          <span className="meter-remaining">
            <em>あと</em>
            <b>{info.remaining.toLocaleString("ja-JP")}</b>
          </span>
        )}
        {showBadgeIcon && (
          <button
            className={`meter-badge ring-meter-badge rarity-${targetBadge.rarity.toLowerCase()}`}
            type="button"
            data-sound-effect="popup"
            aria-label={`${targetBadge.label}の詳細`}
            onClick={() => setSelectedBadge({ ...targetBadge, earnedCount: 0, lockedSecret: false })}
          >
            <span className="meter-badge-icon"><RarityIcon rarity={targetBadge.rarity} /></span>
          </button>
        )}
        {selectedBadge && (
          <BadgeDetailPopover badge={selectedBadge} onClose={() => setSelectedBadge(null)} />
        )}
      </div>
    </div>
  );
}

function AchievementMetric({ icon, label, value, unit, kind, range, showMeter = true, variableTarget = null, targets = null, pending = false }) {
  return (
    <div className={`achievement-metric ${kind} ${pending ? "pending" : ""}`}>
      <div>
        <div className="metric-label"><Icon type={icon} />{label}</div>
        <strong>
          {Number(value || 0).toLocaleString("ja-JP")}
          <span className="metric-unit-wrap">
            {pending && <em className="pending-label">未確定</em>}
            <span>{unit}</span>
          </span>
        </strong>
      </div>
      {showMeter && <ProgressMeter kind={kind} value={value} range={range} variableTarget={variableTarget} targets={targets} />}
    </div>
  );
}

function AchievementCards({ cards }) {
  const automaticFeatured = cards
    .filter((card) => card.badgeEligible)
    .sort((a, b) => b.ratio - a.ratio || a.info.remaining - b.info.remaining)[0] || cards[0];
  const [featuredKey, setFeaturedKey] = useState(automaticFeatured?.key);
  useEffect(() => {
    setFeaturedKey(automaticFeatured?.key);
  }, [automaticFeatured?.key, cards.map((card) => card.key).join(":")]);
  const featured = cards.find((card) => card.key === featuredKey) || automaticFeatured;
  const compactCards = cards.filter((card) => card.key !== featured.key);
  const selectCard = (card) => {
    if (card.key === featured.key) return;
    if (document.startViewTransition) {
      document.startViewTransition(() => setFeaturedKey(card.key));
      return;
    }
    setFeaturedKey(card.key);
  };
  return (
    <div className="achievement-card-stack">
      {featured && <AchievementFocusCard card={featured} />}
      <div className="achievement-compact-grid">
        {compactCards.map((card) => <AchievementCompactCard card={card} onSelect={() => selectCard(card)} key={card.key} />)}
      </div>
    </div>
  );
}

function AchievementFocusCard({ card }) {
  return (
    <article className={`achievement-focus-card ${card.kind}`} style={{ viewTransitionName: `achievement-${card.key}` }}>
      <div className="achievement-focus-copy">
        <div className="metric-label"><Icon type={card.icon} />{card.label}</div>
        <strong>{card.value.toLocaleString("ja-JP")}<span>{card.unit}</span></strong>
        {card.info && <BadgeChip label={card.info.badgeLabel} count={0} description={card.info.badgeDescription} />}
      </div>
      {card.badgeEligible && (
        <ProgressMeter kind={card.kind} value={card.value} range={card.range} variableTarget={card.variableTarget} targets={card.targets} focus />
      )}
    </article>
  );
}

function AchievementCompactCard({ card, onSelect }) {
  return (
    <button
      className={`achievement-compact-card ${card.kind} ${card.badgeEligible ? "" : "no-badge"} ${card.pending ? "pending" : ""}`}
      type="button"
      onClick={onSelect}
      style={{ viewTransitionName: `achievement-${card.key}` }}
    >
      <div className="metric-label"><Icon type={card.icon} />{card.label}</div>
      <strong>{card.value.toLocaleString("ja-JP")}<span>{card.unit}</span></strong>
      {card.pending && <em>未確定</em>}
      {card.info ? (
        <>
          <div className="compact-progress-bar" aria-hidden="true">
            <span style={{ width: `${Math.round(card.ratio * 100)}%` }} />
          </div>
          <small>あと{card.info.remaining.toLocaleString("ja-JP")}！</small>
        </>
      ) : (
        <small>過去最高更新中！</small>
      )}
    </button>
  );
}

function dailyBadgeMilestones(metric, value, targets = null, domain = null) {
  const definitions = targets || HOME_BADGE_DEFINITIONS
    .filter((definition) => definition.period === RANGE_TODAY && definition.metric === metric && typeof definition.target === "number");
  const numericDefinitions = definitions.filter((definition) => Number.isFinite(Number(definition.target)));
  const numericTargets = numericDefinitions.map((definition) => Number(definition.target));
  const start = Number.isFinite(domain?.start) ? Number(domain.start) : 0;
  const end = Number.isFinite(domain?.end) ? Number(domain.end) : Math.max(...numericTargets, 1);
  const span = Math.max(1, end - start);
  const safeValue = Number(value) || 0;
  return definitions
    .filter((definition) => Number.isFinite(Number(definition.target)))
    .sort((a, b) => a.target - b.target)
    .map((definition) => {
      const target = Number(definition.target);
      return {
        ...definition,
        target,
        earned: safeValue >= target,
        position: clamp(((target - start) / span) * 100, 0, 100),
        targetProgress: clamp((safeValue - start) / Math.max(1, target - start), 0, 1),
      };
    });
}

function dailyResultBadge(metric, value, targets = null, domain = null) {
  return [...dailyBadgeMilestones(metric, value, targets, domain)].reverse().find((definition) => definition.earned) || null;
}

function badgeDefinitionsForMetric(range, metric, variableTarget = null) {
  return HOME_BADGE_DEFINITIONS
    .filter((definition) => (
      definition.period === (range || RANGE_TODAY) &&
      definition.metric === metric &&
      (typeof definition.target === "number" || (definition.target === "all" && variableTarget))
    ))
    .map((definition) => ({
      ...definition,
      target: definition.target === "all" ? variableTarget : definition.target,
    }));
}

function targetProgressInfo(value, milestones, domain = null) {
  const earned = milestones.filter((milestone) => milestone.earned);
  const current = earned.at(-1) || null;
  const next = milestones.find((milestone) => !milestone.earned) || null;
  const startTarget = Number.isFinite(domain?.start) ? Number(domain.start) : 0;
  const endTarget = Number.isFinite(domain?.end) ? Number(domain.end) : Math.max(...milestones.map((milestone) => milestone.target), value || 0, 1);
  const span = Math.max(1, endTarget - startTarget);
  const fillRatio = clamp(((value || 0) - startTarget) / span, 0, 1);
  const visibleMilestones = milestones;

  return { current, next, fillRatio, visibleMilestones };
}

function fixedTargetProgressInfo(value, target, labelPrefix, unit, scaleSpan = null) {
  if (!Number.isFinite(target) || target <= 0) return null;
  const safeValue = Math.max(0, Number(value) || 0);
  const safeTarget = Math.max(1, Number(target) || 0);
  const startTarget = Number.isFinite(scaleSpan) ? Math.max(0, safeTarget - scaleSpan) : safeValue;
  const fillRatio = Number.isFinite(scaleSpan)
    ? clamp((safeValue - startTarget) / Math.max(1, safeTarget - startTarget), 0, 1)
    : 0;
  return {
    current: { target: safeValue, label: `${labelPrefix}${safeValue}${unit}`, position: 0, targetRole: "current" },
    next: { target: safeTarget, label: `${labelPrefix}${safeTarget}${unit}`, position: 100, targetRole: "target" },
    fillRatio,
    visibleMilestones: [
      { target: safeValue, label: `${labelPrefix}${safeValue}${unit}`, position: 0, targetRole: "current" },
      { target: safeTarget, label: `${labelPrefix}${safeTarget}${unit}`, position: 100, targetRole: "target" },
    ],
  };
}

function targetInfoForDailyCard(card, value = card.value) {
  const badgeDefinitions = card.badgeDefinitions || badgeDefinitionsForMetric(card.range, card.metric, card.variableTarget);
  const scoreBarDomain = scoreBarDomainForCard(card, badgeDefinitions);
  const milestones = dailyBadgeMilestones(card.metric, value, badgeDefinitions, scoreBarDomain);
  if (!badgeDefinitions.length && !Number.isFinite(card.targetValue)) return null;
  if (card.badgeDefinitions) return { ...targetProgressInfo(value, milestones, scoreBarDomain), badgeDefinitions, milestones, scoreBarDomain };
  if (card.metric === "best") {
    const fixedTargetInfo = fixedTargetProgressInfo(value, card.targetValue, "ベスト", card.unit, 100);
    if (!badgeDefinitions.length && fixedTargetInfo) return { ...fixedTargetInfo, badgeDefinitions, milestones, scoreBarDomain };
  }
  return { ...targetProgressInfo(value, milestones, scoreBarDomain), badgeDefinitions, milestones, scoreBarDomain };
}

function emptyDailySummary(date = todayISO()) {
  return { date, count: 0, avg: 0, best: 0, bats: [] };
}

function interpolateNumber(from, to, progress) {
  return from + ((to - from) * progress);
}

function interpolateDailySummary(from, to, progress) {
  return {
    date: to.date || from.date || todayISO(),
    count: Math.round(interpolateNumber(from.count || 0, to.count || 0, progress)),
    avg: Math.round(interpolateNumber(from.avg || 0, to.avg || 0, progress)),
    best: Math.round(interpolateNumber(from.best || 0, to.best || 0, progress)),
    days: Math.round(interpolateNumber(from.days || 0, to.days || 0, progress)),
    spanDays: to.spanDays || from.spanDays || null,
    avgTarget: to.avgTarget ?? from.avgTarget ?? null,
    avgTargetLabel: to.avgTargetLabel || from.avgTargetLabel || null,
    avgTargetPreviousLabel: to.avgTargetPreviousLabel || from.avgTargetPreviousLabel || null,
    bestTarget: to.bestTarget ?? from.bestTarget ?? null,
    bestTargetLabel: to.bestTargetLabel || from.bestTargetLabel || null,
    bestTargetPreviousLabel: to.bestTargetPreviousLabel || from.bestTargetPreviousLabel || null,
    bats: to.bats || from.bats || [],
  };
}

function scoreProgressEase(progress) {
  return 1 - Math.pow(1 - progress, 3);
}

function scoreBarFillRatio(value, domain) {
  if (!domain) return 1;
  return clamp(((Number(value) || 0) - domain.start) / Math.max(1, domain.end - domain.start), 0, 1);
}

function useScoreProgressAnimation(animationId, { enabled = true, onComplete = null } = {}) {
  const [state, setState] = useState({ id: null, progress: 1 });
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useLayoutEffect(() => {
    if (!animationId || !enabled) {
      setState({ id: null, progress: 1 });
      return undefined;
    }

    let frameId = 0;
    let startedAt = 0;

    const tick = (now) => {
      if (!startedAt) startedAt = now;
      const rawProgress = clamp((now - startedAt) / kScoreProgressAnimationDuration, 0, 1);
      const progress = scoreProgressEase(rawProgress);
      setState({ id: animationId, progress });
      if (rawProgress < 1) {
        frameId = requestAnimationFrame(tick);
      } else {
        onCompleteRef.current?.();
      }
    };

    setState({ id: animationId, progress: 0 });
    frameId = requestAnimationFrame((now) => {
      startedAt = now;
      frameId = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frameId);
  }, [animationId, enabled]);

  const progress = state.id === animationId ? state.progress : (animationId && enabled ? 0 : 1);
  return {
    progress,
    active: Boolean(animationId && enabled && state.id === animationId && progress < 1),
  };
}

function animationScale(fromValue, toValue) {
  return Math.max(1, fromValue || 0, toValue || 0);
}

function animationFillRatio(fromValue, toValue, progress) {
  const current = interpolateNumber(fromValue || 0, toValue || 0, progress);
  return clamp(current / animationScale(fromValue, toValue), 0, 1);
}

function targetAnimationFillRatio(fromValue, toValue, targetValue, progress) {
  if (!Number.isFinite(targetValue) || targetValue <= 0) return animationFillRatio(fromValue, toValue, progress);
  const current = interpolateNumber(fromValue || 0, toValue || 0, progress);
  return clamp(current / targetValue, 0, 1);
}

function milestoneAlpha(position) {
  const ratio = clamp(position / 100, 0, 1);
  if (ratio <= 0.28) return clamp((ratio / 0.28) * 0.18, 0.04, 0.18);
  if (ratio <= 0.68) return 0.18 + ((ratio - 0.28) / 0.4) * 0.5;
  return 0.68 + ((ratio - 0.68) / 0.32) * 0.32;
}

function milestoneOrderScale(index, total) {
  if (total <= 1) return 1.12;
  const ratio = clamp(index / (total - 1), 0, 1);
  return 0.62 + ratio * 0.58;
}

function DailyResultCards({ summary, showBadges = true, selected = false, onSelect = null, animation = null, range = RANGE_TODAY, includeDays = false, dismissedHomeBadges = new Set(), onDismissHomeBadge = null }) {
  const growthLabels = growthBadgeLabelsForRange(range);
  const previousScoreMissingMessage = growthLabels ? `${growthLabels.previousLabel}のスコアがありません` : "";
  const cards = [
    ...(includeDays ? [{
      key: "days",
      icon: "log",
      label: "練習日数",
      value: summary.days || 0,
      unit: "日",
      metric: "days",
      range,
      variableTarget: summary.spanDays || null,
      targetValue: summary.daysTarget,
      fillRatio: animation?.fillRatios?.days,
      badgeOverride: animation?.badgeOverrides?.days,
      revealBadge: !animation?.active,
    }] : []),
    {
      key: "count",
      icon: "count",
      label: "スイング数",
      value: summary.count || 0,
      unit: "回",
      metric: "count",
      range,
      targetValue: summary.countTarget,
      fillRatio: animation?.fillRatios?.count,
      badgeOverride: animation?.badgeOverrides?.count,
      revealBadge: !animation?.active,
    },
    {
      key: "avg",
      icon: "avg",
      label: "平均スコア",
      value: summary.avg || 0,
      unit: "点",
      metric: "avg",
      range,
      targetValue: summary.avgTarget,
      emptyTrackMessage: growthLabels && !summary.avgTarget ? previousScoreMissingMessage : "",
      fillRatio: animation?.fillRatios?.avg,
      badgeOverride: animation?.badgeOverrides?.avg,
      revealBadge: !animation?.active,
    },
    {
      key: "best",
      icon: "best",
      label: "ベストスコア",
      value: summary.best || 0,
      unit: "点",
      metric: "best",
      range,
      targetValue: summary.bestTarget,
      emptyTrackMessage: growthLabels && !summary.bestTarget ? previousScoreMissingMessage : "",
      fillRatio: animation?.fillRatios?.best,
      badgeOverride: animation?.badgeOverrides?.best,
      revealBadge: !animation?.active,
    },
  ];
  const displayCards = cards;
  const cardPropsFor = (card) => ({
    card,
    showBadges,
    showRemaining: range !== RANGE_TODAY,
    dismissedHomeBadges,
    onDismissHomeBadge,
  });

  if (onSelect) {
    const handleSelect = (event) => {
      if (event.target.closest("button")) return;
      onSelect();
    };
    return (
      <article
        className={`daily-result-group-card record-card-button ${selected ? "selected" : ""}`}
        onPointerDown={(event) => {
          event.currentTarget.classList.toggle("badge-active", Boolean(event.target.closest(".daily-badge-mark, .milestone-dot")));
        }}
        onPointerUp={(event) => event.currentTarget.classList.remove("badge-active")}
        onPointerCancel={(event) => event.currentTarget.classList.remove("badge-active")}
        onPointerLeave={(event) => event.currentTarget.classList.remove("badge-active")}
        onClick={handleSelect}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onSelect();
          }
        }}
        role="button"
        tabIndex={0}
        aria-pressed={selected}
      >
        <div className={`daily-result-grid card-count-${cards.length}`}>
          {displayCards.map((card) => <DailyResultCard {...cardPropsFor(card)} key={card.key} />)}
        </div>
      </article>
    );
  }

  return <div className={`daily-result-grid card-count-${cards.length}`}>{displayCards.map((card) => <DailyResultCard {...cardPropsFor(card)} key={card.key} />)}</div>;
}

function DailyResultCard({ card, showBadges, showRemaining = true, dismissedHomeBadges = new Set(), onDismissHomeBadge = null }) {
  const [selectedBadge, setSelectedBadge] = useState(null);
  const milestoneTrackRef = useRef(null);
  const [milestoneTrackWidth, setMilestoneTrackWidth] = useState(0);
  const badgeDefinitions = card.badgeDefinitions || badgeDefinitionsForMetric(card.range, card.metric, card.variableTarget);
  const scoreBarDomain = scoreBarDomainForCard(card, badgeDefinitions);
  const milestones = dailyBadgeMilestones(card.metric, card.value, badgeDefinitions, scoreBarDomain);
  const earnedBadge = dailyResultBadge(card.metric, card.value, badgeDefinitions, scoreBarDomain);
  const isCardAnimating = card.revealBadge === false;
  const targetInfo = showBadges ? targetInfoForDailyCard(card) : null;
  const targetBadge = targetInfo?.next || null;
  const completeBadge = targetInfo?.current && !targetBadge ? targetInfo.current : null;
  const stageBadge = completeBadge || card.badgeOverride || earnedBadge;
  const isCompleteBadgeStage = Boolean(completeBadge);
  const visibleMilestones = targetInfo?.visibleMilestones || milestones;
  const revealBadge = card.revealBadge !== false || Boolean(card.badgeOverride);
  const showEmptyTrackMessage = showBadges && !targetInfo && Boolean(card.emptyTrackMessage);
  const showMilestoneTrack = showBadges && !showEmptyTrackMessage && Boolean(targetInfo);
  const milestoneFillRatio = card.fillRatio ?? targetInfo?.fillRatio ?? 1;
  const milestoneFillBleedPx = milestoneFillRatio > 0 ? 2 : 0;
  const homeBadgeLabel = stageBadge?.label ? stageBadge.label : null;
  const homeBadgeDismissKey = homeBadgeLabel ? [
    card.range,
    card.key,
    card.metric,
    homeBadgeLabel,
    stageBadge?.target ?? "earned",
  ].join(":") : null;
  const isHomeBadgeDismissed = Boolean(homeBadgeDismissKey && dismissedHomeBadges.has(homeBadgeDismissKey));
  const canShowBadgeStage = !isCardAnimating;
  const showHomeEarnedBadge = Boolean(stageBadge && (
    isCompleteBadgeStage ||
    (canShowBadgeStage && revealBadge && !isHomeBadgeDismissed)
  ));
  const displayRemainingBadge = targetBadge || completeBadge || card.badgeOverride || earnedBadge;
  const displayRemainingValue = targetBadge ? Math.max(0, targetBadge.target - (card.value || 0)) : 0;
  const showHomeRemaining = showBadges && showRemaining && Boolean(displayRemainingBadge);
  const isRemainingComplete = showHomeRemaining && !targetBadge;
  const remainingBadgeDefinition = displayRemainingBadge?.label
    ? makeBadgeDefinition(canonicalBadgeLabel(displayRemainingBadge.label), { description: displayRemainingBadge.description })
    : null;
  const openRemainingBadgeDetail = () => {
    if (!remainingBadgeDefinition) return;
    setSelectedBadge({
      ...remainingBadgeDefinition,
      earnedCount: isRemainingComplete ? 1 : 0,
      lockedSecret: false,
    });
  };
  const skin = SCORE_CARD_SKINS[card.key] || SCORE_CARD_SKINS.count;

  useLayoutEffect(() => {
    const node = milestoneTrackRef.current;
    if (!node) return undefined;
    const updateWidth = () => setMilestoneTrackWidth(node.offsetWidth || node.clientWidth || 0);
    updateWidth();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateWidth);
      return () => window.removeEventListener("resize", updateWidth);
    }
    const observer = new ResizeObserver(updateWidth);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <article
      className={`daily-result-card ${card.key} ${showRemaining ? "" : "no-remaining"} ${card.revealBadge === false ? "animating" : ""}`}
      style={{
        "--milestone-fill-ratio": String(milestoneFillRatio),
        "--milestone-fill-bleed-px": `${milestoneFillBleedPx}px`,
        "--meter-glow": skin.meterGlow,
        ...scoreFontTokens(card.value),
      }}
    >
      <div className="metric-label">
        {NEW_UI_ASSETS[card.key] ? <img className="metric-image-icon" src={NEW_UI_ASSETS[card.key]} width="80" height="80" decoding="async" alt="" aria-hidden="true" /> : <Icon type={card.icon} />}
        {card.label}
      </div>
      {showBadges && (
        <>
          <div className="daily-score-row">
            <strong>{Number(card.value || 0).toLocaleString("ja-JP")}<span>{card.unit}</span></strong>
          </div>
          {showRemaining && (
            <div className="daily-badge-stage">
              {showHomeRemaining ? (
              <button
                type="button"
                className={`target-remaining ${isRemainingComplete ? "complete" : ""}`}
                data-sound-effect="popup"
                onClick={openRemainingBadgeDetail}
                aria-label={isRemainingComplete ? "コンプリートバッジの詳細" : `次のバッジ ${remainingBadgeDefinition?.label || ""} の詳細`}
              >
                {!isRemainingComplete && <span>次のバッジまで</span>}
                {isRemainingComplete ? (
                  <strong>コンプリート</strong>
                ) : (
                  <strong>{Number(displayRemainingValue).toLocaleString("ja-JP")}<small>{card.unit}</small></strong>
                )}
              </button>
              ) : null}
            </div>
          )}
          <div ref={milestoneTrackRef} className={`milestone-track ${showMilestoneTrack ? "" : "placeholder"} ${showEmptyTrackMessage ? "with-message" : ""} ${earnedBadge ? "earned" : ""}`}>
            <span className="milestone-fill" />
            {showMilestoneTrack && visibleMilestones.map((milestone) => {
              const alpha = milestoneAlpha(milestone.position);
              const isTargetMilestone = targetBadge?.label === milestone.label || completeBadge?.label === milestone.label;
              const milestoneState = isTargetMilestone ? "target" : milestone.earned ? "earned" : "locked";
              const dotScale = isTargetMilestone ? 1.12 : milestone.earned ? 0.86 : 0.62;
              const dotSize = clamp(28 * dotScale, 15, 32);
              const visualDotSize = dotSize;
              const frameSize = dotSize + 5;
              const fillPx = milestoneFillRatio * milestoneTrackWidth;
              const effectiveFillPx = Math.min(milestoneTrackWidth, fillPx + milestoneFillBleedPx);
              const targetPx = (milestone.position / 100) * milestoneTrackWidth;
              const dotLeftPx = targetPx - visualDotSize;
              const frameLeftPx = targetPx - (visualDotSize / 2) - (frameSize / 2);
              const iconComplete = milestone.earned || effectiveFillPx >= targetPx;
              const targetValue = Number(milestone.target);
              const useZeroAnchoredIconFill = isTargetMilestone && dotLeftPx < 0 && Number.isFinite(targetValue) && targetValue > 0;
              const continuousIconFillRatio = milestoneTrackWidth > 0 ? clamp((effectiveFillPx - dotLeftPx) / visualDotSize, 0, 1) : 0;
              const zeroAnchoredIconFillRatio = useZeroAnchoredIconFill ? clamp(Number(card.value || 0) / targetValue, 0, 1) : 0;
              const iconFillRatio = iconComplete ? 1 : useZeroAnchoredIconFill ? zeroAnchoredIconFillRatio : continuousIconFillRatio;
              const iconFillPx = iconComplete ? visualDotSize : visualDotSize * iconFillRatio;
              const iconGradientWidthPx = useZeroAnchoredIconFill ? visualDotSize : Math.max(1, milestoneTrackWidth);
              const iconGradientBgX = useZeroAnchoredIconFill ? 0 : -dotLeftPx;
              const definition = makeBadgeDefinition(canonicalBadgeLabel(milestone.label), { description: milestone.description || `${milestone.label}をゲット` });
              return (
                <Fragment key={milestone.label}>
                  <span
                    className="milestone-dot-frame"
                    style={{
                      left: `${frameLeftPx}px`,
                      "--milestone-dot-scale": dotScale.toFixed(3),
                      "--milestone-frame-size-px": `${frameSize}px`,
                    }}
                    aria-hidden="true"
                  />
                  <button
                    type="button"
                    className={`milestone-dot ${milestoneState} ${isTargetMilestone && iconFillRatio <= 0 ? "empty-target" : ""} ${earnedBadge?.label === milestone.label ? "current" : ""}`}
                    data-sound-effect="popup"
                    style={{
                      left: `${dotLeftPx}px`,
                      "--milestone-alpha": alpha.toFixed(2),
                      "--milestone-ring-alpha": Math.max(0.08, alpha * 0.7).toFixed(2),
                      "--milestone-dot-scale": dotScale.toFixed(3),
                      "--milestone-dot-size-px": `${visualDotSize}px`,
                      "--milestone-track-width-px": `${iconGradientWidthPx}px`,
                      "--milestone-dot-bg-x": `${iconGradientBgX}px`,
                      "--milestone-icon-fill-px": `${iconFillPx}px`,
                      "--milestone-target-progress": iconFillRatio.toFixed(3),
                      "--milestone-target-progress-percent": `${Math.round(iconFillRatio * 100)}%`,
                    }}
                    onClick={() => setSelectedBadge({ ...definition, earnedCount: milestone.earned ? 1 : 0, lockedSecret: false })}
                    aria-label={`${definition.label}の詳細`}
                  >
                    <RarityIcon rarity={rarityForBadge(milestone.label)} />
                    <span>{milestone.displayTarget ?? milestone.target}</span>
                  </button>
                </Fragment>
              );
            })}
            {showEmptyTrackMessage && <span className="milestone-empty-message">{card.emptyTrackMessage}</span>}
          </div>
          {selectedBadge && (
            <BadgeDetailPopover badge={selectedBadge} onClose={() => setSelectedBadge(null)} />
          )}
        </>
      )}
      {!showBadges && <strong>{Number(card.value || 0).toLocaleString("ja-JP")}<span>{card.unit}</span></strong>}
    </article>
  );
}

function DailyBadgeMark({ label, description, onDismiss = null, complete = false }) {
  const [selectedBadge, setSelectedBadge] = useState(null);
  const definition = makeBadgeDefinition(canonicalBadgeLabel(label), { description });
  const handleClick = () => {
    if (onDismiss) {
      onDismiss();
      return;
    }
    setSelectedBadge({ ...definition, earnedCount: 0, lockedSecret: false });
  };
  return (
    <>
      <button
        type="button"
        className={`daily-badge-mark rarity-${definition.rarity.toLowerCase()} ${complete ? "complete" : ""}`}
        data-sound-effect={onDismiss ? undefined : "popup"}
        onClick={handleClick}
        aria-label={`${definition.label}の詳細`}
      >
          <img className="daily-badge-image" src={RARITY_IMAGE_URLS[definition.rarity]} alt="" aria-hidden="true" />
        {complete && <span className="daily-complete-stamp" aria-hidden="true">COMPLETE</span>}
      </button>
      {selectedBadge && (
        <BadgeDetailPopover badge={selectedBadge} onClose={() => setSelectedBadge(null)} />
      )}
    </>
  );
}

function RarityBadgePreview({ summaries, activeRarity, onSelect }) {
  return (
    <div className="rarity-badge-preview" role="tablist" aria-label="バッジレア度">
      {summaries.map(({ rarity }) => (
        <button
          className={`daily-badge-mark rarity-${rarity.toLowerCase()} preview-badge-mark ${activeRarity === rarity ? "selected" : ""}`}
          type="button"
          role="tab"
          aria-selected={activeRarity === rarity}
          onClick={() => onSelect(rarity)}
          key={rarity}
        >
          <img className="daily-badge-image" src={RARITY_IMAGE_URLS[rarity]} alt="" aria-hidden="true" />
          <span className="preview-rarity-label">{rarity}</span>
        </button>
      ))}
    </div>
  );
}

function ScoreComparison({ daily, range }) {
  const [mode, setMode] = useState("count");
  const scrollRef = useRef(null);
  const buckets = useMemo(() => comparisonBuckets(daily, range), [daily, range]);
  const visibleBuckets = useMemo(() => [...buckets].reverse(), [buckets]);
  const modes = [
    ["count", "回数", "回"],
    ["avg", "平均", "点"],
    ["best", "ベスト", "点"],
  ];
  const current = modes.find(([key]) => key === mode) || modes[0];
  const values = buckets.map((bucket) => bucket[mode]);
  const max = Math.max(1, ...values);
  const activeValues = values.filter((value) => value > 0);
  const rawMin = Math.min(...activeValues, max);
  const floor = mode === "count"
    ? Math.max(0, Math.floor(rawMin * 0.72 / 50) * 50)
    : Math.max(0, Math.floor(rawMin * 0.86 / 50) * 50);
  const rangeSpan = Math.max(1, max - floor);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }
  }, [mode, range, buckets.length]);

  return (
    <section className="dashboard-section comparison-section">
      <div className="section-row tight">
        <div>
          <h2>スコア比較</h2>
          <p>{current[1]}を期間ごとに比較</p>
        </div>
        <div className="compare-tabs" role="tablist" aria-label="比較する値">
          {modes.map(([key, label]) => (
            <button key={key} type="button" className={mode === key ? "selected" : ""} onClick={() => setMode(key)}>{label}</button>
          ))}
        </div>
      </div>
      {buckets.length ? (
        <div className={`bar-scroll mode-${mode}`} ref={scrollRef}>
          {visibleBuckets.map((bucket) => {
            const value = bucket[mode];
            const height = value > 0 ? Math.max(10, ((value - floor) / rangeSpan) * 88 + 12) : 0;
            return (
              <article className="bar-item" key={bucket.label}>
                <div className="bar-track">
                  <span className="bar-fill" style={{ height: `${height}%` }} />
                </div>
                <strong>{Number(value || 0).toLocaleString("ja-JP")}<small>{current[2]}</small></strong>
                <span>{bucket.label}</span>
                <em>{bucket.rangeLabel}</em>
              </article>
            );
          })}
        </div>
      ) : <p className="empty compact-empty">比較できる記録がありません。</p>}
    </section>
  );
}

function EarnedBadgesCard({ badgeCounts, title = "獲得バッジ" }) {
  const [expanded, setExpanded] = useState(false);
  const allBadges = useMemo(() => (
    [...badgeCounts]
      .sort((a, b) => compareBadgesByRarity(a[0], b[0]))
      .map(([label, count]) => {
        const canonicalLabel = canonicalBadgeLabel(label);
        const definition = makeBadgeDefinition(canonicalLabel);
        return { label, count, definition };
      })
  ), [badgeCounts]);
  const featuredBadges = useMemo(() => allBadges.slice(0, 6), [allBadges]);
  const visibleBadges = expanded ? allBadges : featuredBadges;
  const badgeTotal = badgeCounts.reduce((sum, [, count]) => sum + count, 0);
  const toggleExpanded = () => {
    setExpanded((value) => !value);
  };

  return (
    <section className={`dashboard-section badge-inline-section ${expanded ? "expanded" : ""}`}>
      <div className="section-row tight">
        <div>
          <h2 className="icon-heading"><Icon type="badge" />{title}</h2>
        </div>
        <div className="badge-heading-count"><strong>{badgeTotal.toLocaleString("ja-JP")}</strong><span>個</span></div>
      </div>
      {badgeCounts.length ? (
        <>
          <div className="badge-list-window">
            <div className="badge-list two-col">
              {visibleBadges.map(({ label, count, definition }, index) => (
                <span
                  className="badge-motion-item"
                  style={{ "--badge-index": index }}
                  key={label}
                >
                  <BadgeChip label={definition.label} count={count} description={definition.description} />
                </span>
              ))}
            </div>
          </div>
          {badgeCounts.length > 6 && (
            <button
              type="button"
              className={`badge-expand-bar ${expanded ? "expanded" : ""}`}
              onClick={toggleExpanded}
              aria-label={expanded ? "バッジを閉じる" : "全部のバッジを見る"}
              title={expanded ? "閉じる" : "すべて見る"}
            >
              {expanded ? "閉じる" : "すべて見る"}
            </button>
          )}
        </>
      ) : <p className="empty">まだバッジはありません。</p>}
    </section>
  );
}

function badgeDomId(label) {
  return label.replace(/[^\w-]/g, (char) => `-${char.codePointAt(0).toString(16)}-`);
}

function CountBars({ buckets, visibleCount = 7 }) {
  const scrollRef = useRef(null);
  const dragRef = useRef({ active: false, pointerId: null, startX: 0, scrollLeft: 0 });
  const counts = buckets.map((bucket) => Number(bucket.count || 0)).filter((count) => count > 0);
  const average = counts.length ? counts.reduce((sum, count) => sum + count, 0) / counts.length : 0;
  const cap = Math.max(1, Math.min(Math.max(1, ...counts), Math.max(1, average * 2)));

  useLayoutEffect(() => {
    const node = scrollRef.current;
    if (!node) return undefined;
    let frameId = 0;
    const scrollToRightEdge = () => {
      node.scrollLeft = Math.max(0, node.scrollWidth - node.clientWidth);
    };
    scrollToRightEdge();
    frameId = requestAnimationFrame(scrollToRightEdge);
    return () => cancelAnimationFrame(frameId);
  }, [buckets.length, buckets[0]?.label, buckets.at(-1)?.label]);

  const startDragScroll = (event) => {
    if (event.pointerType === "touch") return;
    const node = scrollRef.current;
    if (!node || node.scrollWidth <= node.clientWidth) return;
    dragRef.current = {
      active: true,
      pointerId: event.pointerId,
      startX: event.clientX,
      scrollLeft: node.scrollLeft,
    };
    node.setPointerCapture?.(event.pointerId);
  };

  const moveDragScroll = (event) => {
    const drag = dragRef.current;
    const node = scrollRef.current;
    if (!drag.active || drag.pointerId !== event.pointerId || !node) return;
    event.preventDefault();
    node.scrollLeft = drag.scrollLeft - (event.clientX - drag.startX);
  };

  const endDragScroll = (event) => {
    const drag = dragRef.current;
    const node = scrollRef.current;
    if (drag.pointerId === event.pointerId) {
      node?.releasePointerCapture?.(event.pointerId);
      dragRef.current = { active: false, pointerId: null, startX: 0, scrollLeft: 0 };
    }
  };

  return (
    <div
      className="count-chart-scroll"
      ref={scrollRef}
      style={{ "--count-chart-visible": visibleCount }}
      onPointerDown={startDragScroll}
      onPointerMove={moveDragScroll}
      onPointerUp={endDragScroll}
      onPointerCancel={endDragScroll}
      onPointerLeave={endDragScroll}
    >
      <div className="count-chart-bars">
        {buckets.map((bucket) => {
          const isCurrent = bucket === buckets.at(-1);
          const clipped = bucket.count > cap;
          const height = bucket.count > 0 ? Math.max(10, (Math.min(bucket.count, cap) / cap) * 100) : 0;
          const countLength = Number(bucket.count || 0).toLocaleString("ja-JP").length;
          const countValueSize = countLength >= 7 ? "0.48rem" : countLength >= 6 ? "0.52rem" : countLength >= 5 ? "0.58rem" : "0.7rem";
          return (
            <article className={`count-chart-item ${isCurrent ? "today" : ""} ${clipped ? "clipped" : ""}`} key={bucket.label}>
              <div className="count-chart-track">
                <span className="count-chart-fill" style={{ height: `${height}%` }} />
              </div>
              <strong style={{ "--count-value-size": countValueSize }}>{Number(bucket.count || 0).toLocaleString("ja-JP")}<small>回</small></strong>
              <span>{bucket.label}</span>
              <em>{bucket.rangeLabel}</em>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function ScoreLineBuckets({ buckets }) {
  const [hovered, setHovered] = useState(null);
  const width = Math.max(360, buckets.length * 74);
  const height = 238;
  const pad = { left: 36, right: 18, top: 20, bottom: 42 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const values = buckets.flatMap((bucket) => [bucket.avg, bucket.best]).filter((value) => value > 0);

  if (!values.length) return <p className="empty compact-empty">スコア記録がありません。</p>;

  const maxY = Math.ceil((Math.max(800, ...values) * 1.08) / 100) * 100;
  const point = (bucket, index, key) => ({
    x: pad.left + (buckets.length <= 1 ? plotW / 2 : (plotW * index) / (buckets.length - 1)),
    y: pad.top + plotH - ((bucket[key] || 0) / maxY) * plotH,
    bucket,
  });
  const avgPoints = buckets.map((bucket, index) => point(bucket, index, "avg")).filter((item) => item.bucket.avg > 0);
  const bestPoints = buckets.map((bucket, index) => point(bucket, index, "best")).filter((item) => item.bucket.best > 0);
  const hoverPoint = hovered !== null ? point(buckets[hovered], hovered, "best") : null;

  return (
    <div className="record-scroll score-record-scroll">
      <svg className="score-bucket-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="スコア記録" onMouseLeave={() => setHovered(null)}>
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = pad.top + plotH * ratio;
          const value = Math.round((maxY * (1 - ratio)) / 100) * 100;
          return (
            <g key={ratio}>
              <line x1={pad.left} y1={y} x2={width - pad.right} y2={y} className="grid-line" />
              <text x={pad.left - 8} y={y + 3} textAnchor="end" className="chart-axis-label">{value}</text>
            </g>
          );
        })}
        {buckets.map((bucket, index) => {
          const x = pad.left + (buckets.length <= 1 ? plotW / 2 : (plotW * index) / (buckets.length - 1));
          return <line key={`grid-${bucket.label}`} x1={x} y1={pad.top} x2={x} y2={height - pad.bottom} className="grid-line vertical" />;
        })}
        <path className="avg-path" d={pathFromPoints(avgPoints)} />
        <path className="best-path" d={pathFromPoints(bestPoints)} />
        {buckets.map((bucket, index) => {
          const x = pad.left + (buckets.length <= 1 ? plotW / 2 : (plotW * index) / (buckets.length - 1));
          return (
            <g key={bucket.label}>
              <rect x={x - 32} y={pad.top} width="64" height={plotH} fill="transparent" onMouseEnter={() => setHovered(index)} onTouchStart={() => setHovered(index)} />
              <text x={x} y={height - 22} textAnchor="middle" className="chart-date">{bucket.label}</text>
              <text x={x} y={height - 9} textAnchor="middle" className="chart-date sub">{bucket.rangeLabel}</text>
            </g>
          );
        })}
        {hoverPoint && (
          <line x1={hoverPoint.x} y1={pad.top} x2={hoverPoint.x} y2={height - pad.bottom} className="hover-line" />
        )}
      </svg>
      {hovered !== null && (
        <div className="record-tooltip">
          <strong>{buckets[hovered].label}</strong>
          <span>平均 {Number(buckets[hovered].avg || 0).toLocaleString("ja-JP")}点</span>
          <span>ベスト {Number(buckets[hovered].best || 0).toLocaleString("ja-JP")}点</span>
        </div>
      )}
    </div>
  );
}

function Chart({ data, initialRange }) {
  const [hovered, setHovered] = useState(null);
  const [view, setView] = useState({ scale: 1, offset: 0 });
  const [chartSize, setChartSize] = useState({ width: 360, height: 178 });
  const wrapRef = useRef(null);
  const svgRef = useRef(null);
  const initializedViewRef = useRef(false);
  const pointersRef = useRef(new Map());
  const gestureRef = useRef(null);
  const width = chartSize.width;
  const height = chartSize.height;
  const pad = { left: 34, right: 20, top: 6, bottom: 36 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const minScale = minChartScale(data.length);
  const maxScale = Math.max(maxChartScale(data.length), initialChartView(data.length, initialRange, plotW).scale);
  const chartView = constrainChartView(view, plotW, minScale, maxScale);
  const values = data.flatMap((item) => [item.avg, item.best]).filter((value) => Number.isFinite(value));

  useEffect(() => {
    const node = wrapRef.current;
    if (!node) return undefined;

    const updateWidth = () => {
      const rect = node.getBoundingClientRect();
      setChartSize({
        width: Math.max(360, Math.round(rect.width)),
        height: Math.max(160, Math.round(rect.height)),
      });
    };
    updateWidth();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateWidth);
      return () => window.removeEventListener("resize", updateWidth);
    }

    const observer = new ResizeObserver(updateWidth);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    pointersRef.current.clear();
    gestureRef.current = null;
    setHovered(null);
    if (!initializedViewRef.current && data.length && plotW > 0) {
      initializedViewRef.current = true;
      setView(initialChartView(data.length, initialRange, plotW));
    }
  }, [data.length, data[0]?.date, data.at(-1)?.date, initialRange, plotW]);

  useEffect(() => {
    const clearHover = () => setHovered(null);
    const clearHoverOnOutsideTap = (event) => {
      if (wrapRef.current?.contains(event.target)) return;
      setHovered(null);
    };
    document.addEventListener("pointerdown", clearHoverOnOutsideTap, true);
    window.addEventListener("scroll", clearHover, { passive: true });
    window.addEventListener("resize", clearHover);
    return () => {
      document.removeEventListener("pointerdown", clearHoverOnOutsideTap, true);
      window.removeEventListener("scroll", clearHover);
      window.removeEventListener("resize", clearHover);
    };
  }, []);

  if (!values.length) return <div className="chart-empty">記録を入れるとグラフが表示されます。</div>;

  const maxY = Math.ceil((Math.max(800, ...values) * 1.08) / 100) * 100;
  const point = (item, index, key) => {
    if (!Number.isFinite(item[key])) return null;
    return {
      x: pad.left + (data.length <= 1 ? plotW / 2 : (plotW * index) / (data.length - 1)),
      y: pad.top + plotH - (item[key] / maxY) * plotH,
      item,
      key,
      label: key === "avg" ? "平均" : "ベスト",
      value: item[key],
    };
  };
  const avgPoints = data.map((item, index) => point(item, index, "avg")).filter(Boolean);
  const bestPoints = data.map((item, index) => point(item, index, "best")).filter(Boolean);
  const transformPoint = (item) => ({
    ...item,
    x: pad.left + ((item.x - pad.left) * chartView.scale) + chartView.offset,
  });
  const avgDisplayPoints = avgPoints.map(transformPoint);
  const bestDisplayPoints = bestPoints.map(transformPoint);
  const avgPath = pathFromPoints(avgDisplayPoints);
  const bestPath = pathFromPoints(bestDisplayPoints);
  const yLabels = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
    const value = Math.round((maxY * (1 - ratio)) / 100) * 100;
    return { value, y: pad.top + plotH * ratio };
  });
  const visibleIndexAt = (plotX) => {
    if (data.length <= 1) return 0;
    const baseX = (plotX - chartView.offset) / chartView.scale;
    return clamp(Math.round((baseX / plotW) * (data.length - 1)), 0, data.length - 1);
  };
  const xAxisLabels = data.length <= 1
    ? [{ x: pad.left + (plotW / 2), anchor: "middle", label: data[0].label }]
    : [
        { x: pad.left, anchor: "start", label: data[visibleIndexAt(0)]?.label || data[0].label },
        { x: pad.left + (plotW / 3), anchor: "middle", label: data[visibleIndexAt(plotW / 3)]?.label || "" },
        { x: pad.left + ((plotW * 2) / 3), anchor: "middle", label: data[visibleIndexAt((plotW * 2) / 3)]?.label || "" },
        { x: width - pad.right, anchor: "end", label: data[visibleIndexAt(plotW)]?.label || data.at(-1).label },
      ].filter((item, index, array) => item.label && array.findIndex((candidate) => candidate.label === item.label) === index);
  const hoveredInPlot = hovered && hovered.x >= pad.left && hovered.x <= width - pad.right;
  const tooltipWidth = 148;
  const tooltipGap = 14;
  const tooltipX = hovered
    ? hovered.x + tooltipGap + tooltipWidth <= width - 8
      ? hovered.x + tooltipGap
      : hovered.x - tooltipGap - tooltipWidth
    : 0;
  const tooltipLeft = `${(clamp(tooltipX, 8, width - tooltipWidth - 8) / width) * 100}%`;
  const tooltipTop = hovered ? `${(clamp(hovered.y - 74, 10, height - 82) / height) * 100}%` : "0%";
  const clientXToSvgX = (clientX) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return pad.left;
    return ((clientX - rect.left) / rect.width) * width;
  };
  const clientDeltaToSvgDelta = (clientDeltaX) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    return (clientDeltaX / rect.width) * width;
  };
  const startPanGesture = (pointer) => {
    gestureRef.current = {
      type: "pan",
      lockedAxis: null,
      startX: pointer.x,
      startY: pointer.y,
      startOffset: chartView.offset,
      startScale: chartView.scale,
    };
  };
  const startPinchGesture = (pointers) => {
    const [first, second] = pointers;
    const centerX = (first.x + second.x) / 2;
    gestureRef.current = {
      type: "pinch",
      startDistance: pointerDistance(first, second),
      startOffset: chartView.offset,
      startScale: chartView.scale,
      originX: clientXToSvgX(centerX) - pad.left,
    };
  };
  const updateGesture = () => {
    const pointers = [...pointersRef.current.values()];
    const gesture = gestureRef.current;
    if (!gesture || pointers.length === 0) return;

    if (gesture.type === "pan" && pointers.length === 1) {
      const pointer = pointers[0];
      const movedX = pointer.x - gesture.startX;
      const movedY = pointer.y - gesture.startY;
      if (!gesture.lockedAxis && Math.max(Math.abs(movedX), Math.abs(movedY)) > 8) {
        gesture.lockedAxis = Math.abs(movedX) > Math.abs(movedY) * 1.2 ? "x" : "y";
      }
      if (gesture.lockedAxis === "y") return;
      const dx = clientDeltaToSvgDelta(pointers[0].x - gesture.startX);
      setView(constrainChartView({
        scale: gesture.startScale,
        offset: gesture.startOffset + dx,
      }, plotW, minScale, maxScale));
      return;
    }

    if (pointers.length >= 2) {
      const [first, second] = pointers;
      const distance = pointerDistance(first, second);
      if (!gesture.startDistance) return;
      const nextScale = clamp(gesture.startScale * (distance / gesture.startDistance), minScale, maxScale);
      const baseX = (gesture.originX - gesture.startOffset) / gesture.startScale;
      setView(constrainChartView({
        scale: nextScale,
        offset: gesture.originX - (baseX * nextScale),
      }, plotW, minScale, maxScale));
    }
  };
  const handlePointerDown = (event) => {
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const pointers = [...pointersRef.current.values()];
    if (pointers.length >= 2) {
      event.preventDefault();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      startPinchGesture(pointers);
    } else {
      startPanGesture(pointers[0]);
    }
  };
  const nearestDayTo = (clientX) => {
    const svgX = clientXToSvgX(clientX);
    const candidates = data.map((item, index) => {
      const avgPoint = avgDisplayPoints.find((pointItem) => pointItem.item.date === item.date) || null;
      const bestPoint = bestDisplayPoints.find((pointItem) => pointItem.item.date === item.date) || null;
      const pointY = Math.min(avgPoint?.y ?? Infinity, bestPoint?.y ?? Infinity);
      return {
        item,
        x: avgPoint?.x ?? bestPoint?.x ?? pad.left + ((data.length <= 1 ? plotW / 2 : (plotW * index) / (data.length - 1)) * chartView.scale) + chartView.offset,
        y: Number.isFinite(pointY) ? pointY : pad.top,
        avgPoint,
        bestPoint,
      };
    })
      .filter((pointItem) => (pointItem.avgPoint || pointItem.bestPoint) && pointItem.x >= pad.left && pointItem.x <= width - pad.right);
    if (!candidates.length) return null;
    return candidates.reduce((nearest, pointItem) => (
      Math.abs(pointItem.x - svgX) < Math.abs(nearest.x - svgX) ? pointItem : nearest
    ));
  };
  const showNearestDay = (clientX) => {
    const nearest = nearestDayTo(clientX);
    if (nearest) {
      setHovered(nearest);
    }
  };
  const handlePointerMove = (event) => {
    if (!pointersRef.current.has(event.pointerId)) {
      if (event.pointerType === "mouse") {
        showNearestDay(event.clientX);
      }
      return;
    }
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const gesture = gestureRef.current;
    if (gesture?.type === "pan") {
      const movedX = event.clientX - gesture.startX;
      const movedY = event.clientY - gesture.startY;
      if (!gesture.lockedAxis && Math.max(Math.abs(movedX), Math.abs(movedY)) > 4) {
        gesture.lockedAxis = Math.abs(movedX) > Math.abs(movedY) ? "x" : "y";
        if (gesture.lockedAxis === "x") {
          event.currentTarget.setPointerCapture?.(event.pointerId);
        }
      }
      if (gesture.lockedAxis === "y") return;
    }
    event.preventDefault();
    setHovered(null);
    updateGesture();
  };
  const handlePointerEnd = (event) => {
    const gesture = gestureRef.current;
    const wasTap =
      gesture?.type === "pan" &&
      Math.abs(event.clientX - gesture.startX) < 18 &&
      Math.abs(event.clientY - gesture.startY) < 18;
    try {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    } catch {
      // Some browsers throw if the pointer was already released.
    }
    pointersRef.current.delete(event.pointerId);
    const pointers = [...pointersRef.current.values()];
    if (pointers.length >= 2) {
      startPinchGesture(pointers);
    } else if (pointers.length === 1) {
      startPanGesture(pointers[0]);
    } else {
      gestureRef.current = null;
    }
    if (wasTap) {
      showNearestDay(event.clientX);
    }
  };

  return (
    <div className="chart-wrap" ref={wrapRef}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="スコア推移"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onClick={(event) => showNearestDay(event.clientX)}
        onPointerLeave={(event) => {
          if (event.pointerType === "mouse") setHovered(null);
        }}
      >
        <defs>
          <linearGradient id="avgFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--active-graph-color, var(--graph-color, var(--hot)))" stopOpacity=".25" />
            <stop offset="100%" stopColor="var(--active-graph-color, var(--graph-color, var(--hot)))" stopOpacity="0" />
          </linearGradient>
          <clipPath id="chartPlotClip">
            <rect x={pad.left} y={pad.top - 8} width={plotW} height={plotH + 16} />
          </clipPath>
          <clipPath id="chartPointClip">
            <rect x={pad.left - 8} y={pad.top - 8} width={plotW + 16} height={plotH + 16} />
          </clipPath>
        </defs>
        {yLabels.map((tick) => (
          <g key={tick.value}>
            <line x1={pad.left} y1={tick.y} x2={width - pad.right} y2={tick.y} className="grid-line" />
            <text x={pad.left - 6} y={tick.y + 3} textAnchor="end" className="chart-axis-label">{tick.value}</text>
          </g>
        ))}
        <g clipPath="url(#chartPlotClip)">
          {data.map((item, index) => {
            const x = pad.left + ((data.length <= 1 ? plotW / 2 : (plotW * index) / (data.length - 1)) * chartView.scale) + chartView.offset;
            if (x < pad.left || x > width - pad.right) return null;
            return <line key={`v-${item.date}`} x1={x} y1={pad.top} x2={x} y2={height - pad.bottom} className="grid-line vertical" />;
          })}
          {avgDisplayPoints.length > 1 && <path className="area" d={`${avgPath} L ${avgDisplayPoints.at(-1).x} ${height - pad.bottom} L ${avgDisplayPoints[0].x} ${height - pad.bottom} Z`} />}
          {avgDisplayPoints.length > 1 && <path className="avg-path" d={avgPath} />}
          {bestDisplayPoints.length > 1 && <path className="best-path" d={bestPath} />}
        </g>
        <g clipPath="url(#chartPointClip)">
          {avgDisplayPoints.filter((pointItem) => pointItem.item.isToday).map((pointItem) => (
            <circle className="chart-today-point avg" cx={pointItem.x} cy={pointItem.y} r="5.5" key={`today-avg-${pointItem.item.label}`} />
          ))}
          {bestDisplayPoints.filter((pointItem) => pointItem.item.isToday).map((pointItem) => (
            <circle className="chart-today-point best" cx={pointItem.x} cy={pointItem.y} r="5.5" key={`today-best-${pointItem.item.label}`} />
          ))}
        </g>
        {hoveredInPlot && (
          <>
            {hovered.avgPoint && <circle className="chart-active-point avg" cx={hovered.avgPoint.x} cy={hovered.avgPoint.y} r="4.5" />}
            {hovered.bestPoint && <circle className="chart-active-point best" cx={hovered.bestPoint.x} cy={hovered.bestPoint.y} r="4.5" />}
          </>
        )}
        {xAxisLabels.map((item) => (
          <text key={`${item.anchor}-${item.label}`} x={item.x} y={height - 12} textAnchor={item.anchor} className="chart-date">{item.label}</text>
        ))}
        {hoveredInPlot && (
          <g className="chart-tooltip" pointerEvents="none">
            <line x1={hovered.x} y1={pad.top} x2={hovered.x} y2={height - pad.bottom} className="hover-line" />
          </g>
        )}
      </svg>
      {hoveredInPlot && (
        <div className="chart-tooltip-card" style={{ "--tooltip-x": tooltipLeft, "--tooltip-y": tooltipTop }}>
          <strong>{hovered.item.label}</strong>
          <span>ベスト: {Number(hovered.item.best || 0).toLocaleString("ja-JP")}点</span>
          <span>平均: {Number(hovered.item.avg || 0).toLocaleString("ja-JP")}点</span>
        </div>
      )}
    </div>
  );
}

function demoDb(base = null) {
  const fallbackNames = ["はるた", "おとー"];
  const fallbackBats = ["しきバット", "だめバット", "ミニバット"];
  const names = base?.names?.length ? [...base.names] : fallbackNames;
  const bats = base?.bats?.length ? [...base.bats] : fallbackBats;
  const start = addDays(parseISO(todayISO()), -91);
  const end = addDays(parseISO(todayISO()), -1);
  const records = [];
  const fallbackNameColors = {
    "はるた": "#2f86ff",
    "おとー": "#249c68",
  };
  const fallbackBatColors = {
    "しきバット": "#ff9f1c",
    "だめバット": "#a26bff",
    "ミニバット": "#8d95a4",
  };
  const nameColors = normalizeNameColors(base?.nameColors || fallbackNameColors, names, base?.theme);
  const batColors = normalizeBatColors(base?.batColors || fallbackBatColors, bats);
  const activeName = names.includes(base?.activeName) ? base.activeName : names[0];
  const defaultBat = bats.includes(base?.defaultBat) ? base.defaultBat : bats[0];

  for (let dateObj = start; dateObj <= end; dateObj = addDays(dateObj, 1)) {
    const date = toISO(dateObj);

    names.forEach((name, nameIndex) => {
      const seedPrefix = `demo-${nameIndex}-${name}`;
      if (!shouldPracticeOnDate(dateObj, seedPrefix)) return;

      const pick = randomPicker(`${seedPrefix}-${date}`);
      const scoreBias = nameIndex === 0 ? 0 : -18;
      const values = practiceValuesFromPicker(pick, scoreBias);
      const mainBat = defaultBat || bats[0] || "";
      if (!mainBat) return;
      const secondBat = secondaryBatFor(bats, mainBat, `${seedPrefix}-${date}-bat`);
      const useSecondBat = Boolean(secondBat && values.count >= 68 && pick(20) > 0.84);
      let secondaryCount = useSecondBat ? Math.round(values.count * (0.14 + pick(21) * 0.14)) : 0;
      secondaryCount = useSecondBat ? Math.min(28, Math.max(8, secondaryCount)) : 0;
      if (useSecondBat && values.count - secondaryCount < 50) secondaryCount = Math.max(0, values.count - 50);
      const chunks = secondaryCount >= 8
        ? [
            [mainBat, values.count - secondaryCount, 0],
            [secondBat, secondaryCount, 1],
          ]
        : [[mainBat, values.count, 0]];

      chunks.forEach(([bat, count, index]) => {
        if (count <= 0) return;
        const batOffset = index === 0 ? 3 : -8;
        const recordAvg = Math.round(clamp(values.avg + batOffset + (pick(30 + index) - 0.5) * 14, 320, 500));
        const recordBest = Math.round(clamp(values.best + batOffset + (pick(40 + index) - 0.5) * 18, recordAvg + 55, 670));
        records.push({
          id: `demo-${name}-${date}-${bat}-${index}`,
          name,
          bat,
          date,
          count,
          avg: recordAvg,
          best: recordBest,
        });
      });
    });
  }

  return {
    activeName,
    names,
    nameColors,
    bats,
    batColors,
    defaultBat,
    theme: nameColors[activeName] || base?.theme || "#2f86ff",
    records,
    badgeRewardGoal: String(base?.badgeRewardGoal || ""),
    badgeRewardText: String(base?.badgeRewardText || ""),
  };
}

function animationTestDb() {
  const names = ["テストプレイヤー"];
  const bats = ["メインバット", "サブバット"];
  return {
    activeName: names[0],
    names,
    nameColors: {
      [names[0]]: "#2f86ff",
    },
    bats,
    batColors: {
      [bats[0]]: "#ff9f1c",
      [bats[1]]: "#a26bff",
    },
    defaultBat: bats[0],
    theme: "#2f86ff",
    records: [],
    testInputDefaults: true,
  };
}

export default function App() {
  const [db, setDbState] = useState(loadDb);
  const [tab, setTab] = useState(() => (localStorage.getItem(STORAGE_KEY) ? "home" : "settings"));
  const [startupPhase, setStartupPhase] = useState("idle");
  const [selectedDate, setSelectedDate] = useState(todayISO);
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [pendingDelete, setPendingDelete] = useState(null);
  const [isNameMenuOpen, setIsNameMenuOpen] = useState(false);
  const [scoreAnimation, setScoreAnimation] = useState(null);
  const [firstGetBadges, setFirstGetBadges] = useState([]);
  const [homeViewDate, setHomeViewDate] = useState(todayISO);
  const [dismissedHomeBadgesByDate, setDismissedHomeBadgesByDate] = useState({});
  const headerLogoRef = useRef(null);
  const startupLogoRef = useRef(null);
  const startupTimerRef = useRef(null);
  const startupSoundTimerRef = useRef(null);

  useLayoutEffect(() => {
    const root = document.documentElement;
    const updateAppScale = () => {
      const viewportWidth = Math.max(0, window.innerWidth || kCompactLayoutWidth);
      const visualWidth = viewportWidth;
      const widthScale = visualWidth / kCompactLayoutWidth;
      const scale = Math.max(0.72, widthScale);
      const fontScale = 1;
      root.style.setProperty("--app-scale", scale.toFixed(4));
      root.style.setProperty("--app-font-scale", fontScale.toFixed(4));
      root.style.setProperty("--app-layout-width", `${kCompactLayoutWidth}px`);
      root.style.setProperty("--app-visual-width", `${visualWidth}px`);
      root.style.setProperty("--app-min-height", "100vh");
    };

    updateAppScale();
    window.addEventListener("resize", updateAppScale);
    return () => {
      window.removeEventListener("resize", updateAppScale);
      root.style.removeProperty("--app-scale");
      root.style.removeProperty("--app-font-scale");
      root.style.removeProperty("--app-layout-width");
      root.style.removeProperty("--app-visual-width");
      root.style.removeProperty("--app-min-height");
    };
  }, []);

  const setDb = (next) => {
    setDbState(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const currentName = db.activeName || db.names[0] || "";
  const activeDate = db.testInputDefaults && db.testDate ? db.testDate : todayISO();
  const allForNameRaw = useMemo(() => db.records.filter((record) => record.name === currentName), [db.records, currentName]);
  const allForName = useMemo(() => allForNameRaw.filter((record) => record.date <= activeDate), [allForNameRaw, activeDate]);
  const homeActiveDate = db.testInputDefaults ? activeDate : homeViewDate;
  const homeForName = useMemo(() => allForNameRaw.filter((record) => record.date <= homeActiveDate), [allForNameRaw, homeActiveDate]);
  const badgeMap = useMemo(() => badgesFor(allForName, activeDate), [allForName, activeDate]);
  const homeBadgeMap = useMemo(() => (
    homeActiveDate === activeDate ? badgeMap : badgesFor(homeForName, homeActiveDate)
  ), [activeDate, badgeMap, homeActiveDate, homeForName]);

  useEffect(() => {
    if ((!db.names.length || !db.bats.length) && tab !== "settings") setTab("settings");
  }, [db.names.length, db.bats.length, tab]);

  useEffect(() => {
    if (tab !== "home" && scoreAnimation) setScoreAnimation(null);
  }, [tab, scoreAnimation]);

  useEffect(() => {
    preloadEffectSounds();
    const playTapSound = (event) => {
      if (shouldPlayTapSound(event.target)) playEffectSound("tap");
    };
    document.addEventListener("click", playTapSound, true);
    return () => document.removeEventListener("click", playTapSound, true);
  }, []);

  useEffect(() => () => {
    if (startupTimerRef.current) window.clearTimeout(startupTimerRef.current);
    if (startupSoundTimerRef.current) window.clearTimeout(startupSoundTimerRef.current);
  }, []);

  useEffect(() => {
    if (!isNameMenuOpen) return undefined;
    const closeOnOutsideTap = (event) => {
      if (event.target.closest?.(".player-switcher")) return;
      setIsNameMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideTap, true);
    return () => document.removeEventListener("pointerdown", closeOnOutsideTap, true);
  }, [isNameMenuOpen]);

  const addRecord = (event, date = selectedDate) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const bat = String(form.get("bat") || "");
    if (!currentName || !bat) return false;
    const record = {
      id: uid(),
      name: currentName,
      bat,
      date,
      count: Math.max(1, Number(form.get("count")) || 1),
      avg: Math.max(0, Math.min(999, Number(form.get("avg")) || 0)),
      best: Math.max(0, Math.min(999, Number(form.get("best")) || 0)),
    };
    const nextRecords = [...db.records, record];
    if (date === activeDate) {
      const todayRecordsBefore = db.records.filter((item) => item.name === currentName && item.date === date);
      const todayRecordsAfter = nextRecords.filter((item) => item.name === currentName && item.date === date);
      const recordsForNameBefore = db.records.filter((item) => item.name === currentName);
      const recordsForNameAfter = nextRecords.filter((item) => item.name === currentName);
      const fromSummary = aggregate(todayRecordsBefore)[0] || emptyDailySummary(date);
      const toSummary = aggregate(todayRecordsAfter)[0] || emptyDailySummary(date);
      const fromWeekSummary = summaryForRecordsRange(recordsForNameBefore, RANGE_WEEK, date);
      const toWeekSummary = summaryForRecordsRange(recordsForNameAfter, RANGE_WEEK, date);
      const fromBat = aggregateByBat(todayRecordsBefore).find((item) => item.bat === bat) || { bat, count: 0, avg: 0, best: 0 };
      const toBat = aggregateByBat(todayRecordsAfter).find((item) => item.bat === bat) || { bat, count: 0, avg: 0, best: 0 };
      const weekRecordsBefore = recordsForViewRange(recordsForNameBefore, RANGE_WEEK, date);
      const weekRecordsAfter = recordsForViewRange(recordsForNameAfter, RANGE_WEEK, date);
      const fromWeekBat = aggregateByBat(weekRecordsBefore).find((item) => item.bat === bat) || { bat, count: 0, avg: 0, best: 0 };
      const toWeekBat = aggregateByBat(weekRecordsAfter).find((item) => item.bat === bat) || { bat, count: 0, avg: 0, best: 0 };
      const firstGetBadgesForRecord = firstEarnedBadgeDefinitions(recordsForNameBefore, recordsForNameAfter, date);
      setScoreAnimation({ id: uid(), bat, fromSummary, toSummary, fromWeekSummary, toWeekSummary, fromBat, toBat, fromWeekBat, toWeekBat, playedRanges: [], firstGetBadges: firstGetBadgesForRecord, firstGetShown: false });
    }
    setDb({ ...db, records: nextRecords });
    playEffectSound("score");
    return true;
  };

  const loadAnimationTestDb = () => {
    setDb({ ...db, testInputDefaults: true, testRandomGeneration: true, testDate: todayISO() });
    setScoreAnimation(null);
    setTab("home");
  };

  const markScoreAnimationPlayed = (completedRange) => {
    if (!completedRange) return;
    setScoreAnimation((current) => {
      if (!current) return current;
      const playedRanges = Array.from(new Set([...(current.playedRanges || []), completedRange]));
      if (completedRange === RANGE_TODAY && !current.firstGetShown && current.firstGetBadges?.length) {
        playEffectSound("get");
        setFirstGetBadges(current.firstGetBadges);
        return { ...current, playedRanges, firstGetShown: true };
      }
      return { ...current, playedRanges };
    });
  };

  const advanceFirstGetBadge = () => {
    setFirstGetBadges((current) => current.slice(1));
  };

  const addName = (event) => {
    event.preventDefault();
    const value = String(new FormData(event.currentTarget).get("name") || "").trim();
    if (!value || db.names.includes(value)) return;
    const usedColors = new Set([
      ...Object.values(normalizeNameColors(db.nameColors, db.names)),
      ...Object.values(normalizeBatColors(db.batColors, db.bats)),
    ]);
    setDb({
      ...db,
      activeName: value,
      names: [...db.names, value],
      nameColors: {
        ...normalizeNameColors(db.nameColors, db.names),
        [value]: firstAvailableColor(usedColors),
      },
    });
    event.currentTarget.reset();
  };

  const addBat = (event) => {
    event.preventDefault();
    const value = String(new FormData(event.currentTarget).get("bat") || "").trim();
    if (!value || db.bats.includes(value)) return;
    const nextBats = [...db.bats, value];
    const usedColors = new Set([
      ...Object.values(normalizeNameColors(db.nameColors, db.names)),
      ...Object.values(normalizeBatColors(db.batColors, db.bats)),
    ]);
    setDb({
      ...db,
      bats: nextBats,
      batColors: {
        ...normalizeBatColors(db.batColors, db.bats),
        [value]: firstAvailableBatColor(usedColors, fallbackBatColor(value, nextBats.length - 1)),
      },
      defaultBat: db.defaultBat || value,
    });
    event.currentTarget.reset();
  };

  const confirmDelete = () => {
    const pending = pendingDelete;
    setPendingDelete(null);
    if (!pending) return;
    if (pending.type === "all") {
      setDb({
        ...db,
        records: [],
      });
      return;
    }
    if (pending.type === "name") {
      const names = db.names.filter((name) => name !== pending.value);
      const nameColors = normalizeNameColors(db.nameColors, names, db.theme);
      setDb({
        ...db,
        names,
        nameColors,
        activeName: db.activeName === pending.value ? (names[0] || "") : db.activeName,
        records: db.records.filter((record) => record.name !== pending.value),
      });
    }
    if (pending.type === "bat") {
      const bats = db.bats.filter((bat) => bat !== pending.value);
      const batColors = normalizeBatColors(db.batColors, bats);
      setDb({
        ...db,
        bats,
        batColors,
        defaultBat: db.defaultBat === pending.value ? bats[0] || "" : db.defaultBat,
        records: db.records.filter((record) => record.bat !== pending.value),
      });
    }
  };

  const exportCsv = () => {
    const rows = [["name", "bat", "date", "count", "avg", "best"]];
    db.records
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name, "ja") || a.bat.localeCompare(b.bat, "ja"))
      .forEach((record) => rows.push([record.name, record.bat, record.date, record.count, record.avg, record.best]));
    const csv = rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `swing-log-${todayISO()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const importCsv = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const rows = parseCsv(await file.text()).slice(1);
    const next = { ...db, names: [...db.names], nameColors: normalizeNameColors(db.nameColors, db.names, db.theme), bats: [...db.bats], batColors: normalizeBatColors(db.batColors, db.bats), records: [...db.records] };
    rows.forEach(([name, bat, date, count, avg, best]) => {
      if (!name || !bat || !/^\d{4}-\d{2}-\d{2}$/.test(date || "")) return;
      if (!next.names.includes(name)) {
        next.names.push(name);
        next.nameColors[name] = firstAvailableColor(new Set([...Object.values(next.nameColors), ...Object.values(next.batColors)]));
      }
      if (!next.bats.includes(bat)) {
        const usedColors = new Set([...Object.values(next.nameColors), ...Object.values(next.batColors)]);
        next.bats.push(bat);
        next.batColors[bat] = firstAvailableBatColor(usedColors, fallbackBatColor(bat, next.bats.length - 1));
      }
      next.records.push({ id: uid(), name, bat, date, count: Number(count) || 0, avg: Number(avg) || 0, best: Number(best) || 0 });
    });
    if (!next.activeName && next.names[0]) next.activeName = next.names[0];
    if (!next.defaultBat && next.bats[0]) next.defaultBat = next.bats[0];
    setDb(next);
    event.target.value = "";
  };

  const startStartupSplash = () => {
    if (startupPhase !== "idle") return;
    audioContextForEffects()?.resume?.().catch(() => {});
    decodeEffectSound("start");
    setStartupPhase("running");
    window.requestAnimationFrame(() => {
      const logo = startupLogoRef.current;
      const headerLogo = headerLogoRef.current;
      if (!logo || !headerLogo) return;
      const target = headerLogo.getBoundingClientRect();
      const viewportWidth = window.innerWidth || kCompactLayoutWidth;
      const viewportHeight = window.innerHeight || kCompactLayoutHeight;
      const startWidth = Math.min(viewportWidth * 0.78, target.width * 1.34);
      const startLeft = (viewportWidth - startWidth) / 2;
      const startTop = Math.max(96, (viewportHeight * 0.38) - (startWidth * 0.18));
      logo.style.left = `${startLeft}px`;
      logo.style.top = `${startTop}px`;
      logo.style.width = `${startWidth}px`;
      logo.animate(
        [
          { left: `${startLeft}px`, top: `${startTop}px`, width: `${startWidth}px` },
          { left: `${target.left}px`, top: `${target.top}px`, width: `${target.width}px` },
        ],
        {
          duration: 600,
          delay: kStartupLogoMoveDelay,
          easing: "cubic-bezier(0.17, 0.92, 0.24, 1)",
          fill: "forwards",
        },
      );
    });
    startupSoundTimerRef.current = window.setTimeout(() => {
      playEffectSound("start");
      startupSoundTimerRef.current = null;
    }, kStartupLogoMoveDelay);
    startupTimerRef.current = window.setTimeout(() => {
      setStartupPhase("ready");
      startupTimerRef.current = null;
    }, kStartupSplashDuration);
  };

  return (
    <div
      className={`app theme-blue font-rounded startup-${startupPhase}`}
      style={{
        ...themeStyleFor(FIXED_UI_THEME),
        "--ballpark-bg-url": cssImageUrl(NEW_UI_ASSETS.background),
      }}
    >
      {startupPhase !== "ready" && (
        <div className={`startup-splash ${startupPhase}`} aria-hidden="true" />
      )}
      {startupPhase !== "ready" && (
        <img ref={startupLogoRef} className={`startup-splash-logo ${startupPhase}`} src={NEW_UI_ASSETS.logo} alt="" aria-hidden="true" />
      )}
      {startupPhase === "idle" && (
        <button
          type="button"
          className="startup-start-button"
          onClick={startStartupSplash}
          data-sound-effect="start"
        >
          スタート
        </button>
      )}
      <div className="phone-shell">
        <header className="app-header">
          <strong className="app-title" ref={headerLogoRef}><img src={NEW_UI_ASSETS.logo} alt="SWING LOG" /></strong>
          <div className="player-switcher">
            <button
              className="active-player"
              type="button"
              aria-expanded={isNameMenuOpen}
              onClick={() => setIsNameMenuOpen((value) => !value)}
            >
              <span style={{ "--player-name-size": playerNameFontSize(currentName, true) }}>{currentName || "未選択"}</span>
            </button>
            {isNameMenuOpen && (
              <div className="player-menu" role="menu" aria-label="名前を切り替え">
                {db.names.length ? db.names.map((name) => (
                  <button
                    type="button"
                    className={name === currentName ? "selected" : ""}
                    onClick={() => {
                      if (name !== currentName) playEffectSound("switch");
                      setDb({ ...db, activeName: name });
                      setIsNameMenuOpen(false);
                    }}
                    role="menuitem"
                    data-sound-effect="switch"
                    key={name}
                    style={{ "--player-menu-name-size": playerNameFontSize(name) }}
                  >
                    <span>{name}</span>
                  </button>
                )) : (
                  <button type="button" onClick={() => setTab("settings")} role="menuitem">名前を追加</button>
                )}
              </div>
            )}
          </div>
        </header>

        <main className="content">
          {tab === "home" && (
            <HomeView
              db={db}
              setDb={setDb}
              currentName={currentName}
              allForName={homeForName}
              allForNameRaw={allForNameRaw}
              addRecord={addRecord}
              activeDate={homeActiveDate}
              appActiveDate={activeDate}
              setHomeViewDate={setHomeViewDate}
              dismissedHomeBadgesByDate={dismissedHomeBadgesByDate}
              setDismissedHomeBadgesByDate={setDismissedHomeBadgesByDate}
              scoreAnimation={scoreAnimation}
              setScoreAnimation={setScoreAnimation}
              onScoreAnimationComplete={markScoreAnimationPlayed}
              badgeMap={homeBadgeMap}
            />
          )}
          {tab === "record" && (
            <GrowthView allForName={allForName} activeDate={activeDate} db={db} />
          )}
          {tab === "data" && (
            <DataView
              db={db}
              allForName={allForName}
              activeDate={activeDate}
            />
          )}
          {tab === "badges" && (
            <BadgeCollectionView allForName={allForName} activeDate={activeDate} db={db} setDb={setDb} />
          )}
          {tab === "settings" && (
            <SettingsView
              db={db}
              currentName={currentName}
              setDb={setDb}
              addName={addName}
              addBat={addBat}
              exportCsv={exportCsv}
              importCsv={importCsv}
              loadAnimationTestDb={loadAnimationTestDb}
              setPendingDelete={setPendingDelete}
            />
          )}
        </main>

        {pendingDelete && <DeleteDialog pending={pendingDelete} onCancel={() => setPendingDelete(null)} onConfirm={confirmDelete} />}
      </div>
      {firstGetBadges.length > 0 && (
        <FirstGetBadgeShowcase badges={firstGetBadges} onAdvance={advanceFirstGetBadge} />
      )}
      <BottomNav tab={tab} setTab={(nextTab) => {
        if (nextTab !== "settings" && (!db.names.length || !db.bats.length)) {
          playEffectSound("error");
          setTab("settings");
          scrollPageToTop();
          return;
        }
        if (nextTab !== tab) playEffectSound("tab");
        setTab(nextTab);
        scrollPageToTop();
      }} />
    </div>
  );
}

function HomeView({ db, setDb, currentName, allForName, allForNameRaw = allForName, addRecord, activeDate = todayISO(), appActiveDate = todayISO(), setHomeViewDate, dismissedHomeBadgesByDate, setDismissedHomeBadgesByDate, scoreAnimation, setScoreAnimation, onScoreAnimationComplete, resultRange = RANGE_TODAY, onChallengeRangeChange = null, title = "今日の結果", titleIcon = "home", badgeTitle = "今日のバッジ", badgeMap: precomputedBadgeMap = null }) {
  const [formResetKey, setFormResetKey] = useState(0);
  const showHomeEntryTools = resultRange === RANGE_TODAY;
  const scoreAnimationPlayed = Boolean(scoreAnimation?.playedRanges?.includes(resultRange));
  const animationFromSummary = resultRange === RANGE_WEEK && scoreAnimation?.fromWeekSummary
    ? scoreAnimation.fromWeekSummary
    : resultRange === RANGE_TODAY
      ? scoreAnimation?.fromSummary
      : null;
  const animationToSummary = resultRange === RANGE_WEEK && scoreAnimation?.toWeekSummary
    ? scoreAnimation.toWeekSummary
    : resultRange === RANGE_TODAY
      ? scoreAnimation?.toSummary
      : null;
  const canPlayScoreAnimation = Boolean(animationFromSummary && animationToSummary);
  const activeScoreAnimationKey = scoreAnimation && !scoreAnimationPlayed && canPlayScoreAnimation ? `${scoreAnimation.id}:${resultRange}` : null;
  const scoreProgressAnimation = useScoreProgressAnimation(activeScoreAnimationKey, {
    enabled: Boolean(activeScoreAnimationKey),
    onComplete: () => onScoreAnimationComplete?.(resultRange),
  });
  const allFiltered = allForName;
  const todayRecords = useMemo(() => allFiltered.filter((record) => record.date === activeDate), [allFiltered, activeDate]);
  const viewRecords = useMemo(() => recordsForViewRange(allFiltered, resultRange, activeDate), [allFiltered, resultRange, activeDate]);
  const todaySummary = useMemo(() => summaryForRecordsRange(allFiltered, resultRange, activeDate), [allFiltered, resultRange, activeDate]);
  const hasTodayRecord = todayRecords.length > 0;
  const todayByBat = useMemo(() => aggregateByBat(viewRecords), [viewRecords]);
  const shouldPlayScoreAnimation = Boolean(scoreAnimation && !scoreAnimationPlayed && canPlayScoreAnimation);
  const effectiveScoreAnimationProgress = shouldPlayScoreAnimation ? scoreProgressAnimation.progress : 1;
  const isScoreAnimating = Boolean(shouldPlayScoreAnimation && scoreProgressAnimation.active);
  const displayTodaySummary = shouldPlayScoreAnimation
    ? interpolateDailySummary(animationFromSummary, animationToSummary, effectiveScoreAnimationProgress)
    : todaySummary;
  const bestDefinitionsForSummary = () => badgeDefinitionsForMetric(resultRange, "best");
  const avgDefinitionsForSummary = () => badgeDefinitionsForMetric(resultRange, "avg");
  const daysBadgeDefinitions = badgeDefinitionsForMetric(resultRange, "days", animationFromSummary?.spanDays || todaySummary.spanDays);
  const countBadgeDefinitions = badgeDefinitionsForMetric(resultRange, "count");
  const avgBadgeDefinitions = avgDefinitionsForSummary(animationFromSummary);
  const bestBadgeDefinitions = bestDefinitionsForSummary(animationFromSummary);
  const animatedFillRatioFor = (metric, fromValue, toValue, definitions) => {
    const domain = scoreBarDomainForCard({ metric, range: resultRange }, definitions);
    const value = interpolateNumber(fromValue || 0, toValue || 0, effectiveScoreAnimationProgress);
    return scoreBarFillRatio(value, domain);
  };
  const scoreCardAnimation = shouldPlayScoreAnimation ? {
    active: isScoreAnimating,
    fillRatios: {
      days: animatedFillRatioFor("days", animationFromSummary.days, animationToSummary.days, daysBadgeDefinitions),
      count: animatedFillRatioFor("count", animationFromSummary.count, animationToSummary.count, countBadgeDefinitions),
      avg: animatedFillRatioFor("avg", animationFromSummary.avg, animationToSummary.avg, avgBadgeDefinitions),
      best: animatedFillRatioFor("best", animationFromSummary.best, animationToSummary.best, bestBadgeDefinitions),
    },
    badgeOverrides: animationFromSummary.count > 0 ? {
      days: dailyResultBadge("days", animationFromSummary.days, daysBadgeDefinitions),
      count: dailyResultBadge("count", animationFromSummary.count, countBadgeDefinitions),
      avg: dailyResultBadge("avg", animationFromSummary.avg, avgBadgeDefinitions),
      best: dailyResultBadge("best", animationFromSummary.best, bestBadgeDefinitions),
    } : {},
  } : null;
  const animatedBatSummary = shouldPlayScoreAnimation
    ? {
        bat: scoreAnimation.bat,
        ...interpolateDailySummary(
          resultRange === RANGE_WEEK && scoreAnimation.fromWeekBat ? scoreAnimation.fromWeekBat : scoreAnimation.fromBat,
          resultRange === RANGE_WEEK && scoreAnimation.toWeekBat ? scoreAnimation.toWeekBat : scoreAnimation.toBat,
          effectiveScoreAnimationProgress
        ),
      }
    : null;
  const homeBatSummaries = useMemo(() => {
    const batOrder = new Map(db.bats.map((bat, index) => [bat, index]));
    return todayByBat
      .map((item) => (animatedBatSummary?.bat === item.bat ? { ...item, ...animatedBatSummary } : item))
      .sort((a, b) => (batOrder.get(a.bat) ?? 9999) - (batOrder.get(b.bat) ?? 9999));
  }, [animatedBatSummary, db.bats, todayByBat]);
  const testRecordValues = useMemo(() => (
    db.testInputDefaults && db.testRandomGeneration
      ? randomTestRecordValues()
      : null
  ), [activeDate, db.testInputDefaults, db.testRandomGeneration, formResetKey, todayRecords.length]);
  const isHomeHistoryView = !db.testInputDefaults && activeDate !== todayISO();
  const viewWindow = useMemo(() => (
    resultRange === RANGE_TODAY ? null : viewWindowForRange(allFiltered, resultRange, activeDate)
  ), [allFiltered, resultRange, activeDate]);
  const badgeMap = precomputedBadgeMap || badgesFor(allForName, activeDate);
  const viewBadgeLabels = useMemo(() => [...badgeMap.entries()].flatMap(([date, labels]) => {
    if (resultRange === RANGE_TODAY) return date === activeDate ? labels : [];
    return date >= toISO(viewWindow.start) && date <= toISO(viewWindow.end) ? labels : [];
  }), [badgeMap, resultRange, activeDate, viewWindow]);
  const dismissedBadgeBucket = resultRange === RANGE_TODAY ? activeDate : `${resultRange}:${toISO(viewWindow.start)}`;
  const dismissedHomeBadges = useMemo(() => new Set(dismissedHomeBadgesByDate[dismissedBadgeBucket] || []), [dismissedHomeBadgesByDate, dismissedBadgeBucket]);
  const badgeCounts = useMemo(() => [...viewBadgeLabels.reduce((map, label) => {
    map.set(label, (map.get(label) || 0) + 1);
    return map;
  }, new Map()).entries()].sort(([a], [b]) => compareBadgesByRarity(a, b)), [viewBadgeLabels]);
  const headerDateLabel = resultRange === RANGE_TODAY
    ? formatJapaneseMonthDayWithWeekday(parseISO(activeDate))
    : viewWindowForRange(allFiltered, resultRange, activeDate).label;
  const markedDates = useMemo(() => new Set(allForNameRaw.map((record) => record.date)), [allForNameRaw]);
  const handleRecordSubmit = (event) => {
    if (addRecord(event, activeDate)) {
      if (!db.testInputDefaults) event.currentTarget.reset();
      setFormResetKey((value) => value + 1);
    }
  };
  const handleTestRecordCreate = (bat) => {
    if (!db.testInputDefaults || !currentName || !bat) return;
    const values = testRecordValues || randomTestRecordValues();
    const record = {
      id: uid(),
      name: currentName,
      bat,
      date: activeDate,
      ...values,
    };
    const nextRecords = [...db.records, record];
    const recordsForNameBefore = db.records.filter((item) => item.name === currentName);
    const todayRecordsBefore = recordsForNameBefore.filter((item) => item.date === activeDate);
    const recordsForNameAfter = nextRecords.filter((item) => item.name === currentName);
    const todayRecordsAfter = recordsForNameAfter.filter((item) => item.date === activeDate);
    const fromSummary = aggregate(todayRecordsBefore)[0] || emptyDailySummary(activeDate);
    const toSummary = aggregate(todayRecordsAfter)[0] || emptyDailySummary(activeDate);
    const fromWeekSummary = summaryForRecordsRange(recordsForNameBefore, RANGE_WEEK, activeDate);
    const toWeekSummary = summaryForRecordsRange(recordsForNameAfter, RANGE_WEEK, activeDate);
    const fromBat = aggregateByBat(todayRecordsBefore).find((item) => item.bat === bat) || { bat, count: 0, avg: 0, best: 0 };
    const toBat = aggregateByBat(todayRecordsAfter).find((item) => item.bat === bat) || fromBat;
    const weekRecordsBefore = recordsForViewRange(recordsForNameBefore, RANGE_WEEK, activeDate);
    const weekRecordsAfter = recordsForViewRange(recordsForNameAfter, RANGE_WEEK, activeDate);
    const fromWeekBat = aggregateByBat(weekRecordsBefore).find((item) => item.bat === bat) || { bat, count: 0, avg: 0, best: 0 };
    const toWeekBat = aggregateByBat(weekRecordsAfter).find((item) => item.bat === bat) || fromWeekBat;
    const firstGetBadgesForRecord = firstEarnedBadgeDefinitions(recordsForNameBefore, recordsForNameAfter, activeDate);
    setScoreAnimation?.({ id: uid(), bat, fromSummary, toSummary, fromWeekSummary, toWeekSummary, fromBat, toBat, fromWeekBat, toWeekBat, playedRanges: [], firstGetBadges: firstGetBadgesForRecord, firstGetShown: false });
    setDb({
      ...db,
      records: nextRecords,
    });
    setDismissedHomeBadgesByDate({});
    setFormResetKey((value) => value + 1);
  };
  const handleHomeDateSelect = (nextDate) => {
    if (!db.testInputDefaults) {
      setHomeViewDate?.(nextDate || todayISO());
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nextDate) || !currentName) {
      setDb({ ...db, testDate: nextDate });
      return;
    }
    const currentDate = appActiveDate;
    if (nextDate <= currentDate) {
      setDb({
        ...db,
        testDate: nextDate,
        records: db.records.filter((record) => record.name !== currentName || record.date <= nextDate),
      });
      return;
    }

    const bat = db.defaultBat || db.bats[0] || "";
    if (!bat) {
      setDb({ ...db, testDate: nextDate });
      return;
    }
    const startDate = addDays(parseISO(currentDate), 1);
    const endDate = addDays(parseISO(nextDate), -1);
    const generatedRecords = [];
    for (let date = startDate; date <= endDate; date = addDays(date, 1)) {
      const isoDate = toISO(date);
      if (!shouldPracticeOnDate(date, `test-${currentName}`)) continue;
      const pick = randomPicker(`test-${currentName}-${isoDate}`);
      const values = practiceValuesFromPicker(pick);
      const secondBat = secondaryBatFor(db.bats, bat, `test-${currentName}-${isoDate}-bat`);
      const useSecondBat = Boolean(secondBat && values.count >= 68 && pick(20) > 0.84);
      let secondaryCount = useSecondBat ? Math.round(values.count * (0.14 + pick(21) * 0.14)) : 0;
      secondaryCount = useSecondBat ? Math.min(28, Math.max(8, secondaryCount)) : 0;
      if (useSecondBat && values.count - secondaryCount < 50) secondaryCount = Math.max(0, values.count - 50);
      const chunks = secondaryCount >= 8
        ? [[bat, values.count - secondaryCount], [secondBat, secondaryCount]]
        : [[bat, values.count]];
      chunks.forEach(([recordBat, count], index) => {
        const batOffset = index === 0 ? 3 : -8;
        generatedRecords.push({
          id: uid(),
          name: currentName,
          bat: recordBat,
          date: isoDate,
          count,
          avg: Math.round(clamp(values.avg + batOffset + (pick(30 + index) - 0.5) * 14, 320, 500)),
          best: Math.round(clamp(values.best + batOffset + (pick(40 + index) - 0.5) * 18, values.avg + 55, 670)),
        });
      });
    }
    setDb({
      ...db,
      testDate: nextDate,
      records: [
        ...db.records.filter((record) => (
          record.name !== currentName ||
          record.date <= currentDate ||
          record.date > nextDate
        )),
        ...generatedRecords,
      ],
    });
  };

  return (
    <>
      <section className="home-section home-result-section">
        <div className="result-top-slot">
        <div className="section-row tight result-header-row">
          <ResultHeader
            title={title}
            icon={titleIcon}
            dateLabel={headerDateLabel}
            headingSlot={onChallengeRangeChange ? (
              <ChallengeRangeTabs activeRange={resultRange} onChange={onChallengeRangeChange} />
            ) : null}
          />
          {showHomeEntryTools && db.testInputDefaults && (
            <div className="home-test-controls">
              <label className="test-auto-switch" aria-label="自動生成">
                <input
                  type="checkbox"
                  checked={Boolean(db.testRandomGeneration)}
                  onChange={(event) => setDb({ ...db, testRandomGeneration: event.target.checked })}
                />
                <span>自動生成</span>
              </label>
            </div>
          )}
          {showHomeEntryTools && (
            <HomeDatePicker
              value={activeDate}
              markedDates={markedDates}
              minDate={firstRecordDate(allForNameRaw) ? toISO(firstRecordDate(allForNameRaw)) : "2024-01-01"}
              maxDate={db.testInputDefaults ? null : todayISO()}
              onSelect={handleHomeDateSelect}
            />
          )}
        </div>
        </div>
        <div className={`home-score-input-grid ${showHomeEntryTools ? "" : "no-input-card"}`}>
          {showHomeEntryTools && (
            <section className="home-section home-input-panel open">
              <div className="input-panel-layout">
                <SwingForm
                  key={db.defaultBat}
                  bats={db.bats}
                  defaultBat={db.defaultBat}
                  batColors={db.batColors}
                  defaultValues={testRecordValues}
                  resetToken={formResetKey}
                  submitDisabled={isScoreAnimating || isHomeHistoryView}
                  testAction={db.testInputDefaults ? handleTestRecordCreate : null}
                  onSubmit={handleRecordSubmit}
                  submitLabel={hasTodayRecord ? "追加する" : "記録する"}
                />
              </div>
            </section>
          )}
          <DailyResultCards
            summary={displayTodaySummary}
            animation={scoreCardAnimation}
            range={resultRange}
            includeDays={!showHomeEntryTools}
            dismissedHomeBadges={dismissedHomeBadges}
            onDismissHomeBadge={(key) => setDismissedHomeBadgesByDate((current) => ({
              ...current,
              [dismissedBadgeBucket]: Array.from(new Set([...(current[dismissedBadgeBucket] || []), key])),
            }))}
          />
        </div>
        <BatRecordsSection className="home-bat-records">
          {homeBatSummaries.length ? (
            homeBatSummaries.map((item) => (
            <HomeBatResultCard
              db={db}
              item={item}
              key={item.bat}
            />
            ))
          ) : <p className="empty compact-empty">結果入力するとバット別記録が表示されます。</p>}
        </BatRecordsSection>
        <EarnedBadgesCard badgeCounts={badgeCounts} title={badgeTitle} />
      </section>
    </>
  );
}

function ChallengeRangeTabs({ activeRange, onChange }) {
  return (
    <div className="challenge-range-tabs" role="tablist" aria-label="成長期間">
      {CHALLENGE_RANGE_TABS.map((tab) => (
        <button
          type="button"
          role="tab"
          aria-selected={activeRange === tab.range}
          className={activeRange === tab.range ? "selected" : ""}
          onClick={() => onChange?.(tab.range)}
          key={tab.range}
        >
          <span className="challenge-tab-period">{tab.period}</span>
          <span className="challenge-tab-label">成長</span>
        </button>
      ))}
    </div>
  );
}

function highestMetricForRecords(records, metric) {
  return aggregate(records).reduce((best, day) => {
    const value = Number(day[metric] || 0);
    if (value > best.value) return { value, date: day.date };
    return best;
  }, { value: 0, date: "" });
}

function GrowthView({ allForName, activeDate = todayISO(), db = defaultDb }) {
  const weekSummary = useMemo(() => summaryForRecordsRange(allForName, RANGE_WEEK, activeDate), [allForName, activeDate]);
  const monthSummary = useMemo(() => summaryForRecordsRange(allForName, RANGE_MONTH, activeDate), [allForName, activeDate]);
  const yearSummary = useMemo(() => summaryForRecordsRange(allForName, RANGE_YEAR, activeDate), [allForName, activeDate]);
  const favoriteBat = db.bats.includes(db.defaultBat) ? db.defaultBat : db.bats[0] || "";
  const [selectedBat, setSelectedBat] = useState(favoriteBat);
  useEffect(() => {
    if (!selectedBat || !db.bats.includes(selectedBat)) setSelectedBat(favoriteBat);
  }, [db.bats, favoriteBat, selectedBat]);
  const selectedBatRecords = useMemo(() => (
    selectedBat ? allForName.filter((record) => record.bat === selectedBat) : []
  ), [allForName, selectedBat]);
  const selectedBatColor = selectedBat ? batColorFor(db, selectedBat) : "#f4a20b";
  const selectedBatDarkColor = darkenHex(selectedBatColor);
  const highestAverage = useMemo(() => highestMetricForRecords(selectedBatRecords, "avg"), [selectedBatRecords]);
  const highestBest = useMemo(() => highestMetricForRecords(selectedBatRecords, "best"), [selectedBatRecords]);
  const activeDateValue = parseISO(activeDate);
  const weekRangeLabel = `${formatSlashMonthDayWithWeekday(startOfWeek(activeDateValue))}〜${formatSlashMonthDayWithWeekday(endOfWeek(activeDateValue))}`;
  const monthRangeLabel = formatSlashRange(startOfMonth(activeDateValue), endOfMonth(activeDateValue));
  const yearRangeLabel = `〜${formatSlashMonthDay(new Date(activeDateValue.getFullYear(), 11, 31))}`;

  const countRows = [
    { label: "今週", subLabel: weekRangeLabel, value: weekSummary.count, unit: "回", metric: "count", range: RANGE_WEEK },
    { label: "今月", subLabel: monthRangeLabel, value: monthSummary.count, unit: "回", metric: "count", range: RANGE_MONTH },
    { label: "今年", subLabel: yearRangeLabel, value: yearSummary.count, unit: "回", metric: "count", range: RANGE_YEAR },
  ];
  const dayRows = [
    { label: "今週", subLabel: weekRangeLabel, value: weekSummary.days, unit: "日", metric: "days", range: RANGE_WEEK },
    { label: "今月", subLabel: monthRangeLabel, value: monthSummary.days, unit: "日", metric: "days", range: RANGE_MONTH },
    { label: "今年", subLabel: yearRangeLabel, value: yearSummary.days, unit: "日", metric: "days", range: RANGE_YEAR },
  ];
  const allTimeRows = [
    { label: "平均", subLabel: highestAverage.date ? highestAverage.date.replaceAll("-", "/") : "", value: highestAverage.value, unit: "点", metric: "avg", meterKind: "bat", range: "special", badgeDefinitions: ALL_TIME_AVG_BADGE_DEFINITIONS },
    { label: "ベスト", subLabel: highestBest.date ? highestBest.date.replaceAll("-", "/") : "", value: highestBest.value, unit: "点", metric: "best", meterKind: "bat", range: "special", badgeDefinitions: ALL_TIME_BEST_BADGE_DEFINITIONS },
  ];

  return (
    <section className="growth-view">
      <div className="section-row tight result-header-row">
        <ResultHeader
          title="チャレンジ"
          icon="challenge"
          dateLabel=""
        />
      </div>
      <div className="growth-section-stack">
        <GrowthSectionCard icon="count" title="スイング数" rows={countRows} />
        <GrowthSectionCard icon="calendar" title="練習日数" rows={dayRows} />
        <GrowthSectionCard
          icon="trophy"
          title="過去最高"
          rows={allTimeRows}
          tone="best"
          style={{
            "--growth-color": selectedBatColor,
            "--growth-color-dark": selectedBatDarkColor,
            "--score-color": selectedBatColor,
            "--score-dark": selectedBatDarkColor,
          }}
          headingAction={(
            <BatSelect
              value={selectedBat}
              onChange={setSelectedBat}
              bats={db.bats}
              batColors={db.batColors}
              ariaLabel="過去最高を表示するバット"
              className="growth-bat-select"
            />
          )}
        />
      </div>
    </section>
  );
}

function GrowthSectionCard({ icon, title, rows, tone = icon, headingAction = null, style = null }) {
  const assetKey = icon === "calendar" ? "days" : icon;
  return (
    <article className={`growth-section-card ${tone}`} style={style || undefined}>
      <h2 className="growth-heading">
        <span className="growth-heading-main">
          {NEW_UI_ASSETS[assetKey] ? (
            <span className={`growth-heading-orb ${assetKey}`}>
              <img className="metric-image-icon" src={NEW_UI_ASSETS[assetKey]} width="80" height="80" decoding="async" alt="" aria-hidden="true" />
            </span>
          ) : <Icon type={icon} />}
          <span>{title}</span>
        </span>
        {headingAction ? <span className="growth-heading-action">{headingAction}</span> : (
          <span className="growth-heading-target">
            次のバッジまで
          </span>
        )}
      </h2>
      <div className="growth-progress-list">
        <GrowthSelectableProgressPanel rows={rows} />
      </div>
    </article>
  );
}

function rowKey(row, index = 0) {
  return `${row.range || "row"}:${row.metric || "metric"}:${row.label || index}`;
}

function GrowthSelectableProgressPanel({ rows }) {
  const candidates = rows.map((row, index) => {
    const targetInfo = row.emptyMessage ? null : targetInfoForDailyCard(row);
    const remaining = targetInfo?.next ? Math.max(0, targetInfo.next.target - Number(row.value || 0)) : 0;
    return { row, key: rowKey(row, index), targetInfo, remaining };
  });
  const defaultKey = candidates
    .filter((item) => item.targetInfo?.next)
    .sort((a, b) => a.remaining - b.remaining)[0]?.key || candidates[0]?.key;
  const [selectedKey, setSelectedKey] = useState(defaultKey);
  useEffect(() => {
    setSelectedKey(defaultKey);
  }, [defaultKey]);
  const selectedItem = candidates.find((item) => item.key === selectedKey) || candidates[0];

  return (
    <div className="growth-selectable-panel">
      <div className="growth-selectable-list">
        {candidates.map((item) => {
          const { row, targetInfo } = item;
          const isSelected = selectedItem?.key === item.key;
          const remaining = targetInfo?.next ? Math.max(0, targetInfo.next.target - Number(row.value || 0)) : 0;
          return (
            <button
              type="button"
              className={`growth-selectable-row ${isSelected ? "selected" : ""}`}
              onClick={() => {
                if (!isSelected) playEffectSound("switch");
                setSelectedKey(item.key);
              }}
              data-sound-effect="switch"
              aria-pressed={isSelected}
              key={item.key}
            >
              <span className="growth-selectable-label">
                {row.label}
              </span>
              <strong style={growthValueFontTokens(row.value, 1.86)}>{Number(row.value || 0).toLocaleString("ja-JP")}<small>{row.unit}</small></strong>
              <span className={row.emptyMessage ? "growth-score-remaining missing" : targetInfo?.next ? "growth-score-remaining" : "growth-score-remaining complete"}>
                {row.emptyMessage || (targetInfo?.next ? <>あと<strong>{remaining.toLocaleString("ja-JP")}</strong>{row.unit}</> : "コンプリート")}
              </span>
            </button>
          );
        })}
      </div>
      {selectedItem?.row && (
        <section className="growth-score-detail growth-selectable-detail" aria-label={`${selectedItem.row.label}の詳細`}>
          <span className="growth-score-detail-pointer" aria-hidden="true" />
          <GrowthProgressRow row={{ ...selectedItem.row, hideRemaining: true }} />
        </section>
      )}
    </div>
  );
}

function GrowthProgressRow({ row }) {
  const [selectedBadge, setSelectedBadge] = useState(null);
  const milestoneTrackRef = useRef(null);
  const [milestoneTrackWidth, setMilestoneTrackWidth] = useState(0);
  const value = Number(row.value || 0);
  const badgeDefinitions = row.badgeDefinitions || badgeDefinitionsForMetric(row.range, row.metric);
  const targetInfo = row.emptyMessage ? null : targetInfoForDailyCard({
    metric: row.metric,
    range: row.range,
    value,
    unit: row.unit,
    badgeDefinitions,
  });
  const milestones = targetInfo?.visibleMilestones || [];
  const targetBadge = targetInfo?.next || targetInfo?.current || null;
  const targetBadgeDefinition = targetBadge?.label
    ? makeBadgeDefinition(canonicalBadgeLabel(targetBadge.label), { description: targetBadge.description })
    : null;
  const displayValue = row.displayValue ?? value;
  const numericDisplayValue = displayValue === null ? null : Number(displayValue || 0);
  const displayPrefix = row.prefix === "signed"
    ? numericDisplayValue < 0 ? "-" : "+"
    : row.prefix || "";
  const displayNumber = row.prefix === "signed" && numericDisplayValue !== null
    ? Math.abs(numericDisplayValue)
    : numericDisplayValue;
  const remaining = targetInfo?.next ? Math.max(0, targetInfo.next.target - value) : 0;
  const milestoneFillRatio = targetInfo?.fillRatio || 0;
  const milestoneFillBleedPx = milestoneFillRatio > 0 ? 2 : 0;
  const homeMeterKind = row.meterKind || (row.metric === "count" ? "count" : row.metric === "days" ? "days" : row.metric === "best" ? "best" : "avg");
  const remainingAnchor = targetInfo?.next || targetInfo?.current || null;
  const remainingAnchorPositionPx = remainingAnchor && milestoneTrackWidth > 0
    ? 13 + ((Number(remainingAnchor.position) || 0) / 100) * milestoneTrackWidth - (clamp(28 * 1.12, 15, 32) / 2)
    : null;
  const referenceValue = Number(row.referenceValue);
  const referenceDomain = targetInfo?.scoreBarDomain || null;
  const referencePosition = Number.isFinite(referenceValue) && referenceDomain
    ? clamp(((referenceValue - referenceDomain.start) / Math.max(1, referenceDomain.end - referenceDomain.start)) * 100, 0, 100)
    : null;
  const remainingPositionStyle = row.alignRemaining === "right"
    ? { "--growth-remaining-x": "100%", "--growth-remaining-translate": "-100%" }
    : remainingAnchorPositionPx !== null
      ? { "--growth-remaining-x": `${remainingAnchorPositionPx}px` }
      : undefined;

  useLayoutEffect(() => {
    const node = milestoneTrackRef.current;
    if (!node) return undefined;
    const updateWidth = () => setMilestoneTrackWidth(node.offsetWidth || node.clientWidth || 0);
    updateWidth();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateWidth);
      return () => window.removeEventListener("resize", updateWidth);
    }
    const observer = new ResizeObserver(updateWidth);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div className={`growth-progress-row ${row.metric}`}>
      <div className="growth-progress-main">
        <span>{row.label}{row.subLabel && <small>{row.subLabel}</small>}</span>
        <strong style={growthValueFontTokens(displayNumber, 2.22)}>
          {displayValue !== null ? displayPrefix : ""}
          {displayValue === null ? "-" : Number(displayNumber || 0).toLocaleString("ja-JP")}
          <small>{row.unit}</small>
        </strong>
      </div>
      {row.emptyMessage ? (
        <div className="growth-empty-track">{row.emptyMessage}</div>
      ) : (
        <>
          <div
            className={`growth-home-meter daily-result-card ${homeMeterKind}`}
            style={{
              "--milestone-fill-ratio": String(milestoneFillRatio),
              "--milestone-fill-bleed-px": `${milestoneFillBleedPx}px`,
              "--score-color": "var(--row-color)",
              "--score-dark": "var(--row-color-dark)",
              "--meter-glow": "var(--row-color)",
            }}
          >
            <div ref={milestoneTrackRef} className={`milestone-track ${targetInfo?.current ? "earned" : ""}`}>
              <span className="milestone-fill" />
              {referencePosition !== null && (
                <span
                  className="growth-reference-marker"
                  style={{ left: `${referencePosition}%` }}
                  aria-label={`${row.referenceLabel || ""}の${row.metric === "best" ? "ベストスコア" : "平均スコア"} ${referenceValue.toLocaleString("ja-JP")}`}
                >
                  <span>
                    <b>{row.referenceLabel || ""}</b>
                    <em>{referenceValue.toLocaleString("ja-JP")}</em>
                  </span>
                </span>
              )}
              {milestones.map((milestone) => {
                const alpha = milestoneAlpha(milestone.position);
                const isTargetMilestone = targetInfo?.next?.label === milestone.label || (!targetInfo?.next && targetInfo?.current?.label === milestone.label);
                const milestoneState = isTargetMilestone ? "target" : milestone.earned ? "earned" : "locked";
                const dotScale = isTargetMilestone ? 1.12 : milestone.earned ? 0.86 : 0.62;
                const dotSize = clamp(28 * dotScale, 15, 32);
                const visualDotSize = dotSize;
                const frameSize = dotSize + 5;
                const fillPx = milestoneFillRatio * milestoneTrackWidth;
                const effectiveFillPx = Math.min(milestoneTrackWidth, fillPx + milestoneFillBleedPx);
                const targetPx = (milestone.position / 100) * milestoneTrackWidth;
                const dotLeftPx = targetPx - visualDotSize;
                const frameLeftPx = targetPx - (visualDotSize / 2) - (frameSize / 2);
                const iconComplete = milestone.earned || effectiveFillPx >= targetPx;
                const targetValue = Number(milestone.target);
                const useZeroAnchoredIconFill = isTargetMilestone && dotLeftPx < 0 && Number.isFinite(targetValue) && targetValue > 0;
                const continuousIconFillRatio = milestoneTrackWidth > 0 ? clamp((effectiveFillPx - dotLeftPx) / visualDotSize, 0, 1) : 0;
                const zeroAnchoredIconFillRatio = useZeroAnchoredIconFill ? clamp(value / targetValue, 0, 1) : 0;
                const iconFillRatio = iconComplete ? 1 : useZeroAnchoredIconFill ? zeroAnchoredIconFillRatio : continuousIconFillRatio;
                const iconFillPx = iconComplete ? visualDotSize : visualDotSize * iconFillRatio;
                const iconGradientWidthPx = useZeroAnchoredIconFill ? visualDotSize : Math.max(1, milestoneTrackWidth);
                const iconGradientBgX = useZeroAnchoredIconFill ? 0 : -dotLeftPx;
                const definition = makeBadgeDefinition(canonicalBadgeLabel(milestone.label), { description: milestone.description || `${milestone.label}をゲット` });
                const showAbsoluteTarget = Number.isFinite(referenceValue)
                  && typeof milestone.displayTarget === "string"
                  && milestone.displayTarget.startsWith("+");
                return (
                  <Fragment key={milestone.label}>
                    <span
                      className="milestone-dot-frame"
                      style={{
                        left: `${frameLeftPx}px`,
                        "--milestone-dot-scale": dotScale.toFixed(3),
                        "--milestone-frame-size-px": `${frameSize}px`,
                      }}
                      aria-hidden="true"
                    />
                    <button
                      type="button"
                      className={`milestone-dot ${milestoneState} ${isTargetMilestone && iconFillRatio <= 0 ? "empty-target" : ""}`}
                      data-sound-effect="popup"
                      style={{
                        left: `${dotLeftPx}px`,
                        "--milestone-alpha": alpha.toFixed(2),
                        "--milestone-ring-alpha": Math.max(0.08, alpha * 0.7).toFixed(2),
                        "--milestone-dot-scale": dotScale.toFixed(3),
                        "--milestone-dot-size-px": `${visualDotSize}px`,
                        "--milestone-track-width-px": `${iconGradientWidthPx}px`,
                        "--milestone-dot-bg-x": `${iconGradientBgX}px`,
                        "--milestone-icon-fill-px": `${iconFillPx}px`,
                        "--milestone-target-progress": iconFillRatio.toFixed(3),
                        "--milestone-target-progress-percent": `${Math.round(iconFillRatio * 100)}%`,
                      }}
                      onClick={() => setSelectedBadge({ ...definition, earnedCount: milestone.earned ? 1 : 0, lockedSecret: false })}
                      aria-label={`${definition.label}の詳細`}
                    >
                      <RarityIcon rarity={rarityForBadge(milestone.label)} />
                      <span className={`milestone-target-label ${showAbsoluteTarget ? "with-absolute" : ""}`}>
                        <b>{milestone.displayTarget ?? milestone.target}</b>
                        {showAbsoluteTarget && <em>{targetValue.toLocaleString("ja-JP")}</em>}
                      </span>
                    </button>
                  </Fragment>
                );
              })}
            </div>
          </div>
          <div
            className={`growth-progress-meta ${row.hideRemaining ? "hidden" : ""}`}
            style={remainingPositionStyle}
          >
            <span aria-hidden="true" />
            {!row.hideRemaining && (
              <small className={targetInfo?.next ? "" : "complete"}>{targetInfo?.next ? `あと${remaining.toLocaleString("ja-JP")}${row.unit}` : "コンプリート"}</small>
            )}
          </div>
        </>
      )}
      {selectedBadge && <BadgeDetailPopover badge={{ ...selectedBadge, lockedSecret: false }} onClose={() => setSelectedBadge(null)} />}
    </div>
  );
}

function ResultHeader({ title, icon = null, dateLabel, headingSlot = null }) {
  return (
    <div className={`result-heading ${headingSlot ? "with-tabs" : ""}`}>
      {headingSlot || (title ? <h2 className="icon-heading">{icon && <Icon type={icon} />}{title}</h2> : <span aria-hidden="true" />)}
      {dateLabel ? <p>{dateLabel}</p> : null}
    </div>
  );
}

function HomeDatePicker({ value, markedDates, minDate = "2024-01-01", maxDate = todayISO(), onSelect }) {
  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(parseISO(value || todayISO())));
  const pickerRef = useRef(null);
  const selectedDate = parseISO(value || todayISO());
  const todayDate = parseISO(todayISO());
  const minDateValue = minDate ? parseISO(minDate) : null;
  const maxDateValue = maxDate ? parseISO(maxDate) : null;
  const todayDisabled = (minDateValue && todayDate < minDateValue) || (maxDateValue && todayDate > maxDateValue);
  const monthStart = startOfMonth(visibleMonth);
  const gridStart = startOfWeek(monthStart);
  const days = Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));

  useEffect(() => {
    setVisibleMonth(startOfMonth(parseISO(value || todayISO())));
  }, [value]);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutsideTap = (event) => {
      if (pickerRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideTap, true);
    return () => document.removeEventListener("pointerdown", closeOnOutsideTap, true);
  }, [open]);

  const selectDate = (isoDate) => {
    onSelect?.(isoDate);
    setOpen(false);
  };

  return (
    <div className="home-date-picker" ref={pickerRef}>
      <button
        type="button"
        className="test-date-button"
        aria-label="日付を選ぶ"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="test-date-calendar-icon" aria-hidden="true" />
      </button>
      {open && (
        <div className="home-calendar-popover">
          <div className="home-calendar-head">
            <button type="button" onClick={() => setVisibleMonth(startOfMonth(addDays(monthStart, -1)))} aria-label="前の月">‹</button>
            <strong>{monthStart.getFullYear()}年{monthStart.getMonth() + 1}月</strong>
            <button type="button" onClick={() => setVisibleMonth(startOfMonth(new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1)))} aria-label="次の月">›</button>
          </div>
          <button
            type="button"
            className="home-calendar-today"
            disabled={todayDisabled}
            onClick={() => {
              setVisibleMonth(startOfMonth(todayDate));
              selectDate(todayISO());
            }}
          >
            今日に戻る
          </button>
          <div className="home-calendar-weekdays" aria-hidden="true">
            {["月", "火", "水", "木", "金", "土", "日"].map((day) => <span key={day}>{day}</span>)}
          </div>
          <div className="home-calendar-grid">
            {days.map((date) => {
              const isoDate = toISO(date);
              const disabled = (minDateValue && date < minDateValue) || (maxDateValue && date > maxDateValue);
              const isSelected = isoDate === toISO(selectedDate);
              const isOutside = date.getMonth() !== monthStart.getMonth();
              const hasRecord = markedDates?.has(isoDate);
              return (
                <button
                  type="button"
                  className={`${isSelected ? "selected" : ""} ${isOutside ? "outside" : ""} ${hasRecord ? "has-record" : ""}`}
                  disabled={disabled}
                  onClick={() => selectDate(isoDate)}
                  aria-label={`${formatJapaneseFullDate(date)}${hasRecord ? " 記録あり" : ""}`}
                  key={isoDate}
                >
                  <span>{date.getDate()}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function BatRecordsSection({ children, className = "home-bat-records" }) {
  const [open, setOpen] = useState(false);

  return (
    <section className={`bat-records-section ${open ? "open" : "collapsed"}`}>
      <button
        type="button"
        className="home-subheading bat-records-toggle"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span>使ったバット</span>
      </button>
      {open && (
        <div className={className}>
          {children}
        </div>
      )}
    </section>
  );
}

function filledChartExtent(daily) {
  const map = new Map(daily.map((day) => [day.date, day]));
  const end = parseISO(todayISO());
  const start = daily.length ? parseISO(daily[0].date) : addDays(end, -6);
  const days = Math.max(1, Math.floor((end - start) / 86400000) + 1);
  return Array.from({ length: days }, (_, index) => {
    const date = toISO(addDays(start, index));
    const day = map.get(date);
    return {
      date,
      label: date.slice(5).replace("-", "/"),
      count: day?.count || 0,
      avg: day?.avg ?? null,
      best: day?.best ?? null,
    };
  });
}

function collectBadgeCounts(records, filter = RANGE_ALL, baseDate = todayISO()) {
  const { start, end } = badgeFilterWindow(filter, parseISO(baseDate), records);
  const startISO = start ? toISO(start) : null;
  const endISO = end ? toISO(end) : null;
  const counts = {};
  [...badgesFor(records, baseDate).entries()].forEach(([date, badges]) => {
    if (startISO && date < startISO) return;
    if (endISO && date > endISO) return;
    badges.forEach((badge) => {
      const definition = BADGE_DEFINITION_MAP.get(badge);
      counts[badge] = definition?.type === "unique" ? 1 : (counts[badge] || 0) + 1;
    });
  });
  return Object.entries(counts).sort(([a], [b]) => {
    const aRank = badgeSortKey(a);
    const bRank = badgeSortKey(b);
    return aRank[0] - bRank[0] || aRank[1] - bRank[1] || aRank[2] - bRank[2] || String(aRank[3]).localeCompare(String(bRank[3]), "ja");
  });
}

function firstEarnedBadgeDefinitions(beforeRecords, afterRecords, baseDate = todayISO()) {
  const beforeCounts = new Map(collectBadgeCounts(beforeRecords, RANGE_ALL, baseDate));
  const afterCounts = new Map(collectBadgeCounts(afterRecords, RANGE_ALL, baseDate));
  return [...afterCounts.entries()]
    .filter(([label, count]) => {
      const beforeCount = beforeCounts.get(label) || 0;
      const type = BADGE_DEFINITION_MAP.get(label)?.type || badgeTypeForLabel(label);
      return type === "repeatable" ? count > beforeCount : count > 0 && beforeCount === 0;
    })
    .sort(([a], [b]) => compareBadgesByRarity(a, b))
    .map(([label, count]) => makeBadgeDefinition(canonicalBadgeLabel(label), { earnedCount: count }));
}

function badgeCategory(label) {
  const definition = BADGE_DEFINITION_MAP.get(label);
  return definition?.category || "trophy";
}

function badgePeriod(label) {
  const definition = BADGE_DEFINITION_MAP.get(label);
  if (definition?.period === RANGE_TODAY) return "daily";
  if (definition?.period === RANGE_WEEK) return "weekly";
  if (definition?.period === RANGE_MONTH) return "monthly";
  if (definition?.period === RANGE_YEAR) return "yearly";
  if (definition?.period === "seasonal") return "seasonal";
  if (definition?.period === "special") return "special";
  return "other";
}

function badgeGroupKey(label) {
  return `${badgePeriod(label)}-${badgeCategory(label)}`;
}

function badgeValue(label) {
  const definition = BADGE_DEFINITION_MAP.get(label);
  if (!definition) return 0;
  if (Number.isFinite(definition.target)) return definition.target;
  if (definition.requirements?.best) return definition.requirements.best;
  if (definition.requirements?.avg) return definition.requirements.avg;
  if (definition.requirements?.count) return definition.requirements.count;
  return 0;
}

function badgeSortKey(label) {
  const definition = BADGE_DEFINITION_MAP.get(label);
  const periodValue = {
    daily: 0,
    weekly: 1,
    monthly: 2,
    yearly: 3,
    seasonal: 4,
    special: 5,
    other: 9,
  }[badgePeriod(label)] || 9;
  const categoryValue = {
    count: 0,
    calendar: 1,
    average: 2,
    best: 3,
    trophy: 4,
    flag: 5,
  }[definition?.category || "trophy"] || 9;
  return [periodValue, categoryValue, badgeValue(label) || 9999, label];
}

function compareBadgesByRarity(a, b) {
  const aLabel = canonicalBadgeLabel(a);
  const bLabel = canonicalBadgeLabel(b);
  const rarityDiff = RARITY_ORDER.indexOf(rarityForBadge(bLabel)) - RARITY_ORDER.indexOf(rarityForBadge(aLabel));
  if (rarityDiff !== 0) return rarityDiff;
  const aKey = badgeSortKey(aLabel);
  const bKey = badgeSortKey(bLabel);
  return aKey[0] - bKey[0] ||
    aKey[1] - bKey[1] ||
    aKey[2] - bKey[2] ||
    String(aKey[3]).localeCompare(String(bKey[3]), "ja");
}

function formatBadgeLabel(label) {
  return canonicalBadgeLabel(label);
}

function badgeChipFontSize(label) {
  const length = [...String(label || "")].length;
  if (length >= 9) return "0.52rem";
  if (length >= 8) return "0.55rem";
  if (length >= 7) return "0.58rem";
  if (length >= 6) return "0.63rem";
  return "0.68rem";
}

function settingsChipTextSize(text) {
  const length = [...String(text || "")].length;
  if (length >= 14) return "0.46rem";
  if (length >= 12) return "0.5rem";
  if (length >= 10) return "0.54rem";
  if (length >= 8) return "0.58rem";
  if (length >= 6) return "0.62rem";
  return "0.66rem";
}

function badgePeriodShortLabel(period) {
  if (period === RANGE_TODAY) return "今日";
  if (period === RANGE_WEEK) return "今週";
  if (period === RANGE_MONTH) return "今月";
  if (period === RANGE_YEAR) return "今年";
  return "初突破";
}

function badgeShortNameLines(definition) {
  const target = Number(definition?.target);
  const targetLabel = Number.isFinite(target) ? target.toLocaleString("ja-JP") : "";
  const period = badgePeriodShortLabel(definition?.period);
  const metric = definition?.metric;

  if (metric === "count") return [`${period} スイング`, `${targetLabel}回`];
  if (metric === "days") return [`${period} 練習日数`, `${targetLabel}日`];
  if (metric === "all-time-avg") return ["初突破 平均", `${targetLabel}点`];
  if (metric === "all-time-best") return ["初突破 ベスト", `${targetLabel}点`];
  if (metric === "avg") return [`${period} 平均`, `${targetLabel}点`];
  if (metric === "best") return [`${period} ベスト`, `${targetLabel}点`];

  return String(definition?.name || definition?.label || "").split(/\s+/).filter(Boolean).slice(0, 2);
}

function canonicalBadgeLabel(label) {
  return label;
}

function badgeTypeForLabel(label) {
  return BADGE_DEFINITION_MAP.get(label)?.type || "repeatable";
}

function rarityForBadge(label) {
  return BADGE_DEFINITION_MAP.get(label)?.rarity || "D";
}

function rarityColorFor(rarity) {
  return RARITY_COLORS[rarity] || RARITY_COLORS.C;
}

function collectionCategoryKeyFor(definition) {
  if (definition?.metric === "all-time-avg" || definition?.metric === "avg") return "average";
  if (definition?.metric === "all-time-best" || definition?.metric === "best") return "best";
  if (definition?.category === "average" || definition?.category === "best") return definition.category;
  return definition?.category || "other";
}

function badgeDescriptionFor(label, type) {
  if (BADGE_DEFINITION_MAP.get(label)?.description) return BADGE_DEFINITION_MAP.get(label).description;
  if (type === "unique") return `${label}を1回だけ獲得可`;
  if (type === "current") return `${label}の条件を満たしている間だけ獲得`;
  return `${label}を達成するたび獲得可`;
}

function makeBadgeDefinition(label, options = {}) {
  const base = BADGE_DEFINITION_MAP.get(label);
  const type = options.type || base?.type || badgeTypeForLabel(label);
  return {
    id: options.id || base?.id || label,
    label: options.label || base?.label || label,
    name: options.name || base?.name || label,
    type,
    rarity: options.rarity || base?.rarity || rarityForBadge(label),
    category: options.category || base?.category || "trophy",
    period: options.period || base?.period || null,
    metric: options.metric || base?.metric || null,
    target: options.target ?? base?.target ?? null,
    conditionText: options.conditionText || base?.conditionText || "",
    secret: Boolean(options.secret || base?.secret),
    description: options.description || base?.description || badgeDescriptionFor(label, type),
  };
}

function allBadgeDefinitions() {
  return [...BADGE_DEFINITIONS].map((definition) => makeBadgeDefinition(definition.label)).sort((a, b) => (
    RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity) ||
    badgeSortKey(a.label)[1] - badgeSortKey(b.label)[1] ||
    badgeSortKey(a.label)[2] - badgeSortKey(b.label)[2] ||
    a.label.localeCompare(b.label, "ja")
  ));
}

function earnedCountForDefinition(definition, badgeCounts, metaStats = null) {
  const exact = badgeCounts.get(definition.label) || 0;
  return definition.type === "unique" ? Math.min(1, exact) : exact || 0;
}

function RarityIcon({ rarity }) {
  return (
    <span className={`rarity-icon rarity-${rarity.toLowerCase()}`} aria-hidden="true">
      <img src={RARITY_IMAGE_URLS[rarity]} alt="" />
    </span>
  );
}

function BadgeDetailPopover({ badge, onClose }) {
  useEffect(() => {
    playEffectSound("popup");
  }, []);

  const closePopover = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.target === event.currentTarget) playEffectSound("tap");
    onClose();
  };
  return createPortal(
    <div className="collection-popover-backdrop" onClick={closePopover}>
      <aside
        className={`collection-popover rarity-${badge.rarity.toLowerCase()} ${badge.earnedCount === 0 ? "locked" : ""}`}
        role="dialog"
        aria-modal="true"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="collection-popover-close"
          aria-label="閉じる"
          onPointerDown={(event) => {
            event.stopPropagation();
          }}
          onClick={closePopover}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M7.5 7.5 16.5 16.5" />
            <path d="M16.5 7.5 7.5 16.5" />
          </svg>
        </button>
        <div className="badge-popup-card" style={{ "--badge-rarity-color": rarityColorFor(badge.rarity) }}>
          <img className="badge-popup-card-bg" src={RARITY_CARD_URLS[badge.rarity]} alt="" aria-hidden="true" />
          <span className="badge-popup-card-points">{RARITY_POINTS[badge.rarity]}pt</span>
          <div className={`badge-popup-card-medal category-${badge.category}`} aria-hidden="true">
            <img src={CATEGORY_ICON_URLS[badge.category]} alt="" />
          </div>
          <div className="badge-popup-card-copy">
            <strong>{badge.lockedSecret ? "???" : badge.label || badge.name}</strong>
            <p>{badge.lockedSecret ? "ひみつ" : badge.description}</p>
          </div>
        </div>
      </aside>
    </div>,
    document.body
  );
}

function FirstGetBadgeShowcase({ badges, onAdvance }) {
  const badge = badges?.[0];
  if (!badge) return null;
  const remaining = badges.length;
  const closeLabel = remaining > 1 ? "次の初ゲットバッジへ" : "初ゲットバッジを閉じる";
  return createPortal(
    <div
      className={`first-get-backdrop rarity-${badge.rarity.toLowerCase()}`}
      style={{ "--badge-rarity-color": rarityColorFor(badge.rarity) }}
      onClick={() => {
        playEffectSound("tap");
        onAdvance();
      }}
    >
      <aside
        className={`collection-popover first-get-popover rarity-${badge.rarity.toLowerCase()}`}
        role="dialog"
        aria-modal="true"
        aria-label="初ゲットバッジ"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="first-get-title" aria-hidden="true">初ゲット</div>
        <button
          type="button"
          className="collection-popover-close"
          aria-label={closeLabel}
          onClick={onAdvance}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M7.5 7.5 16.5 16.5" />
            <path d="M16.5 7.5 7.5 16.5" />
          </svg>
        </button>
        <div className="badge-popup-card" style={{ "--badge-rarity-color": rarityColorFor(badge.rarity) }}>
          <img className="badge-popup-card-bg" src={RARITY_CARD_URLS[badge.rarity]} alt="" aria-hidden="true" />
          <span className="badge-popup-card-points">{RARITY_POINTS[badge.rarity]}pt</span>
          <div className={`badge-popup-card-medal category-${badge.category}`} aria-hidden="true">
            <img src={CATEGORY_ICON_URLS[badge.category]} alt="" />
          </div>
          <div className="badge-popup-card-copy">
            <strong>{badge.label || badge.name}</strong>
            <p>{badge.description}</p>
          </div>
        </div>
      </aside>
    </div>,
    document.body
  );
}

function BadgeChip({ label, count = 1, description = null, lockedSecret = false }) {
  const [selectedBadge, setSelectedBadge] = useState(null);
  const canonicalLabel = canonicalBadgeLabel(label);
  const definition = makeBadgeDefinition(canonicalLabel, description ? { description } : {});
  const isLocked = count === 0;
  const shortNameLines = lockedSecret ? ["???"] : badgeShortNameLines(definition);
  const shortNameText = shortNameLines.join("");
  return (
    <>
      <span className={`badge-chip-wrap ${isLocked ? "locked" : ""}`}>
        <button
          className={`badge collection-badge rarity-${definition.rarity.toLowerCase()} ${isLocked ? "locked" : ""}`}
          type="button"
          data-sound-effect="popup"
          style={{
            "--badge-chip-font-size": badgeChipFontSize(shortNameText),
            "--badge-rarity-color": rarityColorFor(definition.rarity),
            backgroundImage: `url("${RARITY_NAMEPLATE_URLS[definition.rarity]}")`,
          }}
          onClick={() => setSelectedBadge({ ...definition, earnedCount: count, lockedSecret: false })}
        >
          <span className={`badge-chip-icon category-${definition.category}`} aria-hidden="true">
            <img src={CATEGORY_ICON_URLS[definition.category]} alt="" />
          </span>
          <span className="badge-label">
            {shortNameLines.map((line, index) => <span key={`${line}-${index}`}>{line}</span>)}
          </span>
        </button>
        <b>{count > 1 ? `x${count}` : ""}</b>
      </span>
      {selectedBadge && (
        <BadgeDetailPopover badge={{ ...selectedBadge, lockedSecret }} onClose={() => setSelectedBadge(null)} />
      )}
    </>
  );
}

function BadgeCollectionView({ allForName, activeDate = todayISO(), db = defaultDb, setDb = null }) {
  const [selectedCategory, setSelectedCategory] = useState("all");
  const collectionRecords = allForName;
  const badgeCounts = useMemo(() => new Map(collectBadgeCounts(collectionRecords, RANGE_ALL, activeDate)), [collectionRecords, activeDate]);
  const definitions = useMemo(() => allBadgeDefinitions(), []);
  const badgePointTargets = useMemo(() => [30, 60, 120, 240, 360, 520].map((target) => ({
    target,
    label: `${target}pt`,
    description: `バッジポイント${target}ptまであと少し`,
  })), []);
  const badgeStats = useMemo(() => {
    const items = definitions.map((definition) => {
      const earnedCount = earnedCountForDefinition(definition, badgeCounts);
      return {
        definition,
        earnedCount,
        lockedSecret: definition.secret && earnedCount === 0,
      };
    });
    return {
      items,
      badgePointTotal: items.reduce((sum, item) => sum + (item.earnedCount * RARITY_POINTS[item.definition.rarity]), 0),
      earnedTotal: items.reduce((sum, item) => sum + Math.min(1, item.earnedCount), 0),
      earnedInstanceTotal: items.reduce((sum, item) => sum + item.earnedCount, 0),
    };
  }, [definitions, badgeCounts]);
  const { badgePointTotal, earnedTotal, earnedInstanceTotal } = badgeStats;
  const rewardGoalInput = String(db?.badgeRewardGoal || "");
  const rewardTextInput = String(db?.badgeRewardText || "");
  const rewardGoal = Math.max(0, Math.trunc(Number(rewardGoalInput) || 0));
  const rewardGoalDisplay = rewardGoalInput ? Number(rewardGoalInput).toLocaleString("ja-JP") : "";
  const rewardEarned = rewardGoal > 0 && rewardTextInput.trim().length > 0 && badgePointTotal >= rewardGoal;
  const badgePointFontSize = clamp(2.62 - Math.max(0, String(badgePointTotal).length - 4) * 0.42, 1.72, 2.62);
  const rewardGoalFontSize = clamp(17 - Math.max(0, rewardGoalDisplay.length - 5) * 1.45, 8.5, 17);
  const rewardTextUnits = [...rewardTextInput].reduce((sum, char) => sum + (char.charCodeAt(0) <= 0x7f ? 0.58 : 1), 0);
  const rewardTextFontSize = clamp(Math.min(16, 132 / Math.max(1, rewardTextUnits)), 5.2, 16);
  const badgeDataDates = useMemo(() => collectionRecords
    .map((record) => record.date)
    .filter((date) => date <= activeDate)
    .sort((a, b) => a.localeCompare(b)), [collectionRecords, activeDate]);
  const badgeDataStart = badgeDataDates[0] ? parseISO(badgeDataDates[0]) : null;
  const badgeDataEnd = parseISO(activeDate);
  const badgeDataRangeLabel = badgeDataStart
    ? `${formatDataRangeDate(badgeDataStart)} - ${formatDataRangeDate(badgeDataEnd)}`
    : "No data";
  const updateBadgeReward = (patch) => {
    if (!setDb) return;
    setDb({ ...db, ...patch });
  };
  const collectionCategorySummaries = useMemo(() => {
    const grouped = new Map(COLLECTION_CATEGORY_FILTERS.map((filter) => [filter.key, []]));
    badgeStats.items.forEach((item) => {
      grouped.get("all")?.push(item);
      grouped.get(collectionCategoryKeyFor(item.definition))?.push(item);
    });
    return COLLECTION_CATEGORY_FILTERS.map((filter) => {
      const items = [...(grouped.get(filter.key) || [])].sort((a, b) => compareBadgesByRarity(a.definition.label, b.definition.label));
      const earnedTotal = items.reduce((sum, item) => sum + Math.min(1, item.earnedCount), 0);
      const pointTotal = items.reduce((sum, item) => (
        sum + (item.earnedCount * RARITY_POINTS[item.definition.rarity])
      ), 0);
      return { ...filter, items, earnedTotal, pointTotal };
    });
  }, [badgeStats.items]);
  const activeCategorySummary = useMemo(() => (
    collectionCategorySummaries.find((summary) => summary.key === selectedCategory) || collectionCategorySummaries[0]
  ), [collectionCategorySummaries, selectedCategory]);
  const activeRaritySections = useMemo(() => {
    if (!activeCategorySummary?.items?.length) return [];
    return [...RARITY_ORDER].reverse().map((rarity) => {
      const items = activeCategorySummary.items.filter((item) => item.definition.rarity === rarity);
      return {
        rarity,
        items,
        earnedTotal: items.reduce((sum, item) => sum + Math.min(1, item.earnedCount), 0),
      };
    }).filter((section) => section.items.length);
  }, [activeCategorySummary]);
  return (
    <section className="badge-collection">
      <div className="section-row tight badge-collection-heading-row">
        <h2 className="icon-heading"><Icon type="badge" />バッジポイント</h2>
      </div>
      <div className="badge-point-card">
        <div className="badge-point-main">
          <p>バッジポイント</p>
          <strong style={{ "--badge-point-font-size": `${badgePointFontSize}rem` }}>{badgePointTotal.toLocaleString("ja-JP")}<small>ポイント</small></strong>
          <span className="badge-point-meta"><b>{earnedTotal}</b>/{definitions.length} 種類</span>
          <span className="badge-point-meta"><b>{earnedInstanceTotal.toLocaleString("ja-JP")}</b>個</span>
          <span className="badge-point-data-range">{badgeDataRangeLabel}</span>
        </div>
        <div className="badge-point-side">
          <label className="badge-goal-field">
            <span>目標</span>
            <input
              type="text"
              inputMode="numeric"
              value={rewardGoalDisplay}
              style={{ "--reward-input-font-size": `${rewardGoalFontSize}px` }}
              onChange={(event) => updateBadgeReward({ badgeRewardGoal: event.target.value.replace(/[^\d]/g, "") })}
              placeholder="0"
            />
            <img className="edit-pencil-icon" src={NEW_UI_ASSETS.pen} alt="" aria-hidden="true" />
            <em>ポイント</em>
          </label>
          <div className="badge-point-meters" aria-label="次に狙うバッジ">
            <ProgressMeter kind="badge-points" value={badgePointTotal} range={RANGE_TOTAL} targets={badgePointTargets} showBadgeIcon={false} customGoal={rewardGoal || null} />
          </div>
          <label className="badge-reward-input-field">
            <span>ごほうび</span>
            <input
              type="text"
              value={rewardTextInput}
              style={{ "--reward-input-font-size": `${rewardTextFontSize}px` }}
              onChange={(event) => updateBadgeReward({ badgeRewardText: event.target.value })}
              placeholder=""
            />
            <img className="edit-pencil-icon" src={NEW_UI_ASSETS.pen} alt="" aria-hidden="true" />
            {rewardEarned && <span className="badge-reward-get-stamp" aria-hidden="true">GET</span>}
          </label>
        </div>
      </div>
      <div className="section-row tight badge-collection-heading-row collection-heading-row">
        <h2 className="icon-heading"><Icon type="collection" />コレクション</h2>
      </div>
      <section className="collection-main-card">
        <div className="collection-card-heading">
          <p>コレクション</p>
        </div>
        <div className="collection-category-filters" role="tablist" aria-label="バッジカテゴリ">
          {collectionCategorySummaries.map((summary) => {
            const isSelected = summary.key === activeCategorySummary?.key;
            return (
              <button
                key={summary.key}
                type="button"
                role="tab"
                aria-selected={isSelected}
                className={`collection-category-filter ${isSelected ? "selected" : ""}`}
                onClick={() => setSelectedCategory(summary.key)}
              >
                <span className={`collection-category-filter-icon category-${summary.icon}`} aria-hidden="true">
                  <img src={CATEGORY_ICON_URLS[summary.icon]} alt="" />
                </span>
                <span className="collection-category-filter-copy">
                  <b>{summary.label}</b>
                </span>
              </button>
            );
          })}
        </div>
        <div className="collection-groups">
          {activeCategorySummary && (() => {
            const { key } = activeCategorySummary;
            return (
              <section className={`collection-group category-${key}`} key={key}>
                {activeRaritySections.map((section) => (
                  <section className={`collection-rarity-section rarity-${section.rarity.toLowerCase()}`} key={section.rarity}>
                    <h3 className="collection-rarity-heading">
                      <span>{section.rarity}</span>
                    </h3>
                    <div className="badge-list two-col collection-badge-list">
                      {section.items.map(({ definition, earnedCount, lockedSecret }, index) => (
                        <span
                          className={`badge-motion-item ${earnedCount ? "earned" : "locked"} ${definition.secret ? "secret" : ""}`}
                          key={definition.label}
                          style={{ "--badge-index": index }}
                        >
                          <BadgeChip label={definition.label} count={earnedCount} description={definition.description} lockedSecret={lockedSecret} />
                        </span>
                      ))}
                    </div>
                  </section>
                ))}
              </section>
            );
          })()}
        </div>
      </section>
    </section>
  );
}

function badgeGroups(badgeCounts) {
  const groups = new Map(BADGE_PERIODS.map(([key]) => [key, { count: [], score: [] }]));
  badgeCounts.forEach(([label, count]) => {
    const period = badgePeriod(label);
    const category = badgeCategory(label);
    groups.get(period)?.[category].push([label, count]);
  });
  return BADGE_PERIODS.map(([key, label]) => {
    const sections = groups.get(key) || { count: [], score: [] };
    const countBadges = [...sections.count].sort((a, b) => {
      const aKey = badgeSortKey(a[0]);
      const bKey = badgeSortKey(b[0]);
      return aKey[0] - bKey[0] || aKey[1] - bKey[1] || aKey[2] - bKey[2] || String(aKey[3]).localeCompare(String(bKey[3]), "ja");
    });
    const scoreBadges = [...sections.score].sort((a, b) => {
      const aKey = badgeSortKey(a[0]);
      const bKey = badgeSortKey(b[0]);
      return aKey[0] - bKey[0] || aKey[1] - bKey[1] || aKey[2] - bKey[2] || String(aKey[3]).localeCompare(String(bKey[3]), "ja");
    });
    return {
      key,
      label,
      total: [...countBadges, ...scoreBadges].reduce((sum, [, count]) => sum + count, 0),
      sections: [
        { key: "count", label: "スイング数", badges: countBadges },
        { key: "score", label: "スコア", badges: scoreBadges },
      ],
    };
  });
}

function summarizeRecords(records) {
  const daily = aggregate(records);
  const total = aggregate(records).reduce((sum, day) => sum + day.count, 0);
  const weightedTotal = daily.reduce((sum, day) => sum + ((day.avg || 0) * (day.count || 0)), 0);
  return {
    count: total,
    avg: total ? Math.round(weightedTotal / total) : 0,
    best: daily.reduce((best, day) => Math.max(best, day.best || 0), 0),
    days: daily.filter((day) => day.count > 0).length,
    spanDays: daily.filter((day) => day.count > 0).length,
  };
}

function graphBucketsForRange(daily, range, baseDate = todayISO()) {
  if (range === RANGE_ALL) return filledChartExtent(daily);
  return [...comparisonBuckets(daily, range, null, parseISO(baseDate))].reverse();
}

function dataGraphBucketsForRange(daily, range, maxBuckets, baseDate = todayISO()) {
  if (!daily.length) return [];
  if (range === RANGE_ALL) return filledChartExtent(daily).slice(-maxBuckets);
  return comparisonBuckets(daily, range, 0, parseISO(baseDate)).slice(0, maxBuckets).reverse();
}

function dataGraphInitialRange() {
  return 7;
}

function graphRangeLabel(range) {
  if (range === RANGE_TODAY) return "今日";
  if (range === RANGE_WEEK) return "今週";
  if (range === RANGE_MONTH) return "今月";
  return "全て";
}

function DataView({ db, allForName, activeDate = todayISO() }) {
  const [activeTab, setActiveTab] = useState("daily");
  const tabs = [
    ["daily", "毎日"],
    ["weekly", "毎週"],
    ["monthly", "毎月"],
  ];
  const activeConfig = {
    daily: { graphRange: RANGE_TODAY, titlePrefix: "毎日", maxBuckets: 365 },
    weekly: { graphRange: RANGE_WEEK, titlePrefix: "毎週", maxBuckets: 52 },
    monthly: { graphRange: RANGE_MONTH, titlePrefix: "毎月", maxBuckets: 12 },
  }[activeTab] || { graphRange: RANGE_TODAY, titlePrefix: "毎日", maxBuckets: 365 };

  return (
    <div className="challenge-view data-view">
      <div className="challenge-tabs data-tabs" role="tablist" aria-label="データ期間">
        {tabs.map(([key, label]) => (
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === key}
            className={activeTab === key ? "selected" : ""}
            onClick={() => setActiveTab(key)}
            key={key}
          >
            <span className="challenge-tab-period">{label}</span>
          </button>
        ))}
      </div>
      <section className="home-section home-result-section challenge-period-panel data-panel">
        <DataGraphs
          db={db}
          records={allForName}
          graphRange={activeConfig.graphRange}
          titlePrefix={activeConfig.titlePrefix}
          maxBuckets={activeConfig.maxBuckets}
          activeDate={activeDate}
        />
      </section>
    </div>
  );
}

function DataGraphs({ db, records, graphRange, titlePrefix, maxBuckets, activeDate = todayISO() }) {
  const [graphBat, setGraphBat] = useState(ALL);
  const graphRecords = records.filter((record) => graphBat === ALL || record.bat === graphBat);
  const daily = aggregate(graphRecords);
  const graphColor = graphBat === ALL ? null : batColorFor(db, graphBat);
  const buckets = dataGraphBucketsForRange(daily, graphRange, maxBuckets, activeDate);
  const initialRange = Math.max(1, Math.min(buckets.length, dataGraphInitialRange()));
  const chartData = buckets.map((bucket) => ({
    ...bucket,
    date: bucket.date || bucket.label,
    label: bucket.label,
    isToday: bucket === buckets.at(-1),
  }));
  const controls = (
    <GraphControls
      db={db}
      graphBat={graphBat}
      setGraphBat={setGraphBat}
    />
  );

  return (
    <div className="period-graphs all-record-graphs" style={graphColor ? { "--graph-color": graphColor } : undefined}>
      <div className="section-row tight graph-area-heading">
        <div>
          <h2 className="icon-heading"><Icon type="log" />{titlePrefix}の記録</h2>
        </div>
        {controls}
      </div>
      <section className="dashboard-section record-section graph-card">
        <div className="section-row tight graph-title-row">
          <div>
            <h3>{titlePrefix}のスイング数</h3>
          </div>
        </div>
        <CountBars buckets={buckets} visibleCount={6} />
      </section>
      <section className="dashboard-section record-section graph-card">
        <div className="section-row tight graph-title-row">
          <div>
            <h3>{titlePrefix}のスコア</h3>
          </div>
        </div>
        <Chart data={chartData} initialRange={initialRange} />
      </section>
    </div>
  );
}

function BatSelect({ value, onChange, bats, batColors = null, allOption = false, name = undefined, required = false, ariaLabel = "バット", className = "" }) {
  const allColor = ALL_BAT_FILTER_COLOR;
  const selectedColor = value === ALL
    ? allColor
    : normalizeHexColor(batColors?.[value], fallbackBatColor(value, Math.max(0, bats.indexOf(value))));

  return (
    <label className={`bat-select-control field-label bat-input-label ${className}`.trim()} style={{ "--bat-filter-color": selectedColor }}>
      <span className={`bat-field graph-bat-filter home-bat-filter ${value === ALL ? "all-selected" : ""}`}>
        <span className="select-shell">
          <span className="select-leading bat-select-leading" aria-hidden="true"><span className="form-bat-icon" /></span>
          <select name={name} required={required} value={value} onChange={(event) => onChange(event.target.value)} aria-label={ariaLabel}>
            {allOption && <option value={ALL} style={{ color: ALL_BAT_FILTER_COLOR }}>全てのバット</option>}
            {bats.map((bat, index) => {
              const optionColor = normalizeHexColor(batColors?.[bat], fallbackBatColor(bat, index));
              return <option value={bat} key={bat} style={{ color: optionColor }}>{bat}</option>;
            })}
          </select>
          <span className="select-caret" aria-hidden="true"><Icon type="chevronDown" /></span>
        </span>
      </span>
    </label>
  );
}

function GraphControls({ db, graphBat, setGraphBat }) {
  return (
    <BatSelect value={graphBat} onChange={setGraphBat} bats={db.bats} batColors={db.batColors} allOption ariaLabel="グラフのバット" className="home-form-bat-controls" />
  );
}

function SwingForm({ bats, defaultBat, onSubmit, submitLabel, defaultValues = null, resetToken = 0, submitDisabled = false, batColors = null, testAction = null }) {
  const initialBat = bats.includes(defaultBat) ? defaultBat : bats[0] || "";
  const [selectedBat, setSelectedBat] = useState(initialBat);
  const [countValue, setCountValue] = useState(defaultValues?.count ?? "");
  const [avgValue, setAvgValue] = useState(defaultValues?.avg ?? "");
  const [bestValue, setBestValue] = useState(defaultValues?.best ?? "");
  useEffect(() => {
    setSelectedBat(initialBat);
  }, [initialBat]);
  useEffect(() => {
    setCountValue(defaultValues?.count ?? "");
    setAvgValue(defaultValues?.avg ?? "");
    setBestValue(defaultValues?.best ?? "");
  }, [defaultValues?.count, defaultValues?.avg, defaultValues?.best, resetToken]);
  const selectedBatColor = normalizeHexColor(batColors?.[selectedBat], fallbackBatColor(selectedBat, Math.max(0, bats.indexOf(selectedBat))));
  const handleTestAction = () => {
    testAction?.(selectedBat);
  };
  return (
    <form
      className="input-grid swing-form"
      onSubmit={onSubmit}
      onInvalidCapture={playFormErrorSound}
      style={{ "--selected-bat-color": selectedBatColor }}
    >
      <h3 className="swing-form-title"><img className="form-pen-icon" src={NEW_UI_ASSETS.recordPen} alt="" aria-hidden="true" />記録入力</h3>
      <BatSelect value={selectedBat} onChange={setSelectedBat} bats={bats} batColors={batColors} name="bat" required className="home-form-bat-controls" />
      <label className="field-label"><span className="field-title">回数</span><span className="paper-input-cell"><input name="count" type="number" inputMode="numeric" min="1" max="999" step="1" required placeholder="-" value={countValue} onChange={(event) => setCountValue(event.target.value)} aria-label="回数" /><span aria-hidden="true">回</span></span></label>
      <label className="field-label"><span className="field-title">平均</span><span className="paper-input-cell"><input name="avg" type="number" inputMode="numeric" min="0" max="999" step="1" required placeholder="-" value={avgValue} onChange={(event) => setAvgValue(event.target.value)} aria-label="平均" /><span aria-hidden="true">点</span></span></label>
      <label className="field-label"><span className="field-title">ベスト</span><span className="paper-input-cell"><input name="best" type="number" inputMode="numeric" min="0" max="999" step="1" required placeholder="-" value={bestValue} onChange={(event) => setBestValue(event.target.value)} aria-label="ベスト" /><span aria-hidden="true">点</span></span></label>
      <span className="home-ok-slot">
        {testAction && <button className="standard-ok-button settings-ok-button test-seed-button" type="button" onClick={handleTestAction} disabled={submitDisabled}>テスト</button>}
        <button className="standard-ok-button settings-ok-button" type="submit" aria-label={submitLabel} disabled={submitDisabled} data-sound-effect="score">OK</button>
      </span>
    </form>
  );
}

function Calendar({ records, badgeMap, month, selectedDate, setSelectedDate }) {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const days = new Date(year, monthIndex + 1, 0).getDate();
  const first = new Date(year, monthIndex, 1).getDay();
  const daily = new Map(aggregate(records).map((day) => [day.date, day]));
  return (
    <>
      <div className="weekdays"><span>日</span><span>月</span><span>火</span><span>水</span><span>木</span><span>金</span><span>土</span></div>
      <div className="calendar-grid">
        {Array.from({ length: first }, (_, index) => <span key={`blank-${index}`} className="calendar-blank" aria-hidden="true" />)}
        {Array.from({ length: days }, (_, index) => {
          const day = index + 1;
          const date = toISO(new Date(year, monthIndex, day));
          const hasRecord = daily.has(date);
          return (
            <button
              type="button"
              key={date}
              className={["calendar-day", selectedDate === date ? "selected" : "", date === todayISO() ? "today" : "", hasRecord ? "has-record" : ""].filter(Boolean).join(" ")}
              onClick={() => setSelectedDate(date)}
            >
              <span>{day}</span>
              {hasRecord && <small>{daily.get(date).count}回</small>}
            </button>
          );
        })}
      </div>
    </>
  );
}

function RecordSummary({ item, batColor = "#8d95a4", selected = false, onSelect = null }) {
  const color = normalizeHexColor(batColor, "#8d95a4");
  const content = (
    <>
      <div className="record-title"><span className="icon bat-card-icon" style={{ "--bat-icon-color": color }}><BatIcon color={color} /></span><strong>{item.bat}</strong></div>
      <div className="mini-grid">
        <span className="mini-stat mini-stat-count"><b>回数</b><span className="mini-value">{Number(item.count || 0).toLocaleString("ja-JP")}<small>回</small></span></span>
        <span className="mini-stat"><b>平均</b><span className="mini-value">{Number(item.avg || 0).toLocaleString("ja-JP")}<small>点</small></span></span>
        <span className="mini-stat"><b>ベスト</b><span className="mini-value">{Number(item.best || 0).toLocaleString("ja-JP")}<small>点</small></span></span>
      </div>
    </>
  );
  if (onSelect) {
    return (
      <button
        type="button"
        className={`record-card record-card-button ${selected ? "selected" : ""}`}
        style={{ "--bat-icon-color": color }}
        onClick={onSelect}
        aria-pressed={selected}
      >
        {content}
      </button>
    );
  }
  return (
    <article className="record-card" style={{ "--bat-icon-color": color }}>
      {content}
    </article>
  );
}

function HomeBatResultCard({ db, item }) {
  const color = batColorFor(db, item.bat);
  return (
    <article className="record-card home-bat-result-card" style={{ "--bat-icon-color": color }}>
      <div className="record-title">
        <span className="icon bat-card-icon"><img className="home-bat-card-image" src={NEW_UI_ASSETS.bat} alt="" aria-hidden="true" /></span>
        <strong>{item.bat}</strong>
      </div>
      <div className="mini-grid">
        <span className="mini-stat mini-stat-count"><b>回数</b><span className="mini-value">{Number(item.count || 0).toLocaleString("ja-JP")}<small>回</small></span></span>
        <span className="mini-stat"><b>平均</b><span className="mini-value">{Number(item.avg || 0).toLocaleString("ja-JP")}<small>点</small></span></span>
        <span className="mini-stat"><b>ベスト</b><span className="mini-value">{Number(item.best || 0).toLocaleString("ja-JP")}<small>点</small></span></span>
      </div>
    </article>
  );
}

function SettingsView({ db, currentName, setDb, addName, addBat, exportCsv, importCsv, loadAnimationTestDb, setPendingDelete }) {
  const [draft, setDraft] = useState(db);
  const [openBatPalette, setOpenBatPalette] = useState(null);
  const [palettePosition, setPalettePosition] = useState(null);
  const hasNames = draft.names.length > 0;
  const batColorEntries = draft.bats.map((bat) => [bat, batColorFor(draft, bat)]);
  useEffect(() => {
    setDraft(db);
    setOpenBatPalette(null);
    setPalettePosition(null);
  }, [db]);
  useEffect(() => {
    if (!openBatPalette) return undefined;
    const closeOnOutsideTap = (event) => {
      if (event.target.closest?.(".bat-color-menu")) return;
      setOpenBatPalette(null);
      setPalettePosition(null);
    };
    const closeOnViewportChange = () => {
      setOpenBatPalette(null);
      setPalettePosition(null);
    };
    document.addEventListener("pointerdown", closeOnOutsideTap, true);
    window.addEventListener("resize", closeOnViewportChange);
    window.addEventListener("scroll", closeOnViewportChange, true);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideTap, true);
      window.removeEventListener("resize", closeOnViewportChange);
      window.removeEventListener("scroll", closeOnViewportChange, true);
    };
  }, [openBatPalette]);

  const commitDraft = (nextDraft) => {
    setDraft(nextDraft);
    setDb(nextDraft);
  };

  const selectDraftName = (name) => {
    if (name !== draft.activeName) playEffectSound("switch");
    commitDraft({ ...draft, activeName: name });
  };

  const selectDraftBat = (bat) => {
    if (bat !== draft.defaultBat) playEffectSound("switch");
    commitDraft({ ...draft, defaultBat: bat });
  };

  const shouldIgnoreChipSurfaceClick = (event) =>
    event.target.closest?.("button, .bat-color-menu");

  const togglePalette = (id, event) => {
    if (openBatPalette === id) {
      setOpenBatPalette(null);
      setPalettePosition(null);
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const paletteWidth = 172;
    const paletteHeight = 72;
    const left = Math.min(Math.max(rect.left + rect.width / 2, paletteWidth / 2 + 8), window.innerWidth - paletteWidth / 2 - 8);
    const belowTop = rect.bottom + 8;
    const top = belowTop + paletteHeight > window.innerHeight - 8 ? Math.max(8, rect.top - paletteHeight - 8) : belowTop;
    setPalettePosition({ left, top });
    setOpenBatPalette(id);
  };

  const updateNameColor = (name, color) => {
    commitDraft({
      ...draft,
      nameColors: {
        ...normalizeNameColors(draft.nameColors, draft.names, draft.theme),
        [name]: normalizeHexColor(color, nameColorFor(draft, name)),
      },
      theme: draft.activeName === name ? normalizeHexColor(color, nameColorFor(draft, name)) : draft.theme,
    });
    setOpenBatPalette(null);
    setPalettePosition(null);
  };

  const updateBatColor = (bat, color) => {
    commitDraft({
      ...draft,
      batColors: {
        ...normalizeBatColors(draft.batColors, draft.bats),
        [bat]: normalizeHexColor(color, batColorFor(draft, bat)),
      },
    });
    setOpenBatPalette(null);
    setPalettePosition(null);
  };

  const addDraftName = (event) => {
    event.preventDefault();
    const value = String(new FormData(event.currentTarget).get("name") || "").trim();
    if (!value || draft.names.includes(value)) return;
    const usedColors = new Set([...Object.values(normalizeNameColors(draft.nameColors, draft.names)), ...Object.values(normalizeBatColors(draft.batColors, draft.bats))]);
    const newColor = firstAvailableColor(usedColors);
    commitDraft({
      ...draft,
      activeName: draft.activeName || value,
      names: [...draft.names, value],
      nameColors: { ...normalizeNameColors(draft.nameColors, draft.names), [value]: newColor },
      theme: FIXED_UI_THEME,
    });
    event.currentTarget.reset();
  };

  const addDraftBat = (event) => {
    event.preventDefault();
    const value = String(new FormData(event.currentTarget).get("bat") || "").trim();
    if (!value || draft.bats.includes(value)) return;
    const nextBats = [...draft.bats, value];
    const usedColors = new Set([...Object.values(normalizeNameColors(draft.nameColors, draft.names, draft.theme)), ...Object.values(normalizeBatColors(draft.batColors, draft.bats))]);
    commitDraft({
      ...draft,
      bats: nextBats,
      batColors: { ...normalizeBatColors(draft.batColors, draft.bats), [value]: firstAvailableBatColor(usedColors, fallbackBatColor(value, nextBats.length - 1)) },
      defaultBat: draft.defaultBat || value,
    });
    event.currentTarget.reset();
  };

  const removeDraftName = (name) => {
    const names = draft.names.filter((item) => item !== name);
    commitDraft({
      ...draft,
      names,
      nameColors: normalizeNameColors(draft.nameColors, names, draft.theme),
      activeName: draft.activeName === name ? names[0] || "" : draft.activeName,
      records: draft.records.filter((record) => record.name !== name),
    });
  };

  const removeDraftBat = (bat) => {
    const bats = draft.bats.filter((item) => item !== bat);
    commitDraft({
      ...draft,
      bats,
      batColors: normalizeBatColors(draft.batColors, bats),
      defaultBat: draft.defaultBat === bat ? bats[0] || "" : draft.defaultBat,
      records: draft.records.filter((record) => record.bat !== bat),
    });
  };

  return (
    <div className="settings-view">
      <section className={`panel settings-register-card ${String(openBatPalette).startsWith("name:") || draft.bats.includes(openBatPalette) ? "palette-panel-open" : ""}`}>
        <div className="section-row">
          <h2 className="icon-heading">登録</h2>
        </div>
        <div className="settings-register-editor">
        <section className="settings-nested-card">
        <div className="section-row compact-settings-row">
          <h3>名前</h3>
          <p>使う人</p>
        </div>
        <form className="add-row" onSubmit={addDraftName}>
          <input name="name" type="text" autoComplete="off" placeholder="名前を追加" />
          <button type="submit" className="primary add-text-button">追加</button>
        </form>
        {!hasNames && <p className="settings-error">最初に名前を登録してください。</p>}
        <div className="chip-list">
          {draft.names.map((name) => (
            <span
              key={name}
              className={`chip name-settings-chip ${name === draft.activeName ? "active" : ""} ${openBatPalette === `name:${name}` ? "palette-open" : ""}`}
              style={{ "--name-chip-color": nameColorFor(draft, name), "--settings-chip-text-size": settingsChipTextSize(name) }}
              onClick={(event) => {
                if (shouldIgnoreChipSurfaceClick(event)) return;
                selectDraftName(name);
              }}
            >
              <button
                type="button"
                data-sound-effect="switch"
                onClick={() => selectDraftName(name)}
              >
                <span>{name}</span>
              </button>
              {name === draft.activeName ? <small>使用中</small> : null}
              <button type="button" className="chip-delete" aria-label={`${name}を削除`} onClick={() => removeDraftName(name)}><SvgIcon type="trash" /></button>
            </span>
          ))}
        </div>
        </section>
        <section className="settings-nested-card">
        <fieldset className="settings-fieldset" disabled={!hasNames}>
        <div className="section-row compact-settings-row">
          <h3>バット</h3>
          <p>全員で共有 / 入力時の初期値</p>
        </div>
        <form className="add-row" onSubmit={addDraftBat}>
          <input name="bat" type="text" autoComplete="off" placeholder="例: 赤バット" />
          <button type="submit" className="primary add-text-button">追加</button>
        </form>
        <div className="chip-list">
          {draft.bats.map((bat) => (
            <span
              key={bat}
              className={`chip bat-settings-chip ${bat === draft.defaultBat ? "active default" : ""} ${openBatPalette === bat ? "palette-open" : ""}`}
              style={{ "--bat-chip-color": batColorFor(draft, bat), "--settings-chip-text-size": settingsChipTextSize(bat) }}
              onClick={(event) => {
                if (shouldIgnoreChipSurfaceClick(event)) return;
                selectDraftBat(bat);
              }}
            >
              <button
                type="button"
                data-sound-effect="switch"
                onClick={() => selectDraftBat(bat)}
              >
                <BatIcon color={batColorFor(draft, bat)} />
                <span>{bat}</span>
              </button>
              {bat === draft.defaultBat ? <small>おきにいり</small> : null}
              <span className="bat-color-menu">
                <button
                  type="button"
                  className="bat-color-trigger"
                  aria-label={`${bat}の色を選ぶ`}
                  aria-expanded={openBatPalette === bat}
                  onClick={(event) => togglePalette(bat, event)}
                />
                {openBatPalette === bat && (
                  <span
                    className="bat-color-palette"
                    style={palettePosition ? { "--palette-left": `${palettePosition.left}px`, "--palette-top": `${palettePosition.top}px` } : undefined}
                    role="listbox"
                    aria-label={`${bat}の色`}
                  >
                    {BAT_COLOR_PALETTE.map((color) => {
                      const normalizedColor = normalizeHexColor(color);
                      const currentColor = batColorFor(draft, bat);
                      const usedElsewhere = batColorEntries.some(([otherBat, otherColor]) => otherBat !== bat && otherColor === normalizedColor);
                      const disabled = usedElsewhere && normalizedColor !== currentColor;
                      return (
                        <button
                          type="button"
                          className={normalizedColor === currentColor ? "selected" : ""}
                          style={{ "--swatch-color": normalizedColor }}
                          aria-label={`${bat}を${normalizedColor}にする`}
                          aria-pressed={normalizedColor === currentColor}
                          disabled={disabled}
                          onClick={() => updateBatColor(bat, normalizedColor)}
                          key={normalizedColor}
                        />
                      );
                    })}
                  </span>
                )}
              </span>
              <button type="button" className="chip-delete" aria-label={`${bat}を削除`} onClick={() => removeDraftBat(bat)}><SvgIcon type="trash" /></button>
            </span>
          ))}
        </div>
        {!draft.bats.length && <p className="settings-error">バットをひとつ以上登録してください。</p>}
        </fieldset>
        </section>
        </div>
      </section>

      <section className="panel">
        <div className="section-row">
          <h2 className="icon-heading">データ管理</h2>
          <p>この端末に保存</p>
        </div>
        <div className="tool-grid">
          <button type="button" className="ghost" onClick={exportCsv}><ButtonIcon type="download" />CSV出力</button>
          <label className="file-control ghost"><ButtonIcon type="upload" />CSV読込<input type="file" accept=".csv,text/csv" onChange={importCsv} /></label>
        </div>
        <button type="button" className="danger wide" onClick={() => setPendingDelete({ type: "all", value: "全データ" })}>全データ削除</button>
      </section>
      <section className="panel">
        <div className="section-row">
          <h2 className="icon-heading">テスト</h2>
          <p>検証用</p>
        </div>
        <button type="button" className="ghost wide" onClick={() => setDb({ ...demoDb(db), testInputDefaults: db.testInputDefaults, testRandomGeneration: db.testRandomGeneration, testDate: db.testDate || null })}>デモデータ作成</button>
        <button type="button" className={`ghost wide ${db.testInputDefaults ? "selected" : ""}`} onClick={() => setDb(db.testInputDefaults ? { ...db, testInputDefaults: false, testRandomGeneration: false, testDate: null } : { ...db, testInputDefaults: true, testRandomGeneration: true, testDate: todayISO() })}>
          テストモード {db.testInputDefaults ? "ON" : "OFF"}
        </button>
      </section>
    </div>
  );
}

function BottomNav({ tab, setTab }) {
  const tabs = [
    ["home", NEW_UI_ASSETS.navHome, "ホーム"],
    ["record", NEW_UI_ASSETS.navChallenge, "チャレンジ"],
    ["badges", NEW_UI_ASSETS.navBadge, "バッジ"],
    ["data", NEW_UI_ASSETS.navData, "データ"],
    ["settings", NEW_UI_ASSETS.navSettings, "設定"],
  ];
  return (
    <nav className="bottom-nav" aria-label="画面切り替え">
      {tabs.map(([key, iconUrl, label]) => (
        <button key={key} type="button" className={tab === key ? "active" : ""} onClick={() => setTab(key)} aria-label={key} data-sound-effect="tab">
          <img className="bottom-nav-icon" src={iconUrl} width="112" height="112" decoding="async" alt="" aria-hidden="true" />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}

function DeleteDialog({ pending, onCancel, onConfirm }) {
  const label = pending.type === "name" ? "名前" : pending.type === "bat" ? "バット" : "データ";
  const message = pending.type === "all"
    ? "すべての記録データを削除します。"
    : `${label}「${pending.value}」を削除します。関連する記録データも削除されます。`;
  return (
    <div className="dialog-backdrop" role="dialog" aria-modal="true">
      <div className="dialog">
        <h2>本当に削除しますか？</h2>
        <p>{message}</p>
        <div className="dialog-actions">
          <button type="button" className="ghost" onClick={onCancel}>キャンセル</button>
          <button type="button" className="danger" onClick={onConfirm}>削除する</button>
        </div>
      </div>
    </div>
  );
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (cell || row.length) {
    row.push(cell.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows.filter((items) => items.some((item) => item.trim()));
}

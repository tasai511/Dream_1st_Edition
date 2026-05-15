import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import batIconUrl from "./assets/images/bat-icon.svg";
import premiumMeterBadgeUrl from "./assets/images/premium-meter-badge.svg";

const STORAGE_KEY = "dream1-swing-tracker-v1";
const ALL = "__all__";
const RANGE_ALL = "all";
const RANGE_TODAY = "today";
const RANGE_WEEK = "week";
const RANGE_MONTH = "month";
const RANGE_TOTAL = "total";
const kMinChartVisibleDays = 7;
const kMaxChartVisibleDays = 365;
const RARITY_ORDER = ["C", "U", "R", "RR", "SR", "UR"];
const RARITY_LABELS = {
  C: "Common",
  U: "Uncommon",
  R: "Rare",
  RR: "Double Rare",
  SR: "Super Rare",
  UR: "Ultra Rare",
};
const RARITY_POINTS = {
  C: 1,
  U: 2,
  R: 3,
  RR: 5,
  SR: 10,
  UR: 30,
};
const RARITY_COLORS = {
  C: "#8a5430",
  U: "#2f8f62",
  R: "#4d8dff",
  RR: "#a878ff",
  SR: "#d7dee8",
  UR: "#ffd700",
};
const PUBLIC_ASSET_BASE = import.meta.env.BASE_URL || "./";
const DAILY_RARITY_IMAGE_URLS = {
  C: `${PUBLIC_ASSET_BASE}images/rarity_c_common.png?v=3`,
  U: `${PUBLIC_ASSET_BASE}images/rarity_u_uncommon.png?v=3`,
  R: `${PUBLIC_ASSET_BASE}images/rarity_r_rare.png?v=3`,
  RR: `${PUBLIC_ASSET_BASE}images/rarity_rr_double_rare.png?v=3`,
  SR: `${PUBLIC_ASSET_BASE}images/rarity_sr_super_rare.png?v=3`,
  UR: `${PUBLIC_ASSET_BASE}images/rarity_ur_ultra_rare.png?v=3`,
};
const UNIQUE_TOTAL_COUNT_TARGETS = [100, 500, 1000, 3000, 5000, 10000, 30000, 50000, 100000];
const UNIQUE_BEST_TARGETS = [500, 600, 700, 800, 900, 999];
const UNIQUE_STREAK_TARGETS = [2, 3, 7, 14, 30, 60, 100, 365];
const BAT_COUNT_TARGETS = [100, 500, 1000, 3000, 5000, 10000];
const BAT_DAYS_TARGETS = [3, 7, 14, 30, 60, 100];
const BAT_BEST_TARGETS = [500, 600, 700, 800, 900, 999];
const BAT_BADGE_DEFINITIONS = [
  ...BAT_COUNT_TARGETS.map((target) => ({ metric: "count", target, label: `相棒${target}回`, description: `このバットで累計${target}回スイング` })),
  ...BAT_DAYS_TARGETS.map((target) => ({ metric: "days", target, label: `相棒${target}日`, description: `このバットで${target}日記録` })),
  ...BAT_BEST_TARGETS.map((target) => ({ metric: "best", target, label: `相棒ベスト${target}`, description: `このバットでベスト${target}点到達` })),
];
const BADGE_PERIODS = [
  ["daily", "毎日バッジ"],
  ["weekly", "毎週バッジ"],
  ["monthly", "毎月バッジ"],
  ["total", "累計バッジ"],
];
const periodCountBadgeLabel = (prefix, target) => `${prefix}回数${target}`;
const HOME_BADGE_DEFINITIONS = [
  ...[50, 100, 200, 300, 500].map((target) => ({ period: RANGE_TODAY, group: "daily", metric: "count", target, label: periodCountBadgeLabel("毎日", target) })),
  ...[300, 400, 500, 600, 700].map((target) => ({ period: RANGE_TODAY, group: "daily", metric: "avg", target, label: `毎日平均${target}` })),
  ...[500, 600, 700, 800, 900].map((target) => ({ period: RANGE_TODAY, group: "daily", metric: "best", target, label: `毎日ベスト${target}` })),
  ...[2, 3, 7, 14, 30, 60, 100, 365].map((target) => ({ period: RANGE_TODAY, group: "daily", metric: "streak", target, label: `${target}日連続練習`, trigger: "exact" })),
  ...[300, 500, 1000, 2000].map((target) => ({ period: RANGE_WEEK, group: "weekly", metric: "count", target, label: periodCountBadgeLabel("毎週", target) })),
  ...[300, 400, 500, 600].map((target) => ({ period: RANGE_WEEK, group: "weekly", metric: "avg", target, label: `毎週平均${target}` })),
  ...[[3, "毎週3日練習"], [5, "毎週5日練習"], [7, "毎週皆勤"]].map(([target, label]) => ({ period: RANGE_WEEK, group: "weekly", metric: "days", target, label })),
  ...[500, 1000, 2000, 3000, 5000].map((target) => ({ period: RANGE_MONTH, group: "monthly", metric: "count", target, label: periodCountBadgeLabel("毎月", target) })),
  ...[300, 400, 500, 600].map((target) => ({ period: RANGE_MONTH, group: "monthly", metric: "avg", target, label: `毎月平均${target}` })),
  ...[[5, "毎月5日練習"], [10, "毎月10日練習"], [20, "毎月20日練習"], ["all", "毎月毎日練習"]].map(([target, label]) => ({ period: RANGE_MONTH, group: "monthly", metric: "days", target, label })),
  ...UNIQUE_TOTAL_COUNT_TARGETS.map((target) => ({ period: RANGE_TOTAL, group: "total", metric: "count", target, label: `累計回数${target}` })),
  ...[300, 400, 500, 600, 700].map((target) => ({ period: RANGE_TOTAL, group: "total", metric: "avg", target, label: `累計平均${target}` })),
  ...UNIQUE_BEST_TARGETS.map((target) => ({ period: RANGE_TOTAL, group: "total", metric: "best", target, label: `累計ベスト${target}` })),
  ...[3, 7, 14, 30, 60, 100, 365].map((target) => ({ period: RANGE_TOTAL, group: "total", metric: "days", target, label: `累計${target}日練習` })),
];
const UNIQUE_BADGE_DEFINITIONS = [
  ...UNIQUE_TOTAL_COUNT_TARGETS.map((target) => ({ metric: "count", target, label: `累計${target}回` })),
  ...UNIQUE_BEST_TARGETS.map((target) => ({ metric: "best", target, label: `初${target}点` })),
];
const CONTEXT_START_BADGES = ["はじめの一歩", "初めての50回", "初めての100回"];
const CONTEXT_STREAK_BADGES = UNIQUE_STREAK_TARGETS.map((target) => `${target}日連続`);
const CONTEXT_BAT_BADGES = ["相棒100回", "相棒1000回", "相棒5000回", "バットコレクター", "全バット練習"];
const CONTEXT_GROWTH_BADGES = ["先週より多く振った", "先月より多く振った", "先週より平均アップ", "先月より平均アップ"];
const CONTEXT_SECRET_BADGES = [
  "ラッキー7",
  "スリーナイン",
  "ぴったり500",
  "777スイング",
  "七日目の覚醒",
  "大晦日の素振り",
  "元日の一振り",
  "復活の一振り",
];
const META_BADGE_DEFINITIONS = [
  ...[100, 300, 500, 1000, 2000, 5000, 10000].map((target) => ({
    metric: "points",
    target,
    label: `バッジポイント${target}`,
    description: `バッジポイント${target}pt到達`,
  })),
  ...[10, 25, 50, 75, 100].map((target) => ({
    metric: "types",
    target,
    label: `バッジ${target}種類`,
    description: `バッジを${target}種類集める`,
  })),
  ...[50, 100, 300, 500, 1000, 3000].map((target) => ({
    metric: "instances",
    target,
    label: `バッジ${target}個`,
    description: `重複を含めてバッジを${target}個集める`,
  })),
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
  testInputDefaults: false,
};

const TEST_INITIAL_RECORD_VALUES = { count: 60, avg: 520, best: 640 };
const TEST_ADDITION_RECORD_VALUES = { count: 40, avg: 320, best: 420 };

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
  if (name.includes("赤")) return "#ff4055";
  if (name.includes("黒")) return "#8d95a4";
  if (name.includes("青")) return "#3b8dff";
  if (name.includes("緑")) return "#249c68";
  if (name.includes("黄") || name.includes("金")) return "#f6b73c";
  return BAT_COLOR_PALETTE[index % BAT_COLOR_PALETTE.length];
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

function compactPlayerName(name) {
  const chars = [...String(name || "未選択")];
  return chars.length > 4 ? `${chars.slice(0, 3).join("")}…` : chars.join("");
}

function SvgIcon({ type }) {
  const props = { viewBox: "0 0 24 24", "aria-hidden": "true" };
  if (type === "home") return <svg {...props}><path d="M3.8 11.2 12 4.6l8.2 6.6" /><path d="M6.2 10.2v9.1h11.6v-9.1" /><path d="M9.4 19.3v-5.2h5.2v5.2" /><path d="M9.4 7.2h5.2" /></svg>;
  if (type === "challenge") return <svg {...props}><path d="M7 5.2h10v5.1a5 5 0 0 1-10 0V5.2Z" /><path d="M7 7H4.4v2.1A3.4 3.4 0 0 0 7.8 12" /><path d="M17 7h2.6v2.1a3.4 3.4 0 0 1-3.4 2.9" /><path d="M12 15.2v3.2" /><path d="M8.6 20.2h6.8" /><path d="m10.2 9.2 1.2 1.2 2.5-2.6" /></svg>;
  if (type === "log") return <svg {...props}><rect x="4" y="5" width="16" height="15" rx="3" /><path d="M8 3v4M16 3v4M4 10h16" /></svg>;
  if (type === "settings") return <svg {...props}><circle cx="12" cy="12" r="3.2" /><path d="M19 12a7 7 0 0 0-.1-1l2-1.6-2-3.4-2.4 1a7 7 0 0 0-1.8-1L14.4 3h-4.8l-.3 3a7 7 0 0 0-1.8 1l-2.4-1-2 3.4 2 1.6A7 7 0 0 0 5 12a7 7 0 0 0 .1 1l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 1.8 1l.3 3h4.8l.3-3a7 7 0 0 0 1.8-1l2.4 1 2-3.4-2-1.6c.1-.3.1-.7.1-1Z" /></svg>;
  if (type === "collection") return <svg {...props}><circle cx="12" cy="9" r="4.6" /><path d="M9.4 13.1 7.6 20l4.4-2.5 4.4 2.5-1.8-6.9" /><path d="M12 6.8l.7 1.4 1.5.2-1.1 1.1.3 1.5-1.4-.8-1.4.8.3-1.5-1.1-1.1 1.5-.2L12 6.8Z" /></svg>;
  if (type === "person") return <svg {...props}><circle cx="12" cy="7.4" r="3.4" /><path d="M5 21c.8-4.6 3.2-7 7-7s6.2 2.4 7 7" /></svg>;
  if (type === "count") return <svg {...props}><path d="M4 7h16M4 12h16M4 17h10" /></svg>;
  if (type === "avg") return <svg {...props}><path d="M4 17 9 12l4 4 7-9" /><path d="M16 7h4v4" /></svg>;
  if (type === "best") return <svg {...props}><path d="M12 3 9.5 8.5 4 9l4.2 3.8L7 18.5l5-3 5 3-1.2-5.7L20 9l-5.5-.5L12 3Z" /></svg>;
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

function startOfYear(date) {
  return new Date(date.getFullYear(), 0, 1);
}

function endOfYear(date) {
  return new Date(date.getFullYear(), 11, 31);
}

function monthLabel(date) {
  return `${date.getMonth() + 1}月`;
}

function formatRangeDate(date) {
  return `${date.getMonth() + 1}/${date.getDate()}`;
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

function badgeFilterWindow(filter, baseDate = parseISO(todayISO())) {
  if (filter === RANGE_TODAY) return { start: baseDate, end: baseDate };
  if (filter === RANGE_WEEK) return { start: startOfWeek(baseDate), end: endOfWeek(baseDate) };
  if (filter === RANGE_MONTH) return { start: startOfMonth(baseDate), end: endOfMonth(baseDate) };
  if (filter === "year") return { start: startOfYear(baseDate), end: endOfYear(baseDate) };
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
      testInputDefaults: Boolean(parsed.testInputDefaults),
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

function periodSummaryFromDaily(dailyMap, start, end) {
  const today = parseISO(todayISO());
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
  if (definition.metric === "avg") return summary.badgeAvg ?? summary.avg;
  if (definition.metric === "best") return summary.best;
  if (definition.metric === "days") return summary.days;
  if (definition.metric === "streak") return summary.streak;
  return 0;
}

function homeBadgeTarget(definition, summary) {
  return definition.target === "all" ? summary.spanDays : definition.target;
}

function addHomeBadge(map, date, label) {
  map.set(date, [...(map.get(date) || []), label]);
}

function isHomeBadgeEarned(definition, summary) {
  const value = homeBadgeMetricValue(definition, summary);
  const target = homeBadgeTarget(definition, summary);
  return definition.trigger === "exact" ? value === target : value >= target;
}

function badgesFor(records) {
  const daily = aggregate(records);
  const dailyMap = new Map(daily.map((day) => [day.date, day]));
  const streaks = streakByDate(daily);
  const byDate = new Map();
  const uniqueEarned = new Set();
  const batEarned = new Set();
  const batStats = new Map();
  let cumulativeCount = 0;
  let cumulativeBest = 0;

  daily.forEach((day) => {
    const dayRecords = records.filter((record) => record.date === day.date);
    dayRecords.forEach((record) => {
      const stats = batStats.get(record.bat) || { count: 0, days: new Set(), best: 0 };
      stats.count += record.count;
      stats.days.add(record.date);
      stats.best = Math.max(stats.best, record.best || 0);
      batStats.set(record.bat, stats);

      BAT_BADGE_DEFINITIONS.forEach((definition) => {
        const key = `${record.bat}:${definition.label}`;
        if (batEarned.has(key)) return;
        const value = definition.metric === "count" ? stats.count : definition.metric === "days" ? stats.days.size : stats.best;
        if (value >= definition.target) {
          addHomeBadge(byDate, day.date, `${record.bat} ${definition.label}`);
          batEarned.add(key);
        }
      });
    });

    cumulativeCount += day.count;
    cumulativeBest = Math.max(cumulativeBest, day.best || 0);
    UNIQUE_BADGE_DEFINITIONS.forEach((definition) => {
      if (uniqueEarned.has(definition.label)) return;
      const value = definition.metric === "count" ? cumulativeCount : cumulativeBest;
      if (value >= definition.target) {
        addHomeBadge(byDate, day.date, definition.label);
        uniqueEarned.add(definition.label);
      }
    });

    const summary = { ...day, badgeAvg: day.avg, days: 1, spanDays: 1, streak: streaks.get(day.date) || 0 };
    HOME_BADGE_DEFINITIONS
      .filter((definition) => definition.period === RANGE_TODAY)
      .forEach((definition) => {
        if (isHomeBadgeEarned(definition, summary)) {
          addHomeBadge(byDate, day.date, definition.label);
        }
      });
  });

  const periodKeys = new Map();
  daily.forEach((day) => {
    const dateValue = parseISO(day.date);
    const weekKey = toISO(startOfWeek(dateValue));
    const monthKey = day.date.slice(0, 7);
    periodKeys.set(`week:${weekKey}`, { period: RANGE_WEEK, start: startOfWeek(dateValue), end: endOfWeek(dateValue), earnedAt: day.date });
    periodKeys.set(`month:${monthKey}`, { period: RANGE_MONTH, start: startOfMonth(dateValue), end: endOfMonth(dateValue), earnedAt: day.date });
  });

  periodKeys.forEach((period) => {
    const summary = periodSummaryFromDaily(dailyMap, period.start, period.end);
    HOME_BADGE_DEFINITIONS
      .filter((definition) => definition.period === period.period)
      .forEach((definition) => {
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

function comparisonBuckets(daily, range) {
  const bucketRange = range === RANGE_WEEK ? 7 : range === RANGE_MONTH ? 30 : 1;
  const map = new Map(daily.map((day) => [day.date, day]));
  const today = parseISO(todayISO());
  const earliest = daily.length ? parseISO(daily[0].date) : today;
  const startAnchor = range === RANGE_WEEK ? startOfWeek(today) : range === RANGE_MONTH ? startOfMonth(today) : today;
  const firstAnchor = range === RANGE_WEEK ? startOfWeek(earliest) : range === RANGE_MONTH ? startOfMonth(earliest) : earliest;
  const diffUnit = range === RANGE_MONTH
    ? ((startAnchor.getFullYear() - firstAnchor.getFullYear()) * 12) + (startAnchor.getMonth() - firstAnchor.getMonth())
    : Math.floor((startAnchor - firstAnchor) / 86400000 / bucketRange);
  const minBuckets = range === RANGE_TODAY ? 8 : range === RANGE_WEEK ? 5 : range === RANGE_MONTH ? 6 : 7;
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

function ProgressMeter({ kind, value, range, variableTarget, targets, focus = false, showBadgeIcon = true }) {
  const [selectedBadge, setSelectedBadge] = useState(null);
  const meterRef = useRef(null);
  const info = progressInfo(kind, Number(value || 0), range, variableTarget, targets);
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
        <small>自己ベスト更新中！</small>
      )}
    </button>
  );
}

function dailyBadgeMilestones(metric, value, targets = null) {
  const definitions = targets || HOME_BADGE_DEFINITIONS
    .filter((definition) => definition.period === RANGE_TODAY && definition.metric === metric && typeof definition.target === "number");
  return definitions
    .sort((a, b) => a.target - b.target)
    .map((definition) => ({
      ...definition,
      earned: value >= definition.target,
      position: value > 0 ? clamp((definition.target / value) * 100, 0, 100) : 0,
    }));
}

function dailyResultBadge(metric, value, targets = null) {
  return [...dailyBadgeMilestones(metric, value, targets)].reverse().find((definition) => definition.earned) || null;
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
    bats: to.bats || from.bats || [],
  };
}

function animationScale(fromValue, toValue) {
  return Math.max(1, fromValue || 0, toValue || 0);
}

function animationFillRatio(fromValue, toValue, progress) {
  const current = interpolateNumber(fromValue || 0, toValue || 0, progress);
  return clamp(current / animationScale(fromValue, toValue), 0, 1);
}

function milestoneAlpha(position) {
  const ratio = clamp(position / 100, 0, 1);
  if (ratio <= 0.28) return clamp((ratio / 0.28) * 0.18, 0.04, 0.18);
  if (ratio <= 0.68) return 0.18 + ((ratio - 0.28) / 0.4) * 0.5;
  return 0.68 + ((ratio - 0.68) / 0.32) * 0.32;
}

function DailyResultCards({ summary, showBadges = true, selected = false, onSelect = null, animation = null, range = RANGE_TODAY, includeDays = false }) {
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
      fillRatio: animation?.fillRatios?.count,
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
      fillRatio: animation?.fillRatios?.avg,
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
      fillRatio: animation?.fillRatios?.best,
      revealBadge: !animation?.active,
    },
  ];

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
          {cards.map((card) => <DailyResultCard card={card} showBadges={showBadges} key={card.key} />)}
        </div>
      </article>
    );
  }

  return <div className={`daily-result-grid card-count-${cards.length}`}>{cards.map((card) => <DailyResultCard card={card} showBadges={showBadges} key={card.key} />)}</div>;
}

function DailyResultCard({ card, showBadges }) {
  const [selectedBadge, setSelectedBadge] = useState(null);
  const valueFontSize = scoreCardFontSize(card.value);
  const badgeDefinitions = HOME_BADGE_DEFINITIONS
    .filter((definition) => (
      definition.period === (card.range || RANGE_TODAY) &&
      definition.metric === card.metric &&
      (typeof definition.target === "number" || (definition.target === "all" && card.variableTarget))
    ))
    .map((definition) => ({
      ...definition,
      target: definition.target === "all" ? card.variableTarget : definition.target,
    }));
  const milestones = dailyBadgeMilestones(card.metric, card.value, badgeDefinitions);
  const earnedBadge = dailyResultBadge(card.metric, card.value, badgeDefinitions);
  const visibleMilestones = milestones.filter((milestone) => milestone.earned);
  const revealBadge = card.revealBadge !== false;
  const showMilestoneTrack = showBadges && !(card.metric === "best" && (card.range === RANGE_WEEK || card.range === RANGE_MONTH));

  return (
    <article className={`daily-result-card ${card.key} ${card.revealBadge === false ? "animating" : ""}`} style={{ "--milestone-fill-ratio": String(card.fillRatio ?? 1) }}>
      <div className="metric-label"><Icon type={card.icon} />{card.label}</div>
      {showBadges && (
        <>
          <div className="daily-score-row">
            <strong style={{ "--score-value-size": valueFontSize }}>{Number(card.value || 0).toLocaleString("ja-JP")}<span>{card.unit}</span></strong>
            <div
              className="daily-badge-stage"
              style={earnedBadge && revealBadge ? { "--daily-stage-badge-color": rarityColorFor(rarityForBadge(earnedBadge.label)) } : null}
            >
              {earnedBadge && revealBadge ? (
                <>
                  <DailyBadgeMark label={earnedBadge.label} description={earnedBadge.description || `${earnedBadge.label}をゲット`} />
                  <span className="daily-badge-get-stamp" aria-hidden="true">GET!</span>
                </>
              ) : null}
            </div>
          </div>
          <div className={`milestone-track ${showMilestoneTrack ? "" : "placeholder"} ${visibleMilestones.length ? "earned" : ""}`}>
            <span className="milestone-fill" />
            {showMilestoneTrack && visibleMilestones.map((milestone) => {
              const alpha = milestoneAlpha(milestone.position);
              const definition = makeBadgeDefinition(canonicalBadgeLabel(milestone.label), { description: milestone.description || `${milestone.label}をゲット` });
              return (
              <button
                type="button"
                className={`milestone-dot ${earnedBadge?.label === milestone.label ? "current" : ""}`}
                style={{
                  left: `${milestone.position}%`,
                  "--milestone-alpha": alpha.toFixed(2),
                  "--milestone-ring-alpha": Math.max(0.08, alpha * 0.7).toFixed(2),
                }}
                onClick={() => setSelectedBadge({ ...definition, earnedCount: 0, lockedSecret: false })}
                aria-label={`${definition.label}の詳細`}
                key={milestone.label}
              >
                <RarityIcon rarity={rarityForBadge(milestone.label)} />
                <span>{milestone.target}</span>
              </button>
              );
            })}
          </div>
          {selectedBadge && (
            <BadgeDetailPopover badge={selectedBadge} onClose={() => setSelectedBadge(null)} />
          )}
        </>
      )}
      {!showBadges && <strong style={{ "--score-value-size": valueFontSize }}>{Number(card.value || 0).toLocaleString("ja-JP")}<span>{card.unit}</span></strong>}
    </article>
  );
}

function scoreCardFontSize(value) {
  const digits = Number(value || 0).toLocaleString("ja-JP").length;
  if (digits >= 9) return "1.38rem";
  if (digits >= 8) return "1.52rem";
  if (digits >= 7) return "1.68rem";
  if (digits >= 6) return "1.88rem";
  if (digits >= 5) return "2.08rem";
  return "2.44rem";
}

function DailyBadgeMark({ label, description }) {
  const [selectedBadge, setSelectedBadge] = useState(null);
  const definition = makeBadgeDefinition(canonicalBadgeLabel(label), { description });
  return (
    <>
      <button
        type="button"
        className={`daily-badge-mark rarity-${definition.rarity.toLowerCase()}`}
        onClick={() => setSelectedBadge({ ...definition, earnedCount: 0, lockedSecret: false })}
        aria-label={`${definition.label}の詳細`}
      >
        <img className="daily-badge-image" src={DAILY_RARITY_IMAGE_URLS[definition.rarity]} alt="" aria-hidden="true" />
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
          <img className="daily-badge-image" src={DAILY_RARITY_IMAGE_URLS[rarity]} alt="" aria-hidden="true" />
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
  const allBadges = useMemo(() => [...badgeCounts].sort((a, b) => compareBadgesByRarity(a[0], b[0])), [badgeCounts]);
  const featuredBadges = useMemo(() => allBadges.slice(0, 6), [allBadges]);
  const visibleBadges = expanded ? allBadges : featuredBadges;
  const badgeTotal = badgeCounts.length;
  const toggleExpanded = () => {
    setExpanded((value) => !value);
  };

  return (
    <section className={`dashboard-section badge-inline-section ${expanded ? "expanded" : ""}`}>
      <div className="section-row tight">
        <div>
          <h2 className="icon-heading"><Icon type="badge" />{title}</h2>
        </div>
        <div className="badge-heading-count"><strong>{badgeTotal.toLocaleString("ja-JP")}</strong><span>種類</span></div>
      </div>
      {badgeCounts.length ? (
        <>
          <div className="badge-list-window">
            <div className="badge-list two-col">
              {visibleBadges.map(([label, count], index) => (
                <span
                  className="badge-motion-item"
                  style={{ "--badge-index": index }}
                  key={label}
                >
                  <BadgeChip label={label} count={count} />
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

function CountBars({ buckets }) {
  const scrollRef = useRef(null);
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

  return (
    <div className="record-scroll" ref={scrollRef}>
      <div className="count-bars">
        {buckets.map((bucket) => {
          const clipped = bucket.count > cap;
          const height = bucket.count > 0 ? Math.max(10, (Math.min(bucket.count, cap) / cap) * 100) : 0;
          return (
            <article className={`bar-item ${bucket.label === "今日" ? "today" : ""} ${clipped ? "clipped" : ""}`} key={bucket.label}>
              <div className="bar-track">
                <span className="bar-fill" style={{ height: `${height}%` }} />
              </div>
              <strong>{Number(bucket.count || 0).toLocaleString("ja-JP")}<small>回</small></strong>
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
  const pad = { left: 34, right: 12, top: 6, bottom: 36 };
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
  const xAxisLabels = [
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
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const pointers = [...pointersRef.current.values()];
    if (pointers.length >= 2) {
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
    event.preventDefault();
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
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

function demoDb() {
  const names = ["はるた", "おとー"];
  const bats = ["しきバット", "だめバット", "ミニバット"];
  const demoDays = 729;
  const end = parseISO(todayISO());
  const records = [];
  const nameColors = {
    "はるた": "#2f86ff",
    "おとー": "#249c68",
  };
  const batColors = {
    "しきバット": "#ff9f1c",
    "だめバット": "#a26bff",
    "ミニバット": "#8d95a4",
  };
  const rand = (seed) => {
    const value = Math.sin(seed * 12.9898) * 43758.5453;
    return value - Math.floor(value);
  };
  const batFor = (nameIndex, elapsed, progress, pick) => {
    if (nameIndex === 0) {
      const miniBias = progress < 0.22 ? 0.24 : 0.12;
      if (pick < miniBias) return "ミニバット";
      if (pick < 0.72) return "しきバット";
      return "だめバット";
    }
    if (pick < 0.42) return "ミニバット";
    if (pick < 0.74) return "しきバット";
    return "だめバット";
  };

  for (let elapsed = 0; elapsed <= demoDays; elapsed += 1) {
    const dateObj = addDays(end, elapsed - demoDays);
    const date = toISO(dateObj);
    const day = dateObj.getDay();
    const month = dateObj.getMonth();
    const progress = elapsed / demoDays;

    names.forEach((name, nameIndex) => {
      const seed = elapsed + nameIndex * 1000;
      const campBlock = elapsed % 91 >= 8 && elapsed % 91 <= 20;
      const vacation = month === 7 && elapsed % 17 < 3;
      const regularDay = nameIndex === 0
        ? [1, 2, 4, 5, 6].includes(day)
        : [0, 3, 6].includes(day);
      const bonusDay = rand(seed + 1) > (nameIndex === 0 ? 0.74 : 0.86);
      const restDay = !campBlock && (!regularDay || rand(seed + 2) < (nameIndex === 0 ? 0.16 : 0.28) || vacation);
      if (restDay && !bonusDay) return;

      const bigDay = campBlock || elapsed % 53 === 0 || rand(seed + 3) > 0.92;
      const baseCount = nameIndex === 0 ? 58 + progress * 128 : 28 + progress * 66;
      const countNoise = Math.round(rand(seed + 4) * (nameIndex === 0 ? 88 : 52));
      const countBoost = bigDay ? (nameIndex === 0 ? 118 + Math.round(rand(seed + 5) * 215) : 55 + Math.round(rand(seed + 5) * 105)) : 0;
      const totalCount = Math.round(clamp(baseCount + countNoise + countBoost, nameIndex === 0 ? 35 : 18, nameIndex === 0 ? 540 : 260));
      const seasonal = Math.round(24 * Math.sin(elapsed / 34) + 12 * Math.cos(elapsed / 19));
      const slump = elapsed % 143 > 126 ? -38 : 0;
      const avgBase = nameIndex === 0 ? 318 + progress * 330 : 278 + progress * 185;
      const avg = Math.round(clamp(avgBase + seasonal + slump + rand(seed + 6) * 72, nameIndex === 0 ? 260 : 230, nameIndex === 0 ? 760 : 650));
      const bestSpike = bigDay ? 95 + rand(seed + 7) * 120 : 54 + rand(seed + 7) * 88;
      const best = Math.round(clamp(avg + bestSpike, avg + 20, nameIndex === 0 ? 940 : 820));
      const mainBat = batFor(nameIndex, elapsed, progress, rand(seed + 8));
      const split = bigDay && totalCount >= (nameIndex === 0 ? 180 : 115);
      const secondBat = mainBat === "しきバット" ? "だめバット" : "しきバット";
      const isToday = elapsed === demoDays;
      const chunks = isToday
        ? [
            ["しきバット", Math.round(totalCount * 0.48)],
            ["だめバット", Math.round(totalCount * 0.32)],
            ["ミニバット", 0],
          ]
        : split
        ? [
            [mainBat, Math.round(totalCount * (0.62 + rand(seed + 9) * 0.16))],
            [secondBat, 0],
          ]
        : [[mainBat, totalCount]];
      if (isToday) chunks[2][1] = totalCount - chunks[0][1] - chunks[1][1];
      if (!isToday && split) chunks[1][1] = totalCount - chunks[0][1];

      chunks.forEach(([bat, count], index) => {
        if (count <= 0) return;
        const batOffset = bat === "しきバット" ? 12 : bat === "だめバット" ? -6 : -18;
        const recordAvg = Math.round(clamp(avg + batOffset + (rand(seed + 10 + index) - 0.5) * 34, 180, 999));
        const recordBest = Math.round(clamp(best + batOffset + (rand(seed + 20 + index) - 0.5) * 38, recordAvg, 999));
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
    activeName: names[0],
    names,
    nameColors,
    bats,
    batColors,
    defaultBat: bats[0],
    theme: nameColors[names[0]],
    records,
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
  const [range, setRange] = useState(RANGE_WEEK);
  const [selectedDate, setSelectedDate] = useState(todayISO);
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [pendingDelete, setPendingDelete] = useState(null);
  const [isNameMenuOpen, setIsNameMenuOpen] = useState(false);
  const [scoreAnimation, setScoreAnimation] = useState(null);

  const setDb = (next) => {
    setDbState(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const currentName = db.activeName || db.names[0] || "";
  const allForName = useMemo(() => db.records.filter((record) => record.name === currentName), [db.records, currentName]);
  const badgeMap = useMemo(() => badgesFor(allForName), [allForName]);

  useEffect(() => {
    if (!db.names.length && tab !== "settings") setTab("settings");
  }, [db.names.length, tab]);

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
    if (date === todayISO()) {
      const todayRecordsBefore = db.records.filter((item) => item.name === currentName && item.date === date);
      const todayRecordsAfter = nextRecords.filter((item) => item.name === currentName && item.date === date);
      const fromSummary = aggregate(todayRecordsBefore)[0] || emptyDailySummary(date);
      const toSummary = aggregate(todayRecordsAfter)[0] || emptyDailySummary(date);
      const fromBat = aggregateByBat(todayRecordsBefore).find((item) => item.bat === bat) || { bat, count: 0, avg: 0, best: 0 };
      const toBat = aggregateByBat(todayRecordsAfter).find((item) => item.bat === bat) || { bat, count: 0, avg: 0, best: 0 };
      setScoreAnimation({ id: uid(), bat, fromSummary, toSummary, fromBat, toBat });
    }
    setDb({ ...db, records: nextRecords });
    event.currentTarget.reset();
    return true;
  };

  const loadAnimationTestDb = () => {
    setDb(animationTestDb());
    setHomeBat(ALL);
    setSelectedDate(todayISO());
    setScoreAnimation(null);
    setTab("home");
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
    setDb({
      ...db,
      bats: nextBats,
      batColors: {
        ...normalizeBatColors(db.batColors, db.bats),
        [value]: fallbackBatColor(value, nextBats.length - 1),
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
      setDb({ activeName: "", names: [], nameColors: {}, bats: [], batColors: {}, defaultBat: "", theme: BAT_COLOR_PALETTE[0], records: [] });
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
        next.bats.push(bat);
        next.batColors[bat] = fallbackBatColor(bat, next.bats.length - 1);
      }
      next.records.push({ id: uid(), name, bat, date, count: Number(count) || 0, avg: Number(avg) || 0, best: Number(best) || 0 });
    });
    if (!next.activeName && next.names[0]) next.activeName = next.names[0];
    if (!next.defaultBat && next.bats[0]) next.defaultBat = next.bats[0];
    setDb(next);
    event.target.value = "";
  };

  return (
    <div className={`app theme-${["red", "blue", "green"].includes(db.theme) ? db.theme : "custom"} font-${fontThemeKey(db.fontTheme)}`} style={themeStyleFor(currentName ? nameColorFor(db, currentName) : db.theme)}>
      <div className="phone-shell">
        <header className="app-header">
          <strong className="app-title">SWING LOG</strong>
          <div className="player-switcher">
            <button
              className="active-player"
              type="button"
              aria-expanded={isNameMenuOpen}
              onClick={() => setIsNameMenuOpen((value) => !value)}
            >
              <SvgIcon type="person" /><span>{compactPlayerName(currentName)}</span>
            </button>
            {isNameMenuOpen && (
              <div className="player-menu" role="menu" aria-label="名前を切り替え">
                {db.names.length ? db.names.map((name) => (
                  <button
                    type="button"
                    className={name === currentName ? "selected" : ""}
                    onClick={() => {
                      setDb({ ...db, activeName: name });
                      setIsNameMenuOpen(false);
                    }}
                    role="menuitem"
                    key={name}
                  >
                    <SvgIcon type="person" />
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
              currentName={currentName}
              allForName={allForName}
              addRecord={addRecord}
              scoreAnimation={scoreAnimation}
              onScoreAnimationComplete={() => setScoreAnimation(null)}
            />
          )}
          {tab === "record" && (
            <RecordView
              db={db}
              allForName={allForName}
            />
          )}
          {tab === "badges" && (
            <BadgeCollectionView allForName={allForName} />
          )}
          {tab === "allRecords" && (
            <ChallengeAllPanel db={db} records={allForName} />
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

        <BottomNav tab={tab} setTab={setTab} />

        {pendingDelete && <DeleteDialog pending={pendingDelete} onCancel={() => setPendingDelete(null)} onConfirm={confirmDelete} />}
      </div>
    </div>
  );
}

function HomeView({ db, currentName, allForName, addRecord, scoreAnimation, onScoreAnimationComplete }) {
  const [scoreAnimationProgress, setScoreAnimationProgress] = useState(1);
  const [formResetKey, setFormResetKey] = useState(0);
  const activeScoreAnimationIdRef = useRef(null);
  const allFiltered = db.records.filter((record) => (
    record.name === currentName &&
    record.date <= todayISO()
  ));
  const todayRecords = allFiltered.filter((record) => record.date === todayISO());
  const todaySummary = aggregate(todayRecords)[0] || { date: todayISO(), count: 0, avg: 0, best: 0, bats: [] };
  const hasTodayRecord = todayRecords.length > 0;
  const todayByBat = aggregateByBat(todayRecords);
  const isFreshScoreAnimation = Boolean(scoreAnimation && activeScoreAnimationIdRef.current !== scoreAnimation.id);
  const effectiveScoreAnimationProgress = isFreshScoreAnimation ? 0 : scoreAnimationProgress;
  const isScoreAnimating = Boolean(scoreAnimation && effectiveScoreAnimationProgress < 1);
  const displayTodaySummary = scoreAnimation
    ? interpolateDailySummary(scoreAnimation.fromSummary, scoreAnimation.toSummary, effectiveScoreAnimationProgress)
    : todaySummary;
  const scoreCardAnimation = scoreAnimation ? {
    active: isScoreAnimating,
    fillRatios: {
      count: animationFillRatio(scoreAnimation.fromSummary.count, scoreAnimation.toSummary.count, effectiveScoreAnimationProgress),
      avg: animationFillRatio(scoreAnimation.fromSummary.avg, scoreAnimation.toSummary.avg, effectiveScoreAnimationProgress),
      best: animationFillRatio(scoreAnimation.fromSummary.best, scoreAnimation.toSummary.best, effectiveScoreAnimationProgress),
    },
  } : null;
  const animatedBatSummary = scoreAnimation
    ? {
        bat: scoreAnimation.bat,
        ...interpolateDailySummary(scoreAnimation.fromBat, scoreAnimation.toBat, effectiveScoreAnimationProgress),
      }
    : null;
  const homeBatSummaries = todayByBat
    .map((item) => (animatedBatSummary?.bat === item.bat ? { ...item, ...animatedBatSummary } : item))
    .sort((a, b) => db.bats.indexOf(a.bat) - db.bats.indexOf(b.bat));
  const testRecordValues = db.testInputDefaults
    ? (hasTodayRecord ? TEST_ADDITION_RECORD_VALUES : TEST_INITIAL_RECORD_VALUES)
    : null;
  const todayEarnedBadges = badgesFor(allForName.filter((record) => record.date <= todayISO())).get(todayISO()) || [];
  const badgeCounts = [...todayEarnedBadges.reduce((map, label) => {
    map.set(label, (map.get(label) || 0) + 1);
    return map;
  }, new Map()).entries()].sort(([a], [b]) => compareBadgesByRarity(a, b));
  const handleRecordSubmit = (event) => {
    if (addRecord(event, todayISO())) {
      event.currentTarget.reset();
      setFormResetKey((value) => value + 1);
    }
  };

  useLayoutEffect(() => {
    if (!scoreAnimation) {
      activeScoreAnimationIdRef.current = null;
      setScoreAnimationProgress(1);
      return undefined;
    }

    activeScoreAnimationIdRef.current = scoreAnimation.id;
    const duration = 5000;
    let frameId = 0;
    let startedAt = 0;

    const tick = (now) => {
      if (!startedAt) startedAt = now;
      const rawProgress = clamp((now - startedAt) / duration, 0, 1);
      const easedProgress = 1 - Math.pow(1 - rawProgress, 3);
      setScoreAnimationProgress(easedProgress);
      if (rawProgress < 1) {
        frameId = requestAnimationFrame(tick);
      } else {
        onScoreAnimationComplete?.();
      }
    };

    setScoreAnimationProgress(0);
    frameId = requestAnimationFrame((now) => {
      startedAt = now;
      frameId = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frameId);
  }, [scoreAnimation?.id]);

  return (
    <>
      <section className="home-section home-result-section">
        <div className="section-row tight home-section-heading-row">
          <h2 className="icon-heading"><Icon type="home" />今日の結果</h2>
        </div>
        <div className="home-score-input-grid">
          <section className="home-section home-input-panel open">
            <div className="input-panel-layout">
              <SwingForm
                key={`${formResetKey}-${testRecordValues ? `${hasTodayRecord ? "add" : "first"}-${db.defaultBat}` : db.defaultBat}`}
                bats={db.bats}
                defaultBat={db.defaultBat}
                batColors={db.batColors}
                defaultValues={formResetKey === 0 ? testRecordValues : null}
                onSubmit={handleRecordSubmit}
                submitLabel={hasTodayRecord ? "追加する" : "記録する"}
              />
            </div>
          </section>
          <DailyResultCards summary={displayTodaySummary} animation={scoreCardAnimation} />
        </div>
        <div className="home-subheading">使ったバット</div>
        <div className="home-bat-records">
          {homeBatSummaries.length ? (
            homeBatSummaries.map((item) => (
            <HomeBatResultCard
              db={db}
              item={item}
              key={item.bat}
            />
            ))
          ) : <p className="empty compact-empty">バットを登録するとバット別記録が表示されます。</p>}
        </div>
        <EarnedBadgesCard badgeCounts={badgeCounts} title="今日のバッジ" />
      </section>
    </>
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

function collectBadgeCounts(records, filter = RANGE_ALL) {
  const { start, end } = badgeFilterWindow(filter);
  const startISO = start ? toISO(start) : null;
  const endISO = end ? toISO(end) : null;
  const counts = {};
  [...badgesFor(records).entries()].forEach(([date, badges]) => {
    if (startISO && date < startISO) return;
    if (endISO && date > endISO) return;
    badges.forEach((badge) => {
      counts[badge] = (counts[badge] || 0) + 1;
    });
  });
  return Object.entries(counts).sort(([a], [b]) => {
    const aRank = badgeSortKey(a);
    const bRank = badgeSortKey(b);
    return aRank[0] - bRank[0] || aRank[1] - bRank[1] || aRank[2] - bRank[2] || String(aRank[3]).localeCompare(String(bRank[3]), "ja");
  });
}

function badgeCategory(label) {
  if (label.includes("相棒ベスト")) return "score";
  if (label.startsWith("初")) return "score";
  return label.includes("平均") || label.includes("ベスト") ? "score" : "count";
}

function badgePeriod(label) {
  if (label.includes("相棒")) return "total";
  if (label.startsWith("累計") || label.startsWith("初")) return "total";
  if (label.includes("日連続練習")) return "daily";
  if (label.startsWith("毎日") || label.startsWith("今日") || label.startsWith("日平均")) return "daily";
  if (label.startsWith("毎週") || label.startsWith("今週") || label.startsWith("週平均")) return "weekly";
  if (label.startsWith("毎月") || label.startsWith("月間")) return "monthly";
  if (label.startsWith("月平均") || label.startsWith("今月")) return "monthly";
  return "other";
}

function badgeGroupKey(label) {
  return `${badgePeriod(label)}-${badgeCategory(label)}`;
}

function badgeValue(label) {
  const matches = label.match(/[\d,.]+/g) || [];
  return Number(matches.at(-1)?.replace(/,/g, "") || 0);
}

function badgeSortKey(label) {
  const value = badgeValue(label);
  const period = badgePeriod(label) === "daily" ? 0 : badgePeriod(label) === "weekly" ? 1 : badgePeriod(label) === "monthly" ? 2 : badgePeriod(label) === "total" ? 3 : 9;
  const metric = label.includes("回数") || /回$/.test(label) ? 0 : label.includes("平均") ? 1 : label.includes("ベスト") ? 2 : label.includes("練習") || label.includes("皆勤") || label.includes("毎日") ? 3 : 0;
  return [period, metric, value || 9999, label];
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

function canonicalBadgeLabel(label) {
  const batBadgeIndex = label.indexOf(" 相棒");
  const baseLabel = batBadgeIndex >= 0 ? label.slice(batBadgeIndex + 1) : label;
  return baseLabel
    .replace(/^今日(?=\d+回)/, "毎日回数")
    .replace(/^毎日(?=\d+回)/, "毎日回数")
    .replace(/^毎日回数([\d,.]+)回$/, "毎日回数$1")
    .replace(/^日平均(?=\d+)/, "毎日平均")
    .replace(/^今日ベスト(?=\d+)/, "毎日ベスト")
    .replace(/^今週(?=\d+回)/, "毎週回数")
    .replace(/^毎週(?=\d+回)/, "毎週回数")
    .replace(/^毎週回数([\d,.]+)回$/, "毎週回数$1")
    .replace(/^週平均(?=\d+)/, "毎週平均")
    .replace(/^今週(?=\d+日練習|皆勤)/, "毎週")
    .replace(/^月間(?=\d+回)/, "毎月回数")
    .replace(/^毎月(?=\d+回)/, "毎月回数")
    .replace(/^毎月回数([\d,.]+)回$/, "毎月回数$1")
    .replace(/^月平均(?=\d+)/, "毎月平均")
    .replace(/^今月(?=\d+日練習|毎日練習)/, "毎月");
}

function badgeTypeForLabel(label) {
  if (
    label.startsWith("初") ||
    label.startsWith("累計") ||
    label.startsWith("バッジポイント") ||
    /^バッジ\d/.test(label) ||
    label.includes("日連続") ||
    label === "はじめの一歩" ||
    label.startsWith("初めて") ||
    label === "バットコレクター" ||
    label === "全バット練習" ||
    label === "ラッキー7" ||
    label === "スリーナイン" ||
    label === "七日目の覚醒"
  ) {
    return "unique";
  }
  return "repeatable";
}

function rarityForBadge(label) {
  const value = badgeValue(label);
  if (label.startsWith("バッジポイント")) {
    if (value >= 10000) return "UR";
    if (value >= 3000) return "SR";
    if (value >= 1000) return "RR";
    if (value >= 500) return "R";
    if (value >= 300) return "U";
    return "C";
  }
  if (/^バッジ\d+種類/.test(label)) {
    if (value >= 100) return "UR";
    if (value >= 75) return "SR";
    if (value >= 50) return "RR";
    if (value >= 25) return "R";
    return "U";
  }
  if (/^バッジ\d+個/.test(label)) {
    if (value >= 3000) return "UR";
    if (value >= 1000) return "SR";
    if (value >= 500) return "RR";
    if (value >= 100) return "R";
    return "U";
  }
  if (["ラッキー7", "スリーナイン", "七日目の覚醒"].includes(label) || value >= 50000 || label.includes("365日")) return "UR";
  if (["ぴったり500", "777スイング", "復活の一振り"].includes(label) || label.includes("100日") || label.includes("999")) return "UR";
  if (["大晦日の素振り", "元日の一振り"].includes(label) || label.includes("初800") || label.includes("初900") || label.includes("30日") || label.includes("毎月平均600") || label.includes("毎週平均600") || value >= 10000 || label.includes("60日") || label.includes("相棒5000")) return "SR";
  if (label.includes("毎日回数300") || label.includes("毎日回数500") || label.includes("毎日平均600") || label.includes("毎日平均700") || label.includes("毎週回数1000") || label.includes("毎週回数2000") || label.includes("毎月回数2000") || label.includes("毎月回数3000") || label.includes("毎月回数5000") || label.includes("14日")) return "RR";
  if (label.includes("毎日平均500") || label.includes("毎日回数200") || label.includes("毎日ベスト700") || label.includes("初700") || label.includes("毎週回数500") || label.includes("毎週平均500") || label.includes("毎月平均500") || label.includes("毎月平均400") || label.includes("毎月回数1000") || label.includes("7日") || value >= 3000) return "R";
  if (label.includes("毎日回数100") || label.includes("毎日平均400") || label.includes("毎日ベスト600") || label.includes("毎週回数300") || label.includes("毎週平均400") || label.includes("毎月回数500") || label.includes("毎週3日") || label.includes("毎週5日") || label.includes("毎月5日") || label.includes("3日") || label.includes("初めて")) return "U";
  return "C";
}

function rarityColorFor(rarity) {
  return RARITY_COLORS[rarity] || RARITY_COLORS.C;
}

function badgeDescriptionFor(label, type) {
  if (label === "はじめの一歩") return "初めて記録する";
  if (label.includes("ひみつ")) return "条件はひみつ";
  if (label.startsWith("バッジポイント")) return `${label.replace("バッジポイント", "")}ptまで集める`;
  if (/^バッジ\d+種類/.test(label)) return `${label.replace("バッジ", "")}集める`;
  if (/^バッジ\d+個/.test(label)) return `重複を含めて${label.replace("バッジ", "")}集める`;
  if (label.includes("平均")) return `${label}を達成`;
  if (label.includes("ベスト") || label.startsWith("初")) return `${label}を達成`;
  if (label.includes("連続")) return `${label}で練習する`;
  if (label.includes("相棒")) return `${label}を達成`;
  if (label.includes("多く振った") || label.includes("平均アップ")) return `${label}ときに獲得`;
  return `${label}を${type === "unique" ? "1回だけ獲得可" : "達成するたび獲得可"}`;
}

function makeBadgeDefinition(label, options = {}) {
  const type = options.type || badgeTypeForLabel(label);
  return {
    id: label,
    label,
    type,
    rarity: options.rarity || rarityForBadge(label),
    secret: Boolean(options.secret),
    description: options.description || badgeDescriptionFor(label, type),
  };
}

function allBadgeDefinitions() {
  const definitions = [
    ...HOME_BADGE_DEFINITIONS.map((definition) => makeBadgeDefinition(definition.label, { type: "repeatable" })),
    ...UNIQUE_BADGE_DEFINITIONS.map((definition) => makeBadgeDefinition(definition.label, { type: "unique" })),
    ...CONTEXT_START_BADGES.map((label) => makeBadgeDefinition(label, { type: "unique" })),
    ...CONTEXT_STREAK_BADGES.map((label) => makeBadgeDefinition(label, { type: "unique" })),
    ...CONTEXT_BAT_BADGES.map((label) => makeBadgeDefinition(label, { type: label.includes("コレクター") || label.includes("全バット") ? "unique" : "repeatable" })),
    ...BAT_BADGE_DEFINITIONS.map((definition) => makeBadgeDefinition(definition.label, { type: "unique", description: definition.description })),
    ...CONTEXT_GROWTH_BADGES.map((label) => makeBadgeDefinition(label, { type: "repeatable" })),
    ...CONTEXT_SECRET_BADGES.map((label) => makeBadgeDefinition(label, { type: label === "ラッキー7" || label === "スリーナイン" || label === "七日目の覚醒" ? "unique" : "repeatable", secret: true })),
    ...META_BADGE_DEFINITIONS.map((definition) => makeBadgeDefinition(definition.label, { type: "unique", description: definition.description })),
  ];
  const map = new Map();
  definitions.forEach((definition) => {
    if (!map.has(definition.label)) {
      map.set(definition.label, definition);
    }
  });
  return [...map.values()].sort((a, b) => (
    RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity) ||
    badgeSortKey(a.label)[1] - badgeSortKey(b.label)[1] ||
    badgeSortKey(a.label)[2] - badgeSortKey(b.label)[2] ||
    a.label.localeCompare(b.label, "ja")
  ));
}

function earnedCountForDefinition(definition, badgeCounts, metaStats = null) {
  if (metaStats) {
    const metaDefinition = META_BADGE_DEFINITIONS.find((item) => item.label === definition.label);
    if (metaDefinition) {
      return metaStats[metaDefinition.metric] >= metaDefinition.target ? 1 : 0;
    }
  }
  const exact = badgeCounts.get(definition.label) || 0;
  if (exact) return exact;
  if (definition.label.startsWith("相棒")) {
    return [...badgeCounts.entries()]
      .filter(([label]) => label.endsWith(definition.label))
      .reduce((sum, [, count]) => sum + count, 0);
  }
  return 0;
}

function RarityIcon({ rarity }) {
  return (
    <span className={`rarity-icon rarity-${rarity.toLowerCase()}`} aria-hidden="true">
      <svg viewBox="0 0 64 64" focusable="false">
        {rarity === "C" && (
          <>
            <circle cx="32" cy="32" r="20" fill="currentColor" fillOpacity="0.5" stroke="currentColor" strokeWidth="4" />
            <circle cx="32" cy="32" r="6" fill="currentColor" opacity="0.9" />
          </>
        )}
        {rarity === "U" && (
          <>
            <path d="M32 10 L54 32 L32 54 L10 32 Z" fill="currentColor" fillOpacity="0.5" stroke="currentColor" strokeWidth="4" strokeLinejoin="round" />
            <path d="M32 22 L42 32 L32 42 L22 32 Z" fill="currentColor" opacity="0.9" />
          </>
        )}
        {rarity === "R" && (
          <>
            <path d="M32 8 L39 24 L56 25 L43 37 L47 54 L32 45 L17 54 L21 37 L8 25 L25 24 Z" fill="currentColor" fillOpacity="0.5" stroke="currentColor" strokeWidth="4" strokeLinejoin="round" />
            <circle cx="32" cy="32" r="5" fill="currentColor" />
          </>
        )}
        {rarity === "RR" && (
          <>
            <path d="M26 9 L32 23 L47 24 L36 35 L39 50 L26 42 L13 50 L16 35 L5 24 L20 23 Z" fill="currentColor" fillOpacity="0.5" stroke="currentColor" strokeWidth="3.5" strokeLinejoin="round" />
            <path d="M42 14 L47 26 L60 27 L50 36 L53 50 L42 43 L31 50 L34 36 L24 27 L37 26 Z" fill="currentColor" fillOpacity="0.5" stroke="currentColor" strokeWidth="3.5" strokeLinejoin="round" opacity="0.82" />
            <path d="M32 20 L36 30 L47 31 L39 38 L41 49 L32 43 L23 49 L25 38 L17 31 L28 30 Z" fill="currentColor" opacity="0.28" />
          </>
        )}
        {rarity === "SR" && (
          <>
            <path d="M32 6 L37 22 L54 15 L46 31 L60 40 L43 42 L45 59 L32 48 L19 59 L21 42 L4 40 L18 31 L10 15 L27 22 Z" fill="currentColor" fillOpacity="0.5" stroke="currentColor" strokeWidth="3.7" strokeLinejoin="round" />
            <circle cx="32" cy="32" r="19" fill="currentColor" fillOpacity="0.5" stroke="currentColor" strokeWidth="2" opacity="0.35" />
            <path d="M32 19 L35 29 L45 29 L37 35 L40 45 L32 39 L24 45 L27 35 L19 29 L29 29 Z" fill="currentColor" opacity="0.85" />
          </>
        )}
        {rarity === "UR" && (
          <>
            <circle cx="32" cy="32" r="24" fill="currentColor" fillOpacity="0.5" stroke="currentColor" strokeWidth="3" />
            <path d="M32 5 L36 20 L48 10 L43 25 L59 24 L45 33 L57 44 L41 41 L42 58 L32 45 L22 58 L23 41 L7 44 L19 33 L5 24 L21 25 L16 10 L28 20 Z" fill="currentColor" fillOpacity="0.5" stroke="currentColor" strokeWidth="3.4" strokeLinejoin="round" />
            <circle cx="32" cy="32" r="8" fill="currentColor" opacity="0.25" />
            <circle cx="32" cy="32" r="3.5" fill="currentColor" />
          </>
        )}
      </svg>
    </span>
  );
}

function BadgeDetailPopover({ badge, onClose }) {
  const closePopover = (event) => {
    event.preventDefault();
    event.stopPropagation();
    onClose();
  };
  return createPortal(
    <div className="collection-popover-backdrop" onClick={closePopover}>
      <aside
        className={`collection-popover rarity-${badge.rarity.toLowerCase()}`}
        role="dialog"
        aria-modal="true"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="collection-popover-head">
          <RarityIcon rarity={badge.rarity} />
          <div>
            <strong>{badge.lockedSecret ? "???" : badge.label}</strong>
            <span>{badge.rarity} / {RARITY_LABELS[badge.rarity]}</span>
          </div>
          <button
            type="button"
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
        </div>
        <p>{badge.lockedSecret ? "ひみつ" : badge.description}</p>
        <small>
          {badge.type === "unique" ? "達成時に1回だけ獲得可" : "達成したら何回でも獲得可"}
          {" / "}
          {badge.earnedCount > 0 ? (
            <span className="earned-count">獲得 {badge.earnedCount}回</span>
          ) : (
            "未取得"
          )}
        </small>
      </aside>
    </div>,
    document.body
  );
}

function BadgeChip({ label, count = 1, description = null, lockedSecret = false }) {
  const [selectedBadge, setSelectedBadge] = useState(null);
  const canonicalLabel = canonicalBadgeLabel(label);
  const definition = makeBadgeDefinition(canonicalLabel, description ? { description } : {});
  return (
    <>
      <span className="badge-chip-wrap">
        <button
          className={`badge collection-badge rarity-${definition.rarity.toLowerCase()}`}
          type="button"
          onClick={() => setSelectedBadge({ ...definition, earnedCount: count, lockedSecret: false })}
        >
          <RarityIcon rarity={definition.rarity} />
          {lockedSecret ? "???" : definition.label}
        </button>
        <b>{count > 1 ? `x${count}` : ""}</b>
      </span>
      {selectedBadge && (
        <BadgeDetailPopover badge={{ ...selectedBadge, lockedSecret }} onClose={() => setSelectedBadge(null)} />
      )}
    </>
  );
}

function BadgeCollectionView({ allForName }) {
  const [selectedBadge, setSelectedBadge] = useState(null);
  const [selectedRarity, setSelectedRarity] = useState(RARITY_ORDER[0]);
  const badgeCounts = useMemo(() => new Map(collectBadgeCounts(allForName, RANGE_ALL)), [allForName]);
  const definitions = useMemo(() => allBadgeDefinitions(), []);
  const baseDefinitions = definitions.filter((definition) => !META_BADGE_DEFINITIONS.some((item) => item.label === definition.label));
  const basePointTotal = baseDefinitions.reduce((sum, definition) => {
    const earnedCount = earnedCountForDefinition(definition, badgeCounts);
    return sum + (earnedCount * RARITY_POINTS[definition.rarity]);
  }, 0);
  const baseEarnedTotal = baseDefinitions.reduce((sum, definition) => (
    sum + Math.min(1, earnedCountForDefinition(definition, badgeCounts))
  ), 0);
  const baseEarnedInstanceTotal = baseDefinitions.reduce((sum, definition) => (
    sum + earnedCountForDefinition(definition, badgeCounts)
  ), 0);
  const metaStats = {
    points: basePointTotal,
    types: baseEarnedTotal,
    instances: baseEarnedInstanceTotal,
  };
  const badgePointTotal = definitions.reduce((sum, definition) => {
    const earnedCount = earnedCountForDefinition(definition, badgeCounts, metaStats);
    return sum + (earnedCount * RARITY_POINTS[definition.rarity]);
  }, 0);
  const earnedTotal = definitions.reduce((sum, definition) => (
    sum + Math.min(1, earnedCountForDefinition(definition, badgeCounts, metaStats))
  ), 0);
  const earnedInstanceTotal = definitions.reduce((sum, definition) => (
    sum + earnedCountForDefinition(definition, badgeCounts, metaStats)
  ), 0);
  const badgePointTargets = META_BADGE_DEFINITIONS.filter((definition) => definition.metric === "points");
  const badgeTypeTargets = META_BADGE_DEFINITIONS.filter((definition) => definition.metric === "types");
  const raritySummaries = RARITY_ORDER.map((rarity) => {
    const items = definitions.filter((definition) => definition.rarity === rarity);
    const earnedTotal = items.reduce((sum, definition) => sum + Math.min(1, earnedCountForDefinition(definition, badgeCounts, metaStats)), 0);
    const pointTotal = items.reduce((sum, definition) => (
      sum + (earnedCountForDefinition(definition, badgeCounts, metaStats) * RARITY_POINTS[rarity])
    ), 0);
    return { rarity, items, earnedTotal, pointTotal };
  }).filter((summary) => summary.items.length);
  const activeRaritySummary = raritySummaries.find((summary) => summary.rarity === selectedRarity) || raritySummaries[0];
  return (
    <section className="badge-collection">
      <div className="badge-point-card">
        <div>
          <p>バッジポイント</p>
          <strong>{badgePointTotal.toLocaleString("ja-JP")}</strong>
          <span className="badge-point-meta"><b>{earnedTotal}</b>/{definitions.length} 種類</span>
          <span className="badge-point-meta"><b>{earnedInstanceTotal.toLocaleString("ja-JP")}</b>個</span>
        </div>
        <div className="badge-point-meters" aria-label="次に狙うバッジ">
          <ProgressMeter kind="badge-points" value={basePointTotal} range={RANGE_TOTAL} targets={badgePointTargets} showBadgeIcon={false} />
          <ProgressMeter kind="badge-types" value={baseEarnedTotal} range={RANGE_TOTAL} targets={badgeTypeTargets} showBadgeIcon={false} />
        </div>
      </div>
      <section className="collection-main-card">
        <div className="collection-card-heading">
          <p>コレクション</p>
        </div>
        <RarityBadgePreview
          summaries={raritySummaries}
          activeRarity={activeRaritySummary?.rarity}
          onSelect={setSelectedRarity}
        />
        <div className="collection-groups">
          {activeRaritySummary && (() => {
            const { rarity, items, earnedTotal: rarityEarnedTotal, pointTotal: rarityPointTotal } = activeRaritySummary;
            return (
              <section className={`collection-group rarity-${rarity.toLowerCase()}`} key={rarity}>
                <div className="collection-group-title">
                  <RarityIcon rarity={rarity} />
                  <div>
                    <h3>
                      <span className="collection-rarity-initial">{RARITY_LABELS[rarity].charAt(0)}</span>
                      {RARITY_LABELS[rarity].slice(1)} / {RARITY_POINTS[rarity]}pt
                    </h3>
                  </div>
                  <strong>{rarityEarnedTotal}/{items.length}<span>{rarityPointTotal}pt</span></strong>
                </div>
                <div className="collection-grid">
                  {items.map((definition) => {
                    const earnedCount = earnedCountForDefinition(definition, badgeCounts, metaStats);
                    const lockedSecret = definition.secret && earnedCount === 0;
                    return (
                      <div
                        className={`collection-card ${earnedCount ? "earned" : "locked"} ${definition.secret ? "secret" : ""}`}
                        key={definition.label}
                      >
                        <BadgeChip label={definition.label} count={earnedCount} description={definition.description} lockedSecret={lockedSecret} />
                        <span>{definition.type === "unique" ? "1回だけ" : "何回でも"}</span>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })()}
        </div>
      </section>
      {selectedBadge && (
        <BadgeDetailPopover badge={selectedBadge} onClose={() => setSelectedBadge(null)} />
      )}
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
        { key: "count", label: "回数", badges: countBadges },
        { key: "score", label: "スコア", badges: scoreBadges },
      ],
    };
  });
}

function RecordView({ db, allForName }) {
  const [activeTab, setActiveTab] = useState(RANGE_WEEK);
  const tabs = [
    [RANGE_WEEK, "今週の記録"],
    [RANGE_MONTH, "今月の記録"],
  ];

  return (
    <div className="challenge-view">
      <div className="challenge-tabs" role="tablist" aria-label="記録期間">
        {tabs.map(([key, label]) => (
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === key}
            className={activeTab === key ? "selected" : ""}
            onClick={() => setActiveTab(key)}
            key={key}
          >
            {label}
          </button>
        ))}
      </div>
      {activeTab === RANGE_WEEK && <ChallengePeriodPanel db={db} records={allForName} range={RANGE_WEEK} />}
      {activeTab === RANGE_MONTH && <ChallengePeriodPanel db={db} records={allForName} range={RANGE_MONTH} />}
    </div>
  );
}

function ChallengePeriodPanel({ db, records, range }) {
  const { start, end, label } = rangeWindow(range);
  const titlePrefix = range === RANGE_WEEK ? "今週" : "今月";
  const periodRecords = records.filter((record) => record.date >= toISO(start) && record.date <= toISO(end));
  const dailyMap = new Map(aggregate(periodRecords).map((day) => [day.date, day]));
  const summary = periodSummaryFromDaily(dailyMap, start, end);
  const badgeCounts = collectBadgeCounts(records, range);

  return (
    <section className="home-section home-result-section challenge-period-panel all-record-panel">
      <div className="challenge-heading">
        <p>{label}</p>
      </div>
      <DailyResultCards summary={summary} showBadges range={range} includeDays />
      <EarnedBadgesCard badgeCounts={badgeCounts} title={`${titlePrefix}の獲得バッジ`} />
    </section>
  );
}

function ChallengeAllPanel({ db, records }) {
  const [graphBat, setGraphBat] = useState(ALL);
  const [graphRange, setGraphRange] = useState(RANGE_TODAY);
  const summary = summarizeRecords(records);
  const byBat = aggregateByBat(records);
  const graphRecords = records.filter((record) => graphBat === ALL || record.bat === graphBat);
  const graphDaily = aggregate(graphRecords);
  const graphColor = graphBat === ALL ? null : batColorFor(db, graphBat);

  return (
    <section className="home-section home-result-section challenge-period-panel">
      <div className="challenge-heading">
        <p>これまでの累計</p>
      </div>
      <DailyResultCards summary={summary} showBadges range={RANGE_TOTAL} includeDays />
      <div className="home-subheading">使ったバット</div>
      <div className="home-bat-records challenge-bat-records">
        {byBat.length ? byBat.map((item) => (
          <RecordSummary key={item.bat} item={item} batColor={batColorFor(db, item.bat)} />
        )) : <p className="empty compact-empty">バット別記録はまだありません。</p>}
      </div>
      <AllRecordGraphs
        db={db}
        daily={graphDaily}
        graphBat={graphBat}
        setGraphBat={setGraphBat}
        graphRange={graphRange}
        setGraphRange={setGraphRange}
        graphColor={graphColor}
      />
    </section>
  );
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

function graphBucketsForRange(daily, range) {
  if (range === RANGE_ALL) return filledChartExtent(daily);
  return [...comparisonBuckets(daily, range)].reverse();
}

function graphRangeLabel(range) {
  if (range === RANGE_TODAY) return "今日";
  if (range === RANGE_WEEK) return "今週";
  if (range === RANGE_MONTH) return "今月";
  return "全て";
}

function AllRecordGraphs({ db, daily, graphBat, setGraphBat, graphRange, setGraphRange, graphColor }) {
  const buckets = graphBucketsForRange(daily, graphRange);
  const chartData = buckets.map((bucket) => ({
    ...bucket,
    date: bucket.date || bucket.label,
    label: bucket.label,
    isToday: bucket.label === "今日",
  }));
  const label = graphRangeLabel(graphRange);
  const controls = (
    <GraphControls
      db={db}
      graphBat={graphBat}
      setGraphBat={setGraphBat}
      graphRange={graphRange}
      setGraphRange={setGraphRange}
    />
  );

  return (
    <div className="period-graphs all-record-graphs" style={graphColor ? { "--graph-color": graphColor } : undefined}>
      {controls}
      <section className="dashboard-section record-section graph-card">
        <div className="section-row tight graph-title-row">
          <div>
            <h2>{label}のスイング数</h2>
          </div>
        </div>
        <CountBars buckets={buckets} />
      </section>
      <section className="dashboard-section record-section graph-card">
        <div className="section-row tight graph-title-row">
          <div>
            <h2>{label}のスコア</h2>
          </div>
        </div>
        <Chart data={chartData} initialRange={Math.min(chartData.length, graphRange === RANGE_ALL ? kMaxChartVisibleDays : 31)} />
      </section>
    </div>
  );
}

function GraphControls({ db, graphBat, setGraphBat, graphRange, setGraphRange }) {
  const selectedColor = graphBat === ALL ? "var(--hot)" : batColorFor(db, graphBat);
  const ranges = [
    [RANGE_TODAY, "今日"],
    [RANGE_WEEK, "今週"],
    [RANGE_MONTH, "今月"],
  ];

  return (
    <div className="graph-shared-controls">
      <label className={`bat-field graph-bat-filter home-bat-filter ${graphBat === ALL ? "all-selected" : ""}`} style={{ "--bat-filter-color": selectedColor }}>
        <span className="select-shell">
          <span className="select-leading bat-select-leading" aria-hidden="true"><span className="bat-color-icon" /></span>
          <select value={graphBat} onChange={(event) => setGraphBat(event.target.value)} aria-label="グラフのバット">
            <option value={ALL}>全てのバット</option>
            {db.bats.map((bat) => <option value={bat} key={bat}>{bat}</option>)}
          </select>
          <span className="select-caret" aria-hidden="true"><Icon type="chevronDown" /></span>
        </span>
      </label>
      <div className="range-field graph-range-field">
        <div className="segmented graph-range-tabs" role="tablist" aria-label="グラフ期間">
          {ranges.map(([key, label]) => (
            <button
              type="button"
              role="tab"
              aria-selected={graphRange === key}
              className={graphRange === key ? "selected" : ""}
              onClick={() => setGraphRange(key)}
              key={key}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function SwingForm({ bats, defaultBat, onSubmit, submitLabel, defaultValues = null, batColors = null }) {
  const selectedBat = bats.includes(defaultBat) ? defaultBat : bats[0] || "";
  const selectedBatColor = normalizeHexColor(batColors?.[selectedBat], fallbackBatColor(selectedBat, Math.max(0, bats.indexOf(selectedBat))));
  return (
    <form className="input-grid swing-form" onSubmit={onSubmit} style={{ "--selected-bat-color": selectedBatColor }}>
      <label className="field-label bat-input-label"><span className="field-title"><span className="icon"><BatIcon color="var(--selected-bat-color, var(--hot))" /></span><span className="visually-hidden">バット</span></span><span className="bat-input-shell"><span className="icon bat-card-icon" aria-hidden="true"><BatIcon color="var(--selected-bat-color, var(--hot))" /></span><select key={selectedBat} name="bat" required defaultValue={selectedBat} aria-label="バット">{bats.map((bat) => <option key={bat}>{bat}</option>)}</select><span className="home-bat-select-caret" aria-hidden="true"><Icon type="chevronDown" /></span></span></label>
      <label className="field-label"><span className="field-title"><Icon type="count" />回数</span><input name="count" type="number" inputMode="numeric" min="1" max="999" step="1" required defaultValue={defaultValues?.count ?? ""} aria-label="回数" /></label>
      <label className="field-label"><span className="field-title"><Icon type="avg" />平均</span><input name="avg" type="number" inputMode="numeric" min="0" max="999" step="1" required defaultValue={defaultValues?.avg ?? ""} aria-label="平均" /></label>
      <label className="field-label"><span className="field-title"><Icon type="best" />ベスト</span><input name="best" type="number" inputMode="numeric" min="0" max="999" step="1" required defaultValue={defaultValues?.best ?? ""} aria-label="ベスト" /></label>
      <button className="primary wide swing-form-heading" type="submit" aria-label={submitLabel}>結果入力</button>
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
        <span><b>回数</b>{item.count}<small>回</small></span>
        <span><b>平均</b>{item.avg}<small>点</small></span>
        <span><b>ベスト</b>{item.best}<small>点</small></span>
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
        <span className="icon bat-card-icon" style={{ "--bat-icon-color": color }}><BatIcon color={color} /></span>
        <strong>{item.bat}</strong>
      </div>
      <div className="mini-grid">
        <span><b>回数</b>{item.count}<small>回</small></span>
        <span><b>平均</b>{item.avg}<small>点</small></span>
        <span><b>ベスト</b>{item.best}<small>点</small></span>
      </div>
    </article>
  );
}

function SettingsView({ db, currentName, setDb, addName, addBat, exportCsv, importCsv, loadAnimationTestDb, setPendingDelete }) {
  const [openBatPalette, setOpenBatPalette] = useState(null);
  const [palettePosition, setPalettePosition] = useState(null);
  const hasNames = db.names.length > 0;
  const nameColorEntries = db.names.map((name) => [name, nameColorFor(db, name)]);
  const batColorEntries = db.bats.map((bat) => [bat, batColorFor(db, bat)]);
  const usedNameColors = new Set(nameColorEntries.map(([, color]) => color));
  const usedBatColors = new Set(batColorEntries.map(([, color]) => color));
  useEffect(() => {
    if (!openBatPalette) return undefined;
    const closeOnOutsideTap = (event) => {
      if (event.target.closest?.(".bat-color-menu, .name-color-menu")) return;
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
    setDb({
      ...db,
      nameColors: {
        ...normalizeNameColors(db.nameColors, db.names, db.theme),
        [name]: normalizeHexColor(color, nameColorFor(db, name)),
      },
      theme: currentName === name ? normalizeHexColor(color, nameColorFor(db, name)) : db.theme,
    });
    setOpenBatPalette(null);
    setPalettePosition(null);
  };

  const updateBatColor = (bat, color) => {
    setDb({
      ...db,
      batColors: {
        ...normalizeBatColors(db.batColors, db.bats),
        [bat]: normalizeHexColor(color, batColorFor(db, bat)),
      },
    });
    setOpenBatPalette(null);
    setPalettePosition(null);
  };

  return (
    <div className="settings-view">
      <section className={`panel ${String(openBatPalette).startsWith("name:") ? "palette-panel-open" : ""}`}>
        <div className="section-row">
          <h2>名前</h2>
          <p>使う人とテーマカラー</p>
        </div>
        <form className="add-row" onSubmit={addName}>
          <input name="name" type="text" autoComplete="off" placeholder="名前を追加" />
          <button type="submit" className="primary"><ButtonIcon type="plus" /></button>
        </form>
        {!hasNames && <p className="settings-error">最初に名前を登録してください。</p>}
        <div className="chip-list">
          {db.names.map((name) => (
            <span
              key={name}
              className={`chip name-settings-chip ${name === currentName ? "active" : ""} ${openBatPalette === `name:${name}` ? "palette-open" : ""}`}
              style={{ "--name-chip-color": nameColorFor(db, name) }}
            >
              <button type="button" onClick={() => setDb({ ...db, activeName: name })}>
                {name}{name === currentName ? <small>選択中</small> : null}
              </button>
              <span className="name-color-menu">
                <button
                  type="button"
                  className="name-color-trigger"
                  aria-label={`${name}のテーマカラーを選ぶ`}
                  aria-expanded={openBatPalette === `name:${name}`}
                  onClick={(event) => togglePalette(`name:${name}`, event)}
                />
                {openBatPalette === `name:${name}` && (
                  <span
                    className="bat-color-palette"
                    style={palettePosition ? { "--palette-left": `${palettePosition.left}px`, "--palette-top": `${palettePosition.top}px` } : undefined}
                    role="listbox"
                    aria-label={`${name}のテーマカラー`}
                  >
                    {BAT_COLOR_PALETTE.map((color) => {
                      const normalizedColor = normalizeHexColor(color);
                      const currentColor = nameColorFor(db, name);
                      const usedElsewhere = usedBatColors.has(normalizedColor) || nameColorEntries.some(([otherName, otherColor]) => otherName !== name && otherColor === normalizedColor);
                      const disabled = usedElsewhere && normalizedColor !== currentColor;
                      return (
                        <button
                          type="button"
                          className={normalizedColor === currentColor ? "selected" : ""}
                          style={{ "--swatch-color": normalizedColor }}
                          aria-label={`${name}を${normalizedColor}にする`}
                          aria-pressed={normalizedColor === currentColor}
                          disabled={disabled}
                          onClick={() => updateNameColor(name, normalizedColor)}
                          key={normalizedColor}
                        />
                      );
                    })}
                  </span>
                )}
              </span>
              <button type="button" className="chip-delete" aria-label={`${name}を削除`} onClick={() => setPendingDelete({ type: "name", value: name })}><SvgIcon type="trash" /></button>
            </span>
          ))}
        </div>
      </section>

      <section className={`panel ${db.bats.includes(openBatPalette) ? "palette-panel-open" : ""}`}>
        <fieldset className="settings-fieldset" disabled={!hasNames}>
        <div className="section-row">
          <h2>バット</h2>
          <p>全員で共有 / 入力時の初期値</p>
        </div>
        <form className="add-row" onSubmit={addBat}>
          <input name="bat" type="text" autoComplete="off" placeholder="例: 赤バット" />
          <button type="submit" className="primary"><ButtonIcon type="plus" /></button>
        </form>
        <div className="chip-list">
          {db.bats.map((bat) => (
            <span
              key={bat}
              className={`chip bat-settings-chip ${bat === db.defaultBat ? "active default" : ""} ${openBatPalette === bat ? "palette-open" : ""}`}
              style={{ "--bat-chip-color": batColorFor(db, bat) }}
            >
              <button type="button" onClick={() => setDb({ ...db, defaultBat: bat })}>
                <BatIcon color={batColorFor(db, bat)} />
                <span>{bat}{bat === db.defaultBat ? <small>デフォルト</small> : null}</span>
              </button>
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
                      const currentColor = batColorFor(db, bat);
                      const usedElsewhere = usedNameColors.has(normalizedColor) || batColorEntries.some(([otherBat, otherColor]) => otherBat !== bat && otherColor === normalizedColor);
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
              <button type="button" className="chip-delete" aria-label={`${bat}を削除`} onClick={() => setPendingDelete({ type: "bat", value: bat })}><SvgIcon type="trash" /></button>
            </span>
          ))}
        </div>
        </fieldset>
      </section>

      <section className="panel">
        <div className="section-row">
          <h2>フォント</h2>
          <p>アプリ全体の雰囲気</p>
        </div>
        <div className="font-option-grid">
          {FONT_THEMES.map(([key, label]) => (
            <button
              type="button"
              className={`font-option font-${key} ${fontThemeKey(db.fontTheme) === key ? "selected" : ""}`}
              onClick={() => setDb({ ...db, fontTheme: key })}
              key={key}
            >
              <strong>SWING LOG</strong>
              <span>{label}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="section-row">
          <h2>データ管理</h2>
          <p>この端末に保存</p>
        </div>
        <div className="tool-grid">
          <button type="button" className="ghost" onClick={exportCsv}><ButtonIcon type="download" />CSV出力</button>
          <label className="file-control ghost"><ButtonIcon type="upload" />CSV読込<input type="file" accept=".csv,text/csv" onChange={importCsv} /></label>
        </div>
        <button type="button" className="ghost wide" onClick={loadAnimationTestDb}>演出テスト用データを作成</button>
        <button type="button" className="ghost wide" onClick={() => setDb(demoDb())}>デモデータを作成</button>
        <button type="button" className="danger wide" onClick={() => setPendingDelete({ type: "all", value: "全データ" })}>全データ削除</button>
      </section>
    </div>
  );
}

function BottomNav({ tab, setTab }) {
  const tabs = [
    ["home", "home", "ホーム"],
    ["record", "challenge", "チャレンジ"],
    ["badges", "collection", "バッジ"],
    ["allRecords", "log", "記録"],
    ["settings", "settings", "設定"],
  ];
  return (
    <nav className="bottom-nav" aria-label="画面切り替え">
      {tabs.map(([key, icon, label]) => (
        <button key={key} type="button" className={tab === key ? "active" : ""} onClick={() => setTab(key)} aria-label={key}>
          <SvgIcon type={icon} />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}

function DeleteDialog({ pending, onCancel, onConfirm }) {
  const label = pending.type === "name" ? "名前" : pending.type === "bat" ? "バット" : "データ";
  return (
    <div className="dialog-backdrop" role="dialog" aria-modal="true">
      <div className="dialog">
        <h2>削除しますか？</h2>
        <p>{label}「{pending.value}」と関連する記録データを削除します。</p>
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

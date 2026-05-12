import { useEffect, useMemo, useRef, useState } from "react";

const STORAGE_KEY = "dream1-swing-tracker-v1";
const ALL = "__all__";
const RANGE_ALL = "all";
const RANGE_TODAY = "today";
const RANGE_WEEK = "week";
const RANGE_MONTH = "month";
const RANGE_TOTAL = "total";
const kMinChartVisibleDays = 7;
const kMaxChartVisibleDays = 365;
const UNIQUE_TOTAL_COUNT_TARGETS = [100, 500, 1000, 3000, 5000, 10000, 30000, 50000, 100000];
const UNIQUE_BEST_TARGETS = [500, 600, 700, 800, 900, 999];
const UNIQUE_STREAK_TARGETS = [2, 3, 7, 14, 30, 60, 100, 365];
const BADGE_PERIODS = [
  ["daily", "毎日バッジ"],
  ["weekly", "毎週バッジ"],
  ["monthly", "毎月バッジ"],
  ["total", "累計バッジ"],
];
const HOME_BADGE_DEFINITIONS = [
  ...[50, 100, 200, 300, 500].map((target) => ({ period: RANGE_TODAY, group: "daily", metric: "count", target, label: `今日${target}回` })),
  ...[300, 400, 500, 600, 700].map((target) => ({ period: RANGE_TODAY, group: "daily", metric: "avg", target, label: `日平均${target}` })),
  ...[500, 600, 700, 800, 900].map((target) => ({ period: RANGE_TODAY, group: "daily", metric: "best", target, label: `今日ベスト${target}` })),
  ...[2, 3, 7, 14, 30, 60, 100, 365].map((target) => ({ period: RANGE_TODAY, group: "daily", metric: "streak", target, label: `${target}日連続練習`, trigger: "exact" })),
  ...[300, 500, 1000, 2000].map((target) => ({ period: RANGE_WEEK, group: "weekly", metric: "count", target, label: `今週${target}回` })),
  ...[300, 400, 500, 600].map((target) => ({ period: RANGE_WEEK, group: "weekly", metric: "avg", target, label: `週平均${target}` })),
  ...[[3, "今週3日練習"], [5, "今週5日練習"], [7, "今週皆勤"]].map(([target, label]) => ({ period: RANGE_WEEK, group: "weekly", metric: "days", target, label })),
  ...[500, 1000, 2000, 3000, 5000].map((target) => ({ period: RANGE_MONTH, group: "monthly", metric: "count", target, label: `月間${target}回` })),
  ...[300, 400, 500, 600].map((target) => ({ period: RANGE_MONTH, group: "monthly", metric: "avg", target, label: `月平均${target}` })),
  ...[[5, "今月5日練習"], [10, "今月10日練習"], [20, "今月20日練習"], ["all", "今月毎日練習"]].map(([target, label]) => ({ period: RANGE_MONTH, group: "monthly", metric: "days", target, label })),
];
const UNIQUE_BADGE_DEFINITIONS = [
  ...UNIQUE_TOTAL_COUNT_TARGETS.map((target) => ({ metric: "count", target, label: `累計${target}回` })),
  ...UNIQUE_BEST_TARGETS.map((target) => ({ metric: "best", target, label: `初${target}点` })),
];

const defaultDb = {
  activeName: "遥太",
  names: ["遥太"],
  bats: ["赤バット", "黒バット"],
  defaultBat: "赤バット",
  theme: "red",
  records: [],
};

function SvgIcon({ type }) {
  const props = { viewBox: "0 0 24 24", "aria-hidden": "true" };
  if (type === "home") return <svg {...props}><path d="M4 11.5 12 5l8 6.5" /><path d="M6.5 10.5V20h11v-9.5" /><path d="M9.5 20v-5h5v5" /></svg>;
  if (type === "log") return <svg {...props}><rect x="4" y="5" width="16" height="15" rx="3" /><path d="M8 3v4M16 3v4M4 10h16" /></svg>;
  if (type === "settings") return <svg {...props}><circle cx="12" cy="12" r="3.2" /><path d="M19 12a7 7 0 0 0-.1-1l2-1.6-2-3.4-2.4 1a7 7 0 0 0-1.8-1L14.4 3h-4.8l-.3 3a7 7 0 0 0-1.8 1l-2.4-1-2 3.4 2 1.6A7 7 0 0 0 5 12a7 7 0 0 0 .1 1l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 1.8 1l.3 3h4.8l.3-3a7 7 0 0 0 1.8-1l2.4 1 2-3.4-2-1.6c.1-.3.1-.7.1-1Z" /></svg>;
  if (type === "person") return <svg {...props}><circle cx="12" cy="7.4" r="3.4" /><path d="M5 21c.8-4.6 3.2-7 7-7s6.2 2.4 7 7" /></svg>;
  if (type === "count") return <svg {...props}><path d="M4 7h16M4 12h16M4 17h10" /></svg>;
  if (type === "avg") return <svg {...props}><path d="M4 17 9 12l4 4 7-9" /><path d="M16 7h4v4" /></svg>;
  if (type === "best") return <svg {...props}><path d="M12 3 9.5 8.5 4 9l4.2 3.8L7 18.5l5-3 5 3-1.2-5.7L20 9l-5.5-.5L12 3Z" /></svg>;
  if (type === "bat") return <img className="bat-image-icon" src="./images/bat-icon.svg?v=2" alt="" aria-hidden="true" />;
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

function rangeWindow(range, baseDate = parseISO(todayISO())) {
  if (range === RANGE_WEEK) {
    const start = startOfWeek(baseDate);
    return { start, end: endOfWeek(baseDate), title: "今週の実績", label: `${formatRangeDate(start)}-${formatRangeDate(endOfWeek(baseDate))}` };
  }
  if (range === RANGE_MONTH) {
    const start = startOfMonth(baseDate);
    return { start, end: endOfMonth(baseDate), title: "今月の実績", label: `${formatRangeDate(start)}-${formatRangeDate(endOfMonth(baseDate))}` };
  }
  return { start: baseDate, end: baseDate, title: "今日の実績", label: formatRangeDate(baseDate) };
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
    return {
      activeName: parsed.activeName || parsed.names?.[0] || "",
      names: Array.isArray(parsed.names) ? parsed.names : [],
      bats: Array.isArray(parsed.bats) ? parsed.bats : [],
      defaultBat: parsed.bats?.includes(parsed.defaultBat) ? parsed.defaultBat : parsed.bats?.[0] || "",
      theme: ["red", "blue", "green"].includes(parsed.theme) ? parsed.theme : "red",
      records: Array.isArray(parsed.records) ? parsed.records : [],
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
  let cumulativeCount = 0;
  let cumulativeBest = 0;

  daily.forEach((day) => {
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
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = points[Math.max(0, index - 1)];
    const p1 = points[index];
    const p2 = points[index + 1];
    const p3 = points[Math.min(points.length - 1, index + 2)];
    path += ` C ${p1.x + (p2.x - p0.x) / 6} ${p1.y + (p2.y - p0.y) / 6}, ${p2.x - (p3.x - p1.x) / 6} ${p2.y - (p3.y - p1.y) / 6}, ${p2.x} ${p2.y}`;
  }
  return path;
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
  const minBuckets = range === RANGE_WEEK ? 5 : range === RANGE_MONTH ? 6 : 7;
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
      avg: avgDays ? Math.round(avgTotal / avgDays) : 0,
      best,
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
    ? targets.map((target) => ({ target, progressTarget: target, label: `${target}` }))
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
  };
}

function ProgressMeter({ kind, value, range, variableTarget, targets }) {
  const info = progressInfo(kind, Number(value || 0), range, variableTarget, targets);
  const span = Math.max(1, info.goal - info.previous);
  const ratio = clamp((Number(value || 0) - info.previous) / span, 0, 1);
  const circumference = 169.65;
  const dashOffset = circumference * (1 - ratio);
  return (
    <div className={`progress-meter ${kind}`}>
      <div className="meter-ring">
        <svg viewBox="0 0 72 72" aria-hidden="true">
          <circle className="meter-track" cx="36" cy="36" r="27" />
          <circle
            className="meter-glow meter-glow-wide"
            cx="36"
            cy="36"
            r="27"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            transform="rotate(-90 36 36)"
          />
          <circle
            className="meter-glow meter-glow-core"
            cx="36"
            cy="36"
            r="27"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            transform="rotate(-90 36 36)"
          />
          <circle
            className="meter-value"
            cx="36"
            cy="36"
            r="27"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            transform="rotate(-90 36 36)"
          />
        </svg>
        <span>-{info.remaining.toLocaleString("ja-JP")}</span>
      </div>
    </div>
  );
}

function AchievementMetric({ icon, label, value, unit, kind, range, showMeter = true, variableTarget = null, targets = null }) {
  return (
    <div className={`achievement-metric ${kind}`}>
      <div>
        <div className="metric-label"><Icon type={icon} />{label}</div>
        <strong>{Number(value || 0).toLocaleString("ja-JP")}<span>{unit}</span></strong>
      </div>
      {showMeter && <ProgressMeter kind={kind} value={value} range={range} variableTarget={variableTarget} targets={targets} />}
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

function RecordPanel({ daily, range }) {
  const [mode, setMode] = useState("count");
  const buckets = useMemo(() => comparisonBuckets(daily, range), [daily, range]);
  const visibleBuckets = useMemo(() => [...buckets].reverse(), [buckets]);
  const visibleRange = range === RANGE_WEEK ? 5 : range === RANGE_MONTH ? 6 : 7;
  const scoreData = useMemo(() => visibleBuckets.map((bucket) => ({
    date: bucket.label,
    label: bucket.label,
    count: bucket.count,
    avg: bucket.avg,
    best: bucket.best,
  })), [visibleBuckets]);

  return (
    <section className="dashboard-section record-section">
      <div className="section-row tight">
        <div className="record-tabs" role="tablist" aria-label="記録表示">
          <button type="button" className={mode === "count" ? "selected" : ""} onClick={() => setMode("count")}>回数</button>
          <button type="button" className={mode === "score" ? "selected" : ""} onClick={() => setMode("score")}>スコア</button>
        </div>
      </div>
      {visibleBuckets.length ? (
        mode === "count"
          ? <CountBars buckets={visibleBuckets} />
          : <Chart data={scoreData} initialRange={Math.min(scoreData.length, visibleRange)} />
      ) : <p className="empty compact-empty">記録がありません。</p>}
    </section>
  );
}

function CountBars({ buckets }) {
  const scrollRef = useRef(null);
  const max = Math.max(1, ...buckets.map((bucket) => bucket.count));

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }
  }, [buckets.length, buckets[0]?.label, buckets.at(-1)?.label]);

  return (
    <div className="record-scroll" ref={scrollRef}>
      <div className="count-bars">
        {buckets.map((bucket) => {
          const height = bucket.count > 0 ? Math.max(10, (bucket.count / max) * 100) : 0;
          return (
            <article className="bar-item" key={bucket.label}>
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
  const [chartWidth, setChartWidth] = useState(360);
  const wrapRef = useRef(null);
  const svgRef = useRef(null);
  const pointersRef = useRef(new Map());
  const gestureRef = useRef(null);
  const width = chartWidth;
  const height = 250;
  const pad = { left: 42, right: 18, top: 22, bottom: 42 };
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
      setChartWidth(Math.max(360, Math.round(node.getBoundingClientRect().width)));
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
    setView(initialChartView(data.length, initialRange, plotW));
  }, [data.length, data[0]?.date, data.at(-1)?.date, initialRange, plotW]);

  useEffect(() => {
    const clearHover = () => setHovered(null);
    window.addEventListener("scroll", clearHover, { passive: true });
    window.addEventListener("resize", clearHover);
    return () => {
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
  const tooltipLeft = hovered ? `${(clamp(hovered.x + 10, 8, width - 156) / width) * 100}%` : "0%";
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
            <stop offset="0%" stopColor="currentColor" stopOpacity=".25" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
          <clipPath id="chartPlotClip">
            <rect x={pad.left} y={pad.top} width={plotW} height={plotH} />
          </clipPath>
        </defs>
        {yLabels.map((tick) => (
          <g key={tick.value}>
            <line x1={pad.left} y1={tick.y} x2={width - pad.right} y2={tick.y} className="grid-line" />
            <text x={pad.left - 9} y={tick.y + 3} textAnchor="end" className="chart-axis-label">{tick.value}</text>
          </g>
        ))}
        <line x1={pad.left} y1={pad.top} x2={pad.left} y2={height - pad.bottom} className="axis-line" />
        <line x1={pad.left} y1={height - pad.bottom} x2={width - pad.right} y2={height - pad.bottom} className="axis-line" />
        <g clipPath="url(#chartPlotClip)">
          {data.map((item, index) => {
            const x = pad.left + ((data.length <= 1 ? plotW / 2 : (plotW * index) / (data.length - 1)) * chartView.scale) + chartView.offset;
            if (x < pad.left || x > width - pad.right) return null;
            return <line key={`v-${item.date}`} x1={x} y1={pad.top} x2={x} y2={height - pad.bottom} className="grid-line vertical" />;
          })}
          {avgDisplayPoints.length > 1 && <path className="area" d={`${avgPath} L ${avgDisplayPoints.at(-1).x} ${height - pad.bottom} L ${avgDisplayPoints[0].x} ${height - pad.bottom} Z`} />}
          <path className="avg-path" d={avgPath} />
          <path className="best-path" d={bestPath} />
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
          <span>平均: {Number(hovered.item.avg || 0).toLocaleString("ja-JP")}点</span>
          <span>ベスト: {Number(hovered.item.best || 0).toLocaleString("ja-JP")}点</span>
        </div>
      )}
    </div>
  );
}

function demoDb() {
  const names = ["遥太", "颯太"];
  const bats = ["赤バット", "黒バット", "軽量バット"];
  const demoDays = 730;
  const end = parseISO(todayISO());
  const records = [];
  for (let ago = demoDays; ago >= 0; ago -= 1) {
    const date = toISO(addDays(end, -ago));
    names.forEach((name, nameIndex) => {
      const elapsed = demoDays - ago;
      const growth = Math.floor(elapsed * 0.33);
      const seasonal = Math.floor(28 * Math.sin(elapsed / 38));
      const count = 35 + ((ago * 13 + nameIndex * 17) % 76) + (ago % 24 === 0 ? 210 : 0);
      const avg = Math.min(820, 330 + nameIndex * 35 + growth + seasonal + ((ago * 7) % 80));
      const best = Math.min(965, avg + 55 + ((ago * 11) % 115));
      records.push({ id: uid(), name, bat: bats[(ago + nameIndex) % bats.length], date, count, avg, best });
    });
  }
  return { activeName: names[0], names, bats, defaultBat: bats[0], theme: "red", records };
}

export default function App() {
  const [db, setDbState] = useState(loadDb);
  const [tab, setTab] = useState("home");
  const [range, setRange] = useState(RANGE_WEEK);
  const [homeBat, setHomeBat] = useState(ALL);
  const [selectedDate, setSelectedDate] = useState(todayISO);
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [pendingDelete, setPendingDelete] = useState(null);

  const setDb = (next) => {
    setDbState(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const currentName = db.activeName || db.names[0] || "";
  const allForName = useMemo(() => db.records.filter((record) => record.name === currentName), [db.records, currentName]);
  const badgeMap = useMemo(() => badgesFor(allForName), [allForName]);

  const addRecord = (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const bat = String(form.get("bat") || "");
    if (!currentName || !bat) return false;
    const record = {
      id: uid(),
      name: currentName,
      bat,
      date: selectedDate,
      count: Math.max(1, Number(form.get("count")) || 1),
      avg: Math.max(0, Math.min(999, Number(form.get("avg")) || 0)),
      best: Math.max(0, Math.min(999, Number(form.get("best")) || 0)),
    };
    setDb({ ...db, records: [...db.records, record] });
    event.currentTarget.reset();
    return true;
  };

  const addName = (event) => {
    event.preventDefault();
    const value = String(new FormData(event.currentTarget).get("name") || "").trim();
    if (!value || db.names.includes(value)) return;
    setDb({ ...db, activeName: value, names: [...db.names, value] });
    event.currentTarget.reset();
  };

  const addBat = (event) => {
    event.preventDefault();
    const value = String(new FormData(event.currentTarget).get("bat") || "").trim();
    if (!value || db.bats.includes(value)) return;
    setDb({ ...db, bats: [...db.bats, value], defaultBat: db.defaultBat || value });
    event.currentTarget.reset();
  };

  const confirmDelete = () => {
    const pending = pendingDelete;
    setPendingDelete(null);
    if (!pending) return;
    if (pending.type === "all") {
      setDb({ activeName: "", names: [], bats: [], defaultBat: "", theme: db.theme || "red", records: [] });
      return;
    }
    if (pending.type === "name") {
      const names = db.names.filter((name) => name !== pending.value);
      setDb({
        ...db,
        names,
        activeName: db.activeName === pending.value ? (names[0] || "") : db.activeName,
        records: db.records.filter((record) => record.name !== pending.value),
      });
    }
    if (pending.type === "bat") {
      const bats = db.bats.filter((bat) => bat !== pending.value);
      setDb({
        ...db,
        bats,
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
    const next = { ...db, names: [...db.names], bats: [...db.bats], records: [...db.records] };
    rows.forEach(([name, bat, date, count, avg, best]) => {
      if (!name || !bat || !/^\d{4}-\d{2}-\d{2}$/.test(date || "")) return;
      if (!next.names.includes(name)) next.names.push(name);
      if (!next.bats.includes(bat)) next.bats.push(bat);
      next.records.push({ id: uid(), name, bat, date, count: Number(count) || 0, avg: Number(avg) || 0, best: Number(best) || 0 });
    });
    if (!next.activeName && next.names[0]) next.activeName = next.names[0];
    if (!next.defaultBat && next.bats[0]) next.defaultBat = next.bats[0];
    setDb(next);
    event.target.value = "";
  };

  return (
    <div className={`app theme-${db.theme || "red"}`}>
      <div className="phone-shell">
        <header className="app-header">
          <strong className="app-title">SWING LOG</strong>
          <button className="active-player" type="button" onClick={() => setTab("settings")}><SvgIcon type="person" />{currentName || "未選択"}</button>
        </header>

        <main className="content">
          {tab === "home" && (
            <HomeView
              db={db}
              currentName={currentName}
              allForName={allForName}
              range={range}
              setRange={setRange}
              homeBat={homeBat}
              setHomeBat={setHomeBat}
            />
          )}
          {tab === "record" && (
            <RecordView
              db={db}
              allForName={allForName}
              badgeMap={badgeMap}
              selectedDate={selectedDate}
              setSelectedDate={setSelectedDate}
              month={month}
              setMonth={setMonth}
              addRecord={addRecord}
            />
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

function HomeView({ db, currentName, allForName, range, setRange, homeBat, setHomeBat }) {
  const [badgeFilter, setBadgeFilter] = useState(RANGE_TODAY);
  const allFiltered = db.records.filter((record) => (
    record.name === currentName &&
    record.date <= todayISO() &&
    (homeBat === ALL || record.bat === homeBat)
  ));
  const achievementWindow = rangeWindow(range);
  const from = toISO(achievementWindow.start);
  const to = toISO(achievementWindow.end);
  const filtered = allFiltered.filter((record) => (
    record.date >= from &&
    record.date <= to
  ));
  const daily = aggregate(filtered);
  const periodSummary = periodSummaryFromDaily(
    new Map(daily.map((day) => [day.date, day])),
    achievementWindow.start,
    achievementWindow.end,
  );
  const chartDaily = aggregate(allFiltered);
  const currentStreak = streakByDate(chartDaily).get(todayISO()) || 0;
  const cumulativeSummary = periodSummaryFromDaily(
    new Map(chartDaily.map((day) => [day.date, day])),
    chartDaily.length ? parseISO(chartDaily[0].date) : parseISO(todayISO()),
    parseISO(todayISO()),
  );
  const total = periodSummary.count;
  const avg = range === RANGE_TODAY ? periodSummary.avg : periodSummary.badgeAvg;
  const best = periodSummary.best;
  const practiceDays = periodSummary.days;
  const periodDayLabel = `${periodSummary.spanDays}日目`;
  const avgUnit = range === RANGE_TODAY || range === RANGE_TOTAL ? "点" : `点＠${periodDayLabel}`;
  const practiceUnit = `／${periodDayLabel}`;
  const badgeCounts = collectBadgeCounts(allForName, badgeFilter);
  const groupedBadges = badgeGroups(badgeCounts);
  const chartData = filledChartExtent(chartDaily);
  const rangeOptions = [
    [RANGE_TODAY, "今日"],
    [RANGE_WEEK, "今週"],
    [RANGE_MONTH, "今月"],
  ];
  const badgeTotal = badgeCounts.reduce((sum, [, count]) => sum + count, 0);
  const badgeFilterOptions = [
    [RANGE_TODAY, "今日"],
    [RANGE_WEEK, "今週"],
    [RANGE_MONTH, "今月"],
    ["year", "今年"],
    [RANGE_ALL, "全期間"],
  ];
  return (
    <>
      <section className="panel hero-card score-card">
        <div className="dashboard-controls">
          <label className="field-label bat-field">
            バット
            <span className="select-shell">
              <span className="select-leading"><SvgIcon type="bat" /></span>
              <select value={homeBat} onChange={(event) => setHomeBat(event.target.value)}>
                <option value={ALL}>すべてのバット</option>
                {db.bats.map((bat) => <option key={bat} value={bat}>{bat}</option>)}
              </select>
              <span className="select-caret" aria-hidden="true"><SvgIcon type="chevronDown" /></span>
            </span>
          </label>
        </div>

        <div className="attached-tabs" role="tablist" aria-label="実績期間">
          {rangeOptions.map(([value, label]) => (
            <button key={value} type="button" className={range === value ? "selected" : ""} onClick={() => setRange(value)}>
              <span>{label}</span>
            </button>
          ))}
        </div>
        <section className="score-summary-card">
          <p className="period-heading">{achievementWindow.label}</p>
          <div className="achievement-summary all-period">
            <AchievementMetric icon="count" label="スイング数" value={total} unit="回" kind="count" range={range} showMeter={range !== RANGE_TOTAL} />
            {range === RANGE_TOTAL ? (
              <AchievementMetric icon="log" label="練習した日数" value={practiceDays} unit="日" kind="days" range={range} showMeter={false} />
            ) : (
              <AchievementMetric icon="avg" label="平均" value={avg} unit={avgUnit} kind="avg" range={range} />
            )}
            {range === RANGE_TODAY || range === RANGE_TOTAL ? (
              <AchievementMetric icon="best" label="ベスト" value={best} unit="点" kind="best" range={range} showMeter={range !== RANGE_TOTAL} />
            ) : (
              <AchievementMetric icon="log" label="練習した日数" value={practiceDays} unit={practiceUnit} kind="days" range={range} variableTarget={periodSummary.spanDays} />
            )}
            {range === RANGE_TODAY && (
              <AchievementMetric icon="log" label="毎日練習" value={currentStreak} unit="日目" kind="streak" range={range} />
            )}
          </div>
          <RecordPanel daily={chartData} range={range} />
        </section>

        <section className="cumulative-summary">
          <div className="section-row tight">
            <div>
              <h2>累計</h2>
            </div>
          </div>
          <div className="achievement-summary compact-metrics">
            <AchievementMetric icon="count" label="スイング数" value={cumulativeSummary.count} unit="回" kind="count" range={RANGE_TOTAL} targets={UNIQUE_TOTAL_COUNT_TARGETS} />
            <AchievementMetric icon="log" label="練習した日数" value={cumulativeSummary.days} unit="日" kind="days" range={RANGE_TOTAL} targets={UNIQUE_STREAK_TARGETS} />
            <AchievementMetric icon="best" label="過去最高点" value={cumulativeSummary.best} unit="点" kind="best" range={RANGE_TOTAL} targets={UNIQUE_BEST_TARGETS} />
          </div>
        </section>
      </section>

      <section className="panel">
        <div className="section-row">
          <h2>獲得バッジ</h2>
          <p>表示中の合計</p>
        </div>
        <div className="badge-filter-tabs" role="tablist" aria-label="バッジ期間">
          {badgeFilterOptions.map(([value, label]) => (
            <button key={value} type="button" className={badgeFilter === value ? "selected" : ""} onClick={() => setBadgeFilter(value)}>{label}</button>
          ))}
        </div>
        <div className="badge-total"><strong>{badgeTotal.toLocaleString("ja-JP")}</strong><span>個</span></div>
        {badgeCounts.length ? (
          <div className="badge-groups">
            {groupedBadges.filter((group) => group.total > 0).map((group) => (
              <section className={`badge-group ${group.key}`} key={group.key}>
                <div className="badge-group-title">
                  <h3>{group.label}</h3>
                  <strong>{group.total.toLocaleString("ja-JP")}個</strong>
                </div>
                <div className="badge-period-grid">
                  {group.sections.map((section) => (
                    <section className={`badge-subgroup ${section.key}`} key={section.key}>
                      <div className="badge-list two-col">
                        {section.badges.length ? section.badges.map(([label, count]) => (
                          <span className="badge-chip-wrap" key={label}>
                            <span className={`badge ${section.key}`}><Icon type="badge" />{formatBadgeLabel(label)}</span>
                            <b>{count > 1 ? `x${count}` : ""}</b>
                          </span>
                        )) : <span className="badge-empty">-</span>}
                      </div>
                    </section>
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : <p className="empty">まだバッジはありません。</p>}
      </section>
    </>
  );
}

function filledChartExtent(daily) {
  if (!daily.length) {
    return [];
  }
  const map = new Map(daily.map((day) => [day.date, day]));
  const start = parseISO(daily[0].date);
  const end = parseISO(todayISO());
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
  if (label.startsWith("初")) return "score";
  return label.includes("平均") || label.includes("ベスト") ? "score" : "count";
}

function badgePeriod(label) {
  if (label.startsWith("累計") || label.startsWith("初")) return "total";
  if (label.includes("日連続練習")) return "daily";
  if (label.startsWith("今日") || label.startsWith("日平均")) return "daily";
  if (label.startsWith("今週") || label.startsWith("週平均")) return "weekly";
  if (label.startsWith("月間")) return "monthly";
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
  const metric = label.includes("平均") ? 1 : label.includes("ベスト") ? 2 : label.includes("練習") || label.includes("皆勤") || label.includes("毎日") ? 3 : 0;
  return [period, metric, value || 9999, label];
}

function formatBadgeLabel(label) {
  return label;
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

function RecordView({ db, allForName, badgeMap, selectedDate, setSelectedDate, month, setMonth, addRecord }) {
  const [isEditing, setIsEditing] = useState(false);
  const selectedRecords = allForName.filter((record) => record.date === selectedDate);
  const selectedAgg = aggregate(selectedRecords)[0] || { count: 0, avg: 0, best: 0, bats: [] };
  const selectedByBat = aggregateByBat(selectedRecords);
  const isToday = selectedDate === todayISO();
  const canEdit = selectedDate <= todayISO();
  const selectedDateLabel = `${parseISO(selectedDate).getMonth() + 1}月${parseISO(selectedDate).getDate()}日の記録`;

  useEffect(() => {
    setIsEditing(false);
  }, [selectedDate]);

  const handleRecordSubmit = (event) => {
    if (addRecord(event)) {
      setIsEditing(false);
    }
  };

  return (
    <>
      <section className="panel">
        <div className="month-head">
          <button type="button" className="ghost square" aria-label="前の月" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>‹</button>
          <strong>{month.getFullYear()}年{month.getMonth() + 1}月</strong>
          <button type="button" className="ghost square" aria-label="次の月" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>›</button>
        </div>
        <Calendar records={allForName} badgeMap={badgeMap} month={month} selectedDate={selectedDate} setSelectedDate={setSelectedDate} />
      </section>

      <section className={`panel input-panel ${isEditing ? "open" : ""}`} aria-hidden={!isEditing}>
        <div className="input-panel-title">
          <h2>スイング入力</h2>
          <p>{isToday ? "今日の記録を入力" : "選択日の記録を修正"}</p>
        </div>
        <div className="input-panel-layout">
          <SwingForm bats={db.bats} defaultBat={db.defaultBat} onSubmit={handleRecordSubmit} submitLabel={isToday ? "記録する" : "修正を保存"} />
          <button type="button" className="ghost edit-toggle input-close" onClick={() => setIsEditing(false)}>閉じる</button>
        </div>
      </section>

      <section className="panel">
        <div className="section-row">
          <div>
            <h2>{isToday ? "今日の記録" : selectedDateLabel}</h2>
          </div>
          {canEdit && !isEditing && (
            <button type="button" className="ghost edit-toggle" onClick={() => setIsEditing((value) => !value)}>
              {isToday ? "入力" : "修正"}
            </button>
          )}
        </div>
        <div className="metric-grid four">
          <Metric icon="count" label="合計回数" value={selectedAgg.count} unit="回" />
          <Metric icon="avg" label="平均" value={selectedAgg.avg || 0} unit="点" />
          <Metric icon="best" label="ベスト" value={selectedAgg.best || 0} unit="点" />
          <Metric icon="bat" label="バット数" value={selectedAgg.bats.length} unit="本" />
        </div>
        <div className="record-list">
          {selectedByBat.length ? selectedByBat.map((item) => <RecordSummary key={item.bat} item={item} />) : <p className="empty">この日の記録はまだありません。</p>}
        </div>
        <div className="badge-list day-badges">
          {[...(badgeMap.get(selectedDate) || [])].sort((a, b) => {
            const aKey = badgeSortKey(a);
            const bKey = badgeSortKey(b);
            return aKey[0] - bKey[0] || aKey[1] - bKey[1] || String(aKey[2]).localeCompare(String(bKey[2]), "ja");
          }).map((badge) => (
            <span className="badge-chip-wrap" key={badge}>
              <span className={`badge ${badgeCategory(badge)}`}><Icon type="badge" />{formatBadgeLabel(badge)}</span>
              <b />
            </span>
          ))}
        </div>
      </section>
    </>
  );
}

function SwingForm({ bats, defaultBat, onSubmit, submitLabel }) {
  const selectedBat = bats.includes(defaultBat) ? defaultBat : bats[0] || "";
  return (
    <form className="input-grid swing-form" onSubmit={onSubmit}>
      <label className="field-label"><span className="field-title"><Icon type="bat" />バット</span><select key={selectedBat} name="bat" required defaultValue={selectedBat}>{bats.map((bat) => <option key={bat}>{bat}</option>)}</select></label>
      <label className="field-label"><span className="field-title"><Icon type="count" />回数</span><input name="count" type="number" inputMode="numeric" min="1" step="1" required /></label>
      <label className="field-label"><span className="field-title"><Icon type="avg" />平均</span><input name="avg" type="number" inputMode="numeric" min="0" max="999" step="1" required /></label>
      <label className="field-label"><span className="field-title"><Icon type="best" />ベスト</span><input name="best" type="number" inputMode="numeric" min="0" max="999" step="1" required /></label>
      <button className="primary wide" type="submit"><ButtonIcon type="plus" />{submitLabel}</button>
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

function RecordSummary({ item }) {
  return (
    <article className="record-card">
      <div className="record-title"><Icon type="bat" /><strong>{item.bat}</strong></div>
      <div className="mini-grid">
        <span><b>回数</b>{item.count}<small>回</small></span>
        <span><b>平均</b>{item.avg}<small>点</small></span>
        <span><b>ベスト</b>{item.best}<small>点</small></span>
      </div>
    </article>
  );
}

function SettingsView({ db, currentName, setDb, addName, addBat, exportCsv, importCsv, setPendingDelete }) {
  return (
    <>
      <section className="panel">
        <div className="section-row">
          <h2>テーマ</h2>
          <p>アクセントカラー</p>
        </div>
        <div className="theme-switch">
          {[
            ["red", "赤", "#ff4055", "255,64,85"],
            ["blue", "青", "#3b8dff", "59,141,255"],
            ["green", "緑", "#31db8f", "49,219,143"],
          ].map(([theme, label, color, rgb]) => (
            <button key={theme} type="button" className={(db.theme || "red") === theme ? "selected" : ""} onClick={() => setDb({ ...db, theme })} aria-label={`テーマ: ${label}`} title={`テーマ: ${label}`}>
              <span className="theme-dot" style={{ "--theme-dot": color, "--theme-dot-rgb": rgb }} aria-hidden="true" />
            </button>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="section-row">
          <h2>名前</h2>
          <p>使う人を切り替え</p>
        </div>
        <form className="add-row" onSubmit={addName}>
          <input name="name" type="text" autoComplete="off" placeholder="名前を追加" />
          <button type="submit" className="primary"><ButtonIcon type="plus" /></button>
        </form>
        <div className="chip-list">
          {db.names.map((name) => (
            <span key={name} className={`chip ${name === currentName ? "active" : ""}`}>
              <button type="button" onClick={() => setDb({ ...db, activeName: name })}>
                {name}{name === currentName ? <small>選択中</small> : null}
              </button>
              <button type="button" className="chip-delete" aria-label={`${name}を削除`} onClick={() => setPendingDelete({ type: "name", value: name })}><SvgIcon type="trash" /></button>
            </span>
          ))}
        </div>
      </section>

      <section className="panel">
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
            <span key={bat} className={`chip ${bat === db.defaultBat ? "active default" : ""}`}>
              <button type="button" onClick={() => setDb({ ...db, defaultBat: bat })}>
                {bat}{bat === db.defaultBat ? <small>デフォルト</small> : null}
              </button>
              <button type="button" className="chip-delete" aria-label={`${bat}を削除`} onClick={() => setPendingDelete({ type: "bat", value: bat })}><SvgIcon type="trash" /></button>
            </span>
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
        <button type="button" className="ghost wide" onClick={() => setDb(demoDb())}>デモデータを作成</button>
        <button type="button" className="danger wide" onClick={() => setPendingDelete({ type: "all", value: "全データ" })}>全データ削除</button>
      </section>
    </>
  );
}

function BottomNav({ tab, setTab }) {
  const tabs = [
    ["home", "home", "ホーム"],
    ["record", "log", "入力"],
    ["settings", "settings", "設定"],
  ];
  return (
    <nav className="bottom-nav" aria-label="画面切り替え">
      {tabs.map(([key, icon, label]) => (
        <button key={key} type="button" className={tab === key ? "active" : ""} onClick={() => setTab(key)}>
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

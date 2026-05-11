import { useEffect, useMemo, useRef, useState } from "react";

const STORAGE_KEY = "dream1-swing-tracker-v1";
const ALL = "__all__";
const RANGE_ALL = "all";
const kMinChartVisibleDays = 7;
const kMaxChartVisibleDays = 365;
const BADGE_CATEGORIES = [
  ["count", "回数系"],
  ["score", "スコア系"],
  ["streak", "連続系"],
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
  if (type === "bat") return <svg {...props}><path d="M2.6 4.35c.95-1.18 2.72-1.27 3.78-.19 4.15 4.21 7.9 8.85 11.22 13.78l-2.11 2.11C10.55 16.74 5.9 12.98 1.69 8.83.61 7.77.7 6 1.88 5.05l.72-.7Z" fill="currentColor" stroke="none" /><path d="m16.35 19.48 2.1-2.1 1.5 1.5-2.1 2.1z" fill="currentColor" stroke="none" /><path d="M20.55 19.35c.82.32 1.53.9 2 1.65.32.52.22 1.19-.23 1.61l-.95.88c-.43.4-1.08.44-1.55.09-.7-.52-1.23-1.26-1.49-2.1z" fill="currentColor" stroke="none" /></svg>;
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

function SwingSilhouette() {
  return (
    <img className="swing-silhouette" src="./images/swing-neon.jpg" alt="" aria-hidden="true" />
  );
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

function badgesFor(records) {
  const daily = aggregate(records);
  const byDate = new Map();
  const add = (date, label) => byDate.set(date, [...(byDate.get(date) || []), label]);
  let streak = 0;
  let previous = null;
  let bestEver = 0;
  let avgEver = 0;
  let weekStart = "";
  let weekTotal = 0;
  const monthTotals = new Map();
  const crossedDaily = new Set();
  const crossedWeek = new Set();
  const crossedMonth = new Set();
  const crossedBest = new Set();
  const crossedAvg = new Set();

  daily.forEach((day) => {
    streak = previous && toISO(addDays(parseISO(previous), 1)) === day.date ? streak + 1 : 1;
    previous = day.date;
    if (streak === 3) add(day.date, "3日連続");
    if (streak === 7) add(day.date, "1週間連続");
    if (streak >= 30 && streak % 30 === 0) add(day.date, `${streak / 30}か月連続`);

    const dailyThreshold = Math.floor(day.count / 100) * 100;
    if (dailyThreshold >= 100) {
      const key = `${day.date}-${dailyThreshold}`;
      if (!crossedDaily.has(key)) {
        add(day.date, `1日${dailyThreshold.toLocaleString("ja-JP")}スイング`);
        crossedDaily.add(key);
      }
    }

    const dateValue = parseISO(day.date);
    const currentWeekStart = toISO(addDays(dateValue, -dateValue.getDay()));
    if (weekStart !== currentWeekStart) {
      weekStart = currentWeekStart;
      weekTotal = 0;
    }
    weekTotal += day.count;
    const weekThreshold = Math.floor(weekTotal / 500) * 500;
    if (weekThreshold >= 500) {
      const key = `${weekStart}-${weekThreshold}`;
      if (!crossedWeek.has(key)) {
        add(day.date, `週間${weekThreshold.toLocaleString("ja-JP")}スイング`);
        crossedWeek.add(key);
      }
    }

    const monthKey = day.date.slice(0, 7);
    const monthTotal = (monthTotals.get(monthKey) || 0) + day.count;
    monthTotals.set(monthKey, monthTotal);
    const monthThreshold = Math.floor(monthTotal / 1000) * 1000;
    if (monthThreshold >= 1000) {
      const key = `${monthKey}-${monthThreshold}`;
      if (!crossedMonth.has(key)) {
        add(day.date, `月間${monthThreshold.toLocaleString("ja-JP")}スイング`);
        crossedMonth.add(key);
      }
    }

    bestEver = Math.max(bestEver, day.best || 0);
    avgEver = Math.max(avgEver, day.avg || 0);
    [100, 200, 300, 400, 500, 600, 700, 800, 900, 999].forEach((threshold) => {
      if (bestEver >= threshold && !crossedBest.has(threshold)) {
        add(day.date, threshold === 999 ? "ベストスコア999達成" : `ベストスコア${threshold}超え`);
        crossedBest.add(threshold);
      }
      if (avgEver >= threshold && !crossedAvg.has(threshold)) {
        add(day.date, threshold === 999 ? "平均スコア999達成" : `平均スコア${threshold}超え`);
        crossedAvg.add(threshold);
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
    if (range === 7) return "今週";
    if (range === 30) return "今月";
    if (range === 90) return "直近3か月";
    if (range === 180) return "直近半年";
    return "今年";
  }
  if (range === 7) return `${index}週前`;
  if (range === 30) return `${index}か月前`;
  if (range === 90) return `${index * 3}か月前`;
  if (range === 180) {
    const years = index * 0.5;
    return years === 0.5 ? "半年前" : `${Number.isInteger(years) ? years : years.toFixed(1)}年前`;
  }
  return `${index}年前`;
}

function comparisonBuckets(daily, range) {
  if (!daily.length) {
    return [];
  }
  const map = new Map(daily.map((day) => [day.date, day]));
  const startDate = parseISO(daily[0].date);
  const today = parseISO(todayISO());
  const totalDays = Math.floor((today - startDate) / 86400000) + 1;
  const bucketCount = Math.max(1, Math.ceil(totalDays / range));

  return Array.from({ length: bucketCount }, (_, bucketIndex) => {
    const end = addDays(today, -(bucketIndex * range));
    const start = addDays(end, -(range - 1));
    let count = 0;
    let avgTotal = 0;
    let avgDays = 0;
    let best = 0;

    for (let offset = 0; offset < range; offset += 1) {
      const date = toISO(addDays(start, offset));
      const day = map.get(date);
      if (!day) continue;
      count += day.count;
      if (Number.isFinite(day.avg)) {
        avgTotal += day.avg;
        avgDays += 1;
      }
      best = Math.max(best, day.best || 0);
    }

    return {
      label: compareLabel(bucketIndex, range),
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

function ScoreComparison({ daily, range }) {
  const [mode, setMode] = useState("avg");
  const scrollRef = useRef(null);
  const buckets = useMemo(() => comparisonBuckets(daily, range), [daily, range]);
  const visibleBuckets = useMemo(() => [...buckets].reverse(), [buckets]);
  const modes = [
    ["avg", "平均", "点"],
    ["best", "ベスト", "点"],
    ["count", "回数", "回"],
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

function Chart({ data, initialRange }) {
  const [hovered, setHovered] = useState(null);
  const [view, setView] = useState({ scale: 1, offset: 0 });
  const svgRef = useRef(null);
  const pointersRef = useRef(new Map());
  const gestureRef = useRef(null);
  const width = 360;
  const height = 250;
  const pad = { left: 42, right: 18, top: 22, bottom: 42 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const minScale = minChartScale(data.length);
  const maxScale = Math.max(maxChartScale(data.length), initialChartView(data.length, initialRange, plotW).scale);
  const chartView = constrainChartView(view, plotW, minScale, maxScale);
  const values = data.flatMap((item) => [item.avg, item.best]).filter((value) => Number.isFinite(value));

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
  const visibleStartLabel = data[visibleIndexAt(0)]?.label || data[0].label;
  const visibleEndLabel = data[visibleIndexAt(plotW)]?.label || data.at(-1).label;
  const hoverX = hovered ? Math.min(width - 162, Math.max(pad.left + 4, hovered.x + 10)) : 0;
  const hoverY = hovered ? Math.max(8, hovered.y - 66) : 0;
  const hoveredInPlot = hovered && hovered.x >= pad.left && hovered.x <= width - pad.right;
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
    setHovered(null);
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
      return {
        item,
        x: avgPoint?.x ?? bestPoint?.x ?? pad.left + ((data.length <= 1 ? plotW / 2 : (plotW * index) / (data.length - 1)) * chartView.scale) + chartView.offset,
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
  const handlePointerMove = (event) => {
    if (!pointersRef.current.has(event.pointerId)) {
      if (event.pointerType === "mouse") {
        setHovered(nearestDayTo(event.clientX));
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
      Math.abs(event.clientX - gesture.startX) < 8 &&
      Math.abs(event.clientY - gesture.startY) < 8;
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
      const nearest = nearestDayTo(event.clientX);
      if (nearest) {
        setHovered(nearest);
      }
    }
  };

  return (
    <div className="chart-wrap">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="スコア推移"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
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
          {avgDisplayPoints.length > 1 && <path className="area" d={`${avgPath} L ${avgDisplayPoints.at(-1).x} ${height - pad.bottom} L ${avgDisplayPoints[0].x} ${height - pad.bottom} Z`} />}
          <path className="avg-path" d={avgPath} />
          <path className="best-path" d={bestPath} />
          {[...avgDisplayPoints, ...bestDisplayPoints].map((pointItem) => (
            <circle
              key={`${pointItem.key}-${pointItem.item.date}`}
              className={`chart-point ${pointItem.key}`}
              cx={pointItem.x}
              cy={pointItem.y}
              r="8"
            />
          ))}
        </g>
        {hoveredInPlot && (
          <>
            {hovered.avgPoint && <circle className="chart-active-point avg" cx={hovered.avgPoint.x} cy={hovered.avgPoint.y} r="4.5" />}
            {hovered.bestPoint && <circle className="chart-active-point best" cx={hovered.bestPoint.x} cy={hovered.bestPoint.y} r="4.5" />}
          </>
        )}
        <text x={pad.left} y={height - 12} className="chart-date">{visibleStartLabel}</text>
        <text x={width - pad.right} y={height - 12} textAnchor="end" className="chart-date">{visibleEndLabel}</text>
        {hoveredInPlot && (
          <g className="chart-tooltip" pointerEvents="none">
            <line x1={hovered.x} y1={pad.top} x2={hovered.x} y2={height - pad.bottom} className="hover-line" />
            <rect x={hoverX} y={hoverY} width="152" height="60" rx="7" />
            <text x={hoverX + 9} y={hoverY + 16}>{hovered.item.label}</text>
            <text x={hoverX + 9} y={hoverY + 34}>平均: {Number(hovered.item.avg || 0).toLocaleString("ja-JP")}点</text>
            <text x={hoverX + 9} y={hoverY + 50}>ベスト: {Number(hovered.item.best || 0).toLocaleString("ja-JP")}点</text>
          </g>
        )}
      </svg>
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
  const [range, setRange] = useState(30);
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
        <header className="top-tabs-row">
          <BottomNav tab={tab} setTab={setTab} />
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

        {pendingDelete && <DeleteDialog pending={pendingDelete} onCancel={() => setPendingDelete(null)} onConfirm={confirmDelete} />}
      </div>
    </div>
  );
}

function HomeView({ db, currentName, allForName, range, setRange, homeBat, setHomeBat }) {
  const from = range === RANGE_ALL ? null : toISO(addDays(parseISO(todayISO()), -(range - 1)));
  const allFiltered = db.records.filter((record) => (
    record.name === currentName &&
    record.date <= todayISO() &&
    (homeBat === ALL || record.bat === homeBat)
  ));
  const filtered = allFiltered.filter((record) => (
    (from === null || record.date >= from) &&
    record.date <= todayISO()
  ));
  const daily = aggregate(filtered);
  const chartDaily = aggregate(allFiltered);
  const total = daily.reduce((sum, day) => sum + day.count, 0);
  const avg = total ? Math.round(daily.reduce((sum, day) => sum + day.avg * day.count, 0) / total) : 0;
  const best = daily.reduce((max, day) => Math.max(max, day.best), 0);
  const badgeCounts = collectBadgeCounts(allForName);
  const groupedBadges = badgeGroups(badgeCounts);
  const chartData = filledChartExtent(chartDaily);
  const rangeOptions = [
    [7, "1週間"],
    [30, "1か月"],
    [90, "3か月"],
    [180, "半年"],
    [365, "1年"],
  ];
  const rangeLabel = rangeOptions.find(([value]) => value === range)?.[1] || `${range}日`;

  return (
    <>
      <section className="panel hero-card bat-dashboard">
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
          <div className="range-field">
            <span>期間</span>
            <div className="segmented">
              {rangeOptions.map(([value, label]) => (
                <button key={value} type="button" className={range === value ? "selected" : ""} onClick={() => setRange(value)}>{label}</button>
              ))}
            </div>
          </div>
        </div>

        <section className="dashboard-section">
          <div className="section-row tight">
            <div>
              <h2>スコア</h2>
              <p>{range === RANGE_ALL ? "全期間" : `直近${rangeLabel}`}</p>
            </div>
          </div>
          <div className="total-card">
            <SwingSilhouette />
            <div className="metric-label"><Icon type="count" />総スイング</div>
            <strong>{total.toLocaleString("ja-JP")}<span>回</span></strong>
          </div>
          <div className="metric-grid">
            <Metric icon="best" label="ベスト" value={best} unit="点" />
            <Metric icon="avg" label="平均" value={avg} unit="点" />
          </div>
        </section>

        <ScoreComparison daily={chartData} range={range} />

        <section className="dashboard-section">
          <div className="section-row tight">
            <div>
              <h2>スコア推移</h2>
              <p>平均とベストの流れ</p>
            </div>
            <div className="legend"><span className="avg-line" />平均 <span className="best-line" />ベスト</div>
          </div>
          <Chart data={chartData} initialRange={range} />
        </section>
      </section>

      <section className="panel">
        <div className="section-row">
          <h2>獲得バッジ</h2>
          <p>全期間</p>
        </div>
        {badgeCounts.length ? (
          <div className="badge-groups">
            {groupedBadges.filter((group) => group.badges.length).map((group) => (
              <section className={`badge-group ${group.key}`} key={group.key}>
                <h3>{group.label}</h3>
                <div className="badge-list">
                  {group.badges.map(([label, count]) => (
                    <span className={`badge ${group.key}`} key={label}><Icon type="badge" />{label}{count > 1 ? ` x${count}` : ""}</span>
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

function collectBadgeCounts(records) {
  const counts = {};
  [...badgesFor(records).values()].flat().forEach((badge) => {
    counts[badge] = (counts[badge] || 0) + 1;
  });
  const rank = (label) => {
    const number = Number(label.match(/[\d,.]+/)?.[0]?.replace(/,/g, "") || 0);
    if (label.startsWith("1日")) return [0, 0, number];
    if (label.startsWith("週間")) return [0, 1, number];
    if (label.startsWith("月間")) return [0, 2, number];
    if (label.startsWith("平均スコア")) return [1, 0, number || 999];
    if (label.startsWith("ベストスコア")) return [1, 1, number || 999];
    if (label.includes("連続")) {
      if (label.startsWith("3日")) return [2, 0, 3];
      if (label.startsWith("1週間")) return [2, 1, 7];
      return [2, 2, number];
    }
    return [9, 9, 0];
  };
  return Object.entries(counts).sort(([a], [b]) => {
    const aRank = rank(a);
    const bRank = rank(b);
    for (let index = 0; index < aRank.length; index += 1) {
      if (aRank[index] !== bRank[index]) return aRank[index] - bRank[index];
    }
    return a.localeCompare(b, "ja");
  });
}

function badgeCategory(label) {
  if (label.startsWith("1日") || label.startsWith("週間") || label.startsWith("月間")) return "count";
  if (label.startsWith("平均スコア") || label.startsWith("ベストスコア")) return "score";
  if (label.includes("連続")) return "streak";
  return "count";
}

function badgeGroups(badgeCounts) {
  const groups = new Map(BADGE_CATEGORIES.map(([key]) => [key, []]));
  badgeCounts.forEach(([label, count]) => {
    groups.get(badgeCategory(label))?.push([label, count]);
  });
  return BADGE_CATEGORIES.map(([key, label]) => ({ key, label, badges: groups.get(key) || [] }));
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
          <div className="input-panel-head">
            <span className="input-panel-icon"><SvgIcon type="bat" /></span>
            <div>
              <strong>入力</strong>
              <p>{db.defaultBat || "バット"}を初期選択</p>
            </div>
          </div>
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
          {(badgeMap.get(selectedDate) || []).map((badge) => <span className="badge hot" key={badge}><Icon type="badge" />{badge}</span>)}
        </div>
      </section>
    </>
  );
}

function SwingForm({ bats, defaultBat, onSubmit, submitLabel }) {
  const selectedBat = bats.includes(defaultBat) ? defaultBat : bats[0] || "";
  return (
    <form className="input-grid swing-form" onSubmit={onSubmit}>
      <label className="field-label">バット<select key={selectedBat} name="bat" required defaultValue={selectedBat}>{bats.map((bat) => <option key={bat}>{bat}</option>)}</select></label>
      <label className="field-label">回数<input name="count" type="number" inputMode="numeric" min="1" step="1" required /></label>
      <label className="field-label">平均<input name="avg" type="number" inputMode="numeric" min="0" max="999" step="1" required /></label>
      <label className="field-label">ベスト<input name="best" type="number" inputMode="numeric" min="0" max="999" step="1" required /></label>
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
          const hasBadge = (badgeMap.get(date) || []).length > 0;
          return (
            <button
              type="button"
              key={date}
              className={["calendar-day", selectedDate === date ? "selected" : "", date === todayISO() ? "today" : "", hasRecord ? "has-record" : ""].filter(Boolean).join(" ")}
              onClick={() => setSelectedDate(date)}
            >
              <span>{day}</span>
              {hasRecord && <small>{daily.get(date).count}回</small>}
              {hasBadge && <i aria-hidden="true"><SvgIcon type="badge" /></i>}
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
            ["red", "赤"],
            ["blue", "青"],
            ["green", "緑"],
          ].map(([theme, label]) => (
            <button key={theme} type="button" className={(db.theme || "red") === theme ? "selected" : ""} onClick={() => setDb({ ...db, theme })}>
              {label}
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
    ["record", "log", "記録"],
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

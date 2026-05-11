import { useMemo, useState } from "react";

const STORAGE_KEY = "dream1-swing-tracker-v1";
const ALL = "__all__";
const RANGE_ALL = "all";

const defaultDb = {
  activeName: "遥太",
  names: ["遥太"],
  bats: ["赤バット", "黒バット"],
  records: [],
};

function SvgIcon({ type }) {
  const props = { viewBox: "0 0 24 24", "aria-hidden": "true" };
  if (type === "home") return <svg {...props}><path d="M4 11.5 12 5l8 6.5" /><path d="M6.5 10.5V20h11v-9.5" /><path d="M9.5 20v-5h5v5" /></svg>;
  if (type === "log") return <svg {...props}><rect x="4" y="5" width="16" height="15" rx="3" /><path d="M8 3v4M16 3v4M4 10h16" /></svg>;
  if (type === "settings") return <svg {...props}><circle cx="12" cy="12" r="3.2" /><path d="M19 12a7 7 0 0 0-.1-1l2-1.6-2-3.4-2.4 1a7 7 0 0 0-1.8-1L14.4 3h-4.8l-.3 3a7 7 0 0 0-1.8 1l-2.4-1-2 3.4 2 1.6A7 7 0 0 0 5 12a7 7 0 0 0 .1 1l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 1.8 1l.3 3h4.8l.3-3a7 7 0 0 0 1.8-1l2.4 1 2-3.4-2-1.6c.1-.3.1-.7.1-1Z" /></svg>;
  if (type === "count") return <svg {...props}><path d="M4 7h16M4 12h16M4 17h10" /></svg>;
  if (type === "avg") return <svg {...props}><path d="M4 17 9 12l4 4 7-9" /><path d="M16 7h4v4" /></svg>;
  if (type === "best") return <svg {...props}><path d="M12 3 9.5 8.5 4 9l4.2 3.8L7 18.5l5-3 5 3-1.2-5.7L20 9l-5.5-.5L12 3Z" /></svg>;
  if (type === "bat") return <svg {...props}><path d="M5 19 19 5" /><path d="m16 4 4 4" /><path d="m3 17 4 4" /></svg>;
  if (type === "badge") return <svg {...props}><circle cx="12" cy="8" r="4" /><path d="m9 12-2 8 5-3 5 3-2-8" /></svg>;
  if (type === "plus") return <svg {...props}><path d="M12 5v14M5 12h14" /></svg>;
  if (type === "trash") return <svg {...props}><path d="M4 7h16" /><path d="M10 11v6M14 11v6" /><path d="M6 7l1 14h10l1-14" /><path d="M9 7V4h6v3" /></svg>;
  if (type === "download") return <svg {...props}><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></svg>;
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
  let cumulative = 0;
  const monthTotals = new Map();
  const crossedMonth = new Set();
  const crossedTotal = new Set();

  daily.forEach((day) => {
    streak = previous && toISO(addDays(parseISO(previous), 1)) === day.date ? streak + 1 : 1;
    previous = day.date;
    if (streak === 3) add(day.date, "3日連続");
    if (streak === 7) add(day.date, "1週間連続");
    if (streak >= 30 && streak % 30 === 0) add(day.date, `${streak / 30}か月連続`);
    if (day.count >= 300) add(day.date, "1日300スイング");

    const monthKey = day.date.slice(0, 7);
    const monthTotal = (monthTotals.get(monthKey) || 0) + day.count;
    monthTotals.set(monthKey, monthTotal);
    for (let threshold = 1000; threshold <= monthTotal; threshold += 1000) {
      const key = `${monthKey}-${threshold}`;
      if (!crossedMonth.has(key)) {
        add(day.date, `月間${threshold.toLocaleString("ja-JP")}スイング`);
        crossedMonth.add(key);
      }
    }

    cumulative += day.count;
    [10000, 50000].forEach((threshold) => {
      if (cumulative >= threshold && !crossedTotal.has(threshold)) {
        add(day.date, `累計${threshold.toLocaleString("ja-JP")}スイング`);
        crossedTotal.add(threshold);
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

function Metric({ icon, label, value, unit }) {
  return (
    <div className="metric-card">
      <div className="metric-label"><Icon type={icon} />{label}</div>
      <strong>{Number(value || 0).toLocaleString("ja-JP")}<span>{unit}</span></strong>
    </div>
  );
}

function Chart({ data }) {
  const [hovered, setHovered] = useState(null);
  const width = 360;
  const height = 250;
  const pad = { left: 42, right: 18, top: 22, bottom: 42 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const values = data.flatMap((item) => [item.avg, item.best]).filter((value) => Number.isFinite(value));

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
  const avgPath = pathFromPoints(avgPoints);
  const bestPath = pathFromPoints(bestPoints);
  const yLabels = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
    const value = Math.round((maxY * (1 - ratio)) / 100) * 100;
    return { value, y: pad.top + plotH * ratio };
  });
  const hoverX = hovered ? Math.min(width - 118, Math.max(pad.left + 4, hovered.x + 10)) : 0;
  const hoverY = hovered ? Math.max(8, hovered.y - 48) : 0;

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="スコア推移" onPointerLeave={() => setHovered(null)}>
        <defs>
          <linearGradient id="avgFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(255,48,68,.25)" />
            <stop offset="100%" stopColor="rgba(255,48,68,0)" />
          </linearGradient>
        </defs>
        {yLabels.map((tick) => (
          <g key={tick.value}>
            <line x1={pad.left} y1={tick.y} x2={width - pad.right} y2={tick.y} className="grid-line" />
            <text x={pad.left - 9} y={tick.y + 3} textAnchor="end" className="chart-axis-label">{tick.value}</text>
          </g>
        ))}
        <line x1={pad.left} y1={pad.top} x2={pad.left} y2={height - pad.bottom} className="axis-line" />
        <line x1={pad.left} y1={height - pad.bottom} x2={width - pad.right} y2={height - pad.bottom} className="axis-line" />
        {avgPoints.length > 1 && <path className="area" d={`${avgPath} L ${avgPoints.at(-1).x} ${height - pad.bottom} L ${avgPoints[0].x} ${height - pad.bottom} Z`} />}
        <path className="avg-path" d={avgPath} />
        <path className="best-path" d={bestPath} />
        {[...avgPoints, ...bestPoints].map((pointItem) => (
          <circle
            key={`${pointItem.key}-${pointItem.item.date}`}
            className={`chart-point ${pointItem.key}`}
            cx={pointItem.x}
            cy={pointItem.y}
            r="8"
            tabIndex="0"
            onPointerEnter={() => setHovered(pointItem)}
            onFocus={() => setHovered(pointItem)}
            onBlur={() => setHovered(null)}
          />
        ))}
        <text x={pad.left} y={height - 12} className="chart-date">{data[0].label}</text>
        <text x={width - pad.right} y={height - 12} textAnchor="end" className="chart-date">{data.at(-1).label}</text>
        {hovered && (
          <g className="chart-tooltip" pointerEvents="none">
            <line x1={hovered.x} y1={pad.top} x2={hovered.x} y2={height - pad.bottom} className="hover-line" />
            <rect x={hoverX} y={hoverY} width="108" height="42" rx="7" />
            <text x={hoverX + 9} y={hoverY + 16}>{hovered.item.label}</text>
            <text x={hoverX + 9} y={hoverY + 32}>{hovered.label} {hovered.value}点</text>
          </g>
        )}
      </svg>
    </div>
  );
}

function demoDb() {
  const names = ["遥太", "颯太"];
  const bats = ["赤バット", "黒バット", "軽量バット"];
  const end = parseISO(todayISO());
  const records = [];
  for (let ago = 120; ago >= 0; ago -= 1) {
    const date = toISO(addDays(end, -ago));
    names.forEach((name, nameIndex) => {
      const growth = Math.floor((120 - ago) * 1.8);
      const count = 35 + ((ago * 13 + nameIndex * 17) % 76) + (ago % 24 === 0 ? 210 : 0);
      const avg = Math.min(820, 360 + nameIndex * 35 + growth + ((ago * 7) % 80));
      const best = Math.min(965, avg + 55 + ((ago * 11) % 115));
      records.push({ id: uid(), name, bat: bats[(ago + nameIndex) % bats.length], date, count, avg, best });
    });
  }
  return { activeName: names[0], names, bats, records };
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
  const title = tab === "home" ? "ホーム" : tab === "record" ? "記録" : "設定";

  const addRecord = (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const bat = String(form.get("bat") || "");
    if (!currentName || !bat) return;
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
    setDb({ ...db, bats: [...db.bats, value] });
    event.currentTarget.reset();
  };

  const confirmDelete = () => {
    const pending = pendingDelete;
    setPendingDelete(null);
    if (!pending) return;
    if (pending.type === "all") {
      setDb({ activeName: "", names: [], bats: [], records: [] });
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
      setDb({
        ...db,
        bats: db.bats.filter((bat) => bat !== pending.value),
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
    setDb(next);
    event.target.value = "";
  };

  return (
    <div className="app">
      <div className="phone-shell">
        <header className="topbar">
          <div>
            <p className="eyebrow">SWING LOG</p>
            <h1>{title}</h1>
          </div>
          <button className="active-player" type="button" onClick={() => setTab("settings")}>{currentName || "未選択"}</button>
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
  const from = range === RANGE_ALL ? null : toISO(addDays(parseISO(todayISO()), -(range - 1)));
  const filtered = db.records.filter((record) => (
    record.name === currentName &&
    (from === null || record.date >= from) &&
    record.date <= todayISO() &&
    (homeBat === ALL || record.bat === homeBat)
  ));
  const daily = aggregate(filtered);
  const total = daily.reduce((sum, day) => sum + day.count, 0);
  const avg = total ? Math.round(daily.reduce((sum, day) => sum + day.avg * day.count, 0) / total) : 0;
  const best = daily.reduce((max, day) => Math.max(max, day.best), 0);
  const badgeCounts = collectBadgeCounts(allForName);
  const chartData = chartDataForRange(daily, range);
  const rangeOptions = [
    [7, "7日"],
    [30, "30日"],
    [90, "90日"],
    [RANGE_ALL, "全期間"],
  ];

  return (
    <>
      <section className="panel hero-card bat-dashboard">
        <div className="dashboard-controls">
          <label className="field-label bat-field">
            表示するバット
            <span className="select-shell">
              <span className="select-leading"><SvgIcon type="bat" /></span>
              <select value={homeBat} onChange={(event) => setHomeBat(event.target.value)}>
                <option value={ALL}>すべてのバット</option>
                {db.bats.map((bat) => <option key={bat} value={bat}>{bat}</option>)}
              </select>
              <span className="select-caret" aria-hidden="true">⌄</span>
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
              <p>{range === RANGE_ALL ? "全期間" : `直近${range}日`}</p>
            </div>
          </div>
          <div className="total-card">
            <div className="metric-label"><Icon type="count" />総スイング</div>
            <strong>{total.toLocaleString("ja-JP")}<span>回</span></strong>
          </div>
          <div className="metric-grid">
            <Metric icon="best" label="ベスト" value={best} unit="点" />
            <Metric icon="avg" label="平均" value={avg} unit="点" />
          </div>
        </section>

        <section className="dashboard-section">
          <div className="section-row tight">
            <div>
              <h2>スコア推移</h2>
              <p>平均とベストの流れ</p>
            </div>
            <div className="legend"><span className="avg-line" />平均 <span className="best-line" />ベスト</div>
          </div>
          <Chart data={chartData} />
        </section>
      </section>

      <section className="panel">
        <div className="section-row">
          <h2>獲得バッジ</h2>
          <p>全期間</p>
        </div>
        <div className="badge-list">
          {badgeCounts.length ? badgeCounts.map(([label, count]) => (
            <span className="badge" key={label}><Icon type="badge" />{label}{count > 1 ? ` x${count}` : ""}</span>
          )) : <p className="empty">まだバッジはありません。</p>}
        </div>
      </section>
    </>
  );
}

function chartDataForRange(daily, range) {
  if (range === RANGE_ALL) {
    return daily.map((day) => ({
      ...day,
      label: day.date.slice(5).replace("-", "/"),
    }));
  }
  return filledChart(daily, range);
}

function filledChart(daily, range) {
  const map = new Map(daily.map((day) => [day.date, day]));
  const end = parseISO(todayISO());
  return Array.from({ length: range }, (_, index) => {
    const date = toISO(addDays(end, index - range + 1));
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
  return Object.entries(counts);
}

function RecordView({ db, allForName, badgeMap, selectedDate, setSelectedDate, month, setMonth, addRecord }) {
  const selectedRecords = allForName.filter((record) => record.date === selectedDate);
  const selectedAgg = aggregate(selectedRecords)[0] || { count: 0, avg: 0, best: 0, bats: [] };
  const selectedByBat = aggregateByBat(selectedRecords);
  const isToday = selectedDate === todayISO();

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

      <section className="panel">
        <div className="section-row">
          <div>
            <h2>{isToday ? "今日の記録" : "選択日の記録"}</h2>
            <p>{selectedDate}</p>
          </div>
          <span className="status-pill">{isToday ? "INPUT" : "VIEW"}</span>
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

      <section className="panel">
        <div className="section-row">
          <h2>スイング入力</h2>
          <p>{isToday ? "今日の記録を追加" : "選択日に追加"}</p>
        </div>
        <form className="input-grid" onSubmit={addRecord}>
          <label className="field-label">バット<select name="bat" required>{db.bats.map((bat) => <option key={bat}>{bat}</option>)}</select></label>
          <label className="field-label">回数<input name="count" type="number" inputMode="numeric" min="1" step="1" placeholder="50" required /></label>
          <label className="field-label">平均<input name="avg" type="number" inputMode="numeric" min="0" max="999" step="1" placeholder="520" required /></label>
          <label className="field-label">ベスト<input name="best" type="number" inputMode="numeric" min="0" max="999" step="1" placeholder="710" required /></label>
          <button className="primary wide" type="submit"><ButtonIcon type="plus" />記録する</button>
        </form>
      </section>
    </>
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
              {hasBadge && <i aria-hidden="true">★</i>}
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
              <button type="button" onClick={() => setDb({ ...db, activeName: name })}>{name}</button>
              <button type="button" className="chip-delete" aria-label={`${name}を削除`} onClick={() => setPendingDelete({ type: "name", value: name })}><SvgIcon type="trash" /></button>
            </span>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="section-row">
          <h2>バット</h2>
          <p>全員で共有</p>
        </div>
        <form className="add-row" onSubmit={addBat}>
          <input name="bat" type="text" autoComplete="off" placeholder="例: 赤バット" />
          <button type="submit" className="primary"><ButtonIcon type="plus" /></button>
        </form>
        <div className="chip-list">
          {db.bats.map((bat) => (
            <span key={bat} className="chip">
              <button type="button">{bat}</button>
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

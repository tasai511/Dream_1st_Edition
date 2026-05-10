const DB_NAME = "dreamSwingRecorder";
const DB_VERSION = 1;
const STORE_NAMES = "names";
const STORE_BATS = "bats";
const STORE_RECORDS = "records";

const state = {
  db: null,
  names: [],
  bats: [],
  records: [],
  chartPoints: [],
};

const el = {};

document.addEventListener("DOMContentLoaded", async () => {
  bindElements();
  bindEvents();
  setToday();

  try {
    state.db = await openDb();
    await seedDefaults();
    await refreshAll();
    registerServiceWorker();
    showNotice("データはこの端末に保存されます。");
  } catch (error) {
    console.error(error);
    showNotice("保存機能の準備に失敗しました。ブラウザの設定を確認してください。");
  }
});

function bindElements() {
  [
    "storageStatus",
    "nameForm",
    "batForm",
    "newName",
    "newBat",
    "masterChips",
    "recordForm",
    "editingId",
    "recordName",
    "recordBat",
    "recordDate",
    "recordCount",
    "recordAverage",
    "recordBest",
    "saveRecordButton",
    "cancelEditButton",
    "historyList",
    "filterName",
    "filterBat",
    "filterPeriod",
    "totalCount",
    "recordDays",
    "scoreChart",
    "chartEmpty",
    "chartTooltip",
    "demoDataButton",
    "exportCsvButton",
    "importCsvInput",
    "notice",
  ].forEach((id) => {
    el[id] = document.getElementById(id);
  });
}

function bindEvents() {
  document.querySelectorAll(".tab-button").forEach((button) => {
    button.addEventListener("click", () => switchMode(button.dataset.mode));
  });

  el.nameForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await addMaster(STORE_NAMES, el.newName.value);
    el.newName.value = "";
  });

  el.batForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await addMaster(STORE_BATS, el.newBat.value);
    el.newBat.value = "";
  });

  el.recordForm.addEventListener("submit", saveRecordFromForm);
  el.cancelEditButton.addEventListener("click", resetRecordForm);
  el.demoDataButton.addEventListener("click", addDemoData);
  el.exportCsvButton.addEventListener("click", exportCsv);
  el.importCsvInput.addEventListener("change", importCsv);

  [el.filterName, el.filterBat, el.filterPeriod].forEach((select) => {
    select.addEventListener("change", renderView);
  });

  el.scoreChart.addEventListener("pointermove", showChartTooltip);
  el.scoreChart.addEventListener("pointerleave", hideChartTooltip);
  window.addEventListener("resize", renderView);
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAMES)) {
        db.createObjectStore(STORE_NAMES, { keyPath: "name" });
      }
      if (!db.objectStoreNames.contains(STORE_BATS)) {
        db.createObjectStore(STORE_BATS, { keyPath: "name" });
      }
      if (!db.objectStoreNames.contains(STORE_RECORDS)) {
        db.createObjectStore(STORE_RECORDS, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function tx(storeName, mode = "readonly") {
  return state.db.transaction(storeName, mode).objectStore(storeName);
}

function getAll(storeName) {
  return new Promise((resolve, reject) => {
    const request = tx(storeName).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

function put(storeName, value) {
  return new Promise((resolve, reject) => {
    const request = tx(storeName, "readwrite").put(value);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function remove(storeName, key) {
  return new Promise((resolve, reject) => {
    const request = tx(storeName, "readwrite").delete(key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function seedDefaults() {
  const names = await getAll(STORE_NAMES);
  const bats = await getAll(STORE_BATS);
  const records = await getAll(STORE_RECORDS);
  if (names.length === 0) {
    await put(STORE_NAMES, { name: "はるた", createdAt: Date.now() });
    await put(STORE_NAMES, { name: "ゆうた", createdAt: Date.now() + 1 });
  }
  if (bats.length === 0) {
    await put(STORE_BATS, { name: "いつものバット", createdAt: Date.now() });
    await put(STORE_BATS, { name: "軽いバット", createdAt: Date.now() + 1 });
  }
  if (records.length === 0) {
    await seedDemoRecords();
  }
}

async function seedDemoRecords() {
  const today = startOfDay(new Date());
  const demoNames = ["はるた", "ゆうた"];
  const demoBats = ["いつものバット", "軽いバット"];
  const now = Date.now();
  let created = 0;

  for (let daysAgo = 364; daysAgo >= 0; daysAgo -= 1) {
    const date = toDateInput(addDays(today, -daysAgo));
    const dayIndex = 364 - daysAgo;
    for (let personIndex = 0; personIndex < demoNames.length; personIndex += 1) {
      const pattern = (dayIndex + personIndex * 3) % 7;
      if (pattern === 2 || pattern === 6) continue;

      const name = demoNames[personIndex];
      const bat = demoBats[(dayIndex + personIndex) % demoBats.length];
      const seasonBoost = Math.floor(dayIndex / 18);
      const wave = Math.round(Math.sin((dayIndex + personIndex * 9) / 12) * 18);
      const count = 20 + ((dayIndex * 7 + personIndex * 11) % 46);
      const average = clampScore(330 + seasonBoost + wave + personIndex * 16);
      const best = clampScore(average + 28 + ((dayIndex * 5 + personIndex * 13) % 78));
      await put(STORE_RECORDS, {
        id: createRecordId({ date, name, bat }),
        date,
        name,
        bat,
        count,
        average,
        best,
        updatedAt: now + created,
      });
      created += 1;
    }
  }
}

async function addDemoData() {
  await put(STORE_NAMES, { name: "はるた", createdAt: Date.now() });
  await put(STORE_NAMES, { name: "ゆうた", createdAt: Date.now() + 1 });
  await put(STORE_BATS, { name: "いつものバット", createdAt: Date.now() });
  await put(STORE_BATS, { name: "軽いバット", createdAt: Date.now() + 1 });
  await seedDemoRecords();
  await refreshAll();
  showNotice("デモデータを追加しました。閲覧モードで確認できます。");
  switchMode("view");
}

async function refreshAll() {
  const [names, bats, records] = await Promise.all([
    getAll(STORE_NAMES),
    getAll(STORE_BATS),
    getAll(STORE_RECORDS),
  ]);
  state.names = names.sort(sortByCreatedThenName);
  state.bats = bats.sort(sortByCreatedThenName);
  state.records = records.sort((a, b) => b.updatedAt - a.updatedAt);
  renderMasters();
  renderSelectors();
  renderHistory();
  renderView();
}

function sortByCreatedThenName(a, b) {
  return (a.createdAt || 0) - (b.createdAt || 0) || a.name.localeCompare(b.name, "ja");
}

async function addMaster(storeName, rawName) {
  const name = rawName.trim();
  if (!name) {
    showNotice("名前を入力してください。");
    return;
  }

  await put(storeName, { name, createdAt: Date.now() });
  await refreshAll();
  showNotice(`${name}を追加しました。`);
}

function renderMasters() {
  el.masterChips.innerHTML = "";
  state.names.forEach((item) => el.masterChips.append(chip(`名前: ${item.name}`)));
  state.bats.forEach((item) => el.masterChips.append(chip(`バット: ${item.name}`)));
}

function chip(text) {
  const node = document.createElement("span");
  node.className = "chip";
  node.textContent = text;
  return node;
}

function renderSelectors() {
  fillOptions(el.recordName, state.names.map((item) => item.name));
  fillOptions(el.recordBat, state.bats.map((item) => item.name));
  fillOptions(el.filterName, ["すべて", ...state.names.map((item) => item.name)]);
  fillOptions(el.filterBat, ["すべて", ...state.bats.map((item) => item.name)]);
}

function fillOptions(select, values) {
  const current = select.value;
  select.innerHTML = "";
  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.append(option);
  });
  if (values.includes(current)) {
    select.value = current;
  }
}

function setToday() {
  el.recordDate.value = toDateInput(new Date());
}

async function saveRecordFromForm(event) {
  event.preventDefault();

  const formRecord = {
    date: el.recordDate.value,
    name: el.recordName.value,
    bat: el.recordBat.value,
    count: Number(el.recordCount.value),
    average: Number(el.recordAverage.value),
    best: Number(el.recordBest.value),
  };

  if (!isValidRecord(formRecord)) {
    showNotice("入力内容を確認してください。");
    return;
  }

  const editingId = el.editingId.value;
  if (editingId) {
    const next = {
      ...formRecord,
      id: createRecordId(formRecord),
      updatedAt: Date.now(),
    };
    if (editingId !== next.id) {
      await remove(STORE_RECORDS, editingId);
      await mergeRecord(next, true);
    } else {
      await put(STORE_RECORDS, next);
    }
    showNotice("記録を更新しました。");
  } else {
    await mergeRecord(formRecord, true);
    showNotice("記録を保存しました。");
  }

  resetRecordForm();
  await refreshAll();
}

function isValidRecord(record) {
  return isValidDateInput(record.date)
    && record.name
    && record.bat
    && Number.isInteger(record.count)
    && record.count > 0
    && Number.isFinite(record.average)
    && Number.isFinite(record.best)
    && record.average >= 0
    && record.best >= 0;
}

async function mergeRecord(record, shouldCombine) {
  const id = createRecordId(record);
  const existing = state.records.find((item) => item.id === id) || await getRecord(id);
  const now = Date.now();
  if (existing && shouldCombine) {
    const totalCount = existing.count + record.count;
    const weightedAverage = ((existing.count * existing.average) + (record.count * record.average)) / totalCount;
    await put(STORE_RECORDS, {
      ...existing,
      count: totalCount,
      average: roundOne(weightedAverage),
      best: Math.max(existing.best, record.best),
      updatedAt: now,
    });
    return;
  }

  await put(STORE_RECORDS, {
    id,
    date: record.date,
    name: record.name,
    bat: record.bat,
    count: record.count,
    average: roundOne(record.average),
    best: roundOne(record.best),
    updatedAt: now,
  });
}

function getRecord(id) {
  return new Promise((resolve, reject) => {
    const request = tx(STORE_RECORDS).get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function createRecordId(record) {
  return [record.date, record.name, record.bat].map(encodeURIComponent).join("|");
}

function resetRecordForm() {
  el.editingId.value = "";
  el.recordForm.reset();
  setToday();
  el.saveRecordButton.textContent = "保存";
  el.cancelEditButton.classList.add("hidden");
}

function renderHistory() {
  el.historyList.innerHTML = "";
  if (state.records.length === 0) {
    el.historyList.append(emptyText("まだ記録がありません。"));
    return;
  }

  state.records.slice(0, 10).forEach((record) => {
    const card = document.createElement("article");
    card.className = "history-card";
    card.innerHTML = `
      <div>
        <div class="history-title">${escapeHtml(formatDate(record.date))} / ${escapeHtml(record.name)} / ${escapeHtml(record.bat)}</div>
        <div class="history-meta">
          <span>${record.count}回</span>
          <span>平均 ${formatScore(record.average)}</span>
          <span>ベスト ${formatScore(record.best)}</span>
        </div>
      </div>
      <div class="history-actions">
        <button type="button" data-action="edit">編集</button>
        <button class="danger-button" type="button" data-action="delete">削除</button>
      </div>
    `;
    card.querySelector('[data-action="edit"]').addEventListener("click", () => editRecord(record.id));
    card.querySelector('[data-action="delete"]').addEventListener("click", () => deleteRecord(record.id));
    el.historyList.append(card);
  });
}

function emptyText(text) {
  const node = document.createElement("p");
  node.className = "notice";
  node.textContent = text;
  return node;
}

function editRecord(id) {
  const record = state.records.find((item) => item.id === id);
  if (!record) return;
  el.editingId.value = record.id;
  el.recordName.value = record.name;
  el.recordBat.value = record.bat;
  el.recordDate.value = record.date;
  el.recordCount.value = record.count;
  el.recordAverage.value = record.average;
  el.recordBest.value = record.best;
  el.saveRecordButton.textContent = "更新";
  el.cancelEditButton.classList.remove("hidden");
  switchMode("input");
  el.recordCount.focus();
}

async function deleteRecord(id) {
  if (!confirm("この記録を削除しますか？")) return;
  await remove(STORE_RECORDS, id);
  await refreshAll();
  showNotice("記録を削除しました。");
}

function switchMode(mode) {
  document.querySelectorAll(".tab-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === mode);
  });
  document.getElementById("inputMode").classList.toggle("active", mode === "input");
  document.getElementById("viewMode").classList.toggle("active", mode === "view");
  if (mode === "view") {
    renderView();
  }
}

function renderView() {
  const filtered = getFilteredRecords();
  const total = filtered.reduce((sum, record) => sum + record.count, 0);
  el.totalCount.textContent = `${total.toLocaleString("ja-JP")}回`;
  el.recordDays.textContent = `${filtered.length.toLocaleString("ja-JP")}日`;
  drawChart(filtered);
}

function getFilteredRecords() {
  const name = el.filterName.value;
  const bat = el.filterBat.value;
  const period = el.filterPeriod.value;
  const today = startOfDay(new Date());
  const minDate = period === "all" ? null : addDays(today, -Number(period) + 1);

  return state.records
    .filter((record) => name === "すべて" || record.name === name)
    .filter((record) => bat === "すべて" || record.bat === bat)
    .filter((record) => !minDate || parseLocalDate(record.date) >= minDate)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function drawChart(records) {
  const canvas = el.scoreChart;
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  const cssWidth = Math.max(320, rect.width || canvas.clientWidth || 900);
  const cssHeight = Math.max(300, Math.min(520, Math.round(cssWidth * 0.58)));
  canvas.width = Math.round(cssWidth * ratio);
  canvas.height = Math.round(cssHeight * ratio);
  canvas.style.height = `${cssHeight}px`;

  const ctx = canvas.getContext("2d");
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, cssWidth, cssHeight);
  state.chartPoints = [];

  el.chartEmpty.classList.toggle("hidden", records.length > 0);
  hideChartTooltip();
  if (records.length === 0) return;

  const pad = { top: 24, right: 18, bottom: 48, left: 48 };
  const chartWidth = cssWidth - pad.left - pad.right;
  const chartHeight = cssHeight - pad.top - pad.bottom;
  const maxScore = Math.max(...records.map((record) => Math.max(record.average, record.best)), 10);
  const yMax = Math.ceil(maxScore / 100) * 100;

  drawGrid(ctx, pad, chartWidth, chartHeight, yMax);

  const points = records.map((record, index) => {
    const x = pad.left + (records.length === 1 ? chartWidth / 2 : (chartWidth * index) / (records.length - 1));
    return {
      record,
      x,
      averageY: yFor(record.average, yMax, pad, chartHeight),
      bestY: yFor(record.best, yMax, pad, chartHeight),
    };
  });

  drawLine(ctx, points, "averageY", "#2563eb");
  drawLine(ctx, points, "bestY", "#f59e0b");

  points.forEach((point) => {
    drawPoint(ctx, point.x, point.averageY, "#2563eb");
    drawPoint(ctx, point.x, point.bestY, "#f59e0b");
  });

  drawXAxis(ctx, points, pad, cssHeight);
  state.chartPoints = points;
}

function drawGrid(ctx, pad, chartWidth, chartHeight, yMax) {
  ctx.strokeStyle = "#e6edf6";
  ctx.fillStyle = "#667085";
  ctx.lineWidth = 1;
  ctx.font = "12px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";

  for (let i = 0; i <= 4; i += 1) {
    const value = (yMax / 4) * i;
    const y = pad.top + chartHeight - (chartHeight * i) / 4;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(pad.left + chartWidth, y);
    ctx.stroke();
    ctx.fillText(String(Math.round(value)), pad.left - 8, y);
  }
}

function drawXAxis(ctx, points, pad, cssHeight) {
  ctx.fillStyle = "#667085";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const maxLabels = window.innerWidth < 520 ? 4 : 7;
  const step = Math.max(1, Math.ceil(points.length / maxLabels));
  points.forEach((point, index) => {
    if (index % step !== 0 && index !== points.length - 1) return;
    ctx.fillText(shortDate(point.record.date), point.x, cssHeight - pad.bottom + 18);
  });
}

function drawLine(ctx, points, key, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  points.forEach((point, index) => {
    if (index === 0) {
      ctx.moveTo(point.x, point[key]);
    } else {
      ctx.lineTo(point.x, point[key]);
    }
  });
  ctx.stroke();
}

function drawPoint(ctx, x, y, color) {
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x, y, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

function yFor(value, max, pad, chartHeight) {
  return pad.top + chartHeight - (value / max) * chartHeight;
}

function showChartTooltip(event) {
  if (state.chartPoints.length === 0) return;
  const rect = el.scoreChart.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const nearest = state.chartPoints.reduce((best, point) => {
    const distance = Math.abs(point.x - x);
    return distance < best.distance ? { point, distance } : best;
  }, { point: null, distance: Infinity }).point;
  if (!nearest) return;

  const record = nearest.record;
  el.chartTooltip.innerHTML = `
    <strong>${escapeHtml(formatDate(record.date))}</strong>
    <div>${escapeHtml(record.name)} / ${escapeHtml(record.bat)}</div>
    <div>${record.count}回</div>
    <div>平均 ${formatScore(record.average)} / ベスト ${formatScore(record.best)}</div>
  `;
  const left = Math.min(Math.max(nearest.x + 10, 8), rect.width - 228);
  const top = Math.max(Math.min(Math.min(nearest.averageY, nearest.bestY) - 16, rect.height - 96), 8);
  el.chartTooltip.style.left = `${left}px`;
  el.chartTooltip.style.top = `${top}px`;
  el.chartTooltip.classList.remove("hidden");
}

function hideChartTooltip() {
  el.chartTooltip.classList.add("hidden");
}

function exportCsv() {
  const header = ["名前", "バット", "日付", "回数", "平均", "ベスト"];
  const rows = state.records
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name, "ja") || a.bat.localeCompare(b.bat, "ja"))
    .map((record) => [record.name, record.bat, record.date, record.count, record.average, record.best]);
  const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `dream-swing-records-${toDateInput(new Date())}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showNotice("CSVを出力しました。");
}

async function importCsv(event) {
  const file = event.target.files[0];
  if (!file) return;

  const text = await file.text();
  const rows = parseCsv(text);
  let imported = 0;
  let skipped = 0;

  for (const row of rows.slice(1)) {
    const [name, bat, date, countRaw, averageRaw, bestRaw] = row.map((value) => value.trim());
    const record = {
      name,
      bat,
      date,
      count: Number(countRaw),
      average: Number(averageRaw),
      best: Number(bestRaw),
    };

    if (!isValidRecord(record)) {
      skipped += 1;
      continue;
    }

    await put(STORE_NAMES, { name, createdAt: Date.now() + imported });
    await put(STORE_BATS, { name: bat, createdAt: Date.now() + imported });
    await mergeRecord(record, true);
    imported += 1;
  }

  event.target.value = "";
  await refreshAll();
  showNotice(`CSVを読み込みました。取り込み${imported}件、スキップ${skipped}件。`);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        i += 1;
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

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    el.storageStatus.textContent = "端末保存";
    return;
  }
  navigator.serviceWorker.register("service-worker.js")
    .then(() => {
      el.storageStatus.textContent = "オフライン対応";
    })
    .catch(() => {
      el.storageStatus.textContent = "端末保存";
    });
}

function showNotice(message) {
  el.notice.textContent = message;
}

function toDateInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseLocalDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function isValidDateInput(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
  const date = parseLocalDate(value);
  return toDateInput(date) === value;
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatDate(value) {
  const date = parseLocalDate(value);
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

function shortDate(value) {
  const date = parseLocalDate(value);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function formatScore(value) {
  return Number(value).toLocaleString("ja-JP", { maximumFractionDigits: 1 });
}

function roundOne(value) {
  return Math.round(Number(value) * 10) / 10;
}

function clampScore(value) {
  return Math.max(100, Math.min(999, Math.round(value)));
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

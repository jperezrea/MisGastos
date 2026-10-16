'use strict';

/* ================= utilidades ================= */
const KEY = 'gastos.v1';
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const MESES_C = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
// Pasteles neutros: uno por categoría (los primeros se asignan en orden)
const PALETTE = ['#A7C4E5', '#C3B5E3', '#F0D3A6', '#EDB8C8', '#A8DCD9', '#B9DDB0', '#F4B9A0', '#CFC6B8',
  '#B5D8C0', '#E6D9A2', '#D9C2E9', '#BFD3C1', '#E8C4B0', '#B8C7D9', '#E3BFBF', '#C9D6A8'];
const GREY = '#B4B1AC';

const $ = s => document.querySelector(s);
const fmtEur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const eur = n => fmtEur.format(n || 0);
const round2 = n => Math.round(n * 100) / 100;
let _uidN = 0;
const uid = () => Date.now().toString(36) + (_uidN++).toString(36) + Math.random().toString(36).slice(2, 6);
const pad = n => String(n).padStart(2, '0');
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const curMonth = () => todayStr().slice(0, 7);
const addMonths = (m, k) => {
  let [y, mo] = m.split('-').map(Number);
  mo += k;
  while (mo > 12) { mo -= 12; y++; }
  while (mo < 1) { mo += 12; y--; }
  return `${y}-${pad(mo)}`;
};
const monthLabel = m => { const [y, mo] = m.split('-').map(Number); return `${MESES[mo - 1]} ${y}`; };
const daysIn = m => { const [y, mo] = m.split('-').map(Number); return new Date(y, mo, 0).getDate(); };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const parseAmount = s => {
  s = String(s ?? '').trim().replace(/[\s€]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return s && isFinite(n) ? round2(n) : NaN;
};
const amountStr = n => String(n).replace('.', ',');
const dayLabel = d => {
  const [y, m, dd] = d.split('-').map(Number);
  return new Date(y, m - 1, dd).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' });
};
const byDateDesc = (a, b) => b.date.localeCompare(a.date) || (b.ts || 0) - (a.ts || 0);

// Mezcla un color con blanco/negro para generar tonos de subcategorías
function shade(hex, t) {
  const n = parseInt(hex.slice(1), 16);
  let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const target = t >= 0 ? 255 : 0, k = Math.abs(t);
  r = Math.round(r + (target - r) * k); g = Math.round(g + (target - g) * k); b = Math.round(b + (target - b) * k);
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

/* ================= datos ================= */
const SEED_EXPENSE = [
  ['Vivienda y suministros', '🏠', ['Alquiler/Hipoteca', 'Impuestos', 'Servicios', 'Móvil', 'Otros']],
  ['Seguros', '🛡️', ['Vida', 'Hogar', 'Coche', 'Responsabilidad civil', 'Otros']],
  ['Transporte', '🚗', ['Gasolina', 'Lavado', 'Parking', 'Bus/Metro/Uber', 'Multas', 'Otros']],
  ['Compra', '🛒', ['Casa', 'Personal', 'Moda', 'Otros']],
  ['Salud y forma física', '💪', ['Farmacia', 'Deporte', 'Otros']],
  ['Ocio y social', '🎉', ['Suscripciones', 'Social', 'Ocio', 'Viajes', 'Regalos', 'Restaurantes', 'Otros']],
  ['Trabajo y formación', '💼', ['ICOMEM', 'Congresos/Cursos', 'Otros']],
];
const SEED_INCOME = [
  ['Trabajo', '💶', ['Nómina', 'Guardias', 'Extras', 'Otros']],
  ['Otros ingresos', '💰', ['Devoluciones', 'Regalos', 'Otros']],
];

function seed() {
  let i = 0;
  const mk = (type, list) => list.map(([name, icon, subs]) => ({
    id: uid(), type, name, icon, color: PALETTE[i++ % PALETTE.length], budget: null,
    subs: subs.map(n => ({ id: uid(), name: n })),
  }));
  return {
    version: 1,
    categories: [...mk('expense', SEED_EXPENSE), ...mk('income', SEED_INCOME)],
    movements: [],
    recurring: [],
    settings: { startScreen: 'inicio', chart: 'pie', theme: 'dark' },
  };
}

function load() {
  try {
    const s = localStorage.getItem(KEY);
    if (s) {
      const d = JSON.parse(s);
      d.settings = Object.assign({ startScreen: 'inicio', chart: 'pie', theme: 'dark' }, d.settings);
      d.recurring = d.recurring || [];
      return d;
    }
  } catch (e) { /* datos corruptos o almacenamiento bloqueado */ }
  return seed();
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); }
  catch (e) { toast('⚠️ No se pudo guardar'); }
}

let db = load();
const ui = { month: curMonth(), drill: null, sub: null, showAll: false, filter: 'all', draft: null };

const cat = id => db.categories.find(c => c.id === id);
const subOf = (c, id) => c && c.subs.find(s => s.id === id);
const catsOf = type => db.categories.filter(c => c.type === type);
const inMonth = m => db.movements.filter(x => x.date.startsWith(m));
const total = (arr, type) => round2(arr.filter(x => x.type === type).reduce((a, x) => a + x.amount, 0));

/* ================= recurrentes ================= */
function runRecurring() {
  const today = todayStr(), cur = today.slice(0, 7);
  const before = budgetSnapshot();
  let added = 0;
  for (const r of db.recurring) {
    if (!r.active) continue;
    let m = addMonths(r.lastMonth, 1);
    while (m <= cur) {
      const date = `${m}-${pad(Math.min(r.day, daysIn(m)))}`;
      if (date > today) break;
      db.movements.push({ id: uid(), type: r.type, amount: r.amount, catId: r.catId, subId: r.subId, date, note: r.note, recId: r.id, ts: Date.now() });
      r.lastMonth = m;
      m = addMonths(m, 1);
      added++;
    }
  }
  if (added) {
    save();
    toast(`↻ ${added} movimiento${added > 1 ? 's' : ''} fijo${added > 1 ? 's' : ''} añadido${added > 1 ? 's' : ''}`);
    checkBudgets(before);
  }
  return added;
}

/* ================= piezas de interfaz ================= */
let toastT;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('show'), 2200);
}

const topbar = (title, back, right = '') =>
  `<header class="top">${back ? `<a class="back" href="${back}">Atrás</a>` : '<span></span>'}<h1>${title}</h1><div style="text-align:right">${right}</div></header>`;

function movRow(x) {
  const c = cat(x.catId), s = subOf(c, x.subId);
  const color = c ? c.color : GREY;
  const title = s ? s.name : c ? c.name : 'Sin categoría';
  const sub = [s && c ? c.name : '', x.note].filter(Boolean).map(esc).join(' · ');
  return `<a class="row" href="#editar/${x.id}">
    <span class="ico" style="background:${color}33">${c ? c.icon : '•'}</span>
    <span class="grow"><b class="ellipsis">${esc(title)}${x.recId ? '<i class="tag">fijo</i>' : ''}</b>${sub ? `<small>${sub}</small>` : ''}</span>
    <span class="amt ${x.type === 'expense' ? 'exp' : 'inc'}">${x.type === 'expense' ? '−' : '+'}${eur(x.amount)}</span>
  </a>`;
}

function summary(inc, exp) {
  const bal = round2(inc - exp);
  return `<section class="card summary">
    <div><small>Ingresos</small><b class="inc">${eur(inc)}</b></div>
    <div><small>Gastos</small><b class="exp">${eur(exp)}</b></div>
    <div><small>Balance</small><b class="${bal >= 0 ? 'inc' : 'exp'}">${bal > 0 ? '+' : ''}${eur(bal)}</b></div>
  </section>`;
}

function groupByCat(movs) {
  const map = new Map();
  for (const x of movs) {
    if (x.type !== 'expense') continue;
    const c = cat(x.catId);
    const k = c ? c.id : '_';
    if (!map.has(k)) map.set(k, { id: k, name: c ? c.name : 'Sin categoría', icon: c ? c.icon : '•', color: c ? c.color : GREY, value: 0 });
    map.get(k).value += x.amount;
  }
  return [...map.values()].map(g => ({ ...g, value: round2(g.value) })).sort((a, b) => b.value - a.value);
}

function groupBySub(movs, c) {
  const map = new Map();
  for (const x of movs) {
    if (x.type !== 'expense' || x.catId !== c.id) continue;
    const s = subOf(c, x.subId);
    const k = s ? s.id : '_';
    if (!map.has(k)) map.set(k, { id: k, name: s ? s.name : 'Sin subcategoría', icon: '', value: 0 });
    map.get(k).value += x.amount;
  }
  const arr = [...map.values()].sort((a, b) => b.value - a.value);
  const n = arr.length;
  arr.forEach((g, i) => { g.value = round2(g.value); g.color = shade(c.color, n > 1 ? -0.28 + (i / (n - 1)) * 0.6 : 0); });
  return arr;
}

function donut(groups, sum, label, act, selId) {
  const R = 74, W = 30, C = 2 * Math.PI * R;
  const gap = groups.length > 1 ? 1.6 : 0;
  let off = 0;
  const arcs = groups.map(g => {
    const len = g.value / sum * C;
    const a = `<circle class="arc" ${act ? `data-act="${act}" data-id="${g.id}"` : ''} r="${R}" cx="100" cy="100" fill="none"
      stroke="${g.color}" stroke-width="${selId && selId === g.id ? W + 8 : W}" opacity="${selId && selId !== g.id ? .35 : 1}" stroke-dasharray="${Math.max(len - gap, 0.5)} ${C}" stroke-dashoffset="${-off}"/>`;
    off += len;
    return a;
  }).join('');
  return `<div class="donutwrap"><svg class="donut" viewBox="0 0 200 200" role="img" aria-label="${esc(label)}">
    <g transform="rotate(-90 100 100)">${arcs}</g>
    <text x="100" y="94" class="dl">${esc(label)}</text>
    <text x="100" y="118" class="dv">${eur(sum)}</text></svg></div>`;
}

function legend(groups, sum, act, selId) {
  return `<div class="legend">${groups.map(g => `
    <button ${act ? `data-act="${act}" data-id="${g.id}"` : ''} class="li ${selId === g.id ? 'sel' : ''}">
      <span class="dot" style="background:${g.color}"></span>
      <span class="grow ellipsis">${g.icon ? g.icon + ' ' : ''}${esc(g.name)}</span>
      <span class="num">${eur(g.value)}</span>
      <span class="pct">${Math.round(g.value / sum * 100)}%</span>
      <span class="chev">${act === 'drill' ? '›' : selId === g.id ? '✓' : ''}</span>
    </button>`).join('')}</div>`;
}

function bars(groups, sum, act, selId) {
  const max = Math.max(...groups.map(g => g.value));
  return `<div class="bars">${groups.map(g => `
    <button ${act ? `data-act="${act}" data-id="${g.id}"` : ''} class="bar ${selId === g.id ? 'sel' : ''}">
      <div class="bl"><span class="ellipsis">${g.icon ? g.icon + ' ' : ''}${esc(g.name)}</span>
      <span><span class="num">${eur(g.value)}</span> <span class="muted" style="font-size:13px">${Math.round(g.value / sum * 100)}%</span></span></div>
      <div class="track"><div class="fill" style="width:${g.value / max * 100}%;background:${g.color}"></div></div>
    </button>`).join('')}</div>`;
}

/* ================= presupuestos ================= */
const LEVELS = [100, 80, 50];
// Nivel visual: rojo desde el 80 %, negro desde el 100 %
const budgetLevel = pct => pct >= 100 ? 'black' : pct >= 80 ? 'red' : '';

// Todos los presupuestos definidos: de categoría y de subcategoría
function budgetTargets() {
  const out = [];
  for (const c of catsOf('expense')) {
    if (c.budget > 0) out.push({ key: c.id, c, s: null, budget: c.budget });
    for (const s of c.subs) if (s.budget > 0) out.push({ key: `${c.id}/${s.id}`, c, s, budget: s.budget });
  }
  return out;
}

function spentFor(m, c, s) {
  return round2(db.movements
    .filter(x => x.type === 'expense' && x.catId === c.id && (!s || x.subId === s.id) && x.date.startsWith(m))
    .reduce((a, x) => a + x.amount, 0));
}

// Porcentaje de cada presupuesto en el mes actual (antes de un cambio)
function budgetSnapshot() {
  const m = curMonth(), snap = {};
  for (const t of budgetTargets()) snap[t.key] = spentFor(m, t.c, t.s) / t.budget * 100;
  return snap;
}

// Compara con la foto anterior y avisa de los umbrales 50/80/100 % que se acaban de cruzar
function checkBudgets(before) {
  const m = curMonth(), alerts = [];
  for (const t of budgetTargets()) {
    const spent = spentFor(m, t.c, t.s), pct = spent / t.budget * 100;
    const level = LEVELS.find(l => (before[t.key] || 0) < l && pct >= l);
    if (level) alerts.push({ ...t, spent, pct, level });
  }
  if (alerts.length) showBudgetAlerts(alerts.sort((a, b) => b.level - a.level));
}

function showBudgetAlerts(alerts) {
  const old = $('#sheet');
  if (old) old.remove();
  const title = { 100: 'Presupuesto agotado', 80: 'Presupuesto al 80 %', 50: 'Mitad del presupuesto' };
  const el = document.createElement('div');
  el.id = 'sheet';
  el.innerHTML = `<div class="sheet" role="alertdialog" aria-modal="true">
    ${alerts.map(a => {
      const left = round2(a.budget - a.spent);
      return `<div class="alert lvl-${a.level}">
        <div class="alert-ico">${a.level >= 100 ? '⛔' : a.level >= 80 ? '⚠️' : '🔔'}</div>
        <div class="grow">
          <b>${title[a.level]}</b>
          <div>${a.c.icon} ${esc(a.c.name)}${a.s ? ' › ' + esc(a.s.name) : ''}</div>
          <small>${eur(a.spent)} de ${eur(a.budget)} (${Math.round(a.pct)} %) · ${left >= 0 ? `quedan ${eur(left)}` : `te has pasado ${eur(-left)}`}</small>
        </div></div>`;
    }).join('')}
    <button class="btn primary" data-act="closeSheet">Entendido</button>
  </div>`;
  document.body.appendChild(el);
}

function budgetBlock(c, spent, s) {
  const budget = s ? s.budget : c.budget;
  const pct = spent / budget * 100;
  const left = round2(budget - spent);
  const lvl = budgetLevel(pct);
  return `<div class="budget ${s ? 'sub' : ''} ${lvl ? 'lvl-' + lvl : ''}">
    <div class="bl"><span class="ellipsis">${s ? '↳ ' + esc(s.name) : `${c.icon} ${esc(c.name)}`}</span><span class="num">${eur(spent)} <span class="muted" style="font-weight:400">/ ${eur(budget)}</span></span></div>
    <div class="track"><div class="fill" style="width:${Math.min(pct, 100)}%;background:${c.color}"></div></div>
    <small>${left >= 0 ? `Quedan ${eur(left)}` : `Te has pasado ${eur(-left)}`} · ${Math.round(pct)}%</small>
  </div>`;
}

// Bloques de presupuesto de una categoría (ella misma + sus subcategorías) para un mes
function budgetBlocks(c, m) {
  let html = c.budget > 0 ? budgetBlock(c, spentFor(m, c, null)) : '';
  for (const s of c.subs) if (s.budget > 0) html += budgetBlock(c, spentFor(m, c, s), s);
  return html;
}

/* ================= vistas ================= */
const VIEWS = {};

// Lista de movimientos del mes con filtros por categoría y subcategoría
function movementsSection(m, movs, fc, fs) {
  const chip = (act, id, label, on, color) =>
    `<button class="chip sm ${on ? 'on' : ''}" style="--c:${color || 'var(--accent)'}" data-act="${act}" data-id="${id}">${label}</button>`;

  // Solo las categorías con movimientos este mes (gastos primero) y la seleccionada
  const used = new Set(movs.map(x => x.catId));
  const cats = [...catsOf('expense'), ...catsOf('income')].filter(c => used.has(c.id) || (fc && c.id === fc.id));
  let html = `<div id="movs" class="cardhead" style="margin:22px 4px 8px"><h3 style="margin:0">Movimientos</h3>
    ${movs.length ? `<a class="link" href="#mes/${m}">Carpeta del mes ›</a>` : ''}</div>`;
  if (cats.length) {
    html += `<div class="chips scroll">${chip('fcatsel', '', 'Todas', !fc)}${cats.map(c =>
      chip('fcatsel', c.id, `${c.icon} ${esc(c.name)}`, fc && fc.id === c.id, c.color)).join('')}</div>`;
  }
  if (fc) {
    const usedS = new Set(movs.filter(x => x.catId === fc.id).map(x => subOf(fc, x.subId) ? x.subId : '_'));
    const subs = fc.subs.filter(s => usedS.has(s.id) || (fs && fs.id === s.id));
    if (usedS.has('_')) subs.push({ id: '_', name: 'Sin subcategoría' });
    if (subs.length) {
      html += `<div class="chips scroll">${chip('fsubsel', '', 'Todas', !fs, fc.color)}${subs.map(s =>
        chip('fsubsel', s.id, esc(s.name), fs && fs.id === s.id, fc.color)).join('')}</div>`;
    }
  }

  let list = movs;
  if (fc) list = list.filter(x => x.catId === fc.id);
  if (fs) list = list.filter(x => fs.id === '_' ? !subOf(fc, x.subId) : x.subId === fs.id);
  list = [...list].sort(byDateDesc);

  if (!list.length) return html + `<section class="card empty" style="padding:18px">Sin movimientos${fc ? ' con este filtro' : ' este mes'}</section>`;

  const net = round2(total(list, 'income') - total(list, 'expense'));
  html += `<p class="hint" style="margin:6px 4px 0">${list.length} movimiento${list.length === 1 ? '' : 's'} · <b class="${net >= 0 ? 'inc' : 'exp'}">${net > 0 ? '+' : ''}${eur(net)}</b></p>`;

  const LIMIT = 10;
  const shown = fc || ui.showAll ? list : list.slice(0, LIMIT);
  html += dayGroups(shown);
  if (shown.length < list.length) html += `<button class="btn secondary" data-act="showAll">Ver los ${list.length} movimientos</button>`;
  return html;
}

// Movimientos agrupados por día, con el neto de cada día
function dayGroups(list) {
  return [...new Set(list.map(x => x.date))].map(d => {
    const dl = list.filter(x => x.date === d);
    const net = round2(total(dl, 'income') - total(dl, 'expense'));
    return `<div class="dayhead"><span>${dayLabel(d)}</span><span>${net > 0 ? '+' : ''}${eur(net)}</span></div>
      <section class="card flush">${dl.map(movRow).join('')}</section>`;
  }).join('');
}

VIEWS.inicio = () => {
  const m = ui.month, movs = inMonth(m);
  const inc = total(movs, 'income'), exp = total(movs, 'expense');
  const fc = ui.drill && cat(ui.drill);                 // categoría filtrada (gasto o ingreso)
  const fs = fc && ui.sub ? subOf(fc, ui.sub) || (ui.sub === '_' ? { id: '_' } : null) : null;
  const drill = fc && fc.type === 'expense' ? fc : null; // la gráfica solo desglosa gastos
  const pie = db.settings.chart !== 'bar';
  const groups = drill ? groupBySub(movs, drill) : groupByCat(movs);
  const sum = round2(groups.reduce((a, g) => a + g.value, 0));

  let chart;
  if (!sum) {
    chart = `<div class="empty"><div class="big">🌱</div>${drill ? 'Sin gastos en esta categoría' : 'Aún no hay gastos este mes'}<br><a href="#nuevo">Añadir un gasto</a></div>`;
  } else if (pie) {
    chart = donut(groups, sum, drill ? drill.name : 'Gastos del mes', drill ? 'subsel' : 'drill', fs && fs.id) +
      legend(groups, sum, drill ? 'subsel' : 'drill', fs && fs.id);
  } else {
    chart = bars(groups, sum, drill ? 'subsel' : 'drill', fs && fs.id);
  }

  let html = `
    <div class="monthnav">
      <button data-act="month" data-d="-1" aria-label="Mes anterior">‹</button>
      <h1>${monthLabel(m)}</h1>
      <button data-act="month" data-d="1" aria-label="Mes siguiente">›</button>
    </div>
    ${summary(inc, exp)}
    <section class="card">
      <div class="cardhead">
        ${drill ? `<button class="link" data-act="undrill">‹ Todas</button>` : `<h2>Gastos por categoría</h2>`}
        <div class="seg">
          <button data-act="chart" data-v="pie" class="${pie ? 'on' : ''}">Tarta</button>
          <button data-act="chart" data-v="bar" class="${pie ? '' : 'on'}">Barras</button>
        </div>
      </div>
      ${drill ? `<h2 style="margin:-2px 0 6px">${drill.icon} ${esc(drill.name)}</h2>` : ''}
      ${chart}
      ${drill && budgetBlocks(drill, m) ? `<div style="margin-top:14px">${budgetBlocks(drill, m)}</div>` : ''}
    </section>`;

  if (!drill) {
    const blocks = catsOf('expense').map(c => budgetBlocks(c, m)).join('');
    if (blocks) html += `<h3>Presupuestos</h3><section class="card">${blocks}</section>`;

    // Últimos 6 meses
    const months = [...Array(6)].map((_, i) => addMonths(m, i - 5));
    const data = months.map(mm => { const mv = inMonth(mm); return { m: mm, i: total(mv, 'income'), e: total(mv, 'expense') }; });
    const max = Math.max(1, ...data.map(d => Math.max(d.i, d.e)));
    html += `<h3>Últimos 6 meses</h3><section class="card">
      <div class="keys" style="margin-bottom:6px"><span style="--c:var(--inc)">Ingresos</span><span style="--c:var(--exp)">Gastos</span></div>
      <div class="trend">${data.map(d => `
        <button class="col ${d.m === m ? 'sel' : ''}" data-act="setmonth" data-m="${d.m}">
          <div class="pair"><i class="i" style="height:${d.i / max * 100}%"></i><i class="e" style="height:${d.e / max * 100}%"></i></div>
          <small>${MESES_C[Number(d.m.slice(5)) - 1]}</small>
        </button>`).join('')}</div>
    </section>`;
  }

  html += movementsSection(m, movs, fc, fs);
  return html;
};

VIEWS.meses = () => {
  const set = new Set(db.movements.map(x => x.date.slice(0, 7)));
  set.add(curMonth());
  const months = [...set].sort().reverse();
  const years = [...new Set(months.map(m => m.slice(0, 4)))];
  let html = `<h1>Meses</h1>`;
  for (const y of years) {
    const ym = db.movements.filter(x => x.date.startsWith(y));
    const bal = round2(total(ym, 'income') - total(ym, 'expense'));
    html += `<div class="yearhead"><h2>${y}</h2><small>Balance anual <b class="${bal >= 0 ? 'inc' : 'exp'}">${eur(bal)}</b></small></div><div class="folders">`;
    for (const m of months.filter(mm => mm.startsWith(y))) {
      const mv = inMonth(m), e = total(mv, 'expense'), i = total(mv, 'income'), b = round2(i - e);
      html += `<a class="folder ${m === curMonth() ? 'cur' : ''}" href="#mes/${m}">
        <span class="fico">📁</span>
        <b>${MESES[Number(m.slice(5)) - 1]}</b>
        <small>${mv.length} movimiento${mv.length === 1 ? '' : 's'}</small>
        <div class="fl">
          <span><em>Gastos</em><span class="num exp">${eur(e)}</span></span>
          <span><em>Ingresos</em><span class="num inc">${eur(i)}</span></span>
          <span><em>Balance</em><span class="num ${b >= 0 ? 'inc' : 'exp'}">${eur(b)}</span></span>
        </div></a>`;
    }
    html += `</div>`;
  }
  return html;
};

VIEWS.mes = m => {
  if (!/^\d{4}-\d{2}$/.test(m || '')) m = curMonth();
  const all = inMonth(m);
  const f = ui.filter;
  const list = all.filter(x => f === 'all' || x.type === f).sort(byDateDesc);
  let html = topbar(monthLabel(m), '#meses', `<button class="mini" data-act="exportMonth" data-m="${m}">CSV</button>`);
  html += summary(total(all, 'income'), total(all, 'expense'));
  html += `<div class="seg full">
      <button data-act="filter" data-v="all" class="${f === 'all' ? 'on' : ''}">Todos</button>
      <button data-act="filter" data-v="expense" class="${f === 'expense' ? 'on' : ''}">Gastos</button>
      <button data-act="filter" data-v="income" class="${f === 'income' ? 'on' : ''}">Ingresos</button>
    </div>`;
  if (!list.length) html += `<div class="card empty"><div class="big">📭</div>Carpeta vacía<br><a href="#nuevo">Añadir movimiento</a></div>`;
  html += dayGroups(list);
  html += `<button class="btn secondary" data-act="setmonth" data-m="${m}" data-go="1">Ver gráfica del mes</button>`;
  return html;
};

function newDraft(extra) {
  return Object.assign({ _for: 'new', type: 'expense', amountStr: '', catId: null, subId: null, date: todayStr(), note: '', repeat: false }, extra);
}

function formView(id) {
  const x = id ? db.movements.find(m => m.id === id) : null;
  if (id && !x) return topbar('Movimiento', '#inicio') + `<div class="card empty">Este movimiento ya no existe.</div>`;
  if (!ui.draft || ui.draft._for !== (id || 'new')) {
    ui.draft = x ? { _for: id, type: x.type, amountStr: amountStr(x.amount), catId: x.catId, subId: x.subId, date: x.date, note: x.note || '' } : newDraft();
  }
  const d = ui.draft;
  const c = cat(d.catId);
  let html = id ? topbar('Editar', 'javascript:history.back()') : `<h1>Nuevo movimiento</h1>`;
  html += `
    <div class="seg full">
      <button data-act="ftype" data-v="expense" class="exp ${d.type === 'expense' ? 'on' : ''}">Gasto</button>
      <button data-act="ftype" data-v="income" class="inc ${d.type === 'income' ? 'on' : ''}">Ingreso</button>
    </div>
    <label class="amount"><input id="f-amount" inputmode="decimal" placeholder="0,00" autocomplete="off" value="${esc(d.amountStr)}"><span>€</span></label>
    <h3>Categoría</h3>
    <div class="chips">${catsOf(d.type).map(k => `
      <button class="chip ${k.id === d.catId ? 'on' : ''}" style="--c:${k.color}" data-act="fcat" data-id="${k.id}">${k.icon} ${esc(k.name)}</button>`).join('')}
    </div>
    ${c && c.subs.length ? `<h3>Subcategoría</h3><div class="chips">${c.subs.map(s => `
      <button class="chip ${s.id === d.subId ? 'on' : ''}" style="--c:${c.color}" data-act="fsub" data-id="${s.id}">${esc(s.name)}</button>`).join('')}</div>` : ''}
    <h3>Detalles</h3>
    <section class="card fields">
      <label class="field"><span>Fecha</span><input type="date" id="f-date" value="${d.date}"></label>
      <label class="field"><span>Nota</span><input id="f-note" placeholder="Opcional" value="${esc(d.note)}" autocomplete="off"></label>
      ${!id ? `<label class="field"><span>Repetir cada mes</span><input type="checkbox" class="switch" id="f-repeat" ${d.repeat ? 'checked' : ''}></label>` : ''}
    </section>
    ${!id && d.repeat ? `<p class="hint">Se añadirá automáticamente el mismo día de cada mes. Lo puedes cambiar o parar en la pestaña <b>Fijos</b>.</p>` : ''}
    ${x && x.recId ? `<p class="hint">↻ Generado por un movimiento fijo. Editarlo aquí solo cambia este mes.</p>` : ''}
    <button class="btn primary" data-act="fsave">Guardar</button>
    ${id ? `<button class="btn danger" data-act="fdel" data-id="${id}">Eliminar</button>` : ''}`;
  return html;
}
VIEWS.nuevo = () => formView(null);
VIEWS.editar = id => formView(id);

function syncDraft() {
  const d = ui.draft;
  if (!d) return;
  const a = $('#f-amount'), dt = $('#f-date'), n = $('#f-note'), r = $('#f-repeat');
  if (a) d.amountStr = a.value;
  if (dt) d.date = dt.value;
  if (n) d.note = n.value;
  if (r) d.repeat = r.checked;
}

VIEWS.recurrentes = () => {
  let html = `<h1>Fijos</h1>
    <p class="hint" style="margin-top:-6px">Movimientos que se repiten cada mes (nómina, alquiler, suscripciones…). Se añaden solos cuando llega su día.</p>`;
  const groups = [['expense', 'Gastos fijos'], ['income', 'Ingresos fijos']];
  for (const [type, title] of groups) {
    const list = db.recurring.filter(r => r.type === type);
    if (!list.length) continue;
    const sum = round2(list.filter(r => r.active).reduce((a, r) => a + r.amount, 0));
    html += `<div class="cardhead" style="margin:22px 4px 8px"><h3 style="margin:0">${title}</h3><span class="num ${type === 'expense' ? 'exp' : 'inc'}" style="font-size:14px">${eur(sum)}/mes</span></div>
      <section class="card flush">${list.map(r => {
        const c = cat(r.catId), s = subOf(c, r.subId);
        return `<a class="row" href="#fijo/${r.id}" style="${r.active ? '' : 'opacity:.5'}">
          <span class="ico" style="background:${c ? c.color : GREY}33">${c ? c.icon : '•'}</span>
          <span class="grow"><b class="ellipsis">${esc(s ? s.name : c ? c.name : 'Sin categoría')}${r.active ? '' : '<i class="tag">pausado</i>'}</b>
          <small>Día ${r.day} de cada mes${r.note ? ' · ' + esc(r.note) : ''}</small></span>
          <span class="amt ${type === 'expense' ? 'exp' : 'inc'}">${eur(r.amount)}</span></a>`;
      }).join('')}</section>`;
  }
  if (!db.recurring.length) html += `<div class="card empty"><div class="big">↻</div>No tienes movimientos fijos todavía.</div>`;
  html += `<button class="btn primary" data-act="newrec">Añadir movimiento fijo</button>`;
  return html;
};

VIEWS.fijo = id => {
  const r = db.recurring.find(x => x.id === id);
  if (!r) return topbar('Fijo', '#recurrentes') + `<div class="card empty">No existe.</div>`;
  const c = cat(r.catId), s = subOf(c, r.subId);
  return topbar('Movimiento fijo', '#recurrentes') + `
    <section class="card" style="display:flex;gap:12px;align-items:center">
      <span class="ico" style="background:${c ? c.color : GREY}33">${c ? c.icon : '•'}</span>
      <span class="grow"><b>${esc(s ? s.name : c ? c.name : 'Sin categoría')}</b><br><small class="muted">${esc(c ? c.name : '')} · ${r.type === 'expense' ? 'Gasto' : 'Ingreso'}</small></span>
    </section>
    <section class="card fields">
      <label class="field"><span>Importe (€)</span><input id="r-amount" inputmode="decimal" value="${amountStr(r.amount)}"></label>
      <label class="field"><span>Día del mes</span><input id="r-day" type="number" inputmode="numeric" min="1" max="31" value="${r.day}"></label>
      <label class="field"><span>Nota</span><input id="r-note" placeholder="Opcional" value="${esc(r.note || '')}"></label>
      <label class="field"><span>Activo</span><input type="checkbox" class="switch" id="r-active" ${r.active ? 'checked' : ''}></label>
    </section>
    <p class="hint">Los cambios se aplican a partir del próximo mes. Los movimientos ya creados no se modifican.</p>
    <button class="btn primary" data-act="rsave" data-id="${r.id}">Guardar</button>
    <button class="btn danger" data-act="rdel" data-id="${r.id}">Eliminar fijo</button>`;
};

VIEWS.ajustes = () => {
  const st = db.settings;
  const years = [...new Set([curMonth(), ...db.movements.map(x => x.date)].map(d => d.slice(0, 4)))].sort().reverse();
  const seg = (key, opts) => `<div class="seg">${opts.map(([v, l]) =>
    `<button data-act="setting" data-k="${key}" data-v="${v}" class="${st[key] === v ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  return `<h1>Ajustes</h1>
    <h3>Categorías</h3>
    <section class="card flush menu">
      <a class="row" href="#categorias/expense"><span class="ico" style="background:#EDB8C833">📂</span><span class="grow">Categorías de gastos</span><span class="muted">${catsOf('expense').length} ›</span></a>
      <a class="row" href="#categorias/income"><span class="ico" style="background:#B5D8C033">📂</span><span class="grow">Categorías de ingresos</span><span class="muted">${catsOf('income').length} ›</span></a>
    </section>
    <p class="hint">Dentro de cada categoría puedes fijar un presupuesto mensual, cambiar color, icono y subcategorías.</p>

    <h3>Apariencia</h3>
    <section class="card fields">
      <div class="field"><span>Tema</span>${seg('theme', [['dark', 'Oscuro'], ['light', 'Claro'], ['auto', 'Auto']])}</div>
      <div class="field"><span>Al abrir</span>${seg('startScreen', [['inicio', 'Inicio'], ['nuevo', 'Añadir']])}</div>
    </section>
    <p class="hint">«Al abrir: Añadir» hace que la app arranque directamente en la pantalla de nuevo movimiento (también al volver a ella tras unos minutos).</p>

    <h3>Exportar a Excel (CSV)</h3>
    <section class="card flush menu">
      ${years.map(y => `<button class="row" data-act="exportYear" data-y="${y}"><span class="ico" style="background:#B9DDB033">📊</span><span class="grow">Año ${y}</span><span class="muted">›</span></button>`).join('')}
      <button class="row" data-act="exportAll"><span class="ico" style="background:#B9DDB033">📊</span><span class="grow">Todos los movimientos</span><span class="muted">›</span></button>
    </section>
    <p class="hint">Cada carpeta de mes también tiene su botón CSV arriba a la derecha.</p>

    <h3>Copia de seguridad</h3>
    <section class="card flush menu">
      <button class="row" data-act="backup"><span class="ico" style="background:#A7C4E533">⬆️</span><span class="grow">Guardar copia</span><span class="muted">›</span></button>
      <button class="row" data-act="restore"><span class="ico" style="background:#A7C4E533">⬇️</span><span class="grow">Restaurar copia</span><span class="muted">›</span></button>
    </section>
    <p class="hint">Tus datos solo viven en este iPhone. Guarda una copia de vez en cuando en «Archivos › iCloud Drive». ${db.settings.lastBackup ? `Última copia: ${new Date(db.settings.lastBackup).toLocaleDateString('es-ES')}.` : '<b>Aún no has hecho ninguna copia.</b>'}</p>
    <p class="hint" style="text-align:center;margin-top:24px">${db.movements.length} movimientos guardados · Mis Gastos v1</p>`;
};

VIEWS.categorias = type => {
  type = type === 'income' ? 'income' : 'expense';
  const list = catsOf(type);
  return topbar(type === 'income' ? 'Ingresos' : 'Gastos', '#ajustes') + `
    <section class="card flush">${list.map((c, i) => `
      <div class="row">
        <div class="updown"><button data-act="catMove" data-id="${c.id}" data-d="-1" ${i ? '' : 'disabled'}>▲</button><button data-act="catMove" data-id="${c.id}" data-d="1" ${i < list.length - 1 ? '' : 'disabled'}>▼</button></div>
        <a href="#categoria/${c.id}" style="display:flex;align-items:center;gap:12px;flex:1;min-width:0">
          <span class="ico" style="background:${c.color}">${c.icon}</span>
          <span class="grow"><b class="ellipsis">${esc(c.name)}</b><small>${c.subs.length} subcategorías${c.budget ? ' · Presupuesto ' + eur(c.budget) : ''}${c.subs.some(s => s.budget > 0) ? ' · ' + c.subs.filter(s => s.budget > 0).length + ' con presupuesto' : ''}</small></span>
          <span class="muted">›</span>
        </a>
      </div>`).join('')}
    </section>
    <button class="btn primary" data-act="catAdd" data-type="${type}">Nueva categoría</button>`;
};

VIEWS.categoria = id => {
  const c = cat(id);
  if (!c) return topbar('Categoría', '#ajustes') + `<div class="card empty">No existe.</div>`;
  return topbar(esc(c.name), `#categorias/${c.type}`) + `
    <section class="card fields">
      <label class="field"><span>Nombre</span><input data-ch="catName" data-id="${c.id}" value="${esc(c.name)}"></label>
      <label class="field"><span>Icono (emoji)</span><input data-ch="catIcon" data-id="${c.id}" value="${esc(c.icon)}" style="max-width:80px"></label>
      ${c.type === 'expense' ? `<label class="field"><span>Presupuesto mensual</span><input data-ch="catBudget" data-id="${c.id}" inputmode="decimal" placeholder="Sin límite" value="${c.budget ? amountStr(c.budget) : ''}"></label>` : ''}
      <div class="field col"><span>Color</span><div class="swatches">${PALETTE.map(p =>
        `<button class="swatch ${p === c.color ? 'on' : ''}" style="--c:${p}" data-act="catColor" data-id="${c.id}" data-v="${p}" aria-label="Color ${p}"></button>`).join('')}</div></div>
    </section>
    <h3>Subcategorías</h3>
    <section class="card flush">${c.subs.map(s => `
      <div class="row"><span class="dot" style="background:${c.color}"></span>
        <span class="grow"><span class="ellipsis" style="display:block">${esc(s.name)}</span>${c.type === 'expense' && s.budget ? `<small>Presupuesto ${eur(s.budget)}</small>` : ''}</span>
        ${c.type === 'expense' ? `<button class="mini" data-act="subBudget" data-id="${c.id}" data-s="${s.id}" aria-label="Presupuesto">€</button>` : ''}
        <button class="mini" data-act="subRename" data-id="${c.id}" data-s="${s.id}" aria-label="Renombrar">✎</button>
        <button class="mini red" data-act="subDel" data-id="${c.id}" data-s="${s.id}" aria-label="Borrar">✕</button></div>`).join('') || '<div class="empty" style="padding:16px">Sin subcategorías</div>'}
    </section>
    ${c.type === 'expense' ? `<p class="hint">€ = presupuesto mensual de la subcategoría · ✎ = renombrar · ✕ = borrar. Te avisaré al llegar al 50, 80 y 100 % de cada presupuesto.</p>` : ''}
    <button class="btn secondary" data-act="subAdd" data-id="${c.id}">Añadir subcategoría</button>
    <button class="btn danger" data-act="catDel" data-id="${c.id}">Eliminar categoría</button>`;
};

/* ================= exportar / importar ================= */
async function shareFile(name, text, type) {
  const file = new File([text], name, { type });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file] });
      return true;
    }
  } catch (e) {
    if (e.name === 'AbortError') return false;
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return true;
}

function toCSV(movs) {
  const rows = [['Fecha', 'Tipo', 'Categoría', 'Subcategoría', 'Importe', 'Nota', 'Fijo']];
  for (const x of [...movs].sort((a, b) => a.date.localeCompare(b.date))) {
    const c = cat(x.catId), s = subOf(c, x.subId);
    const [y, m, d] = x.date.split('-');
    rows.push([`${d}/${m}/${y}`, x.type === 'expense' ? 'Gasto' : 'Ingreso', c ? c.name : '', s ? s.name : '',
      ((x.type === 'expense' ? -1 : 1) * x.amount).toFixed(2).replace('.', ','), x.note || '', x.recId ? 'Sí' : '']);
  }
  const cell = v => { v = String(v); return /[;"\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; };
  return '﻿' + rows.map(r => r.map(cell).join(';')).join('\r\n');
}

function exportCSV(movs, name) {
  if (!movs.length) return toast('No hay movimientos que exportar');
  shareFile(name, toCSV(movs), 'text/csv');
}

function importBackup(file) {
  const rd = new FileReader();
  rd.onload = () => {
    try {
      const d = JSON.parse(rd.result);
      if (!Array.isArray(d.categories) || !Array.isArray(d.movements)) throw new Error('formato');
      if (!confirm(`La copia tiene ${d.movements.length} movimientos.\n\nSe reemplazarán TODOS los datos actuales (${db.movements.length} movimientos). ¿Continuar?`)) return;
      d.recurring = d.recurring || [];
      d.settings = Object.assign({ startScreen: 'inicio', chart: 'pie', theme: 'dark' }, d.settings);
      db = d;
      save();
      applyTheme();
      toast('Copia restaurada ✓');
      location.hash = '#inicio';
      render();
    } catch (e) {
      alert('Ese archivo no es una copia válida de Mis Gastos.');
    }
  };
  rd.readAsText(file);
}

/* ================= acciones ================= */
function keepMovsInView() {
  const el = $('#movs');
  if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 8);
  // Desplaza cada fila de filtros para que se vea el elegido
  document.querySelectorAll('.chips.scroll').forEach(row => {
    const on = row.querySelector('.chip.on');
    if (on) row.scrollLeft = on.offsetLeft - row.offsetLeft - (row.clientWidth - on.offsetWidth) / 2;
  });
}

const ACT = {
  month(el) { ui.month = addMonths(ui.month, Number(el.dataset.d)); ui.showAll = false; render(); },
  setmonth(el) { ui.month = el.dataset.m; ui.showAll = false; if (el.dataset.go) location.hash = '#inicio'; else render(); },
  drill(el) { if (el.dataset.id !== '_') { ui.drill = el.dataset.id; ui.sub = null; render(); } },
  undrill() { ui.drill = null; ui.sub = null; render(); },
  subsel(el) { ui.sub = ui.sub === el.dataset.id ? null : el.dataset.id; render(); },
  // Filtros de la lista: tras redibujar, mantiene la lista a la vista
  fcatsel(el) { ui.drill = el.dataset.id || null; ui.sub = null; render(); keepMovsInView(); },
  fsubsel(el) { ui.sub = el.dataset.id || null; render(); keepMovsInView(); },
  showAll() { ui.showAll = true; render(); },
  chart(el) { db.settings.chart = el.dataset.v; save(); render(); },
  filter(el) { ui.filter = el.dataset.v; render(); },

  ftype(el) {
    syncDraft();
    if (ui.draft.type !== el.dataset.v) { ui.draft.type = el.dataset.v; ui.draft.catId = null; ui.draft.subId = null; }
    render();
  },
  fcat(el) {
    syncDraft();
    if (ui.draft.catId !== el.dataset.id) { ui.draft.catId = el.dataset.id; ui.draft.subId = null; }
    render();
  },
  fsub(el) { syncDraft(); ui.draft.subId = ui.draft.subId === el.dataset.id ? null : el.dataset.id; render(); },
  fsave() {
    syncDraft();
    const d = ui.draft, amount = parseAmount(d.amountStr);
    if (!(amount > 0)) { toast('Introduce un importe'); $('#f-amount').focus(); return; }
    if (!cat(d.catId)) return toast('Elige una categoría');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) return toast('Fecha no válida');
    const fields = { type: d.type, amount, catId: d.catId, subId: d.subId, date: d.date, note: d.note.trim() };
    const editing = d._for !== 'new';
    const before = budgetSnapshot();
    if (editing) {
      Object.assign(db.movements.find(m => m.id === d._for), fields);
    } else {
      const mov = { id: uid(), ...fields, ts: Date.now() };
      if (d.repeat) {
        const r = { id: uid(), ...fields, day: Number(d.date.slice(8)), lastMonth: d.date.slice(0, 7), active: true };
        delete r.date;
        db.recurring.push(r);
        mov.recId = r.id;
      }
      db.movements.push(mov);
    }
    save();
    ui.draft = null;
    ui.month = d.date.slice(0, 7);
    ui.drill = null;
    ui.sub = null;
    toast(editing ? 'Cambios guardados ✓' : `${d.type === 'expense' ? 'Gasto' : 'Ingreso'} guardado ✓`);
    if (editing) history.back(); else location.hash = '#inicio';
    checkBudgets(before);
  },
  closeSheet() { const el = $('#sheet'); if (el) el.remove(); },
  fdel(el) {
    if (!confirm('¿Eliminar este movimiento?')) return;
    db.movements = db.movements.filter(m => m.id !== el.dataset.id);
    save(); ui.draft = null; toast('Eliminado');
    history.back();
  },

  newrec() { ui.draft = newDraft({ repeat: true }); location.hash = '#nuevo'; },
  rsave(el) {
    const r = db.recurring.find(x => x.id === el.dataset.id);
    const amount = parseAmount($('#r-amount').value), day = Math.round(Number($('#r-day').value));
    if (!(amount > 0)) return toast('Importe no válido');
    if (!(day >= 1 && day <= 31)) return toast('El día debe estar entre 1 y 31');
    const wasActive = r.active;
    Object.assign(r, { amount, day, note: $('#r-note').value.trim(), active: $('#r-active').checked });
    // Al reactivar no se rellenan los meses en pausa
    if (!wasActive && r.active) r.lastMonth = todayStr().slice(8) >= pad(day) ? curMonth() : addMonths(curMonth(), -1);
    save(); runRecurring(); toast('Guardado ✓');
    location.hash = '#recurrentes';
  },
  rdel(el) {
    if (!confirm('¿Eliminar este movimiento fijo?\nLos movimientos ya creados se conservan.')) return;
    db.recurring = db.recurring.filter(r => r.id !== el.dataset.id);
    db.movements.forEach(m => { if (m.recId === el.dataset.id) delete m.recId; });
    save(); toast('Eliminado'); location.hash = '#recurrentes';
  },

  setting(el) {
    db.settings[el.dataset.k] = el.dataset.v;
    save();
    if (el.dataset.k === 'theme') applyTheme();
    render();
  },
  exportMonth(el) { exportCSV(inMonth(el.dataset.m), `gastos-${el.dataset.m}.csv`); },
  exportYear(el) { exportCSV(db.movements.filter(x => x.date.startsWith(el.dataset.y)), `gastos-${el.dataset.y}.csv`); },
  exportAll() { exportCSV(db.movements, `gastos-todo-${todayStr()}.csv`); },
  async backup() {
    const ok = await shareFile(`copia-gastos-${todayStr()}.json`, JSON.stringify(db), 'application/json');
    if (ok) { db.settings.lastBackup = Date.now(); save(); render(); }
  },
  restore() { $('#importFile').click(); },

  catMove(el) {
    const c = cat(el.dataset.id), list = catsOf(c.type), i = list.indexOf(c), j = i + Number(el.dataset.d);
    if (j < 0 || j >= list.length) return;
    const ai = db.categories.indexOf(c), bi = db.categories.indexOf(list[j]);
    [db.categories[ai], db.categories[bi]] = [db.categories[bi], db.categories[ai]];
    save(); render();
  },
  catAdd(el) {
    const name = (prompt('Nombre de la nueva categoría') || '').trim();
    if (!name) return;
    const used = new Set(db.categories.map(c => c.color));
    const c = { id: uid(), type: el.dataset.type, name, icon: '🏷️', color: PALETTE.find(p => !used.has(p)) || PALETTE[db.categories.length % PALETTE.length], budget: null, subs: [{ id: uid(), name: 'Otros' }] };
    db.categories.push(c); save();
    location.hash = `#categoria/${c.id}`;
  },
  catColor(el) { cat(el.dataset.id).color = el.dataset.v; save(); render(); },
  catDel(el) {
    const c = cat(el.dataset.id);
    const n = db.movements.filter(m => m.catId === c.id).length + db.recurring.filter(r => r.catId === c.id).length;
    if (n) return alert(`No se puede eliminar «${c.name}» porque tiene ${n} movimiento(s) asociados.\n\nPuedes renombrarla si quieres.`);
    if (!confirm(`¿Eliminar la categoría «${c.name}»?`)) return;
    db.categories = db.categories.filter(k => k !== c); save();
    location.hash = `#categorias/${c.type}`;
  },
  subAdd(el) {
    const name = (prompt('Nombre de la subcategoría') || '').trim();
    if (!name) return;
    cat(el.dataset.id).subs.push({ id: uid(), name }); save(); render();
  },
  subBudget(el) {
    const s = subOf(cat(el.dataset.id), el.dataset.s);
    const v = prompt(`Presupuesto mensual para «${s.name}» (€)\nDéjalo vacío para quitarlo.`, s.budget ? amountStr(s.budget) : '');
    if (v === null) return;
    const n = parseAmount(v);
    if (v.trim() && !(n > 0)) return toast('Importe no válido');
    s.budget = n > 0 ? n : null;
    save(); render();
  },
  subRename(el) {
    const s = subOf(cat(el.dataset.id), el.dataset.s);
    const name = (prompt('Nuevo nombre', s.name) || '').trim();
    if (!name) return;
    s.name = name; save(); render();
  },
  subDel(el) {
    const c = cat(el.dataset.id), s = subOf(c, el.dataset.s);
    const n = db.movements.filter(m => m.subId === s.id).length;
    if (!confirm(`¿Borrar «${s.name}»?${n ? `\n\nSus ${n} movimiento(s) quedarán en «${c.name}» sin subcategoría.` : ''}`)) return;
    c.subs = c.subs.filter(k => k !== s);
    db.movements.forEach(m => { if (m.subId === s.id) m.subId = null; });
    db.recurring.forEach(r => { if (r.subId === s.id) r.subId = null; });
    save(); render();
  },
};

const CH = {
  catName(el) { const v = el.value.trim(); if (v) { cat(el.dataset.id).name = v; save(); } },
  catIcon(el) { const v = el.value.trim(); if (v) { cat(el.dataset.id).icon = v; save(); } },
  catBudget(el) {
    const v = parseAmount(el.value);
    cat(el.dataset.id).budget = v > 0 ? v : null;
    el.value = v > 0 ? amountStr(v) : '';
    save();
  },
};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (el && ACT[el.dataset.act]) { e.preventDefault(); ACT[el.dataset.act](el, e); }
});
document.addEventListener('change', e => {
  const el = e.target.closest('[data-ch]');
  if (el && CH[el.dataset.ch]) CH[el.dataset.ch](el, e);
  if (e.target.id === 'f-repeat') { syncDraft(); render(); }
  if (e.target.id === 'importFile' && e.target.files[0]) { importBackup(e.target.files[0]); e.target.value = ''; }
});

/* ================= navegación ================= */
const TAB_OF = { inicio: 'inicio', meses: 'meses', mes: 'meses', nuevo: 'nuevo', recurrentes: 'recurrentes', fijo: 'recurrentes', ajustes: 'ajustes', categorias: 'ajustes', categoria: 'ajustes' };

function parseHash() {
  const [name, arg] = (location.hash.slice(1) || 'inicio').split('/');
  return { name: VIEWS[name] ? name : 'inicio', arg: arg && decodeURIComponent(arg) };
}

function render() {
  const { name, arg } = parseHash();
  $('#view').innerHTML = VIEWS[name](arg);
  document.querySelectorAll('.tabbar a').forEach(a => a.classList.toggle('on', a.dataset.tab === TAB_OF[name]));
}

function route() {
  const { name } = parseHash();
  if (name !== 'nuevo' && name !== 'editar') ui.draft = null;
  render();
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);

function applyTheme() {
  document.documentElement.dataset.theme = db.settings.theme || 'dark';
  const dark = db.settings.theme === 'dark' || (db.settings.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name=theme-color]').content = dark ? '#141416' : '#f4f2ef';
}

// Al volver a la app tras un rato: recalcula fijos y, si está configurado, abre «Añadir»
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { hiddenAt = Date.now(); return; }
  const added = runRecurring();
  if (db.settings.startScreen === 'nuevo' && hiddenAt && Date.now() - hiddenAt > 3 * 60 * 1000 && parseHash().name !== 'nuevo') {
    location.hash = '#nuevo';
  } else if (added || (hiddenAt && curMonth() !== ui.month && Date.now() - hiddenAt > 3600 * 1000)) {
    render();
  }
});

/* ================= arranque ================= */
applyTheme();
runRecurring();
try { if (!localStorage.getItem(KEY)) save(); } catch (e) { /* sin almacenamiento */ }
if (!location.hash && db.settings.startScreen === 'nuevo') history.replaceState(null, '', '#nuevo');
route();

if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

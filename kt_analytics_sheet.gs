/**
 * KT аналитика — Google Таблица + Apps Script. Только читает Кейтаро, в трекере ничего не меняет.
 *
 * Каждое утро (триггер) или по кнопке:
 *   1. ГЕО группы (гео из названия «DE (…) (cab) …»): ROI 3д и 7д без сегодня; кампании: активные в КТ и с трафиком
 *      (активна в КТ и вчера ≥ «Трафик: мин. кликов вчера» — отсекает клики ботов/модерации),
 *      вердикт: масштабировать (+N, образец) / держать / следить / сокращать (кого выключить).
 *   2. МИНУСОВЫЕ кампании группы: заменить креатив (sub_id_3, рейтинг по ВСЕМ группам, гео = страна клика) или выключить.
 *   3. Листы «Гео», «Минусовые», «Кампании», «История» + JSON для букмарклета (doGet).
 *
 * Установка: Расширения → Apps Script → вставить этот код → сохранить → обновить таблицу →
 *   меню «KT аналитика → Установка» (ключ Кейтаро, листы, автозапуск) →
 *   Развернуть → Новое развёртывание → Веб-приложение: «Запуск от имени: я», «Доступ: все» →
 *   меню «KT аналитика → Ссылка для букмарклета».
 */

const PROPS = PropertiesService.getScriptProperties();
const SETTINGS = [
  // [подпись в листе «Настройки», ключ, по умолчанию]
  ['КТ адрес', 'url', 'https://harryhole.info'],
  ['Группа кампаний', 'group', 264],
  ['Мин. продаж за период', 'minSales', 5],
  ['Трафик: мин. кликов вчера', 'minClicks', 15],
  ['Масштаб: ROI 3д от, %', 'scaleRoi3', 30],
  ['Масштаб: ROI 7д от, %', 'scaleRoi7', 20],
  ['Масштаб: максимум +кампаний за раз', 'scaleMax', 2],
  ['Сокращать: ROI 3д ниже, %', 'cutRoi3', 10],
  ['Сокращать: ROI 7д ниже, %', 'cutRoi7', 5],
  ['Фиксированная цена продажи по гео (GEO=цена через запятую; остальные гео — авто по выплате)', 'fixedPrices', 'IT=27'],
  ['Допустимый минус кампании, × цены продажи', 'lossK', 1.5],
  ['Сокращать: максимум выключений в гео за раз', 'cutMax', 2],
  ['Креатив рабочий: ROI от, %', 'creoOkRoi', 20],
  ['Минусовых кампаний в разборе', 'losersTop', 10],
  ['Час автозапуска', 'hour', 9],
];
const COLORS = { scale: '#c6efce', cut: '#ffc7ce', rise: '#ffeb9c', dip: '#ffeb9c' };
const UK_CC = { UK: 'GB' };

// ---------- меню ----------

function onOpen() {
  SpreadsheetApp.getUi().createMenu('KT аналитика')
    .addItem('Запустить анализ сейчас', 'menuRun')
    .addItem('Установка / ключ Кейтаро', 'setup')
    .addItem('Ссылка для букмарклета', 'showLink')
    .addToUi();
}

function setup() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActive();
  let st = ss.getSheetByName('Настройки');
  if (!st) {
    st = ss.insertSheet('Настройки');
    st.getRange(1, 1, SETTINGS.length, 2).setValues(SETTINGS.map(s => [s[0], s[2]]));
    st.setColumnWidth(1, 260);
  }
  for (const n of ['Гео', 'Минусовые', 'Кампании', 'История']) if (!ss.getSheetByName(n)) ss.insertSheet(n);
  if (!ss.getSheetByName('_json')) ss.insertSheet('_json').hideSheet();

  const r = ui.prompt('Ключ API Кейтаро', 'Настройки → API. Пусто — оставить текущий' +
    (PROPS.getProperty('KT_KEY') ? ' (уже задан)' : ''), ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  if (r.getResponseText().trim()) PROPS.setProperty('KT_KEY', r.getResponseText().trim());
  if (!PROPS.getProperty('KT_KEY')) return ui.alert('Ключ не задан — анализ работать не будет');
  if (!PROPS.getProperty('WEB_TOKEN')) PROPS.setProperty('WEB_TOKEN', Utilities.getUuid().replace(/-/g, ''));

  // автозапуск раз в день
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'runAnalysis').forEach(t => ScriptApp.deleteTrigger(t));
  const c = cfg();
  ScriptApp.newTrigger('runAnalysis').timeBased().everyDays(1).atHour(c.hour).create();
  ui.alert('Готово. Автозапуск каждый день около ' + c.hour + ':00 (' + ss.getSpreadsheetTimeZone() + ').\n' +
    'Пороги — на листе «Настройки».\nДля букмарклета: Развернуть → Новое развёртывание → Веб-приложение ' +
    '(запуск от имени: я, доступ: все), затем меню «Ссылка для букмарклета».');
}

function menuRun() {
  const j = runAnalysis();
  SpreadsheetApp.getActive().toast('Гео: ' + j.geo.length + ', минусовых: ' + j.losers.length, 'Анализ готов', 5);
}

function showLink() {
  const url = ScriptApp.getService().getUrl();
  const tok = PROPS.getProperty('WEB_TOKEN');
  // getUrl() в новом редакторе часто отдаёт тестовую /dev — она пускает только редакторов, букмарклету не подходит
  const link = url && /\/exec$/.test(url) ? url
    : '(возьми ссылку, заканчивающуюся на /exec: Развернуть → Управление развёртываниями → Веб-приложение → URL)';
  SpreadsheetApp.getUi().alert(url && tok
    ? 'Впиши во вкладку «Аналитика» букмарклета:\n\nСсылка:\n' + link + '\n\nКлюч:\n' + tok +
      '\n\nКлюч не публикуй — по нему доступна аналитика.'
    : 'Сначала: меню «Установка», затем Развернуть → Новое развёртывание → Веб-приложение (доступ: все).');
}

// ---------- веб-приложение для букмарклета ----------

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (!p.t || p.t !== PROPS.getProperty('WEB_TOKEN')) return out({ error: 'неверный ключ букмарклета' });
  if (p.run === '1') {
    try { runAnalysis(); } catch (err) { return out({ error: String(err.message || err) }); }
  }
  return out(readJson() || { error: 'анализ ещё не запускался — меню «Запустить анализ сейчас»' });
}

function out(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

// JSON последнего анализа — в скрытом листе кусками (лимит ячейки 50к символов)
function saveJson(o) {
  const sh = SpreadsheetApp.getActive().getSheetByName('_json');
  const s = JSON.stringify(o), parts = [];
  for (let i = 0; i < s.length; i += 45000) parts.push([s.slice(i, i + 45000)]);
  sh.clear();
  sh.getRange(1, 1, parts.length, 1).setValues(parts);
}

function readJson() {
  const sh = SpreadsheetApp.getActive().getSheetByName('_json');
  if (!sh || !sh.getLastRow()) return null;
  return JSON.parse(sh.getRange(1, 1, sh.getLastRow(), 1).getValues().map(r => r[0]).join(''));
}

// ---------- Кейтаро ----------

function cfg() {
  const sh = SpreadsheetApp.getActive().getSheetByName('Настройки');
  const vals = {};
  if (sh) sh.getDataRange().getValues().forEach(r => { vals[r[0]] = r[1]; });
  const c = {};
  for (const [label, key, def] of SETTINGS) {
    const v = vals[label];
    c[key] = (v === '' || v == null) ? def : (typeof def === 'number' ? Number(v) : String(v));
  }
  c.url = c.url.replace(/\/+$/, '');
  // «IT=27, DE=45» -> { IT: 27, DE: 45 }
  c.fixed = {};
  String(c.fixedPrices || '').split(/[,;\s]+/).forEach(t => {
    const m = t.match(/^([A-Za-z]{2}(?:\([A-Za-z]{2}\))?)=(\d+(?:[.,]\d+)?)$/);
    if (m) c.fixed[m[1].toUpperCase()] = Number(m[2].replace(',', '.'));
  });
  return c;
}

function api(c, method, path, body) {
  const opt = { method: method, muteHttpExceptions: true, headers: { 'Api-Key': PROPS.getProperty('KT_KEY') } };
  if (body) { opt.contentType = 'application/json'; opt.payload = JSON.stringify(body); }
  for (let i = 0; i < 4; i++) {
    const r = UrlFetchApp.fetch(c.url + '/admin_api/v1' + path, opt);
    const code = r.getResponseCode();
    if (code < 300) { const t = r.getContentText(); return t.trim() ? JSON.parse(t) : null; }
    // 4xx — ошибка запроса или доступа, повтор не поможет
    if (code < 500) throw new Error('Кейтаро ' + code + ' ' + path + ': ' + r.getContentText().slice(0, 300));
    Utilities.sleep(3000 * (i + 1));
  }
  throw new Error('Кейтаро не отвечает: ' + path);
}

function report(c, from, to, dims, ids) {
  const body = {
    range: { from: from + ' 00:00:00', to: to + ' 23:59:59' },
    // доход — только подтверждённые продажи (sale_revenue); revenue в Кейтаро включает лиды в холде
    dimensions: dims, measures: ['clicks', 'sales', 'sale_revenue', 'revenue', 'cost'],
    filters: ids ? [{ name: 'campaign_id', operator: 'IN_LIST', expression: ids }] : [],
    limit: 10000, offset: 0,
  };
  const rows = [];
  for (;;) {
    const part = (api(c, 'POST', '/report/build', body) || {}).rows || [];
    part.forEach(r => { r.hold = num(r.revenue) - num(r.sale_revenue); r.revenue = r.sale_revenue; });
    rows.push(...part);
    if (part.length < body.limit) return rows;
    body.offset += body.limit;
  }
}

// ---------- метрики ----------

const num = x => { const v = Number(x); return isFinite(v) ? v : 0; };
const M = () => ({ clicks: 0, sales: 0, revenue: 0, cost: 0, hold: 0 });
function add(m, r) { for (const k of ['clicks', 'sales', 'revenue', 'cost', 'hold']) m[k] += num(r[k]); return m; }
const profit = m => m.revenue - m.cost;
const roi = m => m.cost > 0 ? profit(m) / m.cost * 100 : null;
const fr = v => v == null ? '—' : (v >= 0 ? '+' : '') + Math.round(v) + '%';
const fm = v => (v >= 0 ? '+' : '') + Math.round(v) + '$';
// гео из начала названия; язык в скобках сразу после — отдельное гео: «CH(FR) …» -> CH(FR), «IT (10828) …» -> IT
const geoOf = n => {
  const m = (n || '').match(/^\s*([A-Z]{2})(?:\s*\(\s*([A-Z]{2})\s*\))?/);
  return m ? (m[2] ? m[1] + '(' + m[2] + ')' : m[1]) : '??';
};
// страна клика для гео: CH(FR) -> CH, UK -> GB
const ccOf = g => UK_CC[g.slice(0, 2)] || g.slice(0, 2);
const r1 = v => v == null ? '' : Math.round(v * 10) / 10;

function geoVerdict(c, m3, m7) {
  const r3 = m3.sales >= c.minSales ? roi(m3) : null;
  const r7 = m7.sales >= c.minSales ? roi(m7) : null;
  if (r7 == null) {
    if (m7.cost > 0 && m7.sales === 0 && m7.clicks >= 300) return ['cut', '⛔ сокращать: 0 продаж за 7д'];
    return ['few', '⚫ мало данных (продаж 7д ' + m7.sales + ' < ' + c.minSales + ')'];
  }
  if (r3 == null) {
    if (r7 >= c.scaleRoi3) return ['scale', '🟢 масштабировать (по 7д, за 3д мало продаж)'];
    if (r7 < c.cutRoi7) return ['cut', '🔴 сокращать (по 7д)'];
    return ['hold', '⚪ держать'];
  }
  if (r3 >= c.scaleRoi3 && r7 >= c.scaleRoi7) return ['scale', '🟢 масштабировать'];
  if (r3 >= c.scaleRoi3) return ['rise', '🟡 растёт — подождать день, пока не масштабировать'];
  if (r3 < c.cutRoi3 && r7 < c.cutRoi7) return ['cut', '🔴 сокращать'];
  if (r3 < 0 && r7 >= c.scaleRoi7) return ['dip', '🟡 просадка — следить, пока не резать'];
  return ['hold', '⚪ держать'];
}

// ---------- анализ ----------

function runAnalysis() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(60000)) throw new Error('анализ уже идёт');
  try { return analyse(); } finally { lock.releaseLock(); }
}

function analyse() {
  const c = cfg();
  if (!PROPS.getProperty('KT_KEY')) throw new Error('нет ключа Кейтаро — меню «Установка»');
  const ss = SpreadsheetApp.getActive(), tz = ss.getSpreadsheetTimeZone();
  const day = n => Utilities.formatDate(new Date(Date.now() - n * 86400000), tz, 'yyyy-MM-dd');
  const today = day(0), y = day(1), d3 = day(3), d7 = day(7);
  const dm = s => s.slice(8, 10) + '.' + s.slice(5, 7);

  const allCamps = api(c, 'GET', '/campaigns') || [];
  const nameAll = {};
  allCamps.forEach(x => { nameAll[x.id] = x.name; });
  const camps = allCamps.filter(x => x.group_id === c.group);
  if (!camps.length) throw new Error('в группе ' + c.group + ' нет кампаний (или ключ её не видит)');
  const byid = {};
  camps.forEach(x => { byid[x.id] = x; });
  const ids = camps.map(x => x.id);

  const perCamp = (from, to) => {
    const o = {};
    report(c, from, to, ['campaign_id'], ids).forEach(r => { const id = num(r.campaign_id); add(o[id] = o[id] || M(), r); });
    return o;
  };
  const s3 = perCamp(d3, y), s7 = perCamp(d7, y), lv = perCamp(y, y);
  const clicksY = id => (lv[id] || M()).clicks;
  // активна в КТ — по статусу; с трафиком — активна и вчера набрала порог кликов
  const ktOn = new Set(camps.filter(x => x.state === 'active').map(x => x.id));
  const live = new Set(ids.filter(id => ktOn.has(id) && clicksY(id) >= c.minClicks));
  const m3of = id => s3[id] || M(), m7of = id => s7[id] || M();

  // креатив и основная страна кампании (7д)
  const campCreo = {}, campCc = {};
  report(c, d7, y, ['campaign_id', 'sub_id_3', 'country_code'], ids).forEach(r => {
    const id = num(r.campaign_id), creo = String(r.sub_id_3 || '').trim(), cc = String(r.country_code || '').trim().toUpperCase();
    if (creo) { campCreo[id] = campCreo[id] || {}; add(campCreo[id][creo] = campCreo[id][creo] || M(), r); }
    if (cc) { campCc[id] = campCc[id] || {}; add(campCc[id][cc] = campCc[id][cc] || M(), r); }
  });
  // рейтинг креативов: все доступные группы, гео = страна клика (7д).
  // если в названии кампании язык (CH(FR)) и страна клика совпадает — креатив идёт в пул CH(FR), не в общий CH
  const creoGeo = {};
  report(c, d7, y, ['campaign_id', 'country_code', 'sub_id_3']).forEach(r => {
    const creo = String(r.sub_id_3 || '').trim(), cc = String(r.country_code || '').trim().toUpperCase();
    if (!creo || !cc) return;
    const g = geoOf(nameAll[num(r.campaign_id)]);
    const key = g.includes('(') && ccOf(g) === cc ? g : cc;
    creoGeo[key] = creoGeo[key] || {};
    add(creoGeo[key][creo] = creoGeo[key][creo] || M(), r);
  });
  // пул креативов для гео: CH(FR) — свой языковой, остальные — по стране клика
  const poolKey = g => g.includes('(') ? g : ccOf(g);
  const top = o => Object.keys(o || {}).sort((a, b) => o[b].clicks - o[a].clicks)[0] || '';

  // ---- 1. гео ----
  // вердикт — по кампаниям с трафиком (что крутится сейчас); по всем кампаниям — справочно и для цены продажи
  const geos = {};
  camps.forEach(x => {
    const n = geoOf(x.name);
    const g = geos[n] = geos[n] || { m3: M(), m7: M(), all7: M(), camps: [] };
    g.camps.push(x.id);
    add(g.all7, m7of(x.id));
    if (live.has(x.id)) { add(g.m3, m3of(x.id)); add(g.m7, m7of(x.id)); }
  });
  // цена продажи: задана для гео → общая из настроек → выплата за продажу по гео → по группе
  const grp = M();
  Object.keys(geos).forEach(n => add(grp, geos[n].all7));
  // цена продажи: фиксированная из «Настроек» (IT=27) → авто: выплата за продажу по гео за 7д → по группе
  const priceOf = n => {
    if (c.fixed[n]) return [c.fixed[n], 'фиксированная'];
    const a = geos[n] && geos[n].all7;
    if (a && a.sales) return [a.revenue / a.sales, 'авто: выплата по гео'];
    return [grp.sales ? grp.revenue / grp.sales : 0, 'авто: выплата по группе'];
  };
  // допустимый минус кампании за 7д = lossK × цена продажи гео
  const limitOf = n => c.lossK * priceOf(n)[0];
  const campTxt = id => id + ' (' + fm(profit(m7of(id))) + ', ' + (m7of(id).sales ? 'ROI ' + fr(roi(m7of(id))) : '0 продаж') + ')';

  const geo = Object.keys(geos).sort((a, b) => profit(geos[b].m7) - profit(geos[a].m7)).map(name => {
    const g = geos[name], active = g.camps.filter(id => live.has(id)), ktActive = g.camps.filter(id => ktOn.has(id)).length;
    const [price, priceSrc] = priceOf(name), limit = limitOf(name);
    const [code, verdict] = active.length ? geoVerdict(c, g.m3, g.m7) : ['few', '⚫ нет кампаний с трафиком'];
    let action = '', template = null, creo = null, off = [];
    if (code === 'scale') {
      const good = active.filter(id => m7of(id).sales >= c.minSales && roi(m7of(id)) > 0);
      const best = good.sort((a, b) => roi(m7of(b)) - roi(m7of(a)))[0];
      // добавляем осторожно: +1, +2 только при очень сильном гео с запасом кампаний
      const n = Math.min(c.scaleMax, roi(g.m7) >= 50 && active.length >= 3 ? 2 : 1);
      action = '+' + n + (n === 1 ? ' кампания' : ' кампании');
      if (best) {
        template = { id: best, name: byid[best].name, roi7: roi(m7of(best)), creo: top(campCreo[best]) };
        action += ', образец: ' + best + ' ' + byid[best].name + ' (ROI 7д ' + fr(template.roi7) + ')';
      }
      // креатив для новых кампаний: лучший в этой стране по всем группам (страна клика)
      const cc = poolKey(name), pool = creoGeo[cc] || {};
      const ok = Object.keys(pool).filter(k => pool[k].sales >= c.minSales && roi(pool[k]) >= c.creoOkRoi)
        .sort((a, b) => profit(pool[b]) - profit(pool[a]));
      const cd = k => '«' + k + '» (' + cc + ': ROI 7д ' + fr(roi(pool[k])) + ', продаж ' + pool[k].sales + ')';
      if (ok.length) {
        creo = { name: ok[0], roi7: roi(pool[ok[0]]), sales: pool[ok[0]].sales, backup: ok[1] || '' };
        action += '; креатив ' + cd(ok[0]) + (template && template.creo === ok[0] ? ' — как в образце' : '') +
          (ok[1] ? ', запасной ' + cd(ok[1]) : '');
      } else if (template && template.creo) {
        action += '; креатив как в образце «' + template.creo + '» (других с ROI ≥ ' + c.creoOkRoi + '% и ' + c.minSales + '+ продажами в ' + cc + ' нет)';
      }
    } else if (code === 'cut') {
      // выключаем только ушедших в минус глубже допуска; не больше cutMax за раз, худшие первыми
      const bad = active.filter(id => profit(m7of(id)) < -limit).sort((a, b) => profit(m7of(a)) - profit(m7of(b)));
      const watch = active.filter(id => profit(m7of(id)) < 0 && profit(m7of(id)) >= -limit);
      off = bad.slice(0, c.cutMax);
      const parts = [];
      if (off.length) {
        parts.push((off.length === active.length ? 'выключить все: ' : 'выключить ' + off.length + ' из ' + active.length + ': ') +
          off.map(campTxt).join(', '));
        if (bad.length > off.length) parts.push('ещё за допуском: ' + bad.slice(off.length).map(campTxt).join(', ') + ' — на следующем прогоне');
      } else {
        parts.push('кампаний в минусе глубже −' + Math.round(limit) + '$ нет — никого не выключаем');
      }
      if (watch.length) parts.push('в пределах допуска, следить: ' + watch.map(campTxt).join(', '));
      // включены в КТ, но трафика нет — в минусовом гео их держать незачем
      const idle = g.camps.filter(id => ktOn.has(id) && !live.has(id));
      if (idle.length) parts.push('включены в КТ без трафика (<' + c.minClicks + ' кликов вчера): ' + idle.join(', ') + ' — выключить');
      action = parts.join('; ');
    }
    return {
      geo: name, active: active.length, ktActive, total: g.camps.length, code, verdict, action, template, creo, off,
      roi3: roi(g.m3), sales3: g.m3.sales, profit3: profit(g.m3),
      roi7: roi(g.m7), sales7: g.m7.sales, profit7: profit(g.m7), cost7: g.m7.cost, revenue7: g.m7.revenue, hold7: g.m7.hold,
      roi7All: roi(g.all7), profit7All: profit(g.all7), price, priceSrc, limit,
    };
  });
  const geoCode = {}, geoOff = {};
  geo.forEach(g => { geoCode[g.geo] = g.code; geoOff[g.geo] = g.off; });

  // ---- 2. минусовые кампании: с трафиком и в минусе глубже допуска гео ----
  const losers = [...live].filter(id => byid[id] && profit(m7of(id)) < -limitOf(geoOf(byid[id].name)))
    .sort((a, b) => profit(m7of(a)) - profit(m7of(b))).slice(0, c.losersTop).map(id => {
      const x = byid[id], m = m7of(id), g = geoOf(x.name);
      // языковое гео (CH(FR)) — свой пул; иначе основная страна клика кампании
      const cc = g.includes('(') ? g : (top(campCc[id]) || ccOf(g)), creo = top(campCreo[id]);
      const pool = creoGeo[cc] || {}, cur = pool[creo];
      const alts = Object.keys(pool).filter(k => k !== creo && pool[k].sales >= c.minSales && roi(pool[k]) >= c.creoOkRoi)
        .sort((a, b) => profit(pool[b]) - profit(pool[a]));
      const alt = alts[0] || '', am = alt ? pool[alt] : null;
      let verdict, action;
      if (geoCode[g] === 'cut' && !geoOff[g].includes(id)) {
        // гео сокращаем, но за раз не больше cutMax — эта в очереди
        action = 'off';
        verdict = '⏳ выключить следующим прогоном — за раз в гео выключаем не больше ' + c.cutMax;
      } else if (geoCode[g] === 'cut') {
        action = 'off';
        verdict = '❌ выключить — гео в минусе, количество кампаний сокращаем' +
          (alt ? '; если оставлять — только с креативом «' + alt + '» (' + cc + ': ROI 7д ' + fr(roi(am)) + ', продаж ' + am.sales + ')' : '');
      } else if (cur && cur.sales >= c.minSales && roi(cur) >= c.creoOkRoi) {
        action = 'off';
        verdict = '❌ выключить — креатив «' + creo + '» в ' + cc + ' плюсовой (ROI ' + fr(roi(cur)) + ' по всем группам), проблема в кабинете/трафике';
      } else if (alt) {
        action = 'swap';
        verdict = '🔁 заменить креатив «' + (creo || '?') + '» → «' + alt + '» (' + cc + ': ROI 7д ' + fr(roi(am)) +
          ', продаж ' + am.sales + ', профит ' + fm(profit(am)) + ' по всем группам)';
      } else {
        action = 'off';
        verdict = '❌ выключить — в ' + cc + ' нет креатива с ROI ≥ ' + c.creoOkRoi + '% и ' + c.minSales + '+ продажами';
      }
      return {
        id, name: x.name, geo: g, cc, creo, action, verdict, alt, altRoi: am ? roi(am) : null,
        roi3: roi(m3of(id)), profit3: profit(m3of(id)), roi7: roi(m), sales7: m.sales, profit7: profit(m), cost7: m.cost,
        creoRoi: cur ? roi(cur) : null, creoSales: cur ? cur.sales : 0, limit: limitOf(g),
      };
    });

  const head = 'Кейтаро · группа ' + c.group + ' · ' + dm(today) + '  (3д: ' + dm(d3) + '–' + dm(y) + ' · 7д: ' + dm(d7) + '–' + dm(y) +
    ' · с трафиком: ≥' + c.minClicks + ' кликов за ' + dm(y) + ')';
  const result = { generated: new Date().toISOString(), date: today, head, geo, losers };

  // ---- 3. листы ----
  writeSheet(ss, 'Гео', head,
    ['Гео', 'Активных в КТ', 'С трафиком', 'Всего', 'ROI 3д %', 'Продаж 3д', 'Профит 3д', 'ROI 7д %', 'Продаж 7д', 'Профит 7д', 'Доход 7д (подтв.)', 'Расход 7д', 'Холд 7д (не в профите)',
      'ROI 7д все кампании %', 'Цена продажи', 'Допуск минуса', 'Вердикт', 'Действие'],
    geo.map(g => [g.geo, g.ktActive, g.active, g.total, r1(g.roi3), g.sales3, r1(g.profit3), r1(g.roi7), g.sales7, r1(g.profit7), r1(g.revenue7), r1(g.cost7), r1(g.hold7),
      r1(g.roi7All), r1(g.price) + ' (' + g.priceSrc + ')', -Math.round(g.limit), g.verdict, g.action]),
    geo.map(g => COLORS[g.code] || null), [50, 90, 80, 50, 70, 70, 80, 70, 70, 80, 90, 80, 100, 100, 150, 80, 260, 560]);
  writeSheet(ss, 'Минусовые', head,
    ['ID', 'Кампания', 'Гео', 'Страна клика', 'Креатив', 'ROI 3д %', 'Профит 3д', 'ROI 7д %', 'Продаж 7д', 'Профит 7д',
      'Допуск минуса', 'Креатив в гео: ROI %', 'Креатив в гео: продаж', 'Замена', 'Замена: ROI %', 'Вердикт'],
    losers.map(l => [l.id, l.name, l.geo, l.cc, l.creo, r1(l.roi3), r1(l.profit3), r1(l.roi7), l.sales7, r1(l.profit7),
      -Math.round(l.limit), r1(l.creoRoi), l.creoSales, l.alt, r1(l.altRoi), l.verdict]),
    losers.map(l => l.action === 'swap' ? COLORS.rise : COLORS.cut), [60, 300, 50, 60, 140, 70, 80, 70, 70, 80, 80, 90, 90, 140, 90, 520]);
  const all = ids.slice().sort((a, b) => profit(m7of(b)) - profit(m7of(a)));
  writeSheet(ss, 'Кампании', head,
    ['ID', 'Кампания', 'Гео', 'Статус КТ', 'Кликов вчера', 'С трафиком', 'Креатив', 'ROI 3д %', 'Продаж 3д', 'Профит 3д', 'ROI 7д %', 'Продаж 7д', 'Профит 7д', 'Доход 7д (подтв.)', 'Расход 7д', 'Холд 7д'],
    all.map(id => [id, byid[id].name, geoOf(byid[id].name), byid[id].state || '', clicksY(id), live.has(id) ? 'да' : 'нет', top(campCreo[id]),
      r1(roi(m3of(id))), m3of(id).sales, r1(profit(m3of(id))), r1(roi(m7of(id))), m7of(id).sales, r1(profit(m7of(id))),
      r1(m7of(id).revenue), r1(m7of(id).cost), r1(m7of(id).hold)]),
    null, [60, 320, 50, 80, 80, 80, 140, 70, 70, 80, 70, 70, 80, 90, 80, 80]);

  // история: одна строка на гео в день, повторный запуск за тот же день перезаписывает
  const hs = ss.getSheetByName('История') || ss.insertSheet('История');
  if (!hs.getLastRow()) hs.appendRow(['Дата', 'Гео', 'С трафиком', 'ROI 3д %', 'ROI 7д %', 'Продаж 7д', 'Профит 7д', 'Вердикт', 'Активных в КТ']);
  const hv = hs.getDataRange().getValues();
  for (let i = hv.length - 1; i >= 1; i--) {
    const d = hv[i][0] instanceof Date ? Utilities.formatDate(hv[i][0], tz, 'yyyy-MM-dd') : String(hv[i][0]);
    if (d === today) hs.deleteRow(i + 1);
  }
  if (geo.length) {
    hs.getRange(hs.getLastRow() + 1, 1, geo.length, 9)
      .setValues(geo.map(g => [today, g.geo, g.active, r1(g.roi3), r1(g.roi7), g.sales7, r1(g.profit7), g.code, g.ktActive]));
  }

  saveJson(result);
  return result;
}

function writeSheet(ss, name, head, cols, rows, colors, widths) {
  const sh = ss.getSheetByName(name) || ss.insertSheet(name);
  sh.clear();
  sh.getRange(1, 1).setValue(head).setFontWeight('bold');
  sh.getRange(2, 1, 1, cols.length).setValues([cols]).setFontWeight('bold').setFontColor('#ffffff').setBackground('#4472c4');
  if (rows.length) {
    sh.getRange(3, 1, rows.length, cols.length).setValues(rows).setWrap(true).setVerticalAlignment('top');
    if (colors) colors.forEach((col, i) => { if (col) sh.getRange(3 + i, 1, 1, cols.length).setBackground(col); });
  }
  widths.forEach((w, i) => sh.setColumnWidth(i + 1, w));
  sh.setFrozenRows(2);
}

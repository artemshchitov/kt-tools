/**
 * Мониторинг свежих креативов на S3 — Google Таблица + Apps Script. Только читает S3 и Кейтаро.
 *
 * Что делает (по кнопке и по расписанию):
 *   1. Читает папку S3 (по умолчанию CreoAntonTeam/, с подпапками), берёт видео, загруженные с начала месяца,
 *      в имени которых есть твоё имя (поле «Имя в нейминге» на листе «Настройки креативов»).
 *   2. Нейминг для залива: креативщики пишут полную дату (…_artem_02_10_26), заливаем без года (…_artem_02_10).
 *      Гео — первый кусок нейминга: no_erex_… -> NO.
 *   3. По Кейтаро (sub_id_3, все группы, вся история) смотрит, был ли по креативу расход.
 *      Нет расхода -> «✅ готов к заливу», есть -> «🚀 уже льётся» с расходом/ROI.
 *   4. Лист «Креативы»: готовые сверху, по гео; «🆕» — появился с прошлого запуска.
 *
 * Установка: Расширения → Apps Script → вставить код → сохранить → обновить таблицу →
 *   меню «Креативы → Установка» (ключи S3 и Кейтаро, автозапуск) → «Креативы → Проверить сейчас».
 * Лучше в ОТДЕЛЬНОЙ таблице: в одном проекте с аналитикой Кейтаро конфликтуют onOpen.
 */

const CP = PropertiesService.getScriptProperties();
const CREO_SETTINGS = [
  // [подпись в листе, ключ, по умолчанию]
  ['Имя в нейминге', 'name', 'artem'],
  ['Папка на S3', 'prefix', 'CreoAntonTeam/'],
  ['Бакет S3', 'bucket', 'hurryholebucket'],
  ['Регион S3', 'region', 'eu-west-3'],
  ['Период: загружены с (пусто — с начала месяца)', 'since', ''],
  ['Форматы видео', 'exts', 'mp4,mov,m4v,webm,avi,mkv'],
  ['КТ адрес', 'ktUrl', 'https://harryhole.info'],
  ['История трафика в КТ с', 'ktFrom', '2024-01-01'],
  ['Автозапуск: каждые N часов', 'every', 1],
];
const SET_SHEET = 'Настройки креативов', OUT_SHEET = 'Креативы';

// ---------- меню ----------

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Креативы')
    .addItem('Проверить сейчас', 'creoMenuRun')
    .addItem('Установка / ключи', 'creoSetup')
    .addToUi();
}

function creoSetup() {
  const ui = SpreadsheetApp.getUi(), ss = SpreadsheetApp.getActive();
  if (!ss.getSheetByName(SET_SHEET)) {
    const st = ss.insertSheet(SET_SHEET);
    st.getRange(1, 1, CREO_SETTINGS.length, 2).setValues(CREO_SETTINGS.map(s => [s[0], s[2]]));
    st.setColumnWidth(1, 320);
    st.setColumnWidth(2, 220);
  }
  const ask = (prop, title) => {
    const r = ui.prompt(title, 'Пусто — оставить текущий' + (CP.getProperty(prop) ? ' (уже задан)' : ''), ui.ButtonSet.OK_CANCEL);
    if (r.getSelectedButton() !== ui.Button.OK) return false;
    if (r.getResponseText().trim()) CP.setProperty(prop, r.getResponseText().trim());
    return true;
  };
  if (!ask('S3_ACCESS', 'S3 Access key') || !ask('S3_SECRET', 'S3 Secret key') || !ask('KT_KEY', 'Ключ API Кейтаро')) return;
  const miss = ['S3_ACCESS', 'S3_SECRET', 'KT_KEY'].filter(p => !CP.getProperty(p));
  if (miss.length) return ui.alert('Не заданы: ' + miss.join(', ') + ' — проверка работать не будет');

  const h = creoTrigger(creoCfg(), true);
  ui.alert('Готово. Автопроверка каждые ' + h + ' ч. Имя, папка и период — на листе «' + SET_SHEET + '».');
}

// триггер автопроверки: ставится сам при любом запуске; меняется, если поменяли «каждые N часов»
function creoTrigger(c, force) {
  const h = Math.max(1, Math.round(c.every) || 1);
  const has = ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'creoRun');
  if (!force && has.length && CP.getProperty('CREO_EVERY') === String(h)) return h;
  has.forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('creoRun').timeBased().everyHours(h).create();
  CP.setProperty('CREO_EVERY', String(h));
  return h;
}

function creoMenuRun() {
  const r = creoRun();
  SpreadsheetApp.getActive().toast('Креативов: ' + r.total + ', готовы к заливу: ' + r.ready + (r.fresh ? ', новых: ' + r.fresh : ''), 'Проверка готова', 6);
}

// ---------- настройки ----------

function creoCfg() {
  const sh = SpreadsheetApp.getActive().getSheetByName(SET_SHEET);
  const vals = {};
  if (sh) sh.getDataRange().getValues().forEach(r => { vals[r[0]] = r[1]; });
  const c = {};
  for (const [label, key, def] of CREO_SETTINGS) {
    const v = vals[label];
    c[key] = (v === '' || v == null) ? def : (typeof def === 'number' ? Number(v) : v);
  }
  c.name = String(c.name).trim().toLowerCase();
  c.prefix = String(c.prefix).replace(/^\/+/, '').replace(/\/*$/, '/');
  c.exts = String(c.exts).toLowerCase().split(/[\s,;]+/).filter(Boolean);
  c.ktUrl = String(c.ktUrl).replace(/\/+$/, '');
  return c;
}

// ---------- нейминг ----------

// имя файла -> нейминг для залива: без папки и расширения, в нижнем регистре, дата без года
// us_barb_weak_in_bed_y_artem_02_10_26.mp4 -> us_barb_weak_in_bed_y_artem_02_10
function creoNorm(s) {
  return String(s || '').split('/').pop().replace(/\.[a-z0-9]{2,4}$/i, '').trim().toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/_(\d{1,2})_(\d{1,2})_(\d{2}|\d{4})$/, '_$1_$2');
}

const creoGeo = n => { const m = n.match(/^([a-z]{2})_/); return m ? m[1].toUpperCase() : '??'; };

// имя креативщика/баера в нейминге — отдельным куском: «artem» не зацепит «artemis»
const hasName = (n, name) => new RegExp('(^|[^a-z0-9])' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^a-z0-9]|$)').test(n);

// ---------- S3: ListObjectsV2 с подписью SigV4 ----------

const EMPTY_HASH = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const toHex = bytes => bytes.map(b => ((b + 256) % 256).toString(16).padStart(2, '0')).join('');
const bytesOf = s => Utilities.newBlob(s).getBytes();
const hmacB = (key, msg) => Utilities.computeHmacSha256Signature(bytesOf(msg), key);
const sha256hex = s => toHex(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8));
const uriEnc = s => encodeURIComponent(s).replace(/[!'()*]/g, ch => '%' + ch.charCodeAt(0).toString(16).toUpperCase());
const encPath = key => key.split('/').map(uriEnc).join('/');

function s3List(c) {
  const host = c.bucket + '.s3.' + c.region + '.amazonaws.com';
  const out = [];
  let token = null;
  do {
    const q = { 'list-type': '2', prefix: c.prefix, 'max-keys': '1000' };
    if (token) q['continuation-token'] = token;
    const qs = Object.keys(q).sort().map(k => uriEnc(k) + '=' + uriEnc(q[k])).join('&');
    const amzDate = new Date().toISOString().replace(/[-:]|\.\d{3}/g, ''), day = amzDate.slice(0, 8);
    const h = { host: host, 'x-amz-content-sha256': EMPTY_HASH, 'x-amz-date': amzDate };
    const names = Object.keys(h).sort();
    const creq = ['GET', '/', qs, names.map(n => n + ':' + h[n] + '\n').join(''), names.join(';'), EMPTY_HASH].join('\n');
    const scope = day + '/' + c.region + '/s3/aws4_request';
    const sts = ['AWS4-HMAC-SHA256', amzDate, scope, sha256hex(creq)].join('\n');
    let k = hmacB(bytesOf('AWS4' + CP.getProperty('S3_SECRET')), day);
    for (const part of [c.region, 's3', 'aws4_request']) k = hmacB(k, part);
    const sig = toHex(hmacB(k, sts));
    const res = UrlFetchApp.fetch('https://' + host + '/?' + qs, {
      muteHttpExceptions: true,
      headers: {
        'x-amz-content-sha256': EMPTY_HASH, 'x-amz-date': amzDate,
        Authorization: 'AWS4-HMAC-SHA256 Credential=' + CP.getProperty('S3_ACCESS') + '/' + scope +
          ', SignedHeaders=' + names.join(';') + ', Signature=' + sig,
      },
    });
    const t = res.getContentText();
    if (res.getResponseCode() !== 200) {
      const code = (t.match(/<Code>(.*?)<\/Code>/) || [])[1] || '';
      throw new Error('S3 ' + res.getResponseCode() + ' ' + code +
        (code === 'SignatureDoesNotMatch' || code === 'InvalidAccessKeyId' ? ' — неверные ключи S3' : '') +
        (code === 'PermanentRedirect' || code === 'AuthorizationHeaderMalformed' ? ' — проверь регион бакета' : ''));
    }
    const unxml = s => s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    (t.match(/<Contents>[\s\S]*?<\/Contents>/g) || []).forEach(x => {
      out.push({
        key: unxml((x.match(/<Key>([\s\S]*?)<\/Key>/) || [])[1] || ''),
        modified: new Date((x.match(/<LastModified>(.*?)<\/LastModified>/) || [])[1]),
        size: Number((x.match(/<Size>(\d+)<\/Size>/) || [])[1] || 0),
      });
    });
    token = /<IsTruncated>true<\/IsTruncated>/.test(t) ? unxml((t.match(/<NextContinuationToken>(.*?)<\/NextContinuationToken>/) || [])[1] || '') : null;
  } while (token);
  return out;
}

// ---------- Кейтаро: расход по креативам за всю историю ----------

function ktSpend(c, today) {
  const body = {
    range: { from: c.ktFrom + ' 00:00:00', to: today + ' 23:59:59' },
    dimensions: ['sub_id_3'],
    measures: ['clicks', 'sales', 'sale_revenue', 'cost'],
    // только креативы с именем в sub_id_3 — меньше строк; если Кейтаро не примет фильтр, читаем всё
    filters: [{ name: 'sub_id_3', operator: 'CONTAINS', expression: c.name }],
    limit: 10000, offset: 0,
  };
  const call = b => {
    const r = UrlFetchApp.fetch(c.ktUrl + '/admin_api/v1/report/build', {
      method: 'post', muteHttpExceptions: true, contentType: 'application/json',
      headers: { 'Api-Key': CP.getProperty('KT_KEY') }, payload: JSON.stringify(b),
    });
    if (r.getResponseCode() >= 300) throw new Error('Кейтаро ' + r.getResponseCode() + ': ' + r.getContentText().slice(0, 300));
    return JSON.parse(r.getContentText() || '{}').rows || [];
  };
  let rows = [];
  try {
    for (;;) { const p = call(body); rows = rows.concat(p); if (p.length < body.limit) break; body.offset += body.limit; }
  } catch (e) {
    if (!/Кейтаро 4\d\d/.test(e.message)) throw e;
    body.filters = []; body.offset = 0; rows = [];
    for (;;) { const p = call(body); rows = rows.concat(p); if (p.length < body.limit) break; body.offset += body.limit; }
  }
  // ключ — нормализованный нейминг: в КТ тоже может стоять полная дата
  const m = {};
  rows.forEach(r => {
    const n = creoNorm(r.sub_id_3);
    if (!n) return;
    const x = m[n] = m[n] || { clicks: 0, sales: 0, revenue: 0, cost: 0, raw: [] };
    x.clicks += Number(r.clicks) || 0; x.sales += Number(r.sales) || 0;
    x.revenue += Number(r.sale_revenue) || 0; x.cost += Number(r.cost) || 0;
    x.raw.push(String(r.sub_id_3));
  });
  return m;
}

// ---------- проверка ----------

function creoRun() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(60000)) throw new Error('проверка уже идёт');
  try { return creoCheck(); } finally { lock.releaseLock(); }
}

function creoCheck() {
  const c = creoCfg(), ss = SpreadsheetApp.getActive(), tz = ss.getSpreadsheetTimeZone();
  if (!c.name) throw new Error('пустое «Имя в нейминге» на листе «' + SET_SHEET + '»');
  creoTrigger(c, false);
  ['S3_ACCESS', 'S3_SECRET', 'KT_KEY'].forEach(p => { if (!CP.getProperty(p)) throw new Error('нет ' + p + ' — меню «Креативы → Установка»'); });
  const now = new Date(), today = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
  const since = c.since instanceof Date ? c.since
    : (String(c.since).trim() ? new Date(String(c.since).trim()) : new Date(Utilities.formatDate(now, tz, 'yyyy-MM-01') + 'T00:00:00'));

  // 1. видео с именем, загруженные с начала периода; одинаковый нейминг (разные форматы/папки) — одна строка
  const creos = {};
  s3List(c).forEach(o => {
    const file = o.key.split('/').pop();
    const ext = (file.match(/\.([a-z0-9]+)$/i) || [])[1];
    if (!ext || !c.exts.includes(ext.toLowerCase()) || o.modified < since) return;
    const n = creoNorm(file);
    if (!hasName(n, c.name)) return;
    const x = creos[n] = creos[n] || { name: n, geo: creoGeo(n), files: [], modified: o.modified };
    x.files.push(o.key);
    if (o.modified < x.modified) x.modified = o.modified;
  });

  // 2. расход в Кейтаро
  const spend = ktSpend(c, today);

  // 3. «впервые замечен» и «новый» — из прошлого запуска
  const sh = ss.getSheetByName(OUT_SHEET) || ss.insertSheet(OUT_SHEET);
  const prev = {};
  if (sh.getLastRow() > 2) {
    sh.getRange(3, 1, sh.getLastRow() - 2, 12).getValues().forEach(r => { if (r[2]) prev[r[2]] = r[10]; });
  }
  const first = !Object.keys(prev).length;

  const list = Object.keys(creos).map(n => {
    const x = creos[n], s = spend[n];
    const used = s && s.cost > 0;
    x.status = used ? '🚀 уже льётся' : (s && s.clicks > 0 ? '✅ готов к заливу (клики без расхода)' : '✅ готов к заливу');
    x.ready = !used;
    x.cost = s ? s.cost : 0; x.clicks = s ? s.clicks : 0; x.sales = s ? s.sales : 0;
    x.roi = s && s.cost > 0 ? (s.revenue - s.cost) / s.cost * 100 : null;
    x.seen = prev[n] || now;
    x.fresh = !first && !prev[n];
    return x;
  });
  // готовые сверху; дальше по гео и свежести
  list.sort((a, b) => (b.ready - a.ready) || a.geo.localeCompare(b.geo) || (b.modified - a.modified));

  const fmt = d => Utilities.formatDate(d, tz, 'dd.MM.yyyy HH:mm');
  const head = 'Креативы «' + c.name + '» в s3://' + c.bucket + '/' + c.prefix + ' с ' + Utilities.formatDate(since, tz, 'dd.MM.yyyy') +
    ' · проверено ' + fmt(now) + ' · готовы к заливу: ' + list.filter(x => x.ready).length + ' из ' + list.length;
  const cols = ['', 'Гео', 'Нейминг для залива', 'Статус', 'Расход в КТ $', 'Кликов', 'Продаж', 'ROI %',
    'Загружен на S3', 'Файлы', 'Впервые замечен', 'Ссылка'];
  sh.clear();
  sh.getRange(1, 1).setValue(head).setFontWeight('bold');
  sh.getRange(2, 1, 1, cols.length).setValues([cols]).setFontWeight('bold').setFontColor('#ffffff').setBackground('#4472c4');
  if (list.length) {
    const url = k => 'https://' + c.bucket + '.s3.' + c.region + '.amazonaws.com/' + encPath(k);
    sh.getRange(3, 1, list.length, cols.length).setValues(list.map(x => [
      x.fresh ? '🆕' : '', x.geo, x.name, x.status, Math.round(x.cost * 100) / 100, x.clicks, x.sales,
      x.roi == null ? '' : Math.round(x.roi), fmt(x.modified), x.files.map(k => k.split('/').pop()).join('\n'),
      x.seen, url(x.files[0]),
    ])).setVerticalAlignment('top');
    list.forEach((x, i) => sh.getRange(3 + i, 1, 1, cols.length).setBackground(x.ready ? '#c6efce' : '#f2f2f2'));
    sh.getRange(3, 11, list.length, 1).setNumberFormat('dd.MM.yyyy HH:mm');
  }
  [30, 50, 330, 230, 100, 70, 70, 60, 130, 330, 130, 300].forEach((w, i) => sh.setColumnWidth(i + 1, w));
  sh.setFrozenRows(2);
  return { total: list.length, ready: list.filter(x => x.ready).length, fresh: list.filter(x => x.fresh).length };
}

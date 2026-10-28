// Букмарклет: снятие ложных отклонов в FB. По списку кабинетов находит объявления
// в статусе DISAPPROVED под АКТИВНЫМИ кампаниями, подставляет/заменяет белый заголовок
// (язык — по префиксу гео в названии кампании) и переотправляет объявление на ремодерацию.
// Механика «замены внутри»: тот же ad ID, креатив пересобирается (дубля объявления нет) —
// это выбивает объявление из ложного отклона обратно в ревью. Жёсткие отклоны (политика/
// лендинг/аккаунт) после ремодерации вернутся в DISAPPROVED — такие помечаются отдельно.
// Токен FB (системного юзера) вводится в панели, хранится только в браузере (localStorage).
// Сборка страницы-установщика: python fb_build.py
(() => {
  const old = document.getElementById('fbrej-host');
  if (old) { old.remove(); return; }

  const API = 'https://graph.facebook.com/v21.0';
  const LS = 'fbrej_token';
  let plan = [];

  // гео (префикс названия кампании) → язык белого заголовка
  const GEO_LANG = {
    au:'EN', uk:'EN', gb:'EN', us:'EN', ca:'EN', ie:'EN', nz:'EN',
    de:'DE', at:'DE', ch:'DE', chde:'DE',
    fr:'FR', be:'NL', nl:'NL',
    se:'SE', no:'NO', fi:'FI', dk:'DK', es:'ES',
  };
  // белые заголовки «supplement facts» по языкам — нейтральные, без заявлений
  const WHITE = {
    EN: ['Magnesium Glycinate 400 mg, 180 Veg Capsules: Benefits, Dosage and Daily Value',
         'Vitamin D3 + K2, 120 Softgels: Daily Value and Usage',
         'Omega-3 Fish Oil 1000 mg, 90 Softgels: EPA and DHA Content',
         'Zinc Picolinate 50 mg, 120 Veg Capsules: Daily Value and Upper Limit'],
    DE: ['Magnesium 400 mg, 180 Kapseln: Tagesbedarf und Anwendung',
         'Vitamin D3 2000 IE, 120 Softgels: Tagesdosis und Nährwert',
         'Zink 25 mg, 120 Kapseln: Nährwert und Obergrenze'],
    FR: ['Magnésium 400 mg, 180 gélules : apports et usage quotidien',
         'Vitamine D3 2000 UI, 120 capsules : valeur quotidienne',
         'Oméga-3 1000 mg, 90 capsules : teneur en EPA et DHA'],
    NL: ['Magnesium 400 mg, 180 capsules: dagelijkse waarde en gebruik',
         'Vitamine D3 2000 IE, 120 softgels: dagelijkse dosis'],
    SE: ['Magnesium 400 mg, 180 kapslar: dagligt värde och dosering',
         'D-vitamin 2000 IE, 120 kapslar: dagligt intag'],
    NO: ['Magnesium 400 mg, 180 kapsler: daglig verdi og dosering',
         'Vitamin D3 2000 IE, 120 kapsler: daglig dose'],
    FI: ['Magnesium 400 mg, 180 kapselia: päiväannos ja käyttö',
         'D3-vitamiini 2000 IU, 120 kapselia: päivittäinen saanti'],
    DK: ['Magnesium 400 mg, 180 kapsler: daglig værdi og dosering',
         'D3-vitamin 2000 IE, 120 kapsler: daglig dosis'],
    ES: ['Magnesio 400 mg, 180 cápsulas: valor diario y uso',
         'Vitamina D3 2000 UI, 120 cápsulas: dosis diaria'],
  };
  const langOf = name => {
    const first = (name || '').trim().toLowerCase().split(/[\s_]+/)[0] || '';
    return GEO_LANG[first] || GEO_LANG[first.slice(0, 2)] || 'EN';
  };
  const whiteFor = (lang, cur) => {
    const list = WHITE[lang] || WHITE.EN;
    const pick = list.find(t => t !== cur) || list[0];
    return pick;
  };

  const host = document.createElement('div');
  host.id = 'fbrej-host';
  host.style.cssText = 'position:fixed;top:12px;right:12px;z-index:2147483647';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
<style>
  .w{width:640px;max-width:calc(100vw - 24px);max-height:calc(100vh - 24px);overflow:auto;background:#fff;color:#1c1e21;
     border:1px solid #ccd;border-radius:10px;box-shadow:0 8px 30px rgba(0,0,0,.25);padding:14px;font:13px/1.4 system-ui,sans-serif}
  h3{margin:0 0 8px;font-size:15px;display:flex;justify-content:space-between}
  h3 b{cursor:pointer;font-weight:400;color:#888}
  label{display:block;font-weight:600;margin:8px 0 4px}
  small{font-weight:400;color:#777}
  input[type=password],input[type=text],textarea{width:100%;box-sizing:border-box;padding:6px 8px;border:1px solid #ccd;border-radius:6px;font:12px/1.4 Consolas,monospace}
  textarea{height:110px;resize:vertical}
  label.inl{display:inline-flex;gap:5px;align-items:center;font-weight:400;margin:8px 0 0}label.inl input{width:auto}
  button{padding:7px 12px;border:0;border-radius:6px;background:#0866ff;color:#fff;font-weight:600;cursor:pointer;margin-right:6px}
  button:disabled{opacity:.45;cursor:default}
  .act{margin:10px 0}
  .it{border:1px solid #e3e4e8;border-radius:8px;padding:6px 8px;margin-bottom:6px;background:#f6f7f9}
  .m{color:#666;font-size:12px;word-break:break-all}
  .ok{color:#1a7f37}.err{color:#c62828}.warn{color:#a15c00}
  #log{font:11px/1.5 Consolas,monospace;color:#555;max-height:150px;overflow:auto;margin-top:8px}
</style>
<div class="w">
  <h3>FB: снятие ложных отклонов <b id="x">✕</b></h3>
  <label>FB-токен <small>— системного юзера, с ads_management; хранится только в этом браузере</small></label>
  <input id="tok" type="password" autocomplete="off" placeholder="EAA...">
  <label>Кабинеты <small>— ID по одному в строке (act_ можно не писать)</small></label>
  <textarea id="accs" placeholder="1120864960876332&#10;961586306564073"></textarea>
  <label class="inl"><input type="checkbox" id="swap" checked> менять заголовок на белый (язык по названию кампании)</label>
  <div class="m" id="swaphint" style="margin-top:4px">снято — просто переотправка креатива на ремодерацию, текст не меняется</div>
  <div class="act"><button id="check">Проверить</button><button id="apply" disabled>Применить</button></div>
  <div id="out"></div>
  <div id="log"></div>
</div>`;
  document.body.append(host);
  const $ = id => root.getElementById(id);
  $('tok').value = localStorage.getItem(LS) || '';
  $('x').onclick = () => host.remove();
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const log = (msg, cls = '') => $('log').prepend(el('div', cls, new Date().toLocaleTimeString() + '  ' + msg));
  const short = v => !v ? '' : (v.length > 46 ? v.slice(0, 44) + '…' : v);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  $('swap').onchange = () => { $('swaphint').style.display = $('swap').checked ? 'none' : ''; };
  $('swaphint').style.display = 'none';

  async function api(method, path, params, body) {
    const tok = $('tok').value.trim();
    const qs = new URLSearchParams({ ...(params || {}), access_token: tok }).toString();
    const opt = { method };
    if (body) { opt.headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
      opt.body = new URLSearchParams({ ...body, access_token: tok }).toString(); }
    const res = await fetch(`${API}${path}?${qs}`, opt);
    const raw = await res.text();
    let j = null; try { j = raw ? JSON.parse(raw) : null; } catch { /* non-json */ }
    if (!res.ok) throw new Error((j && j.error && (j.error.error_user_title || j.error.message)) || `HTTP ${res.status}: ${raw.slice(0, 160)}`);
    return j;
  }
  async function getAll(path, params) {
    let out = [], url = null;
    let j = await api('GET', path, { ...params, limit: '500' });
    out = out.concat(j.data || []);
    while (j.paging && j.paging.next) {
      const res = await fetch(j.paging.next); j = await res.json();
      out = out.concat(j.data || []);
      if (!j.paging || !j.paging.next) break;
    }
    return out;
  }

  function parseAccs() {
    return [...new Set($('accs').value.split(/\r?\n/)
      .map(s => s.trim().replace(/^act_/, '').replace(/\D/g, '')).filter(Boolean))];
  }

  async function check() {
    $('apply').disabled = true; $('out').innerHTML = ''; plan = [];
    const tok = $('tok').value.trim();
    if (!/^EAA[A-Za-z0-9]{20,}/.test(tok)) return log('Токен не похож на FB-токен (EAA…)', 'err');
    localStorage.setItem(LS, tok);
    const accs = parseAccs();
    if (!accs.length) return log('Список кабинетов пуст', 'err');
    $('check').disabled = true;
    try {
      for (const acc of accs) {
        const box = el('div', 'it'); box.append(el('div', '', `кабинет ${acc}`)); $('out').append(box);
        let camps, ads;
        try {
          camps = await getAll(`/act_${acc}/campaigns`, { fields: 'id,name,effective_status' });
          ads = await getAll(`/act_${acc}/ads`, { fields: 'id,campaign_id,effective_status' });
        } catch (e) { box.append(el('div', 'm err', 'ошибка чтения: ' + e.message)); continue; }
        const active = new Map(camps.filter(c => c.effective_status === 'ACTIVE').map(c => [c.id, c.name]));
        const targets = ads.filter(a => active.has(a.campaign_id) && a.effective_status === 'DISAPPROVED');
        box.append(el('div', 'm', `активных кампаний ${active.size}/${camps.length} · отклонённых под ними ${targets.length}`));
        for (const a of targets) {
          const cname = active.get(a.campaign_id) || '';
          const lang = langOf(cname);
          const row = { acc, adId: a.id, cname, lang };
          plan.push(row);
          const swap = $('swap').checked;
          box.append(el('div', 'm', `ad ${a.id} · «${short(cname)}» · ${swap ? 'заголовок → ' + lang : 'переотправка'}`));
        }
      }
      log(`К переотправке объявлений: ${plan.length}`, plan.length ? 'ok' : 'warn');
      $('apply').disabled = !plan.length;
    } catch (e) { log(e.message, 'err'); }
    finally { $('check').disabled = false; }
  }

  async function repush(row) {
    const ad = await api('GET', `/${row.adId}`, { fields:
      'creative{id,title,body,object_story_spec,asset_feed_spec,url_tags,degrees_of_freedom_spec,object_story_id}' });
    const cr = (ad && ad.creative) || {};
    const spec = {};
    for (const k of ['title', 'body', 'url_tags']) if (cr[k]) spec[k] = cr[k];
    const oss = cr.object_story_spec, afs = cr.asset_feed_spec;
    const swap = $('swap').checked;
    const newTitle = swap ? whiteFor(row.lang, cr.title) : null;
    if (afs) {
      if (swap && Array.isArray(afs.titles) && afs.titles.length) afs.titles = afs.titles.map(t => ({ ...t, text: newTitle }));
      spec.asset_feed_spec = JSON.stringify(afs);
    }
    if (oss) {
      if (swap) {
        if (oss.link_data) oss.link_data = { ...oss.link_data, name: newTitle };
        spec.title = newTitle;
      }
      spec.object_story_spec = JSON.stringify(oss);
    } else if (!afs && cr.object_story_id) {
      spec.object_story_id = cr.object_story_id;        // пост-креатив: пересобираем на тот же пост
    }
    if (swap && newTitle && !oss && !afs) spec.title = newTitle;
    if (cr.degrees_of_freedom_spec) spec.degrees_of_freedom_spec = JSON.stringify(cr.degrees_of_freedom_spec);
    if (!Object.keys(spec).length) throw new Error('пустой креатив — нечего переотправить');
    await api('POST', `/${row.adId}`, null, { creative: JSON.stringify(spec) });
  }

  async function apply() {
    $('apply').disabled = true; $('check').disabled = true;
    let ok = 0, fail = 0;
    for (const row of plan) {
      try { await repush(row); row.sent = true; ok++; log(`ad ${row.adId}: переотправлено`, 'ok'); }
      catch (e) { row.err = e.message; fail++; log(`ad ${row.adId}: ${e.message}`, 'err'); }
    }
    log(`Отправлено: OK ${ok}, ошибок ${fail}. Жду ремодерацию…`, fail ? 'warn' : 'ok');
    // контрольная сверка статусов
    await sleep(10000);
    let act = 0, stillBad = 0, proc = 0;
    const report = el('div', 'it'); report.append(el('div', '', 'Статусы после ремодерации:')); $('out').append(report);
    for (const row of plan) {
      if (!row.sent) continue;
      let st = '?';
      try { st = (await api('GET', `/${row.adId}`, { fields: 'effective_status' })).effective_status; } catch (e) { st = 'read-err'; }
      if (st === 'ACTIVE') act++; else if (st === 'DISAPPROVED') stillBad++; else proc++;
      report.append(el('div', 'm ' + (st === 'ACTIVE' ? 'ok' : st === 'DISAPPROVED' ? 'err' : 'warn'),
        `ad ${row.adId} · «${short(row.cname)}» → ${st}` + (st === 'DISAPPROVED' ? ' (жёсткий отклон — переотправкой не лечится)' : '')));
    }
    log(`Итог: ACTIVE ${act}, в ревью ${proc}, остались DISAPPROVED ${stillBad}`, stillBad ? 'warn' : 'ok');
    plan = []; $('check').disabled = false;
  }

  $('check').onclick = check;
  $('apply').onclick = apply;
})();

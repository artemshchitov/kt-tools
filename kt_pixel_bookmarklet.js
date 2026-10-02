// Букмарклет для админки Кейтаро: замена pixel/token/домена в кампаниях по куску нейминга.
// Четыре вкладки, работают независимо:
//   «Pixel / Token» — pixel и token общие на все строки; строки — куски нейминга, по одному.
//   «Домены» — строки и домены поровну, домен N → кампании строки N (домены можно склеенные подряд).
//   «Дубли» — кампания-образец по ID клонируется по разу на каждую строку; кабинет в названии → нейминг строки.
//   «Аналитика» — при открытии тянет последний анализ из Google Таблицы (kt_analytics_sheet.gs, веб-приложение).
//   «Креативы» — при открытии тянет креативы на S3, готовые к заливу (creo_monitor_sheet.gs, веб-приложение).
// Меняет то же, что kt_set_pixel.py: parameters.sub_id_16/17.placeholder и pixel=/token= в notes.
// Сборка ссылки: python build_bookmarklet.py
(() => {
  const old = document.getElementById('ktpx-host');
  if (old) { old.remove(); return; }

  const API = location.origin + '/admin_api/v1';
  const LS = 'ktpx_key';
  let plan = [];

  const host = document.createElement('div');
  host.id = 'ktpx-host';
  host.style.cssText = 'position:fixed;top:12px;right:12px;z-index:2147483647';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
<style>
  .w{width:720px;max-width:calc(100vw - 24px);max-height:calc(100vh - 24px);overflow:auto;background:#fff;color:#1c1e21;
     border:1px solid #ccd;border-radius:10px;box-shadow:0 8px 30px rgba(0,0,0,.25);padding:14px;font:13px/1.4 system-ui,sans-serif}
  h3{margin:0 0 8px;font-size:15px;display:flex;justify-content:space-between}
  h3 b{cursor:pointer;font-weight:400;color:#888}
  label{display:block;font-weight:600;margin:8px 0 4px}
  small{font-weight:400;color:#777}
  input,textarea{width:100%;box-sizing:border-box;padding:6px 8px;border:1px solid #ccd;border-radius:6px;font:12px/1.4 Consolas,monospace}
  textarea{height:120px;resize:vertical}
  button{padding:7px 12px;border:0;border-radius:6px;background:#0866ff;color:#fff;font-weight:600;cursor:pointer;margin-right:6px}
  button:disabled{opacity:.45;cursor:default}
  .act{margin:10px 0}
  .it{border:1px solid #e3e4e8;border-radius:8px;padding:6px 8px;margin-bottom:6px;background:#f6f7f9}
  .m{color:#666;font-size:12px;word-break:break-all}
  .ok{color:#1a7f37}.err{color:#c62828}.warn{color:#a15c00}
  #log{font:11px/1.5 Consolas,monospace;color:#555;max-height:160px;overflow:auto;margin-top:8px}
  .tabs{display:flex;gap:4px;margin:12px 0 4px;border-bottom:1px solid #ccd}
  .tabs a{padding:6px 12px;cursor:pointer;border:1px solid transparent;border-bottom:0;border-radius:6px 6px 0 0;color:#555;margin-bottom:-1px}
  .tabs a.on{border-color:#ccd;background:#fff;color:#1c1e21;font-weight:600}
  .pane{display:none}.pane.on{display:block}
  .two{display:flex;gap:8px}.two>div{flex:1;min-width:0}
  button.sec{background:#e4e6eb;color:#1c1e21}
  .g{border-left:4px solid #ccd}.g.scale{border-left-color:#1a7f37}.g.cut{border-left-color:#c62828}
  .g.rise,.g.dip{border-left-color:#d4a000}.g.few{border-left-color:#999}
  .an-h{font-weight:600;margin:10px 0 6px}
  .an-b{padding:2px 8px;font-size:11px;margin:4px 0 0}
  details summary{cursor:pointer;color:#666;margin:6px 0}
  label.inl{display:inline-flex;gap:4px;align-items:center;font-weight:400;margin:0 0 0 6px}label.inl input{width:auto}
  .cr{display:flex;gap:6px;align-items:center;justify-content:space-between}.cr code{font:12px Consolas,monospace;word-break:break-all}
</style>
<div class="w">
  <h3>Кейтаро: замена pixel / token / домена <b id="x">✕</b></h3>
  <label>API-ключ Кейтаро <small>— Настройки → API; запоминается в этом браузере</small></label>
  <input id="key" type="password" autocomplete="off">
  <div class="tabs"><a id="t-px" data-mode="px">Pixel / Token</a><a id="t-dom" data-mode="dom">Домены</a><a id="t-dup" data-mode="dup">Дубли</a><a id="t-an" data-mode="an">Аналитика</a><a id="t-cr" data-mode="cr">Креативы</a></div>
  <div class="pane" id="p-px">
    <label>Pixel <small>— один на все строки ниже; пусто — не меняем</small></label>
    <input id="pixel" type="text" autocomplete="off" placeholder="1067868436152332">
    <label>Token <small>— один на все строки ниже; пусто — не меняем</small></label>
    <input id="token" type="text" autocomplete="off" placeholder="EAAO...">
    <label>Строки <small>— кусок нейминга (кабинет), по одному в строке</small></label>
    <textarea id="rows" placeholder="1441411593399889&#10;1947923029177194"></textarea>
  </div>
  <div class="pane" id="p-dom">
    <div class="two">
      <div><label>Строки <small>— кусок нейминга, по одному</small></label>
        <textarea id="rowsDom" placeholder="1441411593399889&#10;1947923029177194"></textarea></div>
      <div><label>Домены <small>— столько же, в том же порядке</small></label>
        <textarea id="doms" placeholder="bestvigor.eimin1.com&#10;chiefteam.da1fai.com"></textarea></div>
    </div>
    <div class="m" id="cnt"></div>
  </div>
  <div class="pane" id="p-dup">
    <label>ID кампании в Кейтаро <small>— образец, с неё делаются дубли</small></label>
    <input id="srcId" type="text" autocomplete="off" placeholder="1234">
    <label>Кабинет в названии образца <small>— этот кусок заменится неймингом строки; пусто — найдётся сам (длинное число в названии)</small></label>
    <input id="srcCab" type="text" autocomplete="off" placeholder="1441411593399889">
    <label>Нейминги кабинетов <small>— по одному в строке; сколько строк, столько дублей</small></label>
    <textarea id="rowsDup" placeholder="1947923029177194&#10;1067868436152332"></textarea>
    <div class="m" id="cntDup"></div>
  </div>
  <div class="pane" id="p-an">
    <div class="act"><button id="anLoad" class="sec">Обновить из таблицы</button><button id="anRun">Пересчитать сейчас</button></div>
    <div id="anOut"></div>
    <details id="anCfg"><summary>подключение к Google Таблице</summary>
      <label>Ссылка веб-приложения <small>— меню таблицы «KT аналитика → Ссылка для букмарклета»</small></label>
      <input id="anUrl" type="text" autocomplete="off" placeholder="https://script.google.com/macros/s/.../exec">
      <label>Ключ букмарклета <small>— там же</small></label>
      <input id="anTok" type="password" autocomplete="off">
    </details>
  </div>
  <div class="pane" id="p-cr">
    <div class="act"><button id="crLoad" class="sec">Обновить из таблицы</button><button id="crRun">Проверить S3 сейчас</button>
      <label class="inl"><input type="checkbox" id="crReady" checked> только готовые к заливу</label></div>
    <div id="crOut"></div>
    <details id="crCfg"><summary>подключение к таблице креативов</summary>
      <label>Ссылка веб-приложения <small>— меню таблицы «Креативы → Ссылка для букмарклета»</small></label>
      <input id="crUrl" type="text" autocomplete="off" placeholder="https://script.google.com/macros/s/.../exec">
      <label>Ключ букмарклета <small>— там же</small></label>
      <input id="crTok" type="password" autocomplete="off">
    </details>
  </div>
  <div class="act" id="mainAct"><button id="check">Проверить</button><button id="apply" disabled>Применить</button></div>
  <div id="out"></div>
  <div id="log"></div>
</div>`;
  document.body.append(host);
  const $ = id => root.getElementById(id);
  $('key').value = localStorage.getItem(LS) || '';
  $('x').onclick = () => host.remove();

  let mode = 'px';
  const ls = (k, v) => { try { return v === undefined ? localStorage.getItem(k) : localStorage.setItem(k, v); } catch { return null; } };
  function setMode(m) {
    mode = m;
    ls('ktpx_tab', m);
    for (const t of ['px', 'dom', 'dup', 'an', 'cr']) {
      $('t-' + t).classList.toggle('on', t === m);
      $('p-' + t).classList.toggle('on', t === m);
    }
    // у аналитики свои кнопки; «Проверить/Применить» там не нужны
    $('mainAct').style.display = m === 'an' || m === 'cr' ? 'none' : '';
    // план от другой вкладки применять нельзя
    plan = [];
    $('out').innerHTML = '';
    $('apply').disabled = true;
  }
  root.querySelectorAll('.tabs a').forEach(a => { a.onclick = () => setMode(a.dataset.mode); });

  const el =(tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const log = (msg, cls = '') => $('log').prepend(el('div', cls, new Date().toLocaleTimeString() + '  ' + msg));
  const short = v => !v ? '(пусто)' : (v.length > 30 ? v.slice(0, 14) + '…' + v.slice(-6) : v);
  const ph = (p, k) => ((p || {})[k] || {}).placeholder;
  // кусок нейминга — целым куском: 1441411593399889 не зацепит 14414115933998891
  const nameRe = n => new RegExp(`(?<![\\p{L}\\p{N}])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'u');

  async function api(method, path, body) {
    const res = await fetch(API + path, {
      method,
      headers: { 'Api-Key': $('key').value.trim(), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const raw = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${raw.slice(0, 200)}`);
    return raw.trim() ? JSON.parse(raw) : null;
  }

  // в строках только нейминг, по одному
  function parseRows(id, hint) {
    const out = [];
    for (const line of $(id).value.split(/\r?\n/)) {
      const parts = line.split(/[\s;,]+/).filter(Boolean);
      if (!parts.length) continue;
      const [name, ...rest] = parts;
      const r = { name, errors: [] };
      if (rest.length) r.errors.push('в строке лишнее: ' + rest.join(' ') + hint);
      out.push(r);
    }
    return out;
  }

  // домены: столбиком, через пробел/запятую или склеенные подряд (…eimin1.comchiefteam.da1fai.com)
  function parseDomains() {
    return $('doms').value.toLowerCase()
      .replace(/\.(com|net|org|info|xyz|online|site|top|pro|shop|store|io|co)(?=[a-z0-9-]+\.)/g, '.$1\n')
      .split(/[\s,;]+/).map(x => x.replace(/^https?:\/\//, '').replace(/\/.*$/, '')).filter(Boolean);
  }

  async function check() {
    $('apply').disabled = true;
    $('out').innerHTML = '';
    plan = [];
    if (!$('key').value.trim()) return log('Нет API-ключа', 'err');
    localStorage.setItem(LS, $('key').value.trim());
    if (mode === 'dup') return checkDup();
    let rows, doms = [];
    if (mode === 'px') {
      const pixel = $('pixel').value.trim(), token = $('token').value.trim();
      if (!pixel && !token) return log('Впиши pixel и/или token', 'err');
      if (pixel && !/^\d{6,}$/.test(pixel)) return log('Pixel — только цифры', 'err');
      if (token && !/^EA[A-Za-z0-9]{20,}$/.test(token)) return log('Token не похож на токен FB (должен начинаться с EAA)', 'err');
      rows = parseRows('rows', ' — pixel и token вписываются в поля выше');
      rows.forEach(r => { r.pixel = pixel || undefined; r.token = token || undefined; });
    } else {
      rows = parseRows('rowsDom', ' — домены пишутся в соседнее поле');
      doms = parseDomains();
      if (doms.length !== rows.length) return log(`Строк ${rows.length}, доменов ${doms.length} — должно быть поровну`, 'err');
    }
    if (!rows.length) return log('Строк нет', 'err');
    $('check').disabled = true;
    try {
      const camps = await api('GET', '/campaigns');
      log(`Кампаний в Кейтаро: ${camps.length}`);
      let byName = new Map(), domName = new Map();
      if (doms.length) {
        const all = await api('GET', '/domains');
        byName = new Map(all.map(d => [d.name.toLowerCase(), d]));
        domName = new Map(all.map(d => [d.id, d.name]));
      }
      rows.forEach((r, i) => {
        if (!doms.length) return;
        r.domainName = doms[i];
        r.domain = byName.get(doms[i]);
        if (!r.domain) r.errors.push(`домена ${doms[i]} нет в Кейтаро — сначала добавь его`);
        else if (doms.indexOf(doms[i]) !== i) r.errors.push(`домен ${doms[i]} повторяется в списке`);
      });
      const seen = new Map();
      for (const r of rows) {
        r.camps = r.errors.length ? [] : camps.filter(c => nameRe(r.name).test(c.name || ''));
        if (!r.errors.length && !r.camps.length) r.errors.push('кампаний с этим куском нейминга не найдено');
        for (const c of r.camps) seen.set(c.id, [...(seen.get(c.id) || []), r.name]);
      }
      for (const r of rows) {
        const box = el('div', 'it');
        box.append(el('div', '', mode === 'px'
          ? `${r.name} → pixel ${r.pixel || '(не трогаем)'} · token ${r.token ? short(r.token) : '(не трогаем)'}`
          : `${r.name} → домен ${r.domainName}`));
        r.errors.forEach(t => box.append(el('div', 'm err', t)));
        if (r.domain) {
          const busy = camps.filter(c => c.domain_id === r.domain.id && !r.camps.includes(c));
          if (busy.length) box.append(el('div', 'm warn', `домен уже стоит в: ${busy.map(c => c.name).join(', ')}`));
          if (r.camps.length > 1) box.append(el('div', 'm warn', `кампаний ${r.camps.length} — все получат этот домен`));
        }
        for (const c of r.camps) {
          const line = el('div', 'm');
          box.append(line);
          const dup = seen.get(c.id);
          if (dup.length > 1) { line.className = 'm err'; line.textContent = `${c.id} ${c.name} — подходит под несколько строк (${dup.join(', ')}), пропуск`; continue; }
          const full = await api('GET', `/campaigns/${c.id}`);
          const params = full.parameters || {};
          const miss = [['sub_id_16', r.pixel], ['sub_id_17', r.token]].filter(([k, v]) => v && !params[k]).map(([k]) => k);
          const parts = [];
          if (r.pixel) parts.push(`pixel ${ph(params, 'sub_id_16') || '(пусто)'} → ${r.pixel}`);
          if (r.token) parts.push(`token ${short(ph(params, 'sub_id_17'))} → ${short(r.token)}`);
          if (r.domain) parts.push(`домен ${domName.get(full.domain_id) || full.domain_id} → ${r.domain.name}`);
          const txt = `${c.id} ${c.name}${c.state && c.state !== 'active' ? ' [' + c.state + ']' : ''}: ${parts.join(', ')}`;
          if (miss.length) { line.className = 'm err'; line.textContent = txt + ` — нет параметров ${miss.join(', ')}, пропуск`; continue; }
          line.textContent = txt;
          plan.push({ row: r, camp: c, full, line });
        }
        $('out').append(box);
      }
      log(`К замене кампаний: ${plan.length}`, plan.length ? 'ok' : 'warn');
      $('apply').disabled = !plan.length;
    } catch (e) {
      log(e.message, 'err');
    } finally {
      $('check').disabled = false;
    }
  }

  // ---------- дубли: кампания-образец × нейминги кабинетов ----------

  async function checkDup() {
    const id = $('srcId').value.trim();
    if (!/^\d+$/.test(id)) return log('ID кампании — только цифры', 'err');
    const rows = parseRows('rowsDup', ' — один нейминг в строке');
    if (!rows.length) return log('Строк нет', 'err');
    $('check').disabled = true;
    try {
      let src;
      try { src = await api('GET', `/campaigns/${id}`); } catch (e) { return log(`Кампания ${id} не читается: ${e.message}`, 'err'); }
      if (!src || !src.id) return log(`Кампании ${id} нет в Кейтаро`, 'err');
      // кабинет в названии образца: из поля или единственное длинное число в названии
      let cab = $('srcCab').value.trim();
      if (!cab) {
        const nums = [...new Set((src.name || '').match(/\d{10,}/g) || [])];
        if (nums.length !== 1) return log(`В названии «${src.name}» ${nums.length ? 'несколько длинных чисел: ' + nums.join(', ') : 'нет кабинета'} — впиши кабинет образца в поле`, 'err');
        cab = nums[0];
        $('srcCab').value = cab;
      }
      if (!nameRe(cab).test(src.name || '')) return log(`В названии «${src.name}» нет куска ${cab}`, 'err');
      const names = new Set((await api('GET', '/campaigns')).map(c => c.name));
      const head = el('div', 'it');
      head.append(el('div', '', `образец ${src.id} ${src.name}${src.state && src.state !== 'active' ? ' [' + src.state + ']' : ''}`));
      head.append(el('div', 'm', `кабинет в названии: ${cab} → меняется на нейминг строки; потоки, домен, параметры копируются`));
      $('out').append(head);
      const box = el('div', 'it');
      rows.forEach((r, i) => {
        r.newName = (src.name || '').replace(new RegExp(nameRe(cab).source, 'gu'), r.name);
        if (rows.findIndex(x => x.name === r.name) !== i) r.errors.push('нейминг повторяется в списке');
        if (r.name === cab) r.errors.push('это кабинет самого образца');
        if (names.has(r.newName)) r.errors.push('кампания с таким названием уже есть');
        const line = el('div', r.errors.length ? 'm err' : 'm', `${r.name}: ${r.newName}` + (r.errors.length ? ' — ' + r.errors.join('; ') + ', пропуск' : ''));
        box.append(line);
        if (!r.errors.length) plan.push({ dup: true, src, row: r, line });
      });
      $('out').append(box);
      log(`К созданию дублей: ${plan.length} из ${rows.length}`, plan.length ? 'ok' : 'warn');
      $('apply').disabled = !plan.length;
    } catch (e) {
      log(e.message, 'err');
    } finally {
      $('check').disabled = false;
    }
  }

  async function applyDup() {
    $('apply').disabled = true;
    $('check').disabled = true;
    let ok = 0, fail = 0;
    for (const { src, row: r, line } of plan) {
      let copy = null;
      try {
        const res = await api('POST', `/campaigns/${src.id}/clone`);
        copy = Array.isArray(res) ? res[0] : res;
        if (!copy?.id) throw new Error('Кейтаро не вернул ID дубля');
        await api('PUT', `/campaigns/${copy.id}`, { name: r.newName });
        // сверка: перечитываем то, что записали
        const back = await api('GET', `/campaigns/${copy.id}`);
        if (back.name !== r.newName) throw new Error(`сверка: название «${back.name}»`);
        line.className = 'm ok';
        line.textContent = `✓ ${copy.id} ${r.newName}: создан и подтверждён`;
        log(`дубль ${copy.id}: ${r.newName}`, 'ok');
        ok++;
      } catch (e) {
        // дубль мог создаться, а переименование — нет: называем его, чтобы не потерялся
        const msg = (copy?.id ? `дубль ${copy.id} создан, но: ` : '') + e.message;
        line.className = 'm err';
        line.textContent = `✗ ${r.name}: ${msg}`;
        log(`${r.name}: ${msg}`, 'err');
        fail++;
      }
    }
    plan = [];
    $('check').disabled = false;
    log(`Итого дублей: OK ${ok}, ошибок ${fail}`, fail ? 'err' : 'ok');
  }

  async function apply() {
    if (mode === 'dup') return applyDup();
    $('apply').disabled = true;
    $('check').disabled = true;
    let ok = 0, fail = 0;
    for (const p of plan) {
      const { row: r, full, line } = p;
      const params = full.parameters;
      let notes = full.notes || '';
      if (r.pixel) { params.sub_id_16.placeholder = r.pixel; notes = notes.replace(/pixel=[^&\s]*/g, 'pixel=' + r.pixel); }
      if (r.token) { params.sub_id_17.placeholder = r.token; notes = notes.replace(/token=[^&\s]*/g, 'token=' + r.token); }
      // шлём только то, что меняем
      const body = {};
      if (r.pixel || r.token) Object.assign(body, { notes, parameters: params });
      if (r.domain) body.domain_id = r.domain.id;
      try {
        await api('PUT', `/campaigns/${full.id}`, body);
        // сверка: перечитываем то, что записали
        const back = await api('GET', `/campaigns/${full.id}`);
        const bp = back.parameters || {}, bn = back.notes || '';
        const bad = [];
        if (r.pixel && ph(bp, 'sub_id_16') !== r.pixel) bad.push('sub_id_16=' + ph(bp, 'sub_id_16'));
        if (r.token && ph(bp, 'sub_id_17') !== r.token) bad.push('sub_id_17=' + short(ph(bp, 'sub_id_17')));
        if (r.pixel && bn.includes('pixel=') && !bn.includes('pixel=' + r.pixel)) bad.push('notes.pixel');
        if (r.token && bn.includes('token=') && !bn.includes('token=' + r.token)) bad.push('notes.token');
        if (r.domain && back.domain_id !== r.domain.id) bad.push('domain_id=' + back.domain_id);
        if (bad.length) throw new Error('сверка не сошлась: ' + bad.join(', '));
        line.className = 'm ok';
        line.textContent = `✓ ${full.id} ${full.name}: записано и подтверждено`;
        ok++;
      } catch (e) {
        line.className = 'm err';
        line.textContent = `✗ ${full.id} ${full.name}: ${e.message}`;
        log(`${full.id}: ${e.message}`, 'err');
        fail++;
      }
    }
    plan = [];
    $('check').disabled = false;
    log(`Итого: OK ${ok}, ошибок ${fail}`, fail ? 'err' : 'ok');
  }

  // счётчик на вкладке доменов: строк и доменов должно быть поровну
  function count() {
    const n = parseRows('rowsDom', '').length, d = parseDomains().length;
    $('cnt').className = 'm ' + (n && n === d ? 'ok' : n || d ? 'err' : '');
    $('cnt').textContent = n || d ? `строк ${n} · доменов ${d}` + (n === d ? ' ✓' : ' — должно быть поровну') : '';
  }
  $('rowsDom').oninput = count;
  $('doms').oninput = count;
  $('rowsDup').oninput = () => {
    const n = parseRows('rowsDup', '').length;
    $('cntDup').textContent = n ? `будет дублей: ${n}` : '';
  };

  $('check').onclick = check;
  $('apply').onclick = apply;
  // ---------- аналитика из Google Таблицы ----------

  const fr = v => v == null ? '—' : (v >= 0 ? '+' : '') + Math.round(v) + '%';
  const fm = v => (v >= 0 ? '+' : '') + Math.round(v) + '$';

  function renderAn(j) {
    const o = $('anOut');
    o.innerHTML = '';
    const when = new Date(j.generated);
    o.append(el('div', 'm', j.head + ' · посчитано ' + when.toLocaleString()));
    // анализ не сегодняшний — триггер мог не отработать
    if (j.date !== new Date().toLocaleDateString('sv')) o.append(el('div', 'm warn', 'Анализ не за сегодня — нажми «Пересчитать сейчас»'));
    // блоки по вердикту: зелёные → держать → сокращать → мало данных
    const ORDER = { scale: 0, rise: 1, hold: 1, dip: 1, cut: 2, few: 3 };
    const TITLE = ['🟢 Масштабировать', '⚪ Держать / следить', '🔴 Сокращать', '⚫ Мало данных'];
    const geos = (j.geo || []).slice().sort((a, b) => (ORDER[a.code] ?? 3) - (ORDER[b.code] ?? 3));
    let block = -1;
    for (const g of geos) {
      if ((ORDER[g.code] ?? 3) !== block) {
        block = ORDER[g.code] ?? 3;
        o.append(el('div', 'an-h', TITLE[block]));
      }
      const b = el('div', 'it g ' + g.code);
      b.append(el('div', '', `${g.geo}  ${g.verdict}`));
      b.append(el('div', 'm', `в КТ ${g.ktActive ?? '?'} · с трафиком ${g.active} · всего ${g.total} · ROI 3д ${fr(g.roi3)} (${g.sales3} прод) · 7д ${fr(g.roi7)} (${g.sales7} прод) · профит 7д ${fm(g.profit7)}` +
        (g.revenue7 != null ? ` (доход ${Math.round(g.revenue7)}$ − расход ${Math.round(g.cost7)}$${g.hold7 ? ', холд ' + Math.round(g.hold7) + '$ не учтён' : ''})` : '') +
        (g.limit ? ` · допуск −${Math.round(g.limit)}$ (1 продажа ${Math.round(g.price)}$, ${g.priceSrc})` : '')));
      // действие, образец и креатив — отдельными строками
      if (g.action) g.action.split('; ').forEach(t => b.append(el('div', 'm', '→ ' + t)));
      if (g.template) {
        // образец для масштаба сразу во вкладку «Дубли»
        const btn = el('button', 'an-b', `→ в Дубли: ${g.template.id}`);
        btn.onclick = () => { setMode('dup'); $('srcId').value = g.template.id; $('srcCab').value = ''; $('rowsDup').focus(); };
        b.append(btn);
      }
      o.append(b);
    }
    o.append(el('div', 'an-h', 'Минусовые кампании'));
    if (!(j.losers || []).length) o.append(el('div', 'm', 'нет'));
    for (const l of j.losers || []) {
      const b = el('div', 'it g ' + (l.action === 'swap' ? 'rise' : 'cut'));
      b.append(el('div', '', `${l.id} ${l.name}`));
      b.append(el('div', 'm', `${l.cc} · профит 7д ${fm(l.profit7)} · ROI 7д ${fr(l.roi7)} · 3д ${fr(l.roi3)} · креатив «${l.creo || '?'}»`));
      b.append(el('div', 'm', '→ ' + l.verdict));
      o.append(b);
    }
    const n = c => (j.geo || []).filter(g => g.code === c).length;
    $('t-an').textContent = 'Аналитика' + (n('scale') ? ' 🟢' + n('scale') : '') + (n('cut') ? ' 🔴' + n('cut') : '');
  }

  // данные из Google Таблицы (веб-приложение Apps Script): p — префикс id полей вкладки (an / cr)
  async function loadSheet(p, run, menu, render) {
    const out = $(p + 'Out'), u = $(p + 'Url').value.trim(), t = $(p + 'Tok').value.trim();
    const msg = (cls, text) => { out.innerHTML = ''; out.append(el('div', 'm ' + cls, text)); };
    if (!u || !t) {
      msg('warn', `Впиши ссылку и ключ из меню таблицы «${menu} → Ссылка для букмарклета»`);
      $(p + 'Cfg').open = true;
      return;
    }
    if (!/^https:\/\/script\.google\.com\/.+\/exec$/.test(u)) {
      msg('err', /\/dev$/.test(u)
        ? 'Это тестовая ссылка /dev — она пускает только редакторов скрипта. Нужна /exec: Apps Script → Развернуть → Управление развёртываниями → Веб-приложение → URL'
        : 'Ссылка должна быть вида https://script.google.com/macros/s/…/exec');
      $(p + 'Cfg').open = true;
      return;
    }
    ls('kt' + p + '_url', u);
    ls('kt' + p + '_tok', t);
    $(p + 'Load').disabled = $(p + 'Run').disabled = true;
    msg('', run ? 'пересчитываю в таблице… (до пары минут)' : 'загружаю из таблицы…');
    try {
      const res = await fetch(u + (u.includes('?') ? '&' : '?') + 't=' + encodeURIComponent(t) + (run ? '&run=1' : ''));
      const j = await res.json();
      if (j.error) throw new Error(j.error);
      render(j);
    } catch (e) {
      msg('err', 'Не загрузилось: ' + e.message);
      if (e instanceof TypeError) {
        // различаем: Google отдал не JSON (развёртывание) или запрос вообще не ушёл (политика сайта/сеть)
        let reached = false;
        try { await fetch(u, { mode: 'no-cors' }); reached = true; } catch { /* не ушёл */ }
        out.append(el('div', 'm warn', reached
          ? 'Google отвечает, но данные не отдаёт: проверь развёртывание (доступ «Все», запуск от имени «Я», версия — новая) и открой ссылку+?t=ключ в окне инкогнито.'
          : 'Запрос до Google не дошёл: админка Кейтаро запрещает внешние запросы или их режет расширение/сеть. Открой ссылку+?t=ключ в новой вкладке — если там JSON, напиши мне.'));
      }
    } finally {
      $(p + 'Load').disabled = $(p + 'Run').disabled = false;
    }
  }
  const loadAn = run => loadSheet('an', run, 'KT аналитика', renderAn);
  $('anUrl').value = ls('ktan_url') || '';
  $('anTok').value = ls('ktan_tok') || '';
  $('anLoad').onclick = () => loadAn(false);
  $('anRun').onclick = () => loadAn(true);

  // ---------- креативы на S3, готовые к заливу ----------

  let crData = null;
  function renderCr(j) {
    crData = j;
    const o = $('crOut');
    o.innerHTML = '';
    o.append(el('div', 'm', j.head));
    const only = $('crReady').checked;
    const items = (j.items || []).filter(x => !only || x.ready);
    if (!items.length) o.append(el('div', 'm', only ? 'готовых к заливу нет' : 'креативов нет'));
    const byGeo = new Map();
    items.forEach(x => byGeo.set(x.geo, [...(byGeo.get(x.geo) || []), x]));
    for (const [geo, list] of [...byGeo].sort((a, b) => a[0].localeCompare(b[0]))) {
      o.append(el('div', 'an-h', `${geo} · готовых ${list.filter(x => x.ready).length}${only ? '' : ' из ' + list.length}`));
      for (const x of list) {
        const b = el('div', 'it g ' + (x.ready ? 'scale' : 'few'));
        const row = el('div', 'cr');
        row.append(el('code', '', (x.fresh ? '🆕 ' : '') + x.name));
        // нейминг для залива — в буфер одной кнопкой
        const cp = el('button', 'an-b', 'Копировать');
        cp.onclick = async () => { await navigator.clipboard.writeText(x.name); cp.textContent = '✓'; setTimeout(() => (cp.textContent = 'Копировать'), 1200); };
        row.append(cp);
        b.append(row);
        b.append(el('div', 'm', `${x.status} · на S3 с ${x.modified}` +
          (x.cost ? ` · расход ${Math.round(x.cost)}$, продаж ${x.sales}${x.roi != null ? ', ROI ' + fr(x.roi) : ''}` : '')));
        // по кнопке на формат: mp4, mov…
        for (const f of x.files || []) {
          const d = el('button', 'an-b sec', '⬇ Скачать ' + f.ext);
          d.onclick = () => download(f, d);
          b.append(d);
        }
        o.append(b);
      }
    }
    const all = j.items || [], ready = all.filter(x => x.ready).length, fresh = all.filter(x => x.fresh && x.ready).length;
    $('t-cr').textContent = 'Креативы' + (ready ? ' ✅' + ready : '') + (fresh ? ' 🆕' + fresh : '');
  }
  // «Сохранить как» с выбором папки; если бакет не отдаёт файл странице (CORS) или браузер не умеет —
  // обычное скачивание по подписанной ссылке (место — по настройке Chrome «Всегда указывать место для скачивания»)
  async function download(f, btn) {
    const label = btn.textContent;
    const plain = () => {
      const a = document.createElement('a');
      a.href = f.url;
      a.rel = 'noopener';
      document.body.append(a);
      a.click();
      a.remove();
      btn.textContent = '✓ скачивается';
      log(`${f.fname}: обычное скачивание — папку спрашивает Chrome, если включено «Всегда указывать место для скачивания»`);
    };
    if (!window.showSaveFilePicker) return plain();
    let handle;
    try {
      handle = await window.showSaveFilePicker({
        suggestedName: f.fname,
        types: [{ description: 'Видео', accept: { ['video/' + (f.ext === 'mov' ? 'quicktime' : f.ext)]: ['.' + f.ext] } }],
      });
    } catch (e) {
      if (e.name === 'AbortError') return;   // нажали «Отмена»
      return plain();
    }
    btn.disabled = true;
    btn.textContent = 'скачиваю…';
    try {
      const res = await fetch(f.url);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const total = +res.headers.get('content-length') || 0;
      const w = await handle.createWritable();
      const reader = res.body.getReader();
      let got = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        await w.write(value);
        got += value.length;
        if (total) btn.textContent = `скачиваю… ${Math.round(got / total * 100)}%`;
      }
      await w.close();
      btn.textContent = '✓ сохранено';
      log(`${f.fname}: сохранено (${Math.round(got / 1048576)} МБ)`, 'ok');
    } catch (e) {
      // чаще всего бакет не разрешает чтение со страницы (CORS) — тогда обычное скачивание
      log(`${f.fname}: в выбранную папку не вышло (${e.message}) — скачиваю обычным способом`, 'warn');
      try { await handle.remove(); } catch { /* пустой файл мог остаться */ }
      plain();
    } finally {
      btn.disabled = false;
      setTimeout(() => (btn.textContent = label), 4000);
    }
  }
  const loadCr = run => loadSheet('cr', run, 'Креативы', renderCr);
  $('crUrl').value = ls('ktcr_url') || '';
  $('crTok').value = ls('ktcr_tok') || '';
  $('crLoad').onclick = () => loadCr(false);
  $('crRun').onclick = () => loadCr(true);
  $('crReady').onchange = () => { if (crData) renderCr(crData); };

  setMode(['dom', 'dup', 'an', 'cr'].includes(ls('ktpx_tab')) ? ls('ktpx_tab') : 'px');
  // при открытии сразу тянем аналитику и креативы — итог виден на ярлыках вкладок
  if ($('anUrl').value && $('anTok').value) loadAn(false);
  if ($('crUrl').value && $('crTok').value) loadCr(false);
})();

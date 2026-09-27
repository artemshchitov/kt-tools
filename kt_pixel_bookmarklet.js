// Букмарклет для админки Кейтаро: замена pixel/token/домена в кампаниях по куску нейминга.
// Строка: <кусок нейминга> <pixel> <token> — через пробел/таб/;/, (можно вставить из таблицы).
// Домены — отдельным полем, по одному на строку в том же порядке (можно склеенные подряд).
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
</style>
<div class="w">
  <h3>Кейтаро: замена pixel / token / домена <b id="x">✕</b></h3>
  <label>API-ключ Кейтаро <small>— Настройки → API; запоминается в этом браузере</small></label>
  <input id="key" type="password" autocomplete="off">
  <label>Строки <small>— кусок нейминга (кабинет) · pixel · token; по одной в строке</small></label>
  <textarea id="rows" placeholder="1441411593399889  1067868436152332  EAAO...&#10;1947923029177194  1029758310085003  EAAO..."></textarea>
  <label>Домены <small>— необязательно; по одному на строку выше, в том же порядке. Пусто — домен не меняется</small></label>
  <textarea id="doms" placeholder="bestvigor.eimin1.com&#10;chiefteam.da1fai.com"></textarea>
  <div class="act"><button id="check">Проверить</button><button id="apply" disabled>Применить</button></div>
  <div id="out"></div>
  <div id="log"></div>
</div>`;
  document.body.append(host);
  const $ = id => root.getElementById(id);
  $('key').value = localStorage.getItem(LS) || '';
  $('x').onclick = () => host.remove();

  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
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

  function parseRows() {
    const out = [];
    for (const line of $('rows').value.split(/\r?\n/)) {
      const parts = line.split(/[\s;,]+/).filter(Boolean);
      if (!parts.length) continue;
      const [name, ...rest] = parts;
      const r = { name, pixel: rest.find(x => /^\d{6,}$/.test(x)), token: rest.find(x => /^EA[A-Za-z0-9]{20,}$/.test(x)), errors: [] };
      const junk = rest.filter(x => x !== r.pixel && x !== r.token);
      if (junk.length) r.errors.push('не понял: ' + junk.join(' '));
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
    const rows = parseRows();
    if (!rows.length) return log('Строк нет', 'err');
    const doms = parseDomains();
    if (doms.length && doms.length !== rows.length) return log(`Доменов ${doms.length}, а строк ${rows.length} — должно быть поровну`, 'err');
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
      for (const r of rows) {
        if (!r.pixel && !r.token && !r.domain && !r.errors.length) r.errors.push('нечего менять: нет ни pixel, ни token, ни домена');
      }
      const seen = new Map();
      for (const r of rows) {
        r.camps = r.errors.length ? [] : camps.filter(c => nameRe(r.name).test(c.name || ''));
        if (!r.errors.length && !r.camps.length) r.errors.push('кампаний с этим куском нейминга не найдено');
        for (const c of r.camps) seen.set(c.id, [...(seen.get(c.id) || []), r.name]);
      }
      for (const r of rows) {
        const box = el('div', 'it');
        box.append(el('div', '', `${r.name} → pixel ${r.pixel || '(не трогаем)'} · token ${r.token ? short(r.token) : '(не трогаем)'}` +
          (r.domainName ? ` · домен ${r.domainName}` : '')));
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

  async function apply() {
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

  $('check').onclick = check;
  $('apply').onclick = apply;
})();

# -*- coding: utf-8 -*-
"""
Сборка страницы с букмарклетом: kt_pixel_bookmarklet.js → index.html (GitHub Pages).

    python build.py
"""

import html
import os
import urllib.parse

here = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(here, "kt_pixel_bookmarklet.js"), encoding="utf-8").read()
url = "javascript:" + urllib.parse.quote(src, safe="")

page = """<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>KT pixel/token/домен</title>
<style>
  :root { --bg:#fff; --fg:#1c1e21; --muted:#65676b; --card:#f5f6f7; --line:#dadde1; --accent:#0866ff; }
  @media (prefers-color-scheme: dark) { :root { --bg:#18191a; --fg:#e4e6eb; --muted:#b0b3b8; --card:#242526; --line:#3a3b3c; --accent:#4599ff; } }
  body { margin:0; background:var(--bg); color:var(--fg); font:15px/1.5 system-ui,sans-serif; }
  main { max-width:680px; margin:0 auto; padding:32px 16px; }
  h1 { font-size:22px; margin:0 0 6px; }
  .sub { color:var(--muted); margin:0 0 24px; }
  .btn { display:inline-block; padding:12px 20px; background:var(--accent); color:#fff; border-radius:8px; text-decoration:none; font-weight:600; cursor:grab; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:16px 18px; margin:20px 0; }
  ol { padding-left:20px; margin:8px 0; } li { margin:4px 0; }
  code { background:var(--card); border:1px solid var(--line); border-radius:4px; padding:1px 5px; font-size:13px; }
  pre { background:var(--card); border:1px solid var(--line); border-radius:8px; padding:10px 12px; overflow-x:auto; font-size:13px; }
</style>
</head>
<body>
<main>
  <h1>KT pixel / token / домен</h1>
  <p class="sub">Букмарклет для админки Кейтаро: находит кампании по куску нейминга и меняет в них пиксель, токен и домен.</p>

  <p><a class="btn" href="%s" onclick="alert('Не нажимай — перетащи кнопку на панель закладок'); return false;">KT pixel/token</a></p>

  <div class="card">
    <b>Установка</b>
    <ol>
      <li>Показать панель закладок: <code>Ctrl+Shift+B</code>.</li>
      <li>Перетащить синюю кнопку выше на панель закладок.</li>
    </ol>
    Обновление: удалить старую закладку и перетащить заново.
  </div>

  <div class="card">
    <b>Работа</b>
    <ol>
      <li>Открыть админку Кейтаро и нажать закладку — справа появится панель.</li>
      <li>Один раз вписать API-ключ Кейтаро (Настройки → API). Он хранится только в твоём браузере.</li>
      <li>Строки: <code>кусок нейминга · pixel · token</code>, по одной на строку (можно вставить из таблицы).</li>
      <li>Домены — отдельным полем, в том же порядке, что строки. Пусто — домен не меняется.</li>
      <li>«Проверить» → посмотреть план → «Применить». После записи каждая кампания перечитывается и сверяется.</li>
    </ol>
<pre>1441411593399889   1067868436152332   EAAO...
1947923029177194   1029758310085003   EAAO...</pre>
    Меняется: <code>sub_id_16</code> (pixel), <code>sub_id_17</code> (token), <code>pixel=</code>/<code>token=</code> в заметках, домен кампании.
    Нейминг ищется целым куском: <code>1441411593399889</code> не зацепит <code>14414115933998891</code>.
  </div>
</main>
</body>
</html>
""" % html.escape(url, quote=True)

open(os.path.join(here, "index.html"), "w", encoding="utf-8").write(page)
print("index.html: букмарклет %d символов" % len(url))

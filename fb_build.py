# -*- coding: utf-8 -*-
"""
Сборка страницы с букмарклетом снятия ложных отклонов FB:
    fb_reject_bookmarklet.js -> fb.html (GitHub Pages).

    python fb_build.py
"""

import html
import os
import urllib.parse

here = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(here, "fb_reject_bookmarklet.js"), encoding="utf-8").read()
url = "javascript:" + urllib.parse.quote(src, safe="")

page = """<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>FB: снятие ложных отклонов</title>
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
</style>
</head>
<body>
<main>
  <h1>FB: снятие ложных отклонов</h1>
  <p class="sub">Букмарклет: по списку кабинетов находит отклонённые объявления под активными кампаниями, подставляет белый заголовок (язык — по названию кампании) и переотправляет на ремодерацию.</p>
  <p class="sub">Ещё инструмент: <a href="index.html">KT pixel / token / домен</a>.</p>

  <p><a class="btn" href="%s" onclick="alert('Не нажимай — перетащи кнопку на панель закладок'); return false;">FB отклоны</a></p>

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
      <li>Открыть <code>business.facebook.com</code> под нужным профилем и нажать закладку — справа появится панель.</li>
      <li>Один раз вписать FB-токен системного юзера (с правом <code>ads_management</code>). Хранится только в браузере.</li>
      <li>Вписать кабинеты — ID по одному в строке.</li>
      <li>Галка «менять заголовок на белый» — язык берётся по префиксу гео в названии кампании (<code>au_…</code> → EN, <code>de_…</code> → DE и т.д.). Снять галку — просто переотправка без смены текста.</li>
      <li>«Проверить» → виден список отклонённых под активными кампаниями → «Применить».</li>
      <li>После отправки через ~10 с показываются статусы: <code>ACTIVE</code> — снято, <code>IN_PROCESS</code> — в ревью, <code>DISAPPROVED</code> — жёсткий отклон (переотправкой не лечится).</li>
    </ol>
    Работает только с <b>активными</b> кампаниями; отклоны в отключённых пропускаются. Объявление не дублируется — пересобирается его же креатив (ad ID сохраняется).
  </div>
</main>
</body>
</html>
""" % html.escape(url, quote=True)

open(os.path.join(here, "fb.html"), "w", encoding="utf-8").write(page)
print("fb.html: букмарклет %d символов" % len(url))

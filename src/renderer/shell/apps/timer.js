'use strict';
/* Timer: focus sessions, and the honest record of what they were spent on. */

Shell.register('timer', (view, UI) => {
  const { esc, DB } = UI;
  const DIAL_R = 104;
  const DIAL_C = 2 * Math.PI * DIAL_R;
  const WORK_MODES = new Set(['focus', 'stopwatch']);
  const MODE_LABEL = { focus: 'Focus', short: 'Short break', long: 'Long break', stopwatch: 'Free run' };

  let state = null;
  let selectedMode = 'focus';
  let query = '';

  view.innerHTML = `
    <div class="page">
      <div class="cols cols--console">
        <section class="col" id="console">
          <div class="card">
            <label class="stamp" for="tTask">Case file</label>
            <input id="tTask" class="input input--big" type="text" maxlength="160" spellcheck="false"
                   placeholder="What are you working on?" />
            <div class="hint">Press <kbd>Enter</kbd> to start &middot; use <b>#tags</b> to group sessions</div>
          </div>

          <div class="modes" id="tModes">
            <button class="chipMode" data-mode="focus"><span>Focus</span><em id="minFocus">25</em></button>
            <button class="chipMode" data-mode="short"><span>Short</span><em id="minShort">5</em></button>
            <button class="chipMode" data-mode="long"><span>Long</span><em id="minLong">15</em></button>
            <button class="chipMode" data-mode="stopwatch"><span>Free</span><em>&#8734;</em></button>
          </div>

          <div class="dial">
            <svg viewBox="0 0 240 240" class="dial__svg" aria-hidden="true">
              <circle class="dial__track" cx="120" cy="120" r="104" />
              <circle class="dial__fill" id="dialFill" cx="120" cy="120" r="104" transform="rotate(-90 120 120)" />
              <g class="dial__ticks" id="dialTicks"></g>
            </svg>
            <div class="dial__center">
              <span class="stamp" id="dialMode">Focus</span>
              <div class="dial__time" id="dialTime">25:00</div>
              <div class="dial__sub" id="dialSub">ready when you are</div>
            </div>
          </div>

          <div class="controls">
            <button class="btn btn--primary btn--big" id="btnStart">Start session</button>
            <div class="controls__run" id="runControls" hidden>
              <button class="btn" id="btnPause">Pause</button>
              <button class="btn" id="btnExtend">+5 min</button>
              <button class="btn btn--danger" id="btnStop">Stop &amp; log</button>
            </div>
          </div>

          <div class="goal">
            <div class="goal__head">
              <span class="stamp">Daily quota</span>
              <span id="goalText">0m / 2h</span>
            </div>
            <div class="goal__bar"><div class="goal__fill" id="goalFill"></div></div>
          </div>
        </section>

        <section class="col" id="log">
          <div class="stats" id="tStats"></div>

          <div class="card">
            <div class="card__head">
              <span class="stamp">Last 7 days</span>
              <span class="stamp" id="weekTotal"></span>
            </div>
            <div class="chart" id="chart"></div>
          </div>

          <div class="card card--fill">
            <div class="card__head">
              <span class="stamp">Time sheet</span>
              <div class="card__tools">
                <input id="tSearch" class="search" type="search" placeholder="Search tasks or #tags" />
                <button class="btn btn--ghost small" id="btnExport">Export CSV</button>
              </div>
            </div>
            <div class="scroll" id="entries"></div>
          </div>
        </section>
      </div>
    </div>`;

  const el = {
    task: view.querySelector('#tTask'), modes: view.querySelector('#tModes'),
    dialFill: view.querySelector('#dialFill'), dialTicks: view.querySelector('#dialTicks'),
    dialMode: view.querySelector('#dialMode'), dialTime: view.querySelector('#dialTime'),
    dialSub: view.querySelector('#dialSub'),
    btnStart: view.querySelector('#btnStart'), runControls: view.querySelector('#runControls'),
    btnPause: view.querySelector('#btnPause'), btnExtend: view.querySelector('#btnExtend'),
    btnStop: view.querySelector('#btnStop'),
    goalText: view.querySelector('#goalText'), goalFill: view.querySelector('#goalFill'),
    stats: view.querySelector('#tStats'), chart: view.querySelector('#chart'),
    weekTotal: view.querySelector('#weekTotal'), entries: view.querySelector('#entries'),
    search: view.querySelector('#tSearch'),
    minFocus: view.querySelector('#minFocus'), minShort: view.querySelector('#minShort'),
    minLong: view.querySelector('#minLong')
  };

  el.dialFill.setAttribute('stroke-dasharray', String(DIAL_C));
  el.dialFill.setAttribute('stroke-dashoffset', String(DIAL_C));

  (function drawTicks() {
    let out = '';
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * Math.PI * 2 - Math.PI / 2;
      const long = i % 5 === 0;
      const r1 = long ? 82 : 87;
      out += `<line x1="${(120 + Math.cos(a) * r1).toFixed(2)}" y1="${(120 + Math.sin(a) * r1).toFixed(2)}"
                    x2="${(120 + Math.cos(a) * 91).toFixed(2)}" y2="${(120 + Math.sin(a) * 91).toFixed(2)}"
                    ${long ? 'stroke-width="3.5"' : ''} />`;
    }
    el.dialTicks.innerHTML = out;
  })();

  // ------------------------------------------------------------- controls
  const plannedMs = (mode) => {
    const map = { focus: 'focusMinutes', short: 'shortBreakMinutes', long: 'longBreakMinutes' };
    const key = map[mode];
    return key ? (DB.settings[key] || 25) * 60000 : 0;
  };

  const start = () => window.tick.timer.start({ mode: selectedMode, task: el.task.value });

  el.btnStart.addEventListener('click', start);
  el.btnPause.addEventListener('click', () => window.tick.timer.toggle());
  el.btnStop.addEventListener('click', () => window.tick.timer.stop());
  el.btnExtend.addEventListener('click', () => window.tick.timer.extend(5));
  el.task.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (!state || state.status === 'idle')) start();
  });
  el.modes.addEventListener('click', (e) => {
    const chip = e.target.closest('.chipMode');
    if (!chip) return;
    selectedMode = chip.dataset.mode;
    renderDial();
  });

  el.search.addEventListener('input', () => {
    query = el.search.value.trim().toLowerCase();
    renderEntries();
  });

  el.entries.addEventListener('click', (e) => {
    const del = e.target.closest('.iconBtn');
    if (del) DB.remove('entries', del.dataset.id);
  });
  el.entries.addEventListener('keydown', (e) => {
    if (e.target.classList.contains('entryTask') && e.key === 'Enter') {
      e.preventDefault();
      e.target.blur();
    }
  });
  el.entries.addEventListener('blur', (e) => {
    const field = e.target;
    if (!field.classList || !field.classList.contains('entryTask')) return;
    const entry = DB.get('entries').find((x) => x.id === field.dataset.id);
    const next = field.textContent.trim();
    if (!entry || next === entry.task) return;
    DB.update('entries', entry.id, { task: next, tags: UI.parseTags(next) });
  }, true);

  view.querySelector('#btnExport').addEventListener('click', () => {
    const header = ['started', 'ended', 'mode', 'task', 'tags', 'minutes', 'completed'];
    const rows = DB.get('entries').map((e) => [
      e.startedAt, e.endedAt, e.mode, e.task, (e.tags || []).join(' '),
      ((e.actualMs || 0) / 60000).toFixed(1), e.completed ? 'yes' : 'no'
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((c) => `"${String(c == null ? '' : c).replace(/"/g, '""')}"`).join(','))
      .join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `tick-log-${UI.dayKey()}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  });

  // ------------------------------------------------------------ rendering
  function renderDial() {
    if (!state) return;
    const running = state.status !== 'idle';
    const mode = running ? state.mode : selectedMode;

    if (running) {
      el.dialTime.textContent = Fmt.clock(state.kind === 'countup' ? state.elapsedMs : state.remainingMs);
      el.dialMode.textContent = state.status === 'paused' ? 'Paused' : MODE_LABEL[mode];
      el.dialSub.textContent = state.task || 'no case file attached';
      el.dialFill.setAttribute('stroke-dashoffset', String(DIAL_C * (1 - state.progress)));
      document.body.dataset.urgent = String(state.kind === 'countdown'
        && state.remainingMs <= 10000 && state.status === 'running');
      if (state.task && document.activeElement !== el.task) el.task.value = state.task;
      selectedMode = state.mode;
    } else {
      el.dialTime.textContent = mode === 'stopwatch' ? '00:00' : Fmt.clock(plannedMs(mode));
      el.dialMode.textContent = MODE_LABEL[mode];
      el.dialSub.textContent = 'ready when you are';
      el.dialFill.setAttribute('stroke-dashoffset', String(DIAL_C));
      document.body.dataset.urgent = 'false';
    }

    el.btnStart.hidden = running;
    el.runControls.hidden = !running;
    el.btnPause.textContent = state.status === 'paused' ? 'Resume' : 'Pause';
    el.btnExtend.disabled = state.kind === 'countup';

    for (const chip of el.modes.querySelectorAll('.chipMode')) {
      chip.setAttribute('aria-pressed', String(chip.dataset.mode === selectedMode));
    }
    el.minFocus.textContent = DB.settings.focusMinutes;
    el.minShort.textContent = DB.settings.shortBreakMinutes;
    el.minLong.textContent = DB.settings.longBreakMinutes;
  }

  const workedOn = (key) => DB.get('entries').reduce((sum, e) =>
    (WORK_MODES.has(e.mode) && Fmt.dayKey(e.endedAt || e.startedAt) === key)
      ? sum + (e.actualMs || 0) : sum, 0);

  function streak() {
    const days = new Set(DB.get('entries')
      .filter((e) => WORK_MODES.has(e.mode) && (e.actualMs || 0) >= 60000)
      .map((e) => Fmt.dayKey(e.endedAt || e.startedAt)));
    if (!days.size) return 0;
    let cursor = new Date();
    if (!days.has(Fmt.dayKey(cursor))) {
      cursor = new Date(cursor.getTime() - 86400000);
      if (!days.has(Fmt.dayKey(cursor))) return 0;
    }
    let n = 0;
    while (days.has(Fmt.dayKey(cursor))) { n++; cursor = new Date(cursor.getTime() - 86400000); }
    return n;
  }

  function renderStats() {
    const today = UI.dayKey();
    const todayMs = workedOn(today);
    const sessions = DB.get('entries').filter((e) =>
      WORK_MODES.has(e.mode) && Fmt.dayKey(e.endedAt || e.startedAt) === today).length;
    let weekMs = 0;
    for (let i = 0; i < 7; i++) weekMs += workedOn(UI.dayKey(-i));

    el.stats.innerHTML = [
      { v: Fmt.duration(todayMs), l: 'Focused today', a: true },
      { v: String(sessions), l: 'Sessions today' },
      { v: Fmt.duration(weekMs), l: 'Last 7 days' },
      { v: `${streak()}d`, l: 'Streak' }
    ].map((c) => `
      <div class="stat ${c.a ? 'stat--accent' : ''}">
        <span class="stat__value">${esc(c.v)}</span>
        <span class="stat__label">${esc(c.l)}</span>
      </div>`).join('');

    const goalMs = (DB.settings.dailyGoalMinutes || 0) * 60000;
    el.goalFill.style.width = goalMs ? `${Math.min(100, (todayMs / goalMs) * 100)}%` : '0%';
    el.goalText.textContent = goalMs
      ? `${Fmt.duration(todayMs)} / ${Fmt.duration(goalMs)}`
      : Fmt.duration(todayMs);
  }

  function renderChart() {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      days.push({ key: Fmt.dayKey(d), date: d, ms: workedOn(Fmt.dayKey(d)) });
    }
    const max = Math.max(...days.map((d) => d.ms), (DB.settings.dailyGoalMinutes || 60) * 60000 * 0.6);
    const today = UI.dayKey();
    el.chart.innerHTML = days.map((d) => `
      <div class="chart__day ${d.key === today ? 'chart__day--today' : ''}">
        <div class="chart__barWrap">
          <div class="chart__bar" style="height:${max ? Math.max(3, (d.ms / max) * 100) : 3}%">
            <span>${esc(Fmt.duration(d.ms))}</span>
          </div>
        </div>
        <div class="chart__label">${esc(d.date.toLocaleDateString([], { weekday: 'short' }))}</div>
      </div>`).join('');
    el.weekTotal.textContent = Fmt.duration(days.reduce((s, d) => s + d.ms, 0));
  }

  function renderEntries() {
    const all = DB.get('entries');
    const visible = all.filter((e) => {
      if (!query) return true;
      return `${e.task} ${(e.tags || []).map((t) => '#' + t).join(' ')}`.toLowerCase().includes(query);
    });

    if (!visible.length) {
      el.entries.innerHTML = all.length
        ? `<div class="empty">Nothing matches <b>${esc(query)}</b>.</div>`
        : `<div class="empty">No sessions logged yet.<br />Type what you are working on and hit <b>Start</b>.</div>`;
      return;
    }

    const groups = new Map();
    for (const e of visible) {
      const key = Fmt.dayKey(e.endedAt || e.startedAt);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(e);
    }

    el.entries.innerHTML = [...groups.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([key, list]) => {
        const total = list.reduce((s, e) => (WORK_MODES.has(e.mode) ? s + (e.actualMs || 0) : s), 0);
        const rows = list.map((e) => {
          const partial = !e.completed && e.mode !== 'stopwatch';
          return `
            <div class="entry">
              <span class="entry__time">${esc(Fmt.timeOfDay(e.startedAt))}</span>
              <div class="entryTask" contenteditable="plaintext-only" spellcheck="false"
                   data-id="${e.id}">${esc(e.task)}</div>
              <span class="pill pill--${e.mode} ${partial ? 'pill--partial' : ''}"
                    title="${partial ? 'stopped early' : 'ran to the end'}">${esc(MODE_LABEL[e.mode] || e.mode)}</span>
              <span class="entry__dur">${esc(Fmt.duration(e.actualMs))}</span>
              <button class="iconBtn" data-id="${e.id}" title="Delete">&#10005;</button>
            </div>`;
        }).join('');
        return `
          <div class="dayGroup">
            <div class="dayHead">
              <span class="dayHead__name">${esc(Fmt.dayLabel(key))}</span>
              <span class="dayHead__total">${esc(Fmt.duration(total))}</span>
            </div>${rows}
          </div>`;
      }).join('');
  }

  function refresh() {
    renderDial();
    renderStats();
    renderChart();
    renderEntries();
  }

  refresh();
  el.task.focus();

  return {
    refresh,
    onState(next) { state = next; renderDial(); }
  };
});

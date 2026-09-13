'use strict';
/* Habits: a row per habit, a square per day. Click a square to tick it off. */

Shell.register('habits', (view, UI) => {
  const { esc, DB } = UI;

  const DAYS = 14;            // a fortnight is all you ever act on
  const COLORS = ['#f48f2d', '#2f8577', '#7b5ea7', '#c9452f', '#3f8f52', '#c9a13c', '#d98aa8'];

  view.innerHTML = `
    <div class="page">
      <div class="card card--bare">
        <div class="row">
          <input id="newHabit" class="input input--big grow" type="text" maxlength="60"
                 spellcheck="false" placeholder="A habit worth keeping (read, walk, no phone before 9)" />
          <button class="btn btn--primary" id="addHabit">Add</button>
        </div>
      </div>

      <div class="stats" id="habitStats"></div>

      <div class="card card--fill">
        <div class="card__head">
          <span class="stamp">Last ${DAYS} days</span>
          <span class="stamp" id="habitToday"></span>
        </div>
        <div class="scroll" id="habitList"></div>
      </div>
    </div>`;

  const el = {
    input: view.querySelector('#newHabit'),
    list: view.querySelector('#habitList'),
    stats: view.querySelector('#habitStats'),
    today: view.querySelector('#habitToday')
  };

  const habits = () => DB.get('habits');

  async function addHabit() {
    const name = el.input.value.trim();
    if (!name) return;
    el.input.value = '';
    await DB.add('habits', {
      name,
      color: COLORS[habits().length % COLORS.length],
      ticks: []
    });
  }

  el.input.addEventListener('keydown', (e) => { if (e.key === 'Enter') addHabit(); });
  view.querySelector('#addHabit').addEventListener('click', addHabit);

  el.list.addEventListener('click', async (e) => {
    const cell = e.target.closest('.cell');
    if (cell) {
      const habit = habits().find((h) => h.id === cell.dataset.id);
      if (!habit) return;
      const day = cell.dataset.day;
      const ticks = new Set(habit.ticks || []);
      if (ticks.has(day)) ticks.delete(day); else ticks.add(day);
      await DB.update('habits', habit.id, { ticks: [...ticks].sort() });
      return;
    }
    const del = e.target.closest('.delBtn');
    if (del) await DB.remove('habits', del.dataset.id);
  });

  el.list.addEventListener('keydown', (e) => {
    if (e.target.classList.contains('habitName') && e.key === 'Enter') {
      e.preventDefault();
      e.target.blur();
    }
  });
  el.list.addEventListener('blur', (e) => {
    const f = e.target;
    if (!f.classList || !f.classList.contains('habitName')) return;
    const habit = habits().find((h) => h.id === f.dataset.id);
    const next = f.textContent.trim();
    if (habit && next && next !== habit.name) DB.update('habits', habit.id, { name: next });
  }, true);

  // ------------------------------------------------------------ rendering
  function streakOf(habit) {
    const ticks = new Set(habit.ticks || []);
    if (!ticks.size) return 0;
    let cursor = 0;
    if (!ticks.has(UI.dayKey())) {
      if (!ticks.has(UI.dayKey(-1))) return 0;
      cursor = -1;
    }
    let n = 0;
    while (ticks.has(UI.dayKey(cursor))) { n++; cursor--; }
    return n;
  }

  function render() {
    const list = habits();
    const today = UI.dayKey();
    const doneToday = list.filter((h) => (h.ticks || []).includes(today)).length;
    const best = list.reduce((m, h) => Math.max(m, streakOf(h)), 0);
    const total = list.reduce((s, h) => s + (h.ticks || []).length, 0);

    el.stats.innerHTML = [
      { v: `${doneToday}/${list.length || 0}`, l: 'Done today', a: true },
      { v: String(best), l: 'Best streak' },
      { v: String(list.length), l: 'Habits' },
      { v: String(total), l: 'Total ticks' }
    ].map((c) => `
      <div class="stat ${c.a ? 'stat--accent' : ''}">
        <span class="stat__value">${esc(c.v)}</span>
        <span class="stat__label">${esc(c.l)}</span>
      </div>`).join('');

    el.today.textContent = list.length
      ? (doneToday === list.length ? 'all done today' : `${list.length - doneToday} left today`)
      : '';

    if (!list.length) {
      el.list.innerHTML = '<div class="empty">No habits yet.<br />Add one above &mdash; small and daily beats big and rare.</div>';
      return;
    }

    const days = [];
    for (let i = DAYS - 1; i >= 0; i--) days.push(UI.dayKey(-i));

    el.list.innerHTML = list.map((h) => {
      const ticks = new Set(h.ticks || []);
      const streak = streakOf(h);
      const cells = days.map((d) => `
        <button class="cell ${ticks.has(d) ? 'is-on' : ''} ${d === today ? 'is-today' : ''}"
                data-id="${h.id}" data-day="${d}"
                style="--cell:${h.color}" title="${esc(UI.dueLabel(d))}"></button>`).join('');
      return `
        <div class="habitRow">
          <div class="habitRow__head">
            <span class="habitDot" style="background:${h.color}"></span>
            <span class="habitName" contenteditable="plaintext-only" spellcheck="false"
                  data-id="${h.id}">${esc(h.name)}</span>
            <span class="habitStreak">${streak ? `&#128293; ${streak}` : ''}</span>
            <button class="iconBtn delBtn" data-id="${h.id}" title="Delete">&#10005;</button>
          </div>
          <div class="cells">${cells}</div>
        </div>`;
    }).join('');
  }

  render();
  el.input.focus();
  return { refresh: render };
});

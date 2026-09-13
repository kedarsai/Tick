'use strict';
/* Tasks: what needs doing, and when.
   Two ways to look at it - a list you work down, and a month you plan across.
   Dragging a task onto a day is the whole rescheduling gesture. */

Shell.register('tasks', (view, UI) => {
  const { esc, DB } = UI;

  const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  let mode = DB.settings.taskView === 'calendar' ? 'calendar' : 'list';
  let filter = 'open';
  let tagFilter = null;
  let cursor = startOfMonth(new Date());     // which month the calendar shows

  function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }

  view.innerHTML = `
    <div class="page">
      <div class="card card--bare">
        <div class="row">
          <input id="newTask" class="input input--big grow" type="text" maxlength="200"
                 spellcheck="false" placeholder="What needs doing?  (#project  !important  today)" />
          <button class="btn btn--primary" id="addTask">Add</button>
          <div class="seg" id="viewSeg">
            <button data-v="list">List</button>
            <button data-v="calendar">Calendar</button>
          </div>
        </div>
        <div class="hint" style="margin-top:7px">
          <b>#tag</b> files it &middot; <b>!</b> flags it &middot; <b>today</b>, <b>tomorrow</b>,
          <b>mon</b>&ndash;<b>sun</b> or <b>+3</b> sets a date
        </div>
      </div>

      <div class="stats" id="taskStats"></div>
      <div id="taskBody" class="taskBody"></div>
    </div>`;

  const el = {
    input: view.querySelector('#newTask'),
    stats: view.querySelector('#taskStats'),
    body: view.querySelector('#taskBody'),
    seg: view.querySelector('#viewSeg')
  };

  // ------------------------------------------------------------- adding
  async function addTask() {
    const raw = el.input.value.trim();
    if (!raw) return;
    const parsed = UI.parseTask(raw);
    if (!parsed.title) return;
    el.input.value = '';
    await DB.add('tasks', { ...parsed, dueTime: null, someday: false, done: false, doneAt: null });
  }

  el.input.addEventListener('keydown', (e) => { if (e.key === 'Enter') addTask(); });
  view.querySelector('#addTask').addEventListener('click', addTask);

  el.seg.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.dataset.v === mode) return;
    mode = b.dataset.v;
    window.tick.settings.update({ taskView: mode });
    render();
  });

  // -------------------------------------------------------- shared bits
  const tasks = () => DB.get('tasks');
  const byId = (id) => tasks().find((t) => t.id === id);

  async function toggleDone(id) {
    const t = byId(id);
    if (!t) return;
    await DB.update('tasks', id, {
      done: !t.done,
      doneAt: t.done ? null : new Date().toISOString()
    });
  }

  function order(a, b) {
    if (a.priority !== b.priority) return a.priority ? -1 : 1;
    if (!!a.due !== !!b.due) return a.due ? -1 : 1;
    if (a.due && b.due && a.due !== b.due) return a.due < b.due ? -1 : 1;
    if (a.due && b.due) {
      const at = a.dueTime || '99:99';
      const bt = b.dueTime || '99:99';
      if (at !== bt) return at < bt ? -1 : 1;
    }
    return (b.createdAt || '') < (a.createdAt || '') ? -1 : 1;
  }

  function renderStats() {
    const today = UI.dayKey();
    const all = tasks();
    const open = all.filter((t) => !t.done);
    const due = open.filter((t) => t.due && t.due <= today).length;
    const late = open.filter((t) => t.due && t.due < today).length;
    const doneToday = all.filter((t) => t.done && t.doneAt && Fmt.dayKey(t.doneAt) === today).length;

    el.stats.innerHTML = [
      { v: String(due), l: 'Due today', a: true },
      { v: String(open.length), l: 'Still open' },
      { v: String(doneToday), l: 'Done today' },
      { v: String(late), l: 'Overdue' }
    ].map((c) => `
      <div class="stat ${c.a ? 'stat--accent' : ''}">
        <span class="stat__value">${esc(c.v)}</span>
        <span class="stat__label">${esc(c.l)}</span>
      </div>`).join('');
  }

  // =========================================================== list view
  function visibleTasks() {
    const today = UI.dayKey();
    let list = tasks();
    if (tagFilter) list = list.filter((t) => (t.tags || []).includes(tagFilter));

    if (filter === 'done') list = list.filter((t) => t.done);
    else if (filter === 'today') list = list.filter((t) => !t.done && t.due && t.due <= today);
    else if (filter === 'upcoming') list = list.filter((t) => !t.done && t.due && t.due > today);
    else if (filter === 'later') list = list.filter((t) => !t.done && t.someday);
    else list = list.filter((t) => !t.done && !t.someday);

    return list.sort(order);
  }

  function topTags() {
    const counts = new Map();
    for (const t of tasks()) {
      if (t.done) continue;
      for (const tag of t.tags || []) counts.set(tag, (counts.get(tag) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }

  function renderList() {
    const today = UI.dayKey();
    const list = visibleTasks();

    const rows = list.length ? list.map((t) => {
      const late = t.due && t.due < today && !t.done;
      const when = t.due
        ? UI.dueLabel(t.due) + (t.dueTime ? ` ${t.dueTime}` : '')
        : (t.someday ? 'Someday' : '');
      const duePill = when
        ? `<span class="pill ${late ? 'pill--late' : (t.someday ? 'pill--soft' : 'pill--due')}">${esc(when)}</span>`
        : '';
      return `
        <div class="item ${t.done ? 'done' : ''}">
          <button class="check ${t.done ? 'is-on' : ''}" data-id="${t.id}" title="Toggle">&#10003;</button>
          <div class="item__body">
            <div class="taskTitle item__title" contenteditable="plaintext-only"
                 spellcheck="false" data-id="${t.id}">${esc(t.title)}</div>
            ${(t.tags || []).length ? `<div class="item__meta">${(t.tags || []).map((x) => '#' + esc(x)).join(' ')}</div>` : ''}
          </div>
          ${duePill}
          <input class="dueInput" type="date" data-id="${t.id}" value="${t.due || ''}" title="Due date" />
          <button class="iconBtn flagBtn ${t.priority ? 'is-always' : ''}" data-id="${t.id}"
                  title="Flag" style="${t.priority ? 'color:var(--brick)' : ''}">&#9873;</button>
          <button class="iconBtn iconBtn--ok timeBtn" data-id="${t.id}" title="Start a focus session on this">&#9200;</button>
          <button class="iconBtn delBtn" data-id="${t.id}" title="Delete">&#10005;</button>
        </div>`;
    }).join('') : (tasks().length
      ? '<div class="empty">Nothing here.<br />Try another filter.</div>'
      : '<div class="empty">No tasks yet.<br />Type one above &mdash; <b>Ship the report #work tomorrow !</b></div>');

    el.body.innerHTML = `
      <div class="card card--fill">
        <div class="card__head">
          <div class="seg" id="taskFilter">
            <button data-f="open">Open</button>
            <button data-f="today">Today</button>
            <button data-f="upcoming">Upcoming</button>
            <button data-f="later">Later</button>
            <button data-f="done">Done</button>
          </div>
          <div class="card__tools">
            <div class="tags" id="taskTags">
              ${topTags().map(([tag, n]) => `
                <button class="tag ${tagFilter === tag ? 'is-on' : ''}" data-tag="${esc(tag)}">#${esc(tag)} ${n}</button>`).join('')}
            </div>
            <button class="btn btn--ghost small" id="clearDone">Clear done</button>
          </div>
        </div>
        <div class="scroll">${rows}</div>
      </div>`;

    for (const b of el.body.querySelectorAll('#taskFilter button')) {
      b.setAttribute('aria-pressed', String(b.dataset.f === filter));
    }
  }

  // ======================================================= calendar view
  function renderCalendar() {
    const today = UI.dayKey();
    const first = startOfMonth(cursor);
    const lead = (first.getDay() + 6) % 7;          // Monday-first grid
    const gridStart = new Date(first);
    gridStart.setDate(first.getDate() - lead);

    const cells = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      cells.push(d);
    }

    const byDay = new Map();
    for (const t of tasks()) {
      if (t.someday || !t.due) continue;
      if (!byDay.has(t.due)) byDay.set(t.due, []);
      byDay.get(t.due).push(t);
    }
    for (const list of byDay.values()) list.sort(order);

    const chip = (t) => `
      <button class="calTask ${t.done ? 'is-done' : ''} ${t.priority ? 'is-flagged' : ''}"
              draggable="true" data-id="${t.id}" title="${esc(t.title)}">
        ${t.dueTime ? `<span class="calTask__at">${esc(t.dueTime)}</span>` : ''}
        <span class="calTask__name">${esc(t.title)}</span>
      </button>`;

    const grid = cells.map((d) => {
      const key = Fmt.dayKey(d);
      const outside = d.getMonth() !== first.getMonth();
      const list = byDay.get(key) || [];
      const undone = list.filter((t) => !t.done).length;
      const late = key < today && undone > 0;
      return `
        <div class="calDay${outside ? ' is-outside' : ''}${key === today ? ' is-today' : ''}${late ? ' is-late' : ''}"
             data-day="${key}">
          <div class="calDay__head">
            <span class="calDay__num">${d.getDate()}</span>
            ${undone ? `<span class="calDay__count">${undone}</span>` : ''}
          </div>
          <div class="calDay__list">${list.map(chip).join('')}</div>
        </div>`;
    }).join('');

    const unscheduled = tasks()
      .filter((t) => !t.done && (!t.due || t.someday))
      .sort(order);

    el.body.innerHTML = `
      <div class="calWrap">
        <div class="card card--fill calCard">
          <div class="card__head">
            <div class="calNav">
              <button class="calNav__btn" id="calPrev" title="Previous month">&#8249;</button>
              <span class="calNav__label">${esc(first.toLocaleDateString([], { month: 'long', year: 'numeric' }))}</span>
              <button class="calNav__btn" id="calNext" title="Next month">&#8250;</button>
              <button class="btn btn--ghost small" id="calToday">Today</button>
            </div>
            <span class="hint">Drag a task onto a day to move it</span>
          </div>
          <div class="calHead">${WEEKDAYS.map((w) => `<span>${w}</span>`).join('')}</div>
          <div class="calGrid">${grid}</div>
        </div>

        <div class="card calSide" id="calSide">
          <div class="card__head">
            <span class="stamp">Unscheduled</span>
            <span class="stamp">${unscheduled.length}</span>
          </div>
          <div class="scroll">
            ${unscheduled.length
              ? unscheduled.map(chip).join('')
              : '<div class="empty">Everything has a day.</div>'}
          </div>
        </div>
      </div>`;
  }

  // ---------------------------------------------------------- behaviour
  el.body.addEventListener('click', async (e) => {
    const check = e.target.closest('.check');
    if (check) return toggleDone(check.dataset.id);

    const flag = e.target.closest('.flagBtn');
    if (flag) {
      const t = byId(flag.dataset.id);
      if (t) await DB.update('tasks', t.id, { priority: !t.priority });
      return;
    }
    const del = e.target.closest('.delBtn');
    if (del) { DB.remove('tasks', del.dataset.id); return; }

    const timerBtn = e.target.closest('.timeBtn');
    if (timerBtn) {
      const t = byId(timerBtn.dataset.id);
      if (t) {
        window.tick.timer.start({
          mode: 'focus',
          task: [t.title, ...(t.tags || []).map((x) => '#' + x)].join(' ')
        });
        Shell.open('timer');
      }
      return;
    }

    const calTask = e.target.closest('.calTask');
    if (calTask) return toggleDone(calTask.dataset.id);

    const f = e.target.closest('#taskFilter button');
    if (f) { filter = f.dataset.f; return render(); }

    const tag = e.target.closest('.tag');
    if (tag) { tagFilter = tagFilter === tag.dataset.tag ? null : tag.dataset.tag; return render(); }

    if (e.target.closest('#clearDone')) {
      for (const t of tasks().filter((x) => x.done)) await DB.remove('tasks', t.id);
      return;
    }
    if (e.target.closest('#calPrev')) {
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1);
      return render();
    }
    if (e.target.closest('#calNext')) {
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
      return render();
    }
    if (e.target.closest('#calToday')) {
      cursor = startOfMonth(new Date());
      return render();
    }
  });

  el.body.addEventListener('keydown', (e) => {
    if (e.target.classList.contains('taskTitle') && e.key === 'Enter') {
      e.preventDefault();
      e.target.blur();
    }
  });
  el.body.addEventListener('blur', (e) => {
    const f = e.target;
    if (!f.classList || !f.classList.contains('taskTitle')) return;
    const t = byId(f.dataset.id);
    const next = f.textContent.trim();
    if (!t || !next || next === t.title) return;
    DB.update('tasks', t.id, { title: next, tags: UI.parseTags(next) });
  }, true);

  el.body.addEventListener('change', (e) => {
    if (e.target.classList.contains('dueInput')) {
      DB.update('tasks', e.target.dataset.id, { due: e.target.value || null });
    }
  });

  // ---- dragging a task onto a day is the whole rescheduling gesture ----
  let dragId = null;

  el.body.addEventListener('dragstart', (e) => {
    const chip = e.target.closest('.calTask');
    if (!chip) return;
    dragId = chip.dataset.id;
    chip.classList.add('is-dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragId);
  });

  el.body.addEventListener('dragend', (e) => {
    const chip = e.target.closest('.calTask');
    if (chip) chip.classList.remove('is-dragging');
    for (const c of el.body.querySelectorAll('.is-over')) c.classList.remove('is-over');
    dragId = null;
  });

  el.body.addEventListener('dragover', (e) => {
    const target = e.target.closest('.calDay, .calSide');
    if (!target) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    target.classList.add('is-over');
  });

  el.body.addEventListener('dragleave', (e) => {
    const target = e.target.closest('.calDay, .calSide');
    if (target) target.classList.remove('is-over');
  });

  el.body.addEventListener('drop', async (e) => {
    const day = e.target.closest('.calDay');
    const side = e.target.closest('.calSide');
    if (!day && !side) return;
    e.preventDefault();
    (day || side).classList.remove('is-over');
    const id = dragId || e.dataTransfer.getData('text/plain');
    if (!id) return;
    if (day) await DB.update('tasks', id, { due: day.dataset.day, someday: false });
    else await DB.update('tasks', id, { due: null, dueTime: null });
  });

  // ------------------------------------------------------------- render
  function render() {
    for (const b of el.seg.querySelectorAll('button')) {
      b.setAttribute('aria-pressed', String(b.dataset.v === mode));
    }
    renderStats();
    if (mode === 'calendar') renderCalendar(); else renderList();
  }

  render();
  el.input.focus();
  return { refresh: render };
});

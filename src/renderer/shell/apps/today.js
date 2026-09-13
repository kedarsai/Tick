'use strict';
/* Today: the one screen that answers "what now?" - and a capture box that
   puts whatever you type into the right app. */

Shell.register('today', (view, UI) => {
  const { esc, DB } = UI;

  const WORK_MODES = new Set(['focus', 'stopwatch']);

  view.innerHTML = `
    <div class="page page--scroll">
      <section class="card">
        <div class="row" style="justify-content:space-between; align-items:flex-start">
          <div>
            <div class="hello" id="hello"></div>
            <div class="hint" id="helloDate"></div>
          </div>
          <button class="btn btn--primary" id="quickFocus">Start a focus session</button>
        </div>
      </section>

      <section class="card card--bare">
        <div class="row">
          <input id="capture" class="input input--big grow" type="text" maxlength="400"
                 placeholder="Capture anything..." />
          <button class="btn btn--primary" id="captureAdd">Add</button>
        </div>
        <div class="hint" style="margin-top:7px">
          Goes straight to the <b>Inbox</b> &mdash; or press
          <b>${esc(UI.captureKey())}</b> from any app. Sort it later; deciding
          what something is costs more than writing it down.
        </div>
      </section>

      <div class="stats" id="todayStats"></div>

      <div class="cols cols--2">
        <section class="card card--fill">
          <div class="card__head">
            <span class="stamp">On the list</span>
            <button class="btn btn--ghost small" data-go="tasks">All tasks</button>
          </div>
          <div class="scroll" id="todayTasks"></div>
        </section>

        <section class="card card--fill">
          <div class="card__head">
            <span class="stamp">Habits</span>
            <button class="btn btn--ghost small" data-go="habits">All habits</button>
          </div>
          <div class="scroll" id="todayHabits"></div>
        </section>
      </div>

      <div class="cols cols--2">
        <section class="card">
          <div class="card__head">
            <span class="stamp">Recent notes</span>
            <button class="btn btn--ghost small" data-go="notes">All notes</button>
          </div>
          <div id="todayNotes"></div>
        </section>

        <section class="card">
          <div class="card__head">
            <span class="stamp">Today's sessions</span>
            <button class="btn btn--ghost small" data-go="timer">Time sheet</button>
          </div>
          <div id="todaySessions"></div>
        </section>
      </div>
    </div>`;

  const el = {
    hello: view.querySelector('#hello'),
    helloDate: view.querySelector('#helloDate'),
    capture: view.querySelector('#capture'),
    stats: view.querySelector('#todayStats'),
    tasks: view.querySelector('#todayTasks'),
    habits: view.querySelector('#todayHabits'),
    notes: view.querySelector('#todayNotes'),
    sessions: view.querySelector('#todaySessions')
  };

  // ------------------------------------------------------------- capture
  async function capture() {
    const raw = el.capture.value.trim();
    if (!raw) return;
    el.capture.value = '';
    await DB.add('inbox', { text: raw, source: 'today', triaged: false });
  }

  el.capture.addEventListener('keydown', (e) => { if (e.key === 'Enter') capture(); });
  view.querySelector('#captureAdd').addEventListener('click', capture);

  view.querySelector('#quickFocus').addEventListener('click', () => {
    Shell.open('timer');
  });

  view.addEventListener('click', (e) => {
    const go = e.target.closest('[data-go]');
    if (go) Shell.open(go.dataset.go);
  });

  el.tasks.addEventListener('click', async (e) => {
    const check = e.target.closest('.check');
    if (!check) return;
    const task = DB.get('tasks').find((t) => t.id === check.dataset.id);
    if (task) {
      await DB.update('tasks', task.id, {
        done: !task.done, doneAt: task.done ? null : new Date().toISOString()
      });
    }
  });

  el.habits.addEventListener('click', async (e) => {
    const b = e.target.closest('.habitTick');
    if (!b) return;
    const habit = DB.get('habits').find((h) => h.id === b.dataset.id);
    if (!habit) return;
    const day = UI.dayKey();
    const ticks = new Set(habit.ticks || []);
    if (ticks.has(day)) ticks.delete(day); else ticks.add(day);
    await DB.update('habits', habit.id, { ticks: [...ticks].sort() });
  });

  // ------------------------------------------------------------ rendering
  function greeting() {
    const h = new Date().getHours();
    if (h < 5) return 'Still up?';
    if (h < 12) return 'Good morning.';
    if (h < 18) return 'Good afternoon.';
    if (h < 22) return 'Good evening.';
    return 'Winding down?';
  }

  function render() {
    const today = UI.dayKey();

    el.hello.textContent = greeting();
    el.helloDate.textContent = new Date().toLocaleDateString([], {
      weekday: 'long', day: 'numeric', month: 'long'
    });

    // --- stats
    const focusMs = DB.get('entries').reduce((s, e) =>
      (WORK_MODES.has(e.mode) && Fmt.dayKey(e.endedAt || e.startedAt) === today)
        ? s + (e.actualMs || 0) : s, 0);
    const openTasks = DB.get('tasks').filter((t) => !t.done);
    const dueToday = openTasks.filter((t) => t.due && t.due <= today).length;
    const habitList = DB.get('habits');
    const habitsDone = habitList.filter((h) => (h.ticks || []).includes(today)).length;

    const goalMs = (DB.settings.dailyGoalMinutes || 0) * 60000;
    el.stats.innerHTML = [
      { v: Fmt.duration(focusMs), l: goalMs ? `of ${Fmt.duration(goalMs)} focused` : 'focused today', a: true },
      { v: String(dueToday), l: 'Due today' },
      { v: `${habitsDone}/${habitList.length}`, l: 'Habits done' },
      { v: String(DB.get('inbox').filter((i) => !i.triaged).length), l: 'In the inbox' }
    ].map((c) => `
      <div class="stat ${c.a ? 'stat--accent' : ''}">
        <span class="stat__value">${esc(c.v)}</span>
        <span class="stat__label">${esc(c.l)}</span>
      </div>`).join('');

    // --- tasks worth seeing now
    const shortlist = openTasks
      .filter((t) => t.priority || (t.due && t.due <= today))
      .concat(openTasks.filter((t) => !t.priority && !t.due))
      .slice(0, 8);

    el.tasks.innerHTML = shortlist.length ? shortlist.map((t) => {
      const late = t.due && t.due < today;
      return `
        <div class="item">
          <button class="check" data-id="${t.id}" title="Done">&#10003;</button>
          <div class="item__body">
            <div class="item__title">${esc(t.title)}</div>
          </div>
          ${t.priority ? '<span class="pill pill--late">!</span>' : ''}
          ${t.due ? `<span class="pill ${late ? 'pill--late' : 'pill--due'}">${esc(UI.dueLabel(t.due))}</span>` : ''}
        </div>`;
    }).join('') : '<div class="empty">Nothing demanding attention.<br />Enjoy it.</div>';

    // --- habits
    el.habits.innerHTML = habitList.length ? habitList.map((h) => {
      const on = (h.ticks || []).includes(today);
      return `
        <div class="item">
          <button class="check habitTick ${on ? 'is-on' : ''}" data-id="${h.id}"
                  style="${on ? `background:${h.color};border-color:${h.color}` : ''}">&#10003;</button>
          <div class="item__body"><div class="item__title">${esc(h.name)}</div></div>
        </div>`;
    }).join('') : '<div class="empty">No habits yet.</div>';

    // --- recent notes
    const notes = [...DB.get('notes')].sort((a, b) =>
      (b.updatedAt || b.createdAt || '') < (a.updatedAt || a.createdAt || '') ? -1 : 1).slice(0, 4);
    el.notes.innerHTML = notes.length ? notes.map((n) => `
      <div class="item">
        <div class="item__body">
          <div class="item__title">${esc(n.title.trim() || 'Untitled note')}</div>
          <div class="item__meta">${esc((n.body || '').replace(/\s+/g, ' ').trim().slice(0, 60) || 'empty')}</div>
        </div>
      </div>`).join('') : '<div class="empty">No notes yet.</div>';

    // --- today's sessions
    const sessions = DB.get('entries')
      .filter((e) => Fmt.dayKey(e.endedAt || e.startedAt) === today && WORK_MODES.has(e.mode))
      .slice(0, 5);
    el.sessions.innerHTML = sessions.length ? sessions.map((e) => `
      <div class="item">
        <span class="item__meta" style="min-width:56px">${esc(Fmt.timeOfDay(e.startedAt))}</span>
        <div class="item__body"><div class="item__title">${esc(e.task)}</div></div>
        <span class="entry__dur">${esc(Fmt.duration(e.actualMs))}</span>
      </div>`).join('') : '<div class="empty">Nothing timed yet today.</div>';
  }

  render();
  el.capture.focus();

  // The dashboard only changes when a session starts or stops - not on every
  // tick. Re-rendering at 4fps made the cards flicker under the cursor.
  let lastStatus = null;
  return {
    refresh: render,
    onState(next) {
      if (next.status === lastStatus) return;
      lastStatus = next.status;
      render();
    }
  };
});

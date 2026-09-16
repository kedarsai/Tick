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
  let projectFilter = null;                  // also the project new tasks join
  let openId = null;                         // the task the detail panel shows
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
      <div class="taskMain">
        <div id="taskBody" class="taskBody"></div>
        <aside id="taskPanel" class="taskPanel card" hidden></aside>
      </div>
    </div>`;

  const el = {
    input: view.querySelector('#newTask'),
    stats: view.querySelector('#taskStats'),
    body: view.querySelector('#taskBody'),
    panel: view.querySelector('#taskPanel'),
    seg: view.querySelector('#viewSeg')
  };

  // ------------------------------------------------------------- adding
  async function addTask() {
    const raw = el.input.value.trim();
    if (!raw) return;
    const parsed = UI.parseTask(raw);
    if (!parsed.title) return;
    el.input.value = '';
    // Typing under a project filter means "another one of these".
    await DB.add('tasks', {
      ...parsed,
      projectId: projectFilter,
      identity: '',
      dueTime: null,
      someday: false,
      done: false,
      doneAt: null
    });
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
    if (projectFilter) list = list.filter((t) => t.projectId === projectFilter);

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

  /* What a task belongs to, under its title: its number, its project, its
     tags. Only what it actually has - an empty line would be noise. */
  function metaLine(t) {
    const bits = [];
    if (t.identity) bits.push(`<span class="taskId">${esc(t.identity)}</span>`);
    const project = Catalog.projectById(DB.get('projects'), t.projectId);
    if (project) bits.push(`<span class="taskProject">${esc(project.name)}</span>`);
    for (const tag of t.tags || []) {
      bits.push(`<span class="taskTag" style="--tag:${esc(Catalog.tagAccent(DB.get('tags'), tag))}">#${esc(tag)}</span>`);
    }
    return bits.length ? `<div class="item__meta taskMeta">${bits.join('')}</div>` : '';
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
        <div class="item ${t.done ? 'done' : ''} ${t.id === openId ? 'is-open' : ''}">
          <button class="check ${t.done ? 'is-on' : ''}" data-id="${t.id}" title="Toggle">&#10003;</button>
          <div class="item__body taskOpen" data-id="${t.id}" title="Open the details">
            <div class="taskTitle item__title" contenteditable="plaintext-only"
                 spellcheck="false" data-id="${t.id}">${esc(t.title)}</div>
            ${metaLine(t)}
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
            <select class="input small taskProjectFilter" id="projectFilter" title="Show one project">
              <option value="">All projects</option>
              ${Catalog.openProjects(DB.get('projects')).map((p) => `
                <option value="${esc(p.id)}" ${p.id === projectFilter ? 'selected' : ''}>${esc(Catalog.projectLabel(p))}</option>`).join('')}
            </select>
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

  // ======================================================= the detail panel
  /* Everything about one task in one place: what it is, whose it is, what to
     call it when you talk to other people about it, and when it is due. */
  function renderPanel() {
    const t = openId ? byId(openId) : null;
    if (!t) {
      openId = null;
      el.panel.hidden = true;
      el.panel.innerHTML = '';
      return;
    }
    // A background save must not yank a field out from under the cursor.
    if (!el.panel.hidden && el.panel.contains(document.activeElement)) return;

    const all = DB.get('projects');
    const chosen = Catalog.projectById(all, t.projectId);
    const options = Catalog.openProjects(all);
    // An archived project still shows while a task is on it.
    if (chosen && chosen.archived) options.push(chosen);

    el.panel.innerHTML = `
      <div class="card__head">
        <span class="stamp">Task</span>
        <button class="tb__btn" id="panelClose" title="Close (Esc)">&#10005;</button>
      </div>

      <label class="panelField">
        <span class="stamp">Title</span>
        <input class="input" id="pTitle" maxlength="200" spellcheck="false" value="${esc(t.title)}" />
      </label>

      <label class="panelField">
        <span class="stamp">Project</span>
        <select class="input" id="pProject">
          <option value="">No project</option>
          ${options.map((p) => `
            <option value="${esc(p.id)}" ${p.id === t.projectId ? 'selected' : ''}>
              ${esc(Catalog.projectLabel(p))}${p.archived ? ' - archived' : ''}
            </option>`).join('')}
        </select>
      </label>

      <label class="panelField">
        <span class="stamp">Identity number</span>
        <input class="input" id="pIdentity" maxlength="40" spellcheck="false"
               placeholder="optional - DM-142, INC-88, anything"
               value="${esc(t.identity || '')}" />
      </label>

      <div class="panelField">
        <span class="stamp">Tags</span>
        <div class="tags panelTags">
          ${(t.tags || []).map((tag) => `
            <button class="tag panelTag" data-drop="${esc(tag)}"
                    style="--tag:${esc(Catalog.tagAccent(DB.get('tags'), tag))}"
                    title="Take it off">#${esc(tag)} &#10005;</button>`).join('')}
        </div>
        <input class="input" id="pTagAdd" list="tagOptions" maxlength="40" spellcheck="false"
               placeholder="add a tag" />
        <datalist id="tagOptions">
          ${Catalog.tagsNotOn(DB.get('tags'), t.tags).map((x) => `<option value="${esc(x.name)}"></option>`).join('')}
        </datalist>
      </div>

      <div class="panelRow">
        <label class="panelField grow">
          <span class="stamp">Due</span>
          <input class="input" type="date" id="pDue" value="${t.due || ''}" />
        </label>
        <label class="panelField">
          <span class="stamp">Time</span>
          <input class="input" type="time" id="pTime" step="300" value="${t.dueTime || ''}" />
        </label>
      </div>

      <label class="toggle panelFlag">
        <input type="checkbox" id="pFlag" ${t.priority ? 'checked' : ''} /> <span>Flagged</span>
      </label>

      <div class="panelFoot">
        <button class="btn btn--ghost small" id="pTimer">Start a session</button>
        <button class="btn btn--danger small" id="pDelete">Delete</button>
      </div>`;
    el.panel.hidden = false;
  }

  function openPanel(id) {
    openId = id;
    render();
    const title = el.panel.querySelector('#pTitle');
    if (title) title.focus();
  }

  function closePanel() {
    openId = null;
    render();
  }

  async function addTagFromPanel(value) {
    const t = byId(openId);
    const name = Catalog.tagName(value);
    if (!t || !name) return;
    if ((t.tags || []).includes(name)) return;
    // The store adopts an unknown name into the catalogue on the way past.
    await DB.update('tasks', t.id, { tags: [...(t.tags || []), name] });
    render();
  }

  el.panel.addEventListener('click', async (e) => {
    const t = byId(openId);
    if (e.target.closest('#panelClose')) return closePanel();
    if (!t) return;

    const drop = e.target.closest('.panelTag');
    if (drop) {
      await DB.update('tasks', t.id, {
        tags: (t.tags || []).filter((x) => x !== drop.dataset.drop)
      });
      return render();
    }
    if (e.target.closest('#pDelete')) {
      await DB.remove('tasks', t.id);
      return closePanel();
    }
    if (e.target.closest('#pTimer')) {
      window.tick.timer.start({
        mode: 'focus',
        task: [t.title, ...(t.tags || []).map((x) => '#' + x)].join(' ')
      });
      Shell.open('timer');
    }
  });

  el.panel.addEventListener('change', async (e) => {
    const t = byId(openId);
    if (!t) return;
    const patch = {
      pTitle: () => ({ title: e.target.value.trim() || t.title }),
      pProject: () => ({ projectId: e.target.value || null }),
      pIdentity: () => ({ identity: e.target.value.trim() }),
      pDue: () => ({ due: e.target.value || null, someday: false }),
      pTime: () => ({ dueTime: e.target.value || null }),
      pFlag: () => ({ priority: e.target.checked })
    }[e.target.id];
    if (patch) await DB.update('tasks', t.id, patch());
  });

  el.panel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); return closePanel(); }
    if (e.key !== 'Enter') return;
    if (e.target.id === 'pTagAdd') {
      e.preventDefault();
      const value = e.target.value;
      e.target.value = '';
      addTagFromPanel(value);
    } else if (e.target.classList.contains('input')) {
      e.target.blur();
    }
  });

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

    // Clicking the row opens its details; clicking the title edits it in place.
    const body = e.target.closest('.taskOpen');
    if (body && !e.target.closest('.taskTitle')) {
      return body.dataset.id === openId ? closePanel() : openPanel(body.dataset.id);
    }

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
    if (e.target.id === 'projectFilter') {
      projectFilter = e.target.value || null;
      render();
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
    renderPanel();
  }

  render();
  el.input.focus();
  return { refresh: render };
});

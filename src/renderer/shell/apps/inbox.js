'use strict';
/* Inbox: everything you captured, waiting to be told what it is.
   Drag a card onto a lane, or use the buttons on the card. Dropping something
   into Task asks when you will do it, because a task without a date is just a
   worry. */

Shell.register('inbox', (view, UI) => {
  const { esc, DB } = UI;

  const LANES = [
    { id: 'task',    name: 'Task',    hint: 'do it, on a day',      accent: '#2f8577' },
    { id: 'later',   name: 'Later',   hint: 'someday, no date',     accent: '#c9a13c' },
    { id: 'note',    name: 'Note',    hint: 'worth keeping',        accent: '#7b5ea7' },
    { id: 'idea',    name: 'Idea',    hint: 'might become something', accent: '#f48f2d' },
    { id: 'feeling', name: 'Feeling', hint: "how today went",       accent: '#3f8f52' },
    { id: 'bin',     name: 'Bin',     hint: 'never mind',           accent: '#c9452f' }
  ];

  /* An untriaged capture has no type yet, but it usually looks like one. The
     guess only drives a colour and a word - it never decides anything. */
  const KINDS = {
    picture: { label: 'Picture', accent: '#7b5ea7' },
    link:    { label: 'Link',    accent: '#2f8577' },
    feeling: { label: 'Feeling', accent: '#3f8f52' },
    task:    { label: 'To do',   accent: '#e07a1c' },
    text:    { label: 'Note',    accent: '#c9a13c' }
  };

  function kindOf(item) {
    const t = (item.text || '').trim();
    if (item.shot && !t) return 'picture';
    if (/^https?:\/\//i.test(t) || /^www\./i.test(t)) return 'link';
    if (/^>/.test(t)) return 'feeling';
    if (/^(\[\]|-|\*)\s/.test(t)) return 'task';
    if (item.shot) return 'picture';
    return 'text';
  }

  let planning = null;      // { item, lane } while the date picker is open

  view.innerHTML = `
    <div class="page">
      <section class="card card--bare">
        <div class="row">
          <input id="inboxAdd" class="input input--big grow" type="text" maxlength="400"
                 placeholder="Capture anything..." />
          <button class="btn btn--primary" id="inboxAddBtn">Add</button>
        </div>
      </section>

      <div class="lanes" id="lanes">
        ${LANES.map((l) => `
          <div class="lane" data-lane="${l.id}" style="--lane:${l.accent}">
            <span class="lane__name">${esc(l.name)}</span>
            <span class="lane__hint">${esc(l.hint)}</span>
          </div>`).join('')}
      </div>

      <div class="card card--fill card--well">
        <div class="card__head">
          <span class="stamp">Waiting to be sorted</span>
          <span class="stamp" id="inboxCount"></span>
        </div>
        <div class="scroll" id="inboxList"></div>
      </div>
    </div>

    <div class="planner" id="planner" hidden>
      <div class="planner__panel">
        <div class="card__head">
          <span class="stamp">When will you do it?</span>
          <button class="tb__btn" id="planClose">&#10005;</button>
        </div>
        <div class="planner__what" id="planWhat"></div>

        <div class="stamp planner__label">Day</div>
        <div class="planner__chips" id="planDays"></div>

        <div class="stamp planner__label">Time</div>
        <div class="planner__chips" id="planTimes"></div>

        <div class="planner__foot">
          <input type="date" id="planDate" class="input" />
          <input type="time" id="planTime" class="input" step="300" />
          <button class="btn btn--primary" id="planSave">Plan it</button>
        </div>
      </div>
    </div>`;

  const el = {
    add: view.querySelector('#inboxAdd'),
    list: view.querySelector('#inboxList'),
    count: view.querySelector('#inboxCount'),
    lanes: view.querySelector('#lanes'),
    planner: view.querySelector('#planner'),
    planWhat: view.querySelector('#planWhat'),
    planDays: view.querySelector('#planDays'),
    planTimes: view.querySelector('#planTimes'),
    planDate: view.querySelector('#planDate'),
    planTime: view.querySelector('#planTime')
  };

  const items = () => DB.get('inbox').filter((i) => !i.triaged);

  // ----------------------------------------------------------- capturing
  async function addHere() {
    const text = el.add.value.trim();
    if (!text) return;
    el.add.value = '';
    await DB.add('inbox', { text, source: 'desk', triaged: false });
  }
  el.add.addEventListener('keydown', (e) => { if (e.key === 'Enter') addHere(); });
  view.querySelector('#inboxAddBtn').addEventListener('click', addHere);

  // ------------------------------------------------------------- triage
  /** Strip the shorthand the capture box understands. */
  function clean(text) {
    return String(text).replace(/^(\[\]|-|\*|>)\s*/, '').trim();
  }

  async function fileIt(item, lane, plan) {
    const text = clean(item.text);
    const tags = UI.parseTags(text);

    if (lane === 'task' || lane === 'later') {
      const parsed = UI.parseTask(text);
      await DB.add('tasks', {
        title: parsed.title || text,
        tags,
        due: lane === 'later' ? null : (plan && plan.due) || parsed.due || null,
        dueTime: lane === 'later' ? null : (plan && plan.time) || null,
        someday: lane === 'later',
        priority: parsed.priority,
        shot: item.shot || null,
        done: false,
        doneAt: null
      });
    } else if (lane === 'note' || lane === 'idea') {
      const [first, ...rest] = text.split('\n');
      await DB.add('notes', {
        title: first.slice(0, 100) || (item.shot ? 'Screenshot' : ''),
        body: rest.join('\n'),
        tags,
        kind: lane,
        shot: item.shot || null,
        pinned: false
      });
    } else if (lane === 'feeling') {
      const day = UI.dayKey();
      const existing = DB.get('journal').find((e) => e.day === day);
      if (existing) {
        await DB.update('journal', existing.id, {
          body: `${existing.body || ''}${existing.body ? '\n' : ''}${text}`
        });
      } else {
        await DB.add('journal', { day, body: text, mood: null });
      }
    }
    // 'bin' files it nowhere; either way the capture leaves the inbox.
    await DB.remove('inbox', item.id);
  }

  function beginTriage(item, lane) {
    if (lane === 'task') return openPlanner(item);
    fileIt(item, lane);
  }

  /* The picture, its text and the six lanes in one place - look at it and file
     it without ever closing anything. */
  function showCapture(item) {
    Viewer.open({
      shot: item.shot,
      kind: 'From the inbox',
      text: item.text,
      placeholder: 'What is this picture for?',
      onText: (value) => DB.update('inbox', item.id, { text: value }),
      onShot: (shot) => DB.update('inbox', item.id, { shot }),
      meta: [
        { label: 'Captured', value: `${Fmt.dayLabel(Fmt.dayKey(item.createdAt))} ${Fmt.timeOfDay(item.createdAt)}` },
        { label: 'Size', value: `${item.shot.width} x ${item.shot.height}` },
        { label: 'Source', value: item.source === 'region' ? 'region grab' : item.source || 'capture' }
      ],
      actionsLabel: 'File it',
      actions: LANES.map((l) => ({
        id: l.id,
        label: l.name,
        hint: l.hint,
        accent: l.accent,
        run: () => {
          // read the latest text back off the record before filing
          const fresh = DB.get('inbox').find((i) => i.id === item.id) || item;
          beginTriage(fresh, l.id);
        }
      }))
    });
  }

  // ------------------------------------------------------------ planner
  const DAY_CHIPS = [
    { label: 'Today', offset: 0 },
    { label: 'Tomorrow', offset: 1 },
    { label: 'In 2 days', offset: 2 },
    { label: 'Next week', offset: 7 },
    { label: 'No date', offset: null }
  ];
  const TIME_CHIPS = ['09:00', '11:00', '14:00', '16:00', '19:00'];

  function openPlanner(item) {
    planning = { item };
    el.planWhat.textContent = clean(item.text);
    el.planDate.value = UI.dayKey();
    el.planTime.value = '';
    renderChips();
    el.planner.hidden = false;
  }

  function closePlanner() {
    planning = null;
    el.planner.hidden = true;
  }

  function renderChips() {
    el.planDays.innerHTML = DAY_CHIPS.map((c) => `
      <button class="planChip" data-offset="${c.offset === null ? '' : c.offset}">
        ${esc(c.label)}
      </button>`).join('');
    el.planTimes.innerHTML = TIME_CHIPS.map((t) => `
      <button class="planChip" data-time="${t}">${esc(t)}</button>`).join('')
      + '<button class="planChip" data-time="">Any time</button>';
  }

  el.planDays.addEventListener('click', (e) => {
    const b = e.target.closest('.planChip');
    if (!b || !planning) return;
    // A day chip is the whole decision: pick it and the task is planned.
    const due = b.dataset.offset === '' ? null : UI.dayKey(Number(b.dataset.offset));
    fileIt(planning.item, 'task', { due, time: el.planTime.value || null });
    closePlanner();
  });

  el.planTimes.addEventListener('click', (e) => {
    const b = e.target.closest('.planChip');
    if (!b) return;
    el.planTime.value = b.dataset.time;
    for (const c of el.planTimes.querySelectorAll('.planChip')) {
      c.classList.toggle('is-on', c === b);
    }
  });

  view.querySelector('#planClose').addEventListener('click', closePlanner);
  view.querySelector('#planSave').addEventListener('click', () => {
    if (!planning) return;
    fileIt(planning.item, 'task', {
      due: el.planDate.value || null,
      time: el.planTime.value || null
    });
    closePlanner();
  });
  el.planner.addEventListener('click', (e) => {
    if (e.target === el.planner) closePlanner();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !el.planner.hidden) closePlanner();
  });

  // --------------------------------------------------------------- drag
  let dragId = null;

  el.list.addEventListener('dragstart', (e) => {
    const card = e.target.closest('.capture');
    if (!card) return;
    dragId = card.dataset.id;
    card.classList.add('is-dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragId);
    view.querySelector('#lanes').classList.add('is-armed');
  });

  el.list.addEventListener('dragend', (e) => {
    const card = e.target.closest('.capture');
    if (card) card.classList.remove('is-dragging');
    view.querySelector('#lanes').classList.remove('is-armed');
    for (const l of el.lanes.querySelectorAll('.lane')) l.classList.remove('is-over');
  });

  el.lanes.addEventListener('dragover', (e) => {
    const lane = e.target.closest('.lane');
    if (!lane) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    lane.classList.add('is-over');
  });

  el.lanes.addEventListener('dragleave', (e) => {
    const lane = e.target.closest('.lane');
    if (lane) lane.classList.remove('is-over');
  });

  el.lanes.addEventListener('drop', (e) => {
    const lane = e.target.closest('.lane');
    if (!lane) return;
    e.preventDefault();
    lane.classList.remove('is-over');
    const item = DB.get('inbox').find((i) => i.id === (dragId || e.dataTransfer.getData('text/plain')));
    dragId = null;
    if (item) beginTriage(item, lane.dataset.lane);
  });

  // Buttons on the card do the same thing, for when dragging is the slow way.
  el.list.addEventListener('click', (e) => {
    const pic = e.target.closest('.captureShot');
    if (pic) {
      const item = DB.get('inbox').find((i) => i.id === pic.dataset.id);
      if (item) showCapture(item);
      return;
    }
    const b = e.target.closest('.laneBtn');
    if (!b) return;
    const item = DB.get('inbox').find((i) => i.id === b.dataset.id);
    if (item) beginTriage(item, b.dataset.lane);
  });

  el.list.addEventListener('keydown', (e) => {
    if (e.target.classList.contains('captureText') && e.key === 'Enter') {
      e.preventDefault();
      e.target.blur();
    }
  });
  el.list.addEventListener('blur', (e) => {
    const f = e.target;
    if (!f.classList || !f.classList.contains('captureText')) return;
    const item = DB.get('inbox').find((i) => i.id === f.dataset.id);
    const next = f.textContent.trim();
    if (item && next && next !== item.text) DB.update('inbox', item.id, { text: next });
  }, true);

  // ----------------------------------------------------------- rendering
  function render() {
    const list = items();
    el.count.textContent = list.length ? `${list.length} waiting` : 'all clear';

    if (!list.length) {
      el.list.innerHTML = `
        <div class="empty">
          Inbox zero.<br />
          Press <b>${esc(UI.captureKey())}</b> anywhere to throw something in.
        </div>`;
      return;
    }

    el.list.innerHTML = list.map((i) => {
      const kind = KINDS[kindOf(i)];
      return `
      <div class="capture" draggable="true" data-id="${i.id}" style="--kind:${kind.accent}">
        <span class="capture__grip">&#8942;&#8942;</span>
        ${i.shot ? `<img class="captureShot" src="${esc(i.shot.thumbUrl)}"
                        data-id="${i.id}" alt="screenshot"
                        title="Open the picture" />` : ''}
        <div class="capture__body">
          <div class="captureText" contenteditable="plaintext-only" spellcheck="false"
               data-id="${i.id}">${esc(i.text) || '<span class="muted">a picture, no words</span>'}</div>
          <div class="capture__foot">
            <span class="capture__kind">${esc(kind.label)}</span>
            <span class="capture__when">${esc(Fmt.timeOfDay(i.createdAt))}</span>
          </div>
        </div>
        <div class="capture__lanes">
          ${LANES.map((l) => `
            <button class="laneBtn" data-lane="${l.id}" data-id="${i.id}"
                    style="--lane:${l.accent}" title="${esc(l.name)} - ${esc(l.hint)}">${esc(l.name)}</button>`).join('')}
        </div>
      </div>`;
    }).join('');
  }

  render();
  el.add.focus();
  return { refresh: render };
});

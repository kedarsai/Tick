'use strict';
/* Journal: one entry per day. Pick a mood, write a line, move on. */

Shell.register('journal', (view, UI) => {
  const { esc, DB } = UI;

  const MOODS = [
    { id: 'great', face: '◕‿◕', label: 'great' },
    { id: 'good', face: '◠‿◠', label: 'good' },
    { id: 'flat', face: '·__·', label: 'flat' },
    { id: 'tired', face: '-_-', label: 'tired' },
    { id: 'rough', face: '>_<', label: 'rough' }
  ];

  let activeDay = UI.dayKey();

  view.innerHTML = `
    <div class="page">
      <div class="cols cols--sidebar">
        <section class="card card--flush">
          <div class="card__head">
            <span class="stamp">Entries</span>
            <button class="btn btn--ghost small" id="todayBtn">Today</button>
          </div>
          <div class="scroll" id="dayList"></div>
        </section>

        <section class="card">
          <div class="card__head">
            <div>
              <div class="journalDay" id="journalDay"></div>
              <div class="hint" id="journalMeta"></div>
            </div>
            <div class="moodRow" id="moodRow">
              ${MOODS.map((m) => `
                <button class="mood" data-mood="${m.id}" title="${m.label}">${m.face}</button>`).join('')}
            </div>
          </div>
          <textarea id="journalBody" class="input grow" spellcheck="true"
                    placeholder="How did it go? What happened? What is worth remembering?"></textarea>
          <div class="row" style="margin-top:10px; justify-content:space-between">
            <span class="hint" id="journalStats"></span>
            <button class="btn btn--ghost small" id="journalDelete">Delete entry</button>
          </div>
        </section>
      </div>
    </div>`;

  const el = {
    list: view.querySelector('#dayList'),
    day: view.querySelector('#journalDay'),
    meta: view.querySelector('#journalMeta'),
    bodyField: view.querySelector('#journalBody'),
    moods: view.querySelector('#moodRow'),
    stats: view.querySelector('#journalStats')
  };

  const entries = () => DB.get('journal');
  const forDay = (day) => entries().find((e) => e.day === day) || null;

  // -------------------------------------------------------------- saving
  // Two saves landing before the first round trip would otherwise create two
  // entries for the same day.
  let creating = null;

  async function entryFor(day) {
    const existing = forDay(day);
    if (existing) return existing;
    if (creating && creating.day === day) return creating.promise;
    const promise = DB.add('journal', { day, body: '', mood: null });
    creating = { day, promise };
    const made = await promise;
    creating = null;
    return made;
  }

  const save = UI.debounce(async () => {
    const text = el.bodyField.value;
    const existing = forDay(activeDay);
    if (existing) {
      if (text === existing.body) return;
      await DB.update('journal', existing.id, { body: text });
      return;
    }
    if (!text.trim()) return;
    const made = await entryFor(activeDay);
    if (made) await DB.update('journal', made.id, { body: el.bodyField.value });
  }, 500);

  el.bodyField.addEventListener('input', save);

  el.moods.addEventListener('click', async (e) => {
    const b = e.target.closest('.mood');
    if (!b) return;
    const existing = forDay(activeDay);
    const mood = existing && existing.mood === b.dataset.mood ? null : b.dataset.mood;
    const entry = existing || await entryFor(activeDay);
    if (entry) await DB.update('journal', entry.id, { mood, body: el.bodyField.value });
  });

  view.querySelector('#todayBtn').addEventListener('click', () => {
    activeDay = UI.dayKey();
    render();
    el.bodyField.focus();
  });

  view.querySelector('#journalDelete').addEventListener('click', async () => {
    const existing = forDay(activeDay);
    if (existing) await DB.remove('journal', existing.id);
  });

  el.list.addEventListener('click', (e) => {
    const row = e.target.closest('.item');
    if (!row) return;
    save();
    activeDay = row.dataset.day;
    render();
  });

  // ------------------------------------------------------------ rendering
  function renderList() {
    // the last 30 days, so empty days are still one click away
    const days = [];
    for (let i = 0; i < 30; i++) days.push(UI.dayKey(-i));
    for (const e of entries()) if (!days.includes(e.day)) days.push(e.day);
    days.sort().reverse();

    el.list.innerHTML = days.map((day) => {
      const entry = forDay(day);
      const mood = entry && entry.mood ? MOODS.find((m) => m.id === entry.mood) : null;
      const snippet = entry ? (entry.body || '').replace(/\s+/g, ' ').trim().slice(0, 44) : '';
      return `
        <div class="item ${day === activeDay ? 'is-on' : ''} ${entry ? '' : 'is-empty'}" data-day="${day}">
          <div class="item__body">
            <div class="item__title">${esc(Fmt.dayLabel(day))}</div>
            <div class="item__meta">${snippet ? esc(snippet) : 'nothing written'}</div>
          </div>
          ${mood ? `<span class="moodTag">${mood.face}</span>` : ''}
        </div>`;
    }).join('');
  }

  function renderEditor() {
    const entry = forDay(activeDay);
    el.day.textContent = Fmt.dayLabel(activeDay);
    const d = new Date(`${activeDay}T12:00:00`);
    el.meta.textContent = d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    if (document.activeElement !== el.bodyField) {
      el.bodyField.value = entry ? (entry.body || '') : '';
    }
    for (const b of el.moods.querySelectorAll('.mood')) {
      b.classList.toggle('is-on', !!entry && entry.mood === b.dataset.mood);
    }

    const words = el.bodyField.value.trim() ? el.bodyField.value.trim().split(/\s+/).length : 0;
    const written = entries().length;
    el.stats.textContent = `${words} word${words === 1 ? '' : 's'} · ${written} day${written === 1 ? '' : 's'} journalled`;
  }

  function render() { renderList(); renderEditor(); }

  render();
  if (activeDay === UI.dayKey()) el.bodyField.focus();
  return { refresh: render };
});

'use strict';
/* Notes: a list on the left, the note on the right. Saves as you type. */

Shell.register('notes', (view, UI) => {
  const { esc, DB } = UI;

  let activeId = null;
  let query = '';
  let kind = 'all';

  view.innerHTML = `
    <div class="page">
      <div class="cols cols--sidebar">
        <section class="card card--flush">
          <div class="card__head">
            <input id="noteSearch" class="search grow" type="search" placeholder="Search notes" />
            <button class="btn btn--primary small" id="newNote">+ New</button>
          </div>
          <div class="seg" id="noteKind" style="margin-bottom:9px">
            <button data-k="all">All</button>
            <button data-k="note">Notes</button>
            <button data-k="idea">Ideas</button>
            <button data-k="link">Links</button>
          </div>
          <div class="scroll" id="noteList"></div>
        </section>

        <section class="card" id="noteEditor">
          <input id="noteTitle" class="input input--big" type="text" maxlength="120"
                 placeholder="Title" />
          <img class="noteShot" id="noteShot" alt="" hidden />
          <textarea id="noteBody" class="input grow" spellcheck="true"
                    placeholder="Write it down before it escapes..."></textarea>
          <div class="row" style="margin-top:10px; justify-content:space-between">
            <span class="hint" id="noteMeta"></span>
            <div class="card__tools">
              <button class="btn btn--ghost small" id="pinNote">Pin</button>
              <button class="btn btn--ghost small" id="copyNote">Copy</button>
              <button class="btn btn--danger small" id="deleteNote">Delete</button>
            </div>
          </div>
        </section>
      </div>
    </div>`;

  const el = {
    list: view.querySelector('#noteList'),
    search: view.querySelector('#noteSearch'),
    title: view.querySelector('#noteTitle'),
    bodyField: view.querySelector('#noteBody'),
    meta: view.querySelector('#noteMeta'),
    editor: view.querySelector('#noteEditor'),
    shot: view.querySelector('#noteShot'),
    pin: view.querySelector('#pinNote')
  };

  const notes = () => DB.get('notes');
  const active = () => notes().find((n) => n.id === activeId) || null;

  // -------------------------------------------------------------- saving
  const save = UI.debounce(() => {
    const note = active();
    if (!note) return;
    const title = el.title.value.trim();
    const bodyText = el.bodyField.value;
    if (title === note.title && bodyText === note.body) return;
    DB.update('notes', note.id, {
      title, body: bodyText, tags: UI.parseTags(`${title} ${bodyText}`)
    });
  }, 450);

  el.title.addEventListener('input', save);
  el.bodyField.addEventListener('input', save);

  view.querySelector('#newNote').addEventListener('click', async () => {
    const created = await DB.add('notes', { title: '', body: '', tags: [], pinned: false });
    activeId = created.id;
    render();
    el.title.focus();
  });

  view.querySelector('#deleteNote').addEventListener('click', async () => {
    const note = active();
    if (!note) return;
    await DB.remove('notes', note.id);
    activeId = null;
  });

  view.querySelector('#copyNote').addEventListener('click', async () => {
    const note = active();
    if (!note) return;
    await window.tick.copy(`${note.title}\n\n${note.body}`.trim());
    flash(view.querySelector('#copyNote'), 'Copied');
  });

  el.shot.addEventListener('click', () => {
    const note = active();
    if (!note || !note.shot) return;
    Viewer.open({
      shot: note.shot,
      kind: note.kind === 'idea' ? 'Idea' : 'Note',
      text: note.body || '',
      placeholder: 'Write about this picture...',
      onText: (value) => DB.update('notes', note.id, { body: value }),
      onShot: (shot) => DB.update('notes', note.id, { shot }),
      meta: [
        { label: 'Note', value: note.title.trim() || 'Untitled' },
        { label: 'Size', value: `${note.shot.width} x ${note.shot.height}` },
        { label: 'Saved', value: Fmt.dayLabel(Fmt.dayKey(note.updatedAt || note.createdAt)) }
      ]
    });
  });

  el.pin.addEventListener('click', () => {
    const note = active();
    if (note) DB.update('notes', note.id, { pinned: !note.pinned });
  });

  function flash(btn, text) {
    const old = btn.textContent;
    btn.textContent = text;
    setTimeout(() => { btn.textContent = old; }, 1100);
  }

  el.search.addEventListener('input', () => {
    query = el.search.value.trim().toLowerCase();
    renderList();
  });

  view.querySelector('#noteKind').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    kind = b.dataset.k;
    activeId = null;
    render();
  });

  /** A note you opened and never wrote anything in is clutter, not a note. */
  async function discardIfEmpty(id) {
    const note = notes().find((n) => n.id === id);
    if (!note) return;
    if ((note.title || '').trim() || (note.body || '').trim()) return;
    await DB.remove('notes', note.id);
  }

  el.list.addEventListener('click', async (e) => {
    const row = e.target.closest('.item');
    if (!row || row.dataset.id === activeId) return;
    save();
    const leaving = activeId;
    activeId = row.dataset.id;
    render();
    if (leaving) await discardIfEmpty(leaving);
  });

  // ------------------------------------------------------------ rendering
  const preview = (n) => (n.body || '').replace(/\s+/g, ' ').trim().slice(0, 70);
  const titleOf = (n) => n.title.trim() || preview(n) || 'Untitled note';

  function visible() {
    let list = notes();
    if (kind !== 'all') list = list.filter((n) => (n.kind || 'note') === kind);
    if (query) {
      list = list.filter((n) => `${n.title} ${n.body} ${(n.tags || []).join(' ')}`
        .toLowerCase().includes(query));
    }
    return [...list].sort((a, b) => {
      if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
      return (b.updatedAt || b.createdAt || '') < (a.updatedAt || a.createdAt || '') ? -1 : 1;
    });
  }

  function renderList() {
    const list = visible();
    if (!list.length) {
      el.list.innerHTML = notes().length
        ? `<div class="empty">Nothing matches <b>${esc(query)}</b>.</div>`
        : '<div class="empty">No notes yet.<br />Hit <b>+ New</b>.</div>';
      return;
    }
    el.list.innerHTML = list.map((n) => `
      <div class="item ${n.id === activeId ? 'is-on' : ''}" data-id="${n.id}">
        <div class="item__body">
          <div class="item__title">${n.pinned ? '&#128204; ' : ''}${n.kind === 'idea' ? '&#128161; ' : ''}${n.kind === 'link' ? '&#128279; ' : ''}${esc(titleOf(n))}</div>
          <div class="item__meta">${esc(preview(n) || 'empty')}</div>
        </div>
      </div>`).join('');
  }

  function renderEditor() {
    const note = active();
    el.editor.style.opacity = note ? '1' : '.45';
    el.title.disabled = !note;
    el.bodyField.disabled = !note;

    if (!note) {
      el.title.value = '';
      el.bodyField.value = '';
      el.meta.textContent = 'Pick a note, or make a new one.';
      return;
    }
    if (note.shot) {
      el.shot.hidden = false;
      el.shot.src = note.shot.thumbUrl;
      el.shot.dataset.path = note.shot.path;
    } else {
      el.shot.hidden = true;
      el.shot.removeAttribute('src');
    }
    if (document.activeElement !== el.title) el.title.value = note.title || '';
    if (document.activeElement !== el.bodyField) el.bodyField.value = note.body || '';

    const words = (note.body || '').trim() ? (note.body.trim().split(/\s+/).length) : 0;
    const when = note.updatedAt || note.createdAt;
    el.meta.textContent = `${words} word${words === 1 ? '' : 's'}`
      + (when ? ` · edited ${Fmt.dayLabel(Fmt.dayKey(when))} ${Fmt.timeOfDay(when)}` : '');
    el.pin.textContent = note.pinned ? 'Unpin' : 'Pin';
  }

  function render() {
    for (const b of view.querySelectorAll('#noteKind button')) {
      b.setAttribute('aria-pressed', String(b.dataset.k === kind));
    }
    if (!activeId) {
      const first = visible()[0];
      if (first) activeId = first.id;
    }
    renderList();
    renderEditor();
  }

  render();
  return { refresh: render };
});

'use strict';
/* Settings > Projects & tags.
 *
 * The one place where the catalogue is edited. Projects are what a task
 * belongs to; tags are the words you file by. Both are only worth defining
 * once, which is why they live here rather than in the task box.
 *
 * Renaming or deleting reaches across every task and note, so those two go
 * through the main process (window.tick.catalog) rather than a loop here.
 */
(function (global) {
  const esc = (v) => Fmt.escapeHtml(v);
  const $ = (id) => document.getElementById(id);

  let wired = false;

  function projects() { return DB.get('projects'); }
  function tags() { return DB.get('tags'); }

  // ------------------------------------------------------------- rendering
  function projectRow(project, count) {
    const used = count || 0;
    return `
      <div class="catRow" data-id="${esc(project.id)}" data-kind="project">
        <input class="catRow__name input" value="${esc(project.name || '')}"
               data-field="name" maxlength="60" spellcheck="false" />
        <input class="catRow__id input" value="${esc(project.identity || '')}"
               data-field="identity" maxlength="30" spellcheck="false"
               placeholder="ID" title="Identity number - a ticket, a case, a reference" />
        <span class="catRow__count" title="${used} task${used === 1 ? '' : 's'}">${used}</span>
        <button class="iconBtn catRow__archive ${project.archived ? 'is-on' : ''}"
                data-act="archive" title="${project.archived
                  ? 'Archived - click to bring it back'
                  : 'Archive: keep it on old tasks, drop it from the list'}">&#9673;</button>
        <button class="iconBtn delBtn" data-act="delete" title="Delete">&#10005;</button>
      </div>`;
  }

  function tagRow(tag, count) {
    const used = count || 0;
    return `
      <div class="catRow" data-id="${esc(tag.id)}" data-kind="tag" data-name="${esc(tag.name)}">
        <input class="catRow__swatch" type="color" value="${esc(tag.accent || Catalog.DEFAULT_ACCENT)}"
               data-field="accent" title="Colour" />
        <input class="catRow__name input" value="${esc(tag.name || '')}"
               data-field="name" maxlength="40" spellcheck="false" />
        <span class="catRow__count" title="on ${used} task${used === 1 ? '' : 's'} or note${used === 1 ? '' : 's'}">${used}</span>
        <button class="iconBtn delBtn" data-act="delete" title="Delete">&#10005;</button>
      </div>`;
  }

  function render() {
    const host = $('catalogPanel');
    if (!host) return;
    // Never yank a field out from under the cursor when a background save
    // pushes a fresh snapshot.
    if (host.contains(document.activeElement)) return;

    const taskCounts = Catalog.projectCounts(DB.get('tasks'));
    const tagUse = Catalog.tagCounts(DB.get('tasks'), DB.get('notes'));

    const projectList = Catalog.byName(projects());
    $('projectRows').innerHTML = projectList.length
      ? projectList.map((p) => projectRow(p, taskCounts[p.id])).join('')
      : '<div class="catEmpty">No projects yet. Add one below.</div>';

    const tagList = Catalog.byName(tags());
    $('tagRows').innerHTML = tagList.length
      ? tagList.map((t) => tagRow(t, tagUse[t.name])).join('')
      : '<div class="catEmpty">No tags yet. Add one, or type #something on a task.</div>';
  }

  // -------------------------------------------------------------- editing
  async function addProject() {
    const name = $('newProjectName').value.trim();
    if (!name) return;
    const identity = $('newProjectIdentity').value.trim();
    $('newProjectName').value = '';
    $('newProjectIdentity').value = '';
    await DB.add('projects', { name, identity, archived: false });
    render();
  }

  async function addTag() {
    const name = Catalog.tagName($('newTagName').value);
    if (!name) return;
    $('newTagName').value = '';
    if (!tags().some((t) => t.name === name)) await DB.add('tags', { name });
    render();
  }

  /** A row edit that reaches other records, or a plain field write. */
  async function commitField(row, field, value) {
    const id = row.dataset.id;
    if (row.dataset.kind === 'project') {
      const project = projects().find((p) => p.id === id);
      if (!project) return;
      const next = value.trim();
      if (field === 'name' && !next) return render();       // a project needs a name
      if (next === (project[field] || '')) return;
      await DB.update('projects', id, { [field]: next });
      return;
    }

    const tag = tags().find((t) => t.id === id);
    if (!tag) return;
    if (field === 'accent') {
      if (value === tag.accent) return;
      await DB.update('tags', id, { accent: value });
      return;
    }
    const next = Catalog.tagName(value);
    if (!next || next === tag.name) return render();
    // Renaming onto an existing tag merges the two, which is what you meant.
    await window.tick.catalog.renameTag(tag.name, next);
    render();
  }

  async function removeRow(row) {
    const id = row.dataset.id;
    if (row.dataset.kind === 'project') {
      const project = projects().find((p) => p.id === id);
      if (!project) return;
      const count = Catalog.projectCounts(DB.get('tasks'))[id] || 0;
      const warning = count
        ? `Delete "${project.name}"? Its ${count} task${count === 1 ? '' : 's'} stay, with no project.`
        : `Delete "${project.name}"?`;
      if (!confirm(warning)) return;
      await window.tick.catalog.deleteProject(id);
    } else {
      const tag = tags().find((t) => t.id === id);
      if (!tag) return;
      const count = Catalog.tagCounts(DB.get('tasks'), DB.get('notes'))[tag.name] || 0;
      const warning = count
        ? `Delete #${tag.name}? It comes off ${count} record${count === 1 ? '' : 's'}.`
        : `Delete #${tag.name}?`;
      if (!confirm(warning)) return;
      await window.tick.catalog.deleteTag(tag.name);
    }
    render();
  }

  async function toggleArchive(row) {
    const project = projects().find((p) => p.id === row.dataset.id);
    if (!project) return;
    await DB.update('projects', project.id, { archived: !project.archived });
    render();
  }

  function wire() {
    if (wired) return;
    const host = $('catalogPanel');
    if (!host) return;
    wired = true;

    $('addProject').addEventListener('click', addProject);
    $('addTag').addEventListener('click', addTag);
    host.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      if (e.target.id === 'newProjectName' || e.target.id === 'newProjectIdentity') return addProject();
      if (e.target.id === 'newTagName') return addTag();
      if (e.target.classList.contains('catRow__name')) e.target.blur();
    });

    host.addEventListener('change', (e) => {
      const row = e.target.closest('.catRow');
      if (row && e.target.dataset.field) commitField(row, e.target.dataset.field, e.target.value);
    });
    // A colour picker fires change only when it closes; this keeps the swatch
    // honest while you drag around it.
    host.addEventListener('blur', (e) => {
      const row = e.target.closest && e.target.closest('.catRow');
      if (row && e.target.dataset.field === 'name') commitField(row, 'name', e.target.value);
    }, true);

    host.addEventListener('click', (e) => {
      const button = e.target.closest('button[data-act]');
      if (!button) return;
      const row = button.closest('.catRow');
      if (!row) return;
      if (button.dataset.act === 'delete') removeRow(row);
      if (button.dataset.act === 'archive') toggleArchive(row);
    });
  }

  global.CatalogPanel = {
    refresh() { wire(); render(); }
  };
})(window);

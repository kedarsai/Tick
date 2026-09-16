/* Projects and tags: the small shared readings of the catalogue.
 *
 * Settings edits this catalogue and Tasks wears it, so the counting, sorting
 * and labelling live here rather than twice. Everything is pure - hand it
 * records, get an answer.
 */
(function (global) {
  'use strict';

  const DEFAULT_ACCENT = '#8a8175';

  /** '#Work ' and 'work' are one tag. Matches the store's own reading. */
  function tagName(raw) {
    return String(raw == null ? '' : raw).trim().replace(/^#+/, '').toLowerCase();
  }

  function byName(list) {
    return [...(list || [])].sort((a, b) =>
      String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }));
  }

  /** Archived projects stay on old tasks but are no longer offered. */
  function openProjects(projects) {
    return byName((projects || []).filter((p) => !p.archived));
  }

  function projectById(projects, id) {
    return (projects || []).find((p) => p.id === id) || null;
  }

  /** 'Data Migration (DM-100)' - the identity number only when there is one. */
  function projectLabel(project) {
    if (!project) return '';
    const name = String(project.name || '').trim();
    const identity = String(project.identity || '').trim();
    return identity ? `${name} (${identity})` : name;
  }

  /** How many records carry each tag: { work: 3, urgent: 1 }. */
  function tagCounts(...lists) {
    const counts = Object.create(null);
    for (const list of lists) {
      for (const record of list || []) {
        for (const raw of record.tags || []) {
          const name = tagName(raw);
          if (name) counts[name] = (counts[name] || 0) + 1;
        }
      }
    }
    return counts;
  }

  /** How many tasks belong to each project, by id. */
  function projectCounts(tasks) {
    const counts = Object.create(null);
    for (const task of tasks || []) {
      if (task.projectId) counts[task.projectId] = (counts[task.projectId] || 0) + 1;
    }
    return counts;
  }

  /** The colour a tag was given, or a quiet default for one not in the list. */
  function tagAccent(tags, name) {
    const want = tagName(name);
    const found = (tags || []).find((t) => tagName(t.name) === want);
    return (found && found.accent) || DEFAULT_ACCENT;
  }

  /** Tags in the catalogue that a record does not already carry. */
  function tagsNotOn(tags, on) {
    const already = new Set((on || []).map(tagName));
    return byName(tags).filter((t) => !already.has(tagName(t.name)));
  }

  global.Catalog = {
    tagName, byName, openProjects, projectById, projectLabel,
    tagCounts, projectCounts, tagAccent, tagsNotOn, DEFAULT_ACCENT
  };
})(typeof window !== 'undefined' ? window : globalThis);

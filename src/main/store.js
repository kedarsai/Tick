'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Dead-simple JSON store. Everything lives in one file so it is trivial to
 * back up, inspect by hand, or nuke. Writes are atomic-ish (tmp + rename)
 * and debounced so a chatty timer does not thrash the disk.
 *
 * Every app in the suite keeps its records in a named collection; they all
 * share the same generic add/update/remove plumbing.
 */

// The collections the suite stores. `entries` predates the rest, which is why
// it is not called `sessions`.
const COLLECTIONS = ['inbox', 'entries', 'tasks', 'notes', 'habits', 'journal'];

const DEFAULTS = {
  version: 3,
  inbox: [],        // raw captures, waiting to be triaged
  entries: [],      // timer sessions
  tasks: [],        // to-do items
  notes: [],        // notes and ideas
  habits: [],       // habit definitions, each with its own tick list
  journal: [],      // one entry per day
  settings: {
    focusMinutes: 25,
    shortBreakMinutes: 5,
    longBreakMinutes: 15,
    longBreakEvery: 4,
    autoStartBreaks: true,
    autoStartFocus: false,
    soundEnabled: true,
    volume: 0.5,
    widgetPosition: null,
    widgetVisible: true,
    characterId: 'tick',
    petScale: 1,
    faceStyle: 'analog',
    docked: false,
    dockEdge: 'right',
    dockPosition: null,
    undockedPosition: null,
    // the suite dock that lives at the top of the screen
    barPosition: null,
    barCollapsed: false,
    autoStart: null,          // null = never asked; set on first run
    captureHotkey: 'Control+Alt+Space',
    lastApp: 'today',
    dailyGoalMinutes: 120,
    petName: 'Tick'
  },
  meta: {
    pomodoroCount: 0,
    lastSessionDate: null
  }
};

class Store {
  constructor(dir, filename = 'tick-data.json') {
    this.file = path.join(dir, filename);
    this.dir = dir;
    this.data = this._load();
    this._writeTimer = null;
  }

  _load() {
    try {
      // Strip a UTF-8 BOM: plenty of Windows tools (PowerShell's Out-File,
      // Notepad) add one, and JSON.parse refuses to read past it. Without this
      // a stray hand-edit looks exactly like a corrupt file.
      const raw = fs.readFileSync(this.file, 'utf8').replace(/^﻿/, '');
      const parsed = JSON.parse(raw);
      const merged = {
        ...structuredClone(DEFAULTS),
        ...parsed,
        settings: { ...DEFAULTS.settings, ...(parsed.settings || {}) },
        meta: { ...DEFAULTS.meta, ...(parsed.meta || {}) }
      };
      // A file written before a collection existed simply has no key for it.
      for (const name of COLLECTIONS) {
        merged[name] = Array.isArray(parsed[name]) ? parsed[name] : [];
      }
      // v2 kept links and snippets in their own app. They are just notes.
      if (Array.isArray(parsed.stash) && parsed.stash.length) {
        for (const item of parsed.stash) {
          merged.notes.push({
            id: item.id,
            title: item.title || '',
            body: item.content || '',
            tags: item.tags || [],
            kind: item.kind === 'link' ? 'link' : 'note',
            pinned: false,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt
          });
        }
      }
      merged.version = DEFAULTS.version;
      return merged;
    } catch (err) {
      if (err.code !== 'ENOENT') {
        // Corrupt file: keep a copy so nothing is silently lost, then start fresh.
        try {
          fs.copyFileSync(this.file, `${this.file}.corrupt-${Date.now()}`);
        } catch (_) { /* nothing more we can do */ }
        console.error('[store] could not read data file, starting fresh:', err.message);
      }
      return structuredClone(DEFAULTS);
    }
  }

  save({ immediate = false } = {}) {
    if (this._writeTimer) clearTimeout(this._writeTimer);
    if (immediate) return this._write();
    this._writeTimer = setTimeout(() => this._write(), 400);
  }

  _write() {
    this._writeTimer = null;
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      const tmp = `${this.file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8');
      fs.renameSync(tmp, this.file);
    } catch (err) {
      console.error('[store] write failed:', err.message);
    }
  }

  // ---- settings -----------------------------------------------------------
  get settings() { return this.data.settings; }

  updateSettings(patch) {
    Object.assign(this.data.settings, patch);
    this.save();
    return this.data.settings;
  }

  get meta() { return this.data.meta; }

  updateMeta(patch) {
    Object.assign(this.data.meta, patch);
    this.save();
    return this.data.meta;
  }

  // ---- generic collections ------------------------------------------------
  /** Every app's records go through here. Unknown names are refused. */
  list(collection) {
    if (!COLLECTIONS.includes(collection)) return [];
    return this.data[collection];
  }

  add(collection, item) {
    if (!COLLECTIONS.includes(collection)) return null;
    const record = {
      id: (item && item.id) || crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      ...item
    };
    this.data[collection].unshift(record);
    this.save();
    return record;
  }

  update(collection, id, patch) {
    if (!COLLECTIONS.includes(collection)) return null;
    const record = this.data[collection].find((r) => r.id === id);
    if (!record) return null;
    Object.assign(record, patch, { updatedAt: new Date().toISOString() });
    this.save();
    return record;
  }

  remove(collection, id) {
    if (!COLLECTIONS.includes(collection)) return false;
    const before = this.data[collection].length;
    this.data[collection] = this.data[collection].filter((r) => r.id !== id);
    const removed = this.data[collection].length !== before;
    if (removed) this.save();
    return removed;
  }

  /** Everything a renderer needs in one shot; the whole file is tiny. */
  snapshot() {
    const out = { settings: this.data.settings, meta: this.data.meta };
    for (const name of COLLECTIONS) out[name] = this.data[name];
    return out;
  }

  // ---- timer-specific conveniences (kept for the existing call sites) -----
  get entries() { return this.data.entries; }
  addEntry(entry) { return this.add('entries', entry); }
  updateEntry(id, patch) { return this.update('entries', id, patch); }
  deleteEntry(id) { return this.remove('entries', id); }
}

module.exports = { Store, DEFAULTS, COLLECTIONS };

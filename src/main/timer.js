'use strict';
const { EventEmitter } = require('events');
const crypto = require('crypto');

/**
 * The timer lives in the main process so it keeps running no matter which
 * window is visible, hidden or closed. Elapsed time is derived from wall-clock
 * timestamps rather than counting ticks, so laptop sleep / throttled renderers
 * cannot make it drift.
 */

const MODES = {
  focus: { label: 'Focus', kind: 'countdown', settingKey: 'focusMinutes' },
  short: { label: 'Short Break', kind: 'countdown', settingKey: 'shortBreakMinutes' },
  long: { label: 'Long Break', kind: 'countdown', settingKey: 'longBreakMinutes' },
  stopwatch: { label: 'Stopwatch', kind: 'countup', settingKey: null }
};

const TICK_MS = 250;

class Timer extends EventEmitter {
  constructor(store) {
    super();
    this.store = store;
    this.reset();
  }

  reset() {
    this.status = 'idle';          // idle | running | paused
    this.mode = 'focus';
    this.task = '';
    this.tags = [];
    this.plannedMs = 0;
    this.accumulatedMs = 0;        // completed run segments
    this.segmentStart = null;      // ms timestamp of current running segment
    this.startedAt = null;         // ISO of the very first start
    this._stopTicking();
  }

  // ---- derived ------------------------------------------------------------
  get elapsedMs() {
    const live = this.segmentStart ? Date.now() - this.segmentStart : 0;
    return this.accumulatedMs + live;
  }

  get remainingMs() {
    if (MODES[this.mode].kind === 'countup') return null;
    return Math.max(0, this.plannedMs - this.elapsedMs);
  }

  get progress() {
    if (MODES[this.mode].kind === 'countup') {
      // A gentle 60-minute sweep so the ring still has something to say.
      return Math.min(1, this.elapsedMs / (60 * 60 * 1000));
    }
    if (!this.plannedMs) return 0;
    return Math.min(1, this.elapsedMs / this.plannedMs);
  }

  getState() {
    return {
      status: this.status,
      mode: this.mode,
      modeLabel: MODES[this.mode].label,
      kind: MODES[this.mode].kind,
      task: this.task,
      tags: this.tags,
      plannedMs: this.plannedMs,
      elapsedMs: this.elapsedMs,
      remainingMs: this.remainingMs,
      progress: this.progress,
      startedAt: this.startedAt,
      pomodoroCount: this.store.meta.pomodoroCount
    };
  }

  _emit() { this.emit('state', this.getState()); }

  _startTicking() {
    if (this._interval) return;
    this._interval = setInterval(() => this._tick(), TICK_MS);
  }

  _stopTicking() {
    if (this._interval) clearInterval(this._interval);
    this._interval = null;
  }

  _tick() {
    if (this.status !== 'running') return;
    if (MODES[this.mode].kind === 'countdown' && this.elapsedMs >= this.plannedMs) {
      this.complete();
      return;
    }
    this._emit();
  }

  // ---- commands -----------------------------------------------------------
  start({ mode = 'focus', task = '', minutes = null } = {}) {
    if (!MODES[mode]) mode = 'focus';
    // Starting fresh while something is already on the clock: bank the old one.
    if (this.status !== 'idle') this.stop({ silent: true });

    this.mode = mode;
    this.task = (task || '').trim();
    this.tags = extractTags(this.task);
    const settingKey = MODES[mode].settingKey;
    const mins = minutes != null ? Number(minutes) : (settingKey ? this.store.settings[settingKey] : 0);
    this.plannedMs = MODES[mode].kind === 'countdown' ? Math.max(1, mins) * 60 * 1000 : 0;
    this.accumulatedMs = 0;
    this.segmentStart = Date.now();
    this.startedAt = new Date().toISOString();
    this.status = 'running';
    this._startTicking();
    this._emit();
    return this.getState();
  }

  pause() {
    if (this.status !== 'running') return this.getState();
    this.accumulatedMs += Date.now() - this.segmentStart;
    this.segmentStart = null;
    this.status = 'paused';
    this._stopTicking();
    this._emit();
    return this.getState();
  }

  resume() {
    if (this.status !== 'paused') return this.getState();
    this.segmentStart = Date.now();
    this.status = 'running';
    this._startTicking();
    this._emit();
    return this.getState();
  }

  toggle() {
    if (this.status === 'running') return this.pause();
    if (this.status === 'paused') return this.resume();
    return this.start({ mode: this.mode, task: this.task });
  }

  /** Add minutes to a running countdown ("just a bit more"). */
  extend(minutes) {
    if (MODES[this.mode].kind !== 'countdown' || this.status === 'idle') return this.getState();
    this.plannedMs += Math.max(1, Number(minutes) || 5) * 60 * 1000;
    this._emit();
    return this.getState();
  }

  /** User bailed out early. Banks whatever was worth keeping. */
  stop({ silent = false } = {}) {
    if (this.status === 'idle') return this.getState();
    if (this.status === 'running') {
      this.accumulatedMs += Date.now() - this.segmentStart;
      this.segmentStart = null;
    }
    const entry = this._buildEntry(false);
    this.reset();
    if (entry) this.emit('entry', entry);
    if (!silent) this.emit('stopped', entry);
    this._emit();
    return this.getState();
  }

  /** Countdown ran all the way out. */
  complete() {
    if (this.status === 'idle') return this.getState();
    if (this.status === 'running') {
      this.accumulatedMs += Date.now() - this.segmentStart;
      this.segmentStart = null;
    }
    const finishedMode = this.mode;
    const entry = this._buildEntry(true);
    if (finishedMode === 'focus') {
      this.store.updateMeta({
        pomodoroCount: this.store.meta.pomodoroCount + 1,
        lastSessionDate: new Date().toISOString()
      });
    }
    this.reset();
    if (entry) this.emit('entry', entry);
    this.emit('completed', { entry, mode: finishedMode, next: this._suggestNext(finishedMode) });
    this._emit();
    return this.getState();
  }

  _suggestNext(finishedMode) {
    const s = this.store.settings;
    if (finishedMode !== 'focus') return { mode: 'focus', auto: s.autoStartFocus };
    const count = this.store.meta.pomodoroCount;
    const isLong = s.longBreakEvery > 0 && count % s.longBreakEvery === 0;
    return { mode: isLong ? 'long' : 'short', auto: s.autoStartBreaks };
  }

  /** Sessions shorter than this are noise, not work. */
  static get MIN_LOGGED_MS() { return 20 * 1000; }

  _buildEntry(completed) {
    const actualMs = this.accumulatedMs;
    if (actualMs < Timer.MIN_LOGGED_MS) return null;
    return {
      id: crypto.randomUUID(),
      task: this.task || (this.mode === 'focus' ? 'Untitled session' : MODES[this.mode].label),
      notes: '',
      mode: this.mode,
      tags: this.tags,
      startedAt: this.startedAt,
      endedAt: new Date().toISOString(),
      plannedMs: this.plannedMs,
      actualMs,
      completed
    };
  }
}

function extractTags(text) {
  const found = String(text).match(/#[\w-]+/g) || [];
  return [...new Set(found.map((t) => t.slice(1).toLowerCase()))];
}

module.exports = { Timer, MODES, extractTags };

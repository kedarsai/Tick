'use strict';
/* Logic tests for the timer engine. No Electron, no windows - just the rules.
   Run with: node --test test/  (or npm test) */

const test = require('node:test');
const assert = require('node:assert');
const { Timer, extractTags } = require('../src/main/timer');

function fakeStore(overrides = {}) {
  return {
    settings: {
      focusMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15,
      longBreakEvery: 4, autoStartBreaks: true, autoStartFocus: false,
      ...overrides
    },
    meta: { pomodoroCount: 0, lastSessionDate: null },
    updateMeta(patch) { Object.assign(this.meta, patch); return this.meta; }
  };
}

/** Run a timer without waiting in real time.
    Any timer created inside is reset afterwards so its interval cannot keep
    the test process alive. */
function withClock(fn) {
  const realNow = Date.now;
  let now = 1700000000000;
  Date.now = () => now;
  const advance = (ms) => { now += ms; };
  const made = [];
  const make = (store) => {
    const t = new Timer(store || fakeStore());
    made.push(t);
    return t;
  };
  try {
    fn(advance, make);
  } finally {
    for (const t of made) t.reset();
    Date.now = realNow;
  }
}

test('extractTags pulls unique lowercase tags', () => {
  assert.deepEqual(extractTags('Fix #Tick and #tick and #migration'), ['tick', 'migration']);
  assert.deepEqual(extractTags('no tags here'), []);
});

test('a focus session counts down from the configured minutes', () => {
  withClock((advance, make) => {
    const timer = make();
    timer.start({ mode: 'focus', task: 'Write the plan #tick' });

    assert.equal(timer.status, 'running');
    assert.equal(timer.plannedMs, 25 * 60 * 1000);
    assert.deepEqual(timer.tags, ['tick']);

    advance(60 * 1000);
    assert.equal(timer.elapsedMs, 60 * 1000);
    assert.equal(timer.remainingMs, 24 * 60 * 1000);
    assert.ok(Math.abs(timer.progress - 1 / 25) < 1e-9);
  });
});

test('pausing freezes elapsed time and resuming continues it', () => {
  withClock((advance, make) => {
    const timer = make();
    timer.start({ mode: 'focus' });

    advance(120 * 1000);
    timer.pause();
    assert.equal(timer.status, 'paused');

    advance(600 * 1000);                       // time passes while paused
    assert.equal(timer.elapsedMs, 120 * 1000, 'paused time must not accrue');

    timer.resume();
    advance(30 * 1000);
    assert.equal(timer.elapsedMs, 150 * 1000);
  });
});

test('stopping early logs a partial entry marked incomplete', () => {
  withClock((advance, make) => {
    const timer = make();
    const logged = [];
    timer.on('entry', (e) => logged.push(e));

    timer.start({ mode: 'focus', task: 'Half a thing' });
    advance(7 * 60 * 1000);
    timer.stop();

    assert.equal(logged.length, 1);
    assert.equal(logged[0].completed, false);
    assert.equal(logged[0].actualMs, 7 * 60 * 1000);
    assert.equal(logged[0].task, 'Half a thing');
    assert.equal(timer.status, 'idle');
  });
});

test('sessions shorter than the noise floor are not logged', () => {
  withClock((advance, make) => {
    const timer = make();
    const logged = [];
    timer.on('entry', (e) => logged.push(e));

    timer.start({ mode: 'focus' });
    advance(5 * 1000);
    timer.stop();

    assert.equal(logged.length, 0, 'a 5 second misfire is not work');
  });
});

test('running out the clock completes the session and banks a pomodoro', () => {
  withClock((advance, make) => {
    const store = fakeStore();
    const timer = make(store);
    const logged = [];
    let completed = null;
    timer.on('entry', (e) => logged.push(e));
    timer.on('completed', (payload) => { completed = payload; });

    timer.start({ mode: 'focus', task: 'Finish it' });
    advance(25 * 60 * 1000);
    timer.complete();

    assert.equal(logged.length, 1);
    assert.equal(logged[0].completed, true);
    assert.equal(store.meta.pomodoroCount, 1);
    assert.equal(completed.next.mode, 'short');
    assert.equal(completed.next.auto, true);
  });
});

test('every 4th focus session earns a long break', () => {
  withClock((advance, make) => {
    const store = fakeStore();
    const timer = make(store);
    let last = null;
    timer.on('completed', (p) => { last = p; });

    for (let i = 0; i < 4; i++) {
      timer.start({ mode: 'focus' });
      advance(25 * 60 * 1000);
      timer.complete();
    }

    assert.equal(store.meta.pomodoroCount, 4);
    assert.equal(last.next.mode, 'long');
  });
});

test('breaks do not count as pomodoros and lead back to focus', () => {
  withClock((advance, make) => {
    const store = fakeStore();
    const timer = make(store);
    let last = null;
    timer.on('completed', (p) => { last = p; });

    timer.start({ mode: 'short' });
    advance(5 * 60 * 1000);
    timer.complete();

    assert.equal(store.meta.pomodoroCount, 0);
    assert.equal(last.next.mode, 'focus');
  });
});

test('stopwatch mode counts up and has no remaining time', () => {
  withClock((advance, make) => {
    const timer = make();
    timer.start({ mode: 'stopwatch', task: 'Open-ended reading' });

    advance(42 * 60 * 1000);
    assert.equal(timer.remainingMs, null);
    assert.equal(timer.elapsedMs, 42 * 60 * 1000);

    const state = timer.getState();
    assert.equal(state.kind, 'countup');
  });
});

test('extend adds time to a running countdown only', () => {
  withClock((advance, make) => {
    const timer = make();
    timer.start({ mode: 'focus' });
    advance(24 * 60 * 1000);
    timer.extend(5);
    assert.equal(timer.remainingMs, 6 * 60 * 1000);

    timer.stop();
    timer.start({ mode: 'stopwatch' });
    const before = timer.plannedMs;
    timer.extend(5);
    assert.equal(timer.plannedMs, before, 'a stopwatch has nothing to extend');
  });
});

test('starting a new session banks the one already running', () => {
  withClock((advance, make) => {
    const timer = make();
    const logged = [];
    timer.on('entry', (e) => logged.push(e));

    timer.start({ mode: 'focus', task: 'First thing' });
    advance(10 * 60 * 1000);
    timer.start({ mode: 'focus', task: 'Second thing' });

    assert.equal(logged.length, 1);
    assert.equal(logged[0].task, 'First thing');
    assert.equal(logged[0].actualMs, 10 * 60 * 1000);
    assert.equal(timer.task, 'Second thing');
    assert.equal(timer.elapsedMs, 0);
  });
});

test('a custom duration overrides the configured default', () => {
  withClock((advance, make) => {
    const timer = make();
    timer.start({ mode: 'focus', minutes: 90 });
    assert.equal(timer.plannedMs, 90 * 60 * 1000);
  });
});

/* Parsing what you type into a task.
 *
 * Deliberately conservative: a word only becomes a due date if it is actually
 * a day name, and only a standalone "!" flags a task. Guessing wrong here
 * silently eats words out of your task, which is worse than not guessing.
 */
(function (global) {
  'use strict';

  const ABBR = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const FULL = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  // "tues"/"thurs" are common enough to be worth accepting
  const ALT = { tues: 2, thur: 4, thurs: 4 };

  function weekdayIndex(word) {
    const w = word.toLowerCase();
    const full = FULL.indexOf(w);
    if (full >= 0) return full;
    const abbr = ABBR.indexOf(w);
    if (abbr >= 0) return abbr;
    return Object.prototype.hasOwnProperty.call(ALT, w) ? ALT[w] : -1;
  }

  function parseTags(text) {
    return [...new Set((String(text).match(/#[\w-]+/g) || []).map((t) => t.slice(1).toLowerCase()))];
  }

  function stripTags(text) {
    return String(text).replace(/#[\w-]+/g, '').replace(/\s+/g, ' ').trim();
  }

  /**
   * @param {string} raw        what the user typed
   * @param {function} dayKey   (offset) => 'YYYY-MM-DD', injected so this is testable
   * @param {Date} [now]        for tests
   */
  function parseTask(raw, dayKey, now) {
    let text = String(raw || '').trim();
    let due = null;
    let priority = false;

    // A standalone "!" flags it. "Ship it!" is just excitement, not a flag.
    if (/(?:^|\s)!(?=\s|$)/.test(text)) {
      priority = true;
      text = text.replace(/(?:^|\s)!(?=\s|$)/g, ' ');
    }

    const words = text.split(/\s+/).filter(Boolean);
    const today = now || new Date();

    for (let i = words.length - 1; i >= 0; i--) {
      const bare = words[i].toLowerCase().replace(/[.,;:]$/, '');
      let offset = null;

      if (bare === 'today') offset = 0;
      else if (bare === 'tomorrow' || bare === 'tmr') offset = 1;
      else if (bare === 'yesterday') offset = -1;
      else if (/^\+\d{1,3}$/.test(bare)) offset = parseInt(bare.slice(1), 10);
      else {
        const idx = weekdayIndex(bare);
        if (idx >= 0) {
          // "friday" on a Friday means the next one, not today.
          offset = (idx - today.getDay() + 7) % 7 || 7;
        }
      }

      if (offset !== null) {
        due = dayKey(offset);
        words.splice(i, 1);
        break;
      }
    }

    const title = words.join(' ').trim();
    return { title, tags: parseTags(text), due, priority };
  }

  global.Parse = { parseTask, parseTags, stripTags, weekdayIndex };
})(typeof window !== 'undefined' ? window : globalThis);

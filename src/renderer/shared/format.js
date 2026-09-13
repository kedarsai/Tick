/* Small formatting helpers shared by both renderers (plain global, no bundler). */
(function (global) {
  'use strict';

  const pad = (n) => String(n).padStart(2, '0');

  /** 00:00 / 1:02:03 - the glanceable clock readout. */
  function clock(ms) {
    const total = Math.max(0, Math.round((ms || 0) / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  }

  /** "1h 25m" - for totals, where seconds are just noise. */
  function duration(ms) {
    const value = ms || 0;
    if (value <= 0) return '0m';        // nothing is nothing, not "<1m"
    const mins = Math.round(value / 60000);
    if (mins < 1) return '<1m';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (!h) return `${m}m`;
    return m ? `${h}h ${m}m` : `${h}h`;
  }

  function timeOfDay(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  /** Local YYYY-MM-DD; never use toISOString here, it silently shifts the day. */
  function dayKey(date) {
    const d = date instanceof Date ? date : new Date(date);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function dayLabel(key) {
    const today = dayKey(new Date());
    const yesterday = dayKey(new Date(Date.now() - 86400000));
    if (key === today) return 'Today';
    if (key === yesterday) return 'Yesterday';
    const d = new Date(`${key}T12:00:00`);
    return d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  global.Fmt = { clock, duration, timeOfDay, dayKey, dayLabel, escapeHtml, pad };
})(window);

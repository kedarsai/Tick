/* The suite: one list, shared by the dock at the top of the screen and the
   rail inside the desk. Icons are drawn in the same chunky ink-outline style
   as everything else, at a 24x24 viewBox. */
(function (global) {
  'use strict';

  const ico = (body) => `<svg viewBox="0 0 24 24" class="ico" aria-hidden="true"
      fill="none" stroke="currentColor" stroke-width="2"
      stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

  const APPS = [
    {
      id: 'inbox',
      name: 'Inbox',
      blurb: 'everything you captured, unsorted',
      accent: '#c9452f',
      icon: ico(`
        <path d="M3.2 13.4L6 4.4h12L20.8 13.4v6.2H3.2z" />
        <path d="M3.2 13.4h5l1.2 2.6h5.2l1.2-2.6h5" />`)
    },
    {
      id: 'today',
      name: 'Today',
      blurb: 'everything at a glance',
      accent: '#f48f2d',
      icon: ico(`
        <circle cx="12" cy="12" r="4.2" />
        <path d="M12 2.6v2.6M12 18.8v2.6M2.6 12h2.6M18.8 12h2.6
                 M5.4 5.4l1.8 1.8M16.8 16.8l1.8 1.8M18.6 5.4l-1.8 1.8M7.2 16.8l-1.8 1.8" />`)
    },
    {
      id: 'timer',
      name: 'Timer',
      blurb: 'focus sessions and the log',
      accent: '#d66a16',
      icon: ico(`
        <circle cx="12" cy="13.2" r="8.2" />
        <path d="M12 8.8v4.4l2.8 2" />
        <path d="M9.2 2.6h5.6" />`)
    },
    {
      id: 'tasks',
      name: 'Tasks',
      blurb: 'what needs doing',
      accent: '#2f8577',
      icon: ico(`
        <path d="M3.4 6.6l2 2 3.2-3.4" />
        <path d="M3.4 13.4l2 2 3.2-3.4" />
        <path d="M12.6 7h8M12.6 14h8M12.6 20.4h8" />`)
    },
    {
      id: 'notes',
      name: 'Notes',
      blurb: 'thoughts worth keeping',
      accent: '#7b5ea7',
      icon: ico(`
        <path d="M5.2 3.4h9.2l4.4 4.4v12.8H5.2z" />
        <path d="M14.4 3.4v4.4h4.4" />
        <path d="M8.4 12.4h7M8.4 16.2h4.6" />`)
    },
    {
      id: 'habits',
      name: 'Habits',
      blurb: 'streaks worth protecting',
      accent: '#c9452f',
      icon: ico(`
        <path d="M12 21.2c3.6 0 6.2-2.5 6.2-5.8 0-4.4-4.4-5.6-3.2-9.8
                 -2.6.6-4 2.6-4 4.8 0 1.4.6 2.2.6 3 0 .9-.7 1.6-1.5 1.6
                 -1 0-1.7-.9-1.7-2.2-1.5 1.3-2.6 3-2.6 5 0 3.3 2.6 5.4 6.2 5.4z" />`)
    },
    {
      id: 'journal',
      name: 'Journal',
      blurb: 'a line a day',
      accent: '#3f8f52',
      icon: ico(`
        <path d="M4.4 4.2a2 2 0 0 1 2-2h13.2v17.6H6.4a2 2 0 0 0-2 2z" />
        <path d="M4.4 4.2v17.6" />
        <path d="M9 7.4h6.6M9 11.2h6.6M9 15h4" />`)
    }
  ];

  // Companions are separate apps, installed on their own. They get a dock
  // button (which opens their Start Menu shortcut) but no place in the desk's
  // rail.
  const COMPANIONS = [
    {
      id: 'folio',
      name: 'Folio',
      blurb: 'reading companion',
      accent: '#e07a1c',
      icon: ico(`
        <path d="M12 6.4C9.8 4.8 6.6 4.4 2.8 5v13.4c3.8-.6 7-.2 9.2 1.4 2.2-1.6 5.4-2 9.2-1.4V5c-3.8-.6-7-.2-9.2 1.4z" />
        <path d="M12 6.4v13.4" />
        <path d="M15.2 5.3v6.1l1.7-1.3 1.7 1.3V5" fill="#f48f2d" />`)
    }
  ];

  const byId = (id) => APPS.find((a) => a.id === id) || APPS[0];

  global.SuiteApps = { list: APPS, companions: COMPANIONS, byId };
})(window);

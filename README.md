# Tick

A small suite of productivity apps for one Windows machine — mine. No web
version, no accounts, no sync.

Three parts:

- **The dock** — a slim collapsible bar at the top of the screen. Click an icon
  to open that app. Collapses to a tab when you want it gone.
- **The desk** — one window that hosts every app, switched from the rail down
  the left. Same visual language throughout.
- **The pet** — a cartoon clock creature that floats over everything and keeps
  the timer visible at a glance. It has opinions.

## The apps

| App | What it is for |
| --- | --- |
| **Inbox** | Everything you captured, waiting to be sorted. Drag a card onto a lane — Task, Later, Note, Idea, Feeling, Bin |
| **Today** | The one screen that answers "what now?" — focus time, what is due, habits, recent notes, and one capture box |
| **Timer** | Pomodoro sessions and the honest record of what they were spent on |
| **Tasks** | To-dos with tags, due dates and flags, as a list or a month calendar. Start a focus session on any task |
| **Notes** | A list on the left, the note on the right, saved as you type |
| **Habits** | A row per habit, a square per day, streaks worth protecting |
| **Journal** | One entry per day, with a mood |

The timer lives in the main process, so it keeps running whichever app you are
looking at — or none of them.

## Running it

```bash
npm install
npm start
```

**Tick starts with Windows automatically** the first time it runs, launching in
the background: you get the dock and the pet, not a window in your face. Toggle
it under Settings > *Start with Windows*, or from the tray menu.

Ctrl+Alt+4 is owned by Windows, not by the app, so it works even when Tick is
closed - it launches it. Install the shortcuts once:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\install-shortcuts.ps1
```

That creates two shortcuts:

- **Start Menu** - carries the `Ctrl+Alt+4` shortcut key. Explorer registers it
  system-wide, so it works whether or not Tick is running. Leave this one where
  it is; Windows only honours shortcut keys from the Start Menu or Desktop.
- **Desktop** - an ordinary launcher.

Undo it all with the same command plus `-Remove`.

Starting at login is *not* a shortcut - the app registers itself as a login item
so there is exactly one of it and it can be toggled from Settings. An older
build did use a Startup shortcut; Tick deletes it on sight, because having both
would launch two copies every morning.

`Ctrl+Alt+5` and `Ctrl+Alt+6` are registered by the app itself, so those two only
work while Tick is running.

## Hotkeys

| Key | Does |
| --- | --- |
| `Ctrl` `Alt` `Space` | quick capture from anywhere *(via the AutoHotkey bridge)* |
| `Ctrl` `Alt` `C` | quick capture — the fixed second door, always works |
| `Ctrl` `Alt` `X` | grab a screen region straight to the inbox |
| `Ctrl` `Alt` `3` | show / hide the dock *(only while Tick runs)* |
| `Ctrl` `Alt` `4` | launch Tick, or toggle the desk if it is already running |
| `Ctrl` `Alt` `5` | show / hide the pet *(only while Tick runs)* |
| `Ctrl` `Alt` `6` | start, pause or resume *(only while Tick runs)* |

If `Ctrl+Alt+4` stops working, the Start Menu shortcut was moved or deleted —
re-run the installer. If 5 or 6 do not fire, something else on the machine owns
them; the terminal prints a warning at startup saying which failed.

## Capture first, sort later

Press the capture hotkey anywhere — in any app, at any time — and a single box
appears. Type, hit Enter, it is gone. Everything lands in the **Inbox**.

Nothing is classified at capture time on purpose: deciding what a thought *is*
costs more than writing it down, and that decision is what kills the habit. Sort
the inbox later, in one pass.

The box keeps whatever you typed if it gets dismissed, and selects it when you
come back — an interruption never costs you a half-finished sentence.

### Grabbing a piece of the screen

The **Region** button freezes the screen, dims it, and lets you drag a rectangle
over the frozen copy. Picking from a still means you get exactly what was there
when you reached for the camera, with nothing shuffling underneath you. Tick's
own pet, dock and capture box are hidden first, so they never end up in the
picture.

`Ctrl+Alt+X` skips the box entirely: drag a region and it lands in the inbox on
its own, no typing.

The crop is attached to the capture and follows it through triage — file it as a
Note and the picture goes with it.

Click a thumbnail and it opens **inside the app**: the picture on the left, and
everything you know about it on the right — when you grabbed it, how big it is,
the text (editable in place), and the six triage lanes, so you can look at a
screenshot and file it without closing anything. *Actual size* toggles between
fit-to-window and 1:1. There are still **Copy image** and **Open externally**
buttons if you want the OS viewer.

Screenshots live next to your data, in `%APPDATA%	ick\shots\`. Only files in
that folder can be opened from the app.

In the Inbox, drag a card onto a lane:

| Lane | Where it goes |
| --- | --- |
| **Task** | Tasks — and it asks *when*, because a task without a date is a worry |
| **Later** | Tasks, filed under Someday with no date |
| **Note** | Notes |
| **Idea** | Notes, marked as an idea |
| **Feeling** | Appended to today's journal entry |
| **Bin** | Nowhere |

Dragging is the fun way, never the only way — every card also carries the same
six as buttons.

### How Ctrl+Alt+Space works

Windows hands a hotkey to whichever app registered it first and will not let
another app take it. On this machine Claude already holds `Ctrl+Alt+Space`, so
Tick cannot register it — no app can.

A **low-level keyboard hook** is the one exception: it sees the keystroke before
Windows dispatches hotkeys at all. That is what `scripts/capture-hotkey.ahk`
does — it swallows `Ctrl+Alt+Space` and forwards to `Ctrl+Alt+C`, which Tick
always holds as a fixed second door. Both keys open capture; Claude never sees
the keystroke.

The bridge needs AutoHotkey v2 (already installed here) and runs at login from
its own `TickCaptureBridge` startup entry.

Without the bridge, Tick falls back on its own: it asks for `Ctrl+Alt+Space`,
settles for the best free alternative (`Ctrl+Alt+C`, then `Q`, `W`, `N`, `7`,
`Ctrl+Shift+Space`), and re-checks every 15 seconds — so freeing the key in
whatever owns it hands it to Tick with no restart. Whatever is actually in force
shows in Settings > Shortcuts and in the Today hint.

## The dock

A pill at the top of the screen with one icon per app, a live timer chip, and a
collapse arrow. Drag it by the grip on the left. Collapsed, it becomes a small
tab hanging from the top edge — click it to bring the bar back.

## Using the timer

Type what you are working on, pick a mode, hit start. When the session ends it
is written to the time sheet with the task text, so the log answers "what did I
actually do today" rather than just "how long did I sit here".

- **Modes** — Focus (25m), Short (5m), Long (15m), Free (counts up, no target).
  Durations are configurable in settings.
- **Tags** — put `#anything` in the task text and it is stored as a tag, which
  the time sheet search can filter on.
- **Stopping early** still logs the session, marked with a dashed pill so you
  can tell a finished session from an abandoned one. Anything under 20 seconds
  is treated as a misfire and not logged at all.
- **Breaks** are logged too but never counted toward focus totals or the streak.
- Every fourth completed focus session earns a long break.

### The pet

Open settings (the cog on the desk) to change who lives on your desktop:

- **25 characters** — an alarm clock, a pocket watch, an hourglass, a seedling,
  a toadstool, a cat, an owl, a ghost, a robot, a rocket, a coffee mug, a frog,
  a penguin, a slice of toast, a cactus, a moon, a star, a bee, a dinosaur, an
  octopus, a snail, a teapot, a radio, an egg and a blob. They share one
  anatomy — a dial that tells the time, a progress collar, eyes that follow
  your cursor — but nothing else.
- **Size** — 60% to 200%. The window resizes with the creature and keeps its
  feet planted where they were, so it does not wander when you scale it.
- **Analog or digital** — analog gets clock hands and a mouth; digital swaps in
  a lit readout where the mouth would be, so the digits become the expression.

The progress collar always wears the *mode* colour (orange focus, teal short
break, purple long break), so you can tell what is running no matter which
character you picked.

### It is a pet, not a progress bar

Each character has its own way of being alive:

- **Its own gait.** Twelve idle behaviours and seventeen working ones. Bog the
  frog hops while the clock runs. Boo the ghost floats. Cog the robot jitters
  in mechanical steps. Sluggo the snail creeps, slowly, forever. Mochi the cat
  breathes slower than everyone else, because of course she does.
- **Parts that move on their own.** Buzz's wings flap, Mochi's tail flicks,
  Zip's rocket flame flickers, Brew's steam rises, Sandy's sand falls, Static's
  antenna light blinks, Inky's tentacles ripple, Sprout's leaves sway in a
  breeze that is not there.
- **Fidgets.** Every 7–20 seconds it does something unprompted — a hop, a
  stretch, a yawn, a look around, a shake. Each character prefers a different
  set, so the cat yawns and stretches while the rocket hops and spins.
- **A voice.** Every character has its own lines for starting, finishing, being
  poked, and idle muttering. Cog says `PRODUCTIVITY: INITIATED.` Mochi says
  `Ugh, fine.` Prick the cactus says `No excuses.` Twinkle is relentlessly
  encouraging. Button the toadstool is openly unimpressed with you.
- **It reacts to you.** Poke it and it squashes and complains. Pick it up and
  it dangles from the cursor and protests; put it down and it lands with a
  squash. It twitches in the last ten seconds of a session, sags and desaturates
  when you pause, and jumps with confetti when the clock runs out.
- **It notices things.** It mutters to itself every couple of minutes, knows
  when a session has run past 45 minutes, and has something different to say
  after 11pm.

- **Click** it to open the controls, click again to close. Clicking while the
  controls are already open counts as a poke.
- **Tuck it away** with the `⋮⋮` button in the controls. The creature folds into
  a small round tab clinging to the nearest screen edge, out of the way but
  still counting: the progress ring wraps the tab, and the clock slides out
  beside it whenever a session is running or you reach for it. Click the tab to
  bring the pet back exactly where it was, or drag the tab to slide it along the
  edge — let go and it snaps to whichever edge is nearest.
- `Ctrl+Alt+5` brings a tucked pet back too; the tray menu has
  *Tuck pet to the edge* / *Bring the pet back*.
- **Drag** it (by the body or the badge) anywhere on screen; the position is
  remembered.
- **Right-click** it to open the desk.
- Transparent pixels are click-through — the window is a rectangle but only the
  drawn creature catches the mouse, so it never blocks what is behind it.
- The controls normally unfold upward. Perch the pet near the top of the screen
  and they flip below it instead, and the window shifts so the creature itself
  does not move.

### The desk

Stats for today and the last seven days, a seven-day bar chart, and the time
sheet grouped by day. Task text in the time sheet is editable in place — click
it and type. `+ Entry` adds a session you forgot to time; `Export CSV` dumps
everything.

## Planning across a month

Tasks has two views, switched top right. The **list** is what you work down; the
**calendar** is what you plan across.

Every day is a drop target: drag a task onto a day and that is the whole
rescheduling gesture — no dialog, no date picker. Drag it onto **Unscheduled**
on the right to take the date off again, and drag from there onto a day to plan
it. Today is outlined, days with overdue work are tinted, and each day shows how
many things are still open. Click a task to tick it off without leaving.

## Where the data lives

```
%APPDATA%\tick\tick-data.json
```

One plain JSON file — every app's records, settings and counters. Back it up by copying it,
reset by deleting it. If it is ever unreadable the app keeps the broken copy
alongside it as `tick-data.json.corrupt-<timestamp>` and starts fresh.

## Layout

```
src/main/            timer engine, JSON store, window factories, tray, hotkeys, IPC
src/preload/         the only bridge the renderers get
src/renderer/
  dock/              the bar at the top of the screen
  shell/             the desk: chrome, router, shared data client
  shell/
    apps/            one file per app - inbox, today, timer, tasks,
                     notes, habits, journal
  widget/            the pet
  shared/            theme, formatting, the app registry,
                     characters.js (the 25-creature roster)
scripts/             icon generator, shortcut installer,
                     capture-hotkey.ahk (the Ctrl+Alt+Space bridge)
test/                node --test
```

Every app stores its records in a named collection through one generic
`add` / `update` / `remove` door, so adding an eighth app means adding a
collection name and one file under `shell/apps/`.

The icons are generated from code (`node scripts/make-icons.js`) rather than
checked in as binaries someone has to re-export.

## Tests

```bash
npm test
```

42 tests over four suites:

- **timer** — counting down, pause not accruing time, partial vs completed
  entries, the noise floor, pomodoro counting and the long-break cycle,
  stopwatch mode, extending, and banking a running session when a new one starts.
- **store** — round trips, missing keys backfilled from defaults, a corrupt file
  preserved rather than dropped, and a UTF-8 BOM not destroying your data.
- **parse** — the task parser only eats a word when it is certain: `monitor`
  stays a word rather than becoming a Monday deadline, and `Ship it!` is not a
  priority flag.
- **characters** — every creature declares the anatomy the renderer needs, fits
  the drawing box, and renders in both face styles without emitting `NaN`,
  `undefined` or unbalanced tags. Also that every character moves in a way the
  stylesheet actually defines, that the roster does not all move the same way,
  that everyone has a line for every moment, and that no two characters share
  a line.

## Known rough edges

It is a prototype, so:

- There is no editing of a session's *times* after the fact, only its text.
- Every data change ships the whole snapshot to the renderers and the active app
  re-renders. Fine at this size; it would need to get smarter with thousands of
  records.
- The apps have no tests of their own — the suite's tests cover the timer
  engine, the store, the task parser and the character roster.
- A tucked-away pet stops fidgeting and chattering — it is meant to be out of
  the way — but the clock and the progress ring keep running.
- Packaging (`npm run dist`) is configured but untested; running from source via
  the shortcut is the intended path.

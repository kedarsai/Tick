# Projects, tags, new capture keys and cropping

2026-09-16

Three changes to Tick, built in this order. They share no code, so each part
can land on its own.

1. **Tasks** gain a project, an optional identity number, and tags managed in
   Settings.
2. **Hotkeys** shrink to two capture keys: `Ctrl+Alt+X` for a region,
   `Ctrl+Alt+C` for the whole screen. `Ctrl+Alt+3/4/5/6` go away.
3. **The picture viewer** can crop, with one undo.

## 1. Projects, identity numbers and tags

### Data

Two new collections in the same JSON file, alongside `tasks` and `notes`:

```js
projects: [{ id, name, identity, archived, createdAt }]
tags:     [{ id, name, accent, createdAt }]
```

`identity` is free text, optional, and never validated - it is a Jira key, a
ticket number, a client reference, whatever you use. Tasks gain two fields:

```js
tasks: [{ ..., projectId: null, identity: '' }]
```

Tasks keep storing tags as plain lowercase names, exactly as they do now. The
`tags` collection is a catalogue of the names worth offering, not a foreign
key. This keeps every existing record valid and means a lost catalogue entry
can never orphan a task.

**The catalogue maintains itself.** `store.ensureTags(names)` adds any unknown
name and is called whenever a task or note is written with tags - from the
quick-add box, from inbox triage, from anywhere. That is the "auto-add"
behaviour, implemented once in the store rather than in each caller.

**Migration (version 3 -> 4):** on first load, every tag already on a task or
note is seeded into the catalogue. Nothing is invented, nothing is lost. Tasks
without `projectId`/`identity` simply read as unassigned.

**Operations that touch more than one record** live in the store, where they
are testable:

- `renameTag(from, to)` - rewrites the name on every task and note. Renaming
  onto an existing tag merges the two.
- `deleteTag(name)` - removes it from the catalogue and strips it from every
  task and note.
- `deleteProject(id)` - removes the project and unassigns its tasks. The tasks
  themselves are never deleted.

Archiving a project keeps it on existing tasks but drops it from the dropdown.

### Settings: "Projects & tags"

A new section in the existing settings drawer, in its own renderer file
(`shell/catalog.js`) so `shell.js` does not grow another responsibility.

- **Projects:** name + optional identity number. Add, rename, edit the
  identity, archive, delete. Each row shows how many tasks use it.
- **Tags:** name + colour. Add, rename, recolour, delete. Each row shows its
  use count, so deleting is an informed choice.

Deleting anything that is in use asks first, in a one-line confirm.

### Tasks

Rows stay compact and gain pills: identity number, project name, tags.
Clicking a row opens a detail panel beside the list:

```
Title        [Fix recon mismatch          ]
Project      [Data Migration            v ]
Identity     [DM-142                      ]
Tags         (urgent x) (backend x) [ + ]
Due          [2026-09-16]   Flag [ ]
```

The quick-add box is unchanged: `#tag` still files it, and an unknown `#tag`
joins the catalogue. The filter bar gains a project filter next to the tag
filter; while a project filter is on, newly typed tasks land in that project.

## 2. Hotkeys

| Key | Before | After |
|-----|--------|-------|
| `Ctrl+Alt+Space` | quick capture box | unchanged |
| `Ctrl+Alt+X` | region to inbox | unchanged |
| `Ctrl+Alt+C` | internal bridge target | **whole screen to inbox** |
| `Ctrl+Alt+3` | show/hide dock | removed (tray, dock tab) |
| `Ctrl+Alt+4` | open the desk | removed (dock, pet, tray) |
| `Ctrl+Alt+5` | show/hide pet | removed (tray) |
| `Ctrl+Alt+6` | start/pause | removed (pet, tray, desk) |

Every removed key has another way in, listed above; nothing becomes
unreachable. `Ctrl+Alt+4` is a property of the Start Menu shortcut, so
`install-shortcuts.ps1` stops setting it (the shortcut itself stays).

**The bridge moves.** `Ctrl+Alt+Space` is owned by another app, so AutoHotkey
hooks it and forwards to a key Tick always holds. That key was `Ctrl+Alt+C`,
which now belongs to full-screen capture, so the bridge moves to
`Ctrl+Alt+Q` - `capture-hotkey.ahk` and the fallback list change together.

**Full-screen capture** reuses the region path: hide our own windows, grab the
display under the cursor, save PNG + thumbnail, add to the inbox, show a
silent notification. The only difference is that no rectangle is picked, so
`saveShot(image, rect, display)` takes `rect = null` to mean the whole frame.

While fixing the installer: it looks for AutoHotkey in `AutoHotkey2\`, but it
installs to `AutoHotkey\v2\` on this machine, so the bridge was silently
skipped. Both paths get checked.

## 3. Cropping in the viewer

A **Crop** button in the viewer's footer. Pressing it dims the picture and
lets you drag a rectangle; Apply and Cancel appear beside it. Apply writes the
cropped picture and the thumbnail as a **new pair of files**, then hands the
new `shot` record back to whoever opened the viewer, which saves it.

Writing new files rather than overwriting means no cache-busting tricks and a
free undo: **Undo** puts the old record back and deletes the new files. When
the viewer closes, the superseded files are deleted and the crop is permanent.
A crash between the two leaves an orphan PNG in the shots folder - harmless,
and swept on the next start.

The rectangle is dragged in screen pixels over an image that is usually scaled
to fit, so the mapping to real pixels is pure arithmetic, kept in
`src/main/shots.js` and unit tested: scale by natural/displayed, round, clamp
to the image, refuse anything under 4px.

Callers that pass `onShot` get cropping; the inbox and notes do. Anything that
opens the viewer read-only simply omits it and sees no Crop button.

## Tests

`npm test`, node's own runner, no new dependencies.

- **store** - the two new collections; `ensureTags` on add and update;
  seeding from a v3 file; `renameTag` rewriting and merging; `deleteTag`
  stripping; `deleteProject` unassigning without deleting tasks.
- **shots** - the crop rectangle maths: scaling, rounding, clamping, and the
  minimum size.
- **catalog** - pure helpers shared by the settings section and the tasks
  view: sorting, use counts, tag colour assignment.

Renderer views stay untested, as they are today.

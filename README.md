# Composure

A keyboard-first place to empty your head when there's too much in it, sort what came out, and give the important things a day.

Four screens, one flow. `⌥←` / `⌥→` step between them; `⇧1`–`⇧4` jump straight there. The Archive sits off to the side (see the end of the list).

1. **Dump** (`⇧1`). `Space` starts a new thought (typing anything else opens search, like every screen). `↵` saves the line and opens the next one; double-tap `⇧` (or `esc`) to finish. `⇧↑ ⇧↓` reorder. Paste a list and every line becomes a thought.

   **Dump clears itself.** A thought with a priority, a day and a time has been dealt with, so Dump tucks it away (it's still in Sort, Plan and Today). A footer line, "show 3 sorted and planned", brings them back (also in search). Dropped thoughts count as dealt with: they need no day or time. To deal with what's left, select a thought and press `→`: it asks for the first thing missing (priority, then day, then time). `1`–`8` pick (the same numbers as Sort and Plan: priorities `1`–`4`, days `1`–`7` with `8` for later, times `1`–`6`), or use `←` `→` and `↵`. Each pick applies at once and moves on to what's still missing; `↑` `↓` skip to another missing field, `⌘S` takes any day in words, `←` from the first option, `⌫` or `esc` close, and `⌘Z` undoes a pick. When nothing is missing the thought leaves the list and the next one is selected. On a thought with subtasks it fills in every subtask that lacks it.
2. **Sort** (`⇧2`). One thought at a time goes into an Eisenhower matrix. `Q W A S` files it and moves straight to the next one, no confirm step. Hover a box for what it's for. Most of your own tasks are Do or Schedule. The bottom row is for what isn't really yours: *Someone else's* is their deadline landing on you (hand it off, do it fast, or say no), and *Let go* is guilt, habit or a "should" you don't want. Writing it down was enough.
3. **Plan** (`⇧3`). Slot what matters into the next seven days. `1`–`7` picks a day, `8` is "later", `0` unplans. Again, it applies at once.

4. **Today** (`⇧4`). Only today's plan plus anything overdue, split into work sessions. `⌘K` ticks a task off (it goes straight to the Archive) and moves to the next one, `T` means "not today" (moves it to tomorrow). While a session runs, Today turns into a focus view: the task on the clock fills the screen with its own countdown, and the rest of the list, the top bar and the key hints fade almost to nothing (hover, or press `N` or `↑` `↓`, to bring them back). The line under the progress bar says how much time is left and when you'd be done if you started now ("start now" is a button, or press `F`).

   `N` adds a task right there: type it and `↵` puts it in today's plan and opens the next line. To say what it is first, `↓` moves into the options under the line: `←` `→` walk along a row (quadrant, then time), `↑` `↓` change row, `↵` picks the highlighted one (again to clear it) and `⇧↵` adds the task. Typing or `⌫` takes you back to the text. What you picked stays picked for the next task and can be clicked too; anything unpicked can be set later like any other task. Paste a list to add several at once.

   **Work sessions.** `⇧←` / `⇧→` move the selected task into the previous or next session (past the last one makes a new one), so you can split the day into blocks. `F` starts the session the selected task is in: it works through that session's open tasks, each for as long as its time estimate (25 minutes if it has none), and one clock runs down from the total. The first task is highlighted; when its time is up the next one is, and you get a browser notification (allow notifications when asked, and the browser tab itself shows the session: the time left in its title and the minutes left drawn in its icon, with a ring for the task you're on, so you can read it from any other window or a pinned tab). Nothing is ticked off for you: `⌘K` the ones you finish, which moves straight on to the next with its full time. `=` and `-` give the task you're on more or less time, live. When the last window closes, anything still open is marked; tick off what you did, give the rest the time they still need with `=` / `-`, and press `↵` to carry on with a new round over what's left. `F` stops a session at any point, and it survives a reload.

5. **Archive** (`⇧5`, or `⌘K` and type "archive": it's the first result). It isn't a tab. `⌫` or `esc` takes you back to the screen you came from. Finished things rest here. Tick something off, anywhere, and it leaves Dump, Sort, Plan and Today at once and appears here under the day you did it. Today's progress bar still counts it. `↑` `↓` walk the list, `⌘K` reopens one (it comes back open, and overdue if its day has passed), `⌘⌫` deletes it. A done subtask moves on its own; its parent follows once all its subtasks have. Nothing is copied or moved in your data: it's just whether the thought is done, so `⌘Z` works here too. Things marked `[x]` in an imported file go straight to the archive.

**Time.** Say how long each thing takes. In Sort, `1`–`6` set 5m · 15m · 30m · 1h · 2h · 4h on the card you're looking at (it stays put; `Q W A S` still files it). In Sort, Plan and Today, `=` and `-` step the estimate longer or shorter. Within each quadrant, Sort, Plan and Today list the quickest first and anything without an estimate last, so you build momentum and the list shrinks fast. Because the order is automatic, there is no manual reordering in Plan or Today. Quadrants and days show their totals, and Today adds it up: planned, done, left, and when you'd be finished if you started now.

**Subtasks.** Break a thought down in Dump. While typing, `⇥` nests the line under the one above and `⇧⇥` pops it back out; `↵` keeps adding subtasks until you un-nest. `⌥↵` saves the line and opens a subtask under it. On a selected thought, `⌥↵` adds a subtask, `⇥` / `⇧⇥` nest or un-nest it, and `⇧↑ ⇧↓` move it (a parent takes its subtasks along). Deleting a parent deletes its subtasks (`⌘Z` brings them back); ticking a parent ticks them all. In Sort, Plan and Today each subtask is its own thought, filed and ticked off separately, with a `↳ parent` line saying where it came from. The parent itself drops out of those screens. A subtask added to a thought that was already filed starts in the same place. One level deep only.

Sort and Plan share the same navigation. Got one wrong? `⌫` brings back the last thing you filed (press again to go further back) and `⌘Z` undoes it. A line under the card always shows what just happened. `↑ ↓` walk the whole list, `← →` jump between quadrants or days, `⇧` + arrows move the thought itself (to another quadrant, or a day earlier/later), and the selected thought is highlighted where it lives. Filing a thought you moved to takes you back to where you left the queue. `↵` keeps the selected thought as it is and moves on.

`⌘F` searches every command, shortcut and thought. On every screen, typing a letter that isn't a shortcut opens search with that letter, Things 3 style. `?` shows every shortcut.

**Ordering by hand.** Sort's quadrants, Plan's days and Today's sessions list their thoughts quickest first. `⌥↑` / `⌥↓` overrides that: it moves the selected thought up or down its own list (in Today, within its session; `⇧←` `⇧→` still change session). The first move fixes the list's current order, so only the thought you moved changes place, and anything added later joins the end, sorted automatically. Each screen keeps its own order, a thought that moves to another quadrant, day or session starts fresh there, and `⌘Z` undoes a move. `⌘F` then "back to the automatic order" puts everything back to quickest first. (Dump and Sort's unsorted queue were never automatic: they follow Dump order, which `⇧↑` `⇧↓` changes.)

**Starting the sorting over.** Forgot something, or want to redo it with a clear head? `⌘F` and type "start the sorting over" clears the priority, day, time and session of every open thought at once. The thoughts themselves stay (and finished ones stay in the Archive), they all go back to Dump unsorted, and `⌘Z` puts everything back.

**Giving a thought a day.** `⌘S` on any screen (Dump, Sort, Plan, Today) with a thought selected opens *When*, like Things 3. Type the day the way you'd say it and press `↵`; it applies at once and `⌘Z` undoes it. `↑` `↓` pick between readings. It understands `today`, `tomorrow`, `tue` or `next friday` (the upcoming one), `weekend`, `next week`, `next month`, `later`, `in 2 days` / `two days` / `3d` / `+3`, `a week` / `2 weeks`, `in 3 months`, dates as `24/12`, `24/12/2026`, `2026-12-24` (day first), `15 oct`, `oct 15 2027`, and a bare `22` for the next 22nd. Half-typed words offer every match (`t` gives Today, Tomorrow, Tuesday, Thursday). `none` clears the day. On a thought with subtasks it sets them all. In Plan it files like `1`–`8`, so `⌫` brings it back.

**The same keys everywhere.** `⌘K` ticks the selected thing off (in the Archive it reopens it), `⌘S` gives it a day, `⌘E` edits its text in place (also `E` on Today, as in Sort and Plan; `↵` saves, `esc` cancels), `⌘⌫` deletes it, `⌘Z` undoes, `⌘F` searches (finished thoughts have their own Archive section below the open ones), `↑` `↓` move. They behave the same on Dump, Sort, Plan, Today and the Archive, so what you learn on one screen works on the others. Bare letters are only ever used for things specific to one screen (`Q W A S` in Sort, `F` in Today) and never in Dump, where nothing should get in the way of thinking.

**Export and import.** `⌘⇧S` saves everything to a `.json` file; `⌘O` (or dropping a file anywhere on the window) imports one. An export carries it all: subtasks, times, where each thought is filed and planned. Importing only adds: thoughts already here (same id) stay as they are, `⌘Z` takes the whole import back, and a toast says how many were new. Importing a Markdown or text list works too, one thought per line, with headings skipped and `[x]` kept as done. Markdown is lossy though, so use the `.json` to move between instances.

When the week is planned, export from search: copy as Markdown, download an `.ics` calendar file, or send to Things 3.

## Develop

```sh
pnpm install
pnpm dev        # http://localhost:5173
pnpm test       # unit tests (vitest)
pnpm lint       # oxlint
pnpm build      # type-check + production build into dist/
```

## Where the data lives

In your browser's `localStorage` under `composure:v1`. Nothing is sent anywhere, so a public deploy exposes the app but not your thoughts. The flip side: clearing site data wipes it, and it doesn't sync between devices. Use "Download backup" in search if that worries you.

## Deploy to Cloudflare Pages

It's a static site. Either connect the repo in the Cloudflare dashboard with:

- Build command: `pnpm build`
- Build output directory: `dist`

or deploy from your machine:

```sh
pnpm build
npx wrangler pages deploy dist --project-name composure
```

`public/_headers` sets long-lived caching for hashed assets and a few security headers.

## Code map

| Path | What's there |
| --- | --- |
| `src/keyboard/commands.ts` | Every command and its keys. Drives the key handler, the palette and the shortcut sheet, so a new shortcut is one entry here. |
| `src/keyboard/useGlobalKeys.ts` | The single window key listener: commands first, then type-to-add (Dump) or type-to-search (Sort, Plan). |
| `src/keyboard/feedback.ts` | Keycap flashes and the keystroke overlay. |
| `src/state/actions.ts` | All state changes, with undo history. |
| `src/lib/` | Pure logic: dates, fuzzy search, queues, Markdown/iCalendar/Things export. |
| `src/lib/selectors.ts` | Which thoughts each screen shows, including what counts as archived (`archivedIds`, `live`). |
| `src/modes/` | The screens. |

## Notes

- React `StrictMode` is off on purpose. Its dev-only double effects leave motion's exit animations stuck, which makes removed rows linger in `pnpm dev`.
- Letter shortcuts use physical key positions (`KeyQ`), so `Q W A S` keeps its 2×2 shape on non-QWERTY layouts.

# Composure

A keyboard-first place to empty your head when there's too much in it, sort what came out, and give the important things a day.

Four screens, one flow. `⌥←` / `⌥→` step between them; `⇧1`–`⇧4` jump straight there. The Archive sits off to the side (see the end of the list). `?` on any screen explains the core features and lists every key.

**The rule of the keys.** Letters always type: on every screen a letter opens search with it, so no command is a bare letter. Things happen on digits, arrows, `Space`, `↵`, `⌫`, `-` and `=`, and `⌘` / `⌥` chords. `⌘` chords work the same on every screen.

1. **Dump** (`⇧1`). `Space` starts a new thought. `↵` saves the line and opens the next one; double-tap `⇧` (or `esc`) to finish. `⌥↑ ⌥↓` reorder. Paste a list and every line becomes a thought. `↵` on a selected thought edits its text in the list.

   **Dump clears itself.** A thought with a priority, a day and a time has been dealt with, so Dump tucks it away (it's still in Sort, Plan and Today). A footer line, "show 3 sorted and planned", brings them back. Dropped thoughts count as dealt with: they need no day or time. To deal with what's left, select a thought and press `→`: the thought sheet opens on the first thing missing (priority, then day, then time). The numbers pick (the same numbers as Sort and Plan), each pick applies at once and moves on to what's still missing, and the sheet closes when nothing is. `⌘Z` undoes a pick. On a thought with subtasks it fills in every subtask that lacks it.
2. **Sort** (`⇧2`). One thought at a time goes into an Eisenhower matrix. `1 2 3 4` file it under Do, Schedule, Someone else's and Let go and move straight to the next one, no confirm step; `0` puts it back to unsorted. `Space` skips one. Clicking a quadrant's heading files the card there. Most of your own tasks are Do or Schedule. The bottom row is for what isn't really yours: *Someone else's* is their deadline landing on you (hand it off, do it fast, or say no), and *Let go* is guilt, habit or a "should" you don't want. Writing it down was enough. Each card in the quadrants shows its day, so you can see what's already planned.
3. **Plan** (`⇧3`). Slot what matters into the next seven days. `1`–`7` picks a day, `8` is "later", `0` unplans. Again, it applies at once. Each day's badge shows how much time it holds; empty days get narrower so the busy ones have room. A day split into work sessions shows them by name. Late thoughts wait at the front of the queue to be given a new day (Today's column says how many).

4. **Today** (`⇧4`). Only today's plan plus anything late, split into work sessions. `⌘K` (or a click on the `[ ]` box) ticks a task off and moves to the next one; `⌥T` means "not today" (moves it to tomorrow). `Space` adds a task right there: type it and `↵` puts it in today's plan and opens the next line. To say what it is first, `↓` moves into the options under the line: `←` `→` walk along a row (quadrant, then time), `↑` `↓` change row, `↵` picks the highlighted one (again to clear it) and `⇧↵` adds the task. Paste a list to add several at once.

   **Work sessions.** `1`–`9` move the selected task into that session, and `⇧←` / `⇧→` into the previous or next one (past the last one makes a new one). Sessions keep their number all day, so the second session is still the second once the first is done. Click a session's name, or press `⌥R`, to name it ("Deep work", "Admin"); the name shows on Today, in Plan's column for the day and on the thought sheet. `⌥F` starts the session the selected task is in: it works through that session's open tasks, each for as long as its time estimate (25 minutes if it has none), and one clock runs down from the total. While it runs, Today turns into a focus view: the task on the clock fills the screen with its own countdown, and the rest of the list, the top bar and the key hints fade almost to nothing. When its time is up the next task takes over, and you get a browser notification (the tab shows the session too: the time left in its title and the minutes left drawn in its icon). Nothing is ticked off for you: `⌘K` the ones you finish, which moves straight on to the next with its full time. `=` and `-` give the task you're on more or less time, live. When the last window closes, anything still open is marked; tick off what you did, give the rest the time they still need, and press `⌥F` to carry on with a new round over what's left, or `esc` to stop there. `⌥F` stops a session at any point, and it survives a reload. Ticked one off by mistake? `⌘Z` puts it back on the clock with the time it had left.

   **Something came up.** While a session runs, `⌥P` asks "What came up?" and `1`–`4` start a bathroom break (5m), a break (10m), a call (open-ended) or a chore (15m) at once; or type it ("hang laundry 15m", "call mum", "lunch 1h") and `↵`. The clock on your task is held, so none of its time is lost, and everything after it, including the "done by" time, slides later by however long you were away. A timed one tells you when it's up but waits: `↵` (or `⌥P` again) says you're back and the task carries on from where it stopped.

   The line under the progress bar says how much time is left and when you'd be done if you started now ("start now" is a button, or press `⌥F`).

5. **Archive** (`⇧5`, or search "archive": it's the first result). It isn't a tab. `⌫` or `esc` takes you back to the screen you came from. Finished things rest here. Tick something off, anywhere, and it leaves Dump, Sort, Plan and Today at once and appears here under the day you did it. Today's progress bar still counts it. `↑` `↓` walk the list, `⌘K` reopens one (it comes back open, and late if its day has passed), `⌘⌫` deletes it. A done subtask moves on its own; its parent follows once all its subtasks have. Nothing is copied or moved in your data: it's just whether the thought is done, so `⌘Z` works here too. Things marked `[x]` in an imported file go straight to the archive.

**The thought sheet.** `↵` on Sort, Plan, Today and the Archive, and `⌘E` on every screen, opens everything about the selected thought in one place: its text, priority, day, time and session. `↑` `↓` move between the rows and the numbers pick (`0` clears), the same numbers each screen uses, and every pick applies at once with `⌘Z` to undo it and a receipt at the bottom. Type a letter and the day row reads it the way you'd say a day ("fri", "next week", "in 2 days"); `⌘S` on any screen opens the sheet straight on the day, ready to type one. `-` `=` nudge the time. `⌘K` ticks it off and `⌘⌫` deletes it from there too. With several thoughts picked, the sheet changes them all; on a thought with subtasks, it changes its open subtasks. Clicking any tag (a priority, a day, a time) opens the sheet on that row for that thought.

**Time.** Say how long each thing takes. `⌥1`–`⌥6` set 5m · 15m · 30m · 1h · 2h · 4h, and `=` and `-` step the estimate longer or shorter, on Dump, Sort, Plan and Today alike. Within each quadrant, Sort, Plan and Today list the quickest first and anything without an estimate last, so you build momentum and the list shrinks fast. Quadrants and days show their totals, and Today adds it up: planned, done, left, and when you'd be finished if you started now.

**Subtasks.** Break a thought down in Dump. While typing, `⇥` nests the line under the one above and `⇧⇥` pops it back out; `↵` keeps adding subtasks until you un-nest. `⌥↵` saves the line and opens a subtask under it. On a selected thought, `⌥↵` adds a subtask, `⇥` / `⇧⇥` nest or un-nest it, and `⌥↑ ⌥↓` move it (a parent takes its subtasks along). Deleting a parent deletes its subtasks (`⌘Z` brings them back); ticking a parent ticks them all. In Sort, Plan and Today each subtask is its own thought, filed and ticked off separately, with a `↳ parent` line saying where it came from. The parent itself drops out of those screens. A subtask added to a thought that was already filed starts in the same place. One level deep only.

Sort and Plan share the same navigation. Got one wrong? `⌫` brings back the last thing you filed (press again to go further back) and `⌘Z` undoes it. A line beside the progress bar always shows what just happened. `↑ ↓` walk the whole list, `← →` jump between quadrants or days, `⇧←` `⇧→` move the thought itself to the next quadrant or day (`⌘↑` `⌘↓` between Sort's rows), and the selected thought is highlighted where it lives. Filing a thought you moved to takes you back to where you left the queue. `Space` keeps the selected thought as it is and moves on.

**Search.** `⌘F`, or typing any letter on any screen, searches every command, shortcut and thought. Finished thoughts have their own Archive section below the open ones. Picking a thought that's on the screen you're on selects it there; one that isn't (planned for Friday while you're on Today, or tucked away in Dump) opens in the thought sheet right where you are.

**Picking several.** On Dump, Sort, Plan and Today, `⇧↑` / `⇧↓` highlight a run of thoughts, like selecting text (`⇧↑` back to shrink it). Then the keys you'd use on one act on all of them: `⌘E` opens them all in the thought sheet, in Today `1`–`9` and `⇧←` `⇧→` move them between sessions and `⌥T` sends them to tomorrow, in Plan `1`–`8` or `⇧←` `⇧→` give them a day, in Sort `1`–`4`, `⇧←` `⇧→` and `⌘↑` `⌘↓` file or slide them between quadrants. `-` `=` and `⌥1`–`⌥6` set their time, `⌘S` gives them a day, `⌘K` ticks them off, `⌘⌫` deletes them, and `⌘Z` undoes the lot in one step. Moving the selection normally, changing screen or `esc` goes back to one.

**Ordering by hand.** Sort's quadrants, Plan's days and Today's sessions list their thoughts quickest first. `⌥↑` / `⌥↓` overrides that: it moves the selected thought up or down its own list (in Today, within its session; `⇧←` `⇧→` still change session). The first move fixes the list's current order, so only the thought you moved changes place, and anything added later joins the end, sorted automatically. Each screen keeps its own order, a thought that moves to another quadrant, day or session starts fresh there, and `⌘Z` undoes a move. `⌘F` then "back to the automatic order" puts everything back to quickest first. In Dump `⌥↑` / `⌥↓` move the thought itself; Dump and Sort's unsorted queue were never automatic.

**Starting the sorting over.** Forgot something, or want to redo it with a clear head? `⌘F` and type "start the sorting over" clears the priority, day, time and session of every open thought at once. The thoughts themselves stay (and finished ones stay in the Archive), they all go back to Dump unsorted, and `⌘Z` puts everything back.

**The same keys everywhere.** `⌘K` ticks the selected thing off (in the Archive it reopens it), `⌘E` opens it in the thought sheet, `⌘S` gives it a day, `⌘⌫` deletes it, `⌘Z` undoes, `⌘F` searches, `↑` `↓` move, `⇧↑` `⇧↓` pick several and `⌥↑` `⌥↓` reorder. They behave the same on Dump, Sort, Plan, Today and the Archive, so what you learn on one screen works on the others. Each screen's own keys are digits for its numbered boxes (Sort's quadrants, Plan's days, Today's sessions), `Space`, and a few `⌥` chords on Today.

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

In your browser's `localStorage` under `composure:v1`. Nothing is sent anywhere, so a public deploy exposes the app but not your thoughts. The flip side: clearing site data wipes it, and it doesn't sync between devices. Use "Export everything to a file" in search if that worries you.

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
| `src/keyboard/commands.ts` | Every command and its keys. Drives the key handler, search and the Keys page of help, so a new shortcut is one entry here. `commands.test.ts` guards the rule that no bare letter is a command. |
| `src/keyboard/useGlobalKeys.ts` | The single window key listener: commands first, then type-to-search. |
| `src/keyboard/feedback.ts` | Keycap flashes and the keystroke overlay. |
| `src/state/actions.ts` | All state changes, with undo history, including the thought sheet's. |
| `src/state/day.ts` | Keeps "today" right at midnight and when the tab comes back. |
| `src/lib/` | Pure logic: dates, fuzzy search, queues, the sheet's fields (`fields.ts`), Markdown/iCalendar/Things export. |
| `src/lib/selectors.ts` | Which thoughts each screen shows, including what counts as archived (`archivedIds`, `live`). |
| `src/components/ThoughtSheet.tsx` | The one editor for a thought, opened from every screen. |
| `src/components/Help.tsx` | `?`: how it works, and every key. |
| `src/modes/` | The screens. |

## Notes

- React `StrictMode` is off on purpose. Its dev-only double effects leave motion's exit animations stuck, which makes removed rows linger in `pnpm dev`.
- Digit and letter shortcuts use physical key positions (`Digit1`, `KeyF`), so `⌥F` and the numbered boxes work the same on any keyboard layout.
- `⌥` chords avoid the letters macOS turns into accents (`⌥E`, `⌥I`, `⌥N`, `⌥U`), which arrive as dead keys; that's why something-came-up is `⌥P`.

# Composure

A keyboard-first place to empty your head when there's too much in it, sort what came out, and give the important things a day.

Four screens, one flow. `⌥←` / `⌥→` step between them; `⇧1`–`⇧4` jump straight there.

1. **Dump** (`⇧1`). Start typing anywhere. `↵` saves the line and opens the next one; double-tap `⇧` (or `esc`) to finish. `⇧↑ ⇧↓` reorder. Paste a list and every line becomes a thought.
2. **Sort** (`⇧2`). One thought at a time goes into an Eisenhower matrix. `Q W A S` files it and moves straight to the next one, no confirm step.
3. **Plan** (`⇧3`). Slot what matters into the next seven days. `1`–`7` picks a day, `8` is "later", `0` unplans. Again, it applies at once.

4. **Today** (`⇧4`). Only today's plan plus anything overdue. `X` ticks it off and moves to the next open thing, `T` means "not today" (moves it to tomorrow), `F` starts a focus block as long as the thought's time estimate (25 minutes if it has none) that shows in the top bar on every screen. `N` adds a task right there: type it and `↵` puts it in today's plan and opens the next line. To say what it is first, `↓` moves into the options under the line: `←` `→` walk along a row (quadrant, then time), `↑` `↓` change row, `↵` picks the highlighted one (again to clear it) and `⇧↵` adds the task. Typing or `⌫` takes you back to the text. What you picked stays picked for the next task and can be clicked too; anything unpicked can be set later like any other task. Paste a list to add several at once. A clarity line ("14 out of your head · 4 let go · 3 for today") shows how much lighter things got.

**Time.** Say how long each thing takes. In Sort, `1`–`6` set 5m · 15m · 30m · 1h · 2h · 4h on the card you're looking at (it stays put; `Q W A S` still files it). In Sort, Plan and Today, `=` and `-` step the estimate longer or shorter. Within each quadrant, Sort, Plan and Today list the quickest first and anything without an estimate last, so you build momentum and the list shrinks fast. Because the order is automatic, there is no manual reordering in Plan or Today. Quadrants and days show their totals, and Today adds it up: planned, done, left, and when you'd be finished if you started now.

**Subtasks.** Break a thought down in Dump. While typing, `⇥` nests the line under the one above and `⇧⇥` pops it back out; `↵` keeps adding subtasks until you un-nest. `⌥↵` saves the line and opens a subtask under it. On a selected thought, `⌥↵` adds a subtask, `⇥` / `⇧⇥` nest or un-nest it, and `⇧↑ ⇧↓` move it (a parent takes its subtasks along). Deleting a parent deletes its subtasks (`⌘Z` brings them back); ticking a parent ticks them all. In Sort, Plan and Today each subtask is its own thought, filed and ticked off separately, with a `↳ parent` line saying where it came from. The parent itself drops out of those screens. A subtask added to a thought that was already filed starts in the same place. One level deep only.

Sort and Plan share the same navigation. Got one wrong? `⌫` brings back the last thing you filed (press again to go further back) and `⌘Z` undoes it. A line under the card always shows what just happened. `↑ ↓` walk the whole list, `← →` jump between quadrants or days, `⇧` + arrows move the thought itself (to another quadrant, or a day earlier/later), and the selected thought is highlighted where it lives. Filing a thought you moved to takes you back to where you left the queue. `↵` keeps the selected thought as it is and moves on.

`⌘K` searches every command, shortcut and thought. In Sort and Plan, typing any letter that isn't a shortcut opens search with that letter, Things 3 style. `?` shows every shortcut.

**Export and import.** `⌘S` saves everything to a `.json` file; `⌘O` (or dropping a file anywhere on the window) imports one. An export carries it all: subtasks, times, where each thought is filed and planned. Importing only adds: thoughts already here (same id) stay as they are, `⌘Z` takes the whole import back, and a toast says how many were new. Importing a Markdown or text list works too, one thought per line, with headings skipped and `[x]` kept as done. Markdown is lossy though, so use the `.json` to move between instances.

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
| `src/modes/` | The three screens. |

## Notes

- React `StrictMode` is off on purpose. Its dev-only double effects leave motion's exit animations stuck, which makes removed rows linger in `pnpm dev`.
- Letter shortcuts use physical key positions (`KeyQ`), so `Q W A S` keeps its 2×2 shape on non-QWERTY layouts.

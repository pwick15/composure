# Composure

A keyboard-first place to empty your head when there's too much in it, sort what came out, and give the important things a day.

Three modes, one flow:

1. **Dump** (`⇧1`). Start typing anywhere. `↵` saves the line and opens the next one. Paste a list and every line becomes a thought.
2. **Sort** (`⇧2`). One thought at a time goes into an Eisenhower matrix. `Q W A S` (or `1 2 3 4`) files it and moves straight to the next one, no confirm step.
3. **Plan** (`⇧3`). Slot what matters into the next seven days. `1`–`7` picks a day, `8` is "later", `0` unplans. Again, it applies at once.

Sort and Plan share the same navigation. Got one wrong? `⌫` brings back the last thing you filed (press again to go further back) and `⌘Z` undoes it. A line under the card always shows what just happened. `↑ ↓` walk the whole list, `← →` jump between quadrants or days, and the selected thought is highlighted where it lives. Filing a thought you moved to takes you back to where you left the queue. `↵` keeps the selected thought as it is and moves on.

`⌘K` searches every command, shortcut and thought. In Sort and Plan, typing any letter that isn't a shortcut opens search with that letter, Things 3 style. `?` shows every shortcut.

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

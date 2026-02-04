# OBSD Dashboard Plugin

A modular, adapter-based dashboard plugin for Obsidian. UI widgets are fully decoupled from the data engine via `IDataSource`, so swapping data sources only requires a new service.

## Highlights
- Adapter pattern: UI never touches Dataview directly.
- Widget registry: add new widgets without touching the dashboard core.
- Editable grid: drag/resize widgets with collision resolution.
- In-dashboard editor: add/configure widgets directly on the dashboard.

## Requirements
- Obsidian desktop
- Dataview installed and enabled (currently the only data source)

## Structure
- `src/interfaces` — stable contracts (e.g. `IDataSource`).
- `src/services` — data adapters (Dataview implementation lives here).
- `src/ui` — React view, widgets, registry, settings UI.

## Development
```bash
npm install
npm run dev
```
`npm run dev` watches and builds `main.js` in the repo root.

## Build
```bash
npm run build
```
Then copy `manifest.json`, `main.js`, and `styles.css` into your vault’s plugin folder.

## Using the Dashboard
1. Enable the plugin in **Settings → Community plugins**.
2. Run the command **“Open Dashboard”**.
3. Click the **three dots** menu on the dashboard view and choose **Edit dashboard**.
4. Use the dashed **+ Add widget** tile to add new widgets.
5. Use the **Edit** button in a widget header to configure its query.

## Task Widget (tasks from tagged files)
The Task widget queries Dataview pages and shows tasks inside those files. This is perfect for “tasks from files tagged X”.

**Example note:**
```markdown
---
tags: [project]
---

- [ ] Prepare slides
- [ ] #urgent Send agenda
```

**Easy mode config (recommended):**
- **Query mode:** Easy (Tags)
- **Tags:** `project`
- **Show completed:** false

This shows tasks only from files tagged `#project`.

**Raw Dataview query (advanced):**
- **Query mode:** Raw Dataview
- **Raw query:** `#project`

You can switch between **Easy** and **Source** using the buttons next to **Close** in the widget header while editing.

**Check off tasks:**
Click the checkbox in the widget. The plugin toggles the checkbox in the underlying markdown file.

## Pie/Line Chart Widgets
These widgets group Dataview pages and count them by tag, folder, or a frontmatter key.

**Example (tags):**
- **Raw Dataview query:** *(empty)* — includes all pages
- **Group by:** `tag`

This produces a chart comparing how many files carry each tag. You can also filter pages, e.g. `#project`, to chart only that subset.

## Settings
- **Open dashboard on startup** — automatically opens the dashboard view when Obsidian starts.
- **Default task query mode** — sets Easy (Tags) or Source (Raw) for new task widgets.

## Notes
- If Dataview is not installed, widgets show empty results instead of crashing.

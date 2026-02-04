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

## Install from GitHub (keep this section until the official store)
Until this plugin is published in the official Obsidian store, install it directly from GitHub.

**Option A: Prebuilt release (easiest, if available)**
1. Download the latest release `.zip` from GitHub.
2. Extract it.
3. Copy the folder to your vault: `.obsidian/plugins/obsd-dashboard/`
4. The folder must contain:
   - `manifest.json`
   - `main.js`
   - `styles.css`

**Option B: Build from source**
1. Download the repo as a `.zip` or clone it.
2. Run:
```bash
npm install
npm run build
```
3. Copy `manifest.json`, `main.js`, and `styles.css` into:
   `.obsidian/plugins/obsd-dashboard/`

Then enable the plugin in **Settings → Community plugins**.

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
1. Run the command **“Open Dashboard”**.
2. Click the **three dots** menu on the dashboard view and choose **Edit dashboard**.
3. Use the dashed **+ Add widget** tile to add new widgets.
4. Use the **Edit** button in a widget header to configure its filters/series.

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

**Filter config (recommended):**
- **Filter 1 tags:** `project`
- **Filter 1 folders:** *(optional)* `Projects/2026`
- **Show completed:** false

This shows tasks only from files tagged `#project`. If you also set a folder, it becomes “tags in folder”.  
Add multiple filters to combine them with OR.

**Check off tasks:**
Click the checkbox in the widget. The plugin toggles the checkbox in the underlying markdown file.

## Pie/Line Chart Widgets
These widgets can either **group pages** by a field (classic mode) or run **custom series filters** (new mode).

**Group by (classic):**
- **Chart data mode:** Group by field
- **Filter tags/folders:** *(optional)* — includes all pages when empty
- **Group by:** `tag`

This produces a chart comparing how many files carry each tag. You can also filter pages, e.g. `#project`, to chart only that subset.

**Series mode (custom filters):**
- **Chart data mode:** Series (Filters)
- Each series can count **Pages** or **Tasks**

Example series:
- Series 1: Filter tags `studium`, count `tasks`
- Series 2: Filter tags `personal`, count `tasks`

## Settings
- **Open dashboard on startup** — automatically opens the dashboard view when Obsidian starts.

## Notes
- If Dataview is not installed, widgets show empty results instead of crashing.

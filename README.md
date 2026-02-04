# OBSD Dashboard

A dashboard view for Obsidian with draggable widgets and Dataview-powered data.

## How to use
1. Run the command **“Open Dashboard”**.
2. Click the **three dots** menu and choose **Edit dashboard**.
3. Use the dashed **+ Add widget** tile to add widgets.
4. Click **Edit** on a widget to configure it.

## Task widget (tasks from tagged files)
The Task widget shows tasks found inside files that match your filters.

Example note:
```markdown
---
tags: [project]
---

- [ ] Prepare slides
- [ ] #urgent Send agenda
```

Recommended filter:
- **Filter 1 tags:** `project`
- **Filter 1 folders:** *(optional)* `Projects/2026`

This shows tasks only from files tagged `#project`. If you add a folder, it becomes “tags in folder”.
Add multiple filters to combine them with OR.

Check off tasks by clicking the checkbox in the widget. The plugin updates the markdown file.

## Pie/Line chart widgets
Charts can either **group files** by a field or use **custom series filters**.

**Group by (simple mode)**
- **Chart data mode:** Group by field
- **Filter tags/folders:** optional
- **Group by:** Tag / File / Folder

This lets you compare how many files match each group.

**Series mode (custom filters)**
- **Chart data mode:** Series (Filters)
- Each series can count **Files** or **Tasks**

Example series:
- Series 1: Filter tags `studium`, count `tasks`
- Series 2: Filter tags `personal`, count `tasks`

## Settings
- **Open dashboard on startup** — automatically opens the dashboard when Obsidian starts.

## Notes
- Dataview must be installed and enabled. Without it, widgets show empty results.

# Testing the Plugin in Obsidian

## Do I need to compress/zip it?
No. Obsidian loads plugins from a folder, not from a zip. You just copy the built files into a plugin folder inside your vault.

## Build the plugin
Obsidian runs JavaScript, so TypeScript/React must be compiled first.

```bash
npm install
npm run build
```
This creates `main.js` in the repo root.

## Install into your vault
1. Open your vault folder.
2. Go to `.obsidian/plugins/`.
3. Create a folder named `obsd-dashboard`.
4. Copy these files into that folder:
   - `manifest.json`
   - `main.js`
   - `styles.css`

No bundling/packing is needed beyond the build step.

## Enable the plugin in Obsidian
1. In Obsidian, go to **Settings → Community plugins**.
2. Make sure community plugins are enabled.
3. Find **Dashboard Plugin** in the list and enable it.
4. Run the command **“Open Dashboard”**.

## Editing the dashboard
1. Click the **three dots** menu in the dashboard view.
2. Select **Edit dashboard**.
3. A dashed **+ Add widget** tile appears at the bottom.
4. Use **Edit** on a widget to adjust its Dataview query.

## Open on startup
Go to **Settings → Dashboard** and enable **Open dashboard on startup** if you want the view to open automatically when Obsidian starts.

## Default task mode
In **Settings → Dashboard**, set **Default task query mode** to choose whether new task widgets start in Easy (Tags) or Source (Raw) mode.

## Development workflow (optional)
If you want live rebuilding:
```bash
npm run dev
```
Then re-copy `main.js` into the plugin folder after each rebuild, or replace the plugin folder with a symlink to this repo and keep `main.js` in the repo root.

## Notes
- Dataview must be installed and enabled. The dashboard will show empty widgets without it.
- Drag/resize is only available in edit mode.

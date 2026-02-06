import { Plugin } from "obsidian";
import type { DashboardLayout } from "./src/ui/types";
import { DashboardSettingsTab } from "./src/ui/settings/DashboardSettingsTab";
import { cloneLayout, isDashboardLayout, normalizeLayout, resolveCollisions } from "./src/ui/layout/layoutUtils";
import { DEFAULT_TIME_PRESETS, cloneTimePresets, normalizeTimePresets, TimePreset } from "./src/ui/timePresets";
import { DataviewService } from "./src/services/DataviewService";
import { IDataSource } from "./src/interfaces/IDataSource";
import { DashboardItemView, VIEW_TYPE_DASHBOARD } from "./src/ui/DashboardItemView";

interface DashboardPluginData {
  layout: DashboardLayout;
  editable: boolean;
  openOnStartup: boolean;
  timePresets: TimePreset[];
}

const DEFAULT_LAYOUT: DashboardLayout = {
  columns: 4,
  rowHeight: 90,
  gap: 12,
  widgets: [
    {
      id: "tasks-today",
      type: "task-list",
      title: "Tasks",
      x: 0,
      y: 0,
      w: 2,
      h: 3,
      filters: [{ tags: "", folders: "" }],
      showCompleted: false,
      limit: 10,
    },
    {
      id: "pages-by-tag",
      type: "pie-chart",
      title: "Pages by tag",
      x: 2,
      y: 0,
      w: 2,
      h: 3,
      query: "",
      groupBy: "tag",
      limit: 6,
    },
  ],
};

const DEFAULT_DATA: DashboardPluginData = {
  layout: cloneLayout(DEFAULT_LAYOUT),
  editable: false,
  openOnStartup: false,
  timePresets: cloneTimePresets(DEFAULT_TIME_PRESETS),
};

export default class DashboardPlugin extends Plugin {
  private data!: DashboardPluginData;
  private dataSource!: IDataSource;

  async onload(): Promise<void> {
    const loaded = (await this.loadData()) as DashboardPluginData | null;
    this.data = this.normalizeData(loaded);
    this.dataSource = new DataviewService(this.app);

    this.registerView(
      VIEW_TYPE_DASHBOARD,
      (leaf) => new DashboardItemView(leaf, this)
    );

    this.addSettingTab(new DashboardSettingsTab(this.app, this));

    this.addCommand({
      id: "open-dashboard",
      name: "Open dashboard",
      callback: () => {
        void this.activateView();
      },
    });

    this.app.workspace.onLayoutReady(() => {
      const ready = this.waitForDataviewReady();
      void ready.then(() => {
        this.refreshViews();
      });
      if (this.data.openOnStartup) {
        void ready.finally(() => {
          const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_DASHBOARD)[0];
          if (existing) {
            this.app.workspace.revealLeaf(existing);
            this.refreshViews();
            return;
          }
          void this.activateView();
          this.refreshViews();
        });
      }
    });
  }

  onunload(): void {}

  getLayout(): DashboardLayout {
    return this.data.layout;
  }

  async setLayout(layout: DashboardLayout): Promise<void> {
    const normalized = normalizeLayout(layout);
    const resolved = resolveCollisions(normalized);
    this.data.layout = resolved;
    await this.saveData(this.data);
    this.refreshViews();
  }

  getDataSource(): IDataSource {
    return this.dataSource;
  }

  getEditable(): boolean {
    return this.data.editable;
  }

  async setEditable(value: boolean): Promise<void> {
    this.data.editable = value;
    await this.saveData(this.data);
    this.refreshViews();
  }

  async toggleEditable(): Promise<void> {
    await this.setEditable(!this.data.editable);
  }

  async resetLayout(): Promise<void> {
    await this.setLayout(cloneLayout(DEFAULT_LAYOUT));
  }

  getOpenOnStartup(): boolean {
    return this.data.openOnStartup;
  }

  async setOpenOnStartup(value: boolean): Promise<void> {
    this.data.openOnStartup = value;
    await this.saveData(this.data);
  }

  getTimePresets(): TimePreset[] {
    return this.data.timePresets;
  }

  async setTimePresets(presets: TimePreset[]): Promise<void> {
    this.data.timePresets = normalizeTimePresets(presets);
    await this.saveData(this.data);
    this.refreshViews();
  }

  async activateView(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_DASHBOARD)[0];
    if (existing) {
      this.app.workspace.revealLeaf(existing);
      return;
    }

    const leaf = this.app.workspace.getLeaf(true);
    await leaf.setViewState({ type: VIEW_TYPE_DASHBOARD, active: true });
    this.app.workspace.revealLeaf(leaf);
  }

  private async waitForDataviewReady(
    timeoutMs = 10000,
    intervalMs = 250
  ): Promise<boolean> {
    if (this.hasDataviewApi()) return true;

    const start = Date.now();
    return new Promise((resolve) => {
      const tick = () => {
        if (this.hasDataviewApi()) {
          resolve(true);
          return;
        }
        if (Date.now() - start >= timeoutMs) {
          resolve(false);
          return;
        }
        setTimeout(tick, intervalMs);
      };

      tick();
    });
  }

  private hasDataviewApi(): boolean {
    const plugins = (this.app as unknown as {
      plugins?: { plugins?: Record<string, { api?: unknown }> };
    }).plugins?.plugins;
    return Boolean(plugins?.dataview?.api);
  }

  private normalizeData(loaded: DashboardPluginData | null): DashboardPluginData {
    const fallback = { ...DEFAULT_DATA, layout: cloneLayout(DEFAULT_LAYOUT) };
    if (!loaded) return fallback;

    const loadedLayout = isDashboardLayout(loaded.layout) ? loaded.layout : fallback.layout;

    const base = resolveCollisions(normalizeLayout(loadedLayout));

    return {
      layout: base,
      editable: typeof loaded.editable === "boolean" ? loaded.editable : fallback.editable,
      openOnStartup:
        typeof loaded.openOnStartup === "boolean" ? loaded.openOnStartup : fallback.openOnStartup,
      timePresets: normalizeTimePresets(loaded.timePresets),
    };
  }

  private refreshViews(): void {
    this.app.workspace.getLeavesOfType(VIEW_TYPE_DASHBOARD).forEach((leaf) => {
      const view = leaf.view;
      if (view instanceof DashboardItemView) {
        view.refresh();
      }
    });
  }
}

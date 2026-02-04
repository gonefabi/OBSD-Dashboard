import { ItemView, Menu, Plugin, WorkspaceLeaf } from "obsidian";
import * as React from "react";
import { createRoot, Root } from "react-dom/client";
import { DashboardView, DashboardLayout, TaskQueryMode } from "./src/ui/DashboardView";
import { DashboardSettingsTab } from "./src/ui/settings/DashboardSettingsTab";
import { cloneLayout, isDashboardLayout, normalizeLayout, resolveCollisions } from "./src/ui/layout/layoutUtils";
import { DataviewService } from "./src/services/DataviewService";
import { IDataSource } from "./src/interfaces/IDataSource";

const VIEW_TYPE_DASHBOARD = "obsd-dashboard-view";

interface DashboardPluginData {
  layout: DashboardLayout;
  editable: boolean;
  openOnStartup: boolean;
  defaultTaskQueryMode: TaskQueryMode;
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
      queryMode: "tags",
      tagFilter: "",
      showCompleted: false,
      limit: 10,
    },
    {
      id: "pages-by-tag",
      type: "pie-chart",
      title: "Pages by Tag",
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
  defaultTaskQueryMode: "tags",
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
      name: "Open Dashboard",
      callback: () => this.activateView(),
    });

    if (this.data.openOnStartup) {
      this.app.workspace.onLayoutReady(() => {
        void this.activateView();
      });
    }
  }

  onunload(): void {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_DASHBOARD);
  }

  getLayout(): DashboardLayout {
    return this.data.layout;
  }

  async setLayout(layout: DashboardLayout): Promise<void> {
    const normalized = normalizeLayout(layout);
    const resolved = resolveCollisions(normalized);
    this.data.layout = this.applyTaskQueryDefaults(resolved, this.data.defaultTaskQueryMode);
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

  getDefaultTaskQueryMode(): TaskQueryMode {
    return this.data.defaultTaskQueryMode;
  }

  async setDefaultTaskQueryMode(value: TaskQueryMode): Promise<void> {
    this.data.defaultTaskQueryMode = value;
    this.data.layout = this.applyTaskQueryDefaults(this.data.layout, value);
    await this.saveData(this.data);
    this.refreshViews();
  }

  async activateView(): Promise<void> {
    const leaf = this.app.workspace.getLeaf(true);
    await leaf.setViewState({ type: VIEW_TYPE_DASHBOARD, active: true });
    this.app.workspace.revealLeaf(leaf);
  }

  private normalizeData(loaded: DashboardPluginData | null): DashboardPluginData {
    const fallback = { ...DEFAULT_DATA, layout: cloneLayout(DEFAULT_LAYOUT) };
    if (!loaded) return fallback;

    const loadedLayout = isDashboardLayout(loaded.layout) ? loaded.layout : fallback.layout;

    const base = resolveCollisions(normalizeLayout(loadedLayout));

    const defaultTaskQueryMode =
      loaded?.defaultTaskQueryMode === "raw" || loaded?.defaultTaskQueryMode === "tags"
        ? loaded.defaultTaskQueryMode
        : fallback.defaultTaskQueryMode;

    return {
      layout: this.applyTaskQueryDefaults(base, defaultTaskQueryMode),
      editable: typeof loaded.editable === "boolean" ? loaded.editable : fallback.editable,
      openOnStartup:
        typeof loaded.openOnStartup === "boolean" ? loaded.openOnStartup : fallback.openOnStartup,
      defaultTaskQueryMode,
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

  private applyTaskQueryDefaults(
    layout: DashboardLayout,
    mode: TaskQueryMode = "tags"
  ): DashboardLayout {
    const widgets = layout.widgets.map((widget) => {
      if (widget.type !== "task-list") return widget;
      if (widget.queryMode) return widget;
      if (Array.isArray(widget.rawQueries) && widget.rawQueries.length > 0) {
        return { ...widget, queryMode: "raw" } as typeof widget;
      }
      if (widget.rawQuery || widget.filter) {
        return { ...widget, queryMode: "raw" } as typeof widget;
      }
      if (widget.tagFilter) {
        return { ...widget, queryMode: "tags" } as typeof widget;
      }
      return { ...widget, queryMode: mode } as typeof widget;
    });

    return { ...layout, widgets };
  }
}

class DashboardItemView extends ItemView {
  private plugin: DashboardPlugin;
  private root: Root | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: DashboardPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_DASHBOARD;
  }

  getDisplayText(): string {
    return "Dashboard";
  }

  getIcon(): string {
    return "layout-dashboard";
  }

  onPaneMenu(menu: Menu, source: string): void {
    super.onPaneMenu(menu, source);

    menu.addItem((item) => {
      const isEditing = this.plugin.getEditable();
      item.setTitle(isEditing ? "Exit edit mode" : "Edit dashboard");
      item.setIcon(isEditing ? "checkmark" : "pencil");
      item.onClick(() => {
        void this.plugin.toggleEditable();
      });
    });

    menu.addItem((item) => {
      item.setTitle("Reset dashboard layout");
      item.setIcon("rotate-ccw");
      item.onClick(() => {
        void this.plugin.resetLayout();
      });
    });
  }

  async onOpen(): Promise<void> {
    this.contentEl.empty();
    this.contentEl.addClass("obsd-dashboard-view");
    this.root = createRoot(this.contentEl);
    this.render();
  }

  async onClose(): Promise<void> {
    this.root?.unmount();
    this.root = null;
  }

  refresh(): void {
    this.render();
  }

  private render(): void {
    if (!this.root) return;

    this.root.render(
      React.createElement(DashboardView, {
        dataSource: this.plugin.getDataSource(),
        layout: this.plugin.getLayout(),
        editable: this.plugin.getEditable(),
        defaultTaskQueryMode: this.plugin.getDefaultTaskQueryMode(),
        onLayoutChange: (layout: DashboardLayout) => this.plugin.setLayout(layout),
      })
    );
  }
}

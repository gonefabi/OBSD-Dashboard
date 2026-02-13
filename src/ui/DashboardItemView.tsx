// Obsidian view wrapper for the dashboard React tree.
import { ItemView, Menu, WorkspaceLeaf } from "obsidian";
import * as React from "react";
import { createRoot, Root } from "react-dom/client";
import type { IDataSource } from "../interfaces/IDataSource";
import { DashboardView } from "./DashboardView";
import type { DashboardLayout } from "./types";
import type { TimePreset } from "./timePresets";

export const VIEW_TYPE_DASHBOARD = "obsd-dashboard-view";

export type DashboardPluginApi = {
  getDataSource(): IDataSource;
  getLayout(): DashboardLayout;
  getTimePresets(): TimePreset[];
  getEditable(): boolean;
  setLayout(layout: DashboardLayout): Promise<void>;
  toggleEditable(): Promise<void>;
  resetLayout(): Promise<void>;
};

export class DashboardItemView extends ItemView {
  private plugin: DashboardPluginApi;
  private root: Root | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: DashboardPluginApi) {
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
        this.plugin
          .toggleEditable()
          .catch((error) => console.error("Failed to toggle edit mode", error));
      });
    });

    menu.addItem((item) => {
      item.setTitle("Reset dashboard layout");
      item.setIcon("rotate-ccw");
      item.onClick(() => {
        this.plugin
          .resetLayout()
          .catch((error) => console.error("Failed to reset dashboard layout", error));
      });
    });
  }

  onOpen(): void {
    this.contentEl.empty();
    this.contentEl.addClass("obsd-dashboard-view");
    this.root = createRoot(this.contentEl);
    this.render();
  }

  onClose(): void {
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
        timePresets: this.plugin.getTimePresets(),
        editable: this.plugin.getEditable(),
        onLayoutChange: (layout: DashboardLayout) => {
          this.plugin
            .setLayout(layout)
            .catch((error) => console.error("Failed to persist dashboard layout", error));
        },
      })
    );
  }
}

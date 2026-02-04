import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type DashboardPlugin from "../../../main";

export class DashboardSettingsTab extends PluginSettingTab {
  declare containerEl: HTMLElement;
  private plugin: DashboardPlugin;

  constructor(app: App, plugin: DashboardPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    this.containerEl.empty();

    new Setting(this.containerEl)
      .setName("Default task query mode")
      .setDesc("Choose the default mode for new task widgets.")
      .addDropdown((dropdown) => {
        dropdown.addOption("tags", "Easy (Tags)");
        dropdown.addOption("raw", "Source (Raw)");
        dropdown.setValue(this.plugin.getDefaultTaskQueryMode());
        dropdown.onChange(async (value) => {
          const mode = value === "raw" ? "raw" : "tags";
          await this.plugin.setDefaultTaskQueryMode(mode);
        });
      });

    new Setting(this.containerEl)
      .setName("Open dashboard on startup")
      .setDesc("Automatically open the dashboard view when Obsidian starts.")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.getOpenOnStartup());
        toggle.onChange(async (value) => {
          await this.plugin.setOpenOnStartup(value);
        });
      });

    new Setting(this.containerEl)
      .setName("Reset dashboard layout")
      .setDesc("Restore the default widget layout.")
      .addButton((button) => {
        button.setWarning();
        button.setButtonText("Reset layout");
        button.onClick(async () => {
          await this.plugin.resetLayout();
          new Notice("Dashboard layout reset");
        });
      });
  }
}

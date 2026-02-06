import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import { TimePreset, isCalendarPreset } from "../timePresets";
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
      .setName("Open dashboard on startup")
      .setDesc("Automatically open the dashboard view when Obsidian starts.")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.getOpenOnStartup());
        toggle.onChange((value) => {
          void this.plugin.setOpenOnStartup(value);
        });
      });

    new Setting(this.containerEl)
      .setName("Reset dashboard layout")
      .setDesc("Restore the default widget layout.")
      .addButton((button) => {
        button.setWarning();
        button.setButtonText("Reset layout");
        button.onClick(() => {
          void this.plugin.resetLayout().then(
            () => new Notice("Dashboard layout reset"),
            (error) => console.error(error)
          );
        });
      });

    new Setting(this.containerEl).setName("Time range presets").setHeading();
    this.containerEl.createEl("p", {
      text:
        "Presets appear in all widgets. You can edit, delete, or add custom ranges.",
    });

    const presets = this.plugin.getTimePresets();

    const updatePresets = async (next: TimePreset[], rerender = false) => {
      await this.plugin.setTimePresets(next);
      if (rerender) this.display();
    };

    const updatePreset = async (index: number, patch: Partial<TimePreset>) => {
      const current = this.plugin.getTimePresets();
      const next = current.map((preset, idx) =>
        idx === index ? { ...preset, ...patch } : preset
      );
      await updatePresets(next);
    };

    presets.forEach((preset, index) => {
      const card = this.containerEl.createDiv();
      card.addClass("obsd-settings-card");

      new Setting(card)
        .setName("Label")
        .addText((text) => {
          text.setValue(preset.label ?? "");
          text.onChange((value) => {
            void updatePreset(index, { label: value || preset.id });
          });
        });

      const typeSetting = new Setting(card).setName("Type");
      typeSetting.addDropdown((dropdown) => {
        dropdown.addOption("all", "All time");
        dropdown.addOption("relative", "Relative (offset days)");
        dropdown.addOption("calendar", "Calendar range");
        dropdown.setValue(preset.type);
        dropdown.onChange((value) => {
          const nextType =
            value === "calendar" ? "calendar" : value === "relative" ? "relative" : "all";
          const patch: Partial<TimePreset> = { type: nextType };
          if (nextType === "calendar") {
            patch.calendar = isCalendarPreset(preset.calendar ?? "")
              ? preset.calendar
              : "this-week";
            patch.startOffsetDays = undefined;
            patch.endOffsetDays = undefined;
          } else if (nextType === "relative") {
            patch.calendar = undefined;
          } else {
            patch.calendar = undefined;
            patch.startOffsetDays = undefined;
            patch.endOffsetDays = undefined;
          }
          void updatePreset(index, patch);
          this.display();
        });
      });

      const extra = card.createDiv();

      const renderExtra = () => {
        extra.empty();

        if (preset.type === "relative") {
          const startSetting = new Setting(extra)
            .setName("Start offset (days)")
            .setDesc("0 = today, -1 = yesterday");
          startSetting.addText((text) => {
            text.inputEl.type = "number";
            text.setPlaceholder("-29");
            text.setValue(
              typeof preset.startOffsetDays === "number" ? String(preset.startOffsetDays) : ""
            );
            text.onChange((value) => {
              const nextValue = value.trim().length ? Number(value) : undefined;
              void updatePreset(index, {
                startOffsetDays: Number.isFinite(nextValue) ? nextValue : undefined,
              });
            });
          });

          const endSetting = new Setting(extra)
            .setName("End offset (days)")
            .setDesc("0 = today, -7 = seven days ago");
          endSetting.addText((text) => {
            text.inputEl.type = "number";
            text.setPlaceholder("0");
            text.setValue(
              typeof preset.endOffsetDays === "number" ? String(preset.endOffsetDays) : ""
            );
            text.onChange((value) => {
              const nextValue = value.trim().length ? Number(value) : undefined;
              void updatePreset(index, {
                endOffsetDays: Number.isFinite(nextValue) ? nextValue : undefined,
              });
            });
          });
        }

        if (preset.type === "calendar") {
          const calendarSetting = new Setting(extra).setName("Calendar range");
          calendarSetting.addDropdown((dropdown) => {
            dropdown.addOption("this-week", "This week");
            dropdown.addOption("last-week", "Last week");
            dropdown.addOption("this-month", "This month");
            dropdown.addOption("last-month", "Last month");
            dropdown.addOption("this-year", "This year");
            dropdown.addOption("last-year", "Last year");
            dropdown.setValue(
              isCalendarPreset(preset.calendar ?? "") ? preset.calendar : "this-week"
            );
            dropdown.onChange((value) => {
              const nextValue = isCalendarPreset(value) ? value : "this-week";
              void updatePreset(index, { calendar: nextValue });
            });
          });
        }
      };

      renderExtra();

      new Setting(card).addButton((button) => {
        button.setWarning();
        button.setButtonText("Delete preset");
        button.onClick(() => {
          const next = presets.filter((_, idx) => idx !== index);
          void updatePresets(next, true);
        });
      });
    });

    new Setting(this.containerEl)
      .setName("Add time preset")
      .setDesc("Create a custom time range for all widgets.")
      .addButton((button) => {
        button.setButtonText("Add preset");
        button.onClick(() => {
          const next = [
            ...presets,
            {
              id: `preset-${Date.now()}`,
              label: "New preset",
              type: "relative",
              startOffsetDays: -6,
              endOffsetDays: 0,
            },
          ];
          void updatePresets(next, true);
        });
      });
  }
}

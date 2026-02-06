export type TimePresetType = "all" | "relative" | "calendar";
export type TimePresetCalendar =
  | "this-week"
  | "last-week"
  | "this-month"
  | "last-month"
  | "this-year"
  | "last-year";

export interface TimePreset {
  id: string;
  label: string;
  type: TimePresetType;
  calendar?: TimePresetCalendar;
  startOffsetDays?: number;
  endOffsetDays?: number;
}

export const CUSTOM_RANGE_ID = "custom";

export const DEFAULT_TIME_PRESETS: TimePreset[] = [
  { id: "all", label: "All time", type: "all" },
  { id: "today", label: "Today", type: "relative", startOffsetDays: 0, endOffsetDays: 0 },
  { id: "this-week", label: "This week", type: "calendar", calendar: "this-week" },
  { id: "last-7-days", label: "Last 7 days", type: "relative", startOffsetDays: -6, endOffsetDays: 0 },
  { id: "last-30-days", label: "Last 30 days", type: "relative", startOffsetDays: -29, endOffsetDays: 0 },
  { id: "this-month", label: "This month", type: "calendar", calendar: "this-month" },
  { id: "this-year", label: "This year", type: "calendar", calendar: "this-year" },
];

const CALENDAR_VALUES: TimePresetCalendar[] = [
  "this-week",
  "last-week",
  "this-month",
  "last-month",
  "this-year",
  "last-year",
];

export const normalizeTimePresets = (value?: TimePreset[]): TimePreset[] => {
  if (!Array.isArray(value) || value.length === 0) {
    return DEFAULT_TIME_PRESETS.map((preset) => ({ ...preset }));
  }

  const cleaned = value
    .map((preset) => {
      if (!preset || typeof preset.id !== "string") return null;
      if (!preset.label || typeof preset.label !== "string") {
        preset.label = preset.id;
      }
      if (preset.type !== "all" && preset.type !== "relative" && preset.type !== "calendar") {
        return null;
      }

      if (preset.type === "calendar") {
        const calendar = preset.calendar;
        if (!calendar || !CALENDAR_VALUES.includes(calendar)) return null;
        return { ...preset, calendar };
      }

      if (preset.type === "relative") {
        const start = typeof preset.startOffsetDays === "number" ? preset.startOffsetDays : undefined;
        const end = typeof preset.endOffsetDays === "number" ? preset.endOffsetDays : undefined;
        return { ...preset, startOffsetDays: start, endOffsetDays: end };
      }

      return { ...preset, calendar: undefined, startOffsetDays: undefined, endOffsetDays: undefined };
    })
    .filter((preset): preset is TimePreset => Boolean(preset));

  return cleaned.length > 0 ? cleaned : DEFAULT_TIME_PRESETS.map((preset) => ({ ...preset }));
};

export const cloneTimePresets = (value: TimePreset[]): TimePreset[] =>
  value.map((preset) => ({ ...preset }));

const CALENDAR_SET = new Set<string>(CALENDAR_VALUES);

export const isCalendarPreset = (value: string): value is TimePresetCalendar =>
  CALENDAR_SET.has(value);

// Widget edit UI shared across widget types.
import * as React from "react";
import { CUSTOM_RANGE_ID, DEFAULT_TIME_PRESETS } from "../../timePresets";
import { useTimePresets } from "../../widgetContext";
import {
  buildQueryFromFilter,
  buildQueryFromFilters,
  combineChartQueries,
  deriveFilterFromLegacyQuery,
  ensureChartSeries,
  ensureStatFilters,
  ensureTaskFilters,
  normalizeTimeRange,
  rangeHasBounds,
  resolveTimeRange,
  toOptionalNumber,
  updateChartSeries,
} from "../../utils/dashboardUtils";
import type {
  ChartCountMode,
  ChartDataMode,
  ChartSeriesConfig,
  LegendDisplay,
  LegendPosition,
  LineChartWidgetConfig,
  PieChartWidgetConfig,
  QueryFilter,
  StatsCompareBasis,
  StatsCompareDisplay,
  StatsCompareMode,
  StatsIconPosition,
  StatsValueAlign,
  TimeField,
  TimeRangeConfig,
  WidgetConfig,
  YamlFilter,
} from "../../types";

export type WidgetConfigPanelProps = {
  config: WidgetConfig;
  onUpdate: (updater: (widget: WidgetConfig) => WidgetConfig) => void;
};

const toStatsCompareMode = (value: string): StatsCompareMode => {
  if (value === "previous-period") return "previous-period";
  if (value === "fixed-period") return "fixed-period";
  if (value === "filter") return "filter";
  return "none";
};

const toStatsCompareDisplay = (value: string): StatsCompareDisplay =>
  value === "percent" ? "percent" : "number";

const toStatsCompareBasis = (value: string): StatsCompareBasis =>
  value === "per-day" ? "per-day" : "total";

const toStatsValueAlign = (value: string): StatsValueAlign => {
  if (value === "left") return "left";
  if (value === "right") return "right";
  return "center";
};

const toStatsIconPosition = (value: string): StatsIconPosition =>
  value === "right" ? "right" : "left";

const toChartDataMode = (value: string): ChartDataMode =>
  value === "series" ? "series" : "group";

const toChartCountMode = (value: string): ChartCountMode =>
  value === "tasks" ? "tasks" : "files";

const toChartGroupBy = (value: string): "tag" | "folder" | "file" => {
  if (value === "folder") return "folder";
  if (value === "file") return "file";
  return "tag";
};

const toLegendDisplay = (value: string): LegendDisplay =>
  value === "hover" ? "hover" : "list";

const toLegendPosition = (value: string): LegendPosition => {
  if (value === "left") return "left";
  if (value === "right") return "right";
  if (value === "top") return "top";
  if (value === "bottom") return "bottom";
  return "auto";
};

type TimeRangeEditorProps = {
  timeField?: TimeField;
  timeRange: TimeRangeConfig;
  onChange: (next: { timeField?: TimeField; timeRange: TimeRangeConfig }) => void;
  showField?: boolean;
  rangeLabel?: string;
};

type YamlFilterEditorProps = {
  yamlFilters: YamlFilter[];
  onChange: (next: YamlFilter[]) => void;
  labelPrefix?: string;
};

const YamlFilterEditor: React.FC<YamlFilterEditorProps> = ({
  yamlFilters,
  onChange,
  labelPrefix,
}) => {
  const filters = Array.isArray(yamlFilters) ? yamlFilters : [];
  const prefix = labelPrefix ? `${labelPrefix} ` : "";

  return (
    <div className="obsd-widget-yaml">
      {filters.map((entry, index) => (
        <div className="obsd-widget-yaml-row" key={`yaml-${index}`}>
          <div className="obsd-widget-config-row">
            <label>{`${prefix}YAML ${index + 1} key`}</label>
            <input
              type="text"
              value={entry.key}
              placeholder="Status"
              onChange={(event) => {
                const next = [...filters];
                next[index] = { ...entry, key: event.target.value };
                onChange(next);
              }}
            />
          </div>
          <div className="obsd-widget-config-row">
            <label>{`${prefix}YAML ${index + 1} values`}</label>
            <input
              type="text"
              value={entry.values}
              placeholder="ready, todo"
              onChange={(event) => {
                const next = [...filters];
                next[index] = { ...entry, values: event.target.value };
                onChange(next);
              }}
            />
          </div>
          {filters.length > 1 ? (
            <div className="obsd-widget-query-actions">
              <button
                type="button"
                className="obsd-widget-toggle"
                onClick={() => {
                  const next = filters.filter((_, idx) => idx !== index);
                  onChange(next);
                }}
              >
                Remove YAML
              </button>
            </div>
          ) : null}
        </div>
      ))}
      <div className="obsd-widget-query-actions">
        <button
          type="button"
          className="obsd-widget-toggle"
          onClick={() => onChange([...filters, { key: "", values: "" }])}
        >
          + Add YAML filter
        </button>
      </div>
    </div>
  );
};

const TimeRangeEditor: React.FC<TimeRangeEditorProps> = ({
  timeField,
  timeRange,
  onChange,
  showField = true,
  rangeLabel = "Time range",
}) => {
  const timePresets = useTimePresets();
  const presets = timePresets.length > 0 ? timePresets : DEFAULT_TIME_PRESETS;
  const presetId = timeRange.preset ?? "all";
  const fieldValue = timeField ?? "modified";
  const hasPreset = presets.some((preset) => preset.id === presetId);
  const selectablePresets = hasPreset
    ? presets
    : [{ id: presetId, label: `Unknown (${presetId})`, type: "all" }, ...presets];

  const updateRange = (nextPreset: string) => {
    onChange({
      timeField: fieldValue,
      timeRange: {
        preset: nextPreset,
        start: nextPreset === CUSTOM_RANGE_ID ? timeRange.start : undefined,
        end: nextPreset === CUSTOM_RANGE_ID ? timeRange.end : undefined,
      },
    });
  };

  const updateDate = (key: "start" | "end", value: string) => {
    onChange({
      timeField: fieldValue,
      timeRange: {
        ...timeRange,
        preset: CUSTOM_RANGE_ID,
        [key]: value || undefined,
      },
    });
  };

  return (
    <>
      {showField ? (
        <div className="obsd-widget-config-row">
          <label>Time field</label>
          <select
            value={fieldValue}
            onChange={(event) => {
              const nextField = event.target.value === "created" ? "created" : "modified";
              onChange({ timeField: nextField, timeRange });
            }}
          >
            <option value="modified">Modified</option>
            <option value="created">Created</option>
          </select>
        </div>
      ) : null}
      <div className="obsd-widget-config-row">
        <label>{rangeLabel}</label>
        <select
          value={presetId}
          onChange={(event) => {
            updateRange(event.target.value);
          }}
        >
          {selectablePresets.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.label}
            </option>
          ))}
          <option value={CUSTOM_RANGE_ID}>Custom range</option>
        </select>
      </div>
      {presetId === CUSTOM_RANGE_ID ? (
        <>
          <div className="obsd-widget-config-row">
            <label>Start date</label>
            <input
              type="date"
              value={timeRange.start ?? ""}
              onChange={(event) => updateDate("start", event.target.value)}
            />
          </div>
          <div className="obsd-widget-config-row">
            <label>End date</label>
            <input
              type="date"
              value={timeRange.end ?? ""}
              onChange={(event) => updateDate("end", event.target.value)}
            />
          </div>
        </>
      ) : null}
    </>
  );
};

export const WidgetConfigPanel: React.FC<WidgetConfigPanelProps> = ({
  config,
  onUpdate,
}) => {
  const timePresets = useTimePresets();
  const [activeTab, setActiveTab] = React.useState<"data" | "view">("data");

  const baseViewFields = (
    <>
      <div className="obsd-widget-config-row">
        <label>Show title</label>
        <input
          type="checkbox"
          checked={config.showTitle !== false}
          onChange={(event) => {
            const next = event.target.checked;
            onUpdate((widget) => ({
              ...widget,
              showTitle: next,
            }));
          }}
        />
      </div>
      <div className="obsd-widget-config-row">
        <label>Title</label>
        <input
          type="text"
          value={config.title ?? ""}
          onChange={(event) => {
            const value = event.target.value.trim();
            onUpdate((widget) => ({
              ...widget,
              title: value.length > 0 ? value : undefined,
            }));
          }}
        />
      </div>
      <div className="obsd-widget-config-row">
        <label>Title size</label>
        <input
          type="number"
          value={config.titleSize === undefined ? "" : String(config.titleSize)}
          placeholder="14"
          onChange={(event) => {
            const value = toOptionalNumber(event.target.value);
            const next = value && value > 0 ? value : undefined;
            onUpdate((widget) => ({
              ...widget,
              titleSize: next,
            }));
          }}
        />
      </div>
      <div className="obsd-widget-config-row">
        <label>Title side</label>
        <select
          value={config.headerAlign ?? "left"}
          onChange={(event) => {
            const value = event.target.value === "right" ? "right" : "left";
            onUpdate((widget) => ({
              ...widget,
              headerAlign: value,
            }));
          }}
        >
          <option value="left">Left</option>
          <option value="right">Right</option>
        </select>
      </div>
      <div className="obsd-widget-config-row">
        <label>Header icon</label>
        <input
          type="text"
          value={config.headerIconName ?? ""}
          placeholder="zap"
          onChange={(event) => {
            const value = event.target.value.trim();
            onUpdate((widget) => ({
              ...widget,
              headerIconName: value.length > 0 ? value : undefined,
            }));
          }}
        />
      </div>
      <div className="obsd-widget-config-row">
        <label>Icon side</label>
        <select
          value={config.headerIconPosition ?? "left"}
          onChange={(event) => {
            const value = event.target.value === "right" ? "right" : "left";
            onUpdate((widget) => ({
              ...widget,
              headerIconPosition: value,
            }));
          }}
        >
          <option value="left">Left</option>
          <option value="right">Right</option>
        </select>
      </div>
      <div className="obsd-widget-config-note">
        Set Show title off + Header icon to show icon-only headers.
      </div>
    </>
  );

  const viewSection = (extra?: React.ReactNode) => (
    <div className="obsd-widget-config-section">
      {baseViewFields}
      {extra}
    </div>
  );

  const tabs = (
    <div className="obsd-widget-config-tabs">
      <button
        type="button"
        className={`obsd-widget-toggle${activeTab === "data" ? " is-active" : ""}`}
        onClick={() => setActiveTab("data")}
      >
        Data
      </button>
      <button
        type="button"
        className={`obsd-widget-toggle${activeTab === "view" ? " is-active" : ""}`}
        onClick={() => setActiveTab("view")}
      >
        View
      </button>
    </div>
  );

  if (config.type === "task-list") {
    const filters = ensureTaskFilters(config);
    const effectiveQuery = buildQueryFromFilters(filters);

    const updateFilters = (next: QueryFilter[]) => {
      const nextFilters = next.length > 0 ? next : [{ tags: "", folders: "", yamlFilters: [] }];
      onUpdate((widget) => {
        if (widget.type !== "task-list") return widget;
        return {
          ...widget,
          filters: nextFilters,
        };
      });
    };

    const dataFields = (
      <>
        <div className="obsd-widget-source">
          <div className="obsd-widget-config-note">
            Filters combine with OR. Inside a filter, folders AND tags are combined.
          </div>
          {filters.map((filter, index) => (
            <div className="obsd-widget-series" key={`task-filter-${index}`}>
              <div className="obsd-widget-config-row">
                <label>{`Filter ${index + 1} tags`}</label>
                <input
                  type="text"
                  value={filter.tags ?? ""}
                  placeholder="project, urgent"
                  onChange={(event) => {
                    const next = [...filters];
                    next[index] = { ...filter, tags: event.target.value };
                    updateFilters(next);
                  }}
                />
              </div>
              <div className="obsd-widget-config-row">
                <label>{`Filter ${index + 1} folders`}</label>
                <input
                  type="text"
                  value={filter.folders ?? ""}
                  placeholder="Projects/2026"
                  onChange={(event) => {
                    const next = [...filters];
                    next[index] = { ...filter, folders: event.target.value };
                    updateFilters(next);
                  }}
                />
              </div>
              <YamlFilterEditor
                yamlFilters={filter.yamlFilters ?? []}
                labelPrefix={`Filter ${index + 1}`}
                onChange={(nextYaml) => {
                  const next = [...filters];
                  next[index] = { ...filter, yamlFilters: nextYaml };
                  updateFilters(next);
                }}
              />
              {filters.length > 1 ? (
                <div className="obsd-widget-query-actions">
                  <button
                    type="button"
                    className="obsd-widget-toggle"
                    onClick={() => updateFilters(filters.filter((_, i) => i !== index))}
                  >
                    Remove filter
                  </button>
                </div>
              ) : null}
            </div>
          ))}
          <div className="obsd-widget-query-actions">
            <button
              type="button"
              className="obsd-widget-toggle"
              onClick={() => updateFilters([...filters, { tags: "", folders: "", yamlFilters: [] }])}
            >
              + Add filter
            </button>
          </div>
        </div>
        <div className="obsd-widget-config-row">
          <label>Limit</label>
          <input
            type="number"
            value={config.limit ?? ""}
            placeholder="10"
            onChange={(event) => {
              const value = toOptionalNumber(event.target.value);
              onUpdate((widget) => {
                if (widget.type !== "task-list") return widget;
                return {
                  ...widget,
                  limit: value,
                };
              });
            }}
          />
        </div>
        <div className="obsd-widget-config-row">
          <label>Show completed</label>
          <input
            type="checkbox"
            checked={config.showCompleted ?? true}
            onChange={(event) => {
              onUpdate((widget) => {
                if (widget.type !== "task-list") return widget;
                return {
                  ...widget,
                  showCompleted: event.target.checked,
                };
              });
            }}
          />
        </div>
        <div className="obsd-widget-config-row">
          <label>Time field</label>
          <select
            value={config.timeField ?? "modified"}
            onChange={(event) => {
              const value = event.target.value === "created" ? "created" : "modified";
              onUpdate((widget) => {
                if (widget.type !== "task-list") return widget;
                return {
                  ...widget,
                  timeField: value,
                };
              });
            }}
          >
            <option value="modified">Modified</option>
            <option value="created">Created</option>
          </select>
        </div>
        <div className="obsd-widget-config-row">
          <label>Time range</label>
          <select
            value={config.timeRange?.preset ?? "all"}
            onChange={(event) => {
              const preset = event.target.value;
              onUpdate((widget) => {
                if (widget.type !== "task-list") return widget;
                return {
                  ...widget,
                  timeRange: {
                    preset,
                    start: preset === CUSTOM_RANGE_ID ? widget.timeRange?.start : undefined,
                    end: preset === CUSTOM_RANGE_ID ? widget.timeRange?.end : undefined,
                  },
                };
              });
            }}
          >
            {(timePresets.length > 0 ? timePresets : DEFAULT_TIME_PRESETS).map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.label}
              </option>
            ))}
            <option value={CUSTOM_RANGE_ID}>Custom range</option>
          </select>
        </div>
        {(config.timeRange?.preset ?? "all") === CUSTOM_RANGE_ID ? (
          <>
            <div className="obsd-widget-config-row">
              <label>Start date</label>
              <input
                type="date"
                value={config.timeRange?.start ?? ""}
                onChange={(event) => {
                  const value = event.target.value;
                  onUpdate((widget) => {
                    if (widget.type !== "task-list") return widget;
                    return {
                      ...widget,
                      timeRange: {
                        preset: CUSTOM_RANGE_ID,
                        start: value || undefined,
                        end: widget.timeRange?.end,
                      },
                    };
                  });
                }}
              />
            </div>
            <div className="obsd-widget-config-row">
              <label>End date</label>
              <input
                type="date"
                value={config.timeRange?.end ?? ""}
                onChange={(event) => {
                  const value = event.target.value;
                  onUpdate((widget) => {
                    if (widget.type !== "task-list") return widget;
                    return {
                      ...widget,
                      timeRange: {
                        preset: CUSTOM_RANGE_ID,
                        start: widget.timeRange?.start,
                        end: value || undefined,
                      },
                    };
                  });
                }}
              />
            </div>
          </>
        ) : null}
        <div className="obsd-widget-config-note">Effective query: {effectiveQuery}</div>
      </>
    );

    const viewFields = viewSection();

    return (
      <div className="obsd-widget-config">
        {tabs}
        {activeTab === "data" ? dataFields : viewFields}
      </div>
    );
  }

  if (config.type === "stats") {
    const filters = ensureStatFilters(config.filters);
    const compareFilters = ensureStatFilters(config.compareFilters);
    const effectiveQuery = buildQueryFromFilters(filters);
    const compareQuery = buildQueryFromFilters(compareFilters);
    const timeField = config.timeField ?? "modified";
    const timeRange = normalizeTimeRange(config.timeRange);
    const compareMode = config.compareMode ?? "none";
    const compareLabel = config.compareLabel ?? "Delta";
    const compareDisplay = config.compareDisplay ?? "number";
    const compareBasis = config.compareBasis ?? "total";
    const compareRange = normalizeTimeRange(config.compareRange);
    const countTarget = config.countTarget ?? "files";
    const iconName = config.iconName ?? "";
    const iconPosition = config.iconPosition ?? "left";
    const valueAlign = config.valueAlign ?? "center";

    const updateFilters = (next: QueryFilter[]) => {
      const nextFilters = next.length > 0 ? next : [{ tags: "", folders: "", yamlFilters: [] }];
      onUpdate((widget) => {
        if (widget.type !== "stats") return widget;
        return {
          ...widget,
          filters: nextFilters,
        };
      });
    };

    const updateCompareFilters = (next: QueryFilter[]) => {
      const nextFilters = next.length > 0 ? next : [{ tags: "", folders: "", yamlFilters: [] }];
      onUpdate((widget) => {
        if (widget.type !== "stats") return widget;
        return {
          ...widget,
          compareFilters: nextFilters,
        };
      });
    };

    const dataFields = (
      <>
        <div className="obsd-widget-source">
          <div className="obsd-widget-config-note">
            Filters combine with OR. Inside a filter, folders AND tags are combined.
          </div>
          {filters.map((filter, index) => (
            <div className="obsd-widget-series" key={`stat-filter-${index}`}>
              <div className="obsd-widget-config-row">
                <label>{`Filter ${index + 1} tags`}</label>
                <input
                  type="text"
                  value={filter.tags ?? ""}
                  placeholder="project, urgent"
                  onChange={(event) => {
                    const next = [...filters];
                    next[index] = { ...filter, tags: event.target.value };
                    updateFilters(next);
                  }}
                />
              </div>
              <div className="obsd-widget-config-row">
                <label>{`Filter ${index + 1} folders`}</label>
                <input
                  type="text"
                  value={filter.folders ?? ""}
                  placeholder="Projects/2026"
                  onChange={(event) => {
                    const next = [...filters];
                    next[index] = { ...filter, folders: event.target.value };
                    updateFilters(next);
                  }}
                />
              </div>
              <YamlFilterEditor
                yamlFilters={filter.yamlFilters ?? []}
                labelPrefix={`Filter ${index + 1}`}
                onChange={(nextYaml) => {
                  const next = [...filters];
                  next[index] = { ...filter, yamlFilters: nextYaml };
                  updateFilters(next);
                }}
              />
              {filters.length > 1 ? (
                <div className="obsd-widget-query-actions">
                  <button
                    type="button"
                    className="obsd-widget-toggle"
                    onClick={() => updateFilters(filters.filter((_, i) => i !== index))}
                  >
                    Remove filter
                  </button>
                </div>
              ) : null}
            </div>
          ))}
          <div className="obsd-widget-query-actions">
            <button
              type="button"
              className="obsd-widget-toggle"
              onClick={() => updateFilters([...filters, { tags: "", folders: "", yamlFilters: [] }])}
            >
              + Add filter
            </button>
          </div>
        </div>
        <div className="obsd-widget-config-row">
          <label>Count target</label>
          <select
            value={countTarget}
            onChange={(event) => {
              const value = event.target.value === "tasks" ? "tasks" : "files";
              onUpdate((widget) => {
                if (widget.type !== "stats") return widget;
                return {
                  ...widget,
                  countTarget: value,
                };
              });
            }}
          >
            <option value="files">Files</option>
            <option value="tasks">Tasks</option>
          </select>
        </div>
        <div className="obsd-widget-config-row">
          <label>Time field</label>
          <select
            value={timeField}
            onChange={(event) => {
              const value = event.target.value === "created" ? "created" : "modified";
              onUpdate((widget) => {
                if (widget.type !== "stats") return widget;
                return {
                  ...widget,
                  timeField: value,
                };
              });
            }}
          >
            <option value="modified">Modified</option>
            <option value="created">Created</option>
          </select>
        </div>
        <TimeRangeEditor
          timeField={timeField}
          timeRange={timeRange}
          onChange={({ timeField: nextField, timeRange: nextRange }) => {
            onUpdate((widget) => {
              if (widget.type !== "stats") return widget;
              return {
                ...widget,
                timeField: nextField,
                timeRange: nextRange,
              };
            });
          }}
        />
        <div className="obsd-widget-config-row">
          <label>Compare mode</label>
          <select
            value={compareMode}
            onChange={(event) => {
              const value = toStatsCompareMode(event.target.value);
              onUpdate((widget) => {
                if (widget.type !== "stats") return widget;
                return {
                  ...widget,
                  compareMode: value,
                };
              });
            }}
          >
            <option value="none">None</option>
            <option value="previous-period">Previous period</option>
            <option value="fixed-period">Fixed period</option>
            <option value="filter">Different filters</option>
          </select>
        </div>
        {compareMode === "fixed-period" ? (
          <TimeRangeEditor
            timeField={timeField}
            timeRange={compareRange}
            onChange={({ timeRange: nextRange }) => {
              onUpdate((widget) => {
                if (widget.type !== "stats") return widget;
                return {
                  ...widget,
                  compareRange: nextRange,
                };
              });
            }}
            rangeLabel="Compare range"
            showField={false}
          />
        ) : null}
        {compareMode === "filter" ? (
          <div className="obsd-widget-source">
            <div className="obsd-widget-config-note">
              Compare filters use the same time range.
            </div>
            {compareFilters.map((filter, index) => (
              <div className="obsd-widget-series" key={`compare-filter-${index}`}>
                <div className="obsd-widget-config-row">
                  <label>{`Compare ${index + 1} tags`}</label>
                  <input
                    type="text"
                    value={filter.tags ?? ""}
                    placeholder="project, urgent"
                    onChange={(event) => {
                      const next = [...compareFilters];
                      next[index] = { ...filter, tags: event.target.value };
                      updateCompareFilters(next);
                    }}
                  />
                </div>
                <div className="obsd-widget-config-row">
                  <label>{`Compare ${index + 1} folders`}</label>
                  <input
                    type="text"
                    value={filter.folders ?? ""}
                    placeholder="Projects/2026"
                    onChange={(event) => {
                      const next = [...compareFilters];
                      next[index] = { ...filter, folders: event.target.value };
                      updateCompareFilters(next);
                    }}
                  />
                </div>
                <YamlFilterEditor
                  yamlFilters={filter.yamlFilters ?? []}
                  labelPrefix={`Compare ${index + 1}`}
                  onChange={(nextYaml) => {
                    const next = [...compareFilters];
                    next[index] = { ...filter, yamlFilters: nextYaml };
                    updateCompareFilters(next);
                  }}
                />
                {compareFilters.length > 1 ? (
                  <div className="obsd-widget-query-actions">
                    <button
                      type="button"
                      className="obsd-widget-toggle"
                      onClick={() =>
                        updateCompareFilters(compareFilters.filter((_, i) => i !== index))
                      }
                    >
                      Remove filter
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
            <div className="obsd-widget-query-actions">
              <button
                type="button"
                className="obsd-widget-toggle"
                onClick={() =>
                  updateCompareFilters([
                    ...compareFilters,
                    { tags: "", folders: "", yamlFilters: [] },
                  ])
                }
              >
                + Add compare filter
              </button>
            </div>
          </div>
        ) : null}
        <div className="obsd-widget-config-row">
          <label>Compare display</label>
          <select
            value={compareDisplay}
            onChange={(event) => {
              const value = toStatsCompareDisplay(event.target.value);
              onUpdate((widget) => {
                if (widget.type !== "stats") return widget;
                return {
                  ...widget,
                  compareDisplay: value,
                };
              });
            }}
          >
            <option value="number">Number</option>
            <option value="percent">Percent</option>
          </select>
        </div>
        <div className="obsd-widget-config-row">
          <label>Compare label</label>
          <input
            type="text"
            value={compareLabel}
            placeholder="Delta"
            onChange={(event) => {
              const value = event.target.value;
              onUpdate((widget) => {
                if (widget.type !== "stats") return widget;
                return {
                  ...widget,
                  compareLabel: value,
                };
              });
            }}
          />
        </div>
        <div className="obsd-widget-config-row">
          <label>Compare basis</label>
          <select
            value={compareBasis}
            onChange={(event) => {
              const value = toStatsCompareBasis(event.target.value);
              onUpdate((widget) => {
                if (widget.type !== "stats") return widget;
                return {
                  ...widget,
                  compareBasis: value,
                };
              });
            }}
          >
            <option value="total">Total</option>
            <option value="per-day">Per day</option>
          </select>
        </div>
        <div className="obsd-widget-config-note">Effective query: {effectiveQuery}</div>
        {compareMode === "filter" ? (
          <div className="obsd-widget-config-note">Compare query: {compareQuery}</div>
        ) : null}
        {compareMode === "previous-period" && !rangeHasBounds(resolveTimeRange(timeRange, timePresets)) ? (
          <div className="obsd-widget-config-note">
            Previous period compares require a bounded time range.
          </div>
        ) : null}
      </>
    );

    const viewFields = viewSection(
      <>
        <div className="obsd-widget-config-row">
          <label>Value align</label>
          <select
            value={valueAlign}
            onChange={(event) => {
              const value = toStatsValueAlign(event.target.value);
              onUpdate((widget) => {
                if (widget.type !== "stats") return widget;
                return {
                  ...widget,
                  valueAlign: value,
                };
              });
            }}
          >
            <option value="left">Left</option>
            <option value="center">Center</option>
            <option value="right">Right</option>
          </select>
        </div>
        <div className="obsd-widget-config-row">
          <label>Value icon</label>
          <input
            type="text"
            value={iconName}
            placeholder="activity"
            onChange={(event) => {
              const value = event.target.value.trim();
              onUpdate((widget) => {
                if (widget.type !== "stats") return widget;
                return {
                  ...widget,
                  iconName: value.length > 0 ? value : undefined,
                };
              });
            }}
          />
        </div>
        <div className="obsd-widget-config-row">
          <label>Icon side</label>
          <select
            value={iconPosition}
            onChange={(event) => {
              const value = toStatsIconPosition(event.target.value);
              onUpdate((widget) => {
                if (widget.type !== "stats") return widget;
                return {
                  ...widget,
                  iconPosition: value,
                };
              });
            }}
          >
            <option value="left">Left</option>
            <option value="right">Right</option>
          </select>
        </div>
      </>
    );

    return (
      <div className="obsd-widget-config">
        {tabs}
        {activeTab === "data" ? dataFields : viewFields}
      </div>
    );
  }

  if (config.type === "status-bar") {
    const filters = ensureStatFilters(config.filters);
    const effectiveQuery = buildQueryFromFilters(filters);
    const timeField = config.timeField ?? "modified";
    const timeRange = normalizeTimeRange(config.timeRange);
    const target = config.target ?? null;
    const countTarget = config.countTarget ?? "files";

    const updateFilters = (next: QueryFilter[]) => {
      const nextFilters = next.length > 0 ? next : [{ tags: "", folders: "", yamlFilters: [] }];
      onUpdate((widget) => {
        if (widget.type !== "status-bar") return widget;
        return {
          ...widget,
          filters: nextFilters,
        };
      });
    };

    const dataFields = (
      <>
        <div className="obsd-widget-source">
          <div className="obsd-widget-config-note">
            Filters combine with OR. Inside a filter, folders AND tags are combined.
          </div>
          {filters.map((filter, index) => (
            <div className="obsd-widget-series" key={`status-filter-${index}`}>
              <div className="obsd-widget-config-row">
                <label>{`Filter ${index + 1} tags`}</label>
                <input
                  type="text"
                  value={filter.tags ?? ""}
                  placeholder="project, urgent"
                  onChange={(event) => {
                    const next = [...filters];
                    next[index] = { ...filter, tags: event.target.value };
                    updateFilters(next);
                  }}
                />
              </div>
              <div className="obsd-widget-config-row">
                <label>{`Filter ${index + 1} folders`}</label>
                <input
                  type="text"
                  value={filter.folders ?? ""}
                  placeholder="Projects/2026"
                  onChange={(event) => {
                    const next = [...filters];
                    next[index] = { ...filter, folders: event.target.value };
                    updateFilters(next);
                  }}
                />
              </div>
              <YamlFilterEditor
                yamlFilters={filter.yamlFilters ?? []}
                labelPrefix={`Filter ${index + 1}`}
                onChange={(nextYaml) => {
                  const next = [...filters];
                  next[index] = { ...filter, yamlFilters: nextYaml };
                  updateFilters(next);
                }}
              />
              {filters.length > 1 ? (
                <div className="obsd-widget-query-actions">
                  <button
                    type="button"
                    className="obsd-widget-toggle"
                    onClick={() => updateFilters(filters.filter((_, i) => i !== index))}
                  >
                    Remove filter
                  </button>
                </div>
              ) : null}
            </div>
          ))}
          <div className="obsd-widget-query-actions">
            <button
              type="button"
              className="obsd-widget-toggle"
              onClick={() => updateFilters([...filters, { tags: "", folders: "", yamlFilters: [] }])}
            >
              + Add filter
            </button>
          </div>
        </div>
        <div className="obsd-widget-config-row">
          <label>Count target</label>
          <select
            value={countTarget}
            onChange={(event) => {
              const value = event.target.value === "tasks" ? "tasks" : "files";
              onUpdate((widget) => {
                if (widget.type !== "status-bar") return widget;
                return {
                  ...widget,
                  countTarget: value,
                };
              });
            }}
          >
            <option value="files">Files</option>
            <option value="tasks">Tasks</option>
          </select>
        </div>
        <TimeRangeEditor
          timeField={timeField}
          timeRange={timeRange}
          onChange={({ timeField: nextField, timeRange: nextRange }) => {
            onUpdate((widget) => {
              if (widget.type !== "status-bar") return widget;
              return {
                ...widget,
                timeField: nextField,
                timeRange: nextRange,
              };
            });
          }}
        />
        <div className="obsd-widget-config-row">
          <label>Target</label>
          <input
            type="number"
            value={target === null ? "" : String(target)}
            placeholder="100"
            onChange={(event) => {
              const value = toOptionalNumber(event.target.value);
              onUpdate((widget) => {
                if (widget.type !== "status-bar") return widget;
                return {
                  ...widget,
                  target: value,
                };
              });
            }}
          />
        </div>
        <div className="obsd-widget-config-note">Effective query: {effectiveQuery}</div>
      </>
    );

    const viewFields = viewSection();

    return (
      <div className="obsd-widget-config">
        {tabs}
        {activeTab === "data" ? dataFields : viewFields}
      </div>
    );
  }

  if (config.type === "pie-chart" || config.type === "line-chart") {
    const chartConfig = config as PieChartWidgetConfig | LineChartWidgetConfig;
    const series = ensureChartSeries(chartConfig);
    const timeField = chartConfig.timeField ?? "modified";
    const timeRange = normalizeTimeRange(chartConfig.timeRange);
    const filter = chartConfig.filter ?? deriveFilterFromLegacyQuery(chartConfig.query);
    const effectiveQuery = buildQueryFromFilter(filter);
    const seriesQueries = series.map((entry) => buildQueryFromFilter(entry.filter));
    const combinedQuery = combineChartQueries(seriesQueries);
    const legendDisplay = chartConfig.legendDisplay ?? "hover";
    const legendPosition = chartConfig.legendPosition ?? "auto";
    const groupBy = chartConfig.groupBy ?? "tag";
    const limit = chartConfig.limit ?? 5;
    const countMode = chartConfig.countMode ?? "files";
    const chartMode = chartConfig.dataMode ?? (chartConfig.filter ? "group" : "series");

    const updateFilter = (next: QueryFilter) => {
      onUpdate((widget) => {
        if (widget.type !== "pie-chart" && widget.type !== "line-chart") return widget;
        return {
          ...widget,
          filter: next,
        };
      });
    };

    const updateSeries = (next: ChartSeriesConfig[]) => {
      onUpdate((widget) => updateChartSeries(widget, next));
    };

    const legendFields = (
      <>
        <div className="obsd-widget-config-row">
          <label>Legend display</label>
          <select
            value={legendDisplay}
            onChange={(event) => {
              const value = toLegendDisplay(event.target.value);
              onUpdate((widget) => {
                if (widget.type !== "pie-chart" && widget.type !== "line-chart") {
                  return widget;
                }
                return {
                  ...widget,
                  legendDisplay: value,
                };
              });
            }}
          >
            <option value="list">List</option>
            <option value="hover">Hover</option>
          </select>
        </div>
        <div className="obsd-widget-config-row">
          <label>Legend position</label>
          <select
            value={legendPosition}
            onChange={(event) => {
              const value = toLegendPosition(event.target.value);
              onUpdate((widget) => {
                if (widget.type !== "pie-chart" && widget.type !== "line-chart") {
                  return widget;
                }
                return {
                  ...widget,
                  legendPosition: value,
                };
              });
            }}
          >
            <option value="auto">Auto</option>
            <option value="left">Left</option>
            <option value="right">Right</option>
            <option value="bottom">Bottom</option>
            <option value="top">Top</option>
          </select>
        </div>
        <div className="obsd-widget-config-row">
          <label>Legend size</label>
          <input
            type="number"
            value={String(chartConfig.legendSize ?? "")}
            placeholder="100"
            onChange={(event) => {
              const value = toOptionalNumber(event.target.value);
              onUpdate((widget) => {
                if (widget.type !== "pie-chart" && widget.type !== "line-chart") {
                  return widget;
                }
                return {
                  ...widget,
                  legendSize: value,
                };
              });
            }}
          />
        </div>
      </>
    );

    const dataFields = (
      <>
        <div className="obsd-widget-config-row">
          <label>Data mode</label>
          <select
            value={chartMode}
            onChange={(event) => {
              const value = toChartDataMode(event.target.value);
              onUpdate((widget) => {
                if (widget.type !== "pie-chart" && widget.type !== "line-chart") return widget;
                return {
                  ...widget,
                  dataMode: value,
                };
              });
            }}
          >
            <option value="group">Group by</option>
            <option value="series">Series</option>
          </select>
        </div>
        {chartMode === "group" ? (
          <>
            <div className="obsd-widget-config-row">
              <label>Group by</label>
              <select
                value={groupBy}
                onChange={(event) => {
                  const value = toChartGroupBy(event.target.value);
                  onUpdate((widget) => {
                    if (widget.type !== "pie-chart" && widget.type !== "line-chart") {
                      return widget;
                    }
                    return {
                      ...widget,
                      groupBy: value,
                    };
                  });
                }}
              >
                <option value="tag">Tag</option>
                <option value="file">File</option>
              </select>
            </div>
            <div className="obsd-widget-config-row">
              <label>Count</label>
              <select
                value={countMode}
                onChange={(event) => {
                  const value = toChartCountMode(event.target.value);
                  onUpdate((widget) => {
                    if (widget.type !== "pie-chart" && widget.type !== "line-chart") {
                      return widget;
                    }
                    return {
                      ...widget,
                      countMode: value,
                    };
                  });
                }}
              >
                <option value="files">Files</option>
                <option value="tasks">Tasks</option>
              </select>
            </div>
            <div className="obsd-widget-config-row">
              <label>Tags</label>
              <input
                type="text"
                value={filter.tags ?? ""}
                placeholder="project, urgent"
                onChange={(event) => {
                  updateFilter({ ...filter, tags: event.target.value });
                }}
              />
            </div>
            <div className="obsd-widget-config-row">
              <label>Folders</label>
              <input
                type="text"
                value={filter.folders ?? ""}
                placeholder="Projects/2026"
                onChange={(event) => {
                  updateFilter({ ...filter, folders: event.target.value });
                }}
              />
            </div>
            <YamlFilterEditor
              yamlFilters={filter.yamlFilters ?? []}
              onChange={(nextYaml) => updateFilter({ ...filter, yamlFilters: nextYaml })}
            />
            <div className="obsd-widget-config-row">
              <label>Limit</label>
              <input
                type="number"
                value={String(limit)}
                onChange={(event) => {
                  const value = toOptionalNumber(event.target.value) ?? 1;
                  onUpdate((widget) => {
                    if (widget.type !== "pie-chart" && widget.type !== "line-chart") {
                      return widget;
                    }
                    return {
                      ...widget,
                      limit: value,
                    };
                  });
                }}
              />
            </div>
            <TimeRangeEditor
              timeField={timeField}
              timeRange={timeRange}
              onChange={({ timeField: nextField, timeRange: nextRange }) => {
                onUpdate((widget) => {
                  if (widget.type !== "pie-chart" && widget.type !== "line-chart") {
                    return widget;
                  }
                  return {
                    ...widget,
                    timeField: nextField,
                    timeRange: nextRange,
                  };
                });
              }}
            />
            <div className="obsd-widget-config-note">Effective query: {effectiveQuery}</div>
          </>
        ) : (
          <>
            {series.map((entry, index) => (
              <div className="obsd-widget-series" key={`series-${index}`}>
                <div className="obsd-widget-config-row">
                  <label>Series label</label>
                  <input
                    type="text"
                    value={entry.label}
                    placeholder={`Series ${index + 1}`}
                    onChange={(event) => {
                      const next = [...series];
                      next[index] = { ...entry, label: event.target.value };
                      updateSeries(next);
                    }}
                  />
                </div>
                <div className="obsd-widget-config-row">
                  <label>Tags</label>
                  <input
                    type="text"
                    value={entry.filter.tags ?? ""}
                    placeholder="#project"
                    onChange={(event) => {
                      const next = [...series];
                      next[index] = {
                        ...entry,
                        filter: { ...entry.filter, tags: event.target.value },
                      };
                      updateSeries(next);
                    }}
                  />
                </div>
                <div className="obsd-widget-config-row">
                  <label>Folders</label>
                  <input
                    type="text"
                    value={entry.filter.folders ?? ""}
                    placeholder="Projects"
                    onChange={(event) => {
                      const next = [...series];
                      next[index] = {
                        ...entry,
                        filter: { ...entry.filter, folders: event.target.value },
                      };
                      updateSeries(next);
                    }}
                  />
                </div>
                <YamlFilterEditor
                  yamlFilters={entry.filter.yamlFilters ?? []}
                  onChange={(nextYaml) => {
                    const next = [...series];
                    next[index] = {
                      ...entry,
                      filter: { ...entry.filter, yamlFilters: nextYaml },
                    };
                    updateSeries(next);
                  }}
                />
                <TimeRangeEditor
                  timeField={entry.timeField}
                  timeRange={normalizeTimeRange(entry.timeRange)}
                  onChange={({ timeField: nextField, timeRange: nextRange }) => {
                    const next = [...series];
                    next[index] = {
                      ...entry,
                      timeField: nextField,
                      timeRange: nextRange,
                    };
                    updateSeries(next);
                  }}
                  showField={false}
                  rangeLabel="Series range"
                />
                {series.length > 1 ? (
                  <div className="obsd-widget-query-actions">
                    <button
                      type="button"
                      className="obsd-widget-toggle"
                      onClick={() => {
                        const next = series.filter((_, i) => i !== index);
                        updateSeries(next);
                      }}
                    >
                      Remove series
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
            <div className="obsd-widget-query-actions">
              <button
                type="button"
                className="obsd-widget-toggle"
                onClick={() => {
                  const next = [...series];
                  next.push({
                    label: `Series ${next.length + 1}`,
                    filter: { tags: "", folders: "", yamlFilters: [] },
                    timeRange: { preset: "all" },
                  });
                  updateSeries(next);
                }}
              >
                + Add series
              </button>
            </div>
            <div className="obsd-widget-config-note">Series query: {combinedQuery}</div>
          </>
        )}
      </>
    );

    const viewFields = viewSection(legendFields);

    return (
      <div className="obsd-widget-config">
        {tabs}
        {activeTab === "data" ? dataFields : viewFields}
      </div>
    );
  }

  return null;
};

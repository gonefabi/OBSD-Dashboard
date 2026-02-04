import * as React from "react";
import {
  Pie,
  PieChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { IDataSource, Page, Task } from "../interfaces/IDataSource";
import { normalizeLayout, resolveCollisions } from "./layout/layoutUtils";
import {
  CUSTOM_RANGE_ID,
  DEFAULT_TIME_PRESETS,
  TimePreset,
  isCalendarPreset,
} from "./timePresets";

export type WidgetType =
  | "task-list"
  | "pie-chart"
  | "line-chart"
  | "stats"
  | "status-bar";
export type ChartDataMode = "group" | "series";
export type ChartCountMode = "pages" | "tasks";
export type StatsCountTarget = "files" | "tasks";
export type TimeField = "created" | "modified";
export type StatsCompareMode = "none" | "previous-period" | "fixed-period" | "filter";
export type StatsCompareDisplay = "number" | "percent";
export type StatsCompareBasis = "total" | "per-day";

export interface WidgetBaseConfig {
  id: string;
  type: WidgetType;
  title?: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TaskListWidgetConfig extends WidgetBaseConfig {
  type: "task-list";
  filter?: string; // legacy
  filters?: QueryFilter[];
  showCompleted?: boolean;
  limit?: number;
}

export interface StatsWidgetConfig extends WidgetBaseConfig {
  type: "stats";
  countTarget?: StatsCountTarget;
  filters?: QueryFilter[];
  timeField?: TimeField;
  timeRange?: TimeRangeConfig;
  compareMode?: StatsCompareMode;
  compareDisplay?: StatsCompareDisplay;
  compareBasis?: StatsCompareBasis;
  compareRange?: TimeRangeConfig;
  compareFilters?: QueryFilter[];
  compareLabel?: string;
}

export interface StatusBarWidgetConfig extends WidgetBaseConfig {
  type: "status-bar";
  countTarget?: StatsCountTarget;
  filters?: QueryFilter[];
  timeField?: TimeField;
  timeRange?: TimeRangeConfig;
  target?: number;
}

export interface PieChartWidgetConfig extends WidgetBaseConfig {
  type: "pie-chart";
  query: string;
  groupBy: "tag" | "folder" | "file" | string;
  limit?: number;
  dataMode?: ChartDataMode;
  series?: ChartSeriesConfig[];
  filter?: QueryFilter;
  timeField?: TimeField;
  timeRange?: TimeRangeConfig;
}

export interface LineChartWidgetConfig extends WidgetBaseConfig {
  type: "line-chart";
  query: string;
  groupBy: "tag" | "folder" | "file" | string;
  limit?: number;
  dataMode?: ChartDataMode;
  series?: ChartSeriesConfig[];
  filter?: QueryFilter;
  timeField?: TimeField;
  timeRange?: TimeRangeConfig;
}

export interface ChartSeriesConfig {
  id: string;
  label: string;
  filter?: QueryFilter;
  countMode?: ChartCountMode;
  timeField?: TimeField;
  timeRange?: TimeRangeConfig;
}

export interface YamlFilter {
  key: string;
  values: string;
}

export interface QueryFilter {
  tags?: string;
  folders?: string;
  yamlFilters?: YamlFilter[];
}

export interface TimeRangeConfig {
  preset: string;
  start?: string;
  end?: string;
}

export type WidgetConfig =
  | TaskListWidgetConfig
  | StatusBarWidgetConfig
  | StatsWidgetConfig
  | PieChartWidgetConfig
  | LineChartWidgetConfig;

export interface DashboardLayout {
  columns: number;
  rowHeight: number;
  gap: number;
  widgets: WidgetConfig[];
}

export interface DashboardViewProps {
  dataSource: IDataSource;
  layout: DashboardLayout;
  timePresets?: TimePreset[];
  editable?: boolean;
  onLayoutChange?: (layout: DashboardLayout) => void;
}

const DataSourceContext = React.createContext<IDataSource | null>(null);
const TimePresetsContext = React.createContext<TimePreset[]>(DEFAULT_TIME_PRESETS);

export const useDataSource = (): IDataSource => {
  const context = React.useContext(DataSourceContext);
  if (!context) {
    throw new Error("DataSourceContext is missing. Wrap components with DashboardView.");
  }
  return context;
};

export const useTimePresets = (): TimePreset[] => {
  return React.useContext(TimePresetsContext);
};

type WidgetComponentProps<T extends WidgetConfig> = {
  config: T;
};

type GridMetrics = {
  colWidth: number;
  rowHeight: number;
  gap: number;
  columns: number;
  padding: number;
};

type DragState = {
  id: string;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  originW: number;
  lastX: number;
  lastY: number;
};

type ResizeState = {
  id: string;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  originW: number;
  originH: number;
  lastW: number;
  lastH: number;
};

const CHART_COLORS = [
  "#2b6cb0",
  "#d69e2e",
  "#2f855a",
  "#c05621",
  "#805ad5",
  "#718096",
  "#b83280",
  "#319795",
];

export const DashboardView: React.FC<DashboardViewProps> = ({
  dataSource,
  layout,
  timePresets,
  editable = false,
  onLayoutChange,
}) => {
  const presetList = timePresets && timePresets.length > 0 ? timePresets : DEFAULT_TIME_PRESETS;
  const [currentLayout, setCurrentLayout] = React.useState(layout);
  const [isInteracting, setIsInteracting] = React.useState(false);
  const [configOpenId, setConfigOpenId] = React.useState<string | null>(null);
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const dragState = React.useRef<DragState | null>(null);
  const resizeState = React.useRef<ResizeState | null>(null);
  const layoutRef = React.useRef(currentLayout);
  const metrics = useGridMetrics(containerRef, currentLayout);
  const metricsRef = React.useRef<GridMetrics | null>(null);

  React.useEffect(() => {
    layoutRef.current = currentLayout;
  }, [currentLayout]);

  React.useEffect(() => {
    metricsRef.current = metrics;
  }, [metrics]);

  React.useEffect(() => {
    if (!isInteracting) {
      layoutRef.current = layout;
      setCurrentLayout(layout);
    }
  }, [layout, isInteracting]);

  React.useEffect(() => {
    if (!editable) {
      setConfigOpenId(null);
    }
  }, [editable]);

  const updateWidget = React.useCallback(
    (id: string, updater: (widget: WidgetConfig) => WidgetConfig, persist: boolean) => {
      let nextLayout: DashboardLayout | null = null;

      setCurrentLayout((prev) => {
        let changed = false;
        const widgets = prev.widgets.map((widget) => {
          if (widget.id !== id) return widget;
          const next = updater(widget);
          if (next !== widget) changed = true;
          return next;
        });

        if (!changed) return prev;
        const base = { ...prev, widgets };
        const normalized = normalizeLayout(base);
        const resolved = resolveCollisions(normalized, id);
        layoutRef.current = resolved;
        nextLayout = resolved;
        return resolved;
      });

      if (persist && nextLayout && onLayoutChange) {
        onLayoutChange(nextLayout);
      }
    },
    [onLayoutChange]
  );

  const addWidget = React.useCallback(
    (type: WidgetType) => {
      const nextLayout = normalizeLayout({ ...currentLayout });
      const maxY = nextLayout.widgets.reduce(
        (acc, widget) => Math.max(acc, widget.y + widget.h),
        0
      );
      const id = `widget-${Date.now()}`;

      let widget: WidgetConfig;
      if (type === "task-list") {
        const baseWidget: TaskListWidgetConfig = {
          id,
          type,
          title: "Tasks",
          x: 0,
          y: maxY,
          w: 2,
          h: 3,
          filters: [{ tags: "", folders: "", yamlFilters: [] }],
          showCompleted: false,
          limit: 10,
        };
        widget = baseWidget;
      } else if (type === "status-bar") {
        const baseWidget: StatusBarWidgetConfig = {
          id,
          type,
          title: "Progress",
          x: 0,
          y: maxY,
          w: 2,
          h: 2,
          countTarget: "files",
          filters: [{ tags: "", folders: "", yamlFilters: [] }],
          timeField: "modified",
          timeRange: { preset: "all" },
          target: 10,
        };
        widget = baseWidget;
      } else if (type === "stats") {
        const baseWidget: StatsWidgetConfig = {
          id,
          type,
          title: "Stat",
          x: 0,
          y: maxY,
          w: 2,
          h: 2,
          countTarget: "files",
          filters: [{ tags: "", folders: "", yamlFilters: [] }],
          timeField: "modified",
          timeRange: { preset: "all" },
          compareMode: "none",
          compareDisplay: "number",
          compareBasis: "total",
        };
        widget = baseWidget;
      } else if (type === "line-chart") {
        widget = {
          id,
          type,
          title: "Trend",
          x: 0,
          y: maxY,
          w: 2,
          h: 3,
          query: "",
          groupBy: "tag",
          limit: 6,
          dataMode: "series",
          series: [
            {
              id: `series-${Date.now()}`,
              label: "Series 1",
              filter: { tags: "", folders: "", yamlFilters: [] },
              countMode: "pages",
              timeField: "modified",
              timeRange: { preset: "all" },
            },
          ],
          filter: { tags: "", folders: "", yamlFilters: [] },
        };
      } else {
        widget = {
          id,
          type: "pie-chart",
          title: "Chart",
          x: 0,
          y: maxY,
          w: 2,
          h: 3,
          query: "",
          groupBy: "tag",
          limit: 6,
          dataMode: "series",
          series: [
            {
              id: `series-${Date.now()}`,
              label: "Series 1",
              filter: { tags: "", folders: "", yamlFilters: [] },
              countMode: "pages",
              timeField: "modified",
              timeRange: { preset: "all" },
            },
          ],
          filter: { tags: "", folders: "", yamlFilters: [] },
        };
      }

      nextLayout.widgets = [...nextLayout.widgets, widget];
      const resolved = resolveCollisions(normalizeLayout(nextLayout), id);
      layoutRef.current = resolved;
      setCurrentLayout(resolved);
      if (onLayoutChange) onLayoutChange(resolved);
      setConfigOpenId(id);
    },
    [currentLayout, onLayoutChange]
  );

  const onDragStart = React.useCallback(
    (event: React.PointerEvent, widget: WidgetConfig) => {
      if (!editable || !metricsRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture?.(event.pointerId);

      dragState.current = {
        id: widget.id,
        startX: event.clientX,
        startY: event.clientY,
        originX: widget.x,
        originY: widget.y,
        originW: widget.w,
        lastX: widget.x,
        lastY: widget.y,
      };
      resizeState.current = null;
      setIsInteracting(true);
    },
    [editable]
  );

  const onResizeStart = React.useCallback(
    (event: React.PointerEvent, widget: WidgetConfig) => {
      if (!editable || !metricsRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture?.(event.pointerId);

      resizeState.current = {
        id: widget.id,
        startX: event.clientX,
        startY: event.clientY,
        originX: widget.x,
        originY: widget.y,
        originW: widget.w,
        originH: widget.h,
        lastW: widget.w,
        lastH: widget.h,
      };
      dragState.current = null;
      setIsInteracting(true);
    },
    [editable]
  );

  const handlePointerMove = React.useCallback(
    (event: PointerEvent) => {
      const activeDrag = dragState.current;
      const activeResize = resizeState.current;
      const grid = metricsRef.current;
      if (!grid) return;

      if (activeDrag) {
        const deltaCols = toGridDelta(event.clientX - activeDrag.startX, grid.colWidth, grid.gap);
        const deltaRows = toGridDelta(event.clientY - activeDrag.startY, grid.rowHeight, grid.gap);
        const nextX = clamp(activeDrag.originX + deltaCols, 0, grid.columns - activeDrag.originW);
        const nextY = Math.max(0, activeDrag.originY + deltaRows);

        if (nextX === activeDrag.lastX && nextY === activeDrag.lastY) return;
        activeDrag.lastX = nextX;
        activeDrag.lastY = nextY;

        updateWidget(activeDrag.id, (widget) => ({ ...widget, x: nextX, y: nextY }), false);
        return;
      }

      if (activeResize) {
        const deltaCols = toGridDelta(event.clientX - activeResize.startX, grid.colWidth, grid.gap);
        const deltaRows = toGridDelta(event.clientY - activeResize.startY, grid.rowHeight, grid.gap);
        const maxW = Math.max(1, grid.columns - activeResize.originX);
        const nextW = clamp(activeResize.originW + deltaCols, 1, maxW);
        const nextH = Math.max(1, activeResize.originH + deltaRows);

        if (nextW === activeResize.lastW && nextH === activeResize.lastH) return;
        activeResize.lastW = nextW;
        activeResize.lastH = nextH;

        updateWidget(activeResize.id, (widget) => ({ ...widget, w: nextW, h: nextH }), false);
      }
    },
    [updateWidget]
  );

  const handlePointerUp = React.useCallback(() => {
    if (!dragState.current && !resizeState.current) return;
    dragState.current = null;
    resizeState.current = null;
    setIsInteracting(false);
    if (onLayoutChange) {
      onLayoutChange(layoutRef.current);
    }
  }, [onLayoutChange]);

  React.useEffect(() => {
    if (!isInteracting) return;

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [handlePointerMove, handlePointerUp, isInteracting]);

  const gridStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: `repeat(${currentLayout.columns}, minmax(0, 1fr))`,
    gridAutoRows: `${currentLayout.rowHeight}px`,
    gridAutoFlow: "dense",
    gap: `${currentLayout.gap}px`,
    padding: `${currentLayout.gap}px`,
    userSelect: isInteracting ? "none" : "auto",
  };

  const addRow =
    currentLayout.widgets.reduce((acc, widget) => Math.max(acc, widget.y + widget.h), 0) + 1;

  return (
    <DataSourceContext.Provider value={dataSource}>
      <TimePresetsContext.Provider value={presetList}>
        <div className="obsd-dashboard-grid" style={gridStyle} ref={containerRef}>
          {currentLayout.widgets.map((widget) => (
            <WidgetFrame
              key={widget.id}
              config={widget}
              editable={editable}
              configOpen={configOpenId === widget.id}
              onToggleConfig={() =>
                setConfigOpenId((prev) => (prev === widget.id ? null : widget.id))
              }
              onUpdate={(updater) => updateWidget(widget.id, updater, true)}
              onDragStart={onDragStart}
              onResizeStart={onResizeStart}
            />
          ))}
          {editable ? (
            <AddWidgetTile
              columns={currentLayout.columns}
              row={addRow}
              onAdd={addWidget}
            />
          ) : null}
        </div>
      </TimePresetsContext.Provider>
    </DataSourceContext.Provider>
  );
};

const WidgetFrame: React.FC<{
  config: WidgetConfig;
  editable: boolean;
  configOpen: boolean;
  onToggleConfig: () => void;
  onUpdate: (updater: (widget: WidgetConfig) => WidgetConfig) => void;
  onDragStart: (event: React.PointerEvent, widget: WidgetConfig) => void;
  onResizeStart: (event: React.PointerEvent, widget: WidgetConfig) => void;
}> = ({
  config,
  editable,
  configOpen,
  onToggleConfig,
  onUpdate,
  onDragStart,
  onResizeStart,
}) => {
  const Component = WidgetRegistry[config.type];
  const style: React.CSSProperties = {
    gridColumn: `${config.x + 1} / span ${config.w}`,
    gridRow: `${config.y + 1} / span ${config.h}`,
    display: "flex",
    flexDirection: "column",
    background: "var(--background-primary)",
    border: "1px solid var(--background-modifier-border)",
    borderRadius: "10px",
    padding: "12px",
    overflow: "hidden",
    minWidth: 0,
    minHeight: 0,
    position: "relative",
  };

  const headerLabel = config.title ?? (editable ? "Widget" : undefined);

  return (
    <section
      className={`obsd-widget${configOpen && editable ? " is-editing" : ""}`}
      style={style}
    >
      {headerLabel ? (
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "8px",
            fontWeight: 600,
            marginBottom: configOpen ? "6px" : "8px",
            cursor: editable ? "grab" : "default",
            touchAction: editable ? "none" : "auto",
          }}
        >
          <span onPointerDown={editable ? (event) => onDragStart(event, config) : undefined}>
            {headerLabel}
          </span>
          {editable ? (
            <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
              <button className="obsd-widget-edit" onClick={onToggleConfig} type="button">
                {configOpen ? "Close" : "Edit"}
              </button>
            </div>
          ) : null}
        </header>
      ) : null}
      {configOpen && editable ? (
        <WidgetConfigPanel config={config} onUpdate={onUpdate} />
      ) : null}
      <div className="obsd-widget-body">
        <Component config={config} />
      </div>
      {editable ? (
        <div
          onPointerDown={(event) => onResizeStart(event, config)}
          title="Resize widget"
          style={{
            position: "absolute",
            right: "6px",
            bottom: "6px",
            width: "14px",
            height: "14px",
            cursor: "nwse-resize",
            borderRight: "2px solid var(--background-modifier-border)",
            borderBottom: "2px solid var(--background-modifier-border)",
            touchAction: "none",
          }}
        />
      ) : null}
    </section>
  );
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
    : [{ id: presetId, label: `Unknown (${presetId})`, type: "all" as const }, ...presets];

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

const WidgetConfigPanel: React.FC<{
  config: WidgetConfig;
  onUpdate: (updater: (widget: WidgetConfig) => WidgetConfig) => void;
}> = ({ config, onUpdate }) => {
  const timePresets = useTimePresets();
  const sharedFields = (
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

    return (
      <div className="obsd-widget-config">
        {sharedFields}
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
                onChange={(yamlFilters) => {
                  const next = [...filters];
                  next[index] = { ...filter, yamlFilters };
                  updateFilters(next);
                }}
              />
          {filters.length > 1 ? (
            <div className="obsd-widget-query-actions">
              <button
                type="button"
                className="obsd-widget-toggle"
                onClick={() => {
                  const next = filters.filter((_, i) => i !== index);
                  updateFilters(next);
                }}
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
          onClick={() => {
            updateFilters([...filters, { tags: "", folders: "", yamlFilters: [] }]);
          }}
        >
          + Add filter
        </button>
      </div>
          <div className="obsd-widget-config-note">Effective filter: {effectiveQuery}</div>
          <div className="obsd-widget-config-note">Tasks source: file.tasks</div>
        </div>
        <div className="obsd-widget-config-row">
          <label>Show completed</label>
          <input
            type="checkbox"
            checked={Boolean(config.showCompleted)}
            onChange={(event) => {
              onUpdate((widget) => ({
                ...widget,
                showCompleted: event.target.checked,
              }));
            }}
          />
        </div>
        <div className="obsd-widget-config-row">
          <label>Limit</label>
          <input
            type="number"
            value={config.limit === undefined ? "" : String(config.limit)}
            onChange={(event) => {
              const next = toOptionalNumber(event.target.value);
              onUpdate((widget) => ({
                ...widget,
                limit: next,
              }));
            }}
          />
        </div>
      </div>
    );
  }

  if (config.type === "stats") {
    const filters = ensureStatFilters(config.filters);
    const compareFilters = ensureStatFilters(config.compareFilters);
    const countTarget = config.countTarget ?? "files";
    const timeField = config.timeField ?? "modified";
    const timeRange = normalizeTimeRange(config.timeRange);
    const compareMode = config.compareMode ?? "none";
    const compareDisplay = config.compareDisplay ?? "number";
    const compareBasis = config.compareBasis ?? "total";
    const compareRange = normalizeTimeRange(config.compareRange);
    const effectiveQuery = buildQueryFromFilters(filters);
    const compareQuery = buildQueryFromFilters(compareFilters);
    const hasBoundedRange = rangeHasBounds(resolveTimeRange(timeRange, timePresets));

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

    return (
      <div className="obsd-widget-config">
        {sharedFields}
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
                onChange={(yamlFilters) => {
                  const next = [...filters];
                  next[index] = { ...filter, yamlFilters };
                  updateFilters(next);
                }}
              />
              {filters.length > 1 ? (
                <div className="obsd-widget-query-actions">
                  <button
                    type="button"
                    className="obsd-widget-toggle"
                    onClick={() => {
                      const next = filters.filter((_, i) => i !== index);
                      updateFilters(next);
                    }}
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
              onClick={() => {
                updateFilters([...filters, { tags: "", folders: "", yamlFilters: [] }]);
              }}
            >
              + Add filter
            </button>
          </div>
          <div className="obsd-widget-config-note">Effective filter: {effectiveQuery}</div>
        </div>
        <TimeRangeEditor
          timeField={timeField}
          timeRange={timeRange}
          onChange={({ timeField: nextField, timeRange: nextRange }) => {
            onUpdate((widget) => {
              if (widget.type !== "stats") return widget;
              return {
                ...widget,
                timeField: nextField ?? "modified",
                timeRange: nextRange,
              };
            });
          }}
        />
        <div className="obsd-widget-config-row">
          <label>Compare</label>
          <select
            value={compareMode}
            onChange={(event) => {
              const value = event.target.value as StatsCompareMode;
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
            <option value="filter">Compare filters</option>
          </select>
        </div>
        {compareMode !== "none" ? (
          <>
            <div className="obsd-widget-config-row">
              <label>Compare display</label>
              <select
                value={compareDisplay}
                onChange={(event) => {
                  const value = event.target.value as StatsCompareDisplay;
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
              <label>Compare basis</label>
              <select
                value={compareBasis}
                onChange={(event) => {
                  const value = event.target.value as StatsCompareBasis;
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
                <option value="per-day">Per-day average</option>
                </select>
            </div>
            <div className="obsd-widget-config-row">
              <label>Delta label</label>
              <input
                type="text"
                value={config.compareLabel ?? "Delta"}
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
          </>
        ) : null}
        {compareMode === "previous-period" && !hasBoundedRange ? (
          <div className="obsd-widget-config-note">
            Set a time range to compare against the previous period.
          </div>
        ) : null}
        {compareBasis === "per-day" && !hasBoundedRange ? (
          <div className="obsd-widget-config-note">
            Per-day averages require a bounded time range.
          </div>
        ) : null}
        {compareMode === "fixed-period" ? (
          <TimeRangeEditor
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
            showField={false}
            rangeLabel="Compare range"
          />
        ) : null}
        {compareMode === "filter" ? (
          <div className="obsd-widget-source">
            <div className="obsd-widget-config-note">
              Compare filters use the same time range as the main value.
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
                  onChange={(yamlFilters) => {
                    const next = [...compareFilters];
                    next[index] = { ...filter, yamlFilters };
                    updateCompareFilters(next);
                  }}
                />
                {compareFilters.length > 1 ? (
                  <div className="obsd-widget-query-actions">
                    <button
                      type="button"
                      className="obsd-widget-toggle"
                      onClick={() => {
                        const next = compareFilters.filter((_, i) => i !== index);
                        updateCompareFilters(next);
                      }}
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
                onClick={() => {
                  updateCompareFilters([
                    ...compareFilters,
                    { tags: "", folders: "", yamlFilters: [] },
                  ]);
                }}
              >
                + Add compare filter
              </button>
            </div>
            <div className="obsd-widget-config-note">Compare filter: {compareQuery}</div>
          </div>
        ) : null}
      </div>
    );
  }

  if (config.type === "status-bar") {
    const filters = ensureStatFilters(config.filters);
    const countTarget = config.countTarget ?? "files";
    const timeField = config.timeField ?? "modified";
    const timeRange = normalizeTimeRange(config.timeRange);
    const target = typeof config.target === "number" ? config.target : undefined;
    const effectiveQuery = buildQueryFromFilters(filters);

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

    return (
      <div className="obsd-widget-config">
        {sharedFields}
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
                onChange={(yamlFilters) => {
                  const next = [...filters];
                  next[index] = { ...filter, yamlFilters };
                  updateFilters(next);
                }}
              />
              {filters.length > 1 ? (
                <div className="obsd-widget-query-actions">
                  <button
                    type="button"
                    className="obsd-widget-toggle"
                    onClick={() => {
                      const next = filters.filter((_, i) => i !== index);
                      updateFilters(next);
                    }}
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
              onClick={() => {
                updateFilters([...filters, { tags: "", folders: "", yamlFilters: [] }]);
              }}
            >
              + Add filter
            </button>
          </div>
          <div className="obsd-widget-config-note">Effective filter: {effectiveQuery}</div>
        </div>
        <TimeRangeEditor
          timeField={timeField}
          timeRange={timeRange}
          onChange={({ timeField: nextField, timeRange: nextRange }) => {
            onUpdate((widget) => {
              if (widget.type !== "status-bar") return widget;
              return {
                ...widget,
                timeField: nextField ?? "modified",
                timeRange: nextRange,
              };
            });
          }}
        />
        <div className="obsd-widget-config-row">
          <label>Target</label>
          <input
            type="number"
            value={typeof target === "number" ? String(target) : ""}
            placeholder="14"
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
      </div>
    );
  }

  const chartConfig = config as PieChartWidgetConfig | LineChartWidgetConfig;

  const dataMode = getChartDataMode(chartConfig);
  const series = ensureChartSeries(chartConfig);
  const timeField = chartConfig.timeField ?? "modified";
  const timeRange = normalizeTimeRange(chartConfig.timeRange);

  return (
    <div className="obsd-widget-config">
      {sharedFields}
      <div className="obsd-widget-config-row">
        <label>Chart data mode</label>
        <select
          value={dataMode}
          onChange={(event) => {
            const value = event.target.value === "group" ? "group" : "series";
            onUpdate((widget) => {
              if (widget.type !== "pie-chart" && widget.type !== "line-chart") return widget;
              if (value === "group") {
                return { ...widget, dataMode: "group" };
              }
              const seeded = ensureChartSeries(widget);
              return {
                ...widget,
                dataMode: "series",
                series: seeded,
              };
            });
          }}
        >
          <option value="series">Series (Filters)</option>
          <option value="group">Group by field</option>
        </select>
      </div>

      {dataMode === "group" ? (
        <>
          <TimeRangeEditor
            timeField={timeField}
            timeRange={timeRange}
            onChange={({ timeField: nextField, timeRange: nextRange }) => {
              onUpdate((widget) => {
                if (widget.type !== "pie-chart" && widget.type !== "line-chart") return widget;
                return {
                  ...widget,
                  timeField: nextField ?? "modified",
                  timeRange: nextRange,
                };
              });
            }}
          />
          <div className="obsd-widget-config-row">
            <label>Filter tags</label>
            <input
              type="text"
              value={(chartConfig.filter?.tags ?? deriveFilterFromLegacyQuery(chartConfig.query).tags) || ""}
              placeholder="project, urgent"
              onChange={(event) => {
                const value = event.target.value;
                onUpdate((widget) => {
                  if (widget.type !== "pie-chart" && widget.type !== "line-chart") return widget;
                  const base = widget.filter ?? deriveFilterFromLegacyQuery(widget.query);
                  return {
                    ...widget,
                    filter: { ...base, tags: value },
                  };
                });
              }}
            />
          </div>
          <div className="obsd-widget-config-row">
            <label>Filter folders</label>
            <input
              type="text"
              value={(chartConfig.filter?.folders ?? deriveFilterFromLegacyQuery(chartConfig.query).folders) || ""}
              placeholder="Projects/2026"
              onChange={(event) => {
                const value = event.target.value;
                onUpdate((widget) => {
                  if (widget.type !== "pie-chart" && widget.type !== "line-chart") return widget;
                  const base = widget.filter ?? deriveFilterFromLegacyQuery(widget.query);
                  return {
                    ...widget,
                    filter: { ...base, folders: value },
                  };
                });
              }}
            />
          </div>
          <YamlFilterEditor
            yamlFilters={chartConfig.filter?.yamlFilters ?? []}
            labelPrefix="Filter"
            onChange={(yamlFilters) => {
              onUpdate((widget) => {
                if (widget.type !== "pie-chart" && widget.type !== "line-chart") return widget;
                const base = widget.filter ?? deriveFilterFromLegacyQuery(widget.query);
                return {
                  ...widget,
                  filter: { ...base, yamlFilters },
                };
              });
            }}
          />
          <div className="obsd-widget-config-row">
            <label>Group by</label>
            <select
              value={chartConfig.groupBy === "file" ? "file" : chartConfig.groupBy === "folder" ? "folder" : "tag"}
              onChange={(event) => {
                const value = event.target.value === "file"
                  ? "file"
                  : event.target.value === "folder"
                  ? "folder"
                  : "tag";
                onUpdate((widget) => ({
                  ...widget,
                  groupBy: value,
                }));
              }}
            >
              <option value="tag">Tag</option>
              <option value="file">File</option>
              <option value="folder">Folder</option>
            </select>
          </div>
          <div className="obsd-widget-config-row">
            <label>Limit</label>
            <input
              type="number"
              value={chartConfig.limit === undefined ? "" : String(chartConfig.limit)}
              onChange={(event) => {
                const next = toOptionalNumber(event.target.value);
                onUpdate((widget) => ({
                  ...widget,
                  limit: next,
                }));
              }}
            />
          </div>
        </>
      ) : (
        <div className="obsd-widget-source">
          {series.map((entry, index) => (
            <div className="obsd-widget-series" key={entry.id ?? `series-${index}`}>
              <div className="obsd-widget-config-row">
                <label>Label</label>
                <input
                  type="text"
                  value={entry.label}
                  placeholder={`Series ${index + 1}`}
                  onChange={(event) => {
                    const next = [...series];
                    next[index] = { ...entry, label: event.target.value };
                    onUpdate((widget) => updateChartSeries(widget, next));
                  }}
                />
              </div>
              <div className="obsd-widget-config-row">
                <label>Count</label>
                <select
                  value={entry.countMode ?? "pages"}
                  onChange={(event) => {
                    const value = event.target.value === "tasks" ? "tasks" : "pages";
                    const next = [...series];
                    next[index] = { ...entry, countMode: value };
                    onUpdate((widget) => updateChartSeries(widget, next));
                  }}
                >
                  <option value="pages">Files</option>
                  <option value="tasks">Tasks</option>
                </select>
              </div>
              <div className="obsd-widget-config-row">
                <label>Filter tags</label>
                <input
                  type="text"
                  value={entry.filter?.tags ?? ""}
                  placeholder="project, urgent"
                  onChange={(event) => {
                    const next = [...series];
                    next[index] = {
                      ...entry,
                      filter: { ...entry.filter, tags: event.target.value },
                    };
                    onUpdate((widget) => updateChartSeries(widget, next));
                  }}
                />
              </div>
              <div className="obsd-widget-config-row">
                <label>Filter folders</label>
                <input
                  type="text"
                  value={entry.filter?.folders ?? ""}
                  placeholder="Projects/2026"
                  onChange={(event) => {
                    const next = [...series];
                    next[index] = {
                      ...entry,
                      filter: { ...entry.filter, folders: event.target.value },
                    };
                    onUpdate((widget) => updateChartSeries(widget, next));
                  }}
                />
              </div>
              <YamlFilterEditor
                yamlFilters={entry.filter?.yamlFilters ?? []}
                labelPrefix={`Series ${index + 1}`}
                onChange={(yamlFilters) => {
                  const next = [...series];
                  next[index] = {
                    ...entry,
                    filter: { ...entry.filter, yamlFilters },
                  };
                  onUpdate((widget) => updateChartSeries(widget, next));
                }}
              />
              <TimeRangeEditor
                timeField={entry.timeField ?? "modified"}
                timeRange={normalizeTimeRange(entry.timeRange)}
                onChange={({ timeField: nextField, timeRange: nextRange }) => {
                  const next = [...series];
                  next[index] = {
                    ...entry,
                    timeField: nextField ?? "modified",
                    timeRange: nextRange,
                  };
                  onUpdate((widget) => updateChartSeries(widget, next));
                }}
                rangeLabel="Series time range"
              />
              {series.length > 1 ? (
                <div className="obsd-widget-query-actions">
                  <button
                    type="button"
                    className="obsd-widget-toggle"
                    onClick={() => {
                      const next = series.filter((_, i) => i !== index);
                      onUpdate((widget) => updateChartSeries(widget, next));
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
                const next = [
                  ...series,
                  {
                    id: `series-${Date.now()}`,
                    label: `Series ${series.length + 1}`,
                    filter: { tags: "", folders: "", yamlFilters: [] },
                    countMode: "pages",
                    timeField: "modified",
                    timeRange: { preset: "all" },
                  },
                ];
                onUpdate((widget) => updateChartSeries(widget, next));
              }}
            >
              + Add series
            </button>
          </div>
          <div className="obsd-widget-config-note">
            Effective filter: {combineChartQueries(series)}
          </div>
          {series.some((entry) => entry.countMode === "tasks") ? (
            <div className="obsd-widget-config-note">Task counts use file.tasks from Dataview pages.</div>
          ) : null}
        </div>
      )}
    </div>
  );
};

const AddWidgetTile: React.FC<{
  columns: number;
  row: number;
  onAdd: (type: WidgetType) => void;
}> = ({ columns, row, onAdd }) => {
  const [open, setOpen] = React.useState(false);
  const tileRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!open) return;

    const handler = (event: MouseEvent) => {
      if (!tileRef.current) return;
      if (tileRef.current.contains(event.target as Node)) return;
      setOpen(false);
    };

    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [open]);

  const style: React.CSSProperties = {
    gridColumn: `1 / span ${columns}`,
    gridRow: `${row} / span 1`,
    border: "2px dashed var(--background-modifier-border)",
    borderRadius: "10px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "var(--text-muted)",
    position: "relative",
    minHeight: "60px",
  };

  return (
    <div ref={tileRef} className="obsd-add-tile" style={style}>
      <button
        type="button"
        className="obsd-add-button"
        onClick={() => setOpen((prev) => !prev)}
      >
        + Add widget
      </button>
      {open ? (
        <AddWidgetMenu
          onSelect={(type) => {
            onAdd(type);
            setOpen(false);
          }}
        />
      ) : null}
    </div>
  );
};

const AddWidgetMenu: React.FC<{ onSelect: (type: WidgetType) => void }> = ({
  onSelect,
}) => {
  return (
    <div className="obsd-add-menu">
      <div className="obsd-add-menu-section">
        <div className="obsd-add-menu-title">Charts</div>
        <button
          type="button"
          className="obsd-add-menu-item"
          onClick={() => onSelect("pie-chart")}
        >
          Pie chart
        </button>
        <button
          type="button"
          className="obsd-add-menu-item"
          onClick={() => onSelect("line-chart")}
        >
          Line chart
        </button>
      </div>
      <div className="obsd-add-menu-section">
        <div className="obsd-add-menu-title">Tasks</div>
        <button
          type="button"
          className="obsd-add-menu-item"
          onClick={() => onSelect("task-list")}
        >
          Task list
        </button>
      </div>
      <div className="obsd-add-menu-section">
        <div className="obsd-add-menu-title">Stats</div>
        <button
          type="button"
          className="obsd-add-menu-item"
          onClick={() => onSelect("stats")}
        >
          Stat number
        </button>
        <button
          type="button"
          className="obsd-add-menu-item"
          onClick={() => onSelect("status-bar")}
        >
          Status bar
        </button>
      </div>
    </div>
  );
};

const TaskListWidget: React.FC<WidgetComponentProps<TaskListWidgetConfig>> = ({
  config,
}) => {
  const dataSource = useDataSource();
  const [tasks, setTasks] = React.useState<Task[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const filters = ensureTaskFilters(config);

  React.useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const results = await queryTasksForFilters(dataSource, filters);
        const filtered = config.showCompleted
          ? results
          : results.filter((task) => !task.completed);
        const limited =
          typeof config.limit === "number" ? filtered.slice(0, config.limit) : filtered;
        if (!cancelled) setTasks(limited);
      } catch {
        if (!cancelled) setError("Failed to load tasks");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [dataSource, filters, config.showCompleted, config.limit]);

  const toggleTask = async (task: Task) => {
    if (task.line < 0) return;
    const ok = await dataSource.toggleTask(task.path, task.line);
    if (!ok) return;
    setTasks((prev) =>
      prev.map((item) =>
        item.path === task.path && item.line === task.line
          ? { ...item, completed: !item.completed, checked: !item.checked }
          : item
      )
    );
  };

  if (loading) return <div>Loading tasks...</div>;
  if (error) return <div>{error}</div>;
  if (tasks.length === 0) return <div>No tasks found.</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      {tasks.map((task) => (
        <label
          key={`${task.path}:${task.line}`}
          style={{ display: "flex", alignItems: "center", gap: "8px" }}
        >
          <input
            type="checkbox"
            checked={task.completed}
            onChange={() => toggleTask(task)}
          />
          <span
            style={{
              textDecoration: task.completed ? "line-through" : "none",
              color: task.completed ? "var(--text-muted)" : "var(--text-normal)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={task.text}
          >
            {task.text}
          </span>
        </label>
      ))}
    </div>
  );
};

const StatusBarWidget: React.FC<WidgetComponentProps<StatusBarWidgetConfig>> = ({
  config,
}) => {
  const dataSource = useDataSource();
  const timePresets = useTimePresets();
  const [value, setValue] = React.useState<number | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const filters = ensureStatFilters(config.filters);
  const countTarget = config.countTarget ?? "files";
  const timeField = config.timeField ?? "modified";
  const timeRange = normalizeTimeRange(config.timeRange);
  const target = typeof config.target === "number" ? config.target : null;

  React.useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const resolvedRange = resolveTimeRange(timeRange, timePresets);
        const result = await countByTarget(
          dataSource,
          countTarget,
          filters,
          timeField,
          resolvedRange
        );
        if (!cancelled) setValue(result.count);
      } catch {
        if (!cancelled) setError("Failed to load status");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [dataSource, countTarget, filters, timeField, timeRange, timePresets]);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>{error}</div>;
  if (value === null) return <div>No data.</div>;

  const targetValue = target ?? 0;
  const ratio = targetValue > 0 ? Math.min(1, value / targetValue) : 0;
  const percent = targetValue > 0 ? Math.round((value / targetValue) * 100) : 0;

  return (
    <div className="obsd-status">
      <div className="obsd-status-value">
        {targetValue > 0 ? `${value} / ${targetValue}` : String(value)}
      </div>
      <div className="obsd-status-bar">
        <div
          className="obsd-status-bar-fill"
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
      {targetValue > 0 ? (
        <div className="obsd-status-caption">{percent}%</div>
      ) : null}
    </div>
  );
};

const StatsWidget: React.FC<WidgetComponentProps<StatsWidgetConfig>> = ({
  config,
}) => {
  const dataSource = useDataSource();
  const timePresets = useTimePresets();
  const [primaryValue, setPrimaryValue] = React.useState<number | null>(null);
  const [compareValue, setCompareValue] = React.useState<number | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const filters = ensureStatFilters(config.filters);
  const compareFilters = ensureStatFilters(config.compareFilters);
  const countTarget = config.countTarget ?? "files";
  const timeField = config.timeField ?? "modified";
  const timeRange = normalizeTimeRange(config.timeRange);
  const compareRange = normalizeTimeRange(config.compareRange);
  const compareMode = config.compareMode ?? "none";
  const compareDisplay = config.compareDisplay ?? "number";
  const compareBasis = config.compareBasis ?? "total";
  const compareLabel = (config.compareLabel ?? "Delta").trim();

  React.useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const resolvedRange = resolveTimeRange(timeRange, timePresets);
        const baseResult = await countByTarget(
          dataSource,
          countTarget,
          filters,
          timeField,
          resolvedRange
        );
        const baseMetric = applyComparisonBasis(baseResult, compareBasis);

        let compareMetric: number | null = null;
        if (compareMode === "previous-period") {
          const previous = derivePreviousRange(resolvedRange);
          if (previous) {
            const compareResult = await countByTarget(
              dataSource,
              countTarget,
              filters,
              timeField,
              previous
            );
            compareMetric = applyComparisonBasis(compareResult, compareBasis);
          }
        } else if (compareMode === "fixed-period") {
          const fixedRange = resolveTimeRange(compareRange, timePresets);
          const compareResult = await countByTarget(
            dataSource,
            countTarget,
            filters,
            timeField,
            fixedRange
          );
          compareMetric = applyComparisonBasis(compareResult, compareBasis);
        } else if (compareMode === "filter") {
          const compareResult = await countByTarget(
            dataSource,
            countTarget,
            compareFilters,
            timeField,
            resolvedRange
          );
          compareMetric = applyComparisonBasis(compareResult, compareBasis);
        }

        if (!cancelled) {
          setPrimaryValue(baseMetric);
          setCompareValue(compareMetric);
        }
      } catch {
        if (!cancelled) setError("Failed to load stats");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [
    dataSource,
    countTarget,
    filters,
    compareFilters,
    timeField,
    timeRange,
    compareRange,
    compareMode,
    compareBasis,
    timePresets,
  ]);

  if (loading) return <div>Loading stats...</div>;
  if (error) return <div>{error}</div>;
  if (primaryValue === null) return <div>No data.</div>;

  const baseDecimals = compareBasis === "per-day" ? 1 : 0;
  const formattedPrimary = formatNumber(primaryValue, baseDecimals);

  let deltaText: string | null = null;
  if (compareValue !== null) {
    if (compareDisplay === "percent") {
      if (compareValue === 0) {
        deltaText = compareLabel ? `${compareLabel} n/a` : "n/a";
      } else {
        const deltaPercent = ((primaryValue - compareValue) / compareValue) * 100;
        deltaText = `${compareLabel ? `${compareLabel} ` : ""}${formatSigned(
          deltaPercent,
          1
        )}%`;
      }
    } else {
      const delta = primaryValue - compareValue;
      deltaText = `${compareLabel ? `${compareLabel} ` : ""}${formatSigned(
        delta,
        baseDecimals
      )}`;
    }
  }

  return (
    <div className="obsd-stat">
      {compareBasis === "per-day" ? (
        <div className="obsd-stat-caption">Avg / day</div>
      ) : null}
      <div className="obsd-stat-value">{formattedPrimary}</div>
      {deltaText ? <div className="obsd-stat-compare">{deltaText}</div> : null}
    </div>
  );
};

const PieChartWidget: React.FC<WidgetComponentProps<PieChartWidgetConfig>> = ({
  config,
}) => {
  const dataSource = useDataSource();
  const timePresets = useTimePresets();
  const [data, setData] = React.useState<Array<{ name: string; value: number }>>(
    []
  );
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const dataMode = getChartDataMode(config);
        if (dataMode === "group") {
          const timeField = config.timeField ?? "modified";
          const timeRange = resolveTimeRange(
            normalizeTimeRange(config.timeRange),
            timePresets
          );
          const filter = config.filter ?? deriveFilterFromLegacyQuery(config.query);
          const pages = await queryPagesForFilters(dataSource, [filter]);
          const filteredPages = filterPagesByTime(pages, timeField, timeRange);
          const grouped = groupPages(filteredPages, config.groupBy, config.limit);
          if (!cancelled) setData(grouped);
        } else {
          const series = ensureChartSeries(config);
          const seriesData = await buildSeriesCounts(dataSource, series, timePresets);
          if (!cancelled) setData(seriesData);
        }
      } catch {
        if (!cancelled) setError("Failed to load chart data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [
    dataSource,
    config.query,
    config.filter,
    config.groupBy,
    config.limit,
    config.dataMode,
    config.series,
    config.timeField,
    config.timeRange,
    timePresets,
  ]);

  if (loading) return <div>Loading chart...</div>;
  if (error) return <div>{error}</div>;
  if (data.length === 0) return <div>No data available.</div>;

  return (
    <div className="obsd-chart">
      <div className="obsd-chart-area">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius="45%"
              outerRadius="75%"
              paddingAngle={2}
              cx="50%"
              cy="50%"
            >
              {data.map((entry, index) => (
                <Cell
                  key={`${entry.name}-${index}`}
                  fill={CHART_COLORS[index % CHART_COLORS.length]}
                />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="obsd-chart-legend">
        {data.map((entry, index) => (
          <div className="obsd-chart-legend-item" key={`${entry.name}-${index}`}>
            <span
              className="obsd-chart-legend-swatch"
              style={{ background: CHART_COLORS[index % CHART_COLORS.length] }}
            />
            <span className="obsd-chart-legend-label">{entry.name}</span>
            <span className="obsd-chart-legend-value">{entry.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const LineChartWidget: React.FC<WidgetComponentProps<LineChartWidgetConfig>> = ({
  config,
}) => {
  const dataSource = useDataSource();
  const timePresets = useTimePresets();
  const [data, setData] = React.useState<Array<{ name: string; value: number }>>(
    []
  );
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const dataMode = getChartDataMode(config);
        if (dataMode === "group") {
          const timeField = config.timeField ?? "modified";
          const timeRange = resolveTimeRange(
            normalizeTimeRange(config.timeRange),
            timePresets
          );
          const filter = config.filter ?? deriveFilterFromLegacyQuery(config.query);
          const pages = await queryPagesForFilters(dataSource, [filter]);
          const filteredPages = filterPagesByTime(pages, timeField, timeRange);
          const grouped = groupPages(filteredPages, config.groupBy, config.limit);
          if (!cancelled) setData(grouped);
        } else {
          const series = ensureChartSeries(config);
          const seriesData = await buildSeriesCounts(dataSource, series, timePresets);
          if (!cancelled) setData(seriesData);
        }
      } catch {
        if (!cancelled) setError("Failed to load chart data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [
    dataSource,
    config.query,
    config.filter,
    config.groupBy,
    config.limit,
    config.dataMode,
    config.series,
    config.timeField,
    config.timeRange,
    timePresets,
  ]);

  if (loading) return <div>Loading chart...</div>;
  if (error) return <div>{error}</div>;
  if (data.length === 0) return <div>No data available.</div>;

  return (
    <div style={{ width: "100%", height: "100%", minHeight: "140px" }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" tick={{ fontSize: 10 }} />
          <YAxis allowDecimals={false} />
          <Tooltip />
          <Line
            type="monotone"
            dataKey="value"
            stroke="#2b6cb0"
            strokeWidth={2}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

const WidgetRegistry: Record<WidgetType, React.FC<WidgetComponentProps<any>>> = {
  "task-list": TaskListWidget,
  stats: StatsWidget,
  "status-bar": StatusBarWidget,
  "pie-chart": PieChartWidget,
  "line-chart": LineChartWidget,
};

const groupPages = (
  pages: Page[],
  groupBy: string,
  limit?: number
): Array<{ name: string; value: number }> => {
  const counts = new Map<string, number>();

  for (const page of pages) {
    if (groupBy === "tag") {
      const tags = page.tags ?? [];
      if (tags.length === 0) {
        increment(counts, "(untagged)");
      } else {
        for (const tag of tags) increment(counts, tag);
      }
      continue;
    }

    if (groupBy === "folder") {
      const folder = page.path.includes("/")
        ? page.path.split("/").slice(0, -1).join("/")
        : "(root)";
      increment(counts, folder || "(root)");
      continue;
    }

    if (groupBy === "file") {
      const label = page.name || page.path || "(unknown)";
      increment(counts, label);
      continue;
    }

    const value = page.frontmatter?.[groupBy];
    if (Array.isArray(value)) {
      if (value.length === 0) {
        increment(counts, "(empty)");
      } else {
        for (const entry of value) increment(counts, String(entry));
      }
      continue;
    }

    if (value === null || value === undefined || value === "") {
      increment(counts, "(empty)");
    } else {
      increment(counts, String(value));
    }
  }

  const entries = Array.from(counts.entries()).map(([name, value]) => ({
    name,
    value,
  }));

  entries.sort((a, b) => b.value - a.value);
  return typeof limit === "number" ? entries.slice(0, limit) : entries;
};

const increment = (map: Map<string, number>, key: string) => {
  map.set(key, (map.get(key) ?? 0) + 1);
};

function parseTags(value: string): string[] {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

type ResolvedTimeRange = {
  start?: Date;
  end?: Date;
  days?: number;
};

function normalizeTimeRange(range?: TimeRangeConfig): TimeRangeConfig {
  if (!range) return { preset: "all" };
  return {
    preset: range.preset ?? "all",
    start: range.start,
    end: range.end,
  };
}

function resolveTimeRange(
  range: TimeRangeConfig,
  presets: TimePreset[],
  now = new Date()
): ResolvedTimeRange {
  if (!range) return {};
  const presetId = range.preset ?? "all";

  if (presetId === CUSTOM_RANGE_ID) {
    const start = parseDateInput(range.start, false);
    const end = parseDateInput(range.end, true);
    return finalizeRange(start, end);
  }

  const preset = presets.find((entry) => entry.id === presetId);
  if (!preset || preset.type === "all") return {};

  if (preset.type === "relative") {
    const todayStart = startOfDay(now);
    const start =
      typeof preset.startOffsetDays === "number"
        ? addDays(todayStart, preset.startOffsetDays)
        : undefined;
    const end =
      typeof preset.endOffsetDays === "number"
        ? endOfDay(addDays(todayStart, preset.endOffsetDays))
        : undefined;
    return finalizeRange(start, end);
  }

  if (preset.type === "calendar" && preset.calendar && isCalendarPreset(preset.calendar)) {
    return resolveCalendarRange(preset.calendar, now);
  }

  return {};
}

function derivePreviousRange(range: ResolvedTimeRange): ResolvedTimeRange | null {
  if (!range.start || !range.end || !range.days) return null;
  const previousEnd = new Date(range.start.getTime() - 1);
  const previousStart = addDays(startOfDay(previousEnd), -(range.days - 1));
  return {
    start: previousStart,
    end: endOfDay(previousEnd),
    days: range.days,
  };
}

function rangeHasBounds(range: ResolvedTimeRange): boolean {
  return Boolean(range.start && range.end);
}

function parseDateInput(value?: string, endOfDayFlag = false): Date | undefined {
  if (!value) return undefined;
  const parts = value.split("-").map(Number);
  if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) return undefined;
  const [year, month, day] = parts;
  const date = new Date(year, month - 1, day);
  return endOfDayFlag ? endOfDay(date) : startOfDay(date);
}

function finalizeRange(start?: Date, end?: Date): ResolvedTimeRange {
  if (!start && !end) return {};
  const normalizedStart = start ? startOfDay(start) : undefined;
  const normalizedEnd = end ? endOfDay(end) : undefined;
  const days =
    normalizedStart && normalizedEnd
      ? Math.max(
          1,
          Math.floor((normalizedEnd.getTime() - normalizedStart.getTime()) / MS_PER_DAY) + 1
        )
      : undefined;
  return { start: normalizedStart, end: normalizedEnd, days };
}

function resolveCalendarRange(kind: string, now: Date): ResolvedTimeRange {
  if (kind === "this-week") {
    return finalizeRange(startOfWeek(now), endOfDay(now));
  }
  if (kind === "last-week") {
    const currentWeekStart = startOfWeek(now);
    const lastWeekEnd = addDays(currentWeekStart, -1);
    const lastWeekStart = addDays(currentWeekStart, -7);
    return finalizeRange(startOfDay(lastWeekStart), endOfDay(lastWeekEnd));
  }
  if (kind === "this-month") {
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    return finalizeRange(startOfDay(monthStart), endOfDay(now));
  }
  if (kind === "last-month") {
    const firstOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthEnd = addDays(firstOfThisMonth, -1);
    const lastMonthStart = new Date(lastMonthEnd.getFullYear(), lastMonthEnd.getMonth(), 1);
    return finalizeRange(startOfDay(lastMonthStart), endOfDay(lastMonthEnd));
  }
  if (kind === "this-year") {
    const yearStart = new Date(now.getFullYear(), 0, 1);
    return finalizeRange(startOfDay(yearStart), endOfDay(now));
  }
  if (kind === "last-year") {
    const yearStart = new Date(now.getFullYear() - 1, 0, 1);
    const yearEnd = new Date(now.getFullYear() - 1, 11, 31);
    return finalizeRange(startOfDay(yearStart), endOfDay(yearEnd));
  }
  return {};
}

function parseDateValue(value?: string): Date | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function startOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

function startOfWeek(date: Date): Date {
  const next = new Date(date);
  const day = next.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  next.setDate(next.getDate() + diff);
  return startOfDay(next);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function deriveFilterFromLegacyQuery(query: string): QueryFilter {
  if (!query) return { tags: "", folders: "", yamlFilters: [] };
  const tagMatches = Array.from(query.matchAll(/#([A-Za-z0-9/_-]+)/g)).map(
    (match) => match[1]
  );
  const folderMatches = Array.from(query.matchAll(/"([^"]+)"/g)).map(
    (match) => match[1]
  );

  return {
    tags: tagMatches.join(", "),
    folders: folderMatches.join(", "),
    yamlFilters: [],
  };
}

function ensureTaskFilters(config: TaskListWidgetConfig): QueryFilter[] {
  if (Array.isArray(config.filters) && config.filters.length > 0) {
    return config.filters;
  }
  const legacyTags = (config as TaskListWidgetConfig & { tagFilter?: string }).tagFilter;
  if (legacyTags) {
    return [{ tags: legacyTags, folders: "", yamlFilters: [] }];
  }
  if (config.filter) {
    return [deriveFilterFromLegacyQuery(config.filter)];
  }
  return [{ tags: "", folders: "", yamlFilters: [] }];
}

function buildQueryFromFilters(filters: QueryFilter[]): string {
  if (filters.length === 0) return "";

  const queries = filters.map((filter) => buildQueryFromFilter(filter));
  if (queries.some((query) => query.length === 0)) {
    return "";
  }

  const parts = queries.filter((query) => query.length > 0);

  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];

  return parts.map((query) => `(${query})`).join(" OR ");
}

function buildQueryFromFilter(filter: QueryFilter): string {
  const tagsExpr = buildTagsExpression(filter.tags ?? "");
  const folderExpr = buildFoldersExpression(filter.folders ?? "");
  const yamlExpr = buildYamlExpression(filter.yamlFilters ?? []);

  const parts = [folderExpr, tagsExpr, yamlExpr].filter((part) => part.length > 0);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  return parts.map((part) => `(${part})`).join(" AND ");
}

function buildSourceFromFilter(filter: QueryFilter): string {
  const tagsExpr = buildTagsExpression(filter.tags ?? "");
  const folderExpr = buildFoldersExpression(filter.folders ?? "");
  const parts = [folderExpr, tagsExpr].filter((part) => part.length > 0);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  return parts.map((part) => `(${part})`).join(" AND ");
}

function filterPagesByYaml(pages: Page[], yamlFilters: YamlFilter[]): Page[] {
  const active = normalizeYamlFilters(yamlFilters);
  if (active.length === 0) return pages;

  return pages.filter((page) => {
    const frontmatter = page.frontmatter ?? {};
    return active.every((filter) => {
      const value = (frontmatter as Record<string, unknown>)[filter.key];
      return matchYamlValue(value, filter.values);
    });
  });
}

function normalizeYamlFilters(filters: YamlFilter[]): Array<{ key: string; values: string[] }> {
  if (!filters || filters.length === 0) return [];
  return filters
    .map((filter) => {
      const key = filter.key?.trim();
      const values = parseTags(filter.values ?? "");
      if (!key || values.length === 0) return null;
      return { key, values };
    })
    .filter((entry): entry is { key: string; values: string[] } => Boolean(entry));
}

function matchYamlValue(value: unknown, values: string[]): boolean {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) {
    return value.some((entry) => values.includes(String(entry)));
  }
  return values.includes(String(value));
}

function filterTasksByPages(tasks: Task[], pages: Page[]): Task[] {
  const allowed = new Set(pages.map((page) => page.path));
  return tasks.filter((task) => allowed.has(task.path));
}

async function queryPagesForFilters(
  dataSource: IDataSource,
  filters: QueryFilter[]
): Promise<Page[]> {
  const activeFilters = filters.length > 0 ? filters : [{ tags: "", folders: "", yamlFilters: [] }];
  const results = new Map<string, Page>();

  for (const filter of activeFilters) {
    const source = buildSourceFromFilter(filter);
    const pages = await dataSource.queryPages(source);
    const filtered = filter.yamlFilters?.length
      ? filterPagesByYaml(pages, filter.yamlFilters)
      : pages;
    for (const page of filtered) {
      results.set(page.path, page);
    }
  }

  return Array.from(results.values());
}

async function queryTasksForFilters(
  dataSource: IDataSource,
  filters: QueryFilter[]
): Promise<Task[]> {
  const activeFilters = filters.length > 0 ? filters : [{ tags: "", folders: "", yamlFilters: [] }];
  const results = new Map<string, Task>();

  for (const filter of activeFilters) {
    const source = buildSourceFromFilter(filter);
    let tasks = await dataSource.queryTasks(source);
    if (filter.yamlFilters?.length) {
      const pages = await dataSource.queryPages(source);
      const filteredPages = filterPagesByYaml(pages, filter.yamlFilters);
      tasks = filterTasksByPages(tasks, filteredPages);
    }
    for (const task of tasks) {
      const key = `${task.path}:${task.line}`;
      results.set(key, task);
    }
  }

  return Array.from(results.values());
}

function buildYamlExpression(filters: YamlFilter[]): string {
  if (!filters || filters.length === 0) return "";
  const clauses = filters
    .map((filter) => {
      const key = filter.key?.trim();
      if (!key) return "";
      const values = parseTags(filter.values ?? "");
      if (values.length === 0) return "";
      const escaped = values.map((value) => escapeQueryValue(value));
      const checks = escaped.map((value) => `contains(${key}, "${value}")`);
      if (checks.length === 1) return checks[0];
      return `(${checks.join(" OR ")})`;
    })
    .filter((clause) => clause.length > 0);

  if (clauses.length === 0) return "";
  if (clauses.length === 1) return clauses[0];
  return clauses.map((clause) => `(${clause})`).join(" AND ");
}

function escapeQueryValue(value: string): string {
  return value.replace(/"/g, '\\"');
}

function buildTagsExpression(value: string): string {
  const tags = parseTags(value);
  if (tags.length === 0) return "";
  const items = tags.map((tag) => (tag.startsWith("#") ? tag : `#${tag}`));
  return items.length > 1 ? `(${items.join(" OR ")})` : items[0];
}

function buildFoldersExpression(value: string): string {
  const folders = parseTags(value);
  if (folders.length === 0) return "";
  const items = folders.map((folder) => `"${folder}"`);
  return items.length > 1 ? `(${items.join(" OR ")})` : items[0];
}

function ensureStatFilters(filters?: QueryFilter[]): QueryFilter[] {
  if (Array.isArray(filters) && filters.length > 0) return filters;
  return [{ tags: "", folders: "", yamlFilters: [] }];
}

function filterPagesByTime(
  pages: Page[],
  field: TimeField,
  range: ResolvedTimeRange
): Page[] {
  if (!range.start && !range.end) return pages;
  return pages.filter((page) => {
    const value = field === "created" ? page.ctime : page.mtime;
    const date = parseDateValue(value);
    return isWithinRange(date, range);
  });
}

function filterTasksByTime(
  tasks: Task[],
  field: TimeField,
  range: ResolvedTimeRange
): Task[] {
  if (!range.start && !range.end) return tasks;
  return tasks.filter((task) => {
    const value = field === "created" ? task.fileCtime : task.fileMtime;
    const date = parseDateValue(value);
    return isWithinRange(date, range);
  });
}

function isWithinRange(date: Date | null, range: ResolvedTimeRange): boolean {
  if (!range.start && !range.end) return true;
  if (!date) return false;
  if (range.start && date < range.start) return false;
  if (range.end && date > range.end) return false;
  return true;
}

type CountResult = {
  count: number;
  days?: number;
};

async function countByTarget(
  dataSource: IDataSource,
  target: StatsCountTarget,
  filters: QueryFilter[],
  timeField: TimeField,
  range: ResolvedTimeRange
): Promise<CountResult> {
  if (target === "tasks") {
    const tasks = await queryTasksForFilters(dataSource, filters);
    const filtered = filterTasksByTime(tasks, timeField, range);
    return { count: filtered.length, days: range.days };
  }

  const pages = await queryPagesForFilters(dataSource, filters);
  const filtered = filterPagesByTime(pages, timeField, range);
  return { count: filtered.length, days: range.days };
}

function applyComparisonBasis(result: CountResult, basis: StatsCompareBasis): number {
  if (basis === "per-day" && result.days) {
    return result.count / result.days;
  }
  return result.count;
}

function formatNumber(value: number, decimals = 0): string {
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

function formatSigned(value: number, decimals = 0): string {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${formatNumber(Math.abs(value), decimals)}`;
}

function getChartDataMode(config: PieChartWidgetConfig | LineChartWidgetConfig): ChartDataMode {
  if (config.dataMode) return config.dataMode;
  if (Array.isArray(config.series) && config.series.length > 0) return "series";
  return "group";
}

function ensureChartSeries(
  config: PieChartWidgetConfig | LineChartWidgetConfig
): ChartSeriesConfig[] {
  if (Array.isArray(config.series) && config.series.length > 0) {
    return config.series.map((entry) => {
      if (entry.filter && entry.timeRange) return entry;
      const legacy = entry as ChartSeriesConfig & {
        easyFilterType?: "all" | "tag" | "folder";
        easyFilterValue?: string;
        rawQuery?: string;
      };
      if (legacy.rawQuery) {
        return {
          ...entry,
          filter: deriveFilterFromLegacyQuery(legacy.rawQuery),
          timeField: entry.timeField ?? "modified",
          timeRange: entry.timeRange ?? { preset: "all" },
        };
      }
      if (legacy.easyFilterType && legacy.easyFilterType !== "all") {
        if (legacy.easyFilterType === "folder") {
          return {
            ...entry,
            filter: { folders: legacy.easyFilterValue ?? "" },
            timeField: entry.timeField ?? "modified",
            timeRange: entry.timeRange ?? { preset: "all" },
          };
        }
        return {
          ...entry,
          filter: { tags: legacy.easyFilterValue ?? "" },
          timeField: entry.timeField ?? "modified",
          timeRange: entry.timeRange ?? { preset: "all" },
        };
      }
      return {
        ...entry,
        filter: entry.filter ?? { tags: "", folders: "", yamlFilters: [] },
        timeField: entry.timeField ?? "modified",
        timeRange: entry.timeRange ?? { preset: "all" },
      };
    });
  }

  const legacyQuery = config.query?.trim() ?? "";
  return [
    {
      id: "legacy-series",
      label: config.title ?? "Series 1",
      filter: legacyQuery
        ? deriveFilterFromLegacyQuery(legacyQuery)
        : { tags: "", folders: "", yamlFilters: [] },
      countMode: "pages",
      timeField: "modified",
      timeRange: { preset: "all" },
    },
  ];
}

function updateChartSeries(
  widget: WidgetConfig,
  series: ChartSeriesConfig[]
): WidgetConfig {
  if (widget.type !== "pie-chart" && widget.type !== "line-chart") return widget;
  return {
    ...widget,
    dataMode: "series",
    series,
  };
}

function combineChartQueries(series: ChartSeriesConfig[]): string {
  if (series.length === 0) return "";

  const queries = series.map((entry) => buildQueryFromFilter(entry.filter ?? {}));
  if (queries.some((query) => query.length === 0)) return "";
  const filtered = queries.filter((query) => query.length > 0);

  if (filtered.length === 0) return "";
  if (filtered.length === 1) return filtered[0];
  return filtered.map((query) => `(${query})`).join(" OR ");
}

async function buildSeriesCounts(
  dataSource: IDataSource,
  series: ChartSeriesConfig[],
  presets: TimePreset[]
): Promise<Array<{ name: string; value: number }>> {
  const results: Array<{ name: string; value: number }> = [];

  for (const entry of series) {
    const filter = entry.filter ?? { tags: "", folders: "", yamlFilters: [] };
    const query = buildQueryFromFilter(filter);
    const name = entry.label || query || "Series";
    const countMode = entry.countMode ?? "pages";
    const timeField = entry.timeField ?? "modified";
    const range = resolveTimeRange(normalizeTimeRange(entry.timeRange), presets);
    if (countMode === "tasks") {
      const tasks = await queryTasksForFilters(dataSource, [filter]);
      const filtered = filterTasksByTime(tasks, timeField, range);
      results.push({ name, value: filtered.length });
    } else {
      const pages = await queryPagesForFilters(dataSource, [filter]);
      const filtered = filterPagesByTime(pages, timeField, range);
      results.push({ name, value: filtered.length });
    }
  }

  return results;
}

const useGridMetrics = (
  ref: React.RefObject<HTMLDivElement>,
  layout: DashboardLayout
): GridMetrics | null => {
  const [metrics, setMetrics] = React.useState<GridMetrics | null>(null);

  React.useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;

    const update = () => {
      const width = node.clientWidth;
      const padding = layout.gap;
      const totalGap = layout.gap * (layout.columns - 1);
      const available = width - padding * 2 - totalGap;
      const colWidth = available > 0 ? available / layout.columns : 0;

      setMetrics({
        colWidth,
        rowHeight: layout.rowHeight,
        gap: layout.gap,
        columns: layout.columns,
        padding,
      });
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);

    return () => observer.disconnect();
  }, [layout.columns, layout.rowHeight, layout.gap, ref]);

  return metrics;
};

const toGridDelta = (delta: number, size: number, gap: number): number => {
  if (size <= 0) return 0;
  return Math.round(delta / (size + gap));
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

const toOptionalNumber = (value: string): number | undefined => {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
};

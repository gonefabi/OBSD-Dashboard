import * as React from "react";
import { IDataSource } from "../interfaces/IDataSource";
import { normalizeLayout, resolveCollisions } from "./layout/layoutUtils";
import {
  CUSTOM_RANGE_ID,
  DEFAULT_TIME_PRESETS,
  TimePreset,
  isCalendarPreset,
} from "./timePresets";
import { DataSourceContext, TimePresetsContext, useTimePresets } from "./widgetContext";
import {
  buildQueryFromFilter,
  buildQueryFromFilters,
  combineChartQueries,
  deriveFilterFromLegacyQuery,
  ensureTaskFilters,
  toGridDelta,
  toOptionalNumber,
  useGridMetrics,
} from "./utils/dashboardUtils";
import type {
  ChartCountMode,
  ChartDataMode,
  ChartSeriesConfig,
  DashboardLayout,
  HeaderAlign,
  HeaderIconPosition,
  LegendDisplay,
  LegendPosition,
  LineChartWidgetConfig,
  PieChartWidgetConfig,
  QueryFilter,
  StatsCompareBasis,
  StatsCompareDisplay,
  StatsCompareMode,
  StatsCountTarget,
  StatsIconPosition,
  StatsValueAlign,
  StatsWidgetConfig,
  StatusBarWidgetConfig,
  TaskListWidgetConfig,
  TimeField,
  TimeRangeConfig,
  WidgetBaseConfig,
  WidgetConfig,
  WidgetType,
  YamlFilter,
} from "./types";
import { LineChartWidget } from "./widgets/LineChartWidget";
import { LucideIcon } from "./widgets/LucideIcon";
import { PieChartWidget } from "./widgets/PieChartWidget";
import { StatsWidget } from "./widgets/StatsWidget";
import { StatusBarWidget } from "./widgets/StatusBarWidget";
import { TaskListWidget } from "./widgets/TaskListWidget";
import type { WidgetComponentProps } from "./widgets/types";


export interface DashboardViewProps {
  dataSource: IDataSource;
  layout: DashboardLayout;
  timePresets?: TimePreset[];
  editable?: boolean;
  onLayoutChange?: (layout: DashboardLayout) => void;
}

// contexts are defined in widgetContext.ts

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
    padding: "10px",
    overflow: "hidden",
    minWidth: 0,
    minHeight: 0,
    position: "relative",
  };

  const showTitle = config.showTitle !== false;
  const headerLabel = showTitle
    ? config.title ?? (editable ? "Widget" : undefined)
    : undefined;
  const headerSize = typeof config.titleSize === "number" ? config.titleSize : undefined;
  const headerAlign = config.headerAlign === "right" ? "right" : "left";
  const headerIconName = config.headerIconName?.trim();
  const valueIconActive = config.type === "stats" && Boolean(config.iconName?.trim());
  const showHeaderIcon = Boolean(headerIconName) && !valueIconActive;
  const headerIconPosition = config.headerIconPosition === "right" ? "right" : "left";
  const headerHasBody = Boolean(headerLabel || showHeaderIcon);
  const hasHeaderContent = headerHasBody || editable;

  return (
    <section
      className={`obsd-widget${configOpen && editable ? " is-editing" : ""}`}
      style={style}
    >
      {hasHeaderContent ? (
        <header
          className={`obsd-widget-header is-align-${headerAlign}`}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "8px",
            fontWeight: 600,
            fontSize: headerSize ? `${headerSize}px` : undefined,
            lineHeight: 1.2,
            marginBottom: headerHasBody ? (configOpen ? "4px" : "6px") : "0",
            cursor: editable ? "grab" : "default",
            touchAction: editable ? "none" : "auto",
            minHeight: headerHasBody ? undefined : "0",
            padding: headerHasBody ? undefined : "0",
            position: "relative",
            overflow: "visible",
          }}
        >
          <div
            className="obsd-widget-header-content"
            onPointerDown={editable ? (event) => onDragStart(event, config) : undefined}
          >
            {showHeaderIcon && headerIconPosition === "left" ? (
              <LucideIcon name={headerIconName} className="obsd-widget-header-icon" />
            ) : null}
            {headerLabel ? (
              <span className="obsd-widget-header-title">{headerLabel}</span>
            ) : null}
            {showHeaderIcon && headerIconPosition === "right" ? (
              <LucideIcon name={headerIconName} className="obsd-widget-header-icon" />
            ) : null}
          </div>
          {editable ? (
            <button
              className="obsd-widget-edit obsd-widget-edit-floating"
              onClick={onToggleConfig}
              type="button"
            >
              {configOpen ? "Close" : "Edit"}
            </button>
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

    const dataFields = (
      <>
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
      </>
    );

    const viewFields = viewSection(
      <>
        <div className="obsd-widget-config-row">
          <label>Value icon</label>
          <input
            type="text"
            value={config.iconName ?? ""}
            placeholder="calendar"
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
          <label>Value icon side</label>
          <select
            value={config.iconPosition ?? "left"}
            onChange={(event) => {
              const value = event.target.value === "right" ? "right" : "left";
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
        <div className="obsd-widget-config-row">
          <label>Value alignment</label>
          <select
            value={config.valueAlign ?? "center"}
            onChange={(event) => {
              const raw = event.target.value;
              const value = raw === "left" ? "left" : raw === "right" ? "right" : "center";
              onUpdate((widget) => {
                if (widget.type !== "stats") return widget;
                return {
                  ...widget,
                  valueAlign: value,
                };
              });
            }}
          >
            <option value="center">Centered</option>
            <option value="left">Left</option>
            <option value="right">Right</option>
          </select>
        </div>
        <div className="obsd-widget-config-note">
          Use any Lucide icon name. Leave empty to hide the value icon.
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

    const dataFields = (
      <>
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
      </>
    );

    return (
      <div className="obsd-widget-config">
        {tabs}
        {activeTab === "data" ? dataFields : viewSection()}
      </div>
    );
  }

  const chartConfig = config as PieChartWidgetConfig | LineChartWidgetConfig;

  const dataMode = getChartDataMode(chartConfig);
  const series = ensureChartSeries(chartConfig);
  const timeField = chartConfig.timeField ?? "modified";
  const timeRange = normalizeTimeRange(chartConfig.timeRange);

  const dataFields = (
    <>
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
    </>
  );

  const viewFields =
    config.type === "pie-chart"
      ? viewSection(
          <>
            <div className="obsd-widget-config-row">
              <label>Legend position</label>
              <select
                value={chartConfig.legendPosition ?? "auto"}
                onChange={(event) => {
                  const value = event.target.value as LegendPosition;
                  onUpdate((widget) => {
                    if (widget.type !== "pie-chart") return widget;
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
              <label>Legend labels</label>
              <select
                value={chartConfig.legendDisplay ?? "list"}
                onChange={(event) => {
                  const value = event.target.value as LegendDisplay;
                  onUpdate((widget) => {
                    if (widget.type !== "pie-chart") return widget;
                    return {
                      ...widget,
                      legendDisplay: value,
                    };
                  });
                }}
              >
                <option value="list">Show list</option>
                <option value="hover">Hover only</option>
              </select>
            </div>
          </>
        )
      : viewSection();

  return (
    <div className="obsd-widget-config">
      {tabs}
      {activeTab === "data" ? dataFields : viewFields}
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

const WidgetRegistry: Record<WidgetType, React.FC<WidgetComponentProps<any>>> = {
  "task-list": TaskListWidget,
  stats: StatsWidget,
  "status-bar": StatusBarWidget,
  "pie-chart": PieChartWidget,
  "line-chart": LineChartWidget,
};

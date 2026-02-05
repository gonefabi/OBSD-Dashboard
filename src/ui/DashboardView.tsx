// React root view for the dashboard grid + widget frame.
import * as React from "react";
import { IDataSource } from "../interfaces/IDataSource";
import { normalizeLayout, resolveCollisions } from "./layout/layoutUtils";
import { DEFAULT_TIME_PRESETS, TimePreset } from "./timePresets";
import { DataSourceContext, TimePresetsContext } from "./widgetContext";
import { toGridDelta, useGridMetrics } from "./utils/dashboardUtils";
import type {
  DashboardLayout,
  StatsWidgetConfig,
  StatusBarWidgetConfig,
  TaskListWidgetConfig,
  WidgetConfig,
  WidgetType,
} from "./types";
import {
  LineChartWidget,
  LucideIcon,
  PieChartWidget,
  StatsWidget,
  StatusBarWidget,
  TaskListWidget,
} from "./widgets";
import { WidgetConfigPanel } from "./widgets/config/WidgetConfigPanel";
import type { WidgetComponentProps } from "./widgets";


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

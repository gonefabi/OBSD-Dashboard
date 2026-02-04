import * as React from "react";
import {
  Pie,
  PieChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { IDataSource, Page, Task } from "../interfaces/IDataSource";
import { normalizeLayout, resolveCollisions } from "./layout/layoutUtils";

export type WidgetType = "task-list" | "pie-chart" | "line-chart";
export type TaskQueryMode = "raw" | "tags";

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
  queryMode?: TaskQueryMode;
  rawQuery?: string;
  rawQueries?: string[];
  tagFilter?: string;
  showCompleted?: boolean;
  limit?: number;
}

export interface PieChartWidgetConfig extends WidgetBaseConfig {
  type: "pie-chart";
  query: string;
  groupBy: "tag" | "folder" | string;
  limit?: number;
}

export interface LineChartWidgetConfig extends WidgetBaseConfig {
  type: "line-chart";
  query: string;
  groupBy: "tag" | "folder" | string;
  limit?: number;
}

export type WidgetConfig =
  | TaskListWidgetConfig
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
  editable?: boolean;
  defaultTaskQueryMode?: TaskQueryMode;
  onLayoutChange?: (layout: DashboardLayout) => void;
}

const DataSourceContext = React.createContext<IDataSource | null>(null);

export const useDataSource = (): IDataSource => {
  const context = React.useContext(DataSourceContext);
  if (!context) {
    throw new Error("DataSourceContext is missing. Wrap components with DashboardView.");
  }
  return context;
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
  editable = false,
  defaultTaskQueryMode = "tags",
  onLayoutChange,
}) => {
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
          queryMode: defaultTaskQueryMode,
          tagFilter: "",
          showCompleted: false,
          limit: 10,
        };
        if (defaultTaskQueryMode === "raw") {
          baseWidget.rawQueries = ["\"\""];
        }
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
        };
      }

      nextLayout.widgets = [...nextLayout.widgets, widget];
      const resolved = resolveCollisions(normalizeLayout(nextLayout), id);
      layoutRef.current = resolved;
      setCurrentLayout(resolved);
      if (onLayoutChange) onLayoutChange(resolved);
      setConfigOpenId(id);
    },
    [currentLayout, defaultTaskQueryMode, onLayoutChange]
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
      <div className="obsd-dashboard-grid" style={gridStyle} ref={containerRef}>
        {currentLayout.widgets.map((widget) => (
          <WidgetFrame
            key={widget.id}
            config={widget}
            editable={editable}
            defaultTaskQueryMode={defaultTaskQueryMode}
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
    </DataSourceContext.Provider>
  );
};

const WidgetFrame: React.FC<{
  config: WidgetConfig;
  editable: boolean;
  defaultTaskQueryMode: TaskQueryMode;
  configOpen: boolean;
  onToggleConfig: () => void;
  onUpdate: (updater: (widget: WidgetConfig) => WidgetConfig) => void;
  onDragStart: (event: React.PointerEvent, widget: WidgetConfig) => void;
  onResizeStart: (event: React.PointerEvent, widget: WidgetConfig) => void;
}> = ({
  config,
  editable,
  defaultTaskQueryMode,
  configOpen,
  onToggleConfig,
  onUpdate,
  onDragStart,
  onResizeStart,
}) => {
  const Component = WidgetRegistry[config.type];
  const taskMode =
    config.type === "task-list"
      ? getTaskQueryMode(config as TaskListWidgetConfig, defaultTaskQueryMode)
      : null;
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
    <section className="obsd-widget" style={style}>
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
              {configOpen && config.type === "task-list" ? (
                <>
                  <button
                    className={`obsd-widget-toggle ${
                      taskMode === "tags" ? "is-active" : ""
                    }`}
                    type="button"
                    onClick={() => {
                      onUpdate((widget) => {
                        if (widget.type !== "task-list") return widget;
                        const next = { ...widget, queryMode: "tags" as TaskQueryMode };
                        return next;
                      });
                    }}
                  >
                    Easy
                  </button>
                  <button
                    className={`obsd-widget-toggle ${
                      taskMode === "raw" ? "is-active" : ""
                    }`}
                    type="button"
                    onClick={() => {
                      onUpdate((widget) => {
                        if (widget.type !== "task-list") return widget;
                        const next = { ...widget, queryMode: "raw" as TaskQueryMode };
                        const existingQueries = getRawQueries(next);
                        if (existingQueries.length === 0) {
                          const fallback =
                            next.rawQuery ??
                            next.filter ??
                            buildTagQuery(next.tagFilter ?? "");
                          next.rawQueries = [fallback.trim().length > 0 ? fallback : "\"\""];
                        } else {
                          next.rawQueries = existingQueries;
                        }
                        return next;
                      });
                    }}
                  >
                    Source
                  </button>
                </>
              ) : null}
              <button className="obsd-widget-edit" onClick={onToggleConfig} type="button">
                {configOpen ? "Close" : "Edit"}
              </button>
            </div>
          ) : null}
        </header>
      ) : null}
      {configOpen && editable ? (
        <WidgetConfigPanel
          config={config}
          onUpdate={onUpdate}
          defaultTaskQueryMode={defaultTaskQueryMode}
        />
      ) : null}
      <div style={{ flex: 1, minHeight: 0 }}>
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

const WidgetConfigPanel: React.FC<{
  config: WidgetConfig;
  onUpdate: (updater: (widget: WidgetConfig) => WidgetConfig) => void;
  defaultTaskQueryMode: TaskQueryMode;
}> = ({ config, onUpdate, defaultTaskQueryMode }) => {
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
    const queryMode = getTaskQueryMode(config, defaultTaskQueryMode);
    const tagQuery = buildTagQuery(config.tagFilter ?? "");
    const rawQueries = getRawQueries(config);
    const displayQueries =
      rawQueries.length > 0 ? rawQueries : tagQuery.length > 0 ? [tagQuery] : ["\"\""];
    const effectiveQuery = combineRawQueries(displayQueries);

    const updateRawQueries = (queries: string[]) => {
      onUpdate((widget) => {
        if (widget.type !== "task-list") return widget;
        return {
          ...widget,
          queryMode: "raw",
          rawQueries: queries,
        };
      });
    };

    return (
      <div className="obsd-widget-config">
        {sharedFields}
        {queryMode === "raw" ? (
          <div className="obsd-widget-source">
            {displayQueries.map((query, index) => (
              <div className="obsd-widget-config-row" key={`raw-query-${index}`}>
                <label>{`Query ${index + 1}`}</label>
                <div className="obsd-widget-query-row">
                  <input
                    type="text"
                    value={query.trim().length === 0 ? "\"\"" : query}
                    placeholder={"#project or \"Folder\""}
                    onChange={(event) => {
                      const normalized = normalizeRawQueryInput(event.target.value);
                      const next = [...displayQueries];
                      next[index] =
                        normalized.trim().length === 0 ? "\"\"" : normalized;
                      updateRawQueries(next);
                    }}
                  />
                  {displayQueries.length > 1 ? (
                    <button
                      type="button"
                      className="obsd-widget-toggle"
                      onClick={() => {
                        const next = displayQueries.filter((_, i) => i !== index);
                        updateRawQueries(next.length > 0 ? next : ["\"\""]);
                      }}
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
            <div className="obsd-widget-query-actions">
              <button
                type="button"
                className="obsd-widget-toggle"
                onClick={() => {
                  updateRawQueries([...displayQueries, "\"\""]);
                }}
              >
                + Add query
              </button>
            </div>
            <div className="obsd-widget-config-note">Effective query: {effectiveQuery}</div>
            <div className="obsd-widget-config-note">Tasks source: file.tasks</div>
          </div>
        ) : (
          <div className="obsd-widget-config-row">
            <label>Tags (comma separated)</label>
            <input
              type="text"
              value={config.tagFilter ?? ""}
              placeholder="project, urgent"
              onChange={(event) => {
                const value = event.target.value;
                onUpdate((widget) => ({
                  ...widget,
                  tagFilter: value,
                }));
              }}
            />
          </div>
        )}
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

  const chartConfig = config as PieChartWidgetConfig | LineChartWidgetConfig;

  return (
    <div className="obsd-widget-config">
      {sharedFields}
      <div className="obsd-widget-config-row">
        <label>Raw Dataview query</label>
        <input
          type="text"
          value={chartConfig.query}
          placeholder=""
          onChange={(event) => {
            const value = event.target.value;
            onUpdate((widget) => ({
              ...widget,
              query: value,
            }));
          }}
        />
      </div>
      <div className="obsd-widget-config-row">
        <label>Group by</label>
        <input
          type="text"
          value={chartConfig.groupBy}
          placeholder="tag"
          onChange={(event) => {
            const value = event.target.value.trim() || "tag";
            onUpdate((widget) => ({
              ...widget,
              groupBy: value,
            }));
          }}
        />
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

  const taskQuery = buildTaskQuery(config);

  React.useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const results = await dataSource.queryTasks(taskQuery);
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
  }, [dataSource, taskQuery, config.showCompleted, config.limit]);

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

const PieChartWidget: React.FC<WidgetComponentProps<PieChartWidgetConfig>> = ({
  config,
}) => {
  const dataSource = useDataSource();
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
        const pages = await dataSource.queryPages(config.query);
        const grouped = groupPages(pages, config.groupBy, config.limit);
        if (!cancelled) setData(grouped);
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
  }, [dataSource, config.query, config.groupBy, config.limit]);

  if (loading) return <div>Loading chart...</div>;
  if (error) return <div>{error}</div>;
  if (data.length === 0) return <div>No data available.</div>;

  return (
    <div style={{ width: "100%", height: "100%", minHeight: "140px" }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={40}
            outerRadius={70}
            paddingAngle={2}
          >
            {data.map((entry, index) => (
              <Cell
                key={`${entry.name}-${index}`}
                fill={CHART_COLORS[index % CHART_COLORS.length]}
              />
            ))}
          </Pie>
          <Tooltip />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
};

const LineChartWidget: React.FC<WidgetComponentProps<LineChartWidgetConfig>> = ({
  config,
}) => {
  const dataSource = useDataSource();
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
        const pages = await dataSource.queryPages(config.query);
        const grouped = groupPages(pages, config.groupBy, config.limit);
        if (!cancelled) setData(grouped);
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
  }, [dataSource, config.query, config.groupBy, config.limit]);

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

function buildTaskQuery(config: TaskListWidgetConfig): string {
  const mode = getTaskQueryMode(config, "tags");

  if (mode === "tags") {
    return buildTagQuery(config.tagFilter ?? "");
  }

  const rawQueries = getRawQueries(config);
  const combined = combineRawQueries(rawQueries);
  return normalizeRawQueryInput(combined).trim();
}

function buildTagQuery(tagFilter: string): string {
  const tags = parseTags(tagFilter);
  if (tags.length === 0) return "";
  return tags.map((tag) => (tag.startsWith("#") ? tag : `#${tag}`)).join(" OR ");
}

function getTaskQueryMode(
  config: TaskListWidgetConfig,
  defaultMode: TaskQueryMode
): TaskQueryMode {
  if (config.queryMode) return config.queryMode;
  if (getRawQueries(config).length > 0) return "raw";
  if (config.tagFilter) return "tags";
  return defaultMode;
}

function getRawQueries(config: TaskListWidgetConfig): string[] {
  if (Array.isArray(config.rawQueries) && config.rawQueries.length > 0) {
    return config.rawQueries;
  }
  const legacy = config.rawQuery ?? config.filter ?? "";
  if (legacy.trim().length > 0) return [legacy];
  return [];
}

function combineRawQueries(queries: string[]): string {
  if (queries.length === 0) return "\"\"";

  const normalized = queries.map((query) => normalizeRawQueryInput(query).trim());
  const hasAll = normalized.some((query) => query.length === 0);
  if (hasAll) return "\"\"";

  const filtered = normalized.filter((query) => query.length > 0);
  if (filtered.length === 0) return "\"\"";
  if (filtered.length === 1) return filtered[0];

  return filtered.map((query) => `(${query})`).join(" OR ");
}

function parseTags(value: string): string[] {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}

function normalizeRawQueryInput(value: string): string {
  const trimmed = value.trim();
  if (trimmed === "\"\"" || trimmed === "''") return "";
  return value;
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

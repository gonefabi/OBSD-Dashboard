import type {
  DashboardLayout,
  PieChartWidgetConfig,
  LineChartWidgetConfig,
  TaskListWidgetConfig,
  WidgetConfig,
} from "../DashboardView";

export const cloneLayout = (layout: DashboardLayout): DashboardLayout =>
  JSON.parse(JSON.stringify(layout)) as DashboardLayout;

export const normalizeLayout = (layout: DashboardLayout): DashboardLayout => {
  const widgets = layout.widgets.map((widget) => {
    const w = Math.max(1, Math.floor(widget.w));
    const h = Math.max(1, Math.floor(widget.h));
    const x = clamp(Math.floor(widget.x), 0, Math.max(0, layout.columns - w));
    const y = Math.max(0, Math.floor(widget.y));
    const width = Math.min(w, layout.columns);
    return { ...widget, x, y, w: width, h };
  });

  return { ...layout, widgets };
};

export const resolveCollisions = (
  layout: DashboardLayout,
  movedId?: string
): DashboardLayout => {
  const widgets = layout.widgets.map((widget) => ({ ...widget }));
  const movedWidget = movedId ? widgets.find((widget) => widget.id === movedId) : undefined;
  const placed: WidgetConfig[] = [];
  const updates = new Map<string, WidgetConfig>();

  if (movedWidget) {
    placed.push(movedWidget);
    updates.set(movedWidget.id, movedWidget);
  }

  const others = widgets
    .filter((widget) => widget.id !== movedId)
    .sort((a, b) => (a.y !== b.y ? a.y - b.y : a.x - b.x));

  for (const widget of others) {
    let candidate = { ...widget };
    let guard = 0;
    while (hasCollision(candidate, placed)) {
      const nextY = nextAvailableY(candidate, placed);
      candidate = { ...candidate, y: nextY === candidate.y ? candidate.y + 1 : nextY };
      guard += 1;
      if (guard > 1000) break;
    }
    placed.push(candidate);
    updates.set(candidate.id, candidate);
  }

  const resolved = layout.widgets.map((widget) => updates.get(widget.id) ?? widget);
  return { ...layout, widgets: resolved };
};

export const isDashboardLayout = (value: unknown): value is DashboardLayout => {
  if (!value || typeof value !== "object") return false;
  const layout = value as DashboardLayout;
  if (!isNumber(layout.columns) || !isNumber(layout.rowHeight) || !isNumber(layout.gap)) {
    return false;
  }
  if (!Array.isArray(layout.widgets)) return false;
  return layout.widgets.every(isWidgetConfig);
};

const isWidgetConfig = (value: unknown): value is WidgetConfig => {
  if (!value || typeof value !== "object") return false;
  const widget = value as WidgetConfig;
  if (
    typeof widget.id !== "string" ||
    typeof widget.type !== "string" ||
    !isNumber(widget.x) ||
    !isNumber(widget.y) ||
    !isNumber(widget.w) ||
    !isNumber(widget.h)
  ) {
    return false;
  }

  if (widget.type === "task-list") {
    return isTaskListWidget(widget);
  }

  if (widget.type === "pie-chart") {
    return isPieChartWidget(widget);
  }

  if (widget.type === "line-chart") {
    return isLineChartWidget(widget);
  }

  return false;
};

const isTaskListWidget = (widget: WidgetConfig): widget is TaskListWidgetConfig => {
  const candidate = widget as TaskListWidgetConfig;
  return (
    typeof candidate.filter === "string" ||
    typeof candidate.rawQuery === "string" ||
    (Array.isArray(candidate.rawQueries) && candidate.rawQueries.every((entry) => typeof entry === "string")) ||
    typeof candidate.tagFilter === "string" ||
    candidate.queryMode === "raw" ||
    candidate.queryMode === "tags"
  );
};

const isPieChartWidget = (widget: WidgetConfig): widget is PieChartWidgetConfig => {
  const candidate = widget as PieChartWidgetConfig;
  return typeof candidate.query === "string" && typeof candidate.groupBy === "string";
};

const isLineChartWidget = (widget: WidgetConfig): widget is LineChartWidgetConfig => {
  const candidate = widget as LineChartWidgetConfig;
  return typeof candidate.query === "string" && typeof candidate.groupBy === "string";
};

const isNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const hasCollision = (widget: WidgetConfig, others: WidgetConfig[]): boolean =>
  others.some((other) => rectsOverlap(widget, other));

const rectsOverlap = (a: WidgetConfig, b: WidgetConfig): boolean => {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
};

const nextAvailableY = (widget: WidgetConfig, others: WidgetConfig[]): number => {
  let next = widget.y;
  for (const other of others) {
    const overlapsInX = widget.x < other.x + other.w && widget.x + widget.w > other.x;
    const overlapsInY = next < other.y + other.h && next + widget.h > other.y;
    if (overlapsInX && overlapsInY) {
      next = Math.max(next, other.y + other.h);
    }
  }
  return next;
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

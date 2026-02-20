// React root view for the dashboard grid + widget frame.
import * as React from "react";
import { IDataSource } from "../interfaces/IDataSource";
import { normalizeLayout, resolveCollisions } from "./layout/layoutUtils";
import { DEFAULT_TIME_PRESETS, TimePreset } from "./timePresets";
import { DataSourceContext, TimePresetsContext } from "./widgetContext";
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
  autoAlign?: boolean;
  onLayoutChange?: (layout: DashboardLayout) => void;
}

// contexts are defined in widgetContext.ts

type ContainerMetrics = {
  width: number;
  height: number;
  padding: number;
};

type DragState = {
  id: string;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  originW: number;
  originH: number;
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

type DragStartEvent = React.MouseEvent;

const MIN_WIDGET_WIDTH = 160;
const MIN_WIDGET_HEIGHT = 120;
const FALLBACK_WIDGET_WIDTH = 320;
const FALLBACK_WIDGET_HEIGHT = 220;
const SNAP_THRESHOLD = 24;
const RESIZE_SNAP_THRESHOLD = 36;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

type Rect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

type PositionedRect = Rect & {
  id: string;
};

const rangesOverlap = (
  startA: number,
  sizeA: number,
  startB: number,
  sizeB: number
): boolean => startA < startB + sizeB && startA + sizeA > startB;

const rectsOverlap = (a: Rect, b: Rect): boolean =>
  rangesOverlap(a.x, a.w, b.x, b.w) && rangesOverlap(a.y, a.h, b.y, b.h);

const toRect = (widget: WidgetConfig): Rect => ({
  x: widget.x,
  y: widget.y,
  w: widget.w,
  h: widget.h,
});

const getOtherRects = (layout: DashboardLayout, id: string): Rect[] =>
  layout.widgets.filter((widget) => widget.id !== id).map((widget) => toRect(widget));

const hasOverlap = (candidate: Rect, others: Rect[]): boolean =>
  others.some((other) => rectsOverlap(candidate, other));

const uniqueRounded = (values: number[]): number[] => {
  const seen = new Set<number>();
  const result: number[] = [];
  for (const value of values) {
    const rounded = Math.round(value);
    if (seen.has(rounded)) continue;
    seen.add(rounded);
    result.push(rounded);
  }
  return result;
};

const snapAxis = (value: number, candidates: number[], threshold: number): number => {
  let snapped = value;
  let bestDistance = threshold + 1;

  for (const candidate of candidates) {
    const distance = Math.abs(candidate - value);
    if (distance <= threshold && distance < bestDistance) {
      bestDistance = distance;
      snapped = candidate;
    }
  }

  return snapped;
};

const snapDragPosition = (
  rawX: number,
  rawY: number,
  moving: Rect,
  others: Rect[],
  bounds: ContainerMetrics,
  gap: number
): { x: number; y: number } => {
  const minX = bounds.padding;
  const maxX = Math.max(minX, bounds.width - bounds.padding - moving.w);

  const xCandidates = [minX, maxX];
  const yCandidates = [bounds.padding];

  for (const other of others) {
    const verticalRelation =
      rangesOverlap(rawY, moving.h, other.y, other.h) ||
      Math.abs(rawY + moving.h / 2 - (other.y + other.h / 2)) <= SNAP_THRESHOLD * 2;
    const horizontalRelation =
      rangesOverlap(rawX, moving.w, other.x, other.w) ||
      Math.abs(rawX + moving.w / 2 - (other.x + other.w / 2)) <= SNAP_THRESHOLD * 2;

    if (verticalRelation) {
      xCandidates.push(other.x);
      xCandidates.push(other.x + other.w - moving.w);
      xCandidates.push(other.x + other.w + gap);
      xCandidates.push(other.x - moving.w - gap);
      xCandidates.push(other.x + (other.w - moving.w) / 2);
    }

    if (horizontalRelation) {
      yCandidates.push(other.y);
      yCandidates.push(other.y + other.h - moving.h);
      yCandidates.push(other.y + other.h + gap);
      yCandidates.push(other.y - moving.h - gap);
      yCandidates.push(other.y + (other.h - moving.h) / 2);
    }
  }

  const snappedX = clamp(
    snapAxis(rawX, uniqueRounded(xCandidates), SNAP_THRESHOLD),
    minX,
    maxX
  );
  const snappedY = Math.max(
    bounds.padding,
    snapAxis(rawY, uniqueRounded(yCandidates), SNAP_THRESHOLD)
  );

  return { x: snappedX, y: snappedY };
};

const resolveDragCollision = (
  candidate: Rect,
  previous: Rect,
  others: Rect[],
  bounds: ContainerMetrics,
  gap: number
): Rect => {
  if (!hasOverlap(candidate, others)) return candidate;

  const minX = bounds.padding;
  const maxX = Math.max(minX, bounds.width - bounds.padding - candidate.w);
  const xCandidates = [candidate.x];
  const yCandidates = [candidate.y];

  for (const other of others) {
    if (!rectsOverlap(candidate, other)) continue;
    xCandidates.push(other.x - candidate.w - gap);
    xCandidates.push(other.x + other.w + gap);
    yCandidates.push(other.y - candidate.h - gap);
    yCandidates.push(other.y + other.h + gap);
  }

  const uniqueX = uniqueRounded(xCandidates).map((value) => clamp(value, minX, maxX));
  const uniqueY = uniqueRounded(yCandidates).map((value) => Math.max(bounds.padding, value));

  const options: Rect[] = [];
  for (const x of uniqueX) {
    options.push({ ...candidate, x, y: candidate.y });
  }
  for (const y of uniqueY) {
    options.push({ ...candidate, x: candidate.x, y });
  }
  for (const x of uniqueX) {
    for (const y of uniqueY) {
      options.push({ ...candidate, x, y });
    }
  }

  let best: Rect | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const option of options) {
    if (hasOverlap(option, others)) continue;
    const distance = Math.abs(option.x - candidate.x) + Math.abs(option.y - candidate.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = option;
    }
  }

  return best ?? previous;
};

const snapResizeSize = (
  rawW: number,
  rawH: number,
  originX: number,
  originY: number,
  others: Rect[],
  gap: number,
  maxW: number
): { w: number; h: number } => {
  const widthCandidates: number[] = [];
  const heightCandidates: number[] = [];

  for (const other of others) {
    widthCandidates.push(other.w);
    heightCandidates.push(other.h);

    const verticalBandRelation =
      rangesOverlap(originY, rawH, other.y, other.h) ||
      Math.abs(originY - other.y) <= RESIZE_SNAP_THRESHOLD * 2 ||
      Math.abs(originY + rawH - (other.y + other.h)) <= RESIZE_SNAP_THRESHOLD * 2 ||
      Math.abs(originY - (other.y + other.h)) <= RESIZE_SNAP_THRESHOLD * 2 ||
      Math.abs(originY + rawH - other.y) <= RESIZE_SNAP_THRESHOLD * 2;
    const horizontalBandRelation =
      rangesOverlap(originX, rawW, other.x, other.w) ||
      Math.abs(originX - other.x) <= RESIZE_SNAP_THRESHOLD * 2 ||
      Math.abs(originX + rawW - (other.x + other.w)) <= RESIZE_SNAP_THRESHOLD * 2 ||
      Math.abs(originX - (other.x + other.w)) <= RESIZE_SNAP_THRESHOLD * 2 ||
      Math.abs(originX + rawW - other.x) <= RESIZE_SNAP_THRESHOLD * 2;

    if (verticalBandRelation) {
      widthCandidates.push(other.x - originX);
      widthCandidates.push(other.x - gap - originX);
      widthCandidates.push(other.x + other.w - originX);
      widthCandidates.push(other.x + other.w + gap - originX);
    }

    if (horizontalBandRelation) {
      heightCandidates.push(other.y - originY);
      heightCandidates.push(other.y - gap - originY);
      heightCandidates.push(other.y + other.h - originY);
      heightCandidates.push(other.y + other.h + gap - originY);
    }
  }

  const validWidthCandidates = uniqueRounded(widthCandidates).filter(
    (value) => value >= MIN_WIDGET_WIDTH && value <= maxW
  );
  const validHeightCandidates = uniqueRounded(heightCandidates).filter(
    (value) => value >= MIN_WIDGET_HEIGHT
  );

  const snappedW = clamp(
    snapAxis(
      rawW,
      validWidthCandidates.length > 0 ? validWidthCandidates : [rawW],
      RESIZE_SNAP_THRESHOLD
    ),
    MIN_WIDGET_WIDTH,
    maxW
  );
  const snappedH = Math.max(
    MIN_WIDGET_HEIGHT,
    snapAxis(
      rawH,
      validHeightCandidates.length > 0 ? validHeightCandidates : [rawH],
      RESIZE_SNAP_THRESHOLD
    )
  );

  return { w: snappedW, h: snappedH };
};

const resolveResizeCollision = (
  candidate: Rect,
  previous: Rect,
  others: Rect[],
  bounds: ContainerMetrics,
  gap: number
): Rect => {
  let next = { ...candidate };
  const maxW = Math.max(MIN_WIDGET_WIDTH, bounds.width - bounds.padding - candidate.x);

  for (let pass = 0; pass < 3; pass += 1) {
    if (!hasOverlap(next, others)) return next;

    let limited = false;
    let maxAllowedW = next.w;
    let maxAllowedH = next.h;

    for (const other of others) {
      if (!rectsOverlap(next, other)) continue;

      const verticalOverlap = rangesOverlap(next.y, next.h, other.y, other.h);
      const horizontalOverlap = rangesOverlap(next.x, next.w, other.x, other.w);

      if (verticalOverlap && other.x >= next.x) {
        maxAllowedW = Math.min(maxAllowedW, other.x - gap - next.x);
        limited = true;
      }

      if (horizontalOverlap && other.y >= next.y) {
        maxAllowedH = Math.min(maxAllowedH, other.y - gap - next.y);
        limited = true;
      }
    }

    const clampedW = clamp(Math.round(maxAllowedW), MIN_WIDGET_WIDTH, maxW);
    const clampedH = Math.max(MIN_WIDGET_HEIGHT, Math.round(maxAllowedH));

    if (clampedW === next.w && clampedH === next.h && !limited) break;
    next = { ...next, w: clampedW, h: clampedH };
  }

  if (!hasOverlap(next, others)) return next;
  return previous;
};

const pushRightWithinBounds = (
  rect: PositionedRect,
  targetX: number,
  bounds: ContainerMetrics
): boolean => {
  const maxX = bounds.width - bounds.padding - rect.w;
  if (targetX > maxX) return false;
  if (targetX <= rect.x) return true;
  rect.x = targetX;
  return true;
};

const pushDown = (rect: PositionedRect, targetY: number): void => {
  if (targetY > rect.y) rect.y = targetY;
};

const pushAwayFromAnchor = (
  rect: PositionedRect,
  anchor: Rect,
  bounds: ContainerMetrics,
  gap: number
): boolean => {
  const verticalOverlap = rangesOverlap(anchor.y, anchor.h, rect.y, rect.h);
  const horizontalOverlap = rangesOverlap(anchor.x, anchor.w, rect.x, rect.w);
  const pushRightTarget = anchor.x + anchor.w + gap;
  const pushDownTarget = anchor.y + anchor.h + gap;

  if (verticalOverlap && rect.x >= anchor.x) {
    return pushRightWithinBounds(rect, pushRightTarget, bounds);
  }

  if (horizontalOverlap && rect.y >= anchor.y) {
    pushDown(rect, pushDownTarget);
    return true;
  }

  if (verticalOverlap) {
    return pushRightWithinBounds(rect, pushRightTarget, bounds);
  }

  if (horizontalOverlap) {
    pushDown(rect, pushDownTarget);
    return true;
  }

  return false;
};

const resolvePairOverlap = (
  first: PositionedRect,
  second: PositionedRect,
  bounds: ContainerMetrics,
  gap: number
): boolean => {
  const firstIsLeft = first.x <= second.x;
  const left = firstIsLeft ? first : second;
  const right = firstIsLeft ? second : first;

  if (rangesOverlap(left.y, left.h, right.y, right.h)) {
    return pushRightWithinBounds(right, left.x + left.w + gap, bounds);
  }

  const firstIsTop = first.y <= second.y;
  const top = firstIsTop ? first : second;
  const bottom = firstIsTop ? second : first;
  pushDown(bottom, top.y + top.h + gap);
  return true;
};

const tryResolveResizeByPushing = (
  candidate: Rect,
  others: PositionedRect[],
  bounds: ContainerMetrics,
  gap: number
): Map<string, Rect> | null => {
  const placed = others.map((rect) => ({ ...rect }));
  const maxPasses = Math.max(40, placed.length * placed.length * 3);

  for (let pass = 0; pass < maxPasses; pass += 1) {
    let changed = false;

    for (const rect of placed) {
      if (!rectsOverlap(candidate, rect)) continue;
      if (!pushAwayFromAnchor(rect, candidate, bounds, gap)) return null;
      changed = true;
    }

    for (let i = 0; i < placed.length; i += 1) {
      for (let j = i + 1; j < placed.length; j += 1) {
        const first = placed[i];
        const second = placed[j];
        if (!rectsOverlap(first, second)) continue;
        if (!resolvePairOverlap(first, second, bounds, gap)) return null;
        changed = true;
      }
    }

    if (!changed) {
      const moved = new Map<string, Rect>();
      for (const rect of placed) {
        moved.set(rect.id, { x: rect.x, y: rect.y, w: rect.w, h: rect.h });
      }
      return moved;
    }
  }

  return null;
};

const reduceResizeStep = (value: number, minimum: number): number => {
  const remaining = value - minimum;
  if (remaining > 20) return value - 6;
  if (remaining > 8) return value - 3;
  return value - 1;
};

const resolveResizeWithPush = (
  candidate: Rect,
  previous: Rect,
  layout: DashboardLayout,
  activeId: string,
  bounds: ContainerMetrics,
  gap: number,
  allowPush: boolean
): { active: Rect; moved: Map<string, Rect> } => {
  const others = layout.widgets
    .filter((widget) => widget.id !== activeId)
    .map((widget) => ({ id: widget.id, x: widget.x, y: widget.y, w: widget.w, h: widget.h }));

  if (!allowPush) {
    const resolved = resolveResizeCollision(
      candidate,
      previous,
      others.map(({ x, y, w, h }) => ({ x, y, w, h })),
      bounds,
      gap
    );
    return { active: resolved, moved: new Map<string, Rect>() };
  }

  let current = { ...candidate };
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const moved = tryResolveResizeByPushing(current, others, bounds, gap);
    if (moved) return { active: current, moved };

    const canShrinkW = current.w > MIN_WIDGET_WIDTH;
    const canShrinkH = current.h > MIN_WIDGET_HEIGHT;
    if (!canShrinkW && !canShrinkH) break;

    if (canShrinkW && (!canShrinkH || current.w - MIN_WIDGET_WIDTH >= current.h - MIN_WIDGET_HEIGHT)) {
      current = { ...current, w: Math.max(MIN_WIDGET_WIDTH, reduceResizeStep(current.w, MIN_WIDGET_WIDTH)) };
    } else {
      current = { ...current, h: Math.max(MIN_WIDGET_HEIGHT, reduceResizeStep(current.h, MIN_WIDGET_HEIGHT)) };
    }
  }

  const fallback = resolveResizeCollision(
    current,
    previous,
    others.map(({ x, y, w, h }) => ({ x, y, w, h })),
    bounds,
    gap
  );
  return { active: fallback, moved: new Map<string, Rect>() };
};

const useContainerMetrics = (
  ref: React.RefObject<HTMLDivElement>,
  padding: number
): ContainerMetrics | null => {
  const [metrics, setMetrics] = React.useState<ContainerMetrics | null>(null);

  React.useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;

    const update = () => {
      setMetrics({
        width: node.clientWidth,
        height: node.clientHeight,
        padding,
      });
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);

    return () => observer.disconnect();
  }, [padding, ref]);

  return metrics;
};

const getGridMetrics = (layout: DashboardLayout, metrics: ContainerMetrics) => {
  const padding = metrics.padding;
  const totalGap = layout.gap * (layout.columns - 1);
  const available = metrics.width - padding * 2 - totalGap;
  const colWidth = available > 0 ? available / layout.columns : 0;
  return { colWidth, rowHeight: layout.rowHeight, gap: layout.gap, padding };
};

const gridSizeToPixels = (
  layout: DashboardLayout,
  metrics: ContainerMetrics,
  gridW: number,
  gridH: number
) => {
  const grid = getGridMetrics(layout, metrics);
  const colWidth = grid.colWidth > 0 ? grid.colWidth : FALLBACK_WIDGET_WIDTH / 2;
  const rowHeight = grid.rowHeight > 0 ? grid.rowHeight : FALLBACK_WIDGET_HEIGHT / 3;
  const w = gridW * colWidth + Math.max(0, gridW - 1) * grid.gap;
  const h = gridH * rowHeight + Math.max(0, gridH - 1) * grid.gap;
  return {
    w: Math.max(MIN_WIDGET_WIDTH, Math.round(w)),
    h: Math.max(MIN_WIDGET_HEIGHT, Math.round(h)),
  };
};

const convertLayoutToPixels = (
  layout: DashboardLayout,
  metrics: ContainerMetrics
): DashboardLayout => {
  const grid = getGridMetrics(layout, metrics);
  const colWidth = grid.colWidth > 0 ? grid.colWidth : FALLBACK_WIDGET_WIDTH / 2;
  const rowHeight = grid.rowHeight > 0 ? grid.rowHeight : FALLBACK_WIDGET_HEIGHT / 3;

  const widgets = layout.widgets.map((widget) => {
    const size = gridSizeToPixels(layout, metrics, widget.w, widget.h);
    const maxX = Math.max(grid.padding, metrics.width - grid.padding - size.w);
    const x = clamp(
      Math.round(grid.padding + widget.x * (colWidth + grid.gap)),
      grid.padding,
      maxX
    );
    const y = Math.max(
      grid.padding,
      Math.round(grid.padding + widget.y * (rowHeight + grid.gap))
    );
    return { ...widget, x, y, w: size.w, h: size.h };
  });

  return { ...layout, unit: "px", widgets };
};

export const DashboardView: React.FC<DashboardViewProps> = ({
  dataSource,
  layout,
  timePresets,
  editable = false,
  autoAlign = true,
  onLayoutChange,
}) => {
  const presetList = timePresets && timePresets.length > 0 ? timePresets : DEFAULT_TIME_PRESETS;
  const [currentLayout, setCurrentLayout] = React.useState(layout);
  const [isInteracting, setIsInteracting] = React.useState(false);
  const [activeWidgetId, setActiveWidgetId] = React.useState<string | null>(null);
  const [configOpenId, setConfigOpenId] = React.useState<string | null>(null);
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const dragState = React.useRef<DragState | null>(null);
  const resizeState = React.useRef<ResizeState | null>(null);
  const layoutRef = React.useRef(currentLayout);
  const metrics = useContainerMetrics(containerRef, currentLayout.gap);
  const metricsRef = React.useRef<ContainerMetrics | null>(null);

  const ensureMetrics = React.useCallback((): ContainerMetrics | null => {
    if (metricsRef.current) return metricsRef.current;
    const node = containerRef.current;
    if (!node) return null;

    const next = {
      width: node.clientWidth,
      height: node.clientHeight,
      padding: currentLayout.gap,
    };
    metricsRef.current = next;
    return next;
  }, [currentLayout.gap]);

  React.useEffect(() => {
    layoutRef.current = currentLayout;
  }, [currentLayout]);

  React.useEffect(() => {
    metricsRef.current = metrics;
  }, [metrics]);

  React.useEffect(() => {
    if (!metrics || metrics.width <= 0) return;
    if (currentLayout.unit === "px") return;

    const converted = convertLayoutToPixels(currentLayout, metrics);
    setCurrentLayout(converted);
    layoutRef.current = converted;
    if (onLayoutChange) {
      onLayoutChange(converted);
    }
  }, [currentLayout, metrics, onLayoutChange]);

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
      const bounds = ensureMetrics();
      const fallbackBounds: ContainerMetrics = bounds ?? {
        width:
          currentLayout.columns * (FALLBACK_WIDGET_WIDTH / 2) +
          currentLayout.gap * (currentLayout.columns + 1),
        height: 0,
        padding: currentLayout.gap,
      };
      const baseLayout =
        currentLayout.unit === "px"
          ? currentLayout
          : convertLayoutToPixels(currentLayout, fallbackBounds);
      const nextLayout = normalizeLayout({ ...baseLayout, unit: "px" });
      const maxY = nextLayout.widgets.reduce(
        (acc, widget) => Math.max(acc, widget.y + widget.h),
        0
      );
      const id = `widget-${Date.now()}`;
      const padding = nextLayout.gap;
      const baseX = padding;
      const baseY = Math.max(padding, maxY + padding);

      const getSize = (gridW: number, gridH: number) => {
        if (!bounds) {
          return { w: FALLBACK_WIDGET_WIDTH, h: FALLBACK_WIDGET_HEIGHT };
        }
        const size = gridSizeToPixels(nextLayout, bounds, gridW, gridH);
        const maxW = Math.max(MIN_WIDGET_WIDTH, bounds.width - padding * 2);
        return { w: Math.min(size.w, maxW), h: size.h };
      };

      let widget: WidgetConfig;
      if (type === "task-list") {
        const size = getSize(2, 3);
        const baseWidget: TaskListWidgetConfig = {
          id,
          type,
          title: "Tasks",
          x: baseX,
          y: baseY,
          w: size.w,
          h: size.h,
          filters: [{ tags: "", folders: "", yamlFilters: [] }],
          showCompleted: false,
          limit: 10,
        };
        widget = baseWidget;
      } else if (type === "status-bar") {
        const size = getSize(2, 2);
        const baseWidget: StatusBarWidgetConfig = {
          id,
          type,
          title: "Progress",
          x: baseX,
          y: baseY,
          w: size.w,
          h: size.h,
          countTarget: "files",
          filters: [{ tags: "", folders: "", yamlFilters: [] }],
          timeField: "modified",
          timeRange: { preset: "all" },
          target: 10,
        };
        widget = baseWidget;
      } else if (type === "stats") {
        const size = getSize(2, 2);
        const baseWidget: StatsWidgetConfig = {
          id,
          type,
          title: "Stat",
          x: baseX,
          y: baseY,
          w: size.w,
          h: size.h,
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
        const size = getSize(2, 3);
        widget = {
          id,
          type,
          title: "Trend",
          x: baseX,
          y: baseY,
          w: size.w,
          h: size.h,
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
        const size = getSize(2, 3);
        widget = {
          id,
          type: "pie-chart",
          title: "Chart",
          x: baseX,
          y: baseY,
          w: size.w,
          h: size.h,
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
    [currentLayout, ensureMetrics, onLayoutChange]
  );

  const beginDrag = React.useCallback((clientX: number, clientY: number, widget: WidgetConfig) => {
    dragState.current = {
      id: widget.id,
      startX: clientX,
      startY: clientY,
      originX: widget.x,
      originY: widget.y,
      originW: widget.w,
      originH: widget.h,
      lastX: widget.x,
      lastY: widget.y,
    };
    resizeState.current = null;
    setIsInteracting(true);
    setActiveWidgetId(widget.id);
  }, []);

  const beginResize = React.useCallback((clientX: number, clientY: number, widget: WidgetConfig) => {
    resizeState.current = {
      id: widget.id,
      startX: clientX,
      startY: clientY,
      originX: widget.x,
      originY: widget.y,
      originW: widget.w,
      originH: widget.h,
      lastW: widget.w,
      lastH: widget.h,
    };
    dragState.current = null;
    setIsInteracting(true);
    setActiveWidgetId(widget.id);
  }, []);

  const onDragStart = React.useCallback(
    (event: DragStartEvent, widget: WidgetConfig) => {
      if (!editable || !ensureMetrics()) return;
      if (dragState.current || resizeState.current) return;
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      beginDrag(event.clientX, event.clientY, widget);
    },
    [editable, ensureMetrics, beginDrag]
  );

  const onResizeStart = React.useCallback(
    (event: DragStartEvent, widget: WidgetConfig) => {
      if (!editable || !ensureMetrics()) return;
      if (dragState.current || resizeState.current) return;
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      beginResize(event.clientX, event.clientY, widget);
    },
    [editable, ensureMetrics, beginResize]
  );

  const handleMove = React.useCallback(
    (clientX: number, clientY: number, ctrlPressed: boolean) => {
      const activeDrag = dragState.current;
      const activeResize = resizeState.current;
      const bounds = metricsRef.current;
      if (!bounds) return;
      const liveLayout = layoutRef.current;
      const gap = liveLayout.gap;
      const shouldSnap = autoAlign && !ctrlPressed;

      if (activeDrag) {
        const deltaX = clientX - activeDrag.startX;
        const deltaY = clientY - activeDrag.startY;
        const minX = bounds.padding;
        const maxX = Math.max(minX, bounds.width - bounds.padding - activeDrag.originW);
        const rawX = clamp(Math.round(activeDrag.originX + deltaX), minX, maxX);
        const rawY = Math.max(bounds.padding, Math.round(activeDrag.originY + deltaY));
        const others = getOtherRects(liveLayout, activeDrag.id);

        const snapped = shouldSnap
          ? snapDragPosition(
              rawX,
              rawY,
              {
                x: rawX,
                y: rawY,
                w: activeDrag.originW,
                h: activeDrag.originH,
              },
              others,
              bounds,
              gap
            )
          : { x: rawX, y: rawY };

        const proposed: Rect = {
          x: snapped.x,
          y: snapped.y,
          w: activeDrag.originW,
          h: activeDrag.originH,
        };
        const previous: Rect = {
          x: activeDrag.lastX,
          y: activeDrag.lastY,
          w: activeDrag.originW,
          h: activeDrag.originH,
        };
        const resolved = resolveDragCollision(proposed, previous, others, bounds, gap);

        if (resolved.x === activeDrag.lastX && resolved.y === activeDrag.lastY) return;
        activeDrag.lastX = resolved.x;
        activeDrag.lastY = resolved.y;

        updateWidget(
          activeDrag.id,
          (widget) => ({ ...widget, x: resolved.x, y: resolved.y }),
          true
        );
        return;
      }

      if (activeResize) {
        const deltaX = clientX - activeResize.startX;
        const deltaY = clientY - activeResize.startY;
        const minW = MIN_WIDGET_WIDTH;
        const minH = MIN_WIDGET_HEIGHT;
        const maxW = Math.max(minW, bounds.width - bounds.padding - activeResize.originX);
        const rawW = clamp(Math.round(activeResize.originW + deltaX), minW, maxW);
        const rawH = Math.max(minH, Math.round(activeResize.originH + deltaY));
        const others = getOtherRects(liveLayout, activeResize.id);

        const snappedSize = shouldSnap
          ? snapResizeSize(
              rawW,
              rawH,
              activeResize.originX,
              activeResize.originY,
              others,
              gap,
              maxW
            )
          : { w: rawW, h: rawH };

        const proposed: Rect = {
          x: activeResize.originX,
          y: activeResize.originY,
          w: snappedSize.w,
          h: snappedSize.h,
        };
        const previous: Rect = {
          x: activeResize.originX,
          y: activeResize.originY,
          w: activeResize.lastW,
          h: activeResize.lastH,
        };
        const resizeResolution = resolveResizeWithPush(
          proposed,
          previous,
          liveLayout,
          activeResize.id,
          bounds,
          gap,
          shouldSnap
        );
        const resolved = resizeResolution.active;
        const moved = resizeResolution.moved;
        const hasMovedOthers = moved.size > 0;

        if (
          resolved.w === activeResize.lastW &&
          resolved.h === activeResize.lastH &&
          !hasMovedOthers
        ) {
          return;
        }
        activeResize.lastW = resolved.w;
        activeResize.lastH = resolved.h;

        let nextLayout: DashboardLayout | null = null;
        setCurrentLayout((prev) => {
          let changed = false;
          const widgets = prev.widgets.map((widget) => {
            if (widget.id === activeResize.id) {
              if (widget.w === resolved.w && widget.h === resolved.h) return widget;
              changed = true;
              return { ...widget, w: resolved.w, h: resolved.h };
            }

            const shifted = moved.get(widget.id);
            if (!shifted) return widget;
            if (widget.x === shifted.x && widget.y === shifted.y) return widget;
            changed = true;
            return { ...widget, x: shifted.x, y: shifted.y };
          });

          if (!changed) return prev;
          const normalized = normalizeLayout({ ...prev, widgets });
          const resolvedLayout = resolveCollisions(normalized, activeResize.id);
          layoutRef.current = resolvedLayout;
          nextLayout = resolvedLayout;
          return resolvedLayout;
        });
        if (nextLayout && onLayoutChange) {
          onLayoutChange(nextLayout);
        }
      }
    },
    [autoAlign, onLayoutChange, updateWidget]
  );

  const handleMouseMove = React.useCallback(
    (event: MouseEvent) => {
      handleMove(event.clientX, event.clientY, event.ctrlKey);
    },
    [handleMove]
  );

  const endInteraction = React.useCallback(() => {
    if (!dragState.current && !resizeState.current) return;
    dragState.current = null;
    resizeState.current = null;
    setIsInteracting(false);
    setActiveWidgetId(null);
    if (onLayoutChange) {
      onLayoutChange(layoutRef.current);
    }
  }, [onLayoutChange]);

  const handleMouseUp = React.useCallback(() => {
    endInteraction();
  }, [endInteraction]);

  React.useEffect(() => {
    if (!isInteracting) return;
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp, isInteracting]);

  const padding = currentLayout.gap;
  const contentHeight = currentLayout.widgets.reduce(
    (acc, widget) => Math.max(acc, widget.y + widget.h),
    0
  );
  const addTileHeight = 60;
  const addTileY = Math.max(padding, contentHeight + padding);
  const canvasHeight = Math.max(
    metrics?.height ?? 0,
    editable ? addTileY + addTileHeight + padding : contentHeight + padding
  );
  const canvasStyle: React.CSSProperties = {
    position: "relative",
    width: "100%",
    height: "100%",
    minHeight: `${canvasHeight}px`,
    userSelect: isInteracting ? "none" : "auto",
  };
  const addTileWidth = Math.max(
    240,
    Math.min(metrics?.width ? metrics.width - padding * 2 : 320, 420)
  );

  return (
    <DataSourceContext.Provider value={dataSource}>
      <TimePresetsContext.Provider value={presetList}>
        <div className="obsd-dashboard-grid" style={canvasStyle} ref={containerRef}>
          {currentLayout.widgets.map((widget) => (
            <WidgetFrame
              key={widget.id}
              config={widget}
              editable={editable}
              configOpen={configOpenId === widget.id}
              isActive={activeWidgetId === widget.id}
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
              x={padding}
              y={addTileY}
              width={addTileWidth}
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
  isActive: boolean;
  onToggleConfig: () => void;
  onUpdate: (updater: (widget: WidgetConfig) => WidgetConfig) => void;
  onDragStart: (event: DragStartEvent, widget: WidgetConfig) => void;
  onResizeStart: (event: DragStartEvent, widget: WidgetConfig) => void;
}> = ({
  config,
  editable,
  configOpen,
  isActive,
  onToggleConfig,
  onUpdate,
  onDragStart,
  onResizeStart,
}) => {
  const Component = WidgetRegistry[config.type];
  const handleHeaderMouseDown = (event: DragStartEvent) => {
    if (!editable) return;
    const target = event.target;
    if (target instanceof Element && target.closest("button, input, textarea, select, a")) return;
    onDragStart(event, config);
  };
  const style: React.CSSProperties = {
    position: "absolute",
    left: `${config.x}px`,
    top: `${config.y}px`,
    width: `${config.w}px`,
    height: `${config.h}px`,
    display: "flex",
    flexDirection: "column",
    background: "var(--background-primary)",
    border: "1px solid var(--background-modifier-border)",
    borderRadius: "10px",
    padding: "10px",
    overflow: "hidden",
    minWidth: 0,
    minHeight: 0,
    boxSizing: "border-box",
    zIndex: isActive ? 5 : 1,
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
  const headerDragOnly = editable && !headerHasBody;
  const hasHeaderContent = headerHasBody || editable;

  return (
    <section
      className={`obsd-widget${editable ? " is-editable" : ""}${
        configOpen && editable ? " is-editing" : ""
      }`}
      style={style}
    >
      {hasHeaderContent ? (
        <header
          className={`obsd-widget-header is-align-${headerAlign}`}
          onMouseDown={editable ? handleHeaderMouseDown : undefined}
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
            minHeight: headerDragOnly ? "24px" : headerHasBody ? undefined : "0",
            padding: headerDragOnly ? "2px 0" : headerHasBody ? undefined : "0",
            position: "relative",
            overflow: "visible",
          }}
        >
          <div
            className="obsd-widget-header-content"
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
        <Component
          config={config}
          onConfigPatch={
            editable
              ? (patch) => {
                  onUpdate((widget) => ({ ...widget, ...patch }));
                }
              : undefined
          }
        />
      </div>
      {editable ? (
        <div
          onMouseDown={(event) => onResizeStart(event, config)}
          title="Resize widget"
          className="obsd-widget-resize-handle"
        />
      ) : null}
    </section>
  );
};

const AddWidgetTile: React.FC<{
  x: number;
  y: number;
  width: number;
  onAdd: (type: WidgetType) => void;
}> = ({ x, y, width, onAdd }) => {
  const [open, setOpen] = React.useState(false);
  const tileRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!open) return;

    const handler = (event: MouseEvent) => {
      if (!tileRef.current) return;
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (tileRef.current.contains(target)) return;
      setOpen(false);
    };

    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [open]);

  const style: React.CSSProperties = {
    position: "absolute",
    left: `${x}px`,
    top: `${y}px`,
    width: `${width}px`,
    height: "60px",
    border: "2px dashed var(--background-modifier-border)",
    borderRadius: "10px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "var(--text-muted)",
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

const WidgetRegistry: Record<WidgetType, React.FC<WidgetComponentProps<WidgetConfig>>> = {
  "task-list": TaskListWidget,
  stats: StatsWidget,
  "status-bar": StatusBarWidget,
  "pie-chart": PieChartWidget,
  "line-chart": LineChartWidget,
};

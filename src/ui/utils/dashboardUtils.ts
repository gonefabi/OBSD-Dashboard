import * as React from "react";
import { IDataSource, Page, Task } from "../../interfaces/IDataSource";
import { CUSTOM_RANGE_ID, TimePreset, isCalendarPreset } from "../timePresets";
import type {
  ChartDataMode,
  ChartSeriesConfig,
  DashboardLayout,
  LegendPosition,
  LineChartWidgetConfig,
  PieChartWidgetConfig,
  QueryFilter,
  StatsCompareBasis,
  StatsCountTarget,
  TaskListWidgetConfig,
  TimeField,
  TimeRangeConfig,
  WidgetBaseConfig,
  WidgetConfig,
  YamlFilter,
} from "../types";

export const groupPages = (
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
      if (value.length === 0) increment(counts, "(empty)");
      for (const entry of value) increment(counts, stringifyValue(entry));
      continue;
    }

    if (value === null || value === undefined || value === "") {
      increment(counts, "(empty)");
    } else {
      increment(counts, stringifyValue(value));
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

const stringifyValue = (value: unknown): string => {
  if (value === null || value === undefined || value === "") return "(empty)";
  if (typeof value === "string") return value;
  if (typeof value === "number") return value.toString();
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === "object") {
    const asAny = value as { name?: unknown; path?: unknown; value?: unknown };
    if (typeof asAny.name === "string") return asAny.name;
    if (typeof asAny.path === "string") return asAny.path;
    if (typeof asAny.value === "string") return asAny.value;
    try {
      const json = JSON.stringify(value);
      if (json && json !== "{}") return json;
    } catch {
      return "(object)";
    }
    return "(object)";
  }
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "symbol") return value.toString();
  return "(unknown)";
};

const coerceValue = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return value.toString();
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === "object") {
    const asAny = value as { name?: unknown; path?: unknown; value?: unknown };
    if (typeof asAny.name === "string") return asAny.name;
    if (typeof asAny.path === "string") return asAny.path;
    if (typeof asAny.value === "string") return asAny.value;
    try {
      const json = JSON.stringify(value);
      return json ?? "";
    } catch {
      return "";
    }
  }
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "symbol") return value.toString();
  return "";
};

export function parseTags(value: string): string[] {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type ResolvedTimeRange = {
  start?: Date;
  end?: Date;
  days?: number;
};

export function normalizeTimeRange(range?: TimeRangeConfig): TimeRangeConfig {
  if (!range) return { preset: "all" };
  return {
    preset: range.preset ?? "all",
    start: range.start,
    end: range.end,
  };
}

export function resolveTimeRange(
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

export function derivePreviousRange(range: ResolvedTimeRange): ResolvedTimeRange | null {
  if (!range.start || !range.end || !range.days) return null;
  const previousEnd = new Date(range.start.getTime() - 1);
  const previousStart = addDays(startOfDay(previousEnd), -(range.days - 1));
  return {
    start: previousStart,
    end: endOfDay(previousEnd),
    days: range.days,
  };
}

export function rangeHasBounds(range: ResolvedTimeRange): boolean {
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

export function deriveFilterFromLegacyQuery(query: string): QueryFilter {
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

export function ensureTaskFilters(config: TaskListWidgetConfig): QueryFilter[] {
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

export function buildQueryFromFilters(filters: QueryFilter[]): string {
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

export function buildQueryFromFilter(filter: QueryFilter): string {
  const tagsExpr = buildTagsExpression(filter.tags ?? "");
  const folderExpr = buildFoldersExpression(filter.folders ?? "");
  const yamlExpr = buildYamlExpression(filter.yamlFilters ?? []);

  const parts = [folderExpr, tagsExpr, yamlExpr].filter((part) => part.length > 0);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  return parts.map((part) => `(${part})`).join(" AND ");
}

export function buildSourceFromFilter(filter: QueryFilter): string {
  const tagsExpr = buildTagsExpression(filter.tags ?? "");
  const folderExpr = buildFoldersExpression(filter.folders ?? "");
  const parts = [folderExpr, tagsExpr].filter((part) => part.length > 0);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  return parts.map((part) => `(${part})`).join(" AND ");
}

export function filterPagesByYaml(pages: Page[], yamlFilters: YamlFilter[]): Page[] {
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

export function normalizeYamlFilters(
  filters: YamlFilter[]
): Array<{ key: string; values: string[] }> {
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

export function matchYamlValue(value: unknown, values: string[]): boolean {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) {
    return value.some((entry) => {
      const normalized = coerceValue(entry);
      return normalized.length > 0 && values.includes(normalized);
    });
  }
  const normalized = coerceValue(value);
  return normalized.length > 0 && values.includes(normalized);
}

export function filterTasksByPages(tasks: Task[], pages: Page[]): Task[] {
  const allowed = new Set(pages.map((page) => page.path));
  return tasks.filter((task) => allowed.has(task.path));
}

export async function queryPagesForFilters(
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

export async function queryTasksForFilters(
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

export function buildYamlExpression(filters: YamlFilter[]): string {
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

export function ensureStatFilters(filters?: QueryFilter[]): QueryFilter[] {
  if (Array.isArray(filters) && filters.length > 0) return filters;
  return [{ tags: "", folders: "", yamlFilters: [] }];
}

export function filterPagesByTime(
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

export function filterTasksByTime(
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

export async function countByTarget(
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

export function applyComparisonBasis(result: CountResult, basis: StatsCompareBasis): number {
  if (basis === "per-day" && result.days) {
    return result.count / result.days;
  }
  return result.count;
}

export function formatNumber(value: number, decimals = 0): string {
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function formatSigned(value: number, decimals = 0): string {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${formatNumber(Math.abs(value), decimals)}`;
}

export function getChartDataMode(
  config: PieChartWidgetConfig | LineChartWidgetConfig
): ChartDataMode {
  if (config.dataMode) return config.dataMode;
  if (Array.isArray(config.series) && config.series.length > 0) return "series";
  return "group";
}

export function resolveLegendPosition(
  position: LegendPosition,
  config: WidgetBaseConfig
): LegendPosition {
  if (position !== "auto") return position;
  const width = config.w ?? 2;
  const height = config.h ?? 2;
  return width >= height ? "left" : "bottom";
}

export function ensureChartSeries(
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

export function updateChartSeries(
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

export function combineChartQueries(series: ChartSeriesConfig[]): string {
  if (series.length === 0) return "";

  const queries = series.map((entry) => buildQueryFromFilter(entry.filter ?? {}));
  if (queries.some((query) => query.length === 0)) return "";
  const filtered = queries.filter((query) => query.length > 0);

  if (filtered.length === 0) return "";
  if (filtered.length === 1) return filtered[0];
  return filtered.map((query) => `(${query})`).join(" OR ");
}

export async function buildSeriesCounts(
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

type GridMetrics = {
  colWidth: number;
  rowHeight: number;
  gap: number;
  columns: number;
  padding: number;
};

export const useGridMetrics = (
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

export const toGridDelta = (delta: number, size: number, gap: number): number => {
  if (size <= 0) return 0;
  return Math.round(delta / (size + gap));
};

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

export const toOptionalNumber = (value: string): number | undefined => {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
};

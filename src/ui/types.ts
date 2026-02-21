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
export type StatsIconPosition = "left" | "right";
export type StatsValueAlign = "left" | "center" | "right";
export type HeaderAlign = "left" | "right";
export type HeaderIconPosition = "left" | "right";
export type LegendPosition = "auto" | "left" | "right" | "top" | "bottom";
export type LegendDisplay = "list" | "hover";

export interface WidgetBaseConfig {
  id: string;
  type: WidgetType;
  title?: string;
  titleSize?: number;
  showTitle?: boolean;
  headerAlign?: HeaderAlign;
  headerIconName?: string;
  headerIconPosition?: HeaderIconPosition;
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
  iconName?: string;
  iconPosition?: StatsIconPosition;
  valueAlign?: StatsValueAlign;
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
  groupBy: "tag" | "folder" | "file";
  limit?: number;
  dataMode?: ChartDataMode;
  series?: ChartSeriesConfig[];
  filter?: QueryFilter;
  timeField?: TimeField;
  timeRange?: TimeRangeConfig;
  legendPosition?: LegendPosition;
  legendDisplay?: LegendDisplay;
  legendSize?: number;
}

export interface LineChartWidgetConfig extends WidgetBaseConfig {
  type: "line-chart";
  query: string;
  groupBy: "tag" | "folder" | "file";
  limit?: number;
  dataMode?: ChartDataMode;
  series?: ChartSeriesConfig[];
  filter?: QueryFilter;
  timeField?: TimeField;
  timeRange?: TimeRangeConfig;
  legendSize?: number;
  legendPosition?: LegendPosition;
  legendDisplay?: LegendDisplay;
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
  unit?: "grid" | "px";
  widgets: WidgetConfig[];
}

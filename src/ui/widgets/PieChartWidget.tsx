// Pie chart widget using Recharts.
import * as React from "react";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { useDataSource, useTimePresets } from "../widgetContext";
import {
  buildSeriesCounts,
  deriveFilterFromLegacyQuery,
  ensureChartSeries,
  filterPagesByTime,
  getChartDataMode,
  groupPages,
  normalizeTimeRange,
  queryPagesForFilters,
  resolveLegendPosition,
  resolveTimeRange,
} from "../utils/dashboardUtils";
import type { PieChartWidgetConfig } from "../types";
import type { WidgetComponentProps } from "./types";
import { CHART_COLORS } from "./charts/colors";

export const PieChartWidget: React.FC<WidgetComponentProps<PieChartWidgetConfig>> = ({
  config,
}) => {
  const dataSource = useDataSource();
  const timePresets = useTimePresets();
  const chartRef = React.useRef<HTMLDivElement | null>(null);
  const resizeStateRef = React.useRef<{
    startPos: number;
    startSize: number;
    position: "left" | "right" | "top" | "bottom";
  } | null>(null);
  const [data, setData] = React.useState<Array<{ name: string; value: number }>>(
    []
  );
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [isChartHovered, setIsChartHovered] = React.useState(false);
  const legendDisplay = config.legendDisplay ?? "hover";
  const legendPosition = resolveLegendPosition(
    config.legendPosition ?? "auto",
    config
  );
  const isSideLegend = legendPosition === "left" || legendPosition === "right";
  const defaultLegendSize = isSideLegend ? 180 : 120;
  const configuredLegendSize =
    typeof config.legendSize === "number" ? config.legendSize : defaultLegendSize;
  const [legendSize, setLegendSize] = React.useState(configuredLegendSize);
  const [isResizingLegend, setIsResizingLegend] = React.useState(false);
  const showLegend =
    legendDisplay === "list" || isResizingLegend || (legendDisplay === "hover" && isChartHovered);

  React.useEffect(() => {
    setLegendSize(configuredLegendSize);
  }, [configuredLegendSize, legendPosition]);

  const clampLegendSize = React.useCallback(
    (next: number): number => {
      const minLegend = 24;
      const minChart = 80;
      const dividerSize = 6;
      const root = chartRef.current;

      if (!root) return Math.max(minLegend, Math.round(next));

      const total = isSideLegend ? root.clientWidth : root.clientHeight;
      const maxLegend = Math.max(minLegend, total - minChart - dividerSize);
      return Math.min(Math.max(Math.round(next), minLegend), maxLegend);
    },
    [isSideLegend]
  );

  React.useEffect(() => {
    if (!isResizingLegend) return;

    const onMouseMove = (event: MouseEvent) => {
      const state = resizeStateRef.current;
      if (!state) return;

      const currentPos =
        state.position === "left" || state.position === "right"
          ? event.clientX
          : event.clientY;
      const delta = currentPos - state.startPos;

      let next = state.startSize;
      if (state.position === "left" || state.position === "top") {
        next = state.startSize + delta;
      } else if (state.position === "right" || state.position === "bottom") {
        next = state.startSize - delta;
      }

      setLegendSize(clampLegendSize(next));
    };

    const onMouseUp = () => {
      resizeStateRef.current = null;
      setIsResizingLegend(false);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [clampLegendSize, isResizingLegend]);

  const beginLegendResize = (event: React.MouseEvent<HTMLDivElement>) => {
    if (
      !showLegend ||
      (legendPosition !== "left" &&
        legendPosition !== "right" &&
        legendPosition !== "top" &&
        legendPosition !== "bottom")
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const startPos =
      legendPosition === "left" || legendPosition === "right"
        ? event.clientX
        : event.clientY;

    resizeStateRef.current = {
      startPos,
      startSize: legendSize,
      position: legendPosition,
    };
    setIsResizingLegend(true);
  };

  const legendStyle: React.CSSProperties = isSideLegend
    ? { width: `${legendSize}px` }
    : { height: `${legendSize}px` };

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

    void load().catch((error) => {
      if (!cancelled) {
        setError("Failed to load chart data");
        setLoading(false);
      }
      console.error("Failed to load chart data", error);
    });
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
    <div
      ref={chartRef}
      onMouseEnter={() => setIsChartHovered(true)}
      onMouseLeave={() => setIsChartHovered(false)}
      className={`obsd-chart${
        showLegend ? ` is-legend-${legendPosition}` : " is-legend-none"
      }`}
    >
      <div className="obsd-chart-area">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
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
      {showLegend ? (
        <>
          <div
            className={`obsd-chart-divider${
              isSideLegend ? " is-vertical" : " is-horizontal"
            }${isResizingLegend ? " is-active" : ""}`}
            onMouseDown={beginLegendResize}
            role="separator"
            aria-orientation={isSideLegend ? "vertical" : "horizontal"}
          />
          <div
            className="obsd-chart-legend"
            style={legendStyle}
            onWheel={(event) => event.stopPropagation()}
          >
            {data.map((entry, index) => (
              <div className="obsd-chart-legend-item" key={`${entry.name}-${index}`}>
                <span
                  className="obsd-chart-legend-swatch"
                  style={{ background: CHART_COLORS[index % CHART_COLORS.length] }}
                  title={entry.name}
                />
                <span className="obsd-chart-legend-label" title={entry.name}>
                  {entry.name}
                </span>
                <span className="obsd-chart-legend-value">{entry.value}</span>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
};

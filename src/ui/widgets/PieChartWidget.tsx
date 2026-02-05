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

  const legendDisplay = config.legendDisplay ?? "list";
  const legendPosition = resolveLegendPosition(
    config.legendPosition ?? "auto",
    config
  );
  const showLegend = legendDisplay === "list";

  return (
    <div
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
      ) : null}
    </div>
  );
};

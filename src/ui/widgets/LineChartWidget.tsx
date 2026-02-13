// Line chart widget using Recharts.
import * as React from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
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
  resolveTimeRange,
} from "../utils/dashboardUtils";
import type { LineChartWidgetConfig } from "../types";
import type { WidgetComponentProps } from "./types";
import { CHART_COLORS } from "./charts/colors";

export const LineChartWidget: React.FC<WidgetComponentProps<LineChartWidgetConfig>> = ({
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

    load().catch((error) => {
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
            stroke={CHART_COLORS[0]}
            strokeWidth={2}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

import * as React from "react";
import { useDataSource, useTimePresets } from "../widgetContext";
import {
  countByTarget,
  ensureStatFilters,
  normalizeTimeRange,
  resolveTimeRange,
} from "../utils/dashboardUtils";
import type { StatusBarWidgetConfig } from "../types";
import type { WidgetComponentProps } from "./types";

export const StatusBarWidget: React.FC<WidgetComponentProps<StatusBarWidgetConfig>> = ({
  config,
}) => {
  const dataSource = useDataSource();
  const timePresets = useTimePresets();
  const [value, setValue] = React.useState<number | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const filters = ensureStatFilters(config.filters);
  const countTarget = config.countTarget ?? "files";
  const timeField = config.timeField ?? "modified";
  const timeRange = normalizeTimeRange(config.timeRange);
  const target = typeof config.target === "number" ? config.target : null;

  React.useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const resolvedRange = resolveTimeRange(timeRange, timePresets);
        const result = await countByTarget(
          dataSource,
          countTarget,
          filters,
          timeField,
          resolvedRange
        );
        if (!cancelled) setValue(result.count);
      } catch {
        if (!cancelled) setError("Failed to load status");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [dataSource, countTarget, filters, timeField, timeRange, timePresets]);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>{error}</div>;
  if (value === null) return <div>No data.</div>;

  const targetValue = target ?? 0;
  const ratio = targetValue > 0 ? Math.min(1, value / targetValue) : 0;
  const percent = targetValue > 0 ? Math.round((value / targetValue) * 100) : 0;

  return (
    <div className="obsd-status">
      <div className="obsd-status-value">
        {targetValue > 0 ? `${value} / ${targetValue}` : String(value)}
      </div>
      <div className="obsd-status-bar">
        <div
          className="obsd-status-bar-fill"
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
      {targetValue > 0 ? (
        <div className="obsd-status-caption">{percent}%</div>
      ) : null}
    </div>
  );
};

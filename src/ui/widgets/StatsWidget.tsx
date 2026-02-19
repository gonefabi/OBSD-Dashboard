// Single-number stat widget with optional comparison.
import * as React from "react";
import { useDataSource, useTimePresets } from "../widgetContext";
import {
  applyComparisonBasis,
  countByTarget,
  derivePreviousRange,
  ensureStatFilters,
  formatNumber,
  formatSigned,
  normalizeTimeRange,
  resolveTimeRange,
} from "../utils/dashboardUtils";
import type { StatsWidgetConfig } from "../types";
import type { WidgetComponentProps } from "./types";
import { LucideIcon } from "./LucideIcon";

export const StatsWidget: React.FC<WidgetComponentProps<StatsWidgetConfig>> = ({
  config,
}) => {
  const dataSource = useDataSource();
  const timePresets = useTimePresets();
  const [primaryValue, setPrimaryValue] = React.useState<number | null>(null);
  const [compareValue, setCompareValue] = React.useState<number | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const filters = ensureStatFilters(config.filters);
  const compareFilters = ensureStatFilters(config.compareFilters);
  const countTarget = config.countTarget ?? "files";
  const timeField = config.timeField ?? "modified";
  const timeRange = normalizeTimeRange(config.timeRange);
  const compareRange = normalizeTimeRange(config.compareRange);
  const compareMode = config.compareMode ?? "none";
  const compareDisplay = config.compareDisplay ?? "number";
  const compareBasis = config.compareBasis ?? "total";
  const compareLabel = (config.compareLabel ?? "Delta").trim();
  const iconName = config.iconName?.trim();
  const iconPosition = config.iconPosition ?? "left";
  const valueAlign = config.valueAlign ?? "center";

  React.useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const resolvedRange = resolveTimeRange(timeRange, timePresets);
        const baseResult = await countByTarget(
          dataSource,
          countTarget,
          filters,
          timeField,
          resolvedRange
        );
        const baseMetric = applyComparisonBasis(baseResult, compareBasis);

        let compareMetric: number | null = null;
        if (compareMode === "previous-period") {
          const previous = derivePreviousRange(resolvedRange);
          if (previous) {
            const compareResult = await countByTarget(
              dataSource,
              countTarget,
              filters,
              timeField,
              previous
            );
            compareMetric = applyComparisonBasis(compareResult, compareBasis);
          }
        } else if (compareMode === "fixed-period") {
          const fixedRange = resolveTimeRange(compareRange, timePresets);
          const compareResult = await countByTarget(
            dataSource,
            countTarget,
            filters,
            timeField,
            fixedRange
          );
          compareMetric = applyComparisonBasis(compareResult, compareBasis);
        } else if (compareMode === "filter") {
          const compareResult = await countByTarget(
            dataSource,
            countTarget,
            compareFilters,
            timeField,
            resolvedRange
          );
          compareMetric = applyComparisonBasis(compareResult, compareBasis);
        }

        if (!cancelled) {
          setPrimaryValue(baseMetric);
          setCompareValue(compareMetric);
        }
      } catch {
        if (!cancelled) setError("Failed to load stats");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load().catch((error) => {
      if (!cancelled) {
        setError("Failed to load stats");
        setLoading(false);
      }
      console.error("Failed to load stats", error);
    });
    return () => {
      cancelled = true;
    };
  }, [
    dataSource,
    countTarget,
    filters,
    compareFilters,
    timeField,
    timeRange,
    compareRange,
    compareMode,
    compareBasis,
    timePresets,
  ]);

  if (loading) return <div>Loading stats...</div>;
  if (error) return <div>{error}</div>;
  if (primaryValue === null) return <div>No data.</div>;

  const baseDecimals = compareBasis === "per-day" ? 1 : 0;
  const formattedPrimary = formatNumber(primaryValue, baseDecimals);

  let deltaText: string | null = null;
  if (compareValue !== null) {
    if (compareDisplay === "percent") {
      if (compareValue === 0) {
        deltaText = compareLabel ? `${compareLabel} n/a` : "n/a";
      } else {
        const deltaPercent = ((primaryValue - compareValue) / compareValue) * 100;
        deltaText = `${compareLabel ? `${compareLabel} ` : ""}${formatSigned(
          deltaPercent,
          1
        )}%`;
      }
    } else {
      const delta = primaryValue - compareValue;
      deltaText = `${compareLabel ? `${compareLabel} ` : ""}${formatSigned(
        delta,
        baseDecimals
      )}`;
    }
  }

  return (
    <div className={`obsd-stat is-align-${valueAlign}`}>
      {compareBasis === "per-day" ? (
        <div className="obsd-stat-caption">Avg / day</div>
      ) : null}
      <div
        className={`obsd-stat-metric${
          iconName ? ` is-icon-${iconPosition}` : ""
        }`}
      >
        {iconPosition === "left" ? (
          <LucideIcon name={iconName} className="obsd-stat-icon" />
        ) : null}
        <div className="obsd-stat-text">
          <div className="obsd-stat-value">{formattedPrimary}</div>
          {deltaText ? <div className="obsd-stat-compare">{deltaText}</div> : null}
        </div>
        {iconPosition === "right" ? (
          <LucideIcon name={iconName} className="obsd-stat-icon" />
        ) : null}
      </div>
    </div>
  );
};

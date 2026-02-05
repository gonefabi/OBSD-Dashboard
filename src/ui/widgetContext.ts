import * as React from "react";
import { IDataSource } from "../interfaces/IDataSource";
import { DEFAULT_TIME_PRESETS, TimePreset } from "./timePresets";

export const DataSourceContext = React.createContext<IDataSource | null>(null);
export const TimePresetsContext = React.createContext<TimePreset[]>(DEFAULT_TIME_PRESETS);

export const useDataSource = (): IDataSource => {
  const context = React.useContext(DataSourceContext);
  if (!context) {
    throw new Error("DataSourceContext is missing. Wrap components with DashboardView.");
  }
  return context;
};

export const useTimePresets = (): TimePreset[] => {
  return React.useContext(TimePresetsContext);
};

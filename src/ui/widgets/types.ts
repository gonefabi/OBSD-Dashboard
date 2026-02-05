import type { WidgetConfig } from "../types";

export type WidgetComponentProps<T extends WidgetConfig> = {
  config: T;
};

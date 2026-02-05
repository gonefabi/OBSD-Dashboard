// Task list widget with toggles via IDataSource.
import * as React from "react";
import type { Task } from "../../interfaces/IDataSource";
import { useDataSource } from "../widgetContext";
import { ensureTaskFilters, queryTasksForFilters } from "../utils/dashboardUtils";
import type { TaskListWidgetConfig } from "../types";
import type { WidgetComponentProps } from "./types";

export const TaskListWidget: React.FC<WidgetComponentProps<TaskListWidgetConfig>> = ({
  config,
}) => {
  const dataSource = useDataSource();
  const [tasks, setTasks] = React.useState<Task[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const filters = ensureTaskFilters(config);

  React.useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const results = await queryTasksForFilters(dataSource, filters);
        const filtered = config.showCompleted
          ? results
          : results.filter((task) => !task.completed);
        const limited =
          typeof config.limit === "number" ? filtered.slice(0, config.limit) : filtered;
        if (!cancelled) setTasks(limited);
      } catch {
        if (!cancelled) setError("Failed to load tasks");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [dataSource, filters, config.showCompleted, config.limit]);

  const toggleTask = async (task: Task) => {
    if (task.line < 0) return;
    const ok = await dataSource.toggleTask(task.path, task.line);
    if (!ok) return;
    setTasks((prev) =>
      prev.map((item) =>
        item.path === task.path && item.line === task.line
          ? { ...item, completed: !item.completed, checked: !item.checked }
          : item
      )
    );
  };

  if (loading) return <div>Loading tasks...</div>;
  if (error) return <div>{error}</div>;
  if (tasks.length === 0) return <div>No tasks found.</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      {tasks.map((task) => (
        <label
          key={`${task.path}:${task.line}`}
          style={{ display: "flex", alignItems: "center", gap: "8px" }}
        >
          <input
            type="checkbox"
            checked={task.completed}
            onChange={() => toggleTask(task)}
          />
          <span
            style={{
              textDecoration: task.completed ? "line-through" : "none",
              color: task.completed ? "var(--text-muted)" : "var(--text-normal)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={task.text}
          >
            {task.text}
          </span>
        </label>
      ))}
    </div>
  );
};

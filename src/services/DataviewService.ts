import { App } from "obsidian";
import { IDataSource, Page, Task } from "../interfaces/IDataSource";
import { toggleTaskInFile } from "./taskToggle";

type DataviewApi = {
  pages: (query?: string) => unknown;
};

type DataviewTask = {
  text?: string;
  textRaw?: string;
  task?: string;
  completed?: boolean;
  checked?: boolean;
  status?: string;
  line?: number;
  lineNo?: number;
  path?: string;
  due?: unknown;
  tags?: unknown;
  section?: { subpath?: string } | string;
  position?: { start?: { line?: number } };
};

type DataviewPage = {
  file?: {
    path?: string;
    name?: string;
    basename?: string;
    ctime?: unknown;
    mtime?: unknown;
    tags?: unknown;
    frontmatter?: Record<string, unknown>;
    tasks?: DataviewTask[];
  };
  tags?: unknown;
};

export class DataviewService implements IDataSource {
  private app: App;

  constructor(app: App) {
    this.app = app;
  }

  async queryTasks(filter: string): Promise<Task[]> {
    const api = this.getDataviewApi();
    if (!api) return [];

    try {
      const pages = this.toArray(api.pages(filter?.trim() || undefined));
      const tasks: Task[] = [];

      for (const page of pages) {
        const typedPage = page as DataviewPage;
        const pageTasks = typedPage?.file?.tasks ?? [];
        for (const task of pageTasks) {
          tasks.push(this.mapTask(task, typedPage));
        }
      }

      return tasks;
    } catch (error) {
      console.warn("DataviewService.queryTasks failed", error);
      return [];
    }
  }

  async queryPages(query: string): Promise<Page[]> {
    const api = this.getDataviewApi();
    if (!api) return [];

    try {
      const pages = this.toArray(api.pages(query));
      return pages.map((page) => this.mapPage(page as DataviewPage));
    } catch (error) {
      console.warn("DataviewService.queryPages failed", error);
      return [];
    }
  }

  async toggleTask(path: string, line: number): Promise<boolean> {
    return toggleTaskInFile(this.app, path, line);
  }

  private getDataviewApi(): DataviewApi | null {
    const plugins = (this.app as unknown as { plugins?: { plugins?: Record<string, { api?: DataviewApi }> } })
      .plugins?.plugins;
    return plugins?.dataview?.api ?? null;
  }

  private toArray(value: unknown): unknown[] {
    if (Array.isArray(value)) return value;
    if (!value) return [];

    const asAny = value as { array?: () => unknown[]; values?: unknown[] };
    if (typeof asAny.array === "function") return asAny.array();
    if (Array.isArray(asAny.values)) return asAny.values;

    if (typeof (value as Iterable<unknown>)[Symbol.iterator] === "function") {
      return Array.from(value as Iterable<unknown>);
    }

    return [];
  }

  private mapTask(task: DataviewTask, page: DataviewPage): Task {
    const completed = Boolean(task.completed ?? task.checked ?? task.status === "x");
    const line =
      typeof task.line === "number"
        ? task.line
        : typeof task.lineNo === "number"
        ? task.lineNo
        : typeof task.position?.start?.line === "number"
        ? task.position.start.line
        : -1;

    return {
      path: task.path ?? page?.file?.path ?? "",
      line,
      text: task.text ?? task.textRaw ?? task.task ?? "",
      completed,
      checked: completed,
      due: this.formatMaybeDate(task.due),
      tags: this.normalizeTags(task.tags ?? page?.file?.tags ?? page?.tags),
      section: typeof task.section === "string" ? task.section : task.section?.subpath,
      fileCtime: this.formatMaybeDate(page?.file?.ctime),
      fileMtime: this.formatMaybeDate(page?.file?.mtime),
    };
  }

  private mapPage(page: DataviewPage): Page {
    const file = page?.file;

    return {
      path: file?.path ?? "",
      name: file?.name ?? file?.basename ?? file?.path ?? "",
      tags: this.normalizeTags(file?.tags ?? page?.tags),
      frontmatter: file?.frontmatter,
      ctime: this.formatMaybeDate(file?.ctime),
      mtime: this.formatMaybeDate(file?.mtime),
    };
  }

  private normalizeTags(tags: unknown): string[] | undefined {
    if (!tags) return undefined;
    if (Array.isArray(tags)) return tags.map((tag) => String(tag));
    return [String(tags)];
  }

  private formatMaybeDate(value: unknown): string | undefined {
    if (!value) return undefined;
    if (typeof value === "string") return value;
    if (value instanceof Date) return value.toISOString();
    if (typeof (value as { toString?: () => string }).toString === "function") {
      return (value as { toString: () => string }).toString();
    }
    return undefined;
  }


}

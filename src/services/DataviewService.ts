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

  queryTasks(filter: string): Promise<Task[]> {
    const api = this.getDataviewApi();
    if (!api) return Promise.resolve([]);

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

      return Promise.resolve(tasks);
    } catch (error) {
      console.warn("DataviewService.queryTasks failed", error);
      return Promise.resolve([]);
    }
  }

  queryPages(query: string): Promise<Page[]> {
    const api = this.getDataviewApi();
    if (!api) return Promise.resolve([]);

    try {
      const pages = this.toArray(api.pages(query));
      return Promise.resolve(pages.map((page) => this.mapPage(page as DataviewPage)));
    } catch (error) {
      console.warn("DataviewService.queryPages failed", error);
      return Promise.resolve([]);
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
    const items = Array.isArray(tags) ? tags : [tags];
    const normalized = items
      .map((tag) => this.stringifyTag(tag))
      .filter((tag): tag is string => Boolean(tag));
    return normalized.length > 0 ? normalized : undefined;
  }

  private stringifyTag(tag: unknown): string | null {
    if (typeof tag === "string") return tag;
    if (typeof tag === "number") return tag.toString();
    if (typeof tag === "boolean") return tag ? "true" : "false";
    if (tag instanceof Date) return tag.toISOString();
    if (tag && typeof tag === "object") {
      const asAny = tag as {
        tag?: unknown;
        path?: unknown;
        value?: unknown;
      };
      if (typeof asAny.tag === "string") return asAny.tag;
      if (typeof asAny.path === "string") return asAny.path;
      if (typeof asAny.value === "string") return asAny.value;
      try {
        const json = JSON.stringify(tag);
        if (json && json !== "{}") return json;
      } catch {
        return null;
      }
    }
    return null;
  }

  private formatMaybeDate(value: unknown): string | undefined {
    if (value === null || value === undefined) return undefined;
    if (typeof value === "string") return value;
    if (typeof value === "number") return value.toString();
    if (typeof value === "boolean") return value ? "true" : "false";
    if (value instanceof Date) return value.toISOString();
    if (typeof value === "object") {
      const asAny = value as {
        toISO?: () => unknown;
        toISODate?: () => unknown;
        value?: unknown;
      };
      if (typeof asAny.toISO === "function") {
        const iso = asAny.toISO();
        if (typeof iso === "string" && iso.length > 0) return iso;
      }
      if (typeof asAny.toISODate === "function") {
        const isoDate = asAny.toISODate();
        if (typeof isoDate === "string" && isoDate.length > 0) return isoDate;
      }
      if (typeof asAny.value === "string" && asAny.value.length > 0) {
        return asAny.value;
      }
    }
    return undefined;
  }


}

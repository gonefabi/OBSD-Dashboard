export interface Task {
  path: string;
  line: number;
  text: string;
  completed: boolean;
  checked?: boolean;
  due?: string;
  tags?: string[];
  section?: string;
  fileCtime?: string;
  fileMtime?: string;
}

export interface Page {
  path: string;
  name: string;
  tags?: string[];
  frontmatter?: Record<string, unknown>;
  ctime?: string;
  mtime?: string;
}

export interface IDataSource {
  queryTasks(filter: string): Promise<Task[]>;
  queryPages(query: string): Promise<Page[]>;
  toggleTask(path: string, line: number): Promise<boolean>;
}

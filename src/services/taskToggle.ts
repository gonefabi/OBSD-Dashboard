import { App, TFile } from "obsidian";

export const toggleTaskInFile = async (
  app: App,
  path: string,
  line: number
): Promise<boolean> => {
  const file = app.vault.getAbstractFileByPath(path);
  if (!(file instanceof TFile)) return false;

  try {
    const content = await app.vault.read(file);
    const lines = content.split("\n");
    const index = resolveLineIndex(lines, line);
    if (index < 0 || index >= lines.length) return false;

    const original = lines[index];
    const toggled = toggleCheckbox(original);
    if (toggled === original) return false;

    lines[index] = toggled;
    await app.vault.modify(file, lines.join("\n"));
    return true;
  } catch (error) {
    console.warn("toggleTaskInFile failed", error);
    return false;
  }
};

const resolveLineIndex = (lines: string[], line: number): number => {
  if (line >= 0 && line < lines.length) return line;
  if (line > 0 && line - 1 < lines.length) return line - 1;
  return -1;
};

const toggleCheckbox = (line: string): string => {
  const match = line.match(/^(\s*[-*]\s+\[)( |x|X)(\])/);
  if (!match) return line;
  const next = match[2].toLowerCase() === "x" ? " " : "x";
  return line.replace(match[0], `${match[1]}${next}${match[3]}`);
};

// Real skills on this machine are read-only. Opening one copies it into a "notebook" inside
// this project, and every edit and save happens on that copy.

import { Glob } from "bun";
import { existsSync } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { readFrontMatterYaml } from "./front_matter";
import { splitSkillFile } from "./skill_file";

const homeDirectory = homedir();

// Where Claude Code itself keeps skills. Either folder may not exist yet on a given machine.
const claudeCodeSkillRoots = [
  { sourceGroup: "my skills", rootDirectory: path.join(homeDirectory, ".claude/skills") },
  { sourceGroup: "plugin", rootDirectory: path.join(homeDirectory, ".claude/plugins/cache") },
].filter(({ rootDirectory }) => existsSync(rootDirectory));

// Any other folders of skills, such as a skills repo you're working on, separated by ":".
const extraSkillRoots = (process.env.EXTRA_SKILL_FOLDERS ?? "")
  .split(path.delimiter)
  .filter((folder) => folder.trim() !== "")
  .map((folder) => {
    if (!existsSync(folder)) throw new Error(`EXTRA_SKILL_FOLDERS names a folder that doesn't exist: ${folder}`);
    return { sourceGroup: path.basename(path.resolve(folder)), rootDirectory: path.resolve(folder) };
  });

const realSkillRoots = [...claudeCodeSkillRoots, ...extraSkillRoots];
export const notebooksDirectory = path.join(import.meta.dir, ".scratch", "notebooks");

export type RealSkill = {
  sourcePath: string;
  sourceGroup: string;
  skillName: string;
  description: string;
  notebookPath: string;
  hasNotebook: boolean;
};

export function readFrontMatter(skillFileText: string): Record<string, unknown> {
  return readFrontMatterYaml(splitSkillFile(skillFileText).frontMatterYaml).frontMatter;
}

export function problemsWithSkillFile(skillFileText: string): string[] {
  let frontMatter: Record<string, unknown>;
  try {
    frontMatter = readFrontMatter(skillFileText);
  } catch (error) {
    return [(error as Error).message];
  }
  const problems: string[] = [];
  if (typeof frontMatter.name !== "string" || frontMatter.name.trim() === "") problems.push("the front matter needs a name");
  if (typeof frontMatter.description !== "string" || frontMatter.description.trim() === "") problems.push("the front matter needs a description");
  return problems;
}

// The plugin cache keeps every installed version, so only the newest copy of each plugin skill is listed.
export async function listRealSkills(): Promise<RealSkill[]> {
  const newestSkillByKey = new Map<string, { sourcePath: string; sourceGroup: string; modifiedTime: number }>();
  for (const { sourceGroup, rootDirectory } of realSkillRoots) {
    const skillFileGlob = new Glob("**/SKILL.md");
    for await (const relativePath of skillFileGlob.scan({ cwd: rootDirectory, followSymlinks: true, onlyFiles: true })) {
      if (relativePath.includes("node_modules/")) continue;
      const sourcePath = path.join(rootDirectory, relativePath);
      const pathSegments = relativePath.split(path.sep);
      const isPluginCache = sourceGroup === "plugin";
      const skillDirectoryName = path.basename(path.dirname(sourcePath));
      const dedupeKey = isPluginCache ? `${pathSegments[0]}/${pathSegments[1]}/${skillDirectoryName}` : sourcePath;
      const modifiedTime = (await stat(sourcePath)).mtimeMs;
      const existing = newestSkillByKey.get(dedupeKey);
      if (!existing || modifiedTime > existing.modifiedTime) {
        newestSkillByKey.set(dedupeKey, { sourcePath, sourceGroup: isPluginCache ? pathSegments[1] : sourceGroup, modifiedTime });
      }
    }
  }

  const realSkills: RealSkill[] = [];
  for (const { sourcePath, sourceGroup } of newestSkillByKey.values()) {
    const frontMatter = readFrontMatter(await Bun.file(sourcePath).text());
    const skillName = String(frontMatter.name ?? path.basename(path.dirname(sourcePath)));
    const notebookSlug = `${sourceGroup}--${skillName}`.replace(/[^a-z0-9._-]+/gi, "-");
    const notebookPath = path.join(notebooksDirectory, notebookSlug, "SKILL.md");
    realSkills.push({
      sourcePath,
      sourceGroup,
      skillName,
      description: String(frontMatter.description ?? ""),
      notebookPath,
      hasNotebook: await Bun.file(notebookPath).exists(),
    });
  }
  return realSkills.sort((first, second) => first.sourceGroup.localeCompare(second.sourceGroup) || first.skillName.localeCompare(second.skillName));
}

/** Copies the real skill into its notebook the first time; afterwards the notebook (with your edits) is what opens. */
export async function openNotebook(sourcePath: string): Promise<{ notebookPath: string; sourcePath: string; skillFileText: string }> {
  const realSkill = (await listRealSkills()).find((candidate) => candidate.sourcePath === sourcePath);
  if (!realSkill) throw new Error(`Not a skill this editor found on this machine: ${sourcePath}`);
  if (!realSkill.hasNotebook) {
    await mkdir(path.dirname(realSkill.notebookPath), { recursive: true });
    await Bun.write(realSkill.notebookPath, Bun.file(sourcePath));
    await Bun.write(path.join(path.dirname(realSkill.notebookPath), "copied-from.txt"), `${sourcePath}\n`);
  }
  return { notebookPath: realSkill.notebookPath, sourcePath, skillFileText: await Bun.file(realSkill.notebookPath).text() };
}

export async function saveNotebook(notebookPath: string, skillFileText: string): Promise<{ notebookPath: string; byteCount: number }> {
  const resolvedNotebookPath = path.resolve(notebookPath);
  if (!resolvedNotebookPath.startsWith(notebooksDirectory + path.sep)) {
    throw new Error(`Refusing to write outside the notebooks folder: ${notebookPath}`);
  }
  const problems = problemsWithSkillFile(skillFileText);
  if (problems.length > 0) throw new Error(`Not saved, because it wouldn't be a valid SKILL.md: ${problems.join("; ")}`);
  await Bun.write(resolvedNotebookPath, skillFileText);
  const writtenText = await Bun.file(resolvedNotebookPath).text();
  if (writtenText !== skillFileText) throw new Error(`The file on disk doesn't match what was saved: ${resolvedNotebookPath}`);
  return { notebookPath: resolvedNotebookPath, byteCount: Buffer.byteLength(writtenText) };
}

// Reading and editing a skill's YAML front matter.
//
// Claude Code loads skills whose front matter strict YAML rejects (a description that starts
// with "@" is a real example on this machine), so reading falls back to quoting bare top-level
// values and reports the strict-YAML problem instead of failing.
//
// Editing a field splices only that field's lines, so comments, key order and every other
// field stay byte-for-byte as the author wrote them.

import YAML from "yaml";

export type FrontMatterReading = {
  frontMatter: Record<string, unknown>;
  strictYamlProblem: string | null;
};

const topLevelKeyLinePattern = /^([A-Za-z0-9_-]+):[ \t]*(.*)$/;

function parseMapping(frontMatterYaml: string): Record<string, unknown> {
  const parsed = YAML.parse(frontMatterYaml);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Front matter is not a YAML mapping of keys to values");
  return parsed;
}

function quoteBareTopLevelValues(frontMatterYaml: string): string {
  return frontMatterYaml
    .split("\n")
    .map((line) => {
      const keyLine = topLevelKeyLinePattern.exec(line);
      if (!keyLine) return line;
      const [, key, value] = keyLine;
      const isAlreadyStructured = value === "" || /^["'|>[{&*!#]/.test(value);
      return isAlreadyStructured ? line : `${key}: ${JSON.stringify(value)}`;
    })
    .join("\n");
}

export function readFrontMatterYaml(frontMatterYaml: string): FrontMatterReading {
  try {
    return { frontMatter: parseMapping(frontMatterYaml), strictYamlProblem: null };
  } catch (strictError) {
    const strictYamlProblem = (strictError as Error).message.split("\n")[0];
    return { frontMatter: parseMapping(quoteBareTopLevelValues(frontMatterYaml)), strictYamlProblem };
  }
}

/** The lines a top-level key owns: its own line plus indented continuation lines (not trailing blank lines). */
function lineRangeOfTopLevelKey(lines: string[], key: string): { firstLine: number; endExclusive: number } | null {
  const firstLine = lines.findIndex((line) => topLevelKeyLinePattern.exec(line)?.[1] === key);
  if (firstLine === -1) return null;
  let endExclusive = firstLine + 1;
  while (endExclusive < lines.length && (lines[endExclusive].trim() === "" || /^[ \t]/.test(lines[endExclusive]))) endExclusive++;
  while (endExclusive > firstLine + 1 && lines[endExclusive - 1].trim() === "") endExclusive--;
  return { firstLine, endExclusive };
}

export function withFrontMatterField(frontMatterYaml: string, key: string, value: string): string {
  const serializedField = YAML.stringify({ [key]: value }, { lineWidth: 0 }).replace(/\n$/, "");
  const lines = frontMatterYaml.split("\n");
  const keyRange = lineRangeOfTopLevelKey(lines, key);
  const editedYaml = keyRange
    ? [...lines.slice(0, keyRange.firstLine), serializedField, ...lines.slice(keyRange.endExclusive)].join("\n")
    : `${frontMatterYaml}\n${serializedField}`;
  const readBack = readFrontMatterYaml(editedYaml).frontMatter[key];
  if (readBack !== value) throw new Error(`Editing "${key}" didn't read back the same value`);
  return editedYaml;
}

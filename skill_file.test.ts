import { describe, expect, test } from "bun:test";
import { readFrontMatterYaml, withFrontMatterField } from "./front_matter";
import { changeImportance, eraseBlockRange, normalizeBlocks, replaceBlockRange } from "./skill_body_edits";
import { joinBodyBlocks, joinSkillFile, splitBodyIntoBlocks, splitSkillFile, type BodyBlock } from "./skill_file";
import { listRealSkills, readFrontMatter } from "./skill_library";

const realSkills = await listRealSkills();
const realSkillTexts = await Promise.all(realSkills.map(async (skill) => ({ skill, text: await Bun.file(skill.sourcePath).text() })));

const bodyOf = (markdown: string) => splitBodyIntoBlocks(markdown);
const nonBlankTexts = (blocks: BodyBlock[]) => blocks.filter((block) => block.kind !== "blank").map((block) => block.markdown.trimEnd());

describe("every real skill on this machine", () => {
  test("there are real skills to test against", () => {
    expect(realSkills.length).toBeGreaterThan(0);
  });

  test("file and body split back into exactly the same bytes", () => {
    for (const { skill, text } of realSkillTexts) {
      const parts = splitSkillFile(text);
      expect(joinSkillFile(parts), skill.sourcePath).toBe(text);
      expect(joinBodyBlocks(splitBodyIntoBlocks(parts.body)), skill.sourcePath).toBe(parts.body);
      expect(joinBodyBlocks(normalizeBlocks(splitBodyIntoBlocks(parts.body))), skill.sourcePath).toBe(parts.body);
    }
  });

  test("front matter parses with a name and a description", () => {
    for (const { skill, text } of realSkillTexts) {
      const frontMatter = readFrontMatter(text);
      expect(typeof frontMatter.name, skill.sourcePath).toBe("string");
      expect(typeof frontMatter.description, skill.sourcePath).toBe("string");
    }
  });

  test("smile and frown on any block keep all the content", () => {
    for (const { skill, text } of realSkillTexts) {
      const blocks = splitBodyIntoBlocks(splitSkillFile(text).body);
      blocks.forEach((block, blockIndex) => {
        if (block.kind === "blank" || block.kind === "heading" || block.kind === "list-item") return;
        for (const direction of ["more", "less"] as const) {
          const editedBlocks = changeImportance(blocks, blockIndex, blockIndex, direction);
          expect(nonBlankTexts(editedBlocks).sort(), `${skill.sourcePath} block ${blockIndex} ${direction}`).toEqual(nonBlankTexts(blocks).sort());
        }
      });
    }
  });

  test("erasing a block removes exactly that block", () => {
    for (const { skill, text } of realSkillTexts) {
      const blocks = splitBodyIntoBlocks(splitSkillFile(text).body);
      blocks.forEach((block, blockIndex) => {
        if (block.kind === "blank" || block.kind === "list-item") return;
        const expectedTexts = nonBlankTexts(blocks);
        expectedTexts.splice(expectedTexts.indexOf(block.markdown.trimEnd()), 1);
        expect(nonBlankTexts(eraseBlockRange(blocks, blockIndex, blockIndex)).sort(), `${skill.sourcePath} block ${blockIndex}`).toEqual(expectedTexts.sort());
      });
    }
  });

  test("editing name or description on the cover changes only that field", () => {
    for (const { skill, text } of realSkillTexts) {
      const frontMatterYaml = splitSkillFile(text).frontMatterYaml;
      const { frontMatter } = readFrontMatterYaml(frontMatterYaml);
      const editedYaml = withFrontMatterField(frontMatterYaml, "description", `${frontMatter.description} (edited)`);
      const editedFrontMatter = readFrontMatterYaml(editedYaml).frontMatter;
      expect(editedFrontMatter.description, skill.sourcePath).toBe(`${frontMatter.description} (edited)`);
      const editedWithOriginalDescription: Record<string, unknown> = { ...editedFrontMatter, description: frontMatter.description };
      expect(editedWithOriginalDescription, skill.sourcePath).toEqual(frontMatter);
    }
  });

  test("which real skills strict YAML rejects (informational)", () => {
    const strictlyInvalid = realSkillTexts.filter(({ text }) => readFrontMatterYaml(splitSkillFile(text).frontMatterYaml).strictYamlProblem);
    console.log(`strict YAML rejects ${strictlyInvalid.length} of ${realSkillTexts.length}: ${strictlyInvalid.map(({ skill }) => skill.sourcePath.replace(/^.*\/(\.claude|Scripts)\//, "")).join(", ")}`);
  });
});

describe("smile and frown", () => {
  test("headings grow and shrink a level at a time", () => {
    const blocks = bodyOf("### Rules\n\nBe kind.\n");
    expect(joinBodyBlocks(changeImportance(blocks, 0, 0, "more"))).toBe("## Rules\n\nBe kind.\n");
    expect(joinBodyBlocks(changeImportance(blocks, 0, 0, "less"))).toBe("#### Rules\n\nBe kind.\n");
    expect(joinBodyBlocks(changeImportance(bodyOf("# Top\n"), 0, 0, "more"))).toBe("# Top\n");
  });

  test("a paragraph rises to the top of its section, or sinks to the bottom", () => {
    const blocks = bodyOf("## Section\n\nFirst.\n\nSecond.\n\nThird.\n\n## Next\n\nOther.\n");
    expect(joinBodyBlocks(changeImportance(blocks, 6, 6, "more"))).toBe("## Section\n\nThird.\n\nFirst.\n\nSecond.\n\n## Next\n\nOther.\n");
    expect(joinBodyBlocks(changeImportance(blocks, 2, 2, "less"))).toBe("## Section\n\nSecond.\n\nThird.\n\nFirst.\n\n## Next\n\nOther.\n");
  });

  test("a list item moves within its list and ordered lists renumber", () => {
    const blocks = bodyOf("Steps:\n\n1. Update\n2. Verify\n3. Build\n");
    expect(joinBodyBlocks(changeImportance(blocks, 4, 4, "more"))).toBe("Steps:\n\n1. Build\n2. Update\n3. Verify\n");
    expect(joinBodyBlocks(changeImportance(blocks, 2, 3, "less"))).toBe("Steps:\n\n1. Build\n2. Update\n3. Verify\n");
  });
});

describe("human and einstein replacements", () => {
  test("replacement text is kept apart from its neighbours by blank lines", () => {
    const blocks = bodyOf("Intro.\n\n1. Update\n2. Verify\n3. Build\n\nOutro.\n");
    expect(joinBodyBlocks(replaceBlockRange(blocks, 2, 4, "Bump the version, check it, build.\n\n"))).toBe(
      "Intro.\n\nBump the version, check it, build.\n\nOutro.\n",
    );
  });

  test("a numbered list item keeps its fenced code block as part of the item", () => {
    const blocks = bodyOf("8.  **Changelog**: Regenerate:\n    ```bash\n    # not a heading\n    gh api x\n    ```\n9.  **Sync**: push.\n");
    expect(blocks.map((block) => block.kind)).toEqual(["list-item", "list-item"]);
  });
});

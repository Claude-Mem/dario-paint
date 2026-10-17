// The composition-book skill editor: a skill is big text on ruled paper, and you change it by
// painting over it with Mario Paint-style stamps.

import { marked } from "marked";
import { readFrontMatterYaml, withFrontMatterField } from "./front_matter";
import { type SpriteName, spriteCursor, spriteSvg } from "./pixel_sprites";
import { animationKeysFor, changeImportance, eraseBlockRange, replaceBlockRange, rewriteBlockExactly } from "./skill_body_edits";
import { type BodyBlock, type SkillFileParts, joinBodyBlocks, joinSkillFile, splitBodyIntoBlocks, splitSkillFile } from "./skill_file";
import type { RealSkill } from "./skill_library";
import { isSoundOn, setSoundOn, sounds } from "./sounds";

const ruleGapInPixels = 40;
// A line of body text is 40px from rule to rule, with its letters in the middle 32px. A 48px brush
// covers the whole line with room for a wobbly hand, and stops short of the letters above and below.
const brushWidthInPixels = 48;

type ToolName = "pencil" | "human" | "einstein" | "eraser" | "smile" | "frown";
type Tool = { toolName: ToolName; label: string; spriteName: SpriteName; paintColour: string; hint: string };

const tools: Tool[] = [
  { toolName: "pencil", label: "pencil", spriteName: "pencil", paintColour: "transparent", hint: "Pencil: click any line to write it yourself" },
  { toolName: "human", label: "human", spriteName: "human", paintColour: "rgba(255, 150, 60, 0.42)", hint: "Human: paint over anything too technical or too granular, and it comes back the way a person would say it" },
  { toolName: "einstein", label: "einstein", spriteName: "einstein", paintColour: "rgba(150, 110, 255, 0.38)", hint: "Einstein: paint over steps or bare rules, and they come back as the principle, with the why" },
  { toolName: "eraser", label: "eraser", spriteName: "eraser", paintColour: "rgba(255, 110, 160, 0.4)", hint: "Eraser: rub it out" },
  { toolName: "smile", label: "more", spriteName: "smile", paintColour: "rgba(255, 205, 40, 0.45)", hint: "Smile: this matters more. Headings grow, everything else rises to the top" },
  { toolName: "frown", label: "less", spriteName: "frown", paintColour: "rgba(80, 140, 220, 0.38)", hint: "Frown: this matters less. Headings shrink, everything else sinks to the bottom" },
];

const pageElement = document.getElementById("page")!;
const pageBlocksElement = document.getElementById("page-blocks")!;
const paintLayer = document.getElementById("paint-layer") as HTMLCanvasElement;
const paintContext = paintLayer.getContext("2d")!;
const nameInput = document.getElementById("skill-name-input") as HTMLInputElement;
const descriptionInput = document.getElementById("skill-description-input") as HTMLTextAreaElement;
const descriptionMeter = document.getElementById("description-meter")!;
const stickersElement = document.getElementById("front-matter-stickers")!;
const stampTray = document.getElementById("stamp-tray")!;
const toolHint = document.getElementById("tool-hint")!;
const shelfElement = document.getElementById("shelf")!;
const shelfSearch = document.getElementById("shelf-search") as HTMLInputElement;
const shelfList = document.getElementById("shelf-list")!;
const toastElement = document.getElementById("toast")!;

let openedNotebook: { notebookPath: string; sourcePath: string } | null = null;
let skillParts: SkillFileParts | null = null;
let blocks: BodyBlock[] = [];
let activeToolName: ToolName = "pencil";
let isDirty = false;
let isBusy = false;
let realSkills: RealSkill[] = [];
const undoSnapshots: string[] = [];

marked.use({ renderer: { html: ({ text }) => escapeHtml(text) } });

function escapeHtml(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function activeTool(): Tool {
  return tools.find((tool) => tool.toolName === activeToolName)!;
}

function currentSkillText(): string {
  return joinSkillFile({ ...skillParts!, body: joinBodyBlocks(blocks) });
}

function blockElements(): HTMLElement[] {
  return [...pageBlocksElement.children] as HTMLElement[];
}

// ---------- server calls ----------

async function readJsonResponse<ResponseBody>(response: Response): Promise<ResponseBody> {
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? `${response.status} ${response.statusText}`);
  return payload;
}

async function getJson<ResponseBody>(url: string): Promise<ResponseBody> {
  return readJsonResponse<ResponseBody>(await fetch(url));
}

async function postJson<ResponseBody>(url: string, requestBody: unknown): Promise<ResponseBody> {
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(requestBody) });
  return readJsonResponse<ResponseBody>(response);
}

// ---------- the cover ----------

function autosizeTextarea(textarea: HTMLTextAreaElement): void {
  textarea.style.height = "auto";
  textarea.style.height = `${textarea.scrollHeight}px`;
}

function updateDescriptionMeter(): void {
  const descriptionLength = descriptionInput.value.trim().length;
  const isOverLimit = descriptionLength > 1024;
  descriptionMeter.textContent = `${descriptionLength} characters. Claude reads only this before deciding to use the skill.${isOverLimit ? " That's over the 1,024 limit." : ""}`;
  descriptionMeter.classList.toggle("is-long", isOverLimit);
}

function sticker(text: string, isWarning = false): HTMLElement {
  const stickerElement = document.createElement("span");
  stickerElement.className = `sticker${isWarning ? " is-warning" : ""}`;
  stickerElement.textContent = text;
  return stickerElement;
}

function renderCover(): void {
  const { frontMatter, strictYamlProblem } = readFrontMatterYaml(skillParts!.frontMatterYaml);
  nameInput.value = String(frontMatter.name ?? "");
  descriptionInput.value = String(frontMatter.description ?? "");
  autosizeTextarea(descriptionInput);
  updateDescriptionMeter();
  const otherKeys = Object.keys(frontMatter).filter((key) => key !== "name" && key !== "description");
  stickersElement.replaceChildren(
    ...otherKeys.map((key) => sticker(`also: ${key}`)),
    ...(strictYamlProblem ? [sticker(`strict YAML would reject this front matter: ${strictYamlProblem}`, true)] : []),
  );
  document.title = `${nameInput.value || "untitled"} · Dario Paint`;
}

function editFrontMatterField(key: "name" | "description", value: string): void {
  const previousText = currentSkillText();
  try {
    skillParts = { ...skillParts!, frontMatterYaml: withFrontMatterField(skillParts!.frontMatterYaml, key, value) };
    undoSnapshots.push(previousText);
    markDirty();
  } catch (error) {
    showToast((error as Error).message, "error");
  }
  renderCover();
}

nameInput.addEventListener("change", () => editFrontMatterField("name", nameInput.value.trim()));
descriptionInput.addEventListener("change", () => editFrontMatterField("description", descriptionInput.value.trim()));
descriptionInput.addEventListener("input", () => {
  autosizeTextarea(descriptionInput);
  updateDescriptionMeter();
});

// ---------- the page ----------

function renderMarkdown(markdown: string): string {
  return marked.parse(markdown, { async: false, gfm: true }) as string;
}

function blockElementFor(block: BodyBlock, blockIndex: number): HTMLElement {
  const element = document.createElement("div");
  element.className = `block block-${block.kind}`;
  element.dataset.blockIndex = String(blockIndex);
  if (block.kind === "blank") {
    const blankLineCount = Math.max(1, (block.markdown.match(/\n/g) ?? []).length);
    element.style.height = `${blankLineCount * ruleGapInPixels}px`;
  } else {
    element.innerHTML = renderMarkdown(block.markdown);
  }
  return element;
}

// Every block takes a whole number of ruled lines, so the next block starts on a line again.
function snapToRules(element: HTMLElement): void {
  if (element.classList.contains("block-blank")) return;
  element.style.minHeight = "";
  const naturalHeight = element.getBoundingClientRect().height;
  element.style.minHeight = `${Math.max(1, Math.ceil(naturalHeight / ruleGapInPixels - 0.05)) * ruleGapInPixels}px`;
}

function resizePaintLayer(): void {
  const pixelRatio = window.devicePixelRatio || 1;
  const width = pageElement.clientWidth;
  const height = pageElement.scrollHeight;
  paintLayer.width = Math.round(width * pixelRatio);
  paintLayer.height = Math.round(height * pixelRatio);
  paintLayer.style.width = `${width}px`;
  paintLayer.style.height = `${height}px`;
  paintContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
}

function renderBlocks(): void {
  pageBlocksElement.replaceChildren(...blocks.map(blockElementFor));
  blockElements().forEach(snapToRules);
  resizePaintLayer();
}

type BlockEffect = "glide" | "write-in" | "happier" | "sadder";

// Blocks that survive an edit glide from where they were; blocks that are new get the stamp's effect.
function commitBlocks(editedBlocks: BodyBlock[], blockEffect: BlockEffect, paintedKeys: Set<string> = new Set()): void {
  const previousKeys = animationKeysFor(blocks);
  const previousTopByKey = new Map<string, number>();
  blockElements().forEach((element, blockIndex) => previousTopByKey.set(previousKeys[blockIndex], element.getBoundingClientRect().top));
  blocks = editedBlocks;
  markDirty();
  renderBlocks();
  const editedKeys = animationKeysFor(blocks);
  blockElements().forEach((element, blockIndex) => {
    if (blocks[blockIndex].kind === "blank") return;
    const blockKey = editedKeys[blockIndex];
    const previousTop = previousTopByKey.get(blockKey);
    if (previousTop !== undefined) {
      const distanceMoved = previousTop - element.getBoundingClientRect().top;
      if (Math.abs(distanceMoved) > 1) {
        element.animate([{ transform: `translateY(${distanceMoved}px)` }, { transform: "none" }], { duration: 560, easing: "cubic-bezier(.2,.9,.25,1.15)" });
      }
    }
    const isNewBlock = previousTop === undefined;
    if (blockEffect === "write-in" && isNewBlock) writeIn(element);
    if ((blockEffect === "happier" || blockEffect === "sadder") && (isNewBlock || paintedKeys.has(blockKey))) {
      pulse(element, blockEffect === "happier" ? 1.07 : 0.93);
      if (blockEffect === "happier") spawnParticles(areaOf([element]), "particle-sparkle", 7);
    }
  });
}

function markDirty(): void {
  isDirty = true;
  document.getElementById("save-button")?.classList.add("is-unsaved");
}

function markSaved(): void {
  isDirty = false;
  document.getElementById("save-button")?.classList.remove("is-unsaved");
}

// ---------- little bits of magic ----------

function writeIn(element: HTMLElement): void {
  const textWalker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  while (textWalker.nextNode()) textNodes.push(textWalker.currentNode as Text);
  const wordElements: HTMLElement[] = [];
  for (const textNode of textNodes) {
    const fragment = document.createDocumentFragment();
    for (const piece of (textNode.textContent ?? "").split(/(\s+)/)) {
      if (piece === "" || /^\s+$/.test(piece)) {
        fragment.append(piece);
        continue;
      }
      const wordElement = document.createElement("span");
      wordElement.className = "written-word";
      wordElement.textContent = piece;
      fragment.append(wordElement);
      wordElements.push(wordElement);
    }
    textNode.replaceWith(fragment);
  }
  const delayBetweenWords = Math.min(45, 1400 / Math.max(1, wordElements.length));
  wordElements.forEach((wordElement, wordIndex) => (wordElement.style.animationDelay = `${wordIndex * delayBetweenWords}ms`));
}

function pulse(element: HTMLElement, peakScale: number): void {
  const pulseTarget = (element.firstElementChild as HTMLElement | null) ?? element;
  pulseTarget.style.transformOrigin = "left center";
  pulseTarget.animate([{ transform: "scale(1)" }, { transform: `scale(${peakScale})` }, { transform: "scale(1)" }], { duration: 650, easing: "ease-in-out", delay: 150 });
}

type PageArea = { left: number; top: number; width: number; height: number };

function areaOf(elements: HTMLElement[]): PageArea {
  const pageRect = pageElement.getBoundingClientRect();
  const firstRect = elements[0].getBoundingClientRect();
  const lastRect = elements[elements.length - 1].getBoundingClientRect();
  return { left: firstRect.left - pageRect.left, top: firstRect.top - pageRect.top, width: firstRect.width, height: lastRect.bottom - firstRect.top };
}

function spawnParticles(area: PageArea, particleClass: string, particleCount: number): void {
  for (let particleIndex = 0; particleIndex < particleCount; particleIndex++) {
    const particle = document.createElement("div");
    particle.className = `particle ${particleClass}`;
    particle.style.left = `${area.left + Math.random() * Math.min(area.width, 700)}px`;
    particle.style.top = `${area.top + Math.random() * area.height}px`;
    particle.style.setProperty("--fly-x", `${(Math.random() - 0.5) * 140}px`);
    particle.style.setProperty("--fly-y", `${(Math.random() - 0.75) * 110}px`);
    particle.addEventListener("animationend", () => particle.remove());
    pageElement.append(particle);
  }
}

function addClassAndWait(elements: HTMLElement[], className: string, durationInMilliseconds: number): Promise<void> {
  elements.forEach((element) => element.classList.add(className));
  return new Promise((resolve) => setTimeout(resolve, durationInMilliseconds));
}

function placeStampMark(point: { x: number; y: number }, spriteName: SpriteName): HTMLElement {
  const stampMark = document.createElement("div");
  stampMark.className = "stamp-mark";
  stampMark.innerHTML = spriteSvg(spriteName, 56);
  stampMark.style.left = `${point.x}px`;
  stampMark.style.top = `${point.y}px`;
  pageElement.append(stampMark);
  return stampMark;
}

function liftStampMark(stampMark: HTMLElement): void {
  stampMark.classList.add("is-leaving");
  setTimeout(() => stampMark.remove(), 400);
}

function showThoughtBubble(tool: Tool, area: PageArea): () => void {
  const bubble = document.createElement("div");
  bubble.className = "thought-bubble";
  bubble.innerHTML = `${spriteSvg(tool.spriteName, 32)}<span>${tool.label} is thinking <span class="thinking-seconds">0s</span></span>`;
  bubble.style.top = `${Math.max(8, area.top - 54)}px`;
  pageElement.append(bubble);
  const startedAt = Date.now();
  const secondsTimer = setInterval(() => {
    bubble.querySelector(".thinking-seconds")!.textContent = `${Math.round((Date.now() - startedAt) / 1000)}s`;
  }, 1000);
  return () => {
    clearInterval(secondsTimer);
    bubble.remove();
  };
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;
function showToast(message: string, tone: "ok" | "error" | "info" = "info"): void {
  toastElement.textContent = message;
  toastElement.className = `toast is-${tone}`;
  toastElement.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toastElement.hidden = true), tone === "error" ? 10000 : 4000);
}

// ---------- painting with a stamp ----------

type PagePoint = { x: number; y: number };
type Stroke = { pointerId: number; points: PagePoint[]; stampMark: HTMLElement };
let activeStroke: Stroke | null = null;
let paintFadeTimer: ReturnType<typeof setTimeout> | undefined;

function pointInPage(event: PointerEvent): PagePoint {
  const pageRect = pageElement.getBoundingClientRect();
  return { x: event.clientX - pageRect.left, y: event.clientY - pageRect.top };
}

function wipePaint(): void {
  paintContext.save();
  paintContext.setTransform(1, 0, 0, 1, 0, 0);
  paintContext.clearRect(0, 0, paintLayer.width, paintLayer.height);
  paintContext.restore();
}

function drawStroke(stroke: Stroke): void {
  wipePaint();
  paintContext.strokeStyle = activeTool().paintColour;
  paintContext.lineWidth = brushWidthInPixels;
  paintContext.lineCap = "round";
  paintContext.lineJoin = "round";
  paintContext.beginPath();
  paintContext.moveTo(stroke.points[0].x, stroke.points[0].y);
  for (const point of stroke.points.slice(1)) paintContext.lineTo(point.x, point.y);
  if (stroke.points.length === 1) paintContext.lineTo(stroke.points[0].x + 0.1, stroke.points[0].y);
  paintContext.stroke();
}

function fadeOutPaint(): void {
  paintLayer.style.opacity = "0";
  clearTimeout(paintFadeTimer);
  paintFadeTimer = setTimeout(wipePaint, 420);
}

/** The painted blocks: every block the brush's centre line passed over, and everything between. */
function blockRangeTouchedBy(points: PagePoint[]): { firstIndex: number; lastIndex: number } | null {
  const pageRect = pageElement.getBoundingClientRect();
  let firstIndex = Number.POSITIVE_INFINITY;
  let lastIndex = Number.NEGATIVE_INFINITY;
  blockElements().forEach((element, blockIndex) => {
    if (blocks[blockIndex].kind === "blank") return;
    const rect = element.getBoundingClientRect();
    const top = rect.top - pageRect.top;
    const bottom = rect.bottom - pageRect.top;
    if (points.some((point) => point.y >= top && point.y <= bottom)) {
      firstIndex = Math.min(firstIndex, blockIndex);
      lastIndex = Math.max(lastIndex, blockIndex);
    }
  });
  return Number.isFinite(firstIndex) ? { firstIndex, lastIndex } : null;
}

pageElement.addEventListener("pointerdown", (event) => {
  if (activeToolName === "pencil" || isBusy || !skillParts || event.button !== 0) return;
  event.preventDefault();
  pageElement.setPointerCapture(event.pointerId);
  clearTimeout(paintFadeTimer);
  paintLayer.style.opacity = "1";
  const point = pointInPage(event);
  activeStroke = { pointerId: event.pointerId, points: [point], stampMark: placeStampMark(point, activeTool().spriteName) };
  sounds.stampThunk();
  drawStroke(activeStroke);
});

pageElement.addEventListener("pointermove", (event) => {
  if (!activeStroke || event.pointerId !== activeStroke.pointerId) return;
  activeStroke.points.push(pointInPage(event));
  drawStroke(activeStroke);
});

pageElement.addEventListener("pointerup", (event) => {
  if (!activeStroke || event.pointerId !== activeStroke.pointerId) return;
  const finishedStroke = activeStroke;
  activeStroke = null;
  const paintedRange = blockRangeTouchedBy(finishedStroke.points);
  if (!paintedRange) {
    fadeOutPaint();
    liftStampMark(finishedStroke.stampMark);
    return;
  }
  void applyStamp(activeTool(), paintedRange.firstIndex, paintedRange.lastIndex, finishedStroke.stampMark);
});

pageElement.addEventListener("pointercancel", () => {
  if (!activeStroke) return;
  liftStampMark(activeStroke.stampMark);
  activeStroke = null;
  fadeOutPaint();
});

async function applyStamp(tool: Tool, firstIndex: number, lastIndex: number, stampMark: HTMLElement): Promise<void> {
  const paintedElements = blockElements().slice(firstIndex, lastIndex + 1).filter((_, offset) => blocks[firstIndex + offset].kind !== "blank");
  const paintedArea = areaOf(paintedElements);
  const snapshotBeforeStamp = currentSkillText();

  if (tool.toolName === "eraser") {
    sounds.erase();
    spawnParticles(paintedArea, "particle-crumb", 14);
    await addClassAndWait(paintedElements, "is-erasing", 460);
    undoSnapshots.push(snapshotBeforeStamp);
    commitBlocks(eraseBlockRange(blocks, firstIndex, lastIndex), "glide");
  }

  if (tool.toolName === "smile" || tool.toolName === "frown") {
    const direction = tool.toolName === "smile" ? "more" : "less";
    const editedBlocks = changeImportance(blocks, firstIndex, lastIndex, direction);
    if (joinBodyBlocks(editedBlocks) === joinBodyBlocks(blocks)) {
      sounds.nothingToDo();
      showToast(direction === "more" ? "Already as big and as high as it goes here" : "Already as small and as low as it goes here");
    } else {
      const previousKeys = animationKeysFor(blocks);
      const paintedKeys = new Set(previousKeys.slice(firstIndex, lastIndex + 1));
      undoSnapshots.push(snapshotBeforeStamp);
      if (direction === "more") sounds.happier();
      else sounds.sadder();
      commitBlocks(editedBlocks, direction === "more" ? "happier" : "sadder", paintedKeys);
    }
  }

  if (tool.toolName === "human" || tool.toolName === "einstein") {
    isBusy = true;
    pageElement.classList.add("is-busy");
    paintedElements.forEach((element) => element.classList.add("is-brewing"));
    const removeThoughtBubble = showThoughtBubble(tool, paintedArea);
    try {
      const paintedMarkdown = joinBodyBlocks(blocks.slice(firstIndex, lastIndex + 1)).trim();
      const { replacementMarkdown } = await postJson<{ replacementMarkdown: string }>("/api/stamp", {
        stampName: tool.toolName,
        wholeSkillText: snapshotBeforeStamp,
        paintedMarkdown,
      });
      removeThoughtBubble();
      sounds.poof();
      spawnParticles(paintedArea, "particle-puff", 12);
      await addClassAndWait(paintedElements, "is-poofing", 380);
      undoSnapshots.push(snapshotBeforeStamp);
      commitBlocks(replaceBlockRange(blocks, firstIndex, lastIndex, replacementMarkdown), "write-in");
      sounds.sparkle();
    } catch (error) {
      removeThoughtBubble();
      paintedElements.forEach((element) => element.classList.remove("is-brewing"));
      sounds.oops();
      showToast(`${tool.label} couldn't rewrite that: ${(error as Error).message}`, "error");
    } finally {
      isBusy = false;
      pageElement.classList.remove("is-busy");
    }
  }

  liftStampMark(stampMark);
  fadeOutPaint();
}

// ---------- pencil ----------

pageBlocksElement.addEventListener("click", (event) => {
  const clickedElement = event.target as HTMLElement;
  if (clickedElement.closest("a")) event.preventDefault();
  if (activeToolName !== "pencil" || isBusy) return;
  const blockElement = clickedElement.closest<HTMLElement>(".block");
  if (!blockElement || blockElement.querySelector("textarea")) return;
  const blockIndex = Number(blockElement.dataset.blockIndex);
  if (blocks[blockIndex].kind === "blank") return;
  startPencilEdit(blockElement, blockIndex);
});

function startPencilEdit(blockElement: HTMLElement, blockIndex: number): void {
  const originalMarkdown = blocks[blockIndex].markdown.replace(/\n+$/, "");
  const pencilEditor = document.createElement("textarea");
  pencilEditor.className = "pencil-editor";
  pencilEditor.spellcheck = false;
  pencilEditor.value = originalMarkdown;
  blockElement.style.minHeight = "";
  blockElement.replaceChildren(pencilEditor);
  const fitToLines = () => {
    pencilEditor.style.height = "auto";
    pencilEditor.style.height = `${Math.ceil(pencilEditor.scrollHeight / ruleGapInPixels) * ruleGapInPixels}px`;
  };
  fitToLines();
  pencilEditor.addEventListener("input", fitToLines);
  pencilEditor.focus();
  let isCancelled = false;
  pencilEditor.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      isCancelled = true;
      pencilEditor.blur();
    }
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) pencilEditor.blur();
  });
  pencilEditor.addEventListener(
    "blur",
    () => {
      if (isCancelled || pencilEditor.value === originalMarkdown) {
        renderBlocks();
        return;
      }
      undoSnapshots.push(currentSkillText());
      commitBlocks(rewriteBlockExactly(blocks, blockIndex, pencilEditor.value), "glide");
    },
    { once: true },
  );
}

// ---------- undo dog, save, open ----------

function undo(): void {
  if (isBusy || !skillParts) return;
  const previousText = undoSnapshots.pop();
  if (previousText === undefined) {
    sounds.nothingToDo();
    showToast("Nothing to undo");
    return;
  }
  sounds.woof();
  const previousParts = splitSkillFile(previousText);
  const frontMatterChanged = previousParts.frontMatterYaml !== skillParts.frontMatterYaml;
  skillParts = previousParts;
  if (frontMatterChanged) renderCover();
  commitBlocks(splitBodyIntoBlocks(previousParts.body), "glide");
}

async function save(): Promise<void> {
  if (!openedNotebook || isBusy) return;
  try {
    const savedNotebook = await postJson<{ notebookPath: string; byteCount: number }>("/api/save", {
      notebookPath: openedNotebook.notebookPath,
      skillFileText: currentSkillText(),
    });
    markSaved();
    sounds.saved();
    showToast(`Saved a valid SKILL.md (${savedNotebook.byteCount} bytes)\n${savedNotebook.notebookPath}`, "ok");
  } catch (error) {
    sounds.oops();
    showToast((error as Error).message, "error");
  }
}

function rememberLastOpened(sourcePath: string): void {
  try {
    localStorage.setItem("skill-editor-last-source-path", sourcePath);
  } catch {
    // Reopening the last notebook is only a convenience.
  }
}

function lastOpenedSourcePath(): string | null {
  try {
    return localStorage.getItem("skill-editor-last-source-path");
  } catch {
    return null;
  }
}

async function openSkill(sourcePath: string): Promise<void> {
  if (isDirty && !confirm("This notebook has unsaved changes. Open another one anyway?")) return;
  const openedSkill = await postJson<{ notebookPath: string; sourcePath: string; skillFileText: string }>("/api/open", { sourcePath });
  openedNotebook = { notebookPath: openedSkill.notebookPath, sourcePath };
  skillParts = splitSkillFile(openedSkill.skillFileText);
  blocks = splitBodyIntoBlocks(skillParts.body);
  undoSnapshots.length = 0;
  markSaved();
  renderCover();
  renderBlocks();
  shelfElement.hidden = true;
  rememberLastOpened(sourcePath);
  window.scrollTo({ top: 0 });
}

function renderShelfList(): void {
  const searchText = shelfSearch.value.trim().toLowerCase();
  const matchingSkills = realSkills.filter((skill) => `${skill.skillName} ${skill.description} ${skill.sourceGroup}`.toLowerCase().includes(searchText));
  const skillsByGroup = new Map<string, RealSkill[]>();
  for (const skill of matchingSkills) {
    const groupName = skill.hasNotebook ? "your notebooks" : skill.sourceGroup;
    skillsByGroup.set(groupName, [...(skillsByGroup.get(groupName) ?? []), skill]);
  }
  const groupNames = [...skillsByGroup.keys()].sort((first, second) => (first === "your notebooks" ? -1 : second === "your notebooks" ? 1 : first.localeCompare(second)));
  shelfList.replaceChildren(
    ...groupNames.flatMap((groupName) => {
      const groupTitle = document.createElement("div");
      groupTitle.className = "shelf-group-title";
      groupTitle.textContent = groupName;
      const items = skillsByGroup.get(groupName)!.map((skill) => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "shelf-item";
        item.innerHTML = `<div class="shelf-item-name"></div><div class="shelf-item-description"></div>`;
        item.querySelector(".shelf-item-name")!.textContent = skill.skillName;
        if (skill.hasNotebook) item.querySelector(".shelf-item-name")!.insertAdjacentHTML("beforeend", `<span class="notebook-badge">${escapeHtml(skill.sourceGroup)}</span>`);
        item.querySelector(".shelf-item-description")!.textContent = skill.description;
        item.addEventListener("click", () => openSkill(skill.sourcePath).catch((error) => showToast((error as Error).message, "error")));
        return item;
      });
      return [groupTitle, ...items];
    }),
  );
}

async function openShelf(): Promise<void> {
  shelfElement.hidden = false;
  shelfList.textContent = "Finding skills on this machine…";
  realSkills = await getJson<RealSkill[]>("/api/skills");
  renderShelfList();
  shelfSearch.focus();
}

shelfSearch.addEventListener("input", renderShelfList);
shelfElement.addEventListener("click", (event) => {
  if (event.target === shelfElement && skillParts) shelfElement.hidden = true;
});

// ---------- the stamp tray ----------

function trayButton(spriteName: SpriteName, label: string, title: string, onPress: () => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "tool-button";
  button.title = title;
  button.innerHTML = `${spriteSvg(spriteName, 42)}<span>${label}</span>`;
  button.addEventListener("click", onPress);
  return button;
}

function selectTool(toolName: ToolName): void {
  activeToolName = toolName;
  const tool = activeTool();
  stampTray.querySelectorAll<HTMLElement>("[data-tool-name]").forEach((button) => button.classList.toggle("is-active", button.dataset.toolName === toolName));
  toolHint.textContent = tool.hint;
  pageElement.style.cursor = toolName === "pencil" ? "text" : spriteCursor(tool.spriteName);
  pageElement.classList.toggle("is-stamping", toolName !== "pencil");
}

function renderTray(): void {
  const toolButtons = tools.map((tool) => {
    const button = trayButton(tool.spriteName, tool.label, tool.hint, () => selectTool(tool.toolName));
    button.dataset.toolName = tool.toolName;
    return button;
  });
  const divider = document.createElement("div");
  divider.className = "tray-divider";
  const undoButton = trayButton("undoDog", "undo", "Undo: the dog fetches it back (Cmd+Z)", undo);
  const saveButton = trayButton("floppy", "save", "Save the notebook as a valid SKILL.md (Cmd+S)", () => void save());
  saveButton.id = "save-button";
  const openButton = trayButton("book", "open", "Open another skill", () => void openShelf());
  const soundButton = document.createElement("button");
  soundButton.type = "button";
  soundButton.className = "tool-button";
  const renderSoundButton = () => (soundButton.innerHTML = `<span style="font-size:26px">${isSoundOn() ? "♪" : "·"}</span><span>${isSoundOn() ? "sound" : "quiet"}</span>`);
  renderSoundButton();
  soundButton.addEventListener("click", () => {
    setSoundOn(!isSoundOn());
    renderSoundButton();
  });
  stampTray.replaceChildren(...toolButtons, divider, undoButton, saveButton, openButton, soundButton);
}

document.addEventListener("keydown", (event) => {
  const isTyping = (event.target as HTMLElement).closest("input, textarea") !== null;
  const hasCommandKey = event.metaKey || event.ctrlKey;
  if (hasCommandKey && event.key === "s") {
    event.preventDefault();
    void save();
    return;
  }
  if (isTyping) return;
  if (hasCommandKey && event.key === "z") {
    event.preventDefault();
    undo();
    return;
  }
  if (event.key === "Escape" && skillParts) shelfElement.hidden = true;
  const toolForNumberKey = tools[Number(event.key) - 1];
  if (toolForNumberKey && !hasCommandKey) selectTool(toolForNumberKey.toolName);
});

window.addEventListener("beforeunload", (event) => {
  if (isDirty) event.preventDefault();
});

window.addEventListener("resize", () => {
  if (skillParts) renderBlocks();
});

document.head.insertAdjacentHTML("beforeend", `<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(spriteSvg("book", 32))}">`);
renderTray();
selectTool("pencil");
const sourcePathToReopen = lastOpenedSourcePath();
if (sourcePathToReopen) {
  openSkill(sourcePathToReopen).catch((error) => {
    showToast(`Couldn't reopen the last notebook: ${(error as Error).message}`, "error");
    void openShelf();
  });
} else {
  void openShelf();
}
document.fonts.ready.then(() => {
  if (skillParts) renderBlocks();
});

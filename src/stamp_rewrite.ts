// The Human and Einstein stamps rewrite painted text with Claude, through the `claude` CLI
// that's already logged in on this machine (there is no API key here).

import path from "node:path";

const projectDirectory = path.dirname(import.meta.dir);

export type RewritingStampName = "human" | "einstein";

const replyRules = "Reply with only the replacement markdown: no preamble, no explanation, no code fence around it.";

const stampBriefs: Record<RewritingStampName, string> = {
  human: `You're helping someone edit a Claude skill: a SKILL.md that teaches an AI agent how to do a kind of work. They painted over one passage with the HUMAN stamp, which means: this reads too technical, too granular, or too robotic.

Rewrite the passage the way a thoughtful person briefs a capable colleague they trust. Say what it's for and where the limits are, in plain words. Leave out steps the reader can work out on their own; keep a command, path or flag only when the work fails without that exact text. Prefer a short paragraph or a few bullets over numbered steps. Keep every fact that changes what the agent does. Make it shorter than the original, never longer.

${replyRules}`,
  einstein: `You're helping someone edit a Claude skill: a SKILL.md that teaches an AI agent how to do a kind of work. They painted over one passage with the EINSTEIN stamp, which means: find the idea behind this.

Rewrite the passage as the principle that produces these instructions: what it protects or makes possible, the constraint that matters, and why. Give every rule its reason. Collapse step-by-step lists into the judgement they encode, so the agent can handle a case the steps never named; keep an ordered sequence only when the order itself is the point. Keep every fact that changes what the agent does. Be brief: a principle is short.

${replyRules}`,
};

function withoutWrappingCodeFence(reply: string): string {
  const wrappedInFence = /^```[\w-]*\n([\s\S]*?)\n```$/.exec(reply);
  return wrappedInFence ? wrappedInFence[1] : reply;
}

export async function rewritePaintedPassage(stampName: RewritingStampName, wholeSkillText: string, paintedMarkdown: string): Promise<string> {
  const stampBrief = stampBriefs[stampName];
  if (!stampBrief) throw new Error(`No rewrite brief for stamp "${stampName}"`);
  const prompt = `The whole skill, for context:\n<skill>\n${wholeSkillText}\n</skill>\n\nThe painted passage to rewrite:\n<painted>\n${paintedMarkdown}\n</painted>`;
  const claudeProcess = Bun.spawn(
    [
      "claude", "-p",
      "--model", "opus",
      "--effort", "low",
      "--setting-sources", "project",
      "--strict-mcp-config",
      "--tools", "",
      "--no-session-persistence",
      "--system-prompt", stampBrief,
    ],
    { cwd: projectDirectory, stdin: new Blob([prompt]), stdout: "pipe", stderr: "pipe" },
  );
  const [reply, errorOutput, exitCode] = await Promise.all([
    new Response(claudeProcess.stdout).text(),
    new Response(claudeProcess.stderr).text(),
    claudeProcess.exited,
  ]);
  if (exitCode !== 0) throw new Error(`claude -p exited with ${exitCode}: ${(errorOutput || reply).trim()}`);
  const replacementMarkdown = withoutWrappingCodeFence(reply.trim());
  if (replacementMarkdown === "") throw new Error("claude -p replied with nothing");
  return replacementMarkdown;
}

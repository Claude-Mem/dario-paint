// Local server for Dario Paint, the composition-book skill editor. Bun bundles index.html and its script.

import homepage from "./index.html";
import { listRealSkills, openNotebook, saveNotebook } from "./skill_library";
import { rewritePaintedPassage } from "./stamp_rewrite";

const server = Bun.serve({
  hostname: "127.0.0.1",
  port: Number(process.env.PORT ?? 4848),
  development: true,
  routes: {
    "/": homepage,
    "/api/skills": {
      GET: async () => Response.json(await listRealSkills()),
    },
    "/api/open": {
      POST: async (request) => {
        const { sourcePath } = await request.json();
        return Response.json(await openNotebook(sourcePath));
      },
    },
    "/api/save": {
      POST: async (request) => {
        const { notebookPath, skillFileText } = await request.json();
        return Response.json(await saveNotebook(notebookPath, skillFileText));
      },
    },
    "/api/stamp": {
      POST: async (request) => {
        const { stampName, wholeSkillText, paintedMarkdown } = await request.json();
        const startedAt = performance.now();
        const replacementMarkdown = await rewritePaintedPassage(stampName, wholeSkillText, paintedMarkdown);
        const elapsedSeconds = ((performance.now() - startedAt) / 1000).toFixed(1);
        console.log(`${stampName} stamp: ${paintedMarkdown.length} chars -> ${replacementMarkdown.length} chars in ${elapsedSeconds}s`);
        return Response.json({ replacementMarkdown });
      },
    },
  },
  error(error) {
    console.error(error);
    return Response.json({ error: error.message }, { status: 500 });
  },
});

console.log(`Dario Paint: ${server.url}`);

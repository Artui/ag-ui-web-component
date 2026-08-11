// Self-contained demo server. No build step beyond `pnpm build` (which emits
// the vendored bundle the page loads). Run: `node demo/mock-server.mjs`, then
// open http://localhost:5173 — the playground (themes/index.html) lets you flip
// theme / density / placement / text-animation / tool-display live.
//
// Speaks just enough of the AG-UI wire protocol for @ag-ui/client's HttpAgent:
// a POST of RunAgentInput is answered with an SSE stream of AG-UI events. The
// scripted agent fills an article form via frontend tools, pausing on the
// destructive "save" for the inline confirmation card.
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const PORT = Number(process.env.PORT ?? 5173);

const HTML = "text/html; charset=utf-8";
// The playground: a single page that flips every option live (see
// themes/index.html). Replaces the old per-theme pages.
const THEME_ASSETS = new Map([
  ["/themes/", { path: "themes/index.html", contentType: HTML }],
  ["/themes/index.html", { path: "themes/index.html", contentType: HTML }],
  ["/themes/demo.js", { path: "themes/demo.js", contentType: "text/javascript" }],
]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Fresh ids per message and per tool call, as a real server issues.
//
// This mattered more than it looks. The scripted answers used to stream under
// fixed ids ("m-done", "tc1"...), and @ag-ui/client keys assistant messages by
// messageId: a TEXT_MESSAGE_START for an id already in the history appends to
// that message rather than starting a new one. So repeating the same prompt
// concatenated every answer onto one entry, which then replayed out of order on
// reload (a single grown message sitting where it was first created, with the
// later prompts after it) and tripped the unfinished-run notice. Three symptoms
// that all read as component bugs, from one line of harness.
const id = (prefix) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`;

function emit(res, event) {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

async function streamText(res, messageId, chunks) {
  emit(res, { type: "TEXT_MESSAGE_START", messageId, role: "assistant" });
  for (const delta of chunks) {
    emit(res, { type: "TEXT_MESSAGE_CONTENT", messageId, delta });
    await sleep(110);
  }
  emit(res, { type: "TEXT_MESSAGE_END", messageId });
}

function emitToolCall(res, id, name, args, parentMessageId) {
  emit(res, { type: "TOOL_CALL_START", toolCallId: id, toolCallName: name, parentMessageId });
  emit(res, { type: "TOOL_CALL_ARGS", toolCallId: id, delta: JSON.stringify(args) });
  emit(res, { type: "TOOL_CALL_END", toolCallId: id });
}

// A reasoning model's streamed chain-of-thought: the web component
// renders it as a collapsible "thinking" region that folds on the first answer.
async function streamReasoning(res, messageId, chunks) {
  emit(res, { type: "REASONING_START", messageId });
  emit(res, { type: "REASONING_MESSAGE_START", messageId, role: "reasoning" });
  let buffer = "";
  for (const delta of chunks) {
    buffer += delta;
    emit(res, { type: "REASONING_MESSAGE_CONTENT", messageId, delta });
    await sleep(90);
  }
  emit(res, { type: "REASONING_MESSAGE_END", messageId });
  emit(res, { type: "REASONING_END", messageId });
}

/** The most recent user turn, which is what the scripted agent dispatches on. */
function lastUserText(messages) {
  const last = [...messages].reverse().find((m) => m.role === "user");
  return typeof last?.content === "string" ? last.content.trim() : "";
}

/**
 * The scripted agent.
 *
 * Dispatches on the latest user turn so the playground can exercise each
 * surface on its own, rather than replaying one canned script for everything.
 */
async function handleAgent(res, body) {
  const input = JSON.parse(body);
  const { threadId, runId, messages } = input;

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  emit(res, { type: "RUN_STARTED", threadId, runId });

  const prompt = lastUserText(messages);
  // The *last* message, not any message: a thread that has ever run a tool
  // keeps those results in history forever, so `some()` made every later turn
  // look like a tool follow-up and answer "Done" to everything.
  const isFollowUp = messages.at(-1)?.role === "tool";

  if (isFollowUp) {
    await streamText(res, id("msg"), ["Done — ", "the article ", "is filled in ", "and saved. ✅"]);
  } else if (prompt.startsWith("/")) {
    // A server-resolved skill: the client sent only the token, so this is the
    // first point at which the prompt behind it exists at all. Answering here
    // is what demonstrates that the wording never left the server.
    await streamText(res, id("msg"), [
      `Resolved **${prompt}** server-side. `,
      "The browser only ever sent the token — ",
      "the prompt behind it lives here.",
    ]);
  } else if (/\bask\b/i.test(prompt)) {
    // Drives the built-in ask_user frontend tool, so the question card is
    // reachable without a real agent.
    const parent = id("msg");
    await streamText(res, parent, ["Before I continue —"]);
    emitToolCall(
      res,
      id("call"),
      "ask_user",
      {
        question: "Which status should the article go out with?",
        options: ["draft", "published"],
        allowCustom: true,
      },
      parent,
    );
  } else if (/\bfail|error|break\b/i.test(prompt)) {
    // A tool that throws, so the card's error region is reachable.
    const parent = id("msg");
    await streamText(res, parent, ["Trying the flaky one…"]);
    emitToolCall(res, id("call"), "break_something", {}, parent);
  } else {
    await streamReasoning(res, id("reasoning"), [
      "The user wants the article filled. ",
      "I'll set the title and slug, ",
      "publish it, mark it featured, ",
      "then save.",
    ]);
    const parent = id("msg");
    await streamText(res, parent, ["On it — ", "filling in ", "the article form ", "now."]);
    emitToolCall(res, id("call"), "fill_field", { field: "title", value: "Hello, AG-UI" }, parent);
    emitToolCall(res, id("call"), "fill_field", { field: "slug", value: "hello-ag-ui" }, parent);
    emitToolCall(res, id("call"), "select_option", { field: "status", value: "published" }, parent);
    emitToolCall(res, id("call"), "toggle_checkbox", { field: "featured", value: true }, parent);
    emitToolCall(res, id("call"), "click_save", {}, parent);
  }

  emit(res, { type: "RUN_FINISHED", threadId, runId });
  res.end();
}

async function serveFile(res, path, contentType) {
  try {
    const data = await readFile(path);
    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("not found");
  }
}

const server = createServer((req, res) => {
  if (req.method === "POST" && req.url === "/agent/") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      handleAgent(res, body).catch((error) => {
        res.writeHead(500);
        res.end(String(error));
      });
    });
    return;
  }
  if (req.method === "POST" && req.url === "/transcribe/") {
    // Voice input: a real backend would run STT on the posted clip;
    // the demo just drains the body and returns a canned transcript.
    req.on("data", () => {});
    req.on("end", () => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ text: "Draft an article about sea otters." }));
    });
    return;
  }
  if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
    serveFile(res, join(HERE, "themes", "index.html"), "text/html; charset=utf-8");
    return;
  }
  if (req.method === "GET" && req.url === "/bundle.js") {
    serveFile(res, join(ROOT, "dist", "ag-ui-web-component.bundle.js"), "text/javascript");
    return;
  }
  const theme = req.method === "GET" && THEME_ASSETS.get(req.url);
  if (theme) {
    serveFile(res, join(HERE, theme.path), theme.contentType);
    return;
  }
  res.writeHead(404);
  res.end("not found");
});

server.listen(PORT, () => {
  process.stdout.write(`ag-ui-web-component demo: http://localhost:${PORT}\n`);
});

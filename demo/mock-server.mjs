// Self-contained demo server. No build step beyond `pnpm build` (which emits
// the vendored bundle this page loads). Run: `node demo/mock-server.mjs`,
// then open http://localhost:5173.
//
// Speaks just enough of the AG-UI wire protocol for @ag-ui/client's HttpAgent:
// a POST of RunAgentInput is answered with an SSE stream of AG-UI events. The
// scripted agent fills an article form via frontend tools, pausing on the
// destructive "save" for the confirmation modal.
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const PORT = 5173;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

async function handleAgent(res, body) {
  const input = JSON.parse(body);
  const { threadId, runId, messages } = input;

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  emit(res, { type: "RUN_STARTED", threadId, runId });

  const isFollowUp = messages.some((m) => m.role === "tool");
  if (isFollowUp) {
    await streamText(res, "m-done", [
      "Done — ",
      "the article ",
      "is filled in ",
      "and saved. ✅",
    ]);
  } else {
    const parent = "m-intro";
    await streamText(res, parent, [
      "On it — ",
      "filling in ",
      "the article form ",
      "now.",
    ]);
    emitToolCall(res, "tc1", "fill_field", { field: "title", value: "Hello, AG-UI" }, parent);
    emitToolCall(res, "tc2", "fill_field", { field: "slug", value: "hello-ag-ui" }, parent);
    emitToolCall(res, "tc3", "select_option", { field: "status", value: "published" }, parent);
    emitToolCall(res, "tc4", "toggle_checkbox", { field: "featured", value: true }, parent);
    emitToolCall(res, "tc5", "click_save", {}, parent);
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
  if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
    serveFile(res, join(HERE, "index.html"), "text/html; charset=utf-8");
    return;
  }
  if (req.method === "GET" && req.url === "/bundle.js") {
    serveFile(res, join(ROOT, "dist", "ag-ui-web-component.bundle.js"), "text/javascript");
    return;
  }
  res.writeHead(404);
  res.end("not found");
});

server.listen(PORT, () => {
  process.stdout.write(`ag-ui-web-component demo: http://localhost:${PORT}\n`);
});

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

// A server-side tool's own result, which is how an approved gated call settles:
// nothing runs in the browser, so the card is waiting on this event.
function emitToolResult(res, toolCallId, content) {
  emit(res, { type: "TOOL_CALL_RESULT", toolCallId, messageId: id("m"), content });
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
  // Answers to a previous round's approval interrupts. Only the approved calls
  // ever produce a result; a denial is answered by the model instead.
  const resume = Array.isArray(input.resume) ? input.resume : [];
  // The *last* message, not any message: a thread that has ever run a tool
  // keeps those results in history forever, so `some()` made every later turn
  // look like a tool follow-up and answer "Done" to everything.
  const isFollowUp = messages.at(-1)?.role === "tool";

  if (resume.length > 0) {
    const approved = resume.filter((answer) => answer.status === "resolved");
    for (const answer of approved) {
      emitToolResult(res, answer.interruptId.replace("int-", ""), '{"created": true}');
    }
    await streamText(res, id("msg"), [
      `Added ${approved.length} of ${resume.length}`,
      approved.length === resume.length ? " — all of them." : ", and left the rest alone.",
    ]);
  } else if (/\bimport\b/i.test(prompt)) {
    // Three gated calls in one run: the case a single approval never shows. Each
    // interrupt is answered independently, and every prompt is the same sentence
    // because a confirmation is written per *tool*, so the card has to say which
    // call it belongs to some other way.
    const parent = id("msg");
    await streamText(res, parent, ["Three rows — ", "each needs your approval."]);
    const rows = [
      { title: "Design sync", day: "2026-08-14", start_hour: 14 },
      { title: "Retro", day: "2026-08-15", start_hour: 10 },
      { title: "One-on-one", day: "2026-08-15", start_hour: 16 },
    ];
    const interrupts = rows.map((row) => {
      const callId = id("call");
      emitToolCall(res, callId, "create_event", row, parent);
      return {
        id: `int-${callId}`,
        reason: "tool_call",
        toolCallId: callId,
        message: `Approve create_event(${JSON.stringify(row)})?`,
        metadata: { "x-confirm": "Add this event to the board?" },
      };
    });
    emit(res, {
      type: "RUN_FINISHED",
      threadId,
      runId,
      outcome: { type: "interrupt", interrupts },
    });
    res.end();
    return;
  } else if (isFollowUp) {
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

// Fixed ids so a row's short id is stable across reloads while you look at it;
// timestamps are relative to boot so the labels stay honest.
const BOOTED = Date.now();
const RUNS = [
  {
    run_id: "931fef34-e1ba-4eed-a239-0444a5bcb996",
    preview: "Fill in the article form and publish it",
    thread_id: "t-demo",
    parent_run_id: null,
    started_at: new Date(BOOTED - 22 * 60_000).toISOString(),
    continuable: true,
  },
  {
    run_id: "5087f329-a842-473f-b16b-881f7c91668d",
    preview: "Import these three events onto the board",
    thread_id: "t-demo",
    parent_run_id: "931fef34-e1ba-4eed-a239-0444a5bcb996",
    started_at: new Date(BOOTED - 4_000).toISOString(),
    continuable: true,
  },
  // Two runs that opened on the same sentence, which is what a real index
  // produces once a board has been asked about twice. The words no longer tell
  // these two apart, so they carry the short id and the rows above still do not.
  {
    run_id: "a7c31d90-58b4-42ee-9f0c-6d2a1b3e77c5",
    preview: "What is on the board?",
    thread_id: "t-demo",
    parent_run_id: null,
    started_at: new Date(BOOTED - 13 * 60 * 60_000).toISOString(),
    continuable: true,
  },
  {
    run_id: "e02f4a17-9c65-4b38-8ad1-70f9c5e2b4aa",
    preview: "What is on the board?",
    thread_id: "t-demo",
    parent_run_id: null,
    started_at: new Date(BOOTED - 14 * 60 * 60_000).toISOString(),
    continuable: true,
  },
  // No preview at all: an index older than the field, or a run opened with an
  // image and no caption. Falls back to the time plus the id, as every row was.
  {
    run_id: "b46d8e52-0f19-4c77-83b2-1d5ae9f30c68",
    preview: null,
    thread_id: "t-demo",
    parent_run_id: null,
    started_at: new Date(BOOTED - 3 * 60 * 60_000).toISOString(),
    continuable: true,
  },
  {
    run_id: "c14b8a02-7d1e-4f77-9a30-2b6e5f0c8d41",
    preview: "Move standup to Friday at 11:00",
    thread_id: "t-demo",
    parent_run_id: "931fef34-e1ba-4eed-a239-0444a5bcb996",
    started_at: new Date(BOOTED - 2_000).toISOString(),
    // No snapshot to seed from, so the panel must not offer it: the client
    // filters on this field, and a row without it would resume from nothing.
    continuable: false,
  },
];

async function streamContinuation(res, verb, runId) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  const threadId = "t-demo";
  const runIdOut = id("run");
  emit(res, { type: "RUN_STARTED", threadId, runId: runIdOut });
  await streamText(res, id("m"), [
    verb === "fork" ? "Forked " : "Continued ",
    `from run ${runId.slice(0, 8)}`,
    ", seeded from its snapshot.",
  ]);
  emit(res, { type: "RUN_FINISHED", threadId, runId: runIdOut });
  res.end();
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
  if (req.method === "POST" && req.url === "/attachments/") {
    // Uploads: a real backend would store the file and hand back a durable
    // ref; the demo buffers the body and echoes one, so the composer's
    // paperclip and the pending-attachment tray are both reachable.
    //
    // The ref has to carry name and mime as well as id and size: the client
    // rejects a body missing any of the four, and while this handler answered
    // with only id/size every demo upload settled into an error chip. Both live
    // in the multipart part headers, so read them from there rather than
    // inventing them.
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const body = Buffer.concat(chunks);
      const headers = body.subarray(0, 1024).toString("latin1");
      const name = /filename="([^"]*)"/.exec(headers)?.[1] || "upload.bin";
      const mime = /Content-Type:\s*([^\r\n]+)/i.exec(headers)?.[1]?.trim() || "";
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          id: id("file"),
          url: `/uploads/${id("f")}`,
          name,
          mime,
          size: body.length,
        }),
      );
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
  if (req.method === "GET" && req.url === "/runs/") {
    // The run index behind the header's checkpoint control. Without this route
    // the button is not built at all — the element only offers it when a host
    // sets `data-runs-url` — so the panel had no way to be looked at.
    //
    // Every row shape on purpose: a root run, a branch off it seconds later, a
    // pair that opened on the same sentence, a run the server sent no preview
    // for, and one it reports as having no snapshot. Between them they cover
    // each identity the row can lead with, and each case where it needs a
    // second one.
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ runs: RUNS }));
    return;
  }
  const continuation = /^\/(resume|fork)\/([^/]+)\/$/.exec(req.url ?? "");
  if (req.method === "POST" && continuation) {
    // A real server seeds the new run from the picked run's snapshot and streams
    // the continuation. The demo answers in one sentence naming what it did, so
    // that picking a row visibly lands in the transcript.
    const [, verb, runId] = continuation;
    req.on("data", () => {});
    req.on("end", () => {
      streamContinuation(res, verb, runId).catch((error) => {
        res.writeHead(500);
        res.end(String(error));
      });
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

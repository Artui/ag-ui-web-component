/**
 * The README, checked against the API it describes.
 *
 * The README is this package's only reference — there is no generated API doc
 * to fall back on — so a wrong cell is worse than a missing one: a consumer who
 * reads that `title-text` is "the only observed attribute" concludes the
 * connect-time warning machinery does not exist, and a consumer who writes a
 * tus adapter from `(file, onProgress) => Promise<AttachmentRef>` leaks a
 * server-side file on every removed chip. Both of those shipped.
 *
 * The first check here (names every re-exported symbol) is the original gate,
 * and both of those defects passed it: `parseToolCatalog` and `QuestionRenderer`
 * were each *mentioned*, just described wrongly. Naming a symbol is the weakest
 * possible claim about it, so the rest of this file checks the claims the README
 * actually makes — the ones that can be derived from the source cheaply.
 *
 * ## What is checked
 *
 * - Every symbol `src/index.ts` re-exports is named in the API surface section.
 * - Every `chat.x` / `AgUiChat.x` the README writes anywhere is a real public
 *   member of the element (or one of the three inherited DOM members it uses).
 * - The Methods and Properties lists are *complete* — every public method and
 *   property of `AgUiChat` appears in its list.
 * - Every attribute the element reads is a row in the attribute table.
 * - The documented live / connect-time split equals `observedAttributes` and
 *   `CONNECT_TIME_ATTRIBUTES` as the source spells them.
 * - A documented object shape (`{ url, headers? }`) names exactly the members
 *   its interface declares.
 * - A documented call or arrow shape (`quotableSelection(container, roots)`,
 *   `(file, onProgress) => …`) has the source's parameter count.
 * - No table row hides a `|` inside a code span, which silently splits the row
 *   into an extra cell wherever the README is rendered, and no run of rows is
 *   missing the header separator that makes it a table.
 * - Every in-page link points at a heading that exists.
 *
 * ## What is deliberately *not* checked
 *
 * Reimplementing a TypeScript parser here would be worse than the drift it
 * caught, so this reads structure and never semantics. It does not check:
 *
 * - **Return types, parameter types, or parameter names.** Only arity, and only
 *   where the README states a parameter list at all — `createRouteTools(...)`
 *   opts out with an ellipsis, on purpose.
 * - **Prose.** A summary cell may say anything; only backticked shapes are read.
 *   The `title-text` claim that started this was prose, and prose is exactly
 *   what the structured checks below replace rather than police.
 * - **Inherited interface members.** A shape check is skipped for an interface
 *   with an `extends` clause, since resolving one means resolving a type graph.
 * - **Defaults, units, and nullability.** `MAX_QUOTE_CHARS` being documented as
 *   500 is not verified against the constant.
 * - **Anything outside `AgUiChat` and `src/index.ts`** — CSS custom properties,
 *   events, slots and parts. Parts have their own gate next door
 *   (`readme_parts.test.ts`); the rest have none.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const INDEX = readFileSync("src/index.ts", "utf8");
const README = readFileSync("README.md", "utf8");
const ELEMENT = readFileSync("src/core/ag_ui_chat.ts", "utf8");

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return sources(path);
    }
    return entry.name.endsWith(".ts") ? [readFileSync(path, "utf8")] : [];
  });
}

const SOURCE = sources("src").join("\n");

/** Members of `HTMLElement` the README's `chat.…` examples legitimately call. */
const INHERITED_DOM_MEMBERS = new Set(["addEventListener", "setAttribute", "remove"]);

/**
 * Custom Element reactions. Public because the platform calls them, but not
 * things a host invokes, so they belong to neither README list.
 */
const LIFECYCLE_CALLBACKS = new Set([
  "connectedCallback",
  "disconnectedCallback",
  "attributeChangedCallback",
]);

/** Attributes the element reads that are its own, not a host's to set. */
const INTERNAL_ATTRIBUTES = new Set([
  // Stamped on a tool-call card by the card itself, read back to find it again.
  "data-tool-name",
]);

/**
 * How many attribute reads take their name from a variable rather than stating
 * it. Exactly one — the `#flag` helper — and its own call sites are literal, so
 * the literal scan below still sees every name. A second one would hide a name
 * from this file, which is why the count is asserted rather than assumed.
 */
const VARIABLE_ATTRIBUTE_READS = 1;

// --------------------------------------------------------------------------
// Reading the source
// --------------------------------------------------------------------------

/** The text between `open` at `from` and its matching `close`. */
function balanced(text: string, from: number, open: string, close: string): string {
  let depth = 0;
  for (let index = from; index < text.length; index += 1) {
    if (text[index] === open) {
      depth += 1;
    } else if (text[index] === close) {
      depth -= 1;
      if (depth === 0) {
        return text.slice(from + 1, index);
      }
    }
  }
  /* c8 ignore next -- every call site passes an index found by indexOf, so the
     bracket always closes; this only guards a malformed source file. */
  throw new Error(`unbalanced ${open} in source at ${from}`);
}

/**
 * A parameter list split on its top-level commas.
 *
 * `=>` is neutralised first: a nested callback type (`(fraction: number) =>
 * void`) would otherwise close a bracket that never opened, and the parameters
 * after it would merge into one.
 */
function splitTopLevel(params: string): string[] {
  const text = params.replace(/=>/g, "  ");
  const out: string[] = [];
  let depth = 0;
  let current = "";
  for (const character of text) {
    if ("([{<".includes(character)) {
      depth += 1;
    } else if (")]}>".includes(character)) {
      depth -= 1;
    }
    if (character === "," && depth === 0) {
      out.push(current.trim());
      current = "";
    } else {
      current += character;
    }
  }
  out.push(current.trim());
  return out.filter((entry) => entry !== "");
}

/** The class body of the Custom Element, from its `export class` to its `}`. */
function elementBody(): string {
  const start = ELEMENT.indexOf("export class AgUiChat");
  return ELEMENT.slice(start, ELEMENT.indexOf("\n}\n", start));
}

/** Names matched at class-member indentation (two spaces); `#private` cannot. */
function classMembers(pattern: RegExp): string[] {
  return [...elementBody().matchAll(pattern)].map((match) => match[1] ?? "");
}

/** Public fields and accessors — everything a host assigns or reads. */
function publicProperties(): string[] {
  return [
    ...new Set([
      ...classMembers(/^ {2}([A-Za-z][A-Za-z0-9_]*)\??\s*[:=]/gm),
      ...classMembers(/^ {2}(?:get|set) ([A-Za-z][A-Za-z0-9_]*)\(/gm),
    ]),
  ];
}

/** Public methods — everything a host calls. */
function publicMethods(): string[] {
  return [...new Set(classMembers(/^ {2}(?:async )?([A-Za-z][A-Za-z0-9_]*)\(/gm))].filter(
    (name) => name !== "constructor" && !LIFECYCLE_CALLBACKS.has(name),
  );
}

/** Every attribute name the element reads, from a literal. */
function attributesRead(): string[] {
  const names = new Set<string>();
  for (const match of ELEMENT.matchAll(
    /(?:getAttribute|hasAttribute|#flag)\("([a-z][a-z0-9-]*)"\)/g,
  )) {
    names.add(match[1] ?? "");
  }
  return [...names].filter((name) => !INTERNAL_ATTRIBUTES.has(name));
}

/** The two halves of `observedAttributes`, as the getter spells them. */
function observedAttributes(): { live: string[]; connectTime: string[] } {
  const getter = /static get observedAttributes\(\): string\[\] \{\s*return \[([^\]]*)\];/.exec(
    ELEMENT,
  );
  const listed = (getter?.[1] ?? "").split(",").map((entry) => entry.trim());
  const spread = listed.filter((entry) => entry.startsWith("..."));
  const live = listed
    .filter((entry) => entry.startsWith('"'))
    .map((entry) => entry.replaceAll('"', ""));
  // The getter is literals plus one spread of the connect-time array. Anything
  // else and the split below stops meaning what the README says it means.
  expect(spread).toEqual(["...CONNECT_TIME_ATTRIBUTES"]);
  expect(live.length + spread.length).toBe(listed.length);

  const array = /const CONNECT_TIME_ATTRIBUTES = \[([^\]]*)\] as const;/.exec(ELEMENT);
  const connectTime = [...(array?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((match) => match[1] ?? "");
  return { live, connectTime };
}

/** The members an exported interface declares, or `null` if it inherits any. */
function interfaceMembers(name: string): string[] | null {
  const declaration = new RegExp(`export interface ${name}(\\s+extends [^{]+)?\\s*\\{`).exec(
    SOURCE,
  );
  /* c8 ignore next 3 -- unreachable while every documented shape names a real
     interface, which the "names every symbol" check above already enforces. */
  if (declaration === null) {
    return null;
  }
  if (declaration[1] !== undefined) {
    return null;
  }
  const body = balanced(SOURCE, SOURCE.indexOf("{", declaration.index), "{", "}");
  return body
    .split("\n")
    .map((line) => /^ {2}(?:readonly )?([A-Za-z_][A-Za-z0-9_]*)\??\s*[:(<]/.exec(line))
    .filter((match) => match !== null)
    .map((match) => match[1] ?? "");
}

/**
 * The parameters of an exported callable, or `null` when the source shape is
 * one this file does not read (a class, a `const` that is not an alias).
 */
function signatureParams(name: string, seen: Set<string> = new Set()): string[] | null {
  /* c8 ignore next 3 -- a cycle needs `export const a = b; export const b = a`,
     which does not compile; the guard is here so a typo cannot hang the suite. */
  if (seen.has(name)) {
    return null;
  }
  seen.add(name);
  const callable = new RegExp(`export (?:async function|function|type) ${name}\\b[^(]*\\(`).exec(
    SOURCE,
  );
  if (callable !== null) {
    // The match ends on the opening parenthesis of the parameter list.
    const open = callable.index + callable[0].length - 1;
    return splitTopLevel(balanced(SOURCE, open, "(", ")"));
  }
  // `export const createStateHookTools = createPageStateTools;` — a deprecated
  // alias documents the signature of what it points at.
  const alias = new RegExp(`export const ${name} = ([A-Za-z][A-Za-z0-9_]*);`).exec(SOURCE);
  return alias === null ? null : signatureParams(alias[1] ?? "", seen);
}

// --------------------------------------------------------------------------
// Reading the README
// --------------------------------------------------------------------------

/** The slice under `heading`, up to the next heading of the same depth or less. */
function section(heading: string): string {
  const start = README.indexOf(`\n${heading}\n`);
  const depth = (heading.match(/#/g) ?? []).length;
  const stop = new RegExp(`\\n#{1,${depth}} `, "g");
  stop.lastIndex = start + 1;
  const end = stop.exec(README)?.index;
  /* c8 ignore next 3 -- both headings exist; this only fires if one is renamed
     without renaming it here, and then the message is the useful part. */
  if (start < 0 || end === undefined) {
    throw new Error(`expected a '${heading}' section in README.md`);
  }
  return README.slice(start, end);
}

/** The paragraph in `text` that opens with `marker`, up to the blank line. */
function paragraphs(text: string, marker: string): string[] {
  return text
    .split("\n\n")
    .filter((block) => block.trimStart().startsWith(marker))
    .map((block) => block.trim());
}

/** Every backticked token in `text`, with any call parentheses trimmed off. */
function backticked(text: string): string[] {
  return [...text.matchAll(/`([^`]+)`/g)].map((match) =>
    (match[1] ?? "").replace(/\(.*\)$/, "").trim(),
  );
}

/** Table rows as cells, splitting only on pipes markdown treats as separators. */
function tableRows(text: string): string[][] {
  return text
    .split("\n")
    .filter((line) => line.startsWith("|"))
    .map((line) =>
      // An escaped pipe is cell content, not a separator -- markdown renders it
      // as a literal, and a split that ignored the escape would invent a cell.
      line
        .split(/(?<!\\)\|/)
        .slice(1, -1)
        .map((cell) => cell.replaceAll("\\|", "|").trim()),
    );
}

interface ApiRow {
  /** The exported name the row is about. */
  readonly name: string;
  /** The parameter list the row states, when it states one. */
  readonly call: string | undefined;
  /** The row's last cell — where a shape or arrow type is written. */
  readonly summary: string;
}

/** Every row of the API surface tables that leads with a backticked name. */
function apiRows(): ApiRow[] {
  const rows: ApiRow[] = [];
  for (const cells of tableRows(section("## Public API surface"))) {
    const lead = /^`([A-Za-z][A-Za-z0-9_]*)(\([^`]*\))?`/.exec(cells[0] ?? "");
    if (lead !== null && cells.length >= 2) {
      rows.push({
        name: lead[1] ?? "",
        call: lead[2],
        summary: cells.at(-1) ?? "",
      });
    }
  }
  return rows;
}

/** Every name `src/index.ts` re-exports, values and types alike. */
function exported(): string[] {
  const names = new Set<string>();
  for (const block of INDEX.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}\s+from/g)) {
    for (const entry of (block[1] ?? "").split(",")) {
      // `type Foo` and `Foo as Bar` both reduce to the name a consumer imports.
      const name =
        entry
          .trim()
          .replace(/^type\s+/, "")
          .split(/\s+as\s+/)
          .at(-1) ?? "";
      if (name !== "") {
        names.add(name);
      }
    }
  }
  return [...names];
}

// --------------------------------------------------------------------------

describe("the README's public API surface", () => {
  it("names every symbol the package root re-exports", () => {
    // A cell may list several names at once, so each backticked token is split
    // again on the slash the rows use to group them.
    const known = new Set(
      backticked(section("## Public API surface")).flatMap((token) =>
        token.split("/").map((part) => part.trim()),
      ),
    );
    const missing = exported()
      .filter((name) => !known.has(name))
      .sort();

    expect(missing).toEqual([]);
  });

  it("documents each object shape with the members its interface declares", () => {
    const drift: string[] = [];
    for (const row of apiRows()) {
      const shape = /`\{([^`}]*)\}`/.exec(row.summary);
      if (shape === null) {
        continue;
      }
      const members = interfaceMembers(row.name);
      if (members === null) {
        continue;
      }
      const documented = (shape[1] ?? "")
        .split(",")
        .map((entry) => entry.trim().replace(/\?$/, ""))
        .filter((entry) => entry !== "");
      for (const member of members) {
        if (!documented.includes(member)) {
          drift.push(`${row.name} omits "${member}"`);
        }
      }
      for (const entry of documented) {
        if (!members.includes(entry)) {
          drift.push(`${row.name} invents "${entry}"`);
        }
      }
    }

    expect(drift).toEqual([]);
  });

  it("documents each signature with the source's parameter count", () => {
    const drift: string[] = [];
    for (const row of apiRows()) {
      const arrow = /`\(([^`)]*)\)\s*=>/.exec(row.summary);
      // A row states its parameters either as a call shape in the name cell or
      // as an arrow type in the summary. `(...)` is the opt-out, for a builder
      // whose arguments say nothing useful this small.
      const stated = row.call?.slice(1, -1) ?? arrow?.[1];
      if (stated === undefined || stated.includes("...")) {
        continue;
      }
      const actual = signatureParams(row.name);
      if (actual === null) {
        continue;
      }
      const documented = splitTopLevel(stated);
      if (documented.length !== actual.length) {
        drift.push(
          `${row.name} documents ${documented.length} parameter(s), source takes ${actual.length}`,
        );
      }
    }

    expect(drift).toEqual([]);
  });

  it("points every in-page link at a heading that exists", () => {
    // Two links pointed at an `#events` section that has never existed. The
    // slug rule is the one GitHub applies: lower-case, drop anything that is
    // not a word character, space or hyphen, then swap each space for a hyphen
    // (so a dropped word leaves the double hyphen its spaces became).
    const slug = (heading: string): string =>
      heading
        .toLowerCase()
        .replace(/[^\w\s-]/g, "")
        .replace(/\s/g, "-");
    const headings = new Set(
      [...README.matchAll(/^#{2,6} (.+)$/gm)].map((match) => slug(match[1] ?? "")),
    );
    const broken = [...README.matchAll(/\]\(#([a-z0-9-]+)\)/g)]
      .map((match) => match[1] ?? "")
      .filter((target) => !headings.has(target));

    expect([...new Set(broken)]).toEqual([]);
  });

  it("starts every run of table rows with a header separator", () => {
    // A blank line ends a table, so a paragraph dropped into the middle of one
    // leaves the rows below it rendering as a second, header-less table — which
    // is what the attribute table had done to it, and it reads as seven rows of
    // raw pipes. A run of row lines whose second line is not `| --- |` is an
    // orphaned body.
    const orphaned: string[] = [];
    const lines = README.split("\n");
    for (const [index, line] of lines.entries()) {
      const startsRun = line.startsWith("|") && !(lines[index - 1] ?? "").startsWith("|");
      if (startsRun && !/^\|[\s:|-]+\|$/.test(lines[index + 1] ?? "")) {
        orphaned.push(line.slice(0, 60));
      }
    }

    expect(orphaned).toEqual([]);
  });

  it("hides no pipe inside a code span, which would split the row", () => {
    const broken: string[] = [];
    for (const line of README.split("\n")) {
      if (!line.startsWith("|")) {
        continue;
      }
      for (const span of line.matchAll(/`[^`]*`/g)) {
        // An escaped pipe is how a code span carries one inside a table; a bare
        // one ends the cell, splitting the row and truncating the span with it.
        if (/(?<!\\)\|/.test(span[0] ?? "")) {
          broken.push(span[0] ?? "");
        }
      }
    }

    expect(broken).toEqual([]);
  });
});

describe("the README's element reference", () => {
  it("names every public method in the Methods list", () => {
    const [list] = paragraphs(section("### Attributes and properties"), "**Methods**");
    const documented = new Set(backticked(list ?? ""));
    const missing = publicMethods()
      .filter((name) => !documented.has(name))
      .sort();

    expect(missing).toEqual([]);
  });

  it("names every public property in the Properties list", () => {
    const [list] = paragraphs(section("### Attributes and properties"), "**Properties**");
    const documented = new Set(backticked(list ?? ""));
    const missing = publicProperties()
      .filter((name) => !documented.has(name))
      .sort();

    expect(missing).toEqual([]);
  });

  it("keeps one Methods list and one Properties list", () => {
    // The Properties list drifted while a second paragraph carried the members
    // the first had missed, so neither read as incomplete. One list each is
    // what makes the two checks above mean "complete".
    const reference = section("### Attributes and properties");
    expect({
      methods: paragraphs(reference, "**Methods**").length,
      properties: paragraphs(reference, "**Properties**").length,
    }).toEqual({ methods: 1, properties: 1 });
  });

  it("gives every attribute the element reads a row", () => {
    const rows = tableRows(section("### Attributes and properties"));
    const documented = new Set(
      rows
        .map((cells) => /^`([a-z][a-z0-9-]*)`$/.exec(cells[0] ?? "")?.[1])
        .filter((name) => name !== undefined),
    );
    const missing = attributesRead()
      .filter((name) => !documented.has(name))
      .sort();

    expect(missing).toEqual([]);
  });

  it("accounts for every attribute read whose name it cannot see", () => {
    // The literal scan cannot see `getAttribute(name)`. One such read exists —
    // the `#flag` helper — and it is reached only through literal call sites,
    // which the scan does read. A second would go undocumented in silence.
    const reads = [...ELEMENT.matchAll(/(?:getAttribute|hasAttribute)\(/g)].length;
    const literal = [...ELEMENT.matchAll(/(?:getAttribute|hasAttribute)\("/g)].length;

    expect(reads - literal).toBe(VARIABLE_ATTRIBUTE_READS);
  });

  it("splits live from connect-time exactly as observedAttributes does", () => {
    const reference = section("### Attributes and properties");
    const [live] = paragraphs(reference, "**Live attributes.**");
    const [connectTime] = paragraphs(reference, "**Connect-time attributes.**");
    const source = observedAttributes();

    expect({
      live: backticked(live ?? "").sort(),
      connectTime: backticked(connectTime ?? "").sort(),
    }).toEqual({
      live: [...source.live].sort(),
      connectTime: [...source.connectTime].sort(),
    });
  });

  it("names a real member wherever it writes one", () => {
    const known = new Set([
      ...publicProperties(),
      ...publicMethods(),
      ...LIFECYCLE_CALLBACKS,
      ...INHERITED_DOM_MEMBERS,
    ]);
    const wrong = [...README.matchAll(/\b(?:chat|AgUiChat)\.([A-Za-z_][A-Za-z0-9_]*)/g)]
      .map((match) => match[1] ?? "")
      .filter((name) => !known.has(name))
      .sort();

    expect([...new Set(wrong)]).toEqual([]);
  });
});

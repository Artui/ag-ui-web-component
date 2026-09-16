import type { SkillsMenu } from "../ui/composer/skills_menu.js";
import { fillUiString } from "../ui/fill_ui_string.js";
import type { UiStrings } from "../ui/ui_strings.js";
import { fillTemplate } from "./fill_template.js";
import { parseSkills } from "./parse_skills.js";
import type { Skill } from "./skill.js";

/** What the skill catalog needs from the element that owns it. */
export interface SkillCatalogHost {
  /** The custom element, whose `data-skills-url` names the backend catalog. */
  readonly element: HTMLElement;
  /** The chips row and the slash palette the merged catalog is shown in. */
  readonly menu: SkillsMenu;
  /** The composer a picked skill's prompt is written into. */
  readonly input: HTMLTextAreaElement;
  /** The hint above the composer, saying what a skill still needs. */
  readonly hint: HTMLElement;
  /** The resolved string table. */
  readonly strings: () => UiStrings;
  /** The host's `skillContext`, read at the moment of the pick. */
  readonly context: () => Record<string, unknown>;
  /** Read an opt-in flag attribute. */
  readonly flag: (name: string) => boolean;
  /** Parse a JSON-valued attribute, warning when it will not parse. */
  readonly readJsonAttribute: (name: string) => unknown;
  /** The fetch options every request the element makes carries. */
  readonly fetchInit: (url: string) => RequestInit | undefined;
  /** The element's public `sendMessage`. */
  readonly send: (content: string) => void;
  /** Send whatever the composer holds, as the Send button does. */
  readonly submit: () => void;
  /** Resize the composer to what it now holds. */
  readonly autoGrow: () => void;
}

/**
 * The element's skills: the three catalogs a skill can come from, merged into
 * the chips and the slash palette, and what picking one does to the composer.
 *
 * Owned one-to-one by an `<ag-ui-chat>`, and holding no state outside the
 * instance.
 */
export class SkillCatalog {
  readonly #host: SkillCatalogHost;
  // Skill catalog by source; merged backend → embed → client (later wins).
  #backendSkills: readonly Skill[] = [];
  #embedSkills: readonly Skill[] = [];
  #clientSkills: readonly Skill[] = [];

  constructor(host: SkillCatalogHost) {
    this.#host = host;
  }

  /** The replacement behind `AgUiChat.setSkills`, whose doc is the contract. */
  setClientSkills(skills: readonly Skill[]): void {
    this.#clientSkills = skills;
    this.#recompute();
  }

  /**
   * Wire the skill surfaces: opt-in flags and the embedded catalog. The backend
   * catalog is fetched from the element's startup, a microtask later, so it
   * carries the host's transport configuration.
   */
  init(): void {
    this.#host.menu.enableChips(this.#host.flag("data-prompt-chips"));
    this.#host.menu.enableSlash(this.#host.flag("data-slash-commands"));
    this.#embedSkills = this.#readEmbedded();
    this.#recompute();
  }

  /** Fetch the backend skills catalog from `data-skills-url`, if set. */
  async fetch(): Promise<void> {
    const url = this.#host.element.getAttribute("data-skills-url");
    if (url === null) {
      return;
    }
    try {
      const response = await fetch(url, this.#host.fetchInit(url));
      this.#backendSkills = parseSkills(await response.json());
      this.#recompute();
    } catch {
      // Network/parse failure: skills just stay as the embedded/client set.
    }
  }

  /**
   * Act on a picked skill.
   *
   * A skill with no `prompt` is server-resolved: picking it sends the bare
   * `/name` token for the agent to expand, so the wording never reaches the
   * browser. Prefer that shape — a skill often states a project's internal
   * workflow most plainly, and a catalog endpoint is a plain GET.
   *
   * A skill carrying a `prompt` has the client fill its `{placeholder}`s from
   * the page instead, which is right for placeholders only the page can supply.
   *
   * Either way a pick sends; `sendImmediately: false` opts into pre-filling the
   * composer instead.
   */
  apply(skill: Skill): void {
    const { input, hint } = this.#host;
    if (skill.prompt === undefined) {
      hint.hidden = true;
      this.#host.send(`/${skill.name}`);
      return;
    }
    const { text, missing } = fillTemplate(skill.prompt, this.#host.context());
    if (missing.length > 0) {
      // Hand the user something to work with rather than only a refusal. The
      // partially-filled template goes into the composer with its unresolved
      // `{placeholder}`s intact and the first one selected, so the next
      // keystroke replaces it. Blocking with a hint alone left whatever the
      // user had typed to open the palette — a lone "/" — sitting there, which
      // says nothing about what the skill wanted or how to give it.
      hint.textContent = fillUiString(this.#host.strings().skillNeeds, {
        title: skill.title,
        fields: missing.join(", "),
      });
      hint.hidden = false;
      input.value = text;
      this.#host.autoGrow();
      input.focus();
      this.#selectFirstPlaceholder(text);
      return;
    }
    hint.hidden = true;
    input.value = text;
    this.#host.autoGrow();
    if (skill.sendImmediately === false) {
      input.focus();
      return;
    }
    this.#host.submit();
  }

  /** Parse the inline `data-skills` JSON catalog (empty when absent/malformed). */
  #readEmbedded(): readonly Skill[] {
    // `parseSkills` drops anything that is not a well-formed skill, `null`
    // included, so the absent and unparseable cases need no branch here.
    return parseSkills(this.#host.readJsonAttribute("data-skills"));
  }

  /** Merge the three sources (backend → embed → client; later wins by name). */
  #recompute(): void {
    const merged = new Map<string, Skill>();
    for (const skill of [...this.#backendSkills, ...this.#embedSkills, ...this.#clientSkills]) {
      merged.set(skill.name, skill);
    }
    this.#host.menu.setSkills([...merged.values()]);
  }

  /**
   * Put the caret on the first unresolved placeholder, selected.
   *
   * Typing then replaces it, which is the shortest path from "this skill needs
   * a topic" to a sendable prompt.
   */
  #selectFirstPlaceholder(text: string): void {
    // The first surviving brace *is* the first unresolved placeholder — a
    // resolved one was substituted away — so this needs no search through the
    // missing keys and no not-found branch to defend.
    const start = text.indexOf("{");
    this.#host.input.setSelectionRange(start, text.indexOf("}", start) + 1);
  }
}

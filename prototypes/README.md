# Design revamp prototypes

Prototype branch `claude/wclook-prototypes`, never merged. Round two: the directions are
no longer prototypes beside a baseline but the component's theme set, with Quiet as the
default. The proposed public surface is in [THEMES.md](THEMES.md).

## The theme set

| Theme | Character |
| --- | --- |
| `quiet` (default) | Flat, nearly black and white. Hairlines, no bubble behind the agent's text, graphite accent until a host sets one. |
| `soft` | Rounded, with surfaces lightly tinted from the accent, pill-shaped controls and a shadow coloured by the accent. |
| `ledger` | Dense and editorial. Serif answers, monospace machine output, square corners. |
| `classic` | The look before the revamp, so existing hosts can pin it. |
| `code` | Kept for compatibility: classic's structure in a dark terminal palette. |

Where things live:

- `src/ui/themes/`: each theme's tokens and its structure.
- `src/ui/shell/token_styles.ts`: Quiet's tokens, as the token defaults.
- `src/ui/progress/tool_step_group.ts` and `src/ui/progress/tool_group_styles.ts`: grouped tool steps.
- `extraStyles` on the element in `src/core/ag_ui_chat.ts`, adopted by `src/ui/shell/adopt_styles.ts`.

## Running it

```bash
pnpm install && pnpm build
HOST=127.0.0.1 node demo/mock-server.mjs &
node prototypes/screenshot-matrix.cjs        # writes prototypes/shots/
node prototypes/contrast-check.cjs > prototypes/contrast.json
```

To look at one cell live, open
`http://localhost:5173/prototypes/?theme=soft&scheme=dark&placement=sidebar&run=1`. The query
parameters:

- `theme`: one of the theme words, or a host word such as `acme` or `soft acme`. Empty means the default.
- `scheme`: `light`, `dark` or `auto`.
- `run`: `1` sends the scripted turn. `import`, `ask` and `delegate` drive the mock's approval, question and sub-agent branches.
- `override`: `accent`, `pertheme`, `parts` or `extra` shows one override layer.
- `steps`: `cards` keeps the per-call cards, `group` folds them.

`agents-home.html` is a static concept of an Agents home view in Quiet. Open it as a file,
with `?scheme=dark` for dark.

## Tests this branch breaks on purpose

In the happy-dom project:

- `readme_api_surface.test.ts`: the README does not list `extraStyles` or the
  `data-tool-group` attribute yet. That is two tests.
- `readme_parts.test.ts`: the README does not list the three `tool-group` parts.

In the Chromium project, seventeen tests in nine files pin the old defaults or the per-call
card layout that grouping replaces:

- `collapse_motion`: the launcher size.
- `declaration_only_text`, `reload_mid_approval`, `styles_tool_card_head` and
  `subagent_progress`: cards now sit inside a step group. `subagent_progress` accounts for four tests.
- `greeting_motion`: two tests about the docked composer; not investigated one by one, most likely the new composer row padding.
- `styles_attachment_chips`: the user bubble colour.
- `styles_host_theming`: the new default colours, fonts and themes. That is four tests.
- `styles_inner_corners`: the frame radius is now its own token. That is two tests.

The Chromium project needs `executablePath: "/opt/pw-browsers/chromium"` in this
environment. That change was made locally to run it and is not committed.

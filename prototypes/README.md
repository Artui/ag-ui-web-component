# Design revamp prototypes

Throwaway branch. Never merged. Three directions for the new look of
`<ag-ui-chat>`, built as real themes on the real component, plus the script
that photographs them.

## The directions

| Theme value | Name | Character |
| --- | --- | --- |
| `proto-quiet` | Quiet | Flat, near-monochrome. Hairlines, no bubbles for the agent, graphite accent. |
| `proto-soft` | Soft | Rounded, surfaces tinted from the accent, pill controls, a coloured shadow. |
| `proto-ledger` | Ledger | Dense and editorial. Serif answers, monospace machine output, square corners. |

Add a second word for the scheme: `theme="proto-quiet dark"` or `theme="proto-quiet auto"`.
Each direction declares three seeds (background, text, accent) with `light-dark()`;
every other shade is mixed from them with `color-mix(in oklch, ...)` in
`src/ui/revamp/revamp_base_styles.ts`, and every existing `--ag-ui-*` token is still
read first.

Grouped tool steps are a real JS change behind `data-tool-group`
(`src/ui/progress/tool_step_group.ts`, wired in `Transcript.cardFor`). Without the
attribute the per-call cards render exactly as before.

## Running it

```bash
pnpm install && pnpm build
HOST=127.0.0.1 node demo/mock-server.mjs &
node prototypes/screenshot-matrix.cjs        # writes prototypes/shots/
node prototypes/contrast-check.cjs > prototypes/contrast.json
```

Open `http://localhost:5173/prototypes/?theme=proto-soft&scheme=dark&placement=sidebar&steps=group&run=1`
to look at one cell live. `run=1` sends the scripted turn (the mock's `launch` branch):
reasoning, a chart from a tool, five form steps with one failure, and a destructive save
waiting on the confirmation card.

`agents-home.html` is a static concept of an Agents home view in the Quiet direction;
open it as a file, with `?scheme=dark` for dark.

## Known departures from the house rules

On purpose, and only on this branch: the derived aliases are declared in the revamp
module rather than the token block, the chart series set the public `--ag-ui-chart-*`
names directly, and the group's strings are English only. Five guard tests in the
existing suite fail on exactly these (`styles.test.ts` token indirection, and the README
attribute and parts tables).

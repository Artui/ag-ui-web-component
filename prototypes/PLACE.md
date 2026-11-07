# Page context prototype

Prototype branch `claude/place-context-prototype`, never merged. A native "you are here"
chip: where in the host app the conversation is (page, tab, record), drawn by the element
and sent to the agent as one context entry from the same read.

## What the branch adds

- `src/ui/place/`: the `Place` shape, the chip, its styles, and the route-map fallback.
- `getPlace` and `refreshPlace()` on the element (`src/core/ag_ui_chat.ts`). The place is
  read before every round, on expand, on composer focus, on `popstate` and `hashchange`,
  and when the host calls `refreshPlace()`.
- The place entry is appended after the host's `getContext()` in the element's dispatch,
  so a host that replaces `getContext` keeps it, and a place the user took out is not sent.
- A stand-in `above-composer` slot at its decided position, to judge the two together.
- `data-place-position` (prototype only): `tools` puts the chip in the composer's tool
  row, `row` gives it its own row above the field, `slot` makes that row the slot's
  fallback content, which a host filling the slot replaces.
- The mock agent answers "where" by quoting the place entry it received.

## Running it

```bash
pnpm install && pnpm build
PORT=5180 HOST=127.0.0.1 node demo/mock-server.mjs &
node prototypes/place-matrix.cjs        # writes prototypes/place-shots/
```

One cell live: `http://localhost:5180/prototypes/place/?placement=sidebar&theme=classic&scheme=dark&run=where`.
Query parameters: `theme`, `scheme`, `placement`, `pos` (`tools`, `row`, `slot`), `run=where`,
`slot=1` (a host banner in the slot), `excluded=1`, `long=1`, `source=route` (route-map
fallback), `source=none`, `collapsed=1`. The Shipping, Summary and Refunds tabs on the host
page are an in-page navigation followed by `refreshPlace()`; the box under them shows what
the last round actually sent.

`place-shots/index.html` is the review sheet: every placement in Quiet and classic, light
and dark, then the phone and the variants.

No tests: the branch is a design prototype, and the coverage gate fails on the new modules.

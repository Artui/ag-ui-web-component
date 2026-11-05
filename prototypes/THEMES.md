# Themes: proposed public surface

For review as an API. Prototype branch `claude/wclook-prototypes`; nothing here is released.

## The attribute

```
theme = [name] [scheme]          words in any order, matched with ~=
name   = quiet | soft | ledger | classic | code | <any other word>
scheme = light | dark | auto     default: light
```

| Value | Result |
| --- | --- |
| *(absent)* | Quiet, light |
| `dark` | Quiet, dark (the existing `theme="dark"` keeps working, now in the new default look) |
| `auto` | Quiet, following `prefers-color-scheme` |
| `soft`, `soft dark`, `ledger auto` | that theme in that scheme |
| `classic`, `classic dark` | the look before the revamp, for hosts that pin it |
| `code` | the existing terminal theme; dark only, ignores the scheme word |
| `acme` | an unknown word adds no built-in rules, so this is Quiet until the host's own CSS styles it |
| `soft acme` | starts from Soft; the host's `[theme~="acme"]` rules layer on top |

**Unknown words resolve to the default theme.** The component never matches a word it does not
ship, so a host's name is purely a hook for the host's own selector. Two unknown words are two
hooks. Nothing is reserved beyond the eight words above.

**The default scheme is `light`, not `auto`.** The widget sits on someone else's page, and only the
host knows that page's scheme. With an `auto` default, a light admin screen on a machine set to
dark mode would get a dark panel on a white page, and every existing install would change
appearance on upgrade without a line of its own code changing. A host whose page follows the
system says `auto` in one word.

**`code` is kept for compatibility only.** It is classic's structure in a terminal palette, it has
no light half, and Ledger is where a monospace look goes now. It stays because `theme="code"`
is in use; it is not listed among the built-in themes in the docs.

The built-in theme toggle (`data-theme-toggle`) flips only the scheme word: `soft` becomes
`soft dark`, `soft dark` becomes `soft light`.

## How a theme is built

Each theme is three seeds and a few structural rules:

- Seeds: `--ag-ui-bg`, `--ag-ui-fg`, `--ag-ui-accent`, each declared with `light-dark()`.
- Every other colour is derived from them with `color-mix(in oklch, ...)`: hover, borders, the
  secondary and tertiary text inks, washes and tints, the user's turn, the focus ring.
- Every derived value still reads its own public token first, so each stays an override point.

Quiet's tokens are the component's token defaults. The user's turn is the accent mixed at 12% into
the background: with Quiet's graphite accent that is a neutral wash, and as soon as a host sets a
brand accent it becomes a tint of the brand (the one thing borrowed from Soft).

## Override layers, from lightest to heaviest

### (a) Tokens

Any `--ag-ui-*` token, on the element or any ancestor. Per theme, from host CSS:

```css
body { --ag-ui-accent: #0f766e; }                     /* accent only: the rest follows */
ag-ui-chat[theme~="soft"] { --ag-ui-accent: #c2410c; --ag-ui-frame-radius: 12px; }
```

New tokens this adds:

- **Inks and lines:** `--ag-ui-ink-2`, `--ag-ui-ink-3`, `--ag-ui-line`, `--ag-ui-line-strong`.
- **Surfaces:** `--ag-ui-wash`, `--ag-ui-accent-ink`, `--ag-ui-tint`, `--ag-ui-tint-2`.
- **Focus:** `--ag-ui-ring`.
- **Type scale:** `--ag-ui-text-xs` to `--ag-ui-text-lg`, `--ag-ui-leading`, `--ag-ui-serif`.
- **Frame:** `--ag-ui-frame-radius` and `--ag-ui-frame-shadow`. These are what a theme sets for the frame. The existing `--ag-ui-panel-radius` and `--ag-ui-shadow` stay the final say, and are what a docked placement squares or flattens.
- **Charts:** `--ag-ui-chart-1` to `--ag-ui-chart-6` are read through private aliases now, so a host's value beats the theme's.
- **Status marks:** `--ag-ui-ico-check`, `--ag-ui-ico-error`, `--ag-ui-ico-declined`, `--ag-ui-ico-chevron` (mask images).

### (b) Parts

`::part()` as today. New parts: `tool-group`, `tool-group-head`, `tool-group-list`.

```css
ag-ui-chat::part(header) { background: linear-gradient(#f2f7f6, transparent); }
```

### (c) A host's own named theme

```html
<ag-ui-chat theme="acme dark"></ag-ui-chat>
```
```css
ag-ui-chat[theme~="acme"] {
  --ag-ui-bg: light-dark(#fbfaf7, #10161c);
  --ag-ui-fg: light-dark(#14212b, #e4ebf0);
  --ag-ui-accent: light-dark(#0b5cad, #6cb2ff);
  --ag-ui-frame-radius: 4px;
}
```

Use `light-dark()` in the seeds and the scheme word works for the custom theme too.

### (d) `extraStyles`: structure the tokens and parts cannot reach

```ts
const sheet = new CSSStyleSheet();
sheet.replaceSync(`.message--assistant { padding: 10px 12px; border-radius: 10px; }`);
chat.extraStyles = [sheet];
```

- `extraStyles: readonly CSSStyleSheet[]`, on each element. The default is `[]`.
- Adopted after the built-in sheet, so it wins at equal specificity.
- Setting it re-adopts at once. The array is copied.
- Constructed sheets are not subject to `style-src`, so this works under the same strict CSP as the
  built-in sheet. There is no `<style>` injection and no string form, so a host never trips its
  own policy.
- Per instance, with no module state: two elements can carry different sheets.
- Class names inside the shadow root are not a stable API. The README should say that this layer
  is for the last mile and may need touching on a minor release; layers (a) to (c) are the
  supported ones.

No events are added.

## Grouped tool steps

On by default in every theme but `classic` and `code`. The `data-tool-group` attribute overrides
either way: present folds the steps, and `off` or `false` keeps the per-call cards. The existing
`data-tool-display` modes still apply to the cards inside a group.

## Text on the accent

`--ag-ui-on-accent`, unless the host sets it, is picked from the accent's own lightness: white
below oklch L 0.62 and near-black above it. The rule is

```css
oklch(from var(--_accent) clamp(0, (0.62 - l) * 1000, 1) 0 0)
```

behind `@supports` for that exact expression. Relative colour syntax with channel arithmetic is
Chrome 119, Firefox 128 and Safari 18. Safari 16.4 to 17 shipped an earlier draft of the syntax,
and whether it parses this expression is not verified here (no Safari in this environment). The
`@supports` test makes that safe either way: an engine that cannot read the expression keeps the
fallback, which is white in the light scheme and near-black in the dark one. That fallback is the
old behaviour, so on Safari 17 a mid-tone brand accent in the dark scheme may still be at risk.
Verified in Chromium: an indigo accent in the dark scheme gets white text. `contrast-color()` would replace
this rule once it is available at the floor.

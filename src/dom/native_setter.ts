// Set a control's `value` / `checked` through the native prototype setter, so
// framework value-tracking sees the change. React (and Vue/Svelte) replace the
// element's own setter with a tracked one, so `el.value = x` hits that override
// and the following `input` event carries no change: the field looks filled
// while the framework's state stays empty. Calling the original prototype
// setter and then dispatching `input` avoids that.

type ValueSetter = (this: HTMLElement, value: string) => void;
type CheckedSetter = (this: HTMLElement, checked: boolean) => void;

/** The original prototype setter for `prop` on `proto`. */
function prototypeSetter(proto: object, prop: string): (this: HTMLElement, value: never) => void {
  // Captured once at module load; DOM environments always define these, which
  // is what makes the descriptor cast safe.
  const setter = (Object.getOwnPropertyDescriptor(proto, prop) as PropertyDescriptor).set;
  return setter as unknown as (this: HTMLElement, value: never) => void;
}

const setInputValue = prototypeSetter(HTMLInputElement.prototype, "value") as ValueSetter;
const setTextareaValue = prototypeSetter(HTMLTextAreaElement.prototype, "value") as ValueSetter;
const setSelectValue = prototypeSetter(HTMLSelectElement.prototype, "value") as ValueSetter;
const setInputChecked = prototypeSetter(HTMLInputElement.prototype, "checked") as CheckedSetter;

/** Set `el.value` via the element's native prototype setter. */
export function setNativeValue(
  el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  value: string,
): void {
  if (el instanceof HTMLTextAreaElement) {
    setTextareaValue.call(el, value);
  } else if (el instanceof HTMLSelectElement) {
    setSelectValue.call(el, value);
  } else {
    setInputValue.call(el, value);
  }
}

/** Set `el.checked` via the native prototype setter. */
export function setNativeChecked(el: HTMLInputElement, checked: boolean): void {
  setInputChecked.call(el, checked);
}

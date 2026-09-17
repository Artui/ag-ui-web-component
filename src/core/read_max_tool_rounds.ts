import { MAX_TOOL_ROUNDS } from "../constants.js";

/**
 * The tool-round budget from `element`'s `data-max-tool-rounds`, for one send.
 *
 * Anything unparseable becomes `NaN`, which {@link AgUiClient} rejects along
 * with a bound below one -- so the two ways of setting this are validated in
 * one place rather than agreeing by coincidence.
 */
export function readMaxToolRounds(element: Element): number {
  const attr = element.getAttribute("data-max-tool-rounds");
  return attr === null ? MAX_TOOL_ROUNDS : Number.parseInt(attr, 10);
}

/**
 * Whether the launcher's unread badge is shown.
 *
 * The unread badge, unlike every other affordance here, is on by default:
 * a collapsed widget is the one state where an answer can arrive with nothing
 * on screen to say so. `data-unread-badge="false"` turns it off for a host
 * that drives its own chrome from the `ag-ui-unread` event.
 */
export function isUnreadBadgeEnabled(element: Element): boolean {
  return element.getAttribute("data-unread-badge") !== "false";
}

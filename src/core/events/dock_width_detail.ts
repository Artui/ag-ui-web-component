/** `detail` shape of the {@link DOCK_WIDTH_EVENT} CustomEvent. */
export interface DockWidthDetail {
  /** The CSS px the docked panel covers at rest; 0 when it covers none of the page. */
  readonly width: number;
  /** The edge the panel docks against. */
  readonly side: "left" | "right";
}

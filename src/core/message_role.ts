import type { MESSAGE_ROLE } from "../constants.js";

/** The role a rendered chat message takes. */
export type MessageRole = (typeof MESSAGE_ROLE)[keyof typeof MESSAGE_ROLE];

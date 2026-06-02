import type { Skill } from "./skill.js";

/** Whether ``value`` has the required string fields of a {@link Skill}. */
function isSkill(value: unknown): value is Skill {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record["name"] === "string" &&
    typeof record["title"] === "string" &&
    typeof record["prompt"] === "string"
  );
}

/**
 * Parse an untrusted value (parsed JSON from `data-skills` or a skills
 * endpoint) into a list of {@link Skill}s, dropping anything malformed. Never
 * throws — a bad payload yields an empty list.
 */
export function parseSkills(value: unknown): Skill[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(isSkill);
}

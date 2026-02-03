export const CAPS = {
  LOG_READ: "wundr://cap/log.read",
  LOG_WRITE: "wundr://cap/log.write",

  PROFILE_UPDATE: "wundr://cap/profile.update",

  CALENDAR_SYNC: "wundr://cap/calendar.sync",

  NEARBY_MATCH: "wundr://cap/nearby.match",

  CLUB_GATE_READ: "wundr://cap/club.gate.read",

  // Learning / Edutainment modules
  LEARN_READ: "wundr://cap/learn.read",
  LEARN_PROGRESS_WRITE: "wundr://cap/learn.progress.write",
  LEARN_CATEGORY_CREATE: "wundr://cap/learn.category.create",
  LEARN_QUEST_CREATE: "wundr://cap/learn.quest.create"
} as const;

export type Cap = typeof CAPS[keyof typeof CAPS];

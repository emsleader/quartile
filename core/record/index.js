// Quartile Record (specification Section 21): public API.
// For other modules:
//   getApprovedLessons({ journal, design })  -> committee_review ("Lessons from earlier letters")
//   openRequests({ paper_id, revision })     -> submission_readiness and response_tracker
export { createPaper, linkCollection, getPaper, listPapers, PAPER_TYPES } from "./papers.js";
export { addEvent, getEvent, rawEvents, listEvents, replay, deriveStatus, statusOf, EVENT_TYPES, EVENT_GROUPS, DECISIONS, FILE_KINDS } from "./events.js";
export { recordLetter, LETTER_TYPES } from "./letters.js";
export { splitLetter } from "./split.js";
export { proposeCategory, proposeLesson, CATEGORIES, CATEGORY_HINTS, EXTRA_HINTS } from "./learn.js";
export { listRequests, updateRequest, openRequests, rounds, REQUEST_STATUSES } from "./requests.js";
export { listLessons, getLesson, decideLesson, getApprovedLessons, readApprovedLessonsFile, proposeRepeated, parseRule, LESSON_STATUSES } from "./lessons.js";
export { outcomeStats, LABEL as STATS_LABEL } from "./stats.js";
export { timelineMarkdown, timelineDocx, timelineRows } from "./timeline.js";
export { lessonsFile, recordDir } from "./store.js";

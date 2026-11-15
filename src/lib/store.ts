import type { LessonMode, Turn } from "./board";
import type { Recap } from "./recap";

// Lessons are kept in this browser for now. A lesson is just its list of turns,
// so it always reopens exactly as it was taught. Accounts and syncing across
// devices come with sign-in.

export type SavedLesson = { id: string; mode: LessonMode; title: string; updatedAt: number; turns: Turn[]; recap?: Recap };

const KEY = "tutor.lessons.v1";
const MAX_LESSONS = 50;

export function loadLessons(): SavedLesson[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((l) => l && typeof l.id === "string" && Array.isArray(l.turns)) : [];
  } catch {
    return [];
  }
}

function write(list: SavedLesson[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    return true;
  } catch {
    return false; // storage full or blocked: the lesson still works, it just isn't kept
  }
}

/** Attached files are large, so only their names are kept with a saved lesson. */
function slim(turns: Turn[]): Turn[] {
  return turns.map((t) =>
    t.role === "student"
      ? { role: "student", text: t.text, ...(t.files?.length || t.fileNames?.length ? { fileNames: t.fileNames ?? t.files!.map((f) => f.name) } : {}) }
      : t,
  );
}

export function saveLesson(lesson: SavedLesson): SavedLesson[] {
  const rest = loadLessons().filter((l) => l.id !== lesson.id);
  let list = [{ ...lesson, turns: slim(lesson.turns) }, ...rest].slice(0, MAX_LESSONS);
  // If storage is full, let the oldest lessons go until the current one fits.
  while (!write(list) && list.length > 1) list = list.slice(0, -1);
  return list;
}

export function deleteLesson(id: string): SavedLesson[] {
  const list = loadLessons().filter((l) => l.id !== id);
  write(list);
  return list;
}

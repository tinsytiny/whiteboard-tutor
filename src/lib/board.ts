// The tutor never draws pixels. It emits a stream of small "board actions",
// one JSON object per line, and the app renders them. Saving the list of
// actions is saving the lesson, so a lesson always reopens exactly as taught.

export type LessonMode = "topic" | "homework" | "exam";

export type BoardAction =
  | { t: "say"; text: string } // spoken line, shown in the transcript
  | { t: "heading"; text: string }
  | { t: "write"; text: string } // handwritten line on the board
  | { t: "math"; tex: string } // LaTeX, rendered with KaTeX
  | { t: "plot"; fns: string[]; xmin?: number; xmax?: number; label?: string }
  | { t: "table"; head: string[]; rows: string[][] }
  | { t: "note"; text: string } // boxed key point or common trap
  | { t: "ask"; text: string } // pause and wait for the student
  | { t: "error"; text: string };

/** A page the student brought in: a PDF or picture, for example exported or copied from a notes app. */
export type Attachment = { name: string; type: string; data: string; id?: string }; // data is base64; id links it to the Library

export const ATTACH_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp", "image/gif"];
export const ATTACH_MAX_FILES = 4;
export const ATTACH_MAX_BYTES = 4 * 1024 * 1024; // per message, until file storage is set up

export type Turn =
  | { role: "student"; text: string; files?: Attachment[]; fileNames?: string[]; fileIds?: string[] } // saved lessons keep names and Library ids; the data lives in the Library
  | { role: "tutor"; actions: BoardAction[] };

const KINDS = new Set(["say", "heading", "write", "math", "plot", "table", "note", "ask", "error"]);

const isStr = (v: unknown): v is string => typeof v === "string";
const isStrArr = (v: unknown): v is string[] => Array.isArray(v) && v.every(isStr);

/** Parse one line of tutor output. Anything malformed is dropped, never drawn. */
export function parseAction(line: string): BoardAction | null {
  const s = line.trim();
  if (!s.startsWith("{")) return null;
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(s);
  } catch {
    return null;
  }
  if (!isStr(o.t) || !KINDS.has(o.t)) return null;
  switch (o.t) {
    case "math":
      return isStr(o.tex) ? { t: "math", tex: o.tex } : null;
    case "plot": {
      if (!isStrArr(o.fns) || o.fns.length === 0) return null;
      const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
      return { t: "plot", fns: o.fns.slice(0, 4), xmin: num(o.xmin), xmax: num(o.xmax), label: isStr(o.label) ? o.label : undefined };
    }
    case "table":
      return isStrArr(o.head) && Array.isArray(o.rows) && o.rows.every(isStrArr)
        ? { t: "table", head: o.head, rows: o.rows as string[][] }
        : null;
    default:
      return isStr(o.text) ? ({ t: o.t, text: o.text } as BoardAction) : null;
  }
}

/** Turn a byte stream of newline-delimited JSON into actions as they arrive. */
export async function* readActions(body: ReadableStream<Uint8Array>): AsyncGenerator<BoardAction> {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (value) buf += dec.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const a = parseAction(buf.slice(0, nl));
      buf = buf.slice(nl + 1);
      if (a) yield a;
    }
    if (done) break;
  }
  const last = parseAction(buf);
  if (last) yield last;
}

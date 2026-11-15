# Tutor Board (working name)

A tutor that talks a question through while writing each step on a whiteboard.
Clean-room build: our own code, name, look and wording.

## Run it

```bash
npm install
npm run dev
```

The tutor's AI is free Google Gemini. Get a key at Google AI Studio (no card
needed) and save it as `GOOGLE_GENERATIVE_AI_API_KEY` in the Vercel project's
environment variables, or in `.env.local` to run it on a laptop. The default
model is `gemini-3.5-flash`; `TUTOR_MODEL` overrides it.

Without that key, on Vercel the tutor falls back to Vercel's AI Gateway (which
needs a card on the Vercel account), and anywhere else it plays a built-in,
clearly labelled sample lesson.

## How it works

- `src/lib/board.ts` defines board actions. The tutor streams one JSON action per
  line (say, write, math, plot, table, note, ask) and the app draws them. The
  saved list of actions is the lesson.
- `src/lib/prompt.ts` holds the tutor's instructions for the three lesson kinds.
- `src/app/api/lesson/route.ts` streams the tutor's actions to the browser.
- `src/components/` has the lesson room, the board and the computed graph.
- Design tokens live in `src/app/globals.css`. Components use role names only.

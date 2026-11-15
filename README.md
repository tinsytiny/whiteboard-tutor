# Tutor Board (working name)

A tutor that talks a question through while writing each step on a whiteboard.
Clean-room build: our own code, name, look and wording.

## Run it

```bash
npm install
npm run dev
```

Without a key the app plays a built-in, clearly labelled sample lesson. To
connect the live tutor, set `ANTHROPIC_API_KEY` in `.env.local`. `TUTOR_MODEL`
optionally overrides the model.

## How it works

- `src/lib/board.ts` defines board actions. The tutor streams one JSON action per
  line (say, write, math, plot, table, note, ask) and the app draws them. The
  saved list of actions is the lesson.
- `src/lib/prompt.ts` holds the tutor's instructions for the three lesson kinds.
- `src/app/api/lesson/route.ts` streams the tutor's actions to the browser.
- `src/components/` has the lesson room, the board and the computed graph.
- Design tokens live in `src/app/globals.css`. Components use role names only.

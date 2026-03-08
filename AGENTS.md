# AGENTS

- Default expectation: make reasonable decisions and keep moving unless a choice is genuinely high-risk or blocked.
- If a commit message, PR description, or agent-facing comment mentions attribution, use: `Attribution: T3 Code harness with GPT-5.4 High.`
- `bun run dev` starts the ingest daemon on `127.0.0.1:14317` and `127.0.0.1:14318`, and the dashboard on Vite's default `http://localhost:5173/`.
- Do not casually re-enable high-volume `codex-app-server` transport spans; they were the main reason the dashboard got stuck on `Loading data...`.
- For dashboard/UI work, preserve the existing non-generic visual direction and reuse the earlier Uncodixfy-style guidance instead of drifting into default AI-dashboard patterns.
- Keep plans and validation notes in markdown under `docs/plans` and `docs/`.

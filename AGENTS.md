# AGENTS

- Default expectation: make reasonable decisions and keep moving unless a choice is genuinely high-risk or blocked. Work iterativly using tools you have available (such as a web browser) to validate and achieve your current goals.
- When writing commit messages, PR descriptions, or comment replies, include attribution, use: `Attribution: <harness> with <full model name>.`
- This project is structured as a monorepo using turbo and with bun.
- `bun run dev` starts the ingest daemon on `127.0.0.1:14317` and `127.0.0.1:14318`, and the dashboard on `http://localhost:5173/`.
- Do not casually re-enable high-volume `codex-app-server` transport spans; they were the main reason the dashboard got stuck on `Loading data...`.
- For dashboard/UI work, preserve the existing non-generic visual direction and refer to the [Uncodixfy-style guidance](https://raw.githubusercontent.com/cyxzdev/Uncodixfy/refs/heads/main/Uncodixfy.md) instead of drifting into default AI-dashboard patterns.
- Keep plans, progress, and validation notes in markdown under `docs/plans` and `docs/`.
- Commit changes with clear concise messages at logical checkpoints - your task is not done if the working dir is not clean.

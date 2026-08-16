---
name: explain
description: Use when the user wants a rich, visual explanation of anything — a conversation we just had, a concept, a system, an architecture, a decision, a codebase, or a code change/diff/PR. Publishes an interactive Claude Artifact (Background / Intuition / Detail / Quiz) with a required flow diagram, falling back to a self-contained HTML file. 트리거는 `/explain`, "이거 시각화해줘", "지금까지 얘기한 거 정리해줘", "이 변경/PR 설명해줘", "그림으로 설명해줘".
---

# Explain

Make a rich, interactive, visual explanation of the subject.

## 1. Identify the subject

The subject is whatever the user pointed at. Resolve it before writing anything:

- **No argument given** — the subject is *this conversation*. Explain what we worked through: the problem, the options considered, what we decided and why. Don't ask; just do it. Only ask if the conversation covered several unrelated things and you can't tell which one they mean.
- **A concept or question** (`/explain 이벤트 루프`) — the subject is that topic.
- **A code change** (`/explain HEAD~1`, a branch name, a PR number or URL, or "이 PR") — resolve it with `git diff` / `gh pr view` first, then explain the change.
- **A file, module, or system** (`/explain src/auth/`) — read it broadly, then explain how it works.

If the subject involves code, read widely around it. The Background section is only as good as the surrounding code you actually read.

## 2. Sections

Always these four, in this order:

- **Background** — the existing world the subject sits in. We don't know how much the reader already knows, so give a deep background for beginners (mark it skippable for those already familiar), then a narrower background directly relevant to the subject.
- **Intuition** — the core idea. Essence, not full details. Concrete examples with toy data. Figures and diagrams liberally.
  - **Required: a flow diagram.** Every explanation must include at least one diagram tracing how things move through the pieces involved — data through components, a request through a system, a decision through its consequences, an argument through its steps. Put **concrete example values on the edges**, not abstract labels. If the subject changes an existing flow, show before/after side by side. This is not optional; without it the explanation is incomplete.
- **Detail** — the substance, grouped and ordered so it builds. For a code change this is a high-level walkthrough of the diff, grouped by theme rather than by file. For a concept, the mechanics. For a conversation, the decisions and their reasoning. Title this section for what it actually holds ("Code", "How it works", "What we decided").
- **Quiz** — five medium-difficulty questions that require actually understanding the subject, not gotchas. Interactive multiple choice: clicking an option says whether it was right and gives feedback. Randomize option order independently per question, and keep options balanced in length and position so the answer isn't guessable from shape alone.

## 3. Output

- **Publish as a Claude Artifact by default.** Load the `artifact-design` skill first, write the page to a file, then call the `Artifact` tool with that path so the user gets a hosted, shareable page. Pass a `favicon` and a one-sentence `description`.
  - If the Artifact tool is unavailable or the publish fails, fall back to saving the HTML locally and say why. Put it outside the code repo with a filename starting with today's date in `YYYY-MM-DD-` format, so files stay time-sorted and out of version control. For example: /tmp/2026-01-12-explanation-<slug>.html
- Either way it's a single self-contained page with CSS and JavaScript inlined — no external CDNs, fonts, or scripts (the Artifact CSP blocks them). One long scrolling page with section headers and a table of contents; no tabs for the top-level structure. Responsive so it reads on a phone, and theme-aware for light and dark.

## 4. Style

- Write with the clarity and flow of Martin Kleppmann — engaging, classic style, smooth transitions between sections.
- Pick a small number of diagram families and reuse them throughout rather than inventing a new visual language per figure. Useful kinds:
  - A simplified mock of the UI the user sees, for explaining interface changes.
  - A system diagram showing data flow or communication between components — always with example data on it.
  - A timeline or step sequence, for explaining a process or a decision history.
- No ASCII diagrams. Use simple HTML for diagrams, HTML lists for lists.
- Code blocks always use `<pre>`. If you use a styled div instead it **must** carry `white-space: pre-wrap` in its CSS, or the browser collapses every newline into one line. Before saving, scan each code block in the HTML source and confirm its CSS has `white-space: pre` or `pre-wrap`.
- Use callouts for key concepts, definitions, and important edge cases.

---

Adapted from https://gist.github.com/geoffreylitt/a29df1b5f9865506e8952488eac3d524 (by Geoffrey Litt), generalized from code-diffs to any subject.

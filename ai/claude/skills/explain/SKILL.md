---
name: explain
description: Use when the user wants a rich, visual explanation of anything — a conversation we just had, a concept, a system, an architecture, a decision, a codebase, or a code change/diff/PR. Builds an interactive page (Background / Intuition / Detail / Quiz) with a required flow diagram and opens it in Chrome as a local file; publishes a Claude Artifact only when the user wants to share it. 트리거는 `/explain`, "이거 시각화해줘", "지금까지 얘기한 거 정리해줘", "이 변경/PR 설명해줘", "그림으로 설명해줘".
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

## 3. Design — use the artifact skills

Load both before writing the page, and follow them. They own the design rules; this skill owns only the content structure above.

- **`artifact-design`** — palette tokens, type, layout, light/dark theming, copy rules, the one-look check.
- **`artifact-diagramming`** — what to draw and how: hand-authored inline `<svg>` with labeled arrows, `currentColor` theming, `<figure>` + `<figcaption>`. Every flow diagram in this page follows it — no stacks of HTML boxes standing in for a diagram.

Content rules that stay here because they are about explaining, not design:

- Write with the clarity and flow of Martin Kleppmann — engaging, classic style, smooth transitions between sections.
- Pick a small number of diagram families and reuse them through the page rather than inventing a new visual language per figure: a simplified mock of the UI the user sees; a system diagram with example data on its edges; a timeline or step sequence for a process or decision history.
- No ASCII diagrams. HTML lists for lists.
- Code blocks use `<pre>`. A styled div instead **must** carry `white-space: pre-wrap`, or every newline collapses.
- Callouts for key concepts, definitions, and important edge cases.
- One long scrolling page with section headers and a table of contents; no tabs for the top-level structure.

## 4. Output — a local file in Chrome

The artifact skills assume a publish; by default this page is a local file instead, which changes a few things:

- **Path**: outside the code repo, today's date first so files stay time-sorted: `~/.cache/explain/YYYY-MM-DD-<slug>.html`.
- **Skeleton**: no publish wrapper adds one, so start the file with `<!doctype html>`, `<html lang="ko">`, `<meta charset="utf-8">` and the viewport meta (`viewport-fit=cover`). Without the charset, Korean text can render garbled.
- **Libraries**: the artifact CDN allowlist still applies (cdnjs pinned UMD builds), so the same file can be published later unchanged. Mermaid is not rendered natively in a local file — draw diagrams as inline SVG.
- **Open**: `open -a "Google Chrome" <absolute path>`. Don't use the terminal-browser pane.
- **Check once**: take one Chrome screenshot (claude-in-chrome) of the page, make one pass of fixes for what it shows, and stop. No second look.
- **Publish only when the user wants to share it** (a link for someone else, a teammate, phone). Then strip the doctype/html/meta lines the publish wrapper supplies and call `Artifact` with the file, an `icon`, and a one-sentence `description`.

---

Adapted from https://gist.github.com/geoffreylitt/a29df1b5f9865506e8952488eac3d524 (by Geoffrey Litt), generalized from code-diffs to any subject.

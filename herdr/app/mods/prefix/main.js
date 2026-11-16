// tmux-style prefix: ctrl-space opens this popup, the next key runs one command.
// Keys follow the Zed keymap's screen keys (dotfiles zed/keymap.json, ctrl-space ...), run here as herdr
// commands. Esc or an unknown key cancels.

import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { run, props, closeOverlay, openOverlay, focused, panes, terminals, theme, shared, setShared, exec, home, layout, notify } from "herdr";

// 2-beolsik jamo -> key, so the prefix works with the Korean IME on.
const JAMO = { "ㅂ": "q", "ㅈ": "w", "ㄷ": "e", "ㄱ": "r", "ㅅ": "t", "ㅛ": "y", "ㅕ": "u", "ㅑ": "i", "ㅐ": "o", "ㅔ": "p",
  "ㅁ": "a", "ㄴ": "s", "ㅇ": "d", "ㄹ": "f", "ㅎ": "g", "ㅗ": "h", "ㅓ": "j", "ㅏ": "k", "ㅣ": "l",
  "ㅋ": "z", "ㅌ": "x", "ㅊ": "c", "ㅍ": "v", "ㅠ": "b", "ㅜ": "n", "ㅡ": "m",
  "ㅃ": "shift-q", "ㅉ": "shift-w", "ㄸ": "shift-e", "ㄲ": "shift-r", "ㅆ": "shift-t", "ㅒ": "shift-o", "ㅖ": "shift-p" };
// Shifted punctuation can arrive either way; fold to one spelling.
const ALIAS = { "shift-;": ":", "shift-'": "\"", "shift-\\": "|", "shift-[": "{", "shift-]": "}", "shift-/": "?", "minus": "-",
  "!": "shift-1", "@": "shift-2", "#": "shift-3", "$": "shift-4", "%": "shift-5", "^": "shift-6", "&": "shift-7", "*": "shift-8", "(": "shift-9" };

// N = the number the spaces-num sidebar shows (its "spaces.order"); else the app's own order.
const selectSpace = (n) => { const id = shared("spaces.order")?.[n - 1]; run("space.select", id ? { id } : { index: n }); };

const worktree = (action, w, h) => (f) =>
  openOverlay({ mod: "worktree", kind: "dialog", width: w, height: h, props: { space: f?.space, folder: f?.cwd, action } });

function cycle(f, step) {
  const ps = panes().filter((p) => p.tab === f?.tab);
  const i = ps.findIndex((p) => p.pane === f?.pane);
  if (ps.length > 1) run("pane.focus", { pane: ps[(i + step + ps.length) % ps.length].pane });
}

// A picker in a floating terminal (fzf needs one); the window closes when the terminal ends.
// The picker is a .zshrc function (_pick_dir), so zsh -i. Close this prefix popup first: closing it after
// would hand the keyboard back to the pane underneath. (The dialog's terminal then has the keyboard.)
async function popup(script, self) {
  const r = await exec("hc", ["run", "--bg", "--rm", "--json", "--cwd", home(), "--", "zsh", "-ic", script]);
  const terminal = JSON.parse(r.stdout).address;
  closeOverlay(self);
  openOverlay({ kind: "dialog", width: 0.6, height: 0.6, layout: { type: "block", content: { terminal } } });
}

function find(node, id) {
  if (!node || typeof node !== "object") return null;
  if (node.id === id) return node;
  for (const c of node.children ?? []) { const hit = find(c, id); if (hit) return hit; }
  return null;
}
// Right panel child (files-md, changes, git-graph, ...): show it, or hide the panel when it's already shown.
function panel(id) {
  const root = layout(), p = find(root, "panel"), body = find(root, "panel-body");
  if (!find(root, id)) return notify({ title: `이 레이아웃엔 ${id} 패널이 없다`, level: "warning" });
  if (p && !p.hidden && body?.active === id) run("layout.hide", { id: "panel" });
  else { run("layout.select", { stack: "panel-body", child: id }); run("layout.show", { id: "panel" }); }
}

// Zed's agent panel = this tab's Claude pane: go there, or back to the last pane when already there.
function agent(f) {
  const here = panes().filter((p) => p.tab === f?.tab);
  const claude = here.find((p) => /claude/i.test(p.app ?? p.title ?? ""));
  if (!claude) return run("tab.new", { argv: ["claude"], folder: f?.cwd ?? undefined });
  if (claude.pane !== f?.pane) return run("pane.focus", { pane: claude.pane });
  const last = shared("prefix.last");
  if (last) run("pane.focus", { pane: last });
}

// Zed's terminal panel = a shell pane under the tab: go there, else back, else open one.
function shell(f) {
  const t = terminals().find((x) => x.state === "live" && x.labels?.["zed.terminal"] && String(f?.tab ?? "").endsWith(x.labels["zed.terminal"]));
  if (!t) {
    // run() returns nothing, so split through the CLI to learn the new terminal and label it.
    exec("herdr-app", ["do", "pane.split", JSON.stringify({ direction: "down", ...(f?.pane ? { pane: f.pane } : {}) })]).then((r) => {
      const made = JSON.parse(r.stdout || "{}").terminal;
      if (made) exec("hc", ["label", made, `zed.terminal=${String(f?.tab ?? "").split("/").pop()}`]);
    });
    return;
  }
  if (t.address === f?.terminal) run("pane.go", { direction: "up" });
  else run("pane.focus", { terminal: t.address });
}

// [key, label, action(focusedAtOpen), async: keep this popup until the action resolves]
const BINDS = [
  // Panes (Zed: ActivatePane*, Split*, ToggleZoom, CloseActiveItem)
  ["h", "←", () => run("pane.go", { direction: "left" })],
  ["j", "↓", () => run("pane.go", { direction: "down" })],
  ["k", "↑", () => run("pane.go", { direction: "up" })],
  ["l", "→", () => run("pane.go", { direction: "right" })],
  ["|", "split →", () => run("pane.split", { direction: "right" })],
  ["-", "split ↓", () => run("pane.split", { direction: "down" })],
  ["z", "zoom", () => run("pane.zoom")],
  ["x", "close", () => run("pane.close")],
  ["t", "terminal", shell],
  [";", "sidebar", () => run("layout.toggle", { id: "sidebar" })],
  // Tabs (Zed: ActivateItem N, Next/PreviousItem; c is tmux's new window, Zed's c has no herdr meaning)
  ["c", "new tab", () => run("tab.new")],
  ["n", "next tab", () => run("tab.next")],
  ["p", "prev tab", () => run("tab.prev")],
  // Panels (Zed: project, git, agent; the same key closes it)
  ["e", "files", () => panel("files")],
  ["g", "git", () => panel("changes")],
  ["shift-g", "git graph", () => panel("git-graph")],
  ["v", "agent", agent],
  ["a", "new agent", (f) => run("tab.new", { argv: ["claude"], folder: f?.cwd ?? undefined })],
  ["space", "close docks", () => { run("layout.hide", { id: "panel" }); run("layout.hide", { id: "sidebar" }); }],
  [":", "commands", () => run("app.palette")],
  ["w", "switcher", () => run("mod.open", { name: "picker" })],
  // Zed: OpenRecent, LazyGit task
  ["shift-c", "repo → pane", (_f, self) => popup('d=$(_pick_dir) && herdr-app do terminal.open --folder "$d" --place right >/dev/null', self), true],
  ["shift-l", "lazygit", (f) => run("tab.new", { name: "LazyGit", argv: ["lazygit"], folder: f?.cwd ?? undefined })],
  // herdr's own, on keys Zed leaves free
  ["'", "last pane", () => { const p = shared("prefix.last"); if (p) run("pane.focus", { pane: p }); }],
  ["tab", "next pane", (f) => cycle(f, 1)],
  ["shift-tab", "prev pane", (f) => cycle(f, -1)],
  ["shift-x", "close tab", () => run("tab.close")],
  [".", "rename tab", () => run("tab.rename")],
  ["shift-r", "rename pane", (f) => f?.terminal && openOverlay({ mod: "pane-name", kind: "dialog", width: 420, height: 220,
    props: { terminal: f.terminal, value: terminals().find((x) => x.address === f.terminal)?.labels?.["pane.name"] ?? "" } })],
  ["shift-n", "new space", () => run("space.new")],
  ["shift-d", "close space", () => run("space.close")],
  [",", "rename space", () => run("space.rename")],
  ["{", "prev space", () => run("space.prev")],
  ["}", "next space", () => run("space.next")],
  ["shift-w", "worktree", worktree("open", 560, 480)],
  ["?", "help", () => run("app.help")],
];
for (let i = 1; i <= 9; i++) {
  BINDS.push([`${i}`, `tab ${i}`, () => run("tab.select", { index: i })]);
  BINDS.push([`shift-${i}`, `space ${i}`, () => selectSpace(i)]);
}
const BY_KEY = new Map(BINDS.map((b) => [b[0], b]));
const HINTS = BINDS.filter((b) => !/^(shift-)?[2-9]$/.test(b[0]));

function resolve(e) {
  for (const k of [e.keystroke, e.key_char, JAMO[e.key_char]]) {
    if (!k) continue;
    const n = ALIAS[k] ?? k;
    if (BY_KEY.has(n)) return BY_KEY.get(n);
    if (e.modifiers?.shift && BY_KEY.has(`shift-${n}`)) return BY_KEY.get(`shift-${n}`); // Korean IME: ⇧ㅗ is still ㅗ
  }
  return null;
}

export default class Prefix extends View {
  init(_props, cx) {
    this.f = focused();
    // Remember the pane before this one, for ";" (tracks focus seen at each prefix).
    const now = this.f?.pane, seen = shared("prefix.seen");
    if (now && seen && seen !== now) setShared("prefix.last", seen);
    if (now) setShared("prefix.seen", now);
    this.handle = cx.focus_handle();
    this.handle.focus();
    cx.timer.after(50, () => this.handle.focus());
  }

  render(cx) {
    const t = theme();
    const chip = ([k, label]) =>
      h_flex().gap(4).px(6).h(20).items_center().rounded(4).bg(t.raised)
        .child(div().text_color(t.accent).font_semibold().child(k.replace("shift-", "⇧")))
        .child(div().text_color(t.muted).child(label));
    return v_flex()
      .id("prefix")
      .track_focus(this.handle)
      .on_key_down((e, cx) => {
        cx.stop_propagation();
        if (/^(shift|ctrl|alt|cmd)$/.test(e.key)) return; // a lone modifier: keep waiting
        const b = resolve(e);
        const f = this.f;
        const id = props().overlay;
        if (b?.[3]) {
          cx.spawn(async () => { try { await b[2](f, id); } finally { closeOverlay(id); } });
          return;
        }
        closeOverlay(id);
        if (b) b[2](f);
      })
      .size_full().p(10).gap(8).bg(t.popover).text_size(11)
      .child(h_flex().justify_between()
        .child(div().text_size(13).font_semibold().text_color(t.foreground).child("C-Space"))
        .child(div().text_color(t.dim).child("Zed keys · 1-9 tab · ⇧1-9 space · Esc")))
      .child(h_flex().flex_wrap().gap(4).children(HINTS.map(chip)));
  }
}

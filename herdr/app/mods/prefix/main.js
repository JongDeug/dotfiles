// tmux-style prefix: ctrl-space opens this popup, the next key runs one command.
// Mirrors ~/.config/herdr/config.toml (TUI). Esc or an unknown key cancels.

import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { run, props, closeOverlay, openOverlay, focused, panes, terminals, theme, shared, setShared, exec, home } from "herdr";

// 2-beolsik jamo -> key, so the prefix works with the Korean IME on.
const JAMO = { "ㅂ": "q", "ㅈ": "w", "ㄷ": "e", "ㄱ": "r", "ㅅ": "t", "ㅛ": "y", "ㅕ": "u", "ㅑ": "i", "ㅐ": "o", "ㅔ": "p",
  "ㅁ": "a", "ㄴ": "s", "ㅇ": "d", "ㄹ": "f", "ㅎ": "g", "ㅗ": "h", "ㅓ": "j", "ㅏ": "k", "ㅣ": "l",
  "ㅋ": "z", "ㅌ": "x", "ㅊ": "c", "ㅍ": "v", "ㅠ": "b", "ㅜ": "n", "ㅡ": "m",
  "ㅃ": "shift-q", "ㅉ": "shift-w", "ㄸ": "shift-e", "ㄲ": "shift-r", "ㅆ": "shift-t", "ㅒ": "shift-o", "ㅖ": "shift-p" };
// Shifted punctuation can arrive either way; fold to one spelling.
const ALIAS = { "shift-\\": "|", "shift-[": "{", "shift-]": "}", "shift-/": "?", "minus": "-",
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
// The pickers are .zshrc functions (_pick_dir, c), so zsh -i.
async function popup(script) {
  const r = await exec("hc", ["run", "--bg", "--rm", "--json", "--cwd", home(), "--", "zsh", "-ic", script]);
  openOverlay({ kind: "dialog", width: 0.6, height: 0.6, layout: { type: "block", content: { terminal: JSON.parse(r.stdout).address } } });
}

// [key, label, action(focusedAtOpen), async: keep this popup until the action resolves]
const BINDS = [
  ["h", "←", () => run("pane.go", { direction: "left" })],
  ["j", "↓", () => run("pane.go", { direction: "down" })],
  ["k", "↑", () => run("pane.go", { direction: "up" })],
  ["l", "→", () => run("pane.go", { direction: "right" })],
  [";", "last pane", () => { const p = shared("prefix.last"); if (p) run("pane.focus", { pane: p }); }],
  ["tab", "next pane", (f) => cycle(f, 1)],
  ["shift-tab", "prev pane", (f) => cycle(f, -1)],
  ["shift-h", "swap ←", () => run("pane.swap", { direction: "left" })],
  ["shift-k", "swap ↑", () => run("pane.swap", { direction: "up" })],
  ["shift-l", "swap →", () => run("pane.swap", { direction: "right" })],
  // prefix+shift+j / shift+c as in the TUI. herdr-app do: the picker's terminal can't split the pane itself.
  ["shift-j", "repo → pane", () => popup('d=$(_pick_dir) && herdr-app do terminal.open --folder "$d" --place right >/dev/null'), true],
  ["shift-c", "repo → Zed", () => popup("c"), true],
  ["|", "split →", () => run("pane.split", { direction: "right" })],
  ["-", "split ↓", () => run("pane.split", { direction: "down" })],
  ["z", "zoom", () => run("pane.zoom")],
  ["x", "close pane", () => run("pane.close")],
  ["c", "new tab", () => run("tab.new")],
  ["shift-x", "close tab", () => run("tab.close")],
  [".", "rename tab", () => run("tab.rename")],
  ["/", "rename pane", (f) => f?.terminal && openOverlay({ mod: "pane-name", kind: "dialog", width: 420, height: 220,
    props: { terminal: f.terminal, value: terminals().find((x) => x.address === f.terminal)?.labels?.["pane.name"] ?? "" } })],
  ["n", "next agent", () => run("agent.next")],
  ["p", "prev agent", () => run("agent.prev")],
  ["shift-n", "new space", () => run("space.new")],
  ["shift-d", "close space", () => run("space.close")],
  [",", "rename space", () => run("space.rename")],
  ["{", "prev space", () => run("space.prev")],
  ["}", "next space", () => run("space.next")],
  ["shift-g", "new worktree", worktree("new", 460, 280)],
  ["o", "open worktree", worktree("open", 560, 480)],
  ["shift-o", "remove worktree", worktree("remove", 440, 260)],
  ["w", "picker", () => run("mod.open", { name: "picker" })],
  ["b", "sidebar", () => run("layout.toggle", { id: "sidebar" })],
  ["s", "settings", () => run("app.settings")],
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
          cx.spawn(async () => { try { await b[2](f); } finally { closeOverlay(id); } });
          return;
        }
        closeOverlay(id);
        if (b) b[2](f);
      })
      .size_full().p(10).gap(8).bg(t.popover).text_size(11)
      .child(h_flex().justify_between()
        .child(div().text_size(13).font_semibold().text_color(t.foreground).child("C-Space"))
        .child(div().text_color(t.dim).child("1-9 tab · ⇧1-9 space · Esc")))
      .child(h_flex().flex_wrap().gap(4).children(HINTS.map(chip)));
  }
}

// Decision Queue bar: terminals labelled deck.q=N by /deck:queue (deck plugin, hc mode).
// keys.json "ctrl-N": "queue.goN" jumps to slot N. Click a slot too.
// Layout props.status: draws the whole status line with the queue after the agent count
// (the bar is herdr-zed-status's, vl0ct/herdrZed, Apache-2.0); without it, just the queue (a floating window).

import { View, div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { run, terminals, nextCommand, theme, shared, props, spaces, agents, keys, window } from "herdr";

const CAP = 3; // deck queue_cap default
const MARK = { blocked: "!", done: "✓", working: "◐" };

function slots() {
  const by = {};
  for (const t of terminals()) {
    const n = Number.parseInt(t.labels?.["deck.q"], 10);
    if (n > 0 && t.state === "live") by[n] = t;
  }
  return by;
}

const go = (t) => t && run("agent.focus", { terminal: t.address });

// The palette key as bound ("⌘⇧P  commands"), or just "commands".
function paletteHint() {
  const mac = window()?.platform === "macos";
  const mod = { cmd: mac ? "⌘" : "Ctrl+", ctrl: mac ? "⌃" : "Ctrl+", shift: mac ? "⇧" : "Shift+", alt: mac ? "⌥" : "Alt+", option: mac ? "⌥" : "Alt+" };
  const b = keys().find((k) => k.section === "global" && k.action === "app.palette");
  const parts = b && b.keys.endsWith("--") ? [...b.keys.slice(0, -2).split("-"), "-"] : b?.keys.split("-");
  const key = parts && parts.map((p) => mod[p.toLowerCase()] ?? p.toUpperCase()).join("");
  return key ? `${key}  commands` : "commands";
}

export default class Queue extends View {
  init(_props, cx) {
    cx.spawn(async () => {
      for (;;) {
        const c = await nextCommand();
        const m = /^go(\d)$/.exec(c);
        if (m) go(slots()[Number(m[1])]);
        // "spaceN": space N as the spaces-num sidebar numbers it. This window is always shown, so keys reach it.
        const s = /^space(\d)$/.exec(c);
        if (s) { const id = shared("spaces.order")?.[Number(s[1]) - 1]; run("space.select", id ? { id } : { index: Number(s[1]) }); }
      }
    });
  }

  render(cx) {
    const t = theme();
    const by = slots();
    const max = Math.max(CAP, ...Object.keys(by).map(Number));
    const color = { blocked: t.blocked, done: t.done, working: t.working };
    const cells = [];
    for (let n = 1; n <= max; n++) {
      const a = by[n];
      cells.push(
        h_flex().id(`q${n}`).gap(4).px(6).h(18).items_center().rounded(4)
          .bg(a ? t.raised : t.surface).cursor_pointer().hover((s) => s.bg(t.hover))
          .on_click(() => go(a))
          .child(div().font_semibold().text_color(a ? color[a.status] ?? t.idle : t.dim).child(`${n} ${a ? MARK[a.status] ?? "○" : "·"}`))
          .when(Boolean(a), (el) => el.child(div().text_color(t.muted).truncate().max_w(180).child(a.labels?.where ?? a.address))),
      );
    }
    const queue = [div().text_color(t.muted).child("Decision Queue"), ...cells];
    if (!props()?.status) return h_flex().id("root").size_full().px(8).gap(6).items_center().bg(t.chrome).text_size(11).children(queue);

    const space = spaces().find((s) => s.active), list = agents();
    const needs = list.filter((a) => a.status === "blocked").length;
    const label = (icon, text) => h_flex().gap(6).items_center().child(svg(`mods/workspace-chrome/${icon}.svg`).size(13)).child(text);
    return h_flex().id("root").size_full().px(14).gap(16).items_center().bg(t.chrome).text_size(11.8).text_color(t.muted)
      .child(label(space?.machine ? "server" : "monitor", space?.machine ?? "This computer"))
      .when(Boolean(space?.branch), (el) => el.child(label("branch", space.branch)))
      .child(h_flex().gap(6).items_center().child(div().size(6).rounded(3).bg(t.dim)).child(`${list.length} agents`)
        .when(needs > 0, (el) => el.child(div().text_color(t.blocked).child(`· ${needs} needs you`))))
      .child(h_flex().gap(6).items_center().text_size(11).children(queue))
      .child(div().flex_1())
      .child(div().id("palette").text_color(t.dim).on_click(() => run("app.palette")).child(paletteHint()));
  }
}

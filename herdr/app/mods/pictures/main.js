// Pictures: a viewer over the terminals for pictures from Claude Code answers. App terminals can't draw Kitty
// graphics yet, so the deck plugin (bin/panel.mjs) copies each picture to ~/.config/herdr-app/pictures/ with an
// index.json, and its picture button sends "tabs-num.pictures", which opens this as a dialog
// (or the palette's mod.open pictures). ←/→ step; ⌘-scroll, pinch or +/− zoom; drag or scroll pans;
// double-click 2× / fit; 0 fits; Esc closes.
// TODO: drop once app terminals draw images (herdr-app #793).

import { View, div, image } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { appHome, exec, readTextFile, watchFolder, theme, props, closeOverlay } from "herdr";

const DIR = () => `${appHome()}/pictures`;
const ZOOM_MAX = 8;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export default class Pictures extends View {
  init(_props, cx) {
    this.items = []; this.current = null; this.seen = null;
    this.room = { width: 800, height: 600 };
    this.reset();
    this.handle = cx.focus_handle();
    this.handle.focus();
    cx.timer.after(50, () => this.handle.focus());
    this.load(cx);
    cx.spawn(async (cx) => {
      try { for (;;) { await watchFolder(DIR()); this.load(cx); } } catch { /* no folder yet */ }
    });
  }

  reset() { this.zoom = 1; this.pan = { x: 0, y: 0 }; this.drag = null; }

  load(cx) {
    cx.spawn(async (cx) => {
      try {
        const d = JSON.parse((await readTextFile(`${DIR()}/index.json`)) ?? "{}");
        this.items = d.items ?? [];
        // A new "current" from deck (a new picture, or its button) wins; otherwise keep what was picked here.
        if (d.current && d.current !== this.seen) { this.current = d.current; this.seen = d.current; this.reset(); }
      } catch { /* half-written index: the next change reloads */ }
      cx.notify();
    });
  }

  pick(k) { const it = this.items[k]; if (it && it.key !== this.current) { this.current = it.key; this.reset(); } }

  // Zoom by f around `at` (a point in the view; default its middle), between fit (1) and ZOOM_MAX.
  zoomBy(f, at) {
    const z = clamp(this.zoom * f, 1, ZOOM_MAX), r = z / this.zoom;
    const p = at ? { x: at.x - this.room.width / 2, y: at.y - this.room.height / 2 } : { x: 0, y: 0 };
    this.pan = { x: p.x - (p.x - this.pan.x) * r, y: p.y - (p.y - this.pan.y) * r };
    this.zoom = z;
  }

  key(k, i) {
    if (k === "left" || k === "h") this.pick(i - 1);
    else if (k === "right" || k === "l") this.pick(i + 1);
    else if (k === "=" || k === "+" || k === "shift-=") this.zoomBy(1.25);
    else if (k === "-") this.zoomBy(1 / 1.25);
    else if (k === "0") this.reset();
    else if (k === "escape") closeOverlay(props().overlay);
    else return false;
    return true;
  }

  render(cx) {
    const t = theme();
    const n = this.items.length, i = Math.max(0, this.items.findIndex((x) => x.key === this.current)), it = this.items[i];
    const btn = (id, label, onClick) => div().id(id).w(26).h(26).rounded(5).flex().items_center().justify_center().cursor_pointer()
      .text_color(t.muted).hover((s) => s.bg(t.hover).text_color(t.foreground))
      .on_click((_e, cx) => { onClick(); cx.notify(); }).child(label);
    const root = v_flex().id("root").size_full().bg(t.chrome).text_color(t.foreground).p(12).gap(8)
      .track_focus(this.handle)
      .on_key_down((e, cx) => { if (this.key(e.keystroke, i)) { cx.stop_propagation(); cx.notify(); } });
    if (!it) return root.child(div().p(14).text_color(t.muted).child("아직 그림이 없다 — Claude 답에 그림이 나오면 여기 쌓인다. (Esc 닫기)"));

    // Fit the view (never past the PNG's own pixels), times the zoom; the picture can't be dragged past its overhang.
    const k = Math.min(1, this.room.width / it.width, this.room.height / it.height) * this.zoom;
    const w = it.width * k, h = it.height * k;
    const mx = Math.max(0, (w - this.room.width) / 2), my = Math.max(0, (h - this.room.height) / 2);
    this.pan = { x: clamp(this.pan.x, -mx, mx), y: clamp(this.pan.y, -my, my) };
    const file = `${appHome()}/${it.file}`;
    return root
      .child(h_flex().flex_none().gap(6).items_center()
        .child(div().flex_1().min_w(0).truncate().text_size(13).font_semibold().child(it.title || "그림"))
        .child(div().flex_none().text_size(11).text_color(t.dim).child(`${i + 1} / ${n} · ${it.label ?? ""} · ${Math.round(this.zoom * 100)}%`))
        .child(btn("prev", "‹", () => this.pick(i - 1)))
        .child(btn("next", "›", () => this.pick(i + 1)))
        .child(btn("out", "−", () => this.zoomBy(1 / 1.25)))
        .child(btn("in", "+", () => this.zoomBy(1.25)))
        .child(btn("open", "↗", () => exec("open", [file])))
        .child(btn("close", "✕", () => closeOverlay(props().overlay))))
      .child(div().id("view").flex_1().min_h(0).relative().overflow_hidden().rounded(4)
        .when(this.zoom > 1, (el) => (this.drag ? el.cursor_grabbing() : el.cursor_grab()))
        .on_size_change((size, cx) => { this.room = size; cx.notify(); })
        .on_scroll_wheel((e, cx) => {
          if (e.modifiers?.platform || e.modifiers?.control) this.zoomBy(Math.exp(-e.delta.y / 200), e.local_position);
          else this.pan = { x: this.pan.x + e.delta.x, y: this.pan.y + e.delta.y };
          cx.notify();
        })
        .on_pinch((e, cx) => { this.zoomBy(1 + e.delta, e.local_position); cx.notify(); })
        .on_mouse_down("left", (e, cx) => {
          if (e.click_count === 2) { if (this.zoom > 1) this.reset(); else this.zoomBy(2, e.local_position); }
          else this.drag = { x: e.position.x - this.pan.x, y: e.position.y - this.pan.y };
          cx.notify();
        })
        .on_mouse_up("left", (_e, cx) => { this.drag = null; cx.notify(); })
        .on_hover((hovered) => { if (!hovered) this.drag = null; })
        .on_mouse_move((e, cx) => { if (this.drag) { this.pan = { x: e.position.x - this.drag.x, y: e.position.y - this.drag.y }; cx.notify(); } })
        .child(image(it.file).absolute().left((this.room.width - w) / 2 + this.pan.x).top((this.room.height - h) / 2 + this.pan.y).w(w).h(h)));
  }
}

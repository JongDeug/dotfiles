import { View, div, image, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { theme, run, props, window, shared, setShared, updates, layout } from "herdr";

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

// Clone of the shipped workspace-chrome: folding the sidebar keeps the names (slim) instead of a bare rail.
// The sidebar goes by its width, not a flag: dragging its edge narrows it too. Under 80 px it's the rail
// (icons, numbers), under 200 slim (names, no extras). Keep these in step with spaces-num and agents-slim.
const width = () => find(layout(), "sidebar")?.size?.px ?? Infinity;
const narrow = () => width() < 80;
const folded = () => width() < 200;
const SLIM_PX = 150;
// macOS keeps its traffic lights in the top-left 76 px; under 108 the toggle no longer fits beside them
// (agents-slim's » unfolds instead).
const lights = () => window()?.platform === "macos" && !window()?.fullscreen;
const toggleFits = () => !lights() || width() >= 108;

// To slim, or back to the width it had.
function toggleSidebar() {
  if (!folded()) setShared("sidebar.width", width());
  // Mods edited before the rail went by width still read the flag.
  setShared("sidebar.collapsed", !folded());
  run("layout.resize", { id: "sidebar", px: folded() ? (shared("sidebar.width") ?? 268) : SLIM_PX });
}

export default class WorkspaceChrome extends View {
  button(id, label, action) {
    const t = theme();
    return div().id(id).size(26).flex_none().flex().items_center().justify_center().rounded(6).text_color(t.muted).hover(s => s.bg(t.hover).text_color(t.foreground))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation()).on_click(action).child(label);
  }
  render() {
    const t = theme();
    const collapsed = narrow();
    if (props()?.footer) {
      const row = (id, icon, label, dim, action) => h_flex().id(id).h(28).px(8).gap(9).items_center().rounded(8)
        .when(collapsed, el => el.relative().w(32).px(0).justify_center().tooltip(label))
        .text_color(dim ? t.dim : t.muted).hover(s => s.bg(t.hover).text_color(t.foreground)).cursor_pointer()
        .on_click(action).child(svg(`mods/chrome-slim/${icon}.svg`).size(14))
        .when(!collapsed, el => el.child(div().min_w(0).truncate().child(label)));
      const ready = div().size(6).rounded_full().bg(t.accent);
      return v_flex().size_full().bg(t.chrome).border_t(1).border_color(t.border).px(folded() ? 4 : 8).pt(4).pb(8).text_size(13)
        .when(collapsed, el => el.px(0).items_center())
        .child(row("settings", "settings", "Settings", false, () => run("app.settings"))
          .when(Boolean(updates().app.ready), el => el.child(collapsed ? ready.absolute().top(5).right(6) : ready)))
        .when(!folded(), el => el.child(row("machine", "plus", "Add machine", true, () => run("mod.open", { name: "machine-add" }))));
    }
    const slim = !collapsed && folded();
    return h_flex().size_full().bg(t.chrome).pl(collapsed ? 6 : 14).pr(10).gap(4).items_center().text_size(13.5)
      .when(window()?.platform === "macos" && !window()?.fullscreen && !collapsed, el => el.pl(76))
      .when(!collapsed, el => el.child(h_flex().flex_1().gap(8).items_center()
        .when(!slim || width() >= 140, el => el.child(image("frame/welcome/herdr.png").size(20).rounded(5)))
        .when(!slim, el => el.child(div().font_semibold().text_color(t.foreground).child("Herdr")))))
      .when(!folded(), el => el.child(this.button("search", svg("mods/chrome-slim/search.svg").size(15), () => run("mod.open", { name: "picker" }))))
      // On the macOS rail the traffic lights fill the row; the agents list's » unfolds it.
      .when(slim, el => el.pr(4))
      .when(collapsed ? !lights() : toggleFits(), el => el.child(this.button("sidebar-toggle", svg("mods/chrome-slim/sidebar.svg").size(15), toggleSidebar)));
  }
}

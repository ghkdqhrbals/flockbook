import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { agentName, currentAgent } from "./state.js";
import { statusMark } from "./top.js";

export function agentList(t, rows, onPick) {
  const selected = currentAgent()?.address;
  return v_flex().id("agent-list").flex_1().min_h(0).overflow_y_scrollbar()
    .max_h(Math.max(32, rows.length * 48))
    .when(!rows.length, (el) => el.child(div().p(8).text_size(12).text_color(t.muted).child("No live agents.")))
    .children(rows.map((a) => {
      const detail = a.parent ? `Child of ${a.parent}` : [a.space_name || "Outside workspaces", a.hasChildren ? "Parent" : ""].filter(Boolean).join(" · ");
      const address = div().font_family("Menlo").text_size(13).text_color(t.foreground).child(a.address);
      const name = a.name || agentName(a);
      return h_flex().id(`agent-${a.address}`).flex_none().py(6).pl(8 + Math.min(a.depth, 4) * 8).pr(8)
        .gap(8).items_center().rounded(6).when(a.address === selected, (el) => el.bg(t.selected))
        .hover((el) => el.bg(t.hover)).cursor_pointer().on_click(() => onPick(a.address))
        .child(statusMark(a.status, t))
        .child(v_flex().flex_1().min_w(0)
          .child(div().truncate().text_size(13).text_color(t.foreground).child(a.parent ? `↳ ${name}` : name))
          .child(address))
        .tooltip(detail);
    }));
}

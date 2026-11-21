// agents() lists pane-backed agents. hc children live in terminals(), sometimes on
// another machine. Use the full addresses: two machines can both have a t1.
import { agents, panes, spaces, terminals } from "herdr";

export function agentTree() {
  const anchors = new Map(agents().map((a) => [a.address, a]));
  const live = terminals().filter((t) => t.state === "live");
  const terms = new Map(live.map((t) => [t.address, t]));
  const children = new Map();
  for (const t of live) {
    if (!t.parent) continue;
    if (!children.has(t.parent)) children.set(t.parent, []);
    children.get(t.parent).push(t);
  }

  // A parent may have stopped reporting agent status. Its pane still locates
  // the family. A kept child owns its own tab, even if its parent is elsewhere.
  const tabs = new Map(spaces().flatMap((s) => (s.tabs ?? []).map((tab) => [tab.id, { tab, space: s }])));
  for (const p of panes()) {
    const t = terms.get(p.terminal), home = tabs.get(p.tab);
    if (!t || !home || anchors.has(p.terminal) || !(children.has(t.address) || t.parent || t.status || t.program?.agent)) continue;
    anchors.set(t.address, { ...t, pane: p.pane, tab: p.tab, tab_name: home.tab.name,
      space: home.space.id, space_name: home.space.name, app: p.app, program: p.program ?? t.program });
  }

  const rows = [], seen = new Set();
  function visit(a, depth, anchorPane) {
    if (seen.has(a.address)) return;
    seen.add(a.address);
    const terminal = terms.get(a.address);
    const row = { ...a, depth, parent: terminal?.parent ?? null, anchorPane: a.pane || anchorPane,
      name: terminal?.name || a.name, hasChildren: children.has(a.address) };
    rows.push(row);
    for (const child of children.get(a.address) ?? []) {
      visit(anchors.get(child.address) ?? { ...child, pane: null, tab: a.tab, tab_name: null,
        space: a.space, space_name: a.space_name, app: child.report?.app }, depth + 1, row.anchorPane);
    }
  }
  // Families started directly by hc can have no Herdr pane at all.
  const candidates = new Map(anchors);
  for (const t of live) {
    if (!anchors.has(t.address) && (t.parent || children.has(t.address) || t.status || t.program?.agent)) {
      candidates.set(t.address, { ...t, app: t.report?.app, tab: null, space: null, pane: null });
    }
  }
  for (const a of candidates.values()) {
    if (!candidates.has(terms.get(a.address)?.parent)) visit(a, 0, null);
  }
  // Even malformed cyclic parent data must not hide a terminal or repeat it.
  for (const a of candidates.values()) visit(a, 0, null);
  return rows;
}

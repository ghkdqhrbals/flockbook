import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { SideView } from "../mods/flockbook/side.js";
import { command, TopView } from "../mods/flockbook/top.js";
import { currentAgent, currentTerminal, showAgent, shownScreen } from "../mods/flockbook/state.js";
import { act } from "../mods/flockbook/menu.js";
import { fake, log, reset } from "./stub/herdr.mjs";
import { byId, textOf } from "./stub/ui.mjs";
import { fakeCx } from "./fake-cx.mjs";
import { agent, space } from "./fixtures.mjs";

const tab = (id, active, panes = 1) => ({ id, name: id, named: true, active, panes });
const pane = (id, address, tab, focused = false) => ({ pane: id, terminal: address, tab, focused });
const term = (address, parent, extra) => ({ address, parent, state: "live", ...extra });
const click = (el, id) => byId(el, id)._h.on_click({}, fakeCx());
beforeEach(() => {
  reset();
  fake.spaces = [space("s", { tabs: [tab("shell", true), tab("work", false, 2)] })];
  fake.panes = [pane("shell-pane", "t0", "shell", true), pane("parent-pane", "t1", "work"), pane("kept-pane", "t3", "work")];
  fake.agents = [agent("t3", "idle", { tab: "work", space: "s", pane: "kept-pane" }),
    agent("t1", "working", { tab: "work", space: "s", pane: "parent-pane" })];
  fake.terminals = [term("t1", null), term("t2", "t1", { name: "Review" }), term("t3", "t1"),
    term("box/t2", "t2", { name: "Remote reviewer" }), term("t4", "t1", { state: "exited" })];
});

test("Agents opens the live family tree; rows carry full addresses, including nested and kept children", () => {
  const top = new TopView(fakeCx());
  click(top.render(), "agents");
  assert.deepEqual(log.run, [["layout.show", { id: "sidebar" }]]);
  command("agents");
  assert.equal(log.run.length, 1, "opening the already visible sidebar keeps it open");
  assert.equal(log.overlays.length, 0);
  assert.equal(byId(top.render(), "agents"), null, "the open sidebar owns the list");
  const el = new SideView(fakeCx()).render();
  assert.deepEqual(log.order, ["t1", "t2", "box/t2", "t3"]);
  assert.equal(byId(el, "agent-list").kids.length, 4);
  assert.match(textOf(byId(el, "agent-t1")), /t1/);
  assert.match(textOf(byId(el, "agent-t2")), /↳ Review t2/);
  assert.match(textOf(byId(el, "agent-box/t2")), /↳ Remote reviewer box\/t2/);
  assert.equal(byId(el, "agent-t4"), null);
  log.run = [];
  click(el, "agent-box/t2");
  assert.deepEqual(log.closed ?? [], []);
  assert.deepEqual(log.run, [["tab.select", { id: "work" }], ["layout.select", { stack: "screen", child: "chat" }]]);
  fake.spaces[0].tabs.forEach((t) => { t.active = t.id === "work"; });
  top.sync();
  assert.equal(shownScreen(), "chat", "a split tab cannot overwrite an explicit child selection");
  assert.equal(currentAgent().address, "box/t2");
  assert.equal(currentTerminal().address, "box/t2");
  command("terminal");
  assert.deepEqual(log.overlays.at(-1).layout.children.at(-1).content, { terminal: "box/t2" });
});

for (const floating of [false, true]) {
  test(`the ${floating ? "floating" : "docked"} sidebar shows subagent IDs and opens the clicked child's chat`, () => {
    fake.props = floating ? { view: "side", peek: true, overlay: "peek" } : { view: "side" };
    const sidebar = new SideView(fakeCx()).render();
    const list = byId(sidebar, "agent-list");
    assert.deepEqual(list.kids.map((row) => row._a.id), ["agent-t1", "agent-t2", "agent-box/t2", "agent-t3"]);
    assert.match(textOf(byId(list, "agent-box/t2")), /↳ Remote reviewer box\/t2/);
    click(list, "agent-box/t2");
    assert.deepEqual(log.closed ?? [], floating ? ["peek"] : []);
    fake.spaces[0].tabs.forEach((t) => { t.active = t.id === "work"; });
    assert.equal(currentAgent().address, "box/t2");
    assert.equal(shownScreen(), "chat");
  });
}

test("standalone hc families open against their own address without adopting them or changing tabs", () => {
  fake.terminals.push(term("t7", null, { status: "working" }), term("t8", "t7"), term("t9", null));
  command("agents");
  assert.deepEqual(log.run, [["layout.show", { id: "sidebar" }]]);
  assert.equal(log.overlays.length, 0);
  log.run = [];
  const el = new SideView(fakeCx()).render();
  assert.ok(byId(el, "agent-t7"));
  assert.equal(byId(el, "agent-t9"), null, "unrelated standalone shells are outside the directory");
  click(el, "agent-t8");
  assert.equal(currentAgent().address, "t8");
  assert.deepEqual(log.run, [["layout.select", { stack: "screen", child: "chat" }]]);
  new TopView(fakeCx()).sync();
  assert.equal(shownScreen(), "chat");
  fake.spaces[0].tabs.forEach((t) => { t.active = t.id === "work"; });
  assert.notEqual(currentAgent()?.address, "t8", "the selection belongs to the tab where it was opened");
});

test("the toolbar and command create horizontal native panes on either side of the selected conversation", () => {
  fake.spaces[0].tabs.forEach((t) => { t.active = t.id === "work"; });
  showAgent("t1");
  const top = new TopView(fakeCx());
  top.sync();
  click(top.render(), "split-menu");
  const items = log.overlays.at(-1).props.items;
  assert.deepEqual(items.map((i) => i.label), ["Split left", "Split right"]);
  log.run = [];
  act(items[0]);
  assert.deepEqual(log.run, [["pane.split", { pane: "parent-pane", direction: "right" }]]);
  top.sync();
  assert.equal(shownScreen(), "chat", "keep the chat until the split arrives");
  fake.panes.push(pane("new-pane", "new-shell", "work", true));
  fake.spaces[0].tabs[1].panes++;
  top.sync();
  assert.deepEqual(log.run.slice(1), [["pane.swap", { pane: "new-pane", target: "parent-pane" }],
    ["layout.select", { stack: "screen", child: "tab" }]]);
  assert.equal(currentAgent().address, "t1");
  top.sync();
  assert.equal(log.run.filter(([name]) => name === "pane.swap").length, 1);
  click(top.render(), "show-chat");
  assert.equal(shownScreen(), "chat");
  log.run = [];
  command("split-right");
  assert.deepEqual(log.run, [["pane.split", { pane: "parent-pane", direction: "right" }]]);
  fake.panes.push(pane("right", "right-shell", "work", true));
  fake.spaces[0].tabs[1].panes++;
  top.sync();
  assert.ok(!log.run.some(([name]) => name === "pane.swap"));
});

test("Split left keeps an unplaced child as the new pane and swaps only after its address appears", () => {
  fake.spaces[0].tabs.forEach((t) => { t.active = t.id === "work"; });
  showAgent("t2");
  const top = new TopView(fakeCx());
  top.sync();
  log.run = [];
  command("split-left");
  assert.deepEqual(log.run, [["pane.focus", { pane: "parent-pane" }], ["terminal.keep", { terminal: "t2", place: "right" }]]);
  top.sync();
  assert.equal(shownScreen(), "chat");
  fake.panes.push(pane("child-pane", "t2", "work", true));
  fake.spaces[0].tabs[1].panes++;
  top.sync();
  assert.deepEqual(log.run.at(-2), ["pane.swap", { pane: "child-pane", target: "parent-pane" }]);
  assert.equal(currentAgent().address, "t2");
});

test("native pane view splits the working pane; changing tabs cancels an outstanding left swap", () => {
  fake.shared["flockbook.screen"] = "tab";
  const top = new TopView(fakeCx());
  command("split-left");
  assert.deepEqual(log.run, [["pane.split", { pane: "shell-pane", direction: "right" }]]);
  fake.spaces[0].tabs.forEach((t) => { t.active = t.id === "work"; });
  fake.panes.push(pane("other", "t11", "work", true));
  top.sync();
  fake.spaces[0].tabs.forEach((t) => { t.active = t.id === "shell"; });
  fake.panes.push(pane("late", "t12", "shell", true));
  top.sync();
  assert.ok(!log.run.some(([name]) => name === "pane.swap"));
});

test("a left split never reorders old panes when concurrent layout edits make the new shell ambiguous", () => {
  const top = new TopView(fakeCx());
  command("split-left");
  fake.panes.push(pane("added-1", "t5", "shell", true), pane("added-2", "t6", "shell"));
  fake.spaces[0].tabs[0].panes += 2;
  top.sync();
  assert.ok(!log.run.some(([name]) => name === "pane.swap"));
});

test("the child's transcript and reply draft survive the round trip through real pane mode", async () => {
  fake.spaces[0].tabs.forEach((t) => { t.active = t.id === "work"; });
  showAgent("t2");
  fake.exec = (_cmd, args) => {
    if (args[0] !== "feed") return { code: 1, stdout: "", stderr: "" };
    const address = args[args.indexOf("--terminal") + 1];
    const lines = [{ type: "header", protocol: 1, command: "feed" },
      { type: "log", agent: "codex", path: "/logs/child", cursor: "1" },
      { type: "splice", at: 0, count: 1 }, { type: "row", k: "user", id: "u", text: address },
      { type: "end", ok: true }];
    return { code: 0, stdout: lines.map((l) => JSON.stringify(l)).join("\n"), stderr: "" };
  };
  const cx = fakeCx();
  const { ChatView } = await import("../mods/flockbook/chat.js");
  const chat = new ChatView(cx);
  await cx.settle();
  chat.render(cx);
  assert.equal(chat.feed().rows[0].text, "t2");
  assert.equal(chat.composer.address, "t2");
  chat.composer.setText("continue reviewing");
  command("split-right");
  fake.panes.push(pane("kept-t2", "t2", "work", true));
  fake.spaces[0].tabs[1].panes++;
  const top = new TopView(cx);
  top.sync();
  assert.equal(shownScreen(), "tab");
  click(top.render(), "show-chat");
  await chat.tick(cx);
  chat.render(cx);
  assert.equal(chat.composer.address, "t2");
  assert.equal(chat.composer.input.value(), "continue reviewing");
  assert.equal(chat.feed().rows[0].text, "t2");
});

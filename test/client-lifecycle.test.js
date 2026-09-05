import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

// No real devices are opened: these fakes let permission prompts resolve after exit.
class FakeSocket {
  static OPEN = 1;
  static instances = [];
  readyState = 1;
  listeners = new Map();
  sent = [];
  constructor() { FakeSocket.instances.push(this); }
  addEventListener(type, callback) { this.listeners.set(type, callback); }
  send(raw) { this.sent.push(JSON.parse(raw)); }
  close() { this.readyState = 3; return this.emit("close"); }
  emit(type, event) { return this.listeners.get(type)?.(event); }
  message(data) { return this.emit("message", { data: JSON.stringify(data) }); }
}

function element() {
  const attributes = new Map();
  return {
    value: "", hidden: false, dataset: {}, classList: { add() {}, toggle() {} },
    append() {}, replaceChildren() {}, remove() {}, close() {}, addEventListener() {},
    querySelector: () => element(),
    setAttribute: (key, value) => attributes.set(key, value),
    getAttribute: (key) => attributes.get(key),
  };
}

function environment() {
  let resolveCapture;
  let requests = 0;
  const capture = () => {
    requests += 1;
    return new Promise((resolve) => { resolveCapture = resolve; });
  };
  const track = { enabled: true, stops: 0, stop() { this.stops += 1; } };
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
  const nodes = new Map();
  const context = vm.createContext({
    WebSocket: FakeSocket, URL, console,
    localStorage: { getItem: () => "", setItem() {} },
    location: { protocol: "http:", host: "localhost:4173", href: "http://localhost:4173", hostname: "localhost" },
    navigator: { mediaDevices: { getUserMedia: capture, getDisplayMedia: capture } },
    window: { isSecureContext: true, setTimeout: () => 1, clearTimeout() {}, addEventListener() {}, location: { protocol: "http:", hostname: "localhost" } },
    document: {
      querySelector(selector) {
        if (!nodes.has(selector)) nodes.set(selector, element());
        return nodes.get(selector);
      },
      querySelectorAll: () => [], createElement: element,
      getElementById: () => null, documentElement: { dataset: {} },
    },
  });
  return { context, track, nodes, requests: () => requests, resolve: () => resolveCapture(stream) };
}

const self = { id: "peer-a", name: "成员", media: { audio: false, camera: false, screen: false } };
const room = { id: "room-a", name: "会议", project: "DSH", hostId: self.id, participants: [self], context: [], agent: { status: "idle" } };

async function standalone(env) {
  vm.runInContext(await readFile(new URL("../src/client/app.js", import.meta.url), "utf8"), env.context);
  const socket = FakeSocket.instances.at(-1);
  await socket.message({ type: "session:ready", self, rooms: [] });
  await socket.message({ type: "room:state", room });
  return {
    socket,
    audio: () => vm.runInContext("toggleAudio()", env.context),
    isLobby: () => !env.nodes.get("#lobby").hidden,
  };
}

async function native(env) {
  // Execute the actual workspace with a minimal state/effect harness. The extra
  // export exists only inside this VM so lifecycle regressions need no DSH host.
  const values = [];
  const effects = [];
  let cursor = 0;
  let initial = true;
  const React = {
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity) }),
    Fragment: Symbol("Fragment"),
    useState(init) {
      const index = cursor++;
      if (!(index in values)) values[index] = typeof init === "function" ? init() : init;
      return [values[index], (value) => { values[index] = typeof value === "function" ? value(values[index]) : value; }];
    },
    useRef(init) {
      const index = cursor++;
      if (!(index in values)) values[index] = { current: init };
      return values[index];
    },
    useCallback: (callback) => callback,
    useEffect(effect) { if (initial) effects.push(effect); },
  };
  let definition;
  env.context.window.__ModuleLoader__ = { load(value) { definition = value; } };
  const source = await readFile(new URL("../lib/client.js", import.meta.url), "utf8");
  vm.runInContext(source.replace("exports.apply = apply;", "exports.workspace = MeetingWorkspace; exports.apply = apply;"), env.context);
  const { workspace } = definition.factory(() => React);
  const render = () => { cursor = 0; return workspace({ onClose() {} }); };
  render();
  initial = false;
  const cleanups = effects.map((effect) => effect());
  const socket = FakeSocket.instances.at(-1);
  await socket.message({ type: "session:ready", self, rooms: [] });
  await socket.message({ type: "room:state", room });
  function find(node, text) {
    if (!node || typeof node !== "object") return null;
    if (node.type === "button" && node.children.includes(text)) return node;
    return node.children?.map((child) => find(child, text)).find(Boolean);
  }
  return {
    socket,
    audio: () => find(render(), "麦克风").props.onClick(),
    isLobby: () => Boolean(find(render(), "创建协作")),
    unmount: () => cleanups.forEach((cleanup) => cleanup?.()),
  };
}

for (const [name, load] of [["standalone", standalone], ["native", native]]) {
  for (const action of ["leave", "disconnect", ...(name === "native" ? ["unmount"] : [])]) {
    test(`${name} stops late permission results after ${action} and suppresses duplicate capture`, async () => {
      const env = environment();
      const client = await load(env);
      const pending = client.audio();
      await client.audio();
      assert.equal(env.requests(), 1);
      if (action === "leave") await client.socket.message({ type: "room:left" });
      else if (action === "disconnect") await client.socket.close();
      else client.unmount();
      env.resolve();
      await pending;
      assert.ok(env.track.stops > 0);
      assert.equal(client.socket.sent.some((message) => message.type === "media:update"), false);
      if (action !== "unmount") assert.equal(client.isLobby(), true);
    });
  }

  test(`${name} releases active microphone on exit`, async () => {
    const env = environment();
    const client = await load(env);
    const pending = client.audio();
    env.resolve();
    await pending;
    assert.equal(client.socket.sent.at(-1).media.audio, true);
    await client.socket.message({ type: "room:left" });
    assert.ok(env.track.stops > 0);
    assert.equal(client.isLobby(), true);
  });
}

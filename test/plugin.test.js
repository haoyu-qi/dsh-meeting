import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { apply, normalizeConfig } from "../src/plugin/index.js";

test("normalizes DSH Host config and rejects invalid ports", () => {
  assert.deepEqual(normalizeConfig(), { host: "0.0.0.0", port: 4173 });
  assert.deepEqual(normalizeConfig({ host: " 127.0.0.1 ", port: "4180" }), { host: "127.0.0.1", port: 4180 });
  assert.throws(() => normalizeConfig({ port: 70000 }), /0-65535/);
});

test("owns the meeting server through the Cordis effect lifecycle", async () => {
  let dispose;
  await apply({
    async effect(setup, label) {
      assert.equal(label, "dsh-meeting-host");
      dispose = await setup();
    },
  }, { host: "127.0.0.1", port: 0 });
  assert.equal(typeof dispose, "function");
  await dispose();
});

test("browser bundle registers the native DSH meeting workspace", async () => {
  const source = await readFile(new URL("../lib/client.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /<iframe|h\("iframe"/);
  assert.match(source, /dshm-native-shell/);
  let definition;
  vm.runInNewContext(source, {
    window: { __ModuleLoader__: { load(value) { definition = value; } } },
    URL,
    Symbol,
    Object,
  });
  assert.equal(definition.id, "dsh-meeting");

  const React = { createElement: (...args) => args, Fragment: Symbol("Fragment"), useState: () => [false, () => {}] };
  const plugin = definition.factory((name) => {
    assert.equal(name, "react");
    return React;
  });
  assert.deepEqual([...plugin.inject], ["slots"]);

  let registration;
  plugin.apply({ slots: {
    inject(name, callback) {
      assert.equal(name, "shell.overlay");
      callback();
    },
    register(meta, render) {
      registration = { meta, render };
    },
  } });
  assert.equal(registration.meta.id, "dsh-meeting-native");
  assert.equal(typeof registration.render, "function");
});

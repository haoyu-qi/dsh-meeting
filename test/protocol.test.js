import test from "node:test";
import assert from "node:assert/strict";
import { cleanText, parseClientMessage, ProtocolError, requireText } from "../src/host/protocol.js";

test("parseClientMessage accepts supported messages", () => {
  assert.deepEqual(parseClientMessage('{"type":"rooms:list"}'), { type: "rooms:list" });
});

test("parseClientMessage rejects invalid JSON and unknown types", () => {
  assert.throws(() => parseClientMessage("not-json"), ProtocolError);
  assert.throws(() => parseClientMessage('{"type":"room:delete"}'), /不支持的消息类型/);
});

test("text helpers normalize control characters and enforce required values", () => {
  assert.equal(cleanText("  需求\n  已确认\u0000  "), "需求 已确认");
  assert.equal(cleanText("abcdef", 4), "abcd");
  assert.throws(() => requireText("  ", "标题"), /标题 不能为空/);
});

test("rejects malformed media and signaling payloads before forwarding", () => {
  for (const media of [null, [], {}, { audio: "false", camera: false, screen: false }]) {
    assert.throws(() => parseClientMessage(JSON.stringify({ type: "media:update", media })), { code: "INVALID_FIELD" });
  }
  for (const payload of [null, [], {}, { description: { type: "offer" } }, { candidate: "bad" }]) {
    assert.throws(() => parseClientMessage(JSON.stringify({ type: "signal", targetId: "peer-b", payload })), { code: "INVALID_FIELD" });
  }
  for (const payload of [{ description: { type: "offer", sdp: "v=0" } }, { candidate: { candidate: "" } }]) {
    assert.deepEqual(parseClientMessage(JSON.stringify({ type: "signal", targetId: "peer-b", payload })).payload, payload);
  }
});

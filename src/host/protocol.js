export const CLIENT_MESSAGES = new Set([
  "rooms:list",
  "room:create",
  "room:join",
  "room:leave",
  "signal",
  "media:update",
  "transcript:add",
  "agent:request",
]);

export class ProtocolError extends Error {
  constructor(message, code = "BAD_MESSAGE") {
    super(message);
    this.name = "ProtocolError";
    this.code = code;
  }
}

export function parseClientMessage(raw) {
  let message;

  try {
    message = JSON.parse(raw.toString());
  } catch {
    throw new ProtocolError("消息不是有效的 JSON");
  }

  if (!message || typeof message !== "object" || Array.isArray(message)) {
    throw new ProtocolError("消息必须是对象");
  }

  if (!CLIENT_MESSAGES.has(message.type)) {
    throw new ProtocolError(`不支持的消息类型: ${String(message.type)}`);
  }

  return message;
}

export function cleanText(value, maxLength = 120) {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

export function requireText(value, field, maxLength = 120) {
  const text = cleanText(value, maxLength);
  if (!text) throw new ProtocolError(`${field} 不能为空`, "INVALID_FIELD");
  return text;
}

export function makeId(prefix = "id") {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
}

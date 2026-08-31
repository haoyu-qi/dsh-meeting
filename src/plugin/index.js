import { createMeetingServer } from "../host/server.js";

export const name = "dsh-meeting";

export function normalizeConfig(config = {}) {
  const host = typeof config.host === "string" && config.host.trim() ? config.host.trim() : "0.0.0.0";
  const port = config.port === undefined ? 4173 : Number(config.port);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new TypeError("dsh-meeting.port 必须是 0-65535 之间的整数");
  }
  return { host, port };
}

export async function apply(ctx, config = {}) {
  const { host, port } = normalizeConfig(config);
  await ctx.effect(async () => {
    const meeting = createMeetingServer();
    const info = await meeting.start(port, host);
    console.log(`[dsh-meeting] Host 已启动：${info.urls.join(" ")}`);
    return async () => {
      await meeting.stop();
      console.log("[dsh-meeting] Host 已停止");
    };
  }, "dsh-meeting-host");
}

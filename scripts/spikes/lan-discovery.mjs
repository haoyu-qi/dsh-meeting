#!/usr/bin/env node
/**
 * T0.3 Spike: LAN UDP multicast room discovery (dsh-meeting)
 *
 * - Two dgram UDP4 sockets, both join multicast group 239.255.42.99:51990
 *   (reuseAddr: true + addMembership).
 * - Sender emits a room_announce JSON every 500ms.
 * - Receiver prints the source address and payload of every datagram.
 * - Also prints: node version, IPv4 interface list, and a TCP 18990 bind
 *   test via net.createServer (closed immediately after probing).
 * - Exits by itself after ~8s (whole run kept under 10s).
 */
import dgram from 'node:dgram';
import net from 'node:net';
import os from 'node:os';

const MULTICAST_GROUP = '239.255.42.99';
const MULTICAST_PORT = 51990;
const TCP_SIGNAL_PORT = 18990;
const ANNOUNCE_INTERVAL_MS = 500;
const RUN_DURATION_MS = 8000;

function ipv4List() {
  const out = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family === 'IPv4') out.push({ name, address: a.address, internal: a.internal });
    }
  }
  return out;
}

function pickLanIp() {
  const candidates = ipv4List().filter((a) => !a.internal);
  return candidates.length > 0 ? candidates[0].address : '127.0.0.1';
}

function testTcpBind(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', (err) => resolve({ ok: false, code: err.code, message: err.message }));
    server.listen(port, '0.0.0.0', () => {
      server.close(() => resolve({ ok: true, code: null, message: 'bound 0.0.0.0 then closed' }));
    });
  });
}

async function main() {
  console.log('=== T0.3 LAN multicast discovery spike ===');
  console.log(`node: ${process.version}`);
  console.log(`os:   ${os.type()} ${os.release()} (${os.platform()} ${os.arch()})`);
  console.log(`hostname: ${os.hostname()}`);

  console.log('IPv4 interfaces:');
  for (const a of ipv4List()) {
    console.log(`  ${a.internal ? '[internal]' : '[lan     ]'} ${a.name}: ${a.address}`);
  }

  const lanIp = pickLanIp();
  console.log(`announce.host will be: ${lanIp}`);

  const tcp = await testTcpBind(TCP_SIGNAL_PORT);
  console.log(
    `TCP ${TCP_SIGNAL_PORT} bind test: ${tcp.ok ? 'PASS' : 'FAIL'} (${tcp.code ?? tcp.message})`,
  );

  // ---------- receiver ----------
  const receiver = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  const received = [];
  receiver.on('error', (err) => console.error(`[receiver] error: ${err.message}`));
  receiver.on('message', (buf, rinfo) => {
    const text = buf.toString('utf8');
    received.push({ from: `${rinfo.address}:${rinfo.port}`, text });
    console.log(`[receiver] from ${rinfo.address}:${rinfo.port} size=${buf.length} payload=${text}`);
  });
  receiver.bind(MULTICAST_PORT, () => {
    const a = receiver.address();
    console.log(`[receiver] listening on ${a.address}:${a.port}`);
    try {
      receiver.addMembership(MULTICAST_GROUP);
      console.log(`[receiver] addMembership(${MULTICAST_GROUP}) OK`);
    } catch (err) {
      console.error(`[receiver] addMembership failed: ${err.message}`);
    }
  });

  // ---------- sender ----------
  const sender = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  let sendOk = 0;
  let sendErr = 0;
  sender.on('error', (err) => {
    sendErr += 1;
    console.error(`[sender] error: ${err.message}`);
  });
  sender.bind(() => {
    const a = sender.address();
    try {
      sender.setMulticastTTL(1);
      sender.addMembership(MULTICAST_GROUP);
      console.log(`[sender] bound on ${a.address}:${a.port}, joined group, multicastTTL=1`);
    } catch (err) {
      console.error(`[sender] addMembership/setTTL failed: ${err.message}`);
    }
  });

  const announce = {
    type: 'room_announce',
    roomId: 'spike-room',
    roomName: 'T0.3 Spike',
    host: lanIp,
    port: TCP_SIGNAL_PORT,
    members: 1,
    protocolVersion: 1,
  };
  const payload = Buffer.from(JSON.stringify(announce), 'utf8');
  console.log(`announce payload (${payload.length} bytes): ${payload.toString('utf8')}`);

  const interval = setInterval(() => {
    sender.send(payload, MULTICAST_PORT, MULTICAST_GROUP, (err) => {
      if (err) {
        sendErr += 1;
        console.error(`[sender] send failed: ${err.message}`);
      } else {
        sendOk += 1;
      }
    });
  }, ANNOUNCE_INTERVAL_MS);

  setTimeout(() => {
    clearInterval(interval);
    console.log('=== spike summary ===');
    console.log(`announces sent OK: ${sendOk}, send errors: ${sendErr}`);
    console.log(`datagrams received: ${received.length}`);
    for (const r of received.slice(0, 5)) {
      console.log(`  <- ${r.from}: ${r.text}`);
    }
    console.log(`MULTICAST LOOPBACK: ${received.length > 0 ? 'PASS' : 'FAIL'}`);
    try { sender.close(); } catch {}
    try { receiver.close(); } catch {}
    // Run completed to plan; verdict is carried by the printed PASS/FAIL lines.
    process.exit(0);
  }, RUN_DURATION_MS);
}

main().catch((err) => {
  console.error(`spike crashed: ${err.stack}`);
  process.exit(2);
});

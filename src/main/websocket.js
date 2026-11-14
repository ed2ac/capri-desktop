'use strict';

// The smallest WebSocket server there is, for one thing: her browser extension (extension/), which
// keeps a connection open to her bridge so she can see and arrange your tabs when you ask. Text
// frames only, pings answered; nothing else (no extensions, no fragmentation).

const crypto = require('node:crypto');

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

// Takes over an HTTP upgrade: { send(obj), close(), on(message|close, fn) }, or null if refused.
function accept(req, socket) {
  const key = req.headers['sec-websocket-key'];
  if (!key || String(req.headers.upgrade).toLowerCase() !== 'websocket') return null;
  const acceptKey = crypto.createHash('sha1').update(key + GUID).digest('base64');
  socket.write(['HTTP/1.1 101 Switching Protocols', 'Upgrade: websocket', 'Connection: Upgrade', `Sec-WebSocket-Accept: ${acceptKey}`, '', ''].join('\r\n'));
  const handlers = { message: [], close: [] };
  let buffer = Buffer.alloc(0);
  let closed = false;

  const frame = (opcode, payload) => {
    const len = payload.length;
    const head = len < 126 ? Buffer.from([0x80 | opcode, len])
      : len < 65536 ? Buffer.from([0x80 | opcode, 126, len >> 8, len & 255])
        : Buffer.concat([Buffer.from([0x80 | opcode, 127]), (() => { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(len)); return b; })()]);
    return Buffer.concat([head, payload]);
  };
  const end = () => {
    if (closed) return;
    closed = true;
    socket.destroy();
    handlers.close.forEach((fn) => fn());
  };

  socket.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length >= 2) {
      const opcode = buffer[0] & 0x0f;
      const masked = (buffer[1] & 0x80) !== 0;
      let len = buffer[1] & 0x7f;
      let at = 2;
      if (len === 126) { if (buffer.length < 4) return; len = buffer.readUInt16BE(2); at = 4; }
      else if (len === 127) { if (buffer.length < 10) return; len = Number(buffer.readBigUInt64BE(2)); at = 10; }
      if (len > 4 * 1024 * 1024) return end(); // nothing she'd send is that big
      const need = at + (masked ? 4 : 0) + len;
      if (buffer.length < need) return;
      const mask = masked ? buffer.subarray(at, at + 4) : null;
      const data = Buffer.from(buffer.subarray(at + (masked ? 4 : 0), need));
      if (mask) for (let i = 0; i < data.length; i++) data[i] ^= mask[i % 4];
      buffer = buffer.subarray(need);
      if (opcode === 8) return end();
      if (opcode === 9) { socket.write(frame(10, data)); continue; }
      if (opcode !== 1) continue;
      let msg;
      try { msg = JSON.parse(data.toString('utf8')); } catch { continue; }
      handlers.message.forEach((fn) => fn(msg));
    }
  });
  socket.on('end', end); // the other side hung up (an upgraded socket stays half open otherwise)
  socket.on('close', end);
  socket.on('error', end);
  return {
    send: (obj) => { if (!closed) socket.write(frame(1, Buffer.from(JSON.stringify(obj)))); },
    close: end,
    on: (event, fn) => handlers[event]?.push(fn),
  };
}

module.exports = { accept };

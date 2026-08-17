/* Minimal Chrome DevTools Protocol driver for verifying the Lab against a running build. */
import WebSocket from '../packages/server/node_modules/ws/index.js';

export async function attach(url = 'http://localhost:5173/') {
  const target = await fetch('http://127.0.0.1:9222/json/new?' + encodeURIComponent(url), { method: 'PUT' }).then(r =>
    r.json(),
  );
  const socket = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 256 * 1024 * 1024 });
  await new Promise(done => socket.once('open', done));
  let id = 0;
  const pending = new Map();
  socket.on('message', raw => {
    const message = JSON.parse(raw);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      message.error ? reject(new Error(JSON.stringify(message.error))) : resolve(message.result);
    }
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const next = ++id;
      pending.set(next, { resolve, reject });
      socket.send(JSON.stringify({ id: next, method, params }));
    });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || 'eval failed');
    return result.result.value;
  };
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1700,
    height: 1050,
    deviceScaleFactor: 1,
    mobile: false,
  });
  return {
    send,
    evaluate,
    targetId: target.id,
    screenshot: async path => {
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      const { writeFileSync } = await import('node:fs');
      writeFileSync(path, Buffer.from(shot.data, 'base64'));
      return path;
    },
    resize: (width, height) =>
      send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }),
    close: async () => {
      socket.close();
      await fetch(`http://127.0.0.1:9222/json/close/${target.id}`);
    },
  };
}

export const sleep = ms => new Promise(done => setTimeout(done, ms));

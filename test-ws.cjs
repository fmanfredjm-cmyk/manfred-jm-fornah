const WebSocket = require('ws');
const ws = new WebSocket('ws://localhost:3000/api/live');
ws.on('open', () => {
  console.log('CONNECTED');
  process.exit(0);
});
ws.on('error', (e) => {
  console.error('ERROR', e);
  process.exit(1);
});
setTimeout(() => {
  console.log('TIMEOUT');
  process.exit(1);
}, 2000);

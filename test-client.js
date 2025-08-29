const WebSocket = require('ws');

const WEBSOCKET_URL = 'wss://a7974e29f21c.ngrok-free.app';
const SOL_FEED_ID = 6;

const ws = new WebSocket(WEBSOCKET_URL);

ws.on('open', () => {
  console.log('Connected to WebSocket server.');

  // Subscribe to the SOL price feed
  const subscriptionMessage = {
    type: 'subscribe',
    subscriptions: [{ feedId: SOL_FEED_ID }]
  };
  ws.send(JSON.stringify(subscriptionMessage));
  console.log('Sent subscription request for SOL feed.');
});

ws.on('message', (data) => {
  try {
    const message = JSON.parse(data.toString());
    console.log('Received message:', JSON.stringify(message, null, 2));
  } catch (error) {
    console.error('Failed to parse message:', error);
  }
});

ws.on('close', (code, reason) => {
  console.log(`Disconnected from WebSocket server. Code: ${code}, Reason: ${reason}`);
});

ws.on('error', (error) => {
  console.error('WebSocket error:', error);
});

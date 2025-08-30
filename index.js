const WebSocket = require('ws');
const http = require('http');
const url = require('url');

// Constants
const SOL_FEED_ID = 6;
const PORT = process.env.PORT || 8080;

// Create HTTP server
const server = http.createServer();

// Create WebSocket server
const wss = new WebSocket.Server({ server });

// Store active subscriptions
const subscriptions = new Map();
let connectionId = 0;

// Mock price data - in real implementation, this would come from external API
let currentPrices = {
  [SOL_FEED_ID]: 245.67 // Starting SOL price
};

// Simulate price updates
function simulatePriceUpdates() {
  const MIN_PRICE = 197.89;
  const MAX_PRICE = 201.67;
  let direction = 1; // 1 for up, -1 for down
  setInterval(() => {
    let currentPrice = currentPrices[SOL_FEED_ID];
    // Fast, small random step between 0.01 and 0.10
    const step = Math.random() * 0.09 + 0.01;
    // Randomly change direction at boundaries or with small probability
    if (currentPrice >= MAX_PRICE) direction = -1;
    if (currentPrice <= MIN_PRICE) direction = 1;
    if (Math.random() < 0.1) direction *= -1;
    let newPrice = currentPrice + direction * step;
    // Clamp to bounds
    newPrice = Math.max(MIN_PRICE, Math.min(MAX_PRICE, newPrice));
    currentPrices[SOL_FEED_ID] = Math.round(newPrice * 100) / 100;
    broadcastPriceUpdate(SOL_FEED_ID, currentPrices[SOL_FEED_ID]);
  }, 500); // Update every 100ms for fast simulation
}

// Broadcast price update to subscribed clients
function broadcastPriceUpdate(feedId, price) {
  const updateMessage = {
    type: 'priceUpdate',
    timestamp: new Date().toISOString(),
    updates: [{
      feedId: feedId,
      price: price.toString()
    }]
  };

  subscriptions.forEach((clientData, ws) => {
    if (ws.readyState === WebSocket.OPEN && clientData.subscribedFeeds.has(feedId)) {
      try {
        ws.send(JSON.stringify(updateMessage));
      } catch (error) {
        console.error(`Failed to send price update to client ${clientData.id}:`, error);
        // Remove failed connection
        subscriptions.delete(ws);
      }
    }
  });
}

// Handle WebSocket connections
wss.on('connection', (ws, request) => {
  const clientId = ++connectionId;
  const clientIP = request.socket.remoteAddress;
  
  console.log(`Client ${clientId} connected from ${clientIP}`);
  
  // Initialize client data
  subscriptions.set(ws, {
    id: clientId,
    subscribedFeeds: new Set(),
    connectedAt: new Date()
  });

  // Send connection acknowledgment
  ws.send(JSON.stringify({
    type: 'connected',
    clientId: clientId,
    message: 'Connected to Bananazone price feed'
  }));

  // Handle incoming messages
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      handleClientMessage(ws, message);
    } catch (error) {
      console.error(`Failed to parse message from client ${clientId}:`, error);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Invalid JSON format'
      }));
    }
  });

  // Handle connection close
  ws.on('close', (code, reason) => {
    console.log(`Client ${clientId} disconnected. Code: ${code}, Reason: ${reason}`);
    subscriptions.delete(ws);
  });

  // Handle WebSocket errors
  ws.on('error', (error) => {
    console.error(`WebSocket error for client ${clientId}:`, error);
    subscriptions.delete(ws);
  });
});

// Handle client messages
function handleClientMessage(ws, message) {
  const clientData = subscriptions.get(ws);
  if (!clientData) return;

  switch (message.type) {
    case 'subscribe':
      handleSubscription(ws, message);
      break;
    
    case 'unsubscribe':
      handleUnsubscription(ws, message);
      break;
    
    case 'ping':
      ws.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
      break;
    
    default:
      ws.send(JSON.stringify({
        type: 'error',
        message: `Unknown message type: ${message.type}`
      }));
  }
}

// Handle subscription requests
function handleSubscription(ws, message) {
  const clientData = subscriptions.get(ws);
  if (!clientData) return;

  if (!message.subscriptions || !Array.isArray(message.subscriptions)) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Invalid subscription format'
    }));
    return;
  }

  const subscribedFeeds = [];
  
  message.subscriptions.forEach(sub => {
    if (sub.feedId && typeof sub.feedId === 'number') {
      clientData.subscribedFeeds.add(sub.feedId);
      subscribedFeeds.push(sub.feedId);
      
      // Send current price immediately
      if (currentPrices[sub.feedId] !== undefined) {
        ws.send(JSON.stringify({
          type: 'priceUpdate',
          timestamp: new Date().toISOString(),
          updates: [{
            feedId: sub.feedId,
            price: currentPrices[sub.feedId].toString()
          }]
        }));
      }
    }
  });

  // Send subscription confirmation
  ws.send(JSON.stringify({
    type: 'subscribed',
    subscriptionId: message.subscriptionId || null,
    subscribedFeeds: subscribedFeeds
  }));

  console.log(`Client ${clientData.id} subscribed to feeds: ${subscribedFeeds.join(', ')}`);
}

// Handle unsubscription requests
function handleUnsubscription(ws, message) {
  const clientData = subscriptions.get(ws);
  if (!clientData) return;

  if (!message.feedIds || !Array.isArray(message.feedIds)) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Invalid unsubscription format'
    }));
    return;
  }

  const unsubscribedFeeds = [];
  
  message.feedIds.forEach(feedId => {
    if (clientData.subscribedFeeds.has(feedId)) {
      clientData.subscribedFeeds.delete(feedId);
      unsubscribedFeeds.push(feedId);
    }
  });

  ws.send(JSON.stringify({
    type: 'unsubscribed',
    unsubscribedFeeds: unsubscribedFeeds
  }));

  console.log(`Client ${clientData.id} unsubscribed from feeds: ${unsubscribedFeeds.join(', ')}`);
}

// Start the server
server.listen(PORT, () => {
  console.log(`Bananazone WebSocket server running on port ${PORT}`);
  console.log(`WebSocket endpoint: ws://localhost:${PORT}/`);
  
  // Start price simulation
  simulatePriceUpdates();
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

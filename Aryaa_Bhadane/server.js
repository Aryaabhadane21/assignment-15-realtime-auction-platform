/**
 * server.js
 * Main entry point for the Real-Time Live Auction & Bidding Platform.
 */

require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const { Server } = require('socket.io');

const {
  auctions,
  getAuction,
  getAllAuctionsSummary,
  handleBidPlacement,
  resetAuction
} = require('./sockets/auctionEngine');

const {
  startAuctionTimer,
  initializeAllTimers
} = require('./sockets/timerManager');

const app = express();
const server = http.createServer(app);

// Configure Socket.io with permissive CORS for local dev and cloud deployment
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// In-memory tracking of viewers per auction room: { [auctionId]: Set<socketId> }
const roomViewers = {};

// Helper to get total viewer count for an auction room
function getViewerCount(auctionId) {
  return roomViewers[auctionId] ? roomViewers[auctionId].size : 0;
}

// REST endpoint to get all auction summaries
app.get('/api/auctions', (req, res) => {
  res.json({
    success: true,
    data: getAllAuctionsSummary()
  });
});

// REST endpoint to get specific auction state
app.get('/api/auctions/:id', (req, res) => {
  const auction = getAuction(req.params.id);
  if (!auction) {
    return res.status(404).json({ success: false, message: 'Auction not found' });
  }
  res.json({
    success: true,
    data: {
      ...auction,
      totalViewers: getViewerCount(req.params.id)
    }
  });
});

// Real-Time Socket Connection Handlers
io.on('connection', (socket) => {
  console.log(`[Socket Connected] ID: ${socket.id}`);

  /**
   * Event: auction:join
   * Payload: { auctionId: string, username: string }
   */
  socket.on('auction:join', ({ auctionId, username }) => {
    const validAuctionId = auctionId || "AUC_VINTAGE_99";
    const validUsername = (username && username.trim()) ? username.trim() : `Bidder_${socket.id.substring(0, 4)}`;

    // Leave any previous auction room if switching rooms
    if (socket.data.currentAuctionId && socket.data.currentAuctionId !== validAuctionId) {
      const prevRoom = socket.data.currentAuctionId;
      socket.leave(prevRoom);
      if (roomViewers[prevRoom]) {
        roomViewers[prevRoom].delete(socket.id);
        io.to(prevRoom).emit('user:left', {
          username: socket.data.username,
          totalViewers: getViewerCount(prevRoom)
        });
        io.to(prevRoom).emit('user:joined', {
          username: socket.data.username,
          totalViewers: getViewerCount(prevRoom)
        });
      }
    }

    // Attach user session data to socket
    socket.data.username = validUsername;
    socket.data.currentAuctionId = validAuctionId;

    // Join room
    socket.join(validAuctionId);

    // Track viewers
    if (!roomViewers[validAuctionId]) {
      roomViewers[validAuctionId] = new Set();
    }
    roomViewers[validAuctionId].add(socket.id);

    const auction = getAuction(validAuctionId);
    if (!auction) {
      return socket.emit('bid:rejected', { reason: 'Auction room does not exist' });
    }

    // 1. Emit auction:init to newly joined client (Hydration)
    socket.emit('auction:init', {
      item: {
        id: auction.id,
        title: auction.title,
        description: auction.description,
        category: auction.category,
        imageUrl: auction.imageUrl,
        startingPrice: auction.startingPrice,
        currentBid: auction.currentBid,
        highestBidder: auction.highestBidder ? auction.highestBidder.username : null,
        minIncrement: auction.minIncrement,
        status: auction.status
      },
      bidHistory: auction.bidHistory,
      timeRemaining: auction.timeRemainingSeconds,
      totalViewers: getViewerCount(validAuctionId)
    });

    // 2. Broadcast user:joined to room
    io.to(validAuctionId).emit('user:joined', {
      username: validUsername,
      totalViewers: getViewerCount(validAuctionId)
    });

    console.log(`[Room Join] User: ${validUsername} (${socket.id}) joined room: ${validAuctionId} (Total: ${getViewerCount(validAuctionId)})`);
  });

  /**
   * Event: bid:place
   * Payload: { auctionId: string, amount: number }
   */
  socket.on('bid:place', ({ auctionId, amount }) => {
    const targetAuctionId = auctionId || socket.data.currentAuctionId;
    const auction = getAuction(targetAuctionId);
    const username = socket.data.username || "Anonymous";

    if (!auction) {
      return socket.emit('bid:rejected', { reason: 'Auction not found' });
    }

    // Execute authoritative bid placement & anti-snipe logic synchronously
    handleBidPlacement(io, socket, auction, Number(amount), username);
  });

  /**
   * Event: auction:reset (Demonstration / Testing Helper)
   * Payload: { auctionId: string }
   */
  socket.on('auction:reset', ({ auctionId }) => {
    const targetId = auctionId || socket.data.currentAuctionId || "AUC_VINTAGE_99";
    const auction = resetAuction(targetId, (auc) => startAuctionTimer(io, auc));

    if (auction) {
      io.to(targetId).emit('auction:init', {
        item: {
          id: auction.id,
          title: auction.title,
          description: auction.description,
          category: auction.category,
          imageUrl: auction.imageUrl,
          startingPrice: auction.startingPrice,
          currentBid: auction.currentBid,
          highestBidder: null,
          minIncrement: auction.minIncrement,
          status: auction.status
        },
        bidHistory: auction.bidHistory,
        timeRemaining: auction.timeRemainingSeconds,
        totalViewers: getViewerCount(targetId)
      });

      io.to(targetId).emit('auction:reset_done', {
        auctionId: targetId,
        message: 'Auction floor has been reset for a fresh round!'
      });
    }
  });

  /**
   * Handle Disconnect
   */
  socket.on('disconnect', () => {
    const { currentAuctionId, username } = socket.data || {};
    if (currentAuctionId && roomViewers[currentAuctionId]) {
      roomViewers[currentAuctionId].delete(socket.id);
      const remainingViewers = getViewerCount(currentAuctionId);

      io.to(currentAuctionId).emit('user:left', {
        username: username || 'A participant',
        totalViewers: remainingViewers
      });

      io.to(currentAuctionId).emit('user:joined', {
        username: username || 'A participant',
        totalViewers: remainingViewers
      });

      console.log(`[Socket Disconnected] User: ${username} (${socket.id}) left ${currentAuctionId} (Remaining: ${remainingViewers})`);
    } else {
      console.log(`[Socket Disconnected] ID: ${socket.id}`);
    }
  });
});

// Start countdown timers for all initial auctions
initializeAllTimers(io, auctions);

let DEFAULT_PORT = parseInt(process.env.PORT, 10) || 5000;

function startServer(port) {
  server.listen(port, () => {
    console.log(`=======================================================`);
    console.log(`⚡ Live Auction Platform Server running on port ${port}`);
    console.log(`📍 URL: http://localhost:${port}`);
    console.log(`💎 Real-time Engine & Anti-Snipe Clocks Active`);
    console.log(`=======================================================`);
  }).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`[Port Conflict] Port ${port} is occupied (e.g. macOS AirPlay). Attempting port ${port + 1}...`);
      startServer(port + 1);
    } else {
      console.error('[Server Error]', err);
    }
  });
}

startServer(DEFAULT_PORT);

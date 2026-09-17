/**
 * sockets/auctionEngine.js
 * Authoritative in-memory state engine and synchronous bid validation.
 */

// In-Memory Auction Room State
const auctions = {
  "AUC_VINTAGE_99": {
    id: "AUC_VINTAGE_99",
    title: "1967 Vintage Fender Stratocaster",
    description: "Original condition rare electric guitar in Sunburst finish, all-original pickups and vintage case.",
    category: "Vintage Instruments",
    imageUrl: "https://images.unsplash.com/photo-1550291652-6ea9114a47b1?auto=format&fit=crop&w=800&q=80",
    startingPrice: 50000,
    currentBid: 50000,
    highestBidder: null, // { socketId, username }
    minIncrement: 2000,
    timeRemainingSeconds: 60,
    initialTimeSeconds: 60,
    status: "active", // "upcoming", "active", "ended"
    bidHistory: [],
    timerInterval: null
  },
  "AUC_ROLEX_77": {
    id: "AUC_ROLEX_77",
    title: "1971 Rolex Daytona 'Paul Newman' Ref. 6263",
    description: "Iconic exotic panda dial chronograph with stainless steel oyster bracelet and full provenance papers.",
    category: "Luxury Timepieces",
    imageUrl: "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=800&q=80",
    startingPrice: 120000,
    currentBid: 120000,
    highestBidder: null,
    minIncrement: 5000,
    timeRemainingSeconds: 90,
    initialTimeSeconds: 90,
    status: "active",
    bidHistory: [],
    timerInterval: null
  },
  "AUC_ART_42": {
    id: "AUC_ART_42",
    title: "Pablo Picasso Original Lithograph (1954)",
    description: "Hand-signed limited edition monochrome lithograph on Arches paper with gallery certificate of authenticity.",
    category: "Fine Modern Art",
    imageUrl: "https://images.unsplash.com/photo-1579783902614-a3fb3927b675?auto=format&fit=crop&w=800&q=80",
    startingPrice: 75000,
    currentBid: 75000,
    highestBidder: null,
    minIncrement: 2500,
    timeRemainingSeconds: 75,
    initialTimeSeconds: 75,
    status: "active",
    bidHistory: [],
    timerInterval: null
  }
};

/**
 * Synchronous authoritative bid validation and anti-snipe logic.
 * Serialized naturally by Node.js event loop to prevent race conditions.
 */
function handleBidPlacement(io, socket, auction, bidAmount, username) {
  // 1. Check if auction is active
  if (!auction || auction.status !== 'active' || auction.timeRemainingSeconds <= 0) {
    return socket.emit('bid:rejected', { reason: 'Auction is closed' });
  }

  // 2. Check if bidder is already the highest bidder
  if (auction.highestBidder && auction.highestBidder.socketId === socket.id) {
    return socket.emit('bid:rejected', { reason: 'You are already the highest bidder' });
  }

  // 3. Check minimum increment
  const minimumRequired = auction.currentBid + auction.minIncrement;
  if (typeof bidAmount !== 'number' || isNaN(bidAmount) || bidAmount < minimumRequired) {
    return socket.emit('bid:rejected', { 
      reason: `Bid too low. Minimum valid bid is ₹${minimumRequired.toLocaleString('en-IN')}` 
    });
  }

  // 4. Capture previous highest bidder to notify outbid
  const previousBidder = auction.highestBidder;

  // 5. Update State
  auction.currentBid = bidAmount;
  auction.highestBidder = { socketId: socket.id, username };
  auction.bidHistory.unshift({
    bidder: username,
    amount: bidAmount,
    timestamp: new Date().toLocaleTimeString('en-US', { hour12: false })
  });

  // 6. Anti-Snipe Rule: If bid placed within last 15s, extend timer back to 20s
  if (auction.timeRemainingSeconds < 15) {
    auction.timeRemainingSeconds = 20;
    io.to(auction.id).emit('auction:extended', {
      timeRemaining: 20,
      message: 'Anti-snipe triggered: +20 seconds added!'
    });
  }

  // 7. Broadcast new top bid to room
  io.to(auction.id).emit('bid:success', {
    newBid: auction.currentBid,
    currentBid: auction.currentBid,
    highestBidder: username,
    bidHistory: auction.bidHistory,
    timeRemaining: auction.timeRemainingSeconds
  });

  // 8. Send private alert to outbid user
  if (previousBidder && previousBidder.socketId !== socket.id) {
    io.to(previousBidder.socketId).emit('bid:outbid', {
      message: `You were outbid by ${username} with ₹${bidAmount.toLocaleString('en-IN')}!`
    });
  }
}

/**
 * Helper to get auction by ID
 */
function getAuction(auctionId) {
  return auctions[auctionId] || null;
}

/**
 * Helper to get summary list of all available auctions
 */
function getAllAuctionsSummary() {
  return Object.values(auctions).map(a => ({
    id: a.id,
    title: a.title,
    category: a.category,
    currentBid: a.currentBid,
    startingPrice: a.startingPrice,
    status: a.status,
    timeRemainingSeconds: a.timeRemainingSeconds
  }));
}

/**
 * Reset an auction state (useful for testing & repeated demonstrations)
 */
function resetAuction(auctionId, startTimerCallback) {
  const auction = auctions[auctionId];
  if (!auction) return null;

  if (auction.timerInterval) {
    clearInterval(auction.timerInterval);
    auction.timerInterval = null;
  }

  auction.currentBid = auction.startingPrice;
  auction.highestBidder = null;
  auction.timeRemainingSeconds = auction.initialTimeSeconds || 60;
  auction.status = "active";
  auction.bidHistory = [];

  if (typeof startTimerCallback === 'function') {
    startTimerCallback(auction);
  }

  return auction;
}

module.exports = {
  auctions,
  getAuction,
  getAllAuctionsSummary,
  handleBidPlacement,
  resetAuction
};

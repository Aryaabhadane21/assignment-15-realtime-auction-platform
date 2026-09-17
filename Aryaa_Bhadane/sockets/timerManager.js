/**
 * sockets/timerManager.js
 * Manages server-side authoritative 1-second interval countdown timers per auction room.
 */

/**
 * Start the countdown timer for an active auction room.
 * @param {object} io - Socket.io server instance
 * @param {object} auction - The in-memory auction object
 */
function startAuctionTimer(io, auction) {
  // Clear any existing timer interval for safety
  if (auction.timerInterval) {
    clearInterval(auction.timerInterval);
    auction.timerInterval = null;
  }

  auction.timerInterval = setInterval(() => {
    // Decrement time
    auction.timeRemainingSeconds -= 1;

    // Broadcast time tick to the specific auction room
    io.to(auction.id).emit('auction:time_tick', {
      auctionId: auction.id,
      timeRemaining: auction.timeRemainingSeconds
    });

    // Check if countdown expired
    if (auction.timeRemainingSeconds <= 0) {
      clearInterval(auction.timerInterval);
      auction.timerInterval = null;
      auction.timeRemainingSeconds = 0;
      auction.status = 'ended';

      if (auction.highestBidder) {
        // Reserve met / bids placed -> Sold!
        io.to(auction.id).emit('auction:sold', {
          auctionId: auction.id,
          winner: auction.highestBidder.username,
          finalPrice: auction.currentBid,
          status: 'sold'
        });
      } else {
        // Edge case: No bids were placed -> Unsold / Closed
        io.to(auction.id).emit('auction:sold', {
          auctionId: auction.id,
          winner: null,
          finalPrice: auction.startingPrice,
          status: 'unsold',
          message: 'Auction ended with no bids placed.'
        });
      }
    }
  }, 1000);
}

/**
 * Initialize timers for all active auctions on server startup.
 * @param {object} io - Socket.io server instance
 * @param {object} auctions - Dictionary of all auction objects
 */
function initializeAllTimers(io, auctions) {
  Object.values(auctions).forEach(auction => {
    if (auction.status === 'active' && auction.timeRemainingSeconds > 0) {
      startAuctionTimer(io, auction);
    }
  });
}

/**
 * Stop a specific auction timer.
 * @param {object} auction - The in-memory auction object
 */
function stopAuctionTimer(auction) {
  if (auction && auction.timerInterval) {
    clearInterval(auction.timerInterval);
    auction.timerInterval = null;
  }
}

module.exports = {
  startAuctionTimer,
  initializeAllTimers,
  stopAuctionTimer
};

/**
 * test_simulation.js
 * Programmatic self-contained verification suite for real-time bid engine, anti-snipe, and timers.
 */

const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const { io: ioClient } = require('socket.io-client');

const {
  auctions,
  getAuction,
  handleBidPlacement,
  resetAuction
} = require('./sockets/auctionEngine');

const {
  startAuctionTimer
} = require('./sockets/timerManager');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTestSuite() {
  console.log('====================================================');
  console.log('🧪 RUNNING COMPREHENSIVE AUCTION PLATFORM TEST SUITE');
  console.log('====================================================\n');

  // 1. Setup isolated test server on port 5999
  const TEST_PORT = 5999;
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: '*' } });

  const roomViewers = {};
  function getViewerCount(auctionId) {
    return roomViewers[auctionId] ? roomViewers[auctionId].size : 0;
  }

  io.on('connection', (socket) => {
    socket.on('auction:join', ({ auctionId, username }) => {
      const validAuctionId = auctionId || "AUC_VINTAGE_99";
      const validUsername = username || `Bidder_${socket.id.substring(0, 4)}`;
      socket.data.username = validUsername;
      socket.data.currentAuctionId = validAuctionId;
      socket.join(validAuctionId);

      if (!roomViewers[validAuctionId]) roomViewers[validAuctionId] = new Set();
      roomViewers[validAuctionId].add(socket.id);

      const auction = getAuction(validAuctionId);
      socket.emit('auction:init', {
        item: {
          id: auction.id,
          title: auction.title,
          currentBid: auction.currentBid,
          startingPrice: auction.startingPrice,
          minIncrement: auction.minIncrement,
          highestBidder: auction.highestBidder ? auction.highestBidder.username : null,
          status: auction.status
        },
        bidHistory: auction.bidHistory,
        timeRemaining: auction.timeRemainingSeconds,
        totalViewers: getViewerCount(validAuctionId)
      });

      io.to(validAuctionId).emit('user:joined', {
        username: validUsername,
        totalViewers: getViewerCount(validAuctionId)
      });
    });

    socket.on('bid:place', ({ auctionId, amount }) => {
      const auction = getAuction(auctionId);
      handleBidPlacement(io, socket, auction, Number(amount), socket.data.username);
    });

    socket.on('disconnect', () => {
      const { currentAuctionId, username } = socket.data || {};
      if (currentAuctionId && roomViewers[currentAuctionId]) {
        roomViewers[currentAuctionId].delete(socket.id);
        io.to(currentAuctionId).emit('user:left', {
          username,
          totalViewers: getViewerCount(currentAuctionId)
        });
      }
    });
  });

  await new Promise(resolve => server.listen(TEST_PORT, resolve));
  console.log(`[Test Server] Running on http://localhost:${TEST_PORT}`);

  const auction = resetAuction("AUC_VINTAGE_99", (auc) => startAuctionTimer(io, auc));

  // 2. Connect 2 Test Bidders
  const clientVikram = ioClient(`http://localhost:${TEST_PORT}`, { reconnection: false });
  const clientAnanya = ioClient(`http://localhost:${TEST_PORT}`, { reconnection: false });

  await new Promise(resolve => {
    let c = 0;
    const check = () => { if (++c === 2) resolve(); };
    clientVikram.on('connect', check);
    clientAnanya.on('connect', check);
  });

  console.log('✅ Step 1: Both clients connected.');

  // Join Room
  clientVikram.emit('auction:join', { auctionId: "AUC_VINTAGE_99", username: "Vikram" });
  clientAnanya.emit('auction:join', { auctionId: "AUC_VINTAGE_99", username: "Ananya" });

  await sleep(150);

  // TEST 1: Vikram places valid opening bid (+₹2,000 -> ₹52,000)
  console.log('\n--- TEST 1: Valid Opening Bid (Vikram bids ₹52,000) ---');
  let t1Success = false;
  clientAnanya.once('bid:success', (data) => {
    console.log(`[Ananya] Broadcast received: currentBid = ₹${data.currentBid}, leader = ${data.highestBidder}`);
    if (data.currentBid === 52000 && data.highestBidder === 'Vikram') {
      t1Success = true;
    }
  });

  clientVikram.emit('bid:place', { auctionId: "AUC_VINTAGE_99", amount: 52000 });
  await sleep(250);

  if (t1Success && auction.currentBid === 52000) {
    console.log('✅ TEST 1 PASSED: Valid bid updated state and broadcasted to all room members.');
  } else {
    throw new Error('TEST 1 FAILED');
  }

  // TEST 2: Self-Outbid Prohibition
  console.log('\n--- TEST 2: Self-Outbid Prohibition (Vikram attempts another bid) ---');
  let t2Rejected = false;
  clientVikram.once('bid:rejected', (data) => {
    console.log(`[Vikram] Rejection received: "${data.reason}"`);
    if (data.reason.includes('already the highest bidder')) {
      t2Rejected = true;
    }
  });

  clientVikram.emit('bid:place', { auctionId: "AUC_VINTAGE_99", amount: 54000 });
  await sleep(250);

  if (t2Rejected) {
    console.log('✅ TEST 2 PASSED: Self-outbid correctly rejected.');
  } else {
    throw new Error('TEST 2 FAILED');
  }

  // TEST 3: Minimum Increment Enforcement
  console.log('\n--- TEST 3: Min Increment Check (Ananya bids ₹53,000 < min required ₹54,000) ---');
  let t3Rejected = false;
  clientAnanya.once('bid:rejected', (data) => {
    console.log(`[Ananya] Rejection received: "${data.reason}"`);
    if (data.reason.includes('Bid too low')) {
      t3Rejected = true;
    }
  });

  clientAnanya.emit('bid:place', { auctionId: "AUC_VINTAGE_99", amount: 53000 });
  await sleep(250);

  if (t3Rejected) {
    console.log('✅ TEST 3 PASSED: Under-increment bid strictly rejected.');
  } else {
    throw new Error('TEST 3 FAILED');
  }

  // TEST 4: Targeted Outbid Alert
  console.log('\n--- TEST 4: Targeted Outbid Notification (Ananya bids ₹55,000) ---');
  let t4OutbidAlert = false;
  clientVikram.once('bid:outbid', (data) => {
    console.log(`[Vikram Alert] "${data.message}"`);
    if (data.message.includes('outbid by Ananya')) {
      t4OutbidAlert = true;
    }
  });

  clientAnanya.emit('bid:place', { auctionId: "AUC_VINTAGE_99", amount: 55000 });
  await sleep(250);

  if (t4OutbidAlert && auction.highestBidder.username === 'Ananya') {
    console.log('✅ TEST 4 PASSED: Private outbid alert sent strictly to previous highest bidder.');
  } else {
    throw new Error('TEST 4 FAILED');
  }

  // TEST 5: Anti-Snipe Soft-Close Extension
  console.log('\n--- TEST 5: Anti-Snipe Rule (<15s resets to 20s) ---');
  auction.timeRemainingSeconds = 8; // Artificially drop clock to 8s
  console.log(`[Clock] Set timeRemainingSeconds = 8s`);

  let t5Extended = false;
  clientVikram.once('auction:extended', (data) => {
    console.log(`[Broadcast] auction:extended: "${data.message}", clock = ${data.timeRemaining}s`);
    if (data.timeRemaining === 20) {
      t5Extended = true;
    }
  });

  clientVikram.emit('bid:place', { auctionId: "AUC_VINTAGE_99", amount: 58000 });
  await sleep(250);

  if (t5Extended && auction.timeRemainingSeconds === 20) {
    console.log('✅ TEST 5 PASSED: Late bid in final seconds extended timer to 20s.');
  } else {
    throw new Error('TEST 5 FAILED');
  }

  // TEST 6: Auction Expiration & Sold Hammer Down
  console.log('\n--- TEST 6: Auction Timer Expiration (auction:sold) ---');
  auction.timeRemainingSeconds = 1;

  let t6Sold = false;
  clientVikram.once('auction:sold', (data) => {
    console.log(`[Broadcast] auction:sold: winner = "${data.winner}", hammer price = ₹${data.finalPrice}`);
    if (data.winner === 'Vikram' && data.finalPrice === 58000 && data.status === 'sold') {
      t6Sold = true;
    }
  });

  await sleep(1500); // Wait for timer tick to expire clock

  if (t6Sold && auction.status === 'ended') {
    console.log('✅ TEST 6 PASSED: Auction closed and winner resolved correctly.');
  } else {
    throw new Error('TEST 6 FAILED');
  }

  // TEST 7: Bid Rejection After Close
  console.log('\n--- TEST 7: Bid Rejection After Auction Closed ---');
  let t7Closed = false;
  clientAnanya.once('bid:rejected', (data) => {
    console.log(`[Ananya] Rejection received: "${data.reason}"`);
    if (data.reason.includes('Auction is closed')) {
      t7Closed = true;
    }
  });

  clientAnanya.emit('bid:place', { auctionId: "AUC_VINTAGE_99", amount: 70000 });
  await sleep(250);

  if (t7Closed) {
    console.log('✅ TEST 7 PASSED: Post-expiration bid rejected.');
  } else {
    throw new Error('TEST 7 FAILED');
  }

  console.log('\n====================================================');
  console.log('🎉 ALL 7 TEST CASES PASSED WITH 100% SUCCESS RATE!');
  console.log('====================================================\n');

  clientVikram.disconnect();
  clientAnanya.disconnect();
  server.close();
  process.exit(0);
}

runTestSuite().catch(err => {
  console.error('❌ Test Suite Error:', err);
  process.exit(1);
});

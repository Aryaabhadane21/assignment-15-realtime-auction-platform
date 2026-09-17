/**
 * public/app.js
 * Client-side Real-Time Socket.io Live Auction Floor Controller.
 */

// Initialize Socket.io connection (same-origin for local & deployed Render app)
const socket = io();

// State Variables
let currentAuctionId = "AUC_VINTAGE_99";
let currentUsername = localStorage.getItem('veritas_bidder_name') || "Vikram";
let currentAuction = {
  currentBid: 50000,
  minIncrement: 2000,
  startingPrice: 50000,
  highestBidder: null,
  status: "active",
  timeRemaining: 60,
  initialTime: 60
};
let soundEnabled = true;

// DOM Elements
const roomSelect = document.getElementById('auction-room-select');
const viewerCountEl = document.getElementById('viewer-count');
const currentUserDisplay = document.getElementById('current-user-display');
const changeUserBtn = document.getElementById('change-user-btn');
const soundToggleBtn = document.getElementById('sound-toggle-btn');
const soundIcon = document.getElementById('sound-icon');

// Lot Elements
const lotTag = document.getElementById('lot-tag');
const lotCategory = document.getElementById('lot-category');
const lotStatusBadge = document.getElementById('lot-status-badge');
const lotTitle = document.getElementById('lot-title');
const lotDesc = document.getElementById('lot-desc');
const lotImage = document.getElementById('lot-image');
const specStartingPrice = document.getElementById('spec-starting-price');
const specMinIncrement = document.getElementById('spec-min-increment');

// Timer Elements
const timerBox = document.getElementById('timer-box');
const timerSecondsEl = document.getElementById('timer-seconds');
const timerProgressBar = document.getElementById('timer-progress-bar');
const antiSnipeBadge = document.getElementById('anti-snipe-badge');
const resetAuctionBtn = document.getElementById('reset-auction-btn');

// Bidding Elements
const currentBidCard = document.getElementById('current-bid-card');
const currentBidValueEl = document.getElementById('current-bid-value');
const highestBidderNameEl = document.getElementById('highest-bidder-name');
const nextMinBidDisplay = document.getElementById('next-min-bid-display');
const bidForm = document.getElementById('bid-form');
const bidInput = document.getElementById('bid-input');
const placeBidBtn = document.getElementById('place-bid-btn');
const quickBidBtns = document.querySelectorAll('.quick-bid-btn');
const personaBtns = document.querySelectorAll('.persona-btn');

// Bid History Elements
const bidHistoryTbody = document.getElementById('bid-history-tbody');
const historyCountBadge = document.getElementById('history-count-badge');

// Outbid Banner & Modals
const outbidBanner = document.getElementById('outbid-banner');
const outbidMessage = document.getElementById('outbid-message');
const quickCounterBidBtn = document.getElementById('quick-counter-bid-btn');
const closeOutbidBtn = document.getElementById('close-outbid-btn');
const toastContainer = document.getElementById('toast-container');

const soldModal = document.getElementById('sold-modal');
const soldModalTitle = document.getElementById('sold-modal-title');
const soldModalBadge = document.getElementById('sold-modal-badge');
const soldWinner = document.getElementById('sold-winner');
const soldPrice = document.getElementById('sold-price');
const modalResetBtn = document.getElementById('modal-reset-btn');
const modalCloseBtn = document.getElementById('modal-close-btn');

const userModal = document.getElementById('user-modal');
const usernameInput = document.getElementById('username-input');
const saveUsernameBtn = document.getElementById('save-username-btn');
const cancelUsernameBtn = document.getElementById('cancel-username-btn');

/* ==========================================================================
   WEB AUDIO API SOUND SYNTHESIZER
   ========================================================================== */
const AudioContext = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

function playGavelSound() {
  if (!soundEnabled) return;
  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(180, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.12);
    
    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
  } catch (e) {
    console.warn('Audio play error:', e);
  }
}

function playOutbidAlertSound() {
  if (!soundEnabled) return;
  try {
    const ctx = getAudioContext();
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = 'sawtooth';
    osc2.type = 'square';
    osc1.frequency.setValueAtTime(520, ctx.currentTime);
    osc1.frequency.setValueAtTime(420, ctx.currentTime + 0.1);
    osc2.frequency.setValueAtTime(260, ctx.currentTime);
    osc2.frequency.setValueAtTime(210, ctx.currentTime + 0.1);

    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start();
    osc2.start();
    osc1.stop(ctx.currentTime + 0.35);
    osc2.stop(ctx.currentTime + 0.35);
  } catch (e) {
    console.warn('Audio play error:', e);
  }
}

function playSnipeChime() {
  if (!soundEnabled) return;
  try {
    const ctx = getAudioContext();
    const notes = [587.33, 880, 1174.66]; // D5, A5, D6
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + (idx * 0.08));
      gain.gain.setValueAtTime(0.25, ctx.currentTime + (idx * 0.08));
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (idx * 0.08) + 0.4);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + (idx * 0.08));
      osc.stop(ctx.currentTime + (idx * 0.08) + 0.4);
    });
  } catch (e) {
    console.warn('Audio play error:', e);
  }
}

function playHammerVictory() {
  if (!soundEnabled) return;
  try {
    const ctx = getAudioContext();
    const chord = [440, 554.37, 659.25, 880]; // A major
    chord.forEach(freq => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 1.2);
    });
  } catch (e) {
    console.warn('Audio play error:', e);
  }
}

/* ==========================================================================
   UI HELPERS & NOTIFICATIONS
   ========================================================================== */
function formatCurrency(amount) {
  return Number(amount).toLocaleString('en-IN');
}

function showToast(message, type = 'default') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  let icon = 'ℹ️';
  if (type === 'error') icon = '⚠️';
  if (type === 'snipe') icon = '🛡️';
  if (type === 'success') icon = '✓';

  toast.innerHTML = `
    <span class="toast-icon">${icon}</span>
    <span class="toast-text">${message}</span>
  `;

  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    setTimeout(() => toast.remove(), 350);
  }, 4500);
}

function showOutbidBanner(message) {
  outbidMessage.textContent = message;
  const nextRequired = (currentAuction.currentBid || 0) + (currentAuction.minIncrement || 2000);
  quickCounterBidBtn.textContent = `COUNTER ₹${formatCurrency(nextRequired)}`;
  quickCounterBidBtn.onclick = () => {
    placeBid(nextRequired);
    outbidBanner.classList.add('hidden');
  };

  outbidBanner.classList.remove('hidden');
  playOutbidAlertSound();
}

function hideOutbidBanner() {
  outbidBanner.classList.add('hidden');
}

function updateNextMinBidDisplay() {
  const minNext = (currentAuction.currentBid || 0) + (currentAuction.minIncrement || 2000);
  nextMinBidDisplay.textContent = `₹${formatCurrency(minNext)}`;
  bidInput.min = minNext;
  bidInput.placeholder = minNext;

  // Update quick bid button labels based on increments
  quickBidBtns.forEach(btn => {
    const inc = Number(btn.getAttribute('data-increment'));
    btn.textContent = `+₹${formatCurrency(inc)}`;
  });
}

function updateTimerDisplay(seconds) {
  currentAuction.timeRemaining = seconds;
  timerSecondsEl.textContent = Math.max(0, seconds);
  
  const initial = currentAuction.initialTime || 60;
  const percentage = Math.min(100, Math.max(0, (seconds / initial) * 100));
  timerProgressBar.style.width = `${percentage}%`;

  // Anti-snipe danger zone (< 15 seconds)
  if (seconds < 15 && seconds > 0 && currentAuction.status === 'active') {
    timerBox.classList.add('snipe-warning');
    antiSnipeBadge.classList.remove('hidden');
  } else {
    timerBox.classList.remove('snipe-warning');
    antiSnipeBadge.classList.add('hidden');
  }
}

function renderBidHistory(history) {
  bidHistoryTbody.innerHTML = '';
  historyCountBadge.textContent = `${history.length} Bid${history.length === 1 ? '' : 's'}`;

  if (!history || history.length === 0) {
    bidHistoryTbody.innerHTML = `
      <tr class="empty-row">
        <td colspan="4" class="text-center">No bids recorded yet. Awaiting floor opening...</td>
      </tr>
    `;
    return;
  }

  history.forEach((bid, index) => {
    const tr = document.createElement('tr');
    if (index === 0) {
      tr.classList.add('new-bid-row');
    }

    const isCurrentLeader = index === 0;
    const isMe = bid.bidder === currentUsername;

    tr.innerHTML = `
      <td>${bid.timestamp || new Date().toLocaleTimeString()}</td>
      <td class="bidder-cell">
        ${isMe ? '<strong>' + bid.bidder + ' (You)</strong>' : bid.bidder}
      </td>
      <td class="amount-cell">₹${formatCurrency(bid.amount)}</td>
      <td class="text-right">
        <span class="status-badge-floor">${isCurrentLeader ? '● LEADING' : 'OUTBID'}</span>
      </td>
    `;
    bidHistoryTbody.appendChild(tr);
  });
}

function updateAuctionDetails(item) {
  lotTitle.textContent = item.title;
  lotDesc.textContent = item.description;
  if (item.category) lotCategory.textContent = item.category;
  if (item.imageUrl) lotImage.src = item.imageUrl;
  
  specStartingPrice.textContent = `₹${formatCurrency(item.startingPrice)}`;
  specMinIncrement.textContent = `₹${formatCurrency(item.minIncrement)}`;
  
  const lotNum = item.id.replace('AUC_', '').replace('_', ' #');
  lotTag.textContent = `LOT #${lotNum}`;

  currentAuction.currentBid = item.currentBid;
  currentAuction.minIncrement = item.minIncrement;
  currentAuction.startingPrice = item.startingPrice;
  currentAuction.highestBidder = item.highestBidder;
  currentAuction.status = item.status || "active";

  currentBidValueEl.textContent = formatCurrency(item.currentBid);
  
  if (item.highestBidder) {
    highestBidderNameEl.textContent = item.highestBidder === currentUsername 
      ? `${item.highestBidder} (You)` 
      : item.highestBidder;
  } else {
    highestBidderNameEl.textContent = "No bids placed yet";
  }

  if (item.status === 'ended') {
    lotStatusBadge.textContent = '● LOT SOLD / ENDED';
    placeBidBtn.disabled = true;
  } else {
    lotStatusBadge.textContent = '● LIVE BIDDING';
    placeBidBtn.disabled = false;
  }

  updateNextMinBidDisplay();
}

function updateActivePersona(username) {
  currentUsername = username;
  localStorage.setItem('veritas_bidder_name', username);
  currentUserDisplay.textContent = username;

  personaBtns.forEach(btn => {
    if (btn.getAttribute('data-user') === username) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Re-join floor with updated username
  socket.emit('auction:join', {
    auctionId: currentAuctionId,
    username: currentUsername
  });
}

function placeBid(amount) {
  if (!amount || isNaN(amount)) {
    showToast('Please enter a valid bid amount', 'error');
    return;
  }

  socket.emit('bid:place', {
    auctionId: currentAuctionId,
    amount: Number(amount)
  });
}

/* ==========================================================================
   SOCKET.IO EVENT HANDLERS
   ========================================================================== */

// 1. On Socket Connect -> Join Room
socket.on('connect', () => {
  console.log('[Socket Connected] Joining room:', currentAuctionId, 'as', currentUsername);
  socket.emit('auction:join', {
    auctionId: currentAuctionId,
    username: currentUsername
  });
});

// 2. auction:init -> Hydrate full auction state
socket.on('auction:init', (payload) => {
  console.log('[auction:init] Payload:', payload);
  if (payload.item) {
    updateAuctionDetails(payload.item);
  }
  if (payload.bidHistory) {
    renderBidHistory(payload.bidHistory);
  }
  if (typeof payload.timeRemaining === 'number') {
    updateTimerDisplay(payload.timeRemaining);
  }
  if (typeof payload.totalViewers === 'number') {
    viewerCountEl.textContent = payload.totalViewers;
  }
});

// 3. auction:time_tick -> 1-second interval clock update
socket.on('auction:time_tick', ({ auctionId, timeRemaining }) => {
  if (auctionId === currentAuctionId) {
    updateTimerDisplay(timeRemaining);
  }
});

// 4. user:joined -> Audience counter update
socket.on('user:joined', ({ username, totalViewers }) => {
  if (typeof totalViewers === 'number') {
    viewerCountEl.textContent = totalViewers;
  }
});

// user:left -> Audience counter update
socket.on('user:left', ({ username, totalViewers }) => {
  if (typeof totalViewers === 'number') {
    viewerCountEl.textContent = totalViewers;
  }
});

// 5. bid:success -> Broadcasted when a new valid bid is placed
socket.on('bid:success', ({ currentBid, highestBidder, bidHistory, timeRemaining }) => {
  console.log('[bid:success] New bid:', currentBid, 'by', highestBidder);
  
  currentAuction.currentBid = currentBid;
  currentAuction.highestBidder = highestBidder;

  // Visual pulse on leading bid card
  currentBidValueEl.textContent = formatCurrency(currentBid);
  currentBidCard.classList.remove('pulse-update');
  void currentBidCard.offsetWidth; // Trigger reflow for animation restart
  currentBidCard.classList.add('pulse-update');

  highestBidderNameEl.textContent = highestBidder === currentUsername 
    ? `${highestBidder} (You)` 
    : highestBidder;

  updateNextMinBidDisplay();

  if (bidHistory) {
    renderBidHistory(bidHistory);
  }

  if (typeof timeRemaining === 'number') {
    updateTimerDisplay(timeRemaining);
  }

  // If I am now the highest bidder, dismiss outbid banner
  if (highestBidder === currentUsername) {
    hideOutbidBanner();
    showToast(`You are leading the bidding at ₹${formatCurrency(currentBid)}!`, 'success');
  }

  playGavelSound();
});

// 6. bid:outbid -> Targeted alert strictly for the previous highest bidder
socket.on('bid:outbid', ({ message }) => {
  console.log('[bid:outbid] Alert:', message);
  showOutbidBanner(message);
});

// 7. bid:rejected -> Rejection reason for invalid bids
socket.on('bid:rejected', ({ reason }) => {
  console.warn('[bid:rejected] Reason:', reason);
  showToast(reason || 'Bid rejected by authoritative engine', 'error');
  playOutbidAlertSound();
});

// 8. auction:extended -> Anti-snipe rule triggered in final seconds
socket.on('auction:extended', ({ timeRemaining, message }) => {
  console.log('[auction:extended] Anti-snipe triggered:', message);
  updateTimerDisplay(timeRemaining);
  
  timerBox.classList.add('extended-flash');
  setTimeout(() => timerBox.classList.remove('extended-flash'), 800);

  showToast(message || 'Anti-snipe triggered: +20 seconds added!', 'snipe');
  playSnipeChime();
});

// 9. auction:sold -> Auction end resolution
socket.on('auction:sold', ({ auctionId, winner, finalPrice, status, message }) => {
  console.log('[auction:sold] End state:', { winner, finalPrice, status });
  currentAuction.status = 'ended';
  lotStatusBadge.textContent = '● LOT SOLD / ENDED';
  placeBidBtn.disabled = true;

  if (winner) {
    soldModalBadge.textContent = 'HAMMER DOWN • SOLD';
    soldModalTitle.textContent = lotTitle.textContent;
    soldWinner.textContent = winner === currentUsername ? `${winner} (You Win!)` : winner;
    soldPrice.textContent = `₹${formatCurrency(finalPrice)}`;
    soldModal.classList.remove('hidden');
    playHammerVictory();
  } else {
    soldModalBadge.textContent = 'LOT CLOSED • UNSOLD';
    soldModalTitle.textContent = lotTitle.textContent;
    soldWinner.textContent = 'No Bidders';
    soldPrice.textContent = `Reserve ₹${formatCurrency(finalPrice)}`;
    soldModal.classList.remove('hidden');
  }
});

// 10. auction:reset_done -> Notification when floor is restarted
socket.on('auction:reset_done', ({ message }) => {
  showToast(message, 'success');
  soldModal.classList.add('hidden');
  hideOutbidBanner();
  placeBidBtn.disabled = false;
});

/* ==========================================================================
   USER ACTIONS & EVENT LISTENERS
   ========================================================================== */

// Room Selector Switch
roomSelect.addEventListener('change', (e) => {
  currentAuctionId = e.target.value;
  hideOutbidBanner();
  soldModal.classList.add('hidden');
  socket.emit('auction:join', {
    auctionId: currentAuctionId,
    username: currentUsername
  });
});

// Bid Form Submission
bidForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const val = Number(bidInput.value);
  placeBid(val);
  bidInput.value = '';
});

// Quick Bid Buttons
quickBidBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const inc = Number(btn.getAttribute('data-increment'));
    const targetBid = (currentAuction.currentBid || 0) + inc;
    placeBid(targetBid);
  });
});

// Tab Persona Switcher
personaBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const user = btn.getAttribute('data-user');
    updateActivePersona(user);
  });
});

// Sound FX Toggle
soundToggleBtn.addEventListener('click', () => {
  soundEnabled = !soundEnabled;
  soundIcon.textContent = soundEnabled ? '🔊' : '🔇';
  showToast(`Sound FX ${soundEnabled ? 'Enabled' : 'Muted'}`);
});

// Reset Auction (Testing & Demo Helper)
resetAuctionBtn.addEventListener('click', () => {
  socket.emit('auction:reset', { auctionId: currentAuctionId });
});

modalResetBtn.addEventListener('click', () => {
  socket.emit('auction:reset', { auctionId: currentAuctionId });
});

modalCloseBtn.addEventListener('click', () => {
  soldModal.classList.add('hidden');
});

// Outbid Banner Close
closeOutbidBtn.addEventListener('click', () => {
  hideOutbidBanner();
});

// User Identity Modal
changeUserBtn.addEventListener('click', () => {
  usernameInput.value = currentUsername;
  userModal.classList.remove('hidden');
  usernameInput.focus();
});

saveUsernameBtn.addEventListener('click', () => {
  const newName = usernameInput.value.trim();
  if (newName) {
    updateActivePersona(newName);
    userModal.classList.add('hidden');
  }
});

cancelUsernameBtn.addEventListener('click', () => {
  userModal.classList.add('hidden');
});

// Initialize on window load
window.addEventListener('DOMContentLoaded', () => {
  updateActivePersona(currentUsername);
  updateNextMinBidDisplay();
});

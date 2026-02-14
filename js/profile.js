// ========== profile.js - Complete Profile Management ==========

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
  getAuth, 
  onAuthStateChanged,
  signOut,
  updateProfile,
  updateEmail,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  getFirestore,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  getDoc,
  doc,
  updateDoc,
  deleteDoc,
  addDoc,
  serverTimestamp,
  increment,
  onSnapshot,
  runTransaction
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

// ========== FIREBASE CONFIG ==========
const firebaseConfig = {
  apiKey: "AIzaSyCVYHKeB4TXobILCAygM8JIVisKqUGiJ1s",
  authDomain: "sewalink-ead02.firebaseapp.com",
  projectId: "sewalink-ead02",
  storageBucket: "sewalink-ead02.firebasestorage.app",
  messagingSenderId: "682952754486",
  appId: "1:682952754486:web:c0bba16496d78234aa1f97"
};

// ========== INITIALIZE FIREBASE ==========
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// ========== STATE ==========
let currentUser = null;
let profileUser = null;
let isOwnProfile = false;
let activeTab = 'overview';
let portfolioItems = [];
let reviews = [];
let jobs = [];
let giftStats = {
  sent: { count: 0, total: 0 },
  received: { count: 0, total: 0 }
};

// ========== DOM ELEMENTS ==========
const profileContainer = document.getElementById('profileContainer');
const authUI = document.getElementById('authUI');

// ========== INITIALIZATION ==========
document.addEventListener('DOMContentLoaded', () => {
  // Check if viewing someone else's profile
  const urlParams = new URLSearchParams(window.location.search);
  const profileId = urlParams.get('id');
  
  if (profileId) {
    loadProfile(profileId);
  } else {
    // Viewing own profile - requires authentication
    onAuthStateChanged(auth, (user) => {
      if (user) {
        currentUser = user;
        loadProfile(user.uid);
      } else {
        window.location.href = 'sign-in.html?redirect=profile.html';
      }
    });
  }
});

// ========== LOAD PROFILE ==========
async function loadProfile(userId) {
  try {
    profileContainer.innerHTML = `
      <div class="loading-spinner">
        <i class="fas fa-spinner fa-spin"></i>
        <p>Loading profile...</p>
      </div>
    `;

    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);
    
    if (!userSnap.exists()) {
      profileContainer.innerHTML = `
        <div class="error-message">
          <i class="fas fa-exclamation-triangle"></i>
          <h3>User Not Found</h3>
          <p>The profile you're looking for doesn't exist.</p>
          <a href="index.html" class="btn btn-primary">Go Home</a>
        </div>
      `;
      return;
    }

    profileUser = { id: userId, ...userSnap.data() };
    isOwnProfile = auth.currentUser?.uid === userId;

    // Record profile view (if not own profile)
    if (!isOwnProfile && auth.currentUser) {
      await recordProfileView(userId);
    }

    // Load all profile data
    await Promise.all([
      loadPortfolio(userId),
      loadReviews(userId),
      loadJobs(userId),
      loadGiftStats(userId),
      loadFriendStatus(userId)
    ]);

    // Render profile
    renderProfile();

    // Set up real-time listeners
    setupRealtimeListeners(userId);

  } catch (error) {
    console.error('Error loading profile:', error);
    profileContainer.innerHTML = `
      <div class="error-message">
        <i class="fas fa-exclamation-triangle"></i>
        <h3>Error Loading Profile</h3>
        <p>${error.message}</p>
        <button onclick="location.reload()" class="btn btn-primary">Try Again</button>
      </div>
    `;
  }
}

// ========== RENDER PROFILE ==========
function renderProfile() {
  const template = `
    <div class="profile-wrapper">
      <!-- Profile Header -->
      <div class="profile-header">
        <div class="profile-cover">
          <img src="${profileUser.coverPhoto || 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=1200'}" alt="Cover">
          ${isOwnProfile ? `
            <button class="edit-cover-btn" onclick="openCoverModal()">
              <i class="fas fa-camera"></i> Edit Cover
            </button>
          ` : ''}
        </div>
        
        <div class="profile-info">
          <div class="profile-avatar-wrapper">
            <img src="${profileUser.photoURL || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(profileUser.displayName || 'User') + '&background=667eea&color=fff&size=150'}" 
                 class="profile-avatar">
            ${isOwnProfile ? `
              <button class="edit-avatar-btn" onclick="openAvatarModal()">
                <i class="fas fa-camera"></i>
              </button>
            ` : ''}
          </div>
          
          <div class="profile-details">
            <h1>${escapeHTML(profileUser.displayName || 'User')}</h1>
            <p class="profile-username">@${profileUser.username || profileUser.email?.split('@')[0] || 'user'}</p>
            
            <div class="profile-meta">
              <span><i class="fas fa-map-marker-alt"></i> ${profileUser.location || 'Location not set'}</span>
              <span><i class="fas fa-briefcase"></i> ${profileUser.occupation || 'Not specified'}</span>
              <span><i class="fas fa-calendar"></i> Joined ${formatDate(profileUser.createdAt)}</span>
            </div>
            
            <div class="profile-bio">
              ${profileUser.bio || 'No bio yet.'}
            </div>
            
            <div class="profile-stats">
              <div class="stat">
                <span class="stat-value">${profileViews}</span>
                <span class="stat-label">Profile Views</span>
              </div>
              <div class="stat">
                <span class="stat-value">${portfolioItems.length}</span>
                <span class="stat-label">Portfolio</span>
              </div>
              <div class="stat">
                <span class="stat-value">${reviews.length}</span>
                <span class="stat-label">Reviews</span>
              </div>
              <div class="stat">
                <span class="stat-value">${profileUser.coins || 0}</span>
                <span class="stat-label">Coins</span>
              </div>
            </div>
            
            <div class="profile-actions">
              ${renderProfileActions()}
            </div>
          </div>
        </div>
      </div>

      <!-- Profile Tabs -->
      <div class="profile-tabs">
        <button class="tab-btn ${activeTab === 'overview' ? 'active' : ''}" onclick="switchTab('overview')">
          <i class="fas fa-user"></i> Overview
        </button>
        <button class="tab-btn ${activeTab === 'portfolio' ? 'active' : ''}" onclick="switchTab('portfolio')">
          <i class="fas fa-briefcase"></i> Portfolio
        </button>
        <button class="tab-btn ${activeTab === 'reviews' ? 'active' : ''}" onclick="switchTab('reviews')">
          <i class="fas fa-star"></i> Reviews
        </button>
        <button class="tab-btn ${activeTab === 'jobs' ? 'active' : ''}" onclick="switchTab('jobs')">
          <i class="fas fa-briefcase"></i> Jobs
        </button>
        <button class="tab-btn ${activeTab === 'gifts' ? 'active' : ''}" onclick="switchTab('gifts')">
          <i class="fas fa-gift"></i> Gifts
        </button>
      </div>

      <!-- Profile Content -->
      <div class="profile-content">
        ${renderTabContent()}
      </div>
    </div>
  `;

  profileContainer.innerHTML = template;
  document.title = `${profileUser.displayName || 'User'} - SewaLink Profile`;
}

// ========== RENDER PROFILE ACTIONS ==========
function renderProfileActions() {
  if (isOwnProfile) {
    return `
      <button class="btn btn-primary" onclick="editProfile()">
        <i class="fas fa-edit"></i> Edit Profile
      </button>
      <button class="btn btn-outline" onclick="shareProfile()">
        <i class="fas fa-share-alt"></i> Share
      </button>
      <a href="settings.html" class="btn btn-outline">
        <i class="fas fa-cog"></i> Settings
      </a>
    `;
  } else if (auth.currentUser) {
    return `
      <button class="btn btn-primary" onclick="sendMessage('${profileUser.id}')">
        <i class="fas fa-envelope"></i> Message
      </button>
      <button class="btn btn-outline" onclick="toggleFriend('${profileUser.id}')" id="friendBtn">
        ${friendStatus === 'friends' ? 'Unfriend' : friendStatus === 'pending' ? 'Request Sent' : 'Add Friend'}
      </button>
      <button class="btn btn-outline" onclick="sendGift('${profileUser.id}')">
        <i class="fas fa-gift"></i> Send Gift
      </button>
    `;
  } else {
    return `
      <a href="sign-in.html?redirect=profile.html?id=${profileUser.id}" class="btn btn-primary">
        <i class="fas fa-sign-in-alt"></i> Sign in to Interact
      </a>
    `;
  }
}

// ========== RENDER TAB CONTENT ==========
function renderTabContent() {
  switch(activeTab) {
    case 'overview':
      return renderOverviewTab();
    case 'portfolio':
      return renderPortfolioTab();
    case 'reviews':
      return renderReviewsTab();
    case 'jobs':
      return renderJobsTab();
    case 'gifts':
      return renderGiftsTab();
    default:
      return renderOverviewTab();
  }
}

// ========== OVERVIEW TAB ==========
function renderOverviewTab() {
  return `
    <div class="tab-pane active">
      <div class="grid-2">
        <!-- About Section -->
        <div class="card">
          <h3>About</h3>
          <div class="about-content">
            <p><strong>Full Name:</strong> ${escapeHTML(profileUser.displayName || 'Not set')}</p>
            <p><strong>Email:</strong> ${escapeHTML(profileUser.email || 'Not set')}</p>
            <p><strong>Phone:</strong> ${escapeHTML(profileUser.phone || 'Not set')}</p>
            <p><strong>Location:</strong> ${escapeHTML(profileUser.location || 'Not set')}</p>
            <p><strong>Occupation:</strong> ${escapeHTML(profileUser.occupation || 'Not set')}</p>
            <p><strong>Website:</strong> ${profileUser.website ? `<a href="${profileUser.website}" target="_blank">${profileUser.website}</a>` : 'Not set'}</p>
          </div>
        </div>

        <!-- Skills Section -->
        <div class="card">
          <h3>Skills</h3>
          <div class="skills-list">
            ${(profileUser.skills || []).map(skill => `
              <span class="skill-tag">${escapeHTML(skill)}</span>
            `).join('')}
            ${(!profileUser.skills || profileUser.skills.length === 0) ? '<p>No skills added yet.</p>' : ''}
          </div>
        </div>

        <!-- Gift Statistics -->
        <div class="card">
          <h3><i class="fas fa-gift"></i> Gift Statistics</h3>
          <div class="gift-stats">
            <div class="stat-item">
              <span class="stat-label">Gifts Sent</span>
              <span class="stat-value">${giftStats.sent.count}</span>
              <span class="stat-sub">${giftStats.sent.total} coins</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Gifts Received</span>
              <span class="stat-value">${giftStats.received.count}</span>
              <span class="stat-sub">${giftStats.received.total} coins</span>
            </div>
          </div>
          ${!isOwnProfile && auth.currentUser ? `
            <button class="btn btn-primary btn-block" onclick="sendGift('${profileUser.id}')">
              <i class="fas fa-gift"></i> Send a Gift
            </button>
          ` : ''}
          ${isOwnProfile ? `
            <a href="send-gift.html" class="btn btn-primary btn-block">
              <i class="fas fa-gift"></i> Send a Gift
            </a>
          ` : ''}
        </div>

        <!-- Recent Activity -->
        <div class="card">
          <h3>Recent Activity</h3>
          <div class="activity-list">
            ${renderRecentActivity()}
          </div>
        </div>
      </div>
    </div>
  `;
}

// ========== GIFT STATISTICS FUNCTION ==========
function renderGiftSection(giftStats) {
  return `
    <div class="card">
      <h3><i class="fas fa-gift"></i> Gift Statistics</h3>
      <div class="gift-stats-grid">
        <div class="gift-stat-card sent">
          <div class="stat-icon">
            <i class="fas fa-paper-plane"></i>
          </div>
          <div class="stat-details">
            <span class="stat-label">Gifts Sent</span>
            <span class="stat-value">${giftStats.sent.count}</span>
            <span class="stat-total">${giftStats.sent.total} coins</span>
          </div>
        </div>
        
        <div class="gift-stat-card received">
          <div class="stat-icon">
            <i class="fas fa-gift"></i>
          </div>
          <div class="stat-details">
            <span class="stat-label">Gifts Received</span>
            <span class="stat-value">${giftStats.received.count}</span>
            <span class="stat-total">${giftStats.received.total} coins</span>
          </div>
        </div>
      </div>

      <div class="gift-actions">
        ${isOwnProfile ? `
          <a href="send-gift.html" class="btn btn-primary">
            <i class="fas fa-gift"></i> Send a Gift
          </a>
        ` : auth.currentUser ? `
          <button class="btn btn-primary" onclick="sendGift('${profileUser.id}')">
            <i class="fas fa-gift"></i> Send Gift
          </button>
        ` : ''}
        
        <a href="gift-history.html${isOwnProfile ? '' : '?user=' + profileUser.id}" class="btn btn-outline">
          <i class="fas fa-history"></i> View All
        </a>
      </div>
    </div>
  `;
}

// ========== GIFTS TAB ==========
function renderGiftsTab() {
  return `
    <div class="tab-pane active">
      <h2>Gift History</h2>
      
      <div class="gift-summary">
        <div class="summary-card sent">
          <i class="fas fa-arrow-up"></i>
          <div>
            <span class="label">Total Sent</span>
            <span class="value">${giftStats.sent.count} gifts</span>
            <span class="sub">${giftStats.sent.total} coins</span>
          </div>
        </div>
        
        <div class="summary-card received">
          <i class="fas fa-arrow-down"></i>
          <div>
            <span class="label">Total Received</span>
            <span class="value">${giftStats.received.count} gifts</span>
            <span class="sub">${giftStats.received.total} coins</span>
          </div>
        </div>
      </div>

      <div class="gift-filters">
        <button class="filter-btn active" onclick="filterGifts('all')">All</button>
        <button class="filter-btn" onclick="filterGifts('sent')">Sent</button>
        <button class="filter-btn" onclick="filterGifts('received')">Received</button>
      </div>

      <div id="giftsList" class="gifts-list">
        <!-- Gifts will be loaded here -->
      </div>
    </div>
  `;
}

// ========== LOAD GIFT STATISTICS ==========
async function loadGiftStats(userId) {
  try {
    const giftsRef = collection(db, 'gifts');
    
    const sentQuery = query(giftsRef, where('senderId', '==', userId));
    const receivedQuery = query(giftsRef, where('receiverId', '==', userId));

    const [sentSnapshot, receivedSnapshot] = await Promise.all([
      getDocs(sentQuery),
      getDocs(receivedQuery)
    ]);

    let sentTotal = 0;
    let receivedTotal = 0;
    let sentCount = 0;
    let receivedCount = 0;
    let allGifts = [];

    sentSnapshot.forEach(doc => {
      const gift = doc.data();
      sentTotal += gift.amount || 0;
      sentCount++;
      allGifts.push({ id: doc.id, ...gift, direction: 'sent' });
    });

    receivedSnapshot.forEach(doc => {
      const gift = doc.data();
      receivedTotal += gift.amount || 0;
      receivedCount++;
      allGifts.push({ id: doc.id, ...gift, direction: 'received' });
    });

    giftStats = {
      sent: { count: sentCount, total: sentTotal },
      received: { count: receivedCount, total: receivedTotal },
      all: allGifts.sort((a, b) => {
        const timeA = a.createdAt?.toDate?.() || new Date(0);
        const timeB = b.createdAt?.toDate?.() || new Date(0);
        return timeB - timeA;
      })
    };

    // Update gifts list if on gifts tab
    if (activeTab === 'gifts') {
      renderGiftsList();
    }

  } catch (error) {
    console.error('Error loading gift stats:', error);
  }
}

// ========== RENDER GIFTS LIST ==========
function renderGiftsList(filter = 'all') {
  const container = document.getElementById('giftsList');
  if (!container) return;

  let filteredGifts = giftStats.all;
  if (filter === 'sent') {
    filteredGifts = giftStats.all.filter(g => g.direction === 'sent');
  } else if (filter === 'received') {
    filteredGifts = giftStats.all.filter(g => g.direction === 'received');
  }

  if (filteredGifts.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-gift"></i>
        <p>No gifts ${filter !== 'all' ? filter : ''} yet</p>
      </div>
    `;
    return;
  }

  let html = '';
  filteredGifts.forEach(gift => {
    const time = gift.createdAt ? formatTimeAgo(gift.createdAt.toDate()) : 'Unknown';
    
    html += `
      <div class="gift-item ${gift.direction}">
        <div class="gift-icon">
          <i class="fas fa-gift"></i>
        </div>
        <div class="gift-info">
          <div class="gift-header">
            <span class="gift-user">
              ${gift.direction === 'sent' ? 'To: ' + escapeHTML(gift.receiverName) : 'From: ' + escapeHTML(gift.senderName)}
            </span>
            <span class="gift-amount">${gift.amount} coins</span>
          </div>
          ${gift.message ? `<div class="gift-message">"${escapeHTML(gift.message)}"</div>` : ''}
          <div class="gift-footer">
            <span class="gift-type">${gift.type || 'general'}</span>
            <span class="gift-time">${time}</span>
          </div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

// ========== FILTER GIFTS ==========
window.filterGifts = function(filter) {
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  event.currentTarget.classList.add('active');
  renderGiftsList(filter);
};

// ========== SEND GIFT FUNCTION ==========
window.sendGift = function(receiverId) {
  window.location.href = `send-gift.html?id=${receiverId}`;
};

// ========== PORTFOLIO TAB ==========
function renderPortfolioTab() {
  return `
    <div class="tab-pane active">
      <div class="portfolio-header">
        <h2>Portfolio</h2>
        ${isOwnProfile ? `
          <button class="btn btn-primary" onclick="openPortfolioModal()">
            <i class="fas fa-plus"></i> Add Item
          </button>
        ` : ''}
      </div>
      
      <div class="portfolio-grid">
        ${portfolioItems.map(item => `
          <div class="portfolio-card">
            ${item.image ? `<img src="${item.image}" alt="${item.title}" class="portfolio-image">` : ''}
            <div class="portfolio-content">
              <h3>${escapeHTML(item.title)}</h3>
              <p>${escapeHTML(item.description || '')}</p>
              ${item.link ? `<a href="${item.link}" target="_blank" class="portfolio-link">View Project</a>` : ''}
            </div>
            ${isOwnProfile ? `
              <div class="portfolio-actions">
                <button class="btn-icon" onclick="editPortfolio('${item.id}')">
                  <i class="fas fa-edit"></i>
                </button>
                <button class="btn-icon" onclick="deletePortfolio('${item.id}')">
                  <i class="fas fa-trash"></i>
                </button>
              </div>
            ` : ''}
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

// ========== REVIEWS TAB ==========
function renderReviewsTab() {
  return `
    <div class="tab-pane active">
      <div class="reviews-header">
        <h2>Reviews</h2>
        ${!isOwnProfile && auth.currentUser ? `
          <button class="btn btn-primary" onclick="openReviewModal()">
            <i class="fas fa-star"></i> Write Review
          </button>
        ` : ''}
      </div>
      
      <div class="reviews-summary">
        <div class="average-rating">
          <span class="rating-value">${calculateAverageRating()}</span>
          <div class="stars">
            ${renderStars(calculateAverageRating())}
          </div>
          <span class="review-count">${reviews.length} reviews</span>
        </div>
      </div>
      
      <div class="reviews-list">
        ${reviews.map(review => `
          <div class="review-card">
            <div class="review-header">
              <img src="${review.reviewerPhoto || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(review.reviewerName || 'User')}" class="reviewer-avatar">
              <div>
                <h4>${escapeHTML(review.reviewerName || 'Anonymous')}</h4>
                <div class="stars">${renderStars(review.rating)}</div>
              </div>
              <span class="review-date">${formatDate(review.createdAt)}</span>
            </div>
            <p class="review-content">${escapeHTML(review.content || '')}</p>
          </div>
        `).join('')}
        ${reviews.length === 0 ? '<p class="no-reviews">No reviews yet.</p>' : ''}
      </div>
    </div>
  `;
}

// ========== JOBS TAB ==========
function renderJobsTab() {
  return `
    <div class="tab-pane active">
      <h2>Jobs</h2>
      <div class="jobs-list">
        ${jobs.map(job => `
          <div class="job-card">
            <h3>${escapeHTML(job.title)}</h3>
            <p>${escapeHTML(job.description || '')}</p>
            <div class="job-meta">
              <span>Budget: ${job.budget ? 'रु ' + job.budget : 'Not specified'}</span>
              <span>Status: ${job.status}</span>
            </div>
            <a href="job-details.html?id=${job.id}" class="btn btn-outline">View Job</a>
          </div>
        `).join('')}
        ${jobs.length === 0 ? '<p class="no-jobs">No jobs yet.</p>' : ''}
      </div>
    </div>
  `;
}

// ========== LOAD PORTFOLIO ==========
async function loadPortfolio(userId) {
  try {
    const portfolioQuery = query(
      collection(db, 'portfolio'),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc')
    );
    
    const snapshot = await getDocs(portfolioQuery);
    portfolioItems = [];
    snapshot.forEach(doc => {
      portfolioItems.push({ id: doc.id, ...doc.data() });
    });
  } catch (error) {
    console.error('Error loading portfolio:', error);
  }
}

// ========== LOAD REVIEWS ==========
async function loadReviews(userId) {
  try {
    const reviewsQuery = query(
      collection(db, 'reviews'),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc')
    );
    
    const snapshot = await getDocs(reviewsQuery);
    reviews = [];
    snapshot.forEach(doc => {
      reviews.push({ id: doc.id, ...doc.data() });
    });
  } catch (error) {
    console.error('Error loading reviews:', error);
  }
}

// ========== LOAD JOBS ==========
async function loadJobs(userId) {
  try {
    const jobsQuery = query(
      collection(db, 'jobs'),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc'),
      limit(10)
    );
    
    const snapshot = await getDocs(jobsQuery);
    jobs = [];
    snapshot.forEach(doc => {
      jobs.push({ id: doc.id, ...doc.data() });
    });
  } catch (error) {
    console.error('Error loading jobs:', error);
  }
}

// ========== RECORD PROFILE VIEW ==========
async function recordProfileView(userId) {
  try {
    await addDoc(collection(db, 'profileViews'), {
      userId: userId,
      viewerId: auth.currentUser.uid,
      viewedAt: serverTimestamp()
    });
    
    // Increment view count
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      profileViews: increment(1)
    });
  } catch (error) {
    console.error('Error recording profile view:', error);
  }
}

// ========== FRIEND SYSTEM ==========
let friendStatus = null;

async function loadFriendStatus(userId) {
  if (!auth.currentUser) return;
  
  try {
    const friendsRef = collection(db, 'friends');
    
    // Check if already friends
    const friendsQuery = query(
      friendsRef,
      where('users', 'array-contains', auth.currentUser.uid),
      where('status', '==', 'accepted')
    );
    
    const friendsSnapshot = await getDocs(friendsQuery);
    let isFriend = false;
    friendsSnapshot.forEach(doc => {
      if (doc.data().users.includes(userId)) {
        isFriend = true;
      }
    });
    
    if (isFriend) {
      friendStatus = 'friends';
      return;
    }
    
    // Check pending requests
    const requestsQuery = query(
      collection(db, 'friendRequests'),
      where('senderId', '==', auth.currentUser.uid),
      where('receiverId', '==', userId),
      where('status', '==', 'pending')
    );
    
    const requestsSnapshot = await getDocs(requestsQuery);
    if (!requestsSnapshot.empty) {
      friendStatus = 'pending';
    } else {
      friendStatus = null;
    }
    
  } catch (error) {
    console.error('Error loading friend status:', error);
  }
}

window.toggleFriend = async function(userId) {
  if (!auth.currentUser) {
    window.location.href = 'sign-in.html';
    return;
  }
  
  try {
    const btn = document.getElementById('friendBtn');
    btn.disabled = true;
    
    if (friendStatus === 'friends') {
      // Unfriend
      const friendsQuery = query(
        collection(db, 'friends'),
        where('users', 'array-contains', auth.currentUser.uid),
        where('status', '==', 'accepted')
      );
      
      const snapshot = await getDocs(friendsQuery);
      snapshot.forEach(async (doc) => {
        if (doc.data().users.includes(userId)) {
          await deleteDoc(doc.ref);
        }
      });
      
      friendStatus = null;
      btn.innerHTML = 'Add Friend';
      
    } else if (friendStatus === 'pending') {
      // Cancel request
      const requestsQuery = query(
        collection(db, 'friendRequests'),
        where('senderId', '==', auth.currentUser.uid),
        where('receiverId', '==', userId),
        where('status', '==', 'pending')
      );
      
      const snapshot = await getDocs(requestsQuery);
      snapshot.forEach(async (doc) => {
        await deleteDoc(doc.ref);
      });
      
      friendStatus = null;
      btn.innerHTML = 'Add Friend';
      
    } else {
      // Send friend request
      await addDoc(collection(db, 'friendRequests'), {
        senderId: auth.currentUser.uid,
        senderName: auth.currentUser.displayName || 'User',
        receiverId: userId,
        receiverName: profileUser.displayName || 'User',
        status: 'pending',
        createdAt: serverTimestamp()
      });
      
      // Create notification
      await addDoc(collection(db, 'notifications'), {
        userId: userId,
        type: 'friend_request',
        title: 'Friend Request',
        message: `${auth.currentUser.displayName || 'User'} sent you a friend request`,
        data: {
          senderId: auth.currentUser.uid,
          senderName: auth.currentUser.displayName || 'User'
        },
        read: false,
        createdAt: serverTimestamp()
      });
      
      friendStatus = 'pending';
      btn.innerHTML = 'Request Sent';
    }
    
    btn.disabled = false;
    
  } catch (error) {
    console.error('Error toggling friend:', error);
    alert('Failed to update friend status');
    btn.disabled = false;
  }
};

// ========== SEND MESSAGE ==========
window.sendMessage = function(userId) {
  window.location.href = `messages.html?user=${userId}`;
};

// ========== SHARE PROFILE ==========
window.shareProfile = function() {
  const url = window.location.href;
  
  if (navigator.share) {
    navigator.share({
      title: `${profileUser.displayName || 'User'}'s Profile`,
      text: `Check out ${profileUser.displayName || 'this user'}'s profile on SewaLink`,
      url: url
    }).catch(console.error);
  } else {
    navigator.clipboard.writeText(url).then(() => {
      alert('Profile link copied to clipboard!');
    });
  }
};

// ========== EDIT PROFILE ==========
window.editProfile = function() {
  window.location.href = 'settings.html?tab=profile';
};

// ========== PORTFOLIO MODALS ==========
window.openPortfolioModal = function() {
  // Implementation for portfolio modal
  console.log('Open portfolio modal');
};

window.editPortfolio = function(itemId) {
  console.log('Edit portfolio item:', itemId);
};

window.deletePortfolio = async function(itemId) {
  if (!confirm('Are you sure you want to delete this portfolio item?')) return;
  
  try {
    await deleteDoc(doc(db, 'portfolio', itemId));
    await loadPortfolio(profileUser.id);
    renderProfile();
    alert('Portfolio item deleted successfully');
  } catch (error) {
    console.error('Error deleting portfolio:', error);
    alert('Failed to delete portfolio item');
  }
};

// ========== REVIEW MODAL ==========
window.openReviewModal = function() {
  // Implementation for review modal
  console.log('Open review modal');
};

// ========== CALCULATE AVERAGE RATING ==========
function calculateAverageRating() {
  if (reviews.length === 0) return '0.0';
  const sum = reviews.reduce((acc, review) => acc + (review.rating || 0), 0);
  return (sum / reviews.length).toFixed(1);
}

// ========== RENDER STARS ==========
function renderStars(rating) {
  const fullStars = Math.floor(rating);
  const halfStar = rating % 1 >= 0.5;
  const emptyStars = 5 - Math.ceil(rating);
  
  let stars = '';
  for (let i = 0; i < fullStars; i++) stars += '<i class="fas fa-star"></i>';
  if (halfStar) stars += '<i class="fas fa-star-half-alt"></i>';
  for (let i = 0; i < emptyStars; i++) stars += '<i class="far fa-star"></i>';
  
  return stars;
}

// ========== RENDER RECENT ACTIVITY ==========
function renderRecentActivity() {
  // Combine different activities
  const activities = [
    ...reviews.map(r => ({
      type: 'review',
      date: r.createdAt,
      content: `Left a ${r.rating}-star review`,
      icon: 'star'
    })),
    ...giftStats.all.slice(0, 5).map(g => ({
      type: 'gift',
      date: g.createdAt,
      content: g.direction === 'sent' ? `Sent ${g.amount} coins` : `Received ${g.amount} coins`,
      icon: 'gift'
    }))
  ].sort((a, b) => {
    const dateA = a.date?.toDate?.() || new Date(0);
    const dateB = b.date?.toDate?.() || new Date(0);
    return dateB - dateA;
  }).slice(0, 5);

  if (activities.length === 0) {
    return '<p class="no-activity">No recent activity</p>';
  }

  return activities.map(activity => `
    <div class="activity-item">
      <i class="fas fa-${activity.icon}"></i>
      <div>
        <p>${activity.content}</p>
        <small>${formatTimeAgo(activity.date)}</small>
      </div>
    </div>
  `).join('');
}

// ========== HELPER FUNCTIONS ==========
function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDate(timestamp) {
  if (!timestamp) return 'Unknown';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function formatTimeAgo(date) {
  if (!date) return 'Unknown';
  const seconds = Math.floor((new Date() - date) / 1000);
  
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

// ========== SWITCH TAB ==========
window.switchTab = function(tab) {
  activeTab = tab;
  
  // Update active tab button
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  event.currentTarget.classList.add('active');
  
  // Update content
  document.querySelector('.profile-content').innerHTML = renderTabContent();
  
  // Load specific data if needed
  if (tab === 'gifts') {
    renderGiftsList();
  }
};

// ========== SETUP REALTIME LISTENERS ==========
function setupRealtimeListeners(userId) {
  // Listen for new gifts
  const giftsRef = collection(db, 'gifts');
  const giftsQuery = query(
    giftsRef,
    where('senderId', '==', userId),
    orderBy('createdAt', 'desc'),
    limit(1)
  );
  
  onSnapshot(giftsQuery, () => {
    loadGiftStats(userId);
  });
}

// ========== EXPORT FUNCTIONS ==========
export {
  loadProfile,
  sendGift,
  toggleFriend,
  sendMessage,
  shareProfile,
  editProfile
};

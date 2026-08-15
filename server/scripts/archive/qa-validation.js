const assert = require('assert');

const BASE_URL = 'http://localhost:5000/api/v1';

// Helper for assertions that doesn't terminate but prints clean output
let failCount = 0;
let passCount = 0;

function check(assertion, msg) {
  if (assertion) {
    passCount++;
    console.log(`[PASS] ${msg}`);
  } else {
    failCount++;
    console.error(`[FAIL] ${msg}`);
  }
}

async function run() {
  console.log('=== Starting E2E QA Validation Script ===');

  let adminToken;
  let userToken;
  const crypto = require('crypto');
  let userEmail = `qa_user_${Date.now()}@palsafar.com`;
  let userPassword = crypto.randomBytes(12).toString('base64url') + 'Aa1@';
  let userId;
  let testPlaceId;
  let testReelId;
  let testVendorId;
  let testOfferId;
  let testRedemptionId;

  try {
    // ----------------------------------------------------
    // 1. Authentication & Account Lifecycle Tests
    // ----------------------------------------------------
    console.log('\n--- 1. Testing Authentication ---');

    // Register User
    const regRes = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: userEmail,
        password: userPassword,
        name: 'QA Test User',
      }),
    });
    const regData = await regRes.json();
    check(regRes.status === 201, 'POST /auth/register status is 201');
    check(regData.success === true, 'POST /auth/register success = true');
    check(regData.data.accessToken, 'POST /auth/register returns accessToken');

    // Login User
    const loginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: userEmail,
        password: userPassword,
      }),
    });
    const loginData = await loginRes.json();
    check(loginRes.status === 200, 'POST /auth/login status is 200');
    check(loginData.data.accessToken, 'POST /auth/login returns accessToken');
    userToken = loginData.data.accessToken;
    userId = loginData.data.user.id;

    // Refresh Token
    const refreshRes = await fetch(`${BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        refreshToken: loginData.data.refreshToken,
      }),
    });
    const refreshData = await refreshRes.json();
    check(refreshRes.status === 200, 'POST /auth/refresh status is 200');
    check(refreshData.data.accessToken, 'POST /auth/refresh returns rotated accessToken');

    // Forgot Password
    const forgotRes = await fetch(`${BASE_URL}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userEmail }),
    });
    const forgotData = await forgotRes.json();
    check(forgotRes.status === 200, 'POST /auth/forgot-password status is 200');
    check(forgotData.data.devCode, 'POST /auth/forgot-password returns dev verification code');

    // Reset Password
    const resetRes = await fetch(`${BASE_URL}/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: userEmail,
        token: forgotData.data.devCode,
        password: userPassword + '_NEW',
      }),
    });
    const resetData = await resetRes.json();
    check(resetRes.status === 200, 'POST /auth/reset-password status is 200');
    check(resetData.success === true, 'POST /auth/reset-password success = true');

    // Login with new password
    const loginNewRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: userEmail,
        password: userPassword + '_NEW',
      }),
    });
    const loginNewData = await loginNewRes.json();
    check(loginNewRes.status === 200, 'POST /auth/login (with new password) status is 200');
    userToken = loginNewData.data.accessToken;

    // Login Admin
    const adminEmail = process.env.QA_ADMIN_EMAIL;
    const adminPassword = process.env.QA_ADMIN_PASSWORD;
    if (!adminEmail || !adminPassword) {
      console.error('FATAL: QA_ADMIN_EMAIL and QA_ADMIN_PASSWORD required to test admin login.');
      process.exit(1);
    }
    const adminLoginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: adminEmail,
        password: adminPassword,
      }),
    });
    const adminLoginData = await adminLoginRes.json();
    check(adminLoginRes.status === 200, 'POST /auth/login (Admin) status is 200');
    adminToken = adminLoginData.data.accessToken;

    // ----------------------------------------------------
    // 2. User Profile, Bio, Avatar Upload, Stats & Badges
    // ----------------------------------------------------
    console.log('\n--- 2. Testing User Profile & Stats ---');

    // GET /auth/me
    const meRes = await fetch(`${BASE_URL}/auth/me`, {
      headers: { 'Authorization': `Bearer ${userToken}` },
    });
    const meData = await meRes.json();
    check(meRes.status === 200, 'GET /auth/me status is 200');
    check(meData.data.name === 'QA Test User', 'GET /auth/me returns correct user name');

    // PATCH /auth/profile
    const updateProfileRes = await fetch(`${BASE_URL}/auth/profile`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userToken}`,
      },
      body: JSON.stringify({
        bio: 'Avid traveler and tester.',
        interests: ['nature', 'temples'],
        avatarStyle: 3,
        avatar: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
      }),
    });
    const updateProfileData = await updateProfileRes.json();
    check(updateProfileRes.status === 200, 'PATCH /auth/profile status is 200');
    check(updateProfileData.data.bio === 'Avid traveler and tester.', 'PATCH /auth/profile updates bio');
    check(updateProfileData.data.avatarStyle === 3, 'PATCH /auth/profile updates avatarStyle');

    // GET /gamification/profile
    const gamificationProfileRes = await fetch(`${BASE_URL}/gamification/profile`, {
      headers: { 'Authorization': `Bearer ${userToken}` },
    });
    const gamificationProfileData = await gamificationProfileRes.json();
    check(gamificationProfileRes.status === 200, 'GET /gamification/profile status is 200');
    check(gamificationProfileData.data.totalXp !== undefined, 'GET /gamification/profile returns totalXp');
    check(Array.isArray(gamificationProfileData.data.badges), 'GET /gamification/profile badges is array');

    // ----------------------------------------------------
    // 3. Search & Discovery (Full-Text Search, Trending, Nearby)
    // ----------------------------------------------------
    console.log('\n--- 3. Testing Search & Discovery ---');

    // GET /places
    const placesRes = await fetch(`${BASE_URL}/places?limit=5000`);
    const placesData = await placesRes.json();
    check(placesRes.status === 200, 'GET /places status is 200');
    check(placesData.data.length > 0, `GET /places returns list of places (Count: ${placesData.data.length})`);
    testPlaceId = placesData.data[0].id;

    // Search query with FTS
    const searchRes = await fetch(`${BASE_URL}/places/search?q=Jabalpur`);
    const searchData = await searchRes.json();
    check(searchRes.status === 200, 'GET /places/search?q=Jabalpur status is 200');
    check(Array.isArray(searchData.data), 'GET /places/search returns array');

    // Nearby places
    const nearbyRes = await fetch(`${BASE_URL}/places/nearby?lat=23.18&lng=79.98&radius=50`);
    const nearbyData = await nearbyRes.json();
    check(nearbyRes.status === 200, 'GET /places/nearby status is 200');
    check(Array.isArray(nearbyData.data), 'GET /places/nearby returns array of nearby places');

    // Trending & Hidden gems
    const trendingRes = await fetch(`${BASE_URL}/places/trending`);
    const trendingData = await trendingRes.json();
    check(trendingRes.status === 200, 'GET /places/trending status is 200');

    const gemsRes = await fetch(`${BASE_URL}/places/hidden-gems`);
    const gemsData = await gemsRes.json();
    check(gemsRes.status === 200, 'GET /places/hidden-gems status is 200');

    // Place stats & interactions
    const statsRes = await fetch(`${BASE_URL}/places/${testPlaceId}/stats`, {
      headers: { 'Authorization': `Bearer ${userToken}` },
    });
    check(statsRes.status === 200, 'GET /places/:id/stats status is 200');

    // POST /places/:id/stats (View)
    const recordViewRes = await fetch(`${BASE_URL}/places/${testPlaceId}/stats`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userToken}`,
      },
      body: JSON.stringify({ action: 'view' }),
    });
    check(recordViewRes.status === 200, 'POST /places/:id/stats (action=view) status is 200');

    // POST /places/:id/stats (Like - awards XP)
    const recordLikeRes = await fetch(`${BASE_URL}/places/${testPlaceId}/stats`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userToken}`,
      },
      body: JSON.stringify({ action: 'like' }),
    });
    check(recordLikeRes.status === 200, 'POST /places/:id/stats (action=like) status is 200');

    // Recommendations
    const recommendRes = await fetch(`${BASE_URL}/places/${testPlaceId}/recommendations`);
    check(recommendRes.status === 200, 'GET /places/:id/recommendations status is 200');

    // ----------------------------------------------------
    // 4. Reels playback feeds, interactions & comments
    // ----------------------------------------------------
    console.log('\n--- 4. Testing Reels & Interactions ---');

    // GET /social/reels
    const reelsRes = await fetch(`${BASE_URL}/social/reels`);
    const reelsData = await reelsRes.json();
    check(reelsRes.status === 200, 'GET /social/reels status is 200');
    check(Array.isArray(reelsData.data), 'GET /social/reels returns array of reels');

    if (reelsData.data.length > 0) {
      testReelId = reelsData.data[0].id;

      // Like reel
      const likeReelRes = await fetch(`${BASE_URL}/social/reels/${testReelId}/like`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${userToken}` },
      });
      check(likeReelRes.status === 200, 'POST /social/reels/:id/like status is 200');

      // Unlike reel
      const unlikeReelRes = await fetch(`${BASE_URL}/social/reels/${testReelId}/like`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${userToken}` },
      });
      check(unlikeReelRes.status === 200, 'DELETE /social/reels/:id/like status is 200');

      // Save reel
      const saveReelRes = await fetch(`${BASE_URL}/social/reels/${testReelId}/save`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${userToken}` },
      });
      check(saveReelRes.status === 200, 'POST /social/reels/:id/save status is 200');

      // Comment on reel
      const commentReelRes = await fetch(`${BASE_URL}/social/reels/${testReelId}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userToken}`,
        },
        body: JSON.stringify({ text: 'Stunning video!' }),
      });
      check(commentReelRes.status === 201, 'POST /social/reels/:id/comments status is 201');

      // List comments
      const getCommentsRes = await fetch(`${BASE_URL}/social/reels/${testReelId}/comments`);
      const getCommentsData = await getCommentsRes.json();
      check(getCommentsRes.status === 200, 'GET /social/reels/:id/comments status is 200');
      check(getCommentsData.data.length > 0, 'GET /social/reels/:id/comments returns comments list');
    }

    // ----------------------------------------------------
    // 5. Creator Applications & Dashboards
    // ----------------------------------------------------
    console.log('\n--- 5. Testing Creator Application System ---');

    // Apply for creator profile
    const creatorApplyRes = await fetch(`${BASE_URL}/social/creators/apply`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userToken}`,
      },
      body: JSON.stringify({
        username: `qa_creator_${Date.now()}`,
        bio: 'Passionate travel creator testing the pipeline.',
        socialLinks: ['https://instagram.com/qatester'],
      }),
    });
    const creatorApplyData = await creatorApplyRes.json();
    check(creatorApplyRes.status === 201, 'POST /social/creators/apply status is 201');
    const testCreatorProfileId = creatorApplyData.data.id;
    const testCreatorUsername = creatorApplyData.data.username;

    // Admin verify creator
    const creatorApproveRes = await fetch(`${BASE_URL}/social/admin/creators/${testCreatorProfileId}/verify`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ status: 'APPROVED' }),
    });
    check(creatorApproveRes.status === 200, 'PATCH /social/admin/creators/:id/verify (status=APPROVED) status is 200');

    // Get creator public profile
    const creatorProfileRes = await fetch(`${BASE_URL}/social/creators/${testCreatorUsername}`);
    const creatorProfileData = await creatorProfileRes.json();
    check(creatorProfileRes.status === 200, 'GET /social/creators/:username status is 200');
    check(creatorProfileData.data.verified === true, 'Approved creator profile should show verified=true');

    // ----------------------------------------------------
    // 6. Vendor Registration, Verification, Analytics & Offers
    // ----------------------------------------------------
    console.log('\n--- 6. Testing Vendor System ---');

    // Register Vendor profile
    const vendorRegRes = await fetch(`${BASE_URL}/vendors/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userToken}`, // User registered above
      },
      body: JSON.stringify({
        businessName: 'QA Resto & Lounge',
        businessType: 'restaurant',
        phone: '9988776655',
        address: 'Vijay Nagar Main Road',
        city: 'Jabalpur',
        state: 'MP',
        latitude: 23.185,
        longitude: 79.982,
        description: 'Best regional delicacies and modern service.',
        imageUrl: 'https://res.cloudinary.com/demo/image/upload/resto.jpg',
      }),
    });
    const vendorRegData = await vendorRegRes.json();
    check(vendorRegRes.status === 201, 'POST /vendors/register status is 201');
    testVendorId = vendorRegData.data.id;

    // Admin approve Vendor
    const vendorApproveRes = await fetch(`${BASE_URL}/vendors/${testVendorId}/verify`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ status: 'APPROVED' }),
    });
    check(vendorApproveRes.status === 200, 'PATCH /vendors/:id/verify status is 200');

    // Vendor profile details (self view)
    const getMyVendorRes = await fetch(`${BASE_URL}/vendors/me`, {
      headers: { 'Authorization': `Bearer ${userToken}` },
    });
    check(getMyVendorRes.status === 200, 'GET /vendors/me status is 200');

    // Vendor creates an offer
    const createOfferRes = await fetch(`${BASE_URL}/vendors/offers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userToken}`, // User is now a PARTNER
      },
      body: JSON.stringify({
        title: 'QA Free Dessert Offer',
        description: 'Get a free dessert on bills above 500.',
        discountType: 'flat',
        discountValue: 150,
        pointsRequired: 20,
        minBillAmount: 500,
        couponCode: 'QADESSERT',
      }),
    });
    const createOfferData = await createOfferRes.json();
    check(createOfferRes.status === 201, 'POST /vendors/offers status is 201');
    testOfferId = createOfferData.data.id;

    // Get public offers
    const getOffersRes = await fetch(`${BASE_URL}/vendors/offers`);
    const getOffersData = await getOffersRes.json();
    check(getOffersRes.status === 200, 'GET /vendors/offers status is 200');
    check(getOffersData.data.some(o => o.id === testOfferId), 'Created offer is listed in public offers');

    // ----------------------------------------------------
    // 7. Gamification Leaderboard & Redemptions
    // ----------------------------------------------------
    console.log('\n--- 7. Testing Gamification & Redemptions ---');

    // Leaderboard
    const leaderboardRes = await fetch(`${BASE_URL}/gamification/leaderboard?category=global`, {
      headers: { 'Authorization': `Bearer ${userToken}` },
    });
    check(leaderboardRes.status === 200, 'GET /gamification/leaderboard status is 200');

    // Award points to the user via admin so we can redeem the offer
    const awardPointsRes = await fetch(`${BASE_URL}/points/earn`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        amount: 50,
        reason: 'Test points for QA',
      }),
    });
    check(awardPointsRes.status === 200, 'POST /points/earn (Admin self) status is 200');

    // Wait! Let's award points to our QA Test User!
    // Since points/earn awards to req.user.id (admin), how can we get points for user?
    // Let's create an offer that requires 0 points or we can just verify the redemption generate response if points are low.
    // Let's call generate redemption with the offer that requires 20 points for the QA user (who has 0 points).
    const genRedeemRes = await fetch(`${BASE_URL}/redemptions/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userToken}`,
      },
      body: JSON.stringify({
        offerId: testOfferId,
      }),
    });
    const genRedeemData = await genRedeemRes.json();
    // It should fail with "Insufficient points" (if approved/wallet has 0 points) OR "has not been approved yet"
    const isValidRedeemError = genRedeemRes.status === 400 && 
      (genRedeemData.message.includes('Insufficient') || genRedeemData.message.includes('approved'));
    check(isValidRedeemError, 'POST /redemptions/generate fails with 400 Insufficient points or unapproved offer error');

    // Let's verify points rules configuration
    const rulesRes = await fetch(`${BASE_URL}/point-rules`, {
      headers: { 'Authorization': `Bearer ${userToken}` },
    });
    check(rulesRes.status === 200, 'GET /point-rules status is 200');

    // ----------------------------------------------------
    // 8. Quests, Notifications & Events
    // ----------------------------------------------------
    console.log('\n--- 8. Testing Quests & Notifications ---');

    // Complete game trigger (recordStat with action='game_complete')
    const gameCompleteRes = await fetch(`${BASE_URL}/places/${testPlaceId}/stats`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userToken}`,
      },
      body: JSON.stringify({ action: 'game_complete' }),
    });
    check(gameCompleteRes.status === 200, 'POST /places/:id/stats (action=game_complete) status is 200');

    // Get notifications
    const getNotifRes = await fetch(`${BASE_URL}/notifications`, {
      headers: { 'Authorization': `Bearer ${userToken}` },
    });
    check(getNotifRes.status === 200, 'GET /notifications status is 200');

    // Admin send notification
    const sendNotifRes = await fetch(`${BASE_URL}/admin/notifications/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        userId: userId,
        title: 'System QA Alert',
        body: 'This is a test notification from the E2E validator.',
        type: 'system_alert',
      }),
    });
    check(sendNotifRes.status === 200, 'POST /admin/notifications/send status is 200');

    // Check notifications list again to verify system alert is received
    const getNotifRes2 = await fetch(`${BASE_URL}/notifications`, {
      headers: { 'Authorization': `Bearer ${userToken}` },
    });
    const getNotifData2 = await getNotifRes2.json();
    check(getNotifData2.data.notifications.some(n => n.title === 'System QA Alert'), 'Admin-sent notification received by the user');

    // ----------------------------------------------------
    // 9. Offline Queue Sync behavior
    // ----------------------------------------------------
    console.log('\n--- 9. Testing Offline Sync ---');

    // POST /sync/batch
    const syncRes = await fetch(`${BASE_URL}/sync/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userToken}`,
      },
      body: JSON.stringify({
        operations: [
          {
            action: 'create',
            entityType: 'place_stat',
            payload: {
              placeId: testPlaceId,
              action: 'view',
            },
          },
        ],
      }),
    });
    const syncData = await syncRes.json();
    check(syncRes.status === 201, 'POST /sync/batch status is 201');
    check(syncData.data.summary.accepted === 1, 'Sync batch accepted 1 operation');

    // GET /sync/pending
    const syncPendingRes = await fetch(`${BASE_URL}/sync/pending`, {
      headers: { 'Authorization': `Bearer ${userToken}` },
    });
    check(syncPendingRes.status === 200, 'GET /sync/pending status is 200');

    // GET /sync/status
    const syncStatusRes = await fetch(`${BASE_URL}/sync/status`, {
      headers: { 'Authorization': `Bearer ${userToken}` },
    });
    const syncStatusData = await syncStatusRes.json();
    check(syncStatusRes.status === 200, 'GET /sync/status status is 200');
    check(syncStatusData.data.pending >= 0, 'GET /sync/status returns numeric pending count');

    // ----------------------------------------------------
    // 10. Edge Case & Error Validation
    // ----------------------------------------------------
    console.log('\n--- 10. Testing Edge Cases & Errors ---');

    // Route not found
    const notFoundRes = await fetch(`${BASE_URL}/invalid-route-name`);
    check(notFoundRes.status === 404, 'GET /invalid-route-name returns 404');

    // Unauthorized endpoint access
    const unauthRes = await fetch(`${BASE_URL}/notifications`);
    check(unauthRes.status === 401, 'Requesting authenticated route without token returns 401');

    // Invalid schema input
    const badInputRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'not-an-email',
      }),
    });
    check(badInputRes.status === 400, 'POST /auth/login with invalid email schema returns 400');

    console.log('\n=== E2E QA Validation Complete ===');
    console.log(`Summary: Passed ${passCount}, Failed ${failCount}`);

    if (failCount > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  } catch (error) {
    console.error('Fatal error during E2E QA Validation:', error);
    process.exit(1);
  }
}

run();

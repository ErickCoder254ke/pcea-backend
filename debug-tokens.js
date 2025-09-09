// Backend FCM Token Verification Script
// Run: node debug-tokens.js

const mongoose = require('mongoose');
const User = require('./server/models/User');
require('dotenv').config();

async function debugTokens() {
  try {
    console.log("🔥 =======================================");
    console.log("🔍 BACKEND FCM TOKEN VERIFICATION");
    console.log("🔥 =======================================");

    // Connect to database
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/church-app';
    console.log("🔌 Connecting to MongoDB...");
    
    await mongoose.connect(mongoUri);
    console.log("✅ Connected to MongoDB");

    // Get user counts
    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ isActive: { $ne: false } });
    const usersWithTokens = await User.countDocuments({ 
      fcmToken: { $ne: null, $exists: true, $ne: '' },
      isActive: { $ne: false }
    });

    console.log("\n📊 DATABASE STATISTICS:");
    console.log(`├── Total Users: ${totalUsers}`);
    console.log(`├── Active Users: ${activeUsers}`);
    console.log(`├── Users with FCM Tokens: ${usersWithTokens}`);
    console.log(`└── Token Coverage: ${totalUsers > 0 ? ((usersWithTokens / totalUsers) * 100).toFixed(1) : 0}%`);

    if (usersWithTokens === 0) {
      console.log("\n❌ CRITICAL ISSUE: NO USERS HAVE FCM TOKENS!");
      console.log("   This explains why 'no user found with notification token' error occurs");
      
      // Check if users exist but tokens are empty/null
      const usersWithNullTokens = await User.countDocuments({
        $or: [
          { fcmToken: null },
          { fcmToken: { $exists: false } },
          { fcmToken: '' }
        ],
        isActive: { $ne: false }
      });
      
      console.log(`\n🔍 Users with NULL/empty tokens: ${usersWithNullTokens}`);
      
      // Show sample users without tokens
      const sampleUsers = await User.find({
        $or: [
          { fcmToken: null },
          { fcmToken: { $exists: false } },
          { fcmToken: '' }
        ],
        isActive: { $ne: false }
      }).select('name fcmToken lastLogin').limit(5);
      
      console.log("\n👥 SAMPLE USERS WITHOUT TOKENS:");
      sampleUsers.forEach((user, i) => {
        console.log(`   ${i + 1}. ${user.name} - Token: ${user.fcmToken || 'NULL'} - Last Login: ${user.lastLogin?.toLocaleDateString() || 'Never'}`);
      });

    } else {
      console.log("\n✅ USERS WITH TOKENS FOUND");
      
      // Show sample users with tokens
      const usersWithValidTokens = await User.find({
        fcmToken: { $ne: null, $exists: true, $ne: '' },
        isActive: { $ne: false }
      }).select('name fcmToken fcmTokenPlatform fcmTokenUpdated').limit(5);

      console.log("\n👥 SAMPLE USERS WITH TOKENS:");
      usersWithValidTokens.forEach((user, i) => {
        console.log(`   ${i + 1}. ${user.name}`);
        console.log(`      ├── Token: ${user.fcmToken.substring(0, 30)}...`);
        console.log(`      ├── Platform: ${user.fcmTokenPlatform || 'Unknown'}`);
        console.log(`      └── Updated: ${user.fcmTokenUpdated?.toLocaleDateString() || 'Unknown'}`);
      });
    }

    // Test the exact query that firebaseUtils uses
    console.log("\n🔍 TESTING EXACT BACKEND QUERY:");
    const backendQuery = {
      fcmToken: { $ne: null, $exists: true },
      isActive: { $ne: false }
    };

    const backendResults = await User.find(backendQuery).select('name fcmToken');
    console.log(`📊 Backend query results: ${backendResults.length} users`);

    if (backendResults.length === 0) {
      console.log("❌ CONFIRMED: Backend query finds NO users");
      console.log("   This is why notifications fail with 'no user found with notification token'");
      
      console.log("\n💡 POSSIBLE SOLUTIONS:");
      console.log("1. Users need to log in and get FCM tokens synced");
      console.log("2. Check frontend token sync process");
      console.log("3. Verify FCM token generation is working");
      console.log("4. Run frontend diagnostic: window.FCMTokenDebugger.runCompleteTokenDiagnosis()");
      
    } else {
      console.log("✅ Backend query finds users - notifications should work");
      backendResults.slice(0, 3).forEach((user, i) => {
        console.log(`   ${i + 1}. ${user.name}: ${user.fcmToken.substring(0, 30)}...`);
      });
    }

    // Check recent logins to see who should have tokens
    console.log("\n🕐 RECENT LOGIN ANALYSIS:");
    const recentLogins = await User.find({
      lastLogin: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }, // Last 7 days
      isActive: { $ne: false }
    }).select('name lastLogin fcmToken').sort({ lastLogin: -1 }).limit(10);

    console.log(`📱 Users who logged in recently (last 7 days): ${recentLogins.length}`);
    recentLogins.forEach((user, i) => {
      const hasToken = !!(user.fcmToken && user.fcmToken.length > 0);
      const status = hasToken ? '✅ HAS TOKEN' : '❌ NO TOKEN';
      console.log(`   ${i + 1}. ${user.name} - ${status} - ${user.lastLogin.toLocaleDateString()}`);
    });

    const recentWithoutTokens = recentLogins.filter(u => !u.fcmToken || u.fcmToken.length === 0);
    if (recentWithoutTokens.length > 0) {
      console.log(`\n⚠️ ${recentWithoutTokens.length} recent users don't have tokens!`);
      console.log("   These users should refresh their frontend to get tokens");
    }

  } catch (error) {
    console.error("❌ Error:", error.message);
    
    if (error.message.includes('ECONNREFUSED')) {
      console.log("\n💡 MongoDB connection failed - ensure MongoDB is running");
    } else if (error.message.includes('authentication')) {
      console.log("\n💡 MongoDB authentication failed - check credentials in .env");
    }
  } finally {
    await mongoose.disconnect();
    console.log("\n🔌 Disconnected from MongoDB");
  }
}

// Run the debug
debugTokens().then(() => {
  console.log("\n✅ Token verification complete");
  process.exit(0);
}).catch(error => {
  console.error("❌ Script failed:", error.message);
  process.exit(1);
});

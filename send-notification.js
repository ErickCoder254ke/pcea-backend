/**
 * Direct Backend Notification Sender
 * Run this script on your Glitch backend to send notifications directly
 * Usage: node send-notification.js "Title" "Message"
 */

const admin = require("firebase-admin");
const mongoose = require("mongoose");
require("dotenv").config();

// Initialize Firebase Admin (same as server.js)
try {
  let serviceAccount;

  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

    // Ensure PEM format is restored for Render/production environments
    if (serviceAccount.private_key) {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
    }
  } else {
    serviceAccount = require("./churchapp-3efc3-firebase-adminsdk-fbsvc-b52a2b3e0e.json");
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id,
  });

  console.log("✅ Firebase Admin SDK initialized");
} catch (error) {
  console.error("❌ Firebase initialization failed:", error.message);
  process.exit(1);
}

// User model (simplified)
const userSchema = new mongoose.Schema({
  name: String,
  fcmToken: String,
  fcmTokenPlatform: String,
});
const User = mongoose.model("User", userSchema);

// Main notification function
async function sendNotification(title, body, data = {}) {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("✅ Connected to MongoDB");

    // Get all users with FCM tokens
    const users = await User.find({
      fcmToken: { $ne: null, $exists: true },
    }).select("fcmToken fcmTokenPlatform name");

    const tokens = users.map((user) => user.fcmToken).filter((token) => token);

    if (!tokens.length) {
      console.log("❌ No FCM tokens found in database");
      console.log("💡 Make sure users have logged into the frontend app");
      return;
    }

    console.log(`🎯 Found ${tokens.length} FCM tokens`);

    // Prepare message
    const message = {
      notification: { title, body },
      data: {
        type: "script_notification",
        timestamp: new Date().toISOString(),
        ...data,
      },
      tokens,
    };

    console.log(`���� Sending notification: "${title}"`);

    // Send notification
    const response = await admin.messaging().sendEachForMulticast(message);

    console.log(`✅ Notification sent!`);
    console.log(`📊 Success: ${response.successCount}/${tokens.length}`);
    console.log(`❌ Failed: ${response.failureCount}`);

    if (response.failureCount > 0) {
      console.log("🔍 Failed tokens:");
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          console.log(`  - ${users[idx].name}: ${resp.error.code}`);
        }
      });
    }
  } catch (error) {
    console.error("❌ Error sending notification:", error.message);
  } finally {
    await mongoose.disconnect();
    console.log("👋 Disconnected from MongoDB");
    process.exit(0);
  }
}

// Command line usage
const title = process.argv[2] || "Test Notification";
const body =
  process.argv[3] || "This is a test notification from the backend script";

console.log("🚀 Backend Notification Sender");
console.log("=".repeat(50));
console.log(`📝 Title: ${title}`);
console.log(`📝 Body: ${body}`);
console.log("=".repeat(50));

// Send the notification
sendNotification(title, body);

// Export for programmatic use
module.exports = { sendNotification };

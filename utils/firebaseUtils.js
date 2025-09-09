const admin = require("firebase-admin");
require("dotenv").config();

let firebaseInitialized = false;

// Initialize Firebase Admin SDK
const initializeFirebase = () => {
  if (firebaseInitialized) {
    return;
  }

  try {
    let serviceAccount;

    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

      // Ensure PEM format is restored for Render/production environments
      if (serviceAccount.private_key) {
        serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
      }
    } else {
      // Fallback to local file
      serviceAccount = require("../churchapp-3efc3-firebase-adminsdk-fbsvc-b52a2b3e0e.json");
    }

    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: serviceAccount.project_id,
      });
    }

    firebaseInitialized = true;
    console.log("✅ Firebase Admin SDK initialized");
  } catch (error) {
    console.error("❌ Firebase initialization failed:", error.message);
    throw error;
  }
};

// Send FCM push notifications to multiple users
const sendPushNotifications = async (userIds, title, body, data = {}) => {
  try {
    // Initialize Firebase if not already done
    initializeFirebase();

    // Get User model
    const User = require('../server/models/User');

    // Get users with FCM tokens
    const users = await User.find({
      _id: { $in: userIds },
      fcmToken: { $ne: null, $exists: true },
      isActive: { $ne: false }
    }).select('_id fcmToken fcmTokenPlatform name');

    if (users.length === 0) {
      console.log("❌ No users found with FCM tokens for the specified user IDs");
      return {
        success: false,
        message: "No users found with notification tokens",
        stats: { successCount: 0, failureCount: 0, totalTargets: 0 }
      };
    }

    const tokens = users.map(user => user.fcmToken).filter(token => token);

    if (tokens.length === 0) {
      console.log("❌ No valid FCM tokens found");
      return {
        success: false,
        message: "No valid notification tokens found",
        stats: { successCount: 0, failureCount: 0, totalTargets: 0 }
      };
    }

    console.log(`🎯 Found ${tokens.length} FCM tokens for ${users.length} users`);

    // Prepare FCM message
    const message = {
      notification: { 
        title: title || "Church Notification",
        body: body || "You have a new message"
      },
      data: {
        type: "admin_notification",
        timestamp: new Date().toISOString(),
        ...Object.fromEntries(
          Object.entries(data).map(([key, value]) => [key, String(value)])
        )
      },
      android: {
        notification: {
          icon: "ic_stat_icon_config_sample",
          color: "#FFD700",
          sound: "default",
          clickAction: "FLUTTER_NOTIFICATION_CLICK"
        },
        priority: "high"
      },
      apns: {
        payload: {
          aps: {
            sound: "default",
            badge: 1,
            contentAvailable: true
          }
        },
        headers: {
          "apns-priority": "10",
          "apns-push-type": "alert"
        }
      },
      tokens: tokens
    };

    console.log(`🚀 Sending FCM notification: "${title}"`);

    // Send the notification
    const response = await admin.messaging().sendEachForMulticast(message);

    console.log(`✅ FCM notification sent!`);
    console.log(`📊 Success: ${response.successCount}/${tokens.length}`);
    console.log(`❌ Failed: ${response.failureCount}`);

    // Log failed tokens for debugging
    if (response.failureCount > 0) {
      console.log("🔍 Failed tokens:");
      response.responses.forEach((resp, idx) => {
        if (!resp.success && users[idx]) {
          console.log(`  - ${users[idx].name || 'Unknown'}: ${resp.error?.code || 'Unknown error'}`);
        }
      });
    }

    return {
      success: true,
      message: `Push notification sent to ${response.successCount}/${tokens.length} devices`,
      stats: {
        successCount: response.successCount,
        failureCount: response.failureCount,
        totalTargets: tokens.length
      },
      fcmResponse: response
    };

  } catch (error) {
    console.error("❌ Error sending FCM notifications:", error);
    return {
      success: false,
      message: "Failed to send push notifications",
      error: error.message,
      stats: { successCount: 0, failureCount: 0, totalTargets: 0 }
    };
  }
};

// Send to all users with FCM tokens
const sendToAllUsers = async (title, body, data = {}) => {
  try {
    // Get User model
    const User = require('../server/models/User');

    // Get all users with FCM tokens
    const users = await User.find({
      fcmToken: { $ne: null, $exists: true },
      isActive: { $ne: false }
    }).select('_id');

    const userIds = users.map(user => user._id);

    if (userIds.length === 0) {
      return {
        success: false,
        message: "No users found with notification tokens",
        stats: { successCount: 0, failureCount: 0, totalTargets: 0 }
      };
    }

    return await sendPushNotifications(userIds, title, body, data);

  } catch (error) {
    console.error("❌ Error sending to all users:", error);
    return {
      success: false,
      message: "Failed to send notifications to all users",
      error: error.message,
      stats: { successCount: 0, failureCount: 0, totalTargets: 0 }
    };
  }
};

// Check if Firebase is available
const isFirebaseAvailable = () => {
  try {
    initializeFirebase();
    return firebaseInitialized;
  } catch (error) {
    return false;
  }
};

module.exports = {
  initializeFirebase,
  sendPushNotifications,
  sendToAllUsers,
  isFirebaseAvailable
};

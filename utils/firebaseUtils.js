const admin = require("firebase-admin");
require("dotenv").config();

let firebaseInitialized = false;

// Initialize Firebase Admin SDK with enhanced validation
const initializeFirebase = () => {
  if (firebaseInitialized) {
    console.log("♻️ Firebase Admin SDK already initialized");
    return;
  }

  try {
    let serviceAccount;

    // Try to get service account from environment variable first
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      console.log("🔧 Loading Firebase service account from environment variable");

      try {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      } catch (parseError) {
        console.error("❌ Failed to parse FIREBASE_SERVICE_ACCOUNT JSON:", parseError.message);
        throw new Error("Invalid JSON in FIREBASE_SERVICE_ACCOUNT environment variable");
      }

      // Validate required fields
      const requiredFields = ['type', 'project_id', 'private_key_id', 'private_key', 'client_email'];
      const missingFields = requiredFields.filter(field => !serviceAccount[field]);

      if (missingFields.length > 0) {
        throw new Error(`Missing required fields in service account: ${missingFields.join(', ')}`);
      }

      // Ensure PEM format is restored for production environments
      if (serviceAccount.private_key) {
        // Replace literal \n with actual newlines
        serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");

        // Validate private key format
        if (!serviceAccount.private_key.includes('-----BEGIN PRIVATE KEY-----')) {
          console.warn("⚠️ Private key may not be in correct PEM format");
        }
      }

      console.log(`✅ Service account loaded for project: ${serviceAccount.project_id}`);
      console.log(`📧 Client email: ${serviceAccount.client_email}`);

    } else {
      // Fallback to local file
      console.log("🔧 Loading Firebase service account from local file");

      try {
        serviceAccount = require("../churchapp-3efc3-firebase-adminsdk-fbsvc-b52a2b3e0e.json");
        console.log("✅ Local service account file loaded");
      } catch (fileError) {
        console.error("❌ Failed to load local service account file:", fileError.message);
        throw new Error("No Firebase service account found. Set FIREBASE_SERVICE_ACCOUNT environment variable or provide local file.");
      }
    }

    // Initialize Firebase Admin if not already done
    if (!admin.apps.length) {
      console.log("🚀 Initializing Firebase Admin SDK...");

      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: serviceAccount.project_id,
      });

      console.log("✅ Firebase Admin SDK initialized successfully");
      console.log(`📱 Project ID: ${serviceAccount.project_id}`);
    } else {
      console.log("♻️ Firebase Admin SDK was already initialized by another process");
    }

    firebaseInitialized = true;

    // Test the initialization
    try {
      const messaging = admin.messaging();
      console.log("✅ Firebase Messaging service is ready");
    } catch (messagingError) {
      console.error("❌ Firebase Messaging initialization failed:", messagingError.message);
      throw messagingError;
    }

  } catch (error) {
    console.error("❌ Firebase initialization failed:", error.message);
    console.error("🔍 Troubleshooting tips:");
    console.error("   1. Verify FIREBASE_SERVICE_ACCOUNT environment variable is set");
    console.error("   2. Ensure the JSON is valid and properly escaped");
    console.error("   3. Check that all required fields are present");
    console.error("   4. Verify the service account has FCM permissions");

    firebaseInitialized = false;
    throw error;
  }
};

// Send FCM push notifications to multiple users with batching and token cleanup
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
        stats: { successCount: 0, failureCount: 0, totalTargets: 0, cleanedTokens: 0 }
      };
    }

    const validUsers = users.filter(user => user.fcmToken);

    if (validUsers.length === 0) {
      console.log("❌ No valid FCM tokens found");
      return {
        success: false,
        message: "No valid notification tokens found",
        stats: { successCount: 0, failureCount: 0, totalTargets: 0, cleanedTokens: 0 }
      };
    }

    console.log(`🎯 Found ${validUsers.length} valid FCM tokens for ${users.length} users`);

    // Prepare FCM message template
    const messageTemplate = {
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
      }
    };

    console.log(`🚀 Sending FCM notification: "${title}"`);

    // Split users into batches of 500 (FCM limit)
    const BATCH_SIZE = 500;
    const batches = [];
    for (let i = 0; i < validUsers.length; i += BATCH_SIZE) {
      batches.push(validUsers.slice(i, i + BATCH_SIZE));
    }

    console.log(`📦 Processing ${batches.length} batch(es) of notifications`);

    let totalSuccessCount = 0;
    let totalFailureCount = 0;
    let totalCleanedTokens = 0;
    const invalidTokenUserIds = [];

    // Process each batch
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      const tokens = batch.map(user => user.fcmToken);

      console.log(`📤 Sending batch ${batchIndex + 1}/${batches.length} (${tokens.length} tokens)`);

      const message = {
        ...messageTemplate,
        tokens: tokens
      };

      try {
        // Send the notification batch
        const response = await admin.messaging().sendEachForMulticast(message);

        totalSuccessCount += response.successCount;
        totalFailureCount += response.failureCount;

        console.log(`📊 Batch ${batchIndex + 1} - Success: ${response.successCount}/${tokens.length}, Failed: ${response.failureCount}`);

        // Process failed responses for token cleanup
        if (response.failureCount > 0) {
          console.log(`🔍 Processing ${response.failureCount} failed tokens in batch ${batchIndex + 1}:`);

          response.responses.forEach((resp, idx) => {
            if (!resp.success) {
              const user = batch[idx];
              const errorCode = resp.error?.code;
              const errorMessage = resp.error?.message || 'Unknown error';

              console.log(`  - ${user.name || 'Unknown'} (${user._id}): ${errorCode} - ${errorMessage}`);

              // Mark tokens for cleanup based on error codes
              if (errorCode === 'messaging/registration-token-not-registered' ||
                  errorCode === 'messaging/invalid-registration-token' ||
                  errorCode === 'messaging/invalid-argument') {
                invalidTokenUserIds.push(user._id);
                console.log(`    🗑️ Marking token for cleanup: ${errorCode}`);
              }
            }
          });
        }

      } catch (batchError) {
        console.error(`❌ Error sending batch ${batchIndex + 1}:`, batchError);
        totalFailureCount += tokens.length; // Count entire batch as failed
      }

      // Small delay between batches to avoid rate limiting
      if (batchIndex < batches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    // Clean up invalid tokens
    if (invalidTokenUserIds.length > 0) {
      console.log(`🧹 Cleaning up ${invalidTokenUserIds.length} invalid FCM tokens`);

      try {
        const cleanupResult = await User.updateMany(
          { _id: { $in: invalidTokenUserIds } },
          {
            $unset: { fcmToken: 1, fcmTokenPlatform: 1 },
            $set: { fcmTokenUpdated: new Date() }
          }
        );

        totalCleanedTokens = cleanupResult.modifiedCount;
        console.log(`✅ Cleaned up ${totalCleanedTokens} invalid tokens`);
      } catch (cleanupError) {
        console.error("❌ Error cleaning up invalid tokens:", cleanupError);
      }
    }

    console.log(`✅ FCM notification completed!`);
    console.log(`📊 Total Results: Success: ${totalSuccessCount}/${validUsers.length}, Failed: ${totalFailureCount}, Cleaned: ${totalCleanedTokens}`);

    return {
      success: totalSuccessCount > 0,
      message: `Push notification sent to ${totalSuccessCount}/${validUsers.length} devices` +
               (totalCleanedTokens > 0 ? `, cleaned ${totalCleanedTokens} invalid tokens` : ''),
      stats: {
        successCount: totalSuccessCount,
        failureCount: totalFailureCount,
        totalTargets: validUsers.length,
        cleanedTokens: totalCleanedTokens,
        batchesProcessed: batches.length
      }
    };

  } catch (error) {
    console.error("❌ Error sending FCM notifications:", error);
    return {
      success: false,
      message: "Failed to send push notifications: " + error.message,
      error: error.message,
      stats: { successCount: 0, failureCount: 0, totalTargets: 0, cleanedTokens: 0 }
    };
  }
};

// Send to all users with FCM tokens
const sendToAllUsers = async (title, body, data = {}) => {
  try {
    console.log("📢 Sending notification to all users...");

    // Get User model
    const User = require('../server/models/User');

    // Get all users with FCM tokens
    const users = await User.find({
      fcmToken: { $ne: null, $exists: true },
      isActive: { $ne: false }
    }).select('_id');

    const userIds = users.map(user => user._id);

    if (userIds.length === 0) {
      console.log("❌ No users found with FCM tokens");
      return {
        success: false,
        message: "No users found with notification tokens",
        stats: { successCount: 0, failureCount: 0, totalTargets: 0, cleanedTokens: 0 }
      };
    }

    console.log(`🎯 Targeting ${userIds.length} users for broadcast notification`);

    // Use the improved sendPushNotifications with batching and cleanup
    const result = await sendPushNotifications(userIds, title, body, data);

    console.log(`📊 Broadcast complete: ${result.stats.successCount} delivered, ${result.stats.cleanedTokens} tokens cleaned`);

    return result;

  } catch (error) {
    console.error("❌ Error sending to all users:", error);
    return {
      success: false,
      message: "Failed to send notifications to all users: " + error.message,
      error: error.message,
      stats: { successCount: 0, failureCount: 0, totalTargets: 0, cleanedTokens: 0 }
    };
  }
};

// Check if Firebase is available with detailed diagnostics
const isFirebaseAvailable = () => {
  try {
    initializeFirebase();

    if (firebaseInitialized) {
      // Additional checks
      const app = admin.app();
      const messaging = admin.messaging();

      console.log("✅ Firebase availability check passed");
      console.log(`📱 App name: ${app.name}`);
      console.log(`🔧 Project ID: ${app.options.projectId}`);

      return true;
    }

    return false;
  } catch (error) {
    console.error("❌ Firebase availability check failed:", error.message);
    return false;
  }
};

// Get Firebase status for debugging
const getFirebaseStatus = () => {
  try {
    const status = {
      initialized: firebaseInitialized,
      hasServiceAccount: !!process.env.FIREBASE_SERVICE_ACCOUNT,
      appsCount: admin.apps.length,
      timestamp: new Date().toISOString()
    };

    if (firebaseInitialized && admin.apps.length > 0) {
      const app = admin.app();
      status.projectId = app.options.projectId;
      status.appName = app.name;
    }

    return status;
  } catch (error) {
    return {
      initialized: false,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
};

module.exports = {
  initializeFirebase,
  sendPushNotifications,
  sendToAllUsers,
  isFirebaseAvailable,
  getFirebaseStatus
};

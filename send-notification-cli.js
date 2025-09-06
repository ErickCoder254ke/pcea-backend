#!/usr/bin/env node

/**
 * Enhanced CLI Notification Sender for Glitch
 *
 * Usage:
 * node send-notification-cli.js "Title" "Message" [type]
 *
 * Examples:
 * node send-notification-cli.js "Sunday Service" "Service starts at 9 AM"
 * node send-notification-cli.js "Prayer Meeting" "Join us for prayer" "prayer"
 *
 * Environment Variables:
 * - CLI_API_KEY: API key for CLI access (default: church-cli-2024)
 * - GLITCH_BACKEND_URL: Your Glitch backend URL (default: current domain)
 */

const axios = require("axios");

// Configuration
const DEFAULT_API_KEY = "church-cli-2024";
const API_KEY = process.env.CLI_API_KEY || DEFAULT_API_KEY;

// Determine backend URL
let BACKEND_URL;
if (process.env.GLITCH_BACKEND_URL) {
  BACKEND_URL = process.env.GLITCH_BACKEND_URL;
} else if (process.env.PROJECT_DOMAIN) {
  // Running on Glitch
  BACKEND_URL = `https://${process.env.PROJECT_DOMAIN}.glitch.me`;
} else {
  // Local development
  BACKEND_URL = "http://localhost:3000";
}

// Parse command line arguments
const title = process.argv[2];
const body = process.argv[3];
const type = process.argv[4] || "announcement";

// Validate arguments
if (!title || !body) {
  console.log("🚨 Error: Title and message are required");
  console.log("");
  console.log("📋 Usage:");
  console.log('  node send-notification-cli.js "Title" "Message" [type]');
  console.log("");
  console.log("📝 Examples:");
  console.log(
    '  node send-notification-cli.js "Sunday Service" "Service starts at 9 AM"',
  );
  console.log(
    '  node send-notification-cli.js "Prayer Meeting" "Join us for prayer" "prayer"',
  );
  console.log("");
  console.log("🎯 Available Types:");
  console.log("  - announcement (default)");
  console.log("  - prayer");
  console.log("  - service");
  console.log("  - event");
  console.log("  - reminder");
  console.log("  - general");
  console.log("");
  process.exit(1);
}

// Notification data
const notificationData = {
  title,
  body,
  type,
  apiKey: API_KEY,
};

// Send notification function
async function sendNotification() {
  try {
    console.log("🚀 CLI Notification Sender");
    console.log("=".repeat(50));
    console.log(`📝 Title: ${title}`);
    console.log(`📝 Message: ${body}`);
    console.log(`🏷️ Type: ${type}`);
    console.log(`🌐 Backend: ${BACKEND_URL}`);
    console.log("=".repeat(50));
    console.log("📤 Sending notification...");

    const response = await axios.post(
      `${BACKEND_URL}/api/cli/send-notification`,
      notificationData,
      {
        headers: {
          "Content-Type": "application/json",
        },
        timeout: 30000, // 30 second timeout
      },
    );

    if (response.data.success) {
      console.log("✅ Notification sent successfully!");
      console.log("");
      console.log("📊 Results:");
      console.log(`  • Total Targets: ${response.data.stats.totalTargets}`);
      console.log(`  • Successfully Sent: ${response.data.stats.successCount}`);
      console.log(`  • Failed: ${response.data.stats.failureCount}`);
      console.log(`  • Stored in Database: ${response.data.stats.storedInDB}`);

      if (response.data.stats.cleanedTokens > 0) {
        console.log(
          `  • Cleaned Invalid Tokens: ${response.data.stats.cleanedTokens}`,
        );
      }

      console.log("");
      console.log(`⏰ Sent at: ${response.data.timestamp}`);

      // Success rate
      const successRate = (
        (response.data.stats.successCount / response.data.stats.totalTargets) *
        100
      ).toFixed(1);
      console.log(`📈 Success Rate: ${successRate}%`);

      if (response.data.stats.failureCount > 0) {
        console.log("");
        console.log("⚠️ Some notifications failed to send. This is normal if:");
        console.log("  • Users have uninstalled the app");
        console.log("  • Devices are offline");
        console.log("  • FCM tokens have expired");
        console.log("  ✅ Invalid tokens were automatically cleaned up");
      }
    } else {
      console.log("❌ Notification failed:", response.data.message);
      if (response.data.hint) {
        console.log(`💡 Hint: ${response.data.hint}`);
      }
      if (response.data.usage) {
        console.log(`📋 Usage: ${response.data.usage}`);
      }
    }
  } catch (error) {
    console.log("❌ Error sending notification:");

    if (error.response) {
      // Server responded with error
      console.log(`   Status: ${error.response.status}`);
      console.log(
        `   Message: ${error.response.data?.message || "Unknown error"}`,
      );

      if (error.response.data?.debug) {
        console.log(
          `   Debug: ${JSON.stringify(error.response.data.debug, null, 2)}`,
        );
      }

      if (error.response.status === 401) {
        console.log("");
        console.log("🔑 Authentication Error Solutions:");
        console.log(`   1. Check your API key (current: ${API_KEY})`);
        console.log("   2. Set CLI_API_KEY environment variable");
        console.log("   3. Ensure backend is configured correctly");
      } else if (error.response.status === 503) {
        console.log("");
        console.log("🔧 Service Unavailable Solutions:");
        console.log("   1. Check Firebase configuration on backend");
        console.log(
          "   2. Verify FIREBASE_SERVICE_ACCOUNT environment variable",
        );
        console.log("   3. Ensure backend is running properly");
      }
    } else if (error.request) {
      // Network error
      console.log(`   Network Error: Cannot reach ${BACKEND_URL}`);
      console.log("");
      console.log("🌐 Network Troubleshooting:");
      console.log("   1. Check your internet connection");
      console.log("   2. Verify backend URL is correct");
      console.log("   3. Ensure backend server is running");
      console.log(`   4. Try: curl ${BACKEND_URL}/health`);
    } else {
      // Other error
      console.log(`   ${error.message}`);
    }

    console.log("");
    console.log("🆘 Need Help?");
    console.log("   1. Check backend logs on Glitch");
    console.log("   2. Test backend health: curl <backend-url>/health");
    console.log("   3. Verify FCM tokens: curl <backend-url>/api/fcm-status");

    process.exit(1);
  }
}

// Add helpful flags
if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log("🔔 CLI Notification Sender for PCEA Turi Church App");
  console.log("");
  console.log("📋 Usage:");
  console.log('  node send-notification-cli.js "Title" "Message" [type]');
  console.log("");
  console.log("📝 Examples:");
  console.log(
    '  node send-notification-cli.js "Sunday Service" "Service starts at 9 AM"',
  );
  console.log(
    '  node send-notification-cli.js "Prayer Meeting" "Join us for prayer" "prayer"',
  );
  console.log(
    '  node send-notification-cli.js "Youth Event" "Youth meeting tonight" "event"',
  );
  console.log("");
  console.log("🎯 Available Types:");
  console.log("  - announcement (default)");
  console.log("  - prayer");
  console.log("  - service");
  console.log("  - event");
  console.log("  - reminder");
  console.log("  - general");
  console.log("");
  console.log("🔧 Environment Variables:");
  console.log("  CLI_API_KEY         API key for authentication");
  console.log("  GLITCH_BACKEND_URL  Backend URL override");
  console.log("");
  console.log("📞 Status Commands:");
  console.log("  curl <backend-url>/health      - Check backend health");
  console.log(
    "  curl <backend-url>/api/fcm-status - Check notification readiness",
  );
  process.exit(0);
}

if (process.argv.includes("--version") || process.argv.includes("-v")) {
  console.log("CLI Notification Sender v2.0.0");
  process.exit(0);
}

// Run the notification sender
sendNotification();

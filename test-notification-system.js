#!/usr/bin/env node

/**
 * Comprehensive Notification System Test for Glitch
 *
 * This script tests the entire notification pipeline:
 * 1. Checks system status
 * 2. Verifies FCM tokens
 * 3. Sends test notification
 * 4. Verifies delivery
 *
 * Usage: node test-notification-system.js
 */

const axios = require("axios");

// Configuration
const API_KEY = process.env.CLI_API_KEY || "church-cli-2024";
const BACKEND_URL = process.env.PROJECT_DOMAIN
  ? `https://${process.env.PROJECT_DOMAIN}.glitch.me`
  : "http://localhost:3000";

class NotificationSystemTester {
  constructor() {
    this.results = {
      passed: 0,
      failed: 0,
      tests: [],
    };
  }

  log(message, type = "info") {
    const icons = {
      info: "ℹ️",
      success: "✅",
      error: "❌",
      warning: "⚠️",
      test: "🧪",
    };
    console.log(`${icons[type]} ${message}`);
  }

  async test(name, testFn) {
    this.log(`Testing: ${name}`, "test");
    try {
      await testFn();
      this.results.passed++;
      this.results.tests.push({ name, status: "PASSED" });
      this.log(`✅ ${name} - PASSED`, "success");
    } catch (error) {
      this.results.failed++;
      this.results.tests.push({ name, status: "FAILED", error: error.message });
      this.log(`❌ ${name} - FAILED: ${error.message}`, "error");
    }
  }

  async checkServerHealth() {
    const response = await axios.get(`${BACKEND_URL}/health`, {
      timeout: 10000,
    });

    if (!response.data.success) {
      throw new Error("Server health check failed");
    }

    if (response.data.services.firebase !== "connected") {
      throw new Error("Firebase not connected");
    }

    if (response.data.services.mongodb !== "connected") {
      throw new Error("MongoDB not connected");
    }

    this.log(
      `Server healthy - Users: ${response.data.services.userCount}, FCM Tokens: ${response.data.services.fcmTokenCount}`,
    );
  }

  async checkNotificationStatus() {
    const response = await axios.get(`${BACKEND_URL}/api/notification-status`, {
      timeout: 10000,
    });

    if (!response.data.success) {
      throw new Error("Notification status check failed");
    }

    const status = response.data.status;

    if (!status.system.firebaseInitialized) {
      throw new Error("Firebase not initialized");
    }

    if (!status.system.canSendNotifications) {
      throw new Error(
        `Cannot send notifications - Users: ${status.users.total}, With tokens: ${status.users.withTokens}`,
      );
    }

    this.log(
      `Notification system ready - ${status.users.withTokens}/${status.users.total} users (${status.users.tokenCoverage})`,
    );
    return status;
  }

  async checkFCMStatus() {
    const response = await axios.get(`${BACKEND_URL}/api/fcm-status`, {
      timeout: 10000,
    });

    if (!response.data.success) {
      throw new Error("FCM status check failed");
    }

    const data = response.data.data;

    if (!data.canSendNotifications) {
      throw new Error(
        `FCM not ready - Firebase: ${data.firebaseStatus}, Users with tokens: ${data.usersWithTokens}`,
      );
    }

    this.log(
      `FCM ready - ${data.usersWithTokens}/${data.totalUsers} users (${data.tokenCoverage})`,
    );
    return data;
  }

  async sendTestNotification() {
    const testTitle = `Test Notification ${new Date().toLocaleTimeString()}`;
    const testMessage =
      "This is an automated test notification from the system test script.";

    const response = await axios.post(
      `${BACKEND_URL}/api/cli/send-notification`,
      {
        title: testTitle,
        body: testMessage,
        type: "general",
        apiKey: API_KEY,
      },
      {
        headers: { "Content-Type": "application/json" },
        timeout: 30000,
      },
    );

    if (!response.data.success) {
      throw new Error(`Notification sending failed: ${response.data.message}`);
    }

    const stats = response.data.stats;

    if (stats.totalTargets === 0) {
      throw new Error("No targets found for notification");
    }

    if (stats.successCount === 0) {
      throw new Error(
        `All notifications failed - ${stats.failureCount}/${stats.totalTargets} failed`,
      );
    }

    const successRate = (
      (stats.successCount / stats.totalTargets) *
      100
    ).toFixed(1);
    this.log(
      `Notification sent - ${stats.successCount}/${stats.totalTargets} delivered (${successRate}%)`,
    );

    if (stats.failureCount > 0) {
      this.log(
        `${stats.failureCount} notifications failed (normal if users are offline)`,
        "warning",
      );
    }

    return response.data;
  }

  async testSimpleEndpoint() {
    const response = await axios.post(
      `${BACKEND_URL}/api/simple-notification-test`,
      {
        title: "Simple Test",
        body: "Testing simple notification endpoint",
      },
      {
        headers: { "Content-Type": "application/json" },
        timeout: 30000,
      },
    );

    if (!response.data.success) {
      throw new Error(`Simple endpoint failed: ${response.data.message}`);
    }

    const stats = response.data.stats;
    this.log(
      `Simple endpoint working - ${stats.successCount}/${stats.totalTokens} delivered`,
    );
  }

  async testCLIAuthentication() {
    // Test with wrong API key
    try {
      await axios.post(
        `${BACKEND_URL}/api/cli/send-notification`,
        {
          title: "Test",
          body: "Test",
          apiKey: "wrong-key",
        },
        {
          headers: { "Content-Type": "application/json" },
          timeout: 10000,
        },
      );
      throw new Error("CLI authentication should have failed with wrong key");
    } catch (error) {
      if (error.response && error.response.status === 401) {
        this.log("CLI authentication working correctly");
      } else {
        throw error;
      }
    }
  }

  async runAllTests() {
    console.log("🚀 Starting Comprehensive Notification System Test");
    console.log("═".repeat(60));
    console.log(`🌐 Backend URL: ${BACKEND_URL}`);
    console.log(`🔑 API Key: ${API_KEY}`);
    console.log("═".repeat(60));

    await this.test("Server Health Check", () => this.checkServerHealth());
    await this.test("Notification System Status", () =>
      this.checkNotificationStatus(),
    );
    await this.test("FCM Status Check", () => this.checkFCMStatus());
    await this.test("CLI Authentication", () => this.testCLIAuthentication());
    await this.test("Test Notification Sending", () =>
      this.sendTestNotification(),
    );
    await this.test("Simple Endpoint Test", () => this.testSimpleEndpoint());

    console.log("\n" + "═".repeat(60));
    console.log("📊 TEST RESULTS");
    console.log("═".repeat(60));

    this.results.tests.forEach((test) => {
      const icon = test.status === "PASSED" ? "✅" : "❌";
      console.log(`${icon} ${test.name}: ${test.status}`);
      if (test.error) {
        console.log(`   Error: ${test.error}`);
      }
    });

    console.log("\n📈 SUMMARY:");
    console.log(`   Passed: ${this.results.passed}`);
    console.log(`   Failed: ${this.results.failed}`);
    console.log(`   Total: ${this.results.passed + this.results.failed}`);

    const overallSuccess = this.results.failed === 0;

    if (overallSuccess) {
      console.log(
        "\n🎉 ALL TESTS PASSED! Notification system is working correctly.",
      );
      console.log("\n✅ What this means:");
      console.log("   • Backend server is healthy");
      console.log("   • Firebase FCM is properly configured");
      console.log("   • Users can receive notifications");
      console.log("   • CLI commands will work");
      console.log("   • Frontend integration should work");

      console.log("\n🚀 Quick commands to try:");
      console.log(
        "   npm run send              # Interactive notification sender",
      );
      console.log("   npm run send-test         # Send a quick test");
      console.log('   npm run notify "message"  # Send quick message');
    } else {
      console.log("\n❌ SOME TESTS FAILED. Check the errors above.");
      console.log("\n🔧 Troubleshooting:");
      console.log("   1. Check Glitch backend logs");
      console.log("   2. Verify Firebase service account in environment");
      console.log("   3. Ensure users have logged into the frontend app");
      console.log("   4. Check MongoDB connection");

      process.exit(1);
    }
  }
}

// Handle command line flags
if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log("🧪 Notification System Comprehensive Test");
  console.log("");
  console.log("This script tests the entire notification pipeline to ensure");
  console.log("everything is working correctly on your Glitch backend.");
  console.log("");
  console.log("Usage: node test-notification-system.js");
  console.log("");
  console.log("Environment Variables:");
  console.log("  CLI_API_KEY         API key for CLI access");
  console.log("  PROJECT_DOMAIN      Glitch project domain");
  console.log("");
  console.log("What it tests:");
  console.log("  • Server health and Firebase connection");
  console.log("  • FCM token availability");
  console.log("  • Notification sending capability");
  console.log("  • CLI authentication");
  console.log("  • End-to-end notification delivery");
  process.exit(0);
}

// Run the tests
const tester = new NotificationSystemTester();
tester.runAllTests().catch((error) => {
  console.error("\n💥 Unexpected error running tests:");
  console.error(error.message);
  console.error("\nStack trace:");
  console.error(error.stack);
  process.exit(1);
});

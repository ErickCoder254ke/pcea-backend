#!/usr/bin/env node

/**
 * Super simple notification sender for Glitch terminal
 * Usage: node send.js
 * Then follow the interactive prompts
 */

const readline = require("readline");
const axios = require("axios");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

console.log("🔔 PCEA Turi Church - Quick Notification Sender");
console.log("═".repeat(50));

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer);
    });
  });
}

async function sendNotification() {
  try {
    // Get notification details
    const title = await question("📝 Enter notification title: ");
    if (!title.trim()) {
      console.log("❌ Title is required!");
      return;
    }

    const message = await question("💬 Enter notification message: ");
    if (!message.trim()) {
      console.log("❌ Message is required!");
      return;
    }

    console.log("\n🎯 Available types:");
    console.log("1. announcement (default)");
    console.log("2. prayer");
    console.log("3. service");
    console.log("4. event");
    console.log("5. reminder");
    console.log("6. general");

    const typeChoice = await question(
      "\n🏷️ Choose type (1-6) or press Enter for default: ",
    );

    const typeMap = {
      1: "announcement",
      2: "prayer",
      3: "service",
      4: "event",
      5: "reminder",
      6: "general",
    };

    const type = typeMap[typeChoice] || "announcement";

    console.log("\n📋 Notification Summary:");
    console.log(`   Title: ${title}`);
    console.log(`   Message: ${message}`);
    console.log(`   Type: ${type}`);

    const confirm = await question("\n✅ Send this notification? (y/N): ");

    if (confirm.toLowerCase() !== "y" && confirm.toLowerCase() !== "yes") {
      console.log("❌ Notification cancelled");
      return;
    }

    console.log("\n📤 Sending notification...");

    // Determine backend URL
    const BACKEND_URL = process.env.PROJECT_DOMAIN
      ? `https://${process.env.PROJECT_DOMAIN}.glitch.me`
      : "http://localhost:3000";

    const response = await axios.post(
      `${BACKEND_URL}/api/cli/send-notification`,
      {
        title: title.trim(),
        body: message.trim(),
        type,
        apiKey: process.env.CLI_API_KEY || "church-cli-2024",
      },
      {
        headers: { "Content-Type": "application/json" },
        timeout: 30000,
      },
    );

    if (response.data.success) {
      console.log("\n✅ Notification sent successfully!");
      console.log(
        `📊 Results: ${response.data.stats.successCount}/${response.data.stats.totalTargets} delivered`,
      );

      if (response.data.stats.failureCount > 0) {
        console.log(
          `⚠️ ${response.data.stats.failureCount} failed (invalid tokens cleaned up)`,
        );
      }

      const successRate = (
        (response.data.stats.successCount / response.data.stats.totalTargets) *
        100
      ).toFixed(1);
      console.log(`📈 Success rate: ${successRate}%`);
    } else {
      console.log("❌ Failed to send notification:", response.data.message);
    }
  } catch (error) {
    console.log("\n❌ Error sending notification:");

    if (error.response) {
      console.log(`   Status: ${error.response.status}`);
      console.log(
        `   Error: ${error.response.data?.message || "Unknown error"}`,
      );

      if (error.response.status === 401) {
        console.log("\n💡 Try setting the CLI_API_KEY environment variable");
      } else if (error.response.status === 400) {
        console.log(
          "\n💡 Check that users have the app installed and logged in",
        );
      }
    } else if (error.request) {
      console.log("   Network error - check your connection");
    } else {
      console.log(`   ${error.message}`);
    }
  } finally {
    rl.close();
  }
}

// Run the interactive sender
sendNotification();

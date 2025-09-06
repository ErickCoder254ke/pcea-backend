#!/usr/bin/env node

/**
 * Simple wrapper for sending notifications quickly
 * Usage: node notify.js "Your message here"
 */

const { execSync } = require("child_process");

const message = process.argv.slice(2).join(" ");

if (!message) {
  console.log('Usage: node notify.js "Your message here"');
  console.log('Example: node notify.js "Service starts in 30 minutes"');
  process.exit(1);
}

// Default title based on time of day
const hour = new Date().getHours();
let defaultTitle = "Church Notification";

if (hour >= 6 && hour < 12) {
  defaultTitle = "Good Morning! ☀️";
} else if (hour >= 12 && hour < 17) {
  defaultTitle = "Church Update 📢";
} else if (hour >= 17 && hour < 21) {
  defaultTitle = "Evening Notice 🌅";
} else {
  defaultTitle = "Church Notice 🔔";
}

try {
  execSync(`node send-notification-cli.js "${defaultTitle}" "${message}"`, {
    stdio: "inherit",
  });
} catch (error) {
  console.error("Failed to send notification:", error.message);
  process.exit(1);
}

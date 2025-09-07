/**
 * Server Validation Script for Glitch
 * Run this to check if everything is properly configured
 * Usage: node validate-server.js
 */

const path = require("path");
const fs = require("fs");

console.log("🔍 Validating Glitch Server Configuration...");
console.log("=".repeat(50));

// Check Node.js version
console.log("📋 Node.js Version:", process.version);
console.log("🌐 Platform:", process.platform);
console.log("📁 Working Directory:", process.cwd());

// Check environment variables
console.log("\n🔧 Environment Variables:");
const requiredEnvVars = ["MONGO_URI", "JWT_SECRET"];
const optionalEnvVars = [
  "FIREBASE_SERVICE_ACCOUNT",
  "NODE_ENV",
  "PROJECT_DOMAIN",
];

requiredEnvVars.forEach((envVar) => {
  const exists = !!process.env[envVar];
  console.log(
    `  ${exists ? "✅" : "❌"} ${envVar}: ${exists ? "Set" : "Missing"}`,
  );
});

optionalEnvVars.forEach((envVar) => {
  const exists = !!process.env[envVar];
  console.log(
    `  ${exists ? "✅" : "⚠️"} ${envVar}: ${exists ? "Set" : "Not Set"}`,
  );
});

// Check Firebase service account file
console.log("\n🔥 Firebase Configuration:");
const firebaseKeyPath = path.join(
  __dirname,
  "churchapp-3efc3-firebase-adminsdk-fbsvc-b52a2b3e0e.json",
);
const hasFirebaseFile = fs.existsSync(firebaseKeyPath);
const hasFirebaseEnv = !!process.env.FIREBASE_SERVICE_ACCOUNT;

console.log(
  `  ${hasFirebaseFile ? "✅" : "❌"} Service Account File: ${hasFirebaseFile ? "Found" : "Missing"}`,
);
console.log(
  `  ${hasFirebaseEnv ? "✅" : "⚠️"} Environment Variable: ${hasFirebaseEnv ? "Set" : "Not Set"}`,
);

if (hasFirebaseFile) {
  try {
    const serviceAccount = require(firebaseKeyPath);
    const hasRequiredFields =
      serviceAccount.project_id &&
      serviceAccount.private_key &&
      serviceAccount.client_email;
    console.log(
      `  ${hasRequiredFields ? "✅" : "❌"} Valid Service Account: ${hasRequiredFields ? "Yes" : "No"}`,
    );
    if (hasRequiredFields) {
      console.log(`  📋 Project ID: ${serviceAccount.project_id}`);
    }
  } catch (error) {
    console.log(`  ❌ Service Account Parse Error: ${error.message}`);
  }
}

// Check required files
console.log("\n📂 Required Files:");
const requiredFiles = ["server.js", "package.json", "middlewares/auth.js"];

requiredFiles.forEach((file) => {
  const filePath = path.join(__dirname, file);
  const exists = fs.existsSync(filePath);
  console.log(
    `  ${exists ? "✅" : "❌"} ${file}: ${exists ? "Found" : "Missing"}`,
  );
});

// Test Firebase initialization
console.log("\n🔥 Testing Firebase Initialization:");
try {
  const admin = require("firebase-admin");

  // Clear any existing apps
  admin.apps.forEach((app) => app.delete());

  let serviceAccount;
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

    // Ensure PEM format is restored for Render/production environments
    if (serviceAccount.private_key) {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
    }

    console.log("  📋 Using environment variable for Firebase config");
  } else if (hasFirebaseFile) {
    serviceAccount = require(firebaseKeyPath);
    console.log("  📋 Using file for Firebase config");
  } else {
    throw new Error("No Firebase configuration found");
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id,
  });

  console.log("  ✅ Firebase Admin SDK initialized successfully");
  console.log(`  📋 Project ID: ${serviceAccount.project_id}`);
  console.log(`  📋 Client Email: ${serviceAccount.client_email}`);
} catch (error) {
  console.log(`  ❌ Firebase initialization failed: ${error.message}`);
}

// Test MongoDB connection
console.log("\n🍃 Testing MongoDB Connection:");
if (process.env.MONGO_URI) {
  const mongoose = require("mongoose");

  mongoose
    .connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    })
    .then(() => {
      console.log("  ✅ MongoDB connection successful");
      mongoose.disconnect();
    })
    .catch((error) => {
      console.log(`  ❌ MongoDB connection failed: ${error.message}`);
    });
} else {
  console.log("  ❌ MONGO_URI not set");
}

// Summary
console.log("\n" + "=".repeat(50));
console.log("📊 Validation Summary:");

const checks = {
  nodeVersion: parseFloat(process.version.slice(1)) >= 16,
  envVars: requiredEnvVars.every((envVar) => !!process.env[envVar]),
  firebaseConfig: hasFirebaseFile || hasFirebaseEnv,
  requiredFiles: requiredFiles.every((file) =>
    fs.existsSync(path.join(__dirname, file)),
  ),
};

Object.entries(checks).forEach(([check, passed]) => {
  console.log(
    `  ${passed ? "✅" : "❌"} ${check}: ${passed ? "PASS" : "FAIL"}`,
  );
});

const allPassed = Object.values(checks).every(Boolean);
console.log(
  `\n🎯 Overall Status: ${allPassed ? "✅ READY" : "❌ NEEDS ATTENTION"}`,
);

if (!allPassed) {
  console.log("\n💡 Next Steps:");
  if (!checks.envVars) {
    console.log("  1. Set required environment variables in .env file");
  }
  if (!checks.firebaseConfig) {
    console.log(
      "  2. Add Firebase service account file or environment variable",
    );
  }
  if (!checks.requiredFiles) {
    console.log("  3. Ensure all required files are present");
  }
}

console.log('\n🚀 Run "node server.js" to start the server');

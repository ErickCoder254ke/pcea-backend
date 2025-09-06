const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const dotenv = require("dotenv");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const cron = require("node-cron");
const admin = require("firebase-admin");
const verifyToken = require("./middlewares/auth"); // Middleware for authentication

dotenv.config(); // Load environment variables

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Firebase Admin SDK with better error handling for Glitch
let firebaseInitialized = false;
try {
  // Try to load service account from file or environment
  let serviceAccount;

  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    // From environment variable (recommended for production/Glitch)
    console.log("🔧 Loading Firebase config from environment variable...");
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  } else {
    // From file (for development)
    console.log("🔧 Loading Firebase config from file...");
    const fs = require("fs");
    const path = require("path");
    const keyPath = path.join(
      __dirname,
      "churchapp-3efc3-firebase-adminsdk-fbsvc-b52a2b3e0e.json",
    );

    if (fs.existsSync(keyPath)) {
      serviceAccount = require("./churchapp-3efc3-firebase-adminsdk-fbsvc-b52a2b3e0e.json");
    } else {
      throw new Error("Firebase service account key file not found");
    }
  }

  // Validate service account before initializing
  if (
    !serviceAccount.project_id ||
    !serviceAccount.private_key ||
    !serviceAccount.client_email
  ) {
    throw new Error("Invalid Firebase service account configuration");
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id,
  });

  firebaseInitialized = true;
  console.log("✅ Firebase Admin SDK initialized successfully");
  console.log(`🔥 Project ID: ${serviceAccount.project_id}`);
} catch (error) {
  console.error("❌ Firebase Admin SDK initialization failed:", error.message);
  console.error("🔍 Error details:", {
    hasEnvVar: !!process.env.FIREBASE_SERVICE_ACCOUNT,
    nodeEnv: process.env.NODE_ENV,
    cwd: process.cwd(),
  });
  console.log("📝 Firebase notifications will be disabled");
}

// Middleware
app.set("trust proxy", 1);

// Enhanced CORS configuration for Glitch
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or Postman)
    if (!origin) return callback(null, true);

    // List of allowed origins - updated for Glitch
    const allowedOrigins = [
      "http://localhost:3000",
      "http://localhost:5173",
      "http://localhost:8080",
      "https://pcea-backend-1.onrender.com", // Your Render backend
      // Add your frontend domains here
    ];

    // For Glitch, allow all origins in development
    const isGlitch = process.env.PROJECT_DOMAIN || process.env.GLITCH_PROJECT;
    if (isGlitch) {
      console.log(
        `🌐 CORS request from: ${origin} (Glitch mode: allowing all)`,
      );
      return callback(null, true);
    }

    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(null, true); // For development, allow all origins
    }
  },
  credentials: true,
  optionsSuccessStatus: 200, // For legacy browser support
};

app.use(cors(corsOptions));
app.use(express.json({ limit: "10mb" }));
app.use(helmet());

// Rate limiter for login attempts
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Increased limit for better UX
  message: {
    success: false,
    message: "Too many login attempts. Try again later.",
  },
});
app.use("/api/user/login", limiter);

// Rate limiter for notification endpoints
const notificationLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 20, // Allow 20 requests per minute
  message: {
    success: false,
    message: "Too many notification requests. Try again later.",
  },
});

// MongoDB Connection
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// Enhanced User Schema
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  currentPartner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null,
  },
  fcmToken: { type: String, default: null },
  fcmTokenPlatform: {
    type: String,
    enum: ["web", "native", "android", "ios"],
    default: "web",
  },
  fcmTokenUpdated: { type: Date, default: Date.now },
  lastLogin: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
});

userSchema.index({ phone: 1 }, { unique: true });
userSchema.index({ fcmToken: 1 });

const User = mongoose.model("User", userSchema);

// Notification Schema for storing user notifications
const notificationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  title: { type: String, required: true },
  message: { type: String, required: true },
  type: {
    type: String,
    enum: [
      "announcement",
      "prayer",
      "service",
      "event",
      "reminder",
      "welcome",
      "general",
    ],
    default: "general",
  },
  data: { type: mongoose.Schema.Types.Mixed, default: {} },
  read: { type: Boolean, default: false },
  readAt: { type: Date, default: null },
  receivedAt: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
});

notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, read: 1 });

const Notification = mongoose.model("Notification", notificationSchema);

// Prayer Partnership Schema for tracking pairing history
const prayerPartnershipSchema = new mongoose.Schema({
  user1: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  user2: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  pairDate: { type: Date, default: Date.now },
  weekNumber: { type: Number, required: true }, // Week number of the year
  year: { type: Number, required: true },
  isActive: { type: Boolean, default: true },
  notes: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now },
});

// Compound index to ensure unique partnerships per week
prayerPartnershipSchema.index(
  { user1: 1, user2: 1, weekNumber: 1, year: 1 },
  { unique: true },
);
prayerPartnershipSchema.index({ weekNumber: 1, year: 1, isActive: 1 });
prayerPartnershipSchema.index({ user1: 1, isActive: 1 });
prayerPartnershipSchema.index({ user2: 1, isActive: 1 });

const PrayerPartnership = mongoose.model(
  "PrayerPartnership",
  prayerPartnershipSchema,
);

// Import Routes
const eventsRouter = require("./server/routes/events");
const announcementsRouter = require("./server/routes/announcements");
const meditationRouter = require("./server/routes/meditation");
const galleryRouter = require("./server/routes/gallery");
const prayerPartnersRoute = require("./server/routes/prayerPartners");
const sermonRoutes = require("./server/routes/sermons");
const lyricsRoutes = require("./server/routes/lyrics");
const videoRoutes = require("./server/routes/video");
const userRoutes = require("./server/routes/profile");

// Health check endpoint with Glitch-specific info
app.get("/health", async (req, res) => {
  try {
    // Check MongoDB connection
    const mongoStatus =
      mongoose.connection.readyState === 1 ? "connected" : "disconnected";

    // Check Firebase
    const firebaseStatus =
      firebaseInitialized && admin.apps.length > 0
        ? "connected"
        : "not_connected";

    // Check users count (safely)
    let userCount = 0;
    let fcmTokenCount = 0;
    try {
      userCount = await User.countDocuments();
      fcmTokenCount = await User.countDocuments({
        fcmToken: { $ne: null, $exists: true },
      });
    } catch (dbError) {
      console.warn("⚠️ Could not fetch user stats:", dbError.message);
    }

    res.json({
      success: true,
      message: "Server is healthy",
      timestamp: new Date().toISOString(),
      environment: {
        node: process.version,
        platform: process.platform,
        glitch: !!process.env.PROJECT_DOMAIN,
        projectDomain: process.env.PROJECT_DOMAIN || "local",
      },
      services: {
        firebase: firebaseStatus,
        mongodb: mongoStatus,
        userCount,
        fcmTokenCount,
      },
      uptime: process.uptime(),
    });
  } catch (error) {
    console.error("❌ Health check error:", error);
    res.status(500).json({
      success: false,
      message: "Health check failed",
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// Public endpoint to check FCM tokens count (for testing)
app.get("/api/fcm-status", async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const usersWithTokens = await User.countDocuments({
      fcmToken: { $ne: null, $exists: true },
    });

    res.json({
      success: true,
      data: {
        totalUsers,
        usersWithTokens,
        tokenCoverage:
          totalUsers > 0
            ? `${((usersWithTokens / totalUsers) * 100).toFixed(1)}%`
            : "0%",
        firebaseStatus:
          firebaseInitialized && admin.apps.length > 0
            ? "connected"
            : "not_connected",
        canSendNotifications:
          firebaseInitialized && admin.apps.length > 0 && usersWithTokens > 0,
        firebaseInitialized,
        adminAppsCount: admin.apps.length,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("❌ Error checking FCM status:", err);
    res.status(500).json({
      success: false,
      message: "Failed to check FCM status",
      error: err.message,
    });
  }
});

// Notification system status endpoint
app.get("/api/notification-status", async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const usersWithTokens = await User.countDocuments({
      fcmToken: { $ne: null, $exists: true },
    });
    const totalNotifications = await Notification.countDocuments();
    const unreadNotifications = await Notification.countDocuments({
      read: false,
    });

    // Get recent notification stats
    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentNotifications = await Notification.countDocuments({
      createdAt: { $gte: last24Hours },
    });

    const status = {
      system: {
        firebaseInitialized,
        firebaseConnected: admin.apps.length > 0,
        mongoConnected: mongoose.connection.readyState === 1,
        canSendNotifications:
          firebaseInitialized && admin.apps.length > 0 && usersWithTokens > 0,
      },
      users: {
        total: totalUsers,
        withTokens: usersWithTokens,
        tokenCoverage:
          totalUsers > 0
            ? `${((usersWithTokens / totalUsers) * 100).toFixed(1)}%`
            : "0%",
      },
      notifications: {
        total: totalNotifications,
        unread: unreadNotifications,
        readRate:
          totalNotifications > 0
            ? `${(((totalNotifications - unreadNotifications) / totalNotifications) * 100).toFixed(1)}%`
            : "0%",
        last24Hours: recentNotifications,
      },
      endpoints: {
        cli: "/api/cli/send-notification",
        simple: "/api/simple-notification-test",
        bulk: "/api/notifications/send",
        userNotifications: "/api/user/notifications",
      },
      timestamp: new Date().toISOString(),
    };

    res.json({
      success: true,
      status,
      ready: status.system.canSendNotifications,
      message: status.system.canSendNotifications
        ? "Notification system is ready to send messages"
        : "Notification system needs configuration or users",
    });
  } catch (err) {
    console.error("❌ Error checking notification status:", err);
    res.status(500).json({
      success: false,
      message: "Failed to check notification status",
      error: err.message,
    });
  }
});

// Debug endpoint for Glitch troubleshooting
app.get("/api/debug", async (req, res) => {
  try {
    const debug = {
      server: {
        nodeVersion: process.version,
        platform: process.platform,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        env: {
          nodeEnv: process.env.NODE_ENV,
          projectDomain: process.env.PROJECT_DOMAIN,
          hasMongoUri: !!process.env.MONGO_URI,
          hasJwtSecret: !!process.env.JWT_SECRET,
          hasFirebaseEnv: !!process.env.FIREBASE_SERVICE_ACCOUNT,
        },
      },
      firebase: {
        initialized: firebaseInitialized,
        adminApps: admin.apps.length,
        hasServiceAccount:
          !!process.env.FIREBASE_SERVICE_ACCOUNT ||
          require("fs").existsSync(
            "./churchapp-3efc3-firebase-adminsdk-fbsvc-b52a2b3e0e.json",
          ),
      },
      database: {
        mongoState: mongoose.connection.readyState,
        mongoStateText:
          ["disconnected", "connected", "connecting", "disconnecting"][
            mongoose.connection.readyState
          ] || "unknown",
      },
      timestamp: new Date().toISOString(),
    };

    // Safe user count check
    try {
      debug.users = {
        total: await User.countDocuments(),
        withTokens: await User.countDocuments({
          fcmToken: { $ne: null, $exists: true },
        }),
      };
    } catch (dbError) {
      debug.users = { error: dbError.message };
    }

    res.json({
      success: true,
      debug,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack,
    });
  }
});

// Enhanced FCM Token Update with better Glitch handling
app.post("/api/user/update-fcm-token", verifyToken, async (req, res) => {
  try {
    const { fcmToken, platform, timestamp } = req.body;

    // Enhanced validation
    if (!fcmToken || typeof fcmToken !== "string") {
      return res.status(400).json({
        success: false,
        message: "Valid FCM Token string is required",
        received: typeof fcmToken,
      });
    }

    if (!platform || !["web", "native", "android", "ios"].includes(platform)) {
      return res.status(400).json({
        success: false,
        message: "Valid platform is required (web, native, android, ios)",
        received: platform,
      });
    }

    // Check if user ID exists
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        message: "Invalid user authentication",
      });
    }

    console.log(
      `📱 Updating FCM token for user ${req.user.id} on platform: ${platform}`,
    );
    console.log(
      `🔑 Token: ${fcmToken.substring(0, 20)}... (length: ${fcmToken.length})`,
    );

    // Check MongoDB connection
    if (mongoose.connection.readyState !== 1) {
      console.error("❌ MongoDB not connected");
      return res.status(503).json({
        success: false,
        message: "Database connection error",
      });
    }

    // Update user with new token
    const updateData = {
      fcmToken,
      fcmTokenPlatform: platform,
      fcmTokenUpdated: new Date(),
    };

    const updatedUser = await User.findByIdAndUpdate(req.user.id, updateData, {
      new: true,
      select: "-password",
    });

    if (!updatedUser) {
      console.error(`❌ User not found: ${req.user.id}`);
      return res.status(404).json({
        success: false,
        message: "User not found",
        userId: req.user.id,
      });
    }

    console.log(
      `✅ FCM token updated successfully for user: ${updatedUser.name}`,
    );

    res.json({
      success: true,
      message: "FCM Token updated successfully",
      data: {
        fcmToken: updatedUser.fcmToken.substring(0, 20) + "...", // Don't send full token back
        platform: updatedUser.fcmTokenPlatform,
        updated: updatedUser.fcmTokenUpdated,
        userId: updatedUser._id,
      },
    });
  } catch (err) {
    console.error("❌ Error updating FCM token:", err);
    console.error("🔍 Error stack:", err.stack);

    res.status(500).json({
      success: false,
      message: "Server error while updating FCM token",
      error: err.message,
      stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
    });
  }
});

// Test Notification Endpoint (for frontend testing) - Enhanced for Glitch
app.post(
  "/api/test-notification",
  verifyToken,
  notificationLimiter,
  async (req, res) => {
    try {
      const { token, title, body } = req.body;

      // Enhanced validation
      if (!token || typeof token !== "string") {
        return res.status(400).json({
          success: false,
          message: "Valid FCM token string is required",
          received: typeof token,
        });
      }

      // Check Firebase initialization
      if (!firebaseInitialized || !admin.apps.length) {
        console.error("❌ Firebase not initialized for test notification");
        return res.status(503).json({
          success: false,
          message: "Firebase Admin SDK not initialized",
          firebaseInitialized,
          adminApps: admin.apps.length,
        });
      }

      console.log(
        `🧪 Sending test notification to token: ${token.substring(0, 20)}... (length: ${token.length})`,
      );
      console.log(
        `📝 User: ${req.user.id}, Title: ${title || "Test Notification"}`,
      );

      const message = {
        notification: {
          title: title || "Test Notification",
          body:
            body ||
            "This is a test notification from your PCEA Turi Church app!",
        },
        data: {
          type: "test",
          timestamp: new Date().toISOString(),
          sender: "app_test",
          userId: req.user.id.toString(),
        },
        token: token,
      };

      console.log("📤 Sending message to Firebase...");
      const response = await admin.messaging().send(message);
      console.log(`✅ Test notification sent successfully: ${response}`);

      res.json({
        success: true,
        message: "Test notification sent successfully",
        messageId: response,
        timestamp: new Date().toISOString(),
        sentTo: token.substring(0, 20) + "...",
      });
    } catch (err) {
      console.error("❌ Error sending test notification:", err);
      console.error("🔍 Firebase error details:", {
        code: err.code,
        message: err.message,
        details: err.details,
      });

      // Handle specific Firebase errors with more detail
      let errorMessage = "Failed to send test notification";
      let statusCode = 500;

      if (err.code === "messaging/invalid-registration-token") {
        errorMessage =
          "Invalid FCM token provided - token may be expired or malformed";
        statusCode = 400;
      } else if (err.code === "messaging/registration-token-not-registered") {
        errorMessage =
          "FCM token is not registered - app may need to be reinstalled";
        statusCode = 400;
      } else if (err.code === "messaging/invalid-argument") {
        errorMessage = "Invalid message format or arguments";
        statusCode = 400;
      } else if (err.code === "messaging/authentication-error") {
        errorMessage = "Firebase authentication error - check service account";
        statusCode = 401;
      }

      res.status(statusCode).json({
        success: false,
        message: errorMessage,
        error: err.message,
        code: err.code || "unknown",
        details: err.details || null,
        timestamp: new Date().toISOString(),
      });
    }
  },
);

// Get user notifications
app.get("/api/user/notifications", verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit) || 50;
    const skip = parseInt(req.query.skip) || 0;

    // Get notifications for the user
    const notifications = await Notification.find({ userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .lean();

    // Get counts
    const totalCount = await Notification.countDocuments({ userId });
    const unreadCount = await Notification.countDocuments({
      userId,
      read: false,
    });

    console.log(
      `📱 Retrieved ${notifications.length} notifications for user ${userId}`,
    );

    res.json({
      success: true,
      notifications,
      pagination: {
        total: totalCount,
        unread: unreadCount,
        limit,
        skip,
        hasMore: totalCount > skip + notifications.length,
      },
    });
  } catch (err) {
    console.error("❌ Error fetching user notifications:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch notifications",
      error: err.message,
    });
  }
});

// Mark notification as received
app.post("/api/user/notifications/received", verifyToken, async (req, res) => {
  try {
    const { notificationId, title, message, type } = req.body;
    const userId = req.user.id;

    // Store the notification in database
    const notification = new Notification({
      userId,
      title: title || "New Notification",
      message: message || "",
      type: type || "general",
      data: req.body.data || {},
      receivedAt: new Date(),
    });

    await notification.save();

    console.log(`📝 Stored notification for user ${userId}: ${title}`);

    res.json({
      success: true,
      message: "Notification stored successfully",
      notificationId: notification._id,
    });
  } catch (err) {
    console.error("❌ Error storing notification:", err);
    res.status(500).json({
      success: false,
      message: "Failed to store notification",
      error: err.message,
    });
  }
});

// Mark notification as read
app.patch(
  "/api/user/notifications/:notificationId/read",
  verifyToken,
  async (req, res) => {
    try {
      const { notificationId } = req.params;
      const userId = req.user.id;

      const updatedNotification = await Notification.findOneAndUpdate(
        { _id: notificationId, userId },
        { read: true, readAt: new Date() },
        { new: true },
      );

      if (!updatedNotification) {
        return res.status(404).json({
          success: false,
          message: "Notification not found",
        });
      }

      console.log(
        `✅ Marked notification ${notificationId} as read for user ${userId}`,
      );

      res.json({
        success: true,
        message: "Notification marked as read",
        notification: updatedNotification,
      });
    } catch (err) {
      console.error("❌ Error marking notification as read:", err);
      res.status(500).json({
        success: false,
        message: "Failed to mark notification as read",
        error: err.message,
      });
    }
  },
);

// Enhanced Bulk Notification Sending
app.post(
  "/api/notifications/send",
  verifyToken,
  notificationLimiter,
  async (req, res) => {
    try {
      const { title, body, data, targetUsers } = req.body;

      // Validation
      if (!title || !body) {
        return res.status(400).json({
          success: false,
          message: "Title and body are required",
        });
      }

      if (!admin.apps.length) {
        return res.status(500).json({
          success: false,
          message: "Firebase Admin SDK not initialized",
        });
      }

      console.log(`📢 Sending bulk notification: "${title}"`);

      // Get users with FCM tokens
      let query = { fcmToken: { $ne: null, $exists: true } };
      if (targetUsers && Array.isArray(targetUsers) && targetUsers.length > 0) {
        query._id = { $in: targetUsers };
      }

      const users = await User.find(query).select(
        "fcmToken fcmTokenPlatform name",
      );
      const tokens = users
        .map((user) => user.fcmToken)
        .filter((token) => token);

      if (!tokens.length) {
        return res.status(400).json({
          success: false,
          message: "No valid FCM tokens found",
        });
      }

      console.log(`🎯 Found ${tokens.length} FCM tokens`);

      const message = {
        notification: { title, body },
        data: {
          type: "announcement",
          timestamp: new Date().toISOString(),
          ...(data || {}),
        },
        tokens,
      };

      const response = await admin.messaging().sendEachForMulticast(message);

      // Store notifications in database for all users
      const notificationPromises = users.map((user) => {
        return new Notification({
          userId: user._id,
          title,
          message: body,
          type: data?.type || "announcement",
          data: data || {},
          createdAt: new Date(),
        }).save();
      });

      await Promise.all(notificationPromises);
      console.log(`💾 Stored ${users.length} notifications in database`);

      // Process results and clean up invalid tokens
      const failedTokens = [];
      const results = [];

      response.responses.forEach((resp, idx) => {
        const token = tokens[idx];
        const user = users[idx];

        if (resp.success) {
          results.push({
            success: true,
            token: token.substring(0, 20) + "...",
            user: user.name,
            messageId: resp.messageId,
          });
        } else {
          const errorCode = resp.error.code;
          console.warn(
            `❌ Token ${token.substring(0, 20)}... failed:`,
            errorCode,
          );

          results.push({
            success: false,
            token: token.substring(0, 20) + "...",
            user: user.name,
            error: errorCode,
          });

          // Mark tokens for cleanup if they're invalid
          if (
            errorCode === "messaging/invalid-registration-token" ||
            errorCode === "messaging/registration-token-not-registered"
          ) {
            failedTokens.push(token);
          }
        }
      });

      // Clean up invalid tokens
      if (failedTokens.length > 0) {
        await User.updateMany(
          { fcmToken: { $in: failedTokens } },
          { $set: { fcmToken: null, fcmTokenUpdated: new Date() } },
        );
        console.log(`🧹 Cleaned up ${failedTokens.length} invalid tokens`);
      }

      console.log(
        `✅ Notification job completed: ${response.successCount}/${tokens.length} sent`,
      );

      res.json({
        success: true,
        message: "Bulk notification completed",
        stats: {
          totalTokens: tokens.length,
          successCount: response.successCount,
          failureCount: response.failureCount,
          cleanedTokens: failedTokens.length,
        },
        results: process.env.NODE_ENV === "development" ? results : undefined,
      });
    } catch (err) {
      console.error("❌ Bulk notification error:", err);
      res.status(500).json({
        success: false,
        message: "Failed to send bulk notifications",
        error: process.env.NODE_ENV === "development" ? err.message : undefined,
      });
    }
  },
);

// CLI/Terminal notification endpoint (for sending notifications from terminal)
app.post("/api/cli/send-notification", async (req, res) => {
  try {
    const { title, body, type, apiKey, targetUsers } = req.body;

    // Simple API key check for terminal access
    const expectedApiKey = process.env.CLI_API_KEY || "church-cli-2024";
    if (!apiKey || apiKey !== expectedApiKey) {
      return res.status(401).json({
        success: false,
        message: "Invalid API key for CLI access",
        hint: "Set CLI_API_KEY environment variable or use default key",
      });
    }

    if (!title || !body) {
      return res.status(400).json({
        success: false,
        message: "Title and body are required",
        usage:
          'curl -X POST /api/cli/send-notification -H \'Content-Type: application/json\' -d \'{"title":"Your Title","body":"Your Message","apiKey":"church-cli-2024"}\'',
      });
    }

    if (!firebaseInitialized || !admin.apps.length) {
      return res.status(503).json({
        success: false,
        message: "Firebase Admin SDK not initialized",
        debug: "Check FIREBASE_SERVICE_ACCOUNT environment variable",
      });
    }

    console.log(`🖥️ CLI Notification Request: "${title}"`);

    // Get target users
    let query = { fcmToken: { $ne: null, $exists: true } };
    if (targetUsers && Array.isArray(targetUsers) && targetUsers.length > 0) {
      query._id = { $in: targetUsers };
    }

    const users = await User.find(query).select(
      "fcmToken fcmTokenPlatform name",
    );
    const tokens = users.map((user) => user.fcmToken).filter((token) => token);

    if (!tokens.length) {
      return res.status(400).json({
        success: false,
        message: "No FCM tokens found",
        debug: {
          totalUsers: await User.countDocuments(),
          usersWithTokens: users.length,
        },
      });
    }

    // Store notifications in database first
    const notificationPromises = users.map((user) => {
      return new Notification({
        userId: user._id,
        title,
        message: body,
        type: type || "announcement",
        data: { source: "cli", timestamp: new Date().toISOString() },
        createdAt: new Date(),
      }).save();
    });

    await Promise.all(notificationPromises);
    console.log(`💾 Stored ${users.length} notifications in database`);

    const message = {
      notification: { title, body },
      data: {
        type: type || "cli_notification",
        timestamp: new Date().toISOString(),
        source: "cli",
      },
      tokens,
    };

    console.log(`📤 Sending CLI notification to ${tokens.length} devices...`);
    const response = await admin.messaging().sendEachForMulticast(message);

    // Clean up failed tokens
    const failedTokens = [];
    response.responses.forEach((resp, idx) => {
      if (!resp.success) {
        const errorCode = resp.error.code;
        if (
          errorCode === "messaging/invalid-registration-token" ||
          errorCode === "messaging/registration-token-not-registered"
        ) {
          failedTokens.push(tokens[idx]);
        }
      }
    });

    if (failedTokens.length > 0) {
      await User.updateMany(
        { fcmToken: { $in: failedTokens } },
        { $set: { fcmToken: null, fcmTokenUpdated: new Date() } },
      );
      console.log(`🧹 Cleaned up ${failedTokens.length} invalid tokens`);
    }

    console.log(
      `✅ CLI notification completed: ${response.successCount}/${tokens.length} sent`,
    );

    res.json({
      success: true,
      message: "CLI notification sent successfully",
      stats: {
        totalTargets: tokens.length,
        successCount: response.successCount,
        failureCount: response.failureCount,
        cleanedTokens: failedTokens.length,
        storedInDB: users.length,
      },
      notification: { title, body, type: type || "cli_notification" },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("❌ CLI notification error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to send CLI notification",
      error: err.message,
      stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
    });
  }
});

// Simple notification test endpoint (no auth required - for testing only)
app.post("/api/simple-notification-test", async (req, res) => {
  try {
    console.log("🧪 Simple notification test endpoint hit");
    console.log("📋 Request body:", req.body);

    const { title, body, testMode } = req.body;

    // Set default values if not provided
    const notificationTitle = title || "Test Notification";
    const notificationBody =
      body || "This is a test notification from the server!";

    console.log(`📢 Sending notification: "${notificationTitle}"`);

    if (!admin.apps.length) {
      console.error("❌ Firebase Admin SDK not initialized");
      return res.status(500).json({
        success: false,
        message: "Firebase Admin SDK not initialized",
        debug: "Check FIREBASE_SERVICE_ACCOUNT environment variable",
      });
    }

    // Get all users with FCM tokens
    const users = await User.find({
      fcmToken: { $ne: null, $exists: true },
    }).select("fcmToken name fcmTokenPlatform");
    const tokens = users.map((user) => user.fcmToken).filter((token) => token);

    console.log(`👥 Total users in database: ${await User.countDocuments()}`);
    console.log(`🎯 Users with FCM tokens: ${users.length}`);
    console.log(`🔑 Valid tokens: ${tokens.length}`);

    if (!tokens.length) {
      return res.status(400).json({
        success: false,
        message: "No FCM tokens found in database",
        debug: {
          totalUsers: await User.countDocuments(),
          usersWithTokens: users.length,
          suggestion:
            "Make sure users have logged into the frontend app to generate FCM tokens",
        },
      });
    }

    // Store notifications in database first
    const notificationPromises = users.map((user) => {
      return new Notification({
        userId: user._id,
        title: notificationTitle + (testMode ? " (Test)" : ""),
        message: notificationBody,
        type: "general",
        data: { source: "simple_test", timestamp: new Date().toISOString() },
        createdAt: new Date(),
      }).save();
    });

    await Promise.all(notificationPromises);
    console.log(`💾 Stored ${users.length} test notifications in database`);

    const message = {
      notification: {
        title: notificationTitle + (testMode ? " (Test)" : ""),
        body: notificationBody,
      },
      data: {
        type: "simple_test",
        timestamp: new Date().toISOString(),
        sender: "simple_test_endpoint",
      },
      tokens,
    };

    console.log(`📤 Sending to ${tokens.length} tokens...`);
    const response = await admin.messaging().sendEachForMulticast(message);

    console.log(
      `✅ Simple test completed: ${response.successCount}/${tokens.length} sent successfully`,
    );

    if (response.failureCount > 0) {
      console.log(`⚠️ ${response.failureCount} notifications failed`);
    }

    res.json({
      success: true,
      message: "Simple notification test completed successfully",
      stats: {
        totalTokens: tokens.length,
        successCount: response.successCount,
        failureCount: response.failureCount,
      },
      notification: {
        title: message.notification.title,
        body: message.notification.body,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("❌ Simple notification test error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to send simple test notification",
      error: err.message,
      stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
    });
  }
});

// Get FCM token statistics (admin endpoint)
app.get("/api/admin/fcm-stats", verifyToken, async (req, res) => {
  try {
    const stats = await User.aggregate([
      {
        $group: {
          _id: null,
          totalUsers: { $sum: 1 },
          usersWithTokens: {
            $sum: {
              $cond: [{ $ne: ["$fcmToken", null] }, 1, 0],
            },
          },
          webTokens: {
            $sum: {
              $cond: [{ $eq: ["$fcmTokenPlatform", "web"] }, 1, 0],
            },
          },
          nativeTokens: {
            $sum: {
              $cond: [
                { $in: ["$fcmTokenPlatform", ["native", "android", "ios"]] },
                1,
                0,
              ],
            },
          },
        },
      },
    ]);

    const result = stats[0] || {
      totalUsers: 0,
      usersWithTokens: 0,
      webTokens: 0,
      nativeTokens: 0,
    };

    res.json({
      success: true,
      data: {
        ...result,
        tokenCoverage:
          result.totalUsers > 0
            ? ((result.usersWithTokens / result.totalUsers) * 100).toFixed(1) +
              "%"
            : "0%",
        lastUpdated: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error("❌ Error getting FCM stats:", err);
    res.status(500).json({
      success: false,
      message: "Failed to get FCM statistics",
    });
  }
});

// Enhanced Register User
app.post("/api/user/register", async (req, res) => {
  try {
    const { name, phone, password } = req.body;

    // Validation
    if (!name || !phone || !password) {
      return res.status(400).json({
        success: false,
        message: "Name, phone, and password are required",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters long",
      });
    }

    // Check if user exists
    let existingUser = await User.findOne({ phone });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "User with this phone number already exists",
      });
    }

    // Create new user
    const hashedPassword = await bcrypt.hash(password, 12);
    const user = new User({
      name,
      phone,
      password: hashedPassword,
    });

    await user.save();
    console.log(`✅ New user registered: ${name} (${phone})`);

    // Try to pair new user immediately with an unpaired user
    try {
      await pairNewUserImmediately(user._id);
    } catch (pairingError) {
      console.error("❌ Error pairing new user immediately:", pairingError);
      // Don't fail registration if pairing fails
    }

    // Generate token
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    res.status(201).json({
      success: true,
      token,
      message: "User registered successfully",
      user: {
        id: user._id,
        name: user.name,
        phone: user.phone,
      },
    });
  } catch (err) {
    console.error("❌ Registration error:", err);
    res.status(500).json({
      success: false,
      message: "Registration failed",
    });
  }
});

// Enhanced Login User
app.post("/api/user/login", async (req, res) => {
  try {
    const { phone, password } = req.body;

    // Validation
    if (!phone || !password) {
      return res.status(400).json({
        success: false,
        message: "Phone and password are required",
      });
    }

    // Find user
    const user = await User.findOne({ phone });
    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    // Check password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(400).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    // Update last login
    await User.findByIdAndUpdate(user._id, { lastLogin: new Date() });

    // Generate token
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    console.log(`✅ User logged in: ${user.name} (${user.phone})`);

    res.json({
      success: true,
      token,
      message: "Login successful",
      user: {
        id: user._id,
        name: user.name,
        phone: user.phone,
        hasFCMToken: !!user.fcmToken,
      },
    });
  } catch (err) {
    console.error("❌ Login error:", err);
    res.status(500).json({
      success: false,
      message: "Login failed",
    });
  }
});

// Enhanced Weekly Prayer Partner Reshuffling with Smart Logic
cron.schedule("0 6 * * 1", async () => {
  // Run every Monday at 6 AM
  console.log("🔄 Starting weekly prayer partner reshuffling...");
  try {
    await reshufflePrayerPartners();
  } catch (err) {
    console.error("❌ Weekly prayer partner reshuffling error:", err);
  }
});

// Function to reshuffle prayer partners with intelligent pairing
async function reshufflePrayerPartners() {
  try {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentWeek = getWeekNumber(now);

    console.log(`📅 Reshuffling for Week ${currentWeek}, Year ${currentYear}`);

    // Get all active users
    const users = await User.find({}).select(
      "_id name phone createdAt currentPartner",
    );
    console.log(`👥 Found ${users.length} total users`);

    if (users.length < 2) {
      console.log("⚠️ Not enough users for pairing (minimum 2 required)");
      return;
    }

    // Deactivate previous week's partnerships
    await PrayerPartnership.updateMany(
      { isActive: true },
      { $set: { isActive: false } },
    );
    console.log("📝 Deactivated previous partnerships");

    // Get pairing history for smart matching
    const pairingHistory = await getPairingHistory();

    // Create optimal pairs using smart algorithm
    const newPairs = await createOptimalPairs(
      users,
      pairingHistory,
      currentWeek,
      currentYear,
    );

    if (newPairs.length === 0) {
      console.log("❌ Failed to create any pairs");
      return;
    }

    // Save new partnerships to database
    const partnershipPromises = newPairs.map((pair) => {
      const partnership = new PrayerPartnership({
        user1: pair.user1._id,
        user2: pair.user2._id,
        weekNumber: currentWeek,
        year: currentYear,
        isActive: true,
        notes: `Auto-paired for week ${currentWeek}`,
      });
      return partnership.save();
    });

    await Promise.all(partnershipPromises);

    // Update users' currentPartner field
    const userUpdatePromises = newPairs.flatMap((pair) => [
      User.findByIdAndUpdate(pair.user1._id, {
        currentPartner: pair.user2._id,
      }),
      User.findByIdAndUpdate(pair.user2._id, {
        currentPartner: pair.user1._id,
      }),
    ]);

    // Handle odd user (if any)
    if (users.length % 2 === 1) {
      const unpairedUser = users.find(
        (user) =>
          !newPairs.some(
            (pair) =>
              pair.user1._id.equals(user._id) ||
              pair.user2._id.equals(user._id),
          ),
      );

      if (unpairedUser) {
        userUpdatePromises.push(
          User.findByIdAndUpdate(unpairedUser._id, { currentPartner: null }),
        );
        console.log(
          `👤 User ${unpairedUser.name} will pray individually this week`,
        );
      }
    }

    await Promise.all(userUpdatePromises);

    console.log(
      `✅ Successfully created ${newPairs.length} prayer partnerships for week ${currentWeek}`,
    );

    // Log the new pairs
    newPairs.forEach((pair, index) => {
      console.log(
        `🤝 Pair ${index + 1}: ${pair.user1.name} ↔ ${pair.user2.name}`,
      );
    });

    // Send notifications about new prayer partners
    await sendPrayerPartnerNotifications(newPairs, currentWeek);

    // Store pairing statistics
    await storePairingStatistics(newPairs, currentWeek, currentYear);
  } catch (error) {
    console.error("❌ Error in reshufflePrayerPartners:", error);
    throw error;
  }
}

// Get pairing history to avoid recent repeats
async function getPairingHistory() {
  try {
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

    const recentPairings = await PrayerPartnership.find({
      pairDate: { $gte: twoWeeksAgo },
    }).populate("user1 user2", "name");

    // Create a map of recent partnerships
    const historyMap = new Map();

    recentPairings.forEach((pairing) => {
      const key1 = `${pairing.user1._id}_${pairing.user2._id}`;
      const key2 = `${pairing.user2._id}_${pairing.user1._id}`;

      historyMap.set(key1, pairing.weekNumber);
      historyMap.set(key2, pairing.weekNumber);
    });

    console.log(
      `📚 Loaded ${recentPairings.length} recent pairings for reference`,
    );
    return historyMap;
  } catch (error) {
    console.error("❌ Error getting pairing history:", error);
    return new Map();
  }
}

// Create optimal pairs using smart algorithm with new user priority
async function createOptimalPairs(
  users,
  pairingHistory,
  currentWeek,
  currentYear,
) {
  const pairs = [];
  const usedUsers = new Set();

  // Separate new users (joined within last 7 days) and existing users
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const newUsers = users.filter(
    (user) => new Date(user.createdAt) > sevenDaysAgo,
  );
  const existingUsers = users.filter(
    (user) => new Date(user.createdAt) <= sevenDaysAgo,
  );

  console.log(`🎯 Creating optimal pairs with smart algorithm...`);
  console.log(`🆕 New users (priority): ${newUsers.length}`);
  console.log(`👥 Existing users: ${existingUsers.length}`);

  // First, prioritize pairing new users with existing users
  for (const newUser of newUsers) {
    if (usedUsers.has(newUser._id.toString())) continue;

    let bestPartner = null;
    let bestScore = -1;

    // Look for best existing user partner
    for (const existingUser of existingUsers) {
      if (usedUsers.has(existingUser._id.toString())) continue;

      const score = calculatePairingScore(
        newUser,
        existingUser,
        pairingHistory,
        true,
      ); // true = new user bonus

      if (score > bestScore) {
        bestScore = score;
        bestPartner = existingUser;
      }
    }

    // If no existing user available, pair with another new user
    if (!bestPartner) {
      for (const otherNewUser of newUsers) {
        if (
          usedUsers.has(otherNewUser._id.toString()) ||
          otherNewUser._id.equals(newUser._id)
        )
          continue;

        const score = calculatePairingScore(
          newUser,
          otherNewUser,
          pairingHistory,
          true,
        );

        if (score > bestScore) {
          bestScore = score;
          bestPartner = otherNewUser;
        }
      }
    }

    if (bestPartner) {
      pairs.push({ user1: newUser, user2: bestPartner, score: bestScore });
      usedUsers.add(newUser._id.toString());
      usedUsers.add(bestPartner._id.toString());

      console.log(
        `✅ Priority paired (new user): ${newUser.name} ↔ ${bestPartner.name} (score: ${bestScore})`,
      );
    }
  }

  // Then pair remaining existing users
  const remainingUsers = users.filter(
    (user) => !usedUsers.has(user._id.toString()),
  );
  const shuffledRemaining = [...remainingUsers].sort(() => Math.random() - 0.5);

  for (let i = 0; i < shuffledRemaining.length; i++) {
    const user1 = shuffledRemaining[i];

    if (usedUsers.has(user1._id.toString())) continue;

    // Find the best partner for user1
    let bestPartner = null;
    let bestScore = -1;

    for (let j = i + 1; j < shuffledRemaining.length; j++) {
      const user2 = shuffledRemaining[j];

      if (usedUsers.has(user2._id.toString())) continue;

      // Calculate compatibility score
      const score = calculatePairingScore(user1, user2, pairingHistory);

      if (score > bestScore) {
        bestScore = score;
        bestPartner = user2;
      }
    }

    if (bestPartner) {
      pairs.push({ user1, user2: bestPartner, score: bestScore });
      usedUsers.add(user1._id.toString());
      usedUsers.add(bestPartner._id.toString());

      console.log(
        `✅ Paired: ${user1.name} ↔ ${bestPartner.name} (score: ${bestScore})`,
      );
    }
  }

  return pairs;
}

// Calculate pairing compatibility score with new user priority
function calculatePairingScore(
  user1,
  user2,
  pairingHistory,
  isNewUserPairing = false,
) {
  let score = 100; // Base score

  // Check if they were paired recently (penalty)
  const pairKey = `${user1._id}_${user2._id}`;
  if (pairingHistory.has(pairKey)) {
    const lastPairedWeek = pairingHistory.get(pairKey);
    const weeksSinceLastPairing = getWeekNumber(new Date()) - lastPairedWeek;

    if (weeksSinceLastPairing < 4) {
      score -= (4 - weeksSinceLastPairing) * 25; // Heavy penalty for recent pairings
    }
  }

  // Check if they're the same person (should never happen, but safety check)
  if (user1._id.equals(user2._id)) {
    score = -1000;
  }

  // Bonus for new user pairings
  if (isNewUserPairing) {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const user1IsNew = new Date(user1.createdAt) > sevenDaysAgo;
    const user2IsNew = new Date(user2.createdAt) > sevenDaysAgo;

    if (user1IsNew || user2IsNew) {
      score += 50; // Significant bonus for involving new users
      console.log(
        `🆕 New user bonus applied: ${user1IsNew ? user1.name : user2.name} is new`,
      );
    }

    // Extra bonus if pairing new user with experienced user
    if ((user1IsNew && !user2IsNew) || (!user1IsNew && user2IsNew)) {
      score += 25; // Extra bonus for new-experienced pairing
    }
  }

  // Add slight randomness to prevent deterministic patterns
  score += Math.random() * 10;

  return score;
}

// Send notifications about new prayer partners
async function sendPrayerPartnerNotifications(pairs, weekNumber) {
  try {
    if (!firebaseInitialized || !admin.apps.length) {
      console.log("📱 Firebase not available, skipping notifications");
      return;
    }

    // Get all users involved in pairings with FCM tokens
    const userIds = pairs.flatMap((pair) => [pair.user1._id, pair.user2._id]);
    const usersWithTokens = await User.find({
      _id: { $in: userIds },
      fcmToken: { $ne: null, $exists: true },
    })
      .select("_id name fcmToken currentPartner")
      .populate("currentPartner", "name");

    if (usersWithTokens.length === 0) {
      console.log("📱 No users with FCM tokens found");
      return;
    }

    console.log(`📱 Sending notifications to ${usersWithTokens.length} users`);

    // Send personalized notifications
    const notificationPromises = usersWithTokens.map(async (user) => {
      const partnerName = user.currentPartner
        ? user.currentPartner.name
        : "Someone special";

      const message = {
        token: user.fcmToken,
        notification: {
          title: "New Prayer Partner Assigned! 🙏",
          body: `You've been paired with ${partnerName} for this week. Let's pray together!`,
        },
        data: {
          type: "prayer_partner_update",
          weekNumber: weekNumber.toString(),
          partnerId: user.currentPartner
            ? user.currentPartner._id.toString()
            : "",
          partnerName: partnerName,
          timestamp: new Date().toISOString(),
        },
      };

      try {
        const response = await admin.messaging().send(message);
        console.log(`✅ Notification sent to ${user.name}: ${response}`);

        // Store notification in database
        const notification = new Notification({
          userId: user._id,
          title: message.notification.title,
          message: message.notification.body,
          type: "prayer_partner_update",
          data: message.data,
          createdAt: new Date(),
        });
        await notification.save();
      } catch (error) {
        console.error(`❌ Failed to send notification to ${user.name}:`, error);
      }
    });

    await Promise.all(notificationPromises);
    console.log("📱 Prayer partner notifications completed");
  } catch (error) {
    console.error("❌ Error sending prayer partner notifications:", error);
  }
}

// Store pairing statistics
async function storePairingStatistics(pairs, weekNumber, year) {
  try {
    const stats = {
      week: weekNumber,
      year: year,
      totalPairs: pairs.length,
      totalUsersInvolved: pairs.length * 2,
      averageScore:
        pairs.reduce((sum, pair) => sum + (pair.score || 0), 0) / pairs.length,
      timestamp: new Date(),
    };

    console.log("📊 Pairing Statistics:", stats);

    // Could store in a separate statistics collection if needed
    // For now, just log the statistics
  } catch (error) {
    console.error("❌ Error storing pairing statistics:", error);
  }
}

// Utility function to get week number
function getWeekNumber(date) {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

// Manual reshuffle endpoint (for testing or admin use)
app.post(
  "/api/admin/reshuffle-prayer-partners",
  verifyToken,
  async (req, res) => {
    try {
      console.log("🔧 Manual prayer partner reshuffle requested");
      await reshufflePrayerPartners();

      res.json({
        success: true,
        message: "Prayer partners reshuffled successfully",
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("❌ Manual reshuffle error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to reshuffle prayer partners",
        error: error.message,
      });
    }
  },
);

// Get prayer partner statistics with new user info
app.get("/api/admin/prayer-partner-stats", verifyToken, async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const usersWithPartners = await User.countDocuments({
      currentPartner: { $ne: null },
    });
    const totalPartnerships = await PrayerPartnership.countDocuments({
      isActive: true,
    });
    const currentWeek = getWeekNumber(new Date());
    const currentYear = new Date().getFullYear();

    // Get new users (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const newUsers = await User.find({
      createdAt: { $gte: sevenDaysAgo },
    }).select("name createdAt currentPartner");
    const newUsersWithPartners = newUsers.filter(
      (user) => user.currentPartner !== null,
    ).length;

    // Get recent partnership history
    const recentPartnerships = await PrayerPartnership.find({
      weekNumber: { $gte: currentWeek - 4 },
      year: currentYear,
    })
      .populate("user1 user2", "name createdAt")
      .sort({ weekNumber: -1 });

    res.json({
      success: true,
      data: {
        statistics: {
          totalUsers,
          usersWithPartners,
          totalActivePartnerships: totalPartnerships,
          pairingCoverage:
            totalUsers > 0
              ? `${((usersWithPartners / totalUsers) * 100).toFixed(1)}%`
              : "0%",
          currentWeek,
          currentYear,
          newUsers: {
            total: newUsers.length,
            paired: newUsersWithPartners,
            unpaired: newUsers.length - newUsersWithPartners,
            pairingRate:
              newUsers.length > 0
                ? `${((newUsersWithPartners / newUsers.length) * 100).toFixed(1)}%`
                : "0%",
          },
        },
        recentPartnerships: recentPartnerships.map((p) => ({
          week: p.weekNumber,
          year: p.year,
          user1: p.user1.name,
          user2: p.user2.name,
          user1IsNew: new Date(p.user1.createdAt) > sevenDaysAgo,
          user2IsNew: new Date(p.user2.createdAt) > sevenDaysAgo,
          isActive: p.isActive,
          pairDate: p.pairDate,
        })),
        newUsersDetails: newUsers.map((user) => ({
          name: user.name,
          joined: user.createdAt,
          hasPrayer: !!user.currentPartner,
          daysAgo: Math.floor(
            (new Date() - new Date(user.createdAt)) / (1000 * 60 * 60 * 24),
          ),
        })),
      },
    });
  } catch (error) {
    console.error("❌ Error getting prayer partner stats:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get prayer partner statistics",
      error: error.message,
    });
  }
});

// Manual endpoint to pair new users immediately
app.post("/api/admin/pair-new-users", verifyToken, async (req, res) => {
  try {
    console.log("🔧 Manual new user pairing requested");

    // Find all unpaired users
    const unpairedUsers = await User.find({ currentPartner: null }).select(
      "_id name createdAt",
    );

    if (unpairedUsers.length < 2) {
      return res.json({
        success: true,
        message: "Not enough unpaired users to create new pairs",
        unpairedCount: unpairedUsers.length,
      });
    }

    // Separate new and existing users
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const newUnpairedUsers = unpairedUsers.filter(
      (user) => new Date(user.createdAt) > sevenDaysAgo,
    );
    const existingUnpairedUsers = unpairedUsers.filter(
      (user) => new Date(user.createdAt) <= sevenDaysAgo,
    );

    console.log(`🆕 New unpaired users: ${newUnpairedUsers.length}`);
    console.log(`👥 Existing unpaired users: ${existingUnpairedUsers.length}`);

    let pairsCreated = 0;
    const pairedUsers = [];

    // Pair new users with existing users first
    for (const newUser of newUnpairedUsers) {
      if (
        existingUnpairedUsers.length > 0 &&
        !pairedUsers.includes(newUser._id.toString())
      ) {
        const partner = existingUnpairedUsers.shift(); // Take first available existing user
        if (!pairedUsers.includes(partner._id.toString())) {
          await pairUsersManually(
            newUser._id,
            partner._id,
            "Manual new user pairing",
          );
          pairedUsers.push(newUser._id.toString(), partner._id.toString());
          pairsCreated++;

          console.log(
            `✅ Paired new user ${newUser.name} with existing user ${partner.name}`,
          );
        }
      }
    }

    // Pair remaining unpaired users
    const remainingUnpaired = unpairedUsers.filter(
      (user) => !pairedUsers.includes(user._id.toString()),
    );

    for (let i = 0; i < remainingUnpaired.length - 1; i += 2) {
      const user1 = remainingUnpaired[i];
      const user2 = remainingUnpaired[i + 1];

      await pairUsersManually(
        user1._id,
        user2._id,
        "Manual remaining user pairing",
      );
      pairsCreated++;

      console.log(`✅ Paired remaining users ${user1.name} with ${user2.name}`);
    }

    res.json({
      success: true,
      message: `Successfully created ${pairsCreated} new prayer partnerships`,
      statistics: {
        totalUnpairedUsers: unpairedUsers.length,
        newUsers: newUnpairedUsers.length,
        existingUsers: existingUnpairedUsers.length,
        pairsCreated,
        remainingUnpaired: unpairedUsers.length - pairsCreated * 2,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Manual new user pairing error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to pair new users",
      error: error.message,
    });
  }
});

// Helper function to manually pair two users
async function pairUsersManually(userId1, userId2, notes = "") {
  const currentWeek = getWeekNumber(new Date());
  const currentYear = new Date().getFullYear();

  // Create partnership record
  const partnership = new PrayerPartnership({
    user1: userId1,
    user2: userId2,
    weekNumber: currentWeek,
    year: currentYear,
    isActive: true,
    notes: notes || `Manual pairing - Week ${currentWeek}`,
  });

  await partnership.save();

  // Update both users' currentPartner field
  await Promise.all([
    User.findByIdAndUpdate(userId1, { currentPartner: userId2 }),
    User.findByIdAndUpdate(userId2, { currentPartner: userId1 }),
  ]);

  // Send notifications
  await sendImmediatePairingNotifications(userId1, userId2);

  return partnership;
}

// Get current prayer partner
app.get("/api/user/prayer-partner", verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const currentWeek = getWeekNumber(new Date());
    const currentYear = new Date().getFullYear();

    // Get user with current partner populated
    const user = await User.findById(userId)
      .populate("currentPartner", "name phone createdAt")
      .select("name phone currentPartner");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Get current active partnership details
    let partnershipDetails = null;
    if (user.currentPartner) {
      partnershipDetails = await PrayerPartnership.findOne({
        $or: [
          { user1: userId, user2: user.currentPartner._id },
          { user1: user.currentPartner._id, user2: userId },
        ],
        isActive: true,
        weekNumber: currentWeek,
        year: currentYear,
      });
    }

    // Get prayer partner history for this user
    const prayerHistory = await PrayerPartnership.find({
      $or: [{ user1: userId }, { user2: userId }],
    })
      .populate("user1 user2", "name")
      .sort({ weekNumber: -1, year: -1 })
      .limit(10);

    const formattedHistory = prayerHistory.map((partnership) => {
      const partner = partnership.user1._id.equals(userId)
        ? partnership.user2
        : partnership.user1;

      return {
        partnerName: partner.name,
        weekNumber: partnership.weekNumber,
        year: partnership.year,
        pairDate: partnership.pairDate,
        isActive: partnership.isActive,
      };
    });

    res.json({
      success: true,
      data: {
        currentPartner: user.currentPartner
          ? {
              id: user.currentPartner._id,
              name: user.currentPartner.name,
              phone: user.currentPartner.phone,
              memberSince: user.currentPartner.createdAt,
              pairDate: partnershipDetails ? partnershipDetails.pairDate : null,
              weekNumber: currentWeek,
              year: currentYear,
            }
          : null,
        user: {
          id: user._id,
          name: user.name,
          phone: user.phone,
        },
        prayerHistory: formattedHistory,
        statistics: {
          totalPastPartnerships: formattedHistory.length,
          currentWeek,
          currentYear,
        },
      },
    });
  } catch (error) {
    console.error("❌ Error getting prayer partner:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get prayer partner information",
      error: error.message,
    });
  }
});

// Get all prayer partnerships for community view
app.get("/api/prayer-partnerships", verifyToken, async (req, res) => {
  try {
    const currentWeek = getWeekNumber(new Date());
    const currentYear = new Date().getFullYear();

    const partnerships = await PrayerPartnership.find({
      isActive: true,
      weekNumber: currentWeek,
      year: currentYear,
    })
      .populate("user1 user2", "name phone createdAt")
      .sort({ pairDate: -1 });

    // Get unpaired users
    const pairedUserIds = partnerships.flatMap((p) => [
      p.user1._id,
      p.user2._id,
    ]);
    const unpairedUsers = await User.find({
      _id: { $nin: pairedUserIds },
    }).select("name phone createdAt");

    const formattedPartnerships = partnerships.map((partnership) => ({
      id: partnership._id,
      user1: {
        id: partnership.user1._id,
        name: partnership.user1.name,
        phone: partnership.user1.phone,
        memberSince: partnership.user1.createdAt,
      },
      user2: {
        id: partnership.user2._id,
        name: partnership.user2.name,
        phone: partnership.user2.phone,
        memberSince: partnership.user2.createdAt,
      },
      pairDate: partnership.pairDate,
      weekNumber: partnership.weekNumber,
      year: partnership.year,
      notes: partnership.notes,
    }));

    res.json({
      success: true,
      data: {
        activePartnerships: formattedPartnerships,
        unpairedUsers: unpairedUsers.map((user) => ({
          id: user._id,
          name: user.name,
          phone: user.phone,
          memberSince: user.createdAt,
        })),
        statistics: {
          totalPairs: partnerships.length,
          totalPairedUsers: pairedUserIds.length,
          totalUnpairedUsers: unpairedUsers.length,
          currentWeek,
          currentYear,
          nextReshuffleDate: getNextReshuffleDate(),
        },
      },
    });
  } catch (error) {
    console.error("❌ Error getting prayer partnerships:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get prayer partnerships",
      error: error.message,
    });
  }
});

// Function to immediately pair new users with available partners
async function pairNewUserImmediately(newUserId) {
  try {
    console.log(`🆕 Attempting to pair new user ${newUserId} immediately...`);

    const currentWeek = getWeekNumber(new Date());
    const currentYear = new Date().getFullYear();

    // Find users who don't have current partners
    const unpairedUsers = await User.find({
      _id: { $ne: newUserId }, // Exclude the new user
      currentPartner: null,
    }).select("_id name phone createdAt");

    if (unpairedUsers.length === 0) {
      console.log("📝 No unpaired users available for immediate pairing");
      return false;
    }

    // Prioritize users who have been unpaired the longest
    unpairedUsers.sort((a, b) => a.createdAt - b.createdAt);
    const selectedPartner = unpairedUsers[0];

    console.log(`🤝 Pairing new user with ${selectedPartner.name} immediately`);

    // Create partnership record
    const partnership = new PrayerPartnership({
      user1: newUserId,
      user2: selectedPartner._id,
      weekNumber: currentWeek,
      year: currentYear,
      isActive: true,
      notes: `Immediate pairing for new user - Week ${currentWeek}`,
    });

    await partnership.save();

    // Update both users' currentPartner field
    await Promise.all([
      User.findByIdAndUpdate(newUserId, {
        currentPartner: selectedPartner._id,
      }),
      User.findByIdAndUpdate(selectedPartner._id, {
        currentPartner: newUserId,
      }),
    ]);

    // Send notifications to both users
    await sendImmediatePairingNotifications(newUserId, selectedPartner._id);

    console.log(
      `✅ Successfully paired new user immediately with ${selectedPartner.name}`,
    );
    return true;
  } catch (error) {
    console.error("❌ Error in pairNewUserImmediately:", error);
    throw error;
  }
}

// Send notifications for immediate pairing
async function sendImmediatePairingNotifications(userId1, userId2) {
  try {
    if (!firebaseInitialized || !admin.apps.length) {
      console.log(
        "📱 Firebase not available, skipping immediate pairing notifications",
      );
      return;
    }

    // Get both users with their FCM tokens and partner info
    const users = await User.find({
      _id: { $in: [userId1, userId2] },
      fcmToken: { $ne: null, $exists: true },
    })
      .populate("currentPartner", "name")
      .select("_id name fcmToken currentPartner");

    if (users.length === 0) {
      console.log(
        "📱 No users with FCM tokens found for immediate pairing notification",
      );
      return;
    }

    console.log(
      `📱 Sending immediate pairing notifications to ${users.length} users`,
    );

    const notificationPromises = users.map(async (user) => {
      const partnerName = user.currentPartner
        ? user.currentPartner.name
        : "your new prayer partner";
      const isNewUser = user._id.equals(userId1);

      const message = {
        token: user.fcmToken,
        notification: {
          title: isNewUser
            ? "Welcome! Prayer Partner Assigned! 🙏"
            : "New Prayer Partner Assigned! 🙏",
          body: isNewUser
            ? `Welcome to our prayer community! You've been paired with ${partnerName}. Let's pray together!`
            : `You've been paired with ${partnerName}, a new member of our community. Please welcome them!`,
        },
        data: {
          type: "immediate_prayer_partner_assignment",
          partnerId: user.currentPartner
            ? user.currentPartner._id.toString()
            : "",
          partnerName: partnerName,
          isNewUserPairing: "true",
          timestamp: new Date().toISOString(),
        },
      };

      try {
        const response = await admin.messaging().send(message);
        console.log(
          `✅ Immediate pairing notification sent to ${user.name}: ${response}`,
        );

        // Store notification in database
        const notification = new Notification({
          userId: user._id,
          title: message.notification.title,
          message: message.notification.body,
          type: "immediate_prayer_partner_assignment",
          data: message.data,
          createdAt: new Date(),
        });
        await notification.save();
      } catch (error) {
        console.error(
          `❌ Failed to send immediate pairing notification to ${user.name}:`,
          error,
        );
      }
    });

    await Promise.all(notificationPromises);
    console.log("📱 Immediate pairing notifications completed");
  } catch (error) {
    console.error("❌ Error sending immediate pairing notifications:", error);
  }
}

// Utility function to get next reshuffle date
function getNextReshuffleDate() {
  const now = new Date();
  const nextMonday = new Date(now);

  // Get next Monday
  const daysUntilMonday = (8 - now.getDay()) % 7;
  if (daysUntilMonday === 0 && now.getHours() >= 6) {
    // If it's already Monday after 6 AM, get next Monday
    nextMonday.setDate(now.getDate() + 7);
  } else {
    nextMonday.setDate(now.getDate() + daysUntilMonday);
  }

  nextMonday.setHours(6, 0, 0, 0); // 6 AM
  return nextMonday;
}

// Apply routes
app.use("/events", eventsRouter);
app.use("/announcements", announcementsRouter);
app.use("/meditation", meditationRouter);
app.use("/gallery", galleryRouter);
app.use("/ppartner", verifyToken, prayerPartnersRoute);
app.use("/api", sermonRoutes);
app.use("/api", lyricsRoutes);
app.use("/api", videoRoutes);
app.use("/api", userRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("❌ Unhandled error:", err);
  res.status(500).json({
    success: false,
    message: "Internal server error",
    error: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
});

// Default 404 Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Endpoint not found",
    path: req.path,
    method: req.method,
  });
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("🔄 SIGTERM received, shutting down gracefully");
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("🔄 SIGINT received, shutting down gracefully");
  process.exit(0);
});

// Start Server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📱 Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(
    `🔥 Firebase Admin: ${admin.apps.length > 0 ? "Connected" : "Not Connected"}`,
  );
});

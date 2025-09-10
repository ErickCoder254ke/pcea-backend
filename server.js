const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();

// Trust proxy for rate limiting behind reverse proxy
app.set('trust proxy', 1);

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Limit each IP to 1000 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiting to all requests
app.use(limiter);

// Security middleware
app.use(helmet({
  crossOriginEmbedderPolicy: false, // Disable COEP for better compatibility
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      connectSrc: ["'self'", "https:", "wss:"],
      fontSrc: ["'self'", "https:", "data:"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'", "https:", "blob:"],
      frameSrc: ["'self'"],
    },
  },
}));

// CORS configuration
app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:3000', 
    'https://pcea-turi.vercel.app',
    'https://pcea-turi-church.netlify.app',
    process.env.FRONTEND_URL
  ].filter(Boolean),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Admin-Token']
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Root endpoint for cron job health checks
app.get('/', (req, res) => {
  res.send('Erick You have you backend up and running');
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Test notification endpoint (proxy to notifications/test for frontend compatibility)
app.get('/api/test-notification', async (req, res) => {
  try {
    // Import notification model
    const mongoose = require('mongoose');
    let Notification;
    try {
      Notification = mongoose.model("Notification");
    } catch (error) {
      // If model doesn't exist, create minimal response
      return res.json({
        success: true,
        message: 'Test notification endpoint is working',
        data: {
          timestamp: new Date().toISOString()
        }
      });
    }

    const notificationCount = await Notification.countDocuments();

    res.json({
      success: true,
      message: 'Test notification endpoint is working',
      data: {
        totalNotifications: notificationCount,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('❌ Test notification endpoint failed:', error);
    res.status(500).json({
      success: false,
      message: 'Test notification endpoint failed',
      error: error.message
    });
  }
});

// POST version for FCM debug panel tests
app.post('/api/test-notification', async (req, res) => {
  try {
    const { token, title, body } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'FCM token is required for test notification'
      });
    }

    // Try to send test notification using Firebase utils
    try {
      const { sendPushNotifications } = require('./utils/firebaseUtils');

      // Create a test user ID (just for the test)
      const testUserId = 'test-user-' + Date.now();

      // Mock user with the provided token by temporarily creating user-like object
      const User = require('./server/models/User');
      const testUser = new User({
        _id: new require('mongoose').Types.ObjectId(),
        name: 'Debug Test User',
        fcmToken: token,
        isActive: true
      });

      // Don't save to DB, just use for FCM test
      const result = await sendPushNotifications(
        [testUser._id],
        title || 'Debug Test',
        body || 'This is a test notification from the debug panel'
      );

      res.json({
        success: result.success,
        message: result.message,
        stats: result.stats
      });
    } catch (fcmError) {
      console.error('❌ FCM test failed:', fcmError);
      res.json({
        success: false,
        message: 'FCM test failed: ' + fcmError.message,
        error: fcmError.message
      });
    }
  } catch (error) {
    console.error('❌ Test notification POST failed:', error);
    res.status(500).json({
      success: false,
      message: 'Test notification failed',
      error: error.message
    });
  }
});

// Authentication middleware
const verifyToken = (req, res, next) => {
  try {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Access denied. No token provided."
      });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
      if (err) {
        return res.status(403).json({
          success: false,
          message: "Invalid or expired token."
        });
      }
      req.user = user;
      next();
    });
  } catch (error) {
    console.error("Token verification error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};

// Notification Schema
const notificationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  title: { type: String, required: true },
  message: { type: String, required: true },
  type: {
    type: String,
    enum: ["announcement", "prayer", "service", "event", "reminder", "welcome", "general"],
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

// Connect to MongoDB
const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;

    if (!mongoUri) {
      console.error('❌ MongoDB URI not found in environment variables');
      console.error('   Please set MONGO_URI or MONGODB_URI environment variable');
      console.error('   Expected format: mongodb://username:password@host:port/database');
      process.exit(1);
    }

    // Log the connection attempt (without exposing credentials)
    const safeUri = mongoUri.replace(/\/\/[^@]+@/, '//***:***@');
    console.log(`🔄 Connecting to MongoDB: ${safeUri}`);

    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('✅ Connected to MongoDB');
    console.log(`📂 Database: ${mongoose.connection.name}`);

    // Handle connection errors after initial connection
    mongoose.connection.on('error', (err) => {
      console.error('❌ MongoDB connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('⚠️ MongoDB disconnected');
    });

  } catch (error) {
    console.error('❌ MongoDB connection failed:', error);
    console.error('🔍 Debug info:');
    console.error(`   NODE_ENV: ${process.env.NODE_ENV}`);
    console.error(`   Has MONGO_URI: ${!!process.env.MONGO_URI}`);
    console.error(`   Has MONGODB_URI: ${!!process.env.MONGODB_URI}`);
    process.exit(1);
  }
};

// Initialize database connection
connectDB();

// Import models
const User = require('./server/models/User');

// Import routes
const announcementRoutes = require('./server/routes/announcements');
const eventRoutes = require('./server/routes/events');
const galleryRoutes = require('./server/routes/gallery');
const sermonRoutes = require('./server/routes/sermons');
const videoRoutes = require('./server/routes/videos');
const lyricsRoutes = require('./server/routes/lyrics');
const lyricsSimpleRoutes = require('./server/routes/lyrics-simple');
const meditationRoutes = require('./server/routes/meditation');
const prayerPartnerRoutes = require('./server/routes/prayerPartners');
const partnershipRequestRoutes = require('./server/routes/partnershipRequests');
const prayerRequestRoutes = require('./server/routes/prayerRequests');
const notificationRoutes = require('./server/routes/notifications');
const userRoutes = require('./server/routes/profile');
const adminRoutes = require('./server/routes/admin');
const adminPinRoutes = require('./server/routes/admin-pin');

// Firebase status endpoint for debugging
app.get('/api/fcm-status', async (req, res) => {
  try {
    const { getFirebaseStatus, isFirebaseAvailable } = require('./utils/firebaseUtils');

    // Get Firebase status
    const firebaseStatus = getFirebaseStatus();
    const isAvailable = isFirebaseAvailable();

    // Get user token statistics
    const totalUsers = await User.countDocuments({ isActive: { $ne: false } });
    const usersWithTokens = await User.countDocuments({
      fcmToken: { $ne: null, $exists: true },
      isActive: { $ne: false }
    });

    // Get tokens by platform
    const webTokens = await User.countDocuments({
      fcmToken: { $ne: null, $exists: true },
      fcmTokenPlatform: 'web',
      isActive: { $ne: false }
    });

    const nativeTokens = await User.countDocuments({
      fcmToken: { $ne: null, $exists: true },
      fcmTokenPlatform: 'native',
      isActive: { $ne: false }
    });

    res.json({
      success: true,
      firebase: {
        available: isAvailable,
        status: firebaseStatus
      },
      data: {
        totalUsers,
        usersWithTokens,
        usersWithoutTokens: totalUsers - usersWithTokens,
        tokenBreakdown: {
          web: webTokens,
          native: nativeTokens,
          unknown: usersWithTokens - webTokens - nativeTokens
        },
        readinessPercentage: totalUsers > 0 ? Math.round((usersWithTokens / totalUsers) * 100) : 0
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ FCM status check failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get FCM status',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Import debug route
const debugRoutes = require('./debug-user-permissions');

// Import upload handler if available
let uploadRoutes = null;
try {
  uploadRoutes = require('./server/routes/uploadHandler');
  console.log('📤 Upload handler loaded successfully');
} catch (error) {
  console.warn('⚠️ Upload handler not available:', error.message);
}

// User Authentication Endpoints (must be defined before mounting user router)
// User Registration
app.post('/api/user/register', async (req, res) => {
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
      error: err.message,
    });
  }
});

// User Login
app.post('/api/user/login', async (req, res) => {
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
      error: err.message,
    });
  }
});

// API routes
app.use('/api/announcements', announcementRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/gallery', galleryRoutes);
app.use('/api/sermons', sermonRoutes);
app.use('/api/videos', videoRoutes);
app.use('/api/lyrics', lyricsRoutes);
app.use('/api/lyrics-simple', lyricsSimpleRoutes);
app.use('/api/meditation', meditationRoutes);
app.use('/api/prayer-partners', prayerPartnerRoutes);
app.use('/api/partnership-requests', partnershipRequestRoutes);
app.use('/api/prayer-requests', prayerRequestRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/user', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin-pin', adminPinRoutes);
app.use('/api/debug', debugRoutes);

// Add upload routes if available
if (uploadRoutes) {
  app.use('/api', uploadRoutes);
}

// Legacy route mounts for frontend compatibility
app.use('/announcements', announcementRoutes);
app.use('/events', eventRoutes);
app.use('/gallery', galleryRoutes);
app.use('/meditation', meditationRoutes);
app.use('/ppartner', prayerPartnerRoutes);
app.use('/partnership-requests', partnershipRequestRoutes);
app.use('/prayer-requests', prayerRequestRoutes);


// Update FCM Token
app.post('/api/user/update-fcm-token', verifyToken, async (req, res) => {
  try {
    const { fcmToken, platform } = req.body;

    // Validation
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

    console.log(`📱 Updating FCM token for user ${req.user.id} on platform: ${platform}`);

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
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    console.log(`✅ FCM token updated successfully for user: ${updatedUser.name}`);

    res.json({
      success: true,
      message: "FCM Token updated successfully",
      data: {
        fcmToken: updatedUser.fcmToken.substring(0, 20) + "...",
        platform: updatedUser.fcmTokenPlatform,
        updated: updatedUser.fcmTokenUpdated,
        userId: updatedUser._id,
      },
    });
  } catch (err) {
    console.error("❌ Error updating FCM token:", err);
    res.status(500).json({
      success: false,
      message: "Server error while updating FCM token",
      error: err.message,
    });
  }
});

// Get user notifications
app.get('/api/user/notifications', verifyToken, async (req, res) => {
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

    console.log(`📱 Retrieved ${notifications.length} notifications for user ${userId}`);

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
app.post('/api/user/notifications/received', verifyToken, async (req, res) => {
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
app.patch('/api/user/notifications/:notificationId/read', verifyToken, async (req, res) => {
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

    console.log(`✅ Marked notification ${notificationId} as read for user ${userId}`);

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
});

// Clear notifications
app.post('/api/user/notifications/clear', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // Mark all notifications as read for the user
    const result = await Notification.updateMany(
      { userId, read: false },
      { read: true, readAt: new Date() }
    );

    console.log(`✅ Cleared ${result.modifiedCount} notifications for user ${userId}`);

    res.json({
      success: true,
      message: "Notifications cleared successfully",
      clearedCount: result.modifiedCount,
    });
  } catch (err) {
    console.error("❌ Error clearing notifications:", err);
    res.status(500).json({
      success: false,
      message: "Failed to clear notifications",
      error: err.message,
    });
  }
});

// Delete user account
app.delete('/api/user/delete', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // Find the user first to check for prayer partner relationships
    const userToDelete = await User.findById(userId);
    if (!userToDelete) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Handle prayer partner cleanup if user has a current partner
    if (userToDelete.currentPartner) {
      console.log(`🔗 User ${userId} has prayer partner ${userToDelete.currentPartner}, unpairing...`);

      // Remove partner relationship for the current partner
      await User.findByIdAndUpdate(userToDelete.currentPartner, {
        currentPartner: null,
        paired_this_week: false
      });

      console.log(`✅ Successfully unpaired partner ${userToDelete.currentPartner} from user ${userId}`);
    }

    // Also check if this user is someone else's partner and clean up
    const partnerOfThisUser = await User.findOne({ currentPartner: userId });
    if (partnerOfThisUser) {
      console.log(`🔗 Found user ${partnerOfThisUser._id} who has ${userId} as partner, unpairing...`);

      await User.findByIdAndUpdate(partnerOfThisUser._id, {
        currentPartner: null,
        paired_this_week: false
      });

      console.log(`✅ Successfully unpaired user ${partnerOfThisUser._id} from user ${userId}`);
    }

    // Clean up prayer partner requests - expire all pending requests involving this user
    try {
      const PrayerPartnerRequest = require('./server/models/PrayerPartnerRequest');

      const requestCleanupResult = await PrayerPartnerRequest.updateMany(
        {
          $or: [
            { requester: userId, status: 'pending' },
            { recipient: userId, status: 'pending' }
          ]
        },
        {
          status: 'expired',
          respondedAt: new Date(),
          adminNotes: 'Auto-expired due to user self-deletion'
        }
      );

      if (requestCleanupResult.modifiedCount > 0) {
        console.log(`🧹 Expired ${requestCleanupResult.modifiedCount} prayer partner requests for user ${userId}`);
      }
    } catch (error) {
      // Prayer partner requests model might not exist in all deployments
      console.log('⚠️ Prayer partner requests cleanup not available:', error.message);
    }

    // Perform hard delete and clear prayer partner fields
    const deletedUser = await User.findByIdAndDelete(userId);

    // Also delete user's notifications
    await Notification.deleteMany({ userId });

    console.log(`🗑️ User account deleted with complete prayer partner cleanup: ${deletedUser.name} (${deletedUser.phone})`);

    res.json({
      success: true,
      message: "User account and all prayer partner relationships deleted successfully",
    });
  } catch (err) {
    console.error("❌ Error deleting user:", err);
    res.status(500).json({
      success: false,
      message: "Failed to delete user account",
      error: err.message,
    });
  }
});

// API status endpoint
app.get('/api/status', (req, res) => {
  res.json({
    success: true,
    message: 'PCEA Turi Church API is running',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    endpoints: {
      // Authentication
      userRegister: 'POST /api/user/register',
      userLogin: 'POST /api/user/login',
      userDelete: 'DELETE /api/user/delete',
      updateFcmToken: 'POST /api/user/update-fcm-token',
      userInfo: 'GET/PUT /api/user/userinfo',
      // User Notifications
      getUserNotifications: 'GET /api/user/notifications',
      markNotificationReceived: 'POST /api/user/notifications/received',
      markNotificationRead: 'PATCH /api/user/notifications/:id/read',
      clearNotifications: 'POST /api/user/notifications/clear',
      // Content Management
      announcements: '/api/announcements',
      events: '/api/events',
      gallery: '/api/gallery',
      sermons: '/api/sermons',
      videos: '/api/videos',
      lyrics: '/api/lyrics',
      lyricsSimple: '/api/lyrics-simple',
      meditation: '/api/meditation',
      // Community Features
      prayerPartners: '/api/prayer-partners',
      partnershipRequests: '/api/partnership-requests',
      prayerRequests: '/api/prayer-requests',
      // Admin
      notifications: '/api/notifications',
      upload: uploadRoutes ? '/api/upload' : 'not available'
    }
  });
});

// 404 handler for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `API endpoint not found: ${req.method} ${req.originalUrl}`,
    availableEndpoints: '/api/status'
  });
});

// Global error handler
app.use((error, req, res, next) => {
  console.error('❌ Unhandled error:', error);
  
  // Don't leak error details in production
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  res.status(error.status || 500).json({
    success: false,
    message: error.message || 'Internal server error',
    ...(isDevelopment && { stack: error.stack })
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🔄 SIGTERM received, shutting down gracefully...');
  mongoose.connection.close(() => {
    console.log('✅ MongoDB connection closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('🔄 SIGINT received, shutting down gracefully...');
  mongoose.connection.close(() => {
    console.log('✅ MongoDB connection closed');
    process.exit(0);
  });
});

// Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 PCEA Turi Church Backend Server running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`�� Health check: http://localhost:${PORT}/health`);
  console.log(`📡 API status: http://localhost:${PORT}/api/status`);
  
  // Log available routes
  console.log('\n📋 Available API Routes:');
  console.log('  📢 Announcements: /api/announcements');
  console.log('  📅 Events: /api/events');
  console.log('  ����️  Gallery: /api/gallery');
  console.log('  🎥 Sermons: /api/sermons');
  console.log('  📹 Videos: /api/videos');
  console.log('  🎵 Lyrics: /api/lyrics');
  console.log('  🎼 Simple Lyrics: /api/lyrics-simple');
  console.log('  🙏 Meditation: /api/meditation');
  console.log('  🤝 Prayer Partners: /api/prayer-partners');
  console.log('  💌 Partnership Requests: /api/partnership-requests');
  console.log('  🙏 Prayer Requests: /api/prayer-requests');
  console.log('  👥 Users: /api/user');
  console.log('  🔔 Notifications: /api/notifications');
  if (uploadRoutes) {
    console.log('  📤 Upload: /api/upload');
  }
  console.log('');
});

module.exports = app;

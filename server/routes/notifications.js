const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Notification Schema (if not already defined elsewhere)
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

// Try to get existing model or create new one
let Notification;
try {
  Notification = mongoose.model("Notification");
} catch (error) {
  Notification = mongoose.model("Notification", notificationSchema);
}

// Authentication middleware (should be applied before these routes)
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

    const jwt = require('jsonwebtoken');
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

// GET /notifications - Get user notifications
router.get('/', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit) || 50;
    const skip = parseInt(req.query.skip) || 0;
    const unreadOnly = req.query.unread === 'true';

    // Build query
    const query = { userId };
    if (unreadOnly) {
      query.read = false;
    }

    // Get notifications for the user
    const notifications = await Notification.find(query)
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
    console.error("❌ Error fetching notifications:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch notifications",
      error: err.message,
    });
  }
});

// POST /notifications/received - Mark notification as received
router.post('/received', verifyToken, async (req, res) => {
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

// PATCH /notifications/:notificationId/read - Mark notification as read
router.patch('/:notificationId/read', verifyToken, async (req, res) => {
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

// POST /notifications/clear - Clear (mark all as read) notifications
router.post('/clear', verifyToken, async (req, res) => {
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

// POST /notifications/send - Admin route to send notifications to users
router.post('/send', verifyToken, async (req, res) => {
  try {
    const { title, message, type = 'general', userIds, data = {} } = req.body;

    if (!title || !message) {
      return res.status(400).json({
        success: false,
        message: "Title and message are required"
      });
    }

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "User IDs array is required"
      });
    }

    // Create notifications for all specified users
    const notifications = userIds.map(userId => ({
      userId,
      title,
      message,
      type,
      data,
      createdAt: new Date(),
      receivedAt: new Date()
    }));

    const createdNotifications = await Notification.insertMany(notifications);

    console.log(`📤 Sent ${createdNotifications.length} notifications: "${title}"`);

    res.json({
      success: true,
      message: "Notifications sent successfully",
      sentCount: createdNotifications.length,
      notifications: createdNotifications.map(n => ({
        id: n._id,
        userId: n.userId,
        title: n.title,
        type: n.type
      }))
    });
  } catch (err) {
    console.error("❌ Error sending notifications:", err);
    res.status(500).json({
      success: false,
      message: "Failed to send notifications",
      error: err.message,
    });
  }
});

// DELETE /notifications/:notificationId - Delete a specific notification
router.delete('/:notificationId', verifyToken, async (req, res) => {
  try {
    const { notificationId } = req.params;
    const userId = req.user.id;

    const deletedNotification = await Notification.findOneAndDelete({
      _id: notificationId,
      userId
    });

    if (!deletedNotification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found"
      });
    }

    console.log(`🗑️ Deleted notification ${notificationId} for user ${userId}`);

    res.json({
      success: true,
      message: "Notification deleted successfully"
    });
  } catch (err) {
    console.error("❌ Error deleting notification:", err);
    res.status(500).json({
      success: false,
      message: "Failed to delete notification",
      error: err.message,
    });
  }
});

// GET /notifications/stats - Get notification statistics for admin
router.get('/stats', verifyToken, async (req, res) => {
  try {
    const totalNotifications = await Notification.countDocuments();
    const readNotifications = await Notification.countDocuments({ read: true });
    const unreadNotifications = await Notification.countDocuments({ read: false });

    // Get breakdown by type
    const typeBreakdown = await Notification.aggregate([
      { $group: { _id: '$type', count: { $sum: 1 } } }
    ]);

    // Recent notifications
    const recentNotifications = await Notification.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .select('title type createdAt read')
      .lean();

    res.json({
      success: true,
      stats: {
        total: totalNotifications,
        read: readNotifications,
        unread: unreadNotifications,
        readPercentage: totalNotifications > 0 ? ((readNotifications / totalNotifications) * 100).toFixed(1) : 0,
        typeBreakdown: typeBreakdown.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
        recent: recentNotifications
      }
    });
  } catch (err) {
    console.error("❌ Error fetching notification stats:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch notification statistics",
      error: err.message,
    });
  }
});

// GET /notifications/test - Test endpoint
router.get('/test', async (req, res) => {
  try {
    const notificationCount = await Notification.countDocuments();
    
    res.json({
      success: true,
      message: 'Notifications route is working',
      data: {
        totalNotifications: notificationCount,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('❌ Notifications test failed:', error);
    res.status(500).json({
      success: false,
      message: 'Notifications test failed',
      error: error.message
    });
  }
});

module.exports = router;

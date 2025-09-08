const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { verifyToken, requireAdmin } = require('../../middlewares/auth');

// GET /api/admin/users - Get all users for admin panel
router.get('/users', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 100, search, active, hasToken } = req.query;

    // Build query with filters
    let query = {};

    // Search filter
    if (search) {
      const searchRegex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      query.$or = [
        { name: searchRegex },
        { phone: searchRegex }
      ];
    }

    // Active filter
    if (active !== undefined) {
      query.isActive = active === 'true';
    }

    // Token filter
    if (hasToken !== undefined) {
      if (hasToken === 'true') {
        query.fcmToken = { $ne: null, $exists: true };
      } else {
        query.$or = [
          { fcmToken: null },
          { fcmToken: { $exists: false } }
        ];
      }
    }

    // Pagination
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit))); // Max 100 per page
    const skip = (pageNum - 1) * limitNum;

    // Get users with pagination
    const [users, totalCount] = await Promise.all([
      User.find(query)
        .select('_id name phone fcmToken fcmTokenPlatform lastLogin createdAt isActive role')
        .sort({ name: 1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      User.countDocuments(query)
    ]);

    // Add notification capability status
    const usersWithStatus = users.map(user => ({
      ...user,
      id: user._id.toString(), // Add id field for frontend compatibility
      canReceiveNotifications: !!(user.fcmToken && user.fcmToken.length > 0),
      lastLoginFormatted: user.lastLogin ? new Date(user.lastLogin).toLocaleDateString() : 'Never',
    }));

    console.log(`📊 Admin fetched ${users.length} users with query:`, req.query);

    res.json({
      success: true,
      message: `Retrieved ${users.length} users`,
      users: usersWithStatus, // For compatibility with frontend expecting 'users' field
      data: {
        users: usersWithStatus,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: totalCount,
          pages: Math.ceil(totalCount / limitNum),
          hasNext: skip + limitNum < totalCount,
          hasPrev: pageNum > 1
        },
        stats: {
          total: totalCount,
          withNotificationTokens: users.filter(u => u.fcmToken).length,
          withoutTokens: users.filter(u => !u.fcmToken).length,
          active: users.filter(u => u.isActive !== false).length
        }
      }
    });
  } catch (error) {
    console.error('❌ Error fetching admin users:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users',
      error: error.message
    });
  }
});

// GET /api/admin/users/stats - Get user statistics
router.get('/users/stats', verifyToken, requireAdmin, async (req, res) => {
  try {
    const stats = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ isActive: true }),
      User.countDocuments({ fcmToken: { $ne: null, $exists: true } }),
      User.countDocuments({ role: 'admin' }),
      User.countDocuments({ currentPartner: { $ne: null } })
    ]);

    const [totalUsers, activeUsers, usersWithTokens, adminUsers, pairedUsers] = stats;

    res.json({
      success: true,
      data: {
        totalUsers,
        activeUsers,
        usersWithTokens,
        adminUsers,
        pairedUsers,
        tokenCoverage: totalUsers > 0 ? ((usersWithTokens / totalUsers) * 100).toFixed(1) + '%' : '0%',
        pairingRate: totalUsers > 0 ? ((pairedUsers / totalUsers) * 100).toFixed(1) + '%' : '0%'
      }
    });
  } catch (error) {
    console.error('❌ Error fetching user stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user statistics',
      error: error.message
    });
  }
});

// PUT /api/admin/users/:userId/status - Update user status
router.put('/users/:userId/status', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { isActive } = req.body;

    if (typeof isActive !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'isActive must be a boolean value'
      });
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { isActive },
      { new: true, select: '_id name phone isActive' }
    );

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    console.log(`👤 Admin ${req.user.id} updated user ${userId} status to ${isActive ? 'active' : 'inactive'}`);

    res.json({
      success: true,
      message: `User ${isActive ? 'activated' : 'deactivated'} successfully`,
      user: updatedUser
    });
  } catch (error) {
    console.error('❌ Error updating user status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user status',
      error: error.message
    });
  }
});

module.exports = router;

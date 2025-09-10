const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { verifyToken, requireAdminAccess } = require('../../middlewares/flexible-auth');

// GET /api/admin/users - Get all users for admin panel
router.get('/users', verifyToken, requireAdminAccess, async (req, res) => {
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
router.get('/users/stats', verifyToken, requireAdminAccess, async (req, res) => {
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
router.put('/users/:userId/status', verifyToken, requireAdminAccess, async (req, res) => {
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

// PUT /api/admin/users/:userId/role - Update user role and admin status
router.put('/users/:userId/role', verifyToken, requireAdminAccess, async (req, res) => {
  try {
    const { userId } = req.params;
    const { role, isAdmin } = req.body;

    // Validate role
    const validRoles = ['member', 'admin', 'pastor', 'elder'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid role. Must be one of: ' + validRoles.join(', ')
      });
    }

    // Validate isAdmin
    if (typeof isAdmin !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'isAdmin must be a boolean value'
      });
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        role,
        isAdmin: role === 'admin' ? true : isAdmin
      },
      { new: true, select: '_id name phone role isAdmin' }
    );

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    console.log(`👤 Admin ${req.user.id} updated user ${userId} role to ${role} (isAdmin: ${updatedUser.isAdmin})`);

    res.json({
      success: true,
      message: `User role updated to ${role} successfully`,
      user: updatedUser
    });
  } catch (error) {
    console.error('❌ Error updating user role:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user role',
      error: error.message
    });
  }
});

// PUT /api/admin/users/:userId - Update user profile (admin access)
router.put('/users/:userId', verifyToken, requireAdminAccess, async (req, res) => {
  try {
    const { userId } = req.params;
    const {
      name,
      phone,
      email,
      role,
      fellowshipZone,
      bio,
      isActive
    } = req.body;

    // Find the user first
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Validation
    const errors = [];

    if (name !== undefined && (!name || name.trim().length < 2)) {
      errors.push("Name must be at least 2 characters long");
    }

    // Phone number validation
    if (phone !== undefined) {
      const phoneRegex = /^\d{10}$/;
      const normalizedPhone = phone.replace(/\D/g, '');

      if (!phoneRegex.test(normalizedPhone)) {
        errors.push("Please provide a valid 10-digit phone number");
      } else if (normalizedPhone !== user.phone.replace(/\D/g, '')) {
        // Check uniqueness only if phone is being changed
        const existingUser = await User.findOne({
          phone: normalizedPhone,
          _id: { $ne: userId }
        });
        if (existingUser) {
          errors.push("This phone number is already registered");
        }
      }
    }

    // Email validation (optional)
    if (email !== undefined && email) {
      const emailRegex = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/;
      if (!emailRegex.test(email)) {
        errors.push("Please provide a valid email address");
      }
    }

    // Role validation
    if (role !== undefined) {
      const validRoles = ['member', 'admin', 'pastor', 'elder'];
      if (!validRoles.includes(role)) {
        errors.push("Invalid role. Must be one of: " + validRoles.join(', '));
      }
    }

    // Fellowship zone validation
    if (fellowshipZone !== undefined) {
      const validZones = ['General', 'Youth', 'Men', 'Women', 'Children', 'Teens'];
      if (!validZones.includes(fellowshipZone)) {
        errors.push("Invalid fellowship zone. Must be one of: " + validZones.join(', '));
      }
    }

    // Bio validation
    if (bio !== undefined && bio && bio.length > 200) {
      errors.push("Bio must not exceed 200 characters");
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Validation errors",
        errors
      });
    }

    // Build update object
    const updateFields = {};

    if (name !== undefined) updateFields.name = name.trim();
    if (phone !== undefined) updateFields.phone = phone.replace(/\D/g, '');
    if (email !== undefined) updateFields.email = email ? email.toLowerCase().trim() : null;
    if (role !== undefined) {
      updateFields.role = role;
      updateFields.isAdmin = role === 'admin';
    }
    if (fellowshipZone !== undefined) updateFields.fellowshipZone = fellowshipZone;
    if (bio !== undefined) updateFields.bio = bio?.trim() || null;
    if (isActive !== undefined) updateFields.isActive = isActive;

    // Update the user
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: updateFields },
      {
        new: true,
        runValidators: true,
        select: '-password'
      }
    );

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    console.log(`👤 Admin ${req.user.id} updated user ${userId} profile:`, Object.keys(updateFields));

    res.json({
      success: true,
      message: 'User profile updated successfully',
      user: updatedUser
    });

  } catch (error) {
    console.error('❌ Error updating user profile:', error);

    // Handle specific MongoDB errors
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Phone number already exists",
        error: "DUPLICATE_PHONE"
      });
    }

    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: validationErrors
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to update user profile',
      error: error.message
    });
  }
});

// DELETE /api/admin/users/:userId - Delete user with proper prayer partner cleanup
router.delete('/users/:userId', verifyToken, requireAdminAccess, async (req, res) => {
  try {
    const { userId } = req.params;
    const PrayerPartnerRequest = require('../models/PrayerPartnerRequest');

    // Check if user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Prevent admin from deleting themselves
    if (userId === req.user.id) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete your own account'
      });
    }

    // Handle prayer partner cleanup if user has a current partner
    if (user.currentPartner) {
      console.log(`🔗 User ${userId} has prayer partner ${user.currentPartner}, unpairing...`);

      // Remove partner relationship for both users
      await User.findByIdAndUpdate(user.currentPartner, {
        currentPartner: null,
        paired_this_week: false
      });

      console.log(`✅ Successfully unpaired partner ${user.currentPartner} from deleted user ${userId}`);
    }

    // Also check if this user is someone else's partner and clean up
    const partnerOfThisUser = await User.findOne({ currentPartner: userId });
    if (partnerOfThisUser) {
      console.log(`🔗 Found user ${partnerOfThisUser._id} who has ${userId} as partner, unpairing...`);

      await User.findByIdAndUpdate(partnerOfThisUser._id, {
        currentPartner: null,
        paired_this_week: false
      });

      console.log(`✅ Successfully unpaired user ${partnerOfThisUser._id} from deleted user ${userId}`);
    }

    // Clean up prayer partner requests - expire all pending requests involving this user
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
        adminNotes: 'Auto-expired due to user deletion'
      }
    );

    if (requestCleanupResult.modifiedCount > 0) {
      console.log(`🧹 Expired ${requestCleanupResult.modifiedCount} prayer partner requests for deleted user ${userId}`);
    }

    // Perform soft delete and clear prayer partner fields
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        isActive: false,
        deletedAt: new Date(),
        deletedBy: req.user.id,
        // Clear prayer partner fields
        currentPartner: null,
        paired_this_week: false,
        last_paired_with: null
      },
      { new: true, select: '_id name phone isActive currentPartner' }
    );

    console.log(`👤 Admin ${req.user.id} soft-deleted user ${userId} with complete prayer partner cleanup`);

    res.json({
      success: true,
      message: 'User account deactivated and all prayer partner relationships cleaned up successfully',
      user: updatedUser,
      cleanup: {
        requestsExpired: requestCleanupResult.modifiedCount
      }
    });

  } catch (error) {
    console.error('❌ Error deleting user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete user',
      error: error.message
    });
  }
});

// PUT /api/admin/users/:userId/restore - Restore user (Admin only)
router.put('/users/:userId/restore', verifyToken, requireAdminAccess, async (req, res) => {
  try {
    const userId = req.params.userId;

    const user = await User.findByIdAndUpdate(
      userId,
      {
        isActive: true,
        deletedAt: null,
        deletedBy: null,
        restoredAt: new Date(),
        restoredBy: req.user.id,
        updatedAt: new Date()
      },
      { new: true }
    ).select('-password -__v');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    console.log(`👤 Admin ${req.user.id} restored user account: ${user.email} (ID: ${userId})`);

    res.json({
      success: true,
      message: 'User account restored successfully',
      data: user
    });
  } catch (error) {
    console.error('❌ Error restoring user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to restore user account',
      error: error.message
    });
  }
});

// POST /api/admin/users/bulk-delete - Bulk delete users with prayer partner cleanup
router.post('/users/bulk-delete', verifyToken, requireAdminAccess, async (req, res) => {
  try {
    const { userIds } = req.body;
    const PrayerPartnerRequest = require('../models/PrayerPartnerRequest');

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'userIds array is required'
      });
    }

    // Prevent admin from deleting themselves
    if (userIds.includes(req.user.id)) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete your own account'
      });
    }

    // Get users to be deleted and their prayer partners
    const usersToDelete = await User.find({ _id: { $in: userIds } });
    const partnerIds = usersToDelete
      .filter(user => user.currentPartner)
      .map(user => user.currentPartner);

    // Find users who have any of the deleted users as partners
    const usersWithDeletedPartners = await User.find({
      currentPartner: { $in: userIds }
    });

    console.log(`🔗 Found ${partnerIds.length} direct partners and ${usersWithDeletedPartners.length} reverse partners to unpair`);

    // Unpair all affected users (both directions)
    const allAffectedPartnerIds = [...new Set([...partnerIds, ...usersWithDeletedPartners.map(u => u._id)])];

    if (allAffectedPartnerIds.length > 0) {
      await User.updateMany(
        { _id: { $in: allAffectedPartnerIds } },
        {
          currentPartner: null,
          paired_this_week: false
        }
      );

      console.log(`✅ Unpaired ${allAffectedPartnerIds.length} users from prayer partnerships`);
    }

    // Clean up prayer partner requests - expire all pending requests involving deleted users
    const requestCleanupResult = await PrayerPartnerRequest.updateMany(
      {
        $or: [
          { requester: { $in: userIds }, status: 'pending' },
          { recipient: { $in: userIds }, status: 'pending' }
        ]
      },
      {
        status: 'expired',
        respondedAt: new Date(),
        adminNotes: 'Auto-expired due to user deletion'
      }
    );

    if (requestCleanupResult.modifiedCount > 0) {
      console.log(`🧹 Expired ${requestCleanupResult.modifiedCount} prayer partner requests for bulk deleted users`);
    }

    // Perform bulk soft delete (deactivate accounts) and clear prayer partner fields
    const result = await User.updateMany(
      { _id: { $in: userIds } },
      {
        isActive: false,
        deletedAt: new Date(),
        deletedBy: req.user.id,
        // Clear prayer partner fields
        currentPartner: null,
        paired_this_week: false,
        last_paired_with: null
      }
    );

    console.log(`👤 Admin ${req.user.id} bulk-deactivated ${result.modifiedCount} users with complete prayer partner cleanup`);

    res.json({
      success: true,
      message: `${result.modifiedCount} user accounts deactivated and all prayer partner relationships cleaned up successfully`,
      data: {
        requested: userIds.length,
        deletedCount: result.modifiedCount,
        unpairedPartners: allAffectedPartnerIds.length,
        requestsExpired: requestCleanupResult.modifiedCount
      }
    });

  } catch (error) {
    console.error('❌ Error bulk deleting users:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to bulk delete users',
      error: error.message
    });
  }
});

module.exports = router;

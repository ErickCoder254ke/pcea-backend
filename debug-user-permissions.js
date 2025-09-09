/**
 * Debug User Permissions
 * 
 * This script helps debug current user permissions
 * Usage: Add this route to your server temporarily or run as standalone
 */

const express = require('express');
const router = express.Router();
const { verifyToken } = require('./middlewares/auth');

// GET /api/debug/user-permissions - Debug current user permissions
router.get('/user-permissions', verifyToken, async (req, res) => {
  try {
    const User = require('./server/models/User');
    
    // Get current user details
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
        debugInfo: {
          tokenUserId: req.user.id,
          timestamp: new Date().toISOString()
        }
      });
    }

    // Check admin status
    const isAdminUser = user.isAdminUser ? user.isAdminUser() : false;

    const debugInfo = {
      user: {
        id: user._id,
        name: user.name,
        phone: user.phone,
        role: user.role || 'member',
        isAdmin: user.isAdmin || false,
        isAdminUser: isAdminUser,
        canSendNotifications: isAdminUser
      },
      token: {
        userId: req.user.id,
        payload: req.user
      },
      permissions: {
        hasAdminRole: user.role === 'admin',
        hasAdminFlag: user.isAdmin === true,
        hasAdminMethod: typeof user.isAdminUser === 'function',
        passesAdminCheck: isAdminUser
      },
      suggestions: []
    };

    // Add suggestions based on current state
    if (!isAdminUser) {
      debugInfo.suggestions.push('User needs admin permissions to send notifications');
      debugInfo.suggestions.push(`Run: node setup-admin.js ${user.phone}`);
      debugInfo.suggestions.push('Or manually update user role to "admin" in database');
    }

    console.log('🔍 User permissions debug:', {
      userId: user._id,
      name: user.name,
      phone: user.phone,
      isAdmin: isAdminUser
    });

    res.json({
      success: true,
      message: 'User permissions debug info',
      debug: debugInfo
    });

  } catch (error) {
    console.error('❌ Error debugging user permissions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to debug user permissions',
      error: error.message
    });
  }
});

module.exports = router;

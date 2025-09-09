const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { verifyToken } = require('../../middlewares/auth');

// Admin PIN (should match frontend)
const ADMIN_PIN = '2024pcea';

// POST /api/admin-pin/verify - Verify admin PIN and grant admin session
router.post('/verify', verifyToken, async (req, res) => {
  try {
    const { pin } = req.body;

    if (!pin) {
      return res.status(400).json({
        success: false,
        message: 'PIN is required'
      });
    }

    if (pin !== ADMIN_PIN) {
      console.log(`❌ Failed admin PIN attempt from user ${req.user.id}`);
      return res.status(403).json({
        success: false,
        message: 'Invalid admin PIN'
      });
    }

    // Generate admin session token
    const adminToken = jwt.sign(
      { 
        userId: req.user.id, 
        isAdmin: true, 
        adminVerified: true,
        pinVerifiedAt: new Date().toISOString()
      },
      process.env.JWT_SECRET,
      { expiresIn: '2h' } // Admin session expires in 2 hours
    );

    console.log(`✅ Admin PIN verified for user ${req.user.id}`);

    res.json({
      success: true,
      message: 'Admin access granted',
      adminToken,
      expiresIn: '2h'
    });

  } catch (error) {
    console.error('❌ Error verifying admin PIN:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify admin PIN',
      error: error.message
    });
  }
});

// GET /api/admin-pin/status - Check current admin session status
router.get('/status', verifyToken, async (req, res) => {
  try {
    // Check if user has valid admin session
    const adminToken = req.headers['x-admin-token'];
    
    if (!adminToken) {
      return res.json({
        success: true,
        isAdmin: false,
        message: 'No admin session found'
      });
    }

    // Verify admin token
    jwt.verify(adminToken, process.env.JWT_SECRET, (err, decoded) => {
      if (err || !decoded.adminVerified) {
        return res.json({
          success: true,
          isAdmin: false,
          message: 'Invalid or expired admin session'
        });
      }

      res.json({
        success: true,
        isAdmin: true,
        adminVerified: true,
        pinVerifiedAt: decoded.pinVerifiedAt,
        expiresAt: new Date(decoded.exp * 1000).toISOString()
      });
    });

  } catch (error) {
    console.error('❌ Error checking admin status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check admin status',
      error: error.message
    });
  }
});

module.exports = router;

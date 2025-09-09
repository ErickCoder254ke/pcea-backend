const jwt = require("jsonwebtoken");
require("dotenv").config();

// Original token verification (reused from auth.js)
const verifyToken = (req, res, next) => {
  try {
    const authHeader = req.header("Authorization");

    if (!authHeader) {
      return res.status(401).json({
        success: false,
        message: "Access Denied: No authorization header provided",
      });
    }

    let token;
    if (authHeader.startsWith("Bearer ")) {
      token = authHeader.slice(7).trim();
    } else {
      token = authHeader.trim();
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Access Denied: No token provided",
      });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
      if (err) {
        console.error("🔒 Token verification error:", err.message);

        if (err.name === "TokenExpiredError") {
          return res.status(401).json({
            success: false,
            message: "Token has expired. Please log in again.",
            code: "TOKEN_EXPIRED",
          });
        } else if (err.name === "JsonWebTokenError") {
          return res.status(403).json({
            success: false,
            message: "Invalid token format. Please log in again.",
            code: "INVALID_TOKEN",
          });
        } else {
          return res.status(403).json({
            success: false,
            message: "Token verification failed. Please log in again.",
            code: "VERIFICATION_FAILED",
          });
        }
      }

      if (!decoded || !decoded.id) {
        return res.status(403).json({
          success: false,
          message: "Invalid token payload. Please log in again.",
          code: "INVALID_PAYLOAD",
        });
      }

      req.user = decoded;
      next();
    });
  } catch (error) {
    console.error("❌ Auth middleware unexpected error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error during authentication",
      code: "AUTH_SERVER_ERROR",
    });
  }
};

// Flexible admin middleware that accepts PIN-based OR database-based admin verification
const requireAdminAccess = async (req, res, next) => {
  try {
    // Ensure user is authenticated first
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
        code: "AUTH_REQUIRED"
      });
    }

    // Method 1: Check for PIN-based admin token in headers
    const adminToken = req.headers['x-admin-token'];
    console.log(`🔍 Admin token present: ${!!adminToken}`);
    console.log(`🔍 User ID from auth: ${req.user.id}`);

    if (adminToken) {
      try {
        console.log(`🔍 Attempting to verify admin token...`);
        const adminDecoded = jwt.verify(adminToken, process.env.JWT_SECRET);
        console.log(`🔍 Admin token decoded:`, {
          userId: adminDecoded.userId,
          adminVerified: adminDecoded.adminVerified,
          isAdmin: adminDecoded.isAdmin,
          exp: adminDecoded.exp ? new Date(adminDecoded.exp * 1000) : null
        });

        if (adminDecoded.adminVerified && adminDecoded.userId === req.user.id) {
          console.log(`🔐 PIN-based admin access granted to user: ${req.user.id}`);
          req.adminVerified = true;
          req.adminMethod = 'pin';
          return next();
        } else {
          console.log(`❌ Admin token verification failed:`, {
            adminVerified: adminDecoded.adminVerified,
            userIdMatch: adminDecoded.userId === req.user.id,
            tokenUserId: adminDecoded.userId,
            requestUserId: req.user.id
          });
        }
      } catch (adminTokenError) {
        console.log('❌ Invalid admin token error:', adminTokenError.message);
        console.log('❌ Admin token error details:', {
          name: adminTokenError.name,
          message: adminTokenError.message,
          tokenLength: adminToken ? adminToken.length : 0,
          tokenStart: adminToken ? adminToken.substring(0, 20) + '...' : 'null',
          jwtSecretExists: !!process.env.JWT_SECRET
        });
        // Continue to check database method
      }
    } else {
      console.log('❌ No admin token in headers');
    }

    // Method 2: Check database admin role (fallback for existing admin users)
    console.log(`🔍 Checking database admin permissions for user: ${req.user.id}`);
    try {
      const User = require('../server/models/User');
      const user = await User.findById(req.user.id).select('role isAdmin');

      if (!user) {
        console.log(`❌ User not found in database: ${req.user.id}`);
        return res.status(404).json({
          success: false,
          message: "User not found",
          code: "USER_NOT_FOUND"
        });
      }

      console.log(`🔍 User found in database:`, {
        id: user._id,
        role: user.role,
        isAdmin: user.isAdmin,
        hasIsAdminUserMethod: typeof user.isAdminUser === 'function'
      });

      // Check if user has database admin permissions
      if (user.isAdminUser && user.isAdminUser()) {
        console.log(`🔐 Database admin access granted to user: ${req.user.id} (role: ${user.role})`);
        req.adminVerified = true;
        req.adminMethod = 'database';
        req.user.role = user.role;
        req.user.isAdmin = user.isAdmin;
        return next();
      } else {
        console.log(`❌ User does not have database admin permissions`);
      }
    } catch (dbError) {
      console.error("❌ Error checking database admin status:", dbError);
      // Continue to PIN verification suggestion
    }

    // Method 3: No admin access found - suggest PIN verification
    return res.status(403).json({
      success: false,
      message: "Admin access required. Please enter admin PIN to continue.",
      code: "ADMIN_PIN_REQUIRED",
      suggestion: {
        action: "verify_pin",
        endpoint: "/api/admin-pin/verify",
        method: "POST",
        body: { pin: "admin_pin_here" }
      }
    });

  } catch (error) {
    console.error("❌ Error in admin access check:", error);
    res.status(500).json({
      success: false,
      message: "Error verifying admin permissions",
      code: "ADMIN_CHECK_ERROR"
    });
  }
};

// Simpler PIN-only admin middleware (for routes that should only use PIN)
const requirePinAdmin = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
        code: "AUTH_REQUIRED"
      });
    }

    const adminToken = req.headers['x-admin-token'];
    if (!adminToken) {
      return res.status(403).json({
        success: false,
        message: "Admin PIN verification required",
        code: "ADMIN_PIN_REQUIRED",
        suggestion: {
          action: "verify_pin",
          endpoint: "/api/admin-pin/verify"
        }
      });
    }

    const adminDecoded = jwt.verify(adminToken, process.env.JWT_SECRET);
    if (!adminDecoded.adminVerified || adminDecoded.userId !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "Invalid admin session",
        code: "INVALID_ADMIN_SESSION"
      });
    }

    console.log(`🔐 PIN admin access granted to user: ${req.user.id}`);
    req.adminVerified = true;
    req.adminMethod = 'pin';
    next();

  } catch (error) {
    console.error("❌ Error in PIN admin verification:", error);
    res.status(500).json({
      success: false,
      message: "Error verifying PIN admin access",
      code: "PIN_ADMIN_ERROR"
    });
  }
};

module.exports = {
  verifyToken,
  requireAdminAccess,
  requirePinAdmin
};

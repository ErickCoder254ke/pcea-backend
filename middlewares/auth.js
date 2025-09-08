const jwt = require("jsonwebtoken");
require("dotenv").config(); // Load environment variables

const verifyToken = (req, res, next) => {
  try {
    // Retrieve the token from the Authorization header
    const authHeader = req.header("Authorization");

    // Check if token is present
    if (!authHeader) {
      return res.status(401).json({
        success: false,
        message: "Access Denied: No authorization header provided",
      });
    }

    // Extract token from header
    let token;
    if (authHeader.startsWith("Bearer ")) {
      token = authHeader.slice(7).trim();
    } else {
      token = authHeader.trim();
    }

    // Check if token exists after extraction
    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Access Denied: No token provided",
      });
    }

    // Verify the token with the JWT secret
    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
      if (err) {
        console.error("🔒 Token verification error:", err.message);

        // Detailed error handling for different token issues
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
        } else if (err.name === "NotBeforeError") {
          return res.status(403).json({
            success: false,
            message: "Token is not active yet.",
            code: "TOKEN_NOT_ACTIVE",
          });
        } else {
          return res.status(403).json({
            success: false,
            message: "Token verification failed. Please log in again.",
            code: "VERIFICATION_FAILED",
          });
        }
      }

      // Validate decoded token structure
      if (!decoded || !decoded.id) {
        return res.status(403).json({
          success: false,
          message: "Invalid token payload. Please log in again.",
          code: "INVALID_PAYLOAD",
        });
      }

      // Attach decoded user info to request object
      req.user = decoded;

      // Log successful authentication for debugging (only in development)
      if (process.env.NODE_ENV === "development") {
        console.log(`✅ User authenticated: ${decoded.id}`);
      }

      next(); // Proceed to the next middleware/route handler
    });
  } catch (error) {
    // Catch and log any other unexpected errors
    console.error("❌ Auth middleware unexpected error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error during authentication",
      code: "AUTH_SERVER_ERROR",
    });
  }
};

// Optional middleware for routes that work with or without authentication
const optionalAuth = (req, res, next) => {
  const authHeader = req.header("Authorization");

  if (!authHeader) {
    // No token provided, but that's okay for optional auth
    req.user = null;
    return next();
  }

  // Use the main verifyToken logic but don't fail if token is invalid
  try {
    let token;
    if (authHeader.startsWith("Bearer ")) {
      token = authHeader.slice(7).trim();
    } else {
      token = authHeader.trim();
    }

    if (!token) {
      req.user = null;
      return next();
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
      if (err || !decoded || !decoded.id) {
        // Token is invalid, but that's okay for optional auth
        req.user = null;
      } else {
        // Token is valid, attach user info
        req.user = decoded;
      }
      next();
    });
  } catch (error) {
    console.error("❌ Optional auth error:", error);
    req.user = null;
    next();
  }
};

// Middleware to check if user is admin
const requireAdmin = async (req, res, next) => {
  // First verify token
  verifyToken(req, res, async (err) => {
    if (err) return; // verifyToken already sent response

    try {
      // Get User model
      const User = require('../server/models/User');

      // Find the user and check admin status
      const user = await User.findById(req.user.id).select('role isAdmin');

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
          code: "USER_NOT_FOUND"
        });
      }

      // Check if user is admin using the User model's method
      if (!user.isAdminUser()) {
        return res.status(403).json({
          success: false,
          message: "Admin access required. Insufficient permissions.",
          code: "INSUFFICIENT_PERMISSIONS"
        });
      }

      // Attach user info to request for further use
      req.user.role = user.role;
      req.user.isAdmin = user.isAdmin;

      if (process.env.NODE_ENV === "development") {
        console.log(`🔐 Admin access granted to user: ${req.user.id} (role: ${user.role})`);
      }

      next();
    } catch (error) {
      console.error("❌ Error checking admin status:", error);
      res.status(500).json({
        success: false,
        message: "Error verifying admin permissions",
        code: "ADMIN_CHECK_ERROR"
      });
    }
  });
};

module.exports = {
  verifyToken,
  optionalAuth,
  requireAdmin,
};

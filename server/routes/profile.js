const express = require("express");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const User = require("../models/User");
const dotenv = require("dotenv");

dotenv.config();

const router = express.Router();

// Middleware to verify token
const authenticateToken = (req, res, next) => {
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
};

// Simplified validation helper functions for essential fields only
const validateEmail = (email) => {
  if (!email) return true; // Email is optional
  const emailRegex = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/;
  return emailRegex.test(email);
};

// Get user info - returns all stored data for display purposes
router.get("/userinfo", authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .select("-password")
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found."
      });
    }

    // Add virtual fields manually for lean query
    const userData = {
      ...user,
      generatedEmail: user.email || `${user.name?.toLowerCase().replace(/\s+/g, '.')}@pceaturichurch.com`,
      membershipDuration: user.memberSince ?
        Math.ceil(Math.abs(new Date() - new Date(user.memberSince)) / (1000 * 60 * 60 * 24 * 30)) : 0,
      age: user.dateOfBirth ?
        new Date().getFullYear() - new Date(user.dateOfBirth).getFullYear() : null
    };

    res.json({
      success: true,
      data: userData,
      ...userData // Also spread at root level for backward compatibility
    });
  } catch (error) {
    console.error("Error fetching user data:", error);
    res.status(500).json({
      success: false,
      message: "Server error.",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Update user profile - simplified to handle only essential fields
router.put("/userinfo", authenticateToken, async (req, res) => {
  try {
    console.log(`📝 Profile update request from user ${req.user.id}`);

    const {
      name,
      email,
      bio,
      profileImage
    } = req.body;

    // Note: Phone number is not included - it's read-only during profile updates

    // Find the user
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found."
      });
    }

    // Simplified validation for essential fields only
    const errors = [];

    if (name !== undefined && (!name || name.trim().length < 2)) {
      errors.push("Name must be at least 2 characters long");
    }

    // Phone number validation removed - phone is read-only during profile updates

    if (email !== undefined && email && !validateEmail(email)) {
      errors.push("Please provide a valid email address");
    }

    if (bio !== undefined && bio && bio.length > 200) {
      errors.push("Bio must not exceed 200 characters");
    }

    if (profileImage !== undefined && profileImage && typeof profileImage !== 'string') {
      errors.push("Profile image must be a valid URL");
    }

    if (errors.length > 0) {
      console.log(`❌ Validation errors for user ${req.user.id}:`, errors);
      return res.status(400).json({
        success: false,
        message: "Validation errors",
        errors
      });
    }

    // Update only the essential fields that are provided in the request
    const updateFields = {};

    if (name !== undefined) updateFields.name = name.trim();
    // Phone number updates removed - phone is read-only during profile updates
    if (email !== undefined) updateFields.email = email?.toLowerCase().trim() || null;
    if (bio !== undefined) updateFields.bio = bio?.trim() || null;
    if (profileImage !== undefined) updateFields.profileImage = profileImage?.trim() || null;

    console.log(`📝 Update fields:`, updateFields);

    // Update the user
    const updatedUser = await User.findByIdAndUpdate(
      req.user.id,
      { $set: updateFields },
      {
        new: true,
        runValidators: true,
        lean: true
      }
    ).select("-password");

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: "User not found."
      });
    }

    // Add virtual fields manually for lean query
    const userData = {
      ...updatedUser,
      generatedEmail: updatedUser.email || `${updatedUser.name?.toLowerCase().replace(/\s+/g, '.')}@pceaturichurch.com`,
      membershipDuration: updatedUser.memberSince ?
        Math.ceil(Math.abs(new Date() - new Date(updatedUser.memberSince)) / (1000 * 60 * 60 * 24 * 30)) : 0,
      age: updatedUser.dateOfBirth ?
        new Date().getFullYear() - new Date(updatedUser.dateOfBirth).getFullYear() : null
    };

    res.json({
      success: true,
      message: "Profile updated successfully",
      data: userData,
      ...userData // Also spread at root level for backward compatibility
    });

  } catch (error) {
    console.error("Error updating profile:", error);

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
      message: "Server error while updating profile.",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get public profile (limited information) - simplified for essential info only
router.get("/profile/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID"
      });
    }

    const user = await User.findById(userId)
      .select("name fellowshipZone memberSince profileImage bio")
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // Return only essential public information
    const publicProfile = {
      _id: user._id,
      name: user.name,
      fellowshipZone: user.fellowshipZone,
      memberSince: user.memberSince,
      profileImage: user.profileImage,
      bio: user.bio,
      membershipDuration: user.memberSince ?
        Math.ceil(Math.abs(new Date() - new Date(user.memberSince)) / (1000 * 60 * 60 * 24 * 30)) : 0
    };

    res.json({
      success: true,
      data: publicProfile
    });

  } catch (error) {
    console.error("Error fetching public profile:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Health check endpoint for profile service
router.get("/health", (req, res) => {
  res.json({
    success: true,
    message: "Profile service is healthy",
    timestamp: new Date().toISOString(),
    service: "profile-api"
  });
});

module.exports = router;

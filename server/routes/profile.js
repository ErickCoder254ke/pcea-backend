const express = require("express");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const User = require("../models/User");
const dotenv = require("dotenv");

dotenv.config();

const router = express.Router();

// Middleware to verify token
const authenticateToken = (req, res, next) => {
  console.log(`🔐 Auth check for ${req.method} ${req.path}`);

  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  console.log(`🔐 Auth header: ${authHeader ? 'present' : 'missing'}`);
  console.log(`🔐 Token: ${token ? 'present' : 'missing'}`);

  if (!token) {
    console.log(`❌ No token provided`);
    return res.status(401).json({
      success: false,
      message: "Access denied. No token provided."
    });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      console.log(`❌ Token verification failed:`, err.message);
      return res.status(403).json({
        success: false,
        message: "Invalid or expired token."
      });
    }
    console.log(`✅ Token verified for user: ${user.id}`);
    req.user = user;
    next();
  });
};

// Validation helper functions
const normalizePhoneNumber = (phone) => {
  if (!phone) return phone;
  // Remove all non-digit characters and ensure it's a string
  return phone.toString().replace(/\D/g, '');
};

const validatePhoneNumber = (phone) => {
  const normalizedPhone = normalizePhoneNumber(phone);
  const phoneRegex = /^\d{10}$/;
  return phoneRegex.test(normalizedPhone);
};

const validateEmail = (email) => {
  if (!email) return true; // Email is optional
  const emailRegex = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/;
  return emailRegex.test(email);
};

const generateEmailFromName = (name) => {
  if (!name) return null;
  // Convert name to email format: "John Doe" -> "john.doe@pceachurch.com"
  const emailPrefix = name.toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, '') // Remove special characters
    .replace(/\s+/g, '.'); // Replace spaces with dots
  return `${emailPrefix}@pceachurch.com`;
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
    console.log(`📝 Request body:`, req.body);
    console.log(`📝 Headers:`, req.headers);

    const {
      name,
      phone,
      email,
      bio,
      profileImage
    } = req.body;

    console.log(`📝 Extracted fields: name="${name}", phone="${phone}", email="${email}", bio="${bio}", profileImage="${profileImage}"`);

    // Note: Phone number editing is now re-enabled

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

    // Phone number validation
    if (phone !== undefined) {
      const normalizedRequestPhone = normalizePhoneNumber(phone);
      const normalizedCurrentPhone = normalizePhoneNumber(user.phone);

      console.log(`📞 Phone validation - Request: "${phone}" -> "${normalizedRequestPhone}", Current: "${user.phone}" -> "${normalizedCurrentPhone}"`);

      if (!validatePhoneNumber(phone)) {
        errors.push("Please provide a valid 10-digit phone number");
      } else if (normalizedRequestPhone !== normalizedCurrentPhone) {
        console.log(`📞 Checking phone uniqueness for: "${normalizedRequestPhone}"`);
        // Only check uniqueness if phone number is actually being changed
        const existingUser = await User.findOne({
          phone: normalizedRequestPhone,
          _id: { $ne: req.user.id }
        });
        if (existingUser) {
          console.log(`❌ Phone "${normalizedRequestPhone}" already exists for user: ${existingUser._id}`);
          errors.push("This phone number is already registered");
        } else {
          console.log(`✅ Phone "${normalizedRequestPhone}" is available`);
        }
      } else {
        console.log(`📞 Phone number unchanged, skipping uniqueness check`);
      }
    }

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

    // Phone number updates (now re-enabled)
    if (phone !== undefined) {
      const normalizedRequestPhone = normalizePhoneNumber(phone);
      const normalizedCurrentPhone = normalizePhoneNumber(user.phone);

      if (normalizedRequestPhone !== normalizedCurrentPhone) {
        console.log(`📞 Including phone in update: "${phone}" -> "${normalizedRequestPhone}"`);
        updateFields.phone = normalizedRequestPhone;
      } else {
        console.log(`📞 Skipping phone update - same as current`);
      }
    }

    // Email handling with automatic generation
    if (email !== undefined) {
      if (email && email.trim()) {
        // User provided a valid email
        updateFields.email = email.toLowerCase().trim();
        console.log(`📧 Setting custom email: ${updateFields.email}`);
      } else if (!user.email) {
        // User has no email and didn't provide one - generate one
        const generatedEmail = generateEmailFromName(updateFields.name || user.name);
        if (generatedEmail) {
          updateFields.email = generatedEmail;
          console.log(`📧 Generated email for user: ${generatedEmail}`);
        }
      }
      // If user has existing email and submits empty, keep existing email (don't update)
    }

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

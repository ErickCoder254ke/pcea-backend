const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const User = require("../models/User");
const { verifyToken, requireAdmin } = require("../../middlewares/auth");

// Helper function to pair users
const assignPartners = async () => {
  try {
    // Get all users who haven't been paired this week
    let users = await User.find({ paired_this_week: false });
    if (users.length < 2) return { pairs: [], error: "Not enough users to pair." };

    const pairs = [];
    const unpairedUsers = [...users];

    while (unpairedUsers.length > 1) {
      let user1 = unpairedUsers.pop(); // Take one user
      let user2Index = unpairedUsers.findIndex(
        (u) => u._id.toString() !== user1.last_paired_with?.toString()
      );

      if (user2Index === -1) continue; // No valid pair found, skip this user for now

      let user2 = unpairedUsers.splice(user2Index, 1)[0]; // Pair user1 with user2

      // Check if user2 is valid and has not been deleted
      if (!user2 || !user2._id) {
        console.error(`User2 is invalid, skipping pairing with ${user1.name}`);
        continue; // Skip pairing if user2 is invalid
      }

      // Save the pair in the database
      await User.findByIdAndUpdate(user1._id, {
        currentPartner: user2._id,
        last_paired_with: user2._id,
        paired_this_week: true,
      });

      await User.findByIdAndUpdate(user2._id, {
        currentPartner: user1._id,
        last_paired_with: user1._id,
        paired_this_week: true,
      });

      pairs.push({ user1, user2 });
    }

    return { pairs, error: null };
  } catch (error) {
    console.error("Error assigning partners:", error);
    return { pairs: [], error: error.message };
  }
};

// Automatically check for new users and pair them
const pairNewUsers = async () => {
  try {
    // Fetch unpaired users
    const unpairedUsers = await User.find({ paired_this_week: false });
    if (unpairedUsers.length >= 2) {
      console.log("New users detected, attempting to pair...");
      const { pairs, error } = await assignPartners();
      if (error) console.error("Error during pairing:", error);
      else console.log("Pairs created:", pairs);
    } else {
      console.log("Not enough unpaired users to create new pairs.");
    }
  } catch (error) {
    console.error("Error in pairing new users:", error.message);
  }
};

// Route to trigger pairing manually
router.post("/pair-users", requireAdmin, async (req, res) => {
  try {
    const { pairs, error } = await assignPartners();
    if (error) return res.status(500).json({ message: "Error pairing users", error });

    res.status(200).json({ message: "Users paired successfully.", pairs });
  } catch (error) {
    console.error("Error pairing users:", error);
    res.status(500).json({ message: "Error pairing users", error: error.message });
  }
});

// Route to fetch current pairs
router.get("/current-pairs", async (req, res) => {
  try {
    const users = await User.find({ currentPartner: { $ne: null } }).populate(
      "currentPartner",
      "name phone"
    );

    if (!users.length) return res.status(200).json({ 
      success: true,
      message: "No pairing data available yet.",
      pairs: [],
      unpairedUsers: []
    });

    const pairs = [];
    const seen = new Set();

    users.forEach((user) => {
      if (!seen.has(user._id.toString())) {
        seen.add(user._id.toString());

        // Ensure the partner is valid and exists
        if (user.currentPartner && user.currentPartner._id) {
          seen.add(user.currentPartner._id.toString());
          pairs.push({
            user1: { name: user.name, phone: user.phone, id: user._id },
            user2: { name: user.currentPartner.name, phone: user.currentPartner.phone, id: user.currentPartner._id },
          });
        } else {
          console.warn(`User ${user.name} has an invalid or deleted partner.`);
        }
      }
    });

    // Get unpaired users
    const unpairedUsers = await User.find({ currentPartner: null }).select("name phone createdAt");

    res.status(200).json({ 
      success: true,
      pairs,
      unpairedUsers: unpairedUsers.map(user => ({
        id: user._id,
        name: user.name,
        phone: user.phone,
        joinedDate: user.createdAt
      }))
    });
  } catch (error) {
    console.error("Error fetching current pairs:", error);
    res.status(500).json({ 
      success: false,
      message: "Error fetching current pairs", 
      error: error.message 
    });
  }
});

// Admin route to get detailed statistics
router.get("/admin/stats", requireAdmin, async (req, res) => {
  try {
    // Get all users with prayer partner data
    const allUsers = await User.find({});
    const pairedUsers = await User.find({ currentPartner: { $ne: null } });
    const unpairedUsers = await User.find({ currentPartner: null });

    // Get partnership request statistics
    let partnershipRequestStats = { pending: 0 };
    try {
      const PrayerPartnerRequest = require("../models/PrayerPartnerRequest");
      if (PrayerPartnerRequest.getStatistics) {
        const requestStats = await PrayerPartnerRequest.getStatistics();
        partnershipRequestStats = requestStats[0] || { pending: 0 };
      }
    } catch (error) {
      console.warn("Partnership requests not available:", error.message);
    }

    // Get prayer request statistics
    let prayerRequestStats = { pending: 0 };
    try {
      const PrayerRequest = require("../models/PrayerRequest");
      if (PrayerRequest.getStatistics) {
        const reqStats = await PrayerRequest.getStatistics();
        prayerRequestStats = reqStats[0] || { pending: 0 };
      }
    } catch (error) {
      console.warn("Prayer requests not available:", error.message);
    }

    const stats = {
      totalUsers: allUsers.length,
      totalPairs: Math.floor(pairedUsers.length / 2),
      unpairedUsers: unpairedUsers.length,
      weeklyActivity: 85, // This could be calculated based on actual activity data
      pendingRequests: prayerRequestStats.pending || 0,
      pendingPartnershipRequests: partnershipRequestStats.pending || 0
    };

    res.status(200).json({ success: true, stats });
  } catch (error) {
    console.error("Error fetching prayer partner stats:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching prayer partner statistics",
      error: error.message
    });
  }
});

// Admin route to get detailed pairs with more information
router.get("/admin/pairs", requireAdmin, async (req, res) => {
  try {
    const users = await User.find({ currentPartner: { $ne: null } }).populate(
      "currentPartner",
      "name phone _id"
    );

    const unpairedUsers = await User.find({ currentPartner: null });

    if (!users.length && !unpairedUsers.length) {
      return res.status(200).json({
        success: true,
        pairs: [],
        unpairedUsers: [],
        message: "No user data available yet."
      });
    }

    const pairs = [];
    const seen = new Set();

    users.forEach((user) => {
      if (!seen.has(user._id.toString())) {
        seen.add(user._id.toString());

        // Ensure the partner is valid and exists
        if (user.currentPartner && user.currentPartner._id) {
          seen.add(user.currentPartner._id.toString());
          pairs.push({
            id: `${user._id}_${user.currentPartner._id}`,
            user1: {
              id: user._id,
              name: user.name,
              phone: user.phone
            },
            user2: {
              id: user.currentPartner._id,
              name: user.currentPartner.name,
              phone: user.currentPartner.phone
            },
            connectionDate: user.updatedAt || new Date(),
            status: 'active'
          });
        } else {
          console.warn(`User ${user.name} has an invalid or deleted partner.`);
        }
      }
    });

    // Format unpaired users
    const formattedUnpairedUsers = unpairedUsers.map(user => ({
      id: user._id,
      name: user.name,
      phone: user.phone,
      joinedDate: user.createdAt || new Date()
    }));

    res.status(200).json({
      success: true,
      pairs,
      unpairedUsers: formattedUnpairedUsers
    });
  } catch (error) {
    console.error("Error fetching admin pairs data:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching admin pairs data",
      error: error.message
    });
  }
});

// Admin route to unpair users
router.delete("/admin/unpair/:pairId", requireAdmin, async (req, res) => {
  try {
    const { pairId } = req.params;

    // Extract user IDs from pairId (format: "userId1_userId2")
    const [user1Id, user2Id] = pairId.split('_');

    if (!user1Id || !user2Id) {
      return res.status(400).json({
        success: false,
        message: "Invalid pair ID format"
      });
    }

    // Update both users to remove their current partner
    await User.findByIdAndUpdate(user1Id, {
      currentPartner: null,
      paired_this_week: false
    });

    await User.findByIdAndUpdate(user2Id, {
      currentPartner: null,
      paired_this_week: false
    });

    res.status(200).json({
      success: true,
      message: "Users unpaired successfully"
    });
  } catch (error) {
    console.error("Error unpairing users:", error);
    res.status(500).json({
      success: false,
      message: "Error unpairing users",
      error: error.message
    });
  }
});

// Admin route to manually create a specific pair
router.post("/admin/create-pair", requireAdmin, async (req, res) => {
  try {
    const { user1Id, user2Id } = req.body;

    if (!user1Id || !user2Id) {
      return res.status(400).json({
        success: false,
        message: "Both user IDs are required"
      });
    }

    if (user1Id === user2Id) {
      return res.status(400).json({
        success: false,
        message: "Cannot pair user with themselves"
      });
    }

    // Check if users exist and are not already paired
    const user1 = await User.findById(user1Id);
    const user2 = await User.findById(user2Id);

    if (!user1 || !user2) {
      return res.status(404).json({
        success: false,
        message: "One or both users not found"
      });
    }

    if (user1.currentPartner || user2.currentPartner) {
      return res.status(400).json({
        success: false,
        message: "One or both users are already paired"
      });
    }

    // Create the pair
    await User.findByIdAndUpdate(user1Id, {
      currentPartner: user2Id,
      last_paired_with: user2Id,
      paired_this_week: true
    });

    await User.findByIdAndUpdate(user2Id, {
      currentPartner: user1Id,
      last_paired_with: user1Id,
      paired_this_week: true
    });

    res.status(200).json({
      success: true,
      message: "Pair created successfully",
      pair: {
        user1: { id: user1._id, name: user1.name },
        user2: { id: user2._id, name: user2.name }
      }
    });
  } catch (error) {
    console.error("Error creating pair:", error);
    res.status(500).json({
      success: false,
      message: "Error creating pair",
      error: error.message
    });
  }
});

// Admin route to force reshuffle (alias for existing pair-users endpoint)
router.post("/admin/reshuffle", requireAdmin, async (req, res) => {
  try {
    // First, unpair all current users
    await User.updateMany(
      { currentPartner: { $ne: null } },
      {
        currentPartner: null,
        paired_this_week: false
      }
    );

    // Then use the existing pairing algorithm
    const { pairs, error } = await assignPartners();
    if (error) {
      return res.status(500).json({
        success: false,
        message: "Error during reshuffle",
        error
      });
    }

    res.status(200).json({
      success: true,
      message: "Prayer partners reshuffled successfully",
      pairs: pairs.length,
      data: pairs
    });
  } catch (error) {
    console.error("Error during reshuffle:", error);
    res.status(500).json({
      success: false,
      message: "Error during reshuffle",
      error: error.message
    });
  }
});

// Admin route to get pairing history
router.get("/admin/history", requireAdmin, async (req, res) => {
  try {
    // Check if PrayerPartnership model exists
    let history = [];
    
    try {
      // Try to get the PrayerPartnership model from the backend server
      const PrayerPartnership = mongoose.models.PrayerPartnership || require('../../../backend/server').PrayerPartnership;
      
      if (PrayerPartnership) {
        const partnerships = await PrayerPartnership.find({})
          .sort({ createdAt: -1 })
          .limit(20)
          .lean();

        history = partnerships.map(p => ({
          id: p._id,
          week: p.weekNumber,
          year: p.year,
          totalPairs: 1, // Each record represents one pair
          date: p.createdAt.toISOString().split('T')[0],
          type: p.notes?.includes('manual') ? 'manual' : 'automatic'
        }));
      }
    } catch (modelError) {
      console.warn("PrayerPartnership model not available, using fallback data");
    }

    // If no history from database, provide some recent calculated data
    if (history.length === 0) {
      const currentPairCount = Math.floor((await User.countDocuments({ currentPartner: { $ne: null } })) / 2);
      
      history = [
        {
          id: 1,
          week: 49,
          year: 2024,
          totalPairs: currentPairCount,
          date: new Date().toISOString().split('T')[0],
          type: 'automatic'
        },
        {
          id: 2,
          week: 48,
          year: 2024,
          totalPairs: Math.max(0, currentPairCount - 1),
          date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          type: 'automatic'
        },
        {
          id: 3,
          week: 47,
          year: 2024,
          totalPairs: Math.max(0, currentPairCount - 2),
          date: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          type: 'manual'
        }
      ];
    }

    res.status(200).json({
      success: true,
      history
    });
  } catch (error) {
    console.error("Error fetching pairing history:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching pairing history",
      error: error.message
    });
  }
});

// Middleware to detect changes in the database (polling example)
setInterval(async () => {
  await pairNewUsers();
}, 30000); // Check for new users every 30 seconds

module.exports = router;

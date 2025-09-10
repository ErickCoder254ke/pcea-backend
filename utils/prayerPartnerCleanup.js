const User = require('../server/models/User');

/**
 * Utility functions for handling prayer partner cleanup when users are deleted or deactivated
 */

/**
 * Clean up prayer partner relationships for a single user
 * @param {string} userId - The ID of the user being deleted
 * @param {string} adminId - The ID of the admin performing the action (optional)
 * @returns {Promise<Object>} Cleanup results
 */
async function cleanupSingleUserPrayerPartners(userId, adminId = null) {
  try {
    const cleanupResults = {
      partnersUnpaired: 0,
      requestsExpired: 0,
      success: true,
      errors: []
    };

    // Get the user being deleted
    const user = await User.findById(userId);
    if (!user) {
      return { success: false, error: 'User not found' };
    }

    // Handle prayer partner cleanup if user has a current partner
    if (user.currentPartner) {
      console.log(`🔗 User ${userId} has prayer partner ${user.currentPartner}, unpairing...`);

      try {
        // Remove partner relationship for the current partner
        await User.findByIdAndUpdate(user.currentPartner, {
          currentPartner: null,
          paired_this_week: false
        });

        cleanupResults.partnersUnpaired++;
        console.log(`✅ Successfully unpaired partner ${user.currentPartner} from user ${userId}`);
      } catch (error) {
        cleanupResults.errors.push(`Failed to unpair partner ${user.currentPartner}: ${error.message}`);
      }
    }

    // Also check if this user is someone else's partner and clean up
    try {
      const partnerOfThisUser = await User.findOne({ currentPartner: userId });
      if (partnerOfThisUser) {
        console.log(`🔗 Found user ${partnerOfThisUser._id} who has ${userId} as partner, unpairing...`);

        await User.findByIdAndUpdate(partnerOfThisUser._id, {
          currentPartner: null,
          paired_this_week: false
        });

        cleanupResults.partnersUnpaired++;
        console.log(`✅ Successfully unpaired user ${partnerOfThisUser._id} from user ${userId}`);
      }
    } catch (error) {
      cleanupResults.errors.push(`Failed to find/unpair reverse partner: ${error.message}`);
    }

    // Clean up prayer partner requests
    try {
      const PrayerPartnerRequest = require('../server/models/PrayerPartnerRequest');
      
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
          adminNotes: adminId ? `Auto-expired due to user deletion by admin ${adminId}` : 'Auto-expired due to user deletion'
        }
      );

      cleanupResults.requestsExpired = requestCleanupResult.modifiedCount;
      
      if (requestCleanupResult.modifiedCount > 0) {
        console.log(`🧹 Expired ${requestCleanupResult.modifiedCount} prayer partner requests for user ${userId}`);
      }
    } catch (error) {
      // Prayer partner requests model might not exist in all deployments
      console.log('⚠️ Prayer partner requests cleanup not available:', error.message);
      cleanupResults.errors.push(`Prayer partner requests cleanup failed: ${error.message}`);
    }

    return cleanupResults;
  } catch (error) {
    console.error('❌ Error in prayer partner cleanup:', error);
    return {
      success: false,
      error: error.message,
      partnersUnpaired: 0,
      requestsExpired: 0
    };
  }
}

/**
 * Clean up prayer partner relationships for multiple users (bulk delete)
 * @param {string[]} userIds - Array of user IDs being deleted
 * @param {string} adminId - The ID of the admin performing the action (optional)
 * @returns {Promise<Object>} Cleanup results
 */
async function cleanupBulkUserPrayerPartners(userIds, adminId = null) {
  try {
    const cleanupResults = {
      partnersUnpaired: 0,
      requestsExpired: 0,
      success: true,
      errors: []
    };

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
      try {
        await User.updateMany(
          { _id: { $in: allAffectedPartnerIds } },
          {
            currentPartner: null,
            paired_this_week: false
          }
        );

        cleanupResults.partnersUnpaired = allAffectedPartnerIds.length;
        console.log(`✅ Unpaired ${allAffectedPartnerIds.length} users from prayer partnerships`);
      } catch (error) {
        cleanupResults.errors.push(`Failed to unpair users: ${error.message}`);
      }
    }

    // Clean up prayer partner requests
    try {
      const PrayerPartnerRequest = require('../server/models/PrayerPartnerRequest');
      
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
          adminNotes: adminId ? `Auto-expired due to bulk user deletion by admin ${adminId}` : 'Auto-expired due to bulk user deletion'
        }
      );

      cleanupResults.requestsExpired = requestCleanupResult.modifiedCount;
      
      if (requestCleanupResult.modifiedCount > 0) {
        console.log(`🧹 Expired ${requestCleanupResult.modifiedCount} prayer partner requests for bulk deleted users`);
      }
    } catch (error) {
      console.log('⚠️ Prayer partner requests cleanup not available:', error.message);
      cleanupResults.errors.push(`Prayer partner requests cleanup failed: ${error.message}`);
    }

    return cleanupResults;
  } catch (error) {
    console.error('❌ Error in bulk prayer partner cleanup:', error);
    return {
      success: false,
      error: error.message,
      partnersUnpaired: 0,
      requestsExpired: 0
    };
  }
}

/**
 * Verify prayer partner data integrity
 * @returns {Promise<Object>} Integrity check results
 */
async function verifyPrayerPartnerIntegrity() {
  try {
    const results = {
      orphanedPartners: [],
      inconsistentPairs: [],
      totalChecked: 0,
      issuesFound: 0
    };

    // Find all users with current partners
    const usersWithPartners = await User.find({ 
      currentPartner: { $ne: null } 
    }).select('_id name currentPartner');

    results.totalChecked = usersWithPartners.length;

    for (const user of usersWithPartners) {
      // Check if the partner exists
      const partner = await User.findById(user.currentPartner);
      
      if (!partner) {
        // Orphaned partner reference
        results.orphanedPartners.push({
          userId: user._id,
          userName: user.name,
          orphanedPartnerId: user.currentPartner
        });
        results.issuesFound++;
      } else if (partner.currentPartner?.toString() !== user._id.toString()) {
        // Inconsistent pairing
        results.inconsistentPairs.push({
          user1: { id: user._id, name: user.name, partner: user.currentPartner },
          user2: { id: partner._id, name: partner.name, partner: partner.currentPartner }
        });
        results.issuesFound++;
      }
    }

    return results;
  } catch (error) {
    console.error('❌ Error verifying prayer partner integrity:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Fix prayer partner data integrity issues
 * @param {Object} integrityResults - Results from verifyPrayerPartnerIntegrity
 * @returns {Promise<Object>} Fix results
 */
async function fixPrayerPartnerIntegrity(integrityResults) {
  try {
    const fixResults = {
      orphansFixed: 0,
      inconsistenciesFixed: 0,
      errors: []
    };

    // Fix orphaned partners
    if (integrityResults.orphanedPartners?.length > 0) {
      for (const orphan of integrityResults.orphanedPartners) {
        try {
          await User.findByIdAndUpdate(orphan.userId, {
            currentPartner: null,
            paired_this_week: false
          });
          fixResults.orphansFixed++;
          console.log(`🔧 Fixed orphaned partner reference for user ${orphan.userId}`);
        } catch (error) {
          fixResults.errors.push(`Failed to fix orphan ${orphan.userId}: ${error.message}`);
        }
      }
    }

    // Fix inconsistent pairs (clear both sides)
    if (integrityResults.inconsistentPairs?.length > 0) {
      for (const pair of integrityResults.inconsistentPairs) {
        try {
          await User.updateMany(
            { _id: { $in: [pair.user1.id, pair.user2.id] } },
            {
              currentPartner: null,
              paired_this_week: false
            }
          );
          fixResults.inconsistenciesFixed++;
          console.log(`🔧 Fixed inconsistent pair: ${pair.user1.name} & ${pair.user2.name}`);
        } catch (error) {
          fixResults.errors.push(`Failed to fix inconsistent pair: ${error.message}`);
        }
      }
    }

    return fixResults;
  } catch (error) {
    console.error('❌ Error fixing prayer partner integrity:', error);
    return {
      success: false,
      error: error.message,
      orphansFixed: 0,
      inconsistenciesFixed: 0
    };
  }
}

module.exports = {
  cleanupSingleUserPrayerPartners,
  cleanupBulkUserPrayerPartners,
  verifyPrayerPartnerIntegrity,
  fixPrayerPartnerIntegrity
};

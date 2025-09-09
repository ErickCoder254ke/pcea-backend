const express = require('express');
const router = express.Router();
const PrayerPartnerRequest = require('../models/PrayerPartnerRequest');
const User = require('../models/User');
const { verifyToken, requireAdmin } = require('../../middlewares/auth');
const { requireAdminAccess } = require('../../middlewares/flexible-auth');

// Send a partnership request
router.post('/send', verifyToken, async (req, res) => {
  try {
    const { recipientId, message } = req.body;
    const requesterId = req.user.id;

    if (!recipientId) {
      return res.status(400).json({
        success: false,
        message: 'Recipient ID is required'
      });
    }

    if (requesterId === recipientId) {
      return res.status(400).json({
        success: false,
        message: 'Cannot send prayer partner request to yourself'
      });
    }

    // Check if users exist
    const [requester, recipient] = await Promise.all([
      User.findById(requesterId).select('name fellowshipZone'),
      User.findById(recipientId).select('name fellowshipZone')
    ]);

    if (!requester || !recipient) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if there's already a pending or accepted request between these users
    const existingRequest = await PrayerPartnerRequest.findOne({
      $or: [
        { requester: requesterId, recipient: recipientId, status: { $in: ['pending', 'accepted'] } },
        { requester: recipientId, recipient: requesterId, status: { $in: ['pending', 'accepted'] } }
      ]
    });

    if (existingRequest) {
      return res.status(400).json({
        success: false,
        message: 'A prayer partner request already exists between you and this user'
      });
    }

    // Check if users are already paired
    if (requester.currentPartner && requester.currentPartner.toString() === recipientId) {
      return res.status(400).json({
        success: false,
        message: 'You are already prayer partners with this user'
      });
    }

    const partnershipRequest = new PrayerPartnerRequest({
      requester: requesterId,
      recipient: recipientId,
      requesterName: requester.name,
      recipientName: recipient.name,
      message: message || '',
      requesterProfile: {
        fellowshipZone: requester.fellowshipZone
      },
      recipientProfile: {
        fellowshipZone: recipient.fellowshipZone
      }
    });

    await partnershipRequest.save();

    console.log(`🤝 Partnership request sent from ${requester.name} to ${recipient.name}`);

    res.status(201).json({
      success: true,
      message: 'Partnership request sent successfully',
      data: {
        id: partnershipRequest._id,
        recipientName: recipient.name,
        status: partnershipRequest.status,
        createdAt: partnershipRequest.createdAt
      }
    });
  } catch (error) {
    console.error('❌ Error sending partnership request:', error);
    
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'A prayer partner request already exists between you and this user'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to send partnership request',
      error: error.message
    });
  }
});

// Get pending requests for the authenticated user
router.get('/pending', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const pendingRequests = await PrayerPartnerRequest.find({
      recipient: userId,
      status: 'pending'
    })
    .populate('requester', 'name phone fellowshipZone')
    .sort({ createdAt: -1 })
    .lean();

    res.json({
      success: true,
      data: pendingRequests.map(request => ({
        _id: request._id,
        requester: {
          id: request.requester._id,
          name: request.requester.name,
          phone: request.requester.phone,
          fellowshipZone: request.requester.fellowshipZone
        },
        message: request.message,
        createdAt: request.createdAt,
        expiresAt: request.expiresAt,
        ageInHours: Math.floor((new Date() - request.createdAt) / (1000 * 60 * 60))
      }))
    });
  } catch (error) {
    console.error('❌ Error fetching pending partnership requests:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch pending requests',
      error: error.message
    });
  }
});

// Get sent requests for the authenticated user
router.get('/sent', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const sentRequests = await PrayerPartnerRequest.find({
      requester: userId
    })
    .populate('recipient', 'name phone fellowshipZone')
    .sort({ createdAt: -1 })
    .lean();

    res.json({
      success: true,
      data: sentRequests.map(request => ({
        _id: request._id,
        recipient: {
          id: request.recipient._id,
          name: request.recipient.name,
          phone: request.recipient.phone,
          fellowshipZone: request.recipient.fellowshipZone
        },
        message: request.message,
        status: request.status,
        createdAt: request.createdAt,
        respondedAt: request.respondedAt,
        expiresAt: request.expiresAt
      }))
    });
  } catch (error) {
    console.error('❌ Error fetching sent partnership requests:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch sent requests',
      error: error.message
    });
  }
});

// Accept a partnership request
router.post('/:id/accept', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const partnershipRequest = await PrayerPartnerRequest.findById(id)
      .populate('requester recipient', 'name currentPartner');

    if (!partnershipRequest) {
      return res.status(404).json({
        success: false,
        message: 'Partnership request not found'
      });
    }

    if (!partnershipRequest.canUserRespond(userId)) {
      return res.status(403).json({
        success: false,
        message: 'You cannot respond to this request'
      });
    }

    // Check if either user is already paired
    if (partnershipRequest.requester.currentPartner || partnershipRequest.recipient.currentPartner) {
      return res.status(400).json({
        success: false,
        message: 'One or both users are already paired with someone else'
      });
    }

    // Accept the request
    partnershipRequest.accept(userId);
    await partnershipRequest.save();

    // Update both users to set them as prayer partners
    await Promise.all([
      User.findByIdAndUpdate(partnershipRequest.requester._id, {
        currentPartner: partnershipRequest.recipient._id,
        paired_this_week: true
      }),
      User.findByIdAndUpdate(partnershipRequest.recipient._id, {
        currentPartner: partnershipRequest.requester._id,
        paired_this_week: true
      })
    ]);

    console.log(`✅ Partnership request accepted: ${partnershipRequest.requesterName} & ${partnershipRequest.recipientName} are now prayer partners`);

    res.json({
      success: true,
      message: 'Partnership request accepted successfully',
      data: {
        partnerName: partnershipRequest.requesterName,
        status: partnershipRequest.status,
        acceptedAt: partnershipRequest.respondedAt
      }
    });
  } catch (error) {
    console.error('❌ Error accepting partnership request:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to accept partnership request',
      error: error.message
    });
  }
});

// Decline a partnership request
router.post('/:id/decline', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const partnershipRequest = await PrayerPartnerRequest.findById(id);

    if (!partnershipRequest) {
      return res.status(404).json({
        success: false,
        message: 'Partnership request not found'
      });
    }

    if (!partnershipRequest.canUserRespond(userId)) {
      return res.status(403).json({
        success: false,
        message: 'You cannot respond to this request'
      });
    }

    partnershipRequest.decline(userId);
    await partnershipRequest.save();

    console.log(`❌ Partnership request declined: ${partnershipRequest.requesterName} → ${partnershipRequest.recipientName}`);

    res.json({
      success: true,
      message: 'Partnership request declined',
      data: {
        status: partnershipRequest.status,
        declinedAt: partnershipRequest.respondedAt
      }
    });
  } catch (error) {
    console.error('❌ Error declining partnership request:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to decline partnership request',
      error: error.message
    });
  }
});

// Admin: Get all partnership requests
router.get('/admin/all', verifyToken, requireAdminAccess, async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;

    const filter = {};
    if (status && status !== 'all') {
      filter.status = status;
    }

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    const [requests, totalCount] = await Promise.all([
      PrayerPartnerRequest.find(filter)
        .populate('requester recipient', 'name phone fellowshipZone')
        .populate('respondedBy', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      PrayerPartnerRequest.countDocuments(filter)
    ]);

    res.json({
      success: true,
      data: requests.map(request => ({
        _id: request._id,
        requesterName: request.requesterName,
        recipientName: request.recipientName,
        requester: request.requester,
        recipient: request.recipient,
        message: request.message,
        status: request.status,
        requesterProfile: request.requesterProfile,
        createdAt: request.createdAt,
        respondedAt: request.respondedAt,
        respondedBy: request.respondedBy,
        expiresAt: request.expiresAt,
        adminNotes: request.adminNotes
      })),
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(totalCount / limitNum),
        totalCount,
        hasNextPage: pageNum < Math.ceil(totalCount / limitNum),
        hasPrevPage: pageNum > 1
      }
    });
  } catch (error) {
    console.error('❌ Error fetching partnership requests for admin:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch partnership requests',
      error: error.message
    });
  }
});

// Admin: Get partnership request statistics
router.get('/admin/stats', verifyToken, requireAdminAccess, async (req, res) => {
  try {
    const stats = await PrayerPartnerRequest.getStatistics();
    
    res.json({
      success: true,
      stats: stats[0] || {
        total: 0,
        pending: 0,
        accepted: 0,
        declined: 0,
        expired: 0
      }
    });
  } catch (error) {
    console.error('❌ Error fetching partnership request statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch statistics',
      error: error.message
    });
  }
});

// Admin: Update partnership request (add notes, change status)
router.patch('/admin/:id', verifyToken, requireAdminAccess, async (req, res) => {
  try {
    const { id } = req.params;
    const { adminNotes, status } = req.body;

    const partnershipRequest = await PrayerPartnerRequest.findById(id);
    if (!partnershipRequest) {
      return res.status(404).json({
        success: false,
        message: 'Partnership request not found'
      });
    }

    if (adminNotes !== undefined) {
      partnershipRequest.adminNotes = adminNotes;
    }

    if (status && ['pending', 'accepted', 'declined', 'expired'].includes(status)) {
      partnershipRequest.status = status;
      if (!partnershipRequest.respondedAt) {
        partnershipRequest.respondedAt = new Date();
        partnershipRequest.respondedBy = req.user.id;
      }
    }

    await partnershipRequest.save();

    res.json({
      success: true,
      message: 'Partnership request updated successfully',
      data: {
        id: partnershipRequest._id,
        status: partnershipRequest.status,
        adminNotes: partnershipRequest.adminNotes
      }
    });
  } catch (error) {
    console.error('❌ Error updating partnership request:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update partnership request',
      error: error.message
    });
  }
});

// Cleanup expired requests (this could be called by a cron job)
router.post('/admin/cleanup-expired', verifyToken, requireAdminAccess, async (req, res) => {
  try {
    const result = await PrayerPartnerRequest.cleanupExpiredRequests();

    res.json({
      success: true,
      message: `Cleaned up ${result.modifiedCount} expired requests`,
      data: {
        expiredCount: result.modifiedCount
      }
    });
  } catch (error) {
    console.error('❌ Error cleaning up expired partnership requests:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cleanup expired requests',
      error: error.message
    });
  }
});

module.exports = router;

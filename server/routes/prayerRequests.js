const express = require('express');
const router = express.Router();
const PrayerRequest = require('../models/PrayerRequest');
const User = require('../models/User');
const { verifyToken, requireAdmin } = require('../../middlewares/auth');

// Create a new prayer request
router.post('/', verifyToken, async (req, res) => {
  try {
    const { title, description, category, urgency, anonymous, message } = req.body;
    const userId = req.user.id;

    // Get user info if not anonymous
    let requesterName = null;
    if (!anonymous) {
      const user = await User.findById(userId).select('name');
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }
      requesterName = user.name;
    }

    const prayerRequest = new PrayerRequest({
      title: title || 'Prayer Request',
      description: message || description,
      requesterName,
      requesterId: userId,
      category: category || 'other',
      urgency: urgency || 'Normal',
      anonymous: anonymous || false
    });

    await prayerRequest.save();

    console.log(`📝 New prayer request created: ${prayerRequest.title} by ${anonymous ? 'Anonymous' : requesterName}`);

    res.status(201).json({
      success: true,
      message: 'Prayer request submitted successfully',
      data: {
        id: prayerRequest._id,
        title: prayerRequest.title,
        status: prayerRequest.status,
        category: prayerRequest.category,
        urgency: prayerRequest.urgency,
        anonymous: prayerRequest.anonymous
      }
    });
  } catch (error) {
    console.error('❌ Error creating prayer request:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create prayer request',
      error: error.message
    });
  }
});

// Get public prayer requests (approved ones)
router.get('/public', async (req, res) => {
  try {
    const { category, urgency, page = 1, limit = 10 } = req.query;
    
    const filter = {
      status: 'approved',
      isPublic: true,
      expiresAt: { $gt: new Date() }
    };

    if (category && category !== 'all') {
      filter.category = category;
    }

    if (urgency && urgency !== 'all') {
      filter.urgency = urgency;
    }

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    const [prayerRequests, totalCount] = await Promise.all([
      PrayerRequest.find(filter)
        .select('title description category urgency prayerCount createdAt requesterName anonymous')
        .sort({ urgency: -1, createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      PrayerRequest.countDocuments(filter)
    ]);

    // Format the results to protect sensitive information
    const formattedRequests = prayerRequests.map(request => ({
      id: request._id,
      title: request.title,
      description: request.description,
      category: request.category,
      urgency: request.urgency,
      prayerCount: request.prayerCount,
      submittedAt: request.createdAt,
      requester: request.anonymous ? 'Anonymous' : (request.requesterName || 'Community Member'),
      daysSinceCreated: Math.floor((new Date() - request.createdAt) / (1000 * 60 * 60 * 24))
    }));

    res.json({
      success: true,
      data: formattedRequests,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(totalCount / limitNum),
        totalCount,
        hasNextPage: pageNum < Math.ceil(totalCount / limitNum),
        hasPrevPage: pageNum > 1
      }
    });
  } catch (error) {
    console.error('❌ Error fetching public prayer requests:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch prayer requests',
      error: error.message
    });
  }
});

// Get user's own prayer requests
router.get('/my-requests', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { status, page = 1, limit = 10 } = req.query;

    const filter = { requesterId: userId };
    if (status && status !== 'all') {
      filter.status = status;
    }

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    const [prayerRequests, totalCount] = await Promise.all([
      PrayerRequest.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      PrayerRequest.countDocuments(filter)
    ]);

    res.json({
      success: true,
      data: prayerRequests.map(request => ({
        id: request._id,
        title: request.title,
        description: request.description,
        category: request.category,
        urgency: request.urgency,
        status: request.status,
        prayerCount: request.prayerCount,
        anonymous: request.anonymous,
        submittedAt: request.createdAt,
        moderatorNotes: request.moderatorNotes,
        rejectionReason: request.rejectionReason
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
    console.error('❌ Error fetching user prayer requests:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch your prayer requests',
      error: error.message
    });
  }
});

// Admin: Get all prayer requests for moderation
router.get('/admin', requireAdmin, async (req, res) => {
  try {
    const { status, category, urgency, page = 1, limit = 20 } = req.query;

    const filter = {};
    if (status && status !== 'all') {
      filter.status = status;
    }
    if (category && category !== 'all') {
      filter.category = category;
    }
    if (urgency && urgency !== 'all') {
      filter.urgency = urgency;
    }

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    const [prayerRequests, totalCount] = await Promise.all([
      PrayerRequest.find(filter)
        .populate('requesterId', 'name phone fellowshipZone')
        .populate('approvedBy', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      PrayerRequest.countDocuments(filter)
    ]);

    res.json({
      success: true,
      data: prayerRequests.map(request => ({
        _id: request._id,
        title: request.title,
        description: request.description,
        category: request.category,
        urgency: request.urgency,
        status: request.status,
        anonymous: request.anonymous,
        requesterName: request.anonymous ? 'Anonymous' : (request.requesterName || request.requesterId?.name || 'Unknown'),
        requester: request.requesterId || null,
        prayerCount: request.prayerCount,
        moderatorNotes: request.moderatorNotes,
        rejectionReason: request.rejectionReason,
        approvedBy: request.approvedBy,
        approvedAt: request.approvedAt,
        createdAt: request.createdAt,
        expiresAt: request.expiresAt
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
    console.error('❌ Error fetching prayer requests for admin:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch prayer requests',
      error: error.message
    });
  }
});

// Admin: Get pending prayer requests
router.get('/admin/pending', requireAdmin, async (req, res) => {
  try {
    const pendingRequests = await PrayerRequest.find({ status: 'pending' })
      .populate('requesterId', 'name phone fellowshipZone')
      .sort({ urgency: -1, createdAt: -1 })
      .lean();

    res.json({
      success: true,
      data: pendingRequests.map(request => ({
        _id: request._id,
        title: request.title,
        description: request.description,
        category: request.category,
        urgency: request.urgency,
        anonymous: request.anonymous,
        requesterName: request.anonymous ? 'Anonymous' : (request.requesterName || request.requesterId?.name || 'Unknown'),
        requester: request.requesterId || null,
        createdAt: request.createdAt,
        daysSinceCreated: Math.floor((new Date() - request.createdAt) / (1000 * 60 * 60 * 24))
      })),
      count: pendingRequests.length
    });
  } catch (error) {
    console.error('❌ Error fetching pending prayer requests:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch pending prayer requests',
      error: error.message
    });
  }
});

// Admin: Approve a prayer request
router.post('/:id/approve', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const moderatorId = req.user.id;
    const { notes } = req.body;

    const prayerRequest = await PrayerRequest.findById(id);
    if (!prayerRequest) {
      return res.status(404).json({
        success: false,
        message: 'Prayer request not found'
      });
    }

    if (prayerRequest.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Prayer request has already been processed'
      });
    }

    prayerRequest.approve(moderatorId);
    if (notes) {
      prayerRequest.moderatorNotes = notes;
    }
    
    await prayerRequest.save();

    console.log(`✅ Prayer request approved: ${prayerRequest.title} by moderator ${moderatorId}`);

    res.json({
      success: true,
      message: 'Prayer request approved successfully',
      data: {
        id: prayerRequest._id,
        status: prayerRequest.status,
        approvedAt: prayerRequest.approvedAt
      }
    });
  } catch (error) {
    console.error('❌ Error approving prayer request:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to approve prayer request',
      error: error.message
    });
  }
});

// Admin: Reject a prayer request
router.post('/:id/reject', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason || reason.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Rejection reason is required'
      });
    }

    const prayerRequest = await PrayerRequest.findById(id);
    if (!prayerRequest) {
      return res.status(404).json({
        success: false,
        message: 'Prayer request not found'
      });
    }

    if (prayerRequest.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Prayer request has already been processed'
      });
    }

    prayerRequest.reject(reason.trim());
    await prayerRequest.save();

    console.log(`❌ Prayer request rejected: ${prayerRequest.title} - Reason: ${reason}`);

    res.json({
      success: true,
      message: 'Prayer request rejected',
      data: {
        id: prayerRequest._id,
        status: prayerRequest.status,
        rejectionReason: prayerRequest.rejectionReason
      }
    });
  } catch (error) {
    console.error('❌ Error rejecting prayer request:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reject prayer request',
      error: error.message
    });
  }
});

// Add prayer for a request (user interaction)
router.post('/:id/pray', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const prayerRequest = await PrayerRequest.findById(id);
    if (!prayerRequest) {
      return res.status(404).json({
        success: false,
        message: 'Prayer request not found'
      });
    }

    if (prayerRequest.status !== 'approved') {
      return res.status(400).json({
        success: false,
        message: 'Can only pray for approved requests'
      });
    }

    if (prayerRequest.hasUserPrayed(userId)) {
      return res.status(400).json({
        success: false,
        message: 'You have already prayed for this request'
      });
    }

    prayerRequest.addPrayer(userId);
    await prayerRequest.save();

    res.json({
      success: true,
      message: 'Prayer added successfully',
      data: {
        prayerCount: prayerRequest.prayerCount
      }
    });
  } catch (error) {
    console.error('❌ Error adding prayer:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add prayer',
      error: error.message
    });
  }
});

module.exports = router;

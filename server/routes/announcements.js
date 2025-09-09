const express = require('express');
const router = express.Router();
const Announcement = require('../models/Announcement');
const { verifyToken, requireAdmin } = require('../../middlewares/auth');
const { requireAdminAccess } = require('../../middlewares/flexible-auth');

// GET /announcements - Get all announcements
router.get('/', async (req, res) => {
  try {
    const { status, category, priority, limit, search, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
    
    // Build query
    let query = {};
    
    // Filter by status
    if (status) {
      if (status === 'all') {
        // Don't filter by status
      } else {
        query.status = status;
      }
    } else {
      // Default to published announcements for public access
      query.status = 'published';
    }

    // Filter by category
    if (category && category !== 'all') {
      query.category = category;
    }

    // Filter by priority
    if (priority && priority !== 'all') {
      query.priority = priority;
    }

    // Handle search
    let announcements;
    if (search) {
      announcements = await Announcement.search(search, { 
        status: query.status, 
        limit: parseInt(limit) || 50 
      });
    } else {
      // Build sort object
      const sortObj = {};
      sortObj[sortBy] = sortOrder === 'desc' ? -1 : 1;
      
      // If sorting by priority, add secondary sort by date
      if (sortBy === 'priority') {
        sortObj.createdAt = -1;
      }
      
      announcements = await Announcement.find(query)
        .sort(sortObj)
        .limit(parseInt(limit) || 50)
        .lean();
    }

    console.log(`✅ Retrieved ${announcements.length} announcements with filters:`, {
      status: query.status || 'published',
      category: query.category || 'all',
      priority: query.priority || 'all',
      search: search || 'none',
      total: announcements.length
    });

    res.json({
      success: true,
      message: 'Announcements retrieved successfully',
      data: announcements,
      total: announcements.length
    });
  } catch (error) {
    console.error('❌ Error fetching announcements:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve announcements',
      error: error.message
    });
  }
});

// GET /announcements/admin/stats - Get announcement statistics for admin
router.get('/admin/stats', verifyToken, requireAdminAccess, async (req, res) => {
  try {
    const total = await Announcement.countDocuments();
    const published = await Announcement.countDocuments({ status: 'published' });
    const draft = await Announcement.countDocuments({ status: 'draft' });
    const scheduled = await Announcement.countDocuments({ status: 'scheduled' });
    const archived = await Announcement.countDocuments({ status: 'archived' });
    const urgent = await Announcement.countDocuments({ priority: 'urgent' });
    const high = await Announcement.countDocuments({ priority: 'high' });

    // Category breakdown
    const categoryBreakdown = await Announcement.aggregate([
      { $group: { _id: '$category', count: { $sum: 1 } } }
    ]);

    const categories = {};
    categoryBreakdown.forEach(cat => {
      categories[cat._id] = cat.count;
    });

    // Recent activity
    const recentActivity = await Announcement.find()
      .sort({ updatedAt: -1 })
      .limit(5)
      .select('_id title status updatedAt')
      .lean();

    const formattedActivity = recentActivity.map(ann => ({
      id: ann._id,
      title: ann.title,
      status: ann.status,
      updatedAt: ann.updatedAt
    }));

    const stats = {
      overview: {
        total,
        published,
        draft,
        scheduled,
        archived,
        urgent,
        high
      },
      categories,
      recentActivity: formattedActivity
    };

    console.log('📊 Announcement stats retrieved:', stats.overview);

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('❌ Error fetching announcement stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve announcement statistics',
      error: error.message
    });
  }
});

// GET /announcements/:id - Get specific announcement
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const announcement = await Announcement.findById(id).lean();

    if (!announcement) {
      return res.status(404).json({
        success: false,
        message: 'Announcement not found'
      });
    }

    // Increment views for published announcements
    if (announcement.status === 'published') {
      await Announcement.findByIdAndUpdate(id, { $inc: { views: 1 } });
    }

    res.json({
      success: true,
      message: 'Announcement retrieved successfully',
      data: announcement
    });
  } catch (error) {
    console.error('❌ Error fetching announcement:', error);
    
    // Handle invalid ObjectId
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid announcement ID format'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to retrieve announcement',
      error: error.message
    });
  }
});

// POST /announcements - Create new announcement
router.post('/', async (req, res) => {
  try {
    const {
      title,
      description,
      content,
      category = 'Events',
      priority = 'normal',
      author = 'Church Administration',
      location,
      time,
      date,
      tags = [],
      registrationRequired = false,
      contactInfo,
      status = 'draft',
      scheduledDate
    } = req.body;

    // Validation
    if (!title || !description) {
      return res.status(400).json({
        success: false,
        message: 'Title and description are required'
      });
    }

    if (!['low', 'normal', 'high', 'urgent'].includes(priority)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid priority level'
      });
    }

    if (!['Events', 'Fellowship', 'Youth', 'Worship', 'Prayer'].includes(category)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid category'
      });
    }

    if (!['draft', 'published', 'scheduled'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status'
      });
    }

    // Create announcement object
    const announcementData = {
      title: title.trim(),
      description: description.trim(),
      content: content ? content.trim() : description.trim(),
      category,
      priority,
      author: author.trim(),
      location: location ? location.trim() : '',
      time: time || '',
      date: date || '',
      tags: Array.isArray(tags) ? tags.map(tag => tag.trim()).filter(Boolean) : [],
      registrationRequired,
      contactInfo: contactInfo ? contactInfo.trim() : '',
      status,
      scheduledDate: scheduledDate ? new Date(scheduledDate) : null
    };

    const newAnnouncement = new Announcement(announcementData);
    const savedAnnouncement = await newAnnouncement.save();

    console.log(`✅ Announcement created: "${title}" with status: ${status}`);

    // If it's urgent/high priority and published, log for potential notifications
    if ((priority === 'urgent' || priority === 'high') && status === 'published') {
      console.log(`🚨 High priority announcement published: "${title}" - ID: ${savedAnnouncement._id}`);
      // TODO: Trigger push notifications
    }

    res.status(201).json({
      success: true,
      message: 'Announcement created successfully',
      data: savedAnnouncement
    });
  } catch (error) {
    console.error('❌ Error creating announcement:', error);
    
    // Handle validation errors
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: validationErrors
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to create announcement',
      error: error.message
    });
  }
});

// PUT /announcements/:id - Update announcement
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Remove fields that shouldn't be updated directly
    delete updateData._id;
    delete updateData.createdAt;
    delete updateData.views;
    delete updateData.likes;

    // Validation for specific fields if provided
    if (updateData.priority && !['low', 'normal', 'high', 'urgent'].includes(updateData.priority)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid priority level'
      });
    }

    if (updateData.category && !['Events', 'Fellowship', 'Youth', 'Worship', 'Prayer'].includes(updateData.category)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid category'
      });
    }

    if (updateData.status && !['draft', 'published', 'scheduled', 'archived'].includes(updateData.status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status'
      });
    }

    // Handle scheduled date
    if (updateData.scheduledDate) {
      updateData.scheduledDate = new Date(updateData.scheduledDate);
    }

    // Update announcement
    const updatedAnnouncement = await Announcement.findByIdAndUpdate(
      id,
      { ...updateData, updatedAt: new Date() },
      { new: true, runValidators: true }
    );

    if (!updatedAnnouncement) {
      return res.status(404).json({
        success: false,
        message: 'Announcement not found'
      });
    }

    console.log(`✅ Announcement updated: "${updatedAnnouncement.title}" - ID: ${id}`);

    res.json({
      success: true,
      message: 'Announcement updated successfully',
      data: updatedAnnouncement
    });
  } catch (error) {
    console.error('❌ Error updating announcement:', error);
    
    // Handle invalid ObjectId
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid announcement ID format'
      });
    }

    // Handle validation errors
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: validationErrors
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to update announcement',
      error: error.message
    });
  }
});

// DELETE /announcements/:id - Delete announcement
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const deletedAnnouncement = await Announcement.findByIdAndDelete(id);

    if (!deletedAnnouncement) {
      return res.status(404).json({
        success: false,
        message: 'Announcement not found'
      });
    }

    console.log(`🗑️ Announcement deleted: "${deletedAnnouncement.title}" - ID: ${id}`);

    res.json({
      success: true,
      message: 'Announcement deleted successfully',
      data: deletedAnnouncement
    });
  } catch (error) {
    console.error('❌ Error deleting announcement:', error);
    
    // Handle invalid ObjectId
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid announcement ID format'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to delete announcement',
      error: error.message
    });
  }
});

// POST /announcements/:id/publish - Publish/unpublish announcement
router.post('/:id/publish', async (req, res) => {
  try {
    const { id } = req.params;
    const { status = 'published' } = req.body;

    if (!['draft', 'published', 'scheduled', 'archived'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status'
      });
    }

    const updatedAnnouncement = await Announcement.findByIdAndUpdate(
      id,
      { 
        status,
        ...(status === 'published' && { publishedAt: new Date() }),
        ...(status === 'archived' && { archivedAt: new Date() }),
        updatedAt: new Date()
      },
      { new: true }
    );

    if (!updatedAnnouncement) {
      return res.status(404).json({
        success: false,
        message: 'Announcement not found'
      });
    }

    // If publishing a high priority announcement, log for notifications
    if (status === 'published' && (updatedAnnouncement.priority === 'urgent' || updatedAnnouncement.priority === 'high')) {
      console.log(`🚨 High priority announcement published: "${updatedAnnouncement.title}" - ID: ${id}`);
      // TODO: Trigger push notifications
    }

    console.log(`📝 Announcement status changed to "${status}": "${updatedAnnouncement.title}"`);

    res.json({
      success: true,
      message: `Announcement ${status} successfully`,
      data: updatedAnnouncement
    });
  } catch (error) {
    console.error('❌ Error updating announcement status:', error);
    
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid announcement ID format'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to update announcement status',
      error: error.message
    });
  }
});

// POST /announcements/:id/schedule - Schedule announcement
router.post('/:id/schedule', async (req, res) => {
  try {
    const { id } = req.params;
    const { scheduledDate, scheduledTime } = req.body;

    if (!scheduledDate || !scheduledTime) {
      return res.status(400).json({
        success: false,
        message: 'Scheduled date and time are required'
      });
    }

    const scheduledDateTime = new Date(`${scheduledDate}T${scheduledTime}`);
    
    if (scheduledDateTime <= new Date()) {
      return res.status(400).json({
        success: false,
        message: 'Scheduled time must be in the future'
      });
    }

    const updatedAnnouncement = await Announcement.findByIdAndUpdate(
      id,
      { 
        status: 'scheduled',
        scheduledDate: scheduledDateTime,
        updatedAt: new Date()
      },
      { new: true }
    );

    if (!updatedAnnouncement) {
      return res.status(404).json({
        success: false,
        message: 'Announcement not found'
      });
    }

    console.log(`⏰ Announcement scheduled: "${updatedAnnouncement.title}" for ${scheduledDateTime}`);

    res.json({
      success: true,
      message: 'Announcement scheduled successfully',
      data: updatedAnnouncement
    });
  } catch (error) {
    console.error('❌ Error scheduling announcement:', error);
    
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid announcement ID format'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to schedule announcement',
      error: error.message
    });
  }
});

// POST /announcements/bulk-actions - Bulk operations
router.post('/bulk-actions', async (req, res) => {
  try {
    const { action, announcementIds } = req.body;

    if (!action || !Array.isArray(announcementIds) || announcementIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Action and announcement IDs are required'
      });
    }

    const validActions = ['publish', 'unpublish', 'delete', 'archive'];
    if (!validActions.includes(action)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid action'
      });
    }

    let result;
    const timestamp = new Date();

    switch (action) {
      case 'publish':
        result = await Announcement.updateMany(
          { _id: { $in: announcementIds } },
          { 
            status: 'published', 
            publishedAt: timestamp,
            updatedAt: timestamp 
          }
        );
        break;
      case 'unpublish':
        result = await Announcement.updateMany(
          { _id: { $in: announcementIds } },
          { 
            status: 'draft',
            updatedAt: timestamp 
          }
        );
        break;
      case 'archive':
        result = await Announcement.updateMany(
          { _id: { $in: announcementIds } },
          { 
            status: 'archived',
            archivedAt: timestamp,
            updatedAt: timestamp 
          }
        );
        break;
      case 'delete':
        result = await Announcement.deleteMany({ _id: { $in: announcementIds } });
        break;
    }

    console.log(`📋 Bulk ${action} completed: ${result.modifiedCount || result.deletedCount} announcements affected`);

    res.json({
      success: true,
      message: `Bulk ${action} completed successfully`,
      data: {
        requested: announcementIds.length,
        affected: result.modifiedCount || result.deletedCount || 0,
        action
      }
    });
  } catch (error) {
    console.error('❌ Error performing bulk action:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to perform bulk action',
      error: error.message
    });
  }
});

// GET /announcements/search/:term - Search announcements
router.get('/search/:term', async (req, res) => {
  try {
    const { term } = req.params;
    const { status = 'published', limit = 20 } = req.query;

    if (!term || term.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Search term must be at least 2 characters long'
      });
    }

    const announcements = await Announcement.search(term.trim(), {
      status,
      limit: parseInt(limit)
    });

    console.log(`🔍 Search for "${term}" returned ${announcements.length} results`);

    res.json({
      success: true,
      message: 'Search completed successfully',
      data: announcements,
      searchTerm: term,
      total: announcements.length
    });
  } catch (error) {
    console.error('❌ Error searching announcements:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to search announcements',
      error: error.message
    });
  }
});

// GET /announcements/test - Test endpoint to verify functionality
router.get('/test', async (req, res) => {
  try {
    console.log('🧪 Testing announcements functionality...');

    // Test database connection
    const count = await Announcement.countDocuments();
    console.log(`📊 Total announcements in database: ${count}`);

    // Test basic query
    const announcements = await Announcement.find({}).limit(5).lean();
    console.log(`📋 Sample announcements:`, announcements.map(a => ({ id: a._id, title: a.title, status: a.status })));

    res.json({
      success: true,
      message: 'Announcements functionality test completed',
      data: {
        totalCount: count,
        sampleAnnouncements: announcements.length,
        databaseConnected: true,
        modelLoaded: typeof Announcement !== 'undefined'
      }
    });
  } catch (error) {
    console.error('❌ Announcements test failed:', error);
    res.status(500).json({
      success: false,
      message: 'Announcements test failed',
      error: error.message,
      stack: error.stack
    });
  }
});

// POST /announcements/dev/seed - Create seed data for development (only in dev mode)
router.post('/dev/seed', async (req, res) => {
  try {
    // Only allow in development
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({
        success: false,
        message: 'Seed data only available in development'
      });
    }

    console.log('🌱 Creating seed announcements for development...');

    const seedAnnouncements = [
      {
        title: 'Youth Retreat Registration',
        description: 'Join us for an amazing weekend of worship and fellowship. Registration closes this Friday!',
        content: 'We are excited to announce our upcoming youth retreat! This will be a transformative weekend filled with worship, fellowship, and spiritual growth. The retreat will include exciting activities, inspiring messages, and opportunities to connect with fellow youth members.',
        category: 'Youth',
        priority: 'high',
        author: 'Youth Ministry',
        location: 'Camp Galilee',
        time: '6:00 PM',
        date: '2024-12-15',
        tags: ['retreat', 'youth', 'registration'],
        registrationRequired: true,
        contactInfo: 'youth@pceaturichurch.org',
        status: 'published'
      },
      {
        title: 'Fellowship Meeting',
        description: 'Join us for our weekly fellowship dinner and faith sharing time.',
        content: 'Every Wednesday, our church community comes together for a time of fellowship, sharing, and spiritual nourishment. This is a wonderful opportunity to connect with other members, share a meal, and grow in faith together.',
        category: 'Fellowship',
        priority: 'normal',
        author: 'Fellowship Committee',
        location: 'Church Hall',
        time: '6:30 PM',
        date: 'Every Wednesday',
        tags: ['fellowship', 'dinner', 'weekly'],
        contactInfo: 'fellowship@pceaturichurch.org',
        status: 'published'
      },
      {
        title: 'Bible Study: Romans',
        description: 'Deep dive into Paul\'s letter to the Romans with Pastor Johnson.',
        content: 'Join Pastor Johnson for an in-depth study of Paul\'s letter to the Romans. This comprehensive study will explore the theological themes and practical applications of this foundational New Testament book.',
        category: 'Events',
        priority: 'normal',
        author: 'Pastor Johnson',
        location: 'Sanctuary',
        time: '7:00 PM',
        date: 'Every Friday',
        tags: ['bible study', 'teaching', 'romans'],
        contactInfo: 'pastor@pceaturichurch.org',
        status: 'published'
      },
      {
        title: 'Christmas Service Planning',
        description: 'Help us plan the Christmas service and decorations.',
        content: 'We need volunteers to help plan and organize our Christmas service. This includes decorations, music, and special programs.',
        category: 'Events',
        priority: 'normal',
        author: 'Event Committee',
        location: 'Church Office',
        time: '2:00 PM',
        date: '2024-12-20',
        tags: ['christmas', 'planning', 'volunteers'],
        status: 'draft'
      },
      {
        title: 'New Members Welcome',
        description: 'Special welcome service for new members joining our church family.',
        content: 'We are excited to welcome new members to our church family. Please join us for a special service dedicated to introducing and welcoming our newest members.',
        category: 'Fellowship',
        priority: 'high',
        author: 'Pastor Sarah',
        location: 'Main Sanctuary',
        time: '10:00 AM',
        date: '2024-12-22',
        tags: ['welcome', 'new members', 'service'],
        status: 'scheduled',
        scheduledDate: new Date('2024-12-20T08:00:00Z')
      }
    ];

    // Clear existing announcements first (only for dev)
    await Announcement.deleteMany({});
    console.log('🗑️ Cleared existing announcements');

    // Insert seed data
    const createdAnnouncements = await Announcement.insertMany(seedAnnouncements);

    console.log(`✅ Created ${createdAnnouncements.length} seed announcements`);

    res.json({
      success: true,
      message: `Successfully created ${createdAnnouncements.length} seed announcements`,
      data: createdAnnouncements
    });
  } catch (error) {
    console.error('❌ Error creating seed announcements:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create seed announcements',
      error: error.message
    });
  }
});

module.exports = router;

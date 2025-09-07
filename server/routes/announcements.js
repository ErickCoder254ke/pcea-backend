const express = require('express');
const router = express.Router();

// In-memory storage for announcements (in production, this would be a database)
let announcements = [
  {
    id: 'demo-1',
    title: 'Youth Retreat Registration',
    description: 'Join us for an amazing weekend of worship and fellowship. Registration closes this Friday!',
    content: 'We are excited to announce our upcoming youth retreat! This will be a transformative weekend filled with worship, fellowship, and spiritual growth. The retreat will include exciting activities, inspiring messages, and opportunities to connect with fellow youth members. Registration is required and closes this Friday, so don\'t miss out on this incredible opportunity to grow in faith and community.',
    date: '2024-12-15',
    time: '6:00 PM',
    category: 'Youth',
    author: 'Youth Ministry',
    location: 'Camp Galilee',
    priority: 'high',
    registrationRequired: true,
    tags: ['retreat', 'youth', 'registration'],
    contactInfo: 'youth@pceaturichurch.org',
    status: 'published',
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    id: 'demo-2',
    title: 'Fellowship Meeting',
    description: 'Join us for our weekly fellowship dinner and faith sharing time.',
    content: 'Every Wednesday, our church community comes together for a time of fellowship, sharing, and spiritual nourishment. This is a wonderful opportunity to connect with other members, share a meal, and grow in faith together. All are welcome to join us for this weekly gathering.',
    date: 'Every Wednesday',
    time: '6:30 PM',
    category: 'Fellowship',
    author: 'Fellowship Committee',
    location: 'Church Hall',
    priority: 'normal',
    tags: ['fellowship', 'dinner', 'weekly'],
    contactInfo: 'fellowship@pceaturichurch.org',
    status: 'published',
    createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    id: 'demo-3',
    title: 'Bible Study: Romans',
    description: 'Deep dive into Paul\'s letter to the Romans with Pastor Johnson.',
    content: 'Join Pastor Johnson for an in-depth study of Paul\'s letter to the Romans. This comprehensive study will explore the theological themes and practical applications of this foundational New Testament book. Perfect for both new believers and mature Christians looking to deepen their understanding of Scripture.',
    date: 'Every Friday',
    time: '7:00 PM',
    category: 'Events',
    author: 'Pastor Johnson',
    location: 'Sanctuary',
    priority: 'normal',
    tags: ['bible study', 'teaching', 'romans'],
    contactInfo: 'pastor@pceaturichurch.org',
    status: 'published',
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
  }
];

// Helper function to generate unique ID
const generateId = () => {
  return 'ann-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
};

// GET /announcements - Get all announcements
router.get('/', (req, res) => {
  try {
    const { status, category, priority, limit } = req.query;
    
    let filteredAnnouncements = [...announcements];

    // Filter by status
    if (status) {
      filteredAnnouncements = filteredAnnouncements.filter(ann => ann.status === status);
    }

    // Filter by category
    if (category) {
      filteredAnnouncements = filteredAnnouncements.filter(ann => ann.category === category);
    }

    // Filter by priority
    if (priority) {
      filteredAnnouncements = filteredAnnouncements.filter(ann => ann.priority === priority);
    }

    // Limit results
    if (limit) {
      filteredAnnouncements = filteredAnnouncements.slice(0, parseInt(limit));
    }

    // Sort by creation date (newest first)
    filteredAnnouncements.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({
      success: true,
      message: 'Announcements retrieved successfully',
      data: filteredAnnouncements,
      total: filteredAnnouncements.length
    });
  } catch (error) {
    console.error('Error fetching announcements:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve announcements',
      error: error.message
    });
  }
});

// GET /announcements/admin/stats - Get announcement statistics for admin
router.get('/admin/stats', (req, res) => {
  try {
    const total = announcements.length;
    const published = announcements.filter(ann => ann.status === 'published').length;
    const draft = announcements.filter(ann => ann.status === 'draft').length;
    const scheduled = announcements.filter(ann => ann.status === 'scheduled').length;
    const urgent = announcements.filter(ann => ann.priority === 'urgent').length;
    const high = announcements.filter(ann => ann.priority === 'high').length;

    const categoryBreakdown = announcements.reduce((acc, ann) => {
      acc[ann.category] = (acc[ann.category] || 0) + 1;
      return acc;
    }, {});

    res.json({
      success: true,
      data: {
        overview: {
          total,
          published,
          draft,
          scheduled,
          urgent,
          high
        },
        categories: categoryBreakdown,
        recentActivity: announcements
          .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
          .slice(0, 5)
          .map(ann => ({
            id: ann.id,
            title: ann.title,
            status: ann.status,
            updatedAt: ann.updatedAt
          }))
      }
    });
  } catch (error) {
    console.error('Error fetching announcement stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve announcement statistics',
      error: error.message
    });
  }
});

// GET /announcements/:id - Get specific announcement
router.get('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const announcement = announcements.find(ann => ann.id === id);

    if (!announcement) {
      return res.status(404).json({
        success: false,
        message: 'Announcement not found'
      });
    }

    res.json({
      success: true,
      message: 'Announcement retrieved successfully',
      data: announcement
    });
  } catch (error) {
    console.error('Error fetching announcement:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve announcement',
      error: error.message
    });
  }
});

// POST /announcements - Create new announcement
router.post('/', (req, res) => {
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

    const newAnnouncement = {
      id: generateId(),
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
      scheduledDate: scheduledDate || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    announcements.push(newAnnouncement);

    // If it's urgent/high priority and published, you could trigger notifications here
    if ((priority === 'urgent' || priority === 'high') && status === 'published') {
      console.log(`🚨 High priority announcement created: "${title}"`);
      // TODO: Trigger push notifications
    }

    res.status(201).json({
      success: true,
      message: 'Announcement created successfully',
      data: newAnnouncement
    });
  } catch (error) {
    console.error('Error creating announcement:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create announcement',
      error: error.message
    });
  }
});

// PUT /announcements/:id - Update announcement
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const announcementIndex = announcements.findIndex(ann => ann.id === id);

    if (announcementIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Announcement not found'
      });
    }

    const {
      title,
      description,
      content,
      category,
      priority,
      author,
      location,
      time,
      date,
      tags,
      registrationRequired,
      contactInfo,
      status,
      scheduledDate
    } = req.body;

    // Validation
    if (title && !title.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Title cannot be empty'
      });
    }

    if (description && !description.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Description cannot be empty'
      });
    }

    if (priority && !['low', 'normal', 'high', 'urgent'].includes(priority)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid priority level'
      });
    }

    if (category && !['Events', 'Fellowship', 'Youth', 'Worship', 'Prayer'].includes(category)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid category'
      });
    }

    if (status && !['draft', 'published', 'scheduled'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status'
      });
    }

    const existingAnnouncement = announcements[announcementIndex];
    
    // Update announcement
    const updatedAnnouncement = {
      ...existingAnnouncement,
      ...(title && { title: title.trim() }),
      ...(description && { description: description.trim() }),
      ...(content && { content: content.trim() }),
      ...(category && { category }),
      ...(priority && { priority }),
      ...(author && { author: author.trim() }),
      ...(location !== undefined && { location: location.trim() }),
      ...(time !== undefined && { time }),
      ...(date !== undefined && { date }),
      ...(tags && { tags: Array.isArray(tags) ? tags.map(tag => tag.trim()).filter(Boolean) : [] }),
      ...(registrationRequired !== undefined && { registrationRequired }),
      ...(contactInfo !== undefined && { contactInfo: contactInfo.trim() }),
      ...(status && { status }),
      ...(scheduledDate !== undefined && { scheduledDate }),
      updatedAt: new Date().toISOString()
    };

    announcements[announcementIndex] = updatedAnnouncement;

    res.json({
      success: true,
      message: 'Announcement updated successfully',
      data: updatedAnnouncement
    });
  } catch (error) {
    console.error('Error updating announcement:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update announcement',
      error: error.message
    });
  }
});

// DELETE /announcements/:id - Delete announcement
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const announcementIndex = announcements.findIndex(ann => ann.id === id);

    if (announcementIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Announcement not found'
      });
    }

    const deletedAnnouncement = announcements.splice(announcementIndex, 1)[0];

    res.json({
      success: true,
      message: 'Announcement deleted successfully',
      data: deletedAnnouncement
    });
  } catch (error) {
    console.error('Error deleting announcement:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete announcement',
      error: error.message
    });
  }
});

// POST /announcements/:id/publish - Publish/unpublish announcement
router.post('/:id/publish', (req, res) => {
  try {
    const { id } = req.params;
    const { status = 'published' } = req.body;

    const announcementIndex = announcements.findIndex(ann => ann.id === id);

    if (announcementIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Announcement not found'
      });
    }

    if (!['draft', 'published', 'scheduled'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status'
      });
    }

    announcements[announcementIndex].status = status;
    announcements[announcementIndex].updatedAt = new Date().toISOString();

    // If publishing a high priority announcement, trigger notifications
    if (status === 'published' && (announcements[announcementIndex].priority === 'urgent' || announcements[announcementIndex].priority === 'high')) {
      console.log(`🚨 High priority announcement published: "${announcements[announcementIndex].title}"`);
      // TODO: Trigger push notifications
    }

    res.json({
      success: true,
      message: `Announcement ${status} successfully`,
      data: announcements[announcementIndex]
    });
  } catch (error) {
    console.error('Error updating announcement status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update announcement status',
      error: error.message
    });
  }
});

// POST /announcements/:id/schedule - Schedule announcement
router.post('/:id/schedule', (req, res) => {
  try {
    const { id } = req.params;
    const { scheduledDate, scheduledTime } = req.body;

    const announcementIndex = announcements.findIndex(ann => ann.id === id);

    if (announcementIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Announcement not found'
      });
    }

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

    announcements[announcementIndex].status = 'scheduled';
    announcements[announcementIndex].scheduledDate = scheduledDateTime.toISOString();
    announcements[announcementIndex].updatedAt = new Date().toISOString();

    res.json({
      success: true,
      message: 'Announcement scheduled successfully',
      data: announcements[announcementIndex]
    });
  } catch (error) {
    console.error('Error scheduling announcement:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to schedule announcement',
      error: error.message
    });
  }
});

// POST /announcements/bulk-actions - Bulk operations
router.post('/bulk-actions', (req, res) => {
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

    let updatedCount = 0;
    let errors = [];

    announcementIds.forEach(id => {
      const announcementIndex = announcements.findIndex(ann => ann.id === id);
      
      if (announcementIndex === -1) {
        errors.push(`Announcement ${id} not found`);
        return;
      }

      try {
        switch (action) {
          case 'publish':
            announcements[announcementIndex].status = 'published';
            announcements[announcementIndex].updatedAt = new Date().toISOString();
            break;
          case 'unpublish':
            announcements[announcementIndex].status = 'draft';
            announcements[announcementIndex].updatedAt = new Date().toISOString();
            break;
          case 'delete':
            announcements.splice(announcementIndex, 1);
            break;
          case 'archive':
            announcements[announcementIndex].status = 'archived';
            announcements[announcementIndex].updatedAt = new Date().toISOString();
            break;
        }
        updatedCount++;
      } catch (error) {
        errors.push(`Failed to ${action} announcement ${id}: ${error.message}`);
      }
    });

    res.json({
      success: true,
      message: `Bulk ${action} completed`,
      data: {
        processed: announcementIds.length,
        successful: updatedCount,
        failed: errors.length,
        errors
      }
    });
  } catch (error) {
    console.error('Error performing bulk action:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to perform bulk action',
      error: error.message
    });
  }
});

module.exports = router;

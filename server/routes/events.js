const express = require('express');
const router = express.Router();
const Event = require('../models/Event');
const { verifyToken, optionalAuth } = require('../../middlewares/auth');

// GET all events (public endpoint with optional auth)
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { 
      category, 
      limit = 50, 
      offset = 0, 
      search,
      sortBy = 'start_asc',
      tags,
      startDate,
      endDate,
      upcoming = false
    } = req.query;

    // Build query object
    let query = { isActive: true };

    // Filter by category
    if (category && category !== 'all' && category !== 'All') {
      query.category = category;
    }

    // Filter by tags
    if (tags) {
      const tagArray = tags.split(',').map(tag => tag.trim().toLowerCase());
      query.tags = { $in: tagArray };
    }

    // Filter by date range
    if (startDate || endDate) {
      query.start = {};
      if (startDate) {
        query.start.$gte = new Date(startDate);
      }
      if (endDate) {
        query.start.$lte = new Date(endDate);
      }
    }

    // Filter for upcoming events only
    if (upcoming === 'true') {
      const now = new Date();
      query.start = { $gte: now };
    }

    let eventsQuery;

    // Handle search
    if (search && search.trim()) {
      query.$text = { $search: search.trim() };
      eventsQuery = Event.find(query, { score: { $meta: 'textScore' } });
      
      // Sort by text score first, then by date
      if (sortBy === 'relevance') {
        eventsQuery.sort({ score: { $meta: 'textScore' }, start: 1 });
      } else {
        eventsQuery.sort({ score: { $meta: 'textScore' }, start: sortBy === 'start_desc' ? -1 : 1 });
      }
    } else {
      // No search query
      eventsQuery = Event.find(query);
      
      // Apply sorting
      switch (sortBy) {
        case 'start_desc':
          eventsQuery.sort({ start: -1 });
          break;
        case 'start_asc':
        default:
          eventsQuery.sort({ start: 1 });
          break;
        case 'created_desc':
          eventsQuery.sort({ createdAt: -1 });
          break;
        case 'created_asc':
          eventsQuery.sort({ createdAt: 1 });
          break;
        case 'title_asc':
          eventsQuery.sort({ title: 1 });
          break;
        case 'title_desc':
          eventsQuery.sort({ title: -1 });
          break;
      }
    }

    // Apply pagination
    const events = await eventsQuery
      .skip(parseInt(offset))
      .limit(parseInt(limit))
      .populate('createdBy', 'name')
      .lean();

    // Get total count for pagination
    const totalCount = await Event.countDocuments(query);

    // Format events for frontend
    const formattedEvents = events.map(event => ({
      id: event._id,
      title: event.title,
      description: event.description,
      start: event.start,
      end: event.end,
      category: event.category,
      location: event.location,
      capacity: event.capacity,
      requiresRSVP: event.requiresRSVP,
      isRecurring: event.isRecurring,
      tags: event.tags,
      rsvpCount: event.rsvpCount,
      createdBy: event.createdBy?.name || 'Admin',
      createdAt: event.createdAt,
      updatedAt: event.updatedAt
    }));

    res.json({
      success: true,
      message: 'Events retrieved successfully',
      data: formattedEvents,
      pagination: {
        total: totalCount,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: (parseInt(offset) + parseInt(limit)) < totalCount
      }
    });

  } catch (error) {
    console.error('Error fetching events:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch events',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// GET single event by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const event = await Event.findOne({ _id: id, isActive: true })
      .populate('createdBy', 'name')
      .populate('attendees.user', 'name phone')
      .lean();

    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    // Format event for frontend
    const formattedEvent = {
      id: event._id,
      title: event.title,
      description: event.description,
      start: event.start,
      end: event.end,
      category: event.category,
      location: event.location,
      capacity: event.capacity,
      requiresRSVP: event.requiresRSVP,
      isRecurring: event.isRecurring,
      tags: event.tags,
      rsvpCount: event.rsvpCount,
      attendees: event.attendees,
      createdBy: event.createdBy?.name || 'Admin',
      createdAt: event.createdAt,
      updatedAt: event.updatedAt
    };

    res.json({
      success: true,
      message: 'Event retrieved successfully',
      data: formattedEvent
    });

  } catch (error) {
    console.error('Error fetching event:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch event',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// POST create new event (admin only)
router.post('/', verifyToken, async (req, res) => {
  try {
    const {
      title,
      description,
      start,
      end,
      category,
      location,
      capacity,
      requiresRSVP,
      isRecurring,
      tags
    } = req.body;

    // Validation
    if (!title || !title.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Event title is required'
      });
    }

    if (!start) {
      return res.status(400).json({
        success: false,
        message: 'Start date and time is required'
      });
    }

    // Validate dates
    const startDate = new Date(start);
    const endDate = end ? new Date(end) : null;

    if (isNaN(startDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid start date format'
      });
    }

    if (endDate && isNaN(endDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid end date format'
      });
    }

    if (endDate && endDate <= startDate) {
      return res.status(400).json({
        success: false,
        message: 'End date must be after start date'
      });
    }

    // Create event object
    const eventData = {
      title: title.trim(),
      description: description?.trim() || '',
      start: startDate,
      end: endDate,
      category: category || 'General',
      location: location?.trim() || '',
      capacity: capacity ? parseInt(capacity) : null,
      requiresRSVP: Boolean(requiresRSVP),
      isRecurring: Boolean(isRecurring),
      tags: Array.isArray(tags) ? tags.map(tag => tag.trim().toLowerCase()) : [],
      createdBy: req.user?.id || null
    };

    // Validate capacity
    if (eventData.capacity && eventData.capacity < 1) {
      return res.status(400).json({
        success: false,
        message: 'Capacity must be greater than 0'
      });
    }

    const event = new Event(eventData);
    const savedEvent = await event.save();

    // Format response
    const formattedEvent = {
      id: savedEvent._id,
      title: savedEvent.title,
      description: savedEvent.description,
      start: savedEvent.start,
      end: savedEvent.end,
      category: savedEvent.category,
      location: savedEvent.location,
      capacity: savedEvent.capacity,
      requiresRSVP: savedEvent.requiresRSVP,
      isRecurring: savedEvent.isRecurring,
      tags: savedEvent.tags,
      rsvpCount: savedEvent.rsvpCount,
      createdAt: savedEvent.createdAt,
      updatedAt: savedEvent.updatedAt
    };

    res.status(201).json({
      success: true,
      message: 'Event created successfully',
      data: formattedEvent
    });

  } catch (error) {
    console.error('Error creating event:', error);
    
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
      message: 'Failed to create event',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// PUT update event by ID (admin only)
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      description,
      start,
      end,
      category,
      location,
      capacity,
      requiresRSVP,
      isRecurring,
      tags
    } = req.body;

    // Find the event
    const event = await Event.findOne({ _id: id, isActive: true });
    
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    // Validation
    if (title !== undefined && (!title || !title.trim())) {
      return res.status(400).json({
        success: false,
        message: 'Event title cannot be empty'
      });
    }

    // Validate dates if provided
    let startDate = event.start;
    let endDate = event.end;

    if (start) {
      startDate = new Date(start);
      if (isNaN(startDate.getTime())) {
        return res.status(400).json({
          success: false,
          message: 'Invalid start date format'
        });
      }
    }

    if (end !== undefined) {
      endDate = end ? new Date(end) : null;
      if (end && isNaN(endDate.getTime())) {
        return res.status(400).json({
          success: false,
          message: 'Invalid end date format'
        });
      }
    }

    if (endDate && endDate <= startDate) {
      return res.status(400).json({
        success: false,
        message: 'End date must be after start date'
      });
    }

    // Update fields
    const updateData = {};
    
    if (title !== undefined) updateData.title = title.trim();
    if (description !== undefined) updateData.description = description?.trim() || '';
    if (start !== undefined) updateData.start = startDate;
    if (end !== undefined) updateData.end = endDate;
    if (category !== undefined) updateData.category = category;
    if (location !== undefined) updateData.location = location?.trim() || '';
    if (capacity !== undefined) updateData.capacity = capacity ? parseInt(capacity) : null;
    if (requiresRSVP !== undefined) updateData.requiresRSVP = Boolean(requiresRSVP);
    if (isRecurring !== undefined) updateData.isRecurring = Boolean(isRecurring);
    if (tags !== undefined) updateData.tags = Array.isArray(tags) ? tags.map(tag => tag.trim().toLowerCase()) : [];

    // Validate capacity
    if (updateData.capacity && updateData.capacity < 1) {
      return res.status(400).json({
        success: false,
        message: 'Capacity must be greater than 0'
      });
    }

    const updatedEvent = await Event.findByIdAndUpdate(
      id,
      updateData,
      { 
        new: true, 
        runValidators: true 
      }
    );

    // Format response
    const formattedEvent = {
      id: updatedEvent._id,
      title: updatedEvent.title,
      description: updatedEvent.description,
      start: updatedEvent.start,
      end: updatedEvent.end,
      category: updatedEvent.category,
      location: updatedEvent.location,
      capacity: updatedEvent.capacity,
      requiresRSVP: updatedEvent.requiresRSVP,
      isRecurring: updatedEvent.isRecurring,
      tags: updatedEvent.tags,
      rsvpCount: updatedEvent.rsvpCount,
      createdAt: updatedEvent.createdAt,
      updatedAt: updatedEvent.updatedAt
    };

    res.json({
      success: true,
      message: 'Event updated successfully',
      data: formattedEvent
    });

  } catch (error) {
    console.error('Error updating event:', error);
    
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
      message: 'Failed to update event',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// DELETE event by ID (admin only)
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const event = await Event.findOne({ _id: id, isActive: true });
    
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    // Soft delete by setting isActive to false
    await Event.findByIdAndUpdate(id, { isActive: false });

    res.json({
      success: true,
      message: 'Event deleted successfully',
      data: { id }
    });

  } catch (error) {
    console.error('Error deleting event:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete event',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// POST RSVP to event (authenticated users)
router.post('/:id/rsvp', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { status = 'attending' } = req.body;
    const userId = req.user.id;

    if (!['attending', 'maybe', 'not_attending'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid RSVP status'
      });
    }

    const event = await Event.findOne({ _id: id, isActive: true });
    
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    if (!event.requiresRSVP) {
      return res.status(400).json({
        success: false,
        message: 'This event does not require RSVP'
      });
    }

    // Check if event is full (only for 'attending' status)
    if (status === 'attending' && event.capacity && event.rsvpCount >= event.capacity) {
      return res.status(400).json({
        success: false,
        message: 'Event is full'
      });
    }

    await event.addRSVP(userId, status);

    res.json({
      success: true,
      message: 'RSVP updated successfully',
      data: {
        eventId: id,
        status,
        rsvpCount: event.rsvpCount,
        availableSpots: event.capacity ? event.capacity - event.rsvpCount : null
      }
    });

  } catch (error) {
    console.error('Error updating RSVP:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update RSVP',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// DELETE RSVP from event (authenticated users)
router.delete('/:id/rsvp', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const event = await Event.findOne({ _id: id, isActive: true });
    
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    await event.removeRSVP(userId);

    res.json({
      success: true,
      message: 'RSVP removed successfully',
      data: {
        eventId: id,
        rsvpCount: event.rsvpCount,
        availableSpots: event.capacity ? event.capacity - event.rsvpCount : null
      }
    });

  } catch (error) {
    console.error('Error removing RSVP:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove RSVP',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// GET event statistics (admin only)
router.get('/admin/stats', verifyToken, async (req, res) => {
  try {
    const stats = await Event.getStats();

    res.json({
      success: true,
      message: 'Event statistics retrieved successfully',
      data: stats
    });

  } catch (error) {
    console.error('Error fetching event statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch event statistics',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

module.exports = router;

const mongoose = require('mongoose');

// Event Schema for storing church events
const eventSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  description: {
    type: String,
    trim: true,
    maxlength: 2000,
    default: ''
  },
  start: {
    type: Date,
    required: true,
    index: true
  },
  end: {
    type: Date,
    default: null,
    validate: {
      validator: function(endDate) {
        // If end date is provided, it must be after start date
        return !endDate || endDate > this.start;
      },
      message: 'End date must be after start date'
    }
  },
  category: {
    type: String,
    required: true,
    enum: [
      'General',
      'Worship Service',
      'Bible Study',
      'Youth Fellowship',
      'Women\'s Ministry',
      'Men\'s Ministry',
      'Children\'s Ministry',
      'Community Outreach',
      'Prayer Meeting',
      'Special Service',
      'Conference',
      'Workshop'
    ],
    default: 'General'
  },
  location: {
    type: String,
    trim: true,
    maxlength: 300,
    default: ''
  },
  capacity: {
    type: Number,
    min: 1,
    default: null
  },
  requiresRSVP: {
    type: Boolean,
    default: false
  },
  isRecurring: {
    type: Boolean,
    default: false
  },
  tags: [{
    type: String,
    trim: true,
    lowercase: true
  }],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  isActive: {
    type: Boolean,
    default: true
  },
  // RSVP tracking
  rsvpCount: {
    type: Number,
    default: 0
  },
  attendees: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    rsvpDate: {
      type: Date,
      default: Date.now
    },
    status: {
      type: String,
      enum: ['attending', 'maybe', 'not_attending'],
      default: 'attending'
    }
  }]
}, {
  timestamps: true
});

// Indexes for performance
eventSchema.index({ start: 1, isActive: 1 });
eventSchema.index({ end: 1, isActive: 1 });
eventSchema.index({ category: 1, start: 1 });
eventSchema.index({ createdBy: 1, start: 1 });
eventSchema.index({ tags: 1 });
eventSchema.index({ requiresRSVP: 1, start: 1 });

// Text search index for title, description, and location
eventSchema.index({ 
  title: 'text', 
  description: 'text', 
  location: 'text',
  tags: 'text' 
}, {
  name: 'event_text_search'
});

// Pre-save middleware to update updatedAt
eventSchema.pre('save', function(next) {
  if (this.isModified() && !this.isNew) {
    this.updatedAt = new Date();
  }
  next();
});

// Pre-update middleware to update updatedAt
eventSchema.pre(['findOneAndUpdate', 'updateOne', 'updateMany'], function(next) {
  this.set({ updatedAt: new Date() });
  next();
});

// Virtual for event status
eventSchema.virtual('status').get(function() {
  const now = new Date();
  if (this.end && now > this.end) {
    return 'completed';
  } else if (now > this.start) {
    return 'ongoing';
  } else {
    return 'upcoming';
  }
});

// Virtual for duration in hours
eventSchema.virtual('durationHours').get(function() {
  if (!this.end) return null;
  return Math.round((this.end - this.start) / (1000 * 60 * 60) * 10) / 10;
});

// Virtual for available spots
eventSchema.virtual('availableSpots').get(function() {
  if (!this.capacity) return null;
  return Math.max(0, this.capacity - this.rsvpCount);
});

// Virtual for checking if event is full
eventSchema.virtual('isFull').get(function() {
  if (!this.capacity) return false;
  return this.rsvpCount >= this.capacity;
});

// Method to add RSVP
eventSchema.methods.addRSVP = function(userId, status = 'attending') {
  // Remove existing RSVP from same user
  this.attendees = this.attendees.filter(attendee => 
    !attendee.user.equals(userId)
  );
  
  // Add new RSVP
  this.attendees.push({
    user: userId,
    status: status
  });
  
  // Update RSVP count (only count 'attending' status)
  this.rsvpCount = this.attendees.filter(attendee => 
    attendee.status === 'attending'
  ).length;
  
  return this.save();
};

// Method to remove RSVP
eventSchema.methods.removeRSVP = function(userId) {
  this.attendees = this.attendees.filter(attendee => 
    !attendee.user.equals(userId)
  );
  
  // Update RSVP count
  this.rsvpCount = this.attendees.filter(attendee => 
    attendee.status === 'attending'
  ).length;
  
  return this.save();
};

// Static method to get upcoming events
eventSchema.statics.getUpcoming = function(limit = 10) {
  const now = new Date();
  return this.find({ 
    start: { $gte: now }, 
    isActive: true 
  })
    .sort({ start: 1 })
    .limit(limit);
};

// Static method to get events by date range
eventSchema.statics.getByDateRange = function(startDate, endDate) {
  return this.find({
    isActive: true,
    $or: [
      // Events that start within the range
      { start: { $gte: startDate, $lte: endDate } },
      // Events that end within the range
      { end: { $gte: startDate, $lte: endDate } },
      // Events that span the entire range
      { start: { $lte: startDate }, end: { $gte: endDate } }
    ]
  }).sort({ start: 1 });
};

// Static method to get events by category
eventSchema.statics.getByCategory = function(category, limit = 20) {
  return this.find({ 
    category, 
    isActive: true 
  })
    .sort({ start: 1 })
    .limit(limit);
};

// Static method to search events
eventSchema.statics.searchEvents = function(query, options = {}) {
  const searchQuery = {
    isActive: true,
    $text: { $search: query }
  };
  
  if (options.category) {
    searchQuery.category = options.category;
  }
  
  if (options.startDate) {
    searchQuery.start = { $gte: options.startDate };
  }
  
  return this.find(searchQuery, { score: { $meta: 'textScore' } })
    .sort({ score: { $meta: 'textScore' }, start: 1 })
    .limit(options.limit || 20);
};

// Static method to get event statistics
eventSchema.statics.getStats = async function() {
  const now = new Date();
  
  const stats = await this.aggregate([
    { $match: { isActive: true } },
    {
      $group: {
        _id: null,
        totalEvents: { $sum: 1 },
        upcomingEvents: {
          $sum: { $cond: [{ $gte: ['$start', now] }, 1, 0] }
        },
        completedEvents: {
          $sum: { $cond: [{ $lt: ['$end', now] }, 1, 0] }
        },
        eventsWithRSVP: {
          $sum: { $cond: ['$requiresRSVP', 1, 0] }
        },
        totalRSVPs: { $sum: '$rsvpCount' },
        avgCapacity: { $avg: '$capacity' }
      }
    }
  ]);
  
  // Get category breakdown
  const categoryStats = await this.aggregate([
    { $match: { isActive: true } },
    {
      $group: {
        _id: '$category',
        count: { $sum: 1 },
        upcomingCount: {
          $sum: { $cond: [{ $gte: ['$start', now] }, 1, 0] }
        },
        totalRSVPs: { $sum: '$rsvpCount' }
      }
    },
    { $sort: { count: -1 } }
  ]);
  
  return {
    overview: stats[0] || {
      totalEvents: 0,
      upcomingEvents: 0,
      completedEvents: 0,
      eventsWithRSVP: 0,
      totalRSVPs: 0,
      avgCapacity: 0
    },
    categories: categoryStats
  };
};

// Export the model
module.exports = mongoose.model('Event', eventSchema);

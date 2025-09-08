const mongoose = require('mongoose');

// Announcement Schema for storing church announcements
const announcementSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters']
  },
  description: {
    type: String,
    required: [true, 'Description is required'],
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  content: {
    type: String,
    trim: true,
    maxlength: [2000, 'Content cannot exceed 2000 characters']
  },
  category: {
    type: String,
    enum: ['Events', 'Fellowship', 'Youth', 'Worship', 'Prayer'],
    default: 'Events'
  },
  priority: {
    type: String,
    enum: ['low', 'normal', 'high', 'urgent'],
    default: 'normal'
  },
  author: {
    type: String,
    required: true,
    default: 'Church Administration',
    trim: true
  },
  location: {
    type: String,
    trim: true
  },
  time: {
    type: String,
    trim: true
  },
  date: {
    type: String,
    trim: true
  },
  tags: [{
    type: String,
    trim: true,
    lowercase: true
  }],
  registrationRequired: {
    type: Boolean,
    default: false
  },
  contactInfo: {
    type: String,
    trim: true
  },
  status: {
    type: String,
    enum: ['draft', 'published', 'scheduled', 'archived'],
    default: 'draft'
  },
  scheduledDate: {
    type: Date,
    default: null
  },
  publishedAt: {
    type: Date,
    default: null
  },
  archivedAt: {
    type: Date,
    default: null
  },
  views: {
    type: Number,
    default: 0
  },
  likes: {
    type: Number,
    default: 0
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  }
}, {
  timestamps: true, // Automatically adds createdAt and updatedAt
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better query performance
announcementSchema.index({ status: 1, createdAt: -1 });
announcementSchema.index({ category: 1, status: 1 });
announcementSchema.index({ priority: 1, status: 1 });
announcementSchema.index({ scheduledDate: 1, status: 1 });
announcementSchema.index({ title: 'text', description: 'text', content: 'text' });

// Virtual for formatted creation date
announcementSchema.virtual('formattedDate').get(function() {
  return this.createdAt.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
});

// Virtual to check if announcement is current
announcementSchema.virtual('isCurrent').get(function() {
  if (this.status !== 'published') return false;
  if (!this.date) return true;
  
  try {
    const eventDate = new Date(this.date);
    const now = new Date();
    return eventDate >= now;
  } catch (error) {
    return true; // If date parsing fails, assume it's current
  }
});

// Virtual for days until event
announcementSchema.virtual('daysUntil').get(function() {
  if (!this.date) return null;
  
  try {
    const eventDate = new Date(this.date);
    const now = new Date();
    const diffTime = eventDate - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  } catch (error) {
    return null;
  }
});

// Pre-save middleware to set publishedAt when status changes to published
announcementSchema.pre('save', function(next) {
  if (this.isModified('status') && this.status === 'published' && !this.publishedAt) {
    this.publishedAt = new Date();
  }
  
  if (this.isModified('status') && this.status === 'archived' && !this.archivedAt) {
    this.archivedAt = new Date();
  }
  
  next();
});

// Static method to get published announcements
announcementSchema.statics.getPublished = function(options = {}) {
  const query = { status: 'published' };
  
  if (options.category) {
    query.category = options.category;
  }
  
  if (options.priority) {
    query.priority = options.priority;
  }
  
  return this.find(query)
    .sort({ priority: 1, createdAt: -1 }) // Sort by priority first, then date
    .limit(options.limit || 50);
};

// Static method to get announcements by status
announcementSchema.statics.getByStatus = function(status, options = {}) {
  const query = { status };
  
  return this.find(query)
    .sort({ createdAt: -1 })
    .limit(options.limit || 50);
};

// Static method to search announcements
announcementSchema.statics.search = function(searchTerm, options = {}) {
  const query = {
    $text: { $search: searchTerm },
    status: options.status || 'published'
  };
  
  return this.find(query, { score: { $meta: 'textScore' } })
    .sort({ score: { $meta: 'textScore' }, createdAt: -1 })
    .limit(options.limit || 20);
};

// Instance method to archive announcement
announcementSchema.methods.archive = function() {
  this.status = 'archived';
  this.archivedAt = new Date();
  return this.save();
};

// Instance method to publish announcement
announcementSchema.methods.publish = function() {
  this.status = 'published';
  if (!this.publishedAt) {
    this.publishedAt = new Date();
  }
  return this.save();
};

// Instance method to increment views
announcementSchema.methods.incrementViews = function() {
  this.views += 1;
  return this.save();
};

// Export the model
module.exports = mongoose.model('Announcement', announcementSchema);

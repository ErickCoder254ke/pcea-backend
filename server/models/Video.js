const mongoose = require('mongoose');

// Video Schema for storing standalone video content (separate from sermons)
const videoSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 300
  },
  description: {
    type: String,
    required: false,
    trim: true,
    maxlength: 2000,
    default: ''
  },
  category: {
    type: String,
    required: false,
    enum: ['Worship', 'Teaching', 'Testimony', 'Youth', 'Children', 'Music', 'Documentary', 'Event', 'Announcement', 'Other'],
    default: 'Other'
  },
  tags: [{
    type: String,
    trim: true,
    lowercase: true,
    maxlength: 50
  }],
  // Video source - either uploaded to Cloudinary or external URL
  source: {
    type: {
      type: String,
      enum: ['upload', 'url'],
      required: true
    },
    // For uploaded videos (Cloudinary)
    cloudinary: {
      publicId: String,
      url: String,
      thumbnailUrl: String,
      duration: Number, // Duration in seconds
      width: Number,
      height: Number,
      format: String,
      size: Number, // File size in bytes
      quality: {
        type: String,
        enum: ['480p', '720p', '1080p', '4K'],
        default: '720p'
      }
    },
    // For external video URLs (YouTube, Vimeo, etc.)
    externalUrl: {
      type: String,
      trim: true
    },
    // Custom thumbnail for external videos
    customThumbnail: {
      publicId: String,
      url: String,
      width: Number,
      height: Number
    }
  },
  speaker: {
    name: {
      type: String,
      trim: true,
      maxlength: 100,
      default: ''
    },
    title: {
      type: String,
      trim: true,
      maxlength: 100,
      default: ''
    }
  },
  duration: {
    type: Number, // Duration in minutes
    required: false,
    min: 1,
    max: 300,
    default: null
  },
  featured: {
    type: Boolean,
    default: false
  },
  stats: {
    views: {
      type: Number,
      default: 0,
      min: 0
    },
    likes: {
      type: Number,
      default: 0,
      min: 0
    },
    shares: {
      type: Number,
      default: 0,
      min: 0
    }
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  uploadedAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  publishedAt: {
    type: Date,
    default: null
  },
  status: {
    type: String,
    enum: ['draft', 'published', 'archived'],
    default: 'published'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  metadata: {
    language: {
      type: String,
      default: 'en'
    },
    location: {
      type: String,
      trim: true,
      default: 'PCEA Turi Church'
    },
    event: {
      type: String,
      trim: true,
      default: ''
    }
  }
}, {
  timestamps: true
});

// Indexes for performance
videoSchema.index({ status: 1, publishedAt: -1 });
videoSchema.index({ category: 1, publishedAt: -1 });
videoSchema.index({ featured: 1, publishedAt: -1 });
videoSchema.index({ uploadedBy: 1, uploadedAt: -1 });
videoSchema.index({ isActive: 1, status: 1, publishedAt: -1 });
videoSchema.index({ tags: 1 });
videoSchema.index({ 'speaker.name': 1, publishedAt: -1 });
videoSchema.index({ 'source.type': 1 });

// Text search index for title, description, speaker, and tags
videoSchema.index({ 
  title: 'text', 
  description: 'text', 
  'speaker.name': 'text',
  tags: 'text'
}, {
  name: 'video_text_search'
});

// Compound index for efficient queries
videoSchema.index({ isActive: 1, status: 1, category: 1, publishedAt: -1 });

// Pre-save middleware to update timestamps and handle publishing
videoSchema.pre('save', function(next) {
  if (this.isModified() && !this.isNew) {
    this.updatedAt = new Date();
  }
  
  // Set publishedAt when status changes to published
  if (this.isModified('status') && this.status === 'published' && !this.publishedAt) {
    this.publishedAt = new Date();
  }
  
  next();
});

// Pre-update middleware to update updatedAt
videoSchema.pre(['findOneAndUpdate', 'updateOne', 'updateMany'], function(next) {
  this.set({ updatedAt: new Date() });
  
  // Handle publishing date
  const update = this.getUpdate();
  if (update.status === 'published' && !update.publishedAt) {
    this.set({ publishedAt: new Date() });
  }
  
  next();
});

// Virtual for getting formatted duration
videoSchema.virtual('formattedDuration').get(function() {
  if (!this.duration) return 'Unknown';
  
  const hours = Math.floor(this.duration / 60);
  const minutes = this.duration % 60;
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
});

// Virtual for getting SEO-friendly URL slug
videoSchema.virtual('slug').get(function() {
  return this.title.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
});

// Virtual for getting the appropriate video URL
videoSchema.virtual('videoUrl').get(function() {
  if (this.source.type === 'upload' && this.source.cloudinary.url) {
    return this.source.cloudinary.url;
  } else if (this.source.type === 'url' && this.source.externalUrl) {
    return this.source.externalUrl;
  }
  return null;
});

// Virtual for getting the appropriate thumbnail URL
videoSchema.virtual('thumbnailUrl').get(function() {
  if (this.source.type === 'upload' && this.source.cloudinary.thumbnailUrl) {
    return this.source.cloudinary.thumbnailUrl;
  } else if (this.source.type === 'url' && this.source.customThumbnail.url) {
    return this.source.customThumbnail.url;
  }
  return null;
});

// Method to increment views
videoSchema.methods.incrementViews = function() {
  this.stats.views = (this.stats.views || 0) + 1;
  return this.save();
};

// Method to increment shares
videoSchema.methods.incrementShares = function() {
  this.stats.shares = (this.stats.shares || 0) + 1;
  return this.save();
};

// Method to toggle like
videoSchema.methods.toggleLike = function(increment = true) {
  this.stats.likes = Math.max(0, (this.stats.likes || 0) + (increment ? 1 : -1));
  return this.save();
};

// Method to publish video
videoSchema.methods.publish = function() {
  this.status = 'published';
  this.publishedAt = new Date();
  return this.save();
};

// Method to archive video
videoSchema.methods.archive = function() {
  this.status = 'archived';
  return this.save();
};

// Static method to get published videos
videoSchema.statics.getPublished = function(options = {}) {
  const query = { status: 'published', isActive: true };
  
  if (options.category) {
    query.category = options.category;
  }
  
  if (options.speaker) {
    query['speaker.name'] = new RegExp(options.speaker, 'i');
  }
  
  if (options.featured !== undefined) {
    query.featured = options.featured;
  }
  
  return this.find(query)
    .sort({ publishedAt: -1 })
    .limit(options.limit || 20)
    .skip(options.skip || 0);
};

// Static method to get featured videos
videoSchema.statics.getFeatured = function(limit = 5) {
  return this.find({ 
    featured: true, 
    status: 'published', 
    isActive: true 
  })
    .sort({ publishedAt: -1 })
    .limit(limit);
};

// Static method to get videos by category
videoSchema.statics.getByCategory = function(category, options = {}) {
  return this.find({ 
    category: category,
    status: 'published',
    isActive: true 
  })
    .sort({ publishedAt: -1 })
    .limit(options.limit || 20)
    .skip(options.skip || 0);
};

// Static method to get videos by speaker
videoSchema.statics.getBySpeaker = function(speakerName, options = {}) {
  return this.find({ 
    'speaker.name': new RegExp(speakerName, 'i'),
    status: 'published',
    isActive: true 
  })
    .sort({ publishedAt: -1 })
    .limit(options.limit || 20);
};

// Static method to search videos
videoSchema.statics.searchVideos = function(query, options = {}) {
  const searchQuery = {
    status: 'published',
    isActive: true,
    $text: { $search: query }
  };
  
  if (options.category) {
    searchQuery.category = options.category;
  }
  
  if (options.dateFrom) {
    searchQuery.publishedAt = { $gte: new Date(options.dateFrom) };
  }
  
  if (options.dateTo) {
    searchQuery.publishedAt = { ...searchQuery.publishedAt, $lte: new Date(options.dateTo) };
  }
  
  return this.find(searchQuery, { score: { $meta: 'textScore' } })
    .sort({ score: { $meta: 'textScore' }, publishedAt: -1 })
    .limit(options.limit || 20)
    .skip(options.skip || 0);
};

// Static method to get recent videos
videoSchema.statics.getRecent = function(limit = 10) {
  return this.find({ 
    status: 'published', 
    isActive: true 
  })
    .sort({ publishedAt: -1 })
    .limit(limit);
};

// Static method to get video statistics
videoSchema.statics.getStats = async function() {
  const stats = await this.aggregate([
    { $match: { isActive: true } },
    {
      $group: {
        _id: null,
        totalVideos: { $sum: 1 },
        publishedVideos: {
          $sum: { $cond: [{ $eq: ['$status', 'published'] }, 1, 0] }
        },
        draftVideos: {
          $sum: { $cond: [{ $eq: ['$status', 'draft'] }, 1, 0] }
        },
        totalViews: { $sum: '$stats.views' },
        totalLikes: { $sum: '$stats.likes' },
        totalShares: { $sum: '$stats.shares' },
        totalDuration: { $sum: '$duration' },
        featuredCount: {
          $sum: { $cond: ['$featured', 1, 0] }
        },
        uploadedCount: {
          $sum: { $cond: [{ $eq: ['$source.type', 'upload'] }, 1, 0] }
        },
        urlCount: {
          $sum: { $cond: [{ $eq: ['$source.type', 'url'] }, 1, 0] }
        }
      }
    },
    {
      $project: {
        _id: 0,
        totalVideos: 1,
        publishedVideos: 1,
        draftVideos: 1,
        totalViews: 1,
        totalLikes: 1,
        totalShares: 1,
        totalDuration: 1,
        featuredCount: 1,
        uploadedCount: 1,
        urlCount: 1,
        avgViewsPerVideo: {
          $cond: [
            { $gt: ['$publishedVideos', 0] },
            { $divide: ['$totalViews', '$publishedVideos'] },
            0
          ]
        },
        totalHours: {
          $divide: ['$totalDuration', 60]
        }
      }
    }
  ]);
  
  // Get category breakdown
  const categoryStats = await this.aggregate([
    { $match: { isActive: true, status: 'published' } },
    {
      $group: {
        _id: '$category',
        count: { $sum: 1 },
        totalViews: { $sum: '$stats.views' },
        totalLikes: { $sum: '$stats.likes' },
        avgDuration: { $avg: '$duration' }
      }
    },
    { $sort: { count: -1 } }
  ]);
  
  // Get speaker breakdown
  const speakerStats = await this.aggregate([
    { 
      $match: { 
        isActive: true, 
        status: 'published',
        'speaker.name': { $ne: '' }
      } 
    },
    {
      $group: {
        _id: '$speaker.name',
        count: { $sum: 1 },
        totalViews: { $sum: '$stats.views' },
        totalLikes: { $sum: '$stats.likes' },
        totalDuration: { $sum: '$duration' }
      }
    },
    { $sort: { count: -1 } },
    { $limit: 10 }
  ]);
  
  return {
    overview: stats[0] || {
      totalVideos: 0,
      publishedVideos: 0,
      draftVideos: 0,
      totalViews: 0,
      totalLikes: 0,
      totalShares: 0,
      totalDuration: 0,
      featuredCount: 0,
      uploadedCount: 0,
      urlCount: 0,
      avgViewsPerVideo: 0,
      totalHours: 0
    },
    categories: categoryStats,
    speakers: speakerStats
  };
};

// Export the model
module.exports = mongoose.model('Video', videoSchema);

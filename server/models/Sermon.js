const mongoose = require('mongoose');

// Sermon Schema for storing sermon metadata and content
const sermonSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 300
  },
  description: {
    type: String,
    required: true,
    trim: true,
    maxlength: 2000
  },
  speaker: {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100
    },
    title: {
      type: String,
      trim: true,
      maxlength: 100,
      default: ''
    },
    bio: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: ''
    },
    imageUrl: {
      type: String,
      trim: true,
      default: ''
    }
  },
  date: {
    type: Date,
    required: true,
    index: true
  },
  duration: {
    type: Number, // Duration in minutes
    required: true,
    min: 1,
    max: 300
  },
  category: {
    type: String,
    required: true,
    enum: ['Sunday Service', 'Bible Study', 'Youth Service', 'Special Event', 'Conference', 'Workshop', 'Prayer Meeting', 'Other'],
    default: 'Sunday Service'
  },
  topic: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  series: {
    name: {
      type: String,
      trim: true,
      maxlength: 200,
      default: ''
    },
    part: {
      type: Number,
      min: 1,
      default: null
    },
    totalParts: {
      type: Number,
      min: 1,
      default: null
    }
  },
  scripture: {
    references: [{
      book: String,
      chapter: Number,
      verseStart: Number,
      verseEnd: Number,
      text: String
    }],
    mainText: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: ''
    }
  },
  media: {
    thumbnail: {
      publicId: String,
      url: String,
      width: Number,
      height: Number
    },
    video: {
      publicId: String,
      url: String,
      quality: {
        type: String,
        enum: ['480p', '720p', '1080p', '4K'],
        default: '720p'
      },
      duration: Number, // Video duration in seconds
      size: Number, // File size in bytes
      format: String
    },
    audio: {
      publicId: String,
      url: String,
      duration: Number, // Audio duration in seconds
      size: Number, // File size in bytes
      format: String
    },
    notes: {
      publicId: String,
      url: String,
      format: {
        type: String,
        enum: ['pdf', 'doc', 'docx'],
        default: 'pdf'
      },
      size: Number
    }
  },
  transcript: {
    type: String,
    trim: true,
    default: ''
  },
  tags: [{
    type: String,
    trim: true,
    lowercase: true,
    maxlength: 50
  }],
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
    downloads: {
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
    default: null
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
    default: 'draft'
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
sermonSchema.index({ date: -1, status: 1 });
sermonSchema.index({ category: 1, date: -1 });
sermonSchema.index({ 'series.name': 1, 'series.part': 1 });
sermonSchema.index({ featured: 1, date: -1 });
sermonSchema.index({ status: 1, publishedAt: -1 });
sermonSchema.index({ 'speaker.name': 1, date: -1 });
sermonSchema.index({ tags: 1 });
sermonSchema.index({ topic: 1, date: -1 });
sermonSchema.index({ uploadedBy: 1, uploadedAt: -1 });
sermonSchema.index({ isActive: 1, status: 1, date: -1 });

// Text search index for title, description, speaker, topic, and tags
sermonSchema.index({ 
  title: 'text', 
  description: 'text', 
  'speaker.name': 'text',
  topic: 'text',
  tags: 'text',
  'series.name': 'text'
}, {
  name: 'sermon_text_search'
});

// Pre-save middleware to update updatedAt and handle publishing
sermonSchema.pre('save', function(next) {
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
sermonSchema.pre(['findOneAndUpdate', 'updateOne', 'updateMany'], function(next) {
  this.set({ updatedAt: new Date() });
  
  // Handle publishing date
  const update = this.getUpdate();
  if (update.status === 'published' && !update.publishedAt) {
    this.set({ publishedAt: new Date() });
  }
  
  next();
});

// Virtual for getting formatted duration
sermonSchema.virtual('formattedDuration').get(function() {
  const hours = Math.floor(this.duration / 60);
  const minutes = this.duration % 60;
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
});

// Virtual for getting SEO-friendly URL slug
sermonSchema.virtual('slug').get(function() {
  return this.title.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
});

// Virtual for getting series info
sermonSchema.virtual('seriesInfo').get(function() {
  if (!this.series.name) return '';
  
  if (this.series.part && this.series.totalParts) {
    return `${this.series.name} (Part ${this.series.part} of ${this.series.totalParts})`;
  } else if (this.series.part) {
    return `${this.series.name} (Part ${this.series.part})`;
  }
  
  return this.series.name;
});

// Method to increment views
sermonSchema.methods.incrementViews = function() {
  this.stats.views = (this.stats.views || 0) + 1;
  return this.save();
};

// Method to increment downloads
sermonSchema.methods.incrementDownloads = function() {
  this.stats.downloads = (this.stats.downloads || 0) + 1;
  return this.save();
};

// Method to increment shares
sermonSchema.methods.incrementShares = function() {
  this.stats.shares = (this.stats.shares || 0) + 1;
  return this.save();
};

// Method to toggle like
sermonSchema.methods.toggleLike = function(increment = true) {
  this.stats.likes = Math.max(0, (this.stats.likes || 0) + (increment ? 1 : -1));
  return this.save();
};

// Method to publish sermon
sermonSchema.methods.publish = function() {
  this.status = 'published';
  this.publishedAt = new Date();
  return this.save();
};

// Method to archive sermon
sermonSchema.methods.archive = function() {
  this.status = 'archived';
  return this.save();
};

// Static method to get published sermons
sermonSchema.statics.getPublished = function(options = {}) {
  const query = { status: 'published', isActive: true };
  
  if (options.category) {
    query.category = options.category;
  }
  
  if (options.speaker) {
    query['speaker.name'] = new RegExp(options.speaker, 'i');
  }
  
  if (options.series) {
    query['series.name'] = new RegExp(options.series, 'i');
  }
  
  return this.find(query)
    .sort({ publishedAt: -1 })
    .limit(options.limit || 20)
    .skip(options.skip || 0);
};

// Static method to get featured sermons
sermonSchema.statics.getFeatured = function(limit = 5) {
  return this.find({ 
    featured: true, 
    status: 'published', 
    isActive: true 
  })
    .sort({ publishedAt: -1 })
    .limit(limit);
};

// Static method to get sermons by series
sermonSchema.statics.getBySeries = function(seriesName, options = {}) {
  return this.find({ 
    'series.name': new RegExp(seriesName, 'i'),
    status: 'published',
    isActive: true 
  })
    .sort({ 'series.part': 1, date: 1 })
    .limit(options.limit || 50);
};

// Static method to get sermons by speaker
sermonSchema.statics.getBySpeaker = function(speakerName, options = {}) {
  return this.find({ 
    'speaker.name': new RegExp(speakerName, 'i'),
    status: 'published',
    isActive: true 
  })
    .sort({ date: -1 })
    .limit(options.limit || 20);
};

// Static method to search sermons
sermonSchema.statics.searchSermons = function(query, options = {}) {
  const searchQuery = {
    status: 'published',
    isActive: true,
    $text: { $search: query }
  };
  
  if (options.category) {
    searchQuery.category = options.category;
  }
  
  if (options.dateFrom) {
    searchQuery.date = { $gte: new Date(options.dateFrom) };
  }
  
  if (options.dateTo) {
    searchQuery.date = { ...searchQuery.date, $lte: new Date(options.dateTo) };
  }
  
  return this.find(searchQuery, { score: { $meta: 'textScore' } })
    .sort({ score: { $meta: 'textScore' }, publishedAt: -1 })
    .limit(options.limit || 20)
    .skip(options.skip || 0);
};

// Static method to get recent sermons
sermonSchema.statics.getRecent = function(limit = 10) {
  return this.find({ 
    status: 'published', 
    isActive: true 
  })
    .sort({ publishedAt: -1 })
    .limit(limit);
};

// Static method to get sermon statistics
sermonSchema.statics.getStats = async function() {
  const stats = await this.aggregate([
    { $match: { isActive: true } },
    {
      $group: {
        _id: null,
        totalSermons: { $sum: 1 },
        publishedSermons: {
          $sum: { $cond: [{ $eq: ['$status', 'published'] }, 1, 0] }
        },
        draftSermons: {
          $sum: { $cond: [{ $eq: ['$status', 'draft'] }, 1, 0] }
        },
        totalViews: { $sum: '$stats.views' },
        totalLikes: { $sum: '$stats.likes' },
        totalDownloads: { $sum: '$stats.downloads' },
        totalDuration: { $sum: '$duration' },
        featuredCount: {
          $sum: { $cond: ['$featured', 1, 0] }
        }
      }
    },
    {
      $project: {
        _id: 0,
        totalSermons: 1,
        publishedSermons: 1,
        draftSermons: 1,
        totalViews: 1,
        totalLikes: 1,
        totalDownloads: 1,
        totalDuration: 1,
        featuredCount: 1,
        avgViewsPerSermon: {
          $cond: [
            { $gt: ['$publishedSermons', 0] },
            { $divide: ['$totalViews', '$publishedSermons'] },
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
    { $match: { isActive: true, status: 'published' } },
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
  
  // Get series breakdown
  const seriesStats = await this.aggregate([
    { 
      $match: { 
        isActive: true, 
        status: 'published',
        'series.name': { $ne: '' }
      } 
    },
    {
      $group: {
        _id: '$series.name',
        count: { $sum: 1 },
        totalViews: { $sum: '$stats.views' },
        totalLikes: { $sum: '$stats.likes' },
        maxPart: { $max: '$series.part' }
      }
    },
    { $sort: { count: -1 } },
    { $limit: 10 }
  ]);
  
  return {
    overview: stats[0] || {
      totalSermons: 0,
      publishedSermons: 0,
      draftSermons: 0,
      totalViews: 0,
      totalLikes: 0,
      totalDownloads: 0,
      totalDuration: 0,
      featuredCount: 0,
      avgViewsPerSermon: 0,
      totalHours: 0
    },
    categories: categoryStats,
    speakers: speakerStats,
    series: seriesStats
  };
};

// Export the model
module.exports = mongoose.model('Sermon', sermonSchema);

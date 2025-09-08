const mongoose = require('mongoose');

// Song Schema for storing worship songs and lyrics
const songSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 300,
    index: true
  },
  artist: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200,
    index: true
  },
  category: {
    type: String,
    required: true,
    enum: ['hymns', 'contemporary', 'worship', 'seasonal', 'gospel', 'traditional', 'youth', 'children'],
    default: 'contemporary',
    index: true
  },
  subcategory: {
    type: String,
    trim: true,
    maxlength: 100,
    default: ''
  },
  theme: {
    type: String,
    enum: ['praise', 'worship', 'salvation', 'grace', 'love', 'faith', 'hope', 'peace', 'joy', 'thanksgiving', 'christmas', 'easter', 'harvest', 'baptism', 'communion', 'prayer', 'healing', 'guidance', 'comfort', 'evangelism', 'dedication', 'other'],
    default: 'worship'
  },
  season: {
    type: String,
    enum: ['general', 'christmas', 'easter', 'advent', 'lent', 'pentecost', 'harvest', 'new_year', 'other'],
    default: 'general'
  },
  key: {
    signature: {
      type: String,
      required: true,
      trim: true,
      maxlength: 10,
      default: 'C Major'
    },
    capo: {
      type: Number,
      min: 0,
      max: 12,
      default: 0
    }
  },
  tempo: {
    type: String,
    enum: ['slow', 'medium', 'fast', 'ballad', 'moderate', 'upbeat'],
    default: 'medium'
  },
  bpm: {
    type: Number,
    min: 40,
    max: 200,
    default: null
  },
  timeSignature: {
    type: String,
    enum: ['2/4', '3/4', '4/4', '6/8', '9/8', '12/8'],
    default: '4/4'
  },
  duration: {
    minutes: {
      type: Number,
      min: 1,
      max: 60,
      default: 4
    },
    seconds: {
      type: Number,
      min: 0,
      max: 59,
      default: 30
    }
  },
  difficulty: {
    type: String,
    enum: ['easy', 'medium', 'hard', 'beginner', 'intermediate', 'advanced'],
    default: 'medium'
  },
  lyrics: [{
    type: {
      type: String,
      required: true,
      enum: ['verse', 'chorus', 'bridge', 'pre-chorus', 'outro', 'intro', 'tag', 'refrain'],
      default: 'verse'
    },
    label: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50
    },
    text: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000
    },
    order: {
      type: Number,
      required: true,
      min: 1
    }
  }],
  structure: {
    type: String,
    trim: true,
    maxlength: 500,
    default: '',
    // Example: "Verse 1, Chorus, Verse 2, Chorus, Bridge, Chorus x2"
  },
  chords: {
    progression: [{
      type: String,
      trim: true,
      maxlength: 10
    }],
    chart: {
      publicId: String,
      url: String,
      format: {
        type: String,
        enum: ['pdf', 'png', 'jpg', 'jpeg', 'chordpro', 'txt'],
        default: 'pdf'
      },
      size: Number
    }
  },
  media: {
    albumCover: {
      publicId: String,
      url: String,
      width: Number,
      height: Number,
      size: Number
    },
    audio: {
      demo: {
        publicId: String,
        url: String,
        duration: Number,
        size: Number,
        format: String
      },
      backing: {
        publicId: String,
        url: String,
        duration: Number,
        size: Number,
        format: String
      }
    },
    video: {
      publicId: String,
      url: String,
      duration: Number,
      size: Number,
      format: String,
      thumbnail: String
    },
    sheetMusic: {
      publicId: String,
      url: String,
      format: {
        type: String,
        enum: ['pdf', 'png', 'jpg', 'musicxml', 'midi'],
        default: 'pdf'
      },
      size: Number
    }
  },
  external: {
    youtube: {
      url: String,
      videoId: String
    },
    spotify: {
      url: String,
      trackId: String
    },
    ccli: {
      number: String,
      licensed: {
        type: Boolean,
        default: false
      }
    }
  },
  copyright: {
    year: {
      type: Number,
      min: 1800,
      max: new Date().getFullYear() + 10
    },
    owner: {
      type: String,
      trim: true,
      maxlength: 200,
      default: ''
    },
    publisher: {
      type: String,
      trim: true,
      maxlength: 200,
      default: ''
    },
    license: {
      type: String,
      enum: ['public_domain', 'ccli', 'custom', 'restricted', 'original'],
      default: 'original'
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 500,
      default: ''
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
    inspiration: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: ''
    }
  },
  tags: [{
    type: String,
    trim: true,
    lowercase: true,
    maxlength: 50
  }],
  language: {
    type: String,
    enum: ['english', 'kikuyu', 'swahili', 'other'],
    default: 'english'
  },
  translations: [{
    language: {
      type: String,
      required: true
    },
    title: String,
    lyrics: [{
      type: String,
      label: String,
      text: String,
      order: Number
    }]
  }],
  usage: {
    occasions: [{
      type: String,
      enum: ['sunday_service', 'evening_service', 'prayer_meeting', 'youth_service', 'childrens_service', 'wedding', 'funeral', 'baptism', 'communion', 'special_event', 'conference', 'revival', 'worship_night', 'other']
    }],
    frequency: {
      type: String,
      enum: ['weekly', 'monthly', 'seasonal', 'special', 'rarely'],
      default: 'monthly'
    },
    lastUsed: {
      type: Date,
      default: null
    },
    nextScheduled: {
      type: Date,
      default: null
    }
  },
  stats: {
    timesUsed: {
      type: Number,
      default: 0,
      min: 0
    },
    views: {
      type: Number,
      default: 0,
      min: 0
    },
    downloads: {
      type: Number,
      default: 0,
      min: 0
    },
    favorites: {
      type: Number,
      default: 0,
      min: 0
    },
    shares: {
      type: Number,
      default: 0,
      min: 0
    },
    rating: {
      average: {
        type: Number,
        min: 0,
        max: 5,
        default: 0
      },
      count: {
        type: Number,
        min: 0,
        default: 0
      }
    }
  },
  practiceList: {
    included: {
      type: Boolean,
      default: false
    },
    week: {
      type: Date,
      default: null
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'urgent'],
      default: 'medium'
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 500,
      default: ''
    }
  },
  status: {
    type: String,
    enum: ['draft', 'published', 'archived', 'needs_review'],
    default: 'draft',
    index: true
  },
  featured: {
    type: Boolean,
    default: false,
    index: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  approvedAt: {
    type: Date,
    default: null
  },
  metadata: {
    source: {
      type: String,
      enum: ['manual', 'import', 'api', 'migration'],
      default: 'manual'
    },
    importId: {
      type: String,
      default: null
    },
    version: {
      type: Number,
      default: 1,
      min: 1
    },
    isActive: {
      type: Boolean,
      default: true
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
songSchema.index({ title: 1, artist: 1 });
songSchema.index({ category: 1, status: 1 });
songSchema.index({ theme: 1, season: 1 });
songSchema.index({ 'key.signature': 1, difficulty: 1 });
songSchema.index({ featured: 1, status: 1, createdAt: -1 });
songSchema.index({ 'practiceList.included': 1, 'practiceList.week': 1 });
songSchema.index({ 'usage.occasions': 1, 'usage.frequency': 1 });
songSchema.index({ status: 1, 'metadata.isActive': 1, createdAt: -1 });
songSchema.index({ tags: 1 });
songSchema.index({ language: 1, category: 1 });
songSchema.index({ createdBy: 1, createdAt: -1 });

// Compound indexes for complex queries
songSchema.index({ 
  category: 1, 
  difficulty: 1, 
  'key.signature': 1,
  status: 1 
});

songSchema.index({ 
  'practiceList.included': 1,
  'practiceList.week': 1,
  'practiceList.priority': 1
});

// Text search index
songSchema.index({ 
  title: 'text', 
  artist: 'text', 
  'lyrics.text': 'text',
  tags: 'text',
  'copyright.owner': 'text'
}, {
  name: 'song_text_search'
});

// Pre-save middleware
songSchema.pre('save', function(next) {
  // Sort lyrics by order
  if (this.lyrics && this.lyrics.length > 0) {
    this.lyrics.sort((a, b) => a.order - b.order);
  }
  
  // Update version if lyrics changed
  if (this.isModified('lyrics') && !this.isNew) {
    this.metadata.version += 1;
  }
  
  // Set approval fields when status changes to published
  if (this.isModified('status') && this.status === 'published' && !this.approvedAt) {
    this.approvedAt = new Date();
  }
  
  next();
});

// Virtuals
songSchema.virtual('formattedDuration').get(function() {
  return `${this.duration.minutes}:${this.duration.seconds.toString().padStart(2, '0')}`;
});

songSchema.virtual('slug').get(function() {
  return `${this.title}-${this.artist}`.toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-');
});

songSchema.virtual('chordsString').get(function() {
  return this.chords.progression ? this.chords.progression.join(' - ') : '';
});

songSchema.virtual('fullKey').get(function() {
  return this.key.capo > 0 
    ? `${this.key.signature} (Capo ${this.key.capo})`
    : this.key.signature;
});

// Instance methods
songSchema.methods.incrementViews = function() {
  this.stats.views = (this.stats.views || 0) + 1;
  return this.save();
};

songSchema.methods.incrementUsage = function() {
  this.stats.timesUsed = (this.stats.timesUsed || 0) + 1;
  this.usage.lastUsed = new Date();
  return this.save();
};

songSchema.methods.addToFavorites = function() {
  this.stats.favorites = (this.stats.favorites || 0) + 1;
  return this.save();
};

songSchema.methods.removeFromFavorites = function() {
  this.stats.favorites = Math.max(0, (this.stats.favorites || 0) - 1);
  return this.save();
};

songSchema.methods.addToPracticeList = function(week, priority = 'medium', notes = '') {
  this.practiceList = {
    included: true,
    week: week,
    priority: priority,
    notes: notes
  };
  return this.save();
};

songSchema.methods.removeFromPracticeList = function() {
  this.practiceList = {
    included: false,
    week: null,
    priority: 'medium',
    notes: ''
  };
  return this.save();
};

songSchema.methods.updateRating = function(newRating) {
  const currentTotal = this.stats.rating.average * this.stats.rating.count;
  this.stats.rating.count += 1;
  this.stats.rating.average = (currentTotal + newRating) / this.stats.rating.count;
  return this.save();
};

songSchema.methods.publish = function(approvedBy) {
  this.status = 'published';
  this.approvedBy = approvedBy;
  this.approvedAt = new Date();
  return this.save();
};

songSchema.methods.archive = function() {
  this.status = 'archived';
  return this.save();
};

// Static methods
songSchema.statics.getPublished = function(options = {}) {
  const query = { 
    status: 'published', 
    'metadata.isActive': true 
  };
  
  if (options.category) query.category = options.category;
  if (options.theme) query.theme = options.theme;
  if (options.season) query.season = options.season;
  if (options.difficulty) query.difficulty = options.difficulty;
  if (options.language) query.language = options.language;
  
  return this.find(query)
    .sort({ createdAt: -1 })
    .limit(options.limit || 50)
    .skip(options.skip || 0);
};

songSchema.statics.getPracticeList = function(week) {
  const startOfWeek = new Date(week);
  const endOfWeek = new Date(week);
  endOfWeek.setDate(endOfWeek.getDate() + 7);
  
  return this.find({
    'practiceList.included': true,
    'practiceList.week': {
      $gte: startOfWeek,
      $lt: endOfWeek
    },
    status: 'published',
    'metadata.isActive': true
  }).sort({ 'practiceList.priority': 1, title: 1 });
};

songSchema.statics.getFeatured = function(limit = 10) {
  return this.find({
    featured: true,
    status: 'published',
    'metadata.isActive': true
  })
    .sort({ createdAt: -1 })
    .limit(limit);
};

songSchema.statics.searchSongs = function(query, options = {}) {
  const searchQuery = {
    status: 'published',
    'metadata.isActive': true,
    $text: { $search: query }
  };
  
  if (options.category) searchQuery.category = options.category;
  if (options.theme) searchQuery.theme = options.theme;
  if (options.difficulty) searchQuery.difficulty = options.difficulty;
  
  return this.find(searchQuery, { score: { $meta: 'textScore' } })
    .sort({ score: { $meta: 'textScore' }, createdAt: -1 })
    .limit(options.limit || 20);
};

songSchema.statics.getByCategory = function(category, options = {}) {
  return this.find({
    category: category,
    status: 'published',
    'metadata.isActive': true
  })
    .sort({ title: 1 })
    .limit(options.limit || 50);
};

songSchema.statics.getPopular = function(limit = 10) {
  return this.find({
    status: 'published',
    'metadata.isActive': true
  })
    .sort({ 'stats.timesUsed': -1, 'stats.favorites': -1 })
    .limit(limit);
};

songSchema.statics.getRecentlyAdded = function(limit = 10) {
  return this.find({
    status: 'published',
    'metadata.isActive': true
  })
    .sort({ createdAt: -1 })
    .limit(limit);
};

songSchema.statics.getStats = async function() {
  const stats = await this.aggregate([
    { $match: { 'metadata.isActive': true } },
    {
      $group: {
        _id: null,
        totalSongs: { $sum: 1 },
        publishedSongs: {
          $sum: { $cond: [{ $eq: ['$status', 'published'] }, 1, 0] }
        },
        draftSongs: {
          $sum: { $cond: [{ $eq: ['$status', 'draft'] }, 1, 0] }
        },
        totalViews: { $sum: '$stats.views' },
        totalUsage: { $sum: '$stats.timesUsed' },
        totalFavorites: { $sum: '$stats.favorites' },
        featuredCount: { $sum: { $cond: ['$featured', 1, 0] } },
        inPracticeList: {
          $sum: { $cond: ['$practiceList.included', 1, 0] }
        }
      }
    }
  ]);
  
  const categoryStats = await this.aggregate([
    { $match: { 'metadata.isActive': true, status: 'published' } },
    {
      $group: {
        _id: '$category',
        count: { $sum: 1 },
        totalViews: { $sum: '$stats.views' },
        totalUsage: { $sum: '$stats.timesUsed' }
      }
    },
    { $sort: { count: -1 } }
  ]);
  
  return {
    overview: stats[0] || {
      totalSongs: 0,
      publishedSongs: 0,
      draftSongs: 0,
      totalViews: 0,
      totalUsage: 0,
      totalFavorites: 0,
      featuredCount: 0,
      inPracticeList: 0
    },
    categories: categoryStats
  };
};

module.exports = mongoose.model('Song', songSchema);

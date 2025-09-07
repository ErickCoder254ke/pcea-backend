const mongoose = require('mongoose');

// Gallery Schema for storing image metadata
const gallerySchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  description: {
    type: String,
    trim: true,
    maxlength: 1000,
    default: ''
  },
  category: {
    type: String,
    required: true,
    enum: ['Events', 'Services', 'Fellowship', 'Community', 'Youth', 'Children', 'Music', 'Outreach', 'Building', 'Other'],
    default: 'Other'
  },
  tags: [{
    type: String,
    trim: true,
    lowercase: true
  }],
  cloudinary: {
    publicId: {
      type: String,
      required: true,
      unique: true
    },
    url: {
      type: String,
      required: true
    },
    thumbnailUrl: {
      type: String,
      required: true
    },
    width: {
      type: Number,
      default: null
    },
    height: {
      type: Number,
      default: null
    },
    format: {
      type: String,
      default: null
    },
    size: {
      type: Number,
      default: null
    }
  },
  featured: {
    type: Boolean,
    default: false
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
  views: {
    type: Number,
    default: 0
  },
  likes: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes for performance
gallerySchema.index({ category: 1, uploadedAt: -1 });
gallerySchema.index({ featured: 1, uploadedAt: -1 });
gallerySchema.index({ tags: 1 });
gallerySchema.index({ 'cloudinary.publicId': 1 }, { unique: true });
gallerySchema.index({ uploadedBy: 1, uploadedAt: -1 });
gallerySchema.index({ isActive: 1, uploadedAt: -1 });

// Text search index for title and description
gallerySchema.index({ 
  title: 'text', 
  description: 'text', 
  tags: 'text' 
}, {
  name: 'gallery_text_search'
});

// Pre-save middleware to update updatedAt
gallerySchema.pre('save', function(next) {
  if (this.isModified() && !this.isNew) {
    this.updatedAt = new Date();
  }
  next();
});

// Pre-update middleware to update updatedAt
gallerySchema.pre(['findOneAndUpdate', 'updateOne', 'updateMany'], function(next) {
  this.set({ updatedAt: new Date() });
  next();
});

// Virtual for getting optimized thumbnail URL
gallerySchema.virtual('optimizedThumbnailUrl').get(function() {
  if (this.cloudinary && this.cloudinary.publicId) {
    return `https://res.cloudinary.com/dw6646onz/image/upload/c_fill,w_400,h_400,q_auto,f_auto/${this.cloudinary.publicId}`;
  }
  return this.cloudinary?.thumbnailUrl;
});

// Virtual for getting SEO-friendly URL slug
gallerySchema.virtual('slug').get(function() {
  return this.title.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
});

// Method to increment views
gallerySchema.methods.incrementViews = function() {
  this.views = (this.views || 0) + 1;
  return this.save();
};

// Method to toggle like (basic implementation)
gallerySchema.methods.toggleLike = function(increment = true) {
  this.likes = Math.max(0, (this.likes || 0) + (increment ? 1 : -1));
  return this.save();
};

// Static method to get featured images
gallerySchema.statics.getFeatured = function(limit = 5) {
  return this.find({ featured: true, isActive: true })
    .sort({ uploadedAt: -1 })
    .limit(limit);
};

// Static method to get images by category
gallerySchema.statics.getByCategory = function(category, limit = 20) {
  return this.find({ category, isActive: true })
    .sort({ uploadedAt: -1 })
    .limit(limit);
};

// Static method to search images
gallerySchema.statics.searchImages = function(query, options = {}) {
  const searchQuery = {
    isActive: true,
    $text: { $search: query }
  };
  
  if (options.category) {
    searchQuery.category = options.category;
  }
  
  return this.find(searchQuery, { score: { $meta: 'textScore' } })
    .sort({ score: { $meta: 'textScore' }, uploadedAt: -1 })
    .limit(options.limit || 20);
};

// Static method to get gallery statistics
gallerySchema.statics.getStats = async function() {
  const stats = await this.aggregate([
    { $match: { isActive: true } },
    {
      $group: {
        _id: null,
        totalImages: { $sum: 1 },
        totalViews: { $sum: '$views' },
        totalLikes: { $sum: '$likes' },
        featuredCount: {
          $sum: { $cond: ['$featured', 1, 0] }
        },
        categoryCounts: {
          $push: '$category'
        }
      }
    },
    {
      $project: {
        _id: 0,
        totalImages: 1,
        totalViews: 1,
        totalLikes: 1,
        featuredCount: 1,
        avgViewsPerImage: {
          $cond: [
            { $gt: ['$totalImages', 0] },
            { $divide: ['$totalViews', '$totalImages'] },
            0
          ]
        }
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
        totalViews: { $sum: '$views' },
        totalLikes: { $sum: '$likes' }
      }
    },
    { $sort: { count: -1 } }
  ]);
  
  return {
    overview: stats[0] || {
      totalImages: 0,
      totalViews: 0,
      totalLikes: 0,
      featuredCount: 0,
      avgViewsPerImage: 0
    },
    categories: categoryStats
  };
};

// Export the model
module.exports = mongoose.model('Gallery', gallerySchema);

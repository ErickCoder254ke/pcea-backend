const mongoose = require('mongoose');

const prayerRequestSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  description: {
    type: String,
    required: true,
    maxlength: 1000
  },
  requesterName: {
    type: String,
    required: function() {
      return !this.anonymous;
    },
    maxlength: 100
  },
  requesterId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  category: {
    type: String,
    enum: ['healing', 'family', 'work', 'spiritual', 'financial', 'other'],
    default: 'other'
  },
  urgency: {
    type: String,
    enum: ['Normal', 'Urgent', 'Emergency'],
    default: 'Normal'
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  anonymous: {
    type: Boolean,
    default: false
  },
  isPublic: {
    type: Boolean,
    default: true
  },
  moderatorNotes: {
    type: String,
    maxlength: 500
  },
  rejectionReason: {
    type: String,
    maxlength: 500
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  approvedAt: {
    type: Date
  },
  prayerCount: {
    type: Number,
    default: 0
  },
  prayedBy: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    prayedAt: {
      type: Date,
      default: Date.now
    }
  }],
  expiresAt: {
    type: Date,
    default: function() {
      // Default expiry: 30 days from creation
      return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better query performance
prayerRequestSchema.index({ status: 1, createdAt: -1 });
prayerRequestSchema.index({ requesterId: 1, createdAt: -1 });
prayerRequestSchema.index({ category: 1, status: 1 });
prayerRequestSchema.index({ urgency: 1, status: 1 });
prayerRequestSchema.index({ expiresAt: 1 }); // For TTL cleanup

// Virtual for days since creation
prayerRequestSchema.virtual('daysSinceCreated').get(function() {
  return Math.floor((new Date() - this.createdAt) / (1000 * 60 * 60 * 24));
});

// Virtual for days until expiry
prayerRequestSchema.virtual('daysUntilExpiry').get(function() {
  return Math.floor((this.expiresAt - new Date()) / (1000 * 60 * 60 * 24));
});

// Static method to get statistics
prayerRequestSchema.statics.getStatistics = async function() {
  return await this.aggregate([
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        pending: {
          $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
        },
        approved: {
          $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] }
        },
        rejected: {
          $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] }
        },
        totalPrayers: { $sum: '$prayerCount' },
        urgentCount: {
          $sum: { $cond: [{ $eq: ['$urgency', 'Urgent'] }, 1, 0] }
        },
        emergencyCount: {
          $sum: { $cond: [{ $eq: ['$urgency', 'Emergency'] }, 1, 0] }
        }
      }
    }
  ]);
};

// Pre-save middleware
prayerRequestSchema.pre('save', function(next) {
  // Auto-approve non-urgent requests if configured
  if (this.isNew && this.urgency === 'Normal' && this.status === 'pending') {
    // Could add auto-approval logic here based on settings
  }
  
  // Ensure anonymous requests don't have requester name
  if (this.anonymous) {
    this.requesterName = undefined;
  }
  
  next();
});

// Instance method to check if user has prayed for this request
prayerRequestSchema.methods.hasUserPrayed = function(userId) {
  return this.prayedBy.some(prayer => prayer.userId.toString() === userId.toString());
};

// Instance method to add prayer
prayerRequestSchema.methods.addPrayer = function(userId) {
  if (!this.hasUserPrayed(userId)) {
    this.prayedBy.push({ userId, prayedAt: new Date() });
    this.prayerCount += 1;
  }
};

// Instance method to approve request
prayerRequestSchema.methods.approve = function(moderatorId) {
  this.status = 'approved';
  this.approvedBy = moderatorId;
  this.approvedAt = new Date();
};

// Instance method to reject request
prayerRequestSchema.methods.reject = function(reason) {
  this.status = 'rejected';
  this.rejectionReason = reason;
};

module.exports = mongoose.model('PrayerRequest', prayerRequestSchema);

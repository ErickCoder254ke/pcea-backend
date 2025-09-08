const mongoose = require('mongoose');

const prayerPartnerRequestSchema = new mongoose.Schema({
  requester: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  requesterName: {
    type: String,
    required: true
  },
  recipientName: {
    type: String,
    required: true
  },
  message: {
    type: String,
    maxlength: 500,
    trim: true
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'declined', 'expired'],
    default: 'pending'
  },
  requestType: {
    type: String,
    enum: ['specific', 'general'],
    default: 'specific'
  },
  requesterProfile: {
    fellowshipZone: String,
    interests: [String],
    prayerStyle: String,
    preferredTime: String
  },
  recipientProfile: {
    fellowshipZone: String,
    interests: [String],
    prayerStyle: String,
    preferredTime: String
  },
  respondedAt: {
    type: Date
  },
  respondedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  adminNotes: {
    type: String,
    maxlength: 500
  },
  expiresAt: {
    type: Date,
    default: function() {
      // Requests expire after 7 days
      return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better query performance
prayerPartnerRequestSchema.index({ requester: 1, status: 1 });
prayerPartnerRequestSchema.index({ recipient: 1, status: 1 });
prayerPartnerRequestSchema.index({ status: 1, createdAt: -1 });
prayerPartnerRequestSchema.index({ expiresAt: 1 }); // For TTL cleanup

// Ensure a user can only send one request to another user at a time
prayerPartnerRequestSchema.index(
  { requester: 1, recipient: 1, status: 1 },
  { 
    unique: true,
    partialFilterExpression: { status: { $in: ['pending', 'accepted'] } }
  }
);

// Virtual for request age in hours
prayerPartnerRequestSchema.virtual('ageInHours').get(function() {
  return Math.floor((new Date() - this.createdAt) / (1000 * 60 * 60));
});

// Virtual for days until expiry
prayerPartnerRequestSchema.virtual('daysUntilExpiry').get(function() {
  return Math.floor((this.expiresAt - new Date()) / (1000 * 60 * 60 * 24));
});

// Static method to get statistics
prayerPartnerRequestSchema.statics.getStatistics = async function() {
  return await this.aggregate([
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        pending: {
          $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
        },
        accepted: {
          $sum: { $cond: [{ $eq: ['$status', 'accepted'] }, 1, 0] }
        },
        declined: {
          $sum: { $cond: [{ $eq: ['$status', 'declined'] }, 1, 0] }
        },
        expired: {
          $sum: { $cond: [{ $eq: ['$status', 'expired'] }, 1, 0] }
        }
      }
    }
  ]);
};

// Static method to find pending requests for a user
prayerPartnerRequestSchema.statics.findPendingForUser = function(userId) {
  return this.find({
    $or: [
      { requester: userId, status: 'pending' },
      { recipient: userId, status: 'pending' }
    ]
  }).populate('requester recipient', 'name phone fellowshipZone');
};

// Static method to clean up expired requests
prayerPartnerRequestSchema.statics.cleanupExpiredRequests = async function() {
  const result = await this.updateMany(
    { 
      status: 'pending',
      expiresAt: { $lt: new Date() }
    },
    { 
      status: 'expired',
      respondedAt: new Date()
    }
  );
  
  console.log(`🧹 Cleaned up ${result.modifiedCount} expired prayer partner requests`);
  return result;
};

// Pre-save middleware
prayerPartnerRequestSchema.pre('save', function(next) {
  // Ensure user can't request themselves as partner
  if (this.requester.toString() === this.recipient.toString()) {
    const error = new Error('Cannot send prayer partner request to yourself');
    error.name = 'ValidationError';
    return next(error);
  }
  
  next();
});

// Instance method to accept request
prayerPartnerRequestSchema.methods.accept = function(responderId) {
  this.status = 'accepted';
  this.respondedAt = new Date();
  this.respondedBy = responderId;
};

// Instance method to decline request
prayerPartnerRequestSchema.methods.decline = function(responderId) {
  this.status = 'declined';
  this.respondedAt = new Date();
  this.respondedBy = responderId;
};

// Instance method to check if request is still valid
prayerPartnerRequestSchema.methods.isValid = function() {
  return this.status === 'pending' && this.expiresAt > new Date();
};

// Instance method to check if user can respond to this request
prayerPartnerRequestSchema.methods.canUserRespond = function(userId) {
  return this.recipient.toString() === userId.toString() && 
         this.status === 'pending' && 
         this.isValid();
};

module.exports = mongoose.model('PrayerPartnerRequest', prayerPartnerRequestSchema);

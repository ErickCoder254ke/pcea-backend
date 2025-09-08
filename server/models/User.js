const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    minlength: 2,
    maxlength: 100
  },
  phone: {
    type: String,
    required: true,
    unique: true,
    match: /^\d{10}$/
  },
  email: {
    type: String,
    unique: true,
    sparse: true,
    lowercase: true,
    trim: true,
    match: /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/
  },
  password: {
    type: String,
    required: false // Since we use phone-based auth
  },
  profileImage: {
    type: String,
    default: null
  },
  bio: {
    type: String,
    maxlength: 200,
    default: null
  },
  fellowshipZone: {
    type: String,
    default: 'General',
    enum: ['General', 'Youth', 'Men', 'Women', 'Children', 'Teens']
  },
  dateOfBirth: {
    type: Date,
    default: null
  },
  memberSince: {
    type: Date,
    default: Date.now
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  role: {
    type: String,
    enum: ['member', 'admin', 'pastor', 'elder'],
    default: 'member'
  },
  isAdmin: {
    type: Boolean,
    default: false
  },
  fcmTokens: [{
    token: String,
    deviceId: String,
    platform: String,
    lastUsed: {
      type: Date,
      default: Date.now
    }
  }],
  lastLogin: {
    type: Date,
    default: Date.now
  },
  isActive: {
    type: Boolean,
    default: true
  },
  preferences: {
    notifications: {
      announcements: { type: Boolean, default: true },
      events: { type: Boolean, default: true },
      prayerPartners: { type: Boolean, default: true },
      general: { type: Boolean, default: true }
    },
    privacy: {
      profileVisibility: {
        type: String,
        enum: ['public', 'members', 'private'],
        default: 'public'
      },
      phoneVisibility: {
        type: String,
        enum: ['public', 'members', 'private'],
        default: 'members'
      }
    }
  },
  // Prayer Partner fields
  currentPartner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  last_paired_with: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  paired_this_week: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for generated email
userSchema.virtual('generatedEmail').get(function() {
  if (this.email) return this.email;
  return `${this.name?.toLowerCase().replace(/\s+/g, '.')}@pceaturichurch.com`;
});

// Virtual for membership duration in months
userSchema.virtual('membershipDuration').get(function() {
  if (!this.memberSince) return 0;
  return Math.ceil(Math.abs(new Date() - new Date(this.memberSince)) / (1000 * 60 * 60 * 24 * 30));
});

// Virtual for age
userSchema.virtual('age').get(function() {
  if (!this.dateOfBirth) return null;
  return new Date().getFullYear() - new Date(this.dateOfBirth).getFullYear();
});

// Index for better query performance
userSchema.index({ phone: 1 });
userSchema.index({ email: 1 });
userSchema.index({ fellowshipZone: 1 });
userSchema.index({ isActive: 1 });
userSchema.index({ role: 1 });

// Pre-save middleware to handle phone formatting
userSchema.pre('save', function(next) {
  if (this.isModified('phone')) {
    // Remove any non-digit characters
    this.phone = this.phone.replace(/\D/g, '');
  }
  next();
});

// Method to check if user is admin
userSchema.methods.isAdminUser = function() {
  return this.role === 'admin' || this.isAdmin === true;
};

// Method to get safe public profile
userSchema.methods.getPublicProfile = function() {
  return {
    _id: this._id,
    name: this.name,
    fellowshipZone: this.fellowshipZone,
    memberSince: this.memberSince,
    profileImage: this.profileImage,
    bio: this.bio,
    membershipDuration: this.membershipDuration
  };
};

module.exports = mongoose.model('User', userSchema);

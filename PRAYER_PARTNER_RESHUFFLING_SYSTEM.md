# Enhanced Prayer Partner Reshuffling System

## Overview

This document describes the comprehensive prayer partner reshuffling system implemented in the backend server. The system automatically reshuffles prayer partners every week using intelligent algorithms to ensure fair and varied pairings.

## 🚀 **Key Features**

### ✅ **Automated Weekly Reshuffling**

- **Scheduled Task**: Runs every Monday at 6:00 AM
- **Intelligent Algorithm**: Avoids recent pairings and ensures fair rotation
- **History Tracking**: Maintains complete pairing history
- **Automatic Notifications**: Sends personalized notifications to all users

### ✅ **Smart Pairing Algorithm**

- **Compatibility Scoring**: Calculates optimal partnerships
- **Recent Pairing Avoidance**: Prevents users from being paired with recent partners
- **Randomness Factor**: Adds variety while maintaining fairness
- **Odd User Handling**: Gracefully handles uneven number of users

### ✅ **Comprehensive Data Tracking**

- **Partnership History**: Complete record of all past pairings
- **Weekly Statistics**: Tracks pairing effectiveness and coverage
- **User Engagement**: Monitors participation and activity
- **Notification Analytics**: Tracks notification delivery success

## 📊 **Database Schema**

### **PrayerPartnership Model**

```javascript
{
  user1: ObjectId,              // First user in the partnership
  user2: ObjectId,              // Second user in the partnership
  pairDate: Date,               // When the partnership was created
  weekNumber: Number,           // Week number of the year (1-52)
  year: Number,                 // Year of the partnership
  isActive: Boolean,            // Whether this partnership is currently active
  notes: String,                // Additional notes or comments
  createdAt: Date              // Timestamp of creation
}
```

### **Enhanced User Model**

```javascript
{
  // Existing fields...
  currentPartner: ObjectId,     // Reference to current prayer partner
  // Other fields...
}
```

## 🔄 **Reshuffling Process**

### **1. Initialization (Every Monday 6 AM)**

```javascript
// Cron job schedule
cron.schedule("0 6 * * 1", async () => {
  await reshufflePrayerPartners();
});
```

### **2. Data Preparation**

- Get all active users from database
- Deactivate previous week's partnerships
- Load recent pairing history (last 2 weeks)
- Calculate current week number and year

### **3. Smart Pairing Algorithm**

```javascript
function calculatePairingScore(user1, user2, pairingHistory) {
  let score = 100; // Base compatibility score

  // Penalty for recent pairings
  const pairKey = `${user1._id}_${user2._id}`;
  if (pairingHistory.has(pairKey)) {
    const weeksSinceLastPairing = currentWeek - lastPairedWeek;
    if (weeksSinceLastPairing < 4) {
      score -= (4 - weeksSinceLastPairing) * 25;
    }
  }

  // Add randomness for variety
  score += Math.random() * 10;

  return score;
}
```

### **4. Partnership Creation**

- Create optimal pairs using compatibility scores
- Save new partnerships to database
- Update user currentPartner fields
- Handle odd user gracefully

### **5. Notification System**

- Send personalized notifications to all paired users
- Store notifications in database for history
- Track delivery success and failures
- Include partner information in notifications

## 📱 **API Endpoints**

### **Get Current Prayer Partner**

```http
GET /api/user/prayer-partner
Authorization: Bearer <token>
```

**Response:**

```json
{
  "success": true,
  "data": {
    "currentPartner": {
      "id": "user_id",
      "name": "Partner Name",
      "phone": "+254...",
      "memberSince": "2024-01-01T00:00:00.000Z",
      "pairDate": "2024-12-07T06:00:00.000Z",
      "weekNumber": 49,
      "year": 2024
    },
    "user": {
      "id": "current_user_id",
      "name": "User Name",
      "phone": "+254..."
    },
    "prayerHistory": [...],
    "statistics": {
      "totalPastPartnerships": 5,
      "currentWeek": 49,
      "currentYear": 2024
    }
  }
}
```

### **Get All Prayer Partnerships**

```http
GET /api/prayer-partnerships
Authorization: Bearer <token>
```

**Response:**

```json
{
  "success": true,
  "data": {
    "activePartnerships": [...],
    "unpairedUsers": [...],
    "statistics": {
      "totalPairs": 15,
      "totalPairedUsers": 30,
      "totalUnpairedUsers": 1,
      "currentWeek": 49,
      "currentYear": 2024,
      "nextReshuffleDate": "2024-12-16T06:00:00.000Z"
    }
  }
}
```

### **Manual Reshuffle (Admin)**

```http
POST /api/admin/reshuffle-prayer-partners
Authorization: Bearer <admin_token>
```

### **Prayer Partner Statistics (Admin)**

```http
GET /api/admin/prayer-partner-stats
Authorization: Bearer <admin_token>
```

## 🧠 **Intelligent Algorithm Details**

### **Compatibility Scoring System**

1. **Base Score**: 100 points for all potential pairs
2. **Recent Pairing Penalty**: -25 points per week if paired within last 4 weeks
3. **Randomness Factor**: +0 to +10 points for variety
4. **Self-Pairing Prevention**: -1000 points (safety check)

### **Pairing Optimization**

```javascript
async function createOptimalPairs(users, pairingHistory) {
  const pairs = [];
  const usedUsers = new Set();

  for (let user1 of shuffledUsers) {
    if (usedUsers.has(user1._id)) continue;

    let bestPartner = null;
    let bestScore = -1;

    for (let user2 of remainingUsers) {
      const score = calculatePairingScore(user1, user2, pairingHistory);
      if (score > bestScore) {
        bestScore = score;
        bestPartner = user2;
      }
    }

    if (bestPartner) {
      pairs.push({ user1, user2: bestPartner, score: bestScore });
      usedUsers.add(user1._id);
      usedUsers.add(bestPartner._id);
    }
  }

  return pairs;
}
```

## 📊 **Analytics and Monitoring**

### **Automatic Logging**

- Partnership creation success/failure
- User pairing coverage percentage
- Notification delivery statistics
- Algorithm performance metrics

### **Weekly Statistics**

```javascript
const stats = {
  week: 49,
  year: 2024,
  totalPairs: 15,
  totalUsersInvolved: 30,
  averageCompatibilityScore: 87.5,
  notificationSuccessRate: "95%",
  timestamp: "2024-12-07T06:00:00.000Z",
};
```

## 🔔 **Notification System**

### **Personalized Messages**

```javascript
const message = {
  notification: {
    title: "New Prayer Partner Assigned! 🙏",
    body: `You've been paired with ${partnerName} for this week. Let's pray together!`,
  },
  data: {
    type: "prayer_partner_update",
    weekNumber: "49",
    partnerId: "partner_id",
    partnerName: "Partner Name",
    timestamp: "2024-12-07T06:00:00.000Z",
  },
};
```

### **Notification Features**

- **Cross-platform**: Web and mobile notifications
- **Database Storage**: All notifications stored for history
- **Delivery Tracking**: Success/failure monitoring
- **Personalization**: Each user gets partner-specific message

## ⚙️ **Configuration Options**

### **Cron Schedule**

```javascript
// Default: Every Monday at 6 AM
cron.schedule("0 6 * * 1", reshufflePrayerPartners);

// Alternative schedules:
// Every Sunday at midnight: "0 0 * * 0"
// Every day at 6 AM: "0 6 * * *"
// Every hour (testing): "0 * * * *"
```

### **Algorithm Parameters**

```javascript
const CONFIG = {
  RECENT_PAIRING_WEEKS: 4, // Avoid pairings within this timeframe
  RECENT_PAIRING_PENALTY: 25, // Score penalty per week
  RANDOMNESS_FACTOR: 10, // Maximum random score addition
  BASE_COMPATIBILITY_SCORE: 100, // Starting score for all pairs
};
```

## 🛠️ **Administration Features**

### **Manual Controls**

- **Force Reshuffle**: Admin can trigger reshuffling anytime
- **View Statistics**: Comprehensive analytics dashboard
- **Pairing History**: Complete historical data access
- **User Management**: Add/remove users from pairing pool

### **Monitoring Dashboard**

- Real-time pairing statistics
- User engagement metrics
- Notification delivery rates
- System health monitoring

## 🚀 **Performance Optimization**

### **Database Indexes**

```javascript
// Compound indexes for efficient queries
prayerPartnershipSchema.index(
  {
    user1: 1,
    user2: 1,
    weekNumber: 1,
    year: 1,
  },
  { unique: true },
);

prayerPartnershipSchema.index({
  weekNumber: 1,
  year: 1,
  isActive: 1,
});
```

### **Query Optimization**

- Efficient partnership lookups
- Bulk database operations
- Minimal API calls for notifications
- Cached user data where appropriate

## 🔒 **Security Considerations**

### **Authentication**

- All endpoints require valid JWT tokens
- Admin endpoints require elevated permissions
- User data access restricted to authorized users

### **Data Privacy**

- User phone numbers masked in logs
- Notification content excludes sensitive data
- Partnership history limited to necessary fields

## 📈 **Future Enhancements**

### **Potential Improvements**

- **User Preferences**: Allow users to set pairing preferences
- **Group Prayers**: Support for prayer groups (3+ people)
- **Specialized Matching**: Pair based on age, interests, or zones
- **Prayer Tracking**: Monitor prayer activity and engagement
- **Feedback System**: Allow users to rate prayer partnerships

### **Advanced Analytics**

- **Engagement Scoring**: Track prayer activity levels
- **Satisfaction Metrics**: Measure partnership effectiveness
- **Predictive Pairing**: Use ML for optimal matching
- **Geographic Considerations**: Factor in location for local meetups

## 🧪 **Testing Features**

### **Development Tools**

```javascript
// Test manual reshuffle
POST / api / admin / reshuffle - prayer - partners;

// Get detailed statistics
GET / api / admin / prayer - partner - stats;

// Check current partnerships
GET / api / prayer - partnerships;
```

### **Logging and Debugging**

- Comprehensive console logging
- Error tracking and reporting
- Performance metrics collection
- Database operation monitoring

---

**Status**: ✅ Production Ready
**Last Updated**: December 2024
**Version**: 1.0 - Enhanced Reshuffling System
**Maintenance**: Automated with monitoring

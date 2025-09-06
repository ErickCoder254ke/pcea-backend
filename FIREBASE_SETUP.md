# Backend Firebase Setup Guide

## Firebase Admin SDK Configuration

Your backend needs Firebase Admin SDK credentials to send push notifications. Here's how to set it up:

### Step 1: Get Firebase Admin Service Account Key

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project: **churchapp-3efc3**
3. Go to **Project Settings** (gear icon)
4. Navigate to **Service Accounts** tab
5. Click **Generate new private key**
6. Download the JSON file

### Step 2: Configure Backend (Choose One Method)

#### Method A: Environment Variable (Recommended for Production)

1. Copy the entire content of your downloaded JSON file
2. In your `.env` file, add:

```env
FIREBASE_SERVICE_ACCOUNT={"type":"service_account","project_id":"churchapp-3efc3",...entire JSON here...}
```

#### Method B: File-based (For Development)

1. Rename the downloaded file to `firebase-admin-key.json`
2. Place it in your backend root directory
3. Make sure it's in your `.gitignore` file

### Step 3: Environment Variables

Create a `.env` file in your backend directory with these variables:

```env
# Required
MONGO_URI=your-mongodb-connection-string
JWT_SECRET=your-jwt-secret-key
PORT=3000
NODE_ENV=development

# Firebase (choose one method above)
FIREBASE_SERVICE_ACCOUNT=your-service-account-json

# Optional
CORS_ORIGIN=http://localhost:5173,http://localhost:3000
```

### Step 4: Install Dependencies

Make sure you have all required dependencies:

```bash
npm install express cors mongoose bcryptjs jsonwebtoken dotenv helmet express-rate-limit node-cron firebase-admin
```

### Step 5: Test the Setup

1. Start your server: `npm start` or `node server.js`
2. Check the console for: `✅ Firebase Admin SDK initialized successfully`
3. Test the health endpoint: `GET /health`

## API Endpoints for Firebase Notifications

### Update FCM Token

```
POST /api/user/update-fcm-token
Authorization: Bearer <token>
Content-Type: application/json

{
  "fcmToken": "your-fcm-token",
  "platform": "web|native|android|ios",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### Send Test Notification

```
POST /api/test-notification
Authorization: Bearer <token>
Content-Type: application/json

{
  "token": "target-fcm-token",
  "title": "Test Title",
  "body": "Test message"
}
```

### Send Bulk Notifications

```
POST /api/notifications/send
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "Notification Title",
  "body": "Notification message",
  "data": {
    "type": "announcement",
    "custom": "data"
  },
  "targetUsers": ["userId1", "userId2"] // Optional
}
```

### Get FCM Statistics

```
GET /api/admin/fcm-stats
Authorization: Bearer <token>
```

## Database Schema Updates

The User schema now includes:

```javascript
{
  fcmToken: String,
  fcmTokenPlatform: String, // 'web', 'native', 'android', 'ios'
  fcmTokenUpdated: Date,
  lastLogin: Date,
  createdAt: Date
}
```

## Testing Checklist

- [ ] Firebase Admin SDK initializes without errors
- [ ] Health endpoint returns Firebase connection status
- [ ] FCM token update endpoint works
- [ ] Test notification endpoint sends notifications
- [ ] Bulk notification endpoint works with multiple tokens
- [ ] Invalid tokens are cleaned up from database
- [ ] Rate limiting works correctly
- [ ] Error handling provides useful feedback

## Common Issues & Solutions

### "Firebase Admin SDK not initialized"

- Check your service account JSON is valid
- Verify environment variables are loaded correctly
- Ensure the JSON format is correct (no extra spaces/characters)

### "Invalid FCM token" errors

- These are normal - invalid tokens are automatically cleaned from database
- Check that frontend is generating tokens correctly
- Verify VAPID key matches between frontend and Firebase project

### CORS errors

- Update `CORS_ORIGIN` environment variable
- Add your frontend URLs to the allowed origins list

### Rate limiting issues

- Adjust rate limits in environment variables
- Check if requests are being made too frequently

## Production Deployment

For Glitch deployment:

1. Set environment variables in Glitch dashboard
2. Upload service account as environment variable (not file)
3. Ensure MongoDB connection string is correct
4. Set `NODE_ENV=production`
5. Update CORS origins to include your production frontend URL

## Security Considerations

- Never commit service account keys to version control
- Use environment variables for all sensitive data
- Implement proper rate limiting
- Validate all inputs
- Use HTTPS in production
- Regularly rotate JWT secrets

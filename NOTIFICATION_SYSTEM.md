# PCEA Turi Church Notification System

## Overview

Production-ready notification system for sending push notifications to church app users from the terminal/backend.

## Features

✅ **Terminal/CLI Notification Sending**  
✅ **Firebase Cloud Messaging (FCM) Integration**  
✅ **Database Storage of Notifications**  
✅ **Token Management & Cleanup**  
✅ **Multiple Notification Types**  
✅ **User Authentication**  
✅ **Rate Limiting**  
✅ **Error Handling & Retry Logic**

## Quick Start

### 1. Send a Quick Notification

```bash
# Simple message
npm run notify "Service starts in 30 minutes"

# Custom notification
npm run send-notification "Sunday Service" "Worship begins at 9 AM" "service"
```

### 2. Available Commands

```bash
# Quick notification with auto-generated title
npm run notify "Your message here"

# Full control notification
npm run send-notification "Title" "Message" "type"

# Send test notification
npm run send-test
```

## CLI Usage

### Basic Usage

```bash
node send-notification-cli.js "Title" "Message" [type]
```

### Examples

```bash
# Sunday service reminder
node send-notification-cli.js "Sunday Service" "Worship begins at 9 AM" "service"

# Prayer meeting notice
node send-notification-cli.js "Prayer Meeting" "Join us for evening prayers" "prayer"

# General announcement
node send-notification-cli.js "Church Announcement" "Important update for all members"

# Youth event
node send-notification-cli.js "Youth Event" "Youth meeting tonight at 7 PM" "event"
```

### Notification Types

- `announcement` (default) - General church announcements
- `prayer` - Prayer meetings and requests
- `service` - Church services and worship
- `event` - Special events and activities
- `reminder` - Important reminders
- `general` - General notifications

## API Endpoints

### 1. CLI Notification Endpoint

```bash
POST /api/cli/send-notification
```

**Headers:** `Content-Type: application/json`

**Body:**

```json
{
  "title": "Notification Title",
  "body": "Notification message",
  "type": "announcement",
  "apiKey": "church-cli-2024"
}
```

**Response:**

```json
{
  "success": true,
  "message": "CLI notification sent successfully",
  "stats": {
    "totalTargets": 25,
    "successCount": 23,
    "failureCount": 2,
    "cleanedTokens": 2,
    "storedInDB": 25
  }
}
```

### 2. User Notifications (Frontend)

```bash
GET /api/user/notifications
```

**Headers:** `Authorization: Bearer <token>`

### 3. Simple Test Endpoint

```bash
POST /api/simple-notification-test
```

**Body:**

```json
{
  "title": "Test Title",
  "body": "Test message"
}
```

## Configuration

### Environment Variables

```bash
# Required
MONGO_URI=mongodb://...
JWT_SECRET=your_jwt_secret
FIREBASE_SERVICE_ACCOUNT={"type":"service_account",...}

# Optional
CLI_API_KEY=church-cli-2024  # Default API key for CLI access
NODE_ENV=production
```

### Glitch Setup

1. Add environment variables in Glitch `.env` file
2. Ensure Firebase service account is properly configured
3. Run notifications from Glitch terminal

## Firebase Configuration

### 1. Service Account Setup

Your `FIREBASE_SERVICE_ACCOUNT` environment variable should contain:

```json
{
  "type": "service_account",
  "project_id": "your-project-id",
  "private_key_id": "...",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...",
  "client_email": "firebase-adminsdk-...@your-project.iam.gserviceaccount.com",
  "client_id": "...",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token"
}
```

### 2. Frontend Token Registration

Users must have the app installed and logged in to receive notifications.

## Monitoring & Status

### Check System Health

```bash
curl https://your-glitch-app.glitch.me/health
```

### Check FCM Status

```bash
curl https://your-glitch-app.glitch.me/api/fcm-status
```

### Debug Information

```bash
curl https://your-glitch-app.glitch.me/api/debug
```

## Troubleshooting

### Common Issues

#### 1. "No FCM tokens found"

**Cause:** Users haven't logged into the app  
**Solution:** Ensure users have the app installed and logged in

#### 2. "Firebase Admin SDK not initialized"

**Cause:** Missing or invalid Firebase configuration  
**Solution:** Check `FIREBASE_SERVICE_ACCOUNT` environment variable

#### 3. "Invalid API key for CLI access"

**Cause:** Wrong or missing API key  
**Solution:** Use correct API key or set `CLI_API_KEY` environment variable

#### 4. High failure rate

**Cause:** Expired or invalid FCM tokens  
**Solution:** System automatically cleans up invalid tokens

### Debug Commands

```bash
# Check if backend is running
curl https://your-app.glitch.me/health

# Check Firebase status
curl https://your-app.glitch.me/api/fcm-status

# Test simple notification
curl -X POST https://your-app.glitch.me/api/simple-notification-test \
  -H "Content-Type: application/json" \
  -d '{"title":"Test","body":"Test message"}'
```

## Production Usage

### Best Practices

1. **Use appropriate notification types** for better organization
2. **Monitor success rates** to ensure good delivery
3. **Keep messages concise** and clear
4. **Test notifications** before sending to all users
5. **Use rate limiting** to avoid spam

### Security

- API key authentication for CLI access
- User authentication for notification retrieval
- Rate limiting on notification endpoints
- Automatic cleanup of invalid tokens

### Performance

- Batch notification sending for efficiency
- Database storage for notification history
- Automatic token cleanup for maintenance
- Error handling with retry logic

## Support

### Getting Help

1. Check backend logs in Glitch console
2. Use debug endpoints for system status
3. Monitor Firebase Console for delivery stats
4. Check network connectivity for CLI commands

### Contact

For technical support, check the Glitch backend logs and Firebase Console for detailed error information.

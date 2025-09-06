# Correct cURL Commands for Testing Notifications

## Problem with Previous Command

The command you tried was missing required authentication and headers:

```bash
curl -X POST https://pcea-backend-1.onrender.com/api/notifications/send
```

## Easy Testing Solution

I've added a simple test endpoint that doesn't require authentication:

### 1. Check FCM Status First

```bash
curl https://pcea-backend-1.onrender.com/api/fcm-status
```

This shows how many users have FCM tokens and if Firebase is connected.

### 2. Send Simple Test Notification (No Auth Required)

```bash
curl -X POST https://pcea-backend-1.onrender.com/api/simple-notification-test \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Server Test",
    "body": "Testing notifications from Glitch terminal!",
    "testMode": true
  }'
```

## Full Authentication Flow (For Production Use)

### 1. Register a Test User

```bash
curl -X POST https://pcea-backend-1.onrender.com/api/user/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Admin",
    "phone": "admin123",
    "password": "testpassword123"
  }'
```

### 2. Login to Get Token

```bash
curl -X POST https://pcea-backend-1.onrender.com/api/user/login \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "admin123",
    "password": "testpassword123"
  }'
```

### 3. Use Token for Authenticated Requests

```bash
curl -X POST https://pcea-backend-1.onrender.com/api/notifications/send \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN_HERE" \
  -d '{
    "title": "Authenticated Test",
    "body": "This notification was sent with authentication!"
  }'
```

## Quick One-Liner Test

To test everything quickly:

```bash
# Check status
curl https://pcea-backend-1.onrender.com/api/fcm-status

# Send test notification
curl -X POST https://pcea-backend-1.onrender.com/api/simple-notification-test \
  -H "Content-Type: application/json" \
  -d '{"title":"Quick Test","body":"Testing from terminal!","testMode":true}'
```

## Troubleshooting

### If you get "No FCM tokens found"

- Make sure users have logged into the frontend app
- Check that FCM tokens are being generated in the frontend
- Verify Firebase configuration in both frontend and backend

### If you get "Firebase Admin SDK not initialized"

- Check your environment variables in Glitch
- Verify the FIREBASE_SERVICE_ACCOUNT variable is set correctly
- Check the server logs for Firebase initialization errors

### If notifications don't appear

- Check that the frontend app has notification permissions
- Verify VAPID key matches between frontend and Firebase project
- Make sure the app is running in foreground (for testing)

## Expected Response

Successful notification:

```json
{
  "success": true,
  "message": "Simple notification test completed",
  "stats": {
    "totalTokens": 2,
    "successCount": 2,
    "failureCount": 0
  },
  "note": "This is a test endpoint. Use authenticated endpoints for production."
}
```

Error response:

```json
{
  "success": false,
  "message": "No FCM tokens found in database"
}
```

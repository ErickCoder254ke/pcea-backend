# ✅ WORKING CURL COMMANDS

## The Problem with Your Command

Your command was incomplete:

```bash
curl -X POST https://pcea-backend-1.onrender.com/api/simple-notification-test \
```

You're missing the request body and headers!

## ✅ COMPLETE WORKING COMMANDS

### 1. Simple Test (Copy & Paste This Exact Command)

```bash
curl -X POST https://pcea-backend-1.onrender.com/api/simple-notification-test -H "Content-Type: application/json" -d '{"title":"Test from Terminal","body":"Hello from Glitch!"}'
```

### 2. Alternative Format (Multi-line for readability)

```bash
curl -X POST https://pcea-backend-1.onrender.com/api/simple-notification-test \
-H "Content-Type: application/json" \
-d '{
  "title": "Test from Terminal",
  "body": "Hello from Glitch!",
  "testMode": true
}'
```

### 3. Even Simpler (Uses Default Values)

```bash
curl -X POST https://pcea-backend-1.onrender.com/api/simple-notification-test -H "Content-Type: application/json" -d '{}'
```

## First, Check Your Setup

### Check Server Health

```bash
curl https://pcea-backend-1.onrender.com/health
```

### Check FCM Status

```bash
curl https://pcea-backend-1.onrender.com/api/fcm-status
```

## Expected Responses

### ✅ Success Response

```json
{
  "success": true,
  "message": "Simple notification test completed successfully",
  "stats": {
    "totalTokens": 1,
    "successCount": 1,
    "failureCount": 0
  },
  "notification": {
    "title": "Test from Terminal",
    "body": "Hello from Glitch!"
  }
}
```

### ❌ No Tokens Available

```json
{
  "success": false,
  "message": "No FCM tokens found in database",
  "debug": {
    "totalUsers": 0,
    "usersWithTokens": 0,
    "suggestion": "Make sure users have logged into the frontend app to generate FCM tokens"
  }
}
```

### ❌ Firebase Not Connected

```json
{
  "success": false,
  "message": "Firebase Admin SDK not initialized",
  "debug": "Check FIREBASE_SERVICE_ACCOUNT environment variable"
}
```

## Troubleshooting Steps

1. **Copy the exact command from above** - don't modify it
2. **Check that you have FCM tokens** - users need to log into your frontend app first
3. **Verify Firebase setup** - check environment variables in Glitch
4. **Check server logs** - look at Glitch console for error messages

## Important Notes

- The endpoint now uses default values if you don't provide title/body
- It includes detailed debug information
- It works without authentication for testing
- Make sure at least one user has used your frontend app to generate an FCM token

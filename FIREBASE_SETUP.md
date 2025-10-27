# Firebase Setup Guide

## Current Issues & Solutions

### 1. Enable Anonymous Authentication

**Error:** `auth/configuration-not-found`

**Solution:**
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select project: **bomb-16743**
3. Navigate to **Authentication** → **Sign-in method**
4. Find **Anonymous** provider
5. Click and toggle **Enable**
6. Click **Save**

### 2. Enable Email/Password Authentication

**For email/password login to work:**
1. In **Authentication** → **Sign-in method**
2. Find **Email/Password** provider
3. Click and toggle **Enable**
4. Click **Save**

### 3. Enable Google Sign-In

**For Google login to work:**
1. In **Authentication** → **Sign-in method**
2. Find **Google** provider
3. Click and toggle **Enable**
4. Enter your **Project support email**
5. Click **Save**

### 4. Add Authorized Domain

**Error:** "The current domain is not authorized for OAuth operations"

**Solution:**
1. In **Authentication** → **Settings** → **Authorized domains**
2. Click **Add domain**
3. Add: `virgileallix.github.io`
4. Click **Add**

### 5. Configure Realtime Database Security Rules

**Error:** `Permission denied`

**Solution:**
1. Go to **Realtime Database** in Firebase Console
2. Click on **Rules** tab
3. Replace the rules with the content from `database.rules.json`:

```json
{
  "rules": {
    ".read": "auth != null",
    ".write": "auth != null",

    "rooms": {
      "$roomCode": {
        ".read": true,
        ".write": "auth != null",

        "players": {
          "$playerId": {
            ".write": "auth.uid == $playerId || data.parent().child('host').val() == auth.uid"
          }
        },

        "gameState": {
          ".write": "root.child('rooms').child($roomCode).child('status').val() == 'playing'"
        }
      }
    },

    "presence": {
      "$userId": {
        ".read": true,
        ".write": "auth.uid == $userId"
      }
    },

    "globalChat": {
      ".read": true,
      ".write": "auth != null"
    }
  }
}
```

4. Click **Publish**

### 6. Configure Firestore Security Rules

**Solution:**
1. Go to **Firestore Database** in Firebase Console
2. Click on **Rules** tab
3. Replace the rules with the content from `firestore.rules`:

```
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {

    // Users collection
    match /users/{userId} {
      allow read: if true;
      allow create: if request.auth != null && request.auth.uid == userId;
      allow update: if request.auth != null && request.auth.uid == userId;
      allow delete: if false;
    }

    // Matches collection
    match /matches/{matchId} {
      allow read: if true;
      allow create: if request.auth != null;
      allow update: if false;
      allow delete: if false;
    }
  }
}
```

4. Click **Publish**

## Authentication Features

Your Bomberman app now supports **three login methods**:

### 1. Google Sign-In
- One-click authentication with Google account
- Automatically uses Google display name and photo
- Best for returning players

### 2. Email/Password
- Traditional account creation
- Custom username selection
- Secure password (min 6 characters)

### 3. Guest Mode (Anonymous)
- Play without creating an account
- Progress not saved between sessions
- Quick way to try the game

## Testing Your Setup

After completing all steps:

1. Refresh your application at `https://virgileallix.github.io/bomberman/`
2. You should see a login modal with all three options
3. Try signing in with any method
4. Check that you can:
   - Create rooms
   - Join rooms
   - Send chat messages
   - View leaderboard

## Security Rules Explanation

### Realtime Database Rules
- **Public Read on Rooms:** Anyone can see available rooms (for lobby)
- **Authenticated Write:** Only logged-in users can create/modify data
- **Player Protection:** Players can only modify their own data
- **Host Control:** Room hosts have additional permissions

### Firestore Rules
- **Public User Profiles:** Anyone can read user profiles (for leaderboard)
- **Self-Update Only:** Users can only update their own profile
- **Match History:** Anyone can read matches, only authenticated users can create

## Troubleshooting

### Still getting permission errors?
- Wait 1-2 minutes after publishing rules for them to propagate
- Check Firebase Console → Realtime Database → Data tab to verify structure
- Check browser console for specific error messages

### Authentication not working?
- Verify all three auth methods are enabled
- Check that authorized domain is added correctly
- Clear browser cache and try again

### Can't deploy rules?
- Make sure you're logged into the correct Firebase project
- Verify you have Owner or Editor permissions on the project

## Next Steps

Once everything is working:

1. Test all authentication methods
2. Test creating and joining rooms
3. Test the game functionality
4. Monitor Firebase Console for any errors
5. Consider setting up Firebase Analytics for usage tracking

## Support

If you encounter issues:
1. Check Firebase Console → Usage tab for quota limits
2. Review browser console for detailed error messages
3. Check Firebase Console → Authentication → Users to verify users are being created
4. Review Firebase Console → Realtime Database → Data to verify data is being written

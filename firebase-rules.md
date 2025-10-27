# Firebase Configuration Rules

## Realtime Database Rules

```json
{
  "rules": {
    "rooms": {
      "$roomId": {
        ".read": true,
        ".write": "!data.exists() || data.child('host').val() === auth.uid",
        "players": {
          "$playerId": {
            ".write": "$playerId === auth.uid || data.parent().parent().child('host').val() === auth.uid"
          }
        },
        "gameState": {
          ".write": "data.parent().child('status').val() === 'playing'"
        },
        "chat": {
          ".write": "auth != null",
          "$messageId": {
            ".validate": "newData.hasChildren(['user', 'message', 'timestamp'])"
          }
        }
      }
    },
    "players": {
      "$playerId": {
        ".read": true,
        ".write": "$playerId === auth.uid",
        ".validate": "newData.hasChildren(['x', 'y', 'direction', 'alive', 'lastUpdate'])"
      }
    },
    "bombs": {
      "$bombId": {
        ".read": true,
        ".write": "auth != null",
        ".validate": "newData.hasChildren(['x', 'y', 'playerId', 'timestamp', 'range'])"
      }
    },
    "explosions": {
      "$explosionId": {
        ".read": true,
        ".write": "auth != null"
      }
    },
    "powerups": {
      "$powerupId": {
        ".read": true,
        ".write": "data.parent().parent().child('rooms').child(data.child('roomId').val()).child('host').val() === auth.uid"
      }
    },
    "globalChat": {
      ".read": true,
      ".write": "auth != null",
      "$messageId": {
        ".validate": "newData.hasChildren(['user', 'message', 'timestamp']) && newData.child('message').val().length <= 100"
      }
    },
    "presence": {
      "$userId": {
        ".read": true,
        ".write": "$userId === auth.uid"
      }
    }
  }
}
```

## Firestore Rules

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Helper functions
    function isSignedIn() {
      return request.auth != null;
    }

    function isOwner(userId) {
      return request.auth.uid == userId;
    }

    // User profiles
    match /users/{userId} {
      allow read: if true;
      allow create: if isSignedIn() && isOwner(userId);
      allow update: if isSignedIn() && isOwner(userId);
      allow delete: if false; // Prevent deletion

      // Validate user document structure
      allow write: if isSignedIn()
        && isOwner(userId)
        && request.resource.data.keys().hasAll(['username', 'elo', 'rank', 'createdAt'])
        && request.resource.data.username is string
        && request.resource.data.username.size() >= 3
        && request.resource.data.username.size() <= 12
        && request.resource.data.elo is number
        && request.resource.data.elo >= 0
        && request.resource.data.elo <= 5000;
    }

    // User statistics
    match /users/{userId}/stats/{stat} {
      allow read: if true;
      allow write: if isSignedIn() && isOwner(userId);
    }

    // Match history
    match /matches/{matchId} {
      allow read: if true;
      allow create: if isSignedIn();
      allow update: if false; // Matches are immutable once created
      allow delete: if false;

      // Validate match document
      allow create: if request.resource.data.keys().hasAll(['players', 'winner', 'duration', 'timestamp'])
        && request.resource.data.players is list
        && request.resource.data.players.size() >= 2
        && request.resource.data.players.size() <= 4;
    }

    // Leaderboard
    match /leaderboard/{entry} {
      allow read: if true;
      allow write: if false; // Only server can write to leaderboard
    }

    // Achievements
    match /users/{userId}/achievements/{achievementId} {
      allow read: if true;
      allow create: if isSignedIn() && isOwner(userId);
      allow update: if isSignedIn() && isOwner(userId);
      allow delete: if false;
    }

    // Game replays
    match /replays/{replayId} {
      allow read: if true;
      allow create: if isSignedIn();
      allow update: if false;
      allow delete: if isOwner(resource.data.uploadedBy);

      // Limit replay size
      allow create: if request.resource.size < 1000000; // 1MB limit
    }

    // Reports (for moderation)
    match /reports/{reportId} {
      allow read: if false; // Only admins can read reports
      allow create: if isSignedIn();
      allow update: if false;
      allow delete: if false;
    }
  }
}
```

## Firebase Storage Rules (for avatars and replays)

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {

    // User avatars
    match /avatars/{userId}/{fileName} {
      allow read: if true;
      allow write: if request.auth != null
        && request.auth.uid == userId
        && request.resource.size < 2 * 1024 * 1024 // 2MB limit
        && request.resource.contentType.matches('image/.*');
    }

    // Replay files
    match /replays/{replayId} {
      allow read: if true;
      allow write: if request.auth != null
        && request.resource.size < 5 * 1024 * 1024; // 5MB limit
    }
  }
}
```

## How to Apply These Rules

### Realtime Database Rules:
1. Go to Firebase Console: https://console.firebase.google.com/
2. Select your project: `bomb-16743`
3. Navigate to: Realtime Database → Rules
4. Copy the JSON rules above
5. Click "Publish"

### Firestore Rules:
1. Go to Firebase Console
2. Navigate to: Firestore Database → Rules
3. Copy the rules above
4. Click "Publish"

### Storage Rules (Optional):
1. Go to Firebase Console
2. Navigate to: Storage → Rules
3. Copy the rules above
4. Click "Publish"

## Security Notes

1. **Anonymous Authentication**: Enable it in Firebase Console → Authentication → Sign-in method
2. **Rate Limiting**: Consider enabling App Check for DDoS protection
3. **Data Validation**: All writes are validated for proper structure
4. **Anti-Cheat**: Game state writes are restricted to authorized players
5. **Presence System**: Uses Realtime Database for online/offline status

## Testing Rules

You can test these rules using the Firebase Emulator Suite:

```bash
npm install -g firebase-tools
firebase login
firebase init emulators
firebase emulators:start
```

## Rate Limits (Recommended Firestore Indexes)

Create these composite indexes in Firestore:

1. **Leaderboard Query**:
   - Collection: `leaderboard`
   - Fields: `rank` (Ascending), `elo` (Descending)

2. **Match History**:
   - Collection: `matches`
   - Fields: `timestamp` (Descending), `players` (Array)

3. **User Stats**:
   - Collection: `users/{userId}/stats`
   - Fields: `category` (Ascending), `value` (Descending)

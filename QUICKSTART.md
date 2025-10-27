# ⚡ Quick Start Guide

Get your Bomberman game running in 5 minutes!

## 🎯 Step 1: Configure Firebase (3 minutes)

### Enable Anonymous Authentication
1. Go to [Firebase Console](https://console.firebase.google.com/project/bomb-16743/authentication/providers)
2. Click **Sign-in method**
3. Click **Anonymous** → **Enable** → **Save**

### Setup Realtime Database Rules
1. Go to [Realtime Database Rules](https://console.firebase.google.com/project/bomb-16743/database/bomb-16743-default-rtdb/rules)
2. Copy and paste this:

```json
{
  "rules": {
    "rooms": {
      "$roomId": {
        ".read": true,
        ".write": true
      }
    },
    "globalChat": {
      ".read": true,
      ".write": true
    },
    "presence": {
      "$userId": {
        ".read": true,
        ".write": true
      }
    }
  }
}
```

3. Click **Publish**

### Setup Firestore Rules
1. Go to [Firestore Rules](https://console.firebase.google.com/project/bomb-16743/firestore/rules)
2. Copy and paste this:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

3. Click **Publish**

> ⚠️ **Note**: These are permissive rules for testing. See `firebase-rules.md` for production-ready rules.

### Create Firestore Database
1. Go to [Firestore](https://console.firebase.google.com/project/bomb-16743/firestore)
2. If no database exists, click **Create database**
3. Choose **Production mode** or **Test mode**
4. Select location: **europe-west1** (or nearest to you)
5. Click **Enable**

---

## 🖥️ Step 2: Run Locally (1 minute)

### Option A: Python (Easiest)
```bash
python -m http.server 8000
```

### Option B: Node.js
```bash
npx http-server -p 8000
```

### Option C: PHP
```bash
php -S localhost:8000
```

### Open Browser
Go to: [http://localhost:8000](http://localhost:8000)

---

## 🎮 Step 3: Test the Game (1 minute)

1. **Enter your username** in the profile section
2. Click **Create Room**
3. Open another browser tab (or incognito)
4. **Join the room** using the 6-character code
5. Both players click **Ready**
6. Host clicks **Start Game**
7. **Play!** 🎮

### Controls
- **WASD** or **Arrow Keys**: Move
- **Space**: Place bomb
- **E**: Emote menu

---

## ✅ Troubleshooting

### "Firebase not initialized"
- Wait a few seconds for Firebase to load
- Check browser console (F12) for errors
- Verify your internet connection

### "Can't create room"
- Verify Anonymous Auth is enabled
- Check Realtime Database rules are published
- Make sure Firestore database exists

### "Module loading error"
- Use a web server (not `file://`)
- Make sure you're using a modern browser
- Try a different browser (Chrome recommended)

### "Players not syncing"
- Check Firebase Console for quota limits
- Verify both players are in the same room
- Check browser console for errors

---

## 🚀 Next Steps

Once the game works locally:

1. **Deploy to GitHub Pages** (see [DEPLOYMENT.md](DEPLOYMENT.md))
2. **Tighten security rules** (see [firebase-rules.md](firebase-rules.md))
3. **Customize the game** (see [README.md](README.md))
4. **Share with friends!** 🎉

---

## 📊 Firebase Console Quick Links

- [Authentication](https://console.firebase.google.com/project/bomb-16743/authentication/providers)
- [Realtime Database](https://console.firebase.google.com/project/bomb-16743/database)
- [Firestore](https://console.firebase.google.com/project/bomb-16743/firestore)
- [Usage & Billing](https://console.firebase.google.com/project/bomb-16743/usage)

---

## 💡 Tips

- **Test with 2 browsers** (one normal, one incognito)
- **Use Chrome DevTools** (F12) to debug
- **Check Firebase Console** for real-time data
- **Monitor usage** to stay within free tier

---

## 🎯 Common Questions

**Q: Do I need to pay for Firebase?**
A: No! The free tier is more than enough for development and small-scale deployment.

**Q: Can I change the game settings?**
A: Yes! Check [README.md](README.md) for customization options.

**Q: How many players can play?**
A: Up to 4 players per room, unlimited rooms.

**Q: Will it work on mobile?**
A: Yes! The UI is responsive, but controls may need adjustment.

**Q: Can I add sounds?**
A: Yes! Check the `playSound()` function in `game.js` - just add your audio files.

---

## ❤️ Enjoy!

Your Bomberman game is now ready! Have fun! 💣

Need help? Check:
- [README.md](README.md) - Full documentation
- [DEPLOYMENT.md](DEPLOYMENT.md) - Hosting guide
- [firebase-rules.md](firebase-rules.md) - Security rules

**Happy bombing! 🎮**

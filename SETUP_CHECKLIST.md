# ✅ Setup Checklist

Use this checklist to ensure everything is properly configured before playing.

## 🔥 Firebase Configuration

### 1. Authentication
- [ ] Go to [Firebase Console](https://console.firebase.google.com/project/bomb-16743/authentication/providers)
- [ ] Click "Sign-in method" tab
- [ ] Enable "Anonymous" provider
- [ ] Save changes

### 2. Realtime Database
- [ ] Go to [Realtime Database](https://console.firebase.google.com/project/bomb-16743/database)
- [ ] If not created, click "Create Database"
- [ ] Choose location: **europe-west1**
- [ ] Start in **test mode** (we'll add rules next)
- [ ] Go to "Rules" tab
- [ ] Copy rules from `firebase-rules.md` (Realtime Database section)
- [ ] Click "Publish"

### 3. Firestore Database
- [ ] Go to [Firestore](https://console.firebase.google.com/project/bomb-16743/firestore)
- [ ] If not created, click "Create Database"
- [ ] Choose location: **europe-west1**
- [ ] Start in **production mode**
- [ ] Go to "Rules" tab
- [ ] Copy rules from `firebase-rules.md` (Firestore section)
- [ ] Click "Publish"

### 4. Firestore Indexes (Optional but recommended)
- [ ] Go to Firestore → Indexes tab
- [ ] Add composite index:
  - Collection ID: `users`
  - Fields indexed: `elo` (Descending)
  - Query scope: Collection
- [ ] Click "Create"
- [ ] Wait for index to build (~1-2 minutes)

## 🖥️ Local Development

### 5. Start Web Server
Choose one method:

**Python:**
- [ ] Open terminal in project directory
- [ ] Run: `python -m http.server 8000`
- [ ] Keep terminal open

**Node.js:**
- [ ] Open terminal in project directory
- [ ] Run: `npx http-server -p 8000`
- [ ] Keep terminal open

**PHP:**
- [ ] Open terminal in project directory
- [ ] Run: `php -S localhost:8000`
- [ ] Keep terminal open

### 6. Open in Browser
- [ ] Open browser (Chrome recommended)
- [ ] Navigate to: `http://localhost:8000`
- [ ] You should see the lobby page

## 🎮 Testing

### 7. Test Single Player Flow
- [ ] Enter a username
- [ ] Click "Create Room"
- [ ] Waiting room appears
- [ ] Room code is displayed
- [ ] You appear in player slot 1

### 8. Test Multiplayer Flow
- [ ] Open another browser tab (or incognito mode)
- [ ] Enter different username
- [ ] Enter the room code
- [ ] Click "Join"
- [ ] Both players appear in waiting room

### 9. Test Game Start
- [ ] Both players click "Ready"
- [ ] Host sees "Start Game" button
- [ ] Host clicks "Start Game"
- [ ] Game page loads
- [ ] Both players see the game grid
- [ ] Both players can move (WASD)

### 10. Test Game Mechanics
- [ ] Press Space to place bomb
- [ ] Bomb explodes after 3 seconds
- [ ] Explosion destroys crates
- [ ] Some crates drop power-ups
- [ ] Collect power-up by walking over it
- [ ] Power-up effect is applied
- [ ] Press E to show emote menu
- [ ] Select an emote
- [ ] Emote appears above player

### 11. Test Chat
- [ ] Type message in global chat (lobby)
- [ ] Message appears in chat
- [ ] Create/join room
- [ ] Type message in room chat
- [ ] Message appears in room chat

### 12. Test Game End
- [ ] Play until timer runs out or one player remains
- [ ] Game over modal appears
- [ ] Winner is displayed
- [ ] Scores are shown
- [ ] Click "Back to Lobby"
- [ ] Returns to lobby page

## 🐛 Troubleshooting

### Common Issues

**"Firebase is not defined"**
- [ ] Check internet connection
- [ ] Wait a few seconds for Firebase SDK to load
- [ ] Hard refresh page (Ctrl+Shift+R)

**"Can't create room"**
- [ ] Verify Anonymous Auth is enabled
- [ ] Check Realtime Database exists
- [ ] Check Realtime Database rules are published
- [ ] Open browser console (F12) for detailed errors

**"Module not found"**
- [ ] Verify you're using a web server (not file://)
- [ ] Check all .js files exist in /js/ folder
- [ ] Try different browser

**"Players not syncing"**
- [ ] Check both players are in same room code
- [ ] Verify Realtime Database rules allow read/write
- [ ] Check Firebase Console → Realtime Database for data
- [ ] Check browser console for errors

**"Game is laggy"**
- [ ] Check internet connection speed
- [ ] Try choosing closer Firebase region
- [ ] Close other browser tabs
- [ ] Check CPU usage

## 📊 Verify Firebase Data

### Check Realtime Database
- [ ] Go to Firebase Console → Realtime Database
- [ ] You should see:
  - `rooms/{roomCode}` when you create a room
  - `presence/{userId}` when logged in
  - `globalChat/` when messages are sent

### Check Firestore
- [ ] Go to Firebase Console → Firestore
- [ ] You should see:
  - `users/{userId}` document with your stats
  - `matches/{matchId}` after completing a game

### Check Authentication
- [ ] Go to Firebase Console → Authentication
- [ ] You should see anonymous users listed
- [ ] Each user has a unique UID

## 🚀 Ready to Deploy?

Once all tests pass:
- [ ] Review [DEPLOYMENT.md](DEPLOYMENT.md)
- [ ] Choose a hosting platform
- [ ] Update Firebase rules to production settings
- [ ] Deploy your game
- [ ] Test deployed version
- [ ] Share with friends! 🎉

## 📝 Notes

### Firebase Free Tier Limits
- Realtime Database: 1 GB storage, 10 GB/month downloads
- Firestore: 1 GB storage, 50K reads, 20K writes per day
- Authentication: Unlimited

### Expected Usage (100 players)
- Realtime Database: ~2-5 GB/month ✅ Within limits
- Firestore: ~50K-100K reads/day ⚠️ May exceed, upgrade if needed
- Authentication: Unlimited ✅

### Performance Targets
- [ ] 60 FPS during gameplay
- [ ] < 100ms network latency
- [ ] < 2 second room creation
- [ ] < 1 second to join room

## ✨ Optional Enhancements

After basic setup works:
- [ ] Add custom domain
- [ ] Enable Firebase Analytics
- [ ] Set up monitoring alerts
- [ ] Implement rate limiting
- [ ] Add more maps
- [ ] Add sound effects
- [ ] Create tournament mode

---

## 🎯 Success Criteria

Your game is ready when:
- ✅ You can create a room
- ✅ Another player can join
- ✅ Both players can play together
- ✅ Game mechanics work correctly
- ✅ No console errors
- ✅ Stats are saved after game

**Congratulations! Your Bomberman game is working! 🎮💣**

---

Need help? Check:
- [QUICKSTART.md](QUICKSTART.md) - Quick 5-minute setup
- [README.md](README.md) - Full documentation
- [DEPLOYMENT.md](DEPLOYMENT.md) - Hosting guide
- Firebase Console for backend errors

**Have fun bombing! 💥**

# 💣 Bomberman Multiplayer

A modern, real-time multiplayer Bomberman game built with HTML5 Canvas, JavaScript ES6+, and Firebase. Features a cyberpunk-styled UI, smooth animations, and competitive gameplay.

![Bomberman](https://img.shields.io/badge/Status-Ready%20to%20Play-brightgreen)
![Firebase](https://img.shields.io/badge/Backend-Firebase-orange)
![License](https://img.shields.io/badge/License-MIT-blue)

## ✨ Features

### 🎮 Gameplay
- **Real-time Multiplayer**: Up to 4 players per room
- **Smooth Movement**: Fluid player animations and interpolation
- **Power-ups**: Speed boost, extra bombs, increased range, bomb kick, invincibility
- **Dynamic Maps**: Classic, Maze, and Arena layouts
- **Bombs & Explosions**: Chain reactions and tactical gameplay
- **Emotes**: Express yourself during gameplay

### 🌐 Multiplayer System
- **Lobby System**: Create or join rooms with 6-character codes
- **Room Management**: Host controls, ready system, customizable settings
- **Public Rooms**: Browse and join available games
- **Chat**: Global lobby chat and room-specific chat
- **Presence System**: Online/offline player tracking

### 📊 Progression
- **ELO Ranking System**: Bronze → Silver → Gold → Platinum → Diamond
- **Statistics Tracking**: Games played, wins, kills, deaths
- **Leaderboard**: Top 10 players displayed in lobby
- **Match History**: All games saved to Firestore
- **Achievements**: (Ready for implementation)

### 🎨 Design
- **Cyberpunk Theme**: Neon colors, glow effects, pixel art aesthetic
- **Responsive UI**: Works on desktop and mobile
- **Pixel-Perfect Graphics**: Hand-crafted sprites and animations
- **60 FPS Performance**: Optimized game loop and rendering

## 🚀 Quick Start

### Prerequisites
- A modern web browser (Chrome, Firefox, Edge, Safari)
- Firebase account (free tier works perfectly)
- Basic web hosting (GitHub Pages, Netlify, Vercel, etc.)

### Setup Instructions

#### 1. Firebase Configuration

Your Firebase is already configured in the code, but you need to set up the database rules:

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project: `bomb-16743`

**Enable Authentication:**
- Navigate to: **Authentication** → **Sign-in method**
- Enable **Anonymous** authentication

**Setup Realtime Database:**
- Navigate to: **Realtime Database** → **Rules**
- Copy the rules from `firebase-rules.md` (Realtime Database section)
- Click **Publish**

**Setup Firestore:**
- Navigate to: **Firestore Database** → **Rules**
- Copy the rules from `firebase-rules.md` (Firestore section)
- Click **Publish**

**Create Firestore Indexes:**
- Navigate to: **Firestore Database** → **Indexes**
- Add composite index:
  - Collection: `users`
  - Fields: `elo` (Descending)
  - Query scope: Collection

#### 2. Local Testing

1. Clone or download this repository
2. Use a local web server (required for ES6 modules):

```bash
# Using Python 3
python -m http.server 8000

# Using Node.js (http-server)
npx http-server -p 8000

# Using PHP
php -S localhost:8000
```

3. Open your browser to `http://localhost:8000`

#### 3. Deploy to GitHub Pages

1. Create a new GitHub repository
2. Push this code to the repository:

```bash
git init
git add .
git commit -m "Initial commit: Bomberman Multiplayer"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

3. Enable GitHub Pages:
   - Go to **Settings** → **Pages**
   - Source: **Deploy from a branch**
   - Branch: **main** / **root**
   - Click **Save**

4. Your game will be live at: `https://YOUR_USERNAME.github.io/YOUR_REPO/`

## 🎮 How to Play

### Controls
- **WASD** or **Arrow Keys**: Move your character
- **Space**: Place bomb
- **E**: Open emote menu
- **Escape**: Pause menu

### Game Rules
1. **Objective**: Be the last player standing or have the most kills
2. **Bombs**: Take 3 seconds to explode, destroy crates and players
3. **Crates**: Destructible obstacles that may drop power-ups
4. **Power-ups**:
   - ⚡ **Speed**: Move faster
   - 💣 **Bomb**: Place more bombs simultaneously
   - 🔥 **Range**: Increase explosion radius
   - 👟 **Kick**: Kick bombs to move them
   - ⭐ **Invincibility**: Temporary immunity (5 seconds)

### Strategies
- Trap opponents between bombs and walls
- Use power-ups strategically
- Watch for chain reactions
- Corner spawning gives initial advantage
- Clear crates early for power-ups

## 🏗️ Project Structure

```
bomberman/
├── index.html              # Lobby page
├── game.html              # Game page
├── css/
│   └── style.css          # All styles
├── js/
│   ├── lobby.js           # Lobby logic
│   ├── game.js            # Main game logic
│   ├── player.js          # Player class
│   ├── bomb.js            # Bomb, Explosion, PowerUp classes
│   ├── network.js         # Firebase integration
│   └── renderer.js        # Canvas rendering
├── firebase-rules.md      # Database security rules
└── README.md             # This file
```

## 🔧 Customization

### Change Game Settings

Edit default values in `lobby.js`:
```javascript
const roomData = {
    settings: {
        map: 'classic',      // 'classic', 'maze', 'arena'
        duration: 300,       // seconds
        powerups: true,      // enable/disable
        maxPlayers: 4        // 2-4 players
    }
};
```

### Modify Grid Size

Edit `game.js`:
```javascript
this.gridWidth = 15;   // Default: 15
this.gridHeight = 13;  // Default: 13
```

And update `renderer.js`:
```javascript
this.tileSize = 48;    // pixels per tile
this.gridWidth = 15;
this.gridHeight = 13;
```

## 🐛 Troubleshooting

### Game Won't Load
- Check browser console for errors (F12)
- Verify Firebase configuration is correct
- Ensure you're using a web server (not file://)

### Players Not Syncing
- Check Firebase Realtime Database rules are published
- Verify Anonymous authentication is enabled
- Check network connectivity

### High Latency
- Firebase Realtime Database location matters (choose nearest region)
- Check your internet connection

## 🎯 Future Enhancements

- Sound effects and background music
- Additional power-ups (remote detonation, shield)
- Tournament mode with brackets
- Replay system viewer
- Mobile touch controls
- Gamepad support

## 📄 License

This project is licensed under the MIT License.

## 🎮 Play Now!

Ready to play? Follow the setup instructions above and start bombing! 💣

---

**Made with ❤️ and JavaScript**

*Remember: The last one standing wins!* 🏆
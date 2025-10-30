import { NetworkManager } from './network.js';
import { Renderer } from './renderer.js';
import { Player } from './player.js';
import { Bomb, Explosion, PowerUp } from './bomb.js';
import { Teleporter, MovingWall } from './obstacles.js';

/**
 * Game Manager - Main game logic and state management
 */
class GameManager {
    constructor() {
        this.network = null;
        this.renderer = null;
        this.roomCode = null;

        // Game state
        this.grid = [];
        this.players = new Map();
        this.bombs = new Map();
        this.explosions = [];
        this.powerups = new Map();
        this.processedExplosionIds = new Set();
        this.processedExplosionOrder = [];
        this.roomHostId = null;
        this.baseMoveDelay = 110;
        this.minMoveDelay = 50;

        // Local player
        this.localPlayerId = null;
        this.localPlayer = null;
        this.expectedPlayerIds = [];

        // Game settings
        this.gridWidth = 15;
        this.gridHeight = 13;
        this.gameStartTime = null;
        this.gameDuration = 300; // seconds
        this.gameRunning = false;
        this.isInitializingGame = false;

        // Input
        this.keys = {};
        this.lastMoveTime = 0;
        this.moveDelay = this.baseMoveDelay; // ms between moves

        // Game loop
        this.lastFrameTime = 0;
        this.animationFrame = null;

        // Sync throttling
        this.lastSyncTime = 0;
        this.syncDelay = 50; // ms between network syncs
        this.pendingSync = false;

        // Heartbeat
        this.heartbeatInterval = null;

        // Game end tracking (prevent premature game end checks)
        this.gameEndCheckTimer = null;
        this.lastAliveCount = 0;
        this.stableAliveCountDuration = 0;

        this.init();
    }

    async init() {
        // Get room code from URL
        const params = new URLSearchParams(window.location.search);
        this.roomCode = params.get('room');

        if (!this.roomCode) {
            alert('No room code provided');
            window.location.href = 'index.html';
            return;
        }

        const expectedPlayersRaw = localStorage.getItem('bomberman_expected_players');
        if (expectedPlayersRaw) {
            try {
                const expectedData = JSON.parse(expectedPlayersRaw);
                if (expectedData && expectedData.roomCode === this.roomCode && Array.isArray(expectedData.playerIds)) {
                    this.expectedPlayerIds = expectedData.playerIds;
                }
            } catch (error) {
                console.warn('Failed to parse expected players cache', error);
            }
        }

        // Wait for Firebase
        await this.waitForFirebase();

        // Initialize network
        this.network = new NetworkManager(window.database, window.firestore);
        await this.network.initialize();
        this.localPlayerId = this.network.getUserId();
        try {
            await this.network.ensurePlayerInRoom(this.roomCode);
        } catch (error) {
            console.error('Failed to ensure room membership', error);
        }

        // Initialize renderer
        const canvas = document.getElementById('gameCanvas');
        this.renderer = new Renderer(canvas);

        // Setup game
        await this.setupGame();
        this.setupInput();
        this.setupUI();

        // Start game loop
        this.startGameLoop();
    }

    async waitForFirebase() {
        let attempts = 0;
        while (!window.database || !window.firestore) {
            if (attempts++ > 50) throw new Error('Firebase not loaded');
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    async setupGame() {
        // Listen to game state
        this.network.listenToGameState(this.roomCode, (gameState) => {
            this.syncGameState(gameState);
        });

        // Listen to room for game settings and player list
        this.network.listenToRoom(this.roomCode, (room) => {
            if (!room) {
                alert('Salle fermée');
                window.location.href = 'index.html';
                return;
            }

            if (room.status === 'waiting') {
                alert('Le jeu n\'a pas encore commencé');
                window.location.href = 'index.html';
                return;
            }

            if (room.status === 'finished') {
                this.endGame();
                return;
            }

            // Initialize game if not running
            if (!this.gameRunning) {
                this.startGame(room);
            }

            // Check for disconnected players
            this.checkDisconnectedPlayers(room);
        });

        // Setup disconnect handler
        this.setupDisconnectHandler();
    }

    /**
     * Setup disconnect handler to clean up when player leaves
     */
    setupDisconnectHandler() {
        window.addEventListener('beforeunload', () => {
            if (this.localPlayer && this.gameRunning) {
                // Mark player as disconnected
                this.network.updatePlayerState(this.roomCode, {
                    ...this.localPlayer.serialize(),
                    disconnected: true
                });
            }
        });
    }

    /**
     * Check for players who disconnected and remove them
     */
    checkDisconnectedPlayers(room) {
        if (!room.gameState || !room.gameState.players) return;

        Object.entries(room.gameState.players).forEach(([id, playerData]) => {
            if (playerData.disconnected && Date.now() - playerData.lastUpdate > 30000) {
                // Player hasn't reconnected in 30 seconds, mark as dead
                const player = this.players.get(id);
                if (player && player.alive) {
                    player.alive = false;
                    this.updatePlayersHUD();
                }
            }
        });
    }

    async startGame(room) {
        console.log('🎮 Starting game...');

        if (!room) {
            console.warn('❌ startGame aborted: room data missing');
            alert('La salle est invalide. Retour au lobby.');
            window.location.href = 'index.html';
            return;
        }

        if (this.gameRunning || this.isInitializingGame) {
            console.log('⚠️ Game already running or initializing, skipping startGame');
            return;
        }

        this.isInitializingGame = true;
        console.log('🔧 Initializing game...');

        try {
            const isHost = room.host === this.localPlayerId;
            this.roomHostId = room.host;
            const settings = (room.settings && typeof room.settings === 'object') ? room.settings : {};

            // Apply theme
            if (settings.theme && this.renderer) {
                this.renderer.setTheme(settings.theme);
            }

            const roomPlayers = (room.players && typeof room.players === 'object') ? room.players : null;
            const gameStatePlayers = (room.gameState && room.gameState.players && typeof room.gameState.players === 'object')
                ? room.gameState.players
                : null;
            const playersSource = roomPlayers || gameStatePlayers || {};
            const existingGrid = this.normalizeGridLayout(room.gameState && room.gameState.grid);

            if (!existingGrid) {
                if (!isHost) {
                    console.warn('startGame deferred: waiting for host to provide grid layout');
                    return;
                }

                this.generateGrid(settings.map);
                const gridLayoutForNetwork = this.cloneGrid(this.grid);
                try {
                    await this.network.updateGrid(this.roomCode, gridLayoutForNetwork);
                } catch (error) {
                    console.error('Failed to sync grid layout to network', error);
                }
            } else {
                this.applyGridLayout(existingGrid);
            }

            let playerEntries = Object.entries(playersSource).filter(([, data]) => data && typeof data === 'object');

            if (this.expectedPlayerIds && this.expectedPlayerIds.length > 0) {
                const missingIds = this.expectedPlayerIds.filter(id => {
                    const playerData = playersSource[id];
                    return !playerData || typeof playerData !== 'object';
                });

                if (missingIds.length > 0) {
                    console.warn('startGame deferred: waiting for expected players data', { missing: missingIds });
                    if (missingIds.includes(this.localPlayerId)) {
                        this.network.ensurePlayerInRoom(this.roomCode).catch((error) => {
                            console.error('Failed to restore local player entry', error);
                        });
                    }
                    return;
                }

                playerEntries = this.expectedPlayerIds
                    .map(id => [id, playersSource[id]])
                    .filter(([, data]) => data && typeof data === 'object');
            } else if (playerEntries.length === 0) {
                console.warn('startGame deferred: waiting for players data');
                this.network.ensurePlayerInRoom(this.roomCode).catch((error) => {
                    console.error('Failed to restore local player entry', error);
                });
                return;
            }

            // Validate player count (2-10 players required)
            if (playerEntries.length < 2) {
                console.error('❌ Cannot start game: minimum 2 players required');
                alert('Le jeu nécessite au moins 2 joueurs pour commencer !');
                return;
            }

            if (playerEntries.length > 10) {
                console.warn('⚠️ Too many players, limiting to 10');
                playerEntries = playerEntries.slice(0, 10);
            }

            console.log(`✅ Starting game with ${playerEntries.length} players (valid range: 2-10)`);

            this.gameDuration = settings.duration || this.gameDuration;
            this.gameStartTime = Date.now();

            // Store settings
            this.powerupsEnabled = settings.powerups !== false;
            this.powerupDensity = settings.powerupDensity || 'medium';

            // Ensure grid is generated (host already generated above if needed)
            if (!this.grid || this.grid.length === 0) {
                this.generateGrid(settings.map);
            }

            // Reset state before populating
            this.players.clear();
            this.bombs.clear();
            this.explosions = [];
            this.powerups.clear();
            this.processedExplosionIds.clear();
            this.processedExplosionOrder = [];
            this.localPlayer = null;

            // Initialize players
            const spawnPoints = this.getSpawnPoints();
            console.log(`👥 Initializing ${playerEntries.length} players with spawn points:`, spawnPoints);

            playerEntries.forEach(([id, playerData], index) => {
                // ALWAYS use spawn points for initial game start
                // Each player gets a unique spawn point based on their index
                const spawn = spawnPoints[index % spawnPoints.length] || spawnPoints[0] || { x: 1, y: 1 };
                console.log(`  Player ${index} (${playerData.username}): spawn at (${spawn.x}, ${spawn.y})`);

                // Only use existing state data if the game is already running (reconnection case)
                // Otherwise, force spawn points for fair game start
                let startGridX = spawn.x;
                let startGridY = spawn.y;

                // Only restore position if game was already running and player is reconnecting
                const stateData = (gameStatePlayers && typeof gameStatePlayers === 'object') ? gameStatePlayers[id] : null;
                if (stateData && this.gameRunning) {
                    startGridX = stateData.gridX ?? spawn.x;
                    startGridY = stateData.gridY ?? spawn.y;
                }

                const player = new Player(
                    playerData.id || id,
                    playerData.username || `Player ${index + 1}`,
                    startGridX,
                    startGridY,
                    typeof playerData.colorIndex === 'number' ? playerData.colorIndex : index
                );

                // Only restore state for reconnecting players, not fresh game starts
                if (stateData && this.gameRunning) {
                    player.alive = stateData.alive ?? true;
                    player.kills = stateData.kills ?? 0;
                    player.deaths = stateData.deaths ?? 0;
                    player.speed = stateData.speed ?? 2;
                    player.maxBombs = stateData.maxBombs ?? 1;
                    player.bombRange = stateData.bombRange ?? 2;
                    player.canKickBombs = stateData.canKickBombs ?? false;
                    player.targetX = stateData.x ?? player.x;
                    player.targetY = stateData.y ?? player.y;
                } else {
                    // Fresh game start - reset everything
                    player.reset(startGridX, startGridY);
                    player.alive = true;
                    player.kills = 0;
                    player.deaths = 0;
                }

                this.players.set(player.id, player);

                if (player.id === this.localPlayerId) {
                    this.localPlayer = player;
                    this.recalculateMoveDelay();

                    // Load local player's custom skins from localStorage
                    this.loadLocalPlayerSkins();
                }
            });

            if (!this.localPlayer) {
                console.warn('startGame deferred: local player data missing');
                this.players.clear();
                this.network.ensurePlayerInRoom(this.roomCode).catch((error) => {
                    console.error('Failed to re-sync local player entry', error);
                });
                return;
            }

            try {
                await this.network.updatePlayerState(this.roomCode, this.localPlayer.serialize());
            } catch (error) {
                console.error('Failed to push initial player state', error);
            }

            this.gameRunning = true;
            console.log(`✅ Game initialized successfully with ${this.players.size} players`);
            console.log(`📊 Players:`, Array.from(this.players.values()).map(p => ({
                name: p.username,
                position: `(${p.gridX}, ${p.gridY})`,
                alive: p.alive
            })));

            if (this.expectedPlayerIds.length === 0) {
                this.expectedPlayerIds = playerEntries.map(([id]) => id);
            }
            localStorage.removeItem('bomberman_expected_players');

            // Update HUD
            this.updatePlayersHUD();

            if (isHost) {
                const serializedPlayers = {};
                this.players.forEach((player, playerId) => {
                    serializedPlayers[playerId] = player.serialize();
                });

                await this.network.initializeGameState(this.roomCode, serializedPlayers);
            }
        } finally {
            this.isInitializingGame = false;
        }
    }

    /**
     * Seeded random number generator for deterministic map generation
     */
    seededRandom(seed) {
        const x = Math.sin(seed) * 10000;
        return x - Math.floor(x);
    }

    generateGrid(mapType) {
        // Set grid dimensions based on map type
        const mapSizes = {
            'small': { width: 13, height: 11 },
            'medium': { width: 15, height: 13 },
            'large': { width: 19, height: 15 },
            'xlarge': { width: 23, height: 17 },
            'huge': { width: 27, height: 21 }
        };

        const size = mapSizes[mapType] || mapSizes['medium'];
        this.gridWidth = size.width;
        this.gridHeight = size.height;

        // Initialize empty grid
        this.grid = Array(this.gridHeight).fill(null).map(() =>
            Array(this.gridWidth).fill(0)
        );

        // Add perimeter walls
        for (let y = 0; y < this.gridHeight; y++) {
            for (let x = 0; x < this.gridWidth; x++) {
                if (x === 0 || x === this.gridWidth - 1 || y === 0 || y === this.gridHeight - 1) {
                    this.grid[y][x] = 1; // Wall
                }
            }
        }

        // Add internal walls (grid pattern)
        for (let y = 2; y < this.gridHeight - 2; y += 2) {
            for (let x = 2; x < this.gridWidth - 2; x += 2) {
                this.grid[y][x] = 1;
            }
        }

        // Use seeded random for deterministic crate placement
        // Seed is based on room code to ensure all players get the same map
        let seed = 0;
        if (this.roomCode) {
            for (let i = 0; i < this.roomCode.length; i++) {
                seed += this.roomCode.charCodeAt(i);
            }
        }

        // Add destructible crates
        const spawnSafeZones = this.getSpawnPoints();
        const crateChance = 0.7; // 70% chance to spawn a crate

        for (let y = 1; y < this.gridHeight - 1; y++) {
            for (let x = 1; x < this.gridWidth - 1; x++) {
                if (this.grid[y][x] !== 0) continue;

                // Don't place crates in spawn zones
                let inSafeZone = false;
                for (const spawn of spawnSafeZones) {
                    if (Math.abs(x - spawn.x) <= 1 && Math.abs(y - spawn.y) <= 1) {
                        inSafeZone = true;
                        break;
                    }
                }

                // Use seeded random instead of Math.random()
                seed++;
                if (!inSafeZone && this.seededRandom(seed) < crateChance) {
                    this.grid[y][x] = 2; // Destructible
                }
            }
        }

        this.updateRendererDimensions();
        return this.cloneGrid(this.grid);
    }

    normalizeGridLayout(layout) {
        if (!layout) return null;

        const rows = Array.isArray(layout)
            ? layout
            : Object.keys(layout)
                .sort((a, b) => Number(a) - Number(b))
                .map(key => layout[key]);

        const normalized = rows.map(row => {
            if (Array.isArray(row)) {
                return row.map(value => Number(value ?? 0));
            }

            if (row && typeof row === 'object') {
                return Object.keys(row)
                    .sort((a, b) => Number(a) - Number(b))
                    .map(key => Number(row[key] ?? 0));
            }

            return [];
        });

        return normalized.every(row => row.length > 0) ? normalized : null;
    }

    applyGridLayout(layout) {
        const normalized = this.normalizeGridLayout(layout);
        if (!normalized || !normalized.length) return false;

        this.gridHeight = normalized.length;
        this.gridWidth = normalized[0]?.length || 0;
        this.grid = normalized.map(row => row.slice());
        this.updateRendererDimensions();
        return true;
    }

    cloneGrid(grid) {
        if (!Array.isArray(grid)) return [];
        return grid.map(row => Array.isArray(row) ? row.slice() : []);
    }

    updateRendererDimensions() {
        if (!this.renderer) return;
        this.renderer.gridWidth = this.gridWidth;
        this.renderer.gridHeight = this.gridHeight;
        this.renderer.canvas.width = this.gridWidth * this.renderer.tileSize;
        this.renderer.canvas.height = this.gridHeight * this.renderer.tileSize;
    }

    getSpawnPoints() {
        // Spawn points for up to 10 players
        // Priority: corners first, then edges, then strategic positions
        const spawnPoints = [
            // 4 corners (players 1-4)
            { x: 1, y: 1 },                                          // Top-left
            { x: this.gridWidth - 2, y: 1 },                         // Top-right
            { x: 1, y: this.gridHeight - 2 },                        // Bottom-left
            { x: this.gridWidth - 2, y: this.gridHeight - 2 },       // Bottom-right

            // 4 edges midpoints (players 5-8)
            { x: Math.floor(this.gridWidth / 2), y: 1 },             // Top-center
            { x: Math.floor(this.gridWidth / 2), y: this.gridHeight - 2 }, // Bottom-center
            { x: 1, y: Math.floor(this.gridHeight / 2) },            // Left-center
            { x: this.gridWidth - 2, y: Math.floor(this.gridHeight / 2) }, // Right-center

            // 2 additional strategic positions (players 9-10)
            { x: Math.floor(this.gridWidth / 4), y: Math.floor(this.gridHeight / 4) },
            { x: Math.floor(3 * this.gridWidth / 4), y: Math.floor(3 * this.gridHeight / 4) }
        ];

        return spawnPoints;
    }

    setupInput() {
        // Keyboard input
        window.addEventListener('keydown', (e) => {
            this.keys[e.key.toLowerCase()] = true;

            // Space to place bomb
            if (e.key === ' ') {
                e.preventDefault();
                this.placeBomb();
            }

            // E to open emote menu
            if (e.key === 'e' || e.key === 'E') {
                this.toggleEmoteMenu();
            }

            // Escape to open pause menu
            if (e.key === 'Escape') {
                this.togglePauseMenu();
            }
        });

        window.addEventListener('keyup', (e) => {
            this.keys[e.key.toLowerCase()] = false;
        });

        // Emote buttons
        document.querySelectorAll('.emote-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const emote = btn.dataset.emote;
                this.showEmote(emote);
                this.toggleEmoteMenu();
            });
        });

        // Menu buttons
        document.getElementById('menuBtn').addEventListener('click', () => this.togglePauseMenu());
        document.getElementById('resumeBtn').addEventListener('click', () => this.togglePauseMenu());
        document.getElementById('quitBtn').addEventListener('click', () => this.quitGame());
        document.getElementById('backToLobbyBtn').addEventListener('click', () => this.backToLobby());
        document.getElementById('playAgainBtn').addEventListener('click', () => this.playAgain());
    }

    setupUI() {
        // Timer will be updated in game loop
    }

    startGameLoop() {
        this.lastFrameTime = performance.now();

        const loop = (currentTime) => {
            const deltaTime = (currentTime - this.lastFrameTime) / 1000; // seconds
            this.lastFrameTime = currentTime;

            this.update(deltaTime);
            this.render();

            this.animationFrame = requestAnimationFrame(loop);
        };

        this.animationFrame = requestAnimationFrame(loop);

        // Start heartbeat to keep connection alive
        this.heartbeatInterval = setInterval(() => {
            if (this.localPlayer && this.gameRunning) {
                this.syncLocalPlayerState();
            }
        }, 2000); // Every 2 seconds
    }

    update(deltaTime) {
        if (!this.gameRunning || !this.localPlayer) return;

        // Handle input
        this.handleInput();

        // Update players
        this.players.forEach(player => player.update(deltaTime));

        // Update bombs
        const bombsToExplode = [];
        this.bombs.forEach((bomb, id) => {
            const shouldExplode = bomb.update(deltaTime);
            if (shouldExplode) {
                bombsToExplode.push(id);
            }
        });

        // Explode bombs
        bombsToExplode.forEach(bombId => {
            this.explodeBomb(bombId);
        });

        // Update explosions
        this.explosions = this.explosions.filter(explosion => {
            const expired = explosion.update(deltaTime);
            return !expired;
        });

        // Update power-ups
        this.powerups.forEach(powerup => powerup.update(deltaTime));

        // Check power-up collection
        this.checkPowerUpCollection();

        // Update timer
        this.updateTimer();

        // Update player stats HUD
        this.updatePlayerStatsHUD();

        // Check game end
        this.checkGameEnd();
    }

    handleInput() {
        const now = Date.now();
        if (now - this.lastMoveTime < this.moveDelay) return;

        const direction = this.getInputDirection();
        if (!direction) return;

        const moved = this.tryMoveLocalPlayer(direction);
        if (moved) {
            this.lastMoveTime = now;
            // Sync with server (debounced)
            this.syncLocalPlayerState();
        }
    }

    getInputDirection() {
        if (this.keys['w'] || this.keys['arrowup'] || this.keys['z']) return 'up';
        if (this.keys['s'] || this.keys['arrowdown']) return 'down';
        if (this.keys['a'] || this.keys['arrowleft'] || this.keys['q']) return 'left';
        if (this.keys['d'] || this.keys['arrowright']) return 'right';
        return null;
    }

    tryMoveLocalPlayer(direction) {
        const vector = this.directionToVector(direction);
        if (!vector) return false;

        const targetX = this.localPlayer.gridX + vector.dx;
        const targetY = this.localPlayer.gridY + vector.dy;
        const targetTile = this.getTile(targetX, targetY);

        if (targetTile === 3 && this.localPlayer.canKickBombs) {
            const kicked = this.tryKickBomb(targetX, targetY, vector.dx, vector.dy);
            if (!kicked) {
                return false;
            }
        }

        const moved = this.localPlayer.move(direction, this.grid, this.renderer.tileSize);
        return moved;
    }

    directionToVector(direction) {
        switch (direction) {
            case 'up':
                return { dx: 0, dy: -1 };
            case 'down':
                return { dx: 0, dy: 1 };
            case 'left':
                return { dx: -1, dy: 0 };
            case 'right':
                return { dx: 1, dy: 0 };
            default:
                return null;
        }
    }

    getTile(x, y) {
        if (!this.grid[y] || this.grid[y][x] === undefined) return 1;
        return this.grid[y][x];
    }

    isWithinBounds(x, y) {
        return y >= 0 && y < this.gridHeight && x >= 0 && x < this.gridWidth;
    }

    findBombAt(x, y) {
        for (const bomb of this.bombs.values()) {
            if (bomb.isAtPosition(x, y)) {
                return bomb;
            }
        }
        return null;
    }

    tryKickBomb(bombX, bombY, dx, dy) {
        const bomb = this.findBombAt(bombX, bombY);
        if (!bomb) return false;

        let nextX = bombX + dx;
        let nextY = bombY + dy;

        if (!this.isWithinBounds(nextX, nextY)) return false;

        // Find furthest position the bomb can roll to (stop before obstacle)
        let finalX = bombX;
        let finalY = bombY;
        while (this.isWithinBounds(nextX, nextY) && this.getTile(nextX, nextY) === 0) {
            finalX = nextX;
            finalY = nextY;
            nextX += dx;
            nextY += dy;
        }

        if (finalX === bombX && finalY === bombY) {
            return false;
        }

        // Update grid occupancy
        const startGridX = Math.round(bomb.x);
        const startGridY = Math.round(bomb.y);
        if (this.grid[startGridY] && this.grid[startGridY][startGridX] === 3) {
            this.grid[startGridY][startGridX] = 0;
        }

        bomb.x = finalX;
        bomb.y = finalY;
        bomb.stopMovement();

        if (this.grid[finalY]) {
            this.grid[finalY][finalX] = 3;
        }

        this.network.moveBomb(this.roomCode, bomb.id, { x: bomb.x, y: bomb.y })
            .catch(err => console.error('Failed to sync kicked bomb:', err));

        return true;
    }

    async placeBomb() {
        if (!this.localPlayer || !this.localPlayer.canPlaceBomb()) return;

        // Check if there's already a bomb at this position
        for (const bomb of this.bombs.values()) {
            if (bomb.isAtPosition(this.localPlayer.gridX, this.localPlayer.gridY)) {
                return;
            }
        }

        const bombData = this.localPlayer.placeBomb();
        if (bombData) {
            const bomb = new Bomb(
                bombData.x,
                bombData.y,
                bombData.playerId,
                bombData.range
            );

            this.bombs.set(bomb.id, bomb);
            this.grid[bomb.y][bomb.x] = 3; // Mark grid as having bomb

            // Update stats HUD immediately
            this.updatePlayerStatsHUD();

            // Sync with server
            await this.network.placeBomb(this.roomCode, bomb.serialize());
        }
    }

    async explodeBomb(bombId) {
        const bomb = this.bombs.get(bombId);
        if (!bomb) return;

        // Get explosion data
        const explosionData = bomb.explode(this.grid);
        if (!explosionData) return;

        // Remove bomb
        this.bombs.delete(bombId);
        this.grid[Math.round(bomb.y)][Math.round(bomb.x)] = 0;

        // Notify owner that bomb exploded
        const player = this.players.get(bomb.playerId);
        if (player) {
            player.bombExploded();

            // Update stats HUD if it's the local player
            if (player.id === this.localPlayerId) {
                this.updatePlayerStatsHUD();
            }
        }

        // Create explosion effects
        explosionData.explosions.forEach(expl => {
            this.explosions.push(new Explosion(expl.x, expl.y));

            // Destroy tiles
            if (this.grid[expl.y][expl.x] === 2) {
                this.grid[expl.y][expl.x] = 0;

                // Chance to spawn power-up based on density setting
                if (this.powerupsEnabled && Math.random() < this.getPowerUpChance()) {
                    this.spawnPowerUp(expl.x, expl.y);
                }
            }

            // Kill players
            this.players.forEach(player => {
                if (player.isAtPosition(expl.x, expl.y)) {
                    if (player.kill()) {
                        // Award kill to bomb owner
                        let killer = null;
                        const isSuicide = player.id === bomb.playerId;

                        if (!isSuicide) {
                            killer = this.players.get(bomb.playerId);
                            if (killer) {
                                killer.kills++;
                                // Add kill feed message
                                this.addKillFeedMessage(killer.username, player.username, false);
                            }
                        } else {
                            // Suicide
                            this.addKillFeedMessage(null, player.username, true);
                        }

                        // Sync death to network
                        if (player.id === this.localPlayerId) {
                            // Local player died
                            this.network.updatePlayerState(this.roomCode, player.serialize());
                        } else {
                            // Remote player died (if we are the bomb owner)
                            if (bomb.playerId === this.localPlayerId) {
                                this.network.killPlayer(this.roomCode, player.id, {
                                    deaths: player.deaths,
                                    killerId: this.localPlayerId,
                                    kills: killer ? killer.kills : 0
                                });
                            }
                        }

                        this.updatePlayersHUD();
                    }
                }
            });

            // Chain reaction - explode other bombs
            this.bombs.forEach((otherBomb, otherId) => {
                if (otherId !== bombId && otherBomb.isAtPosition(expl.x, expl.y)) {
                    // Explode after a short delay
                    setTimeout(() => this.explodeBomb(otherId), 100);
                }
            });
        });

        // Sync with server
        if (bomb.playerId === this.localPlayerId) {
            await this.network.triggerExplosion(this.roomCode, explosionData);
            await this.network.removeBomb(this.roomCode, bombId);
        }

        // Play sound (if implemented)
        this.playSound('explosion');

        if (explosionData.id) {
            this.rememberExplosion(explosionData.id);
        }
    }

    /**
     * Get power-up spawn chance based on density setting
     */
    getPowerUpChance() {
        const densityMap = {
            'low': 0.08,
            'medium': 0.22,
            'high': 0.35,
            'extreme': 0.55
        };
        return densityMap[this.powerupDensity] || 0.3;
    }

    async spawnPowerUp(x, y) {
        const type = PowerUp.randomType();
        const powerup = new PowerUp(x, y, type);
        this.powerups.set(powerup.id, powerup);
        if (this.grid[y]) {
            this.grid[y][x] = 4;
        }

        // Sync with server
        await this.network.spawnPowerUp(this.roomCode, powerup.serialize());
    }

    checkPowerUpCollection() {
        if (!this.localPlayer || !this.localPlayer.alive) return;

        this.powerups.forEach((powerup, id) => {
            if (powerup.x === this.localPlayer.gridX && powerup.y === this.localPlayer.gridY) {
                if (!powerup.collected) {
                    const type = powerup.collect();
                    if (type) {
                        this.localPlayer.applyPowerUp(type);
                        if (this.grid[powerup.y]) {
                            this.grid[powerup.y][powerup.x] = 0;
                        }
                        this.powerups.delete(id);
                        this.playSound('powerup');

                        if (type === 'speed') {
                            this.recalculateMoveDelay();
                        }

                        // Update stats HUD immediately
                        this.updatePlayerStatsHUD();

                        // Sync with server
                        this.network.collectPowerUp(this.roomCode, id);
                    }
                }
            }
        });
    }

    rememberExplosion(explosionId) {
        if (!explosionId) return;
        if (!this.processedExplosionIds.has(explosionId)) {
            this.processedExplosionIds.add(explosionId);
            this.processedExplosionOrder.push(explosionId);
            if (this.processedExplosionOrder.length > 64) {
                const oldest = this.processedExplosionOrder.shift();
                if (oldest) {
                    this.processedExplosionIds.delete(oldest);
                }
            }
        }
    }

    syncGameState(gameState) {
        if (gameState.grid && (!this.grid || this.grid.length === 0)) {
            this.applyGridLayout(gameState.grid);
        }

        // Sync players from network (except local player)
        if (gameState.players) {
            Object.entries(gameState.players).forEach(([id, playerData]) => {
                if (id === this.localPlayerId) return; // Skip local player

                let player = this.players.get(id);
                if (!player) {
                    player = Player.deserialize(playerData);
                    this.players.set(id, player);
                } else {
                    // Update ALL player state from network
                    player.targetX = playerData.x;
                    player.targetY = playerData.y;
                    player.gridX = playerData.gridX;
                    player.gridY = playerData.gridY;
                    player.direction = playerData.direction;
                    player.alive = playerData.alive;
                    player.kills = playerData.kills;
                    player.deaths = playerData.deaths;
                    player.speed = playerData.speed;
                    player.maxBombs = playerData.maxBombs;
                    player.currentBombs = playerData.currentBombs;
                    player.bombRange = playerData.bombRange;
                    player.invincible = playerData.invincible;
                    player.currentEmote = playerData.currentEmote;

                    // Update custom skins if changed
                    if (playerData.customSkins) {
                        if (playerData.customSkins.character && playerData.customSkins.character !== player.customSkins.character) {
                            player.setCustomSkin('character', playerData.customSkins.character);
                        }
                        if (playerData.customSkins.bomb && playerData.customSkins.bomb !== player.customSkins.bomb) {
                            player.setCustomSkin('bomb', playerData.customSkins.bomb);
                        }
                    }
                }
            });

            // Update HUD when player states change
            this.updatePlayersHUD();
        }

        // Sync bombs from network
        if (gameState.bombs) {
            // Remove bombs that no longer exist on server
            this.bombs.forEach((bomb, id) => {
                if (!gameState.bombs[id]) {
                    this.bombs.delete(id);
                    const gridY = Math.round(bomb.y);
                    const gridX = Math.round(bomb.x);
                    if (this.grid[gridY] && this.grid[gridY][gridX] === 3) {
                        this.grid[gridY][gridX] = 0;
                    }
                }
            });

            // Add or update bombs from server
            Object.entries(gameState.bombs).forEach(([id, bombData]) => {
                const existing = this.bombs.get(id);
                if (!existing) {
                    const bomb = Bomb.deserialize(bombData);
                    this.bombs.set(id, bomb);
                    const gridY = Math.round(bomb.y);
                    const gridX = Math.round(bomb.x);
                    if (this.grid[gridY] && this.grid[gridY][gridX] !== undefined) {
                        this.grid[gridY][gridX] = 3;
                    }
                    return;
                }

                const prevGridX = Math.round(existing.x);
                const prevGridY = Math.round(existing.y);
                existing.x = bombData.x;
                existing.y = bombData.y;
                existing.range = bombData.range;
                existing.timer = bombData.timer;
                existing.planted = bombData.planted;
                existing.isMoving = bombData.isMoving;
                existing.moveDirection = bombData.moveDirection;

                const newGridX = Math.round(existing.x);
                const newGridY = Math.round(existing.y);

                if (this.grid[prevGridY] && this.grid[prevGridY][prevGridX] === 3 &&
                    (prevGridX !== newGridX || prevGridY !== newGridY)) {
                    this.grid[prevGridY][prevGridX] = 0;
                }

                if (this.grid[newGridY] && this.grid[newGridY][newGridX] !== undefined) {
                    this.grid[newGridY][newGridX] = 3;
                }
            });
        }

        // Sync power-ups
        if (gameState.powerups) {
            // Remove collected power-ups
            this.powerups.forEach((powerup, id) => {
                if (!gameState.powerups[id]) {
                    if (this.grid[powerup.y]) {
                        this.grid[powerup.y][powerup.x] = 0;
                    }
                    this.powerups.delete(id);
                }
            });

            // Add or update power-ups
            Object.entries(gameState.powerups).forEach(([id, powerupData]) => {
                if (!this.powerups.has(id)) {
                    const powerup = PowerUp.deserialize(powerupData);
                    this.powerups.set(id, powerup);
                    if (this.grid[powerup.y]) {
                        this.grid[powerup.y][powerup.x] = 4;
                    }
                }
            });
        }

        // Sync explosions
        if (gameState.explosions) {
            Object.entries(gameState.explosions).forEach(([id, explosionData]) => {
                const explosionBombId = explosionData && explosionData.id ? explosionData.id : id;
                if (!explosionBombId || this.processedExplosionIds.has(explosionBombId)) {
                    return;
                }

                this.rememberExplosion(explosionBombId);

                explosionData.explosions.forEach(expl => {
                    this.explosions.push(new Explosion(expl.x, expl.y));

                    // Destroy tiles from network explosions
                    if (this.grid[expl.y] && this.grid[expl.y][expl.x] === 2) {
                        this.grid[expl.y][expl.x] = 0;
                    }

                    // Kill local player if in explosion
                    if (this.localPlayer && this.localPlayer.isAtPosition(expl.x, expl.y)) {
                        if (this.localPlayer.kill()) {
                            // Sync death to network
                            this.network.updatePlayerState(this.roomCode, this.localPlayer.serialize());
                            this.updatePlayersHUD();
                        }
                    }
                });
            });
        }
    }

    updatePlayersHUD() {
        const hud = document.getElementById('playersStatus');
        hud.innerHTML = '';

        this.players.forEach(player => {
            const playerHud = document.createElement('div');
            playerHud.className = `player-hud ${player.alive ? 'alive' : 'dead'}`;

            const color = player.getColor();
            playerHud.innerHTML = `
                <div class="player-hud-avatar" style="background: ${color.main};">
                    ${player.username.charAt(0).toUpperCase()}
                </div>
                <div>
                    <div class="player-hud-name">${player.username}</div>
                    <div class="player-hud-kills">💀 ${player.kills}</div>
                </div>
            `;

            hud.appendChild(playerHud);
        });
    }

    updateTimer() {
        if (!this.gameStartTime) return;

        const elapsed = Math.floor((Date.now() - this.gameStartTime) / 1000);
        const remaining = Math.max(0, this.gameDuration - elapsed);

        const minutes = Math.floor(remaining / 60);
        const seconds = remaining % 60;

        document.getElementById('gameTimer').textContent =
            `${minutes}:${seconds.toString().padStart(2, '0')}`;

        if (remaining === 0) {
            this.endGame();
        }
    }

    updatePlayerStatsHUD() {
        if (!this.localPlayer) return;

        // Update bombs count (available / max)
        const bombsAvailable = this.localPlayer.maxBombs - this.localPlayer.currentBombs;
        document.getElementById('bombsCount').textContent =
            `${bombsAvailable}/${this.localPlayer.maxBombs}`;

        // Update bomb range
        document.getElementById('bombRange').textContent = this.localPlayer.bombRange;

        // Update speed
        document.getElementById('playerSpeed').textContent = this.localPlayer.speed.toFixed(1);

        // Show/hide kick ability
        const kickStat = document.getElementById('kickStat');
        if (this.localPlayer.canKickBombs) {
            kickStat.style.display = 'flex';
        } else {
            kickStat.style.display = 'none';
        }

        // Show/hide invincibility
        const invincibleStat = document.getElementById('invincibleStat');
        if (this.localPlayer.invincible) {
            const remaining = Math.max(0, Math.ceil((this.localPlayer.invincibleUntil - Date.now()) / 1000));
            document.getElementById('invincibleTime').textContent = `${remaining}s`;
            invincibleStat.style.display = 'flex';
        } else {
            invincibleStat.style.display = 'none';
        }
    }

    addKillFeedMessage(killerName, victimName, isSuicide = false) {
        const killFeed = document.getElementById('killFeed');
        const message = document.createElement('div');
        message.className = `kill-message ${isSuicide ? 'suicide' : 'kill'}`;

        if (isSuicide) {
            message.innerHTML = `
                <span class="kill-icon">💀</span>
                <span><strong>${victimName}</strong> s'est fait exploser</span>
            `;
        } else {
            message.innerHTML = `
                <span class="kill-icon">🔥</span>
                <span><strong>${killerName}</strong> a éliminé <strong>${victimName}</strong></span>
            `;
        }

        killFeed.appendChild(message);

        // Remove after 5 seconds
        setTimeout(() => {
            if (message.parentNode === killFeed) {
                killFeed.removeChild(message);
            }
        }, 5000);

        // Keep only last 5 messages
        while (killFeed.children.length > 5) {
            killFeed.removeChild(killFeed.firstChild);
        }
    }

    checkGameEnd() {
        if (!this.gameRunning) return;

        const alivePlayers = Array.from(this.players.values()).filter(p => p.alive);
        const totalPlayers = this.players.size;

        // Don't check totalPlayers < 2 during gameplay - players are syncing
        // Only check alive players to determine winner
        if (totalPlayers === 0) {
            return; // No players loaded yet
        }

        // Use debouncing to prevent false positives from network lag
        // Only end game if alive count is stable for at least 1.5 seconds
        if (alivePlayers.length !== this.lastAliveCount) {
            // Alive count changed, reset the timer
            this.lastAliveCount = alivePlayers.length;
            this.stableAliveCountDuration = 0;

            // Clear any pending game end
            if (this.gameEndCheckTimer) {
                clearTimeout(this.gameEndCheckTimer);
                this.gameEndCheckTimer = null;
            }

            console.log(`🏁 Alive count changed: ${alivePlayers.length}/${totalPlayers} players alive`);
        } else {
            // Alive count is stable, increment duration
            this.stableAliveCountDuration += 1/60; // Approximate frame time
        }

        // Game end conditions:
        // - Game requires 2-10 players to have started
        // - Game ends when only 1 or 0 players remain alive
        // - Must be stable for 1.5 seconds to prevent false positives
        if (alivePlayers.length <= 1 && totalPlayers >= 2 && this.stableAliveCountDuration >= 1.5) {
            if (!this.gameEndCheckTimer) {
                console.log('🏆 Game ending: winner determined (1 or 0 players left, stable for 1.5s)');
                this.gameEndCheckTimer = setTimeout(() => {
                    this.endGame();
                }, 1000);
            }
        }
    }

    async endGame() {
        if (!this.gameRunning) return;

        this.gameRunning = false;

        // Clear game end check timer
        if (this.gameEndCheckTimer) {
            clearTimeout(this.gameEndCheckTimer);
            this.gameEndCheckTimer = null;
        }
        this.lastAliveCount = 0;
        this.stableAliveCountDuration = 0;

        // Determine winner
        const alivePlayers = Array.from(this.players.values()).filter(p => p.alive);
        let winner = null;

        if (alivePlayers.length === 1) {
            winner = alivePlayers[0];
        } else {
            // Winner by most kills
            winner = Array.from(this.players.values()).reduce((prev, current) =>
                (prev.kills > current.kills) ? prev : current
            );
        }

        // Update stats
        if (this.localPlayer) {
            // Mark room as finished so it can be cleaned up
            try {
                await this.network.finishGame(this.roomCode);
            } catch (err) {
                console.warn('Failed to mark room as finished:', err);
            }
            await this.network.updateStats(
                winner && winner.id === this.localPlayerId,
                this.localPlayer.kills,
                this.localPlayer.deaths
            );
        }

        // Show game over screen
        this.showGameOver(winner);
    }

    showGameOver(winner) {
        const modal = document.getElementById('gameOverModal');
        modal.classList.remove('hidden');

        document.getElementById('gameOverTitle').textContent =
            winner && winner.id === this.localPlayerId ? '🎉 Victory!' : 'Game Over';

        document.getElementById('winnerDisplay').textContent = `${winner.username} Wins!`;

        // Show scores
        const scoresEl = document.getElementById('finalScores');
        scoresEl.innerHTML = '';

        const sortedPlayers = Array.from(this.players.values()).sort((a, b) => b.kills - a.kills);

        sortedPlayers.forEach((player, index) => {
            const scoreItem = document.createElement('div');
            scoreItem.className = 'score-item';
            if (player.id === winner.id) scoreItem.classList.add('winner');

            scoreItem.innerHTML = `
                <span>#${index + 1} ${player.username}</span>
                <span>${player.kills} kills / ${player.deaths} deaths</span>
            `;

            scoresEl.appendChild(scoreItem);
        });
    }

    render() {
        if (!this.gameRunning) return;

        const gameState = {
            grid: this.grid,
            players: Array.from(this.players.values()),
            bombs: Array.from(this.bombs.values()),
            explosions: this.explosions,
            powerups: Array.from(this.powerups.values())
        };

        this.renderer.render(gameState);
    }

    toggleEmoteMenu() {
        const menu = document.getElementById('emotesMenu');
        menu.classList.toggle('hidden');
    }

    showEmote(emote) {
        if (this.localPlayer) {
            this.localPlayer.showEmote(emote);
        }
    }

    togglePauseMenu() {
        const menu = document.getElementById('pauseMenu');
        menu.classList.toggle('hidden');
    }

    quitGame() {
        this.network.leaveRoom(this.roomCode);
        window.location.href = 'index.html';
    }

    backToLobby() {
        window.location.href = 'index.html';
    }

    playAgain() {
        const isHost = this.roomHostId === this.localPlayerId;

        const finalizeRedirect = () => {
            const target = `index.html?room=${this.roomCode}`;
            window.location.href = target;
        };

        if (isHost) {
            this.network.resetGame(this.roomCode)
                .catch(err => console.error('Failed to reset game for replay:', err))
                .finally(() => finalizeRedirect());
        } else {
            finalizeRedirect();
        }
    }

    /**
     * Update input delay based on speed power-ups
     */
    recalculateMoveDelay() {
        if (!this.localPlayer) {
            this.moveDelay = this.baseMoveDelay;
            return;
        }

        const bonus = Math.max(0, this.localPlayer.speed - 2);
        this.moveDelay = Math.max(this.minMoveDelay, Math.round(this.baseMoveDelay - bonus * 20));
    }

    /**
     * Sync local player state to network (throttled)
     */
    syncLocalPlayerState() {
        const now = Date.now();

        if (now - this.lastSyncTime >= this.syncDelay) {
            // Sync immediately
            this.lastSyncTime = now;
            this.network.updatePlayerState(this.roomCode, this.localPlayer.serialize())
                .catch(err => console.error('Failed to sync player state:', err));
        } else if (!this.pendingSync) {
            // Schedule sync
            this.pendingSync = true;
            setTimeout(() => {
                this.pendingSync = false;
                this.lastSyncTime = Date.now();
                this.network.updatePlayerState(this.roomCode, this.localPlayer.serialize())
                    .catch(err => console.error('Failed to sync player state:', err));
            }, this.syncDelay - (now - this.lastSyncTime));
        }
    }

    /**
     * Load local player's custom skins from localStorage
     */
    loadLocalPlayerSkins() {
        if (!this.localPlayer) return;

        const characterSkin = localStorage.getItem('bomberman_custom_character_skin');
        if (characterSkin) {
            this.localPlayer.setCustomSkin('character', characterSkin);
            console.log('✅ Loaded custom character skin for local player');
        }

        const bombSkin = localStorage.getItem('bomberman_custom_bomb_skin');
        if (bombSkin) {
            this.localPlayer.setCustomSkin('bomb', bombSkin);
            console.log('✅ Loaded custom bomb skin for local player');
        }

        // Sync to network
        if (characterSkin || bombSkin) {
            this.syncLocalPlayerState();
        }
    }

    playSound(type) {
        // TODO: Implement sound effects
        console.log('Play sound:', type);
    }

    cleanup() {
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
        }
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }
        this.network.removeAllListeners();
    }
}

// Initialize when DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.gameManager = new GameManager();
    });
} else {
    window.gameManager = new GameManager();
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (window.gameManager) {
        window.gameManager.cleanup();
    }
});

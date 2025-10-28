import {
    ref,
    set,
    get,
    update,
    remove,
    onValue,
    onDisconnect,
    push,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-database.js";

import {
    doc,
    setDoc,
    getDoc,
    getDocs,
    updateDoc,
    collection,
    query,
    where,
    orderBy,
    limit,
    increment,
    Timestamp
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

import { signInAnonymously, getAuth } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";

const safeObjectValues = (value) => (value && typeof value === 'object') ? Object.values(value) : [];
const PLAYER_CACHE_KEY_PREFIX = 'bomberman_player_';

/**
 * Network Manager - Handles all Firebase operations
 */
export class NetworkManager {
    constructor(database, firestore) {
        this.database = database;
        this.firestore = firestore;
        this.auth = getAuth();
        this.userId = null;
        this.username = null;
        this.listeners = {};
    }

    /**
     * Initialize and authenticate user
     */
    async initialize() {
        try {
            // Sign in anonymously
            const userCredential = await signInAnonymously(this.auth);
            this.userId = userCredential.user.uid;

            // Get or create user profile
            await this.initializeUserProfile();

            // Setup presence system
            await this.setupPresence();

            // Start periodic room cleanup
            this.startRoomCleanup();

            return this.userId;
        } catch (error) {
            console.error("Network initialization error:", error);
            throw error;
        }
    }

    /**
     * Initialize user profile in Firestore
     */
    async initializeUserProfile() {
        const username = localStorage.getItem('bomberman_username') || `Player${Math.floor(Math.random() * 9999)}`;
        this.username = username;

        const userRef = doc(this.firestore, 'users', this.userId);
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
            // Create new user profile
            await setDoc(userRef, {
                username: username,
                elo: 1000,
                rank: 'Bronze',
                createdAt: Timestamp.now(),
                gamesPlayed: 0,
                wins: 0,
                kills: 0,
                deaths: 0
            });
        } else {
            // Update username if changed
            const data = userSnap.data();
            if (data.username !== username) {
                await updateDoc(userRef, { username });
            }
        }
    }

    /**
     * Setup presence system (online/offline)
     */
    async setupPresence() {
        const presenceRef = ref(this.database, `presence/${this.userId}`);

        // Set user as online
        await set(presenceRef, {
            online: true,
            lastSeen: serverTimestamp(),
            username: this.username
        });

        // Remove presence on disconnect
        onDisconnect(presenceRef).remove();
    }

    // ==================== ROOM MANAGEMENT ====================

    /**
     * Create a new game room
     */
    async createRoom(settings = {}) {
        const roomCode = this.generateRoomCode();
        const roomRef = ref(this.database, `rooms/${roomCode}`);

        const roomData = {
            code: roomCode,
            host: this.userId,
            status: 'waiting', // waiting, playing, finished
            settings: {
                map: settings.map || 'medium',
                duration: settings.duration || 300,
                powerupDensity: settings.powerupDensity || 'medium',
                powerups: settings.powerups !== false,
                maxPlayers: settings.maxPlayers || 10 // Support 2-10 players
            },
            players: {
                [this.userId]: {
                    id: this.userId,
                    username: this.username,
                    ready: false,
                    colorIndex: 0,
                    skins: {
                        character: 'classic',
                        bomb: 'classic'
                    },
                    disconnected: false
                }
            },
            createdAt: serverTimestamp(),
            startedAt: null
        };

        await set(roomRef, roomData);
        // Ensure the host player entry is removed on disconnect
        const playerRef = ref(this.database, `rooms/${roomCode}/players/${this.userId}`);
        onDisconnect(playerRef).remove();
        this.cachePlayerData(roomCode, roomData.players[this.userId]);
        return roomCode;
    }

    /**
     * Join an existing room
     */
    async joinRoom(roomCode) {
        const roomRef = ref(this.database, `rooms/${roomCode}`);
        const snapshot = await get(roomRef);

        if (!snapshot.exists()) {
            throw new Error('Room not found');
        }

        const roomData = snapshot.val();
        const settings = (roomData.settings && typeof roomData.settings === 'object') ? roomData.settings : {};

        if (roomData.status !== 'waiting') {
            throw new Error('Game already in progress');
        }

        const playerCount = Object.keys(roomData.players || {}).length;
        if (playerCount >= (settings.maxPlayers || 10)) {
            throw new Error('Room is full');
        }

        // Minimum 2 players check will be done at game start
        if (playerCount >= 10) {
            throw new Error('Maximum 10 players allowed');
        }

        // Find available color index
        const usedColors = safeObjectValues(roomData.players).map(p => p.colorIndex);
        let colorIndex = 0;
        for (let i = 0; i < 4; i++) {
            if (!usedColors.includes(i)) {
                colorIndex = i;
                break;
            }
        }

        // Add player to room with default skins
        const playerRef = ref(this.database, `rooms/${roomCode}/players/${this.userId}`);
        await set(playerRef, {
            id: this.userId,
            username: this.username,
            ready: false,
            colorIndex: colorIndex,
            skins: {
                character: 'classic',
                bomb: 'classic'
            },
            disconnected: false
        });

        // Remove this player entry on disconnect
        onDisconnect(playerRef).remove();
        this.cachePlayerData(roomCode, {
            id: this.userId,
            username: this.username,
            ready: false,
            colorIndex: colorIndex,
            skins: {
                character: 'classic',
                bomb: 'classic'
            },
            disconnected: false
        });

        return roomData;
    }

    /**
     * Leave a room
     */
    async leaveRoom(roomCode) {
        const playerRef = ref(this.database, `rooms/${roomCode}/players/${this.userId}`);
        await remove(playerRef);
        this.clearCachedPlayerData(roomCode);
        // After removing the player, check room state and cleanup if needed
        const roomRef = ref(this.database, `rooms/${roomCode}`);
        const snapshot = await get(roomRef);

        if (snapshot.exists()) {
            const roomData = snapshot.val();
            const players = roomData.players || {};
            const remainingPlayers = Object.keys(players);

            if (remainingPlayers.length === 0) {
                // Delete room if empty
                await remove(roomRef);
            } else if (roomData.host === this.userId) {
                // Transfer host to another player
                await update(roomRef, { host: remainingPlayers[0] });
            }
        }
    }

    /**
     * Toggle ready status
     */
    async toggleReady(roomCode) {
        const playerRef = ref(this.database, `rooms/${roomCode}/players/${this.userId}`);
        const snapshot = await get(playerRef);

        if (snapshot.exists()) {
            const playerData = snapshot.val();
            const newReady = !playerData.ready;
            await update(playerRef, { ready: newReady });
            this.cachePlayerData(roomCode, { ...playerData, ready: newReady });
            return newReady;
        }

        return false;
    }

    /**
     * Update player skins
     */
    async updatePlayerSkins(roomCode, skins) {
        const playerRef = ref(this.database, `rooms/${roomCode}/players/${this.userId}`);
        await update(playerRef, { skins });
        const cached = this.getCachedPlayerData(roomCode) || {};
        this.cachePlayerData(roomCode, {
            ...cached,
            id: this.userId,
            username: this.username,
            skins,
            disconnected: false
        });
    }

    /**
     * Update room settings (host only)
     */
    async updateRoomSettings(roomCode, settings) {
        const settingsRef = ref(this.database, `rooms/${roomCode}/settings`);
        await update(settingsRef, settings);
    }

    /**
     * Start game (host only)
     */
    async startGame(roomCode) {
        const roomRef = ref(this.database, `rooms/${roomCode}`);
        await update(roomRef, {
            status: 'playing',
            startedAt: serverTimestamp()
        });
    }

    /**
     * Mark room as finished (called when game ends)
     */
    async finishGame(roomCode) {
        const roomRef = ref(this.database, `rooms/${roomCode}`);
        await update(roomRef, {
            status: 'finished',
            finishedAt: serverTimestamp()
        });
    }

    /**
     * Get list of public rooms
     */
    async getPublicRooms() {
        const roomsRef = ref(this.database, 'rooms');
        const snapshot = await get(roomsRef);

        if (!snapshot.exists()) return [];

        const rooms = [];
        snapshot.forEach(childSnapshot => {
            const room = childSnapshot.val();
            if (room.status === 'waiting') {
                rooms.push({
                    code: room.code,
                    host: room.players[room.host]?.username || 'Unknown',
                    playerCount: Object.keys(room.players || {}).length,
                    maxPlayers: room.settings.maxPlayers,
                    map: room.settings.map
                });
            }
        });

        return rooms;
    }

    // ==================== GAME STATE ====================

    /**
     * Update player state (position, alive status, etc.)
     */
    async updatePlayerState(roomCode, playerData) {
        const playerRef = ref(this.database, `rooms/${roomCode}/gameState/players/${this.userId}`);
        await set(playerRef, {
            ...playerData,
            lastUpdate: serverTimestamp()
        });
    }

    /**
     * Update player position (legacy alias)
     */
    async updatePlayerPosition(roomCode, playerData) {
        return this.updatePlayerState(roomCode, playerData);
    }

    /**
     * Mark player as dead
     */
    async killPlayer(roomCode, playerId, killerData) {
        const playerRef = ref(this.database, `rooms/${roomCode}/gameState/players/${playerId}`);
        await update(playerRef, {
            alive: false,
            deaths: killerData.deaths,
            lastUpdate: serverTimestamp()
        });

        // Update killer's kills if different player
        if (killerData.killerId && killerData.killerId !== playerId) {
            const killerRef = ref(this.database, `rooms/${roomCode}/gameState/players/${killerData.killerId}`);
            await update(killerRef, {
                kills: killerData.kills,
                lastUpdate: serverTimestamp()
            });
        }
    }

    /**
     * Place a bomb
     */
    async placeBomb(roomCode, bombData) {
        const bombRef = ref(this.database, `rooms/${roomCode}/gameState/bombs/${bombData.id}`);
        await set(bombRef, {
            ...bombData,
            timestamp: serverTimestamp()
        });
    }

    /**
     * Move bomb (kicked by player)
     */
    async moveBomb(roomCode, bombId, position) {
        const bombRef = ref(this.database, `rooms/${roomCode}/gameState/bombs/${bombId}`);
        await update(bombRef, {
            ...position,
            lastMove: serverTimestamp()
        });
    }

    /**
     * Trigger explosion
     */
    async triggerExplosion(roomCode, explosionData) {
        const explosionRef = push(ref(this.database, `rooms/${roomCode}/gameState/explosions`));
        await set(explosionRef, {
            ...explosionData,
            timestamp: serverTimestamp()
        });

        // Remove after 1 second
        setTimeout(() => {
            remove(explosionRef);
        }, 1000);
    }

    /**
     * Remove bomb
     */
    async removeBomb(roomCode, bombId) {
        const bombRef = ref(this.database, `rooms/${roomCode}/gameState/bombs/${bombId}`);
        await remove(bombRef);
    }

    /**
     * Update grid (destroy tiles)
     */
    async updateGrid(roomCode, grid) {
        const gridRef = ref(this.database, `rooms/${roomCode}/gameState/grid`);
        await set(gridRef, grid);
    }

    /**
     * Reset room after a game finishes
     */
    async resetGame(roomCode) {
        if (!roomCode) return;

        const roomRef = ref(this.database, `rooms/${roomCode}`);
        await update(roomRef, {
            status: 'waiting',
            startedAt: null,
            finishedAt: null
        });

        const gameStateRef = ref(this.database, `rooms/${roomCode}/gameState`);
        await remove(gameStateRef);

        const playersRef = ref(this.database, `rooms/${roomCode}/players`);
        const snapshot = await get(playersRef);
        if (snapshot.exists()) {
            const updates = [];
            snapshot.forEach(child => {
                const playerRef = ref(this.database, `rooms/${roomCode}/players/${child.key}`);
                updates.push(update(playerRef, {
                    ready: false,
                    disconnected: false
                }));
            });

            if (updates.length) {
                await Promise.all(updates);
            }
        }
    }

    /**
     * Write initial game state when a match starts (host only)
     */
    async initializeGameState(roomCode, playersState) {
        if (!roomCode) return;
        const gameStateRef = ref(this.database, `rooms/${roomCode}/gameState`);
        await set(gameStateRef, {
            players: playersState,
            bombs: {},
            powerups: {},
            explosions: {}
        });
    }

    /**
     * Spawn power-up
     */
    async spawnPowerUp(roomCode, powerUpData) {
        const powerUpRef = ref(this.database, `rooms/${roomCode}/gameState/powerups/${powerUpData.id}`);
        await set(powerUpRef, powerUpData);
    }

    /**
     * Collect power-up
     */
    async collectPowerUp(roomCode, powerUpId) {
        const powerUpRef = ref(this.database, `rooms/${roomCode}/gameState/powerups/${powerUpId}`);
        await remove(powerUpRef);
    }

    // ==================== CHAT ====================

    /**
     * Send global chat message
     */
    async sendGlobalChat(message) {
        const chatRef = push(ref(this.database, 'globalChat'));
        await set(chatRef, {
            user: this.username,
            userId: this.userId,
            message: message,
            timestamp: serverTimestamp()
        });
    }

    /**
     * Send room chat message
     */
    async sendRoomChat(roomCode, message) {
        const chatRef = push(ref(this.database, `rooms/${roomCode}/chat`));
        await set(chatRef, {
            user: this.username,
            userId: this.userId,
            message: message,
            timestamp: serverTimestamp()
        });
    }

    // ==================== STATS (FIRESTORE) ====================

    /**
     * Get user profile
     */
    async getUserProfile(userId = this.userId) {
        const userRef = doc(this.firestore, 'users', userId);
        const userSnap = await getDoc(userRef);
        return userSnap.exists() ? userSnap.data() : null;
    }

    /**
     * Update user stats after game
     */
    async updateStats(winner, kills, deaths) {
        const userRef = doc(this.firestore, 'users', this.userId);

        await updateDoc(userRef, {
            gamesPlayed: increment(1),
            wins: winner ? increment(1) : increment(0),
            kills: increment(kills),
            deaths: increment(deaths),
            elo: increment(winner ? 25 : -10)
        });

        // Update rank based on ELO
        const userSnap = await getDoc(userRef);
        const userData = userSnap.data();
        const rank = this.calculateRank(userData.elo);

        if (userData.rank !== rank) {
            await updateDoc(userRef, { rank });
        }

        return userData;
    }

    /**
     * Save match to history
     */
    async saveMatch(roomCode, players, winner, duration) {
        const matchRef = doc(collection(this.firestore, 'matches'));
        await setDoc(matchRef, {
            roomCode: roomCode,
            players: players.map(p => ({
                id: p.id,
                username: p.username,
                kills: p.kills,
                deaths: p.deaths
            })),
            winner: winner,
            duration: duration,
            timestamp: Timestamp.now()
        });
    }

    /**
     * Get leaderboard
     */
    async getLeaderboard(limitCount = 10) {
        const usersRef = collection(this.firestore, 'users');
        const q = query(usersRef, orderBy('elo', 'desc'), limit(limitCount));
        const snapshot = await getDocs(q);

        const leaderboard = [];
        snapshot.forEach(doc => {
            leaderboard.push({
                id: doc.id,
                ...doc.data()
            });
        });

        return leaderboard;
    }

    /**
     * Calculate rank from ELO
     */
    calculateRank(elo) {
        if (elo >= 2000) return 'Diamond';
        if (elo >= 1500) return 'Platinum';
        if (elo >= 1200) return 'Gold';
        if (elo >= 900) return 'Silver';
        return 'Bronze';
    }

    // ==================== LISTENERS ====================

    /**
     * Listen to room changes
     */
    listenToRoom(roomCode, callback) {
        const roomRef = ref(this.database, `rooms/${roomCode}`);
        const unsubscribe = onValue(roomRef, snapshot => {
            if (snapshot.exists()) {
                callback(snapshot.val());
            } else {
                callback(null);
            }
        });

        this.listeners[`room_${roomCode}`] = unsubscribe;
        return unsubscribe;
    }

    /**
     * Periodic cleanup: remove empty or stale/finished rooms
     */
    startRoomCleanup(intervalMs = 60000) {
        // Avoid starting multiple intervals
        if (this._roomCleanupInterval) return;

        this._roomCleanupInterval = setInterval(async () => {
            try {
                await this.cleanupRooms();
            } catch (err) {
                console.error('Room cleanup error:', err);
            }
        }, intervalMs);
    }

    async cleanupRooms() {
        const roomsRef = ref(this.database, 'rooms');
        const snapshot = await get(roomsRef);
        if (!snapshot.exists()) return;

        const finishedTTL = 60 * 1000; // 1 minute after finished -> delete
        const staleTTL = 24 * 60 * 60 * 1000; // 24 hours for very stale rooms

        const now = Date.now();

        snapshot.forEach(childSnapshot => {
            const room = childSnapshot.val();
            const code = childSnapshot.key;
            const roomRef = ref(this.database, `rooms/${code}`);

            // Delete if no players
            const players = room.players || {};
            if (Object.keys(players).length === 0) {
                remove(roomRef).catch(err => console.error('Failed to remove empty room', code, err));
                return;
            }

            // Delete if finished and older than TTL
            if (room.status === 'finished' && room.finishedAt) {
                const finishedAt = room.finishedAt;
                if (now - finishedAt > finishedTTL) {
                    remove(roomRef).catch(err => console.error('Failed to remove finished room', code, err));
                    return;
                }
            }

            // Very stale room (created long ago) with no activity
            if (room.createdAt && (now - room.createdAt > staleTTL)) {
                remove(roomRef).catch(err => console.error('Failed to remove stale room', code, err));
                return;
            }
        });
    }

    /**
     * Listen to game state
     */
    listenToGameState(roomCode, callback) {
        const gameStateRef = ref(this.database, `rooms/${roomCode}/gameState`);
        const unsubscribe = onValue(gameStateRef, snapshot => {
            callback(snapshot.val() || {});
        });

        this.listeners[`gameState_${roomCode}`] = unsubscribe;
        return unsubscribe;
    }

    /**
     * Listen to chat
     */
    listenToChat(roomCode, callback) {
        const chatRef = ref(this.database, roomCode ? `rooms/${roomCode}/chat` : 'globalChat');
        const unsubscribe = onValue(chatRef, snapshot => {
            const messages = [];
            snapshot.forEach(childSnapshot => {
                messages.push({
                    id: childSnapshot.key,
                    ...childSnapshot.val()
                });
            });
            callback(messages);
        });

        this.listeners[`chat_${roomCode || 'global'}`] = unsubscribe;
        return unsubscribe;
    }

    /**
     * Remove all listeners
     */
    removeAllListeners() {
        safeObjectValues(this.listeners).forEach(unsubscribe => {
            if (typeof unsubscribe === 'function') {
                unsubscribe();
            }
        });
        this.listeners = {};
    }

    // ==================== UTILITIES ====================

    /**
     * Cache the local player's room data to survive page reloads
     */
    cachePlayerData(roomCode, playerData) {
        if (typeof localStorage === 'undefined' || !roomCode || !playerData) return;
        try {
            const key = `${PLAYER_CACHE_KEY_PREFIX}${roomCode}`;
            localStorage.setItem(key, JSON.stringify(playerData));
        } catch (error) {
            console.warn('Failed to cache player data', error);
        }
    }

    /**
     * Retrieve cached player data for this room
     */
    getCachedPlayerData(roomCode) {
        if (typeof localStorage === 'undefined' || !roomCode) return null;
        const key = `${PLAYER_CACHE_KEY_PREFIX}${roomCode}`;
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        try {
            return JSON.parse(raw);
        } catch (error) {
            console.warn('Failed to parse cached player data', error);
            return null;
        }
    }

    /**
     * Clear cached player data
     */
    clearCachedPlayerData(roomCode) {
        if (typeof localStorage === 'undefined' || !roomCode) return;
        const key = `${PLAYER_CACHE_KEY_PREFIX}${roomCode}`;
        localStorage.removeItem(key);
    }

    /**
     * Ensure the local player entry exists in the room after navigation
     */
    async ensurePlayerInRoom(roomCode) {
        if (!roomCode || !this.userId) return null;

        const playerPath = `rooms/${roomCode}/players/${this.userId}`;
        const playerRef = ref(this.database, playerPath);
        const currentSnapshot = await get(playerRef);

        if (currentSnapshot.exists()) {
            const existingData = currentSnapshot.val();
            const updates = {};
            let requiresUpdate = false;

            if (existingData.username !== this.username) {
                updates.username = this.username;
                requiresUpdate = true;
            }
            if (existingData.disconnected) {
                updates.disconnected = false;
                requiresUpdate = true;
            }

            if (requiresUpdate) {
                await update(playerRef, updates);
                Object.assign(existingData, updates);
            }

            onDisconnect(playerRef).remove();
            this.cachePlayerData(roomCode, existingData);
            return existingData;
        }

        const roomRef = ref(this.database, `rooms/${roomCode}`);
        const roomSnapshot = await get(roomRef);
        if (!roomSnapshot.exists()) {
            throw new Error('Room not found');
        }

        const roomData = roomSnapshot.val();
        const players = roomData.players || {};
        const cachedData = this.getCachedPlayerData(roomCode);

        const usedColors = safeObjectValues(players)
            .map(p => (p && typeof p.colorIndex === 'number') ? p.colorIndex : null)
            .filter(color => color !== null);

        let colorIndex = cachedData && typeof cachedData.colorIndex === 'number'
            ? cachedData.colorIndex
            : 0;

        if (usedColors.includes(colorIndex)) {
            for (let i = 0; i < 4; i++) {
                if (!usedColors.includes(i)) {
                    colorIndex = i;
                    break;
                }
            }
        }

        const playerData = {
            id: this.userId,
            username: this.username,
            ready: (cachedData && typeof cachedData.ready === 'boolean') ? cachedData.ready : false,
            colorIndex,
            skins: (cachedData && cachedData.skins) || (players[this.userId] && players[this.userId].skins) || {
                character: 'classic',
                bomb: 'classic'
            },
            disconnected: false
        };

        await set(playerRef, playerData);
        onDisconnect(playerRef).remove();
        this.cachePlayerData(roomCode, playerData);

        return playerData;
    }

    /**
     * Generate random room code
     */
    generateRoomCode() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let code = '';
        for (let i = 0; i < 6; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    }

    /**
     * Get current user ID
     */
    getUserId() {
        return this.userId;
    }

    /**
     * Get current username
     */
    getUsername() {
        return this.username;
    }

    /**
     * Update username
     */
    async updateUsername(newUsername) {
        this.username = newUsername;
        localStorage.setItem('bomberman_username', newUsername);

        if (this.userId) {
            const userRef = doc(this.firestore, 'users', this.userId);
            await updateDoc(userRef, { username: newUsername });
        }
    }
}

import { NetworkManager } from './network.js';
import { AuthManager } from './auth.js';

/**
 * Lobby Manager - Handles lobby UI and room management
 */
class LobbyManager {
    constructor() {
        this.auth = null;
        this.network = null;
        this.currentRoom = null;
        this.currentRoomCode = null;
        this.roomListener = null;
        this.chatListener = null;
        this.isLoginMode = true;

        this.init();
    }

    async init() {
        // Wait for Firebase to be loaded
        await this.waitForFirebase();

        // Initialize auth
        this.auth = new AuthManager(window.firestore);
        this.setupAuthUI();

        // Listen for auth state changes
        this.auth.initialize(async (user) => {
            if (user) {
                await this.onUserSignedIn();
            } else {
                this.showLoginModal();
            }
        });
    }

    async waitForFirebase() {
        let attempts = 0;
        while (!window.database || !window.firestore) {
            if (attempts++ > 50) throw new Error('Firebase not loaded');
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    setupAuthUI() {
        // Google Sign-In
        document.getElementById('googleSignInBtn').addEventListener('click', async () => {
            try {
                this.hideAuthError();
                await this.auth.signInWithGoogle();
            } catch (error) {
                this.showAuthError(error.message);
            }
        });

        // Email Sign-In
        document.getElementById('emailSignInBtn').addEventListener('click', async () => {
            try {
                this.hideAuthError();
                const email = document.getElementById('loginEmail').value.trim();
                const password = document.getElementById('loginPassword').value;

                if (!email || !password) {
                    this.showAuthError('Veuillez remplir tous les champs');
                    return;
                }

                await this.auth.signInWithEmail(email, password);
            } catch (error) {
                this.showAuthError(error.message);
            }
        });

        // Email Register
        document.getElementById('emailRegisterBtn').addEventListener('click', async () => {
            try {
                this.hideAuthError();
                const username = document.getElementById('registerUsername').value.trim();
                const email = document.getElementById('registerEmail').value.trim();
                const password = document.getElementById('registerPassword').value;

                if (!username || !email || !password) {
                    this.showAuthError('Veuillez remplir tous les champs');
                    return;
                }

                if (username.length < 3 || username.length > 12) {
                    this.showAuthError('Le nom doit contenir entre 3 et 12 caractères');
                    return;
                }

                await this.auth.createAccountWithEmail(email, password, username);
            } catch (error) {
                this.showAuthError(error.message);
            }
        });

        // Guest Sign-In
        document.getElementById('guestSignInBtn').addEventListener('click', async () => {
            try {
                this.hideAuthError();
                await this.auth.signInAnonymously();
            } catch (error) {
                this.showAuthError(error.message);
            }
        });

        // Toggle between login and register
        document.getElementById('toggleAuthMode').addEventListener('click', () => {
            this.isLoginMode = !this.isLoginMode;

            const loginForm = document.getElementById('emailLoginForm');
            const registerForm = document.getElementById('emailRegisterForm');
            const authModeText = document.getElementById('authModeText');

            if (this.isLoginMode) {
                loginForm.classList.remove('hidden');
                registerForm.classList.add('hidden');
                authModeText.textContent = "Pas encore de compte ? Inscrivez-vous";
            } else {
                loginForm.classList.add('hidden');
                registerForm.classList.remove('hidden');
                authModeText.textContent = 'Vous avez un compte ? Connectez-vous';
            }

            this.hideAuthError();
        });

        // Enter key support
        document.getElementById('loginPassword').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') document.getElementById('emailSignInBtn').click();
        });

        document.getElementById('registerPassword').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') document.getElementById('emailRegisterBtn').click();
        });
    }

    async onUserSignedIn() {
        console.log('User signed in:', this.auth.getUserId());

        // Hide login modal
        this.hideLoginModal();

        // Initialize network if not already done
        if (!this.network) {
            this.network = new NetworkManager(window.database, window.firestore);
            await this.network.initialize();
            console.log('Network initialized:', this.network.getUserId());
        }

        // Setup UI
        this.setupUI();
        this.loadUserProfile();
        this.loadLeaderboard();
        this.loadPublicRooms();
        this.setupGlobalChat();

        // Auto-save username
        this.setupAutoSave();

        // Check for room code in URL
        this.checkURLForRoomCode();
    }

    /**
     * Check URL for room code and auto-join if present
     */
    checkURLForRoomCode() {
        const urlParams = new URLSearchParams(window.location.search);
        const roomCodeFromQuery = urlParams.get('room');

        // Check both query parameter (?room=CODE) and path (bomberman/CODE)
        const pathParts = window.location.pathname.split('/').filter(part => part);
        const lastPathPart = pathParts[pathParts.length - 1];

        // Room code is 6 alphanumeric characters
        const roomCodePattern = /^[A-Z0-9]{6}$/;

        let roomCode = null;

        if (roomCodeFromQuery && roomCodePattern.test(roomCodeFromQuery.toUpperCase())) {
            roomCode = roomCodeFromQuery.toUpperCase();
        } else if (lastPathPart && roomCodePattern.test(lastPathPart.toUpperCase())) {
            roomCode = lastPathPart.toUpperCase();
        }

        if (roomCode) {
            console.log('Auto-joining room from URL:', roomCode);
            // Small delay to ensure UI is ready
            setTimeout(() => {
                this.joinRoomByCode(roomCode);
            }, 500);
        }
    }

    showLoginModal() {
        document.getElementById('loginModal').classList.remove('hidden');
    }

    hideLoginModal() {
        document.getElementById('loginModal').classList.add('hidden');
    }

    showAuthError(message) {
        const errorDiv = document.getElementById('authError');
        errorDiv.textContent = '⚠️ ' + message;
        errorDiv.classList.remove('hidden');
    }

    hideAuthError() {
        const errorDiv = document.getElementById('authError');
        errorDiv.classList.add('hidden');
        errorDiv.textContent = '';
    }

    setupUI() {
        // Create room
        document.getElementById('createRoomBtn').addEventListener('click', () => this.createRoom());

        // Join room
        document.getElementById('joinRoomBtn').addEventListener('click', () => this.joinRoom());
        document.getElementById('roomCode').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.joinRoom();
        });

        // Chat
        document.getElementById('sendChatBtn').addEventListener('click', () => this.sendGlobalChat());
        document.getElementById('chatInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendGlobalChat();
        });

        // Waiting room
        document.getElementById('leaveRoomBtn').addEventListener('click', () => this.leaveRoom());
        document.getElementById('readyBtn').addEventListener('click', () => this.toggleReady());
        document.getElementById('startGameBtn').addEventListener('click', () => this.startGame());

        // Copy room code
        document.getElementById('copyCodeBtn').addEventListener('click', () => this.copyRoomCode());

        // Room chat
        document.getElementById('sendRoomChatBtn').addEventListener('click', () => this.sendRoomChat());
        document.getElementById('roomChatInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendRoomChat();
        });

        // Settings (host only)
        document.getElementById('mapSelect').addEventListener('change', () => this.updateSettings());
        document.getElementById('durationSelect').addEventListener('change', () => this.updateSettings());
        document.getElementById('powerupsToggle').addEventListener('change', () => this.updateSettings());
    }

    setupAutoSave() {
        const usernameInput = document.getElementById('username');
        const savedUsername = this.auth.getUsername();

        if (savedUsername) {
            usernameInput.value = savedUsername;
        }

        usernameInput.addEventListener('change', async () => {
            const newUsername = usernameInput.value.trim();
            if (newUsername.length >= 3 && newUsername.length <= 12) {
                await this.auth.updateUsername(newUsername);
                await this.network.updateUsername(newUsername);
                this.loadUserProfile();
            } else {
                this.showError('Username must be 3-12 characters');
                usernameInput.value = savedUsername;
            }
        });
    }

    async loadUserProfile() {
        try {
            const profile = await this.auth.getUserProfile();

            if (profile) {
                document.getElementById('userRank').textContent = profile.rank;
                document.getElementById('userElo').textContent = `${profile.elo} ELO`;

                // Update avatar if Google photo available
                if (profile.photoURL) {
                    const avatar = document.getElementById('userAvatar');
                    avatar.innerHTML = `<img src="${profile.photoURL}" alt="Avatar" style="width: 100%; height: 100%; border-radius: 50%;">`;
                }
            }
        } catch (error) {
            console.error('Failed to load profile:', error);
        }
    }

    async loadLeaderboard() {
        try {
            const leaderboard = await this.network.getLeaderboard(10);
            const leaderboardDiv = document.getElementById('leaderboard');

            leaderboardDiv.innerHTML = leaderboard.map((user, index) => `
                <div class="leaderboard-item">
                    <span class="rank">#${index + 1}</span>
                    <span class="username">${user.username}</span>
                    <span class="elo">${user.elo}</span>
                </div>
            `).join('');
        } catch (error) {
            console.error('Failed to load leaderboard:', error);
        }
    }

    async loadPublicRooms() {
        try {
            const rooms = await this.network.getPublicRooms();
            const roomsList = document.getElementById('roomsList');

            if (rooms.length === 0) {
                roomsList.innerHTML = `
                    <div class="empty-state">
                        <p>No public rooms available</p>
                        <p class="hint">Create one to start playing!</p>
                    </div>
                `;
            } else {
                roomsList.innerHTML = rooms.map(room => `
                    <div class="room-card" data-code="${room.code}">
                        <div class="room-info">
                            <h4>${room.host}'s Room</h4>
                            <p class="room-details">
                                <span>👥 ${room.playerCount}/${room.maxPlayers}</span>
                                <span>🗺️ ${room.map}</span>
                            </p>
                        </div>
                        <button class="btn btn-small" onclick="lobbyManager.joinRoomByCode('${room.code}')">Join</button>
                    </div>
                `).join('');
            }

            // Refresh every 5 seconds
            setTimeout(() => this.loadPublicRooms(), 5000);
        } catch (error) {
            console.error('Failed to load public rooms:', error);
            // Retry after error
            setTimeout(() => this.loadPublicRooms(), 10000);
        }
    }

    setupGlobalChat() {
        this.network.listenToChat(null, (messages) => {
            const chatDiv = document.getElementById('globalChat');
            chatDiv.innerHTML = messages.slice(-50).map(msg => `
                <div class="chat-message">
                    <span class="chat-user">${msg.user}:</span>
                    <span class="chat-text">${this.escapeHtml(msg.message)}</span>
                </div>
            `).join('');
            chatDiv.scrollTop = chatDiv.scrollHeight;
        });
    }

    async sendGlobalChat() {
        const input = document.getElementById('chatInput');
        const message = input.value.trim();

        if (message) {
            try {
                await this.network.sendGlobalChat(message);
                input.value = '';
            } catch (error) {
                this.showError('Failed to send message');
            }
        }
    }

    async createRoom() {
        try {
            const roomCode = await this.network.createRoom();
            this.currentRoomCode = roomCode;
            this.showWaitingRoom(roomCode);
            this.listenToRoom(roomCode);
        } catch (error) {
            this.showError('Failed to create room');
        }
    }

    async joinRoom() {
        const roomCode = document.getElementById('roomCode').value.trim().toUpperCase();
        if (roomCode) {
            await this.joinRoomByCode(roomCode);
        }
    }

    async joinRoomByCode(roomCode) {
        try {
            await this.network.joinRoom(roomCode);
            this.currentRoomCode = roomCode;
            this.showWaitingRoom(roomCode);
            this.listenToRoom(roomCode);

            // Clear input field if it exists
            const roomCodeInput = document.getElementById('roomCode');
            if (roomCodeInput) {
                roomCodeInput.value = '';
            }

            // Clean URL after joining (remove room code from URL)
            if (window.history && window.history.replaceState) {
                const cleanUrl = window.location.origin + window.location.pathname;
                window.history.replaceState({}, document.title, cleanUrl);
            }
        } catch (error) {
            this.showError(error.message);
        }
    }

    async leaveRoom() {
        if (this.currentRoomCode) {
            try {
                await this.network.leaveRoom(this.currentRoomCode);
                this.hideWaitingRoom();
                this.currentRoomCode = null;
                this.currentRoom = null;

                // Remove listeners
                if (this.roomListener) this.roomListener();
                if (this.chatListener) this.chatListener();
            } catch (error) {
                console.error('Leave room error:', error);
            }
        }
    }

    async toggleReady() {
        if (this.currentRoomCode) {
            try {
                const ready = await this.network.toggleReady(this.currentRoomCode);
                const btn = document.getElementById('readyBtn');
                btn.textContent = ready ? 'Not Ready' : 'Ready';
                btn.classList.toggle('ready', ready);
            } catch (error) {
                this.showError('Failed to toggle ready');
            }
        }
    }

    async startGame() {
        if (this.currentRoomCode && this.currentRoom) {
            // Check if all players are ready
            const players = Object.values(this.currentRoom.players);
            const allReady = players.every(p => p.ready);

            if (!allReady) {
                this.showError('All players must be ready');
                return;
            }

            try {
                await this.network.startGame(this.currentRoomCode);
                // Redirect to game
                window.location.href = `game.html?room=${this.currentRoomCode}`;
            } catch (error) {
                this.showError('Failed to start game');
            }
        }
    }

    async updateSettings() {
        if (this.currentRoomCode && this.currentRoom?.host === this.network.getUserId()) {
            const settings = {
                map: document.getElementById('mapSelect').value,
                duration: parseInt(document.getElementById('durationSelect').value),
                powerups: document.getElementById('powerupsToggle').checked
            };

            try {
                await this.network.updateRoomSettings(this.currentRoomCode, settings);
            } catch (error) {
                console.error('Failed to update settings:', error);
            }
        }
    }

    listenToRoom(roomCode) {
        this.roomListener = this.network.listenToRoom(roomCode, (room) => {
            if (!room) {
                this.showError('Room closed');
                this.hideWaitingRoom();
                return;
            }

            this.currentRoom = room;
            this.updateWaitingRoom(room);

            // Check if game started
            if (room.status === 'playing') {
                window.location.href = `game.html?room=${roomCode}`;
            }
        });

        // Setup room chat
        this.chatListener = this.network.listenToChat(roomCode, (messages) => {
            const chatDiv = document.getElementById('roomChat');
            chatDiv.innerHTML = messages.map(msg => `
                <div class="chat-message">
                    <span class="chat-user">${msg.user}:</span>
                    <span class="chat-text">${this.escapeHtml(msg.message)}</span>
                </div>
            `).join('');
            chatDiv.scrollTop = chatDiv.scrollHeight;
        });
    }

    showWaitingRoom(roomCode) {
        document.getElementById('displayRoomCode').textContent = roomCode;
        document.getElementById('waitingRoomModal').classList.remove('hidden');
    }

    hideWaitingRoom() {
        document.getElementById('waitingRoomModal').classList.add('hidden');
    }

    updateWaitingRoom(room) {
        const isHost = room.host === this.network.getUserId();
        const playersGrid = document.getElementById('playersGrid');

        // Update players
        const playerSlots = Array(4).fill(null);
        Object.values(room.players).forEach(player => {
            playerSlots[player.colorIndex] = player;
        });

        playersGrid.innerHTML = playerSlots.map((player, index) => {
            if (player) {
                return `
                    <div class="player-slot filled color-${index}">
                        <div class="player-avatar">P${index + 1}</div>
                        <div class="player-name">${player.username}</div>
                        <div class="player-status ${player.ready ? 'ready' : 'not-ready'}">
                            ${player.ready ? '✓ Ready' : '⏳ Waiting'}
                        </div>
                        ${player.id === room.host ? '<div class="host-badge">👑 Host</div>' : ''}
                    </div>
                `;
            } else {
                return `
                    <div class="player-slot empty">
                        <div class="empty-text">Waiting for player...</div>
                    </div>
                `;
            }
        }).join('');

        // Update settings UI
        const settingsDiv = document.getElementById('roomSettings');
        if (isHost) {
            settingsDiv.classList.remove('hidden');
            document.getElementById('mapSelect').value = room.settings.map;
            document.getElementById('durationSelect').value = room.settings.duration;
            document.getElementById('powerupsToggle').checked = room.settings.powerups;
        } else {
            settingsDiv.classList.add('hidden');
        }

        // Update start button
        const startBtn = document.getElementById('startGameBtn');
        const readyBtn = document.getElementById('readyBtn');

        if (isHost) {
            startBtn.classList.remove('hidden');
            readyBtn.classList.add('hidden');
        } else {
            startBtn.classList.add('hidden');
            readyBtn.classList.remove('hidden');

            const myPlayer = room.players[this.network.getUserId()];
            if (myPlayer) {
                readyBtn.textContent = myPlayer.ready ? 'Not Ready' : 'Ready';
                readyBtn.classList.toggle('ready', myPlayer.ready);
            }
        }
    }

    async sendRoomChat() {
        const input = document.getElementById('roomChatInput');
        const message = input.value.trim();

        if (message && this.currentRoomCode) {
            try {
                await this.network.sendRoomChat(this.currentRoomCode, message);
                input.value = '';
            } catch (error) {
                this.showError('Failed to send message');
            }
        }
    }

    copyRoomCode() {
        const roomCode = document.getElementById('displayRoomCode').textContent;

        // Create shareable URL
        const baseUrl = window.location.origin + window.location.pathname.replace(/\/$/, '');
        const shareableUrl = `${baseUrl}?room=${roomCode}`;

        navigator.clipboard.writeText(shareableUrl);

        const btn = document.getElementById('copyCodeBtn');
        const originalText = btn.textContent;
        btn.textContent = '✓';
        btn.title = 'Lien copié !';

        setTimeout(() => {
            btn.textContent = originalText;
            btn.title = 'Copier le lien de la room';
        }, 2000);
    }

    showError(message) {
        alert(message);
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize
const lobbyManager = new LobbyManager();
window.lobbyManager = lobbyManager;

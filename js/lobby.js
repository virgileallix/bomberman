import { NetworkManager } from './network.js';
import { AuthManager } from './auth.js';
import { SkinManager, CHARACTER_SKINS, BOMB_SKINS } from './skins.js';
import { SkinEditor, PremadeSkins } from './skinEditor.js';
import { ModerationManager } from './admin.js';

const safeObjectValues = (value) => (value && typeof value === 'object') ? Object.values(value) : [];

/**
 * Lobby Manager - Handles lobby UI and room management
 */
class LobbyManager {
    constructor() {
        this.auth = null;
        this.network = null;
        this.moderation = null;
        this.skinManager = new SkinManager();
        this.characterEditor = null;
        this.bombEditor = null;
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

            // Initialize moderation system
            this.moderation = new ModerationManager(this.network, this.network.getUserId());

            // Show admin panel if user is admin
            if (this.moderation.isAdmin) {
                document.getElementById('adminPanel').classList.remove('hidden');
                this.setupAdminControls();
            }
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

        // Customize Skins Button
        document.getElementById('customizeSkinsBtn').addEventListener('click', () => this.openSkinEditor());

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
        document.getElementById('maxPlayersSelect').addEventListener('change', () => this.updateSettings());
        document.getElementById('mapSelect').addEventListener('change', () => this.updateSettings());
        document.getElementById('durationSelect').addEventListener('change', () => this.updateSettings());
        document.getElementById('powerupDensitySelect').addEventListener('change', () => this.updateSettings());
        document.getElementById('powerupsToggle').addEventListener('change', () => this.updateSettings());
        document.getElementById('mapThemeSelect').addEventListener('change', () => this.updateSettings());
        document.getElementById('dynamicObstaclesToggle').addEventListener('change', () => this.updateSettings());
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
            // Get default settings (maxPlayers will be set in waiting room)
            const settings = {
                maxPlayers: 10 // Default max, can be changed in room settings
            };
            const roomCode = await this.network.createRoom(settings);
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

            // Sync custom skins to room
            await this.syncCustomSkinsToRoom(roomCode);

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

    /**
     * Sync custom skins to room
     */
    async syncCustomSkinsToRoom(roomCode) {
        const customSkins = {
            character: localStorage.getItem('bomberman_custom_character_skin') || null,
            bomb: localStorage.getItem('bomberman_custom_bomb_skin') || null
        };

        if (customSkins.character || customSkins.bomb) {
            await this.network.updatePlayerSkins(roomCode, {
                character: 'custom',
                bomb: 'custom',
                customData: customSkins
            });
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
            // Check if current user is the host
            if (this.currentRoom.host !== this.network.getUserId()) {
                this.showError('Seul l\'hôte peut démarrer la partie.');
                return;
            }

            const players = safeObjectValues(this.currentRoom.players);

            // Check minimum 2 players
            if (players.length < 2) {
                this.showError('Vous devez être au moins 2 joueurs pour commencer !');
                return;
            }

            // Check if all players are ready
            const allReady = players.every(p => p.ready);

            if (!allReady) {
                this.showError('Tous les joueurs doivent être prêts !');
                return;
            }

            try {
                await this.network.startGame(this.currentRoomCode);
                this.storeExpectedPlayers(this.currentRoom);
                // Redirect to game
                window.location.href = `game.html?room=${this.currentRoomCode}`;
            } catch (error) {
                console.error('Failed to start game:', error);
                this.showError('Impossible de démarrer la partie. Seul l\'hôte peut la démarrer.');
            }
        }
    }

    async updateSettings() {
        if (this.currentRoomCode && this.currentRoom?.host === this.network.getUserId()) {
            const settings = {
                maxPlayers: parseInt(document.getElementById('maxPlayersSelect').value),
                map: document.getElementById('mapSelect').value,
                duration: parseInt(document.getElementById('durationSelect').value),
                powerupDensity: document.getElementById('powerupDensitySelect').value,
                powerups: document.getElementById('powerupsToggle').checked,
                theme: document.getElementById('mapThemeSelect').value,
                dynamicObstacles: document.getElementById('dynamicObstaclesToggle').checked
            };

            try {
                await this.network.updateRoomSettings(this.currentRoomCode, settings);
            } catch (error) {
                console.error('Failed to update settings:', error);
                this.showError('Impossible de modifier les paramètres. Seul l\'hôte peut les modifier.');
            }
        } else if (this.currentRoomCode) {
            // Non-host tried to modify settings
            this.showError('Seul l\'hôte peut modifier les paramètres de la partie.');
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
                this.storeExpectedPlayers(room);
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
        const playersById = (room.players && typeof room.players === 'object') ? room.players : {};
        const settings = (room.settings && typeof room.settings === 'object') ? room.settings : {};
        const maxPlayers = settings.maxPlayers || 10;

        // Update players - show slots based on maxPlayers setting
        const playerSlots = Array(maxPlayers).fill(null);
        safeObjectValues(playersById).forEach(player => {
            if (player.colorIndex < maxPlayers) {
                playerSlots[player.colorIndex] = player;
            }
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

        // Update settings UI - Always visible, but disabled for non-hosts
        const settingsDiv = document.getElementById('roomSettings');
        settingsDiv.classList.remove('hidden');

        // Update title based on host status
        const settingsTitle = document.getElementById('settingsTitle');
        if (isHost) {
            settingsTitle.textContent = '⚙️ Paramètres de la partie';
        } else {
            settingsTitle.textContent = '👁️ Paramètres de la partie (lecture seule)';
        }

        // Update values for everyone
        const maxPlayersSelect = document.getElementById('maxPlayersSelect');
        const mapSelect = document.getElementById('mapSelect');
        const durationSelect = document.getElementById('durationSelect');
        const powerupDensitySelect = document.getElementById('powerupDensitySelect');
        const powerupsToggle = document.getElementById('powerupsToggle');
        const mapThemeSelect = document.getElementById('mapThemeSelect');
        const dynamicObstaclesToggle = document.getElementById('dynamicObstaclesToggle');

        maxPlayersSelect.value = settings.maxPlayers || 10;
        mapSelect.value = settings.map || 'medium';
        durationSelect.value = settings.duration || 300;
        powerupDensitySelect.value = settings.powerupDensity || 'medium';
        powerupsToggle.checked = settings.powerups !== false;
        mapThemeSelect.value = settings.theme || 'classic';
        dynamicObstaclesToggle.checked = settings.dynamicObstacles !== false;

        // Disable inputs for non-hosts
        if (isHost) {
            maxPlayersSelect.disabled = false;
            mapSelect.disabled = false;
            durationSelect.disabled = false;
            powerupDensitySelect.disabled = false;
            powerupsToggle.disabled = false;
            mapThemeSelect.disabled = false;
            dynamicObstaclesToggle.disabled = false;
        } else {
            maxPlayersSelect.disabled = true;
            mapSelect.disabled = true;
            durationSelect.disabled = true;
            powerupDensitySelect.disabled = true;
            powerupsToggle.disabled = true;
            mapThemeSelect.disabled = true;
            dynamicObstaclesToggle.disabled = true;
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

            const myPlayer = playersById[this.network.getUserId()];
            if (myPlayer) {
                readyBtn.textContent = myPlayer.ready ? 'Not Ready' : 'Ready';
                readyBtn.classList.toggle('ready', myPlayer.ready);
            }
        }
    }

    storeExpectedPlayers(room) {
        if (!room) return;
        try {
            const data = {
                roomCode: this.currentRoomCode || room.code,
                playerIds: Object.keys(room.players || {})
            };
            localStorage.setItem('bomberman_expected_players', JSON.stringify(data));
        } catch (error) {
            console.warn('Failed to store expected players', error);
        }
    }

    async sendRoomChat() {
        const input = document.getElementById('roomChatInput');
        const message = input.value.trim();

        if (message && this.currentRoomCode && this.moderation) {
            // Check for admin commands
            if (message.startsWith('/') && this.moderation.isAdmin) {
                const parts = message.slice(1).split(' ');
                const command = parts[0];
                const args = parts.slice(1);

                const result = await this.processAdminCommand(command, args);
                if (result) {
                    this.showError(result, 'info');
                }
                input.value = '';
                return;
            }

            // Validate message
            const validation = this.moderation.validateMessage(this.network.getUserId(), message);

            if (!validation.valid) {
                this.showError(validation.reason);
                input.value = '';
                return;
            }

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

    // ==================== SKIN EDITOR ====================

    /**
     * Open skin customization modal
     */
    openSkinEditor() {
        const modal = document.getElementById('skinCustomizationModal');
        modal.classList.remove('hidden');

        // Initialize editors if not done
        if (!this.characterEditor) {
            this.initializeSkinEditors();
        }

        // Load current skins
        this.loadCurrentSkins();
    }

    /**
     * Initialize skin editors
     */
    initializeSkinEditors() {
        console.log('Initializing skin editors...');

        // Character editor
        this.characterEditor = new SkinEditor(
            'characterCanvas',
            'characterPreviewCanvas',
            'characterColorPicker'
        );

        // Bomb editor
        this.bombEditor = new SkinEditor(
            'bombCanvas',
            'bombPreviewCanvas',
            'bombColorPicker'
        );

        console.log('Editors created, setting up UI...');

        // Setup UI event listeners
        this.setupSkinEditorUI();

        console.log('Loading premade skins...');

        // Load premade skins
        this.loadPremadeSkins();

        console.log('Skin editor initialization complete!');
    }

    /**
     * Setup skin editor UI
     */
    setupSkinEditorUI() {
        // Close button
        document.getElementById('closeSkinEditor').addEventListener('click', () => {
            document.getElementById('skinCustomizationModal').classList.add('hidden');
        });

        // Sidebar Tabs
        document.querySelectorAll('.sidebar-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const targetTab = e.currentTarget.dataset.tab;
                this.switchCustomizationTab(targetTab);
            });
        });

        // Character tools
        document.querySelectorAll('#characterEditor .tool-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('#characterEditor .tool-btn').forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');
                this.characterEditor.setTool(e.currentTarget.dataset.tool);
            });
        });

        // Bomb tools
        document.querySelectorAll('#bombEditor .tool-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('#bombEditor .tool-btn').forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');
                this.bombEditor.setTool(e.currentTarget.dataset.tool);
            });
        });

        // Color presets - Character
        document.querySelectorAll('#characterColorPresets .color-preset').forEach(preset => {
            preset.addEventListener('click', (e) => {
                const color = e.currentTarget.dataset.color;
                document.getElementById('characterColorPicker').value = color;
                this.characterEditor.currentColor = color;
            });
        });

        // Color presets - Bomb
        document.querySelectorAll('#bombColorPresets .color-preset').forEach(preset => {
            preset.addEventListener('click', (e) => {
                const color = e.currentTarget.dataset.color;
                document.getElementById('bombColorPicker').value = color;
                this.bombEditor.currentColor = color;
            });
        });

        // Image upload - Character
        document.getElementById('characterImageUpload').addEventListener('change', (e) => {
            this.handleImageUpload(e, this.characterEditor);
        });

        // Image upload - Bomb
        document.getElementById('bombImageUpload').addEventListener('change', (e) => {
            this.handleImageUpload(e, this.bombEditor);
        });

        // Clear buttons
        document.getElementById('characterClearBtn').addEventListener('click', () => {
            this.characterEditor.clear();
        });
        document.getElementById('bombClearBtn').addEventListener('click', () => {
            this.bombEditor.clear();
        });

        // Export buttons
        document.getElementById('characterExportBtn').addEventListener('click', () => {
            this.exportSkin(this.characterEditor, 'character');
        });
        document.getElementById('bombExportBtn').addEventListener('click', () => {
            this.exportSkin(this.bombEditor, 'bomb');
        });

        // Save buttons
        document.getElementById('saveCharacterSkin').addEventListener('click', () => {
            this.saveCustomSkin('character');
        });
        document.getElementById('saveBombSkin').addEventListener('click', () => {
            this.saveCustomSkin('bomb');
        });

        // Cancel buttons
        document.getElementById('cancelCharacterSkin').addEventListener('click', () => {
            this.loadCurrentSkins();
        });
        document.getElementById('cancelBombSkin').addEventListener('click', () => {
            this.loadCurrentSkins();
        });
    }

    /**
     * Switch customization tab
     */
    switchCustomizationTab(tab) {
        // Update sidebar buttons
        document.querySelectorAll('.sidebar-tab').forEach(t => t.classList.remove('active'));
        document.querySelector(`.sidebar-tab[data-tab="${tab}"]`).classList.add('active');

        // Update content panels
        document.querySelectorAll('.tab-panel').forEach(panel => {
            panel.classList.remove('active');
        });
        document.querySelector(`.tab-panel[data-panel="${tab}"]`)?.classList.add('active');

        // Initialize effects if needed
        if (['explosion', 'kill', 'death', 'trail'].includes(tab)) {
            this.initializeEffectsTab(tab);
        }
    }

    /**
     * Initialize effects tab
     */
    initializeEffectsTab(tab) {
        // Load saved effects
        const effects = JSON.parse(localStorage.getItem('bomberman_effects') || '{}');

        // Setup effect selection
        document.querySelectorAll(`.tab-panel[data-panel="${tab}"] .effect-card`).forEach(card => {
            const effectType = card.dataset.effect;
            const savedEffect = effects[tab];

            // Mark selected
            if (effectType === savedEffect) {
                card.classList.add('selected');
            }

            // Handle selection
            card.querySelector('.select-btn')?.addEventListener('click', () => {
                // Remove all selections
                document.querySelectorAll(`.tab-panel[data-panel="${tab}"] .effect-card`).forEach(c => {
                    c.classList.remove('selected');
                });

                // Mark this as selected
                card.classList.add('selected');

                // Save to localStorage
                effects[tab] = effectType;
                localStorage.setItem('bomberman_effects', JSON.stringify(effects));
            });
        });

        // Setup range sliders
        this.setupEffectSliders(tab, effects);
    }

    /**
     * Setup effect sliders
     */
    setupEffectSliders(tab, effects) {
        // Explosion sliders
        if (tab === 'explosion') {
            const sizeSlider = document.getElementById('explosionSize');
            const sizeValue = document.getElementById('explosionSizeValue');
            const durationSlider = document.getElementById('explosionDuration');
            const durationValue = document.getElementById('explosionDurationValue');

            if (sizeSlider && sizeValue) {
                sizeSlider.value = effects.explosionSize || 100;
                sizeValue.textContent = `${sizeSlider.value}%`;
                sizeSlider.addEventListener('input', (e) => {
                    sizeValue.textContent = `${e.target.value}%`;
                    effects.explosionSize = parseInt(e.target.value);
                    localStorage.setItem('bomberman_effects', JSON.stringify(effects));
                });
            }

            if (durationSlider && durationValue) {
                durationSlider.value = effects.explosionDuration || 500;
                durationValue.textContent = `${durationSlider.value}ms`;
                durationSlider.addEventListener('input', (e) => {
                    durationValue.textContent = `${e.target.value}ms`;
                    effects.explosionDuration = parseInt(e.target.value);
                    localStorage.setItem('bomberman_effects', JSON.stringify(effects));
                });
            }
        }

        // Trail sliders
        if (tab === 'trail') {
            const intensitySlider = document.getElementById('trailIntensity');
            const intensityValue = document.getElementById('trailIntensityValue');
            const lifetimeSlider = document.getElementById('trailLifetime');
            const lifetimeValue = document.getElementById('trailLifetimeValue');

            if (intensitySlider && intensityValue) {
                intensitySlider.value = effects.trailIntensity || 5;
                intensityValue.textContent = intensitySlider.value;
                intensitySlider.addEventListener('input', (e) => {
                    intensityValue.textContent = e.target.value;
                    effects.trailIntensity = parseInt(e.target.value);
                    localStorage.setItem('bomberman_effects', JSON.stringify(effects));
                });
            }

            if (lifetimeSlider && lifetimeValue) {
                lifetimeSlider.value = effects.trailLifetime || 500;
                lifetimeValue.textContent = `${lifetimeSlider.value}ms`;
                lifetimeSlider.addEventListener('input', (e) => {
                    lifetimeValue.textContent = `${e.target.value}ms`;
                    effects.trailLifetime = parseInt(e.target.value);
                    localStorage.setItem('bomberman_effects', JSON.stringify(effects));
                });
            }
        }

        // Kill effect options
        if (tab === 'kill') {
            const killSound = document.getElementById('killSound');
            const killText = document.getElementById('killText');

            if (killSound) {
                killSound.checked = effects.killSound !== false;
                killSound.addEventListener('change', (e) => {
                    effects.killSound = e.target.checked;
                    localStorage.setItem('bomberman_effects', JSON.stringify(effects));
                });
            }

            if (killText) {
                killText.checked = effects.killText !== false;
                killText.addEventListener('change', (e) => {
                    effects.killText = e.target.checked;
                    localStorage.setItem('bomberman_effects', JSON.stringify(effects));
                });
            }
        }
    }

    /**
     * Load premade skins
     */
    loadPremadeSkins() {
        console.log('Loading premade skins...');

        // Character premade skins
        const characterSkins = PremadeSkins.generateCharacterSkins();
        console.log('Generated', characterSkins.length, 'character skins');

        const characterGrid = document.getElementById('characterPremadeGrid');
        if (!characterGrid) {
            console.error('Character premade grid not found!');
            return;
        }

        characterGrid.innerHTML = ''; // Clear first

        characterSkins.forEach((skin, index) => {
            const wrapper = document.createElement('div');
            wrapper.className = 'premade-skin';
            wrapper.title = skin.name;

            const canvas = document.createElement('canvas');
            canvas.width = 32;
            canvas.height = 32;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(skin.canvas, 0, 0);

            wrapper.appendChild(canvas);

            wrapper.addEventListener('click', () => {
                this.characterEditor.loadImage(skin.canvas.toDataURL());
            });

            characterGrid.appendChild(wrapper);
        });

        // Bomb premade skins
        const bombSkins = PremadeSkins.generateBombSkins();
        const bombGrid = document.getElementById('bombPremadeGrid');
        bombGrid.innerHTML = ''; // Clear first

        bombSkins.forEach((skin, index) => {
            const wrapper = document.createElement('div');
            wrapper.className = 'premade-skin';
            wrapper.title = skin.name;

            const canvas = document.createElement('canvas');
            canvas.width = 32;
            canvas.height = 32;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(skin.canvas, 0, 0);

            wrapper.appendChild(canvas);

            wrapper.addEventListener('click', () => {
                this.bombEditor.loadImage(bombSkins[index].canvas.toDataURL());
            });

            bombGrid.appendChild(wrapper);
        });
    }

    /**
     * Handle image upload
     */
    handleImageUpload(event, editor) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            editor.loadImageData(e.target.result);
        };
        reader.readAsDataURL(file);
    }

    /**
     * Export skin as PNG
     */
    exportSkin(editor, type) {
        const dataUrl = editor.exportImage();
        const link = document.createElement('a');
        link.download = `${type}_skin_${Date.now()}.png`;
        link.href = dataUrl;
        link.click();
    }

    /**
     * Save custom skin to localStorage
     */
    saveCustomSkin(type) {
        const editor = type === 'character' ? this.characterEditor : this.bombEditor;
        const dataUrl = editor.exportImage();

        // Store in localStorage
        localStorage.setItem(`bomberman_custom_${type}_skin`, dataUrl);

        // Update the skin manager (we'll modify it to support custom skins)
        if (type === 'character') {
            this.skinManager.selectedCharacterSkin = 'custom';
        } else {
            this.skinManager.selectedBombSkin = 'custom';
        }

        alert(`✅ Skin ${type === 'character' ? 'de personnage' : 'de bombe'} sauvegardé !`);

        // Close modal
        document.getElementById('skinCustomizationModal').classList.add('hidden');
    }

    /**
     * Load current skins into editors
     */
    loadCurrentSkins() {
        // Load character skin
        const characterSkin = localStorage.getItem('bomberman_custom_character_skin');
        if (characterSkin && this.characterEditor) {
            this.characterEditor.loadImageData(characterSkin);
        }

        // Load bomb skin
        const bombSkin = localStorage.getItem('bomberman_custom_bomb_skin');
        if (bombSkin && this.bombEditor) {
            this.bombEditor.loadImageData(bombSkin);
        }
    }

    // ==================== ADMIN & MODERATION ====================

    setupAdminControls() {
        // Clear chat button
        document.getElementById('adminClearChat').addEventListener('click', async () => {
            if (confirm('Voulez-vous vraiment effacer tout le chat ?')) {
                await this.moderation.clearChat(this.currentRoomCode);
                this.showError('Chat effacé', 'info');
            }
        });

        // Mute button
        document.getElementById('adminMuteBtn').addEventListener('click', async () => {
            const username = document.getElementById('adminTargetUser').value.trim();
            if (username) {
                await this.executeAdminAction('mute', username);
            }
        });

        // Kick button
        document.getElementById('adminKickBtn').addEventListener('click', async () => {
            const username = document.getElementById('adminTargetUser').value.trim();
            if (username && confirm(`Voulez-vous vraiment kick ${username} ?`)) {
                await this.executeAdminAction('kick', username);
            }
        });

        // Ban button
        document.getElementById('adminBanBtn').addEventListener('click', async () => {
            const username = document.getElementById('adminTargetUser').value.trim();
            if (username && confirm(`Voulez-vous vraiment bannir ${username} ?`)) {
                await this.executeAdminAction('ban', username);
            }
        });
    }

    async executeAdminAction(action, username) {
        if (!this.currentRoom || !this.currentRoom.players) {
            this.showError('Pas de room active');
            return;
        }

        // Find user ID by username
        const players = safeObjectValues(this.currentRoom.players);
        const targetPlayer = players.find(p => p.username.toLowerCase() === username.toLowerCase());

        if (!targetPlayer) {
            this.showError(`Joueur "${username}" introuvable`);
            return;
        }

        let result;
        switch (action) {
            case 'mute':
                result = this.moderation.muteUser(targetPlayer.id, targetPlayer.username, 60000);
                this.showError(result, 'info');
                break;

            case 'kick':
                result = await this.moderation.kickUser(targetPlayer.id, targetPlayer.username, this.currentRoomCode);
                this.showError(result, 'info');
                break;

            case 'ban':
                result = await this.moderation.banUser(targetPlayer.id, targetPlayer.username, this.currentRoomCode);
                this.showError(result, 'info');
                break;
        }

        document.getElementById('adminTargetUser').value = '';
    }

    async processAdminCommand(command, args) {
        const commandResult = this.moderation.processAdminCommand(command, args, this.currentRoomCode);

        if (typeof commandResult === 'string') {
            return commandResult;
        }

        if (commandResult && commandResult.action) {
            switch (commandResult.action) {
                case 'clear':
                    await this.moderation.clearChat(this.currentRoomCode);
                    return 'Chat effacé';

                case 'mute':
                case 'unmute':
                case 'kick':
                case 'ban':
                    await this.executeAdminAction(commandResult.action, commandResult.username);
                    return null;

                default:
                    return 'Commande inconnue';
            }
        }

        return null;
    }
}

// Initialize
const lobbyManager = new LobbyManager();
window.lobbyManager = lobbyManager;

import { NetworkManager } from './network.js';

/**
 * Lobby Manager - Handles lobby UI and room management
 */
class LobbyManager {
    constructor() {
        this.network = null;
        this.currentRoom = null;
        this.currentRoomCode = null;
        this.roomListener = null;
        this.chatListener = null;

        this.init();
    }

    async init() {
        // Wait for Firebase to be loaded
        await this.waitForFirebase();

        // Initialize network
        this.network = new NetworkManager(window.database, window.firestore);

        try {
            await this.network.initialize();
            console.log('Network initialized:', this.network.getUserId());

            // Setup UI
            this.setupUI();
            this.loadUserProfile();
            this.loadLeaderboard();
            this.loadPublicRooms();
            this.setupGlobalChat();

            // Auto-save username
            this.setupAutoSave();
        } catch (error) {
            console.error('Initialization error:', error);
            this.showError('Failed to connect to server. Please refresh the page.');
        }
    }

    async waitForFirebase() {
        let attempts = 0;
        while (!window.database || !window.firestore) {
            if (attempts++ > 50) throw new Error('Firebase not loaded');
            await new Promise(resolve => setTimeout(resolve, 100));
        }
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
        const savedUsername = localStorage.getItem('bomberman_username');

        if (savedUsername) {
            usernameInput.value = savedUsername;
        }

        usernameInput.addEventListener('change', async () => {
            const newUsername = usernameInput.value.trim();
            if (newUsername.length >= 3 && newUsername.length <= 12) {
                await this.network.updateUsername(newUsername);
                this.loadUserProfile();
            } else {
                this.showError('Username must be 3-12 characters');
            }
        });
    }

    async loadUserProfile() {
        try {
            const profile = await this.network.getUserProfile();
            if (profile) {
                document.getElementById('userRank').textContent = profile.rank;
                document.getElementById('userElo').textContent = `${profile.elo} ELO`;
            }
        } catch (error) {
            console.error('Failed to load profile:', error);
        }
    }

    async loadLeaderboard() {
        try {
            const leaderboard = await this.network.getLeaderboard(10);
            const leaderboardEl = document.getElementById('leaderboard');
            leaderboardEl.innerHTML = '';

            leaderboard.forEach((user, index) => {
                const item = document.createElement('div');
                item.className = 'leaderboard-item';

                const rankClass = index === 0 ? 'gold' : index === 1 ? 'silver' : index === 2 ? 'bronze' : '';

                item.innerHTML = `
                    <span class="leaderboard-rank ${rankClass}">#${index + 1}</span>
                    <span class="leaderboard-name">${user.username}</span>
                    <span class="leaderboard-elo">${user.elo}</span>
                `;

                leaderboardEl.appendChild(item);
            });
        } catch (error) {
            console.error('Failed to load leaderboard:', error);
        }
    }

    async loadPublicRooms() {
        try {
            const rooms = await this.network.getPublicRooms();
            const roomsList = document.getElementById('roomsList');
            roomsList.innerHTML = '';

            if (rooms.length === 0) {
                roomsList.innerHTML = `
                    <div class="empty-state">
                        <p>No public rooms available</p>
                        <p class="hint">Create one to start playing!</p>
                    </div>
                `;
                return;
            }

            rooms.forEach(room => {
                const card = document.createElement('div');
                card.className = 'room-card';
                card.innerHTML = `
                    <div class="room-header">
                        <span class="room-name">${room.code}</span>
                        <span class="room-players">${room.playerCount}/${room.maxPlayers}</span>
                    </div>
                    <div class="room-host">Host: ${room.host}</div>
                `;

                card.addEventListener('click', () => {
                    document.getElementById('roomCode').value = room.code;
                    this.joinRoom();
                });

                roomsList.appendChild(card);
            });
        } catch (error) {
            console.error('Failed to load public rooms:', error);
        }

        // Refresh every 5 seconds
        setTimeout(() => this.loadPublicRooms(), 5000);
    }

    setupGlobalChat() {
        this.network.listenToChat(null, (messages) => {
            const chatEl = document.getElementById('globalChat');
            chatEl.innerHTML = '';

            // Show last 20 messages
            messages.slice(-20).forEach(msg => {
                const msgEl = document.createElement('div');
                msgEl.className = 'chat-message';
                msgEl.innerHTML = `
                    <div class="chat-user">${msg.user}</div>
                    <div class="chat-text">${this.escapeHtml(msg.message)}</div>
                `;
                chatEl.appendChild(msgEl);
            });

            chatEl.scrollTop = chatEl.scrollHeight;
        });
    }

    async sendGlobalChat() {
        const input = document.getElementById('chatInput');
        const message = input.value.trim();

        if (message.length === 0) return;

        try {
            await this.network.sendGlobalChat(message);
            input.value = '';
        } catch (error) {
            console.error('Failed to send message:', error);
            this.showError('Failed to send message');
        }
    }

    async createRoom() {
        try {
            const roomCode = await this.network.createRoom();
            this.currentRoomCode = roomCode;
            await this.openWaitingRoom(roomCode);
        } catch (error) {
            console.error('Failed to create room:', error);
            this.showError('Failed to create room');
        }
    }

    async joinRoom() {
        const roomCode = document.getElementById('roomCode').value.trim().toUpperCase();

        if (roomCode.length !== 6) {
            this.showError('Room code must be 6 characters');
            return;
        }

        try {
            await this.network.joinRoom(roomCode);
            this.currentRoomCode = roomCode;
            await this.openWaitingRoom(roomCode);
        } catch (error) {
            console.error('Failed to join room:', error);
            this.showError(error.message || 'Failed to join room');
        }
    }

    async openWaitingRoom(roomCode) {
        // Show modal
        document.getElementById('waitingRoomModal').classList.remove('hidden');
        document.getElementById('displayRoomCode').textContent = roomCode;

        // Listen to room updates
        this.roomListener = this.network.listenToRoom(roomCode, (room) => {
            if (!room) {
                // Room was deleted
                this.showError('Room was closed');
                this.closeWaitingRoom();
                return;
            }

            this.currentRoom = room;
            this.updateWaitingRoomUI(room);

            // Start game if status changed to playing
            if (room.status === 'playing') {
                window.location.href = `game.html?room=${roomCode}`;
            }
        });

        // Setup room chat
        this.network.listenToChat(roomCode, (messages) => {
            const chatEl = document.getElementById('roomChat');
            chatEl.innerHTML = '';

            messages.slice(-20).forEach(msg => {
                const msgEl = document.createElement('div');
                msgEl.className = 'chat-message';
                msgEl.innerHTML = `
                    <div class="chat-user">${msg.user}</div>
                    <div class="chat-text">${this.escapeHtml(msg.message)}</div>
                `;
                chatEl.appendChild(msgEl);
            });

            chatEl.scrollTop = chatEl.scrollHeight;
        });
    }

    updateWaitingRoomUI(room) {
        const playersGrid = document.getElementById('playersGrid');
        playersGrid.innerHTML = '';

        const isHost = room.host === this.network.getUserId();
        const players = Object.values(room.players || {});

        // Show player slots (4 max)
        for (let i = 0; i < 4; i++) {
            const player = players[i];
            const slot = document.createElement('div');
            slot.className = 'player-slot';

            if (player) {
                slot.classList.add('active');
                if (player.ready) slot.classList.add('ready');

                const color = this.getPlayerColor(player.colorIndex);
                slot.innerHTML = `
                    <div class="player-avatar" style="background: ${color};">
                        ${player.username.charAt(0).toUpperCase()}
                    </div>
                    <div class="player-name">${player.username}</div>
                    <div class="player-status ${player.ready ? 'ready' : 'waiting'}">
                        ${player.ready ? 'Ready' : 'Not Ready'}
                    </div>
                `;
            } else {
                slot.innerHTML = `
                    <div class="player-avatar" style="background: #333;">?</div>
                    <div class="player-name">Waiting...</div>
                `;
            }

            playersGrid.appendChild(slot);
        }

        // Update settings UI
        if (isHost) {
            document.getElementById('roomSettings').style.display = 'block';
            document.getElementById('startGameBtn').classList.remove('hidden');
            document.getElementById('readyBtn').classList.add('hidden');

            // Enable start if at least 2 players and all ready
            const allReady = players.every(p => p.ready);
            document.getElementById('startGameBtn').disabled = players.length < 2 || !allReady;
        } else {
            document.getElementById('roomSettings').style.display = 'none';
            document.getElementById('startGameBtn').classList.add('hidden');
            document.getElementById('readyBtn').classList.remove('hidden');

            // Update ready button
            const currentPlayer = players.find(p => p.id === this.network.getUserId());
            if (currentPlayer) {
                document.getElementById('readyBtn').textContent = currentPlayer.ready ? 'Not Ready' : 'Ready';
                document.getElementById('readyBtn').className = currentPlayer.ready ? 'btn btn-secondary' : 'btn btn-ready';
            }
        }

        // Update settings values
        document.getElementById('mapSelect').value = room.settings.map;
        document.getElementById('durationSelect').value = room.settings.duration;
        document.getElementById('powerupsToggle').checked = room.settings.powerups;
    }

    async toggleReady() {
        try {
            await this.network.toggleReady(this.currentRoomCode);
        } catch (error) {
            console.error('Failed to toggle ready:', error);
        }
    }

    async updateSettings() {
        if (!this.currentRoom || this.currentRoom.host !== this.network.getUserId()) return;

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

    async startGame() {
        if (!this.currentRoom || this.currentRoom.host !== this.network.getUserId()) return;

        try {
            await this.network.startGame(this.currentRoomCode);
            // Room listener will detect status change and redirect
        } catch (error) {
            console.error('Failed to start game:', error);
            this.showError('Failed to start game');
        }
    }

    async leaveRoom() {
        if (this.currentRoomCode) {
            try {
                await this.network.leaveRoom(this.currentRoomCode);
            } catch (error) {
                console.error('Failed to leave room:', error);
            }
        }

        this.closeWaitingRoom();
    }

    closeWaitingRoom() {
        document.getElementById('waitingRoomModal').classList.add('hidden');
        this.currentRoomCode = null;
        this.currentRoom = null;

        if (this.roomListener) {
            this.roomListener();
            this.roomListener = null;
        }

        this.loadPublicRooms();
    }

    async sendRoomChat() {
        const input = document.getElementById('roomChatInput');
        const message = input.value.trim();

        if (message.length === 0 || !this.currentRoomCode) return;

        try {
            await this.network.sendRoomChat(this.currentRoomCode, message);
            input.value = '';
        } catch (error) {
            console.error('Failed to send message:', error);
        }
    }

    copyRoomCode() {
        const code = document.getElementById('displayRoomCode').textContent;
        navigator.clipboard.writeText(code).then(() => {
            const btn = document.getElementById('copyCodeBtn');
            const originalText = btn.textContent;
            btn.textContent = '✓';
            setTimeout(() => {
                btn.textContent = originalText;
            }, 2000);
        });
    }

    getPlayerColor(index) {
        const colors = ['#00f0ff', '#ff00ff', '#ffff00', '#00ff88'];
        return colors[index % colors.length];
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    showError(message) {
        // Simple error display (could be improved with a modal)
        alert(message);
    }
}

// Initialize when DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        new LobbyManager();
    });
} else {
    new LobbyManager();
}

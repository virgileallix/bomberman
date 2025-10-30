import { NetworkManager } from './network.js';
import { AuthManager } from './auth.js';
import { ModerationManager } from './admin.js';

class AdminDashboard {
    constructor() {
        this.auth = null;
        this.network = null;
        this.moderation = null;
        this.globalMessages = [];
        this.globalChatInitialized = false;
        this.adminManagementInitialized = false;
        this.init();
    }

    async init() {
        await this.waitForFirebase();

        this.auth = new AuthManager(window.firestore);
        this.auth.initialize(async (user) => {
            await this.handleAuthState(user);
        });

        const backBtn = document.getElementById('backToLobbyBtn');
        backBtn?.addEventListener('click', () => {
            window.location.href = 'index.html';
        });

        const signOutBtn = document.getElementById('adminSignOutBtn');
        signOutBtn?.addEventListener('click', async () => {
            try {
                await this.auth.signOut();
            } finally {
                window.location.href = 'index.html';
            }
        });

        const refreshBtn = document.getElementById('refreshDashboardBtn');
        refreshBtn?.addEventListener('click', () => this.refresh());
    }

    async waitForFirebase() {
        let attempts = 0;
        while ((!window.database || !window.firestore) && attempts < 50) {
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
        }

        if (!window.database || !window.firestore) {
            throw new Error('Firebase non initialisé');
        }
    }

    async handleAuthState(user) {
        if (!user) {
            window.location.href = 'index.html';
            return;
        }

        if (!this.network) {
            this.network = new NetworkManager(window.database, window.firestore);
            await this.network.initialize();
        }

        if (!this.moderation) {
            this.moderation = new ModerationManager(this.network, this.network.getUserId());
        }

        const isAdmin = await this.moderation.waitForAdminCheck();
        if (!isAdmin) {
            window.location.href = 'index.html';
            return;
        }

        this.updateHeader();
        this.setupGlobalChat();
        this.setupAdminManagement();
    }

    updateHeader() {
        const subtitle = document.getElementById('adminSubtitle');
        if (subtitle) {
            const username = this.auth.getUsername();
            const userId = this.network.getUserId();
            subtitle.textContent = `Connecté en tant que ${username} (${userId})`;
        }
    }

    setupGlobalChat() {
        if (this.globalChatInitialized) {
            return;
        }

        const chatContainer = document.getElementById('adminGlobalChat');
        const clearBtn = document.getElementById('adminGlobalClearBtn');
        const statusLabel = document.getElementById('globalChatStatus');

        if (!chatContainer || !clearBtn) {
            return;
        }

        clearBtn.addEventListener('click', async () => {
            if (!confirm('Effacer tout le chat global ?')) {
                return;
            }

            if (statusLabel) {
                statusLabel.textContent = 'Nettoyage en cours...';
            }

            try {
                await this.moderation.clearGlobalChat();
                if (statusLabel) {
                    statusLabel.textContent = 'Chat global effacé';
                    setTimeout(() => statusLabel.textContent = '', 3000);
                }
            } catch (error) {
                console.error('Erreur clear chat global:', error);
                if (statusLabel) {
                    statusLabel.textContent = 'Erreur lors du nettoyage';
                    setTimeout(() => statusLabel.textContent = '', 4000);
                }
            }
        });

        chatContainer.addEventListener('click', async (event) => {
            const target = event.target;
            if (!(target instanceof HTMLElement)) {
                return;
            }

            if (target.classList.contains('chat-delete-btn')) {
                const messageId = target.dataset.messageId;
                if (!messageId) {
                    return;
                }

                if (!confirm('Supprimer ce message du chat global ?')) {
                    return;
                }

                const success = await this.moderation.deleteGlobalMessage(messageId);
                if (!success && statusLabel) {
                    statusLabel.textContent = 'Suppression impossible';
                    setTimeout(() => statusLabel.textContent = '', 3000);
                }
            }
        });

        this.network.listenToChat(null, (messages) => {
            this.globalMessages = messages.slice(-100);
            this.renderGlobalChat();
        });

        this.globalChatInitialized = true;
    }

    renderGlobalChat() {
        const chatContainer = document.getElementById('adminGlobalChat');
        if (!chatContainer) {
            return;
        }

        chatContainer.innerHTML = this.globalMessages.map(msg => this.renderChatMessage(msg)).join('');
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    renderChatMessage(msg) {
        const safeUser = this.escapeHtml(msg.user || 'Inconnu');
        const safeText = this.escapeHtml(msg.message || '');
        const messageId = msg.id || '';
        const timestamp = this.formatTimestamp(msg.timestamp);

        return `
            <div class="chat-message" data-message-id="${messageId}" data-user-id="${msg.userId || ''}">
                <div class="chat-content">
                    <span class="chat-user">${safeUser}<span class="chat-meta">${timestamp}</span></span>
                    <span class="chat-text">${safeText}</span>
                </div>
                <button class="chat-delete-btn" data-message-id="${messageId}" title="Supprimer ce message">🗑️</button>
            </div>
        `;
    }

    formatTimestamp(raw) {
        if (!raw) {
            return '--:--';
        }

        let date;
        if (typeof raw === 'number') {
            date = new Date(raw);
        } else if (typeof raw === 'object') {
            if (typeof raw.toMillis === 'function') {
                date = new Date(raw.toMillis());
            } else if (typeof raw.seconds === 'number') {
                date = new Date(raw.seconds * 1000);
            } else {
                date = new Date(raw);
            }
        } else {
            date = new Date(raw);
        }

        if (Number.isNaN(date.getTime())) {
            return '--:--';
        }

        return date.toLocaleTimeString('fr-FR', {
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    setupAdminManagement() {
        if (this.adminManagementInitialized) {
            return;
        }

        const grantBtn = document.getElementById('grantAdminBtn');
        const revokeBtn = document.getElementById('revokeAdminBtn');
        const targetInput = document.getElementById('adminTargetUserId');

        if (!grantBtn || !revokeBtn || !targetInput) {
            return;
        }

        const updateStatus = async (shouldGrant) => {
            const userId = targetInput.value.trim();
            if (!userId) {
                alert('Veuillez renseigner un UID utilisateur.');
                return;
            }

            try {
                await this.moderation.setAdminStatus(userId, shouldGrant);
                alert(`Statut admin mis à jour pour ${userId}`);
                targetInput.value = '';
            } catch (error) {
                console.error('Erreur update admin status:', error);
                alert('Impossible de mettre à jour le statut admin. Consultez la console.');
            }
        };

        grantBtn.addEventListener('click', () => updateStatus(true));
        revokeBtn.addEventListener('click', () => updateStatus(false));

        this.adminManagementInitialized = true;
    }

    refresh() {
        this.renderGlobalChat();
        const statusLabel = document.getElementById('globalChatStatus');
        if (statusLabel) {
            statusLabel.textContent = 'Vue actualisée';
            setTimeout(() => statusLabel.textContent = '', 2000);
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

const adminDashboard = new AdminDashboard();
window.adminDashboard = adminDashboard;

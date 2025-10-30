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
        this.userList = [];
        this.filteredUserList = [];
        this.currentUserSearchTerm = '';
        this.loadUserListFn = null;
        this.userStatusTimeout = null;
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

    renderUserList(users) {
        const listContainer = document.getElementById('adminUserList');
        if (!listContainer) {
            return;
        }

        if (!Array.isArray(users) || users.length === 0) {
            const hasUsers = this.userList.length > 0;
            listContainer.innerHTML = `
                <div class="empty-state">
                    ${hasUsers ? 'Aucun utilisateur ne correspond à la recherche.' : 'Aucun utilisateur trouvé.'}
                </div>
            `;
            return;
        }

        listContainer.innerHTML = users.map(user => this.renderUserRow(user)).join('');
    }

    renderUserRow(user) {
        const rawUid = user.id || '';
        const safeUid = this.escapeHtml(rawUid);
        const safeName = this.escapeHtml(user.username || 'Utilisateur sans nom');
        const isAdmin = !!user.admin;
        const badgeClass = isAdmin ? 'badge badge-admin' : 'badge badge-normal';
        const badgeLabel = isAdmin ? 'Admin' : 'Joueur';
        const buttonLabel = isAdmin ? 'Retirer admin' : 'Accorder admin';
        const buttonClass = isAdmin ? 'btn btn-small btn-warning' : 'btn btn-small btn-secondary';
        const targetAdmin = isAdmin ? 'remove' : 'grant';
        const rowClass = isAdmin ? 'user-row is-admin' : 'user-row';

        return `
            <div class="${rowClass}" data-user-id="${safeUid}">
                <div class="user-info">
                    <span class="user-name">${safeName}</span>
                    <div class="user-meta">
                        <span class="${badgeClass}">${badgeLabel}</span>
                        <span class="user-uid">${safeUid}</span>
                    </div>
                </div>
                <div class="user-actions">
                    <button class="${buttonClass}" data-action="toggleAdmin" data-user-id="${safeUid}" data-target-admin="${targetAdmin}">
                        ${buttonLabel}
                    </button>
                </div>
            </div>
        `;
    }

    filterUsers(term) {
        if (!Array.isArray(this.userList) || this.userList.length === 0) {
            return [];
        }

        const trimmed = (term || '').trim();
        if (!trimmed) {
            return [...this.userList];
        }

        const lowerTerm = trimmed.toLowerCase();
        return this.userList.filter(user => {
            const username = (user.username || '').toLowerCase();
            const uid = (user.id || '').toLowerCase();
            return username.includes(lowerTerm) || uid.includes(lowerTerm);
        });
    }

    generateUserListStatusMessage() {
        if (!this.userList.length) {
            return 'Aucun utilisateur';
        }

        const adminCount = this.userList.reduce((count, user) => count + (user.admin ? 1 : 0), 0);
        const hasQuery = this.currentUserSearchTerm && this.currentUserSearchTerm.trim();
        const filteredCount = Array.isArray(this.filteredUserList) ? this.filteredUserList.length : 0;

        if (hasQuery) {
            return `${filteredCount} résultat(s) sur ${this.userList.length} • ${adminCount} admin(s)`;
        }

        return `${this.userList.length} utilisateur(s) • ${adminCount} admin(s)`;
    }

    updateUserListStatus(message, autoClear = false) {
        const statusLabel = document.getElementById('userListStatus');
        if (!statusLabel) {
            return;
        }

        statusLabel.textContent = message || '';

        if (this.userStatusTimeout) {
            clearTimeout(this.userStatusTimeout);
            this.userStatusTimeout = null;
        }

        if (autoClear && message) {
            this.userStatusTimeout = setTimeout(() => {
                if (statusLabel.textContent === message) {
                    statusLabel.textContent = '';
                }
                this.userStatusTimeout = null;
            }, 3000);
        }
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

        const listContainer = document.getElementById('adminUserList');
        const searchInput = document.getElementById('adminUserSearch');
        const refreshBtn = document.getElementById('refreshUserListBtn');

        if (!listContainer) {
            return;
        }

        const applyFilter = () => {
            const term = searchInput ? searchInput.value : '';
            this.currentUserSearchTerm = term;
            this.filteredUserList = this.filterUsers(this.currentUserSearchTerm);
            this.renderUserList(this.filteredUserList);
            this.updateUserListStatus(this.generateUserListStatusMessage());
        };

        const loadUsers = async () => {
            this.updateUserListStatus('Chargement...');
            listContainer.innerHTML = '<div class="empty-state">Chargement des utilisateurs...</div>';

            try {
                const users = await this.moderation.fetchUsers(100);
                this.userList = Array.isArray(users) ? [...users] : [];
                this.userList.sort((a, b) => (a.username || '').localeCompare(b.username || '', 'fr', { sensitivity: 'base' }));

                if (!this.userList.length) {
                    listContainer.innerHTML = '<div class="empty-state">Aucun utilisateur trouvé.</div>';
                    this.updateUserListStatus('Aucun utilisateur');
                    return;
                }

                applyFilter();
            } catch (error) {
                console.error('Erreur chargement utilisateurs:', error);
                listContainer.innerHTML = '<div class="empty-state">Erreur lors du chargement des utilisateurs.</div>';
                this.updateUserListStatus('Erreur de chargement');
            }
        };

        this.loadUserListFn = loadUsers;

        if (searchInput) {
            searchInput.addEventListener('input', () => {
                applyFilter();
            });
        }

        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.loadUserListFn();
            });
        }

        listContainer.addEventListener('click', async (event) => {
            const target = event.target;
            if (!(target instanceof HTMLElement)) {
                return;
            }

            if (target.dataset.action !== 'toggleAdmin') {
                return;
            }

            const userId = target.dataset.userId;
            if (!userId) {
                return;
            }

            const shouldGrant = target.dataset.targetAdmin === 'grant';
            const originalLabel = target.textContent;

            target.disabled = true;
            target.textContent = '...';

            let success = false;
            try {
                success = await this.moderation.setAdminStatus(userId, shouldGrant);
            } catch (error) {
                console.error('Erreur update admin status:', error);
            }

            target.disabled = false;
            target.textContent = originalLabel;

            if (!success) {
                this.updateUserListStatus('Impossible de mettre à jour ce compte', true);
                return;
            }

            const user = this.userList.find(u => u.id === userId);
            if (user) {
                user.admin = shouldGrant;
            }

            this.filteredUserList = this.filterUsers(this.currentUserSearchTerm);
            this.renderUserList(this.filteredUserList);
            this.updateUserListStatus(`Statut admin mis à jour pour ${userId}`, true);
        });

        this.adminManagementInitialized = true;
        this.loadUserListFn();
    }

    refresh() {
        this.renderGlobalChat();
        const statusLabel = document.getElementById('globalChatStatus');
        if (statusLabel) {
            statusLabel.textContent = 'Vue actualisée';
            setTimeout(() => statusLabel.textContent = '', 2000);
        }

        if (typeof this.loadUserListFn === 'function') {
            this.loadUserListFn();
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

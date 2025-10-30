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
        this.selectedUserId = null;
        this.selectedUserData = null;
        this.selectedUserInitialData = null;
        this.userDetailElements = {};
        this.userSearchInput = null;
        this.activeProfileRequest = null;
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
        if (this.selectedUserId) {
            const selectedRow = listContainer.querySelector(`[data-user-id="${this.selectedUserId}"]`);
            if (selectedRow) {
                selectedRow.classList.add('is-selected');
            }
        }
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
        const safeRank = this.escapeHtml(user.rank || '');
        const eloText = typeof user.elo === 'number' && !Number.isNaN(user.elo) ? `${user.elo} ELO` : null;

        return `
            <div class="${rowClass}" data-user-id="${safeUid}">
                <div class="user-info">
                    <span class="user-name">${safeName}</span>
                    <div class="user-meta">
                        <span class="${badgeClass}">${badgeLabel}</span>
                        ${safeRank ? `<span class="user-rank">${safeRank}</span>` : ''}
                        ${eloText ? `<span class="user-elo">${eloText}</span>` : ''}
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

    sortUserList() {
        this.userList.sort((a, b) => (a.username || '').localeCompare(b.username || '', 'fr', { sensitivity: 'base' }));
    }

    applyUserFilter() {
        const term = this.userSearchInput ? this.userSearchInput.value : this.currentUserSearchTerm;
        this.currentUserSearchTerm = term || '';
        this.filteredUserList = this.filterUsers(this.currentUserSearchTerm);
        this.renderUserList(this.filteredUserList);
        this.updateUserListStatus(this.generateUserListStatusMessage());
    }

    highlightSelectedRow(userId) {
        const listContainer = document.getElementById('adminUserList');
        if (!listContainer) {
            return;
        }

        listContainer.querySelectorAll('.user-row').forEach(row => {
            if (!userId) {
                row.classList.remove('is-selected');
            } else {
                row.classList.toggle('is-selected', row.dataset.userId === userId);
            }
        });
    }

    clearSelectedUserDetails(message = 'Sélectionnez un utilisateur dans la liste.') {
        this.selectedUserId = null;
        this.selectedUserData = null;
        this.selectedUserInitialData = null;
        this.highlightSelectedRow(null);
        this.showUserDetailsPlaceholder(message);
    }

    showUserDetailsPlaceholder(message) {
        const { placeholder, content } = this.userDetailElements || {};
        if (placeholder) {
            placeholder.textContent = message || 'Sélectionnez un utilisateur dans la liste.';
            placeholder.classList.remove('is-hidden');
        }
        if (content) {
            content.classList.add('is-hidden');
        }
    }

    showUserDetailsContent() {
        const { placeholder, content } = this.userDetailElements || {};
        if (placeholder) {
            placeholder.classList.add('is-hidden');
        }
        if (content) {
            content.classList.remove('is-hidden');
        }
    }

    extractEditableFields(profile) {
        return {
            username: profile.username || '',
            rank: profile.rank || '',
            elo: typeof profile.elo === 'number' ? profile.elo : 0,
            gamesPlayed: typeof profile.gamesPlayed === 'number' ? profile.gamesPlayed : 0,
            wins: typeof profile.wins === 'number' ? profile.wins : 0,
            kills: typeof profile.kills === 'number' ? profile.kills : 0,
            deaths: typeof profile.deaths === 'number' ? profile.deaths : 0
        };
    }

    populateUserDetails(profile) {
        if (!this.userDetailElements || !this.userDetailElements.form) {
            return;
        }

        this.showUserDetailsContent();

        const {
            title,
            idLabel,
            sources,
            adminBadge,
            createdAt,
            username,
            rank,
            elo,
            gamesPlayed,
            wins,
            kills,
            deaths
        } = this.userDetailElements;

        if (title) {
            title.textContent = profile.username || 'Utilisateur';
        }

        if (idLabel) {
            idLabel.textContent = profile.id || '';
        }

        if (sources) {
            const parts = [];
            if (profile.sources && profile.sources.firestore) {
                parts.push('Firestore');
            }
            if (profile.sources && profile.sources.realtime) {
                parts.push('Realtime DB');
            }
            sources.textContent = parts.length ? `• ${parts.join(' + ')}` : '• Source inconnue';
        }

        if (adminBadge) {
            adminBadge.textContent = profile.admin ? 'Admin' : 'Joueur';
            adminBadge.classList.toggle('badge-admin', profile.admin);
            adminBadge.classList.toggle('badge-normal', !profile.admin);
        }

        if (createdAt) {
            createdAt.textContent = profile.createdAtIso ? `Créé le ${this.formatIsoDate(profile.createdAtIso)}` : '';
        }

        if (username) {
            username.value = profile.username || '';
        }
        if (rank) {
            rank.value = profile.rank || '';
        }
        if (elo) {
            elo.value = typeof profile.elo === 'number' ? profile.elo : '';
        }
        if (gamesPlayed) {
            gamesPlayed.value = typeof profile.gamesPlayed === 'number' ? profile.gamesPlayed : '';
        }
        if (wins) {
            wins.value = typeof profile.wins === 'number' ? profile.wins : '';
        }
        if (kills) {
            kills.value = typeof profile.kills === 'number' ? profile.kills : '';
        }
        if (deaths) {
            deaths.value = typeof profile.deaths === 'number' ? profile.deaths : '';
        }
    }

    collectUserDetailsInputs() {
        if (!this.userDetailElements || !this.userDetailElements.form) {
            return { data: null, invalidFields: [], emptyRequiredFields: [] };
        }

        const {
            username,
            rank,
            elo,
            gamesPlayed,
            wins,
            kills,
            deaths
        } = this.userDetailElements;

        const data = {
            username: username ? username.value.trim() : '',
            rank: rank ? rank.value.trim() : ''
        };

        const numericFields = {
            elo,
            gamesPlayed,
            wins,
            kills,
            deaths
        };

        const invalidFields = [];
        const emptyRequiredFields = [];

        Object.entries(numericFields).forEach(([key, input]) => {
            if (!input) {
                data[key] = 0;
                return;
            }

            const raw = input.value.trim();
            if (raw.length === 0) {
                data[key] = 0;
                return;
            }

            const parsed = Number(raw);
            if (Number.isNaN(parsed)) {
                invalidFields.push(key);
            } else {
                data[key] = parsed;
            }
        });

        if (!data.username) {
            emptyRequiredFields.push('username');
        }

        return { data, invalidFields, emptyRequiredFields };
    }

    computeUserDetailUpdates(data) {
        const diff = {};
        const baseline = this.selectedUserInitialData || {};

        Object.entries(data || {}).forEach(([key, value]) => {
            if (typeof value === 'number') {
                if (!Number.isNaN(value) && value !== baseline[key]) {
                    diff[key] = value;
                }
            } else if (typeof value === 'string') {
                const baselineValue = typeof baseline[key] === 'string' ? baseline[key] : '';
                if (value !== baselineValue) {
                    diff[key] = value;
                }
            }
        });

        return diff;
    }

    setUserDetailsSavingState(isSaving) {
        const { saveBtn, resetBtn } = this.userDetailElements || {};

        if (saveBtn) {
            if (!saveBtn.dataset.originalLabel) {
                saveBtn.dataset.originalLabel = saveBtn.textContent || 'Enregistrer';
            }
            saveBtn.disabled = isSaving;
            saveBtn.textContent = isSaving ? 'Enregistrement...' : saveBtn.dataset.originalLabel;
        }

        if (resetBtn) {
            resetBtn.disabled = isSaving;
        }
    }

    refreshUserInList(userId, updatedFields) {
        const user = this.userList.find(u => u.id === userId);
        if (user) {
            if (Object.prototype.hasOwnProperty.call(updatedFields, 'username')) {
                user.username = updatedFields.username;
            }
            if (Object.prototype.hasOwnProperty.call(updatedFields, 'elo')) {
                user.elo = updatedFields.elo;
            }
            if (Object.prototype.hasOwnProperty.call(updatedFields, 'rank')) {
                user.rank = updatedFields.rank;
            }
        }

        this.sortUserList();
        this.applyUserFilter();
        this.highlightSelectedRow(this.selectedUserId);
    }

    async selectUser(userId) {
        if (!userId) {
            return;
        }

        this.selectedUserId = userId;
        this.highlightSelectedRow(userId);
        this.showUserDetailsPlaceholder('Chargement du profil...');

        const requestId = Date.now();
        this.activeProfileRequest = requestId;

        try {
            const profile = await this.moderation.getUserProfile(userId);

            if (this.activeProfileRequest !== requestId) {
                return;
            }

            if (this.selectedUserId !== userId) {
                return;
            }

            this.selectedUserData = profile;
            this.selectedUserInitialData = this.extractEditableFields(profile);
            const mergedProfile = {
                ...profile,
                ...this.selectedUserInitialData
            };
            this.populateUserDetails(mergedProfile);
        } catch (error) {
            if (this.activeProfileRequest !== requestId) {
                return;
            }
            console.error('Erreur chargement profil utilisateur:', error);
            if (this.selectedUserId === userId) {
                this.showUserDetailsPlaceholder('Impossible de charger ce profil.');
                this.updateUserListStatus('Erreur lors du chargement du profil', true);
            }
        } finally {
            if (this.activeProfileRequest === requestId) {
                this.activeProfileRequest = null;
            }
        }
    }

    async saveSelectedUserProfile() {
        if (!this.selectedUserId) {
            this.updateUserListStatus('Aucun utilisateur sélectionné', true);
            return;
        }

        const inputResult = this.collectUserDetailsInputs();
        if (!inputResult || !inputResult.data) {
            this.updateUserListStatus('Formulaire utilisateur indisponible', true);
            return;
        }

        if (inputResult.invalidFields.length) {
            this.updateUserListStatus('Veuillez saisir des nombres valides.', true);
            return;
        }

        if (inputResult.emptyRequiredFields && inputResult.emptyRequiredFields.length) {
            this.updateUserListStatus('Le pseudo ne peut pas être vide.', true);
            return;
        }

        const updates = this.computeUserDetailUpdates(inputResult.data);
        if (!updates || Object.keys(updates).length === 0) {
            this.updateUserListStatus('Aucune modification détectée', true);
            return;
        }

        this.setUserDetailsSavingState(true);
        this.updateUserListStatus('Enregistrement en cours...');

        try {
            const sanitized = await this.moderation.updateUserProfile(this.selectedUserId, updates);

            this.selectedUserInitialData = {
                ...this.selectedUserInitialData,
                ...sanitized
            };

            this.selectedUserData = {
                ...this.selectedUserData,
                ...this.selectedUserInitialData
            };

            const mergedProfile = {
                ...this.selectedUserData,
                ...this.selectedUserInitialData
            };
            this.populateUserDetails(mergedProfile);
            this.refreshUserInList(this.selectedUserId, sanitized);
            this.updateUserListStatus('Profil mis à jour', true);
        } catch (error) {
            console.error('Erreur lors de la sauvegarde du profil utilisateur:', error);
            this.updateUserListStatus('Erreur lors de la sauvegarde du profil', true);
        } finally {
            this.setUserDetailsSavingState(false);
        }
    }

    resetSelectedUserForm() {
        if (!this.selectedUserId || !this.selectedUserInitialData || !this.selectedUserData) {
            return;
        }

        const mergedProfile = {
            ...this.selectedUserData,
            ...this.selectedUserInitialData
        };

        this.populateUserDetails(mergedProfile);
        this.updateUserListStatus('Modifications annulées', true);
    }

    formatIsoDate(isoString) {
        if (!isoString) {
            return '';
        }

        try {
            const date = new Date(isoString);
            if (Number.isNaN(date.getTime())) {
                return isoString;
            }
            return date.toLocaleString('fr-FR', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch (error) {
            console.warn('Impossible de formater la date ISO:', isoString);
            return isoString;
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
        const detailsContainer = document.getElementById('adminUserDetails');
        const detailsContent = document.getElementById('userDetailsContent');
        const detailsPlaceholder = document.getElementById('userDetailsPlaceholder');
        const saveBtn = document.getElementById('saveUserDetailsBtn');
        const resetBtn = document.getElementById('resetUserDetailsBtn');
        const detailsForm = document.getElementById('userDetailsForm');

        if (!listContainer || !detailsContainer) {
            return;
        }

        this.userSearchInput = searchInput || null;
        this.userDetailElements = {
            container: detailsContainer,
            content: detailsContent || null,
            placeholder: detailsPlaceholder || null,
            title: document.getElementById('userDetailsTitle'),
            idLabel: document.getElementById('userDetailsId'),
            sources: document.getElementById('userDetailsSources'),
            adminBadge: document.getElementById('userDetailsAdminBadge'),
            createdAt: document.getElementById('userDetailsCreatedAt'),
            username: document.getElementById('userDetailsUsername'),
            rank: document.getElementById('userDetailsRank'),
            elo: document.getElementById('userDetailsElo'),
            gamesPlayed: document.getElementById('userDetailsGamesPlayed'),
            wins: document.getElementById('userDetailsWins'),
            kills: document.getElementById('userDetailsKills'),
            deaths: document.getElementById('userDetailsDeaths'),
            form: detailsForm || null,
            saveBtn: saveBtn || null,
            resetBtn: resetBtn || null
        };

        const loadUsers = async () => {
            this.updateUserListStatus('Chargement...');
            listContainer.innerHTML = '<div class="empty-state">Chargement des utilisateurs...</div>';

            try {
                const users = await this.moderation.fetchUsers(100);
                this.userList = Array.isArray(users) ? [...users] : [];
                this.sortUserList();

                if (!this.userList.length) {
                    listContainer.innerHTML = '<div class="empty-state">Aucun utilisateur trouvé.</div>';
                    this.clearSelectedUserDetails('Aucun utilisateur à afficher.');
                    this.updateUserListStatus('Aucun utilisateur');
                    return;
                }

                this.applyUserFilter();

                if (this.selectedUserId) {
                    const stillExists = this.userList.some(user => user.id === this.selectedUserId);
                    if (stillExists) {
                        this.highlightSelectedRow(this.selectedUserId);
                    } else {
                        this.clearSelectedUserDetails('Sélectionnez un utilisateur dans la liste.');
                    }
                }
            } catch (error) {
                console.error('Erreur chargement utilisateurs:', error);
                listContainer.innerHTML = '<div class="empty-state">Erreur lors du chargement des utilisateurs.</div>';
                this.updateUserListStatus('Erreur de chargement');
            }
        };

        this.loadUserListFn = loadUsers;

        if (searchInput) {
            searchInput.addEventListener('input', () => this.applyUserFilter());
        }

        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.loadUserListFn();
                if (this.selectedUserId) {
                    this.selectUser(this.selectedUserId);
                }
            });
        }

        listContainer.addEventListener('click', async (event) => {
            const target = event.target;
            if (!(target instanceof HTMLElement)) {
                return;
            }

            const adminButton = target.closest('button[data-action="toggleAdmin"]');
            if (adminButton) {
                const userId = adminButton.dataset.userId;
                if (!userId) {
                    return;
                }

                const shouldGrant = adminButton.dataset.targetAdmin === 'grant';
                const originalLabel = adminButton.textContent;

                adminButton.disabled = true;
                adminButton.textContent = '...';

                let success = false;
                try {
                    success = await this.moderation.setAdminStatus(userId, shouldGrant);
                } catch (error) {
                    console.error('Erreur update admin status:', error);
                }

                adminButton.disabled = false;
                adminButton.textContent = originalLabel;

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

                if (userId === this.selectedUserId && this.selectedUserData) {
                    this.selectedUserData = {
                        ...this.selectedUserData,
                        admin: shouldGrant
                    };
                    const mergedProfile = {
                        ...this.selectedUserData,
                        ...this.selectedUserInitialData
                    };
                    this.populateUserDetails(mergedProfile);
                }

                return;
            }

            const row = target.closest('.user-row');
            if (row && row.dataset.userId) {
                this.selectUser(row.dataset.userId);
            }
        });

        if (saveBtn) {
            saveBtn.addEventListener('click', () => this.saveSelectedUserProfile());
        }

        if (resetBtn) {
            resetBtn.addEventListener('click', () => this.resetSelectedUserForm());
        }

        this.showUserDetailsPlaceholder('Sélectionnez un utilisateur dans la liste.');

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
            if (this.selectedUserId) {
                this.selectUser(this.selectedUserId);
            }
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

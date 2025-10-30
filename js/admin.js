/**
 * Admin & Moderation System
 */

import {
    doc,
    getDoc,
    updateDoc,
    collection,
    getDocs,
    query,
    orderBy,
    limit
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

import {
    ref,
    get,
    update
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-database.js";

export class ModerationManager {
    constructor(network, userId) {
        this.network = network;
        this.userId = userId;
        this.isAdmin = false;
        this.adminCheckComplete = false;

        // Rate limiting
        this.messageTimestamps = new Map(); // userId -> [timestamps]
        this.messageLimit = 5; // messages
        this.timeWindow = 10000; // 10 secondes

        // Muted users
        this.mutedUsers = new Set();
        this.muteTimeouts = new Map();

        // Banned users (stored in Firebase)
        this.bannedUsers = new Set();

        // Profanity filter
        this.bannedWords = [
            // Mots français
            'connard', 'salope', 'pute', 'enculé', 'merde', 'fdp', 'pd',
            'con', 'bite', 'couille', 'chier', 'putain', 'bordel',
            // Mots anglais
            'fuck', 'shit', 'bitch', 'asshole', 'damn', 'cunt',
            'dick', 'pussy', 'bastard', 'whore', 'fag'
        ];

        // Check admin status from database
        this.checkAdminFromDatabase();
    }

    /**
     * Récupère les détails complets d'un utilisateur
     */
    async getUserProfile(userId) {
        if (!userId) {
            throw new Error('Utilisateur invalide');
        }

        let firestoreData = null;
        let realtimeData = null;

        try {
            const userRef = doc(this.network.firestore, 'users', userId);
            const snapshot = await getDoc(userRef);
            if (snapshot.exists()) {
                firestoreData = snapshot.data();
            }
        } catch (error) {
            console.warn('⚠️ Impossible de récupérer l’utilisateur Firestore:', error);
        }

        try {
            const userDbRef = ref(this.network.database, `users/${userId}`);
            const snapshot = await get(userDbRef);
            if (snapshot.exists()) {
                realtimeData = snapshot.val();
            }
        } catch (error) {
            console.warn('⚠️ Impossible de récupérer l’utilisateur Realtime DB:', error);
        }

        const combined = {
            ...(realtimeData || {}),
            ...(firestoreData || {})
        };

        const createdAt = firestoreData && firestoreData.createdAt;
        let createdAtIso = null;
        if (createdAt) {
            if (typeof createdAt.toDate === 'function') {
                createdAtIso = createdAt.toDate().toISOString();
            } else if (typeof createdAt.seconds === 'number') {
                createdAtIso = new Date(createdAt.seconds * 1000).toISOString();
            } else if (typeof createdAt === 'number') {
                createdAtIso = new Date(createdAt).toISOString();
            }
        } else if (realtimeData && typeof realtimeData.createdAt === 'number') {
            createdAtIso = new Date(realtimeData.createdAt).toISOString();
        }

        const profile = {
            id: userId,
            username: this.normalizeUsername(combined.username),
            admin: combined.admin === 1 || combined.admin === true,
            elo: this.normalizeNumberField(combined.elo),
            rank: this.normalizeRank(combined.rank),
            gamesPlayed: this.normalizeNumberField(combined.gamesPlayed),
            wins: this.normalizeNumberField(combined.wins),
            kills: this.normalizeNumberField(combined.kills),
            deaths: this.normalizeNumberField(combined.deaths),
            createdAtIso,
            sources: {
                firestore: Boolean(firestoreData),
                realtime: Boolean(realtimeData)
            }
        };

        return profile;
    }

    normalizeUsername(username) {
        if (typeof username === 'string') {
            const trimmed = username.trim();
            if (trimmed.length > 0) {
                return trimmed;
            }
        }
        return 'Utilisateur sans nom';
    }

    normalizeRank(rank) {
        if (typeof rank === 'string') {
            const trimmed = rank.trim();
            if (trimmed.length > 0) {
                return trimmed;
            }
        }
        return 'Bronze';
    }

    normalizeNumberField(value) {
        if (typeof value === 'number' && !Number.isNaN(value)) {
            return value;
        }
        if (typeof value === 'string') {
            const parsed = Number(value);
            if (!Number.isNaN(parsed)) {
                return parsed;
            }
        }
        return 0;
    }

    sanitizeUserUpdates(updates) {
        const allowedFields = {
            username: 'string',
            rank: 'string',
            elo: 'number',
            gamesPlayed: 'number',
            wins: 'number',
            kills: 'number',
            deaths: 'number'
        };

        const sanitized = {};

        for (const [key, value] of Object.entries(updates || {})) {
            if (!(key in allowedFields)) {
                continue;
            }

            const type = allowedFields[key];
            if (type === 'string') {
                const strValue = typeof value === 'string' ? value.trim() : String(value || '').trim();
                if (strValue.length === 0) {
                    continue;
                }
                sanitized[key] = strValue.slice(0, 50);
            } else if (type === 'number') {
                const numberValue = Number(value);
                if (Number.isNaN(numberValue)) {
                    continue;
                }
                sanitized[key] = Math.max(0, Math.round(numberValue));
            }
        }

        return sanitized;
    }

    /**
     * Mettre à jour le profil d'un utilisateur
     */
    async updateUserProfile(userId, updates) {
        if (!this.isAdmin) {
            throw new Error('Seuls les admins peuvent modifier les profils');
        }

        const sanitized = this.sanitizeUserUpdates(updates);

        if (Object.keys(sanitized).length === 0) {
            throw new Error('Aucune donnée valide à mettre à jour');
        }

        try {
            const userRef = doc(this.network.firestore, 'users', userId);
            const userDoc = await getDoc(userRef);
            if (userDoc.exists()) {
                await updateDoc(userRef, sanitized);
            }

            const userDbRef = ref(this.network.database, `users/${userId}`);
            const snapshot = await get(userDbRef);
            if (snapshot.exists()) {
                await update(userDbRef, sanitized);
            }

            return sanitized;
        } catch (error) {
            console.error('❌ Erreur lors de la mise à jour du profil:', error);
            throw error;
        }
    }

    /**
     * Vérifier le statut admin depuis la base de données
     */
    async checkAdminFromDatabase() {
        try {
            // Try Firestore first (main database)
            const userRef = doc(this.network.firestore, 'users', this.userId);
            const userDoc = await getDoc(userRef);

            if (userDoc.exists()) {
                const userData = userDoc.data();
                this.isAdmin = userData.admin === 1;
                this.adminCheckComplete = true;

                if (this.isAdmin) {
                    console.log('👑 Admin mode activé (depuis Firestore)');
                }
                return;
            }

            // Fallback to Realtime Database
            const userDbRef = ref(this.network.database, `users/${this.userId}`);
            const snapshot = await get(userDbRef);

            if (snapshot.exists()) {
                const userData = snapshot.val();
                this.isAdmin = userData.admin === 1;
                this.adminCheckComplete = true;

                if (this.isAdmin) {
                    console.log('👑 Admin mode activé (depuis Realtime Database)');
                }
                return;
            }

            // User not found in database
            this.isAdmin = false;
            this.adminCheckComplete = true;
            console.log('ℹ️ Utilisateur non trouvé dans la base de données');
        } catch (error) {
            console.error('❌ Erreur lors de la vérification admin:', error);
            this.isAdmin = false;
            this.adminCheckComplete = true;
        }
    }

    /**
     * Attendre que la vérification admin soit terminée
     */
    async waitForAdminCheck() {
        let attempts = 0;
        while (!this.adminCheckComplete && attempts < 50) {
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
        }
        return this.isAdmin;
    }

    /**
     * Définir manuellement le statut admin (pour la migration)
     */
    async setAdminStatus(userId, isAdmin) {
        if (!this.isAdmin) {
            throw new Error('Seuls les admins peuvent modifier les statuts admin');
        }

        const adminValue = isAdmin ? 1 : 0;

        try {
            // Update in Firestore
            const userRef = doc(this.network.firestore, 'users', userId);
            const userDoc = await getDoc(userRef);
            if (userDoc.exists()) {
                await updateDoc(userRef, {
                    admin: adminValue
                });
            }

            // Update in Realtime Database
            const userDbRef = ref(this.network.database, `users/${userId}`);
            const snapshot = await get(userDbRef);
            if (snapshot.exists()) {
                await update(userDbRef, {
                    admin: adminValue
                });
            }

            console.log(`✅ Statut admin de ${userId} mis à jour: ${isAdmin ? 'admin' : 'utilisateur normal'}`);
            return true;
        } catch (error) {
            console.error('❌ Erreur lors de la mise à jour du statut admin:', error);
            return false;
        }
    }

    /**
     * Récupérer la liste des utilisateurs (Firestore en priorité, RTDB en fallback)
     */
    async fetchUsers(limitCount = 100) {
        // Try Firestore first
        try {
            const usersCol = collection(this.network.firestore, 'users');
            const usersQuery = query(
                usersCol,
                orderBy('username'),
                limit(Math.max(1, limitCount))
            );
            const snapshot = await getDocs(usersQuery);

            const users = snapshot.docs.map(docSnap => {
                const data = docSnap.data() || {};
                const username = typeof data.username === 'string' && data.username.trim()
                    ? data.username.trim()
                    : 'Utilisateur sans nom';

                return {
                    id: docSnap.id,
                    username,
                    admin: data.admin === 1 || data.admin === true,
                    elo: typeof data.elo === 'number' ? data.elo : null,
                    rank: typeof data.rank === 'string' ? data.rank : null
                };
            });

            if (users.length > 0) {
                return users;
            }
        } catch (error) {
            console.warn('⚠️ Impossible de charger les utilisateurs Firestore:', error);
        }

        // Fallback to Realtime Database
        try {
            const usersRef = ref(this.network.database, 'users');
            const snapshot = await get(usersRef);

            if (!snapshot.exists()) {
                return [];
            }

            const data = snapshot.val() || {};
            const users = Object.entries(data).map(([id, userData]) => {
                const username = userData && typeof userData.username === 'string' && userData.username.trim()
                    ? userData.username.trim()
                    : 'Utilisateur sans nom';

                return {
                    id,
                    username,
                    admin: userData && (userData.admin === 1 || userData.admin === true),
                    elo: userData && typeof userData.elo === 'number' ? userData.elo : null,
                    rank: userData && typeof userData.rank === 'string' ? userData.rank : null
                };
            });

            users.sort((a, b) => a.username.localeCompare(b.username, 'fr', { sensitivity: 'base' }));
            return users;
        } catch (error) {
            console.error('❌ Erreur fallback RTDB lors du chargement des utilisateurs:', error);
            return [];
        }
    }

    /**
     * Vérifier si un message contient des mots interdits
     */
    containsProfanity(message) {
        const lowerMessage = message.toLowerCase();
        for (const word of this.bannedWords) {
            if (lowerMessage.includes(word)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Filtrer un message (remplacer les gros mots par ***)
     */
    filterMessage(message) {
        let filtered = message;
        const lowerMessage = message.toLowerCase();

        for (const word of this.bannedWords) {
            const regex = new RegExp(word, 'gi');
            filtered = filtered.replace(regex, '*'.repeat(word.length));
        }

        return filtered;
    }

    /**
     * Vérifier le rate limiting (anti-spam)
     */
    checkRateLimit(userId) {
        const now = Date.now();

        if (!this.messageTimestamps.has(userId)) {
            this.messageTimestamps.set(userId, []);
        }

        const timestamps = this.messageTimestamps.get(userId);

        // Supprimer les timestamps trop anciens
        const recentTimestamps = timestamps.filter(t => now - t < this.timeWindow);
        this.messageTimestamps.set(userId, recentTimestamps);

        // Vérifier la limite
        if (recentTimestamps.length >= this.messageLimit) {
            return false; // Spam détecté
        }

        // Ajouter le timestamp actuel
        recentTimestamps.push(now);
        return true;
    }

    /**
     * Muter un utilisateur
     */
    muteUser(userId, username, duration = 60000) { // 1 minute par défaut
        this.mutedUsers.add(userId);

        // Auto-unmute après la durée
        const timeout = setTimeout(() => {
            this.unmuteUser(userId);
        }, duration);

        this.muteTimeouts.set(userId, timeout);

        console.log(`🔇 ${username} a été mute pour ${duration / 1000}s`);
        return `${username} a été mute pour ${duration / 1000} secondes`;
    }

    /**
     * Unmute un utilisateur
     */
    unmuteUser(userId) {
        this.mutedUsers.delete(userId);

        if (this.muteTimeouts.has(userId)) {
            clearTimeout(this.muteTimeouts.get(userId));
            this.muteTimeouts.delete(userId);
        }
    }

    /**
     * Vérifier si un utilisateur est mute
     */
    isMuted(userId) {
        return this.mutedUsers.has(userId);
    }

    /**
     * Bannir un utilisateur
     */
    async banUser(userId, username, roomCode) {
        this.bannedUsers.add(userId);

        // Stocker le ban dans Firebase
        try {
            await this.network.banUser(roomCode, userId, {
                username,
                bannedBy: this.userId,
                timestamp: Date.now()
            });

            console.log(`🚫 ${username} a été banni`);
            return `${username} a été banni de la partie`;
        } catch (error) {
            console.error('Erreur lors du ban:', error);
            return 'Erreur lors du ban';
        }
    }

    /**
     * Kicker un utilisateur (kick sans ban)
     */
    async kickUser(userId, username, roomCode) {
        try {
            await this.network.kickUser(roomCode, userId);
            console.log(`👢 ${username} a été kick`);
            return `${username} a été kick de la partie`;
        } catch (error) {
            console.error('Erreur lors du kick:', error);
            return 'Erreur lors du kick';
        }
    }

    /**
     * Clear le chat
     */
    async clearChat(roomCode) {
        try {
            await this.network.clearChat(roomCode);
            console.log('🧹 Chat effacé');
            return 'Chat effacé';
        } catch (error) {
            console.error('Erreur lors du clear:', error);
            return 'Erreur lors du clear';
        }
    }

    /**
     * Supprimer un message spécifique
     */
    async deleteChatMessage(roomCode, messageId) {
        try {
            await this.network.deleteChatMessage(roomCode, messageId);
            console.log(`🗑️ Message ${messageId} supprimé`);
            return true;
        } catch (error) {
            console.error('Erreur lors de la suppression du message:', error);
            return false;
        }
    }

    /**
     * Clear le chat global (admins uniquement)
     */
    async clearGlobalChat() {
        if (!this.isAdmin) {
            throw new Error('Seuls les admins peuvent gérer le chat global');
        }
        return this.clearChat(null);
    }

    /**
     * Supprimer un message du chat global (admins uniquement)
     */
    async deleteGlobalMessage(messageId) {
        if (!this.isAdmin) {
            throw new Error('Seuls les admins peuvent gérer le chat global');
        }
        return this.deleteChatMessage(null, messageId);
    }

    /**
     * Traiter une commande de modération
     */
    processModerationCommand(command, args, roomCode, options = {}) {
        const normalizedCommand = (command || '').toLowerCase();
        const { isHost = false } = options;
        const canModerateRoom = isHost || this.isAdmin;

        switch (normalizedCommand) {
            case 'mute':
                if (!canModerateRoom) {
                    return 'Seul l\'hôte peut utiliser cette commande';
                }
                if (args.length >= 1) {
                    const username = args[0];
                    const duration = args[1] ? parseInt(args[1]) * 1000 : 60000;
                    // Trouve l'userId par le username (besoin d'une référence aux joueurs)
                    return { action: 'mute', username, duration };
                }
                return 'Usage: /mute <username> [durée en secondes]';

            case 'unmute':
                if (!canModerateRoom) {
                    return 'Seul l\'hôte peut utiliser cette commande';
                }
                if (args.length >= 1) {
                    const username = args[0];
                    return { action: 'unmute', username };
                }
                return 'Usage: /unmute <username>';

            case 'kick':
                if (!canModerateRoom) {
                    return 'Seul l\'hôte peut utiliser cette commande';
                }
                if (args.length >= 1) {
                    const username = args[0];
                    return { action: 'kick', username };
                }
                return 'Usage: /kick <username>';

            case 'ban':
                if (!canModerateRoom) {
                    return 'Seul l\'hôte peut utiliser cette commande';
                }
                if (args.length >= 1) {
                    const username = args[0];
                    return { action: 'ban', username };
                }
                return 'Usage: /ban <username>';

            case 'clear':
                if (!canModerateRoom) {
                    return 'Seul l\'hôte peut utiliser cette commande';
                }
                return { action: 'clear' };

            default:
                return `Commandes disponibles: /mute, /unmute, /kick, /ban, /clear`;
        }
    }

    /**
     * Valider un message avant envoi
     */
    validateMessage(userId, message) {
        // Vérifier si mute
        if (this.isMuted(userId)) {
            return { valid: false, reason: 'Vous êtes mute' };
        }

        // Vérifier le rate limit
        if (!this.checkRateLimit(userId)) {
            return { valid: false, reason: 'Spam détecté - ralentissez !' };
        }

        // Vérifier les mots interdits
        if (this.containsProfanity(message)) {
            return { valid: false, reason: 'Message contient des mots interdits', filtered: this.filterMessage(message) };
        }

        return { valid: true };
    }
}

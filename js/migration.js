/**
 * Migration Script - Add admin field to all user accounts
 */

class MigrationManager {
    constructor() {
        this.database = null;
        this.firestore = null;
        this.auth = null;
        this.adminIds = new Set();

        // Stats
        this.stats = {
            total: 0,
            processed: 0,
            admins: 0,
            normal: 0,
            errors: 0
        };

        this.init();
    }

    async init() {
        // Wait for Firebase to initialize
        await this.waitForFirebase();

        this.database = window.database;
        this.firestore = window.firestore;
        this.auth = window.auth;

        console.log('✅ Migration Manager initialized');

        // Setup event listeners
        this.setupEventListeners();

        // Check if user is authenticated
        this.checkAuth();
    }

    async waitForFirebase() {
        let attempts = 0;
        while (!window.database || !window.firestore || !window.auth) {
            if (attempts++ > 50) {
                throw new Error('Firebase not loaded');
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    checkAuth() {
        this.auth.onAuthStateChanged(user => {
            if (!user) {
                this.log('⚠️ Vous devez être connecté pour effectuer la migration', 'warning');
                document.getElementById('startMigrationBtn').disabled = true;
            } else {
                this.log(`✅ Connecté en tant que ${user.email || user.uid}`, 'success');
                document.getElementById('startMigrationBtn').disabled = false;
            }
        });
    }

    setupEventListeners() {
        document.getElementById('startMigrationBtn').addEventListener('click', () => {
            this.startMigration();
        });
    }

    /**
     * Parse admin IDs from textarea
     */
    parseAdminIds() {
        const textarea = document.getElementById('adminIdsInput');
        const text = textarea.value.trim();

        this.adminIds.clear();

        if (!text) {
            return;
        }

        // Split by newlines and filter empty lines
        const ids = text.split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0);

        ids.forEach(id => this.adminIds.add(id));

        this.log(`📋 ${this.adminIds.size} ID(s) administrateur(s) chargé(s)`, 'info');
    }

    /**
     * Start migration process
     */
    async startMigration() {
        // Confirm action
        if (!confirm('⚠️ Êtes-vous sûr de vouloir lancer la migration ? Cette action va modifier tous les comptes utilisateurs.')) {
            return;
        }

        // Parse admin IDs
        this.parseAdminIds();

        // Reset stats
        this.stats = {
            total: 0,
            processed: 0,
            admins: 0,
            normal: 0,
            errors: 0
        };

        // Show progress
        document.getElementById('migrationProgress').classList.add('active');
        document.getElementById('migrationResults').classList.remove('active');
        document.getElementById('startMigrationBtn').disabled = true;

        // Clear log
        document.getElementById('progressLog').innerHTML = '';

        this.log('🚀 Démarrage de la migration...', 'info');

        try {
            // Get all users from Firestore
            await this.migrateFirestoreUsers();

            // Get all users from Realtime Database (legacy)
            await this.migrateRealtimeDBUsers();

            this.log('✅ Migration terminée avec succès !', 'success');
            this.showResults();
        } catch (error) {
            this.log(`❌ Erreur lors de la migration: ${error.message}`, 'error');
            console.error('Migration error:', error);
        } finally {
            document.getElementById('startMigrationBtn').disabled = false;
        }
    }

    /**
     * Migrate users in Firestore
     */
    async migrateFirestoreUsers() {
        this.log('📊 Lecture des utilisateurs Firestore...', 'info');

        try {
            const usersSnapshot = await this.firestore.collection('users').get();

            if (usersSnapshot.empty) {
                this.log('ℹ️ Aucun utilisateur trouvé dans Firestore', 'info');
                return;
            }

            this.stats.total += usersSnapshot.size;
            this.log(`📋 ${usersSnapshot.size} utilisateur(s) trouvé(s) dans Firestore`, 'info');

            // Process each user
            for (const doc of usersSnapshot.docs) {
                await this.migrateFirestoreUser(doc);
                this.updateProgress();
            }

            this.log('✅ Migration Firestore terminée', 'success');
        } catch (error) {
            this.log(`⚠️ Erreur Firestore: ${error.message}`, 'error');
            this.stats.errors++;
        }
    }

    /**
     * Migrate single Firestore user
     */
    async migrateFirestoreUser(doc) {
        const userId = doc.id;
        const userData = doc.data();

        try {
            // Check if admin field already exists
            if (userData.hasOwnProperty('admin')) {
                this.log(`ℹ️ ${userData.username || userId}: champ admin déjà présent (admin=${userData.admin})`, 'info');
                this.stats.processed++;

                if (userData.admin === 1) {
                    this.stats.admins++;
                } else {
                    this.stats.normal++;
                }
                return;
            }

            // Determine if user is admin
            const isAdmin = this.adminIds.has(userId);
            const adminValue = isAdmin ? 1 : 0;

            // Update user document
            await this.firestore.collection('users').doc(userId).update({
                admin: adminValue
            });

            this.stats.processed++;

            if (isAdmin) {
                this.stats.admins++;
                this.log(`👑 ${userData.username || userId}: défini comme ADMIN`, 'success');
            } else {
                this.stats.normal++;
                this.log(`✓ ${userData.username || userId}: défini comme utilisateur normal`, 'success');
            }
        } catch (error) {
            this.log(`❌ ${userData.username || userId}: Erreur - ${error.message}`, 'error');
            this.stats.errors++;
            console.error(`Error migrating user ${userId}:`, error);
        }
    }

    /**
     * Migrate users in Realtime Database (legacy)
     */
    async migrateRealtimeDBUsers() {
        this.log('📊 Lecture des utilisateurs Realtime Database...', 'info');

        try {
            const usersRef = firebase.database().ref('users');
            const snapshot = await usersRef.once('value');

            if (!snapshot.exists()) {
                this.log('ℹ️ Aucun utilisateur trouvé dans Realtime Database', 'info');
                return;
            }

            const users = snapshot.val();
            const userIds = Object.keys(users);

            this.stats.total += userIds.length;
            this.log(`📋 ${userIds.length} utilisateur(s) trouvé(s) dans Realtime Database`, 'info');

            // Process each user
            for (const userId of userIds) {
                await this.migrateRealtimeDBUser(userId, users[userId]);
                this.updateProgress();
            }

            this.log('✅ Migration Realtime Database terminée', 'success');
        } catch (error) {
            this.log(`⚠️ Erreur Realtime Database: ${error.message}`, 'error');
            this.stats.errors++;
        }
    }

    /**
     * Migrate single Realtime Database user
     */
    async migrateRealtimeDBUser(userId, userData) {
        try {
            // Check if admin field already exists
            if (userData.hasOwnProperty('admin')) {
                this.log(`ℹ️ [RTDB] ${userData.username || userId}: champ admin déjà présent (admin=${userData.admin})`, 'info');
                this.stats.processed++;

                if (userData.admin === 1) {
                    this.stats.admins++;
                } else {
                    this.stats.normal++;
                }
                return;
            }

            // Determine if user is admin
            const isAdmin = this.adminIds.has(userId);
            const adminValue = isAdmin ? 1 : 0;

            // Update user in Realtime Database
            const userRef = firebase.database().ref(`users/${userId}`);
            await userRef.update({
                admin: adminValue
            });

            this.stats.processed++;

            if (isAdmin) {
                this.stats.admins++;
                this.log(`👑 [RTDB] ${userData.username || userId}: défini comme ADMIN`, 'success');
            } else {
                this.stats.normal++;
                this.log(`✓ [RTDB] ${userData.username || userId}: défini comme utilisateur normal`, 'success');
            }
        } catch (error) {
            this.log(`❌ [RTDB] ${userData.username || userId}: Erreur - ${error.message}`, 'error');
            this.stats.errors++;
            console.error(`Error migrating RTDB user ${userId}:`, error);
        }
    }

    /**
     * Update progress bar
     */
    updateProgress() {
        const percentage = this.stats.total > 0
            ? Math.round((this.stats.processed / this.stats.total) * 100)
            : 0;

        const progressFill = document.getElementById('progressFill');
        progressFill.style.width = percentage + '%';
        progressFill.textContent = percentage + '%';
    }

    /**
     * Show migration results
     */
    showResults() {
        document.getElementById('migrationResults').classList.add('active');

        document.getElementById('totalUsers').textContent = this.stats.total;
        document.getElementById('normalUsers').textContent = this.stats.normal;
        document.getElementById('adminUsers').textContent = this.stats.admins;
        document.getElementById('errorCount').textContent = this.stats.errors;
    }

    /**
     * Log message to UI
     */
    log(message, type = 'info') {
        const logContainer = document.getElementById('progressLog');
        const entry = document.createElement('div');
        entry.className = `log-entry log-${type}`;

        const timestamp = new Date().toLocaleTimeString();
        entry.textContent = `[${timestamp}] ${message}`;

        logContainer.appendChild(entry);

        // Auto-scroll to bottom
        logContainer.scrollTop = logContainer.scrollHeight;

        // Also log to console
        console.log(message);
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.migrationManager = new MigrationManager();
    });
} else {
    window.migrationManager = new MigrationManager();
}

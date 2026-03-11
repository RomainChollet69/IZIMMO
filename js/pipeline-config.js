/**
 * pipeline-config.js
 * Module partagé pour la personnalisation des colonnes de pipeline.
 * Gère : chargement, sauvegarde, fusion config user + défauts.
 * Stockage : Supabase table pipeline_configs (JSONB).
 * Dépendances : supabase-config.js (supabaseClient)
 */

const PipelineConfig = (function () {
    'use strict';

    // ===== CACHE EN MÉMOIRE =====
    const _cache = {}; // { 'sellers': {...}, 'buyers': {...} }
    let _debounceTimers = {};

    // ===== COLONNES PAR DÉFAUT =====

    const DEFAULT_SELLER_COLUMNS = [
        { key: 'hot', label: 'LEADS CHAUDES', icon: '🔥', color: '#FF6B6B', headerImage: 'img/chaud_fond_carte_pipe_vente.png' },
        { key: 'warm', label: 'LEADS TIÈDES', icon: '🟠', color: '#FFA726', headerImage: 'img/tiede_fond_carte_pipe_vente.png' },
        { key: 'cold', label: 'LEADS FROIDES', icon: '🔵', color: '#42A5F5', headerImage: 'img/froid_fond_carte_pipe_vente.png' },
        { key: 'off_market', label: '🔒 OFF MARKET', icon: '🔒', color: '#9B59B6', headerImage: 'img/offmarket.png' },
        { key: 'mandate', label: 'SOUS MANDATS', icon: '📋', color: '#66BB6A', headerImage: 'img/mandat_fond_carte_pipe_vente.png' },
        { key: 'competitor', label: '🏢 CONCURRENTS / PAP', icon: '🏢', color: '#78909C', headerImage: 'img/concurrence.png' },
        { key: 'sold', label: 'VENDUS', icon: '✅', color: '#AB47BC', headerImage: 'img/vendu_fond_carte_pipe_vente.png' },
        { key: 'lost', label: 'PERDUS', icon: '❌', color: '#BDBDBD', headerImage: 'img/perdu_fond_carte_pipe_vente.png' }
    ];

    const DEFAULT_BUYER_STATUS_COLUMNS = [
        { key: 'nouveau', label: 'NOUVEAUX', title: 'Premier contact', icon: '🆕', color: '#42A5F5' },
        { key: 'actif', label: 'RECHERCHE ACTIVE', title: 'Critères définis, envoi de biens', icon: '🔍', color: '#AB47BC' },
        { key: 'achete_avec_moi', label: 'ACHETÉS AVEC MOI 🎉', title: 'Mes transactions', icon: '🎉', color: '#66BB6A' },
        { key: 'achete_ailleurs', label: 'ACHETÉS AILLEURS 🔄', title: 'Ont trouvé sans moi', icon: '🔄', color: '#F59E0B' },
        { key: 'abandon', label: 'PLUS EN RECHERCHE ❌', title: 'Abandon', icon: '❌', color: '#EF5350' }
    ];

    const DEFAULT_BUYER_PROPERTY_COLUMNS = [
        { key: 'studio_t1', label: 'STUDIO / T1', title: "Produits d'investissement", icon: '🏢', color: '#42A5F5' },
        { key: 't2', label: 'T2', title: 'Appartements 2 pièces', icon: '🏢', color: '#7C4DFF' },
        { key: 't3', label: 'T3', title: 'Appartements 3 pièces', icon: '🏢', color: '#26A69A' },
        { key: 't4_plus', label: 'T4 ET PLUS', title: 'Grands appartements', icon: '🏢', color: '#FF7043' },
        { key: 'maison_small', label: 'MAISONS < 500K', title: 'Maisons budget modéré', icon: '🏡', color: '#66BB6A' },
        { key: 'maison_big', label: 'MAISONS ≥ 500K', title: 'Maisons haut de gamme', icon: '🏡', color: '#AB47BC' },
        { key: 'autre', label: 'AUTRE / NON DÉFINI', title: 'Terrain, immeuble, sans critères', icon: '📍', color: '#78909C' }
    ];

    // ===== FONCTIONS PUBLIQUES =====

    /**
     * Retourne les colonnes par défaut pour un pipeline donné.
     * @param {string} pipeline - 'sellers' | 'buyers'
     * @param {string} [view] - Pour buyers : 'status' | 'property_type'
     * @returns {Array} Tableau de colonnes par défaut
     */
    function getDefaults(pipeline, view) {
        if (pipeline === 'sellers') return DEFAULT_SELLER_COLUMNS;
        if (pipeline === 'buyers') {
            return view === 'property_type' ? DEFAULT_BUYER_PROPERTY_COLUMNS : DEFAULT_BUYER_STATUS_COLUMNS;
        }
        return [];
    }

    /**
     * Charge la config depuis Supabase. Cache le résultat.
     * @param {string} pipeline - 'sellers' | 'buyers'
     * @returns {Promise<Object|null>} Config JSONB ou null si aucune
     */
    async function load(pipeline) {
        // Retourner le cache si disponible
        if (_cache[pipeline] !== undefined) return _cache[pipeline];

        try {
            const { data: { session } } = await supabaseClient.auth.getSession();
            if (!session) return null;

            const { data, error } = await supabaseClient
                .from('pipeline_configs')
                .select('config')
                .eq('user_id', session.user.id)
                .eq('pipeline', pipeline)
                .maybeSingle();

            if (error) {
                console.error('[PipelineConfig] Erreur chargement:', error);
                _cache[pipeline] = null;
                return null;
            }

            _cache[pipeline] = data ? data.config : null;
            return _cache[pipeline];
        } catch (e) {
            console.error('[PipelineConfig] Exception chargement:', e);
            _cache[pipeline] = null;
            return null;
        }
    }

    /**
     * Sauvegarde la config dans Supabase (debounce 300ms).
     * @param {string} pipeline - 'sellers' | 'buyers'
     * @param {Object} config - Objet config à sauvegarder
     * @returns {Promise<boolean>} true si succès
     */
    function save(pipeline, config) {
        // Mettre à jour le cache immédiatement
        _cache[pipeline] = config;

        // Debounce la sauvegarde réseau
        return new Promise((resolve) => {
            clearTimeout(_debounceTimers[pipeline]);
            _debounceTimers[pipeline] = setTimeout(async () => {
                try {
                    const { data: { session } } = await supabaseClient.auth.getSession();
                    if (!session) { resolve(false); return; }

                    const { error } = await supabaseClient
                        .from('pipeline_configs')
                        .upsert({
                            user_id: session.user.id,
                            pipeline: pipeline,
                            config: config,
                            updated_at: new Date().toISOString()
                        }, { onConflict: 'user_id,pipeline' });

                    if (error) {
                        console.error('[PipelineConfig] Erreur sauvegarde:', error);
                        resolve(false);
                        return;
                    }

                    console.log('[PipelineConfig] Config sauvegardée:', pipeline);
                    resolve(true);
                } catch (e) {
                    console.error('[PipelineConfig] Exception sauvegarde:', e);
                    resolve(false);
                }
            }, 300);
        });
    }

    /**
     * Fusionne la config user avec les colonnes par défaut.
     * Retourne les colonnes effectives (ordonnées, filtrées, labellisées).
     * @param {string} pipeline - 'sellers' | 'buyers'
     * @param {string} [view] - Pour buyers : 'status' | 'property_type'
     * @param {Object} [configOverride] - Config à utiliser au lieu du cache
     * @returns {Array} Colonnes effectives prêtes au rendu
     */
    function getEffectiveColumns(pipeline, view, configOverride) {
        const defaults = getDefaults(pipeline, view);
        const config = configOverride || _cache[pipeline];

        if (!config) return defaults.map(col => ({ ...col, visible: true }));

        // Déterminer la clé de config selon le pipeline et la vue
        let userColumns;
        if (pipeline === 'buyers') {
            const configKey = view === 'property_type' ? 'property_columns' : 'status_columns';
            userColumns = config[configKey] || config.columns;
        } else {
            userColumns = config.columns;
        }

        if (!userColumns || !Array.isArray(userColumns) || userColumns.length === 0) {
            return defaults.map(col => ({ ...col, visible: true }));
        }

        // Construire un index des défauts par key
        const defaultsByKey = {};
        defaults.forEach(col => { defaultsByKey[col.key] = col; });

        // Construire les colonnes dans l'ordre user
        const result = [];
        const seenKeys = new Set();

        userColumns.forEach(userCol => {
            const def = defaultsByKey[userCol.key];
            if (!def) return; // Clé inconnue, ignorer

            seenKeys.add(userCol.key);
            result.push({
                ...def,
                label: userCol.label || def.label,
                visible: userCol.visible !== false
            });
        });

        // Ajouter les colonnes par défaut manquantes (forward-compatible)
        defaults.forEach(col => {
            if (!seenKeys.has(col.key)) {
                result.push({ ...col, visible: true });
            }
        });

        return result;
    }

    /**
     * Retourne uniquement les colonnes visibles (pour le rendu pipeline).
     */
    function getVisibleColumns(pipeline, view, configOverride) {
        return getEffectiveColumns(pipeline, view, configOverride).filter(col => col.visible);
    }

    /**
     * Retourne TOUTES les colonnes (y compris masquées) — pour le move popup.
     */
    function getAllColumns(pipeline, view, configOverride) {
        return getEffectiveColumns(pipeline, view, configOverride);
    }

    /**
     * Migration one-shot : labels acquéreurs localStorage → Supabase.
     * Appelée au chargement d'acquereurs.html.
     */
    async function migrateBuyerLocalStorageLabels() {
        const raw = localStorage.getItem('leon_buyer_column_labels');
        if (!raw) return;

        try {
            const labels = JSON.parse(raw);
            if (!labels || Object.keys(labels).length === 0) {
                localStorage.removeItem('leon_buyer_column_labels');
                return;
            }

            // Construire la config depuis les labels existants
            const statusCols = DEFAULT_BUYER_STATUS_COLUMNS.map(col => ({
                key: col.key,
                label: labels[col.key] || null,
                visible: true
            }));

            const propertyCols = DEFAULT_BUYER_PROPERTY_COLUMNS.map(col => ({
                key: col.key,
                label: labels[col.key] || null,
                visible: true
            }));

            const config = {
                status_columns: statusCols,
                property_columns: propertyCols
            };

            // Charger d'abord pour ne pas écraser une config existante
            const existing = await load('buyers');
            if (existing) {
                console.log('[PipelineConfig] Config Supabase existe déjà, skip migration localStorage');
                localStorage.removeItem('leon_buyer_column_labels');
                return;
            }

            await save('buyers', config);
            localStorage.removeItem('leon_buyer_column_labels');
            console.log('[PipelineConfig] Migration localStorage → Supabase OK');
        } catch (e) {
            console.error('[PipelineConfig] Erreur migration:', e);
            // On garde le localStorage comme fallback, retry au prochain chargement
        }
    }

    /**
     * Invalide le cache pour forcer un rechargement depuis Supabase.
     */
    function invalidateCache(pipeline) {
        if (pipeline) {
            delete _cache[pipeline];
        } else {
            Object.keys(_cache).forEach(k => delete _cache[k]);
        }
    }

    // ===== API PUBLIQUE =====
    return {
        getDefaults,
        load,
        save,
        getEffectiveColumns,
        getVisibleColumns,
        getAllColumns,
        migrateBuyerLocalStorageLabels,
        invalidateCache,
        // Exposer les défauts pour référence directe
        DEFAULT_SELLER_COLUMNS,
        DEFAULT_BUYER_STATUS_COLUMNS,
        DEFAULT_BUYER_PROPERTY_COLUMNS
    };
})();

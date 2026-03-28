/**
 * native-bridge.js
 * Pont entre l'app web existante et les APIs natives Capacitor.
 * Détecte automatiquement si on est dans l'app native ou le navigateur.
 * En mode web, toutes les fonctions sont des no-op ou fallback gracieux.
 * Dépendances : @capacitor/core (chargé via le build Capacitor)
 */

(function () {
  'use strict';

  // --- Détection de l'environnement ---
  const isNative = typeof window.Capacitor !== 'undefined' && window.Capacitor.isNativePlatform();
  const platform = isNative ? window.Capacitor.getPlatform() : 'web'; // 'ios' | 'android' | 'web'

  /**
   * LeonNative — API unifiée pour les fonctionnalités natives.
   * Utilisable depuis n'importe quelle page : window.LeonNative.requestContacts()
   */
  window.LeonNative = {
    isNative,
    platform,

    // =============================================
    // CONTACTS
    // =============================================

    /**
     * Demande l'accès aux contacts et retourne la liste.
     * @returns {Promise<Array<{name: string, phone: string, email: string}>>}
     */
    async requestContacts() {
      if (!isNative) {
        console.warn('[LeonNative] Contacts non disponibles en mode web');
        return [];
      }
      try {
        const { Contacts } = await import('@capacitor-community/contacts');
        const permission = await Contacts.requestPermissions();
        if (permission.contacts !== 'granted') {
          console.warn('[LeonNative] Permission contacts refusée');
          return [];
        }
        const result = await Contacts.getContacts({
          projection: { name: true, phones: true, emails: true },
        });
        return (result.contacts || []).map(c => ({
          name: c.name?.display || '',
          phone: c.phones?.[0]?.number || '',
          email: c.emails?.[0]?.address || '',
        }));
      } catch (err) {
        console.error('[LeonNative] Erreur contacts :', err);
        return [];
      }
    },

    // =============================================
    // PUSH NOTIFICATIONS
    // =============================================

    /**
     * Enregistre l'appareil pour les push notifications.
     * @param {Function} onNotification - Callback quand une notif arrive.
     * @returns {Promise<string|null>} Le token FCM/APNS ou null.
     */
    async registerPush(onNotification) {
      if (!isNative) {
        console.warn('[LeonNative] Push non disponibles en mode web');
        return null;
      }
      try {
        const { PushNotifications } = await import('@capacitor/push-notifications');
        const permission = await PushNotifications.requestPermissions();
        if (permission.receive !== 'granted') {
          console.warn('[LeonNative] Permission push refusée');
          return null;
        }

        await PushNotifications.register();

        return new Promise((resolve) => {
          PushNotifications.addListener('registration', (token) => {
            console.log('[LeonNative] Push token :', token.value);
            resolve(token.value);
          });

          PushNotifications.addListener('registrationError', (err) => {
            console.error('[LeonNative] Erreur push registration :', err);
            resolve(null);
          });

          if (onNotification) {
            PushNotifications.addListener('pushNotificationReceived', onNotification);
            PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
              onNotification(action.notification);
            });
          }
        });
      } catch (err) {
        console.error('[LeonNative] Erreur push :', err);
        return null;
      }
    },

    // =============================================
    // CAMERA / PHOTOS
    // =============================================

    /**
     * Prend une photo ou ouvre la galerie.
     * @param {'camera'|'gallery'} source
     * @returns {Promise<string|null>} Data URL de l'image ou null.
     */
    async takePhoto(source = 'camera') {
      if (!isNative) {
        console.warn('[LeonNative] Camera non disponible en mode web');
        return null;
      }
      try {
        const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');
        const image = await Camera.getPhoto({
          quality: 80,
          allowEditing: false,
          resultType: CameraResultType.DataUrl,
          source: source === 'gallery' ? CameraSource.Photos : CameraSource.Camera,
        });
        return image.dataUrl || null;
      } catch (err) {
        if (err.message?.includes('cancelled')) return null;
        console.error('[LeonNative] Erreur camera :', err);
        return null;
      }
    },

    // =============================================
    // PARTAGE NATIF
    // =============================================

    /**
     * Ouvre la feuille de partage native.
     * @param {Object} options - { title, text, url, dialogTitle }
     */
    async share(options) {
      if (!isNative) {
        // Fallback Web Share API
        if (navigator.share) {
          return navigator.share(options);
        }
        console.warn('[LeonNative] Partage non disponible');
        return;
      }
      try {
        const { Share } = await import('@capacitor/share');
        await Share.share(options);
      } catch (err) {
        if (err.message?.includes('cancelled')) return;
        console.error('[LeonNative] Erreur partage :', err);
      }
    },

    // =============================================
    // GEOLOCALISATION
    // =============================================

    /**
     * Obtient la position actuelle.
     * @returns {Promise<{lat: number, lng: number}|null>}
     */
    async getCurrentPosition() {
      try {
        if (isNative) {
          const { Geolocation } = await import('@capacitor/geolocation');
          const permission = await Geolocation.requestPermissions();
          if (permission.location !== 'granted') return null;
          const pos = await Geolocation.getCurrentPosition();
          return { lat: pos.coords.latitude, lng: pos.coords.longitude };
        }
        // Fallback navigateur
        return new Promise((resolve) => {
          navigator.geolocation.getCurrentPosition(
            (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
            () => resolve(null),
          );
        });
      } catch (err) {
        console.error('[LeonNative] Erreur géoloc :', err);
        return null;
      }
    },

    // =============================================
    // HAPTICS
    // =============================================

    /**
     * Vibration de feedback (drag-and-drop, actions).
     * @param {'light'|'medium'|'heavy'} style
     */
    async haptic(style = 'medium') {
      if (!isNative) return;
      try {
        const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
        const map = { light: ImpactStyle.Light, medium: ImpactStyle.Medium, heavy: ImpactStyle.Heavy };
        await Haptics.impact({ style: map[style] || ImpactStyle.Medium });
      } catch (err) {
        // Silencieux — haptics non critique
      }
    },

    // =============================================
    // RÉSEAU
    // =============================================

    /**
     * Vérifie si l'appareil est connecté.
     * @returns {Promise<boolean>}
     */
    async isOnline() {
      if (!isNative) return navigator.onLine;
      try {
        const { Network } = await import('@capacitor/network');
        const status = await Network.getStatus();
        return status.connected;
      } catch {
        return navigator.onLine;
      }
    },

    /**
     * Écoute les changements de connectivité.
     * @param {Function} callback - (connected: boolean) => void
     */
    async onNetworkChange(callback) {
      if (!isNative) {
        window.addEventListener('online', () => callback(true));
        window.addEventListener('offline', () => callback(false));
        return;
      }
      try {
        const { Network } = await import('@capacitor/network');
        Network.addListener('networkStatusChange', (status) => {
          callback(status.connected);
        });
      } catch {
        window.addEventListener('online', () => callback(true));
        window.addEventListener('offline', () => callback(false));
      }
    },

    // =============================================
    // APP LIFECYCLE
    // =============================================

    /**
     * Écoute les événements du cycle de vie de l'app.
     * @param {'pause'|'resume'} event
     * @param {Function} callback
     */
    async onAppStateChange(event, callback) {
      if (!isNative) return;
      try {
        const { App } = await import('@capacitor/app');
        if (event === 'pause') {
          App.addListener('appStateChange', (state) => {
            if (!state.isActive) callback();
          });
        } else if (event === 'resume') {
          App.addListener('appStateChange', (state) => {
            if (state.isActive) callback();
          });
        }
      } catch (err) {
        console.error('[LeonNative] Erreur lifecycle :', err);
      }
    },

    /**
     * Gère le bouton retour Android.
     * @param {Function} callback - Retourne true pour empêcher le back par défaut.
     */
    async onBackButton(callback) {
      if (!isNative || platform !== 'android') return;
      try {
        const { App } = await import('@capacitor/app');
        App.addListener('backButton', (event) => {
          const handled = callback(event);
          if (!handled) {
            App.exitApp();
          }
        });
      } catch (err) {
        console.error('[LeonNative] Erreur back button :', err);
      }
    },
  };

  // --- Log de démarrage ---
  if (isNative) {
    console.log(`[LeonNative] App native détectée — plateforme : ${platform}`);
  }
})();

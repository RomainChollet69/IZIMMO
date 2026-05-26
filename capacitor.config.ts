/**
 * capacitor.config.ts
 * Configuration Capacitor pour l'app mobile Léon.
 * Le webDir pointe vers 'www' (copie des fichiers web pour le build mobile).
 * Ne modifie pas les fichiers source — le build mobile copie dans www/.
 */
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'fr.avecleon.app',
  appName: 'Léon',
  webDir: 'www',

  // Serveur de dev : décommenter pour tester avec le serveur Vercel local
  // server: {
  //   url: 'http://192.168.1.X:3000',
  //   cleartext: true,
  // },

  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#1a1a2e',
      showSpinner: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#1a1a2e',
    },
    Keyboard: {
      resize: 'body',
      scrollAssist: true,
      scrollPadding: true,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },

  ios: {
    contentInset: 'automatic',
    preferredContentMode: 'mobile',
    scheme: 'Leon',
  },

  android: {
    backgroundColor: '#1a1a2e',
    allowMixedContent: true, // Pour les appels API vers Vercel
  },
};

export default config;

import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.compliancematters.everystep',
  appName: 'EveryStep FieldWorks',
  webDir: 'out',
  server: {
    url: 'https://app.compliancemattersca.com',
    cleartext: false,
    androidScheme: 'https',
  },
  android: {
    backgroundColor: '#0f1f35',
    allowMixedContent: false,
    captureInput: false,
    webContentsDebuggingEnabled: false,
  },
  ios: {
    backgroundColor: '#0f1f35',
    contentInset: 'automatic',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#0f1f35',
      androidSplashResourceName: 'splash',
      showSpinner: false,
    },
  },
};

export default config;

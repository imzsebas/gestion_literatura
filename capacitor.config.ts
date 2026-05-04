import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.sebas.misistema',
  appName: 'MiSistema',
  webDir: 'out',

  server: {
    url: 'https://gestion-literatura.vercel.app/',
    cleartext: true
  }
};

export default config;
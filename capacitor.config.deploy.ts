import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.sunho.SDStudio',
  appName: 'SDStudio',
  webDir: 'dist',
  android: { allowMixedContent: true },
  plugins: {
    CapacitorHttp: {
      enabled: true
    }
  }
};

export default config;

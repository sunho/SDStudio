import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.sunho.SDStudio',
  appName: 'SDStudio',
  webDir: 'dist',
  // server: {
  //   url: "http://192.168.0.116:5173",
  //   cleartext: true
  // },
  android: { allowMixedContent: true },
  plugins: {
    CapacitorHttp: {
      enabled: true
    }
  }
};

export default config;

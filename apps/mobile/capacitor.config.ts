import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.zada.mobile",
  appName: "Zada",
  webDir: "../web/dist",
  bundledWebRuntime: false,
  android: {
    buildOptions: {
      keystorePath: undefined
    }
  },
  plugins: {
    LocalNotifications: {
      smallIcon: "ic_stat_zada",
      iconColor: "#6366F1"
    }
  }
};

export default config;

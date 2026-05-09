import { ZadaApiClient } from "@zada/api-client";

export const api = new ZadaApiClient({
  baseUrl: import.meta.env.VITE_API_URL ?? "http://localhost:3000/api",
  getAccessToken: () => localStorage.getItem("zada.accessToken"),
  onUnauthorized: () => {
    localStorage.removeItem("zada.accessToken");
  }
});

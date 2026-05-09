export {};

declare global {
  interface Window {
    zadaDesktop?: {
      openLocalPath(path: string): Promise<string>;
      revealInExplorer(path: string): Promise<boolean>;
    };
  }
}

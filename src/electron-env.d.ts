export {};

declare global {
  interface Window {
    api: {
      test: () => string;
    };
  }
}
import { describe, expect, it, vi } from "vitest";
import EasyWebWorker, { createEasyWebWorker } from "easy-web-worker";

// Doesn't support multi-threading
const fakeCreateEasyWebWorker = (callback: (onMessage: any) => void) => ({
  send: (payload: any) =>
    new Promise(async (resolve, reject) => {
      const onMessage = (callback: ({ payload, resolve }: { payload: any; resolve: any }) => void) => {
        callback({ payload, resolve });
      };
      callback({ onMessage });
    }),
});

vi.mock("easy-web-worker", () => {
  return {
    createEasyWebWorker: vi.fn().mockImplementation(fakeCreateEasyWebWorker),
  };
});

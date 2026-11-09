// @vitest-environment node
/**
 * Contours through the real easy-web-worker. index.test.ts mocks it (see easyWebWorkerMock.ts),
 * so this is the test that fails when an easy-web-worker upgrade changes how the worker body
 * is serialized, run or answered.
 *
 * Node has Blob and URL.createObjectURL but no Worker, so BlobWorker stands in for one: it runs
 * the generated worker source in its own vm context (the body sees none of this module's scope,
 * as in a real Worker) and passes messages through structuredClone. `window` is set like
 * dome2's bun test preload does.
 */
import { describe, expect, it, vi } from "vitest";
import { resolveObjectURL } from "node:buffer";
import fs from "node:fs";
import vm from "node:vm";

vi.unmock("easy-web-worker");

type MessageHandler = ((event: { data: unknown }) => void) | null;

class BlobWorker {
  static created = 0;
  onmessage: MessageHandler = null;
  onerror: ((error: unknown) => void) | null = null;
  private readonly scope: { onmessage: MessageHandler; [key: string]: unknown };
  private readonly ready: Promise<void>;
  private terminated = false;

  constructor(url: string) {
    BlobWorker.created++;
    const blob = resolveObjectURL(String(url));
    if (!blob) throw new Error(`No blob behind ${url}`);
    const scope: BlobWorker["scope"] = { onmessage: null };
    scope.self = scope;
    scope.postMessage = (data: unknown) => {
      const copy = structuredClone(data);
      setTimeout(() => !this.terminated && this.onmessage?.({ data: copy }));
    };
    scope.close = () => this.terminate();
    this.scope = scope;
    vm.createContext(scope);
    this.ready = blob.text().then((source) => void vm.runInContext(source, this.scope));
  }

  postMessage(data: unknown) {
    const copy = structuredClone(data);
    void this.ready.then(() => !this.terminated && this.scope.onmessage?.({ data: copy }));
  }

  terminate() {
    this.terminated = true;
  }
}

describe("Contours through the real easy-web-worker", () => {
  it("match the same contours computed without a worker, across a pool of workers", async () => {
    vi.stubGlobal("window", globalThis);
    vi.stubGlobal("Worker", BlobWorker);
    // Imported after the stubs: the contour worker is created as the module loads.
    const { parseSurfaces, surfaceToContours } = await import("./index");
    const contours = await import("./private/get-contours");

    const [surface] = await parseSurfaces(fs.readFileSync("./src/test_assets/S5.xml", "utf8"));
    const progress: number[] = [];
    const result = await surfaceToContours(surface!, 1, false, (fraction) => progress.push(fraction));

    const { minElevation, maxElevation } = contours.elevationRange(surface!);
    const elevations = contours.contourElevations(minElevation, maxElevation, 1);
    const buckets = contours.bucketTrianglesByElevation(surface!, elevations, 1);
    const expected = contours.constructGeojson(
      elevations.map((elevation) => {
        const t = buckets.get(elevation)!;
        const lines: [[number, number], [number, number]][] = [];
        for (let i = 0; i + 8 < t.length; i += 9) {
          const line = contours.contourLineOnFace(
            [
              [t[i]!, t[i + 1]!, t[i + 2]!],
              [t[i + 3]!, t[i + 4]!, t[i + 5]!],
              [t[i + 6]!, t[i + 7]!, t[i + 8]!],
            ],
            elevation,
          );
          if (line) lines.push(line);
        }
        return { elevation, polylines: contours.linesToPolyLines(lines) };
      }),
    );

    expect(BlobWorker.created).toBe(10); // the pool's maxWorkers
    expect(result.features.length).toBeGreaterThan(0);
    expect(result).toEqual(expected);
    expect(progress).toHaveLength(elevations.length);
    expect(progress.at(-1)).toBe(1);

    vi.unstubAllGlobals();
  });
});

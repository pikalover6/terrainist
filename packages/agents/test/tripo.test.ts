/**
 * Tripo client tests.
 *
 * Every one of these runs against a stub `fetch` and an injected sleep: no
 * network, no API key, no spend, no real timers. CI cannot reach a Tripo key,
 * so a test that needs one is a broken test.
 */

import { describe, expect, it } from "vitest";

import { loadTripoKey, parseEnv } from "../src/env.js";
import type { FetchLike } from "../src/openrouter.js";
import {
  TRIPO_BALANCE_URL,
  TRIPO_MODEL_VERSION,
  TRIPO_TASK_STATUS_URL,
  TRIPO_TASK_URL,
} from "../src/tripo-config.js";
import {
  TripoPollTimeoutError,
  TripoTaskFailedError,
  fetchMeshBytes,
  generateMesh,
  getTaskStatus,
  pollTask,
  submitImageTask,
  submitTextTask,
  verifyTripoAvailable,
} from "../src/tripo.js";

interface Recorded {
  readonly url: string;
  readonly init?: RequestInit;
}

/** A stub `fetch` replaying canned responses in order (last one repeats). */
function stubFetch(
  responses: readonly (
    | { readonly json: unknown; readonly status?: number }
    | { readonly text: string; readonly status: number }
    | { readonly bytes: Uint8Array }
  )[],
): { fetchImpl: FetchLike; calls: Recorded[] } {
  const calls: Recorded[] = [];
  let i = 0;
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push(init === undefined ? { url } : { url, init });
    const spec = responses[Math.min(i, responses.length - 1)] as Record<string, unknown>;
    i++;
    if ("bytes" in spec) {
      return new Response(spec["bytes"] as Uint8Array, { status: 200 });
    }
    if ("text" in spec) {
      return new Response(spec["text"] as string, { status: spec["status"] as number });
    }
    return new Response(JSON.stringify(spec["json"]), {
      status: (spec["status"] as number | undefined) ?? 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  return { fetchImpl, calls };
}

const OK_SUBMIT = { json: { code: 0, data: { task_id: "task-123" } } };
const noSleep = async (): Promise<void> => {};

function statusBody(status: string, extra: Record<string, unknown> = {}): { json: unknown } {
  return { json: { code: 0, data: { task_id: "task-123", status, progress: 50, ...extra } } };
}

describe("submitTextTask", () => {
  it("posts to the task endpoint with the pinned model and a bearer token", async () => {
    const { fetchImpl, calls } = stubFetch([OK_SUBMIT]);
    const task = await submitTextTask({
      apiKey: "test-key",
      fetchImpl,
      prompt: "a colossal seated cat carved as a gothic cathedral",
      negativePrompt: "text, floating parts",
    });

    expect(task).toEqual({ taskId: "task-123", modelVersion: TRIPO_MODEL_VERSION });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(TRIPO_TASK_URL);

    const init = calls[0]?.init as RequestInit;
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer test-key");
    expect(headers["Content-Type"]).toBe("application/json");

    expect(JSON.parse(String(init.body))).toEqual({
      type: "text_to_model",
      prompt: "a colossal seated cat carved as a gothic cathedral",
      model_version: TRIPO_MODEL_VERSION,
      negative_prompt: "text, floating parts",
    });
  });

  it("omits an empty negative prompt and merges provider extras", async () => {
    const { fetchImpl, calls } = stubFetch([OK_SUBMIT]);
    await submitTextTask({
      apiKey: "k",
      fetchImpl,
      prompt: "p",
      negativePrompt: "",
      polish: true,
      extra: { face_limit: 20000 },
    });
    const body = JSON.parse(String((calls[0]?.init as RequestInit).body)) as Record<string, unknown>;
    expect(body["negative_prompt"]).toBeUndefined();
    expect(body["polish"]).toBe(true);
    expect(body["face_limit"]).toBe(20000);
  });

  it("honors an explicit model version override", async () => {
    const { fetchImpl, calls } = stubFetch([OK_SUBMIT]);
    const task = await submitTextTask({
      apiKey: "k",
      fetchImpl,
      prompt: "p",
      modelVersion: "v9.9-test",
    });
    expect(task.modelVersion).toBe("v9.9-test");
    const body = JSON.parse(String((calls[0]?.init as RequestInit).body)) as Record<string, unknown>;
    expect(body["model_version"]).toBe("v9.9-test");
  });

  it("throws with the status and a truncated body on a non-2xx", async () => {
    const { fetchImpl } = stubFetch([{ text: "x".repeat(5000), status: 500 }]);
    await expect(submitTextTask({ apiKey: "k", fetchImpl, prompt: "p" })).rejects.toThrow(
      /Tripo 500/,
    );
    await expect(
      submitTextTask({ apiKey: "k", fetchImpl, prompt: "p" }).catch((e: Error) => e.message.length),
    ).resolves.toBeLessThan(600);
  });

  it("throws on an in-band non-zero code even with a 200", async () => {
    const { fetchImpl } = stubFetch([
      { json: { code: 2000, message: "insufficient balance" }, status: 200 },
    ]);
    await expect(submitTextTask({ apiKey: "k", fetchImpl, prompt: "p" })).rejects.toThrow(
      /error 2000: insufficient balance/,
    );
  });

  it("rejects a malformed success payload rather than inventing a task id", async () => {
    for (const bad of [{ json: 42 }, { json: { code: 0 } }, { json: { code: 0, data: {} } }]) {
      const { fetchImpl } = stubFetch([bad]);
      await expect(submitTextTask({ apiKey: "k", fetchImpl, prompt: "p" })).rejects.toThrow(
        /Tripo task submit/,
      );
    }
  });

  it("never puts the key in the thrown message", async () => {
    const { fetchImpl } = stubFetch([{ text: "nope", status: 401 }]);
    const message = await submitTextTask({
      apiKey: "super-secret-key",
      fetchImpl,
      prompt: "p",
    }).catch((e: Error) => e.message);
    expect(message).not.toContain("super-secret-key");
  });
});

describe("submitImageTask", () => {
  it("sends a url-sourced image by default", async () => {
    const { fetchImpl, calls } = stubFetch([OK_SUBMIT]);
    await submitImageTask({ apiKey: "k", fetchImpl, imageToken: "https://example/i.jpg" });
    const body = JSON.parse(String((calls[0]?.init as RequestInit).body)) as Record<string, unknown>;
    expect(body["type"]).toBe("image_to_model");
    expect(body["file"]).toEqual({ type: "jpg", url: "https://example/i.jpg" });
  });

  it("sends a file token when the source is a file", async () => {
    const { fetchImpl, calls } = stubFetch([OK_SUBMIT]);
    await submitImageTask({ apiKey: "k", fetchImpl, imageToken: "tok", imageSource: "file" });
    const body = JSON.parse(String((calls[0]?.init as RequestInit).body)) as Record<string, unknown>;
    expect(body["file"]).toEqual({ type: "jpg", file_token: "tok" });
  });
});

describe("getTaskStatus", () => {
  it("hits the per-task URL and narrows the output model url", async () => {
    const { fetchImpl, calls } = stubFetch([
      statusBody("success", { output: { pbr_model: "https://cdn/mesh.glb" } }),
    ]);
    const status = await getTaskStatus({ apiKey: "k", fetchImpl, taskId: "task-123" });
    expect(calls[0]?.url).toBe(`${TRIPO_TASK_STATUS_URL}task-123`);
    expect(status).toEqual({
      taskId: "task-123",
      status: "success",
      progress: 50,
      modelUrl: "https://cdn/mesh.glb",
    });
  });

  it("falls back through model and base_model, and defaults progress", async () => {
    const { fetchImpl } = stubFetch([
      { json: { code: 0, data: { status: "success", output: { base_model: "https://cdn/b.glb" } } } },
    ]);
    const status = await getTaskStatus({ apiKey: "k", fetchImpl, taskId: "t" });
    expect(status.modelUrl).toBe("https://cdn/b.glb");
    expect(status.progress).toBe(0);
    expect(status.taskId).toBe("t");
  });

  it("rejects a payload with no status field", async () => {
    const { fetchImpl } = stubFetch([{ json: { code: 0, data: { progress: 10 } } }]);
    await expect(getTaskStatus({ apiKey: "k", fetchImpl, taskId: "t" })).rejects.toThrow(
      /no status field/,
    );
  });

  it("throws on a non-2xx with the truncated body", async () => {
    const { fetchImpl } = stubFetch([{ text: "y".repeat(2000), status: 404 }]);
    const message = await getTaskStatus({ apiKey: "k", fetchImpl, taskId: "t" }).catch(
      (e: Error) => e.message,
    );
    expect(message).toMatch(/Tripo task status 404/);
    expect(String(message).length).toBeLessThan(600);
  });
});

describe("pollTask", () => {
  it("succeeds after N polls and reports each one", async () => {
    const { fetchImpl, calls } = stubFetch([
      statusBody("queued"),
      statusBody("running"),
      statusBody("success", { output: { pbr_model: "https://cdn/mesh.glb" } }),
    ]);
    const seen: string[] = [];
    const done = await pollTask({
      apiKey: "k",
      fetchImpl,
      taskId: "task-123",
      sleep: noSleep,
      onPoll: (s) => seen.push(s.status),
    });
    expect(seen).toEqual(["queued", "running", "success"]);
    expect(calls).toHaveLength(3);
    expect(done.modelUrl).toBe("https://cdn/mesh.glb");
  });

  it("throws TripoTaskFailedError on a terminal failure", async () => {
    const { fetchImpl } = stubFetch([statusBody("queued"), statusBody("failed")]);
    await expect(
      pollTask({ apiKey: "k", fetchImpl, taskId: "task-123", sleep: noSleep }),
    ).rejects.toBeInstanceOf(TripoTaskFailedError);
  });

  it("treats a success with no model url as an error", async () => {
    const { fetchImpl } = stubFetch([statusBody("success")]);
    await expect(
      pollTask({ apiKey: "k", fetchImpl, taskId: "task-123", sleep: noSleep }),
    ).rejects.toThrow(/no model URL/);
  });

  it("exhausts a bounded attempt budget instead of looping forever", async () => {
    const { fetchImpl, calls } = stubFetch([statusBody("running")]);
    const error = await pollTask({
      apiKey: "k",
      fetchImpl,
      taskId: "task-123",
      maxAttempts: 4,
      sleep: noSleep,
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TripoPollTimeoutError);
    expect((error as TripoPollTimeoutError).attempts).toBe(4);
    expect(calls).toHaveLength(4);
  });

  it("sleeps between polls but not after the last one", async () => {
    const waits: number[] = [];
    const { fetchImpl } = stubFetch([statusBody("running")]);
    await pollTask({
      apiKey: "k",
      fetchImpl,
      taskId: "t",
      maxAttempts: 3,
      intervalMs: 7,
      sleep: async (ms) => {
        waits.push(ms);
      },
    }).catch(() => undefined);
    expect(waits).toEqual([7, 7]);
  });
});

describe("generateMesh", () => {
  it("submits then polls, carrying the pinned model version through", async () => {
    const { fetchImpl, calls } = stubFetch([
      OK_SUBMIT,
      statusBody("success", { output: { model: "https://cdn/m.glb" } }),
    ]);
    const result = await generateMesh({ apiKey: "k", fetchImpl, prompt: "p", sleep: noSleep });
    expect(calls[0]?.url).toBe(TRIPO_TASK_URL);
    expect(calls[1]?.url).toBe(`${TRIPO_TASK_STATUS_URL}task-123`);
    expect(result.modelVersion).toBe(TRIPO_MODEL_VERSION);
    expect(result.modelUrl).toBe("https://cdn/m.glb");
  });
});

describe("fetchMeshBytes", () => {
  it("returns raw bytes and sends no bearer token to the CDN", async () => {
    const payload = new Uint8Array([1, 2, 3, 4]);
    const { fetchImpl, calls } = stubFetch([{ bytes: payload }]);
    const bytes = await fetchMeshBytes({ apiKey: "k", fetchImpl, modelUrl: "https://cdn/m.glb" });
    expect(Array.from(bytes)).toEqual([1, 2, 3, 4]);
    expect(calls[0]?.init).toBeUndefined();
  });

  it("throws on a non-2xx download", async () => {
    const { fetchImpl } = stubFetch([{ text: "gone", status: 403 }]);
    await expect(
      fetchMeshBytes({ apiKey: "k", fetchImpl, modelUrl: "https://cdn/m.glb" }),
    ).rejects.toThrow(/mesh download 403/);
  });
});

describe("verifyTripoAvailable", () => {
  it("reports the pin and the balance on success", async () => {
    const { fetchImpl, calls } = stubFetch([{ json: { code: 0, data: { balance: 12.5 } } }]);
    await expect(verifyTripoAvailable({ apiKey: "k", fetchImpl })).resolves.toEqual({
      modelVersion: TRIPO_MODEL_VERSION,
      balance: 12.5,
    });
    expect(calls[0]?.url).toBe(TRIPO_BALANCE_URL);
  });

  it("names the file to edit when the check fails", async () => {
    const { fetchImpl } = stubFetch([{ text: "bad key", status: 401 }]);
    const message = await verifyTripoAvailable({ apiKey: "secret", fetchImpl }).catch(
      (e: Error) => e.message,
    );
    expect(message).toContain("packages/agents/src/tripo-config.ts");
    expect(message).not.toContain("secret");
  });
});

describe("loadTripoKey", () => {
  const KEY = "TRIPO_API_KEY";

  function withEnv<T>(value: string | undefined, fn: () => T): T {
    const previous = process.env[KEY];
    if (value === undefined) delete process.env[KEY];
    else process.env[KEY] = value;
    try {
      return fn();
    } finally {
      if (previous === undefined) delete process.env[KEY];
      else process.env[KEY] = previous;
    }
  }

  it("prefers the process environment over the repo .env", () => {
    // `repoRoot` points at a directory with no .env, so only the env var can win.
    withEnv("from-env", () => {
      expect(loadTripoKey("/nonexistent-repo-root")).toBe("from-env");
    });
  });

  it("trims surrounding whitespace", () => {
    withEnv("  padded  ", () => {
      expect(loadTripoKey("/nonexistent-repo-root")).toBe("padded");
    });
  });

  it("throws with placement guidance, and echoes no key, when absent", () => {
    withEnv(undefined, () => {
      let message = "";
      try {
        loadTripoKey("/nonexistent-repo-root");
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).toContain("no TRIPO_API_KEY");
      expect(message).toContain(".env");
    });
  });

  it("ignores a blank environment value and falls through to .env", () => {
    withEnv("   ", () => {
      expect(() => loadTripoKey("/nonexistent-repo-root")).toThrow(/no TRIPO_API_KEY/);
    });
  });

  it("reads the key out of a .env body via the shared parser", () => {
    expect(parseEnv("# c\nexport TRIPO_API_KEY='tsk_abc'\n")["TRIPO_API_KEY"]).toBe("tsk_abc");
  });
});

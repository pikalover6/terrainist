/**
 * A very small Tripo3D client — submit a mesh task, poll it, download the mesh.
 *
 * Deliberately not an SDK, for the same reasons as `openrouter.ts`: three
 * endpoints, `fetch`, and typed narrowing of the fields we actually read.
 * Both `fetch` and the poll delay are injectable, so the tests never touch the
 * network and never wait on a real clock.
 *
 * Tripo's flow is asynchronous:
 *   1. POST /task            → `{ code: 0, data: { task_id } }`
 *   2. GET  /task/{id}       → `{ code: 0, data: { status, progress, output } }`
 *      repeatedly until `status` is terminal;
 *   3. GET  <output url>     → the mesh bytes.
 *
 * The API key is passed as a bearer token and is never logged, never included
 * in an error message, and never placed on a returned object.
 */

import {
  TRIPO_BALANCE_URL,
  TRIPO_ERROR_BODY_LIMIT,
  TRIPO_FAILURE_STATUSES,
  TRIPO_IMAGE_TASK_TYPE,
  TRIPO_MAX_POLL_ATTEMPTS,
  TRIPO_MODEL_VERSION,
  TRIPO_POLL_INTERVAL_MS,
  TRIPO_SUCCESS_STATUS,
  TRIPO_TASK_STATUS_URL,
  TRIPO_TASK_URL,
  TRIPO_TEXT_TASK_TYPE,
} from "./tripo-config.js";
import type { FetchLike } from "./openrouter.js";

export type { FetchLike };

/** A sleep function. Injected so tests advance time without a real clock. */
export type SleepLike = (ms: number) => Promise<void>;

/** Options shared by every Tripo call. */
export interface TripoClientOptions {
  readonly apiKey: string;
  readonly fetchImpl?: FetchLike;
}

/** A text→3D request. `prompt` should already be the augmented prompt (§9.3). */
export interface TripoTextTaskRequest extends TripoClientOptions {
  readonly prompt: string;
  readonly negativePrompt?: string;
  /** Overrides the pinned model version. Do this only to test a new pin. */
  readonly modelVersion?: string;
  /** Provider-side post-processing ("polish" in the Loam provider block). */
  readonly polish?: boolean;
  /** Extra provider options, merged into the request body verbatim. */
  readonly extra?: Readonly<Record<string, unknown>>;
}

/** An image→3D request. `imageToken` is a Tripo upload token or a public URL. */
export interface TripoImageTaskRequest extends TripoClientOptions {
  readonly imageToken: string;
  /** `url` when {@link imageToken} is a public URL, otherwise `file`. */
  readonly imageSource?: "file" | "url";
  readonly modelVersion?: string;
  readonly extra?: Readonly<Record<string, unknown>>;
}

/** A submitted task. */
export interface TripoTask {
  readonly taskId: string;
  /** The model version this task was submitted against — goes in the lockfile. */
  readonly modelVersion: string;
}

/** One observed task status. */
export interface TripoTaskStatus {
  readonly taskId: string;
  readonly status: string;
  /** 0..100 when Tripo reports it, otherwise 0. */
  readonly progress: number;
  /** The mesh download URL, present once the task succeeds. */
  readonly modelUrl?: string;
}

/** A finished task, guaranteed to carry a mesh URL. */
export interface TripoCompletedTask extends TripoTaskStatus {
  readonly status: typeof TRIPO_SUCCESS_STATUS;
  readonly modelUrl: string;
}

/** Options for {@link pollTask}. */
export interface TripoPollOptions extends TripoClientOptions {
  readonly taskId: string;
  readonly maxAttempts?: number;
  readonly intervalMs?: number;
  /** Injected sleep. Defaults to a real timer; tests pass a no-op. */
  readonly sleep?: SleepLike;
  /** Called after each poll — progress reporting without any logging here. */
  readonly onPoll?: (status: TripoTaskStatus, attempt: number) => void;
}

/** Thrown when a task reaches a terminal non-success state. */
export class TripoTaskFailedError extends Error {
  readonly taskId: string;
  readonly status: string;
  constructor(taskId: string, status: string) {
    super(`Tripo task ${taskId} ended in status "${status}"`);
    this.name = "TripoTaskFailedError";
    this.taskId = taskId;
    this.status = status;
  }
}

/** Thrown when the bounded poll budget runs out before a terminal state. */
export class TripoPollTimeoutError extends Error {
  readonly taskId: string;
  readonly attempts: number;
  readonly lastStatus: string;
  constructor(taskId: string, attempts: number, lastStatus: string) {
    super(
      `Tripo task ${taskId} was still "${lastStatus}" after ${attempts} polls; giving up ` +
        `(raise TRIPO_MAX_POLL_ATTEMPTS in packages/agents/src/tripo-config.ts if this is legitimate)`,
    );
    this.name = "TripoPollTimeoutError";
    this.taskId = taskId;
    this.attempts = attempts;
    this.lastStatus = lastStatus;
  }
}

/* -------------------------------------------------------------------------- */
/* Submission                                                                  */
/* -------------------------------------------------------------------------- */

/** Submit a text→3D task. Throws on any non-2xx or in-band error. */
export async function submitTextTask(request: TripoTextTaskRequest): Promise<TripoTask> {
  const modelVersion = request.modelVersion ?? TRIPO_MODEL_VERSION;
  const body: Record<string, unknown> = {
    type: TRIPO_TEXT_TASK_TYPE,
    prompt: request.prompt,
    model_version: modelVersion,
  };
  if (request.negativePrompt !== undefined && request.negativePrompt !== "") {
    body["negative_prompt"] = request.negativePrompt;
  }
  if (request.polish !== undefined) body["polish"] = request.polish;
  Object.assign(body, request.extra ?? {});

  return { taskId: await postTask(request, body), modelVersion };
}

/** Submit an image→3D task. Throws on any non-2xx or in-band error. */
export async function submitImageTask(request: TripoImageTaskRequest): Promise<TripoTask> {
  const modelVersion = request.modelVersion ?? TRIPO_MODEL_VERSION;
  const source = request.imageSource ?? "url";
  const body: Record<string, unknown> = {
    type: TRIPO_IMAGE_TASK_TYPE,
    model_version: modelVersion,
    file:
      source === "url"
        ? { type: "jpg", url: request.imageToken }
        : { type: "jpg", file_token: request.imageToken },
  };
  Object.assign(body, request.extra ?? {});

  return { taskId: await postTask(request, body), modelVersion };
}

async function postTask(
  options: TripoClientOptions,
  body: Record<string, unknown>,
): Promise<string> {
  const doFetch = options.fetchImpl ?? (globalThis.fetch as FetchLike);
  const response = await doFetch(TRIPO_TASK_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(
      `Tripo ${response.status} ${response.statusText}: ${await safeText(response)}`,
    );
  }
  return narrowTaskId(await readJson(response));
}

/* -------------------------------------------------------------------------- */
/* Polling                                                                     */
/* -------------------------------------------------------------------------- */

/** Read one task status. */
export async function getTaskStatus(
  options: TripoClientOptions & { readonly taskId: string },
): Promise<TripoTaskStatus> {
  const doFetch = options.fetchImpl ?? (globalThis.fetch as FetchLike);
  const response = await doFetch(`${TRIPO_TASK_STATUS_URL}${encodeURIComponent(options.taskId)}`, {
    headers: { Authorization: `Bearer ${options.apiKey}` },
  });
  if (!response.ok) {
    throw new Error(
      `Tripo task status ${response.status} ${response.statusText}: ${await safeText(response)}`,
    );
  }
  return narrowTaskStatus(await readJson(response), options.taskId);
}

/**
 * Poll a task until it succeeds, fails, or the bounded attempt budget runs out.
 *
 * The budget is bounded on purpose (§ "no hung compiles"): a provider outage
 * must surface as an error, not as a wedged process.
 */
export async function pollTask(options: TripoPollOptions): Promise<TripoCompletedTask> {
  const maxAttempts = options.maxAttempts ?? TRIPO_MAX_POLL_ATTEMPTS;
  const intervalMs = options.intervalMs ?? TRIPO_POLL_INTERVAL_MS;
  const sleep = options.sleep ?? defaultSleep;

  let last = "pending";
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const status = await getTaskStatus(options);
    last = status.status;
    options.onPoll?.(status, attempt);

    if (status.status === TRIPO_SUCCESS_STATUS) {
      if (status.modelUrl === undefined) {
        throw new Error(`Tripo task ${status.taskId} succeeded but returned no model URL`);
      }
      return { ...status, status: TRIPO_SUCCESS_STATUS, modelUrl: status.modelUrl };
    }
    if (TRIPO_FAILURE_STATUSES.includes(status.status)) {
      throw new TripoTaskFailedError(status.taskId, status.status);
    }
    if (attempt < maxAttempts) await sleep(intervalMs);
  }
  throw new TripoPollTimeoutError(options.taskId, maxAttempts, last);
}

/** Submit a text→3D task and poll it to completion. */
export async function generateMesh(
  request: TripoTextTaskRequest & Omit<TripoPollOptions, "taskId" | "apiKey" | "fetchImpl">,
): Promise<TripoCompletedTask & { readonly modelVersion: string }> {
  const task = await submitTextTask(request);
  const done = await pollTask({ ...request, taskId: task.taskId });
  return { ...done, modelVersion: task.modelVersion };
}

/* -------------------------------------------------------------------------- */
/* Download                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Download the finished mesh.
 *
 * Returns raw bytes: hashing and voxelization are a later stage's problem, and
 * the lockfile records the hash of exactly these bytes.
 */
export async function fetchMeshBytes(
  options: TripoClientOptions & { readonly modelUrl: string },
): Promise<Uint8Array> {
  const doFetch = options.fetchImpl ?? (globalThis.fetch as FetchLike);
  // The signed URL carries its own auth; no bearer token is sent to the CDN.
  const response = await doFetch(options.modelUrl);
  if (!response.ok) {
    throw new Error(
      `Tripo mesh download ${response.status} ${response.statusText}: ${await safeText(response)}`,
    );
  }
  return new Uint8Array(await response.arrayBuffer());
}

/* -------------------------------------------------------------------------- */
/* Liveness                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Confirm the credentials work and the pinned model version is still accepted.
 *
 * Tripo publishes no model catalog, so there is nothing to diff a pin against;
 * this checks the account endpoint (cheap, authenticated, no spend) and reports
 * the pin plus the file to edit, so a failure reads as "change the pin here"
 * rather than "go read the API docs".
 */
export async function verifyTripoAvailable(
  options: TripoClientOptions & { readonly modelVersion?: string },
): Promise<{ readonly modelVersion: string; readonly balance?: number }> {
  const doFetch = options.fetchImpl ?? (globalThis.fetch as FetchLike);
  const wanted = options.modelVersion ?? TRIPO_MODEL_VERSION;

  const response = await doFetch(TRIPO_BALANCE_URL, {
    headers: { Authorization: `Bearer ${options.apiKey}` },
  });
  if (!response.ok) {
    throw new Error(
      `Tripo account check ${response.status} ${response.statusText}: ${await safeText(response)}\n` +
        `Pinned model version is "${wanted}" — set TRIPO_API_KEY, or update ` +
        `TRIPO_MODEL_VERSION in packages/agents/src/tripo-config.ts.`,
    );
  }

  const payload = await readJson(response);
  const data = inBandData(payload, "Tripo account check");
  const balance = (data as { balance?: unknown }).balance;
  return {
    modelVersion: wanted,
    ...(typeof balance === "number" && Number.isFinite(balance) ? { balance } : {}),
  };
}

/* -------------------------------------------------------------------------- */
/* Narrowing                                                                   */
/* -------------------------------------------------------------------------- */

function narrowTaskId(payload: unknown): string {
  const data = inBandData(payload, "Tripo task submit");
  const taskId = (data as { task_id?: unknown }).task_id;
  if (typeof taskId !== "string" || taskId === "") {
    throw new Error("Tripo task submit returned no task_id");
  }
  return taskId;
}

function narrowTaskStatus(payload: unknown, requestedId: string): TripoTaskStatus {
  const data = inBandData(payload, "Tripo task status") as {
    task_id?: unknown;
    status?: unknown;
    progress?: unknown;
    output?: { pbr_model?: unknown; model?: unknown; base_model?: unknown };
  };

  if (typeof data.status !== "string" || data.status === "") {
    throw new Error(`Tripo task ${requestedId} status response had no status field`);
  }

  const out = typeof data.output === "object" && data.output !== null ? data.output : {};
  const url = [out.pbr_model, out.model, out.base_model].find(
    (candidate): candidate is string => typeof candidate === "string" && candidate !== "",
  );

  return {
    taskId: typeof data.task_id === "string" && data.task_id !== "" ? data.task_id : requestedId,
    status: data.status,
    progress:
      typeof data.progress === "number" && Number.isFinite(data.progress) ? data.progress : 0,
    ...(url !== undefined ? { modelUrl: url } : {}),
  };
}

/**
 * Unwrap Tripo's `{ code, data, message }` envelope.
 *
 * Tripo reports failures in-band with a 200, so a non-zero `code` is an error
 * exactly like a non-2xx status.
 */
function inBandData(payload: unknown, what: string): object {
  if (typeof payload !== "object" || payload === null) {
    throw new Error(`${what} returned a non-object response body`);
  }
  const p = payload as { code?: unknown; data?: unknown; message?: unknown; suggestion?: unknown };
  if (typeof p.code === "number" && p.code !== 0) {
    const message = typeof p.message === "string" ? p.message : "unknown";
    throw new Error(`${what} error ${p.code}: ${message.slice(0, TRIPO_ERROR_BODY_LIMIT)}`);
  }
  if (typeof p.data !== "object" || p.data === null) {
    throw new Error(`${what} returned no data object`);
  }
  return p.data;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    throw new Error("Tripo returned a body that is not JSON");
  }
}

async function safeText(response: Response): Promise<string> {
  try {
    const text = await response.text();
    return text.slice(0, TRIPO_ERROR_BODY_LIMIT);
  } catch {
    return "<no body>";
  }
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

declare module "node:http" {
  export interface IncomingMessage {
    method?: string;
    url?: string;
    headers: Record<string, string | string[] | undefined>;
    on(event: "data", cb: (chunk: Buffer) => void): void;
    on(event: "end" | "close", cb: () => void): void;
  }
  export interface ServerResponse {
    writeHead(status: number, headers?: Record<string, string>): void;
    end(body?: string | Uint8Array): void;
  }
  export interface AddressInfo {
    port: number;
  }
  export interface Server {
    listen(port: number, host: string, cb: () => void): void;
    close(cb?: () => void): void;
    address(): AddressInfo | string | null;
    on(event: "error", cb: (err: Error) => void): void;
  }
  export function createServer(listener: (req: IncomingMessage, res: ServerResponse) => void): Server;
}

declare module "node:sqlite" {
  export class DatabaseSync {
    constructor(path: string);
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
  }
  export class StatementSync {
    run(...params: unknown[]): { changes: number };
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  }
}

declare module "node:crypto" {
  export function createPublicKey(key: unknown): object;
  export function verify(
    algorithm: string | null,
    data: Uint8Array,
    key: unknown,
    signature: Uint8Array,
  ): boolean;
}

declare module "node:fs" {
  export function mkdirSync(path: string, opts?: { recursive?: boolean }): void;
  export function existsSync(path: string): boolean;
  export function readFileSync(path: string, enc: "utf8"): string;
  export function readFileSync(path: string): Uint8Array;
  export function writeFileSync(path: string, data: string): void;
  export function statSync(path: string): { isDirectory(): boolean; isFile(): boolean };
}

declare module "node:path" {
  export function dirname(path: string): string;
  export function resolve(...parts: string[]): string;
  export function join(...parts: string[]): string;
  export function normalize(path: string): string;
  export function extname(path: string): string;
  export const sep: string;
}

interface Buffer {
  toString(enc?: string): string;
}
interface BufferConstructor {
  concat(chunks: Buffer[]): Buffer;
  from(data: string | Uint8Array, enc?: string): Buffer;
}
declare const Buffer: BufferConstructor;
declare const process: { env: Record<string, string | undefined> };

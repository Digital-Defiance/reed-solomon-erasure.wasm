/**
 * Reed-Solomon Erasure Coding WASM Library - Browser Build
 * 
 * This is a browser-only build with NO Node.js dependencies.
 * For Node.js, use the main entry point instead.
 * 
 * @packageDocumentation
 * @module @digitaldefiance/reed-solomon-erasure.wasm/browser
 */

interface IWasm {
    memory: WebAssembly.Memory;
    encode(shardsPointer: number, shardsLength: number, dataShards: number, parityShards: number): number;
    reconstruct(shardsPointer: number, shardsLength: number, dataShards: number, parityShards: number, e: number, f: number): number;
    __wbindgen_malloc(length: number): number;
    __wbindgen_free(pointer: number, length: number): void;
}

// Cached WASM instance for singleton pattern
let cachedInstance: ReedSolomonErasure | null = null;
let loadingPromise: Promise<ReedSolomonErasure> | null = null;

/**
 * Reed-Solomon Erasure Coding implementation using WebAssembly.
 * Browser-only build - no Node.js dependencies.
 */
export class ReedSolomonErasure {
    // Result codes
    public static readonly RESULT_OK = 0;
    public static readonly RESULT_ERROR_TOO_FEW_SHARDS = 1;
    public static readonly RESULT_ERROR_TOO_MANY_SHARDS = 2;
    public static readonly RESULT_ERROR_TOO_FEW_DATA_SHARDS = 3;
    public static readonly RESULT_ERROR_TOO_MANY_DATA_SHARDS = 4;
    public static readonly RESULT_ERROR_TOO_FEW_PARITY_SHARDS = 5;
    public static readonly RESULT_ERROR_TOO_MANY_PARITY_SHARDS = 6;
    public static readonly RESULT_ERROR_TOO_FEW_BUFFER_SHARDS = 7;
    public static readonly RESULT_ERROR_TOO_MANY_BUFFER_SHARDS = 8;
    public static readonly RESULT_ERROR_INCORRECT_SHARD_SIZE = 9;
    public static readonly RESULT_ERROR_TOO_FEW_SHARDS_PRESENT = 10;
    public static readonly RESULT_ERROR_EMPTY_SHARD = 11;
    public static readonly RESULT_ERROR_INVALID_SHARD_FLAGS = 12;
    public static readonly RESULT_ERROR_INVALID_INDEX = 13;

    private memoryCache: Uint8Array | null = null;

    private constructor(private readonly exports: IWasm) {}

    /**
     * Get or create a singleton instance.
     * Useful for applications that only need one encoder.
     * 
     * @param wasmUrl - URL to the WASM file (defaults to same directory)
     */
    public static async getInstance(wasmUrl?: string): Promise<ReedSolomonErasure> {
        if (cachedInstance) {
            return cachedInstance;
        }
        
        if (loadingPromise) {
            return loadingPromise;
        }

        loadingPromise = ReedSolomonErasure.fromUrl(wasmUrl || './reed_solomon_erasure_bg.wasm');
        cachedInstance = await loadingPromise;
        loadingPromise = null;
        
        return cachedInstance;
    }

    /**
     * Clear the singleton instance (useful for testing or memory management).
     */
    public static clearInstance(): void {
        cachedInstance = null;
        loadingPromise = null;
    }

    /**
     * Load WASM from a URL using fetch.
     * 
     * @param url - URL to the WASM file
     */
    public static async fromUrl(url: string): Promise<ReedSolomonErasure> {
        return ReedSolomonErasure.fromResponse(fetch(url));
    }

    /**
     * Load WASM from a fetch Response.
     * Supports streaming instantiation for better performance.
     * 
     * @param source - Response or Promise<Response> from fetch
     */
    public static async fromResponse(source: Response | Promise<Response>): Promise<ReedSolomonErasure> {
        const response = await source;
        
        // Try streaming instantiation first (more efficient)
        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                // Clone response in case we need to fall back
                const { instance } = await WebAssembly.instantiateStreaming(response.clone());
                return new ReedSolomonErasure(instance.exports as unknown as IWasm);
            } catch {
                // Fall through to ArrayBuffer method
            }
        }
        
        // Fallback: load entire ArrayBuffer
        const bytes = await response.arrayBuffer();
        return ReedSolomonErasure.fromBytes(bytes);
    }

    /**
     * Load WASM from raw bytes (ArrayBuffer or Uint8Array).
     * 
     * @param bytes - The WASM binary
     */
    public static fromBytes(bytes: BufferSource): ReedSolomonErasure {
        const module = new WebAssembly.Module(bytes);
        const instance = new WebAssembly.Instance(module);
        return new ReedSolomonErasure(instance.exports as unknown as IWasm);
    }

    /**
     * Load WASM from a base64-encoded string.
     * Useful for embedding WASM directly in JavaScript.
     * 
     * @param base64 - Base64-encoded WASM binary
     */
    public static fromBase64(base64: string): ReedSolomonErasure {
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return ReedSolomonErasure.fromBytes(bytes);
    }

    /**
     * Encode data shards to generate parity shards.
     * 
     * @param shards - Contiguous buffer containing all shards (data + space for parity)
     * @param dataShards - Number of data shards
     * @param parityShards - Number of parity shards to generate
     * @returns Result code (RESULT_OK on success)
     */
    public encode(shards: Uint8Array, dataShards: number, parityShards: number): number {
        const exports = this.exports;
        const shardsLength = shards.length;
        const shardsPointer = exports.__wbindgen_malloc(shardsLength);
        
        this.getUint8Memory().set(shards, shardsPointer);

        const shardSize = shardsLength / (dataShards + parityShards);
        const result = exports.encode(shardsPointer, shardsLength, dataShards, parityShards);

        if (result === ReedSolomonErasure.RESULT_OK) {
            shards.set(
                this.getUint8Memory().subarray(
                    shardsPointer + shardSize * dataShards,
                    shardsPointer + shardsLength
                ),
                shardSize * dataShards
            );
        }

        exports.__wbindgen_free(shardsPointer, shardsLength);
        return result;
    }

    /**
     * Reconstruct missing data shards from available shards.
     * 
     * @param shards - Contiguous buffer containing all shards
     * @param dataShards - Number of data shards
     * @param parityShards - Number of parity shards
     * @param shardsAvailable - Boolean array indicating which shards are valid
     * @returns Result code (RESULT_OK on success)
     */
    public reconstruct(
        shards: Uint8Array,
        dataShards: number,
        parityShards: number,
        shardsAvailable: boolean[]
    ): number {
        const exports = this.exports;
        const shardsLength = shards.length;
        const shardsPointer = exports.__wbindgen_malloc(shardsLength);
        
        this.getUint8Memory().set(shards, shardsPointer);

        const shardsAvailableLength = shardsAvailable.length;
        const shardsAvailablePointer = exports.__wbindgen_malloc(shardsAvailableLength);
        this.getUint8Memory().set(
            shardsAvailable.map((value) => value ? 1 : 0),
            shardsAvailablePointer
        );

        const shardSize = shardsLength / (dataShards + parityShards);
        const result = exports.reconstruct(
            shardsPointer,
            shardsLength,
            dataShards,
            parityShards,
            shardsAvailablePointer,
            shardsAvailableLength
        );

        if (result === ReedSolomonErasure.RESULT_OK) {
            shards.set(
                this.getUint8Memory().subarray(shardsPointer, shardsPointer + shardSize * dataShards)
            );
        }

        exports.__wbindgen_free(shardsPointer, shardsLength);
        exports.__wbindgen_free(shardsAvailablePointer, shardsAvailableLength);
        
        return result;
    }

    /**
     * Get result code description.
     */
    public static getResultMessage(code: number): string {
        const messages: Record<number, string> = {
            0: 'OK',
            1: 'Too few shards',
            2: 'Too many shards',
            3: 'Too few data shards',
            4: 'Too many data shards',
            5: 'Too few parity shards',
            6: 'Too many parity shards',
            7: 'Too few buffer shards',
            8: 'Too many buffer shards',
            9: 'Incorrect shard size',
            10: 'Too few shards present for reconstruction',
            11: 'Empty shard',
            12: 'Invalid shard flags',
            13: 'Invalid index',
        };
        return messages[code] || `Unknown error code: ${code}`;
    }

    private getUint8Memory(): Uint8Array {
        let cache = this.memoryCache;
        if (cache === null || cache.buffer !== this.exports.memory.buffer) {
            cache = new Uint8Array(this.exports.memory.buffer);
            this.memoryCache = cache;
        }
        return cache;
    }
}

// Re-export for convenience
export default ReedSolomonErasure;

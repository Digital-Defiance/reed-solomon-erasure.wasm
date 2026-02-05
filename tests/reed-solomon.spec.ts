import { describe, it, expect, beforeAll } from 'vitest';
import { ReedSolomonErasure } from '../src/index';

describe('ReedSolomonErasure', () => {
  let rs: ReedSolomonErasure;

  beforeAll(async () => {
    rs = await ReedSolomonErasure.fromCurrentDirectory();
  });

  describe('encode', () => {
    it('should encode data shards and generate parity shards', () => {
      const dataShards = 4;
      const parityShards = 2;
      const shardSize = 64;
      const totalSize = shardSize * (dataShards + parityShards);

      const shards = new Uint8Array(totalSize);
      
      // Fill data shards with test data
      for (let i = 0; i < dataShards * shardSize; i++) {
        shards[i] = i % 256;
      }

      const result = rs.encode(shards, dataShards, parityShards);
      
      expect(result).toBe(ReedSolomonErasure.RESULT_OK);
      
      // Parity shards should now be non-zero
      const parityStart = dataShards * shardSize;
      let hasNonZero = false;
      for (let i = parityStart; i < totalSize; i++) {
        if (shards[i] !== 0) {
          hasNonZero = true;
          break;
        }
      }
      expect(hasNonZero).toBe(true);
    });

    it('should throw on invalid shard configuration', () => {
      const shards = new Uint8Array(100);
      
      // Too many parity shards causes WASM to panic
      expect(() => rs.encode(shards, 1, 256)).toThrow();
    });
  });

  describe('reconstruct', () => {
    it('should reconstruct missing data shards', () => {
      const dataShards = 4;
      const parityShards = 2;
      const shardSize = 64;
      const totalSize = shardSize * (dataShards + parityShards);

      const shards = new Uint8Array(totalSize);
      
      // Fill data shards with test data
      for (let i = 0; i < dataShards * shardSize; i++) {
        shards[i] = i % 256;
      }

      // Save original data for comparison
      const originalData = shards.slice(0, dataShards * shardSize);

      // Encode to generate parity
      let result = rs.encode(shards, dataShards, parityShards);
      expect(result).toBe(ReedSolomonErasure.RESULT_OK);

      // Corrupt shard 1 (zero it out)
      for (let i = shardSize; i < shardSize * 2; i++) {
        shards[i] = 0;
      }

      // Mark shard 1 as unavailable
      const shardsAvailable = [true, false, true, true, true, true];

      // Reconstruct
      result = rs.reconstruct(shards, dataShards, parityShards, shardsAvailable);
      expect(result).toBe(ReedSolomonErasure.RESULT_OK);

      // Verify reconstruction
      for (let i = 0; i < dataShards * shardSize; i++) {
        expect(shards[i]).toBe(originalData[i]);
      }
    });

    it('should fail when too many shards are missing', () => {
      const dataShards = 4;
      const parityShards = 2;
      const shardSize = 64;
      const totalSize = shardSize * (dataShards + parityShards);

      const shards = new Uint8Array(totalSize);
      
      // Fill and encode
      for (let i = 0; i < dataShards * shardSize; i++) {
        shards[i] = i % 256;
      }
      rs.encode(shards, dataShards, parityShards);

      // Mark 3 shards as unavailable (more than parity can handle)
      const shardsAvailable = [false, false, false, true, true, true];

      const result = rs.reconstruct(shards, dataShards, parityShards, shardsAvailable);
      expect(result).toBe(ReedSolomonErasure.RESULT_ERROR_TOO_FEW_SHARDS_PRESENT);
    });
  });

  describe('getResultMessage', () => {
    it('should return human-readable messages for result codes', () => {
      expect(ReedSolomonErasure.getResultMessage(0)).toBe('OK');
      expect(ReedSolomonErasure.getResultMessage(10)).toBe('Too few shards present for reconstruction');
      expect(ReedSolomonErasure.getResultMessage(999)).toContain('Unknown');
    });
  });

  describe('singleton pattern', () => {
    it('should return the same instance from getInstance', async () => {
      ReedSolomonErasure.clearInstance();
      
      const instance1 = await ReedSolomonErasure.getInstance();
      const instance2 = await ReedSolomonErasure.getInstance();
      
      expect(instance1).toBe(instance2);
    });
  });
});

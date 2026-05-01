import { describe, expect, it } from 'vitest';
import { MediaSnapshotSchema } from '../media.js';

const validSnapshot = {
  title: 'Sky Eats Airplane',
  artist: 'Talking Mountain',
  album: 'Demos',
  artUrl: 'https://art.i99dash.app/x.png',
  state: 'playing' as const,
  source: 'bluetooth' as const,
  volume: 0.4,
  at: '2026-04-28T08:00:00.000Z',
};

describe('MediaSnapshotSchema', () => {
  it('accepts a canonical snapshot', () => {
    expect(() => MediaSnapshotSchema.parse(validSnapshot)).not.toThrow();
  });

  it('accepts null metadata fields', () => {
    expect(() =>
      MediaSnapshotSchema.parse({
        ...validSnapshot,
        title: null,
        artist: null,
        album: null,
        artUrl: null,
      }),
    ).not.toThrow();
  });

  it('rejects extra fields (strict)', () => {
    expect(() => MediaSnapshotSchema.parse({ ...validSnapshot, songId: 'x' })).toThrow();
  });

  it('rejects volume out of [0..1]', () => {
    expect(() => MediaSnapshotSchema.parse({ ...validSnapshot, volume: 1.2 })).toThrow();
    expect(() => MediaSnapshotSchema.parse({ ...validSnapshot, volume: -0.1 })).toThrow();
  });

  it('rejects unknown source / state enums', () => {
    expect(() => MediaSnapshotSchema.parse({ ...validSnapshot, source: 'nfc' })).toThrow();
    expect(() => MediaSnapshotSchema.parse({ ...validSnapshot, state: 'fast-forward' })).toThrow();
  });

  it('rejects non-URL artUrl', () => {
    expect(() => MediaSnapshotSchema.parse({ ...validSnapshot, artUrl: 'not-a-url' })).toThrow();
  });
});

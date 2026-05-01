import { consola, LogLevels } from 'consola';

/// Shared consola instance. Call `setVerbose(true)` from the root
/// command to show debug logs; everything else goes through the
/// normal level filter.
export const logger = consola.create({
  defaults: { tag: 'i99dash' },
});

export function setVerbose(v: boolean): void {
  logger.level = v ? LogLevels.debug : LogLevels.info;
}

export function setQuiet(q: boolean): void {
  if (q) logger.level = LogLevels.warn;
}

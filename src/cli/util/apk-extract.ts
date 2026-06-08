import { logger } from './logger.js';

export interface ApkExtracted {
  /// Android applicationId read from the APK (sanity-checked vs apk.json id).
  package?: string;
  /// The launcher label resolved from the APK's resources (default locale).
  label?: string;
  /// Bare base64 of the launcher icon bytes (no `data:` prefix).
  iconBase64?: string;
}

/// Best-effort extraction of the launcher icon + label from a built APK using
/// the optional `app-info-parser` dependency (pure-JS: zip + binary AXML +
/// resources.arsc). NEVER throws — icon/label are cosmetic, so any failure
/// returns `{}` and the publish proceeds (the car falls back to a name derived
/// from the package id). The parser is imported dynamically, mirroring the
/// `keytar` optional-import pattern, so the standalone binary — which may not
/// bundle it — degrades gracefully instead of crashing.
export async function extractApkMetadata(apkPath: string): Promise<ApkExtracted> {
  let AppInfoParser: unknown;
  try {
    const mod = (await import('app-info-parser')) as { default?: unknown };
    AppInfoParser = mod.default ?? mod;
  } catch {
    logger.warn('app-info-parser unavailable — skipping icon/label extraction');
    return {};
  }
  try {
    const Ctor = AppInfoParser as new (p: string) => { parse(): Promise<Record<string, unknown>> };
    const info = await new Ctor(apkPath).parse();
    const app = info.application as { label?: unknown } | undefined;
    const rawLabel = app?.label ?? info.label;
    const label = Array.isArray(rawLabel) ? rawLabel[0] : rawLabel;
    const icon = typeof info.icon === 'string' ? info.icon : '';
    const m = /^data:[^;]+;base64,(.*)$/.exec(icon);
    return {
      package: typeof info.package === 'string' ? info.package : undefined,
      label: typeof label === 'string' && label.length > 0 ? label : undefined,
      iconBase64: m ? m[1] : undefined,
    };
  } catch (err) {
    logger.warn(`could not extract icon/label from APK: ${(err as Error).message}`);
    return {};
  }
}

/// Normalise a string-or-locale-map override into the wire locale map the
/// backend stores + the car reads. A bare string becomes the `en` fallback
/// key (the car's `localizedName` falls back through `en`). Empty → undefined.
export function toLocaleMap(
  v: string | Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (v == null) return undefined;
  if (typeof v === 'string') return v.length > 0 ? { en: v } : undefined;
  return Object.keys(v).length > 0 ? v : undefined;
}

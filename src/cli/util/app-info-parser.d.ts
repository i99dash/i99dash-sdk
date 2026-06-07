/// Ambient declaration for the untyped, optional `app-info-parser` dependency
/// (used only by apk-extract.ts via a guarded dynamic import). Minimal surface:
/// construct with an APK path, `parse()` resolves the parsed manifest object.
declare module 'app-info-parser' {
  export default class AppInfoParser {
    constructor(apkPath: string);
    parse(): Promise<Record<string, unknown>>;
  }
}

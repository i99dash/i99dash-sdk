/// SSR-safe client factory. Returns `null` when the host bridge
/// isn't reachable — i.e. on the server during Next.js / Nuxt
/// rendering, in jsdom unit tests, or in Storybook.
///
/// This eliminates the boilerplate every framework consumer would
/// otherwise repeat: a `try { fromWindow() } catch (NotInsideHostError)`
/// dance to keep server-side renders from blowing up. The `null`
/// branch lets callers render a "loading" / "no host" placeholder
/// without forcing them to think about which exact error fired.
///
/// Genuine bugs (missing `callHandler`, wrong global type) still
/// surface — only [NotInsideHostError] is swallowed.

import { MiniAppClient } from './client.js';
import { NotInsideHostError } from './errors.js';

/// Returns a [MiniAppClient] when running inside the host, else null.
///
/// Idiomatic Next.js use:
///
///   ```tsx
///   import { createClientOrSSR } from 'i99dash';
///   import { useEffect, useState } from 'react';
///
///   export default function Page() {
///     const [client, setClient] = useState(() => createClientOrSSR());
///     useEffect(() => setClient(createClientOrSSR()), []);
///     if (!client) return <NoHostFallback />;
///     // ... use client
///   }
///   ```
///
/// Note: prefer `@i99dash/sdk-react`'s `<MiniAppProvider>` + hooks for
/// new code — they handle the lifecycle and fallback shape for you.
export function createClientOrSSR(): MiniAppClient | null {
  try {
    return MiniAppClient.fromWindow();
  } catch (e) {
    if (e instanceof NotInsideHostError) return null;
    throw e;
  }
}

/**
 * Which of the two apps this bundle is.
 *
 * Metz ships twice from one codebase: the full app, and **Metz Host** — a
 * three-screen app for people who only want to put a meeting up and send the
 * link round. A meeting made in Host is an ordinary meeting: same API, same
 * account, same moderation queue, and it appears on the map in the full app
 * and on the public share page like any other.
 *
 * The flag arrives as a build-time environment variable rather than a runtime
 * check, because Expo's babel preset *inlines* `process.env.EXPO_PUBLIC_*` into
 * the bundle. That makes `IS_HOST` a literal `true` or `false` after the
 * transform, so a branch on it is dead code the minifier can drop rather than a
 * condition evaluated on every render.
 *
 * What it does not do is shrink the bundle much: Metro does not tree-shake, so
 * a screen imported at the top of App.js ships in both apps even when only one
 * navigator can reach it. The point of the flag is that the two apps *behave*
 * as two apps. The size came from the native side.
 *
 * Set by the EAS build profile, and by `EXPO_PUBLIC_METZ_APP=host npx expo start`
 * when running Host in development.
 */
export const IS_HOST = process.env.EXPO_PUBLIC_METZ_APP === "host";

/** The full app, stated positively so screens do not have to read a negation. */
export const IS_FULL = !IS_HOST;

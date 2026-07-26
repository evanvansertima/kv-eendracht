/**
 * Ambient declarations for static image imports.
 *
 * Metro resolves `import photo from './x.jpg'` to an asset module at bundle time, but
 * TypeScript has no built-in knowledge of it. Expo's own types cover this only for some
 * setups, so the declaration lives here explicitly.
 *
 * A static import is used rather than `require()` because the ESLint config forbids
 * require-style imports, and this keeps the asset a normal module reference.
 */
declare module '*.jpg' {
  const asset: number;
  export default asset;
}

declare module '*.jpeg' {
  const asset: number;
  export default asset;
}

declare module '*.png' {
  const asset: number;
  export default asset;
}

declare module '*.webp' {
  const asset: number;
  export default asset;
}

declare module '*.svg' {
  const asset: number;
  export default asset;
}

/// <reference types="vite/client" />

/**
 * onnxruntime-web ships its .d.ts outside its package.json "exports", so the
 * TypeScript compiler with moduleResolution: "bundler" can't find them. Point
 * the compiler at the file directly. This is only used for the studio's
 * Magic-remove inpainting integration.
 */
declare module 'onnxruntime-web' {
  export * from 'onnxruntime-common'
}

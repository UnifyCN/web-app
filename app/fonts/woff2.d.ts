// Turbopack emits an imported font file as a static asset and returns its URL.
declare module "*.woff2" {
  const src: string;
  export default src;
}

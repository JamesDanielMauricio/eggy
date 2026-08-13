// Vercel routes every /api/* request here (see the rewrite in vercel.json)
// and Express's own router dispatches the sub-path from there — this file
// just hands Vercel the pre-built app instead of re-implementing routing.
// Imports the compiled output (built by `npm run build --prefix server` in
// vercel.json's buildCommand), not the TypeScript source, so this stays a
// plain, unambiguous JS-to-JS import for the bundler.
export { default } from "../server/dist/index.js";

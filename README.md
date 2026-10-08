# Nepal Updates

A TypeScript and React news reader for public updates from nepal.gov.np and IPO/FPO news from Sharesansar.

## Run locally

Run `npm install`, `npm run dev`, and open the local Vite URL. Run `npm run typecheck` to check the TypeScript sources and `npm run build` to create a production build.

The page is marked as Nepali so browsers can offer their own page translation. Use the browser's Translate command (for example, Chrome's address-bar or context-menu option) when it is available. The browser controls this feature; the app cannot detect or invoke its translation UI. No app translation API, key, or proxy is used. [Chrome page-translation instructions](https://support.google.com/chrome/answer/173424?hl=en).

## Deploy

The app includes same-origin TypeScript feed proxies for Vercel (`api/`) and Cloudflare Pages (`functions/api/`) for updates, Loksewa notices, and IPO/FPO news. API responses use a five-minute cache policy. Page translation is provided by the user's browser.


> Made using GPT-6-Luna

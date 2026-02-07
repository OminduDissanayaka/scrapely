# Scrapely

Declarative web scraping toolkit for Node.js built on [Axios](https://github.com/axios/axios) and [Cheerio](https://github.com/cheeriojs/cheerio).

[![npm version](https://img.shields.io/npm/v/scrapely)](https://www.npmjs.com/package/scrapely)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node Version](https://img.shields.io/badge/node-%3E%3D14.0.0-brightgreen)](https://nodejs.org)

## Install

```bash
npm install scrapely
```

## Quick Start

```js
const Scrapely = require('scrapely');

const scraper = new Scrapely();

const title = await scraper.getText('https://example.com', 'h1');
```

## Features

- Schema-driven structured extraction
- Automatic retry with linear back-off
- Built-in rate limiting and user-agent rotation
- Auto-pagination
- Table, form, email, phone, and link extraction
- File and image downloads
- JSON / CSV export (RFC 4180)
- TTL-based response cache with max-size eviction
- Proxy support
- EventEmitter hooks (`request`, `response`, `retry`, `error`, `cacheHit`)
- Custom error hierarchy (`ScrapelyError`, `FetchError`, `ValidationError`, `ExportError`)
- TypeScript definitions included

## API

### `new Scrapely(options?)`

```js
const scraper = new Scrapely({
  timeout: 30000,           // request timeout (ms)
  maxRetries: 3,            // retry attempts
  retryDelay: 1000,         // base delay between retries (ms)
  headers: {},              // default HTTP headers
  followRedirects: true,    // follow 3xx redirects
  validateStatus: (s) => s >= 200 && s < 400,
  rateLimit: 2,             // max requests per second
  proxy: null,              // axios proxy config
  rotateUserAgent: false,   // cycle built-in UA strings
  cache: true,              // true | { ttl: 300000, maxSize: 200 }
});
```

### Core Methods

#### `scraper.fetch(url, axiosConfig?) → Promise<string>`

Fetch raw HTML with retry, rate-limiting, UA rotation, and caching.

#### `scraper.load(url, axiosConfig?) → Promise<CheerioAPI>`

Fetch and parse into a Cheerio instance.

#### `scraper.getText(url, selector, opts?) → Promise<string | string[]>`

```js
const title = await scraper.getText('https://example.com', 'h1');
const items = await scraper.getText(url, 'li', { multiple: true });
```

#### `scraper.getAttribute(url, selector, attribute, opts?) → Promise<string | string[]>`

```js
const href = await scraper.getAttribute(url, 'a', 'href');
const srcs = await scraper.getAttribute(url, 'img', 'src', { multiple: true });
```

#### `scraper.getHtml(url, selector, opts?) → Promise<string | null>`

Returns inner HTML of matched elements.

### Schema Extraction

#### `scraper.extract(url, schema, axiosConfig?) → Promise<object>`

```js
const data = await scraper.extract('https://example.com', {
  title:       { selector: 'h1', type: 'text' },
  description: { selector: 'meta[name="description"]', type: 'attribute', attribute: 'content' },
  links:       { selector: 'a', type: 'attribute', attribute: 'href', multiple: true },
  price:       { selector: '.price', type: 'text', transform: (v) => parseFloat(v.replace(/[^0-9.]/g, '')) },
});
```

**Field definition:**

| Property    | Type       | Default  | Description                          |
|-------------|------------|----------|--------------------------------------|
| `selector`  | `string`   | —        | CSS selector                         |
| `type`      | `string`   | `'text'` | `'text'` / `'html'` / `'attribute'` |
| `attribute` | `string`   | —        | Required when type is `'attribute'`  |
| `multiple`  | `boolean`  | `false`  | Return array of matches              |
| `transform` | `Function` | —        | `(raw, $, el) => value`             |

#### `scraper.extractList(url, containerSelector, itemSchema, axiosConfig?) → Promise<object[]>`

```js
const products = await scraper.extractList(url, '.product-card', {
  name:  { selector: 'h3', type: 'text' },
  price: { selector: '.price', type: 'text' },
  image: { selector: 'img', type: 'attribute', attribute: 'src' },
});
```

### Pagination

#### `scraper.paginate(startUrl, opts) → Promise<any[]>`

```js
const allProducts = await scraper.paginate('https://shop.com/products?page=1', {
  nextSelector: 'a.next-page',
  maxPages: 10,
  dataExtractor: async ($, url, pageNum) => {
    return $('.item').map((_, el) => $(el).text().trim()).get();
  },
  stopWhen: ($, collected, pageNum) => collected.length >= 100,
});
```

### Structured Extractors

#### `scraper.extractTable(url, selector?, opts?) → Promise<{headers, rows} | null>`

```js
const table = await scraper.extractTable(url, 'table.data');
// { headers: ['Name', 'Price'], rows: [{ Name: 'A', Price: '10' }, ...] }
```

Pass `{ all: true }` to get every matched table.

#### `scraper.extractForm(url, selector?) → Promise<object | object[]>`

Returns action, method, and all field definitions of HTML forms.

#### `scraper.extractEmails(url) → Promise<string[]>`

#### `scraper.extractPhoneNumbers(url) → Promise<string[]>`

#### `scraper.extractLinks(url, opts?) → Promise<{href, text, title}[]>`

```js
const internal = await scraper.extractLinks(url, { internal: true, unique: true });
const external = await scraper.extractLinks(url, { external: true });
const filtered = await scraper.extractLinks(url, { pattern: '/products/' });
```

### Multi-page

#### `scraper.scrapeMultiple(urls, handler, opts?) → Promise<any[]>`

```js
const results = await scraper.scrapeMultiple(
  ['https://a.com', 'https://b.com'],
  async ($, url) => ({ url, title: $('h1').text().trim() }),
  { concurrency: 3, ignoreErrors: true }
);
```

### Downloads

#### `scraper.downloadFile(url, dest, axiosConfig?) → Promise<string>`

#### `scraper.downloadImages(url, selector?, dir?, opts?) → Promise<string[]>`

```js
await scraper.downloadFile('https://example.com/file.pdf', './downloads/file.pdf');
const saved = await scraper.downloadImages(url, 'img', './images', { ignoreErrors: true });
```

### Data Export

#### `scraper.exportJSON(data, filepath) → Promise<string>`

#### `scraper.exportCSV(data, filepath) → Promise<string>`

```js
await scraper.exportJSON(products, './output/products.json');
await scraper.exportCSV(products, './output/products.csv');
```

CSV output follows RFC 4180 — values with commas, quotes, or newlines are properly escaped.

### Configuration

#### `scraper.setHeaders(headers)`

```js
scraper.setHeaders({ 'Authorization': 'Bearer TOKEN' });
```

#### `scraper.setCookies(cookies)`

```js
scraper.setCookies({ sessionId: '12345', userId: 'user1' });
scraper.setCookies('sessionId=12345; userId=user1');
```

#### `scraper.clearCache()`

#### `scraper.cacheSize → number`

### Quick Scrape (Stateless)

```js
const { quickScrape } = require('scrapely');

const title = await quickScrape.getText('https://example.com', 'h1');
const data  = await quickScrape.extract(url, schema);
```

### Data Utilities

```js
const { DataUtils } = require('scrapely');

DataUtils.cleanText('  extra   spaces  ');        // 'extra spaces'
DataUtils.extractNumbers('price: $12.50, qty: 3'); // [12.5, 3]
DataUtils.parsePrice('$1,234.56');                 // 1234.56
DataUtils.parsePrice('1.234,56 EUR');              // 1234.56
DataUtils.parseDate('2026-02-08');                 // Date object
DataUtils.getDomain('https://example.com/path');   // 'example.com'
DataUtils.normalizeUrl(url, { removeTrailingSlash: true });
DataUtils.sanitizeFilename('file<name>.txt');      // 'file_name_.txt'
DataUtils.detectType('test@mail.com');             // 'email'
```

### Events

```js
scraper.on('request',  (url) => console.log('GET', url));
scraper.on('response', (url, status) => console.log(status, url));
scraper.on('retry',    (url, attempt, err) => console.warn(`Retry ${attempt}`, url));
scraper.on('error',    (err) => console.error(err.code, err.message));
scraper.on('cacheHit', (url) => console.log('Cache hit', url));
```

### Error Handling

```js
const { FetchError, ValidationError, ExportError } = require('scrapely');

try {
  await scraper.fetch(url);
} catch (err) {
  if (err instanceof FetchError) {
    console.error(err.code, err.meta.url, err.meta.attempts);
  }
}
```

All errors extend `ScrapelyError` and include a `code` and `meta` object.

| Error Class       | Code                | When                        |
|-------------------|---------------------|-----------------------------|
| `FetchError`      | `ERR_FETCH_FAILED`  | All retry attempts exhausted |
| `ValidationError` | `ERR_VALIDATION`    | Invalid parameter           |
| `ExportError`     | `ERR_EXPORT_FAILED` | File write failure          |

## Best Practices

- Check `robots.txt` before scraping any site.
- Use `rateLimit` to avoid overwhelming servers.
- Keep `concurrency` low (2–3) for multi-page scraping.
- Set a descriptive `User-Agent` header identifying your bot.
- Always wrap scraping code in `try/catch`.

## License

[MIT](LICENSE) — Omindu Dissanayaka

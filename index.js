'use strict';

const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const { URL } = require('url');
const { EventEmitter } = require('events');

class ScrapelyError extends Error {
  constructor(message, code, meta = {}) {
    super(message);
    this.name = 'ScrapelyError';
    this.code = code;
    this.meta = meta;
  }
}

class FetchError extends ScrapelyError {
  constructor(url, attempts, cause) {
    super(
      `Request to ${url} failed after ${attempts} attempt(s): ${cause.message}`,
      'ERR_FETCH_FAILED',
      { url, attempts }
    );
    this.name = 'FetchError';
    this.cause = cause;
  }
}

class ValidationError extends ScrapelyError {
  constructor(param, reason) {
    super(`Invalid parameter "${param}": ${reason}`, 'ERR_VALIDATION', { param });
    this.name = 'ValidationError';
  }
}

class ExportError extends ScrapelyError {
  constructor(filepath, cause) {
    super(
      `Failed to export to ${filepath}: ${cause.message}`,
      'ERR_EXPORT_FAILED',
      { filepath }
    );
    this.name = 'ExportError';
    this.cause = cause;
  }
}

const UA_POOL = Object.freeze([
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
]);

const DEFAULT_TIMEOUT     = 30_000;
const DEFAULT_RETRIES     = 3;
const DEFAULT_RETRY_MS    = 1_000;
const DEFAULT_CONCURRENCY = 3;
const DEFAULT_MAX_PAGES   = 50;
const DEFAULT_CACHE_TTL   = 5 * 60_000;
const DEFAULT_CACHE_MAX   = 200;

/**
 * High-performance web scraping toolkit built on Axios and Cheerio.
 *
 * @extends EventEmitter
 * @fires Scrapely#request
 * @fires Scrapely#response
 * @fires Scrapely#retry
 * @fires Scrapely#error
 * @fires Scrapely#cacheHit
 */
class Scrapely extends EventEmitter {

  /**
   * @param {object}        [options]
   * @param {number}        [options.timeout=30000]
   * @param {number}        [options.maxRetries=3]
   * @param {number}        [options.retryDelay=1000]
   * @param {object}        [options.headers]
   * @param {boolean}       [options.followRedirects=true]
   * @param {Function}      [options.validateStatus]
   * @param {number}        [options.rateLimit]
   * @param {object}        [options.proxy]
   * @param {boolean}       [options.rotateUserAgent=false]
   * @param {boolean|object} [options.cache=false]
   */
  constructor(options = {}) {
    super();

    const opts = {
      timeout:         options.timeout         ?? DEFAULT_TIMEOUT,
      maxRetries:      options.maxRetries      ?? DEFAULT_RETRIES,
      retryDelay:      options.retryDelay      ?? DEFAULT_RETRY_MS,
      followRedirects: options.followRedirects ?? true,
      rateLimit:       options.rateLimit       ?? null,
      proxy:           options.proxy           ?? null,
      rotateUserAgent: options.rotateUserAgent ?? false,
      validateStatus:  options.validateStatus  || ((s) => s >= 200 && s < 400),
      headers: Object.assign(
        { 'User-Agent': UA_POOL[0], 'Accept': 'text/html,application/xhtml+xml' },
        options.headers
      ),
    };

    if (options.cache === true) {
      opts.cache = { ttl: DEFAULT_CACHE_TTL, maxSize: DEFAULT_CACHE_MAX };
    } else if (options.cache && typeof options.cache === 'object') {
      opts.cache = {
        ttl:     options.cache.ttl     ?? DEFAULT_CACHE_TTL,
        maxSize: options.cache.maxSize ?? DEFAULT_CACHE_MAX,
      };
    } else {
      opts.cache = null;
    }

    this._opts = Object.freeze(opts);

    this._http = axios.create({
      timeout:        opts.timeout,
      headers:        { ...opts.headers },
      maxRedirects:   opts.followRedirects ? 10 : 0,
      validateStatus: opts.validateStatus,
      ...(opts.proxy ? { proxy: opts.proxy } : {}),
    });

    this._lastRequestAt = 0;
    this._uaIndex       = 0;
    this._cache         = opts.cache ? new Map() : null;
  }

  /**
   * @param {string} url
   * @param {object} [axiosConfig]
   * @returns {Promise<string>}
   * @throws {FetchError}
   */
  async fetch(url, axiosConfig = {}) {
    _assert(url, 'string', 'url');
    await this._rateGate();

    if (this._opts.rotateUserAgent) this._nextUA();

    if (this._cache) {
      const cached = this._cacheGet(url);
      if (cached !== undefined) {
        this.emit('cacheHit', url);
        return cached;
      }
    }

    let lastErr;

    for (let attempt = 1; attempt <= this._opts.maxRetries; attempt++) {
      try {
        this.emit('request', url);
        const res = await this._http.get(url, axiosConfig);
        this.emit('response', url, res.status);

        const body = typeof res.data === 'string' ? res.data : String(res.data);
        if (this._cache) this._cachePut(url, body);

        return body;
      } catch (err) {
        lastErr = err;
        this.emit('retry', url, attempt, err);
        if (attempt < this._opts.maxRetries) {
          await _sleep(this._opts.retryDelay * attempt);
        }
      }
    }

    const fetchErr = new FetchError(url, this._opts.maxRetries, lastErr);
    this.emit('error', fetchErr);
    throw fetchErr;
  }

  /**
   * @param {string} url
   * @param {object} [axiosConfig]
   * @returns {Promise<import('cheerio').CheerioAPI>}
   */
  async load(url, axiosConfig = {}) {
    const html = await this.fetch(url, axiosConfig);
    return cheerio.load(html);
  }

  /**
   * @param {string}  url
   * @param {string}  selector
   * @param {object}  [opts]
   * @param {boolean} [opts.multiple=false]
   * @returns {Promise<string|string[]>}
   */
  async getText(url, selector, opts = {}) {
    const $ = await this.load(url, opts.axiosConfig);
    return opts.multiple
      ? $(selector).map((_, el) => $(el).text().trim()).get()
      : $(selector).first().text().trim();
  }

  /**
   * @param {string}  url
   * @param {string}  selector
   * @param {string}  attribute
   * @param {object}  [opts]
   * @param {boolean} [opts.multiple=false]
   * @returns {Promise<string|undefined|Array<string|undefined>>}
   */
  async getAttribute(url, selector, attribute, opts = {}) {
    const $ = await this.load(url, opts.axiosConfig);
    return opts.multiple
      ? $(selector).map((_, el) => $(el).attr(attribute)).get()
      : $(selector).first().attr(attribute);
  }

  /**
   * @param {string}  url
   * @param {string}  selector
   * @param {object}  [opts]
   * @param {boolean} [opts.multiple=false]
   * @returns {Promise<string|null|Array<string|null>>}
   */
  async getHtml(url, selector, opts = {}) {
    const $ = await this.load(url, opts.axiosConfig);
    return opts.multiple
      ? $(selector).map((_, el) => $(el).html()).get()
      : $(selector).first().html();
  }

  /**
   * Extract structured data using a declarative schema.
   *
   * Schema field shape:
   *   selector  - CSS selector
   *   type      - 'text' | 'html' | 'attribute' (default 'text')
   *   attribute - required when type is 'attribute'
   *   multiple  - return array of matches
   *   transform - (raw, $, el) => value
   *
   * @param {string} url
   * @param {object} schema
   * @param {object} [axiosConfig]
   * @returns {Promise<object>}
   */
  async extract(url, schema, axiosConfig = {}) {
    _assert(schema, 'object', 'schema');
    const $ = await this.load(url, axiosConfig);
    const result = {};

    for (const [key, def] of Object.entries(schema)) {
      const { selector, type = 'text', attribute, multiple = false, transform } = def;
      const els = $(selector);

      if (multiple) {
        result[key] = els.map((_, el) => {
          const raw = _readValue($, el, type, attribute);
          return transform ? transform(raw, $, el) : raw;
        }).get();
      } else {
        const el  = els.first();
        const raw = _readValue($, el, type, attribute);
        result[key] = transform ? transform(raw, $, el) : raw;
      }
    }

    return result;
  }

  /**
   * @param {string} url
   * @param {string} containerSelector
   * @param {object} itemSchema
   * @param {object} [axiosConfig]
   * @returns {Promise<object[]>}
   */
  async extractList(url, containerSelector, itemSchema, axiosConfig = {}) {
    _assert(containerSelector, 'string', 'containerSelector');
    _assert(itemSchema, 'object', 'itemSchema');

    const $ = await this.load(url, axiosConfig);
    const items = [];

    $(containerSelector).each((_, container) => {
      const item = {};
      for (const [key, def] of Object.entries(itemSchema)) {
        const { selector, type = 'text', attribute, transform } = def;
        const el  = $(container).find(selector).first();
        const raw = _readValue($, el, type, attribute);
        item[key] = transform ? transform(raw, $, el) : raw;
      }
      items.push(item);
    });

    return items;
  }

  /**
   * @param {string} url
   * @param {string} selector
   * @param {object} [axiosConfig]
   * @returns {Promise<boolean>}
   */
  async exists(url, selector, axiosConfig = {}) {
    const $ = await this.load(url, axiosConfig);
    return $(selector).length > 0;
  }

  /**
   * @param {string} url
   * @param {string} selector
   * @param {object} [axiosConfig]
   * @returns {Promise<number>}
   */
  async count(url, selector, axiosConfig = {}) {
    const $ = await this.load(url, axiosConfig);
    return $(selector).length;
  }

  /**
   * @param {string[]}  urls
   * @param {Function}  handler
   * @param {object}    [opts]
   * @param {number}    [opts.concurrency=3]
   * @param {boolean}   [opts.ignoreErrors=false]
   * @returns {Promise<any[]>}
   */
  async scrapeMultiple(urls, handler, opts = {}) {
    if (!Array.isArray(urls)) {
      throw new ValidationError('urls', 'must be an array');
    }

    const concurrency = opts.concurrency || DEFAULT_CONCURRENCY;
    const results = [];

    for (let i = 0; i < urls.length; i += concurrency) {
      const batch = urls.slice(i, i + concurrency);
      const settled = await Promise.allSettled(
        batch.map(async (url) => {
          const $ = await this.load(url);
          return handler($, url);
        })
      );

      for (const outcome of settled) {
        if (outcome.status === 'fulfilled') {
          results.push(outcome.value);
        } else if (!opts.ignoreErrors) {
          throw outcome.reason;
        }
      }
    }

    return results;
  }

  /**
   * @param {string}   startUrl
   * @param {object}   opts
   * @param {string}   [opts.nextSelector]
   * @param {number}   [opts.maxPages=50]
   * @param {Function} opts.dataExtractor
   * @param {Function} [opts.stopWhen]
   * @param {boolean}  [opts.ignoreErrors=false]
   * @returns {Promise<any[]>}
   */
  async paginate(startUrl, opts = {}) {
    _assert(startUrl, 'string', 'startUrl');

    const nextSel  = opts.nextSelector || '.next, .pagination__next, a[rel="next"]';
    const maxPages = opts.maxPages     || DEFAULT_MAX_PAGES;
    const extract  = opts.dataExtractor;
    const stopWhen = opts.stopWhen;
    const collected = [];

    let currentUrl = startUrl;

    for (let page = 1; page <= maxPages && currentUrl; page++) {
      let $;
      try {
        $ = await this.load(currentUrl);
      } catch (err) {
        if (opts.ignoreErrors) break;
        throw err;
      }

      if (extract) {
        const data = await extract($, currentUrl, page);
        if (Array.isArray(data)) collected.push(...data);
        else if (data != null) collected.push(data);
      }

      if (stopWhen && stopWhen($, collected, page)) break;

      const nextHref = $(nextSel).first().attr('href');
      currentUrl = nextHref ? _resolveUrl(currentUrl, nextHref) : null;
    }

    return collected;
  }

  /**
   * @param {string}  url
   * @param {string}  [selector='table']
   * @param {object}  [opts]
   * @param {boolean} [opts.all=false]
   * @returns {Promise<{headers:string[], rows:object[]}|{headers:string[], rows:object[]}[]|null>}
   */
  async extractTable(url, selector = 'table', opts = {}) {
    const $ = await this.load(url);
    const tables = [];

    $(selector).each((_, table) => {
      const $t = $(table);
      const headers = [];

      $t.find('thead th, thead td, tr:first-child th').each((__, th) => {
        headers.push($(th).text().trim());
      });

      const useAutoHeaders = headers.length === 0;
      if (useAutoHeaders) {
        const colCount = $t.find('tr').first().children('td, th').length;
        for (let c = 0; c < colCount; c++) headers.push(`col_${c + 1}`);
      }

      const rows = [];
      const rowEls = useAutoHeaders
        ? $t.find('tr')
        : $t.find('tbody tr, tr').not(':has(th)');

      rowEls.each((__, tr) => {
        const cells = $(tr).children('td');
        if (cells.length === 0) return;

        const row = {};
        cells.each((j, td) => {
          row[headers[j] || `col_${j + 1}`] = $(td).text().trim();
        });
        rows.push(row);
      });

      tables.push({ headers, rows });
    });

    if (tables.length === 0) return opts.all ? [] : null;
    return opts.all ? tables : tables[0];
  }

  /**
   * @param {string} url
   * @param {string} [selector='form']
   * @returns {Promise<object|object[]>}
   */
  async extractForm(url, selector = 'form') {
    const $ = await this.load(url);
    const forms = [];

    $(selector).each((_, form) => {
      const $f = $(form);
      const entry = {
        action: $f.attr('action') || null,
        method: ($f.attr('method') || 'GET').toUpperCase(),
        fields: [],
      };

      $f.find('input, select, textarea').each((__, field) => {
        const $el = $(field);
        const tag  = ($el.prop('tagName') || '').toLowerCase();
        const info = {
          tag,
          name:        $el.attr('name') || null,
          type:        $el.attr('type') || tag,
          value:       $el.val() ?? $el.attr('value') ?? null,
          required:    $el.attr('required') !== undefined,
          placeholder: $el.attr('placeholder') || null,
        };

        if (tag === 'select') {
          info.options = $el.find('option').map((__, o) => ({
            value:    $(o).attr('value'),
            label:    $(o).text().trim(),
            selected: $(o).attr('selected') !== undefined,
          })).get();
        }

        entry.fields.push(info);
      });

      forms.push(entry);
    });

    return forms.length === 1 ? forms[0] : forms;
  }

  /**
   * @param {string} url
   * @returns {Promise<string[]>}
   */
  async extractEmails(url) {
    const html = await this.fetch(url);
    const pattern = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
    return _unique(html.match(pattern) || []);
  }

  /**
   * @param {string} url
   * @returns {Promise<string[]>}
   */
  async extractPhoneNumbers(url) {
    const html = await this.fetch(url);
    const pattern = /(\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/g;
    return _unique((html.match(pattern) || []).map((p) => p.trim()));
  }

  /**
   * @param {string}  url
   * @param {object}  [opts]
   * @param {boolean} [opts.internal]
   * @param {boolean} [opts.external]
   * @param {string}  [opts.pattern]
   * @param {boolean} [opts.unique=false]
   * @returns {Promise<{href:string, text:string, title:string|undefined}[]>}
   */
  async extractLinks(url, opts = {}) {
    const $ = await this.load(url);
    const links = [];

    $('a[href]').each((_, a) => {
      const href = $(a).attr('href');
      const abs  = _resolveUrl(url, href);

      if (opts.internal && !_sameDomain(url, abs)) return;
      if (opts.external && _sameDomain(url, abs))  return;
      if (opts.pattern  && !new RegExp(opts.pattern).test(abs)) return;

      links.push({
        href:  abs,
        text:  $(a).text().trim(),
        title: $(a).attr('title') || undefined,
      });
    });

    return opts.unique ? _uniqueBy(links, 'href') : links;
  }

  /**
   * @param {string} url
   * @param {string} dest
   * @param {object} [axiosConfig]
   * @returns {Promise<string>}
   */
  async downloadFile(url, dest, axiosConfig = {}) {
    _assert(url, 'string', 'url');
    _assert(dest, 'string', 'dest');

    const absPath = path.resolve(dest);

    try {
      await fsp.mkdir(path.dirname(absPath), { recursive: true });

      const res = await this._http.get(url, {
        responseType: 'stream',
        ...axiosConfig,
      });

      const writer = fs.createWriteStream(absPath);
      res.data.pipe(writer);

      await new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
      });

      return absPath;
    } catch (err) {
      throw new ScrapelyError(
        `Download failed (${url} -> ${absPath}): ${err.message}`,
        'ERR_DOWNLOAD',
        { url, dest: absPath }
      );
    }
  }

  /**
   * @param {string}  url
   * @param {string}  [selector='img']
   * @param {string}  [dir='./downloads']
   * @param {object}  [opts]
   * @param {boolean} [opts.ignoreErrors=false]
   * @returns {Promise<string[]>}
   */
  async downloadImages(url, selector = 'img', dir = './downloads', opts = {}) {
    const $ = await this.load(url);
    const tasks = [];

    $(selector).each((i, img) => {
      const src = $(img).attr('src') || $(img).attr('data-src');
      if (!src) return;

      const absUrl = _resolveUrl(url, src);
      let filename;
      try {
        filename = path.basename(new URL(absUrl).pathname) || `image_${i}.jpg`;
      } catch {
        filename = `image_${i}.jpg`;
      }

      tasks.push(
        this.downloadFile(absUrl, path.join(dir, filename))
          .catch((e) => (opts.ignoreErrors ? null : Promise.reject(e)))
      );
    });

    return (await Promise.all(tasks)).filter(Boolean);
  }

  /**
   * @param {*}      data
   * @param {string} filepath
   * @returns {Promise<string>}
   */
  async exportJSON(data, filepath) {
    _assert(filepath, 'string', 'filepath');

    try {
      const abs = path.resolve(filepath);
      await fsp.mkdir(path.dirname(abs), { recursive: true });
      await fsp.writeFile(abs, JSON.stringify(data, null, 2), 'utf-8');
      return abs;
    } catch (err) {
      throw new ExportError(filepath, err);
    }
  }

  /**
   * @param {object[]} data
   * @param {string}   filepath
   * @returns {Promise<string>}
   */
  async exportCSV(data, filepath) {
    _assert(filepath, 'string', 'filepath');

    if (!Array.isArray(data) || data.length === 0) {
      throw new ValidationError('data', 'must be a non-empty array of objects');
    }

    try {
      const abs     = path.resolve(filepath);
      const headers = Object.keys(data[0]);
      const lines   = [headers.map(_csvCell).join(',')];

      for (const row of data) {
        lines.push(headers.map((h) => _csvCell(row[h])).join(','));
      }

      await fsp.mkdir(path.dirname(abs), { recursive: true });
      await fsp.writeFile(abs, lines.join('\r\n'), 'utf-8');
      return abs;
    } catch (err) {
      if (err instanceof ScrapelyError) throw err;
      throw new ExportError(filepath, err);
    }
  }

  /** @param {object} headers */
  setHeaders(headers) {
    Object.assign(this._http.defaults.headers.common, headers);
  }

  /** @param {string|object} cookies */
  setCookies(cookies) {
    const str = typeof cookies === 'string'
      ? cookies
      : Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
    this.setHeaders({ Cookie: str });
  }

  clearCache() {
    if (this._cache) this._cache.clear();
  }

  /** @type {number} */
  get cacheSize() {
    return this._cache ? this._cache.size : 0;
  }

  /** @private */
  async _rateGate() {
    if (!this._opts.rateLimit) return;

    const minGap = 1000 / this._opts.rateLimit;
    const elapsed = Date.now() - this._lastRequestAt;

    if (elapsed < minGap) await _sleep(minGap - elapsed);

    this._lastRequestAt = Date.now();
  }

  /** @private */
  _nextUA() {
    this._uaIndex = (this._uaIndex + 1) % UA_POOL.length;
    this._http.defaults.headers.common['User-Agent'] = UA_POOL[this._uaIndex];
  }

  /** @private */
  _cacheGet(key) {
    const entry = this._cache.get(key);
    if (!entry) return undefined;

    if (Date.now() - entry.ts > this._opts.cache.ttl) {
      this._cache.delete(key);
      return undefined;
    }
    return entry.data;
  }

  /** @private */
  _cachePut(key, data) {
    if (this._cache.size >= this._opts.cache.maxSize) {
      const oldest = this._cache.keys().next().value;
      this._cache.delete(oldest);
    }
    this._cache.set(key, { data, ts: Date.now() });
  }
}

/** @param {string} text @returns {string} */
function cleanText(text) {
  return typeof text === 'string' ? text.replace(/\s+/g, ' ').trim() : '';
}

/** @param {string} text @returns {number[]} */
function extractNumbers(text) {
  if (typeof text !== 'string') return [];
  return (text.match(/\d+(?:\.\d+)?/g) || []).map(Number);
}

/** @param {string} raw @returns {number|null} */
function parsePrice(raw) {
  if (typeof raw !== 'string') return null;
  let cleaned = raw.replace(/[^\d.,]/g, '');
  if (!cleaned) return null;

  if (/\d+\.\d{3},\d{2}$/.test(cleaned)) {
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else {
    cleaned = cleaned.replace(/,/g, '');
  }

  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** @param {string} raw @returns {Date|null} */
function parseDate(raw) {
  if (typeof raw !== 'string') return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** @param {string} url @returns {string|null} */
function getDomain(url) {
  try { return new URL(url).hostname; }
  catch { return null; }
}

/**
 * @param {string}  url
 * @param {object}  [opts]
 * @param {boolean} [opts.removeQuery=true]
 * @param {boolean} [opts.removeFragment=true]
 * @param {boolean} [opts.removeTrailingSlash=false]
 * @returns {string}
 */
function normalizeUrl(url, opts = {}) {
  try {
    const u = new URL(url);
    if (opts.removeQuery    !== false) u.search = '';
    if (opts.removeFragment !== false) u.hash   = '';
    if (opts.removeTrailingSlash)      u.pathname = u.pathname.replace(/\/$/, '');
    return u.href;
  } catch {
    return url;
  }
}

/** @param {string} name @returns {string} */
function sanitizeFilename(name) {
  return String(name).replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');
}

/** @param {string} value @returns {'integer'|'float'|'email'|'url'|'date'|'empty'|'string'} */
function detectType(value) {
  if (value == null || value === '') return 'empty';
  const v = String(value).trim();
  if (/^\d+$/.test(v))                      return 'integer';
  if (/^\d+\.\d+$/.test(v))                 return 'float';
  if (/^[\w.+-]+@[\w.-]+\.\w{2,}$/.test(v)) return 'email';
  if (/^https?:\/\//i.test(v))              return 'url';
  if (/^\d{4}-\d{2}-\d{2}/.test(v))         return 'date';
  return 'string';
}

function _readValue($, el, type, attribute) {
  switch (type) {
    case 'html':      return $(el).html();
    case 'attribute': return $(el).attr(attribute);
    case 'text':
    default:          return $(el).text().trim();
  }
}

function _csvCell(value) {
  const str = value == null ? '' : String(value);
  return /[",\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function _resolveUrl(base, rel) {
  try { return new URL(rel, base).href; }
  catch { return rel; }
}

function _sameDomain(a, b) {
  try { return new URL(a).hostname === new URL(b).hostname; }
  catch { return false; }
}

function _unique(arr) {
  return [...new Set(arr)];
}

function _uniqueBy(arr, key) {
  const seen = new Set();
  return arr.filter((item) => {
    if (seen.has(item[key])) return false;
    seen.add(item[key]);
    return true;
  });
}

function _sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function _assert(value, expectation, label) {
  if (expectation === 'string' && typeof value !== 'string') {
    throw new ValidationError(label, 'must be a string');
  }
  if (expectation === 'object' && (typeof value !== 'object' || value === null)) {
    throw new ValidationError(label, 'must be a non-null object');
  }
  if (expectation === true && !value) {
    throw new ValidationError(label, 'assertion failed');
  }
}

const quickScrape = {
  load:          (url, opts)               => new Scrapely(opts).load(url),
  getText:       (url, sel, opts)          => new Scrapely(opts).getText(url, sel, opts),
  getAttribute:  (url, sel, attr, opts)    => new Scrapely(opts).getAttribute(url, sel, attr, opts),
  extract:       (url, schema, opts)       => new Scrapely(opts).extract(url, schema, opts),
  extractList:   (url, cont, schema, opts) => new Scrapely(opts).extractList(url, cont, schema, opts),
  extractTable:  (url, sel, opts)          => new Scrapely(opts).extractTable(url, sel, opts),
  extractEmails: (url)                     => new Scrapely().extractEmails(url),
  extractLinks:  (url, opts)              => new Scrapely(opts).extractLinks(url, opts),
};

const DataUtils = Object.freeze({
  cleanText,
  extractNumbers,
  parsePrice,
  parseDate,
  getDomain,
  normalizeUrl,
  sanitizeFilename,
  detectType,
});

module.exports              = Scrapely;
module.exports.Scrapely     = Scrapely;
module.exports.quickScrape  = quickScrape;
module.exports.DataUtils    = DataUtils;

module.exports.ScrapelyError   = ScrapelyError;
module.exports.FetchError      = FetchError;
module.exports.ValidationError = ValidationError;
module.exports.ExportError     = ExportError;

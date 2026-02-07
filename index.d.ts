import { EventEmitter } from 'events';
import { AxiosRequestConfig, AxiosProxyConfig } from 'axios';
import { CheerioAPI } from 'cheerio';

export interface ScrapelyOptions {
  timeout?: number;
  maxRetries?: number;
  retryDelay?: number;
  headers?: Record<string, string>;
  followRedirects?: boolean;
  validateStatus?: (status: number) => boolean;
  rateLimit?: number | null;
  proxy?: AxiosProxyConfig | null;
  rotateUserAgent?: boolean;
  cache?: boolean | { ttl?: number; maxSize?: number };
}

export interface FieldDefinition {
  selector: string;
  type?: 'text' | 'html' | 'attribute';
  attribute?: string;
  multiple?: boolean;
  transform?: (value: any, $: CheerioAPI, el: any) => any;
}

export interface TableResult {
  headers: string[];
  rows: Record<string, string>[];
}

export interface FormField {
  tag: string;
  name: string | null;
  type: string;
  value: string | null;
  required: boolean;
  placeholder: string | null;
  options?: Array<{ value: string; label: string; selected: boolean }>;
}

export interface FormResult {
  action: string | null;
  method: string;
  fields: FormField[];
}

export interface LinkResult {
  href: string;
  text: string;
  title?: string;
}

export interface PaginateOptions {
  nextSelector?: string;
  maxPages?: number;
  dataExtractor?: ($: CheerioAPI, url: string, page: number) => any | Promise<any>;
  stopWhen?: ($: CheerioAPI, collected: any[], page: number) => boolean;
  ignoreErrors?: boolean;
}

export interface MultipleOptions {
  multiple?: boolean;
  axiosConfig?: AxiosRequestConfig;
}

export interface ScrapeMultipleOptions {
  concurrency?: number;
  ignoreErrors?: boolean;
}

export interface ExtractLinksOptions {
  internal?: boolean;
  external?: boolean;
  pattern?: string;
  unique?: boolean;
}

export class ScrapelyError extends Error {
  code: string;
  meta: Record<string, any>;
  constructor(message: string, code: string, meta?: Record<string, any>);
}

export class FetchError extends ScrapelyError {
  cause: Error;
  constructor(url: string, attempts: number, cause: Error);
}

export class ValidationError extends ScrapelyError {
  constructor(param: string, reason: string);
}

export class ExportError extends ScrapelyError {
  cause: Error;
  constructor(filepath: string, cause: Error);
}

declare class Scrapely extends EventEmitter {
  constructor(options?: ScrapelyOptions);

  fetch(url: string, axiosConfig?: AxiosRequestConfig): Promise<string>;
  load(url: string, axiosConfig?: AxiosRequestConfig): Promise<CheerioAPI>;

  getText(url: string, selector: string, opts?: MultipleOptions): Promise<string | string[]>;
  getAttribute(url: string, selector: string, attribute: string, opts?: MultipleOptions): Promise<string | undefined | Array<string | undefined>>;
  getHtml(url: string, selector: string, opts?: MultipleOptions): Promise<string | null | Array<string | null>>;

  extract(url: string, schema: Record<string, FieldDefinition>, axiosConfig?: AxiosRequestConfig): Promise<Record<string, any>>;
  extractList(url: string, containerSelector: string, itemSchema: Record<string, FieldDefinition>, axiosConfig?: AxiosRequestConfig): Promise<Record<string, any>[]>;

  exists(url: string, selector: string, axiosConfig?: AxiosRequestConfig): Promise<boolean>;
  count(url: string, selector: string, axiosConfig?: AxiosRequestConfig): Promise<number>;

  scrapeMultiple(urls: string[], handler: ($: CheerioAPI, url: string) => any, opts?: ScrapeMultipleOptions): Promise<any[]>;
  paginate(startUrl: string, opts?: PaginateOptions): Promise<any[]>;

  extractTable(url: string, selector?: string, opts?: { all?: boolean }): Promise<TableResult | TableResult[] | null>;
  extractForm(url: string, selector?: string): Promise<FormResult | FormResult[]>;
  extractEmails(url: string): Promise<string[]>;
  extractPhoneNumbers(url: string): Promise<string[]>;
  extractLinks(url: string, opts?: ExtractLinksOptions): Promise<LinkResult[]>;

  downloadFile(url: string, dest: string, axiosConfig?: AxiosRequestConfig): Promise<string>;
  downloadImages(url: string, selector?: string, dir?: string, opts?: { ignoreErrors?: boolean }): Promise<string[]>;

  exportJSON(data: any, filepath: string): Promise<string>;
  exportCSV(data: Record<string, any>[], filepath: string): Promise<string>;

  setHeaders(headers: Record<string, string>): void;
  setCookies(cookies: string | Record<string, string>): void;
  clearCache(): void;
  readonly cacheSize: number;
}

export declare const quickScrape: {
  load(url: string, opts?: ScrapelyOptions): Promise<CheerioAPI>;
  getText(url: string, selector: string, opts?: ScrapelyOptions & MultipleOptions): Promise<string | string[]>;
  getAttribute(url: string, selector: string, attribute: string, opts?: ScrapelyOptions & MultipleOptions): Promise<string | undefined | Array<string | undefined>>;
  extract(url: string, schema: Record<string, FieldDefinition>, opts?: ScrapelyOptions): Promise<Record<string, any>>;
  extractList(url: string, containerSelector: string, itemSchema: Record<string, FieldDefinition>, opts?: ScrapelyOptions): Promise<Record<string, any>[]>;
  extractTable(url: string, selector?: string, opts?: ScrapelyOptions & { all?: boolean }): Promise<TableResult | TableResult[] | null>;
  extractEmails(url: string): Promise<string[]>;
  extractLinks(url: string, opts?: ScrapelyOptions & ExtractLinksOptions): Promise<LinkResult[]>;
};

export declare const DataUtils: {
  cleanText(text: string): string;
  extractNumbers(text: string): number[];
  parsePrice(raw: string): number | null;
  parseDate(raw: string): Date | null;
  getDomain(url: string): string | null;
  normalizeUrl(url: string, opts?: { removeQuery?: boolean; removeFragment?: boolean; removeTrailingSlash?: boolean }): string;
  sanitizeFilename(name: string): string;
  detectType(value: string): 'integer' | 'float' | 'email' | 'url' | 'date' | 'empty' | 'string';
};

export default Scrapely;
export { Scrapely };

# Changelog

All notable changes to the Scrapely project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-02-08

### Added
- 🎉 Initial release of Scrapely
- ✨ Core scraping functionality with Axios and Cheerio
- 🔄 Automatic retry logic with configurable attempts and delays
- 🎯 CSS selector support for element selection
- 📦 Multiple data extraction methods:
  - `getText()` - Extract text content
  - `getAttribute()` - Extract element attributes
  - `getHtml()` - Extract HTML content
  - `extract()` - Schema-based extraction
  - `extractList()` - List/array extraction
- 🚀 Parallel page scraping with `scrapeMultiple()`
- 🔧 Customizable configuration options
- 🍪 Cookie and header management
- ✅ Element existence checking with `exists()`
- 🔢 Element counting with `count()`
- ⚡ Quick scrape utilities for one-off operations
- 📝 Comprehensive documentation in README
- 💡 10+ practical examples
- 🧪 Complete test suite
- 📋 CommonJS module format
- 🎁 Transform functions for data processing
- 🌐 User-Agent customization
- ⚙️ Request timeout and redirect configuration
- 🔄 Direct Cheerio access for advanced use cases

### Features
- Built with production-ready libraries (Axios 1.13.4, Cheerio 1.2.0)
- MIT License for open-source use
- Development and production ready
- Node.js 12+ support
- Comprehensive error handling
- Memory efficient
- Easy to integrate

### Documentation
- Complete API documentation
- Usage examples in multiple scenarios
- Best practices guide
- Real-world use cases
- Sinhala and English documentation

### Developer Experience
- Simple and intuitive API
- TypeScript-friendly (types can be added)
- Well-commented code
- Example files included
- Test file for verification

---

## Future Releases (Planned)

### [1.1.0] - Planned
- [ ] Built-in proxy support
- [ ] Rate limiting functionality
- [ ] Request caching
- [ ] CSV export utilities
- [ ] JSON file export

### [1.2.0] - Planned
- [ ] JavaScript rendering with Puppeteer
- [ ] Screenshot capabilities
- [ ] PDF generation
- [ ] Complex navigation flows

### [1.3.0] - Planned
- [ ] Database integration helpers
- [ ] MongoDB support
- [ ] PostgreSQL support
- [ ] Data validation schemas

---

For more information, visit the [README](README.md).

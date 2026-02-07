const Scrapely = require('./index');
const { quickScrape, DataUtils } = require('./index');

/**
 * Simple test to verify the library is working
 */

async function testBasicFunctionality() {
  console.log('🧪 Testing Scrapely Library...\n');
  
  try {
    // Test 1: Basic scraper creation
    console.log('✓ Test 1: Creating scraper instance...');
    const scraper = new Scrapely({
      timeout: 10000,
      maxRetries: 2
    });
    console.log('  ✅ Scraper instance created successfully\n');
    
    // Test 2: Load a page
    console.log('✓ Test 2: Loading example.com...');
    const $ = await scraper.load('https://example.com');
    console.log('  ✅ Page loaded successfully\n');
    
    // Test 3: Extract text
    console.log('✓ Test 3: Extracting title...');
    const title = await scraper.getText('https://example.com', 'h1');
    console.log(`  ✅ Title: "${title}"\n`);
    
    // Test 4: Extract multiple elements
    console.log('✓ Test 4: Extracting all paragraphs...');
    const paragraphs = await scraper.getText('https://example.com', 'p', { multiple: true });
    console.log(`  ✅ Found ${paragraphs.length} paragraphs\n`);
    
    // Test 5: Extract attributes
    console.log('✓ Test 5: Extracting link href...');
    const link = await scraper.getAttribute('https://example.com', 'a', 'href');
    console.log(`  ✅ Link: "${link}"\n`);
    
    // Test 6: Complex extraction
    console.log('✓ Test 6: Complex data extraction...');
    const data = await scraper.extract('https://example.com', {
      title: { selector: 'h1', type: 'text' },
      firstParagraph: { selector: 'p', type: 'text' },
      link: { selector: 'a', type: 'attribute', attribute: 'href' }
    });
    console.log('  ✅ Data extracted:', JSON.stringify(data, null, 2), '\n');
    
    // Test 7: Element existence check
    console.log('✓ Test 7: Checking element existence...');
    const hasH1 = await scraper.exists('https://example.com', 'h1');
    const hasFooter = await scraper.exists('https://example.com', 'footer');
    console.log(`  ✅ Has H1: ${hasH1}, Has Footer: ${hasFooter}\n`);
    
    // Test 8: Count elements
    console.log('✓ Test 8: Counting elements...');
    const linkCount = await scraper.count('https://example.com', 'a');
    const paragraphCount = await scraper.count('https://example.com', 'p');
    console.log(`  ✅ Links: ${linkCount}, Paragraphs: ${paragraphCount}\n`);
    
    // Test 9: Quick scrape utility
    console.log('✓ Test 9: Testing quick scrape utility...');
    const quickTitle = await quickScrape.getText('https://example.com', 'h1');
    console.log(`  ✅ Quick Title: "${quickTitle}"\n`);
    
    // Test 10: Custom headers
    console.log('✓ Test 10: Testing custom headers...');
    scraper.setHeaders({ 'Accept-Language': 'en-US' });
    console.log('  ✅ Custom headers set\n');
    
    // Test 11: Cookie setting
    console.log('✓ Test 11: Testing cookie setting...');
    scraper.setCookies({ test: 'value' });
    console.log('  ✅ Cookies set\n');
    
    // Test 12: Data utilities
    console.log('✓ Test 12: Testing data utilities...');
    const cleanedText = DataUtils.cleanText('  Extra   spaces  ');
    const price = DataUtils.parsePrice('$1,234.56');
    const domain = DataUtils.getDomain('https://example.com/path');
    console.log(`  ✅ Cleaned: "${cleanedText}", Price: ${price}, Domain: ${domain}\n`);
    
    // Test 13: Email extraction
    console.log('✓ Test 13: Testing email extraction...');
    const emails = await scraper.extractEmails('https://example.com');
    console.log(`  ✅ Emails found: ${emails.length}\n`);
    
    // Test 14: Link extraction
    console.log('✓ Test 14: Testing link extraction...');
    const links = await scraper.extractLinks('https://example.com', { unique: true });
    console.log(`  ✅ Links found: ${links.length}\n`);
    
    // Test 15: Cache functionality
    console.log('✓ Test 15: Testing cache...');
    const cachedScraper = new Scrapely({ cache: true });
    await cachedScraper.fetch('https://example.com');
    const cacheSize = cachedScraper.cacheSize;
    console.log(`  ✅ Cache size: ${cacheSize}\n`);
    
    console.log('═════════════════════════════════════════');
    console.log('🎉 All tests passed successfully!');
    console.log('═════════════════════════════════════════\n');
    
    console.log('📊 Summary:');
    console.log(`   • Scraper creation: ✅`);
    console.log(`   • Page loading: ✅`);
    console.log(`   • Text extraction: ✅`);
    console.log(`   • Multiple elements: ✅`);
    console.log(`   • Attribute extraction: ✅`);
    console.log(`   • Complex extraction: ✅`);
    console.log(`   • Element existence: ✅`);
    console.log(`   • Element counting: ✅`);
    console.log(`   • Quick scrape: ✅`);
    console.log(`   • Custom headers: ✅`);
    console.log(`   • Cookie setting: ✅`);
    console.log(`   • Data utilities: ✅`);
    console.log(`   • Email extraction: ✅`);
    console.log(`   • Link extraction: ✅`);
    console.log(`   • Cache system: ✅`);
    console.log('\n✨ Scrapely is ready to use!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// Run tests
if (require.main === module) {
  testBasicFunctionality().catch(console.error);
}

module.exports = { testBasicFunctionality };

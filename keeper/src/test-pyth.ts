/**
 * Test Pyth Price Feed
 *
 * Simple script to verify we can fetch SUI/USD price from Pyth.
 * Run with: npm run test-pyth
 */

// Pyth Hermes API endpoint
const HERMES_URL = 'https://hermes.pyth.network';
const SUI_USD_FEED_ID = '5a035d5440f5c163069af66062bac6c79377bf88396fa27e6067bfca8096d280';

async function testPythPrice() {
  console.log('Testing Pyth SUI/USD Price Feed\n');
  console.log(`Hermes URL: ${HERMES_URL}`);
  console.log(`Feed ID: ${SUI_USD_FEED_ID}\n`);

  try {
    // Fetch latest price
    const url = `${HERMES_URL}/v2/updates/price/latest?ids[]=${SUI_USD_FEED_ID}`;
    console.log(`Fetching: ${url}\n`);

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    // Parse response
    if (!data.parsed || data.parsed.length === 0) {
      throw new Error('No price data in response');
    }

    const priceData = data.parsed[0];
    console.log('Raw Response:');
    console.log(JSON.stringify(priceData, null, 2));
    console.log();

    // Extract price info
    const rawPrice = BigInt(priceData.price.price);
    const expo = priceData.price.expo;
    const conf = priceData.price.conf;
    const publishTime = new Date(priceData.price.publish_time * 1000);

    console.log('Parsed Values:');
    console.log(`  Raw Price: ${rawPrice}`);
    console.log(`  Exponent: ${expo}`);
    console.log(`  Confidence: ${conf}`);
    console.log(`  Publish Time: ${publishTime.toISOString()}`);
    console.log();

    // Convert to our format (1e9 precision)
    const targetExpo = 9;
    const adjustment = targetExpo + expo;
    let scaledPrice: bigint;
    if (adjustment >= 0) {
      scaledPrice = rawPrice * BigInt(10 ** adjustment);
    } else {
      scaledPrice = rawPrice / BigInt(10 ** (-adjustment));
    }

    // Convert to dollars for display
    const priceInDollars = Number(scaledPrice) / 1e9;

    console.log('Converted:');
    console.log(`  Scaled Price (1e9): ${scaledPrice}`);
    console.log(`  Price in USD: $${priceInDollars.toFixed(4)}`);
    console.log();

    console.log('✓ Pyth integration working!');

  } catch (error) {
    console.error('✗ Error:', error);
    process.exit(1);
  }
}

testPythPrice();

/**
 * Eenvoudige filter voor evidente automation. Geen antibot-engine.
 * Een bot met een gewone browser-user-agent glipt hierdoor; dat is bewust.
 */
const AUTOMATISERING =
  /googlebot|bingbot|duckduckbot|baiduspider|yandexbot|slurp|facebookexternalhit|facebot|twitterbot|linkedinbot|embedly|slackbot|telegrambot|discordbot|whatsapp|applebot|petalbot|ahrefsbot|semrushbot|dotbot|mj12bot|bytespider|gptbot|claudebot|perplexitybot|amazonbot|headless|phantomjs|selenium|puppeteer|playwright|wget\/|curl\/|python-requests|go-http-client|scrapy|lighthouse|pagespeed|gtmetrix|pingdom|httpclient|libwww|previewbot|bingpreview|adsbot|mediapartners/i;

export function isEvidenteAutomation(userAgent: string | null | undefined): boolean {
  const ua = (userAgent ?? '').trim();
  if (!ua) return false;
  return AUTOMATISERING.test(ua);
}

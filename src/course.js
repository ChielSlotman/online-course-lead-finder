import * as cheerio from 'cheerio';
import { gotScraping } from 'got-scraping';

const DEFAULT_INPUT = {
  keywords: [],
  courseUrls: [],
  maxResults: 50,
  includePrices: true,
  includeCreatorInfo: true,
  includeContactInfo: true,
  includeSocialLinks: true,
  locationOrLanguage: '',
  deduplicateResults: true,
  debugMode: false,
  maxRetries: 2,
  requestTimeoutSecs: 30
};

const COURSE_HOST_HINTS = [
  'udemy.com',
  'coursera.org',
  'skillshare.com',
  'teachable.com',
  'thinkific.com',
  'kajabi.com',
  'gumroad.com',
  'podia.com',
  'learnworlds.com',
  'maven.com',
  'domestika.org',
  'masterclass.com',
  'edx.org',
  'futurelearn.com'
];

const EXCLUDED_SEARCH_HOSTS = [
  'reddit.com',
  'quora.com',
  'pinterest.',
  'facebook.com',
  'instagram.com',
  'linkedin.com',
  'youtube.com',
  'youtu.be'
];

const SOCIAL_PATTERNS = {
  instagram: /https?:\/\/(?:www\.)?instagram\.com\/[^"'\s?#<)]+/i,
  facebook: /https?:\/\/(?:www\.)?facebook\.com\/[^"'\s?#<)]+/i,
  linkedin: /https?:\/\/(?:www\.)?linkedin\.com\/(?:company|in)\/[^"'\s?#<)]+/i,
  youtube: /https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\/[^"'\s?#<)]+/i
};

export function normalizeInput(rawInput = {}) {
  const input = { ...DEFAULT_INPUT, ...rawInput };
  input.keywords = normalizeStringArray(input.keywords);
  input.courseUrls = normalizeUrlArray(input.courseUrls);
  input.locationOrLanguage = String(input.locationOrLanguage ?? '').trim();
  input.maxResults = toBoundedInteger(input.maxResults, 1, 500, DEFAULT_INPUT.maxResults, 'maxResults');

  if (!input.keywords.length && !input.courseUrls.length) {
    throw new Error('Provide at least one keyword or direct course URL.');
  }

  return input;
}

export async function findCourseLeads(input, options = {}) {
  const scrapedAt = new Date().toISOString();
  const output = [];

  for (const url of input.courseUrls) {
    if (output.length >= input.maxResults) break;
    await options.status?.(`Scanning course URL: ${url}`);
    const lead = await safeParseCourse(url, {
      input,
      sourceKeyword: null,
      scrapedAt,
      options
    });
    if (lead) output.push(lead);
  }

  for (const keyword of input.keywords) {
    if (output.length >= input.maxResults) break;
    await options.status?.(`Searching public web for course leads: ${keyword}`);
    const search = await searchCourses(keyword, input, options);
    for (const result of search.results) {
      if (output.length >= input.maxResults) break;
      const lead = await safeParseCourse(result.url, {
        input,
        sourceKeyword: keyword,
        searchSnippet: result.snippet,
        scrapedAt,
        options
      });
      if (lead) output.push(lead);
    }
  }

  const rows = input.deduplicateResults ? deduplicateBy(output, (row) => normalizeUrlForKey(row.courseUrl)) : output;
  return rows.slice(0, input.maxResults);
}

export async function searchCourses(keyword, input, options = {}) {
  const query = [keyword, input.locationOrLanguage, 'online course creator price'].filter(Boolean).join(' ');
  const searchUrls = [
    `https://search.brave.com/search?q=${encodeURIComponent(query)}&source=web`,
    `https://www.bing.com/search?cc=us&setlang=en-US&q=${encodeURIComponent(query)}`
  ];
  let lastError;
  for (const searchUrl of searchUrls) {
    try {
      const response = await requestText(searchUrl, options);
      const results = parseCourseSearchResults(response.body, searchUrl)
        .filter((row) => scoreCourseSearchResult(row, keyword) >= 25)
        .slice(0, Math.min(input.maxResults * 2, 30));
      if (results.length) return { searchUrl, results };
    } catch (error) {
      lastError = error;
    }
  }
  options.logger?.warning?.('Public course search did not return candidates.', { keyword, error: lastError?.message });
  return { searchUrl: searchUrls[0], results: [] };
}

export function parseCourseSearchResults(html, searchUrl = null) {
  const $ = cheerio.load(html);
  const rows = [];
  $('li.b_algo').each((_, element) => {
    const link = $(element).find('h2 a[href]').first();
    const url = unwrapSearchUrl(link.attr('href'));
    if (!url || !isHttpUrl(url)) return;
    rows.push({
      title: cleanText(link.text()),
      url,
      snippet: cleanText($(element).find('.b_caption p, p').first().text()),
      searchUrl
    });
  });
  $('.result, .web-result').each((_, element) => {
    const link = $(element).find('a.result__a, a[href]').first();
    const rawHref = link.attr('href');
    const url = unwrapSearchUrl(unwrapDuckDuckGoUrl(rawHref));
    if (!url || !isHttpUrl(url)) return;
    rows.push({
      title: cleanText(link.text()) || cleanText($(element).find('.result__title').text()),
      url,
      snippet: cleanText($(element).find('.result__snippet').text()),
      searchUrl
    });
  });
  $('a[href^="http"]').each((_, element) => {
    const url = unwrapSearchUrl($(element).attr('href'));
    if (!url || !isHttpUrl(url)) return;
    const title = cleanText($(element).text());
    const snippet = cleanText($(element).closest('article, section, div').text()).slice(0, 500);
    if (!title && !snippet) return;
    rows.push({ title, url, snippet, searchUrl });
  });
  return deduplicateBy(rows, (row) => normalizeUrlForKey(row.url));
}

export function parseCoursePage(html, pageUrl, context = {}) {
  const $ = cheerio.load(html);
  const jsonLd = parseJsonLd($);
  const product = findJsonLdType(jsonLd, ['Course', 'Product']);
  const offer = Array.isArray(product?.offers) ? product.offers[0] : product?.offers;
  const title = cleanText(product?.name)
    || cleanText($('meta[property="og:title"]').attr('content'))
    || cleanText($('h1').first().text())
    || cleanText($('title').first().text());
  const description = cleanText(product?.description)
    || cleanText($('meta[name="description"]').attr('content'))
    || cleanText($('meta[property="og:description"]').attr('content'))
    || context.searchSnippet
    || null;
  const creator = extractCreator($, jsonLd, pageUrl);
  const price = parsePrice(offer?.price ?? $('[class*="price"], [data-purpose*="price"]').first().text());
  const currency = cleanText(offer?.priceCurrency) || inferCurrency($('body').text());
  const rating = toNullableNumber(product?.aggregateRating?.ratingValue ?? $('[class*="rating"]').first().text());
  const reviewCount = toNullableInteger(product?.aggregateRating?.reviewCount ?? $('body').text().match(/([\d,]+)\s+reviews?/i)?.[1]);
  const studentsCount = toNullableInteger($('body').text().match(/([\d,]+)\s+(?:students|learners|enrolled)/i)?.[1]);
  const links = extractLinks($, pageUrl);
  const publicData = extractPublicContactAndSocials(html, links, context.input);
  const category = cleanText(product?.category)
    || cleanText($('[class*="category"], a[href*="category"]').first().text())
    || null;

  return {
    courseTitle: title || null,
    courseUrl: pageUrl,
    coursePlatform: detectPlatform(pageUrl),
    creatorName: context.input.includeCreatorInfo ? creator.name : null,
    creatorUrl: context.input.includeCreatorInfo ? creator.url : null,
    creatorWebsite: context.input.includeCreatorInfo ? creator.website : null,
    price: context.input.includePrices ? price : null,
    currency: context.input.includePrices ? currency : null,
    category,
    niche: context.sourceKeyword,
    descriptionSnippet: description ? description.slice(0, 500) : null,
    imageUrl: cleanText(product?.image) || cleanText($('meta[property="og:image"]').attr('content')) || null,
    rating,
    reviewCount,
    studentsCount,
    email: context.input.includeContactInfo ? publicData.email : null,
    phone: context.input.includeContactInfo ? publicData.phone : null,
    contactPage: context.input.includeContactInfo ? publicData.contactPage : null,
    instagram: context.input.includeSocialLinks ? publicData.instagram : null,
    facebook: context.input.includeSocialLinks ? publicData.facebook : null,
    linkedin: context.input.includeSocialLinks ? publicData.linkedin : null,
    youtube: context.input.includeSocialLinks ? publicData.youtube : null,
    sourceKeyword: context.sourceKeyword,
    scrapedAt: context.scrapedAt
  };
}

export function scoreCourseSearchResult(result, keyword = '') {
  const haystack = `${result.title} ${result.snippet} ${getHostname(result.url)}`.toLowerCase();
  const host = getHostname(result.url);
  if (EXCLUDED_SEARCH_HOSTS.some((excluded) => host.includes(excluded))) return 0;
  if (/\/(?:blog|article|news|forum|community)\//i.test(result.url) && !COURSE_HOST_HINTS.some((known) => host.includes(known))) {
    return 0;
  }
  const courseLanding = /\/(?:course|courses|learn|specializations?|program|academy|masterclass|training|bootcamp)\b/i.test(result.url)
    || /course|class|masterclass|specialization|certification|program|training/i.test(result.title);
  if (!courseLanding && !COURSE_HOST_HINTS.some((known) => host.includes(known))) return 0;
  let score = 0;
  if (/course|class|masterclass|training|academy|learn|program/i.test(haystack)) score += 35;
  if (COURSE_HOST_HINTS.some((host) => getHostname(result.url).includes(host))) score += 35;
  const tokens = importantTokens(keyword);
  score += Math.round((tokens.filter((token) => haystack.includes(token)).length / Math.max(tokens.length, 1)) * 30);
  return Math.max(0, Math.min(99, score));
}

async function safeParseCourse(url, context) {
  try {
    const response = await requestText(url, context.options);
    return parseCoursePage(response.body, response.url, context);
  } catch (error) {
    context.options.logger?.warning?.('Could not parse course URL.', { url, error: error.message });
    return null;
  }
}

export async function requestText(url, options = {}) {
  const {
    proxyConfiguration = null,
    maxRetries = DEFAULT_INPUT.maxRetries,
    requestTimeoutSecs = DEFAULT_INPUT.requestTimeoutSecs,
    logger = console
  } = options;
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const proxyUrl = proxyConfiguration ? await proxyConfiguration.newUrl() : undefined;
      const response = await gotScraping({
        url,
        proxyUrl,
        responseType: 'text',
        throwHttpErrors: false,
        timeout: { request: requestTimeoutSecs * 1000 },
        retry: { limit: 0 },
        headers: {
          accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'accept-language': 'en-US,en;q=0.9'
        }
      });
      if (response.statusCode >= 200 && response.statusCode < 400) {
        return { body: response.body, url: response.url, statusCode: response.statusCode, headers: response.headers };
      }
      lastError = new Error(`HTTP ${response.statusCode} for ${url}`);
    } catch (error) {
      lastError = error;
    }
    if (attempt < maxRetries) {
      logger.debug?.(`Request failed, retrying: ${lastError.message}`);
      await sleep(600 * (attempt + 1));
    }
  }
  throw lastError;
}

function extractCreator($, jsonLd, pageUrl) {
  const course = findJsonLdType(jsonLd, ['Course', 'Product']);
  const author = course?.author || course?.creator || findJsonLdType(jsonLd, ['Person', 'Organization']);
  const authorObject = Array.isArray(author) ? author[0] : author;
  const creatorLink = $('a[href*="instructor"], a[href*="teacher"], a[href*="creator"], a[href*="author"]').first();
  const creatorUrl = toAbsoluteUrl(authorObject?.url || creatorLink.attr('href'), pageUrl);
  const externalWebsite = $('a[href*="http"]').toArray()
    .map((element) => toAbsoluteUrl($(element).attr('href'), pageUrl))
    .find((href) => href && getHostname(href) !== getHostname(pageUrl) && !isSocialUrl(href));
  return {
    name: cleanText(authorObject?.name) || cleanText(creatorLink.text()) || null,
    url: creatorUrl,
    website: externalWebsite ?? null
  };
}

function extractPublicContactAndSocials(html, links, input) {
  const sameHostContact = links.find((link) => /contact|support|help|get-in-touch/i.test(`${link.text} ${link.url}`));
  const socials = extractSocials(html);
  return {
    email: input.includeContactInfo ? extractEmails(html)[0] ?? null : null,
    phone: input.includeContactInfo ? extractPhones(cleanText(cheerio.load(html)('body').text()))[0] ?? null : null,
    contactPage: sameHostContact?.url ?? null,
    ...socials
  };
}

function extractLinks($, pageUrl) {
  const links = [];
  $('a[href]').each((_, element) => {
    const url = toAbsoluteUrl($(element).attr('href'), pageUrl);
    if (!url) return;
    links.push({ url, text: cleanText($(element).text()) });
  });
  return links;
}

function parseJsonLd($) {
  const rows = [];
  $('script[type="application/ld+json"]').each((_, element) => {
    try {
      const parsed = JSON.parse($(element).text());
      rows.push(...(Array.isArray(parsed) ? parsed : [parsed]));
    } catch {
      // Ignore invalid public markup.
    }
  });
  return rows.flatMap((row) => row?.['@graph'] ?? row);
}

function findJsonLdType(rows, types) {
  return rows.find((row) => {
    const value = row?.['@type'];
    return Array.isArray(value)
      ? value.some((type) => types.includes(type))
      : types.includes(value);
  }) ?? null;
}

function parsePrice(value) {
  if (value == null || value === '') return null;
  const match = String(value).replace(/,/g, '').match(/(\d+(?:\.\d{1,2})?)/);
  return match ? Number(match[1]) : null;
}

function inferCurrency(text) {
  if (/\$/.test(text)) return 'USD';
  if (/€/.test(text)) return 'EUR';
  if (/£/.test(text)) return 'GBP';
  return null;
}

function detectPlatform(url) {
  const host = getHostname(url);
  const known = COURSE_HOST_HINTS.find((hint) => host.includes(hint));
  return known ?? host;
}

function extractEmails(html) {
  const matches = html.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
  return dedupeFlat(matches)
    .map((email) => email.toLowerCase())
    .filter((email) => !/\.(png|jpg|jpeg|gif|webp|svg)$/i.test(email))
    .filter((email) => !/sentry|ingest|example\.com|localhost/i.test(email))
    .filter((email) => (email.split('@')[0] ?? '').length <= 35);
}

function extractPhones(text) {
  const matches = text.match(/(?:\+\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?){2,5}\d{2,4}/g) ?? [];
  return dedupeFlat(matches.map(cleanText)).filter(isLikelyPhone);
}

function extractSocials(html) {
  const socials = {};
  for (const [field, pattern] of Object.entries(SOCIAL_PATTERNS)) {
    const match = html.match(pattern);
    socials[field] = match ? trimUrl(match[0]) : null;
  }
  return socials;
}

function isSocialUrl(url) {
  return /instagram\.com|facebook\.com|linkedin\.com|youtube\.com|youtu\.be|twitter\.com|x\.com/i.test(url);
}

function unwrapDuckDuckGoUrl(rawHref) {
  if (!rawHref) return null;
  const absolute = toAbsoluteUrl(rawHref, 'https://duckduckgo.com/');
  try {
    const url = new URL(absolute);
    return url.searchParams.get('uddg') || absolute;
  } catch {
    return rawHref;
  }
}

function unwrapSearchUrl(rawHref) {
  if (!rawHref) return null;
  const absolute = toAbsoluteUrl(rawHref, 'https://www.bing.com/');
  try {
    const url = new URL(absolute);
    const encoded = url.searchParams.get('u');
    if (encoded?.startsWith('a1')) {
      return Buffer.from(encoded.slice(2).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    }
    return absolute;
  } catch {
    return rawHref;
  }
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? '').trim()).filter(Boolean);
}

function normalizeUrlArray(value) {
  return normalizeStringArray(value).filter(isHttpUrl);
}

function toBoundedInteger(value, min, max, fallback, fieldName) {
  const number = Number.parseInt(value ?? fallback, 10);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new Error(`Input "${fieldName}" must be an integer between ${min} and ${max}.`);
  }
  return number;
}

function importantTokens(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !['online', 'course', 'class', 'training', 'learn'].includes(token));
}

function deduplicateBy(rows, keyFactory) {
  const seen = new Set();
  const output = [];
  for (const row of rows) {
    const key = keyFactory(row);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(row);
  }
  return output;
}

function dedupeFlat(values) {
  return [...new Set(values.map((value) => cleanText(value)).filter(Boolean))];
}

function toNullableNumber(value) {
  const number = parsePrice(value);
  return Number.isFinite(number) ? number : null;
}

function toNullableInteger(value) {
  const number = Number.parseInt(String(value ?? '').replace(/,/g, ''), 10);
  return Number.isInteger(number) ? number : null;
}

function toAbsoluteUrl(href, baseUrl) {
  if (!href || href === 'undefined' || href === 'null') return null;
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}

function normalizeUrlForKey(url) {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    return parsed.toString().replace(/\/$/, '').toLowerCase();
  } catch {
    return String(url ?? '').toLowerCase();
  }
}

function getHostname(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

function trimUrl(value) {
  return String(value).split('&quot;')[0].split('"')[0].split('\\n')[0].split('\n')[0].replace(/[),.;]+$/, '');
}

function isLikelyPhone(value) {
  const phone = cleanText(value);
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return false;
  if (/^20\d{2}[-.]\d{2}[-.]\d{2}/.test(phone) || /^20\d{6}[.]\d{2}[.]\d{2}/.test(phone)) return false;
  if (!phone.includes('+') && /^(?:\d{2}\s+){4,}\d{2}$/.test(phone)) return false;
  if (!/^\+|tel:|\(\d{2,4}\)|\d{2,4}[\s.-]\d{2,4}[\s.-]\d/i.test(phone)) return false;
  return true;
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(String(value ?? ''));
}

function cleanText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

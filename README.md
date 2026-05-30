# Online Course Lead Finder

Find public online courses, course creators, course pages, prices, creator websites, public contact pages, and social links from keywords or direct course URLs.

Best for affiliate marketers, creator partnership teams, agencies, B2B lead generators, market researchers, and automation builders who need clean public course data for outreach and analysis.

## What this Actor does

Online Course Lead Finder searches public web results for online courses and scans direct course URLs. It extracts structured course and creator data that can be exported to CSV, JSON, Excel, Google Sheets, Make, Zapier, n8n, or an API workflow.

It only collects publicly visible information. It does not scrape private student data, bypass logins, access paid course content, or guess private contact details.

## Why use it

Course and creator research is slow when done manually. This Actor gives you a repeatable way to build course lead datasets for affiliate research, creator partnerships, online education analysis, and competitor monitoring.

## Who it is for

- Affiliate marketers
- B2B lead generation teams
- Agencies
- Course platform researchers
- Creator partnership teams
- Online education researchers
- People building course databases
- Automation builders using Apify, Make, Zapier, n8n, Google Sheets, or APIs

## Use cases

- Find online courses by niche or keyword
- Build creator partnership prospect lists
- Research prices and positioning in a market
- Find creator websites and public contact pages
- Collect public social links for course creators
- Export course leads to spreadsheets or CRM workflows

## Input

- `keywords` - course topics, niches, or search keywords
- `courseUrls` - direct course URLs to scan
- `maxResults` - maximum course leads to return
- `includePrices` - include visible prices
- `includeCreatorInfo` - include public creator/instructor information
- `includeContactInfo` - include public emails, phones, and contact pages
- `includeSocialLinks` - include public social links
- `locationOrLanguage` - optional search hint
- `deduplicateResults` - remove duplicate course URLs
- `proxyConfiguration` - optional Apify proxy support
- `debugMode` - save extra debugging data

## Output

Each dataset item can include:

- `courseTitle`
- `courseUrl`
- `coursePlatform`
- `creatorName`
- `creatorUrl`
- `creatorWebsite`
- `price`
- `currency`
- `category`
- `niche`
- `descriptionSnippet`
- `imageUrl`
- `rating`
- `reviewCount`
- `studentsCount`
- `email`
- `phone`
- `contactPage`
- `instagram`
- `facebook`
- `linkedin`
- `youtube`
- `sourceKeyword`
- `scrapedAt`

## Example input

```json
{
  "keywords": ["AI marketing course", "real estate investing course"],
  "maxResults": 25,
  "includePrices": true,
  "includeCreatorInfo": true,
  "includeContactInfo": true,
  "includeSocialLinks": true,
  "locationOrLanguage": "English",
  "deduplicateResults": true,
  "proxyConfiguration": {
    "useApifyProxy": true
  }
}
```

## Example output

```json
{
  "courseTitle": "AI Marketing Masterclass",
  "courseUrl": "https://example.com/courses/ai-marketing-masterclass",
  "coursePlatform": "example.com",
  "creatorName": "Jane Creator",
  "creatorUrl": "https://example.com/jane-creator",
  "creatorWebsite": "https://janecreator.com/",
  "price": 199,
  "currency": "USD",
  "category": "Marketing",
  "niche": "AI marketing course",
  "descriptionSnippet": "Learn how to use AI tools for content strategy, email campaigns, and automated marketing workflows.",
  "imageUrl": "https://example.com/course-image.jpg",
  "rating": 4.8,
  "reviewCount": 241,
  "studentsCount": 5100,
  "email": "hello@janecreator.com",
  "phone": null,
  "contactPage": "https://janecreator.com/contact",
  "instagram": "https://www.instagram.com/janecreator/",
  "facebook": null,
  "linkedin": "https://www.linkedin.com/in/janecreator/",
  "youtube": "https://www.youtube.com/@janecreator",
  "sourceKeyword": "AI marketing course",
  "scrapedAt": "2026-05-30T12:00:00.000Z"
}
```

## How to run

1. Open the Actor on Apify.
2. Enter course keywords, niches, or direct course URLs.
3. Choose whether to include prices, creator info, contact info, and social links.
4. Run the Actor.
5. Export the dataset from Apify.

## Export and integrations

Export results as CSV, JSON, JSONL, XML, RSS, or Excel. Connect outputs to Make, Zapier, n8n, Google Sheets, webhooks, or your own backend through the Apify API.

## API usage

Start a run with the Apify API:

```bash
curl "https://api.apify.com/v2/acts/esrok~online-course-lead-finder/runs?token=YOUR_APIFY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"keywords":["AI marketing course"],"maxResults":10}'
```

Fetch dataset items:

```bash
curl "https://api.apify.com/v2/datasets/DATASET_ID/items?format=json&clean=true&token=YOUR_APIFY_TOKEN"
```

## Responsible use

Use this Actor only for lawful public web research. Do not use it to collect private student data, bypass course paywalls, access login-only areas, or guess private contact details.

## Limitations

- Search result coverage varies by keyword, region, and language.
- Some course pages hide prices or creator details.
- The Actor only extracts visible public contact information.
- It does not access paid course content or private member areas.
- Pages that block automated traffic may require proxy settings or may not return results.

## FAQ

### Does this scrape student data?

No. It does not collect private student information.

### Can it scrape paid lessons?

No. It only scans publicly visible course landing pages and creator pages.

### Can it find every creator email?

No. It only returns emails that are publicly visible on scanned pages.

### Can I use it for affiliate research?

Yes. It is designed for public course discovery, creator research, and affiliate/partnership prospecting.

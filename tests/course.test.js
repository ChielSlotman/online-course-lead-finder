import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeInput,
  parseCoursePage,
  parseCourseSearchResults,
  scoreCourseSearchResult
} from '../src/course.js';

test('normalizeInput requires keywords or course URLs', () => {
  assert.throws(() => normalizeInput({}), /keyword/);
  const input = normalizeInput({ keywords: [' AI marketing course '], maxResults: 5 });
  assert.deepEqual(input.keywords, ['AI marketing course']);
  assert.equal(input.maxResults, 5);
});

test('parseCourseSearchResults unwraps DuckDuckGo URLs', () => {
  const html = `
    <div class="result">
      <a class="result__a" href="/l/?uddg=https%3A%2F%2Fexample.com%2Fcourse">AI Marketing Course</a>
      <a class="result__snippet">Course for marketers.</a>
    </div>
  `;
  const rows = parseCourseSearchResults(html);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].url, 'https://example.com/course');
});

test('scoreCourseSearchResult favors course-like pages', () => {
  const score = scoreCourseSearchResult({
    title: 'AI Marketing Masterclass Online Course',
    snippet: 'Learn AI workflows',
    url: 'https://example.teachable.com/p/ai-marketing'
  }, 'AI marketing course');
  assert.ok(score > 70);
});

test('parseCoursePage extracts public course, creator, price, and contact fields', () => {
  const html = `
    <html>
      <head>
        <meta property="og:title" content="AI Marketing Masterclass" />
        <meta property="og:description" content="Learn AI marketing workflows." />
        <meta property="og:image" content="https://example.com/image.jpg" />
        <script type="application/ld+json">{
          "@type":"Course",
          "name":"AI Marketing Masterclass",
          "description":"Learn AI marketing workflows.",
          "author":{"@type":"Person","name":"Jane Creator","url":"https://example.com/jane"},
          "offers":{"price":"199","priceCurrency":"USD"},
          "aggregateRating":{"ratingValue":"4.8","reviewCount":"241"}
        }</script>
      </head>
      <body>
        <a href="/contact">Contact</a>
        <a href="mailto:hello@realcourse.com">hello@realcourse.com</a>
        <a href="https://www.youtube.com/@janecreator">YouTube</a>
        <p>5,100 students</p>
      </body>
    </html>
  `;
  const row = parseCoursePage(html, 'https://example.com/course', {
    input: normalizeInput({ courseUrls: ['https://example.com/course'] }),
    sourceKeyword: 'AI marketing course',
    scrapedAt: '2026-05-30T12:00:00.000Z'
  });
  assert.equal(row.courseTitle, 'AI Marketing Masterclass');
  assert.equal(row.creatorName, 'Jane Creator');
  assert.equal(row.price, 199);
  assert.equal(row.currency, 'USD');
  assert.equal(row.rating, 4.8);
  assert.equal(row.reviewCount, 241);
  assert.equal(row.studentsCount, 5100);
  assert.equal(row.email, 'hello@realcourse.com');
  assert.equal(row.youtube, 'https://www.youtube.com/@janecreator');
});

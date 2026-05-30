import { Actor, log } from 'apify';
import {
  findCourseLeads,
  normalizeInput
} from './course.js';

await Actor.init();

try {
  const input = normalizeInput(await Actor.getInput() ?? {});
  log.info('Starting public online course lead discovery.', {
    keywords: input.keywords.length,
    courseUrls: input.courseUrls.length,
    maxResults: input.maxResults
  });

  const proxyConfiguration = input.proxyConfiguration
    ? await Actor.createProxyConfiguration(input.proxyConfiguration)
    : null;

  const results = await findCourseLeads(input, {
    proxyConfiguration,
    logger: log,
    status: (message) => Actor.setStatusMessage(message)
  });

  if (results.length) {
    await Actor.pushData(results);
  }

  await Actor.setValue('RUN_SUMMARY', {
    requestedKeywords: input.keywords.length,
    requestedCourseUrls: input.courseUrls.length,
    results: results.length,
    note: results.length
      ? 'Saved public online course lead records.'
      : 'No public online course leads were found for the provided input.'
  });

  await Actor.setStatusMessage(`Saved ${results.length} online course lead records.`);
  log.info('Finished online course lead discovery.', { results: results.length });
  await Actor.exit();
} catch (error) {
  log.exception(error, 'Actor failed.');
  await Actor.setStatusMessage(`Run failed: ${error.message}`);
  await Actor.fail(error.message);
}

await page.route('**/*', async route => {
  try {
    if (
      route.request().method() === 'GET' &&
      route.request().resourceType() === 'xhr'
    ) {
      const response = await route.fetch();

      const ct = response.headers()['content-type'] || '';
      if (!ct.includes('application/json')) {
        return route.fulfill({ response });
      }

      const json = await response.json();

      const listings =
        json?.data?.listings ||
        json?.data?.result ||
        json?.listings ||
        json?.results ||
        [];

      if (Array.isArray(listings) && listings.length > 0) {
        console.log(`📡 API détectée → ${listings.length} annonces`);
        listings.forEach(l => results.push(l));
      }

      return route.fulfill({ response });
    }
  } catch {
    return route.continue();
  }

  return route.continue();
});

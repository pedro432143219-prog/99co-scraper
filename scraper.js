function findListings(data) {
  // 1. chemins classiques (comme ton GAS)
  let listings =
    data?.props?.pageProps?.data?.listings ||
    data?.props?.pageProps?.initialState?.search?.result?.list ||
    data?.props?.pageProps?.searchResult?.list;

  if (Array.isArray(listings) && listings.length > 0) {
    return listings;
  }

  // 2. fallback React Query / dehydratedState (clé manquante actuellement)
  const dehydrated = data?.props?.pageProps?.dehydratedState;

  if (dehydrated?.queries) {
    for (const q of dehydrated.queries) {
      const dataQ = q?.state?.data;
      if (dataQ?.listings && Array.isArray(dataQ.listings)) {
        return dataQ.listings;
      }
      if (dataQ?.data && Array.isArray(dataQ.data)) {
        return dataQ.data;
      }
      if (dataQ?.result && Array.isArray(dataQ.result)) {
        return dataQ.result;
      }
    }
  }

  return [];
}

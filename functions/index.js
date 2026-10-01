export function onRequest(context) {
  const url = new URL(context.request.url);

  if (url.searchParams.get('mode') === 'long-house') {
    // Serve the second Vite entry with Long House share tags at the public URL.
    return context.env.ASSETS.fetch(new URL('/long-house', url));
  }

  return context.next();
}

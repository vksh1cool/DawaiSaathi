export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    url.hostname = "dawaisaathi.vksh1cool.workers.dev";
    
    // Pass the request directly to fetch, which is the safest way to proxy in Cloudflare
    return fetch(url.toString(), request);
  },
};

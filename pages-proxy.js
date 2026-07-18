export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    url.hostname = "dawaisaathi.vksh1cool.workers.dev";
    
    // Create a new request with the updated URL
    const proxyRequest = new Request(url.toString(), request);
    
    // Fetch from the worker and return the response
    return fetch(proxyRequest);
  },
};

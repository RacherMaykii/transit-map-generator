declare module "cloudflare:workers" {
  export const env: Record<string, any>;
}

interface Fetcher {
  fetch(input: Request): Promise<Response>;
}

import type { Config } from "@react-router/dev/config";

export default {
  // Config options...
  // SPA mode: the API is a separate server, auth tokens live in the browser
  ssr: false,
} satisfies Config;

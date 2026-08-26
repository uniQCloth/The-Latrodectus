// Central client configuration.
//
// Local dev  → talks to the dev server on localhost:3001
// Production → talks to the hosted Render service.
const LOCAL_SERVER = 'http://localhost:3001';
const PROD_SERVER = 'https://widow-spider-server.onrender.com';

const isLocal =
  window.location.hostname === 'localhost' ||
  window.location.hostname === '127.0.0.1';

export const SERVER_URL = isLocal ? LOCAL_SERVER : PROD_SERVER;

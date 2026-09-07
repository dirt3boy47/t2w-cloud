import { Container, getContainer } from '@cloudflare/containers';
import { env } from 'cloudflare:workers';

export class T2WContainer extends Container {
  defaultPort = 3000;
  sleepAfter = '30m';
  envVars = {
    DATABASE_URL: env.DATABASE_URL,
    DATABASE_SSL: 'true',
    DB_POOL_MAX: '4',
    SUPABASE_URL: env.SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY: env.SUPABASE_PUBLISHABLE_KEY,
    SUPABASE_SECRET_KEY: env.SUPABASE_SECRET_KEY,
    T2W_SESSION_SECRET: env.T2W_SESSION_SECRET,
    T2W_ADMIN_USER: env.T2W_ADMIN_USER || 'admin',
    T2W_ADMIN_PASS: env.T2W_ADMIN_PASS,
    T2W_ADMIN_FULL_NAME: env.T2W_ADMIN_FULL_NAME || 'Administrator',
    T2W_ADMIN_EMAIL: env.T2W_ADMIN_EMAIL || '',
    T2W_AUTH_DOMAIN: env.T2W_AUTH_DOMAIN || 't2w.invalid',
    T2W_AUTO_SEED: 'true',
    T2W_FRESH_START_ON_SEED: 'true',
    T2W_TRUST_PROXY: 'true',
    NODE_ENV: 'production',
    PORT: '3000',
  };
}

export default {
  async fetch(request, workerEnv) {
    return getContainer(workerEnv.T2W_CONTAINER, 't2w-primary').fetch(request);
  },
};

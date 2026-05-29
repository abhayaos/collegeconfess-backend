const Redis = require('ioredis');

const REDIS_URL = process.env.REDIS_URL;

let redis = null;
if (REDIS_URL) {
  try {
    redis = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => Math.min(times * 100, 3000),
      lazyConnect: true,
    });
    redis.on('error', () => { redis = null; });
  } catch {
    redis = null;
  }
}

const memoryCache = new Map();
const MEMORY_MAX = 200;
const MEMORY_TTL = 30000;

function get(key) {
  if (redis) {
    return redis.get(key).then((val) => (val ? JSON.parse(val) : null)).catch(() => null);
  }
  const entry = memoryCache.get(key);
  if (entry && Date.now() - entry.ts < MEMORY_TTL) return Promise.resolve(entry.data);
  memoryCache.delete(key);
  return Promise.resolve(null);
}

function set(key, data, ttl = 30) {
  if (redis) {
    return redis.setex(key, ttl, JSON.stringify(data)).catch(() => {});
  }
  memoryCache.set(key, { data, ts: Date.now() });
  if (memoryCache.size > MEMORY_MAX) {
    const oldest = memoryCache.keys().next().value;
    memoryCache.delete(oldest);
  }
  return Promise.resolve();
}

function del(key) {
  if (redis) {
    return redis.del(key).catch(() => {});
  }
  memoryCache.delete(key);
  return Promise.resolve();
}

async function delPattern(pattern) {
  if (redis) {
    const stream = redis.scanStream({ match: pattern, count: 100 });
    const pipeline = redis.pipeline();
    for await (const keys of stream) {
      if (keys.length) keys.forEach((k) => pipeline.del(k));
    }
    await pipeline.exec().catch(() => {});
    return;
  }
  for (const key of memoryCache.keys()) {
    if (key.startsWith(pattern.replace('*', ''))) memoryCache.delete(key);
  }
}

function isReady() {
  return redis ? redis.status === 'ready' : true;
}

module.exports = { get, set, del, delPattern, isReady };

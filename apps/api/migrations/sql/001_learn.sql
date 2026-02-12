services:
  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]

  api:
    build: ./apps/api
    ports: ["3000:3000"]
    environment:
      NODE_ENV: production
      PORT: 3000
      CORS_ORIGIN: "http://localhost:3001"
      SIWE_DOMAIN: "localhost"
      SIWE_URI_ALLOWLIST: "http://localhost:3001"
      SIWE_CHAIN_ALLOWLIST: "1,8453,137"
      SIWE_ISSUED_AT_MAX_AGE_SECONDS: 600
      JWT_SECRET: "change_me_change_me_change_me_change_me"
      SESSION_TTL_SECONDS: 3600
      COOKIE_NAME: "wundr_session"
      COOKIE_SECURE: "false"
      REDIS_URL: "redis://redis:6379"
    depends_on: [redis]

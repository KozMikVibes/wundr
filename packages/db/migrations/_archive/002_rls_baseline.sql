BEGIN;

-- Required session settings for RLS policies:
--   app.tenant_id (uuid)
--   app.user_id   (uuid)
--
-- We'll enforce tenant isolation now.
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Tenants: only visible if matches current tenant_id (strict)
CREATE POLICY tenants_isolation ON tenants
  USING (id = nullif(current_setting('app.tenant_id', true), '')::uuid);

-- Users: tenant isolation
CREATE POLICY users_tenant_isolation ON users
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

-- Profiles: join to users for tenant isolation
CREATE POLICY profiles_tenant_isolation ON user_profiles
  USING (
    EXISTS (
      SELECT 1
      FROM users u
      WHERE u.id = user_profiles.user_id
        AND u.tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM users u
      WHERE u.id = user_profiles.user_id
        AND u.tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
    )
  );

COMMIT;

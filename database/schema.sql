CREATE TABLE IF NOT EXISTS businesses (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  industry TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  email_verified BOOLEAN NOT NULL DEFAULT TRUE,
  verification_token_hash TEXT,
  verification_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS verification_token_hash TEXT;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS verification_expires_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS business_memberships (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, business_id)
);

INSERT INTO business_memberships (user_id, business_id)
SELECT id, business_id FROM users
ON CONFLICT (user_id, business_id) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_business_memberships_business
  ON business_memberships(business_id);

CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  contact TEXT,
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'warm', 'hot', 'cold')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE leads ADD COLUMN IF NOT EXISTS pipeline_stage TEXT NOT NULL DEFAULT 'new';

CREATE TABLE IF NOT EXISTS knowledge_base (
  id UUID PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS activity (
  id UUID PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  details TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_business
  ON users(business_id);

CREATE INDEX IF NOT EXISTS idx_leads_business
  ON leads(business_id);

CREATE INDEX IF NOT EXISTS idx_knowledge_business
  ON knowledge_base(business_id);

CREATE INDEX IF NOT EXISTS idx_activity_business
  ON activity(business_id);


-- Business-scoped reminders, follow-ups, meetings and tasks
CREATE TABLE IF NOT EXISTS reminders (
  id UUID PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  title VARCHAR(160) NOT NULL,
  description TEXT,
  type VARCHAR(20) NOT NULL DEFAULT 'follow_up'
    CHECK (type IN ('follow_up', 'meeting', 'task')),
  due_at TIMESTAMPTZ NOT NULL,
  priority VARCHAR(10) NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('low', 'medium', 'high')),
  status VARCHAR(15) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reminders_business_due
  ON reminders(business_id, due_at);

CREATE INDEX IF NOT EXISTS idx_reminders_assigned
  ON reminders(business_id, assigned_to, due_at);

-- Device subscriptions and idempotent background reminder delivery
CREATE TABLE IF NOT EXISTS reminder_push_subscriptions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  subscription JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reminder_push_user_business
  ON reminder_push_subscriptions(user_id, business_id);

CREATE TABLE IF NOT EXISTS reminder_push_deliveries (
  id UUID PRIMARY KEY,
  reminder_id UUID NOT NULL REFERENCES reminders(id) ON DELETE CASCADE,
  due_at TIMESTAMPTZ NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(reminder_id, due_at, user_id, endpoint)
);


-- Business-scoped AI automation rules and execution history
CREATE TABLE IF NOT EXISTS business_automations (
  id UUID PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  name VARCHAR(80) NOT NULL,
  trigger_event VARCHAR(40) NOT NULL DEFAULT 'lead.created',
  action_type VARCHAR(40) NOT NULL CHECK (action_type IN ('ai_qualify_lead','create_followup_reminder')),
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_business_automations_active
  ON business_automations(business_id,is_enabled);

CREATE TABLE IF NOT EXISTS business_automation_runs (
  id UUID PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  automation_id UUID NOT NULL REFERENCES business_automations(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  status VARCHAR(15) NOT NULL DEFAULT 'running'
    CHECK (status IN ('running','success','failed')),
  result JSONB,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  UNIQUE(automation_id,lead_id)
);
CREATE INDEX IF NOT EXISTS idx_automation_runs_business
  ON business_automation_runs(business_id,created_at DESC);


-- Business-specific Custom AI preferences
CREATE TABLE IF NOT EXISTS business_ai_settings (
  business_id UUID PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  instructions TEXT NOT NULL DEFAULT '',
  tone VARCHAR(20) NOT NULL DEFAULT 'professional',
  personality VARCHAR(500) NOT NULL DEFAULT '',
  language VARCHAR(40) NOT NULL DEFAULT 'Auto',
  welcome_message VARCHAR(500) NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- VikoP AI: Business API keys and webhooks
CREATE TABLE IF NOT EXISTS business_api_keys (
  id UUID PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name VARCHAR(80) NOT NULL,
  key_prefix VARCHAR(32) NOT NULL UNIQUE,
  key_hash CHAR(64) NOT NULL,
  scopes TEXT[] NOT NULL DEFAULT ARRAY['leads:read']::text[],
  expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_business_api_keys_business
  ON business_api_keys(business_id, created_at DESC);

CREATE TABLE IF NOT EXISTS business_webhooks (
  id UUID PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  endpoint_url TEXT NOT NULL,
  encrypted_secret TEXT NOT NULL,
  events TEXT[] NOT NULL DEFAULT ARRAY['lead.created']::text[],
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_business_webhooks_active
  ON business_webhooks(business_id, is_active);

CREATE TABLE IF NOT EXISTS business_webhook_deliveries (
  id UUID PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  webhook_id UUID NOT NULL REFERENCES business_webhooks(id) ON DELETE CASCADE,
  event_id UUID NOT NULL,
  event_type VARCHAR(60) NOT NULL,
  payload JSONB NOT NULL,
  status VARCHAR(15) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','sending','delivered','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  response_status INTEGER,
  response_body TEXT,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  sending_started_at TIMESTAMPTZ,
  UNIQUE(webhook_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_due
  ON business_webhook_deliveries(status, next_attempt_at);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_business
  ON business_webhook_deliveries(business_id, created_at DESC);

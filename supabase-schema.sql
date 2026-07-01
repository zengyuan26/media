-- ============================================================
-- Supabase Schema for 自媒体创作助手 v3.0
-- Run this in Supabase SQL Editor
-- ============================================================

-- ============================================================
-- TABLES
-- ============================================================

-- 用户资料表（简化版 v3.0）
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  biz_name TEXT DEFAULT '',
  onboarding_done BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 形象表
CREATE TABLE IF NOT EXISTS characters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT DEFAULT '主角',
  type TEXT DEFAULT 'protagonist',
  gender TEXT DEFAULT '',
  clothing TEXT DEFAULT '',
  age TEXT DEFAULT '',
  hair TEXT DEFAULT '',
  build TEXT DEFAULT '',
  features TEXT DEFAULT '',
  relationship TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 场景表
CREATE TABLE IF NOT EXISTS scenes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- API 配置表
CREATE TABLE IF NOT EXISTS api_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  api_key TEXT DEFAULT '',
  endpoint TEXT DEFAULT 'https://api.deepseek.com/v1',
  model TEXT DEFAULT 'deepseek-chat',
  custom_model TEXT DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 用户认证表（自定义认证）
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  phone TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_characters_user ON characters(user_id);
CREATE INDEX IF NOT EXISTS idx_scenes_user ON scenes(user_id);

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE characters ENABLE ROW LEVEL SECURITY;
ALTER TABLE scenes ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_configs ENABLE ROW LEVEL SECURITY;

-- Allow anon access (we use anon key with custom auth, not Supabase auth JWT)
CREATE POLICY "Allow all on profiles" ON profiles FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on characters" ON characters FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on scenes" ON scenes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on api_configs" ON api_configs FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- RPC FUNCTIONS
-- ============================================================

-- 注册
DROP FUNCTION IF EXISTS signup_user(TEXT, TEXT, TEXT) CASCADE;
DROP FUNCTION IF EXISTS signup_user(TEXT, TEXT) CASCADE;
CREATE OR REPLACE FUNCTION signup_user(
  p_username TEXT,
  p_password TEXT,
  p_phone TEXT DEFAULT ''
) RETURNS TABLE(user_id UUID) AS $$
DECLARE
  new_id UUID;
BEGIN
  IF EXISTS (SELECT 1 FROM users WHERE username = p_username) THEN
    RAISE EXCEPTION '用户名已存在';
  END IF;

  INSERT INTO users (username, password, phone) VALUES (p_username, p_password, p_phone)
  RETURNING users.id INTO new_id;

  user_id := new_id;
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 登录
DROP FUNCTION IF EXISTS login_user(TEXT, TEXT) CASCADE;
CREATE OR REPLACE FUNCTION login_user(
  p_username TEXT,
  p_password TEXT
) RETURNS TABLE(user_id UUID) AS $$
DECLARE
  uid UUID;
BEGIN
  SELECT id INTO uid FROM users WHERE username = p_username AND password = p_password;
  IF NOT FOUND THEN
    RAISE EXCEPTION '用户名或密码错误';
  END IF;

  user_id := uid;
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 重置密码
DROP FUNCTION IF EXISTS reset_password(TEXT, TEXT, TEXT) CASCADE;
CREATE OR REPLACE FUNCTION reset_password(
  p_username TEXT,
  p_phone TEXT,
  p_new_password TEXT
) RETURNS TABLE(user_id UUID) AS $$
DECLARE
  uid UUID;
BEGIN
  SELECT id INTO uid FROM users WHERE username = p_username AND phone = p_phone;
  IF NOT FOUND THEN
    RAISE EXCEPTION '用户名不存在或手机号不匹配';
  END IF;

  UPDATE users SET password = p_new_password, updated_at = NOW() WHERE users.id = uid;

  user_id := uid;
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

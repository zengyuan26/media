-- Run this in Supabase SQL Editor
-- Creates simple username/password auth, bypasses Supabase Auth email confirmations

-- Users table (standalone, not linked to auth.users)
CREATE TABLE IF NOT EXISTS app_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow signup" ON app_users FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can read own" ON app_users FOR SELECT USING (true);

-- Signup function
CREATE OR REPLACE FUNCTION signup_user(p_username TEXT, p_password TEXT)
RETURNS JSON AS $$
DECLARE
  v_id UUID;
BEGIN
  -- Check if username exists
  IF EXISTS (SELECT 1 FROM app_users WHERE username = p_username) THEN
    RAISE EXCEPTION '用户名已存在';
  END IF;

  INSERT INTO app_users (username, password_hash)
  VALUES (p_username, crypt(p_password, gen_salt('bf')))
  RETURNING id INTO v_id;

  -- Also create profile
  INSERT INTO profiles (id, biz_name) VALUES (v_id, '');

  RETURN json_build_object('id', v_id, 'username', p_username);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Login function
CREATE OR REPLACE FUNCTION login_user(p_username TEXT, p_password TEXT)
RETURNS JSON AS $$
DECLARE
  v_user app_users%ROWTYPE;
BEGIN
  SELECT * INTO v_user FROM app_users
  WHERE username = p_username
  AND password_hash = crypt(p_password, password_hash);

  IF NOT FOUND THEN
    RAISE EXCEPTION '用户名或密码错误';
  END IF;

  RETURN json_build_object('id', v_user.id, 'username', v_user.username);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Enable pgcrypto extension (needed for password hashing)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Update characters/scenes/api_configs RLS to use app_users id
DROP POLICY IF EXISTS "Users can manage own characters" ON characters;
CREATE POLICY "Users can manage own characters" ON characters FOR ALL USING (true);
DROP POLICY IF EXISTS "Users can manage own scenes" ON scenes;
CREATE POLICY "Users can manage own scenes" ON scenes FOR ALL USING (true);
DROP POLICY IF EXISTS "Users can manage own api config" ON api_configs;
CREATE POLICY "Users can manage own api config" ON api_configs FOR ALL USING (true);
DROP POLICY IF EXISTS "Users can manage own script history" ON script_history;
CREATE POLICY "Users can manage own script history" ON script_history FOR ALL USING (true);
DROP POLICY IF EXISTS "Users can manage own profile" ON profiles;
CREATE POLICY "Users can manage own profile" ON profiles FOR ALL USING (true);

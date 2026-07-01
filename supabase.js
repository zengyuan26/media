// ============================================================
// Supabase client & data layer
// Replace SUPABASE_URL and SUPABASE_ANON_KEY with your project
// ============================================================
var SUPABASE_URL = 'https://wqqjklomzyipwtfpackq.supabase.co';
var SUPABASE_ANON_KEY = 'sb_publishable_IuZHSBJx_GwH-6-kFNH6CA_TONgEt-Y';

var sb = null;
var sbUser = null;

function initSupabase() {
  if (typeof supabase !== 'undefined') {
    sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
}

// ============================================================
// AUTH (simple username/password via DB functions)
// ============================================================
async function sbSignUp(email, password, phone) {
  var r = await fetch(SUPABASE_URL + '/rest/v1/rpc/signup_user', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY },
    body: JSON.stringify({ p_username: email, p_password: password, p_phone: phone || '' })
  });
  if (!r.ok) { var e = await r.json(); throw new Error(e.message || '注册失败'); }
  var data = await r.json();
  return await sbSignIn(email, password);
}

async function sbSignIn(email, password) {
  var r = await fetch(SUPABASE_URL + '/rest/v1/rpc/login_user', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY },
    body: JSON.stringify({ p_username: email, p_password: password })
  });
  if (!r.ok) { var e = await r.json(); throw new Error(e.message || '用户名或密码错误'); }
  var data = await r.json();
  sbUser = { id: data.user_id, email: email };
  return data;
}

async function sbSignOut() { sbUser = null; }
async function sbGetSession() { return sbUser ? { user: sbUser } : null; }

// ============================================================
// PROFILE
// ============================================================
async function sbLoadProfile() {
  if (!sbUser) return null;
  if (!sb) return null;
  var _a, _b, _c;
  var r = await ((_a = sb) === null || _a === void 0 ? void 0 : _a.from('profiles').select('*').eq('id', sbUser.id).single());
  if (!r || r.error || !r.data) return null;
  var p = r.data;
  if (p.onboarding_done) localStorage.setItem('zimeiti-v3-onboarding-done', '1');
  return p;
}

async function sbSaveProfile() {
  if (!sbUser) return;
  var _a;
  await ((_a = sb) === null || _a === void 0 ? void 0 : _a.from('profiles').upsert({
    id: sbUser.id,
    onboarding_done: localStorage.getItem('zimeiti-v3-onboarding-done') === '1',
    updated_at: new Date().toISOString()
  }));
}

// ============================================================
// API CONFIG
// ============================================================
async function sbLoadApiConfig() {
  if (!sbUser) return;
  var _a, _b, _c, _d, _e;
  var r = await ((_a = sb) === null || _a === void 0 ? void 0 : _a.from('api_configs').select('*').eq('user_id', sbUser.id).single());
  if (r.data) {
    settings.apiKey = (_b = r.data.api_key) !== null && _b !== void 0 ? _b : '';
    settings.endpoint = (_c = r.data.endpoint) !== null && _c !== void 0 ? _c : 'https://api.deepseek.com/v1';
    settings.model = (_d = r.data.model) !== null && _d !== void 0 ? _d : 'deepseek-chat';
    settings.customModel = (_e = r.data.custom_model) !== null && _e !== void 0 ? _e : '';
    saveSettingsToStorage();
  }
  // If no cloud data, keep whatever is in localStorage — don't clear it
}

async function sbSaveApiConfig() {
  if (!sbUser) return;
  var _a;
  await ((_a = sb) === null || _a === void 0 ? void 0 : _a.from('api_configs').upsert({
    user_id: sbUser.id,
    api_key: settings.apiKey,
    endpoint: settings.endpoint,
    model: settings.model,
    custom_model: settings.customModel,
    updated_at: new Date().toISOString()
  }));
}

// ============================================================
// CHARACTERS
// ============================================================
async function sbLoadCharacters() {
  if (!sbUser) return;
  var _a;
  var r = await ((_a = sb) === null || _a === void 0 ? void 0 : _a.from('characters').select('*').eq('user_id', sbUser.id).order('created_at'));
  if (r.data) {
    characterProfiles = r.data.map(mapChar);
    saveCharacterProfiles();
  }
}

async function sbSaveCharacter(ch) {
  if (!sbUser) return;
  var _a;
  var _b, _c, _d, _e, _f, _g, _h, _j;
  var data = {
    user_id: sbUser.id,
    name: (_b = ch.name) !== null && _b !== void 0 ? _b : '',
    type: (_c = ch.type) !== null && _c !== void 0 ? _c : 'protagonist',
    gender: (_d = ch.gender) !== null && _d !== void 0 ? _d : '',
    clothing: (_e = ch.clothing) !== null && _e !== void 0 ? _e : '',
    age: (_f = ch.age) !== null && _f !== void 0 ? _f : '',
    hair: (_g = ch.hair) !== null && _g !== void 0 ? _g : '',
    build: (_h = ch.build) !== null && _h !== void 0 ? _h : '',
    features: (_j = ch.features) !== null && _j !== void 0 ? _j : '',
    relationship: ch.relationship || ''
  };
  if (ch.id && ch.id.length < 36) ch.id = undefined;
  await ((_a = sb) === null || _a === void 0 ? void 0 : _a.from('characters').upsert(Object.assign({ id: ch.id || undefined }, data)));
  await sbLoadCharacters();
}

async function sbDeleteCharacter(id) {
  if (!sbUser) return;
  var _a;
  await ((_a = sb) === null || _a === void 0 ? void 0 : _a.from('characters').delete().eq('id', id));
  await sbLoadCharacters();
}

function mapChar(c) {
  return {
    id: c.id, name: c.name, type: c.type, gender: c.gender,
    clothing: c.clothing, age: c.age || '', hair: c.hair || '',
    build: c.build || '', features: c.features || '', relationship: c.relationship || ''
  };
}

// ============================================================
// SCENES
// ============================================================
async function sbLoadScenes() {
  if (!sbUser) return;
  var _a;
  var r = await ((_a = sb) === null || _a === void 0 ? void 0 : _a.from('scenes').select('*').eq('user_id', sbUser.id).order('created_at'));
  if (r.data) {
    sceneProfiles = r.data.map(function(s) { return { id: s.id, name: s.name, description: s.description || '' }; });
    saveSceneProfiles();
  }
}

async function sbSaveScene(s) {
  if (!sbUser) return;
  var _a;
  await ((_a = sb) === null || _a === void 0 ? void 0 : _a.from('scenes').upsert({
    id: s.id && s.id.length > 20 ? s.id : undefined,
    user_id: sbUser.id,
    name: s.name,
    description: s.description || ''
  }));
  await sbLoadScenes();
}

async function sbDeleteScene(id) {
  if (!sbUser) return;
  var _a;
  await ((_a = sb) === null || _a === void 0 ? void 0 : _a.from('scenes').delete().eq('id', id));
  await sbLoadScenes();
}


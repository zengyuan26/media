// ============================================================
// UTILITY
// ============================================================
function copyToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
  return new Promise(function(resolve, reject) {
    var ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.left = '-9999px';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); resolve(); } catch(e) { reject(e); }
    document.body.removeChild(ta);
  });
}
function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function generateId() { return 'id_' + Math.random().toString(36).slice(2, 10); }

// ============================================================
// CONSTANTS
// ============================================================
var DEFAULT_SETTINGS = {
  apiKey: '',
  endpoint: 'https://api.deepseek.com/v1',
  model: 'deepseek-chat',
  customModel: ''
};

var INTERVIEW_QUESTIONS = [
  {
    id: 'type', type: 'single',
    question: '这是什么类型的视频？',
    options: [
      { value: '带货', icon: '🛒', label: '带货' },
      { value: '知识', icon: '📖', label: '知识' },
      { value: '搞笑', icon: '😂', label: '搞笑' },
      { value: '剧情', icon: '🎭', label: '剧情' },
      { value: '励志', icon: '💪', label: '励志' },
      { value: '生活技巧', icon: '🍳', label: '生活技巧' },
      { value: '其他', icon: '✨', label: '其他' }
    ]
  },
  {
    id: 'opening', type: 'single',
    question: '开头前3秒怎么抓住人？',
    options: [
      { value: '视觉冲击', icon: '😱', label: '视觉冲击' },
      { value: '抛问题', icon: '❓', label: '抛问题' },
      { value: '数据对比', icon: '📊', label: '数据对比' },
      { value: '制造冲突', icon: '😡', label: '制造冲突' },
      { value: '音乐卡点', icon: '🎵', label: '音乐卡点' },
      { value: '对话直入', icon: '🗣', label: '对话直入' }
    ],
    supplement: '补充：开头大致什么画面？（选填）'
  },
  {
    id: 'characters', type: 'single',
    question: '视频里有谁？',
    options: [
      { value: '一个人', icon: '👤', label: '一个人' },
      { value: '两个人', icon: '👥', label: '两个人' },
      { value: '多人', icon: '👨‍👩‍👧', label: '多人' },
      { value: '没有人物', icon: '🐱', label: '没有人物' }
    ],
    supplement: '补充：大概什么样的穿着打扮？（选填）'
  },
  {
    id: 'scene', type: 'double',
    question: '在哪拍的？什么感觉？',
    optionsA: [
      { value: '居家', icon: '🏠', label: '居家' },
      { value: '办公', icon: '🏢', label: '办公' },
      { value: '户外', icon: '🌳', label: '户外' },
      { value: '商铺', icon: '🛒', label: '商铺' },
      { value: '餐厅', icon: '🍽', label: '餐厅' }
    ],
    optionsB: [
      { value: '欢快', icon: '☀️', label: '欢快' },
      { value: '温馨', icon: '🌙', label: '温馨' },
      { value: '紧张', icon: '⚡', label: '紧张' },
      { value: '随意', icon: '😌', label: '随意' }
    ]
  },
  {
    id: 'content', type: 'free',
    question: '视频里发生了什么？',
    placeholder: '描述从头到尾发生了什么，或直接粘贴视频文案/解说词…'
  }
];

// ============================================================
// STATE
// ============================================================
var settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
var characterProfiles = [];
var sceneProfiles = [];
var isGenerating = false;
var abortController = null;
var editingCharId = null;

// Interview state
var interviewStep = 0;
var interviewAnswers = [];  // [{question, answer}, ...]

// Storyboard state
var currentStoryboard = null;  // the full storyboard JSON

// ============================================================
// PERSISTENCE
// ============================================================
function loadSettings() {
  try {
    var s = JSON.parse(localStorage.getItem('zimeiti-v3-settings'));
    if (s) { Object.keys(DEFAULT_SETTINGS).forEach(function(k) { if (s[k] !== undefined) settings[k] = s[k]; }); }
  } catch(e) {}
}

function saveSettingsToStorage() {
  try { localStorage.setItem('zimeiti-v3-settings', JSON.stringify(settings)); } catch(e) {}
}

function loadCharacterProfiles() {
  try { var c = JSON.parse(localStorage.getItem('zimeiti-v3-characters')); if (Array.isArray(c)) characterProfiles = c; } catch(e) {}
}
function saveCharacterProfiles() {
  try { localStorage.setItem('zimeiti-v3-characters', JSON.stringify(characterProfiles)); } catch(e) {}
}
function loadSceneProfiles() {
  try { var s = JSON.parse(localStorage.getItem('zimeiti-v3-scenes')); if (Array.isArray(s)) sceneProfiles = s; } catch(e) {}
}
function saveSceneProfiles() {
  try { localStorage.setItem('zimeiti-v3-scenes', JSON.stringify(sceneProfiles)); } catch(e) {}
}

// ============================================================
// INIT
// ============================================================
function init() {
  if (typeof initSupabase !== 'undefined') initSupabase();
  loadSettings();
  document.getElementById('loginPage').classList.remove('hidden');

  if (typeof sbGetSession !== 'undefined') {
    sbGetSession().then(function(session) {
      if (session) {
        sbUser = session.user;
        loadAllFromCloud().then(function() {
          applyAllSettings();
          renderCharacterList();
          updateAccountUI();
          dismissLoginPage();
        });
      }
    });
  }
  loadCharacterProfiles();
  loadSceneProfiles();
  loadRecords();
  applyAllSettings();
  bindEvents();
  renderCharacterList();
  updateAccountUI();

  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', function() {
      var vh = window.visualViewport.height;
      var wh = window.innerHeight;
      document.body.style.height = (wh - vh > 100) ? vh + 'px' : '';
    });
  }
}

// ============================================================
// TAB SYSTEM
// ============================================================
function switchTab(tabId) {
  document.querySelectorAll('.tab-panel').forEach(function(p) { p.classList.remove('active'); });
  document.querySelectorAll('.tab-item').forEach(function(t) { t.classList.remove('active'); });
  document.getElementById(tabId).classList.add('active');
  document.querySelector('.tab-item[data-tab="' + tabId + '"]').classList.add('active');
  if (tabId === 'tabMe') renderRecords();
}

// ============================================================
// SETTINGS SYNC
// ============================================================
function applyAllSettings() {
  var el;
  el = document.getElementById('meApiKey'); if (el) el.value = settings.apiKey || '';
  el = document.getElementById('meEndpoint'); if (el) el.value = settings.endpoint || '';
  el = document.getElementById('meModel'); if (el) { el.value = settings.model; updateCustomModel(); }
}

function updateCustomModel() {
  var modelEl = document.getElementById('meModel');
  var customField = document.getElementById('meCustomModelField');
  var customInput = document.getElementById('meCustomModel');
  if (modelEl && customField && customInput) {
    if (modelEl.value === 'custom') { customField.style.display = 'block'; customInput.value = settings.customModel || ''; }
    else { customField.style.display = 'none'; }
  }
}

function updateStopButton() {
  var btn = document.getElementById('btnStop');
  if (btn) btn.classList.toggle('visible', isGenerating);
}

// ============================================================
// CHARACTER MANAGEMENT
// ============================================================
function findCharById(id) {
  return characterProfiles.find(function(c) { return c.id === id; });
}

function renderCharacterList() {
  var el = document.getElementById('charCount');
  if (el) el.textContent = characterProfiles.length + '个';
}

function updateAccountUI() {
  renderCharacterList();
  var sceneEl = document.getElementById('sceneCount');
  if (sceneEl) sceneEl.textContent = sceneProfiles.length + '个';
}

function openCharacterManager() {
  document.getElementById('characterManagerOverlay').classList.add('open');
  renderCharManagerList();
}

function closeCharacterManager() {
  document.getElementById('characterManagerOverlay').classList.remove('open');
}

function renderCharManagerList() {
  var container = document.getElementById('charManagerList');
  if (!container) return;
  if (!characterProfiles.length) {
    container.innerHTML = '<div style="font-size:.76rem;color:#a09888;text-align:center;padding:24px 0">还没有形象，点击下方按钮创建</div>';
    updateAccountUI();
    return;
  }
  var html = '';
  characterProfiles.forEach(function(ch) {
    html += '<div class="mgr-item">';
    html += '<div class="mgr-item-avatar">' + (ch.gender === '男' ? '👨' : '👩') + '</div>';
    html += '<div class="mgr-item-info"><div class="mgr-item-name">' + escapeHtml(ch.name || '未命名') + '</div>';
    html += '<div class="mgr-item-detail">' + [ch.gender, ch.clothing].filter(Boolean).join(' · ') + '</div></div>';
    html += '<div class="mgr-item-actions">';
    html += '<button onclick="closeCharacterManager();openCharacterEditor(\'' + ch.id + '\')">编辑</button>';
    html += '<button onclick="deleteCharacterFromManager(\'' + ch.id + '\')" style="color:#e57373">删除</button>';
    html += '</div></div>';
  });
  container.innerHTML = html;
  updateAccountUI();
}

function deleteCharacterFromManager(id) {
  if (!confirm('确定删除这个形象？')) return;
  characterProfiles = characterProfiles.filter(function(c) { return c.id !== id; });
  saveCharacterProfiles();
  if (typeof sbDeleteCharacter !== 'undefined') sbDeleteCharacter(id);
  renderCharManagerList();
}

// Random character generation data
var RANDOM_CHAR = {
  clothing_m: ['白色T恤+深蓝牛仔裤', '灰色连帽卫衣+黑色工装裤', '藏青衬衫+卡其休闲裤', '黑色高领毛衣+深灰西裤', '军绿夹克+黑色牛仔裤', '浅蓝牛仔外套+白T+黑裤', '棕色皮夹克+深蓝牛仔', '灰白条纹衬衫+藏青西裤'],
  clothing_f: ['白色雪纺衬衫+卡其阔腿裤', '碎花连衣裙+米色开衫', '黑色高领衫+格纹短裙', '粉色卫衣+白色直筒裤', '浅蓝衬衫+深蓝A字裙', '米色风衣+白色T恤+牛仔裤', '酒红针织衫+黑色半身裙', '白衬衫+驼色烟管裤'],
  age: ['22岁', '25岁', '28岁', '30岁', '32岁', '35岁', '38岁', '40岁', '45岁', '26岁', '27岁'],
  hair_m: ['黑色短发·清爽碎盖', '黑色短发·三七分', '深棕短发·纹理烫', '黑色短发·寸头', '深棕中短发·微分', '黑色短发·背头'],
  hair_f: ['黑色齐肩发·内扣', '深棕长发·大波浪', '黑色长发·直发及腰', '浅棕短发·锁骨卷', '黑色中长发·低马尾', '深棕短发·波波头'],
  build: ['身高170，偏瘦', '身高165，匀称', '身高175，标准', '身高160，娇小', '身高180，高挑', '身高168，偏瘦', '身高172，标准', '身高163，匀称'],
  features: ['银色细框眼镜', '右手腕银手链', '左耳单颗耳钉', '黑色方框眼镜', '颈间细项链', '左手腕皮质手环', '无框眼镜·书卷气', '嘴角一颗小痣', '鼻梁细微雀斑', '右手无名指银色戒指']
};

function randomizeCharacter() {
  var genderEl = document.querySelector('#charEditGender .chip.active');
  var gender = genderEl ? genderEl.dataset.value : '男';
  var isMale = gender === '男';
  var suffix = isMale ? 'm' : 'f';

  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  var ageEl = document.getElementById('charEditAge');
  if (!ageEl.value) ageEl.value = pick(RANDOM_CHAR.age);
  document.getElementById('charEditClothing').value = pick(RANDOM_CHAR['clothing_' + suffix]);
  document.getElementById('charEditHair').value = pick(RANDOM_CHAR['hair_' + suffix]);
  document.getElementById('charEditBuild').value = pick(RANDOM_CHAR.build);
  document.getElementById('charEditFeatures').value = pick(RANDOM_CHAR.features);

  var btn = document.getElementById('btnRandomChar');
  if (btn) { btn.textContent = '🎲 重新随机'; }
}

async function aiGenerateCharacter() {
  var name = document.getElementById('charEditName').value.trim();
  var genderEl = document.querySelector('#charEditGender .chip.active');
  var gender = genderEl ? genderEl.dataset.value : '男';
  var age = document.getElementById('charEditAge').value.trim();

  if (!name && !age) { alert('请先填写形象名称和年龄'); return; }
  if (!settings.apiKey) { alert('请先配置 API Key'); return; }

  var btn = document.getElementById('btnAiChar');
  btn.textContent = '⏳ 生成中...';
  btn.disabled = true;

  try {
    var prompt = '请为"' + (name || '角色') + '"生成形象细节。性别：' + gender + '，年龄：' + (age || '成年人') + '。\n输出纯JSON：\n{"clothing":"服装描述（具体到款式和颜色）","hair":"发型发色","build":"体型身高","features":"标志特征（眼镜/饰品/痣/纹身等）"}';
    var text = await doStoryboardApiCall('你是人物造型设计师。输出纯JSON，不要markdown包裹。', prompt);
    var jsonText = collectStreamJson(text);
    if (!jsonText) throw new Error('解析失败');
    var data = JSON.parse(jsonText);
    document.getElementById('charEditClothing').value = data.clothing || '';
    document.getElementById('charEditHair').value = data.hair || '';
    document.getElementById('charEditBuild').value = data.build || '';
    document.getElementById('charEditFeatures').value = data.features || '';
  } catch(e) {
    alert('AI生成失败，改用随机');
    randomizeCharacter();
  }
  btn.textContent = '✨ AI 生成';
  btn.disabled = false;
}

function openCharacterEditor(charId) {
  editingCharId = charId || null;
  var ch = charId ? findCharById(charId) : null;
  document.getElementById('charEditorTitle').textContent = ch ? '编辑形象' : '新建形象';
  document.getElementById('charEditName').value = ch ? ch.name : '';
  document.getElementById('charEditClothing').value = ch ? ch.clothing || '' : '';
  document.getElementById('charEditAge').value = ch ? ch.age || '' : '';
  document.getElementById('charEditHair').value = ch ? ch.hair || '' : '';
  document.getElementById('charEditBuild').value = ch ? ch.build || '' : '';
  document.getElementById('charEditFeatures').value = ch ? ch.features || '' : '';

  var gender = ch ? ch.gender : '';
  document.querySelectorAll('#charEditGender .chip').forEach(function(c) { c.classList.toggle('active', c.dataset.value === gender); });

  document.getElementById('btnCharDelete').style.display = ch ? 'block' : 'none';
  document.getElementById('btnRandomChar').textContent = '🎲 随机';
  document.getElementById('charEditorOverlay').classList.add('open');
}

function closeCharacterEditor() {
  document.getElementById('charEditorOverlay').classList.remove('open');
  editingCharId = null;
}

function saveCharacterFromDialog() {
  var name = document.getElementById('charEditName').value.trim();
  var genderEl = document.querySelector('#charEditGender .chip.active');
  var gender = genderEl ? genderEl.dataset.value : '';
  var age = document.getElementById('charEditAge').value.trim();

  if (!name) { alert('请填写形象名称'); return; }
  if (!gender) { alert('请选择性别'); return; }
  if (!age) { alert('请填写年龄'); return; }

  var ch = {
    id: editingCharId || generateId(),
    name: name,
    type: 'protagonist', // default, no longer user-selectable
    gender: gender,
    clothing: document.getElementById('charEditClothing').value.trim(),
    age: document.getElementById('charEditAge').value.trim(),
    hair: document.getElementById('charEditHair').value.trim(),
    build: document.getElementById('charEditBuild').value.trim(),
    features: document.getElementById('charEditFeatures').value.trim(),
    relationship: ''
  };

  if (editingCharId) {
    var idx = characterProfiles.findIndex(function(c) { return c.id === editingCharId; });
    if (idx >= 0) characterProfiles[idx] = ch;
  } else {
    characterProfiles.push(ch);
  }
  saveCharacterProfiles();
  if (typeof sbSaveCharacter !== 'undefined') sbSaveCharacter(ch);
  closeCharacterEditor();
  renderCharManagerList();
}

function deleteCharacterFromDialog() {
  if (!editingCharId) return;
  if (!confirm('确定删除？')) return;
  characterProfiles = characterProfiles.filter(function(c) { return c.id !== editingCharId; });
  saveCharacterProfiles();
  if (typeof sbDeleteCharacter !== 'undefined') sbDeleteCharacter(editingCharId);
  closeCharacterEditor();
  renderCharManagerList();
}

// ============================================================
// SCENE MANAGEMENT
// ============================================================
function openSceneManager() {
  document.getElementById('sceneManagerOverlay').classList.add('open');
  renderSceneManagerList();
}

function closeSceneManager() {
  document.getElementById('sceneManagerOverlay').classList.remove('open');
}

// Scene random generation data
var RANDOM_SCENE = {
  env: ['简约现代风·干净整洁·自然光充足', '温馨居家风·柔和的灯光·生活气息', '工业风·水泥墙面·暖色吊灯', '日式简约·木质元素·柔和光线', '复古风格·暖色调·斑驳光影', '极简白墙·明亮通透·无影灯'],
  atmo: ['安静·专注', '温馨·放松', '活力·热闹', '浪漫·暧昧', '沉稳·专业', '轻松·愉快', '神秘·紧张'],
  light: ['暖色顶光 + 侧面窗户自然光', '冷色LED灯·均匀照明', '暖黄吊灯·局部阴影', '自然光从窗户45°照射', '侧逆光·轮廓柔和发光', '顶灯漫射·无硬阴影']
};

function randomScene() {
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  document.getElementById('newSceneEnv').value = pick(RANDOM_SCENE.env);
  document.getElementById('newSceneAtmo').value = pick(RANDOM_SCENE.atmo);
  document.getElementById('newSceneLight').value = pick(RANDOM_SCENE.light);
}

async function aiGenerateScene() {
  var name = document.getElementById('newSceneName').value.trim();
  if (!name) { alert('请先输入场景名称'); return; }
  if (!settings.apiKey) { alert('请先配置 API Key'); return; }

  var btn = document.getElementById('btnAiScene');
  btn.textContent = '⏳ 生成中...';
  btn.disabled = true;

  try {
    var prompt = '请描述一个"' + name + '"场景的拍摄环境。输出纯JSON：\n{"environment":"环境描述（1-2句话，包括空间特征和关键物品）","atmosphere":"氛围（2-4字+感受）","lighting":"光影特点（光源类型+方向+效果）"}';
    var text = await doStoryboardApiCall('你是影视场景设计师。输出纯JSON，不要markdown包裹。', prompt);
    var jsonText = collectStreamJson(text);
    if (!jsonText) throw new Error('解析失败');
    var data = JSON.parse(jsonText);
    document.getElementById('newSceneEnv').value = data.environment || '';
    document.getElementById('newSceneAtmo').value = data.atmosphere || '';
    document.getElementById('newSceneLight').value = data.lighting || '';
  } catch(e) {
    alert('AI生成失败，改用随机：' + (e.message || ''));
    randomScene();
  }
  btn.textContent = '✨ AI 生成';
  btn.disabled = false;
}

function renderSceneManagerList() {
  var container = document.getElementById('sceneManagerList');
  if (!container) return;
  if (!sceneProfiles.length) {
    container.innerHTML = '<div style="font-size:.76rem;color:#a09888;text-align:center;padding:24px 0">还没有场景</div>';
    updateAccountUI();
    return;
  }
  var html = '';
  sceneProfiles.forEach(function(s) {
    html += '<div class="mgr-item">';
    html += '<div class="mgr-item-avatar">🏠</div>';
    html += '<div class="mgr-item-info"><div class="mgr-item-name">' + escapeHtml(s.name || '未命名') + '</div>';
    html += '<div class="mgr-item-detail">' + escapeHtml([s.environment, s.atmosphere].filter(Boolean).join(' · ') || s.description || '') + '</div></div>';
    html += '<div class="mgr-item-actions">';
    html += '<button onclick="deleteSceneFromManager(\'' + s.id + '\')" style="color:#e57373">删除</button>';
    html += '</div></div>';
  });
  container.innerHTML = html;
  updateAccountUI();
}

function addSceneFromManager() {
  var name = document.getElementById('newSceneName').value.trim();
  if (!name) { alert('请输入场景名称'); return; }
  var s = {
    id: generateId(),
    name: name,
    description: '',
    environment: document.getElementById('newSceneEnv').value.trim(),
    atmosphere: document.getElementById('newSceneAtmo').value.trim(),
    lighting: document.getElementById('newSceneLight').value.trim()
  };
  sceneProfiles.push(s);
  saveSceneProfiles();
  if (typeof sbSaveScene !== 'undefined') sbSaveScene(s);
  document.getElementById('newSceneName').value = '';
  document.getElementById('newSceneEnv').value = '';
  document.getElementById('newSceneAtmo').value = '';
  document.getElementById('newSceneLight').value = '';
  renderSceneManagerList();
}

function deleteSceneFromManager(id) {
  if (!confirm('确定删除？')) return;
  sceneProfiles = sceneProfiles.filter(function(s) { return s.id !== id; });
  saveSceneProfiles();
  if (typeof sbDeleteScene !== 'undefined') sbDeleteScene(id);
  renderSceneManagerList();
}

// ============================================================
// LOGIN / AUTH
// ============================================================
function dismissLoginPage() {
  document.getElementById('loginPage').classList.add('hidden');
  switchTab('tabStoryboard');
  initInterview();
}

async function doLoginOrRegister(mode) {
  var username = document.getElementById('loginEmail').value.trim();
  var email = username.includes('@') ? username : username + '@user.app';
  var pass = document.getElementById('loginPassword').value;
  var phone = document.getElementById('loginPhone').value.trim();
  var errEl = document.getElementById('loginError');
  errEl.style.color = '#e57373';

  if (!email || pass.length < 6) {
    errEl.textContent = !email ? '请输入用户名' : '密码至少6位';
    errEl.style.display = 'block'; return;
  }
  if (mode === 'register') {
    if (!phone || !/^\d{11}$/.test(phone)) {
      errEl.textContent = '请输入11位手机号（用于找回密码）';
      errEl.style.display = 'block'; return;
    }
  }
  try {
    errEl.style.display = 'none';
    if (mode === 'register') {
      await sbSignUp(email, pass, phone);
      errEl.textContent = '✓ 注册成功！已自动登录';
      errEl.style.color = '#5b9a8b'; errEl.style.display = 'block';
    } else {
      await sbSignIn(email, pass);
    }
    // Backup current API config before resetting
    var prevApiKey = settings.apiKey;
    var prevEndpoint = settings.endpoint;
    var prevModel = settings.model;
    var prevCustomModel = settings.customModel;

    settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    characterProfiles = [];
    sceneProfiles = [];
    await loadAllFromCloud();

    // If cloud didn't restore API config, keep previous values
    if (!settings.apiKey && prevApiKey) {
      settings.apiKey = prevApiKey;
      settings.endpoint = prevEndpoint;
      settings.model = prevModel;
      settings.customModel = prevCustomModel;
    }

    applyAllSettings();
    renderCharacterList(); updateAccountUI();
    setTimeout(dismissLoginPage, mode === 'register' ? 500 : 0);
  } catch(e) {
    errEl.textContent = (mode === 'register' ? '注册' : '登录') + '失败：' + (e.message || '请检查用户名和密码');
    errEl.style.color = '#e57373'; errEl.style.display = 'block';
  }
}

// ============================================================
// PASSWORD RESET
// ============================================================
function showResetForm() {
  document.getElementById('loginForm').style.display = 'none';
  document.getElementById('resetPwdForm').style.display = 'flex';
  document.getElementById('loginError').style.display = 'none';
}

function showLoginForm() {
  document.getElementById('loginForm').style.display = 'flex';
  document.getElementById('resetPwdForm').style.display = 'none';
  document.getElementById('loginError').style.display = 'none';
}

async function doResetPassword() {
  var username = document.getElementById('resetEmail').value.trim();
  var phone = document.getElementById('resetPhone').value.trim();
  var newPass = document.getElementById('resetPassword').value;
  var errEl = document.getElementById('loginError');
  errEl.style.color = '#e57373';

  if (!username) { errEl.textContent = '请输入用户名'; errEl.style.display = 'block'; return; }
  if (!phone || !/^\d{11}$/.test(phone)) { errEl.textContent = '请输入11位手机号'; errEl.style.display = 'block'; return; }
  if (newPass.length < 6) { errEl.textContent = '新密码至少6位'; errEl.style.display = 'block'; return; }

  try {
    var r = await fetch(SUPABASE_URL + '/rest/v1/rpc/reset_password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY },
      body: JSON.stringify({ p_username: username.includes('@') ? username : username + '@user.app', p_phone: phone, p_new_password: newPass })
    });
    if (!r.ok) { var e = await r.json(); throw new Error(e.message || '重置失败'); }
    var data = await r.json();
    if (!data || !data.length) { errEl.textContent = '用户名不存在或手机号不匹配'; errEl.style.display = 'block'; return; }
    errEl.textContent = '✓ 密码已重置，请登录';
    errEl.style.color = '#5b9a8b'; errEl.style.display = 'block';
    document.getElementById('resetEmail').value = ''; document.getElementById('resetPhone').value = ''; document.getElementById('resetPassword').value = '';
    showLoginForm();
  } catch(e) {
    errEl.textContent = '重置失败：' + (e.message || '请重试');
    errEl.style.color = '#e57373'; errEl.style.display = 'block';
  }
}

// ============================================================
// CLOUD SYNC
// ============================================================
async function loadAllFromCloud() {
  if (!sb) return;
  try { await sbLoadProfile(); } catch(e) {}
  try { await sbLoadApiConfig(); } catch(e) {}
  try { await sbLoadCharacters(); } catch(e) {}
  try { await sbLoadScenes(); } catch(e) {}
}

// ============================================================
// INTERVIEW
// ============================================================
function initInterview() {
  if (currentStoryboard) return;
  interviewStep = 0;
  interviewAnswers = [];
  renderInterview();
}

function renderInterview() {
  var el = document.getElementById('sbInterview');
  var board = document.getElementById('sbBoard');
  if (!el || !board) return;

  if (interviewStep >= INTERVIEW_QUESTIONS.length) {
    generateStoryboard();
    return;
  }

  el.style.display = 'flex';
  board.style.display = 'none';

  var q = INTERVIEW_QUESTIONS[interviewStep];
  var prev = interviewAnswers[interviewStep];

  // Progress dots
  var dotsHtml = '';
  for (var i = 0; i < INTERVIEW_QUESTIONS.length; i++) {
    var cls = 'dot';
    if (i < interviewStep && interviewAnswers[i] && interviewAnswers[i].answer) cls += ' done';
    if (i === interviewStep) cls += ' active';
    dotsHtml += '<span class="' + cls + '"></span>';
  }
  document.getElementById('sbProgressDots').innerHTML = dotsHtml;

  // Question text
  document.getElementById('sbQuestion').textContent = q.question;

  // Show/hide sections based on question type
  var choiceGrid = document.getElementById('sbChoiceGrid');
  var choiceGridB = document.getElementById('sbChoiceGridB');
  var supplement = document.getElementById('sbSupplement');
  var freeInput = document.getElementById('sbFreeInput');

  if (q.type === 'free') {
    choiceGrid.style.display = 'none';
    choiceGridB.style.display = 'none';
    supplement.style.display = 'none';
    freeInput.style.display = 'flex';
    var ta = document.getElementById('sbAnswer');
    ta.placeholder = q.placeholder || '';
    ta.value = prev && prev.answer ? prev.answer : '';
  } else if (q.type === 'double') {
    choiceGrid.style.display = 'flex';
    choiceGridB.style.display = 'flex';
    supplement.style.display = 'none';
    freeInput.style.display = 'none';
    renderChoiceCards(choiceGrid, q.optionsA, prev, 'a');
    renderChoiceCards(choiceGridB, q.optionsB, prev, 'b');
  } else {
    // single
    choiceGrid.style.display = 'flex';
    choiceGridB.style.display = 'none';
    freeInput.style.display = 'none';
    if (q.supplement) {
      supplement.style.display = 'block';
      document.getElementById('sbSupplementLabel').textContent = q.supplement;
      document.getElementById('sbSupplementInput').value = prev && prev.supplement ? prev.supplement : '';
    } else {
      supplement.style.display = 'none';
    }
    renderChoiceCards(choiceGrid, q.options, prev, 'main');
  }

  // Navigation
  document.getElementById('btnPrevQ').disabled = interviewStep === 0;
  if (interviewStep >= INTERVIEW_QUESTIONS.length - 1) {
    document.getElementById('btnNextQ').textContent = '✨ 生成故事板';
  } else {
    document.getElementById('btnNextQ').textContent = '下一题 →';
  }
}

function renderChoiceCards(grid, options, prevAnswer, key) {
  var prevVal = prevAnswer && prevAnswer.answer ? prevAnswer.answer[key] || prevAnswer.answer : '';
  var html = '';
  options.forEach(function(opt) {
    var selected = prevVal === opt.value ? ' selected' : '';
    html += '<div class="sb-choice-card' + selected + '" data-key="' + key + '" data-value="' + opt.value + '" onclick="selectChoice(this)">';
    html += '<span class="card-icon">' + opt.icon + '</span>';
    html += '<span class="card-label">' + opt.label + '</span>';
    html += '</div>';
  });
  grid.innerHTML = html;
}

function selectChoice(card) {
  var grid = card.parentElement;
  // Deselect all in same grid
  grid.querySelectorAll('.sb-choice-card').forEach(function(c) { c.classList.remove('selected'); });
  card.classList.add('selected');
}

function nextQuestion() {
  var q = INTERVIEW_QUESTIONS[interviewStep];
  var answer;

  if (q.type === 'free') {
    var text = document.getElementById('sbAnswer').value.trim();
    if (!text) return;
    answer = text;
  } else if (q.type === 'double') {
    var selA = document.querySelector('#sbChoiceGrid .sb-choice-card.selected');
    var selB = document.querySelector('#sbChoiceGridB .sb-choice-card.selected');
    if (!selA || !selB) return;
    answer = { a: selA.dataset.value, b: selB.dataset.value };
  } else {
    // single
    var sel = document.querySelector('#sbChoiceGrid .sb-choice-card.selected');
    if (!sel) return;
    answer = sel.dataset.value;
    // Also save supplement if present
    var supp = document.getElementById('sbSupplementInput').value.trim();
    interviewAnswers[interviewStep] = {
      question: q.question,
      answer: answer,
      supplement: supp || ''
    };
    interviewStep++;
    if (interviewStep >= INTERVIEW_QUESTIONS.length) {
      generateStoryboard();
    } else {
      renderInterview();
    }
    return;
  }

  // For free and double types, save answer directly
  interviewAnswers[interviewStep] = { question: q.question, answer: answer };
  interviewStep++;
  if (interviewStep >= INTERVIEW_QUESTIONS.length) {
    generateStoryboard();
  } else {
    renderInterview();
  }
}

function prevQuestion() {
  // Save current answer before going back
  var q = INTERVIEW_QUESTIONS[interviewStep];
  if (q.type === 'free') {
    var text = document.getElementById('sbAnswer').value.trim();
    interviewAnswers[interviewStep] = { question: q.question, answer: text };
  } else if (q.type === 'double') {
    var selA = document.querySelector('#sbChoiceGrid .sb-choice-card.selected');
    var selB = document.querySelector('#sbChoiceGridB .sb-choice-card.selected');
    interviewAnswers[interviewStep] = {
      question: q.question,
      answer: {
        a: selA ? selA.dataset.value : '',
        b: selB ? selB.dataset.value : ''
      }
    };
  } else {
    var sel = document.querySelector('#sbChoiceGrid .sb-choice-card.selected');
    var supp = document.getElementById('sbSupplementInput').value.trim();
    interviewAnswers[interviewStep] = {
      question: q.question,
      answer: sel ? sel.dataset.value : '',
      supplement: supp || ''
    };
  }
  if (interviewStep > 0) {
    interviewStep--;
    renderInterview();
  }
}

// ============================================================
// GENERATION RECORDS
// ============================================================
var generationRecords = [];

function loadRecords() {
  try { var r = JSON.parse(localStorage.getItem('zimeiti-v3-records')); if (Array.isArray(r)) generationRecords = r; } catch(e) {}
}

function saveRecords() {
  try { localStorage.setItem('zimeiti-v3-records', JSON.stringify(generationRecords)); } catch(e) {}
}

function createRecord(answers) {
  var title = '';
  for (var i = 0; i < answers.length; i++) {
    if (answers[i] && answers[i].answer) { title = answers[i].answer.slice(0, 40); break; }
  }
  var record = {
    id: generateId(),
    title: title || '(空描述)',
    interviewAnswers: JSON.parse(JSON.stringify(answers)),
    status: 'generating',
    createdAt: new Date().toISOString(),
    storyboard: null
  };
  generationRecords.unshift(record);
  if (generationRecords.length > 20) generationRecords = generationRecords.slice(0, 20);
  saveRecords();
  return record;
}

function updateRecord(id, updates) {
  var idx = generationRecords.findIndex(function(r) { return r.id === id; });
  if (idx < 0) return;
  Object.keys(updates).forEach(function(k) { generationRecords[idx][k] = updates[k]; });
  saveRecords();
}

function renderRecords() {
  var container = document.getElementById('sbRecordList');
  if (!container) return;
  if (!generationRecords.length) {
    container.innerHTML = '<div style="font-size:.76rem;color:#a09888;text-align:center;padding:12px 0">暂无记录</div>';
    return;
  }
  var html = '';
  generationRecords.forEach(function(r) {
    var icon = r.status === 'completed' ? '✅' : '⏳';
    var statusText = r.status === 'completed' ? '已完成' : r.status === 'failed' ? '失败' : '进行中';
    var date = new Date(r.createdAt);
    var dateStr = (date.getMonth() + 1) + '/' + date.getDate() + ' ' + date.getHours() + ':' + String(date.getMinutes()).padStart(2, '0');
    html += '<div class="mgr-item" onclick="resumeRecord(\'' + r.id + '\')" style="cursor:pointer">';
    html += '<div class="mgr-item-avatar">' + icon + '</div>';
    html += '<div class="mgr-item-info"><div class="mgr-item-name">' + escapeHtml(r.title) + '</div>';
    html += '<div class="mgr-item-detail">' + dateStr + ' · ' + statusText + '</div></div>';
    html += '<div class="mgr-item-actions"><button onclick="event.stopPropagation();deleteRecord(\'' + r.id + '\')" style="color:#e57373">删除</button></div>';
    html += '</div>';
  });
  container.innerHTML = html;
}

function resumeRecord(id) {
  var record = generationRecords.find(function(r) { return r.id === id; });
  if (!record) return;

  if (record.status === 'completed' && record.storyboard) {
    if (!confirm('该记录已完成，查看生成的故事板？')) return;
    currentStoryboard = JSON.parse(JSON.stringify(record.storyboard));
    currentDirectorAnalysis = currentStoryboard.storyboard || currentStoryboard;
    document.getElementById('sbInterview').style.display = 'none';
    document.getElementById('sbBoard').style.display = 'flex';
    rerenderBoard();
    switchTab('tabStoryboard');
    return;
  }

  // Resume incomplete record
  if (!confirm('恢复这条记录，继续问答？')) return;
  interviewAnswers = JSON.parse(JSON.stringify(record.interviewAnswers));
  interviewStep = interviewAnswers.length;
  // If all questions were answered, go straight to generate
  if (interviewStep >= INTERVIEW_QUESTIONS.length) {
    switchTab('tabStoryboard');
    generateStoryboard();
  } else {
    currentStoryboard = null;
    document.getElementById('sbInterview').style.display = 'flex';
    document.getElementById('sbBoard').style.display = 'none';
    switchTab('tabStoryboard');
    renderInterview();
  }
}

function deleteRecord(id) {
  if (!confirm('删除这条记录？')) return;
  generationRecords = generationRecords.filter(function(r) { return r.id !== id; });
  saveRecords();
  renderRecords();
}

// ============================================================
// VOICE INPUT
// ============================================================
var recognition = null;
var isRecording = false;
var voiceFullText = '';      // accumulated text across pauses
var voiceInterimText = '';  // current interim (unconfirmed) text

function setupVoiceRecognition() {
  var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return;
  recognition = new SpeechRecognition();
  recognition.lang = 'zh-CN';
  recognition.continuous = true;
  recognition.interimResults = true;

  recognition.onresult = function(event) {
    var finalText = '';
    var interimText = '';
    for (var i = event.resultIndex; i < event.results.length; i++) {
      var r = event.results[i];
      if (r.isFinal) {
        finalText += r[0].transcript;
      } else {
        interimText += r[0].transcript;
      }
    }

    // Accumulate final recognized text
    if (finalText) {
      // Apply sentence breaks: add newline after 。！？… —
      var formatted = finalText.replace(/([。！？…—])\s*/g, '$1\n');
      voiceFullText += formatted;
      voiceInterimText = '';
    }
    if (interimText) {
      voiceInterimText = interimText;
    }

    var el = document.getElementById('sbAnswer');
    if (el) el.value = voiceFullText + voiceInterimText;
  };

  recognition.onend = function() {
    // If user hasn't clicked stop, auto-restart after pause
    if (isRecording) {
      try {
        recognition.start();
        return;
      } catch(e) {}
    }
    // User manually stopped
    var btn = document.getElementById('btnVoice');
    var hint = document.getElementById('voiceHint');
    if (btn) btn.classList.remove('recording');
    if (hint) hint.textContent = '点击麦克风开始说话';
  };

  recognition.onerror = function(event) {
    if (event.error === 'no-speech') {
      // Silence — auto-restart if still recording
      if (isRecording) {
        try { setTimeout(function() { if (isRecording) recognition.start(); }, 200); } catch(e) {}
      }
      return;
    }
    isRecording = false;
    var btn = document.getElementById('btnVoice');
    var hint = document.getElementById('voiceHint');
    if (btn) btn.classList.remove('recording');
    if (event.error === 'not-allowed' || event.error === 'permission-denied') {
      if (hint) hint.textContent = '麦克风权限未授权，请用文字输入';
      if (btn) btn.disabled = true;
    } else if (event.error !== 'aborted') {
      if (hint) hint.textContent = '识别出错，请重试或使用文字输入';
    }
  };
}

function toggleVoiceInput() {
  if (!recognition) { alert('语音输入不可用'); return; }
  var btn = document.getElementById('btnVoice');
  var hint = document.getElementById('voiceHint');
  if (!isRecording) {
    try {
      // Preserve existing text in textarea
      var el = document.getElementById('sbAnswer');
      voiceFullText = (el && el.value) ? el.value : '';
      voiceInterimText = '';
      recognition.start();
      isRecording = true;
      if (btn) btn.classList.add('recording');
      if (hint) hint.textContent = '正在聆听…再点停止';
    } catch(e) {
      if (hint) hint.textContent = '启动语音失败，请用文字输入';
    }
  } else {
    isRecording = false;
    recognition.stop();
    // Flush interim text
    var el2 = document.getElementById('sbAnswer');
    if (el2 && voiceInterimText) {
      el2.value = voiceFullText + voiceInterimText;
      voiceFullText = el2.value;
      voiceInterimText = '';
    }
    if (btn) btn.classList.remove('recording');
    if (hint) hint.textContent = '点击麦克风开始说话';
  }
}

// ============================================================
// STORYBOARD — GENERATION
// ============================================================
// Phase 1: director analysis only
function buildDirectorSystemPrompt() {
  return '你是短视频导演助手。根据用户对爆款视频的描述，输出导演分析 JSON。\n\n' +
    '## 输出格式（所有字段必填，不得为空）\n\n' +
    '{\n' +
    '  "directorAnalysis": {\n' +
    '    "title": "吸引人的标题",\n' +
    '    "totalDuration": "预估总时长。短视频通常10-15秒，不要超过20秒（必填）",\n' +
    '    "directorBrief": {\n' +
    '      "coreIdea": "核心创意一句话：这个视频讲什么、为什么能火（必填）",\n' +
    '      "hookDesign": "前3秒钩子设计：具体画面是什么 + 为什么能抓住人（必填）",\n' +
    '      "emotionalTone": "情绪基调：整体色彩倾向/节奏感/语气风格，如 暖黄色调·快节奏·压迫感旁白（必填）",\n' +
    '      "visualReference": "视觉参考：像哪个账号/电影/摄影师的风格，如 日系生活美学·滨田英明风·低饱和暖调（必填）",\n' +
    '      "keyFrames": ["必须出现的核心画面1", "核心画面2", "核心画面3"]\n' +
    '    }\n' +
    '  }\n' +
    '}\n\n' +
    '## 硬性要求\n' +
    '- totalDuration 控制在10-15秒，除非用户明确描述了更长内容\n' +
    '- keyFrames 至少 3 个，是具体的画面描述，不是抽象概念\n' +
    '- hookDesign 要说清楚前3秒的画面内容，不是"用悬念吸引"这种空话\n' +
    '- visualReference 要具体到风格/摄影师/账号名，不要写"现代简约"\n' +
    '- 纯 JSON 输出，不要 ```json``` 包裹';
}

// Phase 2: shots based on confirmed director analysis
function buildShotsSystemPrompt() {
  var da = currentDirectorAnalysis || {};
  var db = da.directorBrief || {};
  var charList = characterProfiles.map(function(c) {
    return '- ' + c.id + ': ' + c.name + ' (' + c.type + ', ' + [c.gender, c.clothing].filter(Boolean).join(', ') + ')';
  }).join('\n');
  var sceneList = sceneProfiles.map(function(s) {
    return '- ' + s.id + ': ' + s.name + ' (' + [s.environment, s.atmosphere, s.lighting].filter(Boolean).join(' | ') + ')';
  }).join('\n');

  return '你是短视频导演助手。根据已确认的导演分析，生成分镜脚本 JSON。\n\n' +
    '## 已确认的导演分析\n' +
    '标题：' + (da.title || '') + '\n' +
    '总时长：' + (da.totalDuration || '') + '\n' +
    '核心创意：' + (db.coreIdea || '') + '\n' +
    '钩子设计：' + (db.hookDesign || '') + '\n' +
    '情绪基调：' + (db.emotionalTone || '') + '\n' +
    '视觉参考：' + (db.visualReference || '') + '\n' +
    '关键画面：' + ((db.keyFrames || []).join(' / ')) + '\n' +
    (keyProps ? '关键道具（必须出现在镜头中）：' + keyProps + '\n' : '') + '\n' +
    '## 运镜手法参考（必须从中选用具体运镜名称）\n' +
    '推镜：缓推 dolly in（逐渐靠近）/ 快推 crash zoom（猛然推进）\n' +
    '拉镜：缓拉 dolly out（逐渐远离）/ 急拉 whip out（快速后退）\n' +
    '摇镜：横摇 pan（水平扫视）/ 纵摇 tilt（上下扫视）\n' +
    '移镜：横移 truck（侧面平移）/ 跟移 tracking（跟随主体移动）\n' +
    '升降：上升 pedestal up / 下降 pedestal down\n' +
    '手持：手持晃动 handheld shake / 呼吸感 handheld float\n' +
    '固定：固定机位 static / 微动 subtle drift\n' +
    '特殊：俯拍 overhead / 仰拍 low angle / 过肩 OTS / POV 主观视角\n\n' +
    '## 输出格式\n' +
    '{\n' +
    '  "shots": [\n' +
    '    {\n' +
    '      "id": "shot_1",\n' +
    '      "duration": "时间范围",\n' +
    '      "shotType": "景别（大远景/远景/全景/中景/近景/特写/大特写）",\n' +
    '      "subjects": [{"characterId": "", "characterName": "角色描述", "position": "画面位置", "direction": "朝向", "additionalDesc": "表情/状态"}],\n' +
    '      "action": "具体动作（必填）",\n' +
    '      "scene": {"sceneId": "", "sceneName": "场景", "environment": "环境细节", "atmosphere": "氛围"},' +
    '      "lighting": {"type": "光影类型（自然光/暖色侧光/冷色顶光/逆光剪影/柔光漫射/硬光高对比）", "direction": "光源方向"},\n' +
    '      "camera": {"movement": "运镜（从运镜手法参考中选）", "focalLength": "焦段（24mm/35mm/50mm/85mm/135mm）", "angle": "角度（平视/俯拍/仰拍/45°侧拍）"},\n' +
    '      "style": {"visualStyle": "视觉风格"},' +
    '      "quality": {"resolution": "4K", "fps": 60},\n' +
    '      "dialogue": "台词（无则填\\"\\"）",\n' +
    '      "emotionBeat": "本镜的情绪节点"\n' +
    '    }\n' +
    '  ]\n' +
    '}\n\n' +
    '## 硬性要求\n' +
    '- 所有镜头的 duration 总和必须等于视频总时长：' + (da.totalDuration || '15s') + '。每个镜头2-5秒为宜\n' +
    '- 镜头数3-5个，总时长越短镜头越少\n' +
    '- 每个镜头的 action 必须具体到身体动作和物体变化，不要写"进行展示"这种空话\n' +
    '- 运镜必须从运镜手法参考中选择，写出完整名称如"缓推 dolly in"\n' +
    '- 焦段根据景别选择：特写85mm+，近景50mm，中景35mm，全景24mm\n' +
    '- 第2镜起必填 continuity：{"transition":"硬切/叠化/甩镜头/匹配剪辑","carryOver":["延续元素"],"newElements":["新元素"],"eyeLine":"视线方向变化","actionLink":"动作因果关系","emotionLink":"情绪变化","cameraLink":"运镜对比"}\n' +
    '- 纯 JSON 输出，不要 ```json``` 包裹\n\n' +
    '## 可用资源\n' +
    '角色库：\n' + (charList || '（空）') + '\n' +
    '场景库：\n' + (sceneList || '（空）') + '\n';
}

// Phase 1 normalize
function normalizeDirectorAnalysis(data) {
  var da = data;
  da.title = da.title || '精彩短视频';
  da.totalDuration = da.totalDuration || '30s';
  var db = da.directorBrief = da.directorBrief || {};
  db.coreIdea = db.coreIdea || da.title || '精彩短视频';
  db.hookDesign = db.hookDesign || '前3秒用强视觉冲击或反常识画面抓住注意力';
  db.emotionalTone = db.emotionalTone || '中性色调·中速节奏·自然语气';
  db.visualReference = db.visualReference || '现代短视频风格·干净利落的画面';
  if (!Array.isArray(db.keyFrames) || db.keyFrames.length === 0) {
    db.keyFrames = ['开场关键画面', '核心内容展示画面', '结尾收束画面'];
  }
}

// Phase 2: generate shots after director confirmed
async function generateShots() {
  console.log('[generateShots] CALLED, apiKey:', settings.apiKey ? 'yes' : 'no');
  if (!settings.apiKey) {
    alert('请先在「我的」→ 设置 中配置 API Key');
    return;
  }

  isGenerating = true;
  updateStopButton();

  // Switch to loading page immediately
  var board = document.getElementById('sbBoard');
  board.innerHTML = '<div style="text-align:center;padding:80px 20px;color:#8a8278"><div style="font-size:3rem;margin-bottom:16px">🎥</div><div style="font-size:.95rem;font-weight:600;margin-bottom:8px">AI 正在生成分镜脚本…</div><div style="font-size:.72rem">基于导演分析逐镜拆解</div></div>';

  try {
    console.log('[generateShots] building prompts...');
    var systemPrompt = buildShotsSystemPrompt();
    console.log('[generateShots] systemPrompt length:', systemPrompt.length);
    var userPrompt = '请根据以上导演分析生成分镜脚本。';
    console.log('[generateShots] calling API...');
    var streamText = await doStoryboardApiCall(systemPrompt, userPrompt);
    console.log('[generateShots] API returned, length:', streamText.length);
    console.log('[generateShots] raw text:', streamText.slice(0, 300));

    var jsonText = collectStreamJson(streamText);
    if (!jsonText) {
      console.log('[generateShots] PARSE FAILED, raw:', streamText);
      throw new Error('未能解析分镜JSON（查看Console看原始返回）');
    }
    console.log('[generateShots] parsed jsonText:', jsonText.slice(0, 200));

    var data = JSON.parse(jsonText);
    var shots = Array.isArray(data) ? data : (data.shots || []);
    if (!Array.isArray(shots) || shots.length === 0) throw new Error('分镜数据为空，返回了' + JSON.stringify(data).slice(0, 100));

    currentDirectorAnalysis.shots = shots;
    normalizeShots(currentDirectorAnalysis);
    currentStoryboard = { storyboard: currentDirectorAnalysis };
    updateRecord(activeRecordId, { status: 'completed', storyboard: JSON.parse(JSON.stringify(currentStoryboard)) });

    renderShotsPage();
  } catch(e) {
    console.error('[generateShots] error:', e.message || e);
    board.innerHTML =
      '<div style="text-align:center;padding:60px 20px;color:#e57373">' +
      '<div style="font-size:2.5rem;margin-bottom:12px">⚠️</div>' +
      '<div style="font-weight:600;margin-bottom:8px">分镜生成失败</div>' +
      '<div style="font-size:.78rem;margin-bottom:20px;color:#8a8278">' + escapeHtml(e.message || '未知错误') + '</div>' +
      '<button class="dialog-btn secondary" onclick="renderDirectorReview()" style="margin-right:8px">← 返回导演分析</button>' +
      '<button class="dialog-btn primary" onclick="generateShots()">🔄 重试</button>' +
      '</div>';
  }

  isGenerating = false;
  updateStopButton();
}

function normalizeShots(da) {
  (da.shots || []).forEach(function(shot, i) {
    shot.id = shot.id || ('shot_' + (i + 1));
    shot.duration = shot.duration || '';
    shot.shotType = shot.shotType || '中景';
    shot.subjects = Array.isArray(shot.subjects) && shot.subjects.length ? shot.subjects : [{ characterId: '', characterName: '', position: '', direction: '', additionalDesc: '' }];
    shot.action = shot.action || '';
    shot.scene = shot.scene || { sceneId: '', sceneName: '', environment: '', atmosphere: '' };
    shot.lighting = shot.lighting || { type: '', direction: '' };
    shot.camera = shot.camera || { movement: '', focalLength: '', angle: '' };
    shot.style = shot.style || { visualStyle: '' };
    shot.quality = shot.quality || { resolution: '4K', fps: 60 };
    shot.dialogue = shot.dialogue || '';
    shot.emotionBeat = shot.emotionBeat || '';
    if (i > 0 && !shot.continuity) {
      shot.continuity = { transition: '硬切', carryOver: [], newElements: [], eyeLine: '', actionLink: '', emotionLink: '', cameraLink: '' };
    }
  });
}

// ============================================================
// STORYBOARD — RENDER (Phase 1: Director Review)
// ============================================================
function renderDirectorReview() {
  var board = document.getElementById('sbBoard');
  var da = currentDirectorAnalysis;
  if (!da || !board) return;
  var db = da.directorBrief || {};
  var kf = db.keyFrames || [];

  var html = '';

  // Title + duration
  html += '<div style="text-align:center;padding:8px 0 6px"><span style="font-size:1.15rem;font-weight:700">🎬 ' + escapeHtml(da.title || '未命名') + '</span><span style="font-size:.72rem;color:#8a8278;margin-left:8px">' + escapeHtml(da.totalDuration || '') + '</span></div>';

  // Confirm buttons
  html += '<div style="text-align:center;padding:4px 0 12px">';
  html += '<button class="dialog-btn secondary" onclick="resetToInterview()" style="margin-right:8px;font-size:.78rem;padding:8px 20px">🔄 重新来</button>';
  html += '<button class="dialog-btn primary" id="btnConfirmDirector" onclick="generateShots()" style="font-size:.88rem;padding:10px 32px">确认，生成分镜 ✨</button>';
  html += '</div>';

  // Director brief card
  html += '<div class="sb-section">';
  html += '<div class="sb-section-header"><span>📋 导演分析</span></div>';
  html += '<div class="sb-section-body">';
  html += '<div class="sb-director-brief">';

  html += '<div class="da-field"><span class="da-label">💡 核心创意</span>';
  html += '<p>' + escapeHtml(db.coreIdea || '') + '</p></div>';

  html += '<div class="da-field"><span class="da-label">🪝 钩子设计</span>';
  html += '<p>' + escapeHtml(db.hookDesign || '') + '</p></div>';

  html += '<div class="da-field"><span class="da-label">🎨 情绪基调</span>';
  html += '<p>' + escapeHtml(db.emotionalTone || '') + '</p></div>';

  html += '<div class="da-field"><span class="da-label">📸 视觉参考</span>';
  html += '<p>' + escapeHtml(db.visualReference || '') + '</p></div>';

  html += '<div class="da-field"><span class="da-label">🖼 关键画面</span>';
  html += '<ol style="margin:4px 0 0 16px;font-size:.82rem;line-height:1.7">';
  kf.forEach(function(f) {
    html += '<li>' + escapeHtml(f) + '</li>';
  });
  html += '</ol></div>';

  html += '</div></div></div>';

  board.innerHTML = html;
  board.style.display = 'flex';
}

function rerenderBoard() {
  if (currentDirectorAnalysis && currentDirectorAnalysis.shots && currentDirectorAnalysis.shots.length > 0) {
    renderShotsPage();
  } else {
    renderDirectorReview();
  }
}

// Shot gallery state
var galleryIndex = 0;

function changeGallery(dir) {
  var shots = (currentDirectorAnalysis || {}).shots || [];
  var newIdx = galleryIndex + dir;
  if (newIdx < 0 || newIdx >= shots.length) return;
  galleryIndex = newIdx;
  renderGallerySlide();
}

function goGallery(idx) {
  var shots = (currentDirectorAnalysis || {}).shots || [];
  if (idx < 0 || idx >= shots.length) return;
  galleryIndex = idx;
  renderGallerySlide();
}

function renderGallerySlide() {
  var container = document.getElementById('sbShotCard');
  var dots = document.getElementById('sbGalleryDots');
  var counter = document.getElementById('sbGalleryCounter');
  var prevBtn = document.getElementById('sbGalleryPrev');
  var nextBtn = document.getElementById('sbGalleryNext');
  var da = currentDirectorAnalysis || {};
  var shots = da.shots || [];
  if (!container || !shots.length) return;

  container.innerHTML = renderOneShotCard(shots[galleryIndex], galleryIndex);

  // Update dots
  if (dots) {
    var dotsHtml = '';
    for (var i = 0; i < shots.length; i++) {
      dotsHtml += '<span class="gallery-dot' + (i === galleryIndex ? ' active' : '') + '" onclick="goGallery(' + i + ')"></span>';
    }
    dots.innerHTML = dotsHtml;
  }

  // Update emotion flow items
  for (var i = 0; i < shots.length; i++) {
    var item = document.getElementById('emotionItem' + i);
    if (item) item.classList.toggle('active', i === galleryIndex);
  }

  if (counter) counter.textContent = '第 ' + (galleryIndex + 1) + '/' + shots.length + ' 镜';
  if (prevBtn) prevBtn.disabled = galleryIndex === 0;
  if (nextBtn) nextBtn.disabled = galleryIndex >= shots.length - 1;
}

// Standalone shots page with gallery
function renderShotsPage() {
  var board = document.getElementById('sbBoard');
  var da = currentDirectorAnalysis;
  if (!da || !board) return;
  var shots = da.shots || [];
  galleryIndex = 0;

  var html = '';

  // Header
  html += '<div class="sb-shots-header">';
  html += '<button class="sb-nav-btn secondary" onclick="renderDirectorReview()" style="font-size:.72rem;padding:6px 14px">← 导演分析</button>';
  html += '<span style="font-weight:700;font-size:.85rem;flex:1;text-align:center">🎥 ' + escapeHtml(da.title || '分镜') + '</span>';
  html += '<span style="font-size:.68rem;color:#8a8278">' + escapeHtml(da.totalDuration || '') + ' · ' + shots.length + '镜</span>';
  html += '</div>';

  // Emotion flow strip
  html += '<div class="emotion-flow">';
  shots.forEach(function(shot, i) {
    html += '<span class="emotion-flow-item' + (i === 0 ? ' active' : '') + '" onclick="goGallery(' + i + ')" id="emotionItem' + i + '">' + escapeHtml(shot.emotionBeat || '第'+(i+1)+'镜') + '</span>';
    if (i < shots.length - 1) {
      var trans = (shot.continuity && shot.continuity.transition) ? shot.continuity.transition : '→';
      html += '<span class="emotion-flow-arrow">' + escapeHtml(trans) + '</span>';
    }
  });
  html += '</div>';

  // Gallery navigation
  html += '<div class="gallery-nav">';
  html += '<button class="gallery-arrow" id="sbGalleryPrev" onclick="changeGallery(-1)" disabled>◀</button>';
  html += '<div class="gallery-viewport" id="sbShotCard">' + renderOneShotCard(shots[0], 0) + '</div>';
  html += '<button class="gallery-arrow" id="sbGalleryNext" onclick="changeGallery(1)" ' + (shots.length < 2 ? 'disabled' : '') + '>▶</button>';
  html += '</div>';

  // Counter + dots
  html += '<div style="text-align:center;padding:4px 0">';
  html += '<span id="sbGalleryCounter" style="font-size:.72rem;color:#8a8278">第 1/' + shots.length + ' 镜</span>';
  html += '</div>';
  html += '<div class="gallery-dots" id="sbGalleryDots">';
  for (var i = 0; i < shots.length; i++) {
    html += '<span class="gallery-dot' + (i === 0 ? ' active' : '') + '" onclick="goGallery(' + i + ')"></span>';
  }
  html += '</div>';

  // Primary actions
  html += '<div class="sb-actions-bar" style="border-top:1px solid #f0ece4;padding-top:10px">';
  html += '<button class="sb-action-btn" onclick="replaceAllCharacters()">🔄 换角色</button>';
  html += '<button class="sb-action-btn" onclick="replaceAllScenes()">🏠 换场景</button>';
  html += '<button class="sb-action-btn" onclick="replaceKeyProps()">📦 换道具</button>';
  html += '<button class="sb-action-btn primary" onclick="generateShots()">🎬 重新生成</button>';
  html += '<button class="sb-action-btn" onclick="openShotEditor(galleryIndex)" style="font-size:.68rem">···</button>';
  html += '</div>';

  // Export
  html += '<div style="display:flex;gap:6px;padding:6px 0 10px;justify-content:flex-end">';
  html += '<button class="dialog-btn secondary" onclick="exportStoryboardPrompts()" style="font-size:.65rem;padding:6px 10px">📋 提示词</button>';
  html += '<button class="dialog-btn secondary" onclick="exportStoryboardJson()" style="font-size:.65rem;padding:6px 10px">📋 JSON</button>';
  html += '<button class="dialog-btn secondary" onclick="resetToInterview()" style="font-size:.65rem;padding:6px 10px">🔄 重新开始</button>';
  html += '</div>';

  board.innerHTML = html;
  board.style.display = 'flex';
}

function buildStoryboardPrompt() {
  var type = '', opening = '', openingSupp = '', characters = '', charSupp = '';
  var scene = '', mood = '', content = '';

  interviewAnswers.forEach(function(a) {
    if (!a) return;
    var q = INTERVIEW_QUESTIONS.find(function(x) { return x.question === a.question; });
    if (!q) return;

    switch (q.id) {
      case 'type':
        type = typeof a.answer === 'string' ? a.answer : '';
        break;
      case 'opening':
        opening = typeof a.answer === 'string' ? a.answer : '';
        openingSupp = a.supplement || '';
        break;
      case 'characters':
        characters = typeof a.answer === 'string' ? a.answer : '';
        charSupp = a.supplement || '';
        break;
      case 'scene':
        if (a.answer && typeof a.answer === 'object') {
          scene = a.answer.a || '';
          mood = a.answer.b || '';
        }
        break;
      case 'content':
        content = typeof a.answer === 'string' ? a.answer : '';
        break;
    }
  });

  // Build natural language summary
  var info = [];
  info.push('视频类型：' + (type || '未知'));
  info.push('开头钩子：' + (opening || '未知') + (openingSupp ? '（画面补充：' + openingSupp + '）' : ''));
  info.push('人物情况：' + (characters || '未知') + (charSupp ? '（穿着打扮：' + charSupp + '）' : ''));
  info.push('场景：' + (scene || '未知') + ' | 氛围：' + (mood || '未知'));

  var lines = info.join('\n');

  if (content) {
    lines += '\n\n视频内容描述（用户自由输入）：\n' + content;
  }

  lines += '\n\n## 重要约束\n';
  lines += '- 视频风格和节奏必须匹配' + (type || '通用') + '类短视频的特点\n';
  lines += '- 场景设定为' + (scene || '通用场景') + '，氛围' + (mood || '中性') + '\n';
  lines += '- 人物数量：' + (characters || '根据内容推断') + '\n';
  lines += '- 开场hook方式：' + (opening || '根据内容自由设计') + '\n';
  if (content) lines += '- 从用户描述中提取具体情节、画面、台词，不要凭空编造\n';

  return '## 用户对爆款视频的描述\n\n' + lines + '\n\n请根据以上信息，输出完整的导演分镜表JSON。';
}

var activeRecordId = null;  // current generating record
var currentDirectorAnalysis = null;  // phase 1 result, before shots

// Phase 1: generate director analysis only
async function generateStoryboard() {
  if (currentStoryboard) {
    if (!confirm('已有故事板，重新生成会覆盖当前内容。确定？')) return;
  }

  if (!settings.apiKey) {
    var hint = document.createElement('div');
    hint.style.cssText = 'text-align:center;color:#e57373;padding:20px;font-size:.85rem';
    hint.textContent = '请先在「我的」→ 设置 中配置 API Key';
    document.getElementById('sbInterview').appendChild(hint);
    setTimeout(function() { hint.remove(); }, 3000);
    return;
  }

  // Create record before generating
  var answersToSave = [];
  for (var i = 0; i < INTERVIEW_QUESTIONS.length; i++) {
    answersToSave.push(interviewAnswers[i] || { question: INTERVIEW_QUESTIONS[i], answer: '' });
  }
  var record = createRecord(answersToSave);
  activeRecordId = record.id;

  isGenerating = true;
  updateStopButton();

  // Switch to loading page
  document.getElementById('sbInterview').style.display = 'none';
  var board = document.getElementById('sbBoard');
  board.style.display = 'flex';
  board.innerHTML = '<div style="text-align:center;padding:80px 20px;color:#8a8278"><div style="font-size:3rem;margin-bottom:16px">🎬</div><div style="font-size:.95rem;font-weight:600;margin-bottom:8px">AI 正在分析…</div><div style="font-size:.72rem">拆解视频结构，提炼导演创意</div></div>';

  try {
    var systemPrompt = buildDirectorSystemPrompt();
    var userPrompt = buildStoryboardPrompt();
    var streamText = await doStoryboardApiCall(systemPrompt, userPrompt);
    var jsonText = collectStreamJson(streamText);
    if (!jsonText) throw new Error('未能从AI响应中解析JSON');
    var data = JSON.parse(jsonText);
    currentDirectorAnalysis = data.directorAnalysis || data;
    normalizeDirectorAnalysis(currentDirectorAnalysis);
    currentStoryboard = { storyboard: currentDirectorAnalysis };  // partial, shots not yet generated
    renderDirectorReview();
    renderRecords();
  } catch(e) {
    updateRecord(activeRecordId, { status: 'failed' });
    console.error('[generateStoryboard] error:', e.message || e);
    document.getElementById('sbBoard').innerHTML =
      '<div style="text-align:center;padding:60px 20px;color:#e57373">' +
      '<div style="font-size:2.5rem;margin-bottom:12px">⚠️</div>' +
      '<div style="font-weight:600;margin-bottom:4px">分析失败</div>' +
      '<div style="font-size:.78rem;margin-bottom:20px;color:#8a8278">' + escapeHtml(e.message || '未知错误') + '</div>' +
      '<button class="dialog-btn primary" onclick="resetToInterview()">🔄 重新开始</button>' +
      '</div>';
    renderRecords();
  }

  isGenerating = false;
  updateStopButton();
  activeRecordId = null;
}

function collectStreamJson(text) {
  console.log('[collectStreamJson] raw text (' + text.length + ' chars):', text.slice(0, 200) + '...');
  // Remove markdown code fence
  var cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  // Try to find the outermost JSON object or array
  var startObj = cleaned.indexOf('{');
  var startArr = cleaned.indexOf('[');
  var start = startObj === -1 ? startArr : (startArr === -1 ? startObj : Math.min(startObj, startArr));
  var endObj = cleaned.lastIndexOf('}');
  var endArr = cleaned.lastIndexOf(']');
  var end = Math.max(endObj, endArr);
  if (start === -1 || end === -1 || start >= end) return null;
  var jsonText = cleaned.slice(start, end + 1);

  // Strategy 1: direct parse
  try { JSON.parse(jsonText); return jsonText; } catch(e) {}

  // Strategy 2: fix trailing commas
  var fixed = jsonText.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
  try { JSON.parse(fixed); return fixed; } catch(e) {}

  // Strategy 3: fix unclosed strings (truncated response) — close braces
  var fixed2 = jsonText;
  // Count open vs close braces/brackets
  var openBraces = (fixed2.match(/\{/g) || []).length;
  var closeBraces = (fixed2.match(/\}/g) || []).length;
  var openBrackets = (fixed2.match(/\[/g) || []).length;
  var closeBrackets = (fixed2.match(/\]/g) || []).length;
  // Close unclosed strings first
  var inString = false;
  var escaped = false;
  var chars = fixed2.split('');
  for (var i = 0; i < chars.length; i++) {
    if (escaped) { escaped = false; continue; }
    if (chars[i] === '\\') { escaped = true; continue; }
    if (chars[i] === '"') { inString = !inString; }
  }
  // If inside a string, close it
  if (inString) fixed2 += '"';
  // Close remaining braces/brackets
  for (var j = closeBraces; j < openBraces; j++) fixed2 += '}';
  for (var k = closeBrackets; k < openBrackets; k++) fixed2 += ']';
  try { JSON.parse(fixed2); return fixed2; } catch(e) {}

  // Strategy 4: fix missing quotes on property names
  var fixed3 = fixed2.replace(/([,\{\[\s\n\r]+)([a-zA-Z_]\w*)(\s*:)/g, '$1"$2"$3');
  // Fix missing opening quote on string values: "key":value" → "key":"value"
  fixed3 = fixed3.replace(/":\s*([^\{\[\}\],\s"][^,\}\]\n]*)"/g, '":"$1"');
  try { JSON.parse(fixed3); return fixed3; } catch(e) {}

  // Strategy 5: try removing the last malformed shot (common AI error at end)
  var lastShotMatch = fixed2.match(/\n\s*\}\s*\]\s*\}/);
  if (lastShotMatch) {
    // Find the position of "shots": [ and try to extract valid shots array
    var shotsStart = fixed2.indexOf('"shots"');
    if (shotsStart > 0) {
      var arrayStart = fixed2.indexOf('[', shotsStart);
      if (arrayStart > 0) {
        // Try to find each complete shot object and rebuild
        var shotsOnly = '';
        var depth = 0, inStr = false, esc2 = false;
        var shotStart = -1, validShots = [];
        for (var p = arrayStart + 1; p < fixed2.length; p++) {
          if (esc2) { esc2 = false; continue; }
          if (fixed2[p] === '\\') { esc2 = true; continue; }
          if (fixed2[p] === '"') { inStr = !inStr; }
          if (inStr) continue;
          if (fixed2[p] === '{') {
            if (depth === 0) shotStart = p;
            depth++;
          } else if (fixed2[p] === '}') {
            depth--;
            if (depth === 0 && shotStart >= 0) {
              var shotJson = fixed2.slice(shotStart, p + 1);
              // Try to parse this single shot
              try { JSON.parse(shotJson); validShots.push(shotJson); } catch(e) {}
              shotStart = -1;
            }
          }
        }
        if (validShots.length > 0) {
          var rebuilt = fixed2.slice(0, arrayStart + 1) + '\n' + validShots.join(',\n') + '\n]' + fixed2.slice(fixed2.lastIndexOf(']') + 1);
          rebuilt = rebuilt.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
          try { JSON.parse(rebuilt); return rebuilt; } catch(e) {}
          // Try as bare array
          var bareArray = '[' + validShots.join(',') + ']';
          try { JSON.parse(bareArray); return bareArray; } catch(e) {}
        }
      }
    }
  }

  // Strategy 6: find the last valid complete key:value and truncate there, then close
  for (var pos = fixed2.length - 1; pos > start + 50; pos--) {
    if (fixed2[pos] === ',' || fixed2[pos] === '{' || fixed2[pos] === '[') {
      var attempt = fixed2.slice(0, pos + 1);
      var ob = (attempt.match(/\{/g) || []).length;
      var cb = (attempt.match(/\}/g) || []).length;
      var obk = (attempt.match(/\[/g) || []).length;
      var cbk = (attempt.match(/\]/g) || []).length;
      var s = false, esc = false;
      for (var ii = 0; ii < attempt.length; ii++) {
        if (esc) { esc = false; continue; }
        if (attempt[ii] === '\\') { esc = true; continue; }
        if (attempt[ii] === '"') s = !s;
      }
      if (s) continue;
      for (var jj = cb; jj < ob; jj++) attempt += '}';
      for (var kk = cbk; kk < obk; kk++) attempt += ']';
      attempt = attempt.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
      try { JSON.parse(attempt); return attempt; } catch(e) {}
    }
  }

  return null;
}

async function doStoryboardApiCall(systemPrompt, userPrompt) {
  abortController = new AbortController();
  var model = settings.model === 'custom' ? settings.customModel : settings.model;
  console.log('[doStoryboardApiCall] endpoint:', settings.endpoint, 'model:', model);

  // 30s timeout
  var timeoutId = setTimeout(function() { abortController.abort(); }, 30000);

  var messages = [
    { role: 'system', content: '[System Prompt]\n' + systemPrompt },
    { role: 'user', content: userPrompt }
  ];

  try {
  var resp = await fetch(settings.endpoint + '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + settings.apiKey },
    body: JSON.stringify({
      model: model,
      messages: messages,
      stream: true,
      temperature: 0.7,
      max_tokens: 4096
    }),
    signal: abortController.signal
  });
  clearTimeout(timeoutId);
  console.log('[doStoryboardApiCall] response status:', resp.status);

  if (!resp.ok) {
    var errText = await resp.text();
    var errMsg = 'API错误 ' + resp.status;
    if (resp.status === 401) errMsg = 'API Key 无效，请在设置中检查';
    else if (resp.status === 404) errMsg = 'Endpoint 不存在，请检查地址';
    throw new Error(errMsg);
  }

  var fullText = '';
  var reader = resp.body.getReader();
  var decoder = new TextDecoder();
  var chunkCount = 0;

  while (true) {
    var result = await reader.read();
    if (result.done) { console.log('[stream] done after', chunkCount, 'chunks'); break; }
    chunkCount++;
    var chunk = decoder.decode(result.value, { stream: true });
    var lines = chunk.split('\n');
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line || !line.startsWith('data:')) continue;
      var data = line.slice(5).trim();
      if (data === '[DONE]') continue;
      try {
        var json = JSON.parse(data);
        var token = json.choices && json.choices[0] && json.choices[0].delta && json.choices[0].delta.content;
        if (token) fullText += token;
      } catch(e) {}
    }
    if (chunkCount % 10 === 0) console.log('[stream] chunk', chunkCount, ', text length:', fullText.length);
    // Safety: break after 1000 chunks to prevent infinite loop
    if (chunkCount > 1000) { console.log('[stream] SAFETY BREAK'); break; }
  }
  console.log('[stream] finished, total text:', fullText.length);
  return fullText;
  } finally {
    clearTimeout(timeoutId);
  }
}

function stopGeneration() {
  if (abortController) { abortController.abort(); abortController = null; }
  isGenerating = false;
  updateStopButton();
  if (activeRecordId) {
    updateRecord(activeRecordId, { status: 'failed' });
    renderRecords();
    activeRecordId = null;
  }
}

function renderOneShotCard(shot, index) {
  var subjects = shot.subjects || [];
  var chars = subjects.map(function(s) { return s.characterName || '?'; }).join(' → ');
  var scene = shot.scene || {};
  var dialogue = shot.dialogue || '';
  var emotionBeat = shot.emotionBeat || '';

  var html = '<div class="sb-shot-card">';

  // Header: shot number + duration + shot type
  html += '<div class="sb-shot-card-header">';
  html += '<span class="shot-num">' + (index + 1) + '</span>';
  html += '<span style="font-size:.72rem">' + escapeHtml(shot.duration || '') + '</span>';
  html += '<span class="shot-type-tag">' + escapeHtml(shot.shotType || '中景') + '</span>';
  html += '</div>';

  // Body
  html += '<div class="sb-shot-card-body">';

  // Characters row
  html += '<div class="shot-info-row">';
  html += '<span class="shot-info-icon">👤</span>';
  html += '<span class="shot-info-text">' + escapeHtml(chars || '(未指定)') + '</span>';
  html += '</div>';

  // Scene row
  html += '<div class="shot-info-row">';
  html += '<span class="shot-info-icon">🏠</span>';
  html += '<span class="shot-info-text">' + escapeHtml((scene.sceneName || scene.environment || '未指定') + ' · ' + (scene.atmosphere || '')) + '</span>';
  html += '</div>';

  // Dialogue row
  if (dialogue) {
    html += '<div class="shot-dialogue-bubble">' + escapeHtml(dialogue) + '</div>';
  }

  // Emotion beat tag
  if (emotionBeat) {
    html += '<div class="shot-emotion-tag">🎭 ' + escapeHtml(emotionBeat) + '</div>';
  }

  // Action summary (small)
  if (shot.action) {
    html += '<div class="shot-action-summary">' + escapeHtml(shot.action) + '</div>';
  }

  html += '</div></div>';

  return html;
}

function renderContinuityBar(continuity) {
  if (!continuity) return '';
  var detail = [
    continuity.eyeLine || '',
    continuity.actionLink || '',
    continuity.emotionLink || ''
  ].filter(Boolean).join(' | ');
  return '<div class="sb-continuity-bar" title="' + escapeHtml(detail) + '">' +
    '<span class="cont-transition">🔗 ' + escapeHtml(continuity.transition || '硬切') + '</span>' +
    '<span class="cont-detail">' + escapeHtml(detail) + '</span>' +
    '</div>';
}

// ============================================================
// STORYBOARD — EDITING
// ============================================================
var editingShotIndex = -1;

function openShotEditor(index) {
  editingShotIndex = index;
  var sb = currentStoryboard.storyboard || currentStoryboard;
  var shot = sb.shots[index];
  if (!shot) return;

  document.getElementById('seIndex').value = index;

  // Subject
  var firstSubject = (shot.subjects && shot.subjects[0]) || {};
  populateCharSelect('seCharacter', firstSubject.characterId || '');
  document.getElementById('sePosition').value = firstSubject.position || '';
  document.getElementById('seDirection').value = firstSubject.direction || '';
  document.getElementById('seAdditionalDesc').value = firstSubject.additionalDesc || '';

  // Action
  document.getElementById('seAction').value = shot.action || '';

  // Scene
  var scene = shot.scene || {};
  populateSceneSelect('seScene', scene.sceneId || '');
  document.getElementById('seEnvironment').value = scene.environment || '';
  document.getElementById('seAtmosphere').value = scene.atmosphere || '';

  // Shot type chips
  setChips('seShotType', shot.shotType || '中景');

  // Duration
  document.getElementById('seDuration').value = shot.duration || '';

  // Lighting
  var lighting = shot.lighting || {};
  document.getElementById('seLightType').value = lighting.type || '';
  document.getElementById('seLightDir').value = lighting.direction || '';

  // Camera
  var cam = shot.camera || {};
  var movChips = document.querySelectorAll('#seCameraMov .chip');
  movChips.forEach(function(c) { c.classList.remove('active'); });
  if (cam.movement) {
    movChips.forEach(function(c) {
      if (cam.movement.indexOf(c.dataset.value) !== -1) c.classList.add('active');
    });
  }
  document.getElementById('seCameraCustom').value = cam.movement || '';

  // Style
  var sty = shot.style || {};
  document.getElementById('seStyle').value = sty.visualStyle || '';

  // Quality
  var qual = shot.quality || {};
  document.getElementById('seQuality').value = (qual.resolution || '') + ' ' + (qual.fps ? qual.fps + 'fps' : '');

  // Dialogue
  document.getElementById('seDialogue').value = shot.dialogue || '';

  // Notes
  document.getElementById('seNotes').value = shot.notes || '';

  // Continuity (skip for shot 0)
  var contField = document.getElementById('seContinuityField');
  if (index === 0) {
    contField.style.display = 'none';
  } else {
    contField.style.display = 'flex';
    var cont = shot.continuity || {};
    document.getElementById('seTransition').value = cont.transition || '硬切 cut';
    document.getElementById('seCarryOver').value = (cont.carryOver || []).join(', ');
    document.getElementById('seNewElements').value = (cont.newElements || []).join(', ');
    document.getElementById('seEyeLine').value = cont.eyeLine || '';
    document.getElementById('seActionLink').value = cont.actionLink || '';
    document.getElementById('seEmotionLink').value = cont.emotionLink || '';
    document.getElementById('seCameraLink').value = cont.cameraLink || '';
  }

  // Delete button
  document.getElementById('btnShotDelete').style.display = 'block';

  document.getElementById('shotEditorSheet').classList.add('open');
}

function closeShotEditor() {
  document.getElementById('shotEditorSheet').classList.remove('open');
  editingShotIndex = -1;
}

function saveShot() {
  var index = parseInt(document.getElementById('seIndex').value);
  if (isNaN(index) || index < 0) return;
  var sb = currentStoryboard.storyboard || currentStoryboard;
  var shot = sb.shots[index];
  if (!shot) return;

  // Build subject
  var charId = document.getElementById('seCharacter').value;
  var charName = document.getElementById('seCharacter').selectedOptions[0] ? document.getElementById('seCharacter').selectedOptions[0].text : '';
  var subject = {
    characterId: charId,
    characterName: charName,
    position: document.getElementById('sePosition').value.trim(),
    direction: document.getElementById('seDirection').value.trim(),
    additionalDesc: document.getElementById('seAdditionalDesc').value.trim()
  };

  // Build scene
  var sceneId = document.getElementById('seScene').value;
  var sceneName = document.getElementById('seScene').selectedOptions[0] ? document.getElementById('seScene').selectedOptions[0].text : '';
  var scene = {
    sceneId: sceneId,
    sceneName: sceneName,
    environment: document.getElementById('seEnvironment').value.trim(),
    atmosphere: document.getElementById('seAtmosphere').value.trim()
  };

  // Camera
  var movChips = document.querySelectorAll('#seCameraMov .chip.active');
  var movParts = [];
  movChips.forEach(function(c) { movParts.push(c.dataset.value); });
  var camCustom = document.getElementById('seCameraCustom').value.trim();
  var camera = { movement: camCustom || movParts.join('+'), focalLength: '', aperture: '', angle: '' };

  // Style
  var style = { visualStyle: document.getElementById('seStyle').value.trim(), colorTone: '', texture: '' };

  // Quality
  var qualText = document.getElementById('seQuality').value.trim();
  var quality = { resolution: qualText, fps: 60, motionBlur: '', postProcess: '' };

  // Lighting
  var lighting = { type: document.getElementById('seLightType').value.trim(), direction: document.getElementById('seLightDir').value.trim(), keyLight: '', fillLight: '', highlights: '', shadows: '' };

  // Update shot
  shot.shotType = getActiveChip('seShotType') || '中景';
  shot.duration = document.getElementById('seDuration').value.trim();
  shot.subjects = subject.characterId || subject.additionalDesc ? [subject] : [];
  shot.action = document.getElementById('seAction').value.trim();
  shot.scene = scene;
  shot.lighting = lighting;
  shot.camera = camera;
  shot.style = style;
  shot.quality = quality;
  shot.dialogue = document.getElementById('seDialogue').value.trim();
  shot.notes = document.getElementById('seNotes').value.trim();

  // Continuity
  if (index > 0) {
    shot.continuity = {
      transition: document.getElementById('seTransition').value,
      carryOver: document.getElementById('seCarryOver').value.split(',').map(function(s) { return s.trim(); }).filter(Boolean),
      newElements: document.getElementById('seNewElements').value.split(',').map(function(s) { return s.trim(); }).filter(Boolean),
      eyeLine: document.getElementById('seEyeLine').value.trim(),
      actionLink: document.getElementById('seActionLink').value.trim(),
      emotionLink: document.getElementById('seEmotionLink').value.trim(),
      cameraLink: document.getElementById('seCameraLink').value.trim()
    };
  }

  closeShotEditor();
  rerenderBoard();
}

function deleteShot(index) {
  if (!confirm('确定删除第' + (index + 1) + '镜？')) return;
  var sb = currentStoryboard.storyboard || currentStoryboard;
  sb.shots.splice(index, 1);
  // Remove continuity from the first remaining shot if it becomes shot 0
  rerenderBoard();
}

function moveShot(index, direction) {
  var sb = currentStoryboard.storyboard || currentStoryboard;
  var newIdx = index + direction;
  if (newIdx < 0 || newIdx >= sb.shots.length) return;
  var tmp = sb.shots[index];
  sb.shots[index] = sb.shots[newIdx];
  sb.shots[newIdx] = tmp;
  rerenderBoard();
}

function addShot() {
  var sb = currentStoryboard.storyboard || currentStoryboard;
  var newShot = {
    id: 'shot_' + (sb.shots.length + 1),
    duration: '',
    shotType: '中景',
    camera: { movement: '', focalLength: '', aperture: '', angle: '' },
    subjects: [],
    action: '',
    scene: { sceneId: '', sceneName: '', environment: '', atmosphere: '', background: '' },
    lighting: { type: '', keyLight: '', fillLight: '', direction: '', highlights: '', shadows: '' },
    style: { visualStyle: '', colorTone: '', texture: '' },
    quality: { resolution: '4K', fps: 60, motionBlur: '', postProcess: '' },
    dialogue: '',
    notes: ''
  };
  // Add continuity for new shot if not first
  if (sb.shots.length > 0) {
    newShot.continuity = { transition: '硬切 cut', carryOver: [], newElements: [], eyeLine: '', actionLink: '', emotionLink: '', cameraLink: '' };
  }
  sb.shots.push(newShot);
  rerenderBoard();
  // Open editor for the new shot
  setTimeout(function() { openShotEditor(sb.shots.length - 1); }, 100);
}

// ============================================================
// GLOBAL OPERATIONS
// ============================================================
function replaceAllCharacters() {
  if (!characterProfiles.length) { alert('请先在「我的」中创建形象'); return; }
  var sb = currentStoryboard.storyboard || currentStoryboard;
  // Find all characterIds used
  var usedIds = {};
  sb.shots.forEach(function(shot) {
    (shot.subjects || []).forEach(function(s) {
      if (s.characterId) usedIds[s.characterId] = s.characterName || s.characterId;
    });
  });

  var fromIds = Object.keys(usedIds);
  if (!fromIds.length) { alert('当前故事板中没有引用角色'); return; }

  var fromId = prompt('要替换哪个角色？\n\n当前使用的角色：\n' + fromIds.map(function(id) { return '- ' + usedIds[id] + ' (' + id + ')'; }).join('\n') + '\n\n输入角色的characterId或名称：');
  if (!fromId) return;

  // Try to find by name first
  var match = fromIds.find(function(id) { return usedIds[id] === fromId; });
  if (!match) match = fromIds.find(function(id) { return id === fromId; });
  if (!match) { alert('未找到该角色'); return; }

  var toNames = characterProfiles.map(function(c) { return c.name + ' (' + c.id + ')'; }).join('\n');
  var toId = prompt('替换为哪个形象？\n\n可用形象：\n' + toNames + '\n\n输入形象的characterId：');
  if (!toId) return;
  var toChar = findCharById(toId);
  if (!toChar) { alert('未找到该形象'); return; }

  sb.shots.forEach(function(shot) {
    (shot.subjects || []).forEach(function(s) {
      if (s.characterId === match) {
        s.characterId = toChar.id;
        s.characterName = toChar.name;
      }
    });
  });

  rerenderBoard();
}

var keyProps = '';

function replaceKeyProps() {
  var current = keyProps || '';
  var input = prompt('输入要植入的关键道具（产品/物品）：\n例如：桶装水、某品牌手机、定制杯子\n多个用逗号分隔', current);
  if (input === null) return; // cancel
  keyProps = input.trim();
  if (keyProps && !confirm('已设置道具：' + keyProps + '\n\n重新生成分镜来植入道具？')) return;
  if (keyProps) generateShots();
}

function replaceAllScenes() {
  if (!sceneProfiles.length) { alert('请先在「我的」中创建场景'); return; }
  var sb = currentStoryboard.storyboard || currentStoryboard;
  var usedIds = {};
  sb.shots.forEach(function(shot) {
    var s = shot.scene || {};
    if (s.sceneId) usedIds[s.sceneId] = s.sceneName || s.sceneId;
  });

  var fromIds = Object.keys(usedIds);
  if (!fromIds.length) { alert('当前故事板中没有引用场景'); return; }

  var fromId = prompt('要替换哪个场景？\n\n当前使用的场景：\n' + fromIds.map(function(id) { return '- ' + usedIds[id] + ' (' + id + ')'; }).join('\n') + '\n\n输入场景的sceneId或名称：');
  if (!fromId) return;

  var match = fromIds.find(function(id) { return usedIds[id] === fromId; });
  if (!match) match = fromIds.find(function(id) { return id === fromId; });
  if (!match) { alert('未找到该场景'); return; }

  var toNames = sceneProfiles.map(function(s) { return s.name + ' (' + s.id + ')'; }).join('\n');
  var toId = prompt('替换为哪个场景？\n\n可用场景：\n' + toNames + '\n\n输入场景的sceneId：');
  if (!toId) return;
  var toScene = sceneProfiles.find(function(s) { return s.id === toId; });
  if (!toScene) { alert('未找到该场景'); return; }

  sb.shots.forEach(function(shot) {
    if (shot.scene && shot.scene.sceneId === match) {
      shot.scene.sceneId = toScene.id;
      shot.scene.sceneName = toScene.name;
    }
  });

  rerenderBoard();
}

function resetToInterview() {
  if (!confirm('确定重新开始？当前故事板内容将丢失。')) return;
  currentStoryboard = null;
  interviewStep = 0;
  interviewAnswers = [];
  document.getElementById('sbInterview').style.display = 'flex';
  document.getElementById('sbBoard').style.display = 'none';
  renderInterview();
}

// ============================================================
// EXPORT
// ============================================================
function exportStoryboardPrompts() {
  var sb = currentStoryboard.storyboard || currentStoryboard;
  var shots = sb.shots || [];
  var out = '标题：' + (sb.title || '') + '\n\n';
  shots.forEach(function(shot, i) {
    out += '--- 第' + (i + 1) + '镜 · ' + (shot.duration || '') + ' · ' + (shot.shotType || '') + ' ---\n';
    out += '主体：' + (shot.subjects || []).map(function(s) { return (s.characterName || '') + ' (' + (s.additionalDesc || '') + ')'; }).join('; ') + '\n';
    out += '动作：' + (shot.action || '') + '\n';
    out += '场景：' + ((shot.scene || {}).environment || '') + ' · ' + ((shot.scene || {}).atmosphere || '') + '\n';
    out += '光影：' + ((shot.lighting || {}).type || '') + ' ' + ((shot.lighting || {}).direction || '') + '\n';
    out += '运镜：' + ((shot.camera || {}).movement || '') + '\n';
    out += '风格：' + ((shot.style || {}).visualStyle || '') + '\n';
    out += '画质：' + ((shot.quality || {}).resolution || '') + '\n';
    if (shot.dialogue) out += '台词：' + shot.dialogue + '\n';
    out += '\n';
  });
  copyToClipboard(out).then(function() {
    alert('已复制即梦提示词到剪贴板');
  });
}

function exportStoryboardJson() {
  copyToClipboard(JSON.stringify(currentStoryboard, null, 2)).then(function() {
    alert('已复制完整JSON到剪贴板');
  });
}

// ============================================================
// HELPERS
// ============================================================
function populateCharSelect(selectId, selectedId) {
  var sel = document.getElementById(selectId);
  if (!sel) return;
  sel.innerHTML = '<option value="">（无）</option>';
  characterProfiles.forEach(function(c) {
    sel.innerHTML += '<option value="' + c.id + '"' + (c.id === selectedId ? ' selected' : '') + '>' + escapeHtml(c.name || c.id) + '</option>';
  });
}

function populateSceneSelect(selectId, selectedId) {
  var sel = document.getElementById(selectId);
  if (!sel) return;
  sel.innerHTML = '<option value="">（无）</option>';
  sceneProfiles.forEach(function(s) {
    sel.innerHTML += '<option value="' + s.id + '"' + (s.id === selectedId ? ' selected' : '') + '>' + escapeHtml(s.name || s.id) + '</option>';
  });
}

function setChips(groupId, value) {
  var chips = document.querySelectorAll('#' + groupId + ' .chip');
  chips.forEach(function(c) { c.classList.toggle('active', c.dataset.value === value); });
}

function getActiveChip(groupId) {
  var active = document.querySelector('#' + groupId + ' .chip.active');
  return active ? active.dataset.value : '';
}

// ============================================================
// EVENT BINDING
// ============================================================
function bindEvents() {
  // Tab switching
  document.querySelectorAll('.tab-item').forEach(function(item) {
    item.addEventListener('click', function() { switchTab(this.dataset.tab); });
  });

  // Settings overlay
  var btnSettings = document.getElementById('btnMeSettings');
  if (btnSettings) btnSettings.addEventListener('click', function() {
    document.getElementById('meApiKey').value = settings.apiKey || '';
    document.getElementById('meEndpoint').value = settings.endpoint || '';
    document.getElementById('meModel').value = settings.model || 'deepseek-chat';
    updateCustomModel();
    document.getElementById('settingsOverlay').classList.add('open');
  });

  document.getElementById('meModel').addEventListener('change', updateCustomModel);

  // API Key toggle
  document.getElementById('btnToggleApiKey').addEventListener('click', function() {
    var inp = document.getElementById('meApiKey');
    var isPass = inp.type === 'password';
    inp.type = isPass ? 'text' : 'password';
    this.textContent = isPass ? '🐵' : '🙈';
  });

  // Save API config
  document.getElementById('btnSaveApiConfig').addEventListener('click', async function() {
    settings.apiKey = document.getElementById('meApiKey').value.trim();
    settings.endpoint = document.getElementById('meEndpoint').value.trim();
    settings.model = document.getElementById('meModel').value;
    settings.customModel = document.getElementById('meCustomModel').value.trim();
    saveSettingsToStorage();
    var hint = document.getElementById('apiConfigSaveHint');
    if (typeof sbSaveApiConfig !== 'undefined') {
      try { await sbSaveApiConfig(); } catch(e) {}
    }
    hint.textContent = '✓ 已保存'; hint.style.color = '#5b9a8b';
    setTimeout(function() { hint.textContent = ''; }, 2000);
  });

  // Logout
  var btnLogout1 = document.getElementById('btnLogout');
  var btnLogout2 = document.getElementById('btnLogoutCard');
  function doLogout() {
    if (!confirm('确定退出登录？')) return;
    if (typeof sbSignOut !== 'undefined') { try { sbSignOut(); } catch(e) {} }
    sbUser = null;
    currentStoryboard = null;
    document.getElementById('loginPage').classList.remove('hidden');
    document.getElementById('settingsOverlay').classList.remove('open');
  }
  if (btnLogout1) btnLogout1.addEventListener('click', doLogout);
  if (btnLogout2) btnLogout2.addEventListener('click', doLogout);

  // Login tab switching
  var loginMode = 'login';
  document.querySelectorAll('.login-tab').forEach(function(tab) {
    tab.addEventListener('click', function() {
      loginMode = this.dataset.mode;
      document.querySelectorAll('.login-tab').forEach(function(t) { t.classList.remove('active'); });
      this.classList.add('active');
      var btn = document.getElementById('btnLogin');
      btn.textContent = loginMode === 'login' ? '登录' : '注册';
      document.getElementById('loginPhone').style.display = loginMode === 'register' ? 'block' : 'none';
      document.getElementById('loginError').style.display = 'none';
    });
  });

  document.getElementById('btnLogin').addEventListener('click', function() { doLoginOrRegister(loginMode); });

  // Forgot password
  document.getElementById('btnForgotPwd').addEventListener('click', showResetForm);
  document.getElementById('btnBackToLogin').addEventListener('click', showLoginForm);
  document.getElementById('btnResetPwd').addEventListener('click', doResetPassword);

  // Enter key on login
  document.getElementById('loginPassword').addEventListener('keydown', function(e) { if (e.key === 'Enter') doLoginOrRegister('login'); });
  document.getElementById('resetPassword').addEventListener('keydown', function(e) { if (e.key === 'Enter') doResetPassword(); });

  // Interview buttons
  document.getElementById('btnNextQ').addEventListener('click', nextQuestion);
  document.getElementById('btnPrevQ').addEventListener('click', prevQuestion);
  var sbAnswerEl = document.getElementById('sbAnswer');
  if (sbAnswerEl) sbAnswerEl.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); nextQuestion(); }
  });

  // Voice
  document.getElementById('btnVoice').addEventListener('click', toggleVoiceInput);
  setupVoiceRecognition();

  // Shot editor
  document.getElementById('btnShotSave').addEventListener('click', saveShot);
  document.getElementById('btnShotCancel').addEventListener('click', closeShotEditor);
  document.getElementById('btnShotDelete').addEventListener('click', function() {
    if (editingShotIndex >= 0) { closeShotEditor(); deleteShot(editingShotIndex); }
  });

  // Chip clicks in editor
  document.querySelectorAll('#seShotType .chip').forEach(function(c) {
    c.addEventListener('click', function() { setChips('seShotType', this.dataset.value); });
  });
  document.querySelectorAll('#seCameraMov .chip').forEach(function(c) {
    c.addEventListener('click', function() { this.classList.toggle('active'); });
  });

  // Char editor gender chips
  document.querySelectorAll('#charEditGender .chip').forEach(function(c) {
    c.addEventListener('click', function() {
      document.querySelectorAll('#charEditGender .chip').forEach(function(x) { x.classList.remove('active'); });
      this.classList.add('active');
    });
  });

  // Stop button
  document.getElementById('btnStop').addEventListener('click', stopGeneration);

}

// ============================================================
// OVERRIDE SAVE FUNCTIONS FOR CLOUD SYNC
// ============================================================
var _origSaveSettings = saveSettingsToStorage;
saveSettingsToStorage = function() {
  _origSaveSettings();
  if (typeof sbUser !== 'undefined' && sbUser) sbSaveProfile().catch(function(e) {});
};

var _origSaveChar = saveCharacterProfiles;
saveCharacterProfiles = function() {
  _origSaveChar();
};

var _origSaveScene = saveSceneProfiles;
saveSceneProfiles = function() {
  _origSaveScene();
};

// ============================================================
// STARTUP
// ============================================================
init();

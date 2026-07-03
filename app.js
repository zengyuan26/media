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

// zhilingKey is stored separately, completely independent of settings/cloud
var zhilingKey = '';

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

// Topic / Create page state
var topicBizData = null;       // { biz, analysis, calendar, savedAt }
var currentTopicFilter = 'all'; // 'all' | purpose label
var selectedTopic = null;      // currently selected topic for content generation
var topicContentText = '';     // generated content text
var pendingRecordSource = 'link'; // 'link' | 'topic' — set before generateStoryboard()

// ============================================================
// PERSISTENCE
// ============================================================
function loadSettings() {
  try {
    var s = JSON.parse(localStorage.getItem('zimeiti-v3-settings'));
    if (s) { Object.keys(DEFAULT_SETTINGS).forEach(function(k) { if (s[k] !== undefined) settings[k] = s[k]; }); }
  } catch(e) {}
}

function loadZhilingKey() {
  try { var z = localStorage.getItem('zimeiti-v3-zhiling-key'); zhilingKey = z || ''; } catch(e) {}
}
function saveZhilingKey() {
  try { localStorage.setItem('zimeiti-v3-zhiling-key', zhilingKey); } catch(e) {}
}

function saveSettingsToStorage() {
  try { localStorage.setItem('zimeiti-v3-settings', JSON.stringify(settings)); } catch(e) {}
}

function loadCharacterProfiles() {
  try {
    var c = JSON.parse(localStorage.getItem('zimeiti-v3-characters'));
    if (Array.isArray(c)) {
      c.forEach(function(ch) { if (!ch.id) ch.id = generateId(); });
      characterProfiles = c;
    }
  } catch(e) {}
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
  loadZhilingKey();
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
  loadDialects();
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
  if (tabId === 'tabMe') { recordsPage = 0; renderRecords(0); }
  if (tabId === 'tabCreate') initCreatePage();
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

function findSceneById(id) {
  return sceneProfiles.find(function(s) { return s.id === id; });
}

function describeCharacter(id) {
  var ch = findCharById(id);
  if (!ch) return '';
  return ch.name + '：' + [ch.gender, ch.age ? ch.age + '岁' : '', ch.clothing, ch.hair, ch.build, ch.features].filter(Boolean).join('，');
}

function describeScene(id) {
  var sc = findSceneById(id);
  if (!sc) return '';
  return [sc.name, sc.environment, sc.atmosphere, sc.lighting].filter(Boolean).join(' · ');
}

function renderCharacterList() {
  var el = document.getElementById('charCount');
  if (el) el.textContent = characterProfiles.length + '个';
}

function updateAccountUI() {
  renderCharacterList();
  var sceneEl = document.getElementById('sceneCount');
  if (sceneEl) sceneEl.textContent = sceneProfiles.length + '个';
  var dialectEl = document.getElementById('dialectName');
  if (dialectEl) dialectEl.textContent = currentDialect;
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
  casual_m:   ['白色T恤+深蓝牛仔裤', '灰色连帽卫衣+黑运动裤', '条纹polo衫+卡其短裤', '浅蓝牛仔外套+白T+黑裤', '军绿工装夹克+黑牛仔裤'],
  casual_f:   ['白色雪纺衫+牛仔阔腿裤', '碎花连衣裙+米色开衫', '粉色卫衣+白色直筒裤', '条纹T恤+高腰牛仔短裤', '浅蓝衬衫+白色半身裙'],
  business_m: ['藏青西装+白衬衫+领带', '深灰西服套装+黑皮鞋', '浅灰衬衫+深蓝西裤', '炭黑马甲+白衬衫+灰西裤', '海军蓝blazer+卡其裤'],
  business_f: ['黑色西装套裙+白衬衫', '驼色风衣+白衬衫+烟管裤', '深蓝one-piece连衣裙+西装外套', '灰格纹套装+黑高跟鞋', '白衬衫+黑色阔腿西裤'],
  sport_m:    ['速干运动T恤+黑色运动短裤', '灰色运动卫衣+深蓝压缩裤', '白色运动背心+黑色运动长裤', '荧光绿跑步夹克+黑短裤', '深蓝运动套装+白色跑鞋'],
  sport_f:    ['粉色运动bra+黑色瑜伽裤', '白色速干T恤+深蓝运动短裤', '薄荷绿运动背心+灰leggings', '深蓝运动连衣裙+白色跑鞋', '浅灰卫衣+黑色运动紧身裤'],
  trendy_m:   ['黑色oversize卫衣+宽松工装裤', '涂鸦印花T恤+破洞牛仔裤', '亮色短夹克+黑色阔腿裤', '迷彩外套+黑色束脚裤', '黑白格纹衬衫+黑破洞牛仔'],
  trendy_f:   ['短款针织开衫+高腰阔腿裤', '木耳边上衣+格纹短裙', '亮色西装外套+骑行短裤', '廓形牛仔外套+百褶短裙', 'crop top+高腰工装裤'],
  home_m:     ['灰色棉质家居服套装', '白色背心+深灰棉短裤', '深蓝格纹睡衣套装', '米色针织衫+咖啡色休闲裤', '浅灰卫衣+黑色棉质长裤'],
  home_f:     ['粉色棉质家居连衣裙', '白色蕾丝睡袍+吊带', '浅灰针织套装·居家', '米色毛毛外套+白色阔腿裤', '鹅黄棉质睡衣套装'],
  age: ['22岁', '25岁', '28岁', '30岁', '32岁', '35岁', '38岁', '40岁', '26岁', '27岁', '33岁'],
  hair_m: ['黑色短发·清爽碎盖', '黑色短发·三七分', '深棕短发·纹理烫', '黑色短发·寸头', '深棕中短发·微分', '黑色短发·背头'],
  hair_f: ['黑色齐肩发·内扣', '深棕长发·大波浪', '黑色长发·直发及腰', '浅棕短发·锁骨卷', '黑色中长发·低马尾', '深棕短发·波波头'],
  build_m: ['身高175，匀称', '身高180，健壮', '身高170，偏瘦', '身高172，标准', '身高178，运动型'],
  build_f: ['身高165，匀称', '身高160，娇小', '身高170，高挑', '身高163，标准', '身高168，偏瘦'],
  features: ['银色细框眼镜', '右手腕银手链', '左耳单颗耳钉', '黑色方框眼镜', '颈间细项链', '左手腕皮质手环', '无框眼镜·书卷气', '嘴角一颗小痣', '鼻梁细微雀斑', '右手无名指银色戒指']
};

function getStyleKey() {
  var styleEl = document.querySelector('#charEditStyle .chip.active');
  return styleEl ? styleEl.dataset.value : '休闲';
}

function getSeason() {
  var seasonEl = document.querySelector('#charEditSeason .chip.active');
  return seasonEl ? seasonEl.dataset.value : '春夏';
}

function randomizeCharacter() {
  var genderEl = document.querySelector('#charEditGender .chip.active');
  var gender = genderEl ? genderEl.dataset.value : '男';
  var isMale = gender === '男';
  var suffix = isMale ? 'm' : 'f';
  var style = getStyleKey();
  var season = getSeason();
  var key = style + '_' + suffix;

  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  var ageEl = document.getElementById('charEditAge');
  if (!ageEl.value) ageEl.value = pick(RANDOM_CHAR.age);
  // Use style-specific clothing if available, fallback to casual
  var clothingArr = RANDOM_CHAR[key] || RANDOM_CHAR['casual_' + suffix];
  document.getElementById('charEditClothing').value = pick(clothingArr) + (season === '秋冬' ? '·保暖面料' : '·轻薄面料');
  document.getElementById('charEditHair').value = pick(RANDOM_CHAR['hair_' + suffix]);
  document.getElementById('charEditBuild').value = pick(RANDOM_CHAR['build_' + suffix] || RANDOM_CHAR.build_m);
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
    var style = getStyleKey();
    var season = getSeason();
    var prompt = '请为"' + (name || '角色') + '"生成形象细节。\n性别：' + gender + '，年龄：' + (age || '成年人') + '，穿搭风格：' + style + '，季节：' + season + '。\n输出纯JSON：\n{"clothing":"服装描述（具体到款式、颜色、面料，符合' + style + '风格和' + season + '季节）","hair":"发型发色","build":"体型身高","features":"标志特征（眼镜/饰品/痣/纹身等）"}';
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
  if (typeof sbSaveCharacter !== 'undefined') sbSaveCharacter(ch).catch(function(e) { console.error('save char failed:', e); });
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
  if (typeof sbSaveScene !== 'undefined') sbSaveScene(s).catch(function(e) { console.error('save scene failed:', e); });
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
    // Backup current data before resetting
    var prevApiKey = settings.apiKey;
    var prevEndpoint = settings.endpoint;
    var prevModel = settings.model;
    var prevCustomModel = settings.customModel;
    var prevChars = characterProfiles.slice();
    var prevScenes = sceneProfiles.slice();

    settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    // Don't reset characters/scenes — keep local data, cloud will merge if it has newer data
    await loadAllFromCloud();

    // If cloud didn't restore, keep local values
    if (!settings.apiKey && prevApiKey) {
      settings.apiKey = prevApiKey;
      settings.endpoint = prevEndpoint;
      settings.model = prevModel;
      settings.customModel = prevCustomModel;
    }
    if (!characterProfiles.length && prevChars.length) {
      characterProfiles = prevChars;
      saveCharacterProfiles();
    }
    if (!sceneProfiles.length && prevScenes.length) {
      sceneProfiles = prevScenes;
      saveSceneProfiles();
    }
    // Also ensure cloud has our local data
    if (characterProfiles.length && typeof sbUser !== 'undefined' && sbUser) {
      prevChars.forEach(function(ch) { if (typeof sbSaveCharacter !== 'undefined') sbSaveCharacter(ch).catch(function(){}); });
    }
    if (sceneProfiles.length && typeof sbUser !== 'undefined' && sbUser) {
      prevScenes.forEach(function(s) { if (typeof sbSaveScene !== 'undefined') sbSaveScene(s).catch(function(){}); });
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
  var preview = document.getElementById('sbPreview');
  if (!el || !board) return;
  el.style.display = 'flex';
  if (preview) preview.style.display = 'none';
  board.style.display = 'none';
}

var _pendingZhilingContent = '';

function showZhilingPreview(content) {
  _pendingZhilingContent = content;
  var el = document.getElementById('sbInterview');
  var preview = document.getElementById('sbPreview');
  var board = document.getElementById('sbBoard');
  var contentEl = document.getElementById('sbPreviewContent');

  if (el) el.style.display = 'none';
  if (board) board.style.display = 'none';
  if (!preview || !contentEl) return;

  // Render markdown-ish content
  var lines = content.split('\n');
  var html = '';
  var inList = false;
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) { html += '<br>'; continue; }
    // Headers
    if (line.startsWith('### ')) {
      html += '<div class="sb-preview-h3">' + escapeHtml(line.slice(4)) + '</div>';
    } else if (line.startsWith('#### ')) {
      html += '<div class="sb-preview-h4">' + escapeHtml(line.slice(5)) + '</div>';
    } else if (line.startsWith('- ')) {
      html += '<div class="sb-preview-li">' + escapeHtml(line.slice(2)) + '</div>';
    } else {
      html += '<div class="sb-preview-p">' + escapeHtml(line) + '</div>';
    }
  }
  contentEl.innerHTML = html;
  preview.style.display = 'flex';
}

function backToLinkInput() {
  var preview = document.getElementById('sbPreview');
  var el = document.getElementById('sbInterview');
  if (preview) preview.style.display = 'none';
  if (el) el.style.display = 'flex';
  _pendingZhilingContent = '';
}

function confirmAndGenerate() {
  var preview = document.getElementById('sbPreview');
  if (preview) preview.style.display = 'none';
  document.getElementById('sbInterview').style.display = 'none';
  generateStoryboard();
}

// ============================================================
// VIDEO LINK PARSER — call api/analyze to extract video metadata
// ============================================================
var API_BASE = '';

var isParsingLink = false;

// Direct 17zhiling call from browser (no Electron needed)
async function callZhilingDirect(key, videoUrl) {
  // Step 1: Submit
  var body = new URLSearchParams({ key: key, videoUrl: videoUrl }).toString();
  var submitRes = await fetch('https://api.17zhiling.com/api/video-inference/parse-video-url-time', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8' },
    body: body
  });
  var submitJson = await submitRes.json();
  if (submitJson.code !== 200 || !submitJson.data) {
    return { success: false, error: submitJson.msg || '提交失败' };
  }
  var taskId = submitJson.data;

  // Step 2: Poll (max 120s, 3s interval)
  var deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    await new Promise(function(r) { setTimeout(r, 3000); });
    var pollRes = await fetch('https://api.17zhiling.com/api/video-inference/task-status?key=' + encodeURIComponent(key) + '&taskId=' + encodeURIComponent(taskId));
    var pollJson = await pollRes.json();
    if (pollJson.code !== 200 || !pollJson.data) continue;
    if (pollJson.data.schedule === 'SUCCESS') {
      return { success: true, content: pollJson.data.content || '' };
    }
    if (pollJson.data.schedule === 'FAIL') {
      return { success: false, error: '视频分析失败（FAIL）' };
    }
  }
  return { success: false, error: '视频分析超时（超过120秒）' };
}

async function parseVideoLink() {
  if (isParsingLink) return;
  var input = document.getElementById('sbLinkInput');
  var btn = document.getElementById('btnParseLink');
  var statusEl = document.getElementById('sbLinkStatus');
  var url = (input.value || '').trim();

  if (!url) {
    statusEl.style.display = 'block';
    statusEl.className = 'sb-link-status error';
    statusEl.textContent = '请粘贴视频链接';
    return;
  }

  isParsingLink = true;
  btn.disabled = true;
  btn.textContent = '⏳ 解析中…';
  statusEl.style.display = 'block';
  statusEl.className = 'sb-link-status';
  statusEl.textContent = '正在提取视频信息…';

  try {
    var data = null;

    // Try Electron IPC first (local, no geo-blocking)
    if (window.electronAPI && window.electronAPI.parseLink) {
      statusEl.textContent = '正在通过本地提取视频信息…';
      data = await window.electronAPI.parseLink(url);
    }

    // Fall back to Vercel API
    if (!data) {
      var res = await fetch(API_BASE + '/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url })
      });

      if (res.ok) {
        try { data = await res.json(); } catch(e) {}
      }
    }

    // If Phase 1 got a fallback result AND zhilingKey available → try zhiling directly
    var phase1Failed = !data || data._fallback;
    if (phase1Failed && zhilingKey) {
      statusEl.textContent = '🎬 正在通过 AI 分析视频（约15-30秒）…';
      var zhilingResult = await callZhilingDirect(zhilingKey, url);
      if (zhilingResult && zhilingResult.success && zhilingResult.content) {
        data = {
          title: url,
          description: '',
          platform: '视频',
          _zhilingContent: zhilingResult.content
        };
      } else {
        statusEl.className = 'sb-link-status warning';
        statusEl.textContent = '解析失败：' + ((zhilingResult && zhilingResult.error) || '未知错误') + '。请手动填写问答';
        isParsingLink = false;
        btn.disabled = false;
        btn.textContent = '🔍 解析';
        return;
      }
    }

    if (!data) {
      statusEl.className = 'sb-link-status warning';
      statusEl.textContent = '无法提取视频详情，请手动填写问答。链接可能已失效或需要登录。';
      isParsingLink = false;
      btn.disabled = false;
      btn.textContent = '🔍 解析';
      return;
    }

    if (data._fallback && !data._zhilingContent) {
      statusEl.className = 'sb-link-status warning';
      statusEl.textContent = data._message || '无法提取视频详情，请手动填写问答';
      isParsingLink = false;
      btn.disabled = false;
      btn.textContent = '🔍 解析';
      return;
    }

    // Fill interview answers from extracted data
    fillInterviewFromLink(data);

    if (data._zhilingContent) {
      // Show preview instead of auto-generating
      showZhilingPreview(data._zhilingContent);
      input.value = '';
    } else {
      statusEl.className = 'sb-link-status success';
      var phase1Msg = '已提取「' + (data.platform || '视频') + '」' + (data.title ? '：' + data.title : '') + ' — 问答已预填';
      statusEl.textContent = phase1Msg;
      input.value = '';

      // Phase 2: enrich with zhiling if not already done
    if (zhilingKey) {
      statusEl.textContent = phase1Msg + ' | 🎬 正在 AI 分析视频画面（约15-30秒）…';
      var zhilingPromise;
      if (window.electronAPI && window.electronAPI.callZhiling) {
        zhilingPromise = window.electronAPI.callZhiling(zhilingKey, url);
      } else {
        zhilingPromise = callZhilingDirect(zhilingKey, url);
      }
      zhilingPromise.then(function(result) {
        if (result && result.success && result.content) {
          var contentIdx = -1;
          for (var i = 0; i < INTERVIEW_QUESTIONS.length; i++) {
            if (INTERVIEW_QUESTIONS[i].id === 'content') { contentIdx = i; break; }
          }
          if (contentIdx >= 0) {
            var existing = interviewAnswers[contentIdx];
            var enrichedText = result.content;
            if (existing && existing.answer) {
              enrichedText = existing.answer + '\n\n---\nAI 视频分析：\n\n' + result.content;
            }
            interviewAnswers[contentIdx] = { question: INTERVIEW_QUESTIONS[contentIdx].question, answer: enrichedText, supplement: '' };
            renderInterview();
          }
          statusEl.className = 'sb-link-status success';
          statusEl.textContent = phase1Msg + ' | ✅ AI 画面分析完成';
        } else {
          statusEl.className = 'sb-link-status warning';
          statusEl.textContent = phase1Msg + ' | ⚠️ AI 分析失败：' + ((result && result.error) || '未知错误');
        }
      }).catch(function(e) {
        statusEl.className = 'sb-link-status warning';
        statusEl.textContent = phase1Msg + ' | ⚠️ AI 分析失败：' + (e.message || '网络错误');
      });
    }
    }
  } catch (e) {
    statusEl.className = 'sb-link-status error';
    statusEl.textContent = '解析失败：' + (e.message || '网络错误');
  }

  isParsingLink = false;
  btn.disabled = false;
  btn.textContent = '🔍 解析';
}

function fillInterviewFromLink(data) {
  var zhilingContent = data._zhilingContent || '';
  var desc = data.description || '';
  var title = data.title || '';
  var fullText = [];
  if (title) fullText.push(title);
  if (desc) fullText.push(desc);
  if (zhilingContent) fullText.push(zhilingContent);
  var contentText = fullText.join('\n\n');
  var combined = fullText.join(' ');

  INTERVIEW_QUESTIONS.forEach(function(q, idx) {
    var entry = { question: q.question, answer: null, supplement: '' };

    switch (q.id) {
      case 'type':
        entry.answer = guessVideoType(combined, data.platform);
        break;
      case 'opening':
        if (desc) {
          var sentences = desc.split(/[。！？\.!\?]/);
          var opening = sentences.slice(0, 2).filter(Boolean).join('。');
          if (opening) entry.supplement = opening;
        }
        break;
      case 'characters':
        if (/两人|情侣|夫妻|母女|父子|老板.*员工|姐妹|兄弟|两个人/.test(combined)) {
          entry.answer = '两个人';
        } else if (/团队|一群人|多人|大家|几个|聚会|群聊/.test(combined)) {
          entry.answer = '多人';
        } else if (/猫|狗|宠物|动物|风景|美食|产品/.test(combined) && !/人/.test(combined)) {
          entry.answer = '没有人物';
        } else if (/我|一个人|独自|一个人|单身/.test(combined) || !/两人|多人|团队/.test(combined)) {
          entry.answer = '一个人';
        }
        break;
      case 'content':
        if (contentText) entry.answer = contentText;
        break;
    }

    if (entry.answer || entry.supplement) {
      interviewAnswers[idx] = entry;
    }
  });

  renderInterview();
}

function guessVideoType(text, platform) {
  var t = text.toLowerCase();
  if (/产品|卖货|购买|链接|优惠|折扣|下单|推荐|种草/.test(t)) return '带货';
  if (/剧情|故事|反转|结局|万万没想到|演技/.test(t)) return '剧情';
  if (/教程|技巧|方法|学会|教你|干货|知识|科普/.test(t)) return '知识';
  if (/搞笑|笑死|整蛊|恶搞/.test(t)) return '搞笑';
  if (/励志|努力|奋斗|成功|改变/.test(t)) return '励志';
  if (/美食|做饭|烹饪|食谱|探店|好吃|生活/.test(t)) return '生活技巧';
  return '其他';
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

function createRecord(answers, source) {
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
    storyboard: null,
    source: source || 'link'
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

var recordsPage = 0;
var RECORDS_PER_PAGE = 5;

function renderRecords(page) {
  var container = document.getElementById('sbRecordList');
  if (!container) return;
  if (!generationRecords.length) {
    container.innerHTML = '<div style="font-size:.76rem;color:#a09888;text-align:center;padding:12px 0">暂无记录</div>';
    return;
  }

  if (typeof page === 'number') recordsPage = page;
  else if (recordsPage === undefined) recordsPage = 0;

  var totalPages = Math.ceil(generationRecords.length / RECORDS_PER_PAGE);
  if (recordsPage >= totalPages) recordsPage = totalPages - 1;
  if (recordsPage < 0) recordsPage = 0;

  var start = recordsPage * RECORDS_PER_PAGE;
  var pageRecords = generationRecords.slice(start, start + RECORDS_PER_PAGE);

  var html = '';
  pageRecords.forEach(function(r) {
    var icon = r.status === 'completed' ? '✅' : '⏳';
    var statusText = r.status === 'completed' ? '已完成' : r.status === 'failed' ? '失败' : '进行中';
    var date = new Date(r.createdAt);
    var dateStr = (date.getMonth() + 1) + '/' + date.getDate() + ' ' + date.getHours() + ':' + String(date.getMinutes()).padStart(2, '0');
    var sourceLabel = r.source === 'topic' ? '💡 自主创作' : '🔗 链接分析';
    var sourceClass = r.source === 'topic' ? 'topic' : 'link';
    html += '<div class="mgr-item" onclick="resumeRecord(\'' + r.id + '\')" style="cursor:pointer">';
    html += '<div class="mgr-item-avatar">' + icon + '</div>';
    html += '<div class="mgr-item-info"><div class="mgr-item-name">' + escapeHtml(r.title) + '</div>';
    html += '<div class="mgr-item-detail">' + dateStr + ' · ' + statusText + '</div></div>';
    html += '<span class="record-source ' + sourceClass + '">' + sourceLabel + '</span>';
    html += '<div class="mgr-item-actions"><button onclick="event.stopPropagation();deleteRecord(\'' + r.id + '\')" style="color:#e57373">删除</button></div>';
    html += '</div>';
  });

  // Pagination
  if (totalPages > 1) {
    html += '<div class="records-pagination">';
    html += '<button ' + (recordsPage === 0 ? 'disabled' : '') + ' onclick="renderRecords(' + (recordsPage - 1) + ')">上一页</button>';
    html += '<span>第 ' + (recordsPage + 1) + '/' + totalPages + ' 页</span>';
    html += '<button ' + (recordsPage >= totalPages - 1 ? 'disabled' : '') + ' onclick="renderRecords(' + (recordsPage + 1) + ')">下一页</button>';
    html += '</div>';
  }

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
    '    "totalDuration": "预估总时长（必填）",\n' +
    '    "directorBrief": {\n' +
    '      "coreIdea": "核心创意一句话：这个视频讲什么、为什么能火（必填）",\n' +
    '      "hookDesign": "前3秒钩子设计：具体画面是什么 + 为什么能抓住人（必填）",\n' +
    '      "emotionalTone": "情绪基调：整体色彩倾向/节奏感/语气风格，如 暖黄色调·快节奏·压迫感旁白（必填）",\n' +
    '      "visualReference": "视觉参考：像哪个账号/电影/摄影师的风格，如 日系生活美学·滨田英明风·低饱和暖调（必填）"\n' +
    '    },\n' +
    '    "keyFrames": ["前3秒抓眼球的具体画面", "中间转折/反差的画面", "结尾情绪落点的画面"],\n' +
    '    "preShotHints": {\n' +
    '      "suggestedCharacters": "建议角色数量和人设（如：1名主角·教导者风格·30岁男性 休闲装）",\n' +
    '      "suggestedScene": "建议场景（如：居家厨房·温馨氛围）",\n' +
    '      "suggestedProps": "建议关键道具（如：手机、灌肠模具）",\n' +
    '      "suggestedDuration": "建议时长 15s/30s/45s/60s（如：30s）",\n' +
    '      "suggestedRatio": "建议比例 9:16/16:9/1:1（如：9:16）"\n' +
    '    }\n' +
    '  }\n' +
    '}\n\n' +
    '## 硬性要求\n' +
    '- totalDuration 如实反映视频时长\n' +
    '- keyFrames 必须覆盖用户描述中所有重要情节/对话/转折点！如果用户提到了6个要点，keyFrames就至少要6个！禁止缩减内容，15秒也可以有6个画面\n' +
    '- 用户描述中的所有台词、情节、要点都必须保留，不得省略任何一个\n' +
    '- hookDesign 要说清楚前3秒的画面内容，不是"用悬念吸引"这种空话\n' +
    '- visualReference 要具体到风格/摄影师/账号名，不要写"现代简约"\n' +
    (currentDialect !== '普通话' ? '- 台词语言：' + currentDialect + '。所有 dialogue 字段必须用' + currentDialect + '书写\n' : '') +
    '- 纯 JSON 输出，不要 ```json``` 包裹';
}

function buildCharAssignHint() {
  // Extract character assignments from current shots to maintain consistency on regenerate
  var sb = (currentStoryboard.storyboard || currentStoryboard) || currentDirectorAnalysis;
  var shots = sb.shots || [];
  var assigned = {};
  shots.forEach(function(shot) {
    (shot.subjects || []).forEach(function(s) {
      if (s.characterId && s.characterName) {
        assigned[s.characterName] = s.characterId;
      }
    });
  });
  var keys = Object.keys(assigned);
  if (!keys.length) return '';
  var lines = keys.map(function(name) {
    var ch = findCharById(assigned[name]);
    if (ch) return '- ' + name + ' → 使用形象库中的 "' + ch.name + '"（' + (ch.gender || '') + '，' + (ch.clothing || '') + '）';
    return '- ' + name + ' → 保持';
  }).join('\n');
  return '\n## 当前角色分配（请保持一致）\n' + lines + '\n';
}

// Phase 2: shots based on confirmed director analysis
function buildShotsSystemPrompt(batchInfo) {
  var da = currentDirectorAnalysis || {};
  var db = da.directorBrief || {};
  var charList = characterProfiles.map(function(c) {
    return '- ' + c.id + ': ' + c.name + ' (' + c.type + ', ' + [c.gender, c.clothing].filter(Boolean).join(', ') + ')';
  }).join('\n');
  var sceneList = sceneProfiles.map(function(s) {
    return '- ' + s.id + ': ' + s.name + ' (' + [s.environment, s.atmosphere, s.lighting].filter(Boolean).join(' | ') + ')';
  }).join('\n');

  var prompt = '你是短视频导演助手。根据已确认的导演分析，生成分镜脚本 JSON。\n\n' +
    '## 已确认的导演分析\n' +
    '标题：' + (da.title || '') + '\n' +
    '总时长：' + (da.totalDuration || '') + '\n' +
    '核心创意：' + (db.coreIdea || '') + '\n' +
    '钩子设计：' + (db.hookDesign || '') + '\n' +
    '情绪基调：' + (db.emotionalTone || '') + '\n' +
    '视觉参考：' + (db.visualReference || '') + '\n' +
    '关键画面：' + ((da.keyFrames || []).join(' / ')) + '\n';

  // Batch context
  if (batchInfo) {
    prompt += '\n## 分批生成信息\n' +
      '- 当前批次：第 ' + (batchInfo.batchIndex + 1) + '/' + batchInfo.totalBatches + ' 批\n' +
      '- 本批时间范围：' + batchInfo.startTime + 's - ' + batchInfo.endTime + 's（共约' + (batchInfo.endTime - batchInfo.startTime) + '秒）\n' +
      '- 本批最多 6 个镜头，每镜 2-5 秒，自由分配\n';
    if (batchInfo.prevBatchSummary) {
      prompt += '\n## 上一批摘要（仅供连续性参考，严禁重复）\n' +
        batchInfo.prevBatchSummary + '\n' +
        '⚠️ 以上摘要描述的是已完成的内容。你必须生成全新的镜头，禁止出现摘要中提到的任何台词、动作或画面。故事要向前推进，不要原地踏步。\n';
    }
  }

  prompt +=
    (currentPreScene ? '\n主场景（所有镜头默认使用）：' + currentPreScene : '') +
    (currentPreCharIds.length > 0 ? '\n默认出场角色ID列表（必须全部出场）：' + currentPreCharIds.join(',') : '') +
    (keyProps ? '\n关键道具（必须在至少2个镜头中作为动作核心出现，不可仅作为背景）：' + keyProps : '') +
    '\n视频比例：' + currentPreRatio + '  帧率：' + currentPreFps + 'fps\n' +
    '台词语言：' + currentDialect + '。所有 dialogue 字段必须用' + currentDialect + '书写，严禁使用其他语言\n' +
    buildCharAssignHint() + '\n' +
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
    '      "action": "具体动作（必填，涉及道具必须写出道具如何被使用）",\n' +
    '      "keyProps": ["本镜出现的道具名称（无则空数组）"],\n' +
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
    '## 硬性要求\n';

  if (batchInfo) {
    prompt += '- 本批时间范围：' + batchInfo.startTime + 's - ' + batchInfo.endTime + 's。每镜 2-5 秒，本批最多 6 个镜头\n';
  } else {
    prompt += '- 总时长：' + currentPreDuration + 's。每镜 2-5 秒，自动计算镜头数。\n' +
      '- 镜头数量：最多 6 个镜头。只保留最关键的情节转折点和核心信息，合并重复场景的动作\n';
  }

  prompt +=
    (keyProps ? '- 关键道具 ' + keyProps + ' 必须在至少2个镜头的 action 中作为核心出现，keyProps 字段明确标注，写清楚道具如何被手持/展示/互动\n' : '') +
    '- 所有 dialogue 台词必须用' + currentDialect + '书写，包括语气词也要符合' + currentDialect + '的表达习惯\n' +
    '- 每个镜头的 action 必须具体到身体动作和物体变化，不要写"进行展示"这种空话\n' +
    '- 运镜必须从运镜手法参考中选择，写出完整名称如"缓推 dolly in"\n' +
    '- 焦段根据景别选择：特写85mm+，近景50mm，中景35mm，全景24mm\n' +
    '- 第2镜起必填 continuity：{"transition":"硬切/叠化/甩镜头/匹配剪辑","carryOver":["延续元素"],"newElements":["新元素"],"eyeLine":"视线方向变化","actionLink":"动作因果关系","emotionLink":"情绪变化","cameraLink":"运镜对比"}\n' +
    '- 纯 JSON 输出，不要 ```json``` 包裹\n\n' +
    '## 可用资源\n' +
    '角色库：\n' + (charList || '（空）') + '\n' +
    '场景库：\n' + (sceneList || '（空）') + '\n';

  return prompt;
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
  if (!Array.isArray(da.keyFrames) || da.keyFrames.length === 0) {
    // Try to derive from coreIdea
    da.keyFrames = [db.hookDesign || db.coreIdea || '开场画面', db.coreIdea || '核心画面', '结尾画面'];
  }
  var hints = da.preShotHints = da.preShotHints || {};
  hints.suggestedCharacters = hints.suggestedCharacters || '1名主角·自然风格';
  hints.suggestedScene = hints.suggestedScene || '居家·温馨';
  hints.suggestedProps = hints.suggestedProps || '';
  hints.suggestedDuration = hints.suggestedDuration || '30s';
  hints.suggestedRatio = hints.suggestedRatio || '9:16';
}

// Phase 2: generate first batch of shots
async function generateShots() {
  inPreShotSettings = false;
  preShotHintsApplied = false;
  console.log('[generateShots] CALLED, apiKey:', settings.apiKey ? 'yes' : 'no');
  if (!settings.apiKey) {
    alert('请先在「我的」→ 设置 中配置 API Key');
    return;
  }

  isGenerating = true;
  updateStopButton();

  var totalDuration = parseInt(currentPreDuration) || 30;
  var numBatches = Math.ceil(totalDuration / 15);
  var batchSec = 15;

  // Initialize batches
  shotBatches = [];
  for (var b = 0; b < numBatches; b++) {
    var startT = b * batchSec;
    var endT = Math.min((b + 1) * batchSec, totalDuration);
    shotBatches.push({ shots: [], startTime: startT, endTime: endT, generated: false });
  }
  currentBatchTab = 0;

  var board = document.getElementById('sbBoard');
  board.innerHTML = '<div style="text-align:center;padding:80px 20px;color:#8a8278"><div style="font-size:3rem;margin-bottom:16px">🎥</div><div style="font-size:.95rem;font-weight:600;margin-bottom:8px">AI 正在生成第 1/' + numBatches + ' 批分镜…</div><div style="font-size:.72rem">0s - ' + shotBatches[0].endTime + 's</div></div>';

  try {
    await generateOneBatch(0);
    currentDirectorAnalysis.shots = mergeBatchShots();
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

async function generateOneBatch(batchIndex) {
  console.log('[generateOneBatch] batch', batchIndex);
  var batch = shotBatches[batchIndex];
  var prevSummary = '';
  if (batchIndex > 0) {
    var prevBatch = shotBatches[batchIndex - 1];
    if (prevBatch.generated) prevSummary = buildBatchSummary(prevBatch);
  }

  var batchInfo = {
    batchIndex: batchIndex,
    totalBatches: shotBatches.length,
    startTime: batch.startTime,
    endTime: batch.endTime,
    prevBatchSummary: prevSummary
  };

  var systemPrompt = buildShotsSystemPrompt(batchInfo);
  console.log('[generateOneBatch] systemPrompt length:', systemPrompt.length);
  var userPrompt = '请生成第 ' + (batchIndex + 1) + ' 批分镜脚本（' + batch.startTime + 's-' + batch.endTime + 's）。';
  var streamText = await doStoryboardApiCall(systemPrompt, userPrompt, { maxTokens: 8192, timeout: 120000, noStream: true });
  console.log('[generateOneBatch] API returned, length:', streamText.length);

  var jsonText = collectStreamJson(streamText);
  if (!jsonText) {
    console.log('[generateOneBatch] PARSE FAILED, raw:', streamText);
    throw new Error('第' + (batchIndex + 1) + '批分镜JSON解析失败');
  }

  var data = JSON.parse(jsonText);
  var shots = Array.isArray(data) ? data : (data.shots || []);
  if (!Array.isArray(shots) || shots.length === 0) throw new Error('第' + (batchIndex + 1) + '批分镜数据为空');

  // Assign global shot IDs
  var startId = 0;
  for (var i = 0; i < batchIndex; i++) {
    startId += shotBatches[i].shots.length;
  }
  shots.forEach(function(shot, i) {
    shot.id = 'shot_' + (startId + i + 1);
  });
  normalizeShotsArray(shots, batchIndex > 0);

  batch.shots = shots;
  batch.generated = true;
  console.log('[generateOneBatch] batch', batchIndex, 'done:', shots.length, 'shots');
}

async function generateNextBatch(batchIndex) {
  console.log('[generateNextBatch] batch', batchIndex);
  if (!settings.apiKey) { alert('请先配置 API Key'); return; }

  // Immediately show generating state on the button
  var btn = document.querySelector('.sb-actions-bar .primary');
  if (btn) { btn.textContent = '⏳ 生成中…'; btn.disabled = true; }

  isGenerating = true;
  updateStopButton();

  var board = document.getElementById('sbBoard');
  try {
    await generateOneBatch(batchIndex);
    currentDirectorAnalysis.shots = mergeBatchShots();
    currentStoryboard = { storyboard: currentDirectorAnalysis };
    updateRecord(activeRecordId, { status: 'completed', storyboard: JSON.parse(JSON.stringify(currentStoryboard)) });
    currentBatchTab = batchIndex;
    renderShotsPage();
  } catch(e) {
    console.error('[generateNextBatch] error:', e.message || e);
    alert('第' + (batchIndex + 1) + '批生成失败：' + (e.message || '未知错误'));
    renderShotsPage();
  }

  isGenerating = false;
  updateStopButton();
}

function buildBatchSummary(batch) {
  var shots = batch.shots || [];
  if (!shots.length) return '';
  var last = shots[shots.length - 1];

  var subjects = (last.subjects || []).map(function(s) { return s.characterName || ''; }).filter(Boolean);
  var lastEmotion = last.emotionBeat || '';
  var sceneName = (last.scene || {}).sceneName || (last.scene || {}).environment || '';

  var summary = '';
  if (subjects.length) summary += '- 当前画面中的人物：' + subjects.join('、') + '\n';
  if (sceneName) summary += '- 当前场景：' + sceneName + '\n';
  if (lastEmotion) summary += '- 当前情绪位置：' + lastEmotion + '\n';
  summary += '- 上一批时间范围：' + batch.startTime + 's - ' + batch.endTime + 's（已完成，不要重复）\n';
  summary += '- 请从 ' + batch.endTime + 's 开始生成全新的下一段内容\n';
  summary += '- 重要：以上是已完成的镜头，禁止复读上述台词、动作或画面。请延续故事发展，推进到下一个情节点\n';
  return summary;
}

function mergeBatchShots() {
  var all = [];
  shotBatches.forEach(function(b) {
    if (b.generated && b.shots.length) all = all.concat(b.shots);
  });
  return all;
}

function normalizeShotsArray(shots, isContinuation) {
  shots.forEach(function(shot, i) {
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
    if (i > 0 || isContinuation) {
      if (!shot.continuity) {
        shot.continuity = { transition: '硬切', carryOver: [], newElements: [], eyeLine: '', actionLink: '', emotionLink: '', cameraLink: '' };
      }
    }
  });
}

function extractCharNamesFromDA(da) {
  if (currentPreCharIds.length > 0) {
    return currentPreCharIds.map(function(id) {
      var ch = findCharById(id);
      return ch ? ch.name : '';
    }).filter(Boolean);
  }
  var names = [];
  if (da && da.characterNames && Array.isArray(da.characterNames)) {
    names = da.characterNames;
  }
  if (characterProfiles.length > 0 && names.length === 0) {
    names = characterProfiles.map(function(c) { return c.name; });
  }
  return names.filter(function(n, i) { return n && names.indexOf(n) === i; });
}

// ============================================================
// STORYBOARD — RENDER (Phase 1: Director Review)
// ============================================================
// Page 1: Director analysis only
function renderDirectorReview() {
  var board = document.getElementById('sbBoard');
  var da = currentDirectorAnalysis;
  if (!da || !board) return;
  var db = da.directorBrief || {};
  var kf = da.keyFrames || [];

  var html = '';

  // Title + duration
  html += '<div style="text-align:center;padding:12px 0 8px"><span style="font-size:1.15rem;font-weight:700">🎬 ' + escapeHtml(da.title || '未命名') + '</span><span style="font-size:.72rem;color:#8a8278;margin-left:8px">' + escapeHtml(da.totalDuration || '') + '</span></div>';

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

  // Pre-shot hints
  var hints = da.preShotHints || {};
  html += '<div class="sb-section" style="margin-top:10px">';
  html += '<div class="sb-section-header"><span>💡 分镜设置建议</span></div>';
  html += '<div class="sb-section-body" style="font-size:.78rem;line-height:1.8;color:#6b6560">';
  html += '<div>👤 角色：' + escapeHtml(hints.suggestedCharacters || '1名主角') + '</div>';
  html += '<div>🏠 场景：' + escapeHtml(hints.suggestedScene || '居家') + '</div>';
  html += '<div>📦 道具：' + escapeHtml(hints.suggestedProps || '无特殊道具') + '</div>';
  html += '<div>⏱ 时长建议：' + escapeHtml(hints.suggestedDuration || '30s') + ' &nbsp;|&nbsp; 📐 比例建议：' + escapeHtml(hints.suggestedRatio || '9:16') + '</div>';
  html += '</div></div>';

  // Confirm button → go to pre-shot settings
  html += '<div style="text-align:center;padding:12px 0">';
  html += '<button class="dialog-btn secondary" onclick="resetToInterview()" style="margin-right:8px;font-size:.78rem;padding:8px 20px">🔄 重新来</button>';
  html += '<button class="dialog-btn primary" onclick="renderPreShotSettings()" style="font-size:.88rem;padding:10px 32px">确认，设置分镜参数 →</button>';
  html += '</div>';

  board.innerHTML = html;
  board.style.display = 'flex';
  inPreShotSettings = false;
}

// Page 2: Pre-shot settings (separate page)
function renderPreShotSettings() {
  inPreShotSettings = true;
  var board = document.getElementById('sbBoard');
  if (!board) return;

  // Apply director hints as defaults on first entry only
  if (!preShotHintsApplied) {
    preShotHintsApplied = true;
    var hints = (currentDirectorAnalysis || {}).preShotHints || {};
    if (!currentPreScene && hints.suggestedScene) currentPreScene = hints.suggestedScene;
    if (!keyProps && hints.suggestedProps) keyProps = hints.suggestedProps;
    if (hints.suggestedDuration) currentPreDuration = hints.suggestedDuration;
    if (hints.suggestedRatio) currentPreRatio = hints.suggestedRatio;
  }

  var charNames = currentPreCharIds.map(function(id) {
    var ch = findCharById(id);
    return ch ? ch.name : '';
  }).filter(Boolean);
  var allSet = currentPreCharIds.length > 0 && currentPreScene && keyProps;

  var html = '';

  html += '<div style="text-align:center;padding:8px 0 6px"><span style="font-size:1rem;font-weight:700">🎯 分镜前设定</span><span style="font-size:.68rem;color:#8a8278;margin-left:6px">全部必选</span></div>';

  html += '<div class="sb-pre-shots">';

  // Character row
  html += '<div class="sb-pre-row" onclick="pickPreChar()"><span class="sb-pre-label">👤 角色</span>';
  html += '<span class="sb-pre-val ' + (charNames.length > 0 ? '' : 'empty') + '">' + (charNames.length > 0 ? charNames.join('、') : '点击选择') + '</span>';
  html += '<span class="sb-pre-edit">选角色 →</span></div>';

  // Scene row
  html += '<div class="sb-pre-row" onclick="pickSceneForPreShot(\'' + (currentPreScene || '') + '\')"><span class="sb-pre-label">🏠 场景</span>';
  html += '<span class="sb-pre-val ' + (currentPreScene ? '' : 'empty') + '">' + (currentPreScene || '点击选择') + '</span>';
  html += '<span class="sb-pre-edit">选场景 →</span></div>';

  // Props row
  html += '<div class="sb-pre-row" onclick="pickPreProps()"><span class="sb-pre-label">📦 道具</span>';
  html += '<span class="sb-pre-val ' + (keyProps ? '' : 'empty') + '">' + (keyProps || '点击设置') + '</span>';
  html += '<span class="sb-pre-edit">设道具 →</span></div>';

  // Duration row
  html += '<div class="sb-pre-row"><span class="sb-pre-label">⏱ 时长</span>';
  html += '<span class="sb-pre-val">';
  ['15','30','45','60'].forEach(function(d) {
    html += '<span class="sb-dur-chip' + (currentPreDuration === d ? ' active' : '') + '" onclick="setPreDuration(\'' + d + '\')">' + d + 's</span>';
  });
  html += '</span></div>';

  // Ratio row
  html += '<div class="sb-pre-row"><span class="sb-pre-label">📐 比例</span>';
  html += '<span class="sb-pre-val">';
  [{v:'9:16',l:'9:16 竖屏'},{v:'16:9',l:'16:9 横屏'},{v:'1:1',l:'1:1 方形'}].forEach(function(r) {
    html += '<span class="sb-dur-chip' + (currentPreRatio === r.v ? ' active' : '') + '" onclick="setPreRatio(\'' + r.v + '\')">' + r.l + '</span>';
  });
  html += '</span></div>';

  // Fps row
  html += '<div class="sb-pre-row"><span class="sb-pre-label">🎞 帧率</span>';
  html += '<span class="sb-pre-val">';
  [{v:'24',l:'24fps'},{v:'30',l:'30fps'},{v:'60',l:'60fps'}].forEach(function(f) {
    html += '<span class="sb-dur-chip' + (currentPreFps === f.v ? ' active' : '') + '" onclick="setPreFps(\'' + f.v + '\')">' + f.l + '</span>';
  });
  html += '</span></div>';

  // Dialect row
  html += '<div class="sb-pre-row" onclick="pickDialect()"><span class="sb-pre-label">🗣 方言</span>';
  html += '<span class="sb-pre-val">' + escapeHtml(currentDialect || '普通话') + '</span>';
  html += '<span class="sb-pre-edit">选方言 →</span></div>';

  html += '</div>';

  // Confirm buttons
  html += '<div style="text-align:center;padding:4px 0 12px">';
  html += '<button class="dialog-btn secondary" onclick="renderDirectorReview()" style="margin-right:8px;font-size:.78rem;padding:8px 20px">← 返回导演分析</button>';
  html += '<button class="dialog-btn primary" id="btnConfirmDirector" onclick="generateShots()" style="font-size:.88rem;padding:10px 32px"' + (allSet ? '' : ' disabled') + '>确认，生成分镜 ✨</button>';
  if (!allSet) html += '<div style="font-size:.65rem;color:#e57373;margin-top:4px">请先选择角色、场景和道具（上方带虚线的项）</div>';
  html += '</div>';

  board.innerHTML = html;
  board.style.display = 'flex';
}

var inPreShotSettings = false;
var preShotHintsApplied = false;

function rerenderBoard() {
  if (currentDirectorAnalysis && currentDirectorAnalysis.shots && currentDirectorAnalysis.shots.length > 0) {
    inPreShotSettings = false;
    renderShotsPage();
  } else if (inPreShotSettings) {
    renderPreShotSettings();
  } else {
    renderDirectorReview();
  }
}

// Shot gallery state
var galleryIndex = 0;

function getCurrentBatchShots() {
  if (shotBatches.length > 0 && currentBatchTab < shotBatches.length) {
    return shotBatches[currentBatchTab].shots || [];
  }
  return (currentDirectorAnalysis || {}).shots || [];
}

function changeGallery(dir) {
  var shots = getCurrentBatchShots();
  var newIdx = galleryIndex + dir;
  if (newIdx < 0 || newIdx >= shots.length) return;
  galleryIndex = newIdx;
  renderGallerySlide();
}

function goGallery(idx) {
  var shots = getCurrentBatchShots();
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
  var shots = getCurrentBatchShots();
  if (!container || !shots.length) return;

  container.innerHTML = renderOneShotCard(shots[galleryIndex], galleryIndex);

  if (dots) {
    var dotsHtml = '';
    for (var i = 0; i < shots.length; i++) {
      dotsHtml += '<span class="gallery-dot' + (i === galleryIndex ? ' active' : '') + '" onclick="goGallery(' + i + ')"></span>';
    }
    dots.innerHTML = dotsHtml;
  }

  for (var i = 0; i < shots.length; i++) {
    var item = document.getElementById('emotionItem' + i);
    if (item) item.classList.toggle('active', i === galleryIndex);
  }

  if (counter) counter.textContent = '第 ' + (galleryIndex + 1) + '/' + shots.length + ' 镜';
  if (prevBtn) prevBtn.disabled = galleryIndex === 0;
  if (nextBtn) nextBtn.disabled = galleryIndex >= shots.length - 1;
}

// Standalone shots page with gallery + batch tabs
function renderShotsPage() {
  var board = document.getElementById('sbBoard');
  var da = currentDirectorAnalysis;
  if (!da || !board) return;
  var batchShots = getCurrentBatchShots();
  galleryIndex = 0;

  var html = '';

  // Batch tabs (only if multi-batch)
  if (shotBatches.length > 1) {
    html += '<div class="batch-tabs">';
    shotBatches.forEach(function(b, i) {
      var label = b.startTime + '-' + b.endTime + 's';
      var cls = 'batch-tab';
      if (i === currentBatchTab) cls += ' active';
      if (b.generated) cls += ' done';
      else cls += ' pending';
      html += '<span class="' + cls + '" onclick="switchBatchTab(' + i + ')">';
      html += b.generated ? '✓ ' : '';
      html += label + ' (' + (b.shots.length || '待生成') + ')';
      html += '</span>';
    });
    html += '</div>';
  }

  // Header
  var totalShots = (da.shots || []).length;
  html += '<div class="sb-shots-header">';
  html += '<button class="sb-nav-btn secondary" onclick="renderDirectorReview()" style="font-size:.72rem;padding:6px 14px">← 导演分析</button>';
  html += '<span style="font-weight:700;font-size:.85rem;flex:1;text-align:center">🎥 ' + escapeHtml(da.title || '分镜') + '</span>';
  html += '<span style="font-size:.68rem;color:#8a8278">' + escapeHtml(da.totalDuration || '') + ' · ' + totalShots + '镜</span>';
  html += '</div>';

  // Current batch label for multi-batch
  if (shotBatches.length > 1 && batchShots.length > 0) {
    var cb = shotBatches[currentBatchTab];
    html += '<div style="text-align:center;font-size:.68rem;color:#5b9a8b;padding:2px 0 4px">第' + (currentBatchTab + 1) + '段 ' + cb.startTime + '-' + cb.endTime + 's</div>';
  }

  // Emotion flow strip (current batch only)
  html += '<div class="emotion-flow">';
  batchShots.forEach(function(shot, i) {
    html += '<span class="emotion-flow-item' + (i === 0 ? ' active' : '') + '" onclick="goGallery(' + i + ')" id="emotionItem' + i + '">' + escapeHtml(shot.emotionBeat || '第'+(i+1)+'镜') + '</span>';
    if (i < batchShots.length - 1) {
      var trans = (shot.continuity && shot.continuity.transition) ? shot.continuity.transition : '→';
      html += '<span class="emotion-flow-arrow">' + escapeHtml(trans) + '</span>';
    }
  });
  html += '</div>';

  // Gallery navigation (current batch only)
  html += '<div class="gallery-nav">';
  html += '<button class="gallery-arrow" id="sbGalleryPrev" onclick="changeGallery(-1)" disabled>◀</button>';
  html += '<div class="gallery-viewport" id="sbShotCard">' + (batchShots.length > 0 ? renderOneShotCard(batchShots[0], 0) : '<div style="text-align:center;padding:40px;color:#8a8278">本段尚未生成</div>') + '</div>';
  html += '<button class="gallery-arrow" id="sbGalleryNext" onclick="changeGallery(1)" ' + (batchShots.length < 2 ? 'disabled' : '') + '>▶</button>';
  html += '</div>';

  // Counter + dots (current batch only)
  html += '<div style="text-align:center;padding:4px 0">';
  html += '<span id="sbGalleryCounter" style="font-size:.72rem;color:#8a8278">' + (batchShots.length > 0 ? '第 1/' + batchShots.length + ' 镜' : '') + '</span>';
  html += '</div>';
  html += '<div class="gallery-dots" id="sbGalleryDots">';
  for (var i = 0; i < batchShots.length; i++) {
    html += '<span class="gallery-dot' + (i === 0 ? ' active' : '') + '" onclick="goGallery(' + i + ')"></span>';
  }
  html += '</div>';

  // Primary actions
  var allChars = getStoryboardChars();
  if (allChars.length >= 2) {
    html += '<button class="sb-action-btn" onclick="swapStoryboardChars()" title="互换两个角色的所有出场">🔄 互换角色</button>';
  }

  html += '<div class="sb-actions-bar" style="border-top:1px solid #f0ece4;padding-top:10px">';
  html += '<button class="sb-action-btn" onclick="exportStoryboardPrompts()">📋 即梦提示词</button>';

  // Regenerate current batch
  html += '<button class="sb-action-btn" onclick="regenerateCurrentBatch()" style="font-size:.68rem">🔄 重生成当前段</button>';

  if (batchShots.length > 0) {
    html += '<button class="sb-action-btn" onclick="openShotEditor(galleryIndex)" style="font-size:.68rem">✏️ 镜头修改</button>';
  }

  // Generate next batch button
  var nextUngenerated = -1;
  for (var b = 0; b < shotBatches.length; b++) {
    if (!shotBatches[b].generated) { nextUngenerated = b; break; }
  }
  if (nextUngenerated >= 0) {
    html += '<button class="sb-action-btn primary" onclick="generateNextBatch(' + nextUngenerated + ')" style="font-size:.78rem">▶ 生成下一段 (' + shotBatches[nextUngenerated].startTime + '-' + shotBatches[nextUngenerated].endTime + 's)</button>';
  } else if (shotBatches.length > 1) {
    html += '<span style="font-size:.72rem;color:#4a7c59;padding:6px 0">✅ 全部 ' + shotBatches.length + ' 段已生成</span>';
  }

  html += '</div>';

  board.innerHTML = html;
  board.style.display = 'flex';
}

function switchBatchTab(idx) {
  if (idx < 0 || idx >= shotBatches.length) return;
  currentBatchTab = idx;
  galleryIndex = 0;
  renderShotsPage();
}

async function regenerateCurrentBatch() {
  if (!settings.apiKey) { alert('请先配置 API Key'); return; }
  // Fallback for old records without batches: regenerate everything
  if (shotBatches.length === 0) {
    generateShots();
    return;
  }
  var bi = currentBatchTab;
  shotBatches[bi].generated = false;
  shotBatches[bi].shots = [];

  var board = document.getElementById('sbBoard');
  board.innerHTML = '<div style="text-align:center;padding:60px 20px;color:#8a8278"><div style="font-size:2rem;margin-bottom:12px">🔄</div><div style="font-weight:600">正在重新生成第' + (bi + 1) + '段…</div></div>';

  isGenerating = true;
  updateStopButton();
  try {
    await generateOneBatch(bi);
    currentDirectorAnalysis.shots = mergeBatchShots();
    currentStoryboard = { storyboard: currentDirectorAnalysis };
    updateRecord(activeRecordId, { status: 'completed', storyboard: JSON.parse(JSON.stringify(currentStoryboard)) });
  } catch(e) {
    alert('重新生成失败：' + (e.message || '未知错误'));
  }
  isGenerating = false;
  updateStopButton();
  renderShotsPage();
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
  var record = createRecord(answersToSave, pendingRecordSource);
  pendingRecordSource = 'link';  // reset
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
    preShotHintsApplied = false;
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
  // Fix missing colon+quote: "key" value" → "key": "value"
  fixed3 = fixed3.replace(/"\s+([^\{\[\}\],:\s"][^,\}\]\n]*)"/g, '": "$1"');
  // Fix missing colon before { or [ :  "key" { → "key": {   and   "key" [ → "key": [
  fixed3 = fixed3.replace(/"\s*(\{)/g, '": $1');
  fixed3 = fixed3.replace(/"\s*(\[)/g, '": $1');
  // Fix missing opening quote in key names: ,position" → ,"position"
  fixed3 = fixed3.replace(/([,\{\[])\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*"/g, '$1"$2"');
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

async function doStoryboardApiCall(systemPrompt, userPrompt, opts) {
  abortController = new AbortController();
  var model = settings.model === 'custom' ? settings.customModel : settings.model;
  opts = opts || {};
  console.log('[doStoryboardApiCall] endpoint:', settings.endpoint, 'model:', model);

  // timeout
  var timeoutMs = opts.timeout || 30000;
  var timeoutId = setTimeout(function() { abortController.abort(); }, timeoutMs);

  var messages = [
    { role: 'system', content: '[System Prompt]\n' + systemPrompt },
    { role: 'user', content: userPrompt }
  ];

  var body = {
    model: model,
    messages: messages,
    stream: !opts.noStream,
    temperature: 0.7,
    max_tokens: opts.maxTokens || 4096
  };
  if (!opts.noJsonFormat) { body.response_format = { type: 'json_object' }; }

  try {
  var resp = await fetch(settings.endpoint + '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + settings.apiKey },
    body: JSON.stringify(body),
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

  // Non-streaming: parse single response
  if (opts.noStream) {
    clearTimeout(timeoutId);
    var json = await resp.json();
    var content = json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
    console.log('[doStoryboardApiCall] non-stream response, length:', content ? content.length : 0);
    return content || '';
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

  // Characters row — each name is clickable to swap individually
  html += '<div class="shot-info-row">';
  html += '<span class="shot-info-icon">👤</span>';
  var charNames = subjects.map(function(s, i) {
    var name = s.characterName || '未指定';
    return '<span class="shot-char-name" onclick="pickCharForSubject(\'' + escapeHtml(shot.id) + '\',' + i + ')" title="点击切换角色">' + escapeHtml(name) + '</span>';
  });
  html += '<span class="shot-info-text">' + charNames.join(' → ') + '</span>';
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
  var sb = currentStoryboard.storyboard || currentStoryboard;
  var batchShots = getCurrentBatchShots();
  var shot = batchShots[index];
  if (!shot) return;
  // Find global index in merged shots
  var allShots = sb.shots || [];
  var globalIndex = -1;
  for (var g = 0; g < allShots.length; g++) {
    if (allShots[g].id === shot.id) { globalIndex = g; break; }
  }
  if (globalIndex < 0) return;
  editingShotIndex = globalIndex;

  document.getElementById('seIndex').value = globalIndex;

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
// ============================================================
// PICKER (visual character/scene selector)
// ============================================================
var pickerMode = '';      // 'char' or 'scene'
var pickerFromName = '';  // which item to replace

function closePicker() {
  document.getElementById('pickerOverlay').classList.remove('open');
}

function pickChar(fromName) {
  pickerFromName = fromName;
  pickerMode = 'char';
  if (!characterProfiles.length) { alert('请先在「我的」中创建形象'); return; }

  document.getElementById('pickerTitle').textContent = '🔄 换角色';
  var currentList = document.getElementById('pickerCurrentList');
  currentList.innerHTML = '<span class="picker-tag selected" style="background:#5b9a8b;color:#fff">' + escapeHtml(fromName) + '</span>';

  var list = document.getElementById('pickerList');
  list.innerHTML = '<div class="picker-item" onclick="confirmPickChar(\'\', \'清除（不指定角色）\')" style="color:#e57373">✕ 清除角色</div>' +
    characterProfiles.map(function(c) {
      return '<div class="picker-item" onclick="confirmPickChar(\'' + c.id + '\', \'' + escapeHtml(c.name) + '\')">' +
        '<span class="picker-avatar">' + (c.gender === '男' ? '👨' : '👩') + '</span>' +
        '<div><div class="picker-name">' + escapeHtml(c.name) + '</div>' +
        '<div class="picker-detail">' + escapeHtml([c.gender, c.age, c.clothing].filter(Boolean).join(' · ')) + '</div></div>' +
        '</div>';
    }).join('');

  document.getElementById('pickerOverlay').classList.add('open');
}

function confirmPickChar(id, name) {
  closePicker();
  // Pre-shot phase: just set/add the character
  if (!currentDirectorAnalysis || !currentDirectorAnalysis.shots || currentDirectorAnalysis.shots.length === 0) {
    if (id && currentPreCharIds.indexOf(id) < 0) currentPreCharIds.push(id);
    renderDirectorReview();
    return;
  }
  // Post-shot phase: replace in existing shots
  var toChar = findCharById(id);
  var sb = (currentStoryboard.storyboard || currentStoryboard);
  (sb.shots || []).forEach(function(shot) {
    (shot.subjects || []).forEach(function(s) {
      if ((s.characterName || '') === pickerFromName || (s.characterName || '').indexOf(pickerFromName) >= 0) {
        s.characterId = id;
        s.characterName = name || '';
        if (toChar) {
          s.additionalDesc = [toChar.gender, toChar.age, toChar.clothing, toChar.features].filter(Boolean).join('，');
        }
      }
    });
  });
  rerenderBoard();
}

function getStoryboardChars() {
  var sb = (currentStoryboard && (currentStoryboard.storyboard || currentStoryboard)) || {};
  var shots = sb.shots || [];
  var names = [];
  shots.forEach(function(shot) {
    (shot.subjects || []).forEach(function(s) {
      if (s.characterName && names.indexOf(s.characterName) < 0) names.push(s.characterName);
    });
  });
  return names;
}

function swapStoryboardChars() {
  var names = getStoryboardChars();
  if (names.length < 2) { alert('至少需要两个不同角色才能互换'); return; }
  var a = prompt('要互换的第一个角色：\n当前角色：' + names.join('、'), names[0]);
  if (!a) return;
  var b = prompt('要互换的第二个角色：\n当前角色：' + names.join('、'), names[1]);
  if (!b) return;
  if (a === b) return;
  var sb = (currentStoryboard && (currentStoryboard.storyboard || currentStoryboard)) || {};
  (sb.shots || []).forEach(function(shot) {
    (shot.subjects || []).forEach(function(s) {
      if (s.characterName === a) s.characterName = b;
      else if (s.characterName === b) s.characterName = a;
    });
  });
  rerenderBoard();
}

function pickCharForSubject(shotId, subjIndex) {
  var sb = (currentStoryboard && (currentStoryboard.storyboard || currentStoryboard)) || {};
  var allShots = sb.shots || [];
  var shotIndex = -1;
  for (var i = 0; i < allShots.length; i++) {
    if (allShots[i].id === shotId) { shotIndex = i; break; }
  }
  if (shotIndex < 0) return;
  var shot = allShots[shotIndex];
  var subject = (shot.subjects || [])[subjIndex];
  if (!subject) return;
  pickerFromName = subject.characterName || '';
  pickerMode = 'char-single';
  window._pickCharForSubjectTarget = { shotIndex: shotIndex, subjIndex: subjIndex };

  document.getElementById('pickerTitle').textContent = '👤 切换角色';
  document.getElementById('pickerCurrentList').innerHTML = pickerFromName ? '<span class="picker-tag selected" style="background:#5b9a8b;color:#fff">当前：' + escapeHtml(pickerFromName) + '</span>' : '';
  var listHtml = characterProfiles.map(function(c) {
    return '<div class="picker-item" onclick="confirmPickCharForSubject(\'' + c.id + '\', \'' + escapeHtml(c.name) + '\')">' +
      '<span class="picker-avatar">' + (c.gender === '男' ? '👨' : '👩') + '</span>' +
      '<div><div class="picker-name">' + escapeHtml(c.name) + '</div>' +
      '<div class="picker-detail">' + escapeHtml([c.gender, c.age, c.clothing].filter(Boolean).join(' · ')) + '</div></div>' +
      '</div>';
  }).join('');
  document.getElementById('pickerList').innerHTML = listHtml;
  document.getElementById('pickerOverlay').classList.add('open');
}

function confirmPickCharForSubject(id, name) {
  closePicker();
  var t = window._pickCharForSubjectTarget;
  if (!t) return;
  var sb = (currentStoryboard && (currentStoryboard.storyboard || currentStoryboard)) || {};
  var shot = (sb.shots || [])[t.shotIndex];
  if (!shot) return;
  var subject = (shot.subjects || [])[t.subjIndex];
  if (!subject) return;
  subject.characterId = id;
  subject.characterName = name || '';
  var ch = findCharById(id);
  if (ch) subject.additionalDesc = [ch.gender, ch.age, ch.clothing, ch.features].filter(Boolean).join('，');
  rerenderBoard();
}

function replaceAllCharacters() {
  var sb = currentStoryboard.storyboard || currentStoryboard;
  var usedNames = [];
  var seen = {};
  sb.shots.forEach(function(shot) {
    (shot.subjects || []).forEach(function(s) {
      var key = s.characterName || '未命名角色';
      if (!seen[key]) { seen[key] = true; usedNames.push(key); }
    });
  });
  if (!usedNames.length) { alert('当前分镜中没有角色'); return; }

  // If only one character, go straight to picker
  if (usedNames.length === 1) { pickChar(usedNames[0]); return; }

  // Show which character to replace first
  document.getElementById('pickerTitle').textContent = '🔄 替换哪个角色？';
  document.getElementById('pickerCurrentList').innerHTML = '';
  var list = document.getElementById('pickerList');
  list.innerHTML = usedNames.map(function(n) {
    return '<div class="picker-item" onclick="pickChar(\'' + escapeHtml(n) + '\')">' +
      '<span class="picker-avatar">👤</span>' +
      '<div class="picker-name">' + escapeHtml(n) + '</div>' +
      '<span style="color:#5b9a8b;font-size:.7rem">替换 →</span>' +
      '</div>';
  }).join('');
  document.getElementById('pickerOverlay').classList.add('open');
}

// ============================================================
// DIALECTS
// ============================================================
var DEFAULT_DIALECTS = ['普通话', '重庆话', '武汉话', '河南话', '粤语', '东北话', '英语'];
var dialects = [];
var currentDialect = '普通话';

function loadDialects() {
  try { var d = JSON.parse(localStorage.getItem('zimeiti-v3-dialects')); if (Array.isArray(d)) dialects = d; } catch(e) {}
  if (!dialects.length) dialects = DEFAULT_DIALECTS.slice();
  try { var cd = localStorage.getItem('zimeiti-v3-current-dialect'); if (cd) currentDialect = cd; } catch(e) {}
}
function saveDialects() {
  try { localStorage.setItem('zimeiti-v3-dialects', JSON.stringify(dialects)); } catch(e) {}
  try { localStorage.setItem('zimeiti-v3-current-dialect', currentDialect); } catch(e) {}
}

function pickDialect() {
  document.getElementById('pickerTitle').textContent = '🗣 选择方言';
  document.getElementById('pickerCurrentList').innerHTML = '<span class="picker-tag selected" style="background:#5b9a8b;color:#fff">当前：' + escapeHtml(currentDialect) + '</span>';

  var list = document.getElementById('pickerList');
  list.innerHTML = dialects.map(function(d) {
    var sel = d === currentDialect ? ' style="border-color:#5b9a8b;background:#eef7f4"' : '';
    return '<div class="picker-item"' + sel + ' onclick="confirmDialect(\'' + escapeHtml(d) + '\')">' +
      '<span class="picker-avatar">🗣</span>' +
      '<div class="picker-name">' + escapeHtml(d) + '</div>' +
      (d === currentDialect ? '<span style="color:#5b9a8b;font-size:.7rem">✓ 当前</span>' : '') +
      '</div>';
  }).join('') +
  '<div style="border-top:1px dashed #e0dcd3;margin-top:6px;padding-top:6px">' +
  '<div style="display:flex;gap:6px">' +
  '<input class="me-input" id="newDialectName" placeholder="自定义方言…" style="flex:1;font-size:.75rem">' +
  '<button class="dialog-btn primary" onclick="addDialect()" style="font-size:.72rem;padding:6px 12px">+ 添加</button>' +
  '</div>' +
  '<div style="font-size:.65rem;color:#8a8278;margin-top:4px">点击已有方言可删除</div>' +
  '</div>';

  document.getElementById('pickerOverlay').classList.add('open');
}

function confirmDialect(name) {
  if (name === currentDialect) {
    if (name === '普通话') { closePicker(); return; }
    if (confirm('删除方言"' + name + '"？')) {
      dialects = dialects.filter(function(d) { return d !== name; });
      currentDialect = '普通话';
      saveDialects();
      updateAccountUI();
    }
    closePicker();
    return;
  }
  currentDialect = name;
  saveDialects();
  updateAccountUI();
  closePicker();
  // Refresh pre-shot panel if visible
  if (inPreShotSettings) {
    renderPreShotSettings();
  } else if (currentDirectorAnalysis && !(currentDirectorAnalysis.shots && currentDirectorAnalysis.shots.length > 0)) {
    renderDirectorReview();
  }
}

function addDialect() {
  var input = document.getElementById('newDialectName');
  var name = (input || {}).value ? input.value.trim() : '';
  if (!name) return;
  if (dialects.indexOf(name) >= 0) { alert('该方言已存在'); return; }
  dialects.push(name);
  currentDialect = name;
  saveDialects();
  updateAccountUI();
  input.value = '';
  pickDialect();
}

var keyProps = '';
var currentPreScene = '';  // pre-shot scene selection
var currentPreCharIds = [];  // pre-shot character selections (multi)
var currentPreDuration = '30';  // pre-shot duration: 15/30/45/60
var currentPreRatio = '9:16';   // pre-shot aspect ratio
var currentPreFps = '24';       // pre-shot frame rate
var shotBatches = [];           // [{shots, startTime, endTime, generated}]
var currentBatchTab = 0;        // active batch tab index

function pickSceneForPreShot(fromName) {
  pickerFromName = fromName;
  pickerMode = 'scene-preset';
  if (!sceneProfiles.length) { alert('请先在「我的」中创建场景'); return; }

  document.getElementById('pickerTitle').textContent = '🏠 选择主场景';
  document.getElementById('pickerCurrentList').innerHTML = currentPreScene ? '<span class="picker-tag selected" style="background:#5b9a8b;color:#fff">当前：' + escapeHtml(currentPreScene) + '</span>' : '';
  document.getElementById('pickerList').innerHTML = sceneProfiles.map(function(s) {
    var sel = s.name === currentPreScene ? ' style="border-color:#5b9a8b;background:#eef7f4"' : '';
    return '<div class="picker-item"' + sel + ' onclick="confirmPreScene(\'' + s.name + '\')">' +
      '<span class="picker-avatar">🏠</span>' +
      '<div><div class="picker-name">' + escapeHtml(s.name) + '</div>' +
      '<div class="picker-detail">' + escapeHtml([s.environment, s.atmosphere].filter(Boolean).join(' · ') || '场景') + '</div></div>' +
      '</div>';
  }).join('') + '<div class="picker-item" onclick="confirmPreScene(\'\')" style="color:#e57373">✕ 清除场景</div>';
  document.getElementById('pickerOverlay').classList.add('open');
}

function confirmPreScene(name) {
  currentPreScene = name || '';
  closePicker();
  renderPreShotSettings();
}

function setPreDuration(val) {
  currentPreDuration = val;
  renderPreShotSettings();
}

function setPreRatio(val) {
  currentPreRatio = val;
  renderPreShotSettings();
}

function setPreFps(val) {
  currentPreFps = val;
  renderPreShotSettings();
}

function confirmPreChar(id, name) {
  currentPreCharId = id || '';
  closePicker();
  renderPreShotSettings();
}

function pickPreProps() {
  var current = keyProps || '';
  var input = prompt('输入要植入的关键道具（产品/物品）：\n例如：桶装水、某品牌手机、定制杯子\n多个用逗号分隔', current);
  if (input === null) return;
  keyProps = input.trim();
  renderPreShotSettings();
}

function pickPreChar() {
  pickerMode = 'char-pre';
  var ptitle = document.getElementById('pickerTitle');
  var plist = document.getElementById('pickerList');
  var pcurrent = document.getElementById('pickerCurrentList');
  if (!ptitle || !plist || !pcurrent) return;

  ptitle.textContent = '👤 选择角色（可多选）';

  if (characterProfiles.length === 0) {
    pcurrent.innerHTML = '';
    plist.innerHTML = '<div style="padding:20px;text-align:center;color:#a09880;font-size:.78rem">暂无形象。<br>请先在「我的」→ 形象管理 中创建角色。</div>';
    document.getElementById('pickerOverlay').classList.add('open');
    return;
  }

  // Ensure every character has an id
  characterProfiles.forEach(function(c) { if (!c.id) c.id = generateId(); });

  var selectedChars = characterProfiles.filter(function(c) { return currentPreCharIds.indexOf(c.id) >= 0; });
  var availableChars = characterProfiles.filter(function(c) { return currentPreCharIds.indexOf(c.id) < 0; });

  // Top: selected characters (click to remove)
  pcurrent.innerHTML = '<div style="font-size:.72rem;color:#8a8278;margin-bottom:6px">已选（点击移除）：</div>' +
    (selectedChars.length > 0
      ? selectedChars.map(function(c) {
          return '<div class="picker-item" data-char-id="' + c.id + '" style="border-color:#5b9a8b;background:#eef7f4;cursor:pointer">' +
            '<span class="picker-avatar">' + (c.gender === '男' ? '👨' : '👩') + '</span>' +
            '<div><div class="picker-name">✓ ' + escapeHtml(c.name) + '</div>' +
            '<div class="picker-detail">' + escapeHtml([c.gender, c.age, c.clothing].filter(Boolean).join(' · ') || '无详细信息') + '</div></div>' +
            '</div>';
        }).join('')
      : '<div style="color:#a09880;font-size:.78rem;padding:8px 0">未选择任何角色</div>');

  // Bottom: available characters (click to add)
  var h = '';
  if (selectedChars.length > 0) {
    h += '<div class="picker-item pre-char-clear-btn" style="color:#e57373;cursor:pointer">✕ 清空全部（已选' + selectedChars.length + '个）</div>';
  }
  h += '<div style="font-size:.72rem;color:#8a8278;margin:8px 0 4px">可选角色：</div>';
  h += availableChars.length > 0
    ? availableChars.map(function(c) {
        return '<div class="picker-item" data-char-id="' + c.id + '" style="cursor:pointer">' +
          '<span class="picker-avatar">' + (c.gender === '男' ? '👨' : '👩') + '</span>' +
          '<div><div class="picker-name">' + escapeHtml(c.name) + '</div>' +
          '<div class="picker-detail">' + escapeHtml([c.gender, c.age, c.clothing].filter(Boolean).join(' · ') || '无详细信息') + '</div></div>' +
          '</div>';
      }).join('')
    : '<div style="color:#a09880;font-size:.78rem;padding:10px">所有角色已选中</div>';

  h += '<div style="border-top:1px solid #e0dcd3;margin-top:10px;padding-top:10px;text-align:right">';
  h += '<button class="dialog-btn primary pre-char-confirm-btn" style="font-size:.78rem;padding:8px 20px">确定</button>';
  h += '</div>';

  plist.innerHTML = h;
  document.getElementById('pickerOverlay').classList.add('open');

  // Event delegation: click on available chars → add to selection
  plist.onclick = function(e) {
    var el = e.target.closest('[data-char-id]');
    if (el) {
      var id = el.getAttribute('data-char-id');
      if (currentPreCharIds.indexOf(id) < 0) currentPreCharIds.push(id);
      pickPreChar();
      return;
    }
    if (e.target.closest('.pre-char-clear-btn')) {
      currentPreCharIds = [];
      pickPreChar();
      return;
    }
    if (e.target.closest('.pre-char-confirm-btn')) {
      closePicker();
      renderPreShotSettings();
    }
  };

  // Event delegation: click on selected chars → remove from selection
  pcurrent.onclick = function(e) {
    var el = e.target.closest('[data-char-id]');
    if (el) {
      var id = el.getAttribute('data-char-id');
      var idx = currentPreCharIds.indexOf(id);
      if (idx >= 0) currentPreCharIds.splice(idx, 1);
      pickPreChar();
    }
  };
}

function clearPreChars() {
  currentPreCharIds = [];
  pickPreChar();
}

function pickScene(fromName) {
  pickerFromName = fromName;
  pickerMode = 'scene';
  if (!sceneProfiles.length) { alert('请先在「我的」中创建场景'); return; }

  document.getElementById('pickerTitle').textContent = '🏠 换场景';
  var currentList = document.getElementById('pickerCurrentList');
  currentList.innerHTML = '<span class="picker-tag selected" style="background:#5b9a8b;color:#fff">' + escapeHtml(fromName) + '</span>';

  var list = document.getElementById('pickerList');
  list.innerHTML = sceneProfiles.map(function(s) {
    return '<div class="picker-item" onclick="confirmPickScene(\'' + s.id + '\', \'' + escapeHtml(s.name) + '\')">' +
      '<span class="picker-avatar">🏠</span>' +
      '<div><div class="picker-name">' + escapeHtml(s.name) + '</div>' +
      '<div class="picker-detail">' + escapeHtml([s.environment, s.atmosphere, s.lighting].filter(Boolean).join(' | ') + '') + '</div></div>' +
      '</div>';
  }).join('');

  document.getElementById('pickerOverlay').classList.add('open');
}

function confirmPickScene(id, name) {
  closePicker();
  var toScene = sceneProfiles.find(function(s) { return s.id === id; });
  if (!toScene) return;
  var sb = (currentStoryboard.storyboard || currentStoryboard);
  (sb.shots || []).forEach(function(shot) {
    var s = shot.scene || {};
    var key = s.sceneName || s.environment || '';
    if (key === pickerFromName || key.indexOf(pickerFromName) >= 0) {
      shot.scene = {
        sceneId: toScene.id,
        sceneName: toScene.name,
        environment: toScene.environment || '',
        atmosphere: toScene.atmosphere || ''
      };
    }
  });
  rerenderBoard();
}

function replaceAllScenes() {
  var sb = currentStoryboard.storyboard || currentStoryboard;
  var usedNames = [];
  var seen = {};
  sb.shots.forEach(function(shot) {
    var s = shot.scene || {};
    var key = s.sceneName || s.environment || '未命名场景';
    if (!seen[key]) { seen[key] = true; usedNames.push(key); }
  });
  if (!usedNames.length) { alert('当前分镜中没有场景信息'); return; }

  if (usedNames.length === 1) { pickScene(usedNames[0]); return; }

  document.getElementById('pickerTitle').textContent = '🏠 替换哪个场景？';
  document.getElementById('pickerCurrentList').innerHTML = '';
  var list = document.getElementById('pickerList');
  list.innerHTML = usedNames.map(function(n) {
    return '<div class="picker-item" onclick="pickScene(\'' + escapeHtml(n) + '\')">' +
      '<span class="picker-avatar">🏠</span>' +
      '<div class="picker-name">' + escapeHtml(n) + '</div>' +
      '<span style="color:#5b9a8b;font-size:.7rem">替换 →</span>' +
      '</div>';
  }).join('');
  document.getElementById('pickerOverlay').classList.add('open');
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
function buildShotProse(shot) {
  var parts = [];

  // 景别 + 光影
  var visual = [];
  if (shot.shotType) visual.push(shot.shotType);
  var light = shot.lighting || {};
  if (light.type) visual.push(light.type + (light.direction ? '从' + light.direction + '打入' : ''));
  if (visual.length) parts.push(visual.join('，'));

  // 主体 + 动作 + 道具
  var subjDesc = (shot.subjects || []).map(function(s) {
    var seg = s.characterName || '';
    if (s.additionalDesc) seg += seg ? '（' + s.additionalDesc + '）' : s.additionalDesc;
    return seg;
  }).filter(Boolean).join('、');
  var bodyParts = [];
  if (subjDesc) bodyParts.push(subjDesc);
  if (shot.action) bodyParts.push(shot.action);
  var kp = shot.keyProps;
  if (kp && Array.isArray(kp) && kp.length > 0) bodyParts.push('画面中出现：' + kp.join('、'));
  if (bodyParts.length) parts.push(bodyParts.join('，'));

  // 场景
  var sc = shot.scene || {};
  var sceneParts = [];
  if (sc.environment) sceneParts.push(sc.environment);
  if (sc.atmosphere) sceneParts.push('氛围' + sc.atmosphere);
  if (sceneParts.length) parts.push(sceneParts.join('，'));

  // 运镜
  var cam = shot.camera || {};
  var camParts = [];
  if (cam.movement) camParts.push(cam.movement);
  if (cam.focalLength) camParts.push(cam.focalLength);
  if (cam.angle && cam.angle !== '平视') camParts.push(cam.angle + '视角');
  if (camParts.length) parts.push(camParts.join('，'));

  // 风格
  var st = shot.style || {};
  if (st.visualStyle) parts.push(st.visualStyle + '风格');

  // 情绪
  if (shot.emotionBeat) parts.push('情绪节奏：' + shot.emotionBeat);

  return parts.join('。\n') + '。';
}

function exportStoryboardPrompts() {
  var sb = currentStoryboard.storyboard || currentStoryboard;
  var allShots = sb.shots || [];
  if (!allShots.length) { alert('没有分镜数据'); return; }

  // If batches exist, export current batch only
  var shots;
  var segLabel = '';
  if (shotBatches.length > 0 && currentBatchTab < shotBatches.length) {
    var batch = shotBatches[currentBatchTab];
    if (!batch.generated || !batch.shots.length) { alert('当前段尚未生成'); return; }
    shots = batch.shots;
    segLabel = batch.startTime + '-' + batch.endTime + '秒';
  } else {
    shots = allShots;
  }

  var ratio = currentPreRatio || '9:16';
  var fps = currentPreFps || '24';

  // Calculate duration for current batch
  var totalSec = 0;
  shots.forEach(function(s) {
    var m = (s.duration || '').match(/(\d+)\s*[–\-~至到]\s*(\d+)\s*s?/i);
    if (!m) m = (s.duration || '').match(/(\d+)\s*-\s*(\d+)\s*s?/i);
    if (m) totalSec = Math.max(totalSec, parseInt(m[2]) || 0);
    else { var n = parseInt(s.duration); if (n) totalSec += n; }
  });
  if (!totalSec) totalSec = shots.length * 5;
  var totalDur = segLabel || (totalSec + '秒');

  // Collect style hints + char/scene IDs from current shots
  var styles = [];
  var usedCharIds = [];
  var usedSceneIds = [];
  shots.forEach(function(s) {
    var st = (s.style || {}).visualStyle;
    if (st && styles.indexOf(st) === -1) styles.push(st);
    (s.subjects || []).forEach(function(su) {
      if (su.characterId && usedCharIds.indexOf(su.characterId) < 0) usedCharIds.push(su.characterId);
    });
    var scId = (s.scene || {}).sceneId;
    if (scId && usedSceneIds.indexOf(scId) < 0) usedSceneIds.push(scId);
  });

  // Build output
  var out = '## 🎬 ' + (sb.title || '未命名') + '\n\n';
  out += '**时长**：' + totalDur + '  **比例**：' + ratio + '  **帧率**：' + fps + '  **方言**：' + (currentDialect || '普通话') + '\n';
  if (keyProps) out += '**关键道具**：' + keyProps + '\n';
  if (styles.length) out += '**风格**：' + styles.join(' · ') + '\n';
  out += '\n---\n\n';

  var charDescs = usedCharIds.map(describeCharacter).filter(Boolean);
  if (charDescs.length) {
    out += '**角色设定**：\n';
    charDescs.forEach(function(d) { out += '- ' + d + '\n'; });
    out += '\n';
  }
  var sceneDescs = usedSceneIds.map(describeScene).filter(Boolean);
  if (sceneDescs.length) {
    out += '**场景设定**：\n';
    sceneDescs.forEach(function(d) { out += '- ' + d + '\n'; });
    out += '\n';
  }
  out += '**分镜**：\n\n';
  shots.forEach(function(shot, i) {
    out += (shot.duration || '') + '：\n';
    out += buildShotProse(shot) + '\n';
    if (shot.dialogue) out += '台词："' + shot.dialogue + '"\n';
    out += '\n';
  });

  out += '---\n\n';
  out += '禁止：文字、字幕、LOGO、水印';

  copyToClipboard(out).then(function() {
    alert('已复制即梦提示词（' + totalDur + '，' + ratio + '）');
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
function doLogout() {
  if (!confirm('确定退出登录？')) return;
  if (typeof sbSignOut !== 'undefined') { try { sbSignOut(); } catch(e) {} }
  sbUser = null;
  currentStoryboard = null;
  document.getElementById('loginPage').classList.remove('hidden');
  try { document.getElementById('modelDialog').classList.remove('open'); } catch(e) {}
  try { document.getElementById('zhilingDialog').classList.remove('open'); } catch(e) {}
}

function toggleMeMenu() {
  var menu = document.getElementById('meMenuDropdown');
  if (!menu) return;
  menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
}

function closeMeMenu() {
  var menu = document.getElementById('meMenuDropdown');
  if (menu) menu.style.display = 'none';
}

function openModelDialog() {
  document.getElementById('meApiKey').value = settings.apiKey || '';
  document.getElementById('meEndpoint').value = settings.endpoint || '';
  document.getElementById('meModel').value = settings.model || 'deepseek-chat';
  updateCustomModel();
  document.getElementById('modelDialog').classList.add('open');
}

function openZhilingDialog() {
  document.getElementById('meZhilingKey').value = zhilingKey || '';
  document.getElementById('zhilingDialog').classList.add('open');
}

function bindEvents() {
  // Tab switching
  document.querySelectorAll('.tab-item').forEach(function(item) {
    item.addEventListener('click', function() { switchTab(this.dataset.tab); });
  });

  // Model dialog
  var btnSettings = document.getElementById('btnMeSettings');
  if (btnSettings) btnSettings.addEventListener('click', function() {
    openModelDialog();
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

  // Save zhilingKey separately (completely independent)
  // Save zhilingKey
  var btnSaveZl = document.getElementById('btnSaveZhilingKey');
  if (btnSaveZl) btnSaveZl.addEventListener('click', function() {
    zhilingKey = document.getElementById('meZhilingKey').value.trim();
    saveZhilingKey();
    var hint = document.getElementById('zhilingSaveHint');
    if (!hint) hint = document.getElementById('apiConfigSaveHint');
    hint.textContent = '✓ 已保存（本地）'; hint.style.color = '#7b6f5c';
    setTimeout(function() { hint.textContent = ''; }, 2000);
  });

  // Logout (now via menu)
  var btnLogoutCard = document.getElementById('btnLogoutCard');
  if (btnLogoutCard) btnLogoutCard.addEventListener('click', function() { doLogout(); });
  var btnLogout = document.getElementById('btnLogout');
  if (btnLogout) btnLogout.addEventListener('click', function() { doLogout(); });

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


  // Voice (may not exist in simplified UI)
  var btnVoice = document.getElementById('btnVoice');
  if (btnVoice) { btnVoice.addEventListener('click', toggleVoiceInput); setupVoiceRecognition(); }

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

  // Char editor style chips
  document.querySelectorAll('#charEditStyle .chip').forEach(function(c) {
    c.addEventListener('click', function() {
      document.querySelectorAll('#charEditStyle .chip').forEach(function(x) { x.classList.remove('active'); });
      this.classList.add('active');
    });
  });

  // Char editor season chips
  document.querySelectorAll('#charEditSeason .chip').forEach(function(c) {
    c.addEventListener('click', function() {
      document.querySelectorAll('#charEditSeason .chip').forEach(function(x) { x.classList.remove('active'); });
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
// TOPIC / CREATE PAGE
// ============================================================

function toggleBizEdit() {
  var bar = document.getElementById('topicBizBar');
  var edit = document.getElementById('topicBizEdit');
  var calendar = document.getElementById('topicCalendarSection');
  if (edit.style.display === 'none' || !edit.style.display) {
    edit.style.display = 'block';
    calendar.style.display = 'none';
    bar.style.display = 'none';
  } else {
    edit.style.display = 'none';
    if (topicBizData && topicBizData.analysis) {
      bar.style.display = 'flex';
      calendar.style.display = 'block';
    }
  }
}

function loadTopicBiz() {
  try {
    var raw = localStorage.getItem('zimeiti-topic-biz');
    if (raw) { topicBizData = JSON.parse(raw); return topicBizData; }
  } catch(e) {}
  return null;
}

function saveTopicBiz() {
  try { localStorage.setItem('zimeiti-topic-biz', JSON.stringify(topicBizData)); } catch(e) {}
}

function initCreatePage() {
  loadTopicBiz();
  if (topicBizData && topicBizData.analysis) {
    // Business already saved — show calendar
    document.getElementById('topicBizEdit').style.display = 'none';
    document.getElementById('topicBizBar').style.display = 'flex';
    document.getElementById('topicBizLabel').textContent = '业务：' + (topicBizData.biz || '').slice(0, 40);
    var phase = topicBizData.analysis.currentPhase || '';
    var seasonLabel = topicBizData.analysis.peakSeason || '';
    document.getElementById('topicBizSeason').textContent = (phase ? phase + ' | ' : '') + seasonLabel;
    document.getElementById('topicCalendarSection').style.display = 'block';
    renderTopicCalendar();
    renderTopicList(currentTopicFilter);
    var hasTopics = topicBizData && topicBizData.topics && topicBizData.topics.length > 0;
    document.getElementById('btnRefreshTopics').textContent = hasTopics ? '🔄 换一批' : '✨ 生成选题';
  } else {
    // First time — show business input
    document.getElementById('topicBizEdit').style.display = 'block';
    document.getElementById('topicBizBar').style.display = 'none';
    document.getElementById('topicCalendarSection').style.display = 'none';
    document.getElementById('topicContentSection').style.display = 'none';
  }
}

function buildTopicAnalysisPrompt(biz) {
  return '你是一个短视频内容策划专家。用户描述了自己的业务，请分析并输出 JSON。\n\n' +
    '用户业务：' + biz + '\n' +
    '当前日期：' + new Date().toISOString().slice(0, 10) + '\n\n' +
    '## 分析要求\n' +
    '1. 判断行业，识别淡旺季月份\n' +
    '2. 根据当前日期判断处于什么阶段（旺季/淡季/平季）\n' +
    '3. 给出 2-4 种选题目的分类（不限于人设打造/流量类/成交型，可根据行业特点补充）\n' +
    '4. 淡季偏人设打造和流量类，旺季偏成交型\n' +
    '5. 标注近期（一周内）可能的热点方向（节日/行业节点/季节性话题）\n' +
    '6. 推荐当前最适合的选题目的\n\n' +
    '## 输出 JSON 格式\n' +
    '{\n' +
    '  "industry": "行业名称",\n' +
    '  "peakSeason": "旺季月份",\n' +
    '  "lowSeason": "淡季月份",\n' +
    '  "currentPhase": "当前阶段（旺季/淡季/平季）",\n' +
    '  "phaseTip": "当前阶段的内容策略建议（一句话）",\n' +
    '  "purposeLabels": ["人设打造", "流量类", "成交型"],\n' +
    '  "recommendedPurposes": ["最推荐的目的1", "次推荐的目的2"],\n' +
    '  "recentHotspots": ["近期热点1", "近期热点2"],\n' +
    '  "defaultNarrativePersona": "最合适的叙事人设（陪伴者/教导者/崇拜者/陪衬者/搞笑者，选一个）"\n' +
    '}\n\n' +
    '纯 JSON 输出，不要 ```json``` 包裹。';
}

function buildTopicListPrompt(biz, analysis, purposeFilter) {
  return '你是一个短视频内容策划专家。根据以下信息，推荐 6-10 个选题。\n\n' +
    '业务：' + biz + '\n' +
    '行业：' + (analysis.industry || '') + '\n' +
    '当前阶段：' + (analysis.currentPhase || '') + '\n' +
    '推荐的选题目的：' + (analysis.recommendedPurposes || []).join('、') + '\n' +
    '近期热点方向：' + (analysis.recentHotspots || []).join('、') + '\n' +
    '叙事人设：' + (analysis.defaultNarrativePersona || '陪伴者') + '\n' +
    (purposeFilter && purposeFilter !== 'all' ? '筛选目的：' + purposeFilter + '\n' : '') +
    '\n## 要求\n' +
    '1. 给 6-10 个选题，每个选题含 title（标题）、angle（角度说明）、purpose（选题目的）、estimatedEffect（预估效果）\n' +
    '2. 标注每个选题主要触发哪种观众心理（从以下选：想纠正你/想看结果/想证明自己/想看你翻车/想给你出招/想看看真假/想代入自己）\n' +
    '3. 根据选题内容匹配最合适的叙事人设 persona（陪伴者/教导者/崇拜者/陪衬者/搞笑者，选一个）\n' +
    '4. 淡季偏人设类，旺季偏成交型\n' +
    '5. 结合近期热点方向给出热点选题\n\n' +
    '## 输出 JSON 格式\n' +
    '[{"title":"...","angle":"...","purpose":"人设打造","estimatedEffect":"高互动","psychology":"想代入自己","persona":"陪伴者","hotTip":""}]\n\n' +
    '纯 JSON 数组输出，不要 ```json``` 包裹。';
}

function buildTopicContentPrompt(biz, analysis, topic) {
  return '你是' + (topic.persona || '陪伴者') + '风格的短视频脚本写手。\n\n' +
    '业务背景：' + biz + '\n' +
    '行业：' + (analysis.industry || '') + '\n' +
    '选题：' + topic.title + '\n' +
    '角度：' + (topic.angle || '') + '\n' +
    '心理钩子：' + (topic.psychology || '想代入自己') + '\n\n' +
    '## 写作规则（必须遵守）\n\n' +
    '### 口语化脚本规则\n' +
    '- 每镜不超过 50 字\n' +
    '- 每句话不超过 12 个字，用句号断开（呼吸单位）\n' +
    '- 情绪写进脚本，不写进标注：用换行停顿、短句强调、单字反转\n' +
    '- 念一遍才算是脚本，念不顺就删掉重写\n\n' +
    '### 可拿走性原则\n' +
    '- 观众看完能拿走什么？"了解了X"不合格，"能判断X/能算出Y/能避开Z"合格\n\n' +
    '### 内容温度模型\n' +
    '- 有趣 + 有用 + 共鸣，至少满足两个\n\n' +
    '### 七种观众心理钩子\n' +
    '- 1想纠正你 2想看结果 3想证明自己 4想看你翻车 5想给你出招 6想看看真假 7想代入自己\n' +
    '- 每篇内容至少触发一种，否则观众不会互动\n\n' +
    '## 输出格式\n' +
    '输出完整短视频脚本，包含：\n' +
    '1. 标题（吸引人的）\n' +
    '2. 视频类型（带货/知识/搞笑/剧情/励志/生活技巧）\n' +
    '3. 开头方式（视觉冲击/抛问题/数据对比/制造冲突/音乐卡点/对话直入）\n' +
    '4. 人物设置（几个人、什么穿着的描述）\n' +
    '5. 场景+氛围\n' +
    '6. 完整脚本内容（按镜头分，每个镜头注明时长、画面描述、口播文案）\n' +
    '7. 结尾 CTA\n\n' +
    '用自然语言输出，不要 JSON。让读的人能直接念出来。';
}

async function saveBizAndAnalyze() {
  var bizInput = document.getElementById('topicBizInput');
  var biz = bizInput.value.trim();
  if (!biz) { alert('请输入业务描述'); return; }
  if (!settings.apiKey) { alert('请先在「我的」→ 设置 中配置 API Key'); return; }

  var loading = document.getElementById('topicBizLoading');
  var editPanel = document.getElementById('topicBizEdit');
  var btn = document.getElementById('btnSaveBiz');

  loading.style.display = 'flex';
  btn.disabled = true;

  var analysis = null;
  var topics = null;

  try {
    // Step 1: business analysis
    var sysPrompt1 = '你是一个商业分析和短视频策划专家。严格按 JSON 格式回复。';
    var result1 = await doStoryboardApiCall(sysPrompt1, buildTopicAnalysisPrompt(biz));
    var json1 = collectStreamJson(result1);
    if (!json1) throw new Error('无法解析行业分析结果');
    analysis = JSON.parse(json1);

    // Step 2: generate topics
    var sysPrompt2 = '你是一个短视频内容策划专家。严格按 JSON 格式回复。';
    var result2 = await doStoryboardApiCall(sysPrompt2, buildTopicListPrompt(biz, analysis, 'all'));
    var json2 = collectStreamJson(result2);
    if (!json2) throw new Error('无法解析选题列表');
    topics = JSON.parse(json2);

    // Both succeed — save
    topicBizData = { biz: biz, analysis: analysis, topics: topics, savedAt: new Date().toISOString() };
    saveTopicBiz();

    editPanel.style.display = 'none';
    document.getElementById('topicBizBar').style.display = 'flex';
    document.getElementById('topicBizLabel').textContent = '业务：' + biz.slice(0, 40);
    var phase = analysis.currentPhase || '';
    var seasonLabel = analysis.peakSeason || '';
    document.getElementById('topicBizSeason').textContent = (phase ? phase + ' | ' : '') + seasonLabel;

    document.getElementById('topicCalendarSection').style.display = 'block';
    currentTopicFilter = 'all';
    renderTopicCalendar();
    renderTopicList('all');
    document.getElementById('btnRefreshTopics').textContent = '🔄 换一批';

  } catch(e) {
    console.error('[saveBizAndAnalyze] error:', e);
    alert('分析失败：' + (e.message || '未知错误') + '\n\n请检查 API Key 和网络后重试');
    // Full reset — nothing persisted on failure
    topicBizData = null;
    editPanel.style.display = 'block';
    document.getElementById('topicBizBar').style.display = 'none';
    document.getElementById('topicCalendarSection').style.display = 'none';
    document.getElementById('topicContentSection').style.display = 'none';
  }

  loading.style.display = 'none';
  btn.disabled = false;
}

function renderTopicCalendar() {
  if (!topicBizData || !topicBizData.analysis) return;

  var analysis = topicBizData.analysis;

  // Season card
  var seasonCard = document.getElementById('topicSeasonCard');
  var phaseClass = '';
  if (analysis.currentPhase === '旺季') phaseClass = 'peak';
  else if (analysis.currentPhase === '淡季') phaseClass = 'low';
  else phaseClass = 'flat';

  seasonCard.innerHTML =
    '<div><strong>' + (analysis.industry || '') + '</strong> · ' +
    '<span class="season-phase ' + phaseClass + '">' + (analysis.currentPhase || '') + '</span>' +
    ' 旺季：' + (analysis.peakSeason || '') + ' | 淡季：' + (analysis.lowSeason || '') + '</div>' +
    '<div class="season-tip">💡 ' + (analysis.phaseTip || '') + '</div>' +
    '<div class="season-tip" style="margin-top:2px">🔥 热点：' + (analysis.recentHotspots || []).slice(0, 3).join('、') + '</div>';

  // Render purpose filter chips
  var chips = document.getElementById('topicFilterChips');
  var labels = analysis.purposeLabels || ['人设打造', '流量类', '成交型'];
  var chipHtml = '<span class="topic-filter-chip' + (currentTopicFilter === 'all' ? ' active' : '') + '" data-filter="all" onclick="filterTopics(\'all\')">全部</span>';
  for (var i = 0; i < labels.length; i++) {
    var lbl = labels[i];
    chipHtml += '<span class="topic-filter-chip' + (currentTopicFilter === lbl ? ' active' : '') + '" data-filter="' + escapeHtml(lbl) + '" onclick="filterTopics(\'' + escapeHtml(lbl) + '\')">' + escapeHtml(lbl) + '</span>';
  }
  chips.innerHTML = chipHtml;
}

function filterTopics(purpose) {
  currentTopicFilter = purpose;
  // Update chip active states
  document.querySelectorAll('.topic-filter-chip').forEach(function(c) {
    c.classList.remove('active');
    if (c.dataset.filter === purpose) c.classList.add('active');
  });
  renderTopicList(purpose);
}

function renderTopicList(purpose) {
  if (!topicBizData || !topicBizData.topics) return;

  var allTopics = (topicBizData.topics || []).filter(function(t) {
    return purpose === 'all' || t.purpose === purpose;
  });

  var list = document.getElementById('topicList');
  var btn = document.getElementById('btnRefreshTopics');
  if (!allTopics.length) {
    list.innerHTML = '<div style="text-align:center;color:#a09888;padding:20px;font-size:.76rem">暂无选题，点击「生成选题」重新生成</div>';
    if (btn) btn.textContent = '✨ 生成选题';
    return;
  }
  if (btn) btn.textContent = '🔄 换一批';

  var html = '';
  allTopics.forEach(function(t, idx) {
    var purClass = t.purpose === '流量类' ? 'traffic' : (t.purpose === '成交型' ? 'deal' : 'persona');
    html += '<div class="topic-card' + (selectedTopic === t ? ' selected' : '') + '" onclick="selectTopicCard(' + idx + ')" data-idx="' + idx + '">';
    html += '<div class="topic-card-header">';
    html += '<span class="topic-card-purpose ' + purClass + '">' + escapeHtml(t.purpose || '') + '</span>';
    html += '<span class="topic-card-effect">📊 ' + escapeHtml(t.estimatedEffect || '') + '</span>';
    html += '</div>';
    html += '<div class="topic-card-title">' + escapeHtml(t.title || '') + '</div>';
    html += '<div class="topic-card-angle">' + escapeHtml(t.angle || '') + '</div>';
    var metaLine = [];
    if (t.persona) metaLine.push('🎭 ' + escapeHtml(t.persona));
    if (t.psychology) metaLine.push('🎯 ' + escapeHtml(t.psychology));
    if (metaLine.length) html += '<div class="topic-card-psych">' + metaLine.join('  ') + '</div>';
    html += '</div>';
  });
  list.innerHTML = html;
}

function selectTopicCard(idx) {
  var allTopics = (topicBizData.topics || []).filter(function(t) {
    return currentTopicFilter === 'all' || t.purpose === currentTopicFilter;
  });
  var topic = allTopics[idx];
  if (!topic) return;
  selectedTopic = topic;

  // Highlight
  document.querySelectorAll('.topic-card').forEach(function(c) { c.classList.remove('selected'); });
  var cardEl = document.querySelector('.topic-card[data-idx="' + idx + '"]');
  if (cardEl) cardEl.classList.add('selected');

  // Show content generation
  document.getElementById('topicCalendarSection').style.display = 'none';
  document.getElementById('topicContentSection').style.display = 'block';
  document.getElementById('topicContentResult').innerHTML = '';
  document.getElementById('topicContentActions').style.display = 'none';

  // Show meta
  document.getElementById('topicContentMeta').innerHTML =
    '<div class="meta-topic">' + escapeHtml(topic.title || '') + '</div>' +
    '<div class="meta-info"><span>目的：' + escapeHtml(topic.purpose || '') + '</span><span>预估：' + escapeHtml(topic.estimatedEffect || '') + '</span><span>心理钩子：' + escapeHtml(topic.psychology || '') + '</span></div>';

  // Generate content
  generateTopicContent(topic);
}

async function generateTopicContent(topic) {
  if (!settings.apiKey) { alert('请先配置 API Key'); return; }

  document.getElementById('topicContentLoading').style.display = 'flex';
  document.getElementById('topicContentResult').innerHTML = '';
  document.getElementById('topicContentActions').style.display = 'none';

  try {
    var systemPrompt = '你是一个短视频脚本专家。按用户要求输出完整脚本，自然语言格式，不要 JSON。';
    var resultText = await doStoryboardApiCall(systemPrompt, buildTopicContentPrompt(topicBizData.biz, topicBizData.analysis, topic), { noJsonFormat: true });
    topicContentText = resultText || '';
    if (topicContentText) {
      document.getElementById('topicContentResult').innerHTML = '<div style="white-space:pre-wrap;line-height:1.8">' + escapeHtml(topicContentText) + '</div>';
      document.getElementById('topicContentActions').style.display = 'flex';
    } else {
      document.getElementById('topicContentResult').innerHTML = '<div style="color:#a09888;text-align:center;padding:30px">生成内容为空，请点击「重新生成」重试</div>';
      document.getElementById('topicContentActions').style.display = 'flex';
    }
  } catch(e) {
    console.error('[generateTopicContent] error:', e);
    document.getElementById('topicContentResult').innerHTML =
      '<div style="color:#e57373;text-align:center;padding:20px">生成失败：' + escapeHtml(e.message || '') + '</div>';
  }
  document.getElementById('topicContentLoading').style.display = 'none';
}

function regenerateTopicContent() {
  if (selectedTopic) generateTopicContent(selectedTopic);
}

function backToCalendar() {
  document.getElementById('topicContentSection').style.display = 'none';
  document.getElementById('topicCalendarSection').style.display = 'block';
  selectedTopic = null;
  topicContentText = '';
}

function parseTopicContent(text) {
  // Extract structured fields from the LLM-generated topic content
  var result = {
    videoType: '', opening: '', characters: '', charSuppl: '',
    scene: '居家', mood: '温馨', scriptContent: text
  };

  var lines = text.split('\n');
  var scriptStart = -1;

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) continue;

    // 2. 视频类型
    var m = line.match(/^2[\.\s、]+视频类型[：:]\s*(.+)/);
    if (m) { result.videoType = m[1].trim(); continue; }

    // 3. 开头方式
    m = line.match(/^3[\.\s、]+开头方式[：:]\s*(.+)/);
    if (m) { result.opening = m[1].trim(); continue; }

    // 4. 人物设置
    m = line.match(/^4[\.\s、]+人物设置[：:]\s*(.+)/);
    if (m) {
      var charText = m[1].trim();
      // Try "几个人，什么穿着" pattern
      var parts = charText.split(/[,，]/);
      result.characters = parts[0].trim();
      result.charSuppl = parts.slice(1).join('，').trim();
      continue;
    }

    // 5. 场景+氛围 / 场景与氛围 / 场景和氛围
    m = line.match(/^5[\.\s、]+场景[+与和]?氛围[：:]\s*(.+)/);
    if (m) {
      var sceneText = m[1].trim();
      var sp = sceneText.split(/[,，·、+]/);
      result.scene = (sp[0] || '').trim() || '居家';
      result.mood = (sp[1] || '').trim() || '温馨';
      continue;
    }

    // 6. 脚本内容 / 完整脚本 — mark where script begins
    if (/^6[\.\s、]+(完整)?脚本/.test(line)) {
      scriptStart = i + 1;
      break;
    }
  }

  // Extract just the script content (from section 6 onward)
  if (scriptStart > 0 && scriptStart < lines.length) {
    var scriptLines = [];
    for (var j = scriptStart; j < lines.length; j++) {
      var l = lines[j].trim();
      // Stop at section 7 (结尾CTA) or next numbered section
      if (/^7[\.\s、]|^#/.test(l)) break;
      scriptLines.push(lines[j]);
    }
    if (scriptLines.length > 0) result.scriptContent = scriptLines.join('\n').trim();
  }

  return result;
}

function confirmToStoryboard() {
  if (!topicContentText) { alert('请先生成内容'); return; }
  if (!topicBizData || !topicBizData.analysis) { alert('请先完成选题分析'); return; }

  var parsed = parseTopicContent(topicContentText);
  var videoType = parsed.videoType || guessVideoType(topicContentText, '');
  var opening = parsed.opening || '抛问题';
  var characters = parsed.characters || '一个人';
  var charSuppl = parsed.charSuppl || '日常休闲装';
  var scene = parsed.scene || '居家';
  var mood = parsed.mood || '温馨';

  interviewAnswers = [];
  interviewAnswers.push({ question: INTERVIEW_QUESTIONS[0].question, answer: videoType });
  interviewAnswers.push({ question: INTERVIEW_QUESTIONS[1].question, answer: opening, supplement: '' });
  interviewAnswers.push({ question: INTERVIEW_QUESTIONS[2].question, answer: characters, supplement: charSuppl });
  interviewAnswers.push({ question: INTERVIEW_QUESTIONS[3].question, answer: { a: scene, b: mood } });
  interviewAnswers.push({ question: INTERVIEW_QUESTIONS[4].question, answer: parsed.scriptContent });

  pendingRecordSource = 'topic';
  switchTab('tabStoryboard');
  generateStoryboard();
}

async function refreshTopics() {
  if (!topicBizData || !topicBizData.analysis || !settings.apiKey) return;

  var btn = document.getElementById('btnRefreshTopics');
  btn.disabled = true;
  btn.textContent = '⏳ 生成中…';

  try {
    var systemPrompt = '你是一个商业分析和短视频策划专家。严格按 JSON 格式回复。';
    var calPrompt = buildTopicListPrompt(topicBizData.biz, topicBizData.analysis, currentTopicFilter);
    var calResult = await doStoryboardApiCall(systemPrompt, calPrompt);
    var calJson = collectStreamJson(calResult);
    if (!calJson) throw new Error('无法解析选题列表');
    topicBizData.topics = JSON.parse(calJson);
    saveTopicBiz();
    renderTopicCalendar();
    renderTopicList(currentTopicFilter);
  } catch(e) {
    console.error('[refreshTopics] error:', e);
    alert('刷新失败：' + (e.message || '未知错误'));
  }
  btn.disabled = false;
  btn.textContent = '🔄 换一批';
}

// ============================================================
// STARTUP
// ============================================================
init();

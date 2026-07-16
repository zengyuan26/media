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
      { value: '反常识断言', icon: '🤯', label: '反常识断言 — "你以为X。但Y。"' },
      { value: '身份标签', icon: '🎯', label: '身份标签 — "如果你也在..."' },
      { value: '静默中断', icon: '⏸️', label: '静默中断 — 停顿+一句话推翻' },
      { value: '数据对比', icon: '📊', label: '数据对比' },
      { value: '对话直入', icon: '🗣', label: '对话直入' }
    ],
    supplement: '补充：开头大致什么画面？（选填）\n反常识断言 → 硬核拆解/观点输出。身份标签 → 故事分享/个人经历。静默中断 → 有信任基础后进阶。'
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
var originalScriptText = '';   // original script skeleton — preserved across rebuilds

// Topic / Create page state
var topicBizData = null;       // { biz, analysis, audiences, selectedAudienceIndex, topics, ... }
var selectedTopic = null;      // currently selected topic for content generation
var topicContentText = '';     // generated content text
var pendingRecordSource = 'link'; // 'link' | 'topic' — set before generateStoryboard()
var topicContentAngle = 'product';  // 'product' | 'personal'
var topicFormat = 'single';        // 'single' | 'dual'
var topicDuration = '30';          // '15' | '30' | '45' | '60'
var topicContentStyle = 'normal';  // 'normal' | 'comedy' | 'emotional'

var topicAudiences = [];           // [{ painPoint, audienceDescription, searchKeyword, opportunity }]
var selectedAudienceIndex = -1;    // index into topicAudiences

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

  // Don't show login page yet — Supabase may not be loaded.
  // Session check happens in tryRestoreSession() which runs either
  // now (if supabase.js already loaded) or when supabase.js finishes loading.

  loadCharacterProfiles();
  loadSceneProfiles();
  loadRecords();
  loadDialects();
  applyAllSettings();
  bindEvents();
  renderCharacterList();
  updateAccountUI();

  // Try to restore session now (supabase.js might already be loaded)
  tryRestoreSession();

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

var _longPressTimer = null;
function addLongPress(el, callback, needsConfirm) {
  el.addEventListener('pointerdown', function(e) {
    _longPressTimer = setTimeout(function() {
      _longPressTimer = null;
      el.style.transform = 'scale(0.88)';
      el.style.transition = 'transform .12s';
      setTimeout(function() { el.style.transform = ''; }, 150);
      if (needsConfirm) {
        if (confirm(needsConfirm)) callback();
      } else {
        callback();
      }
    }, 600);
  });
  el.addEventListener('pointerup', function() { if (_longPressTimer) { clearTimeout(_longPressTimer); _longPressTimer = null; } });
  el.addEventListener('pointerleave', function() { if (_longPressTimer) { clearTimeout(_longPressTimer); _longPressTimer = null; } });
  el.addEventListener('pointercancel', function() { if (_longPressTimer) { clearTimeout(_longPressTimer); _longPressTimer = null; } });
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
  if (btn) { btn.innerHTML = '<span class="material-symbols-outlined">casino</span> 重新随机'; }
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
  btn.innerHTML = '<span class="material-symbols-outlined">auto_awesome</span> AI 生成';
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
  document.getElementById('btnRandomChar').innerHTML = '<span class="material-symbols-outlined">casino</span> 随机';
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
  btn.innerHTML = '<span class="material-symbols-outlined">auto_awesome</span> AI 生成';
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
    html += '<div class="mgr-item-avatar"><span class="material-symbols-outlined">home</span></div>';
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
function tryRestoreSession() {
  if (typeof sbGetSession === 'undefined') {
    // Supabase not loaded yet — wait, will be re-triggered when supabase.js loads.
    // If it never loads (CDN down), show login after timeout.
    return;
  }
  sbGetSession().then(function(session) {
    if (session) {
      sbUser = session.user;
      loadAllFromCloud().then(function() {
        // Push local data to cloud if cloud is empty
        if (!settings.apiKey) {
          // Cloud had no API config — push whatever is in localStorage
          try {
            var localS = JSON.parse(localStorage.getItem('zimeiti-v3-settings'));
            if (localS && localS.apiKey) {
              settings.apiKey = localS.apiKey;
              settings.endpoint = localS.endpoint || settings.endpoint;
              settings.model = localS.model || settings.model;
              settings.customModel = localS.customModel || '';
              saveSettingsToStorage();
              if (typeof sbSaveApiConfig !== 'undefined') sbSaveApiConfig().catch(function(){});
            }
          } catch(e) {}
        }
        // Ensure characters/scenes/dialects are restored from localStorage if cloud was empty
        if (!characterProfiles.length) {
          try {
            var localC = JSON.parse(localStorage.getItem('zimeiti-v3-characters'));
            if (Array.isArray(localC) && localC.length) {
              characterProfiles = localC;
              saveCharacterProfiles();
            }
          } catch(e) {}
        }
        if (!sceneProfiles.length) {
          try {
            var localSc = JSON.parse(localStorage.getItem('zimeiti-v3-scenes'));
            if (Array.isArray(localSc) && localSc.length) {
              sceneProfiles = localSc;
              saveSceneProfiles();
            }
          } catch(e) {}
        }
        if (!zhilingKey) {
          try {
            var localZ = localStorage.getItem('zimeiti-v3-zhiling-key');
            if (localZ) { zhilingKey = localZ; saveZhilingKey(); }
          } catch(e) {}
        }
        if (!dialects.length) {
          try {
            var localD = JSON.parse(localStorage.getItem('zimeiti-v3-dialects'));
            if (Array.isArray(localD) && localD.length) {
              dialects = localD;
              saveDialects();
            }
          } catch(e) {}
        }
        // Force save everything to localStorage after cloud+local merge
        saveSettingsToStorage();
        saveCharacterProfiles();
        saveSceneProfiles();
        saveDialects();
        applyAllSettings();
        renderCharacterList();
        updateAccountUI();
        dismissLoginPage();
      });
    } else {
      document.getElementById('loginPage').classList.remove('hidden');
    }
  });
}

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
    var prevZhilingKey = zhilingKey;
    var prevChars = characterProfiles.slice();
    var prevScenes = sceneProfiles.slice();
    var prevDialects = dialects.slice();
    var prevDialect = currentDialect;

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
    if (!zhilingKey && prevZhilingKey) {
      zhilingKey = prevZhilingKey;
      saveZhilingKey();
    }
    if (!characterProfiles.length && prevChars.length) {
      characterProfiles = prevChars;
      saveCharacterProfiles();
    }
    if (!sceneProfiles.length && prevScenes.length) {
      sceneProfiles = prevScenes;
      saveSceneProfiles();
    }
    if (!dialects.length && prevDialects.length) {
      dialects = prevDialects;
      currentDialect = prevDialect;
      saveDialects();
    }
    // Persist restored settings to localStorage (they were backed up in memory only)
    saveSettingsToStorage();
    // Push restored API config to cloud
    if (settings.apiKey && typeof sbSaveApiConfig !== 'undefined') {
      try { await sbSaveApiConfig(); } catch(e) {}
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
  if (!sbUser || !sbUser.id || !sb) return;
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
  restoreLinkInput();  // hide analyzing animation, show link input
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
  if (preview) preview.style.display = 'none';
  _pendingZhilingContent = '';
  // Restore saved URL and re-run analysis
  if (_lastParsedUrl) {
    var input = document.getElementById('sbLinkInput');
    if (input) input.value = _lastParsedUrl;
    var el = document.getElementById('sbInterview');
    if (el) el.style.display = 'flex';
    parseVideoLink();
  } else {
    // Fallback: show link input page
    var el = document.getElementById('sbInterview');
    if (el) el.style.display = 'flex';
    restoreLinkInput();
    var statusEl = document.getElementById('sbLinkStatus');
    if (statusEl) { statusEl.style.display = 'none'; statusEl.textContent = ''; }
  }
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
var cancelZhilingFlag = false;
var _lastParsedUrl = '';

function cancelParseLink() {
  cancelZhilingFlag = true;
  isParsingLink = false;
  restoreLinkInput();
  var statusEl = document.getElementById('sbLinkStatus');
  if (statusEl) { statusEl.style.display = 'block'; statusEl.className = 'sb-link-status warning'; statusEl.textContent = '已取消分析'; }
  var input = document.getElementById('sbLinkInput');
  if (input) input.value = '';
}

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
    if (cancelZhilingFlag) return { success: false, error: '用户取消' };
    await new Promise(function(r) { setTimeout(r, 3000); });
    if (cancelZhilingFlag) return { success: false, error: '用户取消' };
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

  _lastParsedUrl = url;
  isParsingLink = true;
  cancelZhilingFlag = false;
  btn.disabled = true;

  // Transition to analyzing page
  var interviewInner = document.getElementById('sbInterviewInner');
  var analyzingEl = document.getElementById('sbAnalyzing');
  var analyzingStatus = document.getElementById('sbAnalyzingStatus');
  if (interviewInner) interviewInner.style.display = 'none';
  if (analyzingEl) {
    analyzingEl.style.display = 'flex';
    // Inject cancel button if not already present
    if (!document.getElementById('btnCancelParse')) {
      var cancelBtn = document.createElement('button');
      cancelBtn.id = 'btnCancelParse';
      cancelBtn.className = 'dialog-btn secondary';
      cancelBtn.style.cssText = 'margin-top:20px;font-size:.78rem;padding:8px 28px';
      cancelBtn.textContent = '取消';
      cancelBtn.onclick = cancelParseLink;
      analyzingEl.appendChild(cancelBtn);
    }
  }
  analyzingStatus.textContent = '正在提取视频信息…';

  try {
    var data = null;

    // Try Electron IPC first (local, no geo-blocking)
    if (window.electronAPI && window.electronAPI.parseLink) {
      analyzingStatus.textContent = '正在通过本地提取视频信息…';
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
      analyzingStatus.innerHTML = '<span class=\"material-symbols-outlined\">movie</span> 正在通过 AI 分析视频（约15-30秒）…';
      var zhilingResult = await callZhilingDirect(zhilingKey, url);
      if (zhilingResult && zhilingResult.success && zhilingResult.content) {
        data = {
          title: url,
          description: '',
          platform: '视频',
          _zhilingContent: zhilingResult.content
        };
      } else {
        // zhiling failed — go back to link input with error
        restoreLinkInput();
        showLinkStatus('解析失败：' + ((zhilingResult && zhilingResult.error) || '未知错误'), 'error');
        isParsingLink = false;
        return;
      }
    }

    if (!data) {
      restoreLinkInput();
      showLinkStatus('无法提取视频详情，链接可能已失效或需要登录。', 'warning');
      isParsingLink = false;
      return;
    }

    if (data._fallback && !data._zhilingContent) {
      if (!zhilingKey) {
        var hintHtml = '请先配置「视频分析 Key」— <a href="#" id="gotoZhilingKey" style="color:#5b9a8b;text-decoration:underline">去设置</a>';
        restoreLinkInput();
        showLinkStatus(hintHtml, 'warning');
        var gotoLink = document.getElementById('gotoZhilingKey');
        if (gotoLink) gotoLink.addEventListener('click', function(e) {
          e.preventDefault();
          switchTab('tabMe');
          openZhilingDialog();
        });
      } else {
        restoreLinkInput();
        showLinkStatus(data._message || '无法提取视频详情，请手动填写问答', 'warning');
      }
      isParsingLink = false;
      return;
    }

    // Fill interview answers from extracted data
    fillInterviewFromLink(data);

    if (data._zhilingContent) {
      // Phase 1 failed, zhiling was primary source — show preview
      showZhilingPreview(data._zhilingContent);
      input.value = '';
    } else if (zhilingKey) {
      // Phase 1 succeeded, now run zhiling for AI analysis
      document.getElementById('sbAnalyzingIcon').innerHTML = '<span class="material-symbols-outlined" style="font-size:3rem">movie</span>';
      document.getElementById('sbAnalyzingTitle').textContent = 'AI 正在分析视频画面';
      analyzingStatus.textContent = '预计 15-30 秒…';
      input.value = '';

      var zhilingPromise;
      if (window.electronAPI && window.electronAPI.callZhiling) {
        zhilingPromise = window.electronAPI.callZhiling(zhilingKey, url);
      } else {
        zhilingPromise = callZhilingDirect(zhilingKey, url);
      }
      zhilingPromise.then(function(result) {
        if (result && result.success && result.content) {
          // Merge zhiling result into interview content answer
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
          }
          // Show zhiling result preview, then user confirms → director analysis
          showZhilingPreview(result.content);
        } else {
          restoreLinkInput();
          showLinkStatus('⚠️ AI 分析失败：' + ((result && result.error) || '未知错误'), 'warning');
        }
      }).catch(function(e) {
        restoreLinkInput();
        showLinkStatus('⚠️ AI 分析失败：' + (e.message || '网络错误'), 'warning');
      });
    } else {
      // No zhilingKey — guide user to configure it
      restoreLinkInput();
      var noKeyHtml = '请先配置「视频分析 Key」— <a href="#" id="gotoZhilingKey2" style="color:#5b9a8b;text-decoration:underline">去设置</a>';
      showLinkStatus(noKeyHtml, 'warning');
      var gotoLink2 = document.getElementById('gotoZhilingKey2');
      if (gotoLink2) gotoLink2.addEventListener('click', function(e) {
        e.preventDefault();
        switchTab('tabMe');
        openZhilingDialog();
      });
      input.value = '';
    }
  } catch (e) {
    restoreLinkInput();
    showLinkStatus('解析失败：' + (e.message || '网络错误'), 'error');
  }

  isParsingLink = false;
}

// Helper: restore link input view, hide analyzing page
function restoreLinkInput() {
  var interviewInner = document.getElementById('sbInterviewInner');
  var analyzingEl = document.getElementById('sbAnalyzing');
  if (interviewInner) interviewInner.style.display = '';
  if (analyzingEl) analyzingEl.style.display = 'none';
  document.getElementById('sbAnalyzingIcon').innerHTML = '<span class="material-symbols-outlined" style="font-size:3rem">search</span>';
  document.getElementById('sbAnalyzingTitle').textContent = '正在分析视频…';
  // Re-enable parse button
  var btn = document.getElementById('btnParseLink');
  if (btn) btn.disabled = false;
}

// Helper: show status message on the link input page
function showLinkStatus(msg, className) {
  var el = document.getElementById('sbLinkStatus');
  el.style.display = 'block';
  el.className = 'sb-link-status ' + (className || '');
  if (msg.indexOf('<') >= 0) {
    el.innerHTML = msg;
  } else {
    el.textContent = msg;
  }
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

  // Store the original script text for Stage 2 skeleton preservation
  originalScriptText = contentText || '';

  // Answers filled silently; caller decides what to display
}

function detectPlatformFromUrl(u) {
  if (/douyin\.com|iesdouyin\.com/.test(u)) return '抖音';
  if (/tiktok\.com/.test(u)) return 'TikTok';
  if (/bilibili\.com|b23\.tv/.test(u)) return 'B站';
  if (/xiaohongshu\.com|xhslink\.com/.test(u)) return '小红书';
  if (/youtube\.com|youtu\.be/.test(u)) return 'YouTube';
  if (/kuaishou\.com/.test(u)) return '快手';
  return '';
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
    var sourceLabel = r.source === 'topic' ? '<span class="material-symbols-outlined">lightbulb</span> 自主创作' : '<span class="material-symbols-outlined">link</span> 链接分析';
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
  return '你是短视频改编导演助手。你的任务是将已有视频内容改编为新版本，而非从零创作。\n\n' +
    '## 核心原则：骨架移植，只换皮肤\n\n' +
    '原视频能火，是因为它的结构（节奏、情绪曲线、钩子位置、信息密度）已经被市场验证。你是"翻译官"，不是"创作者"。\n\n' +
    '以下内容**必须原样保留**：\n' +
    '- 情绪曲线的形状和位置：哪里紧张、哪里放松、哪里反转，一个都不准动\n' +
    '- 节奏和时长感：快切/慢镜/停顿的位置不变，信息释放的密度不变\n' +
    '- 钩子的类型和出现时机：原视频用什么方式勾住人，你就用什么方式\n' +
    '- 关键转折点和信息释放的顺序：先后次序、因果逻辑、信息量分布全部保留\n\n' +
    '以下内容**可以替换**：\n' +
    '- 人物 → 换成用户形象库中的角色，保留原角色的"功能"（教导者→教导者，搞笑者→搞笑者）\n' +
    '- 道具/产品 → 功能等价替换。原产品在视频中扮演什么角色（解决方案？冲突来源？情感载体？），新产品就扮演同样的角色\n' +
    '- 场景 → 可以换地点，但保持原场景的空间功能和氛围功能不变（户外开阔→室内开阔，不是户外→狭小角落）\n' +
    '- 语言 → 换用指定方言，保留原台词的核心信息量和情绪分量，不要因为翻译而缩水或注水\n\n' +
    '## 输出格式（所有字段必填，不得为空）\n\n' +
    '{\n' +
    '  "directorAnalysis": {\n' +
    '    "title": "吸引人的标题",\n' +
    '    "totalDuration": "内容预估总时长，如实反映内容密度和语速。通常每100字约15秒（必填，如：40s）",\n' +
    '    "directorBrief": {\n' +
    '      "coreIdea": "核心创意一句话：这个视频讲什么、为什么能火（必填）",\n' +
    '      "hookDesign": "前3秒钩子设计，从以下三个公式中选用：\\n' +
    '反常识断言式：\\"你以为X。但Y。\\"粉碎默认认知 → 硬核拆解/观点输出\\n' +
    '身份标签式：\\"如果你也在[做某件事]——\\"精准画像 → 故事分享/个人经历\\n' +
    '静默中断式：(停顿) + 一句话推翻常识 → 进阶/有信任基础后\\n' +
    '任选其一，3秒内必须制造认知缺口。不要自己发明新钩子（必填）",\n' +
    '      "emotionalTone": "情绪基调：整体色彩倾向/节奏感/语气风格，如 暖黄色调·快节奏·压迫感旁白（必填）",\n' +
    '      "visualReference": "视觉参考：像哪个账号/电影/摄影师的风格，如 日系生活美学·滨田英明风·低饱和暖调（必填）"\n' +
    '    },\n' +
    '    "keyFrames": ["前3秒抓眼球的具体画面", "中间转折/反差的画面", "结尾情绪落点的画面"],\n' +
    '    "preShotHints": {\n' +
    '      "suggestedCharacters": "建议角色数量和人设（如：1名主角·教导者风格·30岁男性 休闲装）",\n' +
    '      "suggestedScene": "建议场景（如：居家厨房·温馨氛围）",\n' +
    '      "suggestedProps": "建议关键道具（如：手机、灌肠模具）",\n' +
    '      "suggestedDuration": "建议时长，取最接近且≥totalDuration的档位（15s/30s/45s/60s）。如totalDuration为40s则填45s（必填）",\n' +
    '      "suggestedRatio": "建议比例 9:16/16:9/1:1（如：9:16）"\n' +
    '    }\n' +
    '  }\n' +
    '}\n\n' +
    '## 硬性要求\n' +
    (currentSpeechSpeed === 'slow' ? '- ⚡ 当前语速设置：慢速。每100字≈20秒。根据内容字数、信息密度、慢语速如实估算 totalDuration\n' : '') +
    (currentSpeechSpeed === 'fast' ? '- ⚡ 当前语速设置：快速。每100字≈10秒。根据内容字数、信息密度、快语速如实估算 totalDuration\n' : '') +
    (currentSpeechSpeed === 'normal' ? '- totalDuration 根据内容字数、信息密度、正常语速如实估算。每100字≈15秒\n' : '') +
    '- suggestedDuration 取 totalDuration 向上取整到最近的档位：15s/30s/45s/60s。如 totalDuration 为 38s → 填 45s\n' +
    '- keyFrames 必须覆盖用户描述中所有重要情节/对话/转折点！如果用户提到了6个要点，keyFrames就至少要6个！禁止缩减内容，15秒也可以有6个画面\n' +
    '- 用户描述中的所有台词、情节、要点都必须保留，不得省略任何一个\n' +
    '- hookDesign 要基于用户提供的信息，不要自己发明新的钩子方式\n' +
    '- 不要添加用户描述中没有的情节或转折\n' +
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
function buildShotsSystemPrompt() {
  var da = currentDirectorAnalysis || {};
  var db = da.directorBrief || {};
  var charList = characterProfiles.map(function(c) {
    return '- ' + c.id + ': ' + c.name + ' (' + c.type + ', ' + [c.gender, c.clothing].filter(Boolean).join(', ') + ')';
  }).join('\n');
  var sceneList = sceneProfiles.map(function(s) {
    return '- ' + s.id + ': ' + s.name + ' (' + [s.environment, s.atmosphere, s.lighting].filter(Boolean).join(' | ') + ')';
  }).join('\n');
  var totalDuration = parseInt(currentPreDuration) || 30;

  var prompt = '你是分镜翻译员。你的唯一工作是：把下面的内容原文逐字、逐句、逐动作地还原为分镜脚本 JSON。你没有创作权限，不允许发挥想象。\n\n' +
    '## 内容原文（逐字还原，禁止任何改动）\n' +
    (originalScriptText ? originalScriptText + '\n' : '（无内容原文）\n') +
    '\n⚠️ 以上是最终内容标准。你必须逐句、逐动作、逐情绪地还原为镜头语言。\n' +
    '严格禁止：\n' +
    '- 增删或改写任何一句台词\n' +
    '- 调整情节顺序或情绪节奏\n' +
    '- 添加原文中没有的情节、角色、对话、动作\n' +
    '允许的替换（仅此四项，超出即为违规）：\n' +
    '- 角色外观 → 换为形象库或指定的角色\n' +
    '- 场景环境 → 换为场景库或指定的场景\n' +
    '- 道具 → 换为指定的道具\n' +
    '- 语言口音 → 翻译为指定的方言\n' +
    '除此之外的一切——台词内容、情节结构、情绪走向、信息顺序——必须与原文完全一致。\n\n' +
    '## 导演分析（仅供视觉风格参考，不影响内容）\n' +
    '标题：' + (da.title || '') + '\n' +
    '总时长：' + (da.totalDuration || '') + '\n' +
    '核心创意：' + (db.coreIdea || '') + '\n' +
    '钩子设计：' + (db.hookDesign || '') + '\n' +
    '情绪基调：' + (db.emotionalTone || '') + '\n' +
    '视觉参考：' + (db.visualReference || '') + '\n' +
    '关键画面：' + ((da.keyFrames || []).join(' / ')) + '\n' +
    '⚠️ 导演分析仅影响画面的视觉呈现（光影、色调、构图）。不影响台词和情节。内容以「内容原文」为唯一标准。\n' +
    '\n## 生成要求\n' +
    '- 视频总时长：' + totalDuration + 's。每镜 2-5 秒，均匀分配，按内容原文的情节节奏自然分段\n' +
    '- 全文一次性生成所有镜头。每个镜头的 duration 字段标注累计时间范围如 "0s-3s"、"3s-7s"……\n' +
    (currentPreScene ? '\n主场景（所有镜头默认使用）：' + currentPreScene : '') +
    (currentPreCharIds.length > 0 ? '\n默认出场角色ID列表（必须全部出场）：' + currentPreCharIds.join(',') : '') +
    (keyProps ? '\n关键道具（必须在至少2个镜头中作为动作核心出现，不可仅作为背景）：' + keyProps : '') +
    '\n视频比例：' + currentPreRatio + '  帧率：' + currentPreFps + 'fps\n' +
    '台词语言：' + currentDialect + '。所有 dialogue 字段必须用' + currentDialect + '书写，严禁使用其他语言\n' +
    '语速：' + ({slow:'慢速',normal:'正常',fast:'快速'})[currentSpeechSpeed] + '。对白节奏和镜头时长按此语速调整\n' +
    buildCharAssignHint() + '\n' +
    '## 口语化脚本规则（dialogue 字段硬性约束）\n' +
    '- 每镜 dialogue ≤ 50 字（硬上限，超过必须拆成两个镜头）\n' +
    '- 每句话 ≤ 12 字，用句号断开。一个呼吸单位 = 一句话，念完换气\n' +
    '- 情绪写在文字里：短句强调重点、单字制造反转、换行留白呼吸。不靠 emotionBeat 字段\n' +
    '- 写完默念一遍，念不顺就删掉重写\n\n' +
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
    '## 硬性要求\n' +
    '- ⚠️ 内容原文是唯一真相来源。你的工作是逐句翻译为镜头语言，不是创作\n' +
    '- 原文中的每一句台词必须在对应分镜的 dialogue 字段中逐字出现\n' +
    '- 原文中的每一个动作描述必须映射到对应分镜的 action 字段\n' +
    '- 不得增删情节、不得调整顺序、不得改变情绪走向、不得添加原文没有的内容\n' +
    '- 总时长：' + totalDuration + 's。每镜 2-5 秒，按内容节奏均匀分配镜头数\n';

  prompt +=
    (keyProps ? '- 关键道具 ' + keyProps + ' 必须在至少2个镜头的 action 中作为核心出现，keyProps 字段明确标注，写清楚道具如何被手持/展示/互动\n' +
    '- dialogue 中如出现其他道具/产品名称，一律替换为 ' + keyProps + '。只替换名词，不要改写台词结构和含义\n' : '') +
    '- 所有 dialogue 台词必须用' + currentDialect + '书写，包括语气词也要符合' + currentDialect + '的表达习惯\n' +
    '- 每个镜头的 action 必须具体到身体动作和物体变化，不要写"进行展示"这种空话\n' +
    '- 运镜必须从运镜手法参考中选择，写出完整名称如"缓推 dolly in"\n' +
    '- 焦段根据景别选择：特写85mm+，近景50mm，中景35mm，全景24mm\n' +
    '- 第2镜起必填 continuity（9维衔接台账）：{"transition":"硬切/叠化/甩镜头/匹配剪辑","carryOver":["延续元素"],"newElements":["新元素"],"eyeLine":"视线方向变化","actionLink":"动作因果关系","emotionLink":"情绪变化","cameraLink":"运镜对比","lightingLink":"光影衔接（如：主光方向不变/柔光渐变硬/暖调转冷调）","spatialAnchor":"空间锚点（上一镜结束时画面状态→本镜开始时的状态，如：手举在半空→手已放下/门开到一半→门关上）"}\n' +
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
  db.hookDesign = db.hookDesign || '反常识断言式：给出颠覆默认认知的判断（如"200万吨扩产。不是看好信号。"），前3秒制造认知缺口';
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
  currentBatchTab = 0;

  var board = document.getElementById('sbBoard');
  board.innerHTML = '<div style="text-align:center;padding:80px 20px;color:#8a8278"><div style="font-size:3rem;margin-bottom:16px"><span class="material-symbols-outlined" style="font-size:3rem">videocam</span></div><div style="font-size:.95rem;font-weight:600;margin-bottom:8px">AI 正在生成全部分镜…</div><div style="font-size:.72rem">总时长 ' + totalDuration + 's，一次性生成所有镜头</div></div>';

  try {
    var allShots = await generateAllShots(totalDuration);
    distributeShotsToBatches(allShots, totalDuration);
    currentDirectorAnalysis.shots = allShots;
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
      '<button class="dialog-btn primary" onclick="generateShots()"><span class="material-symbols-outlined">refresh</span> 重试</button>' +
      '</div>';
  }

  isGenerating = false;
  updateStopButton();
}

async function generateAllShots(duration) {
  var totalDuration = parseInt(duration) || 30;
  var maxTokens = totalDuration <= 45 ? 8192 : 16384;
  var systemPrompt = buildShotsSystemPrompt();
  console.log('[generateAllShots] systemPrompt length:', systemPrompt.length, 'maxTokens:', maxTokens);
  var userPrompt = '请生成完整的' + totalDuration + '秒分镜脚本，一次性输出所有镜头。';
  var streamText = await doStoryboardApiCall(systemPrompt, userPrompt, { maxTokens: maxTokens, timeout: 180000, noStream: true });
  console.log('[generateAllShots] API returned, length:', streamText.length);

  var jsonText = collectStreamJson(streamText);
  if (!jsonText) {
    console.log('[generateAllShots] PARSE FAILED, raw:', streamText);
    throw new Error('分镜JSON解析失败');
  }

  var data = JSON.parse(jsonText);
  var shots = Array.isArray(data) ? data : (data.shots || []);
  if (!Array.isArray(shots) || shots.length === 0) throw new Error('分镜数据为空');

  // Assign global shot IDs
  shots.forEach(function(shot, i) {
    shot.id = 'shot_' + (i + 1);
  });
  normalizeShotsArray(shots, false);
  console.log('[generateAllShots] done:', shots.length, 'shots');
  return shots;
}

function distributeShotsToBatches(allShots, totalDuration) {
  var numBatches = Math.ceil(totalDuration / 15);
  var batchSec = 15;

  shotBatches = [];
  for (var b = 0; b < numBatches; b++) {
    var startT = b * batchSec;
    var endT = Math.min((b + 1) * batchSec, totalDuration);
    shotBatches.push({ shots: [], startTime: startT, endTime: endT, generated: true });
  }

  // Distribute shots evenly across batches
  var perBatch = Math.ceil(allShots.length / numBatches);
  allShots.forEach(function(shot, i) {
    var bi = Math.min(Math.floor(i / perBatch), numBatches - 1);
    shotBatches[bi].shots.push(shot);
  });
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
        shot.continuity = { transition: '硬切', carryOver: [], newElements: [], eyeLine: '', actionLink: '', emotionLink: '', cameraLink: '', lightingLink: '', spatialAnchor: '' };
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

  var html = '<div class="sb-board-scroll">';

  // Title + duration
  html += '<div style="text-align:center;padding:12px 0 8px"><span style="font-size:1.15rem;font-weight:700"><span class="material-symbols-outlined">movie</span> ' + escapeHtml(da.title || '未命名') + '</span><br><span style="font-size:.8rem;font-weight:700;color:#5b9a8b">' + escapeHtml(da.totalDuration || '') + '</span></div>';

  // Combined analysis + hints — scrollable card row
  var hints = da.preShotHints || {};
  html += '<div class="sb-section">';
  html += '<div class="sb-section-header"><span><span class="material-symbols-outlined">description</span> 导演分析与分镜建议</span></div>';
  html += '<div class="sb-da-cards">';

  // Director analysis cards
  html += '<div class="da-card"><div class="da-card-icon"><span class="material-symbols-outlined">lightbulb</span></div><div class="da-card-label">核心创意</div><div class="da-card-text">' + escapeHtml(db.coreIdea || '') + '</div></div>';
  html += '<div class="da-card"><div class="da-card-icon"><span class="material-symbols-outlined">target</span></div><div class="da-card-label">钩子设计</div><div class="da-card-text">' + escapeHtml(db.hookDesign || '') + '</div></div>';
  html += '<div class="da-card"><div class="da-card-icon"><span class="material-symbols-outlined">palette</span></div><div class="da-card-label">情绪基调</div><div class="da-card-text">' + escapeHtml(db.emotionalTone || '') + '</div></div>';
  html += '<div class="da-card"><div class="da-card-icon"><span class="material-symbols-outlined">camera</span></div><div class="da-card-label">视觉参考</div><div class="da-card-text">' + escapeHtml(db.visualReference || '') + '</div></div>';
  html += '<div class="da-card"><div class="da-card-icon"><span class="material-symbols-outlined">filter_frames</span></div><div class="da-card-label">关键画面</div><div class="da-card-text">' + kf.map(function(f) { return escapeHtml(f); }).join('<br>') + '</div></div>';

  // Hints cards
  html += '<div class="da-card da-card-hint"><div class="da-card-icon"><span class="material-symbols-outlined">person</span></div><div class="da-card-label">角色</div><div class="da-card-text">' + escapeHtml(hints.suggestedCharacters || '1名主角') + '</div></div>';
  html += '<div class="da-card da-card-hint"><div class="da-card-icon"><span class="material-symbols-outlined">home</span></div><div class="da-card-label">场景</div><div class="da-card-text">' + escapeHtml(hints.suggestedScene || '居家') + '</div></div>';
  html += '<div class="da-card da-card-hint"><div class="da-card-icon"><span class="material-symbols-outlined">inventory_2</span></div><div class="da-card-label">道具</div><div class="da-card-text">' + escapeHtml(hints.suggestedProps || '无特殊道具') + '</div></div>';
  html += '<div class="da-card da-card-hint"><div class="da-card-icon"><span class="material-symbols-outlined">timer</span></div><div class="da-card-label">时长·比例</div><div class="da-card-text">' + escapeHtml(hints.suggestedDuration || '30s') + ' · ' + escapeHtml(hints.suggestedRatio || '9:16') + '</div></div>';

  html += '</div></div>';

  html += '</div>';  // close sb-board-scroll

  // Confirm button → go to pre-shot settings (fixed at bottom)
  html += '<div class="sb-board-actions">';
  html += '<button class="dialog-btn secondary" onclick="resetToInterview()" style="margin-right:8px;font-size:.82rem;padding:10px 24px"><span class="material-symbols-outlined">refresh</span> 重新来</button>';
  html += '<button class="dialog-btn primary" onclick="renderPreShotSettings()" style="font-size:.92rem;padding:12px 36px">确认，设置分镜参数 →</button>';
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
    if (hints.suggestedDuration) currentPreDuration = hints.suggestedDuration.replace('s', '');
    if (hints.suggestedRatio) currentPreRatio = hints.suggestedRatio;
  }

  var charNames = currentPreCharIds.map(function(id) {
    var ch = findCharById(id);
    return ch ? ch.name : '';
  }).filter(Boolean);
  var allSet = currentPreCharIds.length > 0 && currentPreScene && keyProps;

  var html = '<div class="sb-board-scroll">';

  // Top bar: back button
  html += '<div style="display:flex;align-items:center;padding:4px 0 8px">';
  html += '<button class="sb-nav-btn secondary" onclick="renderDirectorReview()" style="font-size:.72rem;padding:6px 14px">← 返回导演分析</button>';
  html += '</div>';

  html += '<div style="text-align:center;padding:8px 0 6px"><span style="font-size:1rem;font-weight:700"><span class="material-symbols-outlined">tune</span> 分镜前设定</span><span style="font-size:.68rem;color:#8a8278;margin-left:6px">全部必选</span></div>';

  html += '<div class="sb-pre-shots">';

  // Character row
  html += '<div class="sb-pre-row" onclick="pickPreChar()"><span class="sb-pre-label"><span class="material-symbols-outlined">person</span> 角色</span>';
  html += '<span class="sb-pre-val ' + (charNames.length > 0 ? '' : 'empty') + '">' + (charNames.length > 0 ? charNames.join('、') : '点击选择') + '</span>';
  html += '<span class="sb-pre-edit">选角色 →</span></div>';

  // Scene row
  html += '<div class="sb-pre-row" onclick="pickSceneForPreShot(\'' + (currentPreScene || '') + '\')"><span class="sb-pre-label"><span class="material-symbols-outlined">home</span> 场景</span>';
  html += '<span class="sb-pre-val ' + (currentPreScene ? '' : 'empty') + '">' + (currentPreScene || '点击选择') + '</span>';
  html += '<span class="sb-pre-edit">选场景 →</span></div>';

  // Props row
  html += '<div class="sb-pre-row" onclick="pickPreProps()"><span class="sb-pre-label">📦 道具</span>';
  html += '<span class="sb-pre-val ' + (keyProps ? '' : 'empty') + '">' + (keyProps || '点击设置') + '</span>';
  html += '<span class="sb-pre-edit">设道具 →</span></div>';

  // Duration row
  html += '<div class="sb-pre-row"><span class="sb-pre-label"><span class="material-symbols-outlined">timer</span> 时长</span>';
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
  html += '<div class="sb-pre-row" onclick="pickDialect()"><span class="sb-pre-label"><span class="material-symbols-outlined">record_voice_over</span> 方言</span>';
  html += '<span class="sb-pre-val">' + escapeHtml(currentDialect || '普通话') + '</span>';
  html += '<span class="sb-pre-edit">选方言 →</span></div>';

  // Speech speed row
  var speedLabels = { slow: '慢速 (0.8x)', normal: '正常 (1.0x)', fast: '快速 (1.3x)' };
  html += '<div class="sb-pre-row"><span class="sb-pre-label">⚡ 语速</span>';
  html += '<span class="sb-pre-val">';
  ['slow','normal','fast'].forEach(function(s) {
    html += '<span class="sb-dur-chip' + (currentSpeechSpeed === s ? ' active' : '') + '" onclick="setSpeechSpeed(\'' + s + '\')">' + speedLabels[s] + '</span>';
  });
  html += '</span></div>';

  // Subtitle toggle row
  html += '<div class="sb-pre-row" onclick="toggleSubtitle()"><span class="sb-pre-label">💬 字幕</span>';
  html += '<span class="sb-pre-val">' + (subtitleEnabled ? '开启' : '关闭') + '</span>';
  html += '<span class="sb-pre-toggle"><span class="toggle-switch' + (subtitleEnabled ? ' on' : '') + '"><span class="toggle-knob"></span></span></span></div>';

  // BGM toggle row
  html += '<div class="sb-pre-row" onclick="toggleBgm()"><span class="sb-pre-label"><span class="material-symbols-outlined">music_note</span> BGM</span>';
  html += '<span class="sb-pre-val">' + (bgmEnabled ? '开启' : '关闭') + '</span>';
  html += '<span class="sb-pre-toggle"><span class="toggle-switch' + (bgmEnabled ? ' on' : '') + '"><span class="toggle-knob"></span></span></span></div>';

  html += '</div>';  // close sb-pre-shots
  html += '</div>';  // close sb-board-scroll

  // Confirm button (fixed at bottom, full width)
  html += '<div class="sb-board-actions" style="text-align:center">';
  html += '<button class="dialog-btn primary" id="btnConfirmDirector" onclick="generateShots()" style="font-size:.92rem;padding:12px 36px;width:100%"' + (allSet ? '' : ' disabled') + '>确认，生成分镜 <span class="material-symbols-outlined">auto_awesome</span></button>';
  if (!allSet) html += '<div style="font-size:.65rem;color:#e57373;margin-top:4px">请先选择角色、场景和道具（上方带虚线的项）</div>';
  html += '</div>';  // close sb-board-actions

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

  var html = '<div class="sb-board-scroll">';

  // Header
  var totalShots = (da.shots || []).length;
  html += '<div class="sb-shots-header">';
  html += '<button class="sb-nav-btn secondary" onclick="renderDirectorReview()" style="font-size:.72rem;padding:6px 14px">← 导演分析</button>';
  html += '<button class="sb-action-btn" onclick="regenerateCurrentBatch()" style="font-size:.68rem;padding:5px 12px"><span class="material-symbols-outlined">refresh</span> 重新生成</button>';
  html += '</div>';
  html += '<div style="text-align:center;padding:0 0 2px;font-weight:700;font-size:.85rem"><span class="material-symbols-outlined">videocam</span> ' + escapeHtml(da.title || '分镜') + '</div>';
  html += '<div style="text-align:center;padding:0 0 10px;font-size:.8rem;font-weight:700;color:#5b9a8b">' + escapeHtml(da.totalDuration || '') + ' · ' + totalShots + '镜</div>';

  // Gallery navigation (current batch only)
  html += '<div class="gallery-nav">';
  html += '<button class="gallery-arrow" id="sbGalleryPrev" onclick="changeGallery(-1)" disabled><span class="material-symbols-outlined">chevron_left</span></button>';
  html += '<div class="gallery-viewport" id="sbShotCard">' + (batchShots.length > 0 ? renderOneShotCard(batchShots[0], 0) : '<div style="text-align:center;padding:40px;color:#8a8278">本段尚未生成</div>') + '</div>';
  html += '<button class="gallery-arrow" id="sbGalleryNext" onclick="changeGallery(1)" ' + (batchShots.length < 2 ? 'disabled' : '') + '><span class="material-symbols-outlined">chevron_right</span></button>';
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

  html += '</div>';  // close sb-board-scroll

  // Primary actions (fixed at bottom)
  html += '<div class="sb-board-actions">';
  var allChars = getStoryboardChars();
  if (allChars.length >= 2) {
    html += '<button class="sb-action-btn" onclick="swapStoryboardChars()" title="互换两个角色的所有出场"><span class="material-symbols-outlined">swap_horiz</span> 互换角色</button>';
  }

  html += '<div class="sb-actions-bar">';

  if (batchShots.length > 0) {
    html += '<button class="sb-action-btn" onclick="openShotEditor(galleryIndex)"><span class="material-symbols-outlined">edit</span> 镜头修改</button>';
  }
  html += '<button class="sb-action-btn" onclick="exportStoryboardPrompts()"><span class="material-symbols-outlined">content_paste</span> 即梦提示词</button>';

  html += '</div>';  // close sb-actions-bar

  // Segment navigation for multi-batch
  if (shotBatches.length > 1) {
    html += '<div class="batch-tabs" style="justify-content:center;padding:4px 0 0">';
    shotBatches.forEach(function(b, i) {
      var cls = 'batch-tab';
      if (i === currentBatchTab) cls += ' active';
      if (b.generated) cls += ' done';
      html += '<span class="' + cls + '" onclick="switchBatchTab(' + i + ')">' + b.startTime + '-' + b.endTime + 's · ' + b.shots.length + '镜</span>';
    });
    html += '</div>';
    html += '<div class="sb-seg-nav">';
    html += '<button class="sb-seg-nav-btn" onclick="switchBatchTab(' + (currentBatchTab - 1) + ')"' + (currentBatchTab <= 0 ? ' disabled' : '') + '><span class="material-symbols-outlined">chevron_left</span> 上一段</button>';
    html += '<span class="sb-seg-nav-label">第 ' + (currentBatchTab + 1) + ' / ' + shotBatches.length + ' 段</span>';
    html += '<button class="sb-seg-nav-btn" onclick="switchBatchTab(' + (currentBatchTab + 1) + ')"' + (currentBatchTab >= shotBatches.length - 1 ? ' disabled' : '') + '>下一段 <span class="material-symbols-outlined">chevron_right</span></button>';
    html += '</div>';
  }

  html += '</div>';  // close sb-board-actions

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
  if (!confirm('将重新生成全部分镜，当前内容会被覆盖。确定？')) return;
  generateShots();
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
  lines += '- 以上信息来自对原视频的拆解。你是改编者，不是创作者。请忠实还原原始骨架——包括情绪曲线形状、节奏快慢分布、钩子时机、信息释放顺序\n';
  lines += '- 人物、场景、道具可以替换为用户指定的版本，但每个镜头的情感功能和节奏定位必须保留\n';
  lines += '- 开场hook方式严格使用：' + (opening || '反常识断言式') + '。反常识断言式→3秒内粉碎默认认知。身份标签式→精准画像。静默中断式→停顿+推翻。不要改成其他方式\n';
  if (content) lines += '- 从用户描述中提取具体情节、画面、台词，不要凭空编造，也不要遗漏任何要点\n';

  return '## 用户对原视频的拆解描述\n\n' + lines + '\n\n请根据以上信息，忠实改编为导演分镜表JSON。不要自行增减情节。';
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
  // Fix "keyNameValue" → "keyName":"Value" (LLM dropped key's closing quote + colon + value's opening quote)
  fixed3 = fixed3.replace(/"([a-zA-Z_]\w*)([^":\{\[\}\],\s\\\w][^"]*)"/g, '"$1":"$2"');
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

var ANTHROPIC_ENDPOINT = 'https://api.deepseek.com/anthropic/v1/messages';

async function doStoryboardApiCall(systemPrompt, userPrompt, opts) {
  abortController = new AbortController();
  var model = settings.model === 'custom' ? settings.customModel : settings.model;
  opts = opts || {};
  console.log('[doStoryboardApiCall] model:', model, 'enableSearch:', !!opts.enableSearch);

  // timeout
  var timeoutMs = opts.timeout || 30000;
  var timeoutId = setTimeout(function() { abortController.abort(); }, timeoutMs);

  // Build Anthropic-format messages — user content as text block
  var messages = [
    { role: 'user', content: userPrompt }
  ];

  var body = {
    model: model,
    system: systemPrompt,
    messages: messages,
    stream: !opts.noStream,
    temperature: 0.7,
    max_tokens: opts.maxTokens || 4096
  };

  // Enable web search tool when requested
  if (opts.enableSearch) {
    body.tools = [{
      type: 'web_search_20260209',
      name: 'web_search',
      input_schema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索查询关键词' },
          explanation: { type: 'string', description: '一句话解释为什么这个搜索有助于完成任务' }
        },
        required: ['query']
      }
    }];
    body.tool_choice = { type: 'auto' };
  }

  try {
  var resp = await fetch(ANTHROPIC_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': settings.apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify(body),
    signal: abortController.signal
  });
  clearTimeout(timeoutId);
  console.log('[doStoryboardApiCall] response status:', resp.status);

  if (!resp.ok) {
    var errText = await resp.text();
    console.log('[doStoryboardApiCall] error body:', errText.slice(0, 500));
    var errMsg = 'API错误 ' + resp.status;
    if (resp.status === 401) errMsg = 'API Key 无效，请在设置中检查';
    else if (resp.status === 404) errMsg = 'Endpoint 不存在，请检查地址';
    throw new Error(errMsg);
  }

  // Non-streaming
  if (opts.noStream) {
    var json = await resp.json();
    var content = '';
    var blocks = json.content || [];
    for (var i = 0; i < blocks.length; i++) {
      if (blocks[i].type === 'text') content += blocks[i].text;
    }
    console.log('[doStoryboardApiCall] non-stream response, length:', content.length);
    return content;
  }

  // Streaming — Anthropic SSE format (events delimited by \n\n)
  var fullText = '';
  var reader = resp.body.getReader();
  var decoder = new TextDecoder();
  var chunkCount = 0;
  var buffer = '';

  while (true) {
    var result = await reader.read();
    if (result.done) { console.log('[stream] done after', chunkCount, 'chunks'); break; }
    chunkCount++;
    buffer += decoder.decode(result.value, { stream: true });

    // Split on \n\n — each complete SSE event ends with a blank line
    var events = buffer.split('\n\n');
    // Keep incomplete trailing event in buffer
    buffer = events.pop() || '';

    for (var i = 0; i < events.length; i++) {
      // Find the data: line within this event
      var evtLines = events[i].split('\n');
      var dataStr = '';
      for (var j = 0; j < evtLines.length; j++) {
        var line = evtLines[j].trim();
        if (line.startsWith('data:')) {
          dataStr = line.slice(5).trim();
          break;
        }
      }
      if (!dataStr) continue;
      try {
        var evt = JSON.parse(dataStr);
        if (evt.type === 'content_block_delta') {
          var d = evt.delta;
          if (d && d.type === 'text_delta' && d.text) fullText += d.text;
        }
        if (evt.type === 'content_block_start' && evt.content_block) {
          var cb = evt.content_block;
          if (cb.type === 'server_tool_use') {
            console.log('[stream] LLM searching web:', cb.name);
          }
          if (cb.type === 'web_search_tool_result') {
            console.log('[stream] web search results received');
          }
        }
      } catch(e) {}
    }
    if (chunkCount % 10 === 0) console.log('[stream] chunk', chunkCount, ', text length:', fullText.length);
    if (chunkCount > 1000) { console.log('[stream] SAFETY BREAK'); break; }
  }

  // Process any remaining event in buffer
  if (buffer.trim()) {
    var remEvtLines = buffer.split('\n');
    var remData = '';
    for (var k = 0; k < remEvtLines.length; k++) {
      if (remEvtLines[k].trim().startsWith('data:')) {
        remData = remEvtLines[k].trim().slice(5).trim();
        break;
      }
    }
    if (remData) {
      try {
        var remEvt = JSON.parse(remData);
        if (remEvt.type === 'content_block_delta') {
          var rd = remEvt.delta;
          if (rd && rd.type === 'text_delta' && rd.text) fullText += rd.text;
        }
      } catch(e) {}
    }
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

  // Shot type badge — top-right corner
  html += '<span class="shot-type-badge">' + escapeHtml(shot.shotType || '中景') + '</span>';

  // Header: shot number + duration
  html += '<div class="sb-shot-card-header">';
  html += '<span class="shot-num">' + (index + 1) + '</span>';
  html += '<span style="font-size:.76rem;font-weight:700;color:#5b9a8b">' + escapeHtml(shot.duration || '') + '</span>';
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
    continuity.emotionLink || '',
    continuity.spatialAnchor || ''
  ].filter(Boolean).join(' | ');
  var extra = [
    continuity.lightingLink || ''
  ].filter(Boolean);
  return '<div class="sb-continuity-bar" title="' + escapeHtml(detail + (extra.length ? ' | 光影:' + extra.join('') : '')) + '">' +
    '<span class="cont-transition">🔗 ' + escapeHtml(continuity.transition || '硬切') + '</span>' +
    '<span class="cont-detail">' + escapeHtml(detail) + '</span>' +
    (extra.length ? '<span class="cont-light">💡' + escapeHtml(extra.join('')) + '</span>' : '') +
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
    document.getElementById('seLightingLink').value = cont.lightingLink || '';
    document.getElementById('seSpatialAnchor').value = cont.spatialAnchor || '';
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
      cameraLink: document.getElementById('seCameraLink').value.trim(),
      lightingLink: document.getElementById('seLightingLink').value.trim(),
      spatialAnchor: document.getElementById('seSpatialAnchor').value.trim()
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
    newShot.continuity = { transition: '硬切 cut', carryOver: [], newElements: [], eyeLine: '', actionLink: '', emotionLink: '', cameraLink: '', lightingLink: '', spatialAnchor: '' };
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
  var a = names[0], b = names[1];
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
var currentSpeechSpeed = 'normal';  // speech speed: slow/normal/fast

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
var subtitleEnabled = false;    // subtitle toggle, default off
var bgmEnabled = true;          // BGM toggle, default on
var shotBatches = [];           // [{shots, startTime, endTime, generated}]
var currentBatchTab = 0;        // active batch tab index

function pickSceneForPreShot(fromName) {
  pickerFromName = fromName;
  pickerMode = 'scene-preset';

  document.getElementById('pickerTitle').textContent = '🏠 选择主场景';
  document.getElementById('pickerCurrentList').innerHTML = currentPreScene ? '<span class="picker-tag selected" style="background:#5b9a8b;color:#fff">当前：' + escapeHtml(currentPreScene) + '</span>' : '';

  if (!sceneProfiles.length) {
    document.getElementById('pickerList').innerHTML =
      '<div style="padding:20px;text-align:center;color:#a09880;font-size:.78rem">暂无场景。</div>' +
      '<div style="text-align:center;padding:0 20px 20px"><button class="dialog-btn primary" onclick="closePicker();openSceneManager()" style="font-size:.82rem;padding:10px 24px">➕ 新增场景</button></div>';
  } else {
    document.getElementById('pickerList').innerHTML = sceneProfiles.map(function(s) {
      var sel = s.name === currentPreScene ? ' style="border-color:#5b9a8b;background:#eef7f4"' : '';
      return '<div class="picker-item"' + sel + ' onclick="confirmPreScene(\'' + s.name + '\')">' +
        '<span class="picker-avatar">🏠</span>' +
        '<div><div class="picker-name">' + escapeHtml(s.name) + '</div>' +
        '<div class="picker-detail">' + escapeHtml([s.environment, s.atmosphere].filter(Boolean).join(' · ') || '场景') + '</div></div>' +
        '</div>';
    }).join('') +
      '<div class="picker-item" onclick="confirmPreScene(\'\')" style="color:#e57373">✕ 清除场景</div>' +
      '<div style="border-top:1px solid #e0dcd3;margin-top:10px;padding-top:10px">' +
      '<button class="dialog-btn secondary" onclick="closePicker();openSceneManager()" style="font-size:.78rem;padding:8px 16px">➕ 新增场景</button>' +
      '</div>';
  }
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

function setSpeechSpeed(val) {
  currentSpeechSpeed = val;
  renderPreShotSettings();
}

function toggleSubtitle() {
  subtitleEnabled = !subtitleEnabled;
  renderPreShotSettings();
}

function toggleBgm() {
  bgmEnabled = !bgmEnabled;
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

  ptitle.textContent = '👤 选择角色（最多2人同时出镜）';

  if (characterProfiles.length === 0) {
    pcurrent.innerHTML = '';
    plist.innerHTML = '<div style="padding:20px;text-align:center;color:#a09880;font-size:.78rem">暂无形象。</div>' +
      '<div style="text-align:center;padding:0 20px 20px"><button class="dialog-btn primary" onclick="closePicker();openCharacterEditor()" style="font-size:.82rem;padding:10px 24px">➕ 新增形象</button></div>';
    document.getElementById('pickerOverlay').classList.add('open');
    return;
  }

  // Ensure every character has an id
  characterProfiles.forEach(function(c) { if (!c.id) c.id = generateId(); });

  var selectedChars = characterProfiles.filter(function(c) { return currentPreCharIds.indexOf(c.id) >= 0; });
  var availableChars = characterProfiles.filter(function(c) { return currentPreCharIds.indexOf(c.id) < 0; });

  // Top: selected characters (click to remove)
  pcurrent.innerHTML = (selectedChars.length > 0
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
  if (selectedChars.length >= 2) {
    h += '<div style="color:#e57373;font-size:.72rem;padding:10px;text-align:center">已达上限（最多2人），请先移除已选角色</div>';
  } else {
    h += availableChars.length > 0
      ? availableChars.map(function(c) {
          return '<div class="picker-item" data-char-id="' + c.id + '" style="cursor:pointer">' +
            '<span class="picker-avatar">' + (c.gender === '男' ? '👨' : '👩') + '</span>' +
            '<div><div class="picker-name">' + escapeHtml(c.name) + '</div>' +
            '<div class="picker-detail">' + escapeHtml([c.gender, c.age, c.clothing].filter(Boolean).join(' · ') || '无详细信息') + '</div></div>' +
            '</div>';
        }).join('')
      : '<div style="color:#a09880;font-size:.78rem;padding:10px">所有角色已选中</div>';
  }

  h += '<div style="border-top:1px solid #e0dcd3;margin-top:10px;padding-top:10px;display:flex;gap:8px;align-items:center">';
  h += '<button class="dialog-btn secondary" onclick="closePicker();openCharacterEditor()" style="font-size:.78rem;padding:8px 16px">➕ 新增形象</button>';
  if (selectedChars.length > 0) {
    h += '<button class="dialog-btn secondary pre-char-clear-btn" style="font-size:.78rem;padding:8px 16px;margin-left:auto">清除</button>';
  }
  h += '<button class="dialog-btn primary pre-char-confirm-btn" style="font-size:.78rem;padding:8px 20px">确定</button>';
  h += '</div>';

  plist.innerHTML = h;
  document.getElementById('pickerOverlay').classList.add('open');

  // Event delegation: click on available chars → add to selection
  plist.onclick = function(e) {
    var el = e.target.closest('[data-char-id]');
    if (el) {
      var id = el.getAttribute('data-char-id');
      if (currentPreCharIds.indexOf(id) < 0) {
        if (currentPreCharIds.length >= 2) { alert('最多选择2个角色同时出镜'); return; }
        currentPreCharIds.push(id);
      }
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
  resetStoryboardState();
}

function resetStoryboardState() {
  currentDirectorAnalysis = null;
  shotBatches = [];
  galleryIndex = 0;
  currentBatchTab = 0;
  currentPreScene = '';
  currentPreCharIds = [];
  currentPreDuration = '30';
  currentPreRatio = '9:16';
  currentPreFps = '24';
  currentStoryboard = null;
  interviewStep = 0;
  interviewAnswers = [];
  document.getElementById('sbInterview').style.display = 'flex';
  document.getElementById('sbAnalyzing').style.display = 'none';
  document.getElementById('sbPreview').style.display = 'none';
  document.getElementById('sbBoard').style.display = 'none';
  document.getElementById('sbLinkInput').value = '';
  document.getElementById('sbLinkStatus').style.display = 'none';
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

  return parts.join('。') + '。';
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

  // Build output — compact format to fit 即梦 input limits
  var out = '🎬 ' + (sb.title || '未命名');
  out += ' | ' + totalDur + ' | ' + ratio + ' | ' + fps + 'fps';
  if (currentDialect && currentDialect !== '普通话') out += ' | ' + currentDialect;
  if (subtitleEnabled) out += ' | 字幕';
  if (bgmEnabled) out += ' | BGM';
  if (keyProps) out += ' | 道具：' + keyProps;
  if (styles.length) out += ' | ' + styles.join('·');
  out += '\n';

  var charDescs = usedCharIds.map(describeCharacter).filter(Boolean);
  if (charDescs.length) out += '角色：' + charDescs.join('；') + '\n';
  var sceneDescs = usedSceneIds.map(describeScene).filter(Boolean);
  if (sceneDescs.length) out += '场景：' + sceneDescs.join('；') + '\n';

  shots.forEach(function(shot, i) {
    out += (i + 1) + '. ' + (shot.duration || '') + ' ';
    out += buildShotProse(shot);
    if (shot.dialogue) out += ' 台词："' + shot.dialogue + '"';
    out += '\n';
  });

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

  // Long-press tab to reset flow
  addLongPress(document.querySelector('.tab-item[data-tab="tabStoryboard"]'), function() {
    resetStoryboardState();
  }, '重新开始？当前故事板流程将回到初始状态。');

  addLongPress(document.querySelector('.tab-item[data-tab="tabCreate"]'), function() {
    resetCreatePage();
  }, '返回创作初始状态？选题和内容将清除。');

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

function setTopicDuration(val, el) {
  topicDuration = val;
  document.querySelectorAll('#topicDurationSegs .topic-seg').forEach(function(s) { s.classList.remove('active'); });
  if (el) el.classList.add('active');
  clearDurationHint();
}

function buildSettingsSummary() {
  var angleIcon = topicContentAngle === 'product' ? 'ads_click' : 'psychology';
  var angleLabel = topicContentAngle === 'product' ? '带货向' : '人设向';
  var formatIcon = topicFormat === 'single' ? 'person' : 'groups';
  var formatLabel = topicFormat === 'single' ? '单人口播' : '双人演绎';
  var styleLabels = { normal: '常规', comedy: '搞笑反转', emotional: '情感共鸣' };
  var styleLabel = styleLabels[topicContentStyle] || '常规';
  var styleIcon = topicContentStyle === 'comedy' ? 'theater_comedy' : (topicContentStyle === 'emotional' ? 'favorite' : 'description');
  var durHtml = '<span class="material-symbols-outlined">timer</span>' + topicDuration + 's';
  if (suggestedDuration && suggestedDuration !== parseInt(topicDuration)) {
    durHtml += ' <span style="font-size:.7rem;color:#8a8278">→ 建议 ' + suggestedDuration + 's</span>';
  }
  return '<span class="setting-pill"><span class="material-symbols-outlined">' + angleIcon + '</span>' + angleLabel + '</span>' +
    '<span class="setting-pill"><span class="material-symbols-outlined">' + formatIcon + '</span>' + formatLabel + '</span>' +
    '<span class="setting-pill">' + durHtml + '</span>' +
    '<span class="setting-pill"><span class="material-symbols-outlined">' + styleIcon + '</span>' + styleLabel + '</span>';
}

function updateDurationHint(calc) {
  if (!calc) {
    var hint = document.getElementById('topicDurationHint');
    if (hint) hint.style.display = 'none';
    return;
  }
  var speedLabels = { comedy: '快速 10字/s', normal: '正常 6.7字/s', emotional: '慢速 5.0字/s' };
  var html = 'AI 时长建议：<b>' + calc.suggestedRounded + 's</b> &nbsp;(' +
    calc.wordCount + '字 ÷ ' + (speedLabels[topicContentStyle] || '6.7字/s') +
    ' × 情绪系数' + calc.emotionCoef.toFixed(2) +
    ' + 停顿' + calc.pauseComp.toFixed(0) + 's';
  if (calc.visualAnim > 0) html += ' + 动画' + calc.visualAnim.toFixed(0) + 's';
  html += ' → ' + calc.suggestedRaw.toFixed(0) + 's 取整)';
  var hint = document.getElementById('topicDurationHint');
  if (hint) { hint.innerHTML = html; hint.style.display = 'block'; }
}

function clearDurationHint() {
  suggestedDuration = null;
  updateDurationHint(null);
  var summary = document.getElementById('topicSettingsSummary');
  if (summary) summary.innerHTML = buildSettingsSummary();
}

function syncTopicSettingsToUI() {
  // Radio buttons — content angle in audience panel, others in settings edit
  document.querySelectorAll('#topicAudiencePanel input[type=radio]').forEach(function(r) {
    if (r.name === 'topicContentAngle2') r.checked = r.value === topicContentAngle;
  });
  document.querySelectorAll('#topicSettingsEdit input[type=radio]').forEach(function(r) {
    if (r.name === 'topicFormat') r.checked = r.value === topicFormat;
    if (r.name === 'topicContentStyle') r.checked = r.value === topicContentStyle;
  });
  // Duration segs
  document.querySelectorAll('#topicDurationSegs .topic-seg').forEach(function(s) {
    s.classList.toggle('active', s.dataset.val === topicDuration);
  });
  // Update hints
  updateTopicSettingHints();
  // Update summary bar
  var summary = document.getElementById('topicSettingsSummary');
  if (summary) summary.innerHTML = buildSettingsSummary();
  // Render selected audience card in settings panel
  renderSettingsAudCard();
}

function renderSettingsAudCard() {
  var card = document.getElementById('settingsAudCard');
  if (!card) return;
  var aud = selectedAudienceIndex >= 0 ? topicAudiences[selectedAudienceIndex] : null;
  if (!aud) { card.style.display = 'none'; return; }
  card.style.display = 'flex';
  card.innerHTML =
    '<span class="material-symbols-outlined">groups</span>' +
    '<div>' +
      '<div class="settings-aud-label">目标人群</div>' +
      '<div class="settings-aud-text">' + escapeHtml(aud.painPoint) + ' <span style="color:#c4b89e">——</span> ' + escapeHtml(aud.audienceDescription) + '</div>' +
    '</div>';
}

function updateTopicSettingHints() {
  var hintAngle = document.getElementById('audienceAngleHint');
  var hintFormat = document.getElementById('hintFormat');
  var hintStyle = document.getElementById('hintContentStyle');
  if (hintAngle) hintAngle.textContent = topicContentAngle === 'product'
    ? '选题围绕业务/产品，以转化和成交为目的'
    : '选题侧重人格魅力、情感共鸣、社会议题（可在内容中自然融入业务，但不刻意推销）';
  if (hintFormat) hintFormat.textContent = topicFormat === 'single'
    ? '口播文案，直接对镜头说话'
    : '对话体脚本，LLM 自动判断人物关系（夫妻/邻里/同事/母子等）';
  if (hintStyle) hintStyle.textContent = topicContentStyle === 'normal'
    ? '标准脚本结构（类型+开头+人物+场景+脚本+CTA）'
    : topicContentStyle === 'comedy'
      ? '五步喜剧创作法（设定卡→爆点池→结构编排→脚本→笑点审查）'
      : '三段式情感结构（压抑铺垫→矛盾爆发→反转治愈）';
}

function toggleBizEdit() {
  var bar = document.getElementById('topicBizBar');
  var edit = document.getElementById('topicBizEdit');
  var audPanel = document.getElementById('topicAudiencePanel');
  var toolbar = document.getElementById('topicCalendarToolbar');
  var settingsBar = document.getElementById('topicSettingsBar');
  var settingsEdit = document.getElementById('topicSettingsEdit');
  if (edit.style.display === 'none' || !edit.style.display) {
    // Show biz edit
    edit.style.display = 'block';
    if (audPanel) audPanel.style.display = 'none';
    if (toolbar) toolbar.style.display = 'none';
    showCalendarSection(false);
    bar.style.display = 'none';
    if (settingsBar) settingsBar.style.display = 'none';
    if (settingsEdit) settingsEdit.style.display = 'none';
    document.getElementById('topicCustomBar').style.display = 'none';
    if (topicBizData && topicBizData.biz) {
      document.getElementById('topicBizInput').value = topicBizData.biz;
    }
  } else {
    edit.style.display = 'none';
    if (topicBizData && topicBizData.analysis) {
      bar.style.display = 'flex';
      document.getElementById('topicCustomBar').style.display = 'flex';
      if (selectedAudienceIndex >= 0 && topicBizData.audiences && topicBizData.audiences[selectedAudienceIndex]) {
        if (settingsBar) settingsBar.style.display = 'flex';
        showCalendarSection(true);
        if (settingsBar) {
          document.getElementById('topicSettingsSummary').innerHTML = buildSettingsSummary();
        }
      } else {
        if (audPanel) audPanel.style.display = 'block';
        renderAudiencePanel();
        if (settingsBar) settingsBar.style.display = 'none';
        showCalendarSection(false);
      }
    }
  }
}

function loadTopicBiz() {
  try {
    var raw = localStorage.getItem('zimeiti-topic-biz');
    if (raw) {
      topicBizData = JSON.parse(raw);
      // Restore settings from saved data
      if (topicBizData.contentAngle) topicContentAngle = topicBizData.contentAngle;
      if (topicBizData.format) topicFormat = topicBizData.format;
      if (topicBizData.duration) topicDuration = topicBizData.duration;
      if (topicBizData.contentStyle) topicContentStyle = topicBizData.contentStyle;
      if (topicBizData.audiences) topicAudiences = topicBizData.audiences;
      if (typeof topicBizData.selectedAudienceIndex === 'number') selectedAudienceIndex = topicBizData.selectedAudienceIndex;
      return topicBizData;
    }
  } catch(e) {}
  return null;
}

function saveTopicBiz() {
  topicBizData.contentAngle = topicContentAngle;
  topicBizData.format = topicFormat;
  topicBizData.duration = topicDuration;
  topicBizData.contentStyle = topicContentStyle;
  topicBizData.audiences = topicAudiences;
  topicBizData.selectedAudienceIndex = selectedAudienceIndex;
  try { localStorage.setItem('zimeiti-topic-biz', JSON.stringify(topicBizData)); } catch(e) {}
}

function initCreatePage() {
  loadTopicBiz();
  var settingsBar = document.getElementById('topicSettingsBar');
  var audPanel = document.getElementById('topicAudiencePanel');
  var settingsEdit = document.getElementById('topicSettingsEdit');

  if (topicBizData && topicBizData.analysis) {
    // Business already saved — hide custom bar
    document.getElementById('topicCustomBar').style.display = 'none';
    document.getElementById('topicBizEdit').style.display = 'none';
    if (settingsEdit) settingsEdit.style.display = 'none';
    document.getElementById('topicBizBar').style.display = 'flex';
    document.getElementById('topicBizLabel').textContent = '业务：' + (topicBizData.biz || '').slice(0, 40);
    if (selectedAudienceIndex >= 0 && topicAudiences.length > 0) {
      // Audience already selected — show settings + calendar, no biz bar
      document.getElementById('topicBizBar').style.display = 'none';
      if (audPanel) audPanel.style.display = 'none';
      if (settingsBar) {
        settingsBar.style.display = 'flex';
        document.getElementById('topicSettingsSummary').innerHTML = buildSettingsSummary();
      }
      showCalendarSection(true);
      renderTopicList();
      var hasTopics = topicBizData && topicBizData.topics && topicBizData.topics.length > 0;
      document.getElementById('btnRefreshTopics').textContent = hasTopics ? '🔄 换一批' : '✨ 换一批';
      syncTopicSettingsToUI();
    } else {
      // No audience selected — show audience picker with biz bar
      document.getElementById('topicBizBar').style.display = 'flex';
      if (audPanel) audPanel.style.display = 'block';
      if (settingsBar) settingsBar.style.display = 'none';
      showCalendarSection(false);
      syncTopicSettingsToUI();
      renderAudiencePanel();
    }
    document.getElementById('topicContentSection').style.display = 'none';
  } else {
    // First time — show business input + custom bar
    document.getElementById('topicBizEdit').style.display = 'block';
    document.getElementById('topicBizBar').style.display = 'none';
    if (settingsBar) settingsBar.style.display = 'none';
    if (audPanel) audPanel.style.display = 'none';
    if (settingsEdit) settingsEdit.style.display = 'none';
    showCalendarSection(false);
    document.getElementById('topicCustomBar').style.display = 'flex';
    document.getElementById('topicContentSection').style.display = 'none';
    syncTopicSettingsToUI();
  }
}

function buildAnalysisPromptA(biz, contentAngle) {
  // String fields only — simplest JSON structure, least error-prone
  if (contentAngle === 'personal') {
    return '你是一个短视频人设策划专家。基于用户身份背景，分析个人表达类内容方向。\n\n' +
      '用户业务（作为身份背景参考）：' + biz + '\n' +
      '当前日期：' + new Date().toISOString().slice(0, 10) + '\n\n' +
      '## 要求\n' +
      '1. 根据用户职业/业务背景，推断人格特质，给出身份标签\n' +
      '2. 推荐最合适的叙事人设（陪伴者/教导者/崇拜者/陪衬者/搞笑者，选一个）\n' +
      '3. 写一句个人表达类内容的策略建议\n\n' +
      '## 输出 JSON（仅字符串，无数组）\n' +
      '{"industry":"身份标签","contentTheme":"个人表达","currentPhase":"无季节区分","phaseTip":"策略建议（一句话）","defaultNarrativePersona":"人设"}\n\n' +
      '纯 JSON，不要 ```json```。';
  }
  return '你是一个短视频内容策划专家。分析业务的行业、季节和策略。\n\n' +
    '用户业务：' + biz + '\n' +
    '当前日期：' + new Date().toISOString().slice(0, 10) + '\n\n' +
    '## 要求\n' +
    '1. 判断行业，识别淡旺季月份\n' +
    '2. 根据当前日期判断处于什么阶段（旺季/淡季/平季）\n' +
    '3. 写一句当前阶段的内容策略建议\n' +
    '4. 推荐最合适的叙事人设\n\n' +
    '## 输出 JSON（仅字符串，无数组）\n' +
    '{"industry":"行业","peakSeason":"旺季月份","lowSeason":"淡季月份","currentPhase":"阶段","phaseTip":"策略建议（一句话）","defaultNarrativePersona":"人设"}\n\n' +
    '纯 JSON，不要 ```json```。';
}

function buildAnalysisPromptB(biz, contentAngle) {
  // Array fields only — one JSON structure depth
  if (contentAngle === 'personal') {
    return '你是一个短视频人设策划专家。基于用户身份背景，推荐选题目的分类和热点方向。\n\n' +
      '用户业务：' + biz + '\n' +
      '当前日期：' + new Date().toISOString().slice(0, 10) + '\n\n' +
      '## 要求\n' +
      '1. 给出 3-5 种选题目的分类（从：情感共鸣、社会议题、个人价值观、家庭关系、职场洞察 中选择）\n' +
      '2. 推荐 2-3 个当前最适合的选题目的\n' +
      '3. 标注近期热点方向（社会话题/节日/季节性情感话题）\n\n' +
      '## 输出 JSON（仅字符串数组）\n' +
      '{"purposeLabels":["标签1"],"recommendedPurposes":["推荐1"],"recentHotspots":["热点1"]}\n\n' +
      '纯 JSON，不要 ```json```。';
  }
  return '你是一个短视频内容策划专家。推荐选题目的分类和热点方向。\n\n' +
    '用户业务：' + biz + '\n' +
    '当前日期：' + new Date().toISOString().slice(0, 10) + '\n\n' +
    '## 要求\n' +
    '1. 给出 3-5 种选题目的分类（不限于人设打造/流量类/成交型，可根据行业特点补充）\n' +
    '2. 推荐 2-3 个当前最适合的选题目的（淡季偏人设打造和流量类，旺季偏成交型）\n' +
    '3. 标注近期热点方向（节日/行业节点/季节性话题）\n\n' +
    '## 输出 JSON（仅字符串数组）\n' +
    '{"purposeLabels":["标签1"],"recommendedPurposes":["推荐1"],"recentHotspots":["热点1"]}\n\n' +
    '纯 JSON，不要 ```json```。';
}

function buildAudienceDiscoveryPrompt(biz, analysis, contentAngle) {
  if (contentAngle === 'personal') {
    return '你是一个短视频内容策划专家。基于用户身份背景，挖掘情感共鸣类目标人群。\n\n' +
      '用户业务/身份：' + biz + '\n' +
      '行业标签：' + (analysis.industry || '') + '\n' +
      '叙事人设：' + (analysis.defaultNarrativePersona || '陪伴者') + '\n\n' +
      '## 任务：发现 5 个目标人群\n' +
      '人设向内容的目标人群不是「细分市场」，而是「能被特定情感处境引起共鸣的人群」。\n\n' +
      '### 格式（每行严格 5 个字段，|| 分隔）\n' +
      '共鸣点/情感处境 || 处于XXX状态中的人 || 搜索关键词 || 蓝海/中等/红海 || 一句话理由\n\n' +
      '### 规则\n' +
      '1. 共鸣点：用情绪词/处境词描述，不用品类词。例：不是「职场内容」，是「每天下班在地库坐半小时才敢回家的职场女性」\n' +
      '2. 目标人群：写「处于XXX状态中的人」，越具体越好\n' +
      '3. 搜索关键词：用于后续选题搜索验证\n' +
      '4. 只标注蓝海或中等（可通过情感角度切入、内容供给不足的方向），红海不要\n' +
      '5. 搜索验证每个关键词的真实热度后标注机会等级\n\n' +
      '## 示例\n' +
      '职场vs家庭撕裂 || 处于30岁想搞事业又被催生状态中的职场女性 || 30岁不生孩子会后悔吗 || 蓝海 || 话题敏感但真实，敢讲的人少\n' +
      '大城市孤独感 || 处于名校毕业北漂3年理想未实现状态中的年轻人 || 北漂坚持不下去了 || 蓝海 || 搜索量大，内容同质化严重，差异化机会\n\n' +
      '直接输出 5 行。不要序号、不要 JSON、不要 \`\`\`。不要输出任何前置说明或搜索过程，直接输出数据行。';
  }
  return '你是一个短视频内容策划专家。基于用户业务，挖掘长尾蓝海目标人群。\n\n' +
    '业务：' + biz + '\n' +
    '行业：' + (analysis.industry || '') + '\n' +
    '当前阶段：' + (analysis.currentPhase || '') + '\n' +
    '推荐的选题目的：' + (analysis.recommendedPurposes || []).join('、') + '\n\n' +
    '## 任务：发现 5 个目标人群\n' +
    '每个目标人群 = 一个具体痛点问题 + 一群处于特定处境中的人。\n' +
    '用品类下的症状词/场景词/困惑词，不用品类大词。\n\n' +
    '### 格式（每行严格 5 个字段，|| 分隔）\n' +
    '痛点问题 || 处于XXX状态中的人 || 搜索关键词 || 蓝海/中等/红海 || 一句话理由\n\n' +
    '### 规则\n' +
    '1. 痛点问题：用症状词、场景词、困惑词。不用品类词。\n' +
    '   例：不要「奶粉推荐」，要「转奶拉肚子」「喝奶粉起疹子」「不喝奶瓶怎么办」\n' +
    '   例：不要「香肠做法」，要「灌的香肠发酸」「香肠煮完就散」「肥瘦比怎么调」\n' +
    '2. 目标人群：写「处于XXX状态中的人」，不是简单的身份标签\n' +
    '   例：不是「宝妈」，是「宝宝拉肚子换了3种奶粉还没好的焦虑妈妈」\n' +
    '3. 搜索关键词：用于验证搜索热度的长尾词\n' +
    '4. 只标注蓝海或中等（搜索有需求但内容供给不足），红海不要\n' +
    '5. 搜索验证每个关键词的真实热度后标注机会等级\n\n' +
    '## 示例\n' +
    '灌香肠发酸 || 处于初次在家自制手工香肠总是失败状态中的家庭妇女 || 灌的香肠发酸怎么补救 || 蓝海 || 搜索上升但高质量内容少\n' +
    '转奶拉肚子 || 处于换了3种奶粉宝宝还在拉肚子状态中的焦虑妈妈 || 转奶拉肚子怎么办 || 蓝海 || 长尾精准，竞争小\n\n' +
    '直接输出 5 行。不要序号、不要 JSON、不要 \`\`\`。';
}

function parseAudienceText(text) {
  var lines = text.split('\n').filter(function(l) { return l.trim() && l.indexOf('||') >= 0; });
  return lines.map(function(line) {
    var parts = line.split('||').map(function(s) { return s.trim(); });
    // Strip AI meta-commentary prefix (e.g. "我来搜索验证...的热度+")
    var painPoint = parts[0] || '';
    painPoint = painPoint.replace(/^.+(?:的热度[+＋]|关键词[+＋]|长尾词[+＋])/, '');
    return {
      painPoint: painPoint,
      audienceDescription: parts[1] || '',
      searchKeyword: parts[2] || '',
      opportunity: parts[3] || '中等',
      reason: parts[4] || ''
    };
  });
}

async function discoverAudiences() {
  if (!topicBizData || !topicBizData.analysis) return;
  var biz = topicBizData.biz;
  var analysis = topicBizData.analysis;
  try {
    var sysPrompt = '你是一个短视频内容策划专家。只输出目标人群数据行，不要任何开场白、搜索过程或分析说明。';
    var resultText = await doStoryboardApiCall(sysPrompt,
      buildAudienceDiscoveryPrompt(biz, analysis, topicContentAngle),
      { noJsonFormat: true, maxTokens: 16384, enableSearch: true });
    topicAudiences = parseAudienceText(resultText || '');
    if (!topicAudiences.length) throw new Error('未能解析目标人群');
    saveTopicBiz();
  } catch(e) {
    console.error('[discoverAudiences] error:', e);
    // Fallback: generate some default audiences from analysis
    topicAudiences = [];
  }
  return topicAudiences;
}

function renderAudiencePanel() {
  var list = document.getElementById('audienceList');
  var btn = document.getElementById('btnConfirmAudience');
  if (!list) return;

  // Sync angle radios
  var angleRadios = document.querySelectorAll('#topicAudiencePanel input[type=radio]');
  angleRadios.forEach(function(r) {
    if (r.name === 'topicContentAngle2') r.checked = r.value === topicContentAngle;
  });
  updateTopicSettingHints();

  if (!topicAudiences.length) {
    list.innerHTML = '<div style="text-align:center;color:#a09888;padding:16px;font-size:.76rem">暂无目标人群数据，请点击「换一批人群」生成</div>';
    if (btn) btn.disabled = true;
    return;
  }

  var html = '';
  topicAudiences.forEach(function(a, idx) {
    var isSelected = idx === selectedAudienceIndex;
    var opClass = a.opportunity === '蓝海' ? 'aud-blue' : 'aud-mid';
    html += '<div class="audience-card' + (isSelected ? ' selected' : '') + '" onclick="selectAudience(' + idx + ')" data-idx="' + idx + '">';
    html += '<span class="aud-opp-badge ' + opClass + '">' + escapeHtml(a.opportunity || '') + '</span>';
    html += '<div class="aud-card-body">';
    html += '<span class="aud-pain">' + escapeHtml(a.painPoint || '') + '</span>';
    html += '<span class="aud-sep">——</span>';
    html += '<span class="aud-desc">' + escapeHtml(a.audienceDescription || '') + '</span>';
    html += '</div>';
    html += '</div>';
  });
  list.innerHTML = html;
  if (btn) btn.disabled = selectedAudienceIndex < 0;
}

function onAudienceAngleChange(val) {
  topicContentAngle = val;
  updateTopicSettingHints();
  selectedAudienceIndex = -1;
  // Re-discover audiences with new angle
  var btn = document.getElementById('btnConfirmAudience');
  if (btn) btn.disabled = true;
  discoverAudiences().then(function() {
    renderAudiencePanel();
  });
}

function selectAudience(idx) {
  selectedAudienceIndex = idx;
  document.querySelectorAll('.audience-card').forEach(function(c) { c.classList.remove('selected'); });
  var cardEl = document.querySelector('.audience-card[data-idx="' + idx + '"]');
  if (cardEl) cardEl.classList.add('selected');
  var btn = document.getElementById('btnConfirmAudience');
  if (btn) btn.disabled = false;
}

async function confirmAudience() {
  if (selectedAudienceIndex < 0 || !topicAudiences[selectedAudienceIndex]) return;
  var audPanel = document.getElementById('topicAudiencePanel');
  var settingsBar = document.getElementById('topicSettingsBar');
  var settingsEdit = document.getElementById('topicSettingsEdit');

  saveTopicBiz();

  // Hide audience panel and biz bar, show settings editor expanded
  if (audPanel) audPanel.style.display = 'none';
  document.getElementById('topicBizBar').style.display = 'none';
  document.getElementById('topicCustomBar').style.display = 'none';
  if (settingsBar) settingsBar.style.display = 'none';
  if (settingsEdit) {
    settingsEdit.style.display = 'block';
    syncTopicSettingsToUI();
  }
}

async function refreshAudiences() {
  selectedAudienceIndex = -1;
  var btn = document.getElementById('btnConfirmAudience');
  if (btn) btn.disabled = true;
  var refreshBtn = document.querySelector('#topicAudiencePanel .dialog-btn.secondary');
  if (refreshBtn) { refreshBtn.disabled = true; refreshBtn.textContent = '⏳ 分析中…'; }

  await discoverAudiences();
  renderAudiencePanel();

  if (refreshBtn) { refreshBtn.disabled = false; refreshBtn.innerHTML = '<span class="material-symbols-outlined">refresh</span> 换一批人群'; }
}

function backFromSettings() {
  var panel = document.getElementById('topicSettingsEdit');
  var audPanel = document.getElementById('topicAudiencePanel');
  if (panel) panel.style.display = 'none';
  document.getElementById('topicBizBar').style.display = 'flex';
  if (audPanel) { audPanel.style.display = 'block'; renderAudiencePanel(); }
}

function toggleSettingsEdit() {
  var panel = document.getElementById('topicSettingsEdit');
  var settingsBar = document.getElementById('topicSettingsBar');
  if (!panel) return;
  if (panel.style.display === 'none' || !panel.style.display) {
    panel.style.display = 'block';
    if (settingsBar) settingsBar.style.display = 'none';
    syncTopicSettingsToUI();
  } else {
    panel.style.display = 'none';
    if (settingsBar) {
      settingsBar.style.display = 'flex';
      document.getElementById('topicSettingsSummary').innerHTML = buildSettingsSummary();
    }
  }
}

function applySettingsAndClose() {
  var panel = document.getElementById('topicSettingsEdit');
  var settingsBar = document.getElementById('topicSettingsBar');
  if (panel) panel.style.display = 'none';
  document.getElementById('topicBizBar').style.display = 'none';
  document.getElementById('topicCustomBar').style.display = 'flex';
  if (settingsBar) {
    settingsBar.style.display = 'flex';
    document.getElementById('topicSettingsSummary').innerHTML = buildSettingsSummary();
  }
  saveTopicBiz();
  showCalendarSection(true);
  // Show loading transition
  var list = document.getElementById('topicList');
  if (list) list.innerHTML = '<div style="text-align:center;padding:60px 20px"><div class="loading-spinner"></div><div style="font-size:.82rem;color:#8a8278;margin-top:12px">AI 正在为你生成选题…</div></div>';
  var btn = document.getElementById('btnRefreshTopics');
  if (btn) btn.style.display = 'none';
  // Auto-generate topics
  refreshTopics();
}

function buildTopicListPrompt(biz, analysis, audience) {
  var styleLabel = topicContentStyle === 'comedy' ? '搞笑反转' : (topicContentStyle === 'emotional' ? '情感共鸣' : '常规');
  return '你是一个短视频内容策划专家。用问题驱动的方式挖掘蓝海选题，推荐 5 个。\n\n' +
    '业务：' + biz + '\n' +
    '行业：' + (analysis.industry || '') + '\n' +
    '当前阶段：' + (analysis.currentPhase || '') + '\n' +
    '推荐的选题目的：' + (analysis.recommendedPurposes || []).join('、') + '\n' +
    '热点参考：' + (analysis.recentHotspots || []).join('、') + '\n' +
    '叙事人设：' + (analysis.defaultNarrativePersona || '陪伴者') + '\n' +
    (audience ? '目标人群：' + audience.painPoint + ' —— ' + audience.audienceDescription + '\n搜索关键词：' + (audience.searchKeyword || '') + '\n' : '') +
    '\n## 创作约束（NOT 输出字段）\n' +
    '内容倾向：' + (topicContentAngle === 'product' ? '带货向（选题围绕产品/业务）' : '人设向（选题侧重人格魅力/情感共鸣）') + '\n' +
    '表演形式：' + (topicFormat === 'single' ? '单人口播' : '双人演绎') + '\n' +
    '视频时长：' + topicDuration + 's\n' +
    '内容风格：' + styleLabel + '\n' +
    (topicContentStyle === 'comedy' ? '选题要有反转空间\n' : '') +
    (topicContentStyle === 'emotional' ? '选题要有情感张力\n' : '') +
    (topicFormat === 'dual' ? '选题要适合两个角色互动\n' : '') +
    '\n## 选题策略：问题驱动 × 长尾人群\n\n' +
    '### 第一步：拆解痛点（不要用品类大词）\n' +
    '围绕业务' + (audience ? '和指定目标人群（' + audience.painPoint + ' —— ' + audience.audienceDescription + '）' : '') + '，列出 5 个具体的用户问题/痛点。用症状词、场景词、困惑词，不用品类词。\n' +
    '例：不要「奶粉推荐」，要「转奶拉肚子」「喝奶粉起疹子」「不喝奶瓶怎么办」\n' +
    '例：不要「香肠做法」，要「灌的香肠发酸」「香肠煮完就散」「肥瘦比怎么调」\n\n' +
    '### 第二步：锁定长尾人群\n' +
    '每个痛点背后的人群要具体。不是「宝妈」而是「宝宝拉肚子换了 3 种奶粉还没好的焦虑妈妈」。\n' +
    '越细分，内容越精准，转化越高。\n\n' +
    '### 第三步：搜索验证\n' +
    '搜每个痛点的长尾关键词，验证真实搜索热度。优先选搜索量上升但竞争小的蓝海词。\n\n' +
    '### 第四步：生成选题\n' +
    '每个选题 = 一个具体问题 + 一个精准人群 + 一个内容角度。\n\n' +
    '## 要求\n' +
    '1. 给 5 个选题，每个必须对应一个具体痛点问题\n' +
    '2. 避免泛品类词（怎么做/怎么选/推荐/测评），用症状词和场景词切入\n' +
    '3. 标注心理钩子（想纠正你/想看结果/想证明自己/想看你翻车/想给你出招/想看看真假/想代入自己）\n' +
    '4. 匹配叙事人设（陪伴者/教导者/搞笑者/陪衬者/崇拜者）\n\n' +
    '## 输出格式（每行严格 7 个字段，|| 分隔）\n' +
    '标题 || 角度说明 || 选题目的 || 预估效果 || 心理钩子 || 叙事人设 || 热点提示\n\n' +
    '示例：\n' +
    '灌的香肠煮完就散？肥瘦比错了，3肥7瘦才不散 || 针对灌香肠最常翻车的结构问题，给出精确配方 || 带货转化 || 高转化 || 想纠正你 || 教导者 || 手工制作\n' +
    '宝宝转奶拉肚子，换了3种奶粉还不好？问题可能是乳糖不耐 || 从拉肚子这个高频痛点切入，教妈妈排查乳糖问题 || 带货转化 || 高互动 || 想看结果 || 陪伴者 || 育儿\n\n' +
    '直接输出选题列表。不要 JSON、不要序号、不要 \`\`\`。每行一条完整的选题。';
}

function parseTopicListText(text) {
  // Parse line-based format: 标题 || 角度 || 目的 || 效果 || 心理 || 人设 || 热点
  var lines = text.split('\n').filter(function(l) { return l.trim() && l.indexOf('||') >= 0; });
  return lines.map(function(line) {
    var parts = line.split('||').map(function(s) { return s.trim(); });
    return {
      title: parts[0] || '',
      angle: parts[1] || '',
      purpose: parts[2] || '人设打造',
      estimatedEffect: parts[3] || '高互动',
      psychology: parts[4] || '想代入自己',
      persona: parts[5] || '陪伴者',
      hotTip: parts[6] || ''
    };
  });
}

function buildTopicContentPrompt(biz, analysis, topic) {
  if (topicContentStyle === 'comedy') return buildComedyContentPrompt(biz, analysis, topic);
  if (topicContentStyle === 'emotional') return buildEmotionalContentPrompt(biz, analysis, topic);
  return buildNormalContentPrompt(biz, analysis, topic);
}

// ============================================================
// KNOWLEDGE MODULES — shared rule blocks, routed by content style
// ============================================================

function getCommonRules() {
  return '### 可拿走性原则\n' +
    '- 观众看完能拿走什么？"了解了X"不合格，"能判断X/能算出Y/能避开Z"合格\n\n' +
    '### 内容温度模型\n' +
    '- 有趣 + 有用 + 共鸣，至少满足两个\n\n' +
    '### 七种观众心理钩子\n' +
    '- 1想纠正你 2想看结果 3想证明自己 4想看你翻车 5想给你出招 6想看看真假 7想代入自己\n' +
    '- 每篇内容至少触发一种，选题阶段就确定，生成后检查\n' +
    '- 你这次的选题心理钩子是' + (selectedTopic && selectedTopic.psychology ? selectedTopic.psychology : '') + '，请围绕这个钩子设计脚本节奏\n\n';
}

function getOralScriptRules() {
  return '### 口语化脚本规则\n' +
    '- 每镜不超过 50 字（硬上限）\n' +
    '- 每句话不超过 12 个字，用句号断开（呼吸单位）\n' +
    '- 情绪写进脚本，不写进标注：用换行停顿、短句强调、单字反转\n' +
    '- 念一遍才算是脚本，念不顺就删掉重写\n\n';
}

function buildNormalContentPrompt(biz, analysis, topic) {
  var formatInst = topicFormat === 'dual'
    ? '\n### 双人演绎要求\n' +
      '- 标注角色 A 和角色 B 的台词，对话体脚本\n' +
      '- 两个角色性格要有鲜明反差\n' +
      '- LLM 根据内容倾向自动判断人物关系（带货向：同事/上下级/买卖双方/师徒；人设向：夫妻/邻里/母子/朋友/路人）\n'
    : '\n### 单人口播要求\n- 口播文案，直接对镜头说话\n';
  var durInst = getDurationInstructions();
  return '你是' + (topic.persona || '陪伴者') + '风格的短视频脚本写手。\n\n' +
    '业务背景：' + biz + '\n' +
    '行业：' + (analysis.industry || '') + '\n' +
    '内容倾向：' + (topicContentAngle === 'product' ? '带货向' : '人设向') + '\n' +
    '选题：' + topic.title + '\n' +
    '角度：' + (topic.angle || '') + '\n' +
    '心理钩子：' + (topic.psychology || '想代入自己') + '\n\n' +
    '## 时长控制\n' + durInst + '\n' +
    '## 写作规则（必须遵守）\n\n' +
    getOralScriptRules() +
    getCommonRules() +
    formatInst +
    '\n## 输出格式\n' +
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

function getDurationInstructions() {
  var d = parseInt(topicDuration) || 30;
  if (d <= 15) return '视频时长 15 秒。1-2 镜，核心观点 + CTA，约 50-80 字。节奏紧凑，一个呼吸讲完。';
  if (d <= 30) return '视频时长 30 秒。3-4 镜，观点+展开+CTA，约 120-180 字。';
  if (d <= 45) return '视频时长 45 秒。4-6 镜，起承转合，约 200-280 字。';
  return '视频时长 60 秒。6-8 镜，完整叙事弧线，约 280-400 字。给足铺垫和展开的空间。';
}

var suggestedDuration = null; // AI-calculated suggestion, shown alongside manual pick

function calculateSuggestedDuration(text, style) {
  // Count Chinese characters (dialogue/spoken words only)
  var wordCount = (text || '').replace(/[\s\n\r，。！？、；：""（）　]/g, '').length;

  // Speed base (字/秒) by content style
  var speedBase = { comedy: 10, normal: 6.7, emotional: 5.0 };
  var baseSpeed = speedBase[style] || 6.7;

  // Emotion coefficient: estimate from punctuation variance
  var exclamations = (text.match(/[！!]/g) || []).length;
  var questions = (text.match(/[？?]/g) || []).length;
  var ellipsis = (text.match(/[……]/g) || []).length;
  var emotionPeaks = exclamations + questions + ellipsis;
  var emotionCoef;
  if (emotionPeaks >= 8) emotionCoef = 1.10;
  else if (emotionPeaks >= 3) emotionCoef = 1.05;
  else emotionCoef = 1.0;

  // Pause compensation
  var lineBreaks = (text.match(/\n\n+/g) || []).length;
  var criticalPauses = (text.match(/停[一一下秒]|停顿|pause/gi) || []).length;
  var pauseComp = lineBreaks * 0.5 + criticalPauses * 1 + 1.5; // +1.5s ending pause

  // 即梦文字动画估算 (for short-video style)
  var hasVisualDesc = /(画面|镜头|场景|特写|近景|中景|全景)/.test(text);
  var visualAnim = hasVisualDesc ? wordCount * 0.03 : 0; // ~0.03s per char for text animation

  var pureSpeech = (wordCount / baseSpeed);
  var suggested = Math.round(pureSpeech * emotionCoef + pauseComp + visualAnim);

  // Round to nearest 15s step
  var steps = [15, 30, 45, 60, 75, 90];
  var nearest = steps.reduce(function(prev, curr) {
    return Math.abs(curr - suggested) < Math.abs(prev - suggested) ? curr : prev;
  });

  return {
    wordCount: wordCount,
    pureSpeech: pureSpeech,
    emotionCoef: emotionCoef,
    pauseComp: pauseComp,
    visualAnim: visualAnim,
    suggestedRaw: suggested,
    suggestedRounded: nearest
  };
}

function buildComedyContentPrompt(biz, analysis, topic) {
  var dur = parseInt(topicDuration) || 30;
  var durInst;
  if (dur <= 15) {
    durInst = '时长 15s，简化五步为三步（设定→爆点→反转），2-3 个笑点。节奏极快。';
  } else if (dur <= 30) {
    durInst = '时长 30s，完整五步，4-5 个笑点。';
  } else if (dur <= 45) {
    durInst = '时长 45s，完整五步+深化，5-7 个笑点。';
  } else {
    durInst = '时长 60s，完整五步+深化+彩蛋，7-8 个笑点。最后 10 秒埋伏笔引导下一期。';
  }

  var dualInst = topicFormat === 'dual'
    ? '\n### 双人演绎额外要求\n' +
      '- 两个角色性格要有鲜明反差（一个正经一个荒诞，一个强势一个怂）\n' +
      '- 利用角色间的误解/信息差制造笑点\n' +
      '- 人物关系由 LLM 根据内容倾向自动判断（带货向：同事/上下级/买卖双方/师徒；人设向：夫妻/邻里/母子/朋友/路人）\n'
    : '\n### 单人演绎\n- 通过自言自语、内心独白、与道具/环境的互动制造笑点\n';

  return '你是一个专业喜剧短剧编剧。请严格按照以下五步法创作搞笑反转类短视频脚本。\n\n' +
    '业务背景：' + biz + '\n' +
    '内容倾向：' + (topicContentAngle === 'product' ? '带货向（可在反转中自然带出产品）' : '人设向（以人格魅力为主，不刻意带货）') + '\n' +
    '选题：' + topic.title + '\n' +
    '角度：' + (topic.angle || '') + '\n' +
    '心理钩子：' + (topic.psychology || '想看你翻车') + '\n' +
    durInst + '\n' +
    dualInst +
    '\n## 写作规则\n\n' +
    getOralScriptRules() +
    getCommonRules() +
    '\n## 第一步：设定卡\n' +
    '分析选题，确定：\n' +
    '- 钩子（前 2 秒）：用什么画面/台词瞬间抓住观众\n' +
    '- 角色设定：性格标签要极端/鲜明\n' +
    '- 核心道具：至少一个贯穿道具，要反复出现参与笑点\n' +
    '- 喜剧类型选择：身份反差 / 认知失调（一本正经胡说八道）/ 夸张误会 / 神反转打脸\n\n' +
    '## 第二步：爆点池\n' +
    '生成 6-8 个可拍摄的笑点/梗，每个一句话，标注类型（语言梗/动作梗/道具梗/反转梗）。\n\n' +
    '## 第三步：结构编排\n' +
    '按四段映射笑点：\n' +
    '| 时间段 | 内容 | 分配笑点 |\n' +
    '| 0-10s | 建立场景+埋伏笔 | 笑点1 |\n' +
    '| 10-35s | 升级冲突/重复游戏 | 笑点2,3 |\n' +
    '| 35-50s | 推向高潮 | 笑点4,5 |\n' +
    '| 50-结束 | 反转+悬念钩子 | 笑点6 |\n\n' +
    '重要规则：\n' +
    '- 每 3-5 句台词触发一个小笑点\n' +
    '- 道具必须反复出现并参与笑点\n' +
    '- 最后 10 秒必须完成反转，留悬念钩子引导下一期\n' +
    '- 不解释笑点，不让角色自己笑\n\n' +
    '## 第四步：完整拍摄脚本\n' +
    '按镜头输出，每镜标注：时长、画面描述（含镜头运动）、角色台词（每句 ≤20 字）、音效提示。\n\n' +
    '## 第五步：笑点审查\n' +
    '给每个笑点打分（0-10），低于 6 分的标注改写建议。\n\n' +
    '用自然语言输出，不要 JSON。让读的人能直接感受到节奏和笑点。';
}

function buildEmotionalContentPrompt(biz, analysis, topic) {
  var dur = parseInt(topicDuration) || 30;
  var pct1 = Math.round(dur * 0.3);
  var pct2 = Math.round(dur * 0.35);
  var pct3 = dur - pct1 - pct2;

  var dualInst = topicFormat === 'dual'
    ? '\n### 双人演绎\n' +
      '- 两个角色分别为情感关系中的双方\n' +
      '- LLM 根据内容倾向自动判断具体关系（带货向：师徒/合作伙伴；人设向：夫妻/母子/邻里/朋友）\n' +
      '- 通过两人的互动、误解、和解来推进情感弧线\n'
    : '\n### 单人演绎\n- 通过独白、回忆、与环境/道具的互动来传递情感\n';

  return '你是一个情感类短视频编剧。请按照"压抑铺垫 → 矛盾爆发 → 反转治愈"三段式结构创作。\n\n' +
    '业务背景：' + biz + '\n' +
    '内容倾向：' + (topicContentAngle === 'product' ? '带货向（情感故事中自然带出产品价值）' : '人设向（纯情感表达，不刻意带货）') + '\n' +
    '选题：' + topic.title + '\n' +
    '角度：' + (topic.angle || '') + '\n' +
    '心理钩子：' + (topic.psychology || '想代入自己') + '\n' +
    '总时长：' + topicDuration + 's\n' +
    dualInst +
    '\n## 写作规则\n\n' +
    getOralScriptRules() +
    getCommonRules() +
    '\n## 三段式结构\n' +
    '1. 压抑铺垫（前 ' + pct1 + 's）：设置初始冲突，展现关系背景，让观众代入\n' +
    '2. 矛盾爆发（中间 ' + pct2 + 's）：情绪化表达，关系降至冰点，制造共情高点\n' +
    '3. 反转治愈（最后 ' + pct3 + 's）：真相揭示，关系修复与升华\n\n' +
    '## 关键技巧\n' +
    '- 以幽默或温暖开场，降低观众防备\n' +
    '- 在情绪高点后设计反转（不是和解，是更深的理解）\n' +
    '- 结尾留一句话金句，让观众想截图分享\n' +
    '- 避免说教，用细节和动作传递情感而非台词说理\n\n' +
    '## 输出格式\n' +
    '完整拍摄脚本，按镜头分，每镜含时长、画面描述、台词/旁白、情绪提示。\n\n' +
    '用自然语言输出，不要 JSON。让读的人能被触动。';
}

async function saveBizAndAnalyze() {
  var bizInput = document.getElementById('topicBizInput');
  var biz = bizInput.value.trim();
  if (!biz) { alert('请输入业务描述'); return; }
  if (!settings.apiKey) { alert('请先在「我的」→ 设置 中配置 API Key'); return; }

  var loading = document.getElementById('topicBizLoading');
  var editPanel = document.getElementById('topicBizEdit');
  var btn = document.getElementById('btnSaveBiz');
  var audPanel = document.getElementById('topicAudiencePanel');

  loading.style.display = 'flex';
  btn.disabled = true;

  try {
    // Phase 1: Business analysis
    var sysPrompt1 = '你是一个短视频策划专家。严格按 JSON 格式回复。';
    var [result1a, result1b] = await Promise.all([
      doStoryboardApiCall(sysPrompt1, buildAnalysisPromptA(biz, topicContentAngle)),
      doStoryboardApiCall(sysPrompt1, buildAnalysisPromptB(biz, topicContentAngle))
    ]);
    var json1a = collectStreamJson(result1a);
    if (!json1a) { console.error('[saveBizAndAnalyze] Step1a raw:', result1a); throw new Error('无法解析分析结果（字符串字段）'); }
    var json1b = collectStreamJson(result1b);
    if (!json1b) { console.error('[saveBizAndAnalyze] Step1b raw:', result1b); throw new Error('无法解析分析结果（数组字段）'); }
    var analysis = Object.assign({}, JSON.parse(json1a), JSON.parse(json1b));

    // Save phase 1 result
    topicBizData = { biz: biz, analysis: analysis, audiences: [], selectedAudienceIndex: -1, topics: [], savedAt: new Date().toISOString() };
    selectedAudienceIndex = -1;
    topicAudiences = [];
    saveTopicBiz();

    // Phase 2: Audience discovery (keep loading visible throughout)
    await discoverAudiences();

    // All results ready — show everything at once
    editPanel.style.display = 'none';
    document.getElementById('topicBizBar').style.display = 'flex';
    document.getElementById('topicBizLabel').textContent = '业务：' + biz.slice(0, 40);
    if (audPanel) audPanel.style.display = 'block';
    document.getElementById('topicCustomBar').style.display = 'none';
    renderAudiencePanel();

  } catch(e) {
    console.error('[saveBizAndAnalyze] error:', e);
    alert('分析失败：' + (e.message || '未知错误') + '\n\n请检查 API Key 和网络后重试');
    topicBizData = null;
    topicAudiences = [];
    selectedAudienceIndex = -1;
    editPanel.style.display = 'block';
    document.getElementById('topicBizBar').style.display = 'none';
    if (audPanel) audPanel.style.display = 'none';
    showCalendarSection(false);
    document.getElementById('topicContentSection').style.display = 'none';
  }

  loading.style.display = 'none';
  btn.disabled = false;
}

function renderTopicList() {
  if (!topicBizData || !topicBizData.topics) return;

  var allTopics = topicBizData.topics || [];

  var list = document.getElementById('topicList');
  var btn = document.getElementById('btnRefreshTopics');
  if (!allTopics.length) {
    list.innerHTML = '<div style="text-align:center;color:#a09888;padding:20px;font-size:.76rem">暂无选题，点击「换一批」重新生成</div>';
    if (btn) btn.textContent = '✨ 换一批';
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
  var allTopics = topicBizData.topics || [];
  var topic = allTopics[idx];
  if (!topic) return;
  selectedTopic = topic;

  // Highlight
  document.querySelectorAll('.topic-card').forEach(function(c) { c.classList.remove('selected'); });
  var cardEl = document.querySelector('.topic-card[data-idx="' + idx + '"]');
  if (cardEl) cardEl.classList.add('selected');

  // Show content generation, hide settings
  showCalendarSection(false);
  document.getElementById('topicSettingsBar').style.display = 'none';
  document.getElementById('topicCustomBar').style.display = 'none';
  document.getElementById('topicContentSection').style.display = 'flex';
  document.getElementById('topicContentResult').innerHTML = '';
  document.getElementById('topicContentActions').style.display = 'none';
  var sc = document.getElementById('topicSelfCheck');
  if (sc) sc.style.display = 'none';

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
  var sc = document.getElementById('topicSelfCheck');
  if (sc) sc.style.display = 'none';

  try {
    var sysPrompts = {
      normal: '你是一个短视频脚本专家。按用户要求输出完整脚本，自然语言格式，不要 JSON。',
      comedy: '你是一个专业喜剧短剧编剧。严格按照五步法输出搞笑反转脚本，自然语言格式，不要 JSON。',
      emotional: '你是一个情感类短视频编剧。严格按三段式结构输出情感脚本，自然语言格式，不要 JSON。'
    };
    var systemPrompt = sysPrompts[topicContentStyle] || sysPrompts.normal;
    var resultText = await doStoryboardApiCall(systemPrompt, buildTopicContentPrompt(topicBizData.biz, topicBizData.analysis, topic), { noJsonFormat: true });
    topicContentText = resultText || '';
    if (topicContentText) {
      document.getElementById('topicContentResult').innerHTML = '<div style="white-space:pre-wrap;line-height:1.8">' + escapeHtml(topicContentText) + '</div>';
      document.getElementById('topicContentActions').style.display = 'flex';
      // Calculate suggested duration
      var calc = calculateSuggestedDuration(topicContentText, topicContentStyle);
      suggestedDuration = calc.suggestedRounded;
      updateDurationHint(calc);
      // Render self-check
      renderSelfCheck(topicContentText);
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

var selfCheckResults = []; // stored for AI optimize

function renderSelfCheck(text) {
  var checks = [];

  // 1. Compliance — common AI phrases to avoid
  var forbiddenWords = ['值得注意的是', '综上所述', '总而言之', '不容忽视', '由此可见', '毋庸置疑', '众所周知'];
  var foundForbidden = forbiddenWords.filter(function(w) { return text.indexOf(w) >= 0; });
  var hasAiTaste = (text.match(/值得注意的是|综上所述|总而言之|不容忽视/g) || []).length >= 2;

  // 2. 可拿走性 — does the viewer get something actionable?
  var hasTakeaway = /能判断|能算出|能避开|能省|能赚|能做出|自己试|试试看|下次你|你可以/.test(text);

  // 3. 情绪线 — is there emotional variation?
  var emotionMarkers = (text.match(/[！!？?……～~啊呀哇哎嘿哈]/g) || []).length;
  var hasEmotionVariety = emotionMarkers >= 3;

  // 4. 心理钩子 — is there a hook that triggers interaction?
  var hookKeywords = {
    '想纠正你': /错了|不对|不是|纠正|辟谣|其实|原来如此|真相/,
    '想看结果': /接下来|结果|最后|终于|揭晓|答案/,
    '想证明自己': /你能|你敢|你会吗|试试|挑战/,
    '想看你翻车': /翻车|失败|搞砸|笑死|尴尬|出丑/,
    '想给你出招': /怎么办|怎么选|帮我|求助|支招|建议/,
    '想看看真假': /真的假的|揭秘|内幕|真相|实拍|实测/,
    '想代入自己': /我也是|我也曾|你有没有|每个人|我们都/
  };
  var targetHook = (selectedTopic && selectedTopic.psychology) || '想代入自己';
  var hookRegex = hookKeywords[targetHook];
  var hookTriggered = hookRegex ? hookRegex.test(text) : true;

  checks.push({
    label: 'AI味检测',
    pass: !hasAiTaste && foundForbidden.length === 0,
    detail: foundForbidden.length > 0 ? '发现机器话：' + foundForbidden.join('、') : (hasAiTaste ? 'AI套话偏多' : '未发现明显AI套话')
  });

  checks.push({
    label: '可拿走性',
    pass: hasTakeaway,
    detail: hasTakeaway ? '观众能获得可操作的信息' : '⚠ 观众看完只能"知道了"，建议增加判断标准/计算公式/操作步骤'
  });

  checks.push({
    label: '情绪线',
    pass: hasEmotionVariety,
    detail: hasEmotionVariety ? '检测到 ' + emotionMarkers + ' 处情绪标记，有起伏' : '⚠ 情绪标记偏少，全程可能是平的，建议增加感叹/反问/停顿'
  });

  checks.push({
    label: '心理钩子 (' + targetHook + ')',
    pass: hookTriggered,
    detail: hookTriggered ? '已触发目标心理钩子' : '⚠ 未检测到钩子相关表达，观众可能不会互动'
  });

  // 5. 字数/呼吸检查 (for normal style)
  if (topicContentStyle === 'normal') {
    var sentences = text.split(/[。！？\n]/).filter(function(s) { return s.trim().length > 0; });
    var longSentences = sentences.filter(function(s) { return s.replace(/[\s，、：""（）　]/g, '').length > 20; });
    checks.push({
      label: '呼吸单位',
      pass: longSentences.length <= 2,
      detail: longSentences.length > 2 ? '⚠ ' + longSentences.length + ' 个句子超过20字，念起来会喘不过气' : '句子长度适合口播呼吸节奏'
    });
  }

  // Render
  selfCheckResults = checks;
  var warnCount = checks.filter(function(c) { return !c.pass; }).length;
  var html = '<div class="selfcheck-title">发布前自检' +
    (warnCount === 0 ? ' <span style="color:#5a8475;font-weight:400">— 全部通过</span>' : ' <span style="color:#e8a040;font-weight:400">— ' + warnCount + ' 项建议优化</span>') +
    '</div>';
  checks.forEach(function(c) {
    html += '<div class="selfcheck-item ' + (c.pass ? 'pass' : 'warn') + '">' +
      '<span class="selfcheck-icon">' + (c.pass ? '✅' : '⚠️') + '</span>' +
      '<div><b>' + escapeHtml(c.label) + '</b><br><span>' + escapeHtml(c.detail) + '</span></div>' +
      '</div>';
  });
  if (warnCount > 0) {
    html += '<button class="dialog-btn primary" onclick="optimizeTopicContent()" style="margin-top:10px;width:100%;font-size:.82rem;padding:10px"><span class="material-symbols-outlined">auto_fix</span> AI 一键优化</button>';
  }

  var el = document.getElementById('topicSelfCheck');
  if (el) { el.innerHTML = html; el.style.display = 'block'; }
}

async function optimizeTopicContent() {
  if (!settings.apiKey) { alert('请先配置 API Key'); return; }
  if (!topicContentText) return;

  // Collect failed checks as fix instructions
  var fixes = selfCheckResults.filter(function(c) { return !c.pass; });
  if (fixes.length === 0) { alert('没有需要优化的问题'); return; }

  var fixList = fixes.map(function(f) { return '- ' + f.label + '：' + f.detail.replace(/^⚠ /, ''); }).join('\n');
  console.log('[optimizeTopicContent] fixing', fixes.length, 'issues:', fixList);

  // Show loading on button itself
  var btn = document.querySelector('#topicSelfCheck .dialog-btn.primary');
  var btnOrig = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="material-symbols-outlined" style="animation:spin 1s linear infinite">progress_activity</span> AI 优化中…'; }

  try {
    var systemPrompt = '你是短视频脚本精修专家。按问题清单逐项修复脚本，输出修复后的完整脚本。只输出脚本，不解释。';
    var userPrompt = '## 原始脚本\n\n' + topicContentText + '\n\n## 需要修复\n\n' + fixList + '\n\n输出修复后的完整脚本。';
    console.log('[optimizeTopicContent] calling API, prompt length:', (systemPrompt + userPrompt).length);
    var resultText = await doStoryboardApiCall(systemPrompt, userPrompt, { noJsonFormat: true, timeout: 60000 });
    console.log('[optimizeTopicContent] API returned, length:', resultText ? resultText.length : 0);

    if (resultText && resultText.trim()) {
      topicContentText = resultText;
      document.getElementById('topicContentResult').innerHTML = '<div style="white-space:pre-wrap;line-height:1.8">' + escapeHtml(resultText) + '</div>';
      var calc = calculateSuggestedDuration(resultText, topicContentStyle);
      suggestedDuration = calc.suggestedRounded;
      updateDurationHint(calc);
      renderSelfCheck(resultText);
    } else {
      alert('优化返回为空，请重试');
    }
  } catch(e) {
    console.error('[optimizeTopicContent] error:', e);
    alert('优化失败：' + (e.message || ''));
  }
  if (btn) { btn.disabled = false; btn.innerHTML = btnOrig; }
}

function regenerateTopicContent() {
  if (selectedTopic) generateTopicContent(selectedTopic);
}

function backToTopicList() {
  document.getElementById('topicContentSection').style.display = 'none';
  document.getElementById('topicSettingsBar').style.display = 'flex';
  document.getElementById('topicCustomBar').style.display = 'flex';
  showCalendarSection(true);
  selectedTopic = null;
  topicContentText = '';
  var sc = document.getElementById('topicSelfCheck');
  if (sc) sc.style.display = 'none';
}

function showCalendarSection(visible) {
  document.getElementById('topicCalendarToolbar').style.display = visible ? 'flex' : 'none';
  document.getElementById('topicCalendarSection').style.display = visible ? 'block' : 'none';
}

function backFromCalendar() {
  var settingsBar = document.getElementById('topicSettingsBar');
  var settingsEdit = document.getElementById('topicSettingsEdit');
  showCalendarSection(false);
  document.getElementById('topicBizBar').style.display = 'none';
  document.getElementById('topicCustomBar').style.display = 'none';
  if (settingsBar) settingsBar.style.display = 'none';
  if (settingsEdit) {
    settingsEdit.style.display = 'block';
    syncTopicSettingsToUI();
  }
}

function resetCreatePage() {
  topicBizData = null;
  selectedTopic = null;
  topicContentText = '';
  topicAudiences = [];
  selectedAudienceIndex = -1;
  try { localStorage.removeItem('zimeiti-topic-biz'); } catch(e) {}
  document.getElementById('topicBizEdit').style.display = 'block';
  showCalendarSection(false);
  document.getElementById('topicContentSection').style.display = 'none';
  document.getElementById('topicBizBar').style.display = 'none';
  document.getElementById('topicSettingsBar').style.display = 'none';
  var audPanel = document.getElementById('topicAudiencePanel');
  if (audPanel) audPanel.style.display = 'none';
  var settingsEdit = document.getElementById('topicSettingsEdit');
  if (settingsEdit) settingsEdit.style.display = 'none';
  document.getElementById('topicCustomBar').style.display = 'none';
  document.getElementById('topicBizInput').value = '';
  document.getElementById('topicCustomInput').value = '';
  document.getElementById('topicList').innerHTML = '';
}

function parseTopicContent(text) {
  // Extract structured fields from the LLM-generated topic content
  var result = {
    videoType: '', opening: '', characters: '', charSuppl: '',
    scene: '居家', mood: '温馨', scriptContent: text
  };

  // Comedy/emotional styles: use the entire output as script, with style-specific defaults
  if (topicContentStyle === 'comedy') {
    // Try to extract the script portion (第四步)
    var comedyScriptMatch = text.match(/## 第[四4]步[：:].*?\n([\s\S]*?)(?=## 第[五5]步|$)/);
    result.scriptContent = comedyScriptMatch ? comedyScriptMatch[1].trim() : text;
    result.videoType = '搞笑';
    result.opening = '对话直入';
    result.characters = topicFormat === 'dual' ? '两个人' : '一个人';
    result.charSuppl = '日常服装，突出角色反差';
    result.scene = '居家';
    result.mood = '轻松';
    return result;
  }

  if (topicContentStyle === 'emotional') {
    result.scriptContent = text;
    result.videoType = '剧情';
    result.opening = '抛问题';
    result.characters = topicFormat === 'dual' ? '两个人' : '一个人';
    result.charSuppl = '日常服装，朴素自然';
    result.scene = '居家';
    result.mood = '温馨';
    return result;
  }

  // Normal style — parse numbered sections
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
  var characters = parsed.characters || (topicFormat === 'dual' ? '两个人' : '一个人');
  var charSuppl = parsed.charSuppl || '日常休闲装';
  var scene = parsed.scene || '居家';
  var mood = parsed.mood || '温馨';

  interviewAnswers = [];
  interviewAnswers.push({ question: INTERVIEW_QUESTIONS[0].question, answer: videoType });
  interviewAnswers.push({ question: INTERVIEW_QUESTIONS[1].question, answer: opening, supplement: '' });
  interviewAnswers.push({ question: INTERVIEW_QUESTIONS[2].question, answer: characters, supplement: charSuppl });
  interviewAnswers.push({ question: INTERVIEW_QUESTIONS[3].question, answer: { a: scene, b: mood } });
  interviewAnswers.push({ question: INTERVIEW_QUESTIONS[4].question, answer: parsed.scriptContent });
  originalScriptText = parsed.scriptContent || '';

  // Reset storyboard state so create flow starts clean (independent from link flow)
  currentStoryboard = null;
  currentDirectorAnalysis = null;
  keyProps = '';
  currentPreScene = '';
  currentPreCharIds = [];
  currentPreDuration = topicDuration || '30';
  currentPreRatio = '9:16';
  currentPreFps = '24';
  preShotHintsApplied = false;
  shotBatches = [];
  currentBatchTab = 0;
  inPreShotSettings = false;

  pendingRecordSource = 'topic';
  switchTab('tabStoryboard');
  generateStoryboard();
}

async function generateCustomTopics() {
  var input = document.getElementById('topicCustomInput');
  var idea = input.value.trim();
  if (!idea) { alert('请输入你的想法'); return; }
  if (!settings.apiKey) { alert('请先在「我的」→ 设置 中配置 API Key'); return; }

  var btn = document.getElementById('btnCustomTopic');
  btn.disabled = true;
  btn.innerHTML = '<span class="loading-spinner" style="width:16px;height:16px;border-width:2px"></span> 生成中…';

  // Build minimal biz data — skip business analysis and audience discovery
  topicBizData = {
    biz: idea,
    analysis: {
      industry: '',
      currentPhase: '',
      recommendedPurposes: [],
      recentHotspots: [],
      defaultNarrativePersona: '陪伴者'
    },
    audiences: [],
    selectedAudienceIndex: -1,
    topics: [],
    savedAt: new Date().toISOString()
  };
  selectedAudienceIndex = -1;
  topicAudiences = [];
  saveTopicBiz();

  // Hide biz edit / audience / custom bar, show calendar section
  document.getElementById('topicBizEdit').style.display = 'none';
  document.getElementById('topicBizBar').style.display = 'flex';
  document.getElementById('topicBizLabel').textContent = '自定义：' + idea.slice(0, 40);
  var audPanel = document.getElementById('topicAudiencePanel');
  if (audPanel) audPanel.style.display = 'none';
  var settingsEdit = document.getElementById('topicSettingsEdit');
  if (settingsEdit) settingsEdit.style.display = 'none';
  document.getElementById('topicCustomBar').style.display = 'none';
  document.getElementById('topicSettingsBar').style.display = 'flex';
  document.getElementById('topicSettingsSummary').innerHTML = buildSettingsSummary();
  showCalendarSection(true);

  // Show loading
  var list = document.getElementById('topicList');
  if (list) list.innerHTML = '<div style="text-align:center;padding:60px 20px"><div class="loading-spinner"></div><div style="font-size:.82rem;color:#8a8278;margin-top:12px">AI 正在为你生成选题…</div></div>';

  try {
    var systemPrompt = '你是一个短视频内容策划专家。根据用户的想法，用问题驱动的方式挖掘选题，推荐 5 个。';
    var prompt = buildTopicListPrompt(idea, topicBizData.analysis, null);
    var resultText = await doStoryboardApiCall(systemPrompt, prompt, { noJsonFormat: true, maxTokens: 32768, enableSearch: true });
    topicBizData.topics = parseTopicListText(resultText || '');
    if (!topicBizData.topics.length) throw new Error('未能解析选题列表，请重试');
    saveTopicBiz();
    renderTopicList();
  } catch(e) {
    console.error('[generateCustomTopics] error:', e);
    alert('生成失败：' + (e.message || '未知错误'));
    if (list) list.innerHTML = '<div style="text-align:center;color:#a09888;padding:20px;font-size:.76rem">生成失败，请重试</div>';
  }

  btn.disabled = false;
  btn.innerHTML = '<span class="material-symbols-outlined">auto_awesome</span> 生成选题';
}

async function refreshTopics() {
  if (!topicBizData || !topicBizData.analysis || !settings.apiKey) return;

  var btn = document.getElementById('btnRefreshTopics');
  if (btn) { btn.style.display = 'none'; }
  // Show loading in topic list if not already showing
  var list = document.getElementById('topicList');
  if (list && list.innerHTML.indexOf('loading-spinner') === -1) {
    list.innerHTML = '<div style="text-align:center;padding:60px 20px"><div class="loading-spinner"></div><div style="font-size:.82rem;color:#8a8278;margin-top:12px">AI 正在为你生成选题…</div></div>';
  }

  try {
    var aud = selectedAudienceIndex >= 0 ? topicAudiences[selectedAudienceIndex] : null;
    var systemPrompt = '你是一个短视频内容策划专家。先搜索业务相关的2-3个具体痛点长尾关键词（症状词/场景词，不搜品类大词），验证蓝海热度，然后按问题驱动策略生成选题。';
    var resultText = await doStoryboardApiCall(systemPrompt, buildTopicListPrompt(topicBizData.biz, topicBizData.analysis, aud), { noJsonFormat: true, maxTokens: 32768, enableSearch: true });
    topicBizData.topics = parseTopicListText(resultText || '');
    if (!topicBizData.topics.length) throw new Error('未能解析选题列表，请重试');
    saveTopicBiz();
    renderTopicList();
  } catch(e) {
    console.error('[refreshTopics] error:', e);
    alert('刷新失败：' + (e.message || '未知错误'));
    if (list) list.innerHTML = '<div style="text-align:center;color:#a09888;padding:20px;font-size:.76rem">生成失败，请点击右上角「换一批」重试</div>';
  }
  if (btn) { btn.style.display = ''; btn.textContent = '🔄 换一批'; }
}

// ============================================================
// STARTUP
// ============================================================
window._tryRestoreSession = tryRestoreSession;
init();

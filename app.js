// ============================================================
// UTILITY
// ============================================================
function copyToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text);
  }
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
// DATA CONSTANTS — Short video only
// ============================================================
var PERSONAS = {
  auto:      { name:'智能推荐', icon:'🤖', desc:'根据业务类型自动匹配最佳人设角度' },
  teacher:   { name:'教导者',   icon:'🎓', desc:'专家/老师分享专业知识和经验' },
  companion: { name:'陪伴者',   icon:'🤝', desc:'朋友/同伴分享日常和心路历程' },
  foil:      { name:'陪衬者',   icon:'🌱', desc:'学习者/试错者展示真实成长过程' },
  admirer:   { name:'崇拜者',   icon:'🔍', desc:'鉴赏者/推荐者筛选和评测优质内容' },
  comedian:  { name:'搞笑者',   icon:'😄', desc:'幽默/娱乐方式呈现内容' },
};

var TOPIC_SCENARIOS = [
  { topicType:'痛点解决', topicIcon:'💡', persona:'teacher', label:'专家支招', desc:'针对{biz}领域的常见痛点，用专业视角给出解决方案' },
  { topicType:'痛点解决', topicIcon:'💡', persona:'companion', label:'亲身踩坑', desc:'分享{biz}实践中踩过的坑和真实教训' },
  { topicType:'科普知识', topicIcon:'📚', persona:'teacher', label:'硬核科普', desc:'把{biz}的复杂知识讲得通俗易懂' },
  { topicType:'科普知识', topicIcon:'📚', persona:'comedian', label:'趣味冷知识', desc:'用轻松有趣的方式科普{biz}的冷知识和热梗' },
  { topicType:'讲故事', topicIcon:'📖', persona:'companion', label:'真实经历', desc:'以第一人称讲述{biz}的真实故事和心路历程' },
  { topicType:'讲故事', topicIcon:'📖', persona:'comedian', label:'趣闻轶事', desc:'讲述{biz}领域的有趣人物和事件' },
  { topicType:'好物推荐', topicIcon:'⭐', persona:'admirer', label:'精选推荐', desc:'推荐{biz}相关的优质好物和必备工具' },
  { topicType:'对比测评', topicIcon:'⚖', persona:'admirer', label:'横向对比', desc:'多维度对比{biz}领域的热门选择' },
  { topicType:'避坑指南', topicIcon:'🛡', persona:'foil', label:'新手避坑', desc:'总结{biz}新手最容易犯的错误' },
  { topicType:'避坑指南', topicIcon:'🛡', persona:'companion', label:'经验之谈', desc:'用过来人的身份分享{biz}的实战经验' },
  { topicType:'成长记录', topicIcon:'🌱', persona:'foil', label:'从零开始', desc:'记录{biz}从零起步的完整过程' },
  { topicType:'搞笑娱乐', topicIcon:'😂', persona:'comedian', label:'花式整活', desc:'用幽默有趣的方式呈现{biz}的花式玩法' },
  { topicType:'行业分析', topicIcon:'📊', persona:'teacher', label:'趋势解读', desc:'分析{biz}行业的最新趋势和机会' },
  { topicType:'热点借势', topicIcon:'🔥', persona:'comedian', label:'热点玩梗', desc:'把当下热点和{biz}结合，用幽默角度切入' },
  { topicType:'情感共鸣', topicIcon:'💗', persona:'companion', label:'情绪共振', desc:'捕捉{biz}领域最戳心的情绪瞬间' },
  { topicType:'教程教学', topicIcon:'📝', persona:'teacher', label:'手把手教', desc:'把{biz}的核心技能拆成可操作的步骤' },
  { topicType:'争议讨论', topicIcon:'💬', persona:'admirer', label:'观点碰撞', desc:'抛出{biz}领域有争议的话题，用讨论引爆评论区' },
  { topicType:'挑战系列', topicIcon:'🎯', persona:'foil', label:'X天挑战', desc:'设定{biz}相关的挑战目标，每天更新进展' },
];

var TOPIC_TYPE_META = {
  '痛点解决': { color:'#ef4444', bg:'rgba(239,68,68,.1)', tag:'高流量·强共鸣', tip:'解决具体问题，观众"终于懂了"的感觉' },
  '科普知识': { color:'#6366f1', bg:'rgba(99,102,241,.1)', tag:'涨粉·建权威', tip:'把复杂讲简单，建立专业信任感' },
  '讲故事':   { color:'#a78bfa', bg:'rgba(167,139,250,.1)', tag:'情感连接·高完播', tip:'用故事打动人心，观众愿意看到最后' },
  '好物推荐': { color:'#f59e0b', bg:'rgba(245,158,11,.1)', tag:'带货·高转化', tip:'推荐好东西，观众信任你的品味' },
  '对比测评': { color:'#06b6d4', bg:'rgba(6,182,212,.1)', tag:'收藏率高·决策参考', tip:'帮观众做选择，收藏起来慢慢看' },
  '避坑指南': { color:'#f97316', bg:'rgba(249,115,22,.1)', tag:'实用·高收藏', tip:'帮观众省钱省时间，实用价值拉满' },
  '成长记录': { color:'#10b981', bg:'rgba(16,185,129,.1)', tag:'养成系·高互动', tip:'展示真实进步，观众有参与感和陪伴感' },
  '搞笑娱乐': { color:'#ec4899', bg:'rgba(236,72,153,.1)', tag:'传播力强·易爆款', tip:'轻松有趣，最容易出圈的类型' },
  '行业分析': { color:'#8b5cf6', bg:'rgba(139,92,246,.1)', tag:'深度·精准粉', tip:'展现专业深度，吸引同行和高端读者' },
  '热点借势': { color:'#eab308', bg:'rgba(234,179,8,.1)', tag:'借势起量·时效强', tip:'紧跟热点事件，借搜索流量快速曝光' },
  '情感共鸣': { color:'#f43f5e', bg:'rgba(244,63,94,.1)', tag:'高转发·强共情', tip:'戳中情绪点，用户忍不住转发给朋友' },
  '教程教学': { color:'#14b8a6', bg:'rgba(20,184,166,.1)', tag:'教程·实用', tip:'步骤清晰可操作，收藏率和复看率都高' },
  '争议讨论': { color:'#ef4444', bg:'rgba(239,68,68,.1)', tag:'高互动·引讨论', tip:'抛出有争议的观点，评论区就是第二个内容' },
  '挑战系列': { color:'#f97316', bg:'rgba(249,115,22,.1)', tag:'追更·养成系', tip:'持续更新的系列，观众会为了看后续而关注' },
};

function getSeasonContext() {
  var m = new Date().getMonth() + 1;
  if (m >= 3 && m <= 5) return { season:'春季', themes:'踏青、焕新、春季养生、春装、花粉过敏、春招' };
  if (m >= 6 && m <= 8) return { season:'夏季', themes:'避暑、暑假、防晒、减肥、毕业季、夜经济' };
  if (m >= 9 && m <= 11) return { season:'秋季', themes:'开学季、秋装、贴秋膘、国庆出行、双十一' };
  return { season:'冬季', themes:'保暖、年货、寒假、年终总结、春节、春运' };
}

function getVideoLengthInfo(len) {
  if (len === '15') return { label:'15秒', segments:1, shots:'3-4个镜头', tip:'3-4个镜头，快节奏切换', wordLimit:'总旁白≤60字，每句≤20字', segmentWordLimit:'总旁白≤60字' };
  if (len === '60') return { label:'60秒', segments:4, shots:'每段1-2个镜头', tip:'4段×15秒，完整故事结构', wordLimit:'每段旁白≤60字，总体≤240字', segmentWordLimit:'每段旁白≤60字，每句≤20字' };
  return { label:'30秒', segments:2, shots:'每段1-2个镜头', tip:'2段×15秒，完整叙事弧线', wordLimit:'每段旁白≤60字，总体≤120字', segmentWordLimit:'每段旁白≤60字，每句≤20字' };
}

// ============================================================
// STATE
// ============================================================
var MAX_MESSAGES = 40;

var DEFAULT_SETTINGS = {
  apiKey: '', endpoint: 'https://api.deepseek.com/v1', model: 'deepseek-chat', customModel: '',
  bizName: '', videoLength: '30', subtitleEnabled: true,
  persona: 'auto', language: '普通话', customLanguage: '',
  bizScope: '全国', searchEnabled: true, userProfile: '',
  bgmEnabled: true,
};

var settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
var characterProfiles = [];
var sceneProfiles = [];
var messages = [];
var isGenerating = false;
var abortController = null;
var copyModeActive = false;
var copyAnalysisResult = null;
var editingCharId = null;

// ============================================================
// INIT
// ============================================================
function init() {
  if (typeof initSupabase !== 'undefined') initSupabase();
  loadSettings();

  // Show login page, check for existing session
  document.getElementById('loginPage').classList.remove('hidden');
  if (typeof sbGetSession !== 'undefined') {
    sbGetSession().then(function(session) {
      if (session) {
        sbUser = session.user;
        loadAllFromCloud().then(function() {
          applyAllSettings();
          renderCharacterCards(); renderRemixCharacterCards();
          renderSceneCards(); renderRemixSceneCards();
          renderCharacterList();
          updateStatusBar(); updateAccountUI(); renderScriptHistory();
          dismissLoginPage();
        });
      }
    });
  }
  loadCharacterProfiles();
  loadSceneProfiles();
  loadMessages();
  applyAllSettings();
  bindEvents();
  renderScenarioCards();
  renderCharacterCards();
  renderRemixCharacterCards();
  renderSceneCards();
  renderRemixSceneCards();
  renderCharacterList();
  restoreConversationUI();
  updateStatusBar();
  updateAccountUI();

  // Onboarding shown by dismissLoginPage() after auth
  // (not here — login page must be dismissed first)

  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', function() {
      var vh = window.visualViewport.height;
      var wh = window.innerHeight;
      document.body.style.height = (wh - vh > 100) ? vh + 'px' : '';
    });
  }
}

function loadSettings() {
  try {
    var saved = localStorage.getItem('zimeiti-v3-settings');
    if (saved) { var p = JSON.parse(saved); Object.keys(p).forEach(function(k) { settings[k] = p[k]; }); }
  } catch(e) {}
}

function saveSettingsToStorage() {
  localStorage.setItem('zimeiti-v3-settings', JSON.stringify(settings));
}

function loadCharacterProfiles() {
  try {
    var saved = localStorage.getItem('zimeiti-v3-characters');
    if (saved) { characterProfiles = JSON.parse(saved); }
  } catch(e) { characterProfiles = []; }
}

function saveCharacterProfiles() {
  localStorage.setItem('zimeiti-v3-characters', JSON.stringify(characterProfiles));
}

function loadSceneProfiles() {
  try {
    var saved = localStorage.getItem('zimeiti-v3-scenes');
    if (saved) { sceneProfiles = JSON.parse(saved); }
  } catch(e) { sceneProfiles = []; }
}
function saveSceneProfiles() {
  localStorage.setItem('zimeiti-v3-scenes', JSON.stringify(sceneProfiles));
}

// ============================================================
// MESSAGE PERSISTENCE
// ============================================================
function saveMessagesToStorage() {
  var toSave = [];
  for (var i = 0; i < messages.length; i++) {
    var m = messages[i];
    if (m._streaming) continue;
    toSave.push({ role: m.role, content: m.content, time: m.time, _html: m._html, _done: m._done });
  }
  if (toSave.length > MAX_MESSAGES) toSave = toSave.slice(-MAX_MESSAGES);
  try { localStorage.setItem('zimeiti-v3-messages', JSON.stringify(toSave)); } catch(e) {}
}

function loadMessages() {
  try {
    var saved = localStorage.getItem('zimeiti-v3-messages');
    if (saved) { messages = JSON.parse(saved); }
  } catch(e) {}
}

function restoreConversationUI() {
  if (messages.length === 0) return;
  var chatArea = document.getElementById('chatArea');
  var emptyEl = document.getElementById('chatEmpty');
  if (emptyEl) emptyEl.style.display = 'none';
  for (var i = 0; i < messages.length; i++) {
    var msg = messages[i];
    var div = document.createElement('div');
    div.className = 'msg ' + (msg.role === 'user' ? 'user' : 'assistant');
    var avatar = document.createElement('div'); avatar.className = 'msg-avatar'; avatar.textContent = msg.role === 'user' ? '👤' : '✨';
    var body = document.createElement('div'); body.className = 'msg-body';
    var content = document.createElement('div'); content.className = 'msg-content'; content.innerHTML = msg._html || escapeHtml(msg.content);
    var time = document.createElement('div'); time.className = 'msg-time'; time.textContent = msg.time;
    body.appendChild(content); body.appendChild(time); div.appendChild(avatar); div.appendChild(body);
    chatArea.appendChild(div);
    if (msg.role === 'assistant' && msg._html) { div.querySelectorAll('pre').forEach(function(pre) { addCopyButton(pre); }); }
    msg._el = div; msg._contentEl = content;
  }
  if (messages.length > 0) scrollToBottom();
}

// ============================================================
// TAB SWITCHING
// ============================================================
function switchTab(tabId) {
  document.querySelectorAll('.tab-panel').forEach(function(p) { p.classList.remove('active'); });
  document.querySelectorAll('.tab-item').forEach(function(t) { t.classList.remove('active'); });
  document.getElementById(tabId).classList.add('active');
  document.querySelector('.tab-item[data-tab="' + tabId + '"]').classList.add('active');
  if (tabId === 'tabMe') syncSettingsToMeForm();
}

function syncSettingsToMeForm() {
  document.getElementById('meApiKey').value = settings.apiKey;
  document.getElementById('meEndpoint').value = settings.endpoint;
  document.getElementById('meModel').value = settings.model;
  document.getElementById('meCustomModel').value = settings.customModel || '';
  document.getElementById('meCustomModelField').style.display = settings.model === 'custom' ? 'block' : 'none';
}

// ============================================================
// SETTINGS SYNC — "我的" Tab ↔ settings
// ============================================================
function syncMeToSettings() {
  var bsEl = document.querySelector('#meBizScope .chip.active');
  if (bsEl) settings.bizScope = bsEl.dataset.value;
  var pEl = document.getElementById('mePersonaSelect');
  if (pEl) settings.persona = pEl.value;
  settings.language = document.getElementById('meLanguage').value;
  settings.customLanguage = document.getElementById('meCustomLanguage').value.trim();
  var vlEl = document.querySelector('#meVideoLength .chip.active');
  if (vlEl) settings.videoLength = vlEl.dataset.value;
  var subEl = document.querySelector('#meSubtitle .chip.active');
  if (subEl) settings.subtitleEnabled = subEl.dataset.value === '1';
  var bgmEl = document.querySelector('#meBgm .chip.active');
  if (bgmEl) settings.bgmEnabled = bgmEl.dataset.value === '1';
  settings.searchEnabled = document.getElementById('meWebSearch').checked;
  settings.userProfile = document.getElementById('meUserProfile').value.trim();
  settings.apiKey = document.getElementById('meApiKey').value.trim();
  settings.endpoint = document.getElementById('meEndpoint').value.trim() || DEFAULT_SETTINGS.endpoint;
  settings.model = document.getElementById('meModel').value;
  settings.customModel = document.getElementById('meCustomModel').value.trim();
  saveSettingsToStorage();
  updateStatusBar();
  updateAccountUI();
}

function applyAllSettings() {
  document.getElementById('meBizName').value = settings.bizName;
  setActiveChip('#meBizScope', settings.bizScope);
  var pSel = document.getElementById('mePersonaSelect'); if (pSel) pSel.value = settings.persona;
  document.getElementById('meLanguage').value = settings.language;
  document.getElementById('meCustomLanguage').value = settings.customLanguage || '';
  document.getElementById('meCustomLangRow').style.display = settings.language === 'custom' ? 'block' : 'none';
  setActiveChip('#meVideoLength', settings.videoLength);
  setActiveChip('#meSubtitle', settings.subtitleEnabled ? '1' : '0');
  setActiveChip('#meBgm', settings.bgmEnabled ? '1' : '0');
  document.getElementById('meWebSearch').checked = settings.searchEnabled;
  document.getElementById('meUserProfile').value = settings.userProfile || '';
  document.getElementById('meApiKey').value = settings.apiKey;
  document.getElementById('meEndpoint').value = settings.endpoint;
  document.getElementById('meModel').value = settings.model;
  document.getElementById('meCustomModel').value = settings.customModel || '';
  document.getElementById('meCustomModelField').style.display = settings.model === 'custom' ? 'block' : 'none';
  updateSendButton();
}

function setActiveChip(groupSelector, value) {
  var chips = document.querySelectorAll(groupSelector + ' .chip');
  chips.forEach(function(c) { c.classList.toggle('active', c.value === value); });
}

function updateSendButton() {
  var btn = document.getElementById('btnGenerate');
  if (btn) btn.disabled = !settings.apiKey || isGenerating;
}

function updateStopButton() {
  var stopBtn = document.getElementById('btnStop');
  stopBtn.classList.toggle('visible', isGenerating);
}

// ============================================================
// CHARACTER PROFILE MANAGEMENT
// ============================================================
function openCharacterEditor(charId) {
  editingCharId = charId || null;
  var overlay = document.getElementById('charEditorOverlay');
  var title = document.getElementById('charEditorTitle');
  var deleteBtn = document.getElementById('btnCharDelete');

  if (charId) {
    var ch = findCharById(charId);
    if (!ch) return;
    title.textContent = '编辑形象';
    deleteBtn.style.display = 'block';
    document.getElementById('charEditName').value = ch.name || '';
    setActiveChip('#charEditType', ch.type);
    setActiveChip('#charEditGender', ch.gender);
    document.getElementById('charEditClothing').value = ch.clothing || '';
    document.getElementById('charEditRelationship').value = ch.relationship || '';
    document.getElementById('charEditAge').value = ch.age || '';
    document.getElementById('charEditHair').value = ch.hair || '';
    document.getElementById('charEditBuild').value = ch.build || '';
    document.getElementById('charEditFeatures').value = ch.features || '';
  } else {
    title.textContent = '新建形象';
    deleteBtn.style.display = 'none';
    document.getElementById('charEditName').value = '';
    setActiveChip('#charEditType', 'protagonist');
    setActiveChip('#charEditGender', '');
    document.getElementById('charEditClothing').value = '';
    document.getElementById('charEditRelationship').value = '';
    document.getElementById('charEditAge').value = '';
    document.getElementById('charEditHair').value = '';
    document.getElementById('charEditBuild').value = '';
    document.getElementById('charEditFeatures').value = '';
  }
  updateCharEditorTypeFields();
  overlay.classList.add('open');
}

function closeCharacterEditor() {
  document.getElementById('charEditorOverlay').classList.remove('open');
  editingCharId = null;
}

function updateCharEditorTypeFields() {
  var typeEl = document.querySelector('#charEditType .chip.active');
  var type = typeEl ? typeEl.dataset.value : 'protagonist';
  document.getElementById('charEditRelationshipField').style.display = type === 'supporting' ? 'flex' : 'none';
}

function findCharById(id) {
  for (var i = 0; i < characterProfiles.length; i++) {
    if (characterProfiles[i].id === id) return characterProfiles[i];
  }
  return null;
}

function saveCharacterFromDialog() {
  var genderEl = document.querySelector('#charEditGender .chip.active');
  var typeEl = document.querySelector('#charEditType .chip.active');
  var type = typeEl ? typeEl.dataset.value : 'protagonist';
  var gender = genderEl ? genderEl.dataset.value : '';
  var clothing = document.getElementById('charEditClothing').value.trim();

  if (!gender || !clothing) {
    alert('性别和服装为必填项');
    return;
  }

  var data = {
    id: editingCharId || generateId(),
    name: document.getElementById('charEditName').value.trim() || (type === 'protagonist' ? '主角' : '配角'),
    type: type,
    gender: gender,
    clothing: clothing,
    age: document.getElementById('charEditAge').value.trim(),
    hair: document.getElementById('charEditHair').value.trim(),
    build: document.getElementById('charEditBuild').value.trim(),
    features: document.getElementById('charEditFeatures').value.trim(),
    relationship: type === 'supporting' ? document.getElementById('charEditRelationship').value.trim() : '',
  };

  if (editingCharId) {
    for (var i = 0; i < characterProfiles.length; i++) {
      if (characterProfiles[i].id === editingCharId) { characterProfiles[i] = data; break; }
    }
  } else {
    characterProfiles.push(data);
  }

  saveCharacterProfiles();
  renderCharacterCards();
  renderRemixCharacterCards();
  renderSceneCards();
  renderRemixSceneCards();
  renderCharacterList();
  closeCharacterEditor();
}

function deleteCharacterFromDialog() {
  if (!editingCharId || !confirm('确定要删除这个形象吗？')) return;
  characterProfiles = characterProfiles.filter(function(c) { return c.id !== editingCharId; });
  saveCharacterProfiles();
  renderCharacterCards();
  renderRemixCharacterCards();
  renderSceneCards();
  renderRemixSceneCards();
  renderCharacterList();
  closeCharacterEditor();
}

function renderCharacterCards() {
  var grid = document.getElementById('charGrid');
  if (!grid) return;
  grid.innerHTML = '';

  for (var i = 0; i < characterProfiles.length; i++) {
    var ch = characterProfiles[i];
    var card = document.createElement('div');
    card.className = 'asset-item';
    card.dataset.charId = ch.id;
    var name = ch.name || (ch.type === 'protagonist' ? '主角' : '配角');
    if (name.length > 4) name = name.slice(0, 4);
    card.innerHTML =
      '<div class="asset-icon">' + (ch.type === 'protagonist' ? '👤' : '👥') + '</div>' +
      '<div class="asset-name">' + escapeHtml(name) + '</div>';
    card.addEventListener('click', function(e) {
      grid.querySelectorAll('.asset-item').forEach(function(c) { c.classList.remove('active'); });
      this.classList.add('active');
    });
    grid.appendChild(card);
  }

  // New button
  var newCard = document.createElement('div');
  newCard.className = 'character-card empty';
  newCard.id = 'charCardNew';
  newCard.innerHTML = '<div class="char-avatar-new">+</div><div class="char-name">新建</div>';
  newCard.addEventListener('click', function() { openCharacterEditor(); });
  grid.appendChild(newCard);

  var hint = document.getElementById('charGrid');
  hint.style.display = characterProfiles.length > 0 ? 'none' : 'block';
}

function renderRemixCharacterCards() {
  var grid = document.getElementById('remixCharGrid');
  if (!grid) return;
  grid.innerHTML = '';

  for (var i = 0; i < characterProfiles.length; i++) {
    var ch = characterProfiles[i];
    var card = document.createElement('div');
    card.className = 'character-card';
    card.dataset.charId = ch.id;
    card.innerHTML =
      '<div class="char-avatar">' + (ch.type === 'protagonist' ? '👤' : '👥') + '</div>' +
      '<div class="char-name">' + escapeHtml(ch.name) + '</div>';
    card.addEventListener('click', function(e) {
      grid.querySelectorAll('.asset-item').forEach(function(c) { c.classList.remove('active'); });
      this.classList.add('active');
    });
    grid.appendChild(card);
  }

  var newCard = document.createElement('div');
  newCard.className = 'asset-item add-new';
  newCard.innerHTML = '<div class="asset-icon">+</div><div class="asset-name">新建</div>';
  newCard.addEventListener('click', function() { openCharacterEditor(); });
  grid.appendChild(newCard);

  var hint = document.getElementById('remixCharGrid');
  if (hint) hint.style.display = characterProfiles.length > 0 ? 'none' : 'block';
}

function openSceneEditor() {
  document.getElementById('sceneEditorOverlay').classList.add('open');
  renderSceneListInEditor();
}
function closeSceneEditor() {
  document.getElementById('sceneEditorOverlay').classList.remove('open');
}
function addScene() {
  var name = document.getElementById('newSceneName').value.trim();
  var desc = document.getElementById('newSceneDesc').value.trim();
  if (!name) return;
  sceneProfiles.push({ id: generateId(), name: name, description: desc });
  saveSceneProfiles();
  if (typeof sbUser !== 'undefined' && sbUser) sbSaveScene(data);
  document.getElementById('newSceneName').value = '';
  document.getElementById('newSceneDesc').value = '';
  renderSceneListInEditor();
  renderSceneCards();
  renderRemixSceneCards();
}
function removeScene(id) {
  if (!confirm('删除这个场景？')) return;
  sceneProfiles = sceneProfiles.filter(function(s) { return s.id !== id; });
  saveSceneProfiles();
  if (typeof sbUser !== 'undefined' && sbUser) sbDeleteScene(id);
  renderSceneListInEditor();
  renderSceneCards();
  renderRemixSceneCards();
}
function renderSceneListInEditor() {
  var list = document.getElementById('sceneListInEditor');
  if (!list) return;
  if (sceneProfiles.length === 0) {
    list.innerHTML = '<div style="font-size:.72rem;color:#555;text-align:center;padding:12px 0">还没有场景</div>';
    return;
  }
  var html = '';
  for (var i = 0; i < sceneProfiles.length; i++) {
    var s = sceneProfiles[i];
    html += '<div class="scene-editor-item"><div style="flex:1"><div style="font-size:.76rem;color:#ddd;font-weight:500">' + escapeHtml(s.name) + '</div><div style="font-size:.68rem;color:#777">' + escapeHtml(s.description || '无描述') + '</div></div><button class="btn-icon-sm" onclick="removeScene(\'' + s.id + '\')" style="color:#ef4444">🗑</button></div>';
  }
  list.innerHTML = html;
}
function renderSceneCards() {
  var grid = document.getElementById('sceneGrid');
  if (!grid) return;
  grid.innerHTML = '';
  for (var i = 0; i < sceneProfiles.length; i++) {
    var s = sceneProfiles[i];
    var card = document.createElement('div');
    card.className = 'asset-item';
    card.dataset.sceneId = s.id;
    var sname = s.name;
    if (sname.length > 4) sname = sname.slice(0, 4);
    card.innerHTML = '<div class="asset-icon">🏠</div><div class="asset-name">' + escapeHtml(sname) + '</div>';
    card.addEventListener('click', function(e) {
      grid.querySelectorAll('.asset-item').forEach(function(c) { c.classList.remove('active'); });
      this.classList.add('active');
    });
    grid.appendChild(card);
  }
  var newCard = document.createElement('div');
  newCard.className = 'asset-item add-new';
  newCard.innerHTML = '<div class="asset-icon">+</div><div class="asset-name">新建</div>';
  newCard.addEventListener('click', function() { openSceneEditor(); });
  grid.appendChild(newCard);
  var hint = document.getElementById('sceneGrid');
  if (hint) hint.style.display = sceneProfiles.length > 0 ? 'none' : 'block';
}
function renderRemixSceneCards() {
  var grid = document.getElementById('remixSceneGrid');
  if (!grid) return;
  grid.innerHTML = '';
  for (var i = 0; i < sceneProfiles.length; i++) {
    var s = sceneProfiles[i];
    var card = document.createElement('div');
    card.className = 'asset-item';
    card.dataset.sceneId = s.id;
    var sname = s.name;
    if (sname.length > 4) sname = sname.slice(0, 4);
    card.innerHTML = '<div class="asset-icon">🏠</div><div class="asset-name">' + escapeHtml(sname) + '</div>';
    card.addEventListener('click', function(e) {
      grid.querySelectorAll('.asset-item').forEach(function(c) { c.classList.remove('active'); });
      this.classList.add('active');
    });
    grid.appendChild(card);
  }
  var newCard = document.createElement('div');
  newCard.className = 'asset-item add-new';
  newCard.innerHTML = '<div class="asset-icon">+</div><div class="asset-name">新建</div>';
  newCard.addEventListener('click', function() { openSceneEditor(); });
  grid.appendChild(newCard);
  var hint = document.getElementById('remixSceneGrid');
  if (hint) hint.style.display = sceneProfiles.length > 0 ? 'none' : 'block';
}
function getSelectedScene(scrollId) {
  var activeCard = document.querySelector('#' + scrollId + ' .asset-item.active:not(.add-new)');
  if (!activeCard) return null;
  var id = activeCard.dataset.sceneId;
  for (var i = 0; i < sceneProfiles.length; i++) {
    if (sceneProfiles[i].id === id) return sceneProfiles[i];
  }
  return null;
}
function buildSceneAnchor(tabPrefix) {
  var scrollId = tabPrefix === 'remix' ? 'remixSceneGrid' : 'sceneGrid';
  var scene = getSelectedScene(scrollId);
  return scene ? scene.description || scene.name : '';
}

function renderCharacterList() {
  var scroll = document.getElementById('meCharScroll');
  if (!scroll) return;
  var empty = document.getElementById('meCharEmpty');

  if (characterProfiles.length === 0) {
    scroll.innerHTML = '';
    if (empty) empty.style.display = 'block';
    return;
  }
  if (empty) empty.style.display = 'none';

  var html = '';
  for (var i = 0; i < characterProfiles.length; i++) {
    var ch = characterProfiles[i];
    html +=
      '<div class="me-char-item" onclick="openCharacterEditor(\'' + ch.id + '\')">' +
        '<div class="char-avatar-circle">' + (ch.type === 'protagonist' ? '👤' : '👥') + '</div>' +
        '<div class="char-avatar-name">' + escapeHtml(ch.name) + '</div>' +
      '</div>';
  }
  html +=
    '<div class="me-char-item add-new" onclick="openCharacterEditor()">' +
      '<div class="char-avatar-circle">+</div>' +
      '<div class="char-avatar-name">新建</div>' +
    '</div>';
  scroll.innerHTML = html;
}

function getSelectedCharacter() {
  var activeCard = document.querySelector('#charGrid .asset-item.active:not(.add-new)');
  if (!activeCard) return null;
  return findCharById(activeCard.dataset.charId);
}

function buildCharacterAnchor() {
  var ch = getSelectedCharacter();
  if (!ch) return '';

  var desc = ch.gender;
  if (ch.age) desc += '，' + ch.age;
  if (ch.hair) desc += '，' + ch.hair;
  desc += '，穿' + ch.clothing;
  if (ch.build) desc += '，' + ch.build;
  if (ch.features) desc += '，' + ch.features;
  return desc;
}

function buildSupportingAnchor() {
  var chars = characterProfiles.filter(function(c) { return c.type === 'supporting'; });
  if (chars.length === 0) return '';
  var ch = chars[0];
  var desc = ch.gender + '，穿' + ch.clothing;
  if (ch.relationship) desc += '（' + ch.relationship + '）';
  if (ch.features) desc += '，' + ch.features;
  return desc;
}

// ============================================================
// SYSTEM PROMPT — Short video only, with character anchors
// ============================================================
function buildSystemPrompt() {
  var sc = getSeasonContext();
  var lang = settings.language === 'custom' ? (settings.customLanguage || '自定义语言') : settings.language;
  var vl = getVideoLengthInfo(settings.videoLength);
  var segCount = vl.segments;

  var personaInfo = '';
  if (settings.persona !== 'auto') {
    var p = PERSONAS[settings.persona];
    if (p) personaInfo = '- 用户指定人设：' + p.name + '（' + p.desc + '）\n';
  }

  // Character anchors
  var protagonistAnchor = buildCharacterAnchor();
  var supportingAnchor = buildSupportingAnchor();
  var sceneDesc = buildSceneAnchor('');
  var anchorSection = '';
  if (protagonistAnchor) {
    anchorSection =
      '### ⚠️ 角色锚点（用户预设，必须使用，不得修改）\n' +
      '**主角**：' + protagonistAnchor + '\n';
    if (supportingAnchor) {
      anchorSection += '**配角（如有需要）**：' + supportingAnchor + '\n';
    }
    anchorSection += '\n每段分镜的画面描述第一句必须逐字包含主角的完整锚点描述。如果涉及配角，同样必须包含配角的完整锚点描述。\n\n' +
      '**即梦操作提示**：用户在即梦中点击「参考图片」→ 上传主角正面照作为人脸参考。所有' + segCount + '段必须使用同一张参考图。\n\n';
  } else {
    anchorSection =
      '### 角色锚点\n' +
      '用户未预设形象，请根据选题自行生成角色锚点，并在每段的画面描述第一句中包含。\n\n';
  }
  // Scene anchor
  if (sceneDesc) {
    anchorSection +=
      '### 🏠 场景锚点（用户预设，必须使用，不得修改）\n' +
      '**场景描述**：' + sceneDesc + '\n\n' +
      '每段分镜的画面描述中必须包含此场景描述。这是保证即梦生成多段视频时场景背景一致的最关键手段。\n\n';
  }

  var contentTypeInfo = '- 视频时长：' + vl.label + '（' + vl.segments + '段×15秒，' + vl.wordLimit + '，' + vl.tip + '）\n';

  var segIntro = segCount === 1 ?
    '### 输出结构\n1. **脚本标题** + 选题类型标注 + 总时长（15秒）\n2. **分镜表**：每个镜头标注时间段、景别、画面描述、旁白台词\n3. **话题标签**：5-8个 hashtag\n4. **即梦生成参数**：比例、时长、景别、语速、光线、机位、人脸参考\n\n' :
    '### ⚠️ 即梦生成限制与分段策略\n即梦（Jimeng）单次只能生成15秒视频。因此' + vl.label + '视频拆为**' + segCount + '段×15秒**。每段是独立复制到即梦使用的完整提示词。用户分' + segCount + '次生成后，用剪辑软件按转场建议拼接成完整视频。\n\n';

  var anchorSystem = segCount === 1 ? anchorSection :
    '### 一致性锚点系统（多段视频最关键的要求）\n' +
    '为了保证' + segCount + '段视频画面统一，必须定义并在每段中重复以下锚点：\n\n' +
    (protagonistAnchor ? anchorSection : '') +
    '**风格锚点**：统一的视觉风格和拍摄参数\n' +
    '  格式示例：「暖色调自然光，中近景为主，固定机位靠演员前倾/后退变景别，背景轻微虚化，画面干净不杂乱」\n\n';

  var outputStructure =
    '### 输出结构\n\n' +
    '**第一部分：视频总信息**\n' +
    '1. **脚本标题** + 选题类型标注 + 总时长\n' +
    (segCount > 1 ? '2. **叙事弧线**：整体起承转合\n3. **风格锚点定义**\n4. **话题标签**：5-8个 hashtag\n\n' :
    '2. **爆款结构分析**：目标观众、情绪曲线、钩子模式、为什么能爆、心理触发词\n3. **话题标签**：5-8个 hashtag\n\n') +
    '**第二部分：分段即梦提示词**' + (segCount > 1 ? '（共' + segCount + '段）\n\n' : '\n\n') +
    '每段格式：\n```\n' +
    (segCount > 1 ? '## 第N段（X-Y秒）——本段主题\n\n### 本段叙事目标\n\n' : '') +
    '### 爆款结构分析\n- **目标观众**：[25-50字]\n- **情绪曲线**：[情绪变化节点]\n- **钩子模式**：[模式]\n- **为什么能爆**：[20-40字]\n- **心理触发词**：[3-5个]\n\n' +
    '### 分镜表（⚠️ 每段15秒最多2个镜头，每个镜头≥7秒）\n' +
    '【X-Y秒】景别。画面描述' + (protagonistAnchor ? '（第一句必须包含角色锚点）' : '') + '。\n旁白（' + lang + '）："台词内容"\n' +
    (segCount > 1 ? '【Y-15秒】景别。画面描述（第一句必须包含角色锚点）。\n旁白（' + lang + '）："台词内容"\n' : '') +
    '### 即梦生成参数\n- 比例：9:16 竖屏\n- 时长：15秒\n- 语速：正常，关键词加重\n- 机位：固定机位\n- 人脸参考：上传主角照片' + (segCount > 1 ? '（⚠️ 所有' + segCount + '段必须使用同一张参考图）' : '') + '\n' +
    (segCount > 1 ? '\n### 转场到下一段\n- 本段结尾画面：[描述]\n- 下一段开头画面：[描述]\n- 转场方式建议：[硬切/淡入淡出/匹配剪辑]\n' : '') +
    '```\n\n';

  var sceneRequirement =
    '### 画面描述与镜头数要求\n' +
    '- 每句话都写清楚：演员怎么站/坐/走、手在做什么、眼睛看哪里、脸上什么表情\n' +
    '- 如果涉及道具，写清楚道具怎么出现、怎么拿、怎么展示\n' +
    '- 镜头变化写清楚：切近景/切中景/切特写，为什么切\n' +
    '- **每段15秒最多2个镜头，每个镜头≥7秒**\n' +
    (segCount > 1 ? '- 15秒只讲一个核心动作/情绪点\n' : '') +
    (protagonistAnchor ? '- **每段画面描述第一句必须包含角色锚点**\n' : '') +
    '\n';

  var narrationRequirement =
    '### 旁白要求\n' +
    '- 必须使用' + lang + '\n' +
    '- 口语化、有语气词、有情绪起伏\n' +
    '- 每句旁白和画面动作配合，不要两张皮\n' +
    '- **口播字数限制：' + vl.wordLimit + '**。口播语速约4字/秒\n\n' +
    '### 去AI味规则（必须遵守）\n' +
    '- 禁用：首先其次最后 / 综上所述 / 值得注意的是 / 与此同时 / 因此 / 从而\n' +
    '- 禁用：三个以上结构完全相同的排比句\n' +
    '- 句长：每句≤20字，多用5-8字短句\n' +
    '- 语气词：每段至少2个（吧/嘛/哈/呢/啊/哦/呗）\n' +
    '- 用口语连接词：然后/还有/对了/你猜/就是说/说白了\n' +
    '- 像在跟朋友发语音，不要像在写文章\n\n';

  var subtitleRequirement = settings.subtitleEnabled ?
    '### 字幕要求\n- 必须为每句旁白标注字幕：`字幕："逐词拆分的字幕文本"`\n- 字幕按旁白节奏拆分，每段2-5个字，用 `/` 分隔\n- 字幕和旁白必须一一对应\n\n' :
    '### 字幕\n用户选择不添加字幕，不要输出字幕相关内容。\n\n';

  var bgmRequirement = settings.bgmEnabled ?
    '### BGM要求\n- 在即梦生成参数中增加 BGM 描述\n- 推荐背景音乐风格：根据脚本情绪匹配（紧张→快节奏鼓点、温馨→轻钢琴、搞笑→欢快电子、悬疑→低音氛围）\n- 格式示例：`- BGM风格：[风格描述]`\n\n' :
    '### BGM\n用户选择不添加BGM，不要输出BGM相关内容。\n\n';

  var exampleRef = segCount > 1 ?
    '### 参考示例（' + vl.label + ' / ' + segCount + '段）\n```\n## 视频总信息\n脚本标题：饮水机冷水口细菌是热水口的6倍\n选题类型：科普知识\n总时长：30秒（2段×15秒）\n叙事弧线：第一段抛出问题→第二段揭示答案+解决方案\n\n### 风格锚点\n暖色调自然光，中近景为主，固定机位\n\n### 话题标签\n#饮水机清洗 #冷水口细菌 #饮水安全\n\n---\n## 第一段（0-15秒）——抛出问题\n### 本段叙事目标\n制造悬念\n\n### 爆款结构分析\n- **目标观众**：25-40岁家庭用户\n- **情绪曲线**：好奇(0-4s)→意外(4-8s)→震惊(8-15s)\n- **钩子模式**：数据反差型+提问式\n- **为什么能爆**：日常场景+反常识数据\n- **心理触发词**：最脏、不是热水口、6倍多\n\n### 分镜表（⚠️ 每段15秒最多2个镜头，每个镜头≥7秒）\n【0-8秒】中景。女主角（' + (protagonistAnchor || '28岁黑短发女性，白衬衫深蓝围裙') + '）站在厨房饮水机旁，手指在冷水口和热水口之间来回点，表情狡黠\n旁白：饮水机哪边最脏？你猜是哪个口？\n\n【8-15秒】切中景。女主角双手比划"6"和"1"，表情夸张\n旁白：冷水口细菌是热水口的——6倍多！\n\n### 即梦生成参数\n- 比例：9:16 竖屏\n- 时长：15秒\n- 机位：固定机位\n- 人脸参考：上传主角照片\n\n### 转场到下一段\n- 本段结尾画面：女主角双手比划，表情夸张\n- 下一段开头画面：女主角双手捂嘴，同一服装\n- 转场方式建议：硬切\n```\n\n' :
    '### 参考示例（15秒）\n```\n脚本标题：饮水机冷水口的细菌是热水口的6倍\n选题类型：科普知识\n\n### 爆款结构分析\n- **目标观众**：25-40岁家庭用户\n- **情绪曲线**：好奇(0-3s)→揭示(3-7s)→震惊(7-11s)→行动(11-15s)\n- **钩子模式**：数据反差型\n- **为什么能爆**：反常识数据打破日常认知\n- **心理触发词**：细菌、6倍\n\n【0-3秒】中景。女主角站在饮水机旁，手指来回点，表情狡黠\n旁白：饮水机哪边最脏？\n\n话题标签：#饮水机清洗 #饮水安全\n\n---\n## 即梦生成参数\n- 比例：9:16 竖屏\n- 时长：15秒\n- 机位：固定机位\n- 人脸参考：上传主角照片\n```\n\n';

  var platformGuide =
    '## 短视频脚本格式要求\n\n目标AI工具：即梦（Jimeng）\n\n' +
    segIntro +
    anchorSystem +
    outputStructure +
    sceneRequirement +
    narrationRequirement +
    subtitleRequirement +
    bgmRequirement +
    exampleRef +
    '**重要规则**：\n' +
    '1. 每段15秒最多2个镜头，每个镜头≥7秒\n' +
    '2. 口播语速约4字/秒，每段15秒旁白≤60字\n' +
    '3. 每段画面描述第一句必须包含角色锚点\n' +
    '4. 上传同一张参考图是保证多段一致的最有效手段\n';

  return '你是自媒体内容创作助手，专门为即梦（Jimeng）生成短视频脚本提示词。\n\n' +
    '## 用户背景\n' +
    '- 业务/账号：' + (settings.bizName || '通用自媒体') + '\n' +
    '- 业务范围：' + (settings.bizScope || '全国') + '\n' +
    contentTypeInfo +
    personaInfo +
    '- 语言：' + lang + '\n' +
    (settings.userProfile ? '- 创作者个人资料：' + settings.userProfile + '\n' : '') +
    '- 当前季节：' + sc.season + '（可关联热点：' + sc.themes + '）\n\n' +
    platformGuide + '\n\n' +
    '## 选题推荐规则\n' +
    (function() {
      var recent = getRecentTopicTitles(30);
      if (recent.length === 0) return '';
      var s = '### ⚠️ 已生成过的选题（禁止重复）\n';
      for (var i = 0; i < recent.length; i++) { s += '- ' + recent[i] + '\n'; }
      s += '\n请推荐全新的选题。\n\n';
      return s;
    })() +
    '### 爆款钩子公式库\n' +
    '| 选题类型 | 最佳钩子模式 | 公式模板 |\n' +
    '|----------|-------------|----------|\n' +
    '| 痛点解决 | 权威型/警示型 | "我[做了X]，发现[真相]" |\n' +
    '| 科普知识 | 数据型/反差型 | "[数字] + [反常识发现]" |\n' +
    '| 避坑指南 | 警示型/失去型 | "别再[错误做法]了" |\n' +
    '| 好物推荐 | 省时型/工具型 | "这[N]个帮你省[数字]" |\n' +
    '| 对比测评 | 数据型/反向型 | "测了[N]个[X]，发现…" |\n' +
    '| 讲故事 | 意外型/过程型 | "我曾[经历]，结果[反预期]" |\n' +
    '| 成长记录 | 约束型/偷学型 | "在没有[X]的情况下，做到了[Y]" |\n' +
    '| 搞笑娱乐 | 反差型/重置型 | "忘掉你对[X]的所有认知" |\n' +
    '| 行业分析 | 权威型/分析型 | "研究了[N]个[X]，发现了[规律]" |\n\n' +
    '**钩子通用规则**：用具体数字、制造信息差、开头3秒内抛出悬念\n\n' +
    (settings.bizScope === '本地' ?
      '**本地业务信任构建**：用地名/地标/本地案例建立地域信任感\n' :
      '**全国业务信任构建**：用数据/专业/规模/对比建立权威信任\n') +
    '\n## 输出规范\n' +
    '1. 选题推荐用表格呈现\n' +
    '2. AI工具提示词用 ``` 代码块包裹\n' +
    '3. 提示词具体化，不要写占位符\n' +
    '4. 短视频脚本必须拆分镜头\n' +
    '5. 可调整：在原基础上修改，不要从头生成\n' +
    '6. 严格遵守去AI味规则\n';
}

// ============================================================
// KEYWORD GENERATION
// ============================================================
function buildKeywordSystemPrompt() {
  var biz = settings.bizName || '这个领域';
  return '你是一个选题关键词生成器。用户业务是「' + biz + '」，内容类型是短视频。\n\n' +
    '请生成12-20个关键词/短语，作为选题方向的种子词。要求：\n- 每个关键词2-8个字\n- 覆盖不同方向：痛点、科普、故事、推荐、对比、避坑、热点、情感等\n- 偏向热点话题、视觉冲击方向\n- 避免过于泛化的词（如"生活""日常"）\n- 优先长尾、具体的角度词\n\n只输出纯JSON数组格式：\n["关键词1", "关键词2", ...]';
}

function parseKeywords(text) {
  try { var arr = JSON.parse(text.trim()); if (Array.isArray(arr) && arr.length > 0) return arr.filter(function(x) { return typeof x === 'string' && x.trim(); }); } catch(e) {}
  var m = text.match(/\[([^\]]*)\]/s);
  if (m) { try { var arr2 = JSON.parse('[' + m[1] + ']'); if (Array.isArray(arr2) && arr2.length > 0) return arr2.filter(function(x) { return typeof x === 'string' && x.trim(); }); } catch(e2) {} }
  return text.split(/[\n,，、]+/).map(function(l) { return l.replace(/^\d+[\.\、\)\s]+/, '').replace(/^["'""''「」]|["'""''「」]$/g, '').trim(); }).filter(function(l) { return l.length >= 2 && l.length <= 20; });
}

// Topic history
function loadTopicHistory() {
  try { var raw = localStorage.getItem('zimeiti-v3-topic-history'); return raw ? JSON.parse(raw) : {}; } catch(e) { return {}; }
}
function saveTopicHistory(titles) {
  var history = loadTopicHistory();
  if (!history.shortVideo) history.shortVideo = [];
  for (var i = 0; i < titles.length; i++) { var t = titles[i].trim(); if (t && history.shortVideo.indexOf(t) === -1) history.shortVideo.unshift(t); }
  if (history.shortVideo.length > 100) history.shortVideo = history.shortVideo.slice(0, 100);
  try { localStorage.setItem('zimeiti-v3-topic-history', JSON.stringify(history)); } catch(e) {}
}
function getRecentTopicTitles(maxCount) {
  return (loadTopicHistory().shortVideo || []).slice(0, maxCount || 30);
}
function extractTopicTitles(text) {
  var titles = [];
  var patterns = [/选题[一二三四五六七八九十\d]+[：:]\s*(.+?)(?:\n|$)/g, /\d+[\.\、]\s*\*{0,2}(.+?)\*{0,2}\s*(?:\n|$)/g];
  for (var p = 0; p < patterns.length; p++) { var m; while ((m = patterns[p].exec(text)) !== null) { var t = m[1].trim(); if (t.length > 4 && t.length < 100 && titles.indexOf(t) === -1) titles.push(t); } }
  if (titles.length === 0) { var boldRe = /\*\*(.+?)\*\*/g; var bm; while ((bm = boldRe.exec(text)) !== null) { var bt = bm[1].trim(); if (bt.length > 5 && bt.length < 80 && titles.indexOf(bt) === -1) titles.push(bt); } titles = titles.slice(0, 5); }
  return titles;
}

function renderKeywordChips(keywords) {
  var chatArea = document.getElementById('chatArea');
  var wrap = document.createElement('div'); wrap.className = 'keyword-chips-wrap';
  wrap.innerHTML = '<div class="keyword-chips-hint">选择你感兴趣的关键词（可多选），然后点击生成选题</div>';
  var chipsDiv = document.createElement('div'); chipsDiv.className = 'keyword-chips';
  for (var i = 0; i < keywords.length; i++) { var chip = document.createElement('button'); chip.className = 'keyword-chip'; chip.textContent = keywords[i]; chip.dataset.keyword = keywords[i]; chipsDiv.appendChild(chip); }
  wrap.appendChild(chipsDiv);
  var genBtn = document.createElement('button'); genBtn.className = 'generate-topics-btn'; genBtn.textContent = '✨ 根据选中的关键词生成选题'; genBtn.disabled = true; wrap.appendChild(genBtn);
  chatArea.appendChild(wrap); scrollToBottom();
}

function generateTopicsFromKeywords(keywords) {
  var biz = settings.bizName || '这个领域';
  var recentTitles = getRecentTopicTitles(30);
  var historyBlock = '';
  if (recentTitles.length > 0) { historyBlock = '\n\n## ⚠️ 已生成过的选题（必须避开）\n'; for (var i = 0; i < recentTitles.length; i++) { historyBlock += '- ' + recentTitles[i] + '\n'; } }
  sendToLLM('请帮我分析「' + biz + '」的短视频内容。\n用户选中的关键词方向：' + keywords.join('、') + '\n\n请推荐5个具体爆款选题，说明选题类型、标题、推荐理由、适合人设。' + historyBlock, false);
}

// ============================================================
// MESSAGING
// ============================================================
function addMessage(role, content) {
  var msg = { role: role, content: content, time: new Date().toLocaleTimeString('zh-CN', { hour:'2-digit', minute:'2-digit' }) };
  messages.push(msg);
  if (messages.length > MAX_MESSAGES) messages = messages.slice(-MAX_MESSAGES);
  renderMessage(msg); scrollToBottom(); saveMessagesToStorage();
  return msg;
}

function renderMessage(msg) {
  var chatArea = document.getElementById('chatArea');
  var emptyEl = document.getElementById('chatEmpty'); if (emptyEl) emptyEl.style.display = 'none';
  var div = document.createElement('div'); div.className = 'msg ' + (msg.role === 'user' ? 'user' : 'assistant');
  div.innerHTML =
    '<div class="msg-avatar">' + (msg.role === 'user' ? '👤' : '✨') + '</div>' +
    '<div class="msg-body"><div class="msg-content">' + (msg._html || escapeHtml(msg.content)) + '</div><div class="msg-time">' + msg.time + '</div></div>';
  chatArea.appendChild(div);
  if (msg.role === 'assistant' && msg._html) { div.querySelectorAll('pre').forEach(function(pre) { addCopyButton(pre); }); }
  msg._el = div; msg._contentEl = div.querySelector('.msg-content');
}

function addStreamingMessage() {
  var chatArea = document.getElementById('chatArea');
  var emptyEl = document.getElementById('chatEmpty'); if (emptyEl) emptyEl.style.display = 'none';
  var msg = { role: 'assistant', content: '', time: new Date().toLocaleTimeString('zh-CN', { hour:'2-digit', minute:'2-digit' }), _streaming: true };
  messages.push(msg);
  var div = document.createElement('div'); div.className = 'msg assistant';
  div.innerHTML = '<div class="msg-avatar">✨</div><div class="msg-body"><div class="msg-content"><div class="typing-dots"><span></span><span></span><span></span></div></div><div class="msg-time">' + msg.time + '</div></div>';
  chatArea.appendChild(div); msg._el = div; msg._contentEl = div.querySelector('.msg-content'); scrollToBottom();
  return msg;
}

function appendStreamToken(msg, token) { msg.content += token; if (msg._contentEl) { msg._contentEl.innerHTML = renderMarkdown(msg.content); scrollToBottom(); } }

function finishStreaming(msg) {
  msg._streaming = false; msg._done = true; msg._html = renderMarkdown(msg.content);
  if (msg._contentEl) {
    msg._contentEl.innerHTML = msg._html;
    msg._contentEl.querySelectorAll('pre').forEach(function(pre) { addCopyButton(pre); });
    enhanceCopyTargets(msg._contentEl);
  }

  if (msg._isKeywordGen) { var keywords = parseKeywords(msg.content); if (keywords.length > 0) renderKeywordChips(keywords); }
  else { var titles = extractTopicTitles(msg.content); if (titles.length > 0) { saveTopicHistory(titles); for (var ti = 0; ti < titles.length; ti++) saveScriptToHistory(titles[ti]); } renderScriptHistory(); }
  saveMessagesToStorage(); scrollToBottom(); updateStatusBar();
  isGenerating = false; abortController = null; updateSendButton(); updateStopButton();
}

function saveScriptToHistory(title) {
  if (!title) return;
  var history = loadScriptHistory();
  history.unshift({ title: title, time: new Date().toLocaleString('zh-CN') });
  if (history.length > 50) history = history.slice(0, 50);
  try { localStorage.setItem('zimeiti-v3-script-history', JSON.stringify(history)); } catch(e) {}
}

function loadScriptHistory() {
  try {
    var saved = localStorage.getItem('zimeiti-v3-script-history');
    return saved ? JSON.parse(saved) : [];
  } catch(e) { return []; }
}

function updateProfilePreviewOnMePage() {
  var preview = document.getElementById('meProfilePreview');
  if (!preview) return;
  var text = settings.userProfile || '';
  if (text) {
    preview.textContent = text.length > 60 ? text.slice(0, 60) + '…' : text;
  } else {
    preview.textContent = '介绍一下你自己，AI 会根据这些信息个性化生成内容';
  }
}

function renderScriptHistory() {
  var list = document.getElementById('meScriptHistory');
  if (!list) return;
  var history = loadScriptHistory();
  if (history.length === 0) {
    list.innerHTML = '<div class="me-history-empty">还没有生成过脚本</div>';
    return;
  }
  var html = '';
  for (var i = 0; i < Math.min(history.length, 20); i++) {
    var h = history[i];
    html += '<div class="me-history-item"><div class="me-history-title">' + escapeHtml(h.title) + '</div><div class="me-history-meta">' + h.time + '</div></div>';
  }
  list.innerHTML = html;
}


function enhanceCopyTargets(contentEl) {
  if (window.innerWidth > 768) return;
  contentEl.querySelectorAll('h1, h2, h3').forEach(function(h) { if (!h.querySelector('.copy-inline')) { var btn = makeCopyInlineBtn(h); h.appendChild(btn); } });
}

function makeCopyInlineBtn(heading) {
  var btn = document.createElement('button'); btn.className = 'copy-inline always-show'; btn.textContent = '📋';
  btn.addEventListener('click', function(e) { e.stopPropagation(); var level = heading.tagName; var parts = []; var el = heading;
    while (el) { parts.push(el.textContent.trim()); el = el.nextElementSibling; if (!el) break; var tag = el.tagName; if (tag === 'H1') break; if (level === 'H2' && tag === 'H2') break; if (level === 'H3' && (tag === 'H2' || tag === 'H3')) break; }
    copyToClipboard(parts.join('\n\n')).then(function() { btn.textContent = '✓'; btn.classList.add('copied'); setTimeout(function() { btn.textContent = '📋'; btn.classList.remove('copied'); }, 1500); });
  }); return btn;
}

function addCopyButton(pre) {
  pre.querySelectorAll('.copy-btn').forEach(function(b) { b.remove(); });
  var btn = document.createElement('button'); btn.className = 'copy-btn'; btn.innerHTML = '📋 复制';
  btn.addEventListener('click', function() { copyToClipboard(pre.textContent || '').then(function() { btn.innerHTML = '✓ 已复制'; btn.classList.add('copied'); setTimeout(function() { btn.innerHTML = '📋 复制'; btn.classList.remove('copied'); }, 2000); }); });
  pre.style.position = 'relative'; pre.appendChild(btn);
}

function renderMarkdown(text) {
  var html = escapeHtml(text);
  var codeBlocks = [];
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, function(_, lang, code) { codeBlocks.push('<pre>' + escapeHtml(code.trimEnd()) + '</pre>'); return '\x00CODE' + (codeBlocks.length - 1) + '\x00'; });
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/^\|(.+)\|\s*\n\|[-| :]+\|\s*\n((?:^\|.+\|\s*\n?)+)/gm, function(match, header, rows) {
    var hcells = header.split('|').filter(function(c) { return c.trim(); });
    var thead = '<tr>' + hcells.map(function(c) { return '<th>' + c.trim() + '</th>'; }).join('') + '</tr>';
    var tbody = ''; var rlines = rows.trim().split('\n');
    for (var ri = 0; ri < rlines.length; ri++) { var rcells = rlines[ri].split('|').filter(function(c) { return c.trim(); }); tbody += '<tr>' + rcells.map(function(c) { return '<td>' + c.trim() + '</td>'; }).join('') + '</tr>'; }
    return '<div class="table-wrap"><table>' + thead + tbody + '</table></div>';
  });
  html = html.replace(/^---+\s*$/gm, '<hr>').replace(/^\*\*\*+\s*$/gm, '<hr>');
  html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>').replace(/^### (.+)$/gm, '<h3>$1</h3>').replace(/^## (.+)$/gm, '<h2>$1</h2>').replace(/^# (.+)$/gm, '<h1>$1</h1>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>');
  var blocks = html.split('\n\n'); var result = [];
  for (var b = 0; b < blocks.length; b++) {
    var block = blocks[b].trim(); if (!block) continue;
    if (/^<(h[1-4]|hr|pre|div|blockquote|ul|ol|table)/.test(block) || block.indexOf('\x00CODE') === 0) { result.push(block); continue; }
    if (block.indexOf('&gt; ') === 0) { var lines = block.split('\n'); var quotes = []; for (var q = 0; q < lines.length; q++) { quotes.push(lines[q].indexOf('&gt; ') === 0 ? lines[q].replace('&gt; ', '') : lines[q]); } result.push('<blockquote>' + quotes.join('<br>') + '</blockquote>'); continue; }
    if (/^- /.test(block)) { var items = block.split('\n').filter(function(l) { return /^- /.test(l); }); result.push('<ul>' + items.map(function(li) { return '<li>' + li.replace(/^- /, '') + '</li>'; }).join('') + '</ul>'); continue; }
    if (/^\d+\. /.test(block)) { var oitems = block.split('\n').filter(function(l) { return /^\d+\. /.test(l); }); result.push('<ol>' + oitems.map(function(li) { return '<li>' + li.replace(/^\d+\. /, '') + '</li>'; }).join('') + '</ol>'); continue; }
    result.push('<p>' + block.split('\n').join('<br>') + '</p>');
  }
  html = result.join('\n');
  html = html.replace(/\x00CODE(\d+)\x00/g, function(_, i) { return codeBlocks[parseInt(i)]; });
  return html;
}

function scrollToBottom() { requestAnimationFrame(function() { var area = document.getElementById('chatArea'); if (area) area.scrollTop = area.scrollHeight; }); }

function clearChat() {
  messages = []; settings.persona = 'auto'; saveSettingsToStorage(); saveMessagesToStorage();
  setActiveChip('#mePersona', 'auto');
  document.getElementById('chatArea').innerHTML = '<div class="chat-empty" id="chatEmpty"><div class="chat-empty-icon">💬</div><div class="chat-empty-text">选择一种创作场景开始，或在下方输入你的需求</div><div class="chat-empty-cards" id="chatEmptyCards"></div></div>';
  renderScenarioCards(); updateStatusBar();
  updateAccountUI();
}

// ============================================================
// SCENARIO CARDS
// ============================================================
function renderScenarioCards() {
  var container = document.getElementById('chatEmptyCards'); if (!container) return;
  var biz = settings.bizName || '这个领域';
  var vl = getVideoLengthInfo(settings.videoLength);
  var typeDetail = vl.label + '短视频';

  var groups = {};
  for (var i = 0; i < TOPIC_SCENARIOS.length; i++) { var s = TOPIC_SCENARIOS[i]; if (!groups[s.topicType]) groups[s.topicType] = []; groups[s.topicType].push(s); }

  var html = '<div class="topic-gen-card" id="topicGenCard"><div class="topic-gen-icon">✨</div><div class="topic-gen-body"><div class="topic-gen-title">让我帮你分析「' + escapeHtml(biz) + '」，生成爆款选题</div><div class="topic-gen-desc">AI 会根据你的业务特点，推荐最适合的选题方向和具体角度</div></div><div class="topic-gen-arrow">→</div></div>';

  var groupKeys = Object.keys(groups);
  for (var g = 0; g < groupKeys.length; g++) {
    var topicType = groupKeys[g]; var items = groups[topicType];
    var meta = TOPIC_TYPE_META[topicType] || { color:'#999', bg:'rgba(255,255,255,.05)', tag:'', tip:'' };
    html += '<div class="topic-group"><div class="topic-group-header"><span class="topic-group-icon" style="background:' + meta.bg + ';color:' + meta.color + '">' + (items[0].topicIcon || '') + '</span><span class="topic-group-name" style="color:' + meta.color + '">' + topicType + '</span><span class="topic-group-tag">' + meta.tag + '</span></div><div class="topic-group-tip">' + meta.tip + '</div><div class="topic-group-cards">';
    for (var j = 0; j < items.length; j++) {
      var s = items[j]; var p = PERSONAS[s.persona]; var desc = s.desc.replace('{biz}', biz);
      var firstMsg = '我要做一个关于' + biz + '的' + typeDetail + '，选题类型：' + topicType + '，切入角度：' + s.label + '，用人设「' + p.name + '」的风格来创作。帮我生成完整的分镜脚本和画面提示词。';
      html += '<div class="scenario-card" data-persona="' + s.persona + '" data-first-msg="' + escapeHtml(firstMsg) + '"><div class="sc-card-top"><span class="sc-card-icon">' + p.icon + '</span><span class="sc-card-name">' + s.label + '</span><span class="sc-card-persona">' + p.name + '视角</span></div><div class="sc-card-desc">' + desc + '</div></div>';
    }
    html += '</div></div>';
  }
  container.innerHTML = html;

  var genCard = document.getElementById('topicGenCard');
  if (genCard) { genCard.addEventListener('click', function() { if (!settings.apiKey) { switchTab('tabMe'); return; } switchTab('tabHome'); setTimeout(function() { sendMessage('请帮我分析「' + biz + '」这个领域的' + typeDetail + '内容，推荐5个具体的爆款选题。'); }, 150); }); }
}

// ============================================================
// COPY MODE — 复制同款视频
// ============================================================
function enterCopyMode() {
  if (!settings.apiKey) { switchTab('tabMe'); setTimeout(function() { document.getElementById('meApiKey').focus(); document.getElementById('meApiKey').scrollIntoView({behavior:'smooth'}); }, 200); return; }
  switchTab('tabRemix');
}

function parseLink() {
  var input = document.getElementById('remixInput').value.trim();
  if (!input) return;
  var btn = document.getElementById('btnParseLink');

  if (btn.classList.contains('clear-mode')) {
    document.getElementById('remixInput').value = '';
    btn.textContent = '🔍 解析链接'; btn.classList.remove('clear-mode');
    document.getElementById('copyChatArea').classList.remove('open');
    document.getElementById('copyChatArea').innerHTML = '';
    document.getElementById('copyGenerateRow').style.display = 'none';
    return;
  }

  btn.textContent = '⏳ 解析中…'; btn.disabled = true;

  var isUrl = /^https?:\/\//.test(input) || /douyin\.com/i.test(input) || /jimeng/i.test(input);

  if (isUrl) {
    // Try to fetch the link content first
    addCopyChatMessage('system', '🔍 正在获取链接内容…');
    fetchLinkContent(input, function(fetchErr, content) {
      if (fetchErr || !content) {
        btn.textContent = '🗑 清空'; btn.classList.add('clear-mode'); btn.disabled = false;
        addCopyChatMessage('error', '无法获取链接内容。\n\n可能原因：\n1. 平台限制外部访问\n2. 链接需要登录才能查看\n\n💡 建议：直接粘贴视频的文案/脚本文字，一样可以分析。');
        return;
      }
      doAnalyze(content, false);
    });
  } else {
    doAnalyze(input, false);
  }

  function doAnalyze(content, wasUrl) {
    var analysisPrompt = buildCopyAnalysisPrompt(content, wasUrl);
    sendCopyAnalysisRequest(analysisPrompt, function(err, result) {
    btn.classList.remove('clear-mode'); btn.disabled = false;
    if (err) {
      addCopyChatMessage('error', '解析失败：' + err + '\n\n请检查链接是否正确，或尝试直接粘贴视频脚本文本。');
      btn.textContent = '🗑 清空'; btn.classList.add('clear-mode');
      return;
    }
    copyAnalysisResult = result;
    document.getElementById('copyChatArea').classList.add('open');
    addCopyChatMessage('assistant', result);
    addCopyChatMessage('system', '✅ 分析完成！你可以输入调整意见（如"换个钩子""加上本地案例"），然后点击「✨ 生成脚本」进行改写。');
    document.getElementById('copyGenerateRow').style.display = 'flex';
    btn.textContent = '🔄 重新解析';
  });
}
}

function addCopyChatMessage(role, content) {
  var chatArea = document.getElementById('copyChatArea');
  if (!chatArea.classList.contains('open')) chatArea.classList.add('open');
  var div = document.createElement('div');
  div.className = 'msg ' + (role === 'user' ? 'user' : 'assistant');
  var icon = role === 'user' ? '👤' : role === 'error' ? '⚠️' : role === 'system' ? '💬' : '✨';
  div.innerHTML = '<div class="msg-avatar">' + icon + '</div><div class="msg-body"><div class="msg-content">' + renderMarkdown(content) + '</div></div>';
  chatArea.appendChild(div); chatArea.scrollTop = chatArea.scrollHeight;
}

function fetchLinkContent(url, callback) {
  // AbortSignal.timeout fallback for older browsers
  function fetchWithTimeout(u, ms) {
    var ctrl = new AbortController();
    var timer = setTimeout(function() { ctrl.abort(); }, ms);
    return fetch(u, { signal: ctrl.signal }).finally(function() { clearTimeout(timer); });
  }
  // Try direct fetch first — many public sites allow CORS
  fetchWithTimeout(url, 8000)
    .then(function(r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.text();
    })
    .then(function(html) {
      var text = extractTextFromHtml(html);
      if (text.length < 50 || /^Error/i.test(text) || /not found/i.test(text)) {
        throw new Error('no usable content');
      }
      callback(null, text.slice(0, 4000));
    })
    .catch(function() {
      // Fallback: try corsproxy.io
      var proxyUrl = 'https://corsproxy.io/?' + encodeURIComponent(url);
      fetchWithTimeout(proxyUrl, 8000)
        .then(function(r) { if (!r.ok) throw new Error('proxy failed'); return r.text(); })
        .then(function(html) {
          var text = extractTextFromHtml(html);
          if (text.length < 50 || /^Error/i.test(text)) { callback('无法获取链接内容，请直接粘贴视频脚本文本', null); return; }
          callback(null, text.slice(0, 4000));
        })
        .catch(function(e) { callback('无法获取链接内容（链接可能需要登录或平台限制外部访问）。\n💡 建议直接粘贴视频的文案/脚本文字，分析效果一样好。', null); });
    });
}

function extractTextFromHtml(html) {
  // Remove scripts, styles, and get visible text
  var text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x2F;/g, '/')
    .replace(/&nbsp;/g, ' ');
  // Remove excessive whitespace
  text = text.replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim();
  return text;
}

function buildCopyAnalysisPrompt(input, isUrl) {
  return '你是一个爆款短视频分析师。请分析以下' + (isUrl ? '视频文案内容' : '视频脚本内容') + '，用表格和结构化格式输出：\n\n---\n' + input + '\n---\n\n' +
    '请严格按以下格式输出：\n\n' +
    '## 📊 基本信息\n\n' +
    '| 项目 | 内容 |\n|------|------|\n| 选题类型 | |\n| 视频时长 | |\n| 核心信息点 | |\n\n' +
    '## 🎣 钩子分析\n\n' +
    '| 项目 | 内容 |\n|------|------|\n| 钩子类型 | 数据反差型 / 提问式 / 警示型 / 意外型 / 权威型 |\n| 钩子文案 | 前3秒具体说了什么 |\n| 为什么有效 | 从心理学角度解释 |\n\n' +
    '## 📐 结构拆解\n\n' +
    '| 时间段 | 内容功能 | 画面要点 |\n|--------|---------|----------|\n| 0-3秒 | | |\n| 3-7秒 | | |\n| 7-11秒 | | |\n| 11-15秒 | | |\n\n' +
    '## 🎭 观众心理轨迹\n\n' +
    '分析每一阶段观众的反应：看到了什么 → 脑中在想什么 → 情绪是什么。\n\n' +
    '| 时间段 | 观众看到 | 心理活动 | 情绪 |\n|--------|---------|----------|------|\n| 0-3秒 | | | 好奇 / 困惑 / 震惊 / 好笑 |\n| 3-7秒 | | | |\n| 7-11秒 | | | |\n| 11-15秒 | | | |\n\n' +
    '## 📈 情绪曲线\n\n说明整体的情绪变化轨迹（如：好奇→意外→震惊→释放→行动冲动）\n\n' +
    '## 💬 心理触发词\n\n提取原文中使用的心理触发词，说明每个词的作用\n\n' +
    '## ✅ 成功因素\n\n| # | 因素 | 为什么有效 |\n|---|------|-----------|\n| 1 | | |\n| 2 | | |\n| 3 | | |\n\n' +
    '## 🔧 可改进点\n\n| # | 问题 | 建议 |\n|---|------|------|\n| 1 | | |\n| 2 | | |\n\n' +
    '## 📋 可复制元素\n\n| # | 元素 | 如何迁移到其他业务 |\n|---|------|-------------------|\n| 1 | | |\n| 2 | | |\n| 3 | | |';
}

function sendCopyAnalysisRequest(analysisPrompt, callback) {
  var endpoint = settings.endpoint.replace(/\/$/, '');
  var modelName = settings.model === 'custom' ? settings.customModel : settings.model;
  if (!settings.apiKey) { callback('请先在「我的」Tab 中配置 API Key', null); return; }

  fetch(endpoint + '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + settings.apiKey },
    body: JSON.stringify({ model: modelName, messages: [{ role:'system', content:'你是短视频分析师，擅长拆解爆款视频结构和技巧。' }, { role:'user', content:analysisPrompt }], stream: false, temperature: 0.5, max_tokens: 2048 })
  }).then(function(r) {
    if (!r.ok) return r.text().then(function(t) { callback('请求失败 (' + r.status + ')', null); });
    return r.json();
  }).then(function(data) {
    if (!data) return;
    var content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    callback(null, content || '（未获取到分析结果）');
  }).catch(function(e) { callback(e.message, null); });
}

function generateCopyScript() {
  if (!copyAnalysisResult) return;
  var adjustInput = document.getElementById('copyAdjustInput').value.trim();
  var biz = settings.bizName || '这个领域';
  var lang = settings.language === 'custom' ? (settings.customLanguage || '普通话') : settings.language;
  var subtitlesOn = document.getElementById('copySubtitleToggle').checked;
  var bgmOn = document.getElementById('copyBgmToggle').checked;
  settings.subtitleEnabled = subtitlesOn;
  settings.bgmEnabled = bgmOn;
  saveSettingsToStorage();

  var prompt = '## 改写任务\n\n### 原始视频分析\n' + copyAnalysisResult + '\n\n' +
    '### 我的情况\n- 业务：' + biz + '\n- 业务范围：' + settings.bizScope + '\n- 语言：' + lang + '\n' +
    (settings.userProfile ? '- 个人介绍：' + settings.userProfile + '\n' : '') +
    '- 人设风格：' + (PERSONAS[settings.persona] ? PERSONAS[settings.persona].name : '智能推荐') + '\n' +
    '- 字幕：' + (subtitlesOn ? '需要字幕' : '不需要字幕') + '\n' +
    '- BGM：' + (bgmOn ? '需要BGM' : '不需要BGM') + '\n\n';

  if (adjustInput) prompt += '### 调整要求\n' + adjustInput + '\n\n';

  prompt += '请基于原始视频的成功元素，结合我的情况，生成改写版的短视频脚本。\n\n' +
    '要求：\n1. 复用原视频的钩子模式和结构框架，内容替换为我的业务\n2. 用我的人设风格和语言来创作\n3. 输出完整即梦提示词（含分镜表+生成参数+字幕）\n4. 严格遵守去AI味规则\n' +
    (buildCharacterAnchor() ? '5. 每段画面描述必须包含角色锚点：' + buildCharacterAnchor() + '\n' : '5. 需要定义角色形象\n') +
    (buildSceneAnchor('remix') ? '6. 每段画面描述必须包含场景描述：' + buildSceneAnchor('remix') + '\n' : '');

  prompt += '\n生成脚本后，请紧接着进行自检：\n\n## 🔍 自检评分\n\n| 维度 | 评分 | 问题 | 改进建议 |\n|------|------|------|----------|\n' +
    '| 钩子强度 | /5 | | |\n| 前3秒留存力 | /5 | | |\n| 情绪曲线 | /5 | | |\n| 台词口语化 | /5 | | |\n' +
    '| 画面可执行性 | /5 | | |\n| 人设匹配度 | /5 | | |\n| 信息密度 | /5 | | |\n| 反差感 | /5 | | |\n| 转发冲动 | /5 | | |\n| AI味检测 | /5 | | |\n| **总分** | **/50** | | |\n\n' +
    '### AI味检测标准\n- 禁用书面词（首先其次最后/综上所述/值得注意的是/与此同时/因此/从而）→ 扣2分/个\n- 排比句 → 扣1分/组\n- 平均句长>20字 → 扣1分\n- 每段语气词<2个 → 扣1分\n\n输出优化版脚本（修正得分≤3的维度）。';

  addCopyChatMessage('system', '⏳ 正在生成改写版脚本…');
  updateStatusBar('生成中…');
  isGenerating = true; updateSendButton(); updateStopButton();
  abortController = new AbortController();

  var modelName = settings.model === 'custom' ? settings.customModel : settings.model;
  fetch(settings.endpoint.replace(/\/$/, '') + '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + settings.apiKey },
    body: JSON.stringify({ model: modelName, messages: [{ role:'system', content: buildSystemPrompt() }, { role:'user', content: prompt }], stream: false, temperature: 0.7, max_tokens: 4096 }),
    signal: abortController.signal
  }).then(function(r) {
    if (!r.ok) return r.text().then(function(t) { throw new Error('请求失败 (' + r.status + '): ' + t.slice(0, 200)); });
    return r.json();
  }).then(function(data) {
    var content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    addCopyChatMessage('assistant', content || '（未获取到生成结果）');
    addCopyChatMessage('system', '✅ 脚本生成完毕！可继续输入调整意见后再次点击「✨ 生成脚本」。');
    var genTitle = extractTopicTitles(content); if (genTitle.length > 0) { for (var gti = 0; gti < genTitle.length; gti++) saveScriptToHistory(genTitle[gti]); } else { saveScriptToHistory(content.slice(0, 50)); } renderScriptHistory();
    document.getElementById('copyAdjustInput').value = '';
    isGenerating = false; abortController = null; updateSendButton(); updateStopButton(); updateStatusBar();
  updateAccountUI();
  }).catch(function(err) {
    if (err.name === 'AbortError') { addCopyChatMessage('system', '⏹ 已停止生成'); }
    else { addCopyChatMessage('error', '生成失败：' + (err.message || '未知错误')); }
    isGenerating = false; abortController = null; updateSendButton(); updateStopButton(); updateStatusBar();
  updateAccountUI();
  });
}

// ============================================================
// API CALL — Chat mode
// ============================================================
function sendMessage(text) {
  if (!text || !settings.apiKey || isGenerating) return;
  isGenerating = true; updateSendButton(); updateStopButton();
  addMessage('user', text);
  var assistantMsg = addStreamingMessage();
  var isKeywordGen = !!(/分析.*推荐.*选题|推荐.*选题|生成.*选题|帮我.*选题/.test(text) && /选题/.test(text));
  assistantMsg._isKeywordGen = isKeywordGen;
  var finalText = text;

  if (settings.searchEnabled && settings.bizName && /选题|推荐|趋势|热点|蓝海|SEO|搜索|关键词|爆款/.test(text)) {
    updateStatusBar('正在搜索…');
    performWebSearch(settings.bizName).then(function(sd) {
      if (sd) finalText = text + '\n\n---\n## 联网搜索到的真实搜索趋势\n\n' + sd;
      doApiCall(finalText, isKeywordGen, assistantMsg);
    }).catch(function() { doApiCall(text, isKeywordGen, assistantMsg); });
  } else { doApiCall(text, isKeywordGen, assistantMsg); }
}

function doApiCall(text, isKeywordGen, assistantMsg) {
  updateStatusBar('生成中…');
  var systemPrompt = isKeywordGen ? buildKeywordSystemPrompt() : buildSystemPrompt();
  var modelName = settings.model === 'custom' ? settings.customModel : settings.model;

  var apiMessages = [{ role: 'system', content: systemPrompt }];
  for (var i = 0; i < messages.length; i++) { var m = messages[i]; if (!m._streaming) apiMessages.push({ role: m.role, content: m.content }); }

  abortController = new AbortController();
  fetch(settings.endpoint.replace(/\/$/, '') + '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + settings.apiKey },
    body: JSON.stringify({ model: modelName, messages: apiMessages, stream: true, temperature: 0.7, max_tokens: 4096 }),
    signal: abortController.signal
  }).then(function(response) {
    if (!response.ok) return response.text().then(function(errText) { throw new Error('API 请求失败 (' + response.status + '): ' + errText.slice(0, 200)); });
    return handleStream(response, assistantMsg);
  }).catch(function(err) {
    if (err.name === 'AbortError') { handleAbort(assistantMsg); return; }
    handleApiError(assistantMsg, err);
  });
}

function handleStream(response, assistantMsg) {
  var reader = response.body.getReader(); var decoder = new TextDecoder(); var buffer = '';
  function pump() { return reader.read().then(function(result) { if (result.done) { if (buffer.trim()) processLine(buffer.trim(), assistantMsg); finishStreaming(assistantMsg); return; } buffer += decoder.decode(result.value, { stream:true }); var lines = buffer.split('\n'); buffer = lines.pop() || ''; for (var i = 0; i < lines.length; i++) processLine(lines[i], assistantMsg); return pump(); }).catch(function(err) { if (err.name !== 'AbortError') handleApiError(assistantMsg, err); }); }
  return pump();
}

function processLine(line, assistantMsg) {
  var trimmed = line.trim(); if (!trimmed || !trimmed.startsWith('data:')) return;
  var data = trimmed.slice(5).trim(); if (data === '[DONE]') return;
  try { var json = JSON.parse(data); var delta = json.choices && json.choices[0] && json.choices[0].delta; if (delta && delta.content) appendStreamToken(assistantMsg, delta.content); } catch(e) {}
}

function handleAbort(assistantMsg) {
  assistantMsg._streaming = false;
  if (!assistantMsg.content) assistantMsg.content = '（已停止生成）';
  assistantMsg._html = renderMarkdown(assistantMsg.content);
  if (assistantMsg._contentEl) { assistantMsg._contentEl.innerHTML = assistantMsg._html; assistantMsg._contentEl.querySelectorAll('pre').forEach(function(pre) { addCopyButton(pre); }); }
  assistantMsg._done = true; saveMessagesToStorage(); updateStatusBar('已停止生成');
  isGenerating = false; abortController = null; updateSendButton(); updateStopButton();
}

function handleApiError(assistantMsg, err) {
  assistantMsg._streaming = false;
  var errorText = err.message || '未知错误';
  assistantMsg.content = '**出错了：** ' + errorText;
  if (errorText.indexOf('401') !== -1) assistantMsg.content += '\n\n> API Key 可能无效，请检查设置。';
  else if (errorText.indexOf('404') !== -1) assistantMsg.content += '\n\n> 接口地址可能不对。';
  else if (errorText.indexOf('Failed to fetch') !== -1 || errorText.indexOf('NetworkError') !== -1) assistantMsg.content += '\n\n> 网络请求失败。';
  assistantMsg._html = renderMarkdown(assistantMsg.content);
  if (assistantMsg._contentEl) { assistantMsg._contentEl.innerHTML = assistantMsg._html; assistantMsg._contentEl.querySelectorAll('pre').forEach(function(pre) { addCopyButton(pre); }); }
  assistantMsg._done = true; saveMessagesToStorage(); updateStatusBar('出错了 — ' + errorText.slice(0, 80));
  isGenerating = false; abortController = null; updateSendButton(); updateStopButton();
}

function stopGeneration() { if (abortController) abortController.abort(); }

// ============================================================
// WEB SEARCH
// ============================================================
function fetchWithTimeout(url, timeoutMs) {
  return new Promise(function(resolve, reject) {
    var controller = new AbortController(); var timer = setTimeout(function() { controller.abort(); reject(new Error('timeout')); }, timeoutMs);
    fetch(url, { signal: controller.signal }).then(function(r) { clearTimeout(timer); resolve(r); }).catch(function(e) { clearTimeout(timer); reject(e); });
  });
}
function searchSuggestions(query) {
  return fetchWithTimeout('https://duckduckgo.com/ac/?q=' + encodeURIComponent(query) + '&type=list', 3000)
    .then(function(r) { return r.json(); }).then(function(data) { return (data && data.length > 1 && Array.isArray(data[1])) ? data[1] : []; }).catch(function() { return []; });
}
function performWebSearch(bizName) {
  var queries = [bizName, bizName + ' 怎么', bizName + ' 推荐', bizName + ' 避坑', bizName + ' 攻略', bizName + ' 2026'];
  return Promise.race([Promise.all(queries.map(function(q) { return searchSuggestions(q); })), new Promise(function(resolve) { setTimeout(function() { resolve([]); }, 3500); })])
    .then(function(results) {
      if (!Array.isArray(results) || results.length === 0) return '';
      var all = [], seen = {};
      for (var i = 0; i < results.length; i++) { var s = results[i]; if (!Array.isArray(s)) continue; for (var j = 0; j < s.length; j++) { if (!seen[s[j]]) { seen[s[j]] = true; all.push(s[j]); } } }
      if (all.length === 0) return '';
      var f = '真实搜索关键词：\n'; for (var k = 0; k < Math.min(all.length, 20); k++) f += '- ' + all[k] + '\n';
      return f + '\n请基于这些真实搜索词找蓝海关键词生成选题。';
    });
}

// ============================================================
// ONBOARDING — mandatory multi-step guide
// ============================================================
var oboStep = 1;
var oboTotal = 2;

function showOnboarding() {
  if (localStorage.getItem('zimeiti-v3-onboarding-done') === '1') return;
  oboStep = 1;
  document.getElementById('onboardingPage').classList.remove('hidden');
  updateOboUI();
}

function updateOboUI() {
  document.querySelectorAll('#oboSteps .obo-dot').forEach(function(d, i) {
    d.classList.remove('active', 'done');
    if (i + 1 < oboStep) d.classList.add('done');
    if (i + 1 === oboStep) d.classList.add('active');
  });
  document.querySelectorAll('#oboSteps .obo-line').forEach(function(l, i) {
    l.classList.toggle('done', i + 1 < oboStep);
  });
  document.querySelectorAll('#oboDotsMob .obo-dot-m').forEach(function(d, i) {
    d.classList.toggle('active', i + 1 === oboStep);
  });
  document.querySelectorAll('.obo-panel').forEach(function(p) { p.classList.remove('active'); });
  var panel = document.getElementById('oboPanel' + oboStep);
  if (panel) panel.classList.add('active');
  document.getElementById('btnOboPrev').style.visibility = oboStep === 1 ? 'hidden' : 'visible';
  document.getElementById('btnOboNext').textContent = oboStep >= oboTotal ? '✨ 开始使用' : '下一步 →';
}

function oboNext() {
  if (oboStep === 1) {
    var bizName = document.getElementById('oboBizName').value.trim();
    if (!bizName) {
      document.getElementById('oboBizName').style.borderColor = '#e57373';
      document.getElementById('oboBizName').focus();
      return;
    }
    document.getElementById('oboBizName').style.borderColor = '';
    settings.bizName = bizName;
    var scopeEl = document.querySelector('#oboBizScope .chip.active');
    if (scopeEl) settings.bizScope = scopeEl.dataset.value;
    saveSettingsToStorage();
  }
  if (oboStep === 2) {
    var genderEl = document.querySelector('#oboCharGender .chip.active');
    var gender = genderEl ? genderEl.dataset.value : '';
    var clothing = document.getElementById('oboCharClothing').value.trim();
    var valid = true;
    if (!gender) {
      document.querySelectorAll('#oboCharGender .chip').forEach(function(c) { c.style.borderColor = '#e57373'; });
      valid = false;
    }
    if (!clothing) {
      document.getElementById('oboCharClothing').style.borderColor = '#e57373';
      document.getElementById('oboCharClothing').focus();
      valid = false;
    }
    if (!valid) return;
    document.querySelectorAll('#oboCharGender .chip').forEach(function(c) { c.style.borderColor = ''; });
    document.getElementById('oboCharClothing').style.borderColor = '';
    var ch = {
      id: generateId(),
      name: document.getElementById('oboCharName').value.trim() || '主角',
      type: 'protagonist',
      gender: gender,
      clothing: clothing,
      age: '', hair: '', build: '', features: '', relationship: ''
    };
    characterProfiles.push(ch);
    saveCharacterProfiles();
  }
  if (oboStep >= oboTotal) { finishOnboarding(); return; }
  oboStep++;
  updateOboUI();
}

function oboPrev() {
  if (oboStep <= 1) return;
  oboStep--;
  updateOboUI();
}

function finishOnboarding() {
  document.getElementById('onboardingPage').classList.add('hidden');
  localStorage.setItem('zimeiti-v3-onboarding-done', '1');
  applyAllSettings();
  renderCharacterCards(); renderRemixCharacterCards();
  renderSceneCards(); renderRemixSceneCards();
  renderCharacterList();
  updateAccountUI();
  switchTab('tabHome');
}

// Onboarding event listeners
document.getElementById('btnOboNext').addEventListener('click', oboNext);
document.getElementById('btnOboPrev').addEventListener('click', oboPrev);
document.querySelector('#oboBizScope').addEventListener('click', function(e) {
  var chip = e.target.closest('.chip');
  if (!chip) return;
  this.querySelectorAll('.chip').forEach(function(c) { c.classList.remove('active'); });
  chip.classList.add('active');
});
document.querySelector('#oboCharGender').addEventListener('click', function(e) {
  var chip = e.target.closest('.chip');
  if (!chip) return;
  this.querySelectorAll('.chip').forEach(function(c) { c.classList.remove('active'); c.style.borderColor = ''; });
  chip.classList.add('active');
});
// Enter key advances onboarding
document.getElementById('onboardingPage').addEventListener('keydown', function(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); oboNext(); }
});

// ============================================================
// EVENTS
// ============================================================
function bindEvents() {
  document.querySelectorAll('.tab-item').forEach(function(item) { item.addEventListener('click', function() { switchTab(this.dataset.tab); }); });

  // Sub-tabs in 我的 page
  document.querySelectorAll('.me-subtab').forEach(function(item) {
    item.addEventListener('click', function() {
      document.querySelectorAll('.me-subtab').forEach(function(t) { t.classList.remove('active'); });
      document.querySelectorAll('.me-subpanel').forEach(function(p) { p.classList.remove('active'); });
      this.classList.add('active');
      document.getElementById(this.dataset.subtab).classList.add('active');
    });
  });

  // "我的" Tab — chip clicks
  document.querySelectorAll('#tabMe .chip-row').forEach(function(group) {
    group.addEventListener('click', function(e) { var chip = e.target.closest('.chip'); if (!chip) return; group.querySelectorAll('.chip').forEach(function(c) { c.classList.remove('active'); }); chip.classList.add('active'); syncMeToSettings(); renderScenarioCards(); });
  });

  // "我的" Tab — inputs
  ['meCustomLanguage','meUserProfile','meApiKey','meEndpoint','meCustomModel'].forEach(function(id) {
    var el = document.getElementById(id); if (el) el.addEventListener('input', syncMeToSettings);
  });
  document.getElementById('meLanguage').addEventListener('change', function() { var r = document.getElementById('meCustomLangRow'); if (r) r.style.display = this.value==='custom'?'block':'none'; syncMeToSettings(); });
  var pSel = document.getElementById('mePersonaSelect'); if (pSel) pSel.addEventListener('change', syncMeToSettings);
  document.getElementById('meModel').addEventListener('change', function() { var f = document.getElementById('meCustomModelField'); if (f) f.style.display = this.value==='custom'?'block':'none'; syncMeToSettings(); });
  var _el=document.getElementById('meWebSearch'); if(_el) _el.addEventListener('change', syncMeToSettings);

  // Logout
  var _el=document.getElementById('btnLogout'); if(_el) _el.addEventListener('click', async function() {
    if (!confirm('确定退出登录？')) return;
    if (typeof sbSignOut !== 'undefined') { try { await sbSignOut(); } catch(e) {} }
    sbUser = null;
    document.getElementById('loginPage').classList.remove('hidden');
  });

  var _el=document.getElementById('btnResetAll'); if(_el) _el.addEventListener('click', function() {
    if (!confirm('确定恢复默认设置？将清除所有个人资料和形象。')) return;
    settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS)); characterProfiles = [];
    saveSettingsToStorage(); saveCharacterProfiles();
    applyAllSettings(); renderCharacterCards(); renderRemixCharacterCards(); renderCharacterList();
  });

  // Settings overlay
  var _el=document.getElementById('btnMeSettings'); if(_el) _el.addEventListener('click', function() {
    document.getElementById('meApiKey').value = settings.apiKey;
    document.getElementById('meEndpoint').value = settings.endpoint;
    document.getElementById('meModel').value = settings.model;
    document.getElementById('meCustomModel').value = settings.customModel || '';
    document.getElementById('meCustomModelField').style.display = settings.model === 'custom' ? 'block' : 'none';
    document.getElementById('meUserProfile').value = settings.userProfile || '';
    document.getElementById('settingsOverlay').classList.add('open');
    if (typeof sbUser !== 'undefined' && sbUser) sbSaveApiConfig();
  });
  var _el=document.getElementById('btnSettingsClose'); if(_el) _el.addEventListener('click', function() {
    document.getElementById('settingsOverlay').classList.remove('open');
  });
  var _el=document.getElementById('settingsOverlay'); if(_el) _el.addEventListener('click', function(e) {
    if (e.target === this) document.getElementById('settingsOverlay').classList.remove('open');
  });

  // Biz name save button
  var btnSaveBiz = document.getElementById('btnSaveBizName');
  var bizInput = document.getElementById('meBizName');
  bizInput.addEventListener('input', function() {
    btnSaveBiz.classList.add('changed');
    btnSaveBiz.textContent = '保存';
  });
  btnSaveBiz.addEventListener('click', function() {
    settings.bizName = bizInput.value.trim();
    saveSettingsToStorage();
    renderScenarioCards();
    updateStatusBar();
  updateAccountUI();
    btnSaveBiz.classList.remove('changed');
    btnSaveBiz.classList.add('saved');
    btnSaveBiz.textContent = '✓ 已保存';
    setTimeout(function() { btnSaveBiz.classList.remove('saved'); btnSaveBiz.textContent = '保存'; }, 1500);
  });

  // Profile save button
  var profileInput = document.getElementById('meUserProfile');
  var btnSaveProfile = document.getElementById('btnSaveProfile');
  var hintEl = document.getElementById('profileSaveHint');
  btnSaveProfile.addEventListener('click', function() {
    settings.userProfile = profileInput.value.trim();
    saveSettingsToStorage();
    hintEl.textContent = '✓ 已保存';
    updateProfilePreviewOnMePage();
    setTimeout(function() { hintEl.textContent = ''; }, 2000);
  });

  // Update profile preview on me page
  updateProfilePreviewOnMePage();

  // Script history
  renderScriptHistory();

  // Character editor
  var _el=document.getElementById('btnCharEditorClose'); if(_el) _el.addEventListener('click', closeCharacterEditor);
  var _el=document.getElementById('btnCharCancel'); if(_el) _el.addEventListener('click', closeCharacterEditor);
  var _el=document.getElementById('btnCharSave'); if(_el) _el.addEventListener('click', saveCharacterFromDialog);
  var _el=document.getElementById('btnCharDelete'); if(_el) _el.addEventListener('click', deleteCharacterFromDialog);
  var _el=document.getElementById('charEditorOverlay'); if(_el) _el.addEventListener('click', function(e) { if (e.target===this) closeCharacterEditor(); });
  document.querySelector('#charEditType').addEventListener('click', function(e) { var chip=e.target.closest('.chip'); if(!chip)return; this.querySelectorAll('.chip').forEach(function(c){c.classList.remove('active');}); chip.classList.add('active'); updateCharEditorTypeFields(); });
  document.querySelector('#charEditGender').addEventListener('click', function(e) { var chip=e.target.closest('.chip'); if(!chip)return; this.querySelectorAll('.chip').forEach(function(c){c.classList.remove('active');}); chip.classList.add('active'); });

  // Stop
  var _el=document.getElementById('btnStop'); if(_el) _el.addEventListener('click', stopGeneration);

  // Create tab
  var _el=document.getElementById('btnGenerate'); if(_el) _el.addEventListener('click', function() {
    if (!settings.apiKey) { switchTab('tabMe'); setTimeout(function() { document.getElementById('meApiKey').focus(); document.getElementById('meApiKey').scrollIntoView({behavior:'smooth'}); }, 200); return; }
    var text = document.getElementById('createInput').value.trim(); if (!text) return;
    document.getElementById('createInput').value = '';
    switchTab('tabHome'); setTimeout(function() { sendMessage(text); }, 150);
  });

  var _el=document.getElementById('btnParseLink'); if(_el) _el.addEventListener('click', parseLink);
  var _el=document.getElementById('remixInput'); if(_el) _el.addEventListener('keydown', function(e) { if (e.key==='Enter'&&!e.shiftKey){e.preventDefault();parseLink();} });
  var _el=document.getElementById('btnCopyGenerate'); if(_el) _el.addEventListener('click', generateCopyScript);
  var _el=document.getElementById('copyAdjustInput'); if(_el) _el.addEventListener('keydown', function(e) { if (e.key==='Enter'&&!e.shiftKey){e.preventDefault();generateCopyScript();} });

  // Keyboard
  document.addEventListener('keydown', function(e) { if (e.key==='Escape') { if (document.getElementById('charEditorOverlay').classList.contains('open')) closeCharacterEditor(); } });

  // Chat area clicks
  var _el=document.getElementById('chatArea'); if(_el) _el.addEventListener('click', function(e) {
    var chip = e.target.closest('.keyword-chip');
    if (chip) { chip.classList.toggle('active'); var wrap=chip.closest('.keyword-chips-wrap'); wrap.querySelector('.generate-topics-btn').disabled = !wrap.querySelectorAll('.keyword-chip.active').length; return; }
    var genBtn = e.target.closest('.generate-topics-btn');
    if (genBtn && !genBtn.disabled) { var w=genBtn.closest('.keyword-chips-wrap'); var sel=[]; w.querySelectorAll('.keyword-chip.active').forEach(function(c){sel.push(c.dataset.keyword);}); w.remove(); generateTopicsFromKeywords(sel); return; }
    var card = e.target.closest('.scenario-card'); if (!card) return;
    if (!settings.apiKey) { switchTab('tabMe'); return; }
    settings.persona = card.dataset.persona; saveSettingsToStorage(); var pSel = document.getElementById('mePersonaSelect'); if (pSel) pSel.value = settings.persona;
    switchTab('tabHome'); setTimeout(function() { sendMessage(card.dataset.firstMsg); }, 150);
  });
}

// ============================================================
// STATUS BAR
// ============================================================
function updateStatusBar(msg) {
  var bar = document.getElementById('statusBar'); if (!bar) return;
  if (msg) { bar.textContent = msg; bar.classList.toggle('error', msg.indexOf('出错')!==-1||msg.indexOf('失败')!==-1); return; }
  bar.classList.remove('error');
  bar.textContent = !settings.apiKey ? '就绪 — 请在「我的」中配置 API Key' : settings.bizName ? '就绪 — ' + settings.bizName + ' · 短视频' : '就绪';
}


  // Login page handlers
  function dismissLoginPage() {
    document.getElementById('loginPage').classList.add('hidden');
    showOnboarding();
  }

  document.getElementById('btnSkipLogin').addEventListener('click', function() {
    dismissLoginPage();
  });

  // Login tab switching
  var loginMode = 'login';
  document.querySelectorAll('.login-tab').forEach(function(tab) {
    tab.addEventListener('click', function() {
      loginMode = this.dataset.mode;
      document.querySelectorAll('.login-tab').forEach(function(t) { t.classList.remove('active'); });
      this.classList.add('active');
      document.getElementById('btnLogin').textContent = loginMode === 'login' ? '登录' : '注册';
      document.getElementById('loginError').style.display = 'none';
    });
  });

  document.getElementById('btnLogin').addEventListener('click', async function() {
    var username = document.getElementById('loginEmail').value.trim();
    var email = username.includes('@') ? username : username + '@user.app';
    var pass = document.getElementById('loginPassword').value;
    var errEl = document.getElementById('loginError');
    errEl.style.color = '#e57373';
    if (!email || pass.length < 6) {
      errEl.textContent = !email ? '请输入邮箱' : '密码至少6位';
      errEl.style.display = 'block'; return;
    }
    try {
      errEl.style.display = 'none';
      if (loginMode === 'register') {
        await sbSignUp(email, pass);
        errEl.textContent = '✓ 注册成功！已自动登录';
        errEl.style.color = '#5b9a8b'; errEl.style.display = 'block';
      } else {
        await sbSignIn(email, pass);
      }
      await loadAllFromCloud();
      applyAllSettings();
      renderCharacterCards(); renderRemixCharacterCards();
      renderSceneCards(); renderRemixSceneCards();
      renderCharacterList();
      updateStatusBar(); updateAccountUI(); renderScriptHistory();
      setTimeout(dismissLoginPage, loginMode === 'register' ? 500 : 0);
    } catch(e) {
      errEl.textContent = (loginMode === 'register' ? '注册' : '登录') + '失败：' + (e.message || '请检查邮箱和密码');
      errEl.style.color = '#e57373'; errEl.style.display = 'block';
    }
  });
  var _el=document.getElementById('btnAuthLogin'); if(_el) _el.addEventListener('click', async function() {
    var email = document.getElementById('authEmail').value.trim();
    var pass = document.getElementById('authPassword').value;
    var errEl = document.getElementById('authError');
    try {
      errEl.style.display = 'none';
      await sbSignIn(email, pass);
      await loadAllFromCloud();
      applyAllSettings();
      renderCharacterCards();
      renderRemixCharacterCards();
      renderSceneCards();
      renderRemixSceneCards();
      renderCharacterList();
      updateStatusBar();
  updateAccountUI();
      renderScriptHistory();
      document.getElementById('authOverlay').classList.remove('open');
      updateAccountUI();
    } catch(e) { errEl.textContent = '登录失败：' + (e.message || '邮箱或密码错误'); errEl.style.display = 'block'; }
  });
  var _el=document.getElementById('btnAuthRegister'); if(_el) _el.addEventListener('click', async function() {
    var email = document.getElementById('authEmail').value.trim();
    var pass = document.getElementById('authPassword').value;
    var errEl = document.getElementById('authError');
    if (pass.length < 6) { errEl.textContent = '密码至少6位'; errEl.style.display = 'block'; return; }
    try {
      errEl.style.display = 'none';
      await sbSignUp(email, pass);
      document.getElementById('authTitle').textContent = '✓ 注册成功，请查收验证邮件';
      errEl.textContent = '已发送确认邮件到 ' + email;
      errEl.style.color = '#5b9a8b';
      errEl.style.display = 'block';
    } catch(e) { errEl.textContent = '注册失败：' + (e.message || '邮箱可能已注册'); errEl.style.color = '#e57373'; errEl.style.display = 'block'; }
  });

  // Load all cloud data after login
  async function loadAllFromCloud() {
    if (!sb) return;
    try { await sbLoadProfile(); } catch(e) {}
    try { await sbLoadApiConfig(); } catch(e) {}
    try { await sbLoadCharacters(); } catch(e) {}
    try { await sbLoadScenes(); } catch(e) {}
    try {
      var history = await sbLoadScriptHistory();
      if (history && history.length > 0) {
        try { localStorage.setItem('zimeiti-v3-script-history', JSON.stringify(history)); } catch(e) {}
      }
    } catch(e) {}
    saveSettingsToStorage();
    saveCharacterProfiles();
    saveSceneProfiles();
  }

  // Update account UI
  function updateAccountUI() {
    var avatar = document.getElementById('meAvatar');
    var statusEl = document.getElementById('accountStatusText');
    if (typeof sbUser !== 'undefined' && sbUser) {
      if (avatar) {
        avatar.textContent = (sbUser.email || 'U').charAt(0).toUpperCase();
        avatar.style.background = 'linear-gradient(135deg,#5b9a8b,#3d7a6e)';
      }
      if (statusEl) {
        statusEl.textContent = '☁️ ' + sbUser.email;
        statusEl.style.color = '#7bb8a6';
        statusEl.style.cursor = 'default';
        statusEl.onclick = null;
      }
    } else {
      if (statusEl) {
        statusEl.textContent = '🔑 登录 / 注册 — 云端同步数据';
        statusEl.style.color = '#b5aca0';
        statusEl.style.cursor = 'pointer';
        statusEl.onclick = function() { showAuth(); };
      }
    }
    updateProfilePreviewOnMePage();
  }

  // Check existing session on startup (supabase.js loads async, may not be ready)
  if (typeof sbGetSession !== 'undefined') {
    sbGetSession().then(function(session) {
    if (session) {
      sbUser = session.user;
      loadAllFromCloud().then(function() {
        applyAllSettings();
        renderCharacterCards();
        renderRemixCharacterCards();
        renderSceneCards();
        renderRemixSceneCards();
        renderCharacterList();
        updateStatusBar();
  updateAccountUI();
        renderScriptHistory();
        updateAccountUI();
      });
    }
  });
  }

  // Override save functions to also sync to cloud
  var _origSaveSettings = saveSettingsToStorage;
  saveSettingsToStorage = function() {
    _origSaveSettings();
    if (typeof sbUser !== 'undefined' && sbUser) sbSaveProfile();
  };

  // Override character save
  var _origSaveChar = saveCharacterProfiles;
  saveCharacterProfiles = function() {
    _origSaveChar();
    // Individual character saves are handled in sbSaveCharacter
  };

  // Override scene save
  var _origSaveScene = saveSceneProfiles;
  saveSceneProfiles = function() {
    _origSaveScene();
    // Individual scene saves are handled in sbSaveScene
  };

  // Override script history save
  var _origSaveScript = saveScriptToHistory;
  saveScriptToHistory = function(title) {
    _origSaveScript(title);
    if (typeof sbUser !== 'undefined' && sbUser) sbSaveScriptToHistory(title);
  };

  // Override script history load
  var _origLoadScript = loadScriptHistory;
  loadScriptHistory = async function() {
    if (typeof sbUser !== 'undefined' && sbUser) {
      var cloud = await sbLoadScriptHistory();
      if (cloud.length > 0) return cloud;
    }
    return _origLoadScript();
  };


// ============================================================
// STARTUP
// ============================================================
init();

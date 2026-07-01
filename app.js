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
  customModel: '',
  bizName: ''
};

var INTERVIEW_QUESTIONS = [
  '这个视频一开头是什么画面？前3秒你看到了什么？有哪些特别抓人眼球的地方？',
  '视频里有谁？几个人？各自穿着打扮什么样？有什么标志性特征？',
  '他们在做什么动作？从头到尾情节是怎么变化的？每一步发生了什么？',
  '在什么地方拍的？环境氛围怎么样？光线、时间、背景有什么特点？',
  '你记住了哪句台词？或者大致讲了什么话？语气是什么样的？',
  '你觉得这个视频最打动人的地方是什么？为什么你会记住它？你觉得观众看完会有什么反应？'
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
  if (tabId === 'tabMe') {
    document.getElementById('meBizName').value = settings.bizName || '';
  }
}

// ============================================================
// SETTINGS SYNC
// ============================================================
function applyAllSettings() {
  var el;
  el = document.getElementById('meBizName'); if (el) el.value = settings.bizName || '';
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
    html += '<div class="mgr-item-avatar">' + (ch.type === 'protagonist' ? '👤' : '👥') + '</div>';
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

function openCharacterEditor(charId) {
  editingCharId = charId || null;
  var ch = charId ? findCharById(charId) : null;
  document.getElementById('charEditorTitle').textContent = ch ? '编辑形象' : '新建形象';
  document.getElementById('charEditName').value = ch ? ch.name : '';
  document.getElementById('charEditClothing').value = ch ? ch.clothing : '';
  document.getElementById('charEditAge').value = ch ? ch.age || '' : '';
  document.getElementById('charEditHair').value = ch ? ch.hair || '' : '';
  document.getElementById('charEditBuild').value = ch ? ch.build || '' : '';
  document.getElementById('charEditFeatures').value = ch ? ch.features || '' : '';
  document.getElementById('charEditRelationship').value = ch ? ch.relationship || '' : '';

  var type = ch ? ch.type : 'protagonist';
  document.querySelectorAll('#charEditType .chip').forEach(function(c) { c.classList.toggle('active', c.dataset.value === type); });
  var gender = ch ? ch.gender : '';
  document.querySelectorAll('#charEditGender .chip').forEach(function(c) { c.classList.toggle('active', c.dataset.value === gender); });
  updateCharEditorTypeFields();

  document.getElementById('btnCharDelete').style.display = ch ? 'block' : 'none';
  document.getElementById('charEditorOverlay').classList.add('open');
}

function closeCharacterEditor() {
  document.getElementById('charEditorOverlay').classList.remove('open');
  editingCharId = null;
}

function updateCharEditorTypeFields() {
  var activeType = document.querySelector('#charEditType .chip.active');
  var isSupporting = activeType && activeType.dataset.value === 'supporting';
  document.getElementById('charEditRelationshipField').style.display = isSupporting ? 'block' : 'none';
}

function saveCharacterFromDialog() {
  var name = document.getElementById('charEditName').value.trim() || '未命名';
  var typeEl = document.querySelector('#charEditType .chip.active');
  var type = typeEl ? typeEl.dataset.value : 'protagonist';
  var genderEl = document.querySelector('#charEditGender .chip.active');
  var gender = genderEl ? genderEl.dataset.value : '';
  var clothing = document.getElementById('charEditClothing').value.trim();

  if (!gender) { alert('请选择性别'); return; }
  if (!clothing) { alert('请填写服装'); return; }

  var ch = {
    id: editingCharId || generateId(),
    name: name,
    type: type,
    gender: gender,
    clothing: clothing,
    age: document.getElementById('charEditAge').value.trim(),
    hair: document.getElementById('charEditHair').value.trim(),
    build: document.getElementById('charEditBuild').value.trim(),
    features: document.getElementById('charEditFeatures').value.trim(),
    relationship: document.getElementById('charEditRelationship').value.trim()
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
    html += '<div class="mgr-item-detail">' + escapeHtml(s.description || '') + '</div></div>';
    html += '<div class="mgr-item-actions">';
    html += '<button onclick="deleteSceneFromManager(\'' + s.id + '\')" style="color:#e57373">删除</button>';
    html += '</div></div>';
  });
  container.innerHTML = html;
  updateAccountUI();
}

function addSceneFromManager() {
  var name = document.getElementById('newSceneName2').value.trim();
  var desc = document.getElementById('newSceneDesc2').value.trim();
  if (!name) { alert('请输入场景名称'); return; }
  var s = { id: generateId(), name: name, description: desc };
  sceneProfiles.push(s);
  saveSceneProfiles();
  if (typeof sbSaveScene !== 'undefined') sbSaveScene(s);
  document.getElementById('newSceneName2').value = '';
  document.getElementById('newSceneDesc2').value = '';
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
// ONBOARDING
// ============================================================
var oboStep = 1;
var oboTotal = 2;

function showOnboarding() {
  if (localStorage.getItem('zimeiti-v3-onboarding-done') === '1' || settings.bizName) {
    if (settings.bizName) localStorage.setItem('zimeiti-v3-onboarding-done', '1');
    return;
  }
  oboStep = 1;
  document.getElementById('oboBizName').value = '';
  document.getElementById('oboCharClothing').value = '';
  document.getElementById('oboCharName').value = '';
  document.querySelectorAll('#oboCharGender .chip').forEach(function(c) { c.classList.remove('active'); });
  document.getElementById('onboardingPage').classList.remove('hidden');
  updateOboUI();
}

function updateOboUI() {
  document.querySelectorAll('#oboSteps .obo-dot').forEach(function(d, i) {
    d.classList.remove('active', 'done');
    if (i + 1 < oboStep) d.classList.add('done');
    if (i + 1 === oboStep) d.classList.add('active');
  });
  document.querySelectorAll('#oboSteps .obo-line').forEach(function(l, i) { l.classList.toggle('done', i + 1 < oboStep); });
  document.querySelectorAll('#oboDotsMob .obo-dot-m').forEach(function(d, i) { d.classList.toggle('active', i + 1 === oboStep); });
  document.querySelectorAll('.obo-panel').forEach(function(p) { p.classList.remove('active'); });
  var panel = document.getElementById('oboPanel' + oboStep);
  if (panel) panel.classList.add('active');

  document.getElementById('btnOboPrev').style.visibility = oboStep === 1 ? 'hidden' : 'visible';
  document.getElementById('btnOboNext').textContent = oboStep >= oboTotal ? '✨ 开始使用' : '下一步 →';
}

function oboNext() {
  if (oboStep === 1) {
    var bizName = document.getElementById('oboBizName').value.trim();
    if (!bizName) { document.getElementById('oboBizName').style.borderColor = '#e57373'; return; }
    document.getElementById('oboBizName').style.borderColor = '';
    settings.bizName = bizName;
    saveSettingsToStorage();
  }
  if (oboStep === 2) {
    var genderEl = document.querySelector('#oboCharGender .chip.active');
    var gender = genderEl ? genderEl.dataset.value : '';
    var clothing = document.getElementById('oboCharClothing').value.trim();
    if (!gender) { document.querySelectorAll('#oboCharGender .chip').forEach(function(c) { c.style.borderColor = '#e57373'; }); return; }
    if (!clothing) { document.getElementById('oboCharClothing').style.borderColor = '#e57373'; return; }
    var ch = {
      id: generateId(), name: document.getElementById('oboCharName').value.trim() || '主角',
      type: 'protagonist', gender: gender, clothing: clothing,
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

async function finishOnboarding() {
  document.getElementById('onboardingPage').classList.add('hidden');
  localStorage.setItem('zimeiti-v3-onboarding-done', '1');
  if (typeof sbUser !== 'undefined' && sbUser) {
    try { await sbSaveProfile(); } catch(e) {}
  }
  applyAllSettings();
  renderCharacterList();
  updateAccountUI();
  switchTab('tabStoryboard');
  initInterview();
}

// ============================================================
// LOGIN / AUTH
// ============================================================
function dismissLoginPage() {
  document.getElementById('loginPage').classList.add('hidden');
  showOnboarding();
  if (document.getElementById('onboardingPage').classList.contains('hidden')) {
    switchTab('tabStoryboard');
    initInterview();
  }
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
    settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    characterProfiles = [];
    sceneProfiles = [];
    if (mode !== 'register') localStorage.removeItem('zimeiti-v3-onboarding-done');
    await loadAllFromCloud();
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
  if (currentStoryboard) return; // already have a storyboard
  interviewStep = 0;
  interviewAnswers = [];
  renderInterview();
}

function renderInterview() {
  var el = document.getElementById('sbInterview');
  var board = document.getElementById('sbBoard');
  if (!el || !board) return;

  if (interviewStep >= INTERVIEW_QUESTIONS.length) {
    // All questions answered, generate
    generateStoryboard();
    return;
  }

  el.style.display = 'flex';
  board.style.display = 'none';

  document.getElementById('sbQuestion').textContent = INTERVIEW_QUESTIONS[interviewStep];

  // Restore previous answer if going back
  var prev = interviewAnswers[interviewStep];
  document.getElementById('sbAnswer').value = prev ? prev.answer : '';

  document.getElementById('btnPrevQ').disabled = interviewStep === 0;
  document.getElementById('btnNextQ').textContent = interviewStep >= INTERVIEW_QUESTIONS.length - 1 ? '✨ 生成故事板' : '下一步 →';

  renderInterviewProgress();
}

function renderInterviewProgress() {
  var container = document.getElementById('sbProgress');
  if (!container) return;
  var html = '<div class="sb-progress-list">';
  for (var i = 0; i < INTERVIEW_QUESTIONS.length; i++) {
    var cls = interviewAnswers[i] && interviewAnswers[i].answer ? 'done' : '';
    var label = interviewAnswers[i] && interviewAnswers[i].answer ? '✓' : (i + 1);
    html += '<span class="sb-progress-item ' + cls + '">' + label + ' 第' + (i + 1) + '题</span>';
  }
  html += '</div>';
  container.innerHTML = html;
}

function nextQuestion() {
  var answer = document.getElementById('sbAnswer').value.trim();
  interviewAnswers[interviewStep] = { question: INTERVIEW_QUESTIONS[interviewStep], answer: answer };
  interviewStep++;
  if (interviewStep >= INTERVIEW_QUESTIONS.length) {
    generateStoryboard();
  } else {
    renderInterview();
  }
}

function prevQuestion() {
  // Save current answer before going back
  var answer = document.getElementById('sbAnswer').value.trim();
  interviewAnswers[interviewStep] = { question: INTERVIEW_QUESTIONS[interviewStep], answer: answer };
  if (interviewStep > 0) {
    interviewStep--;
    renderInterview();
  }
}

function skipQuestion() {
  interviewAnswers[interviewStep] = { question: INTERVIEW_QUESTIONS[interviewStep], answer: '' };
  interviewStep++;
  if (interviewStep >= INTERVIEW_QUESTIONS.length) {
    generateStoryboard();
  } else {
    renderInterview();
  }
}

// ============================================================
// VOICE INPUT
// ============================================================
var recognition = null;
var isRecording = false;

function setupVoiceRecognition() {
  var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return;
  recognition = new SpeechRecognition();
  recognition.lang = 'zh-CN';
  recognition.continuous = true;
  recognition.interimResults = true;

  recognition.onresult = function(event) {
    var transcript = '';
    for (var i = event.resultIndex; i < event.results.length; i++) {
      transcript += event.results[i][0].transcript;
    }
    var el = document.getElementById('sbAnswer');
    if (el) el.value = transcript;
  };

  recognition.onend = function() {
    isRecording = false;
    var btn = document.getElementById('btnVoice');
    var hint = document.getElementById('voiceHint');
    if (btn) btn.classList.remove('recording');
    if (hint) hint.textContent = '点击麦克风开始说话';
  };

  recognition.onerror = function(event) {
    isRecording = false;
    var btn = document.getElementById('btnVoice');
    var hint = document.getElementById('voiceHint');
    if (btn) btn.classList.remove('recording');
    if (event.error === 'not-allowed' || event.error === 'permission-denied') {
      if (hint) hint.textContent = '麦克风权限未授权，请用文字输入';
      if (btn) btn.disabled = true;
    } else {
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
      recognition.start();
      isRecording = true;
      if (btn) btn.classList.add('recording');
      if (hint) hint.textContent = '正在聆听…再点停止';
    } catch(e) {
      if (hint) hint.textContent = '启动语音失败，请用文字输入';
    }
  } else {
    recognition.stop();
    isRecording = false;
    if (btn) btn.classList.remove('recording');
    if (hint) hint.textContent = '点击麦克风开始说话';
  }
}

// ============================================================
// STORYBOARD — GENERATION
// ============================================================
function buildStoryboardSystemPrompt() {
  var charList = characterProfiles.map(function(c) {
    return '- ' + c.id + ': ' + c.name + ' (' + c.type + ', ' + [c.gender, c.clothing, c.age, c.hair, c.build, c.features].filter(Boolean).join(', ') + ')';
  }).join('\n');
  var sceneList = sceneProfiles.map(function(s) {
    return '- ' + s.id + ': ' + s.name + ' (' + (s.description || '') + ')';
  }).join('\n');

  return '你是短视频导演助手，根据用户对爆款视频的描述，输出完整的导演分镜表JSON。\n\n' +
    '## 输出JSON结构\n' +
    '{\n' +
    '  "title": "视频标题",\n' +
    '  "totalDuration": "30s",\n' +
    '  "bizName": "' + (settings.bizName || '') + '",\n' +
    '  "directorBrief": {\n' +
    '    "coreIdea": "核心创意一句话",\n' +
    '    "targetEmotion": "好奇→向往→信任→冲动",\n' +
    '    "hookType": "反问型/悬念型/共鸣型/反差型",\n' +
    '    "videoStyle": "日系生活美学/欧美大片/国潮...",\n' +
    '    "creativeAngle": "创意思路简述"\n' +
    '  },\n' +
    '  "rhythmMap": [\n' +
    '    {"timeRange":"0-5s","label":"钩子","tempo":"快速/中速/慢速","purpose":"抓住注意力","cutsPerSec":0.5}\n' +
    '  ],\n' +
    '  "emotionCurve": [\n' +
    '    {"timeRange":"0-5s","emotion":"🤔 疑惑","intensity":8,"trigger":"触发点描述"}\n' +
    '  ],\n' +
    '  "audienceReaction": {\n' +
    '    "targetAudience": "目标人群描述",\n' +
    '    "painPoint": "痛点",\n' +
    '    "desiredAction": "期望用户做的行动",\n' +
    '    "beforeWatching": "看之前的认知状态",\n' +
    '    "afterWatching": "看之后的认知状态",\n' +
    '    "whyItWorks": ["为什么有效1","为什么有效2"]\n' +
    '  },\n' +
    '  "shots": [\n' +
    '    {\n' +
    '      "id":"shot_1","duration":"0-5s","shotType":"近景/特写/中景/全景/远景",\n' +
    '      "camera":{"movement":"慢推镜 dolly in","focalLength":"85mm","aperture":"f/2.0","angle":"平视"},\n' +
    '      "subjects":[{"characterId":"char_xxx","characterName":"角色名","position":"画面中央","scale":"近景/中景/远景","direction":"面朝左方","additionalDesc":"补充描述"}],\n' +
    '      "action":"动作描述","scene":{"sceneId":"scene_xxx","sceneName":"场景名","environment":"环境","atmosphere":"氛围","background":"背景虚化描述"},\n' +
    '      "lighting":{"type":"暖色侧逆光","keyLight":"主灯","fillLight":"补光","direction":"左上方45°","highlights":"高光特征","shadows":"阴影特征"},\n' +
    '      "style":{"visualStyle":"视觉风格","colorTone":"色调","texture":"质感"},\n' +
    '      "quality":{"resolution":"4K","fps":60,"motionBlur":"动态模糊说明","postProcess":"后期处理"},\n' +
    '      "dialogue":"台词","emotionBeat":"🎭 情绪节点","notes":"导演备注"\n' +
    '    }\n' +
    '  ]\n' +
    '}\n\n' +
    '## 输出要求\n' +
    '1. 每镜必填7要素：subjects/action/scene/lighting/camera/style/quality/dialogue\n' +
    '2. 第2镜起每镜必填continuity对象：{"transition":"硬切/叠化/甩镜头/匹配剪辑","carryOver":["延续元素"],"newElements":["新元素"],"eyeLine":"视线衔接","actionLink":"动作因果","emotionLink":"情绪变化","cameraLink":"运镜对比"}\n' +
    '3. 镜头数4-8个，覆盖全片时长\n' +
    '4. subjects中的characterId引用可用角色库的ID，scene中的sceneId引用场景库的ID。如果没有匹配的角色/场景，用描述性文字，characterId/sceneId留空\n' +
    '5. 台词口语化，禁用书面语（首先、其次、综上所述、值得注意的是）\n' +
    '6. 句长≤20字/句，每段至少2个语气词（吧/嘛/哈/呢/啊）\n' +
    '7. 纯JSON输出，不要```json```包裹，不要任何前缀和后缀\n\n' +
    '## 当前可用资源\n' +
    '业务：' + (settings.bizName || '未设置') + '\n' +
    '角色库：\n' + (charList || '（空，用描述性文字）') + '\n' +
    '场景库：\n' + (sceneList || '（空，用描述性文字）') + '\n';
}

function buildStoryboardPrompt() {
  var qa = '';
  interviewAnswers.forEach(function(a, i) {
    if (a && a.answer) qa += 'Q: ' + a.question + '\nA: ' + a.answer + '\n\n';
  });

  return '## 用户描述的爆款视频（问答形式）\n\n' + qa +
    '\n请根据以上信息，输出完整的导演分镜表JSON。';
}

async function generateStoryboard() {
  if (currentStoryboard) {
    // Regenerating: keep interview answers in case user wants to change
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

  isGenerating = true;
  updateStopButton();

  // Hide interview, show loading in board area
  document.getElementById('sbInterview').style.display = 'none';
  document.getElementById('sbBoard').style.display = 'flex';
  document.getElementById('sbBoard').innerHTML = '<div style="text-align:center;padding:60px 20px;color:#8a8278"><div style="font-size:2rem;margin-bottom:12px">🎬</div><div>AI 正在生成导演分镜表…</div></div>';

  try {
    var systemPrompt = buildStoryboardSystemPrompt();
    var userPrompt = buildStoryboardPrompt();
    var streamText = await doStoryboardApiCall(systemPrompt, userPrompt);
    var jsonText = collectStreamJson(streamText);
    if (!jsonText) throw new Error('未能从AI响应中解析JSON');
    currentStoryboard = JSON.parse(jsonText);
    renderStoryboard();
  } catch(e) {
    document.getElementById('sbBoard').innerHTML =
      '<div style="text-align:center;padding:40px 20px;color:#e57373">' +
      '<div style="font-size:2rem;margin-bottom:12px">⚠️</div>' +
      '<div>生成失败：' + escapeHtml(e.message || '未知错误') + '</div>' +
      '<button class="dialog-btn primary" onclick="resetToInterview()" style="margin-top:16px">🔄 重新开始</button>' +
      '</div>';
  }

  isGenerating = false;
  updateStopButton();
}

function collectStreamJson(text) {
  // Remove markdown code fence
  var cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  // Try to find the outermost JSON object
  var start = cleaned.indexOf('{');
  var end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) return null;
  var jsonText = cleaned.slice(start, end + 1);
  // Quick validation
  try { JSON.parse(jsonText); return jsonText; } catch(e) {
    // Try to fix trailing commas
    var fixed = jsonText.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
    try { JSON.parse(fixed); return fixed; } catch(e2) { return null; }
  }
}

async function doStoryboardApiCall(systemPrompt, userPrompt) {
  abortController = new AbortController();
  var messages = [
    { role: 'system', content: '[System Prompt]\n' + systemPrompt },
    { role: 'user', content: userPrompt }
  ];

  var resp = await fetch(settings.endpoint + '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + settings.apiKey },
    body: JSON.stringify({
      model: settings.model === 'custom' ? settings.customModel : settings.model,
      messages: messages,
      stream: true,
      temperature: 0.7,
      max_tokens: 4096
    }),
    signal: abortController.signal
  });

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

  while (true) {
    var _a = await reader.read(), done = _a.done, value = _a.value;
    if (done) break;
    var chunk = decoder.decode(value, { stream: true });
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
  }
  return fullText;
}

function stopGeneration() {
  if (abortController) { abortController.abort(); abortController = null; }
  isGenerating = false;
  updateStopButton();
}

// ============================================================
// STORYBOARD — RENDER
// ============================================================
function renderStoryboard() {
  var board = document.getElementById('sbBoard');
  var sb = currentStoryboard.storyboard || currentStoryboard;
  if (!sb) return;

  var title = sb.title || '未命名';
  var db = sb.directorBrief || {};
  var ar = sb.audienceReaction || {};

  var html = '';

  // Director section
  html += '<div class="sb-section">';
  html += '<div class="sb-section-header" id="btnToggleDirector"><span>🎬 导演分析 — ' + escapeHtml(title) + '</span><span class="sb-section-toggle">▾</span></div>';
  html += '<div class="sb-section-body" id="sbDirectorBody">';

  // Director brief
  html += '<div class="sb-director-brief">';
  html += '<p><span class="ds-label">核心创意：</span>' + escapeHtml(db.coreIdea || '') + '</p>';
  html += '<p><span class="ds-label">目标情绪：</span>' + escapeHtml(db.targetEmotion || '') + '</p>';
  html += '<p><span class="ds-label">钩子类型：</span>' + escapeHtml(db.hookType || '') + '</p>';
  html += '<p><span class="ds-label">视频风格：</span>' + escapeHtml(db.videoStyle || '') + '</p>';
  html += '</div>';

  // Rhythm map
  var rhythmMap = sb.rhythmMap || [];
  if (rhythmMap.length) {
    var colors = ['#5b9a8b','#6bae9e','#7dc2b1','#8fd6c4','#a1ead7'];
    html += '<div class="sb-rhythm-bar">';
    rhythmMap.forEach(function(r, i) {
      var pct = r.timeRange || '';
      html += '<div class="sb-rhythm-segment" style="flex:1;background:' + (colors[i % colors.length]) + '" title="' + escapeHtml(pct + ': ' + (r.tempo || '') + ' - ' + (r.purpose || '')) + '">' + escapeHtml(r.label || pct) + '</div>';
    });
    html += '</div>';
  }

  // Emotion curve
  var emotionCurve = sb.emotionCurve || [];
  if (emotionCurve.length) {
    html += '<div class="sb-emotion-curve">';
    emotionCurve.forEach(function(e) {
      var h = (e.intensity || 5) * 7;
      html += '<div class="sb-emotion-bar" style="height:' + h + 'px;background:#5b9a8b" title="' + escapeHtml((e.timeRange || '') + ': ' + (e.emotion || '') + ' - ' + (e.trigger || '')) + '"><span class="emotion-label">' + escapeHtml(e.timeRange || '') + '</span></div>';
    });
    html += '</div>';
  }

  // Audience reaction
  html += '<div class="sb-audience">';
  html += '<div class="audience-item"><span class="audience-label">目标人群：</span>' + escapeHtml(ar.targetAudience || '') + '</div>';
  html += '<div class="audience-item"><span class="audience-label">痛点：</span>' + escapeHtml(ar.painPoint || '') + '</div>';
  html += '<div class="audience-item"><span class="audience-label">看之前：</span>' + escapeHtml(ar.beforeWatching || '') + '</div>';
  html += '<div class="audience-item"><span class="audience-label">看之后：</span>' + escapeHtml(ar.afterWatching || '') + '</div>';
  if (ar.whyItWorks && ar.whyItWorks.length) {
    html += '<div class="audience-item"><span class="audience-label">为什么有效：</span>';
    ar.whyItWorks.forEach(function(w) { html += '<div style="padding-left:12px">• ' + escapeHtml(w) + '</div>'; });
    html += '</div>';
  }
  html += '</div>';

  html += '</div></div>'; // end director section

  // Shot cards
  html += '<div class="sb-section">';
  html += '<div class="sb-section-header"><span>🎥 分镜脚本</span></div>';
  html += '<div class="sb-section-body"><div class="sb-shot-list" id="sbShotList">';

  var shots = sb.shots || [];
  shots.forEach(function(shot, i) {
    html += renderOneShotCard(shot, i);
    // Continuity bar between shots (skip after last)
    if (i < shots.length - 1 && shot.continuity) {
      html += renderContinuityBar(shot.continuity);
    }
  });

  html += '</div>';
  html += '<button class="sb-add-shot-btn" id="btnSbAddShot">+ 新增镜头</button>';
  html += '</div></div>';

  // Actions
  html += '<div class="sb-actions-bar">';
  html += '<button class="dialog-btn secondary" onclick="replaceAllCharacters()">🔄 替换形象</button>';
  html += '<button class="dialog-btn secondary" onclick="replaceAllScenes()">🔄 替换场景</button>';
  html += '<button class="dialog-btn secondary" onclick="resetToInterview()">🔄 重新生成</button>';
  html += '<button class="dialog-btn primary" onclick="exportStoryboardPrompts()">📋 复制提示词</button>';
  html += '<button class="dialog-btn secondary" onclick="exportStoryboardJson()">📋 复制JSON</button>';
  html += '</div>';

  board.innerHTML = html;

  // Bind director toggle
  var toggleBtn = document.getElementById('btnToggleDirector');
  if (toggleBtn) {
    toggleBtn.onclick = function() {
      var body = document.getElementById('sbDirectorBody');
      var arrow = this.querySelector('.sb-section-toggle');
      if (body.style.display === 'none') { body.style.display = 'block'; if (arrow) arrow.textContent = '▾'; }
      else { body.style.display = 'none'; if (arrow) arrow.textContent = '▸'; }
    };
  }

  // Bind add shot button
  var addBtn = document.getElementById('btnSbAddShot');
  if (addBtn) addBtn.onclick = addShot;

  board.style.display = 'flex';
}

function renderOneShotCard(shot, index) {
  var subjects = (shot.subjects || []).map(function(s) { return s.characterName || '未知'; }).join(', ');
  var camera = shot.camera ? (shot.camera.movement || '') : '';
  var dialogue = shot.dialogue || '';

  var html = '<div class="sb-shot-card">';
  html += '<div class="sb-shot-card-header">';
  html += '<span class="shot-num">' + (index + 1) + '</span>';
  html += '<span>' + escapeHtml(shot.duration || '') + '</span>';
  html += '<span style="color:#8a8278">' + escapeHtml(shot.shotType || '') + '</span>';
  if (shot.emotionBeat) html += '<span style="font-size:.72rem">' + escapeHtml(shot.emotionBeat) + '</span>';
  html += '</div>';

  html += '<div class="sb-shot-card-body">';
  html += '<div class="sb-shot-row"><span class="shot-icon">👤</span><span>' + escapeHtml(subjects || '(未指定)') + '</span></div>';
  html += '<div class="sb-shot-row"><span class="shot-icon">🎥</span><span>' + escapeHtml(camera || '(未指定)') + '</span></div>';
  if (dialogue) html += '<div class="sb-shot-dialogue">💬 ' + escapeHtml(dialogue) + '</div>';
  html += '</div>';

  html += '<div class="sb-shot-card-actions">';
  html += '<button class="sb-shot-edit" onclick="openShotEditor(' + index + ')">✏️ 编辑</button>';
  if (index > 0) html += '<button onclick="moveShot(' + index + ',-1)">↑</button>';
  if (index < (currentStoryboard.storyboard || currentStoryboard).shots.length - 1) html += '<button onclick="moveShot(' + index + ',1)">↓</button>';
  html += '<button onclick="deleteShot(' + index + ')" style="color:#e57373">🗑</button>';
  html += '</div>';
  html += '</div>';

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
  renderStoryboard();
}

function deleteShot(index) {
  if (!confirm('确定删除第' + (index + 1) + '镜？')) return;
  var sb = currentStoryboard.storyboard || currentStoryboard;
  sb.shots.splice(index, 1);
  // Remove continuity from the first remaining shot if it becomes shot 0
  renderStoryboard();
}

function moveShot(index, direction) {
  var sb = currentStoryboard.storyboard || currentStoryboard;
  var newIdx = index + direction;
  if (newIdx < 0 || newIdx >= sb.shots.length) return;
  var tmp = sb.shots[index];
  sb.shots[index] = sb.shots[newIdx];
  sb.shots[newIdx] = tmp;
  renderStoryboard();
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
  renderStoryboard();
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

  renderStoryboard();
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

  renderStoryboard();
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

  // Biz name save
  var btnSaveBiz = document.getElementById('btnSaveBizName');
  if (btnSaveBiz) btnSaveBiz.addEventListener('click', function() {
    settings.bizName = document.getElementById('meBizName').value.trim();
    saveSettingsToStorage();
    if (typeof sbUser !== 'undefined' && sbUser) sbSaveProfile().catch(function(e) {});
    this.textContent = '已保存'; this.style.color = '#5b9a8b';
    setTimeout(function() { btnSaveBiz.textContent = '保存'; btnSaveBiz.style.color = ''; }, 1500);
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
  document.getElementById('btnSaveApiConfig').addEventListener('click', function() {
    settings.apiKey = document.getElementById('meApiKey').value.trim();
    settings.endpoint = document.getElementById('meEndpoint').value.trim();
    settings.model = document.getElementById('meModel').value;
    settings.customModel = document.getElementById('meCustomModel').value.trim();
    var phone = document.getElementById('mePhone').value.trim();
    saveSettingsToStorage();
    if (typeof sbUser !== 'undefined' && sbUser && phone) {
      // Save phone to profile
      if (/^\d{11}$/.test(phone)) {
        sbSaveProfile().catch(function(e) {});
      }
    }
    if (typeof sbSaveApiConfig !== 'undefined') sbSaveApiConfig();
    var hint = document.getElementById('apiConfigSaveHint');
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

  // Login / Register
  document.getElementById('btnLogin').addEventListener('click', function() { doLoginOrRegister('login'); });
  document.getElementById('btnRegister').addEventListener('click', function() { doLoginOrRegister('register'); });

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
  document.getElementById('btnSkipQ').addEventListener('click', skipQuestion);
  document.getElementById('sbAnswer').addEventListener('keydown', function(e) {
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

  // Char editor type chips
  document.querySelectorAll('#charEditType .chip').forEach(function(c) {
    c.addEventListener('click', function() {
      document.querySelectorAll('#charEditType .chip').forEach(function(x) { x.classList.remove('active'); });
      this.classList.add('active');
      updateCharEditorTypeFields();
    });
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

  // Onboarding
  document.getElementById('btnOboNext').addEventListener('click', oboNext);
  document.getElementById('btnOboPrev').addEventListener('click', oboPrev);
  document.getElementById('oboBizName').addEventListener('keydown', function(e) { if (e.key === 'Enter') oboNext(); });
  document.querySelector('#oboCharGender').addEventListener('click', function(e) {
    var chip = e.target.closest('.chip');
    if (!chip) return;
    this.querySelectorAll('.chip').forEach(function(c) { c.classList.remove('active'); c.style.borderColor = ''; });
    chip.classList.add('active');
  });
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

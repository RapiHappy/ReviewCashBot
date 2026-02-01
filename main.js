// Mock Telegram WebApp for non-Telegram environments
const MockTelegram = {
    WebApp: {
        expand: () => console.log('TG: Expanded'),
        setHeaderColor: (color) => console.log('TG: Header Color', color),
        showAlert: (msg) => alert(msg),
        showConfirm: (msg, cb) => { const r = confirm(msg); if(cb) cb(r); },
        openTelegramLink: (url) => window.open(url, '_blank'),
        sendData: (data) => { 
            console.log('TG: sendData called with', data); 
            alert('DEV MODE: Data sent to bot:\n' + data + '\n\nIn real app, this closes the window.'); 
        },
        ready: () => console.log('TG: Ready'),
        initDataUnsafe: {
            user: {
                id: 123456, // MOCK USER
                username: 'miniapp_user',
                first_name: 'Alex',
                last_name: 'Test',
                // photo_url intentionally left undefined to test fallback
            }
        }
    }
};

// HELPER: Get User Data Safely
function getTgUser() {
    if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initDataUnsafe && window.Telegram.WebApp.initDataUnsafe.user) {
        return window.Telegram.WebApp.initDataUnsafe.user;
    }
    return MockTelegram.WebApp.initDataUnsafe.user;
}

const tg = (window.Telegram && window.Telegram.WebApp) ? window.Telegram.WebApp : MockTelegram.WebApp;

// --- CONFIGURATION ---
const ADMIN_IDS = [6482440657, 123456]; 

const ASSETS = {
    ya: 'https://www.google.com/s2/favicons?sz=64&domain=yandex.ru',
    gm: 'https://www.google.com/s2/favicons?sz=64&domain=google.com',
    tg: 'https://cdn-icons-png.flaticon.com/512/2111/2111646.png'
};

const TG_TASK_TYPES = {
    tg_sub:   { label: 'Подписка на канал',      cost: 30,  reward: 15, icon: '📢', action: 'Подписаться' },
    tg_group: { label: 'Вступление в группу',    cost: 25,  reward: 12, icon: '👥', action: 'Вступить' },
    tg_react: { label: 'Просмотр + Реакция',     cost: 10,  reward: 5,  icon: '❤️', action: 'Смотреть пост' },
    tg_poll:  { label: 'Участие в опросе',       cost: 15,  reward: 7,  icon: '📊', action: 'Голосовать' },
    tg_start: { label: 'Запуск бота /start',     cost: 25,  reward: 12, icon: '🤖', action: 'Запустить' },
    tg_msg:   { label: 'Сообщение боту',         cost: 15,  reward: 7,  icon: '✉️', action: 'Написать' },
    tg_mapp:  { label: 'Открыть Mini App',       cost: 40,  reward: 20, icon: '📱', action: 'Открыть App' },
    tg_hold:  { label: 'Подписка + 24ч',         cost: 60,  reward: 30, icon: '⏳', action: 'Подписаться' },
    tg_invite: { label: 'Инвайт друзей',         cost: 100, reward: 50, icon: '🤝', action: 'Пригласить' },
};

// --- TASK LIMITS ---
const TASK_LIMITS = {
    ya: 3 * 24 * 60 * 60 * 1000, // 3 days
    gm: 1 * 24 * 60 * 60 * 1000  // 1 day
};

// INITIAL STATE
let state = {
    filter: 'all',
    user: { 
        rub: 0, 
        stars: 0,
        xp: 0,
        level: 1
    },
    tasks: [],
    moderation: [],
    history: [],      
    withdrawals: [],  
    referrals: {      
        count: 0,
        earned: 0
    },
    limits: {} // Local cache of limits
};

// Fake Leaderboard Data
const LEADERBOARD_MOCK = [
    { name: 'AlexCrypto', count: 142, earned: 45000 },
    { name: 'Elena_V', count: 98, earned: 21500 },
    { name: 'MaxPower', count: 76, earned: 18000 },
    { name: 'Dimon99', count: 45, earned: 9800 },
    { name: 'User_772', count: 32, earned: 5400 }
];

let isLinkValid = false;
let linkCheckTimer = null;
let selectedProofFile = null;
let activeAdminTab = 'proofs';

// Initialization
document.addEventListener('DOMContentLoaded', async () => {
    if (window.Telegram && window.Telegram.WebApp) {
        if (window.Telegram.WebApp.ready) window.Telegram.WebApp.ready();
        if (window.Telegram.WebApp.expand) window.Telegram.WebApp.expand();
    } else {
        MockTelegram.WebApp.expand();
    }
    
    populateTgTypes();
    setupProfileUI();

    try { await loadData(); } catch(e) { console.error('Data load error', e); }
    
    checkAdmin();
    checkLevelUp(); // Check if initial level is correct

    render();
    updateAdminBadge();
    
    // Remove loader
    const loader = document.getElementById('loader');
    if(loader) {
        loader.classList.add('fade-out');
        setTimeout(() => {
            loader.remove();
            document.querySelector('.app-container').classList.add('anim-active');
        }, 300);
    }
    
    document.querySelectorAll('.overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                closeModal();
            }
        });
    });

    const targetInput = document.getElementById('t-target');
    if(targetInput) {
        targetInput.addEventListener('input', (e) => {
            const val = e.target.value.trim();
            const statusEl = document.getElementById('t-target-status');
            
            clearTimeout(linkCheckTimer);
            isLinkValid = false;
            
            if(!val) {
                statusEl.className = 'input-status';
                statusEl.innerHTML = '';
                return;
            }
            
            statusEl.className = 'input-status visible checking';
            statusEl.innerHTML = '<span class="spin-icon">⏳</span> Проверка ссылки...';
            
            linkCheckTimer = setTimeout(() => {
                const isValid = /^https?:\/\/.+\..+/.test(val) || /^t\.me\/.+/.test(val) || /^[\w-]+\.+[\w-]+/.test(val);
                
                statusEl.className = 'input-status visible ' + (isValid ? 'valid' : 'invalid');
                if(isValid) {
                    statusEl.innerHTML = '✅ Ссылка корректна';
                    isLinkValid = true;
                } else {
                    statusEl.innerHTML = '❌ Некорректная ссылка';
                    isLinkValid = false;
                }
            }, 800);
        });
    }
    
    // Initial recalc for modal
    recalc();
});

function populateTgTypes() {
    const sel = document.getElementById('t-tg-subtype');
    if(!sel) return;
    sel.innerHTML = '';
    Object.keys(TG_TASK_TYPES).forEach(k => {
        const t = TG_TASK_TYPES[k];
        const opt = document.createElement('option');
        opt.value = k;
        opt.textContent = `${t.icon} ${t.label} (${t.cost}₽)`;
        sel.appendChild(opt);
    });
}

function setupProfileUI() {
    try {
        const user = getTgUser();
        const headerAvatar = document.getElementById('header-avatar');
        const profileAvatar = document.getElementById('u-pic');
        const headerName = document.getElementById('header-name');
        const profileName = document.getElementById('u-name');
        
        let displayName = 'Гость';
        let seed = 'G'; 

        if (user) {
            if (user.username) displayName = '@' + user.username;
            else if (user.first_name || user.last_name) displayName = `${user.first_name || ''} ${user.last_name || ''}`.trim();
            else displayName = 'Пользователь';
            seed = user.first_name || user.username || 'U';
        }

        let photoSrc;
        if (user && typeof user.photo_url === 'string' && user.photo_url.startsWith('http')) {
            photoSrc = user.photo_url;
        } else {
            photoSrc = `https://ui-avatars.com/api/?name=${encodeURIComponent(seed)}&background=random&color=fff&size=128&bold=true`;
        }

        if (headerName) headerName.innerText = displayName;
        if (profileName) profileName.innerText = displayName;

        if (headerAvatar) {
            headerAvatar.src = photoSrc;
            headerAvatar.onerror = () => headerAvatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(seed)}&background=random&color=fff&size=128&bold=true`;
        }
        
        if (profileAvatar) {
            profileAvatar.src = photoSrc;
            profileAvatar.onerror = () => profileAvatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(seed)}&background=random&color=fff&size=128&bold=true`;
        }
    } catch(e) {
        console.error('Profile Setup Error:', e);
    }
}

function checkAdmin() {
    const u = getTgUser();
    const adminPanel = document.getElementById('admin-panel-card');
    if (u && u.id && ADMIN_IDS.includes(Number(u.id))) {
        if (adminPanel) adminPanel.style.display = 'block';
    } else {
        if (adminPanel) adminPanel.style.display = 'none';
    }
}

async function loadData() {
    try {
        const storedUser = await miniappsAI.storage.getItem('userBalance');
        if (storedUser) {
            state.user = JSON.parse(storedUser);
            if(typeof state.user.xp === 'undefined') state.user.xp = 0;
            if(typeof state.user.level === 'undefined') state.user.level = 1;
        } else {
            state.user = { rub: 500, stars: 10, xp: 0, level: 1 }; 
        }

        const storedTasks = await miniappsAI.storage.getItem('tasksList');
        if (storedTasks) state.tasks = JSON.parse(storedTasks);
        else {
            // Updated mock tasks with new types
            state.tasks = [
                { 
                    id: 1, type: 'tg', subType: 'tg_sub', name: 'Подписка на канал', price: 15, owner: 'other', checkType: 'auto',
                    target: 'https://t.me/telegram', text: 'Подпишись на официальный канал новостей.'
                },
                { 
                    id: 2, type: 'ya', name: 'Отзыв Яндекс Карты', price: 120, owner: 'other', checkType: 'manual',
                    target: 'https://yandex.ru/maps', text: 'Поставьте 5 звезд и напишите про вежливый персонал.'
                },
                { 
                    id: 3, type: 'tg', subType: 'tg_poll', name: 'Участие в опросе', price: 7, owner: 'other', checkType: 'auto',
                    target: 'https://t.me/durov', text: 'Проголосуйте в последнем опросе.'
                }
            ];
        }

        const storedMod = await miniappsAI.storage.getItem('adminQueue');
        if (storedMod) state.moderation = JSON.parse(storedMod);

        const storedHist = await miniappsAI.storage.getItem('userHistory');
        if (storedHist) state.history = JSON.parse(storedHist);

        const storedWd = await miniappsAI.storage.getItem('withdrawals');
        if (storedWd) state.withdrawals = JSON.parse(storedWd);

        // Load Limits
        const storedLimits = await miniappsAI.storage.getItem('taskLimitData');
        if(storedLimits) state.limits = JSON.parse(storedLimits);

    } catch (e) { console.error('Data load error:', e); }
}

async function saveData() {
    await miniappsAI.storage.setItem('userBalance', JSON.stringify(state.user));
    await miniappsAI.storage.setItem('tasksList', JSON.stringify(state.tasks));
    await miniappsAI.storage.setItem('adminQueue', JSON.stringify(state.moderation));
    await miniappsAI.storage.setItem('userHistory', JSON.stringify(state.history));
    await miniappsAI.storage.setItem('withdrawals', JSON.stringify(state.withdrawals));
}

// --- TASK LIMIT LOGIC ---
async function checkTaskAvailability(type) {
    if (!TASK_LIMITS[type]) return { ok: true };
    
    // Ensure we have the latest limits
    const raw = await miniappsAI.storage.getItem('taskLimitData');
    const data = raw ? JSON.parse(raw) : {};
    
    const last = data[type] || 0;
    const diff = Date.now() - last;

    if (diff < TASK_LIMITS[type]) {
         const remaining = TASK_LIMITS[type] - diff;
         return { ok: false, remainingMs: remaining };
    }
    return { ok: true };
}

async function recordTaskAction(type) {
    if (!TASK_LIMITS[type]) return;
    
    const raw = await miniappsAI.storage.getItem('taskLimitData');
    const data = raw ? JSON.parse(raw) : {};
    
    data[type] = Date.now();
    await miniappsAI.storage.setItem('taskLimitData', JSON.stringify(data));
    state.limits = data; // Update local state
}

// --- HISTORY SYSTEM ---
function addHistory(type, amount, desc) {
    state.history.unshift({
        id: Date.now(),
        type: type, // 'earn', 'spend', 'withdraw'
        amount: amount,
        desc: desc,
        date: new Date().toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    });
    if (state.history.length > 50) state.history.pop();
}

function renderHistory() {
    const list = document.getElementById('history-list');
    if(!list) return;
    list.innerHTML = '';
    
    if(state.history.length === 0) {
        list.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-dim);">История пуста</div>';
        return;
    }

    state.history.forEach(item => {
        let icon = '📝';
        let colorClass = '';
        let sign = '';

        if(item.type === 'earn') { icon = '💰'; colorClass = 'amt-green'; sign = '+'; }
        else if(item.type === 'spend') { icon = '💸'; colorClass = 'amt-red'; sign = '-'; }
        else if(item.type === 'withdraw') { icon = '🏦'; colorClass = 'amt-red'; sign = '-'; }

        list.insertAdjacentHTML('beforeend', `
            <div class="list-item">
                <div class="list-icon">${icon}</div>
                <div class="list-meta">
                    <div class="list-title">${item.desc}</div>
                    <div class="list-date">${item.date}</div>
                </div>
                <div class="list-amount ${colorClass}">${sign}${item.amount} ₽</div>
            </div>
        `);
    });
}

// --- LEVELING SYSTEM ---
function addXP(amount) {
    state.user.xp += amount;
    checkLevelUp();
}

function checkLevelUp() {
    const newLevel = 1 + Math.floor(state.user.xp / 100);
    
    if (newLevel > state.user.level) {
        state.user.level = newLevel;
        const bonus = 50;
        state.user.rub += bonus;
        addHistory('earn', bonus, `Бонус за ${newLevel} уровень!`);
        tg.showAlert(`🎉 Поздравляем!\nВы достигли ${newLevel} уровня!\nНаграда: +${bonus} ₽`);
    }
}

// --- CORE LOGIC: CREATE TASK ---
window.createTask = async function() {
    const typeEl = document.getElementById('t-type');
    const subtypeEl = document.getElementById('t-tg-subtype');
    const qtyEl = document.getElementById('t-qty');
    const curEl = document.getElementById('t-cur');
    const targetEl = document.getElementById('t-target');
    const textEl = document.getElementById('t-text');

    const type = typeEl.value;
    const qty = parseInt(qtyEl.value);
    const currency = curEl.value;
    const target = targetEl.value.trim();
    const text = textEl.value.trim();

    if (qty < 1) return tg.showAlert('Минимальное количество: 1');
    if (!target) return tg.showAlert('Укажите ссылку на объект');
    // text is optional for some TG types, but good to have

    if (!isLinkValid) {
        return tg.showAlert('Пожалуйста, укажите корректную ссылку и дождитесь проверки.');
    }

    let pricePerItem = 0;
    let workerReward = 0;
    let taskName = '';
    let subType = null;
    let checkType = 'manual';

    if (type === 'tg') {
        const stKey = subtypeEl.value;
        const conf = TG_TASK_TYPES[stKey];
        pricePerItem = conf.cost;
        workerReward = conf.reward;
        taskName = conf.label;
        subType = stKey;
        checkType = 'auto'; // Most TG tasks are auto
    } else {
        pricePerItem = parseInt(typeEl.selectedOptions[0].dataset.p);
        taskName = type === 'ya' ? 'Отзыв Яндекс' : 'Отзыв Google';
        checkType = 'manual';
        // Manual review tasks
        workerReward = Math.floor(pricePerItem * 0.5); 
    }

    const subtotal = pricePerItem * qty;
    // No extra 15% commission if using configured prices which are "Client Pays"
    const totalCostRub = subtotal; 

    let finalCost = totalCostRub;
    if (currency === 'star') {
        finalCost = Math.ceil(totalCostRub / 1.5); 
    }

    if (currency === 'rub') {
        if (state.user.rub < finalCost) return tg.showAlert(`Недостаточно средств. Нужно: ${finalCost} ₽`);
        state.user.rub -= finalCost;
        addHistory('spend', finalCost, `Создание: ${taskName}`);
    } else {
        if (state.user.stars < finalCost) return tg.showAlert(`Недостаточно звезд. Нужно: ${finalCost} ⭐`);
        state.user.stars -= finalCost;
    }

    const newTask = { 
        id: Date.now(), 
        type: type, 
        subType: subType, // can be null
        name: taskName, 
        price: workerReward, // Store REWARD for worker
        cost: pricePerItem,  // Store COST for reference
        owner: 'me',
        qty: qty,
        target: target,
        text: text,
        checkType: checkType
    };
    
    state.tasks.unshift(newTask); 
    await saveData(); 
    closeModal(); 
    setFilter('my'); 
    tg.showAlert(`✅ Задание создано! Списано ${finalCost} ${currency === 'rub' ? '₽' : '⭐'}`);
};

window.handleTask = async function(btn, owner, id) {
    if(owner === 'me') {
        tg.showConfirm('Удалить это задание? Средства не вернутся (демо).', async (confirmed) => {
            if (confirmed) {
                state.tasks = state.tasks.filter(t => t.id !== id);
                await saveData();
                render();
            }
        });
    } else {
        const task = state.tasks.find(t => t.id === id);
        if (!task) return;

        // --- CHECK LIMITS ---
        if (TASK_LIMITS[task.type]) {
            btn.classList.add('working'); // Indicate loading
            const availability = await checkTaskAvailability(task.type);
            btn.classList.remove('working');

            if (!availability.ok) {
                const hrs = Math.ceil(availability.remainingMs / (1000 * 60 * 60));
                const limitText = task.type === 'ya' ? 'раз в 3 дня' : 'раз в день';
                return tg.showAlert(
                    `⏳ Это задание можно выполнять ${limitText}.\n\n` + 
                    `Доступно через: ~${hrs} ч.`
                );
            }
        }
        // --------------------

        document.getElementById('td-title').innerText = task.name;
        document.getElementById('td-reward').innerText = `+${task.price} ₽`;
        
        const iconBox = document.getElementById('td-icon');
        let iconChar = ASSETS[task.type] ? `<img src="${ASSETS[task.type]}" style="width:100%">` : '📄';
        
        if (task.type === 'tg' && task.subType && TG_TASK_TYPES[task.subType]) {
            iconChar = TG_TASK_TYPES[task.subType].icon;
            document.getElementById('td-type-badge').innerText = TG_TASK_TYPES[task.subType].label.toUpperCase();
        } else {
            document.getElementById('td-type-badge').innerText = task.type.toUpperCase();
        }
        
        iconBox.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;font-size:32px;">${iconChar}</div>`;
        
        const linkEl = document.getElementById('td-link');
        const linkBtn = document.getElementById('td-link-btn');
        const textEl = document.getElementById('td-text');
        
        linkEl.innerText = task.target;
        linkBtn.href = task.target;
        textEl.innerText = task.text || 'Нет дополнительных инструкций';
        
        const isTgAuto = task.checkType === 'auto';
        document.getElementById('proof-manual').classList.toggle('hidden', isTgAuto);
        document.getElementById('proof-auto').classList.toggle('hidden', !isTgAuto);
        
        document.getElementById('p-username').value = '';
        document.getElementById('p-file').value = '';
        document.getElementById('p-filename').innerText = '📷 Прикрепить скриншот';
        document.getElementById('p-filename').style.color = 'var(--accent-cyan)';
        selectedProofFile = null;

        const actBtn = document.getElementById('td-action-btn');
        actBtn.disabled = false;
        actBtn.classList.remove('working');
        
        if(isTgAuto) {
            let actionText = '⚡ Проверить выполнение';
            if (task.subType && TG_TASK_TYPES[task.subType]) {
                actionText = '⚡ Проверить: ' + TG_TASK_TYPES[task.subType].action;
            }
            actBtn.innerHTML = actionText;
            actBtn.onclick = () => checkTgTask(id, task.subType);
        } else {
            actBtn.innerHTML = '📤 Отправить отчет';
            actBtn.onclick = () => submitReviewProof(id);
        }

        openModal('m-task-details');
    }
};

window.checkTgTask = function(id, subType) {
    const btn = document.getElementById('td-action-btn');
    btn.disabled = true;
    
    let msg = 'Проверка подписки...';
    if(subType === 'tg_poll') msg = 'Проверка голоса...';
    if(subType === 'tg_react') msg = 'Проверка реакции...';
    if(subType === 'tg_start') msg = 'Проверка запуска бота...';
    if(subType === 'tg_mapp') msg = 'Проверка запуска App...';

    btn.innerHTML = `<span class="spin-icon">⏳</span> ${msg}`;
    
    // Simulate API call delay
    setTimeout(async () => {
        completeTaskLogic(id, 'Задание успешно проверено!', true);
    }, 2500);
};

window.submitReviewProof = async function(id) {
    const user = document.getElementById('p-username').value.trim();
    if(!user) return tg.showAlert('Укажите ваше имя/никнейм.');
    if(!selectedProofFile) return tg.showAlert('Пожалуйста, прикрепите скриншот доказательства.');
    
    const btn = document.getElementById('td-action-btn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spin-icon">⏳</span> Загрузка доказательств...';

    try {
        await new Promise(r => setTimeout(r, 1500));
        
        const task = state.tasks.find(t => t.id === id);
        
        // Simulate Supabase upload by creating a fake URL
        const fakeScreenshotUrl = `https://placehold.co/600x400/000000/FFF?text=SCREENSHOT+${selectedProofFile.name}`;

        const proofItem = {
            id: Date.now(),
            taskId: task.id,
            taskName: task.name,
            targetUrl: task.target,
            workerName: user,
            price: task.price,
            fileName: selectedProofFile.name,
            screenshotUrl: fakeScreenshotUrl,
            timestamp: new Date().toLocaleString()
        };
        
        state.moderation.push(proofItem);
        
        // --- RECORD LIMIT TIMESTAMP ---
        // We assume submitting a proof counts as an "attempt/execution" to prevent spamming
        await recordTaskAction(task.type);
        // ------------------------------
        
        await saveData();
        updateAdminBadge();
        closeModal();
        tg.showAlert('✅ Отчет отправлен на модерацию!\nСредства поступят после проверки администратором.');

    } catch(e) {
        tg.showAlert('Ошибка загрузки');
        console.error(e);
        btn.disabled = false;
        btn.innerHTML = '📤 Отправить отчет';
    }
};

function completeTaskLogic(id, msg, isAuto) {
    const task = state.tasks.find(t => t.id === id);
    if (task) {
        const reward = parseInt(task.price);
        state.user.rub += reward;
        addHistory('earn', reward, `Выполнено: ${task.name}`);
        addXP(reward); // XP = Earned Amount
        saveData();
        render();
        closeModal();
        tg.showAlert(`✅ ${msg}\n+${reward} ₽ начислено.`);
    }
}

window.updateFileName = function(input) {
    if(input.files && input.files[0]) {
        selectedProofFile = input.files[0];
        const name = input.files[0].name;
        document.getElementById('p-filename').innerText = '📄 ' + (name.length > 20 ? name.substr(0,18)+'...' : name);
        document.getElementById('p-filename').style.color = 'var(--text-main)';
    }
};

// --- ADMIN / MODERATION SYSTEM ---
window.openAdminPanel = function() {
    switchAdminTab('proofs');
    openModal('m-admin');
};

window.switchAdminTab = function(tab) {
    activeAdminTab = tab;
    
    document.getElementById('at-proofs').classList.toggle('active', tab === 'proofs');
    document.getElementById('at-withdrawals').classList.toggle('active', tab === 'withdrawals');
    
    document.getElementById('admin-view-proofs').classList.toggle('hidden', tab !== 'proofs');
    document.getElementById('admin-view-withdrawals').classList.toggle('hidden', tab !== 'withdrawals');
    
    renderAdmin();
};

window.renderAdmin = function() {
    if (activeAdminTab === 'proofs') renderAdminProofs();
    else renderAdminWithdrawals();
};

function renderAdminProofs() {
    const list = document.getElementById('admin-list');
    list.innerHTML = '';
    
    if(state.moderation.length === 0) {
        list.innerHTML = '<div style="text-align:center; padding:20px; opacity:0.5;">Нет отчетов на проверку</div>';
        return;
    }

    state.moderation.forEach(item => {
        const div = document.createElement('div');
        div.className = 'card';
        div.style.padding = '15px';
        div.style.marginBottom = '0';
        div.innerHTML = `
            <div style="font-weight:700; font-size:14px; margin-bottom:5px;">${item.taskName}</div>
            <div style="font-size:12px; color:var(--text-dim); margin-bottom:5px;">
                📅 ${item.timestamp}<br>
                👤 Ник: <span style="color:var(--text-main); font-weight:700;">${item.workerName}</span>
            </div>
            
            <div style="display:flex; gap:10px; margin-top:10px;">
                <button class="btn btn-secondary btn-sm" onclick="window.open('${item.targetUrl}', '_blank')">🔗 Ссылка</button>
                <button class="btn btn-secondary btn-sm" onclick="window.open('${item.screenshotUrl}', '_blank')">📷 Скриншот</button>
            </div>

            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:15px;">
                <button class="btn" style="background:rgba(255,75,75,0.1); color:#ff4b4b; padding:10px;" onclick="adminDecision(${item.id}, false)">❌ Отказ</button>
                <button class="btn" style="background:rgba(0,255,136,0.1); color:var(--accent-green); padding:10px;" onclick="adminDecision(${item.id}, true)">✅ Принять</button>
            </div>
        `;
        list.appendChild(div);
    });
}

function renderAdminWithdrawals() {
    const list = document.getElementById('admin-withdraw-list');
    list.innerHTML = '';
    
    // Filter only pending for action, or show all? Let's show all but sort pending first
    const items = [...state.withdrawals].sort((a,b) => {
        if(a.status === 'pending' && b.status !== 'pending') return -1;
        if(a.status !== 'pending' && b.status === 'pending') return 1;
        return b.id - a.id;
    });

    if(items.length === 0) {
        list.innerHTML = '<div style="text-align:center; padding:20px; opacity:0.5;">Нет заявок</div>';
        return;
    }

    items.forEach(w => {
        let badge = '<span class="status-badge st-pending">⏳ Ожидание</span>';
        let actions = '';
        
        if(w.status === 'paid') badge = '<span class="status-badge st-paid">✅ Выплачено</span>';
        if(w.status === 'rejected') badge = '<span class="status-badge st-rejected">❌ Отменено</span>';

        if(w.status === 'pending') {
            actions = `
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:15px; border-top:1px solid var(--glass-border); padding-top:15px;">
                     <button class="btn" style="background:rgba(255,75,75,0.1); color:#ff4b4b; padding:8px; font-size:12px;" onclick="adminProcessWithdrawal(${w.id}, false)">Отклонить</button>
                     <button class="btn" style="background:rgba(0,255,136,0.1); color:var(--accent-green); padding:8px; font-size:12px;" onclick="adminProcessWithdrawal(${w.id}, true)">Выплатить</button>
                </div>
            `;
        }

        const div = document.createElement('div');
        div.className = 'card';
        div.style.padding = '15px';
        div.style.marginBottom = '0';
        div.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                <div>
                    <div style="font-weight:800; font-size:16px; margin-bottom:5px;">${w.amount} ₽</div>
                    <div style="font-size:12px; color:var(--text-dim);">${w.details}</div>
                    <div style="font-size:10px; color:var(--text-dim); margin-top:4px;">${w.date}</div>
                </div>
                ${badge}
            </div>
            ${actions}
        `;
        list.appendChild(div);
    });
}

window.adminDecision = async function(itemId, approved) {
    const item = state.moderation.find(i => i.id === itemId);
    if(!item) return;

    if(approved) {
        state.user.rub += parseInt(item.price);
        addHistory('earn', parseInt(item.price), `Задание: ${item.taskName}`);
        addXP(parseInt(item.price));
        tg.showAlert(`✅ Отчет принят. Исполнителю начислено +${item.price} ₽`);
    } else {
        tg.showAlert('❌ Отчет отклонен.');
    }

    state.moderation = state.moderation.filter(i => i.id !== itemId);
    await saveData();
    render(); 
    renderAdmin(); 
    updateAdminBadge();
    
    if(state.moderation.length === 0 && state.withdrawals.length === 0) closeModal();
};

window.adminProcessWithdrawal = async function(id, approved) {
    const w = state.withdrawals.find(x => x.id === id);
    if(!w) return;

    if(approved) {
        w.status = 'paid';
        tg.showAlert(`✅ Выплата ${w.amount}₽ подтверждена!`);
    } else {
        w.status = 'rejected';
        // Refund logic
        state.user.rub += w.amount;
        addHistory('earn', w.amount, 'Возврат средств (Отмена вывода)');
        tg.showAlert(`❌ Выплата отклонена. Средства возвращены.`);
    }

    await saveData();
    render();
    renderAdmin();
};

function updateAdminBadge() {
    const badge = document.getElementById('admin-badge');
    if(!badge) return;
    // Count pending tasks
    const count = state.moderation.length;
    // Optionally add pending withdrawals count
    const pendingW = state.withdrawals.filter(w => w.status === 'pending').length;
    
    const total = count + pendingW;
    badge.innerText = total;
    badge.style.opacity = total > 0 ? '1' : '0';
}

window.recalc = function() {
    const typeSelect = document.getElementById('t-type');
    const subtypeSelect = document.getElementById('t-tg-subtype');
    const subtypeWrapper = document.getElementById('tg-subtype-wrapper');
    const tgOptions = document.getElementById('tg-options');

    if (!typeSelect) return;
    
    const typeVal = typeSelect.value;
    let pricePerItem = 0;

    if (typeVal === 'tg') {
        subtypeWrapper.classList.remove('hidden');
        tgOptions.classList.remove('hidden');
        
        // Get price from subtype
        const stKey = subtypeSelect.value;
        if (TG_TASK_TYPES[stKey]) {
            pricePerItem = TG_TASK_TYPES[stKey].cost;
        }
    } else {
        subtypeWrapper.classList.add('hidden');
        tgOptions.classList.add('hidden');
        // Get price from main select
        pricePerItem = parseInt(typeSelect.selectedOptions[0].dataset.p);
    }

    const q = parseInt(document.getElementById('t-qty').value || 0);
    const cur = document.getElementById('t-cur').value;
    
    const totalRub = pricePerItem * q;
    
    const el = document.getElementById('t-total');
    
    if(cur === 'star') {
        const stars = Math.ceil(totalRub / 1.5);
        el.innerText = stars + ' ⭐';
        el.style.color = 'var(--accent-gold)';
    } else {
        el.innerText = totalRub + ' ₽';
        el.style.color = 'var(--accent-cyan)';
    }
};

window.copyLink = function() {
    const url = document.getElementById('td-link').innerText;
    navigator.clipboard.writeText(url).then(() => tg.showAlert('Ссылка скопирована'));
};

window.copyText = function() {
    const txt = document.getElementById('td-text').innerText;
    navigator.clipboard.writeText(txt).then(() => tg.showAlert('Текст скопирован'));
};

window.toggleTheme = function() {
    document.body.classList.toggle('light-mode');
    const isLight = document.body.classList.contains('light-mode');
    if(tg.setHeaderColor) tg.setHeaderColor(isLight ? '#f2f4f7' : '#05070a');
};

// NAVIGATION & VIEW LOGIC
window.showTab = function(t) {
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    const navBtn = document.getElementById('tab-' + t);
    if(navBtn) navBtn.classList.add('active');
    
    document.getElementById('view-tasks').classList.toggle('hidden', t !== 'tasks');
    document.getElementById('view-friends').classList.toggle('hidden', t !== 'friends');
    document.getElementById('view-profile').classList.toggle('hidden', t !== 'profile');
    document.getElementById('view-history').classList.add('hidden'); // Ensure history is hidden when switching tabs
};

window.showHistory = function() {
    // Hide all main tabs
    document.getElementById('view-tasks').classList.add('hidden');
    document.getElementById('view-friends').classList.add('hidden');
    document.getElementById('view-profile').classList.add('hidden');
    // Show history
    document.getElementById('view-history').classList.remove('hidden');
    renderHistory();
};

window.closeHistory = function() {
    document.getElementById('view-history').classList.add('hidden');
    // Return to profile
    document.getElementById('view-profile').classList.remove('hidden');
    document.getElementById('tab-profile').classList.add('active');
};


function render() {
    // 1. Balance
    document.getElementById('u-bal-rub').innerText = Math.floor(state.user.rub).toLocaleString() + ' ₽';
    document.getElementById('u-bal-star').innerText = Math.floor(state.user.stars).toLocaleString() + ' ⭐';
    
    // 2. XP & Level
    const xpPerLevel = 100;
    const currentLevel = state.user.level;
    const nextLevelXP = currentLevel * xpPerLevel;
    const prevLevelXP = (currentLevel - 1) * xpPerLevel;
    const xpInCurrentLevel = state.user.xp - prevLevelXP;
    const xpNeededForNext = nextLevelXP - prevLevelXP;
    const progressPct = Math.min(100, Math.max(0, (xpInCurrentLevel / xpNeededForNext) * 100));

    document.getElementById('u-lvl-badge').innerText = `LVL ${currentLevel}`;
    document.getElementById('u-xp-cur').innerText = `${state.user.xp} XP`;
    document.getElementById('u-xp-next').innerText = `${nextLevelXP} XP`;
    document.getElementById('u-xp-fill').style.width = `${progressPct}%`;


    // 3. Tasks
    const box = document.getElementById('tasks-list'); 
    if (box) {
        box.innerHTML = '';
        const list = state.tasks.filter(t => state.filter === 'all' ? t.owner === 'other' : t.owner === 'me');
        
        if (list.length === 0) {
            box.innerHTML = `
                <div style="text-align:center; padding: 60px 20px; color: var(--text-dim); opacity: 0.6;" class="anim-entry">
                    <div style="font-size: 48px; margin-bottom: 15px; filter: grayscale(1);">📭</div>
                    <div style="font-weight:600;">Задач пока нет</div>
                    <div style="font-size:12px; margin-top:5px;">Заходите позже или создайте свою</div>
                </div>
            `;
        } else {
            list.forEach((t, index) => {
                let icon = '';
                // Resolve Icon
                if (t.type === 'tg' && t.subType && TG_TASK_TYPES[t.subType]) {
                    icon = TG_TASK_TYPES[t.subType].icon;
                } else if (ASSETS[t.type]) {
                    icon = `<img src="${ASSETS[t.type]}" style="width:100%; height:100%; object-fit:contain;">`;
                } else {
                    icon = '📄';
                }

                // Wrap text icon if needed
                if(!icon.includes('<img')) {
                    icon = `<div style="font-size:24px;">${icon}</div>`;
                }

                box.insertAdjacentHTML('beforeend', `
                    <div class="task-item anim-entry" style="animation-delay: ${0.05 * index}s">
                        <div style="display:flex; align-items:center;">
                            <div class="brand-box">${icon}</div>
                            <div style="margin-left:15px;">
                                <div style="font-weight:700;">${t.name}</div>
                                <div style="color:var(--accent-cyan); font-weight:800; font-size:14px;">+${t.price} ₽</div>
                            </div>
                        </div>
                        <button class="btn btn-action" onclick="handleTask(this, '${t.owner}', ${t.id})">
                            ${t.owner === 'me' ? 'Удалить' : 'Выполнить'}
                        </button>
                    </div>
                `);
            });
        }
    }

    // 4. Referrals
    renderReferrals();
}
window.render = render;

function renderReferrals() {
    const refCount = document.getElementById('ref-count');
    const refEarn = document.getElementById('ref-earn');
    const leaderList = document.getElementById('leaderboard-list');

    if(refCount) refCount.innerText = state.referrals.count;
    if(refEarn) refEarn.innerText = state.referrals.earned + ' ₽';
    
    // Invite Link
    const uid = getTgUser()?.id || '12345';
    const inviteLink = `t.me/ReviewCashBot?start=${uid}`;
    const linkEl = document.getElementById('invite-link');
    if(linkEl) linkEl.innerText = inviteLink;

    if(leaderList) {
        leaderList.innerHTML = '';
        LEADERBOARD_MOCK.forEach((u, i) => {
            const isGold = i < 3;
            leaderList.insertAdjacentHTML('beforeend', `
                <div class="leader-row ${isGold ? 'gold' : ''}">
                    <div class="rank-num">${i+1}</div>
                    <div style="flex:1; font-weight:700;">${u.name}</div>
                    <div style="text-align:right;">
                        <div style="font-weight:800; font-size:13px; color:var(--accent-cyan);">${u.earned.toLocaleString()} ₽</div>
                        <div style="font-size:10px; color:var(--text-dim);">${u.count} друзей</div>
                    </div>
                </div>
            `);
        });
    }
}

window.copyInviteLink = function() {
    const uid = getTgUser()?.id || '12345';
    const inviteLink = `https://t.me/ReviewCashBot?start=${uid}`;
    navigator.clipboard.writeText(inviteLink).then(() => tg.showAlert('🔗 Ссылка скопирована!'));
};

window.shareInvite = function() {
    const uid = getTgUser()?.id || '12345';
    const inviteLink = `https://t.me/ReviewCashBot?start=${uid}`;
    tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(inviteLink)}&text=Зарабатывай на заданиях вместе со мной!`);
};

window.setFilter = function(f) {
    state.filter = f;
    document.getElementById('f-all').classList.toggle('active', f === 'all');
    document.getElementById('f-my').classList.toggle('active', f === 'my');
    render();
};

window.processPay = function(method) {
    const val = document.getElementById('sum-input').value;
    if(val < 300) return tg.showAlert('Минимальная сумма пополнения — 300 ₽');
    const payload = { action: method, amount: val };
    tg.sendData(JSON.stringify(payload));
};

let tbankAmount = 0;
window.openTBankPay = function() {
    const val = document.getElementById('sum-input').value;
    if(val < 300) return tg.showAlert('Минимальная сумма пополнения — 300 ₽');

    tbankAmount = val;
    document.getElementById('tb-amount-display').innerText = val + ' ₽';
    
    const uId = getTgUser()?.id || 'TEST';
    const rand = Math.floor(1000 + Math.random() * 9000); 
    const code = `PAY-${uId}-${rand}`;
    document.getElementById('tb-code').innerText = code;
    
    closeModal();
    openModal('m-pay-tbank');
};

window.copyCode = function() {
    const code = document.getElementById('tb-code').innerText;
    navigator.clipboard.writeText(code).then(() => {
        tg.showAlert('Код скопирован!');
    });
};

window.confirmTBank = function() {
    const sender = document.getElementById('tb-sender').value;
    const code = document.getElementById('tb-code').innerText;
    if(!sender) return tg.showAlert('Укажите ваше имя отправителя');
    
    const payload = { action: 'pay_tbank', amount: tbankAmount, sender: sender, code: code };
    tg.sendData(JSON.stringify(payload));
};

// WITHDRAWAL LOGIC
window.requestWithdraw = function() {
    const amount = document.getElementById('w-amount').value;
    const details = document.getElementById('w-details').value;
    
    if(!amount || !details) return tg.showAlert('Заполните все поля');
    if(amount < 300) return tg.showAlert('Минимальная сумма: 300 ₽'); // Updated to 300
    if(amount > state.user.rub) return tg.showAlert('Недостаточно средств на балансе');

    state.user.rub -= parseInt(amount);
    
    const wdRequest = {
        id: Date.now(),
        amount: parseInt(amount),
        details: details,
        status: 'pending', // pending, paid, rejected
        date: new Date().toLocaleDateString()
    };
    
    state.withdrawals.unshift(wdRequest);
    addHistory('withdraw', amount, 'Заявка на вывод');

    saveData();
    render();
    renderWithdrawals();
    tg.showAlert('✅ Заявка создана! Ожидайте обработки.');
};

function renderWithdrawals() {
    const list = document.getElementById('withdrawals-list');
    if(!list) return;
    list.innerHTML = '';
    
    if(state.withdrawals.length === 0) {
        list.innerHTML = '<div style="font-size:12px; color:var(--text-dim); text-align:center;">Нет активных заявок</div>';
        return;
    }
    
    state.withdrawals.forEach(w => {
        let stClass = 'st-pending';
        let stText = 'Ожидание';
        if(w.status === 'paid') { stClass = 'st-paid'; stText = 'Выплачено'; }
        if(w.status === 'rejected') { stClass = 'st-rejected'; stText = 'Отклонено'; }

        list.insertAdjacentHTML('beforeend', `
            <div style="background:var(--glass); padding:10px; border-radius:12px; display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <div style="font-weight:700; font-size:13px;">${w.amount} ₽</div>
                    <div style="font-size:10px; color:var(--text-dim);">${w.date}</div>
                </div>
                <div class="status-badge ${stClass}">${stText}</div>
            </div>
        `);
    });
}

window.openModal = function(id) { 
    document.getElementById(id).classList.add('active'); 
    if(id === 'm-create') {
        document.getElementById('t-target').value = '';
        document.getElementById('t-text').value = '';
        document.getElementById('t-target-status').className = 'input-status';
        document.getElementById('t-target-status').innerHTML = '';
        isLinkValid = false;
        recalc();
    }
    if(id === 'm-withdraw') {
        renderWithdrawals();
    }
};

window.closeModal = function() { 
    document.querySelectorAll('.overlay').forEach(o => o.classList.remove('active')); 
};


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
        initDataUnsafe: {
            user: {
                id: 123456, // MOCK USER
                username: 'miniapp_user',
                first_name: 'Alex',
                last_name: 'Test',
                photo_url: 'https://cdn-icons-png.flaticon.com/512/147/147142.png' // Mock avatar
            }
        }
    }
};

// HELPER: Get User Data Safely
function getTgUser() {
    // 1. Try real Telegram WebApp
    if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initDataUnsafe && window.Telegram.WebApp.initDataUnsafe.user) {
        return window.Telegram.WebApp.initDataUnsafe.user;
    }
    // 2. Fallback to Mock if in dev/browser environment
    return MockTelegram.WebApp.initDataUnsafe.user;
}

// Global TG reference (for methods)
const tg = (window.Telegram && window.Telegram.WebApp) ? window.Telegram.WebApp : MockTelegram.WebApp;

// --- CONFIGURATION ---
// YOUR ADMIN ID: 6482440657
const ADMIN_IDS = [6482440657]; 

const ASSETS = {
    ya: 'https://www.google.com/s2/favicons?sz=64&domain=yandex.ru',
    gm: 'https://www.google.com/s2/favicons?sz=64&domain=google.com',
    tg: 'https://cdn-icons-png.flaticon.com/512/2111/2111646.png'
};

let state = {
    filter: 'all',
    user: { rub: 0, stars: 0 },
    tasks: [],
    moderation: [] // New queue for pending reviews
};

let isLinkValid = false;
let linkCheckTimer = null;
let selectedProofFile = null;

// Initialization
document.addEventListener('DOMContentLoaded', async () => {
    try {
        if(tg.expand) tg.expand();
    } catch(e) { console.log('Expand error', e); }
    
    // --- 1. SETUP UI IMMEDIATELY (AVATAR LOGIC) ---
    setupProfileUI();

    // --- 2. LOAD DATA ---
    try { await loadData(); } catch(e) { console.error('Data load error', e); }
    
    // --- 3. CHECK ADMIN RIGHTS ---
    checkAdmin();

    // --- 4. RENDER & FINALIZE ---
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
    
    // Close modals logic
    document.querySelectorAll('.overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                closeModal();
            }
        });
    });

    // Link Validation Logic
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
            }, 1200);
        });
    }
});

// 🔥 SIMPLIFIED AVATAR LOGIC AS REQUESTED
function setupProfileUI() {
    try {
        const user = getTgUser();
        
        // 1. Get Elements
        const headerAvatar = document.getElementById('header-avatar');
        const profileAvatar = document.getElementById('u-pic');
        const headerName = document.getElementById('header-name');
        const profileName = document.getElementById('u-name');
        
        // 2. Determine Display Name
        let displayName = 'Гость';
        let seed = 'G'; // For fallback avatar

        if (user) {
            displayName = user.username 
                ? '@' + user.username 
                : `${user.first_name || ''} ${user.last_name || ''}`.trim();
            
            if (!displayName) displayName = 'Пользователь';
            seed = user.first_name || 'U';
        }

        // 3. Determine Avatar URL (Direct from Telegram)
        // If user.photo_url exists, use it. Otherwise use dynamic fallback.
        let photoSrc = (user && user.photo_url) 
            ? user.photo_url 
            : `https://ui-avatars.com/api/?name=${encodeURIComponent(seed)}&background=random&color=fff&size=128&bold=true`;

        // 4. Update UI
        if (headerName) headerName.innerText = displayName;
        if (profileName) profileName.innerText = displayName;

        if (headerAvatar) {
            headerAvatar.src = photoSrc;
            // Backup error handler just in case URL expires or breaks
            headerAvatar.onerror = () => headerAvatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(seed)}&background=random&color=fff&size=128&bold=true`;
        }
        
        if (profileAvatar) {
            profileAvatar.src = photoSrc;
            profileAvatar.onerror = () => profileAvatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(seed)}&background=random&color=fff&size=128&bold=true`;
        }

        console.log('User Profile Loaded:', { displayName, photoSrc });

    } catch(e) {
        console.error('Profile Setup Error:', e);
    }
}

function checkAdmin() {
    const u = getTgUser();
    const adminPanel = document.getElementById('admin-panel-card');
    
    // Only show if user exists AND ID is in the list
    if (u && u.id && ADMIN_IDS.includes(Number(u.id))) {
        if (adminPanel) {
            adminPanel.style.display = 'block';
            console.log('Admin panel enabled for ID:', u.id);
        }
    } else {
        if (adminPanel) adminPanel.style.display = 'none';
    }
}

async function loadData() {
    try {
        const storedUser = await miniappsAI.storage.getItem('userBalance');
        if (storedUser) state.user = JSON.parse(storedUser);
        else state.user = { rub: 500, stars: 10 }; 

        const storedTasks = await miniappsAI.storage.getItem('tasksList');
        if (storedTasks) state.tasks = JSON.parse(storedTasks);
        else {
            state.tasks = [
                { 
                    id: 1, type: 'ya', name: 'Отзыв Яндекс Карты', price: 120, owner: 'other', checkType: 'manual',
                    target: 'https://yandex.ru/maps', text: 'Поставьте 5 звезд и напишите про вежливый персонал.'
                },
                { 
                    id: 2, type: 'gm', name: 'Отзыв Google Maps', price: 75, owner: 'other', checkType: 'manual',
                    target: 'https://google.com/maps', text: 'Короткий позитивный отзыв.'
                },
                { 
                    id: 3, type: 'tg', name: 'Подписка на канал', price: 15, owner: 'other', checkType: 'auto',
                    target: 'https://t.me/telegram', text: 'Подписаться и просмотреть 3 поста.'
                }
            ];
        }

        const storedMod = await miniappsAI.storage.getItem('adminQueue');
        if (storedMod) state.moderation = JSON.parse(storedMod);

    } catch (e) { console.error('Data load error:', e); }
}

async function saveData() {
    await miniappsAI.storage.setItem('userBalance', JSON.stringify(state.user));
    await miniappsAI.storage.setItem('tasksList', JSON.stringify(state.tasks));
    await miniappsAI.storage.setItem('adminQueue', JSON.stringify(state.moderation));
}

// --- CORE LOGIC: CREATE TASK ---
window.createTask = async function() {
    const typeEl = document.getElementById('t-type');
    const qtyEl = document.getElementById('t-qty');
    const curEl = document.getElementById('t-cur');
    const targetEl = document.getElementById('t-target');
    const textEl = document.getElementById('t-text');

    const type = typeEl.value;
    const pricePerItem = parseInt(typeEl.selectedOptions[0].dataset.p);
    const qty = parseInt(qtyEl.value);
    const currency = curEl.value;
    const target = targetEl.value.trim();
    const text = textEl.value.trim();

    if (qty < 1) return tg.showAlert('Минимальное количество: 1');
    if (!target) return tg.showAlert('Укажите ссылку на объект');
    if (!text) return tg.showAlert('Напишите текст задания/отзыва');

    // Validation Check
    if (!isLinkValid) {
        return tg.showAlert('Пожалуйста, укажите корректную ссылку и дождитесь проверки (зеленая галочка).');
    }

    // Determine Check Type: Auto for TG, Manual for others
    let checkType = 'manual'; 
    if (type === 'tg') {
        checkType = 'auto'; // ALWAYS auto for Telegram
    }

    const subtotal = pricePerItem * qty;
    const totalCostRub = Math.ceil(subtotal * 1.15); // 15% added

    let finalCost = totalCostRub;
    if (currency === 'star') {
        finalCost = Math.ceil(totalCostRub / 1.5); 
    }

    if (currency === 'rub') {
        if (state.user.rub < finalCost) return tg.showAlert(`Недостаточно средств. Нужно: ${finalCost} ₽`);
        state.user.rub -= finalCost;
    } else {
        if (state.user.stars < finalCost) return tg.showAlert(`Недостаточно звезд. Нужно: ${finalCost} ⭐`);
        state.user.stars -= finalCost;
    }

    const newTask = { 
        id: Date.now(), 
        type: type, 
        name: type === 'tg' ? 'Подписка (Авто)' : 'Отзыв (Заказ)', 
        price: pricePerItem, 
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

window.handleTask = function(btn, owner, id) {
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

        document.getElementById('td-title').innerText = task.name;
        document.getElementById('td-reward').innerText = `+${task.price} ₽`;
        
        const iconBox = document.getElementById('td-icon');
        iconBox.innerHTML = `<img src="${ASSETS[task.type]}" alt="${task.type}" style="width:100%; height:100%; object-fit:contain;">`;
        
        const linkEl = document.getElementById('td-link');
        const linkBtn = document.getElementById('td-link-btn');
        const textEl = document.getElementById('td-text');
        
        linkEl.innerText = task.target;
        linkBtn.href = task.target;
        textEl.innerText = task.text || 'Нет описания';
        
        // PROOF SECTION LOGIC
        // Determine if it's Automated TG or Manual (Screenshots)
        const isTgAuto = task.checkType === 'auto';
        
        // Hide/Show Areas
        document.getElementById('proof-manual').classList.toggle('hidden', isTgAuto);
        document.getElementById('proof-auto').classList.toggle('hidden', !isTgAuto);
        
        // Reset Inputs for Manual
        document.getElementById('p-username').value = '';
        document.getElementById('p-file').value = '';
        document.getElementById('p-filename').innerText = '📷 Прикрепить скриншот';
        document.getElementById('p-filename').style.color = 'var(--accent-cyan)';
        selectedProofFile = null;

        const actBtn = document.getElementById('td-action-btn');
        actBtn.disabled = false;
        actBtn.classList.remove('working');
        
        if(isTgAuto) {
            actBtn.innerHTML = '⚡ Проверить подписку';
            actBtn.onclick = () => checkTgSubscription(id);
        } else {
            actBtn.innerHTML = '📤 Отправить отчет';
            actBtn.onclick = () => submitReviewProof(id);
        }

        openModal('m-task-details');
    }
};

window.checkTgSubscription = function(id) {
    const btn = document.getElementById('td-action-btn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spin-icon">⏳</span> Проверка подписки...';
    
    // Auto check logic
    setTimeout(async () => {
        completeTaskLogic(id, 'Подписка подтверждена ботом!', true);
    }, 2000);
};

window.submitReviewProof = async function(id) {
    const user = document.getElementById('p-username').value.trim();
    if(!user) return tg.showAlert('Укажите ваше имя/никнейм.');
    if(!selectedProofFile) return tg.showAlert('Пожалуйста, прикрепите скриншот доказательства.');
    
    const btn = document.getElementById('td-action-btn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spin-icon">⏳</span> Загрузка доказательств...';

    // Simulate upload and add to Moderation Queue
    try {
        await new Promise(r => setTimeout(r, 1500));
        
        const task = state.tasks.find(t => t.id === id);
        const proofItem = {
            id: Date.now(),
            taskId: task.id,
            taskName: task.name,
            workerName: user,
            price: task.price,
            fileName: selectedProofFile.name,
            timestamp: new Date().toLocaleString()
        };
        
        state.moderation.push(proofItem);
        
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

// --- ADMIN / MODERATION LOGIC ---
window.openAdminPanel = function() {
    renderAdmin();
    openModal('m-admin');
};

window.renderAdmin = function() {
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
            <div style="font-size:12px; color:var(--text-dim);">Исполнитель: <span style="color:var(--text-main);">${item.workerName}</span></div>
            <div style="font-size:12px; color:var(--text-dim);">Файл: ${item.fileName}</div>
            <div style="margin-top:10px; padding:10px; background:var(--bg); border-radius:10px; display:flex; align-items:center; justify-content:center; gap:5px; border:1px dashed var(--glass-border);">
                <span>📷</span> <span style="font-size:11px;">[Скриншот скрыт]</span>
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:15px;">
                <button class="btn" style="background:rgba(255,75,75,0.1); color:#ff4b4b; padding:10px;" onclick="adminDecision(${item.id}, false)">Отклонить</button>
                <button class="btn" style="background:rgba(0,255,136,0.1); color:var(--accent-green); padding:10px;" onclick="adminDecision(${item.id}, true)">Оплатить (${item.price}₽)</button>
            </div>
        `;
        list.appendChild(div);
    });
};

window.adminDecision = async function(itemId, approved) {
    const item = state.moderation.find(i => i.id === itemId);
    if(!item) return;

    if(approved) {
        state.user.rub += parseInt(item.price);
        tg.showAlert(`✅ Отчет принят. Исполнителю начислено +${item.price} ₽`);
    } else {
        tg.showAlert('❌ Отчет отклонен.');
    }

    state.moderation = state.moderation.filter(i => i.id !== itemId);
    await saveData();
    render(); 
    renderAdmin(); 
    updateAdminBadge();
    
    if(state.moderation.length === 0) closeModal();
};

function updateAdminBadge() {
    const badge = document.getElementById('admin-badge');
    if(!badge) return;
    const count = state.moderation.length;
    badge.innerText = count;
    badge.style.opacity = count > 0 ? '1' : '0';
}

window.recalc = function() {
    const typeSelect = document.getElementById('t-type');
    if (!typeSelect) return;
    
    const p = parseInt(typeSelect.selectedOptions[0].dataset.p);
    const q = parseInt(document.getElementById('t-qty').value || 0);
    const cur = document.getElementById('t-cur').value;
    const typeVal = typeSelect.value;
    
    const tgOpts = document.getElementById('tg-options');
    if(typeVal === 'tg') {
        tgOpts.classList.remove('hidden');
    } else {
        tgOpts.classList.add('hidden');
    }

    const subtotal = p * q;
    const totalRub = Math.ceil(subtotal * 1.15); 
    
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

window.showTab = function(t) {
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    document.getElementById('tab-' + t).classList.add('active');
    document.getElementById('view-tasks').classList.toggle('hidden', t !== 'tasks');
    document.getElementById('view-profile').classList.toggle('hidden', t !== 'profile');
};

function render() {
    document.getElementById('u-bal-rub').innerText = Math.floor(state.user.rub).toLocaleString() + ' ₽';
    document.getElementById('u-bal-star').innerText = Math.floor(state.user.stars).toLocaleString() + ' ⭐';

    const box = document.getElementById('tasks-list'); 
    if (!box) return;
    
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
            box.insertAdjacentHTML('beforeend', `
                <div class="task-item anim-entry" style="animation-delay: ${0.05 * index}s">
                    <div style="display:flex; align-items:center;">
                        <div class="brand-box"><img src="${ASSETS[t.type]}" alt="${t.type}"></div>
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
window.render = render;

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

window.requestWithdraw = function() {
    const amount = document.getElementById('w-amount').value;
    const details = document.getElementById('w-details').value;
    
    if(!amount || !details) return tg.showAlert('Заполните все поля');
    if(amount > state.user.rub) return tg.showAlert('Недостаточно средств на балансе');

    const payload = { action: 'withdraw_request', amount: amount, details: details };
    state.user.rub -= parseInt(amount);
    saveData();
    render();
    closeModal();
    tg.sendData(JSON.stringify(payload));
};

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
};

window.closeModal = function() { 
    document.querySelectorAll('.overlay').forEach(o => o.classList.remove('active')); 
};

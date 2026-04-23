// ── State ──────────────────────────────────────────────────────────────────
const STORAGE_KEY = 'remi_v2';

let state = {
    firstTime:    true,
    wakeTime:     '06:00',
    sleepTime:    '22:00',
    headings:     ['Personal', 'Important'],
    dailyTasks:   [],   // { id, text, timeRange, done }
    notes:        [],   // { text, heading, timestamp }
    scraps:       [],   // { text, timestamp }
    notesView:    'list',
    theme:        'dark',
    history:      {},   // { dayNum: { total, done } }
    lastResetDay: null  // Tracks the last time tasks were cleared
};

// ── IndexedDB Helpers ────────────────────────────────────────────────────────
const DB_NAME = 'RemiDB';
const DB_VERSION = 1;
const STORE_NAME = 'app_state';

function openDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
        };
        req.onsuccess = (e) => resolve(e.target.result);
        req.onerror = (e) => reject(e.target.error);
    });
}

function getFromDB(key) {
    return openDB().then(db => new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    }));
}

function setToDB(key, val) {
    return openDB().then(db => new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const req = tx.objectStore(STORE_NAME).put(val, key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    }));
}

let history = null;

// ── Helpers ─────────────────────────────────────────────────────────────────
function getDayOfYear() {
    const now   = new Date();
    const start = new Date(now.getFullYear(), 0, 0);
    return Math.floor((now - start) / 86400000);
}

function getDaysInYear() {
    const y = new Date().getFullYear();
    return ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0) ? 366 : 365;
}

function formatTime(t) {
    if (!t) return "";
    const [h, m] = t.split(':').map(Number);
    const ampm   = h >= 12 ? 'pm' : 'am';
    const hr     = h % 12 || 12;
    return `${hr}:${String(m).padStart(2,'0')} ${ampm}`;
}

function getProgress() {
    const now  = new Date();
    const cur  = now.getHours() * 60 + now.getMinutes();
    const [wh, wm] = state.wakeTime.split(':').map(Number);
    const [sh, sm] = state.sleepTime.split(':').map(Number);
    const wake = wh * 60 + wm;
    const sleep= sh * 60 + sm;
    if (cur <= wake)  return 0;
    if (cur >= sleep) return 100;
    return ((cur - wake) / (sleep - wake)) * 100;
}

function getDotColor(dayNum) {
    const today = getDayOfYear();
    if (dayNum > today) return 'future';

    let total = 0, done = 0;
    
    if (dayNum === today) {
        total = state.dailyTasks.length;
        done  = state.dailyTasks.filter(t => t.done).length;
        // Sync history for today
        if (total > 0) state.history[today] = { total, done };
    } else {
        const h = state.history[dayNum];
        if (!h || h.total === 0) return 'past-empty';
        total = h.total;
        done  = h.done;
    }

    if (total === 0) return 'past-empty';
    const missing = total - done;
    if (missing === 0) return 'status-green';
    if (missing === 1) return 'status-yellow';
    if (missing === 2) return 'status-orange';
    return 'status-red';
}

function save()       { setToDB(STORAGE_KEY, state).catch(console.error); }
function pushHistory(){ history = JSON.parse(JSON.stringify(state)); }

function undo() {
    if (!history) return;
    state   = JSON.parse(JSON.stringify(history));
    history = null;
    save();
    renderAll();
    renderDots();
    showToast('Undone ✓');
}

function checkDailyReset() {
    const today = getDayOfYear();
    // If the day has changed since we last recorded a reset
    if (state.lastResetDay && state.lastResetDay !== today) {
        // Record final history for the day that just ended
        const total = state.dailyTasks.length;
        const done  = state.dailyTasks.filter(t => t.done).length;
        if (total > 0) state.history[state.lastResetDay] = { total, done };
        
        // Reset all daily tasks
        state.dailyTasks.forEach(t => t.done = false);
        state.lastResetDay = today;
        
        save();
        renderTasks();
        renderDots();
        console.log("Daily tasks reset for the new day.");
    } else if (!state.lastResetDay) {
        state.lastResetDay = today;
        save();
    }
}

// ── Init ─────────────────────────────────────────────────────────────────────
async function init() {
    let loadedState = null;

    // 1. Try loading from IndexedDB
    try {
        loadedState = await getFromDB(STORAGE_KEY);
    } catch (e) {
        console.error("IDB Load Error", e);
    }

    // 2. Migration: If nothing in IDB, check LocalStorage
    if (!loadedState) {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            console.log("Migrating data from LocalStorage to IndexedDB...");
            loadedState = JSON.parse(raw);
            // Save to IDB immediately to complete migration
            await setToDB(STORAGE_KEY, loadedState);
            // Optionally clear local storage to stay clean (uncomment if certain)
            // localStorage.removeItem(STORAGE_KEY);
        }
    }

    // 3. Apply loaded state
    if (loadedState) {
        state = { ...state, ...loadedState };
        
        if (!state.headings)   state.headings   = ['Personal', 'Important'];
        if (!state.scraps)     state.scraps     = [];
        if (!state.dailyTasks) state.dailyTasks = [];
        if (!state.history)    state.history    = {};
        
        if (state.notes) {
            state.notes.forEach(n => {
                if (!state.headings.includes(n.heading)) {
                    n.heading = 'Personal';
                }
            });
        }
    }

    if (state.firstTime) {
        document.getElementById('onboarding-modal').classList.remove('hidden');
    }

    renderDayCounter();
    renderDots();
    renderTimeBar();
    applyTheme();
    renderAll();
    checkDailyReset();

    setInterval(() => {
        renderTimeBar();
        renderDots();
        checkDailyReset(); // Check for day change every minute
    }, 60000);
}

function renderDayCounter() {
    document.getElementById('day-count').textContent = getDayOfYear();
    document.getElementById('day-total').textContent = '/' + getDaysInYear();
}

function applyTheme() {
    document.body.setAttribute('data-theme', state.theme);
    // Update meta theme-color as well
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
        meta.setAttribute('content', state.theme === 'dark' ? '#0A0A0C' : '#F8FAFC');
    }
}

// ── Day Dots ─────────────────────────────────────────────────────────────────
function renderDots() {
    const wrap  = document.getElementById('day-dots');
    const total = getDaysInYear();
    const today = getDayOfYear();
    wrap.innerHTML = '';

    for (let i = 1; i <= total; i++) {
        const d = document.createElement('div');
        const colorClass = getDotColor(i);
        const isToday = i === today ? ' today' : '';
        d.className = `day-dot ${colorClass}${isToday}`;
        wrap.appendChild(d);
    }
}

// ── Time Bar ─────────────────────────────────────────────────────────────────
function renderTimeBar() {
    document.getElementById('wake-label').textContent  = '↑ ' + formatTime(state.wakeTime);
    document.getElementById('sleep-label').textContent = formatTime(state.sleepTime) + ' ↓';
    document.getElementById('time-progress').style.width = getProgress() + '%';
}

// ── DOM Refs ─────────────────────────────────────────────────────────────────
const settingsModal   = document.getElementById('settings-modal');
const onboardModal    = document.getElementById('onboarding-modal');
const notesContainer  = document.getElementById('notes-container');
const scrapsContainer = document.getElementById('scraps-container');
const tasksContainer  = document.getElementById('tasks-container');
const addTaskForm     = document.getElementById('add-task-form');
const taskInput       = document.getElementById('task-input');
const taskTimeInput   = document.getElementById('task-time');
const noteInput       = document.getElementById('note-input');
const toastEl         = document.getElementById('toast');
const toastMsg        = document.getElementById('toast-msg');
const toastAction     = document.getElementById('toast-action');
const toggleViewBtn   = document.getElementById('toggle-view-btn');

// ── Onboarding ────────────────────────────────────────────────────────────────
document.getElementById('onboard-save').addEventListener('click', () => {
    const w = document.getElementById('onboard-wake').value;
    const s = document.getElementById('onboard-sleep').value;
    if (!w || !s) return showToast('Please set both times');
    state.wakeTime  = w;
    state.sleepTime = s;
    state.firstTime = false;
    save();
    onboardModal.classList.add('hidden');
    renderTimeBar();
});

// ── Settings ──────────────────────────────────────────────────────────────────
document.getElementById('settings-btn').addEventListener('click', () => {
    document.getElementById('settings-wake').value  = state.wakeTime;
    document.getElementById('settings-sleep').value = state.sleepTime;
    document.getElementById('settings-theme').value = state.theme || 'dark';
    renderSettingsHeadings();
    settingsModal.classList.remove('hidden');
});

function renderSettingsHeadings() {
    const list = document.getElementById('settings-headings-list');
    list.innerHTML = '';
    state.headings.forEach((h, i) => {
        const item = document.createElement('div');
        item.className = 'settings-list-item';
        item.innerHTML = `
            <span>${h}</span>
            <button class="remove-heading-btn" onclick="removeHeading(${i})">×</button>
        `;
        list.appendChild(item);
    });
}

window.removeHeading = (i) => {
    const removed = state.headings[i];
    if (state.headings.length <= 1) return showToast("Must have at least one heading");
    
    state.headings.splice(i, 1);
    // Migrate notes that were under this heading to the first remaining one
    state.notes.forEach(n => {
        if (n.heading === removed) n.heading = state.headings[0];
    });
    
    save();
    renderSettingsHeadings();
    renderNotes();
};

document.getElementById('add-heading-btn').addEventListener('click', () => {
    const input = document.getElementById('new-heading-input');
    const name = input.value.trim();
    if (!name) return;
    if (state.headings.includes(name)) return showToast("Heading already exists");
    
    state.headings.push(name);
    input.value = '';
    save();
    renderSettingsHeadings();
});

document.getElementById('close-settings').addEventListener('click', () => {
    settingsModal.classList.add('hidden');
});

document.getElementById('save-settings').addEventListener('click', () => {
    const w = document.getElementById('settings-wake').value;
    const s = document.getElementById('settings-sleep').value;
    const t = document.getElementById('settings-theme').value;
    if (w) state.wakeTime  = w;
    if (s) state.sleepTime = s;
    if (t) state.theme     = t;
    save();
    applyTheme();
    renderTimeBar();
    settingsModal.classList.add('hidden');
    showToast('Settings saved');
});

document.getElementById('update-btn').addEventListener('click', async () => {
    showToast('Checking for updates...');
    if ('serviceWorker' in navigator) {
        try {
            const reg = await navigator.serviceWorker.getRegistration();
            if (reg) {
                await reg.update();
                showToast('Reloading...');
                setTimeout(() => window.location.reload(true), 1000);
            } else {
                window.location.reload(true);
            }
        } catch (e) {
            window.location.reload(true);
        }
    } else {
        window.location.reload(true);
    }
});



// ── Long Press & Context Menu ───────────────────────────────────────────────
let activeMenu = null;

function hideMenu() {
    if (activeMenu) {
        activeMenu.remove();
        activeMenu = null;
    }
}

document.addEventListener('mousedown', (e) => { if (activeMenu && !activeMenu.contains(e.target)) hideMenu(); });
document.addEventListener('touchstart', (e) => { if (activeMenu && !activeMenu.contains(e.target)) hideMenu(); });

function setupLongPress(el, onLongPress) {
    let timer;
    const duration = 2000;

    const start = (e) => {
        if (activeMenu) return;
        el.classList.add('pressing');
        timer = setTimeout(() => {
            el.classList.remove('pressing');
            const touch = e.touches ? e.touches[0] : e;
            onLongPress(touch.clientX, touch.clientY);
        }, duration);
    };

    const cancel = () => {
        clearTimeout(timer);
        el.classList.remove('pressing');
    };

    el.addEventListener('mousedown', start);
    el.addEventListener('touchstart', start);
    el.addEventListener('mouseup', cancel);
    el.addEventListener('mouseleave', cancel);
    el.addEventListener('touchend', cancel);
}

function showContextMenu(x, y, options) {
    hideMenu();
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.left = `${Math.min(x, window.innerWidth - 140)}px`;
    menu.style.top = `${Math.min(y, window.innerHeight - 80)}px`;

    options.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'context-menu-item' + (opt.destructive ? ' destructive' : '');
        btn.textContent = opt.label;
        btn.onclick = () => { opt.action(); hideMenu(); };
        menu.appendChild(btn);
    });

    document.body.appendChild(menu);
    activeMenu = menu;
}

// ── Daily Tasks ───────────────────────────────────────────────────────────────
function renderTasks() {
    tasksContainer.innerHTML = '';
    if (!state.dailyTasks.length) {
        tasksContainer.innerHTML = '<p class="empty-hint">No tasks yet — hit + to add one.</p>';
        return;
    }
    state.dailyTasks.forEach((task, i) => {
        const el = document.createElement('div');
        el.className = 'task-item' + (task.done ? ' done' : '');
        el.innerHTML = `
            <label class="task-label">
                <input type="checkbox" ${task.done ? 'checked' : ''} onchange="toggleTask(${i})">
                <span class="task-text">${task.text}</span>
                ${task.timeRange ? `<span class="task-time">[${task.timeRange}]</span>` : ''}
            </label>`;
        
        setupLongPress(el, (x, y) => {
            showContextMenu(x, y, [
                { label: 'Delete Task', destructive: true, action: () => deleteTask(i) }
            ]);
        });
        
        tasksContainer.appendChild(el);
    });
}

window.toggleTask = (i) => {
    state.dailyTasks[i].done = !state.dailyTasks[i].done;
    save(); renderTasks();
};

window.deleteTask = (i) => {
    pushHistory();
    state.dailyTasks.splice(i, 1);
    save(); renderTasks();
    showToast('Task removed', 'Undo', undo);
};

document.getElementById('add-task-btn').addEventListener('click', () => {
    addTaskForm.classList.toggle('hidden');
    if (!addTaskForm.classList.contains('hidden')) taskInput.focus();
});

document.getElementById('save-task-btn').addEventListener('click', () => {
    const text = taskInput.value.trim();
    if (!text) return;
    state.dailyTasks.push({ id: Date.now(), text, timeRange: taskTimeInput.value.trim(), done: false });
    taskInput.value = '';
    taskTimeInput.value = '';
    addTaskForm.classList.add('hidden');
    save(); renderTasks();
});

taskInput.addEventListener('keypress', e => { if (e.key === 'Enter') document.getElementById('save-task-btn').click(); });

// ── Notes ─────────────────────────────────────────────────────────────────────
const NOTE_COLORS = ['#7B9DFF','#9B65C8','#2ECFBE','#00C4A7','#5B8AFF','#B47FD8'];

function categorize(text) {
    const low = text.toLowerCase();
    if (low.includes('important') || low.includes('imp!') || low.includes('urgent')) return 'Important';
    if (low.includes('personal') || low.includes('me')) return 'Personal';
    
    // Default to Personal if no strong match
    return 'Personal';
}

function renderNotes() {
    notesContainer.className = state.notesView === 'grid' ? 'notes-grid-view' : 'notes-list-view';
    notesContainer.innerHTML = '';

    if (!state.notes.length) {
        notesContainer.innerHTML = '<p class="empty-hint">No notes yet. Organize from Scrap!</p>';
        return;
    }

    if (state.notesView === 'grid') {
        state.notes.forEach((note, i) => {
            const c = document.createElement('div');
            c.className = 'note-grid-card';
            c.style.background = NOTE_COLORS[i % NOTE_COLORS.length];
            c.textContent = note.text;
            
            setupLongPress(c, (x, y) => {
                showContextMenu(x, y, [
                    { label: 'Delete Note', destructive: true, action: () => deleteNote(i) }
                ]);
            });
            
            notesContainer.appendChild(c);
        });
    } else {
        const grouped = {};
        state.headings.forEach(h => grouped[h] = []);
        state.notes.forEach(n => {
            if (!grouped[n.heading]) grouped[n.heading] = [];
            grouped[n.heading].push(n);
        });
        state.headings.forEach(heading => {
            const list = grouped[heading];
            if (!list || !list.length) return;
            const sec = document.createElement('div');
            sec.className = 'note-section';
            sec.ondragover = (e) => { e.preventDefault(); sec.classList.add('drag-over'); };
            sec.ondragleave = () => { sec.classList.remove('drag-over'); };
            sec.ondrop = (e) => {
                e.preventDefault();
                sec.classList.remove('drag-over');
                const noteIndex = e.dataTransfer.getData('noteIndex');
                if (noteIndex !== "") moveNote(parseInt(noteIndex), heading);
            };

            const lbl = document.createElement('div');
            lbl.className = 'note-section-label';
            lbl.textContent = heading;
            sec.appendChild(lbl);
            list.forEach((note, i) => {
                const row = document.createElement('div');
                row.className = 'note-bullet';
                row.draggable = true;
                row.innerHTML = `<span class="bullet">•</span><span>${note.text}</span>`;
                
                row.ondragstart = (e) => {
                    const noteIndex = state.notes.indexOf(note);
                    e.dataTransfer.setData('noteIndex', noteIndex);
                    row.classList.add('is-dragging');
                };
                row.ondragend = () => row.classList.remove('is-dragging');

                setupLongPress(row, (x, y) => {
                    const noteIndex = state.notes.indexOf(note);
                    const moveOptions = state.headings
                        .filter(h => h !== heading)
                        .map(h => ({ label: `Move to ${h}`, action: () => moveNote(noteIndex, h) }));
                    
                    showContextMenu(x, y, [
                        ...moveOptions,
                        { label: 'Delete Note', destructive: true, action: () => deleteNote(noteIndex) }
                    ]);
                });
                
                sec.appendChild(row);
            });
            notesContainer.appendChild(sec);
        });
    }
}

window.moveNote = (i, newHeading) => {
    state.notes[i].heading = newHeading;
    save();
    renderNotes();
    showToast(`Moved to ${newHeading}`);
};

window.deleteNote = (i) => {
    pushHistory();
    state.notes.splice(i, 1);
    save(); renderNotes();
    showToast('Note deleted', 'Undo', undo);
};

toggleViewBtn.addEventListener('click', () => {
    state.notesView = state.notesView === 'list' ? 'grid' : 'list';
    toggleViewBtn.innerHTML = state.notesView === 'list' ? '&#9783;' : '&#9776;';
    save(); renderNotes();
});

// ── Scraps ────────────────────────────────────────────────────────────────────
function renderScraps() {
    scrapsContainer.innerHTML = '';
    if (!state.scraps.length) {
        scrapsContainer.innerHTML = '<p class="empty-hint">Raw thoughts appear here.</p>';
        return;
    }
    state.scraps.forEach((scrap, i) => {
        const row = document.createElement('div');
        row.className = 'scrap-row';
        row.innerHTML = `
            <span class="bullet">•</span>
            <span class="scrap-text">${scrap.text}</span>
            <button class="add-to-btn" onclick="showScrapMenu(event, ${i})">add to +</button>`;
        
        setupLongPress(row, (x, y) => {
            showContextMenu(x, y, [
                { label: 'Discard Scrap', destructive: true, action: () => deleteScrap(i) }
            ]);
        });
        
        scrapsContainer.appendChild(row);
    });
}

window.showScrapMenu = (e, i) => {
    e.stopPropagation();
    const rect = e.target.getBoundingClientRect();
    
    const options = state.headings.map(h => ({
        label: `To ${h}`,
        action: () => archiveScrap(i, h)
    }));
    
    showContextMenu(rect.left, rect.bottom, options);
};

window.archiveScrap = (i, heading) => {
    const scrap = state.scraps[i];
    state.scraps.splice(i, 1);
    const finalHeading = heading || categorize(scrap.text);
    state.notes.unshift({ text: scrap.text, heading: finalHeading, timestamp: Date.now() });
    save(); renderAll();
    showToast('Organized → ' + finalHeading);
};

window.deleteScrap = (i) => {
    pushHistory();
    state.scraps.splice(i, 1);
    save(); renderScraps();
    showToast('Scrap discarded', 'Undo', undo);
};

// ── Input ─────────────────────────────────────────────────────────────────────
function addToScrap() {
    const text = noteInput.value.trim();
    if (!text) return;
    noteInput.value = '';
    state.scraps.unshift({ text, timestamp: Date.now() });
    save(); renderScraps();
    showToast('Dropped in Scrap');
}

document.getElementById('send-btn').addEventListener('click', addToScrap);
noteInput.addEventListener('keypress', e => { if (e.key === 'Enter') addToScrap(); });

// ── Render All ────────────────────────────────────────────────────────────────
function renderAll() { renderNotes(); renderScraps(); renderTasks(); }

// ── Toast ─────────────────────────────────────────────────────────────────────
let toastTimer;
function showToast(msg, actionLabel, actionFn) {
    clearTimeout(toastTimer);
    toastMsg.textContent = msg;
    if (actionLabel && actionFn) {
        toastAction.textContent = actionLabel;
        toastAction.classList.remove('hidden');
        toastAction.onclick = () => { actionFn(); toastEl.classList.add('hidden'); };
    } else {
        toastAction.classList.add('hidden');
    }
    toastEl.classList.remove('hidden');
    toastTimer = setTimeout(() => toastEl.classList.add('hidden'), 5000);
}

// ── Go ────────────────────────────────────────────────────────────────────────
init();

// ── Service Worker ────────────────────────────────────────────────────────────
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then((reg) => console.log('Remi SW registered:', reg.scope))
            .catch((err) => console.warn('Remi SW failed:', err));
    });
}

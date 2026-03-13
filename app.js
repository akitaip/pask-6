const supabaseBrowser = window.supabase || {};
const { createClient } = supabaseBrowser;

const SUPABASE_CONFIG_ENDPOINT = '/api/config';
const BOARD_ROWS = 5;
const BOARD_COLUMNS = 20;
const BOARD_SIZE = BOARD_ROWS * BOARD_COLUMNS;
const DEFAULT_USER_STATS = {
    streak: 0,
    currentCoefficient: 0.01
};

let supabaseClient = null;
let authSubscription = null;
let appRedirectBaseUrl = '';
let pendingAuthSuccessMessage = '';

let gameState = {
    currentUser: null,
    currentUsername: '',
    board: [],
    targetNumber: null,
    targetRow: null,
    targetCol: null,
    currentCoefficient: 0.01,
    totalGuesses: 0,
    streak: 0,
    lastGuessTime: null,
    changeTimer: null,
    guesses: []
};

let coefficientChart = null;
let kpForecastChart = null;

window.showTab = showTab;
window.register = register;
window.login = login;
window.loginWithGoogle = loginWithGoogle;
window.logout = logout;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}

async function initializeApp() {
    try {
        if (typeof createClient !== 'function') {
            throw new Error('Supabase browser bundle neįkeltas');
        }

        setAuthBusy(true);
        await initializeSupabase();
        setupAuthStateListener();
        setupEventListeners();
        await checkAuth();
    } catch (error) {
        console.error('Inicializacijos klaida:', error);
        showAuthSection();
        showError('Nepavyko inicializuoti Supabase. Patikrinkite Vercel aplinkos kintamuosius.');
    } finally {
        setAuthBusy(false);
    }
}

function setupAuthStateListener() {
    if (!supabaseClient) {
        return;
    }

    if (authSubscription) {
        authSubscription.unsubscribe();
        authSubscription = null;
    }

    const { data } = supabaseClient.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_OUT') {
            resetGameState();
            showAuthSection();
            showTab('login');
            showError('');
            return;
        }

        if (!session?.user) {
            return;
        }

        gameState.currentUser = session.user;
        await hydrateCurrentUserProfile();
        await showGameSection();
    });

    authSubscription = data.subscription;
}

async function initializeSupabase() {
    const response = await fetch(SUPABASE_CONFIG_ENDPOINT, {
        cache: 'no-store'
    });

    if (!response.ok) {
        throw new Error(`Config API atsakymas: ${response.status}`);
    }

    const config = await response.json();
    if (!config.supabaseUrl || !config.supabaseAnonKey) {
        throw new Error('Nerasti SUPABASE_URL arba SUPABASE_ANON_KEY');
    }

    appRedirectBaseUrl = config.appUrl || '';

    supabaseClient = createClient(config.supabaseUrl, config.supabaseAnonKey, {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true
        }
    });
}

function setupEventListeners() {
    document.getElementById('login-email').addEventListener('keydown', submitAuthOnEnter);
    document.getElementById('login-password').addEventListener('keydown', submitAuthOnEnter);
    document.getElementById('register-username').addEventListener('keydown', submitAuthOnEnter);
    document.getElementById('register-email').addEventListener('keydown', submitAuthOnEnter);
    document.getElementById('register-password').addEventListener('keydown', submitAuthOnEnter);
}

function submitAuthOnEnter(event) {
    if (event.key !== 'Enter') {
        return;
    }

    const activeTab = document.querySelector('.tab-content.active');
    if (activeTab && activeTab.id === 'login-tab') {
        login();
        return;
    }

    register();
}

function setAuthBusy(isBusy) {
    const authControls = document.querySelectorAll('#auth-section input, #auth-section button');
    authControls.forEach((control) => {
        control.disabled = isBusy;
    });
}

function showTab(tab) {
    document.querySelectorAll('.tab-btn').forEach((btn) => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach((content) => content.classList.remove('active'));

    if (tab === 'login') {
        document.querySelector('.tab-btn').classList.add('active');
        document.getElementById('login-tab').classList.add('active');
        return;
    }

    document.querySelectorAll('.tab-btn')[1].classList.add('active');
    document.getElementById('register-tab').classList.add('active');
}

async function checkAuth() {
    let { data, error } = await supabaseClient.auth.getSession();
    if (error) {
        throw error;
    }

    let session = data.session;
    const hasAuthHash = window.location.hash.includes('access_token=') || window.location.hash.includes('refresh_token=');
    const isSignupVerification = window.location.hash.includes('type=signup');

    if (!session?.user && hasAuthHash) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        ({ data, error } = await supabaseClient.auth.getSession());
        if (error) {
            throw error;
        }
        session = data.session;
    }

    if (!session?.user) {
        if (isSignupVerification) {
            showError('El. paštas patvirtintas. Prisijunkite su savo el. paštu ir slaptažodžiu.', 'success');
            window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
        }
        showAuthSection();
        return;
    }

    if (isSignupVerification) {
        pendingAuthSuccessMessage = 'El. paštas patvirtintas sėkmingai. Galite naudotis programa.';
        window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
    }

    gameState.currentUser = session.user;
    await hydrateCurrentUserProfile();
    await showGameSection();
}

function getEmailRedirectUrl() {
    const fallbackUrl = `${window.location.origin}${window.location.pathname}`;
    if (!appRedirectBaseUrl) {
        return fallbackUrl;
    }

    const normalizedBase = appRedirectBaseUrl.endsWith('/')
        ? appRedirectBaseUrl.slice(0, -1)
        : appRedirectBaseUrl;

    return `${normalizedBase}${window.location.pathname}`;
}

async function hydrateCurrentUserProfile() {
    if (!gameState.currentUser) {
        gameState.currentUsername = '';
        return;
    }

    const { data, error } = await supabaseClient
        .from('profiles')
        .select('username')
        .eq('id', gameState.currentUser.id)
        .maybeSingle();

    if (error) {
        console.error('Nepavyko užkrauti profilio:', error);
    }

    gameState.currentUsername = data?.username || gameState.currentUser.user_metadata?.username || gameState.currentUser.email?.split('@')[0] || 'Žaidėjas';
}

function showAuthSection() {
    stopGameCycle();
    destroyChart();
    destroyKpForecastChart();
    document.getElementById('auth-section').classList.remove('hidden');
    document.getElementById('game-section').classList.add('hidden');
}

async function showGameSection() {
    document.getElementById('auth-section').classList.add('hidden');
    document.getElementById('game-section').classList.remove('hidden');
    document.getElementById('current-username').textContent = gameState.currentUsername;

    try {
        await loadUserData();
    } catch (error) {
        console.error('Nepavyko užkrauti vartotojo duomenų:', error);
        gameState.guesses = [];
        gameState.totalGuesses = 0;
        gameState.currentCoefficient = DEFAULT_USER_STATS.currentCoefficient;
        gameState.streak = DEFAULT_USER_STATS.streak;
    }

    initializeGame();
    updateStats();
    startGameCycle();

    try {
        initializeChart();
    } catch (error) {
        console.error('Nepavyko inicializuoti grafiko:', error);
    }

    fetchMoonPhase().catch((error) => {
        console.error('Nepavyko užkrauti mėnulio fazės:', error);
    });

    fetchSolarActivity().catch((error) => {
        console.error('Nepavyko užkrauti saulės aktyvumo:', error);
    });

    if (pendingAuthSuccessMessage) {
        alert(pendingAuthSuccessMessage);
        pendingAuthSuccessMessage = '';
    }
}

function calculateMoonPhase() {
    const date = new Date();
    let year = date.getFullYear();
    let month = date.getMonth() + 1;
    const day = date.getDate();

    let c = 0;
    let e = 0;
    let jd = 0;
    let b = 0;

    if (month < 3) {
        year--;
        month += 12;
    }

    ++month;
    c = 365.25 * year;
    e = 30.6 * month;
    jd = c + e + day - 694039.09;
    jd /= 29.5305882;
    b = Number.parseInt(jd, 10);
    jd -= b;
    b = Math.round(jd * 8);

    if (b >= 8) {
        b = 0;
    }

    const phase = jd * 29.5305882;
    const illumination = ((1 - Math.cos(2 * Math.PI * jd)) / 2) * 100;

    return {
        phaseIndex: b,
        illumination: Math.round(illumination * 10) / 10,
        daysSinceNew: Math.round(phase * 10) / 10
    };
}

async function fetchMoonPhase() {
    const moonPhaseContent = document.getElementById('moon-phase-content');
    const moonPhaseError = document.getElementById('moon-phase-error');
    const phaseToIndex = {
        'New Moon': 0,
        'Waxing Crescent': 1,
        'First Quarter': 2,
        'Waxing Gibbous': 3,
        'Full Moon': 4,
        'Waning Gibbous': 5,
        'Last Quarter': 6,
        'Waning Crescent': 7
    };

    try {
        moonPhaseContent.innerHTML = '<div class="loading">Kraunama...</div>';
        moonPhaseError.textContent = '';

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);

        const response = await fetch('https://api.phaseofthemoontoday.com/v1/current', {
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`API klaida: ${response.status}`);
        }

        const data = await response.json();
        const moonData = {
            phaseIndex: phaseToIndex[data.phase] ?? calculateMoonPhase().phaseIndex,
            illumination: typeof data.illumination === 'number' ? Math.round(data.illumination * 10) / 10 : 0,
            daysSinceNew: typeof data.days_since_new === 'number' ? Math.round(data.days_since_new * 10) / 10 : 0
        };

        displayMoonPhase(moonData);
    } catch (error) {
        console.error('Mėnulio fazės API klaida, naudojamas lokalus skaičiavimas:', error);
        const fallbackMoonData = calculateMoonPhase();
        displayMoonPhase(fallbackMoonData);
        moonPhaseError.textContent = '';
    }
}

function displayMoonPhase(data) {
    const moonPhaseContent = document.getElementById('moon-phase-content');
    const phases = [
        { name: 'Jaunatis', emoji: '🌑' },
        { name: 'Jaunatis (augantis pjautuvas)', emoji: '🌒' },
        { name: 'Pirmas ketvirtis', emoji: '🌓' },
        { name: 'Augantis kuprė', emoji: '🌔' },
        { name: 'Pilnatis', emoji: '🌕' },
        { name: 'Mažėjantis kuprė', emoji: '🌖' },
        { name: 'Paskutinis ketvirtis', emoji: '🌗' },
        { name: 'Senatis (mažėjantis pjautuvas)', emoji: '🌘' }
    ];

    const currentPhase = phases[data.phaseIndex];

    moonPhaseContent.innerHTML = `
        <div class="moon-phase-info">
            <div class="moon-emoji">${currentPhase.emoji}</div>
            <div class="moon-details">
                <p><strong>Fazė:</strong> ${currentPhase.name}</p>
                <p><strong>Apšviestumas:</strong> ${data.illumination}%</p>
                <p><strong>Dienų nuo jaunaties:</strong> ${data.daysSinceNew}</p>
            </div>
        </div>
    `;
}

function formatMetric(value, digits = 2) {
    if (!Number.isFinite(value)) {
        return 'N/A';
    }
    return value.toFixed(digits);
}

async function fetchSolarActivity() {
    const solarContent = document.getElementById('solar-activity-content');
    const solarError = document.getElementById('solar-activity-error');

    try {
        solarContent.innerHTML = '<div class="loading">Kraunama...</div>';
        solarError.textContent = '';

        const response = await fetch('/api/space-weather', {
            cache: 'no-store'
        });

        if (!response.ok) {
            throw new Error(`Space weather API klaida: ${response.status}`);
        }

        const payload = await response.json();
        const metrics = payload.metrics || {};
        const kpForecast = payload.kpForecast || { labels: [], observed: [], estimated: [] };
        const availableSources = Number.isFinite(payload.availableSources) ? payload.availableSources : 0;
        const totalSources = Number.isFinite(payload.totalSources) ? payload.totalSources : 5;

        displaySolarActivity(metrics, availableSources, totalSources);
        renderKpForecastChart(kpForecast);

        if (availableSources < totalSources) {
            solarError.textContent = `Dalis NOAA šaltinių nepasiekiami (${availableSources}/${totalSources}).`;
        }
    } catch (error) {
        console.error('Saulės aktyvumo API klaida:', error);
        solarContent.innerHTML = '<div class="solar-empty">Saulės aktyvumo duomenų įkelti nepavyko.</div>';
        destroyKpForecastChart();
        solarError.textContent = 'Space weather API laikinai nepasiekiamas.';
    }
}

function displaySolarActivity(data, availableSources, totalSources) {
    const solarContent = document.getElementById('solar-activity-content');

    solarContent.innerHTML = `
        <div class="solar-activity-info">
            <p><strong>Radio flux (2695):</strong> ${formatMetric(data.solarRadioFlux2695, 1)} sfu</p>
            <p><strong>Observed SSN:</strong> ${formatMetric(data.observedSsn, 1)}</p>
            <p><strong>Predicted SSN:</strong> ${formatMetric(data.predictedSsn, 1)}</p>
            <p><strong>Predicted F10.7:</strong> ${formatMetric(data.predictedF107, 1)} sfu</p>
            <p><strong>Electron fluence:</strong> ${formatMetric(data.electronFluence, 0)}</p>
            <p><strong>Forecast speed:</strong> ${formatMetric(data.electronForecastSpeed, 1)} km/s</p>
            <p><strong>Šaltiniai:</strong> ${availableSources}/${totalSources}</p>
        </div>
    `;
}

function destroyKpForecastChart() {
    if (kpForecastChart) {
        kpForecastChart.destroy();
        kpForecastChart = null;
    }
}

function renderKpForecastChart(kpForecast) {
    const chartCanvas = document.getElementById('kp-forecast-chart');
    if (!chartCanvas || !window.Chart) {
        return;
    }

    const labels = Array.isArray(kpForecast.labels) ? kpForecast.labels : [];
    const observed = Array.isArray(kpForecast.observed) ? kpForecast.observed : [];
    const estimated = Array.isArray(kpForecast.estimated) ? kpForecast.estimated : [];

    destroyKpForecastChart();

    if (labels.length === 0) {
        return;
    }

    const ctx = chartCanvas.getContext('2d');
    kpForecastChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Kp observed',
                    data: observed,
                    borderColor: 'rgb(102, 126, 234)',
                    backgroundColor: 'rgba(102, 126, 234, 0.15)',
                    tension: 0.25,
                    pointRadius: 1,
                    spanGaps: true
                },
                {
                    label: 'Kp estimated',
                    data: estimated,
                    borderColor: 'rgb(229, 46, 113)',
                    backgroundColor: 'rgba(229, 46, 113, 0.15)',
                    borderDash: [5, 4],
                    tension: 0.25,
                    pointRadius: 1,
                    spanGaps: true
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    mode: 'index',
                    intersect: false
                }
            },
            scales: {
                y: {
                    min: 0,
                    max: 9,
                    ticks: {
                        stepSize: 3,
                        font: {
                            size: 9
                        }
                    },
                    grid: {
                        color: 'rgba(0,0,0,0.08)'
                    }
                },
                x: {
                    ticks: {
                        maxTicksLimit: 6,
                        font: {
                            size: 9
                        }
                    },
                    grid: {
                        display: false
                    }
                }
            }
        }
    });
}

async function register() {
    const username = document.getElementById('register-username').value.trim();
    const password = document.getElementById('register-password').value;
    const email = document.getElementById('register-email').value.trim();

    if (!username || !password || !email) {
        showError('Prašome užpildyti visus laukus');
        return;
    }

    try {
        setAuthBusy(true);
        showError('');

        const { data, error } = await supabaseClient.auth.signUp({
            email,
            password,
            options: {
                emailRedirectTo: getEmailRedirectUrl(),
                data: {
                    username
                }
            }
        });

        if (error) {
            throw error;
        }

        document.getElementById('register-username').value = '';
        document.getElementById('register-password').value = '';
        document.getElementById('register-email').value = '';

        if (data.session?.user) {
            gameState.currentUser = data.session.user;
            await hydrateCurrentUserProfile();
            showError('', 'success');
            await showGameSection();
            return;
        }

        showError('Registracija sėkminga. Patikrinkite el. paštą ir patvirtinkite paskyrą.', 'success');
        showTab('login');
    } catch (error) {
        console.error('Registracijos klaida:', error);
        showError(normalizeAuthError(error.message || 'Registracija nepavyko'));
    } finally {
        setAuthBusy(false);
    }
}

async function login() {
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;

    if (!email || !password) {
        showError('Prašome įvesti el. paštą ir slaptažodį');
        return;
    }

    try {
        setAuthBusy(true);
        showError('');

        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email,
            password
        });

        if (error) {
            throw error;
        }

        gameState.currentUser = data.user;
        await hydrateCurrentUserProfile();
        showError('', 'success');
        await showGameSection();
    } catch (error) {
        console.error('Prisijungimo klaida:', error);
        showError(normalizeAuthError(error.message || 'Prisijungimas nepavyko'));
    } finally {
        setAuthBusy(false);
    }
}

async function loginWithGoogle() {
    try {
        setAuthBusy(true);
        showError('');

        const { error } = await supabaseClient.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: getEmailRedirectUrl()
            }
        });

        if (error) {
            throw error;
        }
    } catch (error) {
        console.error('Google prisijungimo klaida:', error);
        showError(normalizeAuthError(error.message || 'Google prisijungimas nepavyko'));
        setAuthBusy(false);
    }
}

async function logout() {
    try {
        if (gameState.currentUser) {
            await saveUserStats();
        }

        await supabaseClient.auth.signOut();
    } catch (error) {
        console.error('Atsijungimo klaida:', error);
    } finally {
        resetGameState();
        showAuthSection();
        showTab('login');
        showError('');
    }
}

function resetGameState() {
    gameState = {
        currentUser: null,
        currentUsername: '',
        board: [],
        targetNumber: null,
        targetRow: null,
        targetCol: null,
        currentCoefficient: 0.01,
        totalGuesses: 0,
        streak: 0,
        lastGuessTime: null,
        changeTimer: null,
        guesses: []
    };
}

function normalizeAuthError(message) {
    if (message.includes('User already registered')) {
        return 'Vartotojas su šiuo el. paštu jau egzistuoja';
    }
    if (message.includes('Invalid login credentials')) {
        return 'Neteisingas el. paštas arba slaptažodis';
    }
    if (message.includes('Email not confirmed')) {
        return 'El. paštas dar nepatvirtintas';
    }
    return message;
}

function showError(message, type = 'error') {
    const errorEl = document.getElementById('auth-error');
    errorEl.textContent = message;
    errorEl.style.color = type === 'success' ? '#4caf50' : '#e74c3c';
}

function initializeGame() {
    generateBoard();
    renderBoard();
    selectNewTarget();
    initializeColorIndicator();
}

function initializeColorIndicator() {
    const indicator = document.getElementById('color-indicator');
    const hue = Math.floor(Math.random() * 360);
    indicator.style.backgroundColor = `hsl(${hue}, 70%, 50%)`;
}

function generateBoard() {
    const numbers = Array.from({ length: BOARD_SIZE }, (_, index) => index);
    shuffleArray(numbers);

    gameState.board = [];
    for (let row = 0; row < BOARD_ROWS; row++) {
        gameState.board[row] = [];
        for (let col = 0; col < BOARD_COLUMNS; col++) {
            gameState.board[row][col] = numbers[row * BOARD_COLUMNS + col];
        }
    }
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

function renderBoard() {
    const boardEl = document.getElementById('game-board');
    boardEl.innerHTML = '';
    boardEl.style.gridTemplateColumns = `repeat(${BOARD_COLUMNS}, minmax(0, 1fr))`;

    for (let row = 0; row < BOARD_ROWS; row++) {
        for (let col = 0; col < BOARD_COLUMNS; col++) {
            const cell = document.createElement('div');
            cell.className = 'game-cell';
            cell.textContent = gameState.board[row][col];
            cell.dataset.row = row;
            cell.dataset.col = col;
            cell.onclick = () => {
                handleCellClick(row, col);
            };
            boardEl.appendChild(cell);
        }
    }
}

function selectNewTarget() {
    gameState.targetRow = Math.floor(Math.random() * BOARD_ROWS);
    gameState.targetCol = Math.floor(Math.random() * BOARD_COLUMNS);
    gameState.targetNumber = gameState.board[gameState.targetRow][gameState.targetCol];
}

function startGameCycle() {
    stopGameCycle();
    changeColor();
    gameState.changeTimer = setInterval(() => {
        changeColor();
        selectNewTarget();
        clearFeedback();
    }, 3000);
}

function stopGameCycle() {
    if (gameState.changeTimer) {
        clearInterval(gameState.changeTimer);
        gameState.changeTimer = null;
    }
}

function changeColor() {
    const indicator = document.getElementById('color-indicator');
    const board = document.getElementById('game-board');
    const hue = Math.floor(Math.random() * 360);
    indicator.style.backgroundColor = `hsl(${hue}, 70%, 50%)`;

    indicator.classList.add('changing');
    board.classList.add('changing');

    setTimeout(() => {
        indicator.classList.remove('changing');
        board.classList.remove('changing');
    }, 500);
}

async function handleCellClick(row, col) {
    if (!gameState.currentUser) {
        return;
    }

    const clickedNumber = gameState.board[row][col];
    const now = new Date();

    let points = 0;
    const feedback = [];

    if (clickedNumber === gameState.targetNumber) {
        points += 1;
        feedback.push('Skaičius: ✓');
    } else {
        feedback.push('Skaičius: ✗');
    }

    if (row === gameState.targetRow) {
        points += 0.1;
        feedback.push('Eilutė: ✓');
    } else {
        feedback.push('Eilutė: ✗');
    }

    if (col === gameState.targetCol) {
        points += 0.1;
        feedback.push('Stulpelis: ✓');
    } else {
        feedback.push('Stulpelis: ✗');
    }

    let coefficient = calculateCoefficient(points);
    const numberCorrect = clickedNumber === gameState.targetNumber;
    if (numberCorrect) {
        gameState.streak++;
        if (gameState.streak >= 2) {
            coefficient *= 4;
            feedback.push('🎉 Streak x4!');
        }
    } else {
        gameState.streak = 0;
    }

    coefficient = Math.max(0.01, Math.min(1, coefficient));

    gameState.currentCoefficient = coefficient;
    gameState.totalGuesses++;
    gameState.lastGuessTime = now;

    const guess = {
        timestamp: now.toISOString(),
        coefficient,
        points,
        guessedNumber: clickedNumber,
        targetNumber: gameState.targetNumber,
        guessedRow: row,
        targetRow: gameState.targetRow,
        guessedCol: col,
        targetCol: gameState.targetCol
    };

    gameState.guesses.push(guess);

    try {
        await Promise.all([
            saveGuess(guess),
            saveUserStats()
        ]);
    } catch (error) {
        console.error('Nepavyko išsaugoti spėjimo arba statistikos:', error);
    }

    showFeedback(feedback, points);
    updateStats();
    updateChart();
    markCell(row, col, points > 0);

    setTimeout(() => {
        generateBoard();
        renderBoard();
        selectNewTarget();
        changeColor();
    }, 500);
}

function calculateCoefficient(points) {
    const normalizedPoints = points / 1.2;
    return 0.01 + (normalizedPoints * 0.99);
}

function markCell(row, col, correct) {
    const cells = document.querySelectorAll('.game-cell');
    const cellIndex = row * BOARD_COLUMNS + col;
    const cell = cells[cellIndex];

    cell.classList.add('clicked');
    if (!correct) {
        cell.classList.add('wrong');
    }

    setTimeout(() => {
        cell.classList.remove('clicked', 'wrong');
    }, 2000);
}

function showFeedback(feedback, points) {
    const feedbackEl = document.getElementById('guess-feedback');
    feedbackEl.innerHTML = feedback.join(' | ');

    if (points >= 1) {
        feedbackEl.className = 'guess-feedback success';
    } else if (points > 0) {
        feedbackEl.className = 'guess-feedback partial';
    } else {
        feedbackEl.className = 'guess-feedback fail';
    }
}

function clearFeedback() {
    const feedbackEl = document.getElementById('guess-feedback');
    feedbackEl.textContent = '';
    feedbackEl.className = 'guess-feedback';
}

async function loadUserData() {
    if (!gameState.currentUser) {
        return;
    }

    const [guessesResult, statsResult] = await Promise.all([
        supabaseClient
            .from('guesses')
            .select('created_at, coefficient, points, guessed_number, target_number, guessed_row, target_row, guessed_col, target_col')
            .eq('user_id', gameState.currentUser.id)
            .order('created_at', { ascending: true }),
        supabaseClient
            .from('user_stats')
            .select('streak, current_coefficient')
            .eq('user_id', gameState.currentUser.id)
            .maybeSingle()
    ]);

    if (guessesResult.error) {
        throw guessesResult.error;
    }
    if (statsResult.error) {
        throw statsResult.error;
    }

    const guesses = (guessesResult.data || []).map((guess) => ({
        timestamp: guess.created_at,
        coefficient: Number(guess.coefficient),
        points: Number(guess.points),
        guessedNumber: guess.guessed_number,
        targetNumber: guess.target_number,
        guessedRow: guess.guessed_row,
        targetRow: guess.target_row,
        guessedCol: guess.guessed_col,
        targetCol: guess.target_col
    }));

    const userStats = statsResult.data
        ? {
            streak: statsResult.data.streak,
            currentCoefficient: Number(statsResult.data.current_coefficient)
        }
        : DEFAULT_USER_STATS;

    gameState.guesses = guesses;
    gameState.totalGuesses = guesses.length;

    if (guesses.length > 0) {
        gameState.currentCoefficient = guesses[guesses.length - 1].coefficient;
        gameState.streak = calculateStreakFromHistory(guesses);
        return;
    }

    gameState.currentCoefficient = userStats.currentCoefficient || DEFAULT_USER_STATS.currentCoefficient;
    gameState.streak = userStats.streak || DEFAULT_USER_STATS.streak;
}

async function saveGuess(guess) {
    if (!gameState.currentUser) {
        return;
    }

    const { error } = await supabaseClient
        .from('guesses')
        .insert({
            user_id: gameState.currentUser.id,
            guessed_number: guess.guessedNumber,
            target_number: guess.targetNumber,
            guessed_row: guess.guessedRow,
            target_row: guess.targetRow,
            guessed_col: guess.guessedCol,
            target_col: guess.targetCol,
            points: guess.points,
            coefficient: guess.coefficient,
            created_at: guess.timestamp
        });

    if (error) {
        throw error;
    }
}

async function saveUserStats() {
    if (!gameState.currentUser) {
        return;
    }

    const { error } = await supabaseClient
        .from('user_stats')
        .upsert({
            user_id: gameState.currentUser.id,
            streak: gameState.streak,
            current_coefficient: gameState.currentCoefficient,
            updated_at: new Date().toISOString()
        }, {
            onConflict: 'user_id'
        });

    if (error) {
        throw error;
    }
}

function calculateStreakFromHistory(guesses) {
    if (guesses.length === 0) return 0;

    let streak = 0;
    for (let i = guesses.length - 1; i >= 0; i--) {
        const guess = guesses[i];
        if (guess.guessedNumber === guess.targetNumber) {
            streak++;
        } else {
            break;
        }
    }

    return streak;
}

function updateStats() {
    document.getElementById('current-coefficient').textContent = gameState.currentCoefficient.toFixed(3);
    document.getElementById('total-guesses').textContent = gameState.totalGuesses;
    document.getElementById('streak-count').textContent = gameState.streak;

    const milestones = [25, 50, 75, 100];
    const avgEl = document.getElementById('average-coefficient');

    if (gameState.totalGuesses >= 25) {
        const avg = gameState.guesses.reduce((sum, guess) => sum + guess.coefficient, 0) / gameState.guesses.length;
        avgEl.textContent = avg.toFixed(3);

        if (milestones.includes(gameState.totalGuesses)) {
            setTimeout(() => {
                alert(`Pasiektas ${gameState.totalGuesses} spėjimų milestone! Vidutinis koeficientas: ${avg.toFixed(3)}`);
            }, 100);
        }
    } else {
        avgEl.textContent = '-';
    }
}

function initializeChart() {
    destroyChart();
    const ctx = document.getElementById('coefficient-chart').getContext('2d');

    const guesses = gameState.guesses;
    const labels = guesses.map((guess) => {
        const date = new Date(guess.timestamp);
        return date.toLocaleString('lt-LT');
    });
    const coefficients = guesses.map((guess) => guess.coefficient);
    const predictionData = calculatePrediction(guesses);

    coefficientChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [...labels, ...predictionData.labels],
            datasets: [
                {
                    label: 'Sėkmės koeficientas (istorija)',
                    data: [...coefficients, ...new Array(predictionData.values.length).fill(null)],
                    borderColor: 'rgb(102, 126, 234)',
                    backgroundColor: 'rgba(102, 126, 234, 0.1)',
                    tension: 0.4,
                    fill: true,
                    pointRadius: 4,
                    pointHoverRadius: 6
                },
                {
                    label: 'Prognozė (15 min į priekį)',
                    data: [...new Array(coefficients.length).fill(null), ...predictionData.values],
                    borderColor: 'rgb(255, 99, 132)',
                    backgroundColor: 'rgba(255, 99, 132, 0.2)',
                    borderDash: [8, 4],
                    borderWidth: 3,
                    tension: 0.4,
                    fill: true,
                    pointRadius: 3,
                    pointHoverRadius: 5,
                    pointStyle: 'circle'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            scales: {
                y: {
                    beginAtZero: false,
                    min: 0,
                    max: 1,
                    title: {
                        display: true,
                        text: 'Koeficientas'
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: 'Laikas'
                    },
                    ticks: {
                        maxRotation: 45,
                        minRotation: 45
                    }
                }
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top'
                },
                tooltip: {
                    mode: 'index',
                    intersect: false
                }
            }
        }
    });
}

function destroyChart() {
    if (coefficientChart) {
        coefficientChart.destroy();
        coefficientChart = null;
    }
}

function calculatePrediction(guesses) {
    if (guesses.length < 4) {
        return { labels: [], values: [] };
    }

    const n = guesses.length;
    const values = guesses.map((guess) => guess.coefficient);
    const lastTime = new Date(guesses[guesses.length - 1].timestamp);
    const lastTimeMs = lastTime.getTime();

    const mean = values.reduce((a, b) => a + b, 0) / n;
    const normalizedValues = values.map((value) => value - mean);

    const maxLag = Math.min(Math.floor(n / 2), 30);
    const autocorrelations = [];

    for (let lag = 1; lag <= maxLag; lag++) {
        let correlation = 0;
        let count = 0;

        for (let i = 0; i < n - lag; i++) {
            correlation += normalizedValues[i] * normalizedValues[i + lag];
            count++;
        }

        if (count > 0) {
            const variance = normalizedValues.reduce((sum, value) => sum + value * value, 0) / n;
            const normalizedCorrelation = variance > 0 ? correlation / (count * variance) : 0;
            autocorrelations.push({
                lag,
                correlation: normalizedCorrelation
            });
        }
    }

    const significantCycles = autocorrelations
        .filter((entry) => Math.abs(entry.correlation) > 0.3)
        .sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation))
        .slice(0, 3);

    const timeDiffs = [];
    for (let i = 1; i < guesses.length; i++) {
        const time1 = new Date(guesses[i - 1].timestamp).getTime();
        const time2 = new Date(guesses[i].timestamp).getTime();
        const diffMs = time2 - time1;
        if (diffMs > 0 && diffMs < 10 * 60 * 1000) {
            timeDiffs.push(diffMs / 1000 / 60);
        }
    }

    const avgTimeBetweenGuesses = timeDiffs.length > 0
        ? timeDiffs.reduce((a, b) => a + b, 0) / timeDiffs.length
        : 1;

    let cyclePeriod = null;
    let cycleFrequency = null;
    let cycleAmplitude = 0;
    let cyclePhase = 0;

    if (significantCycles.length > 0) {
        const mainCycle = significantCycles[0];
        cyclePeriod = mainCycle.lag;
        cycleFrequency = 1 / cyclePeriod;

        const cycleLength = cyclePeriod;
        const cycles = Math.floor(n / cycleLength);

        if (cycles > 0) {
            const cycleValues = [];
            for (let cycleIndex = 0; cycleIndex < cycles; cycleIndex++) {
                const cycleStart = cycleIndex * cycleLength;
                const cycleEnd = Math.min(cycleStart + cycleLength, n);
                const cycleData = values.slice(cycleStart, cycleEnd);
                if (cycleData.length > 0) {
                    const cycleMax = Math.max(...cycleData);
                    const cycleMin = Math.min(...cycleData);
                    cycleValues.push({ amplitude: cycleMax - cycleMin });
                }
            }

            if (cycleValues.length > 0) {
                cycleAmplitude = cycleValues.reduce((sum, cycle) => sum + cycle.amplitude, 0) / cycleValues.length;
            }
        }

        const positionInCycle = n % cyclePeriod;
        cyclePhase = (positionInCycle / cyclePeriod) * 2 * Math.PI;
    } else {
        const maxValue = Math.max(...values);
        const minValue = Math.min(...values);
        cycleAmplitude = (maxValue - minValue) / 2;
        cyclePeriod = n;
        cycleFrequency = 1 / cyclePeriod;
    }

    const lastValue = values[values.length - 1];
    const secondLastValue = values.length > 1 ? values[values.length - 2] : lastValue;
    const trend = lastValue - secondLastValue;

    const predictionLabels = [];
    const predictionValues = [];

    for (let i = 1; i <= 15; i++) {
        const futureTime = new Date(lastTimeMs + i * 60 * 1000);
        predictionLabels.push(futureTime.toLocaleString('lt-LT'));

        const guessesInFuture = i / avgTimeBetweenGuesses;

        let predictedValue = mean;

        if (cyclePeriod && cycleAmplitude > 0) {
            const futurePhase = cyclePhase + (guessesInFuture * 2 * Math.PI * cycleFrequency);
            const cycleComponent = Math.sin(futurePhase) * cycleAmplitude;
            predictedValue = mean + cycleComponent;
            predictedValue += trend * guessesInFuture * 0.1;
        } else {
            predictedValue = lastValue + trend * guessesInFuture;
            if (cycleAmplitude > 0) {
                const randomPhase = (guessesInFuture * 0.1) % (2 * Math.PI);
                predictedValue += Math.sin(randomPhase) * cycleAmplitude * 0.3;
            }
        }

        predictedValue = predictedValue * 0.7 + lastValue * 0.3;
        predictionValues.push(Math.max(0.01, Math.min(1, predictedValue)));
    }

    return {
        labels: predictionLabels,
        values: predictionValues
    };
}

function updateChart() {
    if (!coefficientChart) return;

    const guesses = gameState.guesses;
    const labels = guesses.map((guess) => {
        const date = new Date(guess.timestamp);
        return date.toLocaleString('lt-LT');
    });
    const coefficients = guesses.map((guess) => guess.coefficient);
    const predictionData = calculatePrediction(guesses);

    coefficientChart.data.labels = [...labels, ...predictionData.labels];
    coefficientChart.data.datasets[0].data = [...coefficients, ...new Array(predictionData.values.length).fill(null)];
    coefficientChart.data.datasets[1].data = [...new Array(coefficients.length).fill(null), ...predictionData.values];
    coefficientChart.update();
}

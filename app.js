// Duomenų bazė (localStorage)
const DB = {
    users: 'success_coefficient_users',
    guesses: 'success_coefficient_guesses',
    userStats: 'success_coefficient_user_stats',
    
    getUsers() {
        const data = localStorage.getItem(this.users);
        return data ? JSON.parse(data) : {};
    },
    
    saveUsers(users) {
        localStorage.setItem(this.users, JSON.stringify(users));
    },
    
    getGuesses(username) {
        const data = localStorage.getItem(`${this.guesses}_${username}`);
        return data ? JSON.parse(data) : [];
    },
    
    saveGuesses(username, guesses) {
        localStorage.setItem(`${this.guesses}_${username}`, JSON.stringify(guesses));
    },
    
    addGuess(username, guess) {
        const guesses = this.getGuesses(username);
        guesses.push(guess);
        this.saveGuesses(username, guesses);
    },
    
    getUserStats(username) {
        const data = localStorage.getItem(`${this.userStats}_${username}`);
        return data ? JSON.parse(data) : { streak: 0, currentCoefficient: 0.01 };
    },
    
    saveUserStats(username, stats) {
        localStorage.setItem(`${this.userStats}_${username}`, JSON.stringify(stats));
    }
};

// Žaidimo būsena
let gameState = {
    currentUser: null,
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

// Chart.js grafikas
let coefficientChart = null;

// Euromillions API (https://euromillions.api.pedromealha.dev, dokumentacija: https://euromillios-api.readme.io)
const EUROMILLIONS_API_BASE = 'https://euromillions.api.pedromealha.dev';

// Inicializacija
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    setupEventListeners();
    loadLuckyNumbers();
});

// Šio mėnesio laimingiausi 10 skaičių iš Euromillions API
async function loadLuckyNumbers() {
    const loadingEl = document.getElementById('lucky-numbers-loading');
    const listEl = document.getElementById('lucky-numbers-list');
    const errorEl = document.getElementById('lucky-numbers-error');
    if (!loadingEl || !listEl || !errorEl) return;

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startStr = firstDay.toISOString().slice(0, 10);
    const endStr = lastDay.toISOString().slice(0, 10);
    const url = `${EUROMILLIONS_API_BASE}/v1/draws?dates=${startStr},${endStr}`;

    try {
        listEl.classList.add('hidden');
        errorEl.classList.add('hidden');
        loadingEl.classList.remove('hidden');

        const res = await fetch(url);
        if (!res.ok) throw new Error(`API atsakymas: ${res.status}`);
        const data = await res.json();
        const draws = Array.isArray(data) ? data : (data.draws || data.data || []);

        const countByNumber = {};
        for (const draw of draws) {
            const numbers = draw && draw.numbers ? draw.numbers : [];
            for (const n of numbers) {
                const key = Number(n);
                if (!isNaN(key)) countByNumber[key] = (countByNumber[key] || 0) + 1;
            }
        }

        const sorted = Object.entries(countByNumber)
            .map(([num, count]) => ({ num: parseInt(num, 10), count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);

        loadingEl.classList.add('hidden');
        if (sorted.length === 0) {
            listEl.innerHTML = '<p class="lucky-no-data">Šio mėnesio traukimų dar nėra.</p>';
        } else {
            listEl.innerHTML = sorted
                .map(({ num, count }, i) =>
                    `<span class="lucky-item-wrapper"><span class="lucky-number">${i + 1}.</span><span class="lucky-item" title="Pasikartojimų: ${count}">${num}</span></span>`
                )
                .join('');
        }
        listEl.classList.remove('hidden');
    } catch (err) {
        loadingEl.classList.add('hidden');
        listEl.classList.add('hidden');
        errorEl.textContent = 'Nepavyko gauti duomenų: ' + (err.message || 'nežinoma klaida');
        errorEl.classList.remove('hidden');
    }
}

function checkAuth() {
    const currentUser = localStorage.getItem('current_user');
    if (currentUser) {
        gameState.currentUser = currentUser;
        showGameSection();
    } else {
        showAuthSection();
    }
}

function setupEventListeners() {
    // Tab perjungimas
    window.showTab = function(tab) {
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
        
        if (tab === 'login') {
            document.querySelector('.tab-btn').classList.add('active');
            document.getElementById('login-tab').classList.add('active');
        } else {
            document.querySelectorAll('.tab-btn')[1].classList.add('active');
            document.getElementById('register-tab').classList.add('active');
        }
    };
}

function showAuthSection() {
    document.getElementById('auth-section').classList.remove('hidden');
    document.getElementById('game-section').classList.add('hidden');
}

function showGameSection() {
    document.getElementById('auth-section').classList.add('hidden');
    document.getElementById('game-section').classList.remove('hidden');
    document.getElementById('current-username').textContent = gameState.currentUser;
    
    // Užkrauname tik šio vartotojo duomenis
    loadUserData();
    initializeGame();
    updateStats();
    startGameCycle();
    initializeChart();
    fetchMoonPhase(); // Užkrauname mėnulio fazės informaciją
}

// Mėnulio fazės funkcijos
function calculateMoonPhase() {
    const date = new Date();
    let year = date.getFullYear();
    let month = date.getMonth() + 1;
    const day = date.getDate();
    
    // Mėnulio fazės skaičiavimas (lunation skaičius)
    let c = 0, e = 0, jd = 0, b = 0;
    
    if (month < 3) {
        year--;
        month += 12;
    }
    
    ++month;
    c = 365.25 * year;
    e = 30.6 * month;
    jd = c + e + day - 694039.09; // jd yra bendras dienų skaičius
    jd /= 29.5305882; // padalinti iš mėnulio ciklo ilgio
    b = parseInt(jd); // atkurti sveikąją dalį
    jd -= b; // atkurti trupmeninę dalį
    b = Math.round(jd * 8); // padauginti iš 8 ir suapvalinti
    
    if (b >= 8) {
        b = 0;
    }
    
    // Apskaičiuoti apšviestumą
    const phase = (jd * 29.5305882);
    const illumination = (1 - Math.cos(2 * Math.PI * jd)) / 2 * 100;
    
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

        // Dabartinė fazė su timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 sekundės timeout
        
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
    
    // Fazių pavadinimai ir emoji
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

// Autentifikacija
function register() {
    const username = document.getElementById('register-username').value.trim();
    const password = document.getElementById('register-password').value;
    const email = document.getElementById('register-email').value.trim();
    
    if (!username || !password || !email) {
        showError('Prašome užpildyti visus laukus');
        return;
    }
    
    const users = DB.getUsers();
    if (users[username]) {
        showError('Vartotojas jau egzistuoja');
        return;
    }
    
    users[username] = {
        password: password, // Realiai reikėtų hashinti
        email: email,
        createdAt: new Date().toISOString()
    };
    
    DB.saveUsers(users);
    
    // Inicializuojame naujo vartotojo statistiką
    DB.saveUserStats(username, {
        streak: 0,
        currentCoefficient: 0.01
    });
    
    showError('', 'success');
    setTimeout(() => {
        document.getElementById('register-username').value = '';
        document.getElementById('register-password').value = '';
        document.getElementById('register-email').value = '';
        showTab('login');
    }, 1000);
}

function login() {
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    
    if (!username || !password) {
        showError('Prašome įvesti vartotojo vardą ir slaptažodį');
        return;
    }
    
    const users = DB.getUsers();
    if (!users[username] || users[username].password !== password) {
        showError('Neteisingas vartotojo vardas arba slaptažodis');
        return;
    }
    
    gameState.currentUser = username;
    localStorage.setItem('current_user', username);
    showError('', 'success');
    setTimeout(() => {
        showGameSection();
    }, 500);
}

function logout() {
    // Išsaugome vartotojo statistiką prieš atsijungiant
    if (gameState.currentUser) {
        DB.saveUserStats(gameState.currentUser, {
            streak: gameState.streak,
            currentCoefficient: gameState.currentCoefficient
        });
    }
    
    // Išvalome žaidimo būseną
    gameState.currentUser = null;
    gameState.guesses = [];
    gameState.totalGuesses = 0;
    gameState.streak = 0;
    gameState.currentCoefficient = 0.01;
    
    localStorage.removeItem('current_user');
    if (gameState.changeTimer) {
        clearInterval(gameState.changeTimer);
        gameState.changeTimer = null;
    }
    
    // Išvalome grafiką
    if (coefficientChart) {
        coefficientChart.destroy();
        coefficientChart = null;
    }
    
    showAuthSection();
}

function showError(message, type = 'error') {
    const errorEl = document.getElementById('auth-error');
    errorEl.textContent = message;
    errorEl.style.color = type === 'success' ? '#4caf50' : '#e74c3c';
}

// Žaidimo inicializacija
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
    // Generuojame nesikartojančius skaičius nuo 0 iki 99
    const numbers = Array.from({ length: 100 }, (_, i) => i);
    shuffleArray(numbers);
    
    gameState.board = [];
    for (let i = 0; i < 10; i++) {
        gameState.board[i] = [];
        for (let j = 0; j < 10; j++) {
            gameState.board[i][j] = numbers[i * 10 + j];
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
    
    for (let i = 0; i < 10; i++) {
        for (let j = 0; j < 10; j++) {
            const cell = document.createElement('div');
            cell.className = 'game-cell';
            cell.textContent = gameState.board[i][j];
            cell.dataset.row = i;
            cell.dataset.col = j;
            cell.onclick = () => handleCellClick(i, j);
            boardEl.appendChild(cell);
        }
    }
}

function selectNewTarget() {
    gameState.targetRow = Math.floor(Math.random() * 10);
    gameState.targetCol = Math.floor(Math.random() * 10);
    gameState.targetNumber = gameState.board[gameState.targetRow][gameState.targetCol];
}

function startGameCycle() {
    // Pirmas spalvos keitimas
    changeColor();
    
    // Keičiame kas 3 sekundes
    gameState.changeTimer = setInterval(() => {
        changeColor();
        selectNewTarget();
        clearFeedback();
    }, 3000);
}

function changeColor() {
    const indicator = document.getElementById('color-indicator');
    const board = document.getElementById('game-board');
    
    // Atsitiktinė spalva
    const hue = Math.floor(Math.random() * 360);
    indicator.style.backgroundColor = `hsl(${hue}, 70%, 50%)`;
    
    // Animacija
    indicator.classList.add('changing');
    board.classList.add('changing');
    
    setTimeout(() => {
        indicator.classList.remove('changing');
        board.classList.remove('changing');
    }, 500);
}

// Spėjimo apdorojimas
function handleCellClick(row, col) {
    const clickedNumber = gameState.board[row][col];
    const now = new Date();
    
    let points = 0;
    let feedback = [];
    
    // Tikriname skaičių
    if (clickedNumber === gameState.targetNumber) {
        points += 1;
        feedback.push('Skaičius: ✓');
    } else {
        feedback.push('Skaičius: ✗');
    }
    
    // Tikriname eilutę
    if (row === gameState.targetRow) {
        points += 0.1;
        feedback.push('Eilutė: ✓');
    } else {
        feedback.push('Eilutė: ✗');
    }
    
    // Tikriname stulpelį
    if (col === gameState.targetCol) {
        points += 0.1;
        feedback.push('Stulpelis: ✓');
    } else {
        feedback.push('Stulpelis: ✗');
    }
    
    // Sėkmės koeficiento skaičiavimas
    let coefficient = calculateCoefficient(points);
    
    // 2 kartus iš eilės atspėti skaičių - padidina 4 kartus
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
    
    // Ribojame koeficientą
    coefficient = Math.max(0.01, Math.min(1, coefficient));
    
    // Atnaujiname koeficientą
    gameState.currentCoefficient = coefficient;
    gameState.totalGuesses++;
    gameState.lastGuessTime = now;
    
    // Išsaugome spėjimą (tik šio vartotojo)
    const guess = {
        timestamp: now.toISOString(),
        coefficient: coefficient,
        points: points,
        guessedNumber: clickedNumber,
        targetNumber: gameState.targetNumber,
        guessedRow: row,
        targetRow: gameState.targetRow,
        guessedCol: col,
        targetCol: gameState.targetCol
    };
    
    gameState.guesses.push(guess);
    DB.addGuess(gameState.currentUser, guess);
    
    // Išsaugome vartotojo statistiką
    DB.saveUserStats(gameState.currentUser, {
        streak: gameState.streak,
        currentCoefficient: gameState.currentCoefficient
    });
    
    // Rodyti atsiliepimą
    showFeedback(feedback, points);
    
    // Atnaujinti statistiką
    updateStats();
    updateChart();
    
    // Pažymėti langelį
    markCell(row, col, points > 0);
    
    // Po kiekvieno spėjimo keičiame skaičių tvarką lentelėje
    setTimeout(() => {
        generateBoard();
        renderBoard();
        selectNewTarget();
        changeColor();
    }, 500); // Trumpas delėjimas, kad vartotojas matytų rezultatą
}

function calculateCoefficient(points) {
    // Bazinis koeficientas pagal taškus
    // Maksimalus taškų skaičius: 1 + 0.1 + 0.1 = 1.2
    // Normalizuojame į 0.01 - 1 diapazoną
    const normalizedPoints = points / 1.2;
    const baseCoefficient = 0.01 + (normalizedPoints * 0.99);
    
    // Jei yra streak, jau padauginta aukščiau
    return baseCoefficient;
}

function markCell(row, col, correct) {
    const cells = document.querySelectorAll('.game-cell');
    const cellIndex = row * 10 + col;
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

// Statistika
function loadUserData() {
    if (!gameState.currentUser) return;
    
    // Užkrauname tik šio vartotojo spėjimus
    const guesses = DB.getGuesses(gameState.currentUser);
    gameState.guesses = guesses;
    gameState.totalGuesses = guesses.length;
    
    // Užkrauname vartotojo statistiką
    const userStats = DB.getUserStats(gameState.currentUser);
    
    if (guesses.length > 0) {
        gameState.currentCoefficient = guesses[guesses.length - 1].coefficient;
        
        // Apskaičiuojame streak iš istorijos (paskutiniai spėjimai, kur skaičius buvo teisingas)
        gameState.streak = calculateStreakFromHistory(guesses);
    } else {
        gameState.currentCoefficient = userStats.currentCoefficient || 0.01;
        gameState.streak = userStats.streak || 0;
    }
}

function calculateStreakFromHistory(guesses) {
    if (guesses.length === 0) return 0;
    
    let streak = 0;
    // Einu nuo paskutinio spėjimo atgal
    for (let i = guesses.length - 1; i >= 0; i--) {
        const guess = guesses[i];
        // Tikriname ar skaičius buvo teisingas
        if (guess.guessedNumber === guess.targetNumber) {
            streak++;
        } else {
            break; // Sustabdom, jei rastas neteisingas
        }
    }
    
    return streak;
}

function updateStats() {
    document.getElementById('current-coefficient').textContent = 
        gameState.currentCoefficient.toFixed(3);
    document.getElementById('total-guesses').textContent = gameState.totalGuesses;
    document.getElementById('streak-count').textContent = gameState.streak;
    
    // Vidutinis koeficientas po 25, 50, 75, 100 spėjimų
    const milestones = [25, 50, 75, 100];
    const avgEl = document.getElementById('average-coefficient');
    
    if (gameState.totalGuesses >= 25) {
        const avg = gameState.guesses.reduce((sum, g) => sum + g.coefficient, 0) / gameState.guesses.length;
        avgEl.textContent = avg.toFixed(3);
        
        // Rodyti milestone pranešimą
        if (milestones.includes(gameState.totalGuesses)) {
            setTimeout(() => {
                alert(`Pasiektas ${gameState.totalGuesses} spėjimų milestone! Vidutinis koeficientas: ${avg.toFixed(3)}`);
            }, 100);
        }
    } else {
        avgEl.textContent = '-';
    }
}

// Grafikas
function initializeChart() {
    const ctx = document.getElementById('coefficient-chart').getContext('2d');
    
    // Naudojame tik šio vartotojo spėjimus
    const guesses = gameState.guesses;
    const labels = guesses.map(g => {
        const date = new Date(g.timestamp);
        return date.toLocaleString('lt-LT');
    });
    const coefficients = guesses.map(g => g.coefficient);
    
    // Pridedame prognozę 15 min į priekį (tik šio vartotojo duomenimis)
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

function calculatePrediction(guesses) {
    if (guesses.length < 4) {
        return { labels: [], values: [] };
    }
    
    const n = guesses.length;
    const values = guesses.map(g => g.coefficient);
    const lastTime = new Date(guesses[guesses.length - 1].timestamp);
    const lastTimeMs = lastTime.getTime();
    
    // NORMALIZUOJAME DUOMENIS (centruojame aplink vidurkį)
    const mean = values.reduce((a, b) => a + b, 0) / n;
    const normalizedValues = values.map(v => v - mean);
    
    // AUTOCORRELATION ANALIZĖ - randame ciklinį pasikartojimą
    // Autocorrelation skaičiuoja koreliaciją tarp signalo ir jo paties su vėlavimu
    const maxLag = Math.min(Math.floor(n / 2), 30); // Maksimalus vėlavimas
    const autocorrelations = [];
    
    for (let lag = 1; lag <= maxLag; lag++) {
        let correlation = 0;
        let count = 0;
        
        for (let i = 0; i < n - lag; i++) {
            correlation += normalizedValues[i] * normalizedValues[i + lag];
            count++;
        }
        
        if (count > 0) {
            // Normalizuojame autocorrelation
            const variance = normalizedValues.reduce((sum, v) => sum + v * v, 0) / n;
            const normalizedCorrelation = variance > 0 ? correlation / (count * variance) : 0;
            autocorrelations.push({
                lag: lag,
                correlation: normalizedCorrelation
            });
        }
    }
    
    // RANDAME DOMINUOJANČIUS CIKLUS (periodiškumą)
    // Ieškome didelių autocorrelation verčių
    const significantCycles = autocorrelations
        .filter(ac => Math.abs(ac.correlation) > 0.3) // Reikšmingi ciklai
        .sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation))
        .slice(0, 3); // Top 3 ciklai
    
    // Apskaičiuojame vidutinį laiką tarp spėjimų (minutėmis)
    const timeDiffs = [];
    for (let i = 1; i < guesses.length; i++) {
        const time1 = new Date(guesses[i-1].timestamp).getTime();
        const time2 = new Date(guesses[i].timestamp).getTime();
        const diffMs = time2 - time1;
        if (diffMs > 0 && diffMs < 10 * 60 * 1000) {
            timeDiffs.push(diffMs / 1000 / 60);
        }
    }
    const avgTimeBetweenGuesses = timeDiffs.length > 0
        ? timeDiffs.reduce((a, b) => a + b, 0) / timeDiffs.length
        : 1;
    
    // CIKLO PARAMETRAI
    let cyclePeriod = null; // Ciklo periodas (spėjimų skaičius)
    let cycleFrequency = null; // Ciklo dažnis (ciklai per spėjimą)
    let cycleAmplitude = 0; // Ciklo amplitudė (svyravimo dydis)
    let cyclePhase = 0; // Ciklo fazė (kur esame cikle)
    
    if (significantCycles.length > 0) {
        // Naudojame stipriausią ciklą
        const mainCycle = significantCycles[0];
        cyclePeriod = mainCycle.lag; // Periodas spėjimų skaičiumi
        cycleFrequency = 1 / cyclePeriod; // Dažnis
        
        // Apskaičiuojame amplitudę iš ciklo
        // Amplitudė = maksimumas - minimumas per ciklą
        const cycleLength = cyclePeriod;
        const cycles = Math.floor(n / cycleLength);
        
        if (cycles > 0) {
            const cycleValues = [];
            for (let c = 0; c < cycles; c++) {
                const cycleStart = c * cycleLength;
                const cycleEnd = Math.min(cycleStart + cycleLength, n);
                const cycleData = values.slice(cycleStart, cycleEnd);
                if (cycleData.length > 0) {
                    const cycleMax = Math.max(...cycleData);
                    const cycleMin = Math.min(...cycleData);
                    cycleValues.push({ max: cycleMax, min: cycleMin, amplitude: cycleMax - cycleMin });
                }
            }
            
            if (cycleValues.length > 0) {
                cycleAmplitude = cycleValues.reduce((sum, c) => sum + c.amplitude, 0) / cycleValues.length;
            }
        }
        
        // Apskaičiuojame fazę - kur esame cikle dabar
        const positionInCycle = n % cyclePeriod;
        cyclePhase = (positionInCycle / cyclePeriod) * 2 * Math.PI; // Radianais
    } else {
        // Jei nėra aiškaus ciklo, naudojame vidutinį svyravimą kaip amplitudę
        const maxValue = Math.max(...values);
        const minValue = Math.min(...values);
        cycleAmplitude = (maxValue - minValue) / 2;
        cyclePeriod = n; // Visas periodas kaip ciklas
        cycleFrequency = 1 / cyclePeriod;
    }
    
    // VIDUTINĖ REIKŠMĖ IR TRENDAS
    const lastValue = values[values.length - 1];
    const secondLastValue = values.length > 1 ? values[values.length - 2] : lastValue;
    const trend = lastValue - secondLastValue;
    
    // Generuojame 15 min prognozę (kas 1 minutę = 15 taškų)
    const predictionLabels = [];
    const predictionValues = [];
    
    for (let i = 1; i <= 15; i++) {
        const futureTime = new Date(lastTimeMs + i * 60 * 1000);
        predictionLabels.push(futureTime.toLocaleString('lt-LT'));
        
        // Kiek spėjimų bus per i minučių
        const guessesInFuture = i / avgTimeBetweenGuesses;
        
        // PROGNOZĖ PAGAL CIKLINĮ PASIKARTOJIMĄ
        let predictedValue = mean; // Pradedame nuo vidurkio
        
        if (cyclePeriod && cycleAmplitude > 0) {
            // Apskaičiuojame naują fazę ateityje
            const futurePhase = cyclePhase + (guessesInFuture * 2 * Math.PI * cycleFrequency);
            
            // Sinusoidinė prognozė pagal ciklą
            // Naudojame sinusą, kad gautume ciklinį pasikartojimą
            const cycleComponent = Math.sin(futurePhase) * cycleAmplitude;
            predictedValue = mean + cycleComponent;
            
            // Pritaikome trendą
            predictedValue += trend * guessesInFuture * 0.1;
        } else {
            // Jei nėra aiškaus ciklo, naudojame tiesinę prognozę su svyravimu
            predictedValue = lastValue + trend * guessesInFuture;
            
            // Pridedame nedidelį svyravimą pagal amplitudę
            if (cycleAmplitude > 0) {
                const randomPhase = (guessesInFuture * 0.1) % (2 * Math.PI);
                predictedValue += Math.sin(randomPhase) * cycleAmplitude * 0.3;
            }
        }
        
        // Pritaikome paskutinę reikšmę (30% svoris)
        predictedValue = predictedValue * 0.7 + lastValue * 0.3;
        
        // Ribojame į 0.01 - 1 diapazoną
        const clampedValue = Math.max(0.01, Math.min(1, predictedValue));
        predictionValues.push(clampedValue);
    }
    
    return {
        labels: predictionLabels,
        values: predictionValues
    };
}

function updateChart() {
    if (!coefficientChart) return;
    
    // Naudojame tik šio vartotojo spėjimus
    const guesses = gameState.guesses;
    const labels = guesses.map(g => {
        const date = new Date(g.timestamp);
        return date.toLocaleString('lt-LT');
    });
    const coefficients = guesses.map(g => g.coefficient);
    
    // Prognozė tik šio vartotojo duomenimis
    const predictionData = calculatePrediction(guesses);
    
    coefficientChart.data.labels = [...labels, ...predictionData.labels];
    // Istorija - tik realūs duomenys
    coefficientChart.data.datasets[0].data = [...coefficients, ...new Array(predictionData.values.length).fill(null)];
    // Prognozė - tik prognozuojami duomenys
    coefficientChart.data.datasets[1].data = [...new Array(coefficients.length).fill(null), ...predictionData.values];
    
    coefficientChart.update();
}

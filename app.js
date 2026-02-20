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

// Inicializacija
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    setupEventListeners();
});

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
    if (guesses.length < 2) {
        return { labels: [], values: [] };
    }
    
    // Naudojame visą istoriją - kuo daugiau duomenų, tuo geresnė sekų analizė
    const allGuesses = guesses;
    const n = allGuesses.length;
    
    if (n < 3) {
        return { labels: [], values: [] };
    }
    
    const values = allGuesses.map(g => g.coefficient);
    const lastTime = new Date(guesses[guesses.length - 1].timestamp);
    const lastTimeMs = lastTime.getTime();
    
    // SUGRUPUOJAME KOEFICIENTUS Į INTERVALUS (tikslesnei sekų analizei)
    const numBins = 15;
    const binSize = (1.0 - 0.01) / numBins;
    
    function getBin(coeff) {
        const binIndex = Math.floor((coeff - 0.01) / binSize);
        return Math.min(Math.max(binIndex, 0), numBins - 1);
    }
    
    function getBinCenter(bin) {
        return 0.01 + (bin + 0.5) * binSize;
    }
    
    // KONVERTUOJAME REIKŠMES Į BIN'US
    const bins = values.map(v => getBin(v));
    
    // ANALIZUOJAME SEKAS (PATTERNS) - kaip koeficientai pasikartoja laike
    // 1. Perėjimų tikimybės (transition probabilities): kokie bin'ai dažniausiai seka po kitų
    const transitions = {}; // {fromBin: {toBin: count}}
    
    for (let i = 0; i < bins.length - 1; i++) {
        const fromBin = bins[i];
        const toBin = bins[i + 1];
        
        if (!transitions[fromBin]) {
            transitions[fromBin] = {};
        }
        if (!transitions[fromBin][toBin]) {
            transitions[fromBin][toBin] = 0;
        }
        transitions[fromBin][toBin]++;
    }
    
    // 2. Analizuojame 2-3 elementų sekas (patterns)
    const patterns2 = {}; // 2 elementų sekos
    const patterns3 = {}; // 3 elementų sekos
    
    for (let i = 0; i < bins.length - 1; i++) {
        const pattern2 = `${bins[i]}-${bins[i+1]}`;
        patterns2[pattern2] = (patterns2[pattern2] || 0) + 1;
    }
    
    for (let i = 0; i < bins.length - 2; i++) {
        const pattern3 = `${bins[i]}-${bins[i+1]}-${bins[i+2]}`;
        patterns3[pattern3] = (patterns3[pattern3] || 0) + 1;
    }
    
    // 3. Randame dažniausiai pasitaikančias sekas
    const sortedPatterns2 = Object.entries(patterns2)
        .map(([pattern, count]) => ({
            pattern,
            count,
            bins: pattern.split('-').map(Number),
            frequency: count / (bins.length - 1)
        }))
        .sort((a, b) => b.count - a.count);
    
    const sortedPatterns3 = Object.entries(patterns3)
        .map(([pattern, count]) => ({
            pattern,
            count,
            bins: pattern.split('-').map(Number),
            frequency: count / (bins.length - 2)
        }))
        .sort((a, b) => b.count - a.count);
    
    // 4. PROGNOZĖ PAGAL SEKAS
    const lastBin = bins[bins.length - 1];
    const secondLastBin = bins.length > 1 ? bins[bins.length - 2] : lastBin;
    const thirdLastBin = bins.length > 2 ? bins[bins.length - 3] : secondLastBin;
    
    // Randame, kokios sekos prasideda nuo paskutinių bin'ų
    const matchingPatterns2 = sortedPatterns2.filter(p => p.bins[0] === lastBin);
    const matchingPatterns3 = sortedPatterns3.filter(p => 
        p.bins[0] === thirdLastBin && p.bins[1] === secondLastBin && p.bins[2] === lastBin
    );
    
    // Apskaičiuojame prognozuojamus bin'us pagal sekas
    let predictedBins = [];
    let totalWeight = 0;
    
    // Jei radome 3 elementų seką, kuri prasideda nuo paskutinių 3 bin'ų
    if (matchingPatterns3.length > 0) {
        const topPattern3 = matchingPatterns3[0];
        // Seka jau baigta, reikia rasti, kas dažniausiai seka po šios sekos
        const patternEnd = topPattern3.bins[2];
        if (transitions[patternEnd]) {
            const nextBins = Object.entries(transitions[patternEnd])
                .map(([bin, count]) => ({
                    bin: parseInt(bin),
                    count,
                    probability: count / Object.values(transitions[patternEnd]).reduce((a, b) => a + b, 0)
                }))
                .sort((a, b) => b.count - a.count);
            
            if (nextBins.length > 0) {
                predictedBins.push({
                    bin: nextBins[0].bin,
                    weight: topPattern3.frequency * nextBins[0].probability * 0.5
                });
                totalWeight += topPattern3.frequency * nextBins[0].probability * 0.5;
            }
        }
    }
    
    // Jei radome 2 elementų seką
    if (matchingPatterns2.length > 0) {
        matchingPatterns2.slice(0, 3).forEach(pattern => {
            const patternEnd = pattern.bins[1];
            if (transitions[patternEnd]) {
                const nextBins = Object.entries(transitions[patternEnd])
                    .map(([bin, count]) => ({
                        bin: parseInt(bin),
                        count,
                        probability: count / Object.values(transitions[patternEnd]).reduce((a, b) => a + b, 0)
                    }))
                    .sort((a, b) => b.count - a.count);
                
                if (nextBins.length > 0) {
                    const weight = pattern.frequency * nextBins[0].probability * 0.3;
                    predictedBins.push({
                        bin: nextBins[0].bin,
                        weight
                    });
                    totalWeight += weight;
                }
            }
        });
    }
    
    // Jei turime perėjimus nuo paskutinio bin'o
    if (transitions[lastBin]) {
        const nextBins = Object.entries(transitions[lastBin])
            .map(([bin, count]) => ({
                bin: parseInt(bin),
                count,
                probability: count / Object.values(transitions[lastBin]).reduce((a, b) => a + b, 0)
            }))
            .sort((a, b) => b.count - a.count);
        
        if (nextBins.length > 0) {
            const weight = nextBins[0].probability * 0.2;
            predictedBins.push({
                bin: nextBins[0].bin,
                weight
            });
            totalWeight += weight;
        }
    }
    
    // Apskaičiuojame svertinį prognozuojamą bin'ą
    let predictedBin = lastBin; // Default - paskutinis bin'as
    if (predictedBins.length > 0 && totalWeight > 0) {
        const weightedBin = predictedBins.reduce((sum, p) => sum + p.bin * p.weight, 0) / totalWeight;
        predictedBin = Math.round(weightedBin);
        predictedBin = Math.max(0, Math.min(numBins - 1, predictedBin));
    }
    
    const basePredictedValue = getBinCenter(predictedBin);
    
    // Apskaičiuojame vidutinį pokytį tarp bin'ų istorijoje
    const binChanges = [];
    for (let i = 1; i < bins.length; i++) {
        binChanges.push(bins[i] - bins[i-1]);
    }
    const avgBinChange = binChanges.length > 0 
        ? binChanges.reduce((a, b) => a + b, 0) / binChanges.length 
        : 0;
    
    // Generuojame 15 min prognozę (kas 1 minutę = 15 taškų)
    const predictionLabels = [];
    const predictionValues = [];
    
    // Skaičiuojame vidutinį laiką tarp spėjimų
    const timeDiffs = [];
    for (let i = 1; i < allGuesses.length; i++) {
        const time1 = new Date(allGuesses[i-1].timestamp).getTime();
        const time2 = new Date(allGuesses[i].timestamp).getTime();
        const diffMs = time2 - time1;
        if (diffMs > 0 && diffMs < 10 * 60 * 1000) {
            timeDiffs.push(diffMs / 1000 / 60); // Minutės
        }
    }
    const avgTimeBetweenGuesses = timeDiffs.length > 0
        ? timeDiffs.reduce((a, b) => a + b, 0) / timeDiffs.length
        : 1; // Default: 1 minutė
    
    // Paskutinė reikšmė
    const lastValue = values[values.length - 1];
    
    for (let i = 1; i <= 15; i++) {
        const futureTime = new Date(lastTimeMs + i * 60 * 1000);
        predictionLabels.push(futureTime.toLocaleString('lt-LT'));
        
        // Prognozuojama reikšmė pagal sekų pasikartojimą
        // Kiek spėjimų bus per 15 min (apytiksliai)
        const guessesInFuture = Math.floor(i / avgTimeBetweenGuesses);
        
        // Prognozuojame bin'ą pagal sekas
        let futureBin = predictedBin;
        if (guessesInFuture > 0 && avgBinChange !== 0) {
            // Pritaikome vidutinį pokytį
            futureBin = Math.round(predictedBin + avgBinChange * guessesInFuture * 0.3);
            futureBin = Math.max(0, Math.min(numBins - 1, futureBin));
        }
        
        let predictedValue = getBinCenter(futureBin);
        
        // Pritaikome paskutinę reikšmę ir vidutinį pokytį
        const trend = lastValue - (values.length > 1 ? values[values.length - 2] : lastValue);
        predictedValue = predictedValue * 0.7 + lastValue * 0.2 + (lastValue + trend) * 0.1;
        
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

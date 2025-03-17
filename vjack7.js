//
// vJackpot for Vietlott ball
// Created for fun 
// v.20250317
// Default latest big data or user input source
// Log storage, security check and mega/power
// Up to 100 samples/lines
//
const MINJACKPOT = 2;
const TOTALNUM = 6;
const MAXPOWER = 55;
const MAXMEGA = 45;
const MINPOWER = 1;

let logs = [];
let startTime;               // start time
let requestCount = 0;        // total number of securityCheck call/request
let lastResetTime = performance.now();
const TIME_WINDOW = 1000;    // 1 second window to measure concurrent req
const REQUEST_THRESHOLD = 5; // Max 5 requests before challenge

function logStep(message) {
    const timestamp = new Date().toISOString();
    logs.push(`${timestamp}: ${message}`);
}

// Toggle visibility of file input based on radio selection
function toggleCsvInput() {
    const csvType = document.querySelector('input[name="csvType"]:checked').value;
    const fileInput = document.getElementById('csvFile');
    const maxNumberSelect = document.getElementById('maxNumber');
    const outputDiv = document.getElementById('output');

    fileInput.style.display = csvType === "input" ? "block" : "none";
    maxNumberSelect.style.display = csvType === "predefined" ? "block" : "none";
    fileInput.value = '';
    maxNumberSelect.value = '';
    outputDiv.innerText = '';
    logStep(`CSV type changed to ${csvType}, resetting inputs`);
}

function clearOutput() {
    const outputDiv = document.getElementById('output');
    outputDiv.innerText = '';
    logStep("Output cleared due to max number or file selection change");
}

function securityCheck() {
    const outputDiv = document.getElementById('output');
    const maxNumberSelect = document.getElementById('maxNumber');
    const csvType = document.querySelector('input[name="csvType"]:checked').value;
    const maxNum = maxNumberSelect.value; // Mega or Power or unknown

    if (csvType === "predefined" && (!maxNum || (maxNum !== "45" && maxNum !== "55"))) {
        outputDiv.innerText = "Please select a valid max number (Mega or Power) for predefined CSV.";
        logStep("Invalid maxNum for predefined data: " + maxNum);
        return;
    }

    const currentTime = performance.now();

    // Reset counter if time window has elapsed
    if (currentTime - lastResetTime > TIME_WINDOW) {
        requestCount = 0;
        lastResetTime = currentTime;
        logStep("Request counter reset due to time window expiration");
    }

    // Increment request count
    requestCount++;
    logStep(`Request count incremented to ${requestCount}`);

    // Check if threshold exceeded
    if (requestCount > REQUEST_THRESHOLD) {
        outputDiv.innerText = "Performing security check due to high request rate...";
        logStep("High request rate detected, initiating security challenge");

        const challengeStart = performance.now();
        const challengeString = `${navigator.userAgent}${Math.random()}`;
        let hash = 0;
 
        // Computational challenge
        for (let i = 0; i < 1000000; i++) {
            hash = ((hash << 5) - hash + challengeString.charCodeAt(i % challengeString.length)) | 0;
        }

        const challengeEnd = performance.now();
        const elapsed = challengeEnd - challengeStart;

        // Fingerprinting and validation
        const userAgent = navigator.userAgent.toLowerCase();
        const screenWidth = window.screen.width;
        const screenHeight = window.screen.height;
        const isBotLike = 
            elapsed < 50 || 
            elapsed > 5000 || 
            !userAgent.includes('mozilla') || 
            screenWidth < 300 || screenHeight < 300;

        if (isBotLike) {
            outputDiv.innerText = "Security check failed. Access denied.";
            logStep("Security check failed: Potential bot or DDoS detected");
            downloadLogs(null); // No effectiveMaxNum yet
            return;
        }

        logStep("Security challenge passed");
        outputDiv.innerText = "Security check passed. Starting prediction...";
    } else {
        logStep("Request count below threshold, skipping security challenge");
        outputDiv.innerText = "Starting prediction...";
    }

    setTimeout(() => predictNumbers(maxNum, csvType), 1000);    // Proceed regardless with delay
}

// Will be trigger after securityCheck()
// If checks pass, logs success and proceeds now
// othervise ff fails, logs failure, displays “Access denied” and stops execution.
async function predictNumbers(maxNum, csvType) {
    const outputDiv = document.getElementById('output');
    logs = [];
    startTime = performance.now();    // Collect timing
    logStep("Starting prediction process with max number: " + (maxNum || "from input") + ", type: " + csvType);

    let csvData;
    let effectiveMaxNum;

    if (csvType === "predefined") {
        const csvFile = maxNum === "45" ? "mega.csv" : "power.csv";
        const fetchUrl = `./${csvFile}`;                   // Explicitly use relative path
        outputDiv.innerText = `Loading ${csvFile}...`;
        logStep(`Attempting to fetch predefined CSV file: ${fetchUrl}`);

        try {
            const response = await fetch(fetchUrl);
            logStep(`Fetch response status: ${response.status} ${response.statusText}`);
            if (!response.ok) {
                throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
            }
            csvData = await response.text();
            logStep("Predefined file loaded successfully, content length: " + csvData.length);
            effectiveMaxNum = parseInt(maxNum);
        } catch (error) {
            logStep(`Error fetching ${fetchUrl}: ${error.message}`);
            outputDiv.innerText = `Error: Could not load ${csvFile}. Ensure it exists in the same directory and is accessible (Details: ${error.message}).`;
            downloadLogs(effectiveMaxNum);
            return;
        }
    } else {
        const fileInput = document.getElementById('csvFile');
        const file = fileInput.files[0];
        if (!file) {
            logStep("No file uploaded for input type");
            outputDiv.innerText = "Please upload a CSV file.";
            downloadLogs(effectiveMaxNum);
            return;
        }

        logStep("File selected: " + file.name);
        outputDiv.innerText = "Loading file...";

        csvData = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error("Error reading file"));
            reader.readAsText(file);
        });
        logStep(`Input file ${file.name} loaded successfully`);

        const rows = csvData.trim().split('\n').filter(row => row.trim() !== '');
        const data = rows.map(row => row.split(',').map(num => parseInt(num.trim(), 10)));
        const maxInData = Math.max(...data.flat());
        effectiveMaxNum = maxInData <= 45 ? MAXMEGA : MAXPOWER;
        logStep(`Determined effective max number from input CSV: ${effectiveMaxNum}`);
    }

    logStep("Validating CSV content against max number: " + effectiveMaxNum);
    const rows = csvData.trim().split('\n').filter(row => row.trim() !== '');
    if (rows.length < MINJACKPOT) {
        logStep("Error: Not enough data (need at least 2 rows to learn)");
        outputDiv.innerText = "Error: CSV must contain at least 2 rows to learn";
        downloadLogs(effectiveMaxNum);
        return;
    }

    const data = rows.map(row => 
        row.split(',').map(num => parseInt(num.trim(), 10))
    );

    for (const [i, row] of data.entries()) {
        if (row.length !== TOTALNUM) {
            logStep(`Error: Row ${i + 1} does not contain exactly 6 numbers: ${row.join(', ')}`);
            outputDiv.innerText = `Error: Row ${i + 1} must contain exactly 6 numbers.`;
            downloadLogs(effectiveMaxNum);
            return;
        }
        const invalidNum = row.find(num => isNaN(num) || num < 1 || num > effectiveMaxNum);
        if (invalidNum !== undefined) {
            logStep(`Error: Row ${i + 1} contains invalid number ${invalidNum} (max ${effectiveMaxNum})`);
            outputDiv.innerText = `Error: Number ${invalidNum} in row ${i + 1} exceeds max ${effectiveMaxNum} or is invalid.`;
            downloadLogs(effectiveMaxNum);
            return;
        }
    }
    logStep("CSV validation passed");

    outputDiv.innerText = "Processing data and training model...";
    logStep("CSV data read, beginning processing");
    const predictedNumbers = await processCSVandPredict(csvData, effectiveMaxNum);
    logStep("Prediction completed");
    outputDiv.innerText = "Training completed";

    const elapsedTime = ((performance.now() - startTime) / 1000).toFixed(2);
    logStep(`Elapsed Time: ${elapsedTime} second(s)`); // Add elapsed time to log
    outputDiv.innerText = `Predicted Numbers (1-${effectiveMaxNum}): ${predictedNumbers.join(', ')}\n Elapsed Time: ${elapsedTime} second(s)`;
    downloadLogs(effectiveMaxNum);
}

async function processCSVandPredict(csvData, maxNum) {
    logStep("Parsing CSV data");
    const rows = csvData.trim().split('\n').filter(row => row.trim() !== '');
    logStep(`Found ${rows.length} rows in CSV`);
    
    logStep("Converting rows to numbers");
    const data = rows.map(row => 
        row.split(',').map(num => parseInt(num.trim(), 10))
    );

    logStep("Preparing training data");
    const xs = data.slice(0, -1);   // All but last row as input
    const ys = data.slice(1);       // Next rows as output
    const normalizedXs = xs.map(row => row.map(num => num / maxNum));
    const normalizedYs = ys.map(row => row.map(num => num / maxNum));
    logStep(`Training set: ${xs.length} input rows, ${ys.length} output rows`);

    logStep("Converting data to TensorFlow");
    const inputTensor = tf.tensor2d(normalizedXs);
    const outputTensor = tf.tensor2d(normalizedYs);

    logStep("Defining network model");
    const model = tf.sequential();
    // TensorFlow DNN 64-32-6 layers
    model.add(tf.layers.dense({ units: 64, activation: 'relu', inputShape: [6] }));
    model.add(tf.layers.dense({ units: 32, activation: 'relu' }));
    model.add(tf.layers.dense({ units: 6, activation: 'linear' }));

    // https://viblo.asia/p/danh-gia-model-trong-machine-learing-RnB5pAq7KPG
    // https://viblo.asia/p/optimizer-hieu-sau-ve-cac-thuat-toan-toi-uu-gdsgdadam-Qbq5QQ9E5D8
    //     Adam = Momentum + RMSprop
    //     https://viblo.asia/p/thuat-toan-toi-uu-adam-aWj53k8Q56m
    model.compile({
        optimizer: 'adam',
        loss: 'meanSquaredError',
        metrics: ['mae']
    });
    logStep("Model compiled with Adam optimizer and MSE loss");

    // Each sample will be trained based on number of epochs
    // Entire 150 training set per sample for desktop powerful machine (Approx ~30s from 28 samples)
    // 20 epochs for mobile
    // 150 epochs with elapsed Time: 147.32 second(s) from 31 samples/lines
    logStep("Starting model training");
    await model.fit(inputTensor, outputTensor, {
        epochs: 150,
        batchSize: 1,
        shuffle: true,
        verbose: 0,
        callbacks: {
            onEpochEnd: (epoch, logs) => {
                logStep(`Epoch ${epoch + 1}/150 - Loss: ${logs.loss.toFixed(4)}, MAE: ${logs.mae.toFixed(4)}`);
            }
        }
    });
    logStep("Model training completed");

    logStep("Making prediction with last Jackpot");
    const lastRow = data[data.length - 1];
    const normalizedLastRow = lastRow.map(num => num / maxNum);
    logStep(`Last row (normalized): ${normalizedLastRow.join(', ')}`);
    const predictionTensor = model.predict(tf.tensor2d([normalizedLastRow], [1, TOTALNUM]));
    const prediction = predictionTensor.dataSync();
    logStep(`Raw prediction: ${Array.from(prediction).join(', ')}`);

    logStep("Generating unique numbers from prediction");
    const predictedNumbers = generateUniqueNumbers(prediction, maxNum);
    logStep(`Final predicted numbers: ${predictedNumbers.join(', ')}`);

    tf.dispose([inputTensor, outputTensor, predictionTensor]);
    logStep("Teardown memory");

    return predictedNumbers;
}

function generateUniqueNumbers(prediction, maxNum) {
    logStep("Converting prediction to unique integers with max: " + maxNum);
    const numbers = new Set();

    prediction.forEach((prob, i) => {
        let num = Math.round(prob * maxNum);
        num = Math.max(1, Math.min(maxNum, num));
        numbers.add(num);
        logStep(`Added number ${num} from prediction index ${i}`);
    });

    const sortedPrediction = prediction.slice().sort((a, b) => b - a);
    while (numbers.size < TOTALNUM) {
        const probDist = sortedPrediction.map(p => p / sortedPrediction.reduce((a, b) => a + b));
        const randomNum = sampleFromDistribution(probDist, maxNum);
        numbers.add(randomNum);
        logStep(`Added sampled number ${randomNum} to ensure 6 unique values`);
    }

    const result = Array.from(numbers).slice(0, TOTALNUM).sort((a, b) => a - b);
    logStep(`Final sorted numbers: ${result.join(', ')}`);
    return result;
}

function sampleFromDistribution(probDist, maxNum) {
    const rand = Math.random();
    let cumulative = 0;
    for (let i = 0; i < probDist.length; i++) {
        cumulative += probDist[i];
        if (rand <= cumulative) {
            const num = Math.max(1, Math.min(maxNum, Math.round((i + 1) * maxNum / probDist.length)));
            logStep(`Sampled ${num} from distribution at index ${i}`);
            return num;
        }
    }
    const fallback = Math.floor(Math.random() * maxNum) + 1;
    logStep(`Fallback sampled ${fallback}`);
    return fallback;
}

function downloadLogs(effectiveMaxNum) {
    logStep("Generating log file for download");
    const prefix = effectiveMaxNum === MAXMEGA ? "mega_" : effectiveMaxNum === MAXPOWER ? "power_" : "unknown_";
    const logContent = logs.join('\n');
    const blob = new Blob([logContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${prefix}prediction_log_${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    logStep("Log file download triggered with prefix: " + prefix);
}

toggleCsvInput();
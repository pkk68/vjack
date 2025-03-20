//
// vJackpot for Vietlott ball
// Created for fun 
// v.20250318
// Default latest big data or user input source
// Log storage, security check and mega/power
// Update handle large CSV files (e.g., >10,000 rows)
//     Optimize Convergence: Achieve high accuracy faster without excessive epochs.
//     Handle Variability: Account for small (e.g., 3 rows) to large (e.g., 1000+ rows) datasets.
//
const VERSION = 20250318;
const MINJACKPOT = 2;
const TOTALNUM = 6;
const MAXPOWER = 55;
const MAXMEGA = 45;
const MINPOWER = 1;
const TOTALROW = 1040;

let logs = [];
let startTime;             // start time
let requestCount = 0;      // total number of securityCheck call/request
let lastResetTime = performance.now();
const TIME_WINDOW = 1000;  // 1 second window to measure concurrent req
const REQUEST_THRESHOLD = 5;    // Max 5 requests before challenge

// Efficient logging with optional batching for large datasets
function logStep(message) {
    const timestamp = new Date().toISOString();
    logs.push(`${timestamp}: ${message}`);
}

// Toggle UI elements with minimal DOM manipulation
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
    logStep("Output cleared due to selection change");
}

// Security check with lightweight bot detection
function securityCheck() {
    const outputDiv = document.getElementById('output');
    const maxNumberSelect = document.getElementById('maxNumber');
    const csvType = document.querySelector('input[name="csvType"]:checked').value;
    const maxNum = maxNumberSelect.value;

    if (csvType === "predefined" && (!maxNum || (maxNum !== "45" && maxNum !== "55"))) {
        outputDiv.innerText = "Please select a valid max number (Mega or Power) for predefined CSV.";
        logStep(`Invalid maxNum for predefined data: ${maxNum}`);
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
        // Reduced iterations for faster bot check
        for (let i = 0; i < 500000; i++) {
            hash = ((hash << 5) - hash + challengeString.charCodeAt(i % challengeString.length)) | 0;
        }

        const challengeEnd = performance.now();
        const elapsed = challengeEnd - challengeStart;

        // Fingerprinting and validation
        const userAgent = navigator.userAgent.toLowerCase();
        const screenWidth = window.screen.width;
        const screenHeight = window.screen.height;
        const isBotLike = elapsed < 20 || elapsed > 3000 || 
		                  !userAgent.includes('mozilla') || 
						  screenWidth < 300 || screenHeight < 300;

        if (isBotLike) {
            outputDiv.innerText = "Security check failed. Access denied.";
            logStep("Security check failed: Potential bot or DDoS detected");
            downloadLogs(null);
            return;
        }

        logStep("Security challenge passed");
        outputDiv.innerText = "Security check passed. Starting prediction...";
    } else {
        logStep("Request count below threshold, skipping security challenge");
        outputDiv.innerText = "Starting prediction...";
    }

    setTimeout(() => predictNumbers(maxNum, csvType), 500); // Reduced delay
}

// Will be trigger after securityCheck()
// If checks pass, logs success and proceeds now
// othervise ff fails, logs failure, displays “Access denied” and stops execution.
async function predictNumbers(maxNum, csvType) {
    const outputDiv = document.getElementById('output');
	
    // Reset logs
    logs = [];
    startTime = performance.now();    // Collect timing
    logStep(`Starting prediction process with max number: ${maxNum || "from input"}, type: ${csvType}`);

    let csvData;
    let effectiveMaxNum;

    if (csvType === "predefined") {
        const csvFile = maxNum === "45" ? "mega.csv" : "power.csv";
        const fetchUrl = `./${csvFile}`;
        outputDiv.innerText = `Loading ${csvFile}...`;
        logStep(`Attempting to fetch predefined CSV file: ${fetchUrl}`);

        try {
            const response = await fetch(fetchUrl, { cache: 'no-store' }); // Avoid caching issues
            logStep(`Fetch response status: ${response.status} ${response.statusText}`);
            if (!response.ok) throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
            csvData = await response.text();
            logStep(`Predefined file loaded successfully, content length: ${csvData.length}`);
            effectiveMaxNum = parseInt(maxNum);
        } catch (error) {
            logStep(`Error fetching ${fetchUrl}: ${error.message}`);
            //outputDiv.innerText = `Error: Could not load ${csvFile}. Ensure it exists in the same directory as index.html and is accessible via the server (Details: ${error.message}).`;
	    outputDiv.innerText = (
                `Error: Could not load ${csvFile}. Ensure it exists in the same directory ` +
                `as index.html and is accessible via the server (Details: ${error.message}).`
                );
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

        logStep(`File selected: ${file.name}`);
        outputDiv.innerText = "Loading file...";

        // Stream-based CSV parsing for large files
        csvData = await streamParseCSV(file);
        logStep(`Input file ${file.name} loaded successfully`);

        const maxInData = findMaxInData(csvData);
        effectiveMaxNum = maxInData <= MAXMEGA ? MAXMEGA : MAXPOWER;
        logStep(`Determined effective max number from input CSV: ${effectiveMaxNum}`);
    }

    logStep(`Validating CSV content against max number: ${effectiveMaxNum}`);
    if (!validateCSV(csvData, effectiveMaxNum)) return;

    outputDiv.innerText = "Processing data and training model...";
    logStep("CSV data read, beginning processing");
    const predictedNumbers = await processCSVandPredict(csvData, effectiveMaxNum);
    logStep("Prediction completed");

    const elapsedTime = ((performance.now() - startTime) / 1000).toFixed(2);
    logStep(`Elapsed Time: ${elapsedTime} second(s)`);
    //outputDiv.innerText = `Potential Jackpot (1-${effectiveMaxNum}): ${predictedNumbers.join(', ')}\nElapsed Time: ${elapsedTime} second(s)`;
    outputDiv.innerText = (
                `Potential Jackpot (1-${effectiveMaxNum}): ${predictedNumbers.join(', ')} ` +
                `\nElapsed Time: ${elapsedTime} second(s)`);
    downloadLogs(effectiveMaxNum);
}

// Stream-based CSV parsing for large files
// process the CSV file in chunks using the stream.
async function streamParseCSV(file) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        const reader = file.stream().getReader();
        const decoder = new TextDecoder();

        reader.read().then(function processChunk({ done, value }) {
            if (done) {
                const csvData = chunks.join('').trim().split('\n').filter(row => row.trim() !== '');
                resolve(csvData);
                return;
            }
            chunks.push(decoder.decode(value));
            reader.read().then(processChunk).catch(reject);
        }).catch(reject);
    });
}

// Find max value in data efficiently
function findMaxInData(csvData) {
    let max = -Infinity;
    for (const row of csvData) {
        const nums = row.split(',').map(num => parseInt(num.trim(), 10));
        const rowMax = Math.max(...nums);
        if (rowMax > max) max = rowMax;
    }
    return max;
}

// Validate CSV with early exit
function validateCSV(csvData, effectiveMaxNum) {
    const outputDiv = document.getElementById('output');
    if (csvData.length < MINJACKPOT) {
        logStep(`Error: Not enough data (need at least ${MINJACKPOT} rows to learn)`);
        outputDiv.innerText = `Error: CSV must contain at least ${MINJACKPOT} rows to learn`;
        downloadLogs(effectiveMaxNum);
        return false;
    }

    for (let i = 0; i < csvData.length; i++) {
        const row = csvData[i].split(',').map(num => parseInt(num.trim(), 10));
        if (row.length !== TOTALNUM) {
            logStep(`Error: Row ${i + 1} does not contain exactly ${TOTALNUM} numbers: ${row.join(', ')}`);
            outputDiv.innerText = `Error: Row ${i + 1} must contain exactly ${TOTALNUM} numbers.`;
            downloadLogs(effectiveMaxNum);
            return false;
        }
        const invalidNum = row.find(num => isNaN(num) || num < MINPOWER || num > effectiveMaxNum);
        if (invalidNum !== undefined) {
            logStep(`Error: Row ${i + 1} contains invalid number ${invalidNum} (max ${effectiveMaxNum})`);
            //outputDiv.innerText = `Error: Number ${invalidNum} in row ${i + 1} exceeds max ${effectiveMaxNum} or is invalid.`;
			outputDiv.innerText = (
                `Error: Number ${invalidNum} in row ${i + 1} ` +
                `exceeds max ${effectiveMaxNum} or is invalid.`);
            downloadLogs(effectiveMaxNum);
            return false;
        }
    }
    logStep("CSV validation passed");
    return true;
}

// Optimized model training and prediction
async function processCSVandPredict(csvData, maxNum) {
    logStep("Preparing training data");
    const data = csvData.map(row => row.split(',').map(num => parseInt(num.trim(), 10)));

    // Use a sliding window for large datasets
    // For large datasets, limited training data to a window of the last rows
    // TOTALROW
    const windowSize = Math.min(TOTALROW, data.length - 1); // Adjustable window
    const startIdx = Math.max(0, data.length - windowSize - 1);
    const xs = data.slice(startIdx, -1);
    const ys = data.slice(startIdx + 1);
    const normalizedXs = xs.map(row => row.map(num => num / maxNum));
    const normalizedYs = ys.map(row => row.map(num => num / maxNum));
    logStep(`Training set: ${xs.length} input rows, ${ys.length} rows`);

    logStep("Converting data to Tensor");
    const inputTensor = tf.tensor2d(normalizedXs);
    const outputTensor = tf.tensor2d(normalizedYs);

    logStep("Defining network model");
    // Tensor Flow DNN 64-32-6 layers with ReLU and linear activations.
    const model = tf.sequential();
    model.add(tf.layers.dense({ units: 64, activation: 'relu', inputShape: [6] }));
    model.add(tf.layers.dense({ units: 32, activation: 'relu' }));
    model.add(tf.layers.dense({ units: 6, activation: 'linear' }));
	
    // https://viblo.asia/p/danh-gia-model-trong-machine-learing-RnB5pAq7KPG
    // https://viblo.asia/p/optimizer-hieu-sau-ve-cac-thuat-toan-toi-uu-gdsgdadam-Qbq5QQ9E5D8
    //     Adam = Momentum + RMSprop
    //     https://viblo.asia/p/thuat-toan-toi-uu-adam-aWj53k8Q56m	
    model.compile({
        optimizer: tf.train.adam(0.001), // Tuned learning rate for faster
        loss: 'meanSquaredError',
        metrics: ['mae']
    });
    logStep("Model compiled with Adam optimizer and MSE loss");

    logStep(`Starting model training v.${VERSION}`);
    // Experiment:
    // Epoch 005 - Loss: 0.0265, MAE: 0.1301, 1000 rows, 3.53 second(s)
    // Epoch 010 - Loss: 0.0254, MAE: 0.1277, 517 rows, 8.30 second(s)
    // Epoch 150 - Loss: 0.0213, MAE: 0.1170, 1000 rows, 36.91 second(s)
    // Epoch 150 - Loss: 0.0214, MAE: 0.1175, 1000 rows, 34.91 second(s)
    // Epoch 150 - Loss: 0.0213, MAE: 0.1170, 1000 rows, 49.76 second(s)
    // Epoch 150 - Loss: 0.0217, MAE: 0.1183, 1039 rows, 36.07 second(s)
    //                                        1040 rows, 88.90 second(s)
    //                                        8 rows, 10.63 second(s)
    // Epoch 150 - Loss: 0.0277, MAE: 0.1362, 9 rows, 11.92 second(s)
    // Epoch 150 - Loss: 0.0215, MAE: 0.1174, 1040 rows, 51.24 second(s)
    await model.fit(inputTensor, outputTensor, {
        //epochs: Math.min(150, Math.ceil(5000 / xs.length)), // Dynamic epochs, default entire 150 training set per sample
        //batchSize: 1,
        epochs: 150,
        batchSize: Math.min(32, xs.length),     // Larger batch size for efficiency
        shuffle: true,                          // preventing order bias in training data
        verbose: 0,
        callbacks: {
            onEpochEnd: (epoch, logs) => {
                logStep(`Epoch ${epoch + 1} - Loss: ${logs.loss.toFixed(4)}, MAE: ${logs.mae.toFixed(4)}`);
            }
        }
    });
    logStep("Model training completed");

    logStep("Predicting with last Jackpots");
    const lastRow = data[data.length - 1];
    const normalizedLastRow = lastRow.map(num => num / maxNum);
    const predictionTensor = model.predict(tf.tensor2d([normalizedLastRow], [1, TOTALNUM]));
    const prediction = predictionTensor.dataSync();
    logStep(`Raw prediction: ${Array.from(prediction).join(', ')}`);

    logStep("Generating unique numbers from prediction");
    const predictedNumbers = generateUniqueNumbers(prediction, maxNum);
    logStep(`Final predicted numbers: ${predictedNumbers.join(', ')}`);

    tf.dispose([inputTensor, outputTensor, predictionTensor, model]);
    logStep("Teardown memory");

    return predictedNumbers;
}

// Optimized unique number generation
// pre-filling with top predictions and using random sampling only for remaining slots
function generateUniqueNumbers(prediction, maxNum) {
    const numbers = new Set();
    const sortedPred = Array.from(prediction).sort((a, b) => b - a);

    // Pre-fill with top predictions
    for (let i = 0; i < Math.min(TOTALNUM, sortedPred.length); i++) {
        const num = Math.max(MINPOWER, Math.min(maxNum, Math.round(sortedPred[i] * maxNum)));
        numbers.add(num);
    }

    // Efficiently fill remaining slots
    while (numbers.size < TOTALNUM) {
        const num = Math.floor(Math.random() * maxNum) + MINPOWER;
        numbers.add(num);
		logStep(`Added sampled number ${num} to ensure 6 unique numbers`);
    }

    const result = Array.from(numbers).sort((a, b) => a - b);
    logStep(`Final sorted numbers: ${result.join(', ')}`);
    return result;
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
    logStep(`Log file download triggered with prefix: ${prefix}`);
}

toggleCsvInput();

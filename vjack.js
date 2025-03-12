//
// vJackpot for Vietlott ball
// Created for fun 
// v.20250312
// Log storage, security check and mega/power
//
const MINJACKPOT = 2;
const TOTALNUM = 6;
const MAXPOWER = 55;
const MAXMEGA = 45;
const MINPOWER = 1;

let logs = [];
let startTime;               // start time
let requestCount = 0;	     // total number of securityCheck call/request
let lastResetTime = performance.now();
const TIME_WINDOW = 1000;    // 1 second window to measure concurrent req
const REQUEST_THRESHOLD = 5; // Max 5 requests before challenge

function logStep(message) {
    const timestamp = new Date().toISOString();
    logs.push(`${timestamp}: ${message}`);
}

// reset file input and output
function resetFileInput() {
    const fileInput = document.getElementById('csvFile');
    const outputDiv = document.getElementById('output');
    fileInput.value = ''; // Clear the file input
    outputDiv.innerText = ''; // Clear the output text
    logStep("File input and output reset due to max number selection change");
}

function securityCheck() {
    const outputDiv = document.getElementById('output');
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
            downloadLogs();
            return;
        }

        logStep("Security challenge passed");
        outputDiv.innerText = "Normal check passed. Starting prediction...";
    } else {
        logStep("Request count below threshold, skipping security challenge");
        outputDiv.innerText = "Starting prediction...";
    }

    setTimeout(predictNumbers, 1000); // Proceed regardless, with delay
}

// Will be trigger after securityCheck()
// If checks pass, logs success and proceeds now
// othervise ff fails, logs failure, displays “Access denied” and stops execution.
async function predictNumbers() {
    const fileInput = document.getElementById('csvFile');
    const maxNumberSelect = document.getElementById('maxNumber');
    const outputDiv = document.getElementById('output');
    const file = fileInput.files[0];
    const maxNum = parseInt(maxNumberSelect.value, 10); // Mega or Power

    // Reset logs
    logs = [];
    startTime = performance.now(); // Collect timing
    logStep("Starting prediction process with max number: " + maxNum);

    if (!file) {
        logStep("No file uploaded");
        outputDiv.innerText = "Please upload a CSV file.";
        downloadLogs();
        return;
    }

    logStep("File selected: " + file.name);
    outputDiv.innerText = "Loading file...";
    const reader = new FileReader();
    reader.onload = async function(event) {
	logStep(`File ${file.name} loaded successfully`);
        const csvData = event.target.result;

        // Early validation of CSV content
        logStep("Validating CSV content against max number: " + maxNum);
        const rows = csvData.trim().split('\n').filter(row => row.trim() !== '');
        if (rows.length < MINJACKPOT) {
            logStep("Error: Not enough data (need at least 2 rows to learn)");
            outputDiv.innerText = "Error: CSV must contain at least 2 rows to learn.";
            downloadLogs();
            return;
        }
        const data = rows.map(row => 
            row.split(',').map(num => parseInt(num.trim(), 10))
        );
        for (const [i, row] of data.entries()) {
            if (row.length !== TOTALNUM) {
                logStep(`Error: Row ${i + 1} does not contain exactly 6 numbers: ${row.join(', ')}`);
                outputDiv.innerText = `Error: Row ${i + 1} must contain exactly 6 numbers.`;
                downloadLogs();
                return;
            }
            const invalidNum = row.find(num => isNaN(num) || num < 1 || num > maxNum);
            if (invalidNum !== undefined) {
                logStep(`Error: Row ${i + 1} contains invalid number ${invalidNum} (max ${maxNum})`);
                outputDiv.innerText = `Error: Number ${invalidNum} in row ${i + 1} exceeds max ${maxNum} or is invalid.`;
                downloadLogs();
                return;
            }
        }
        logStep("CSV validation passed");

        outputDiv.innerText = "Processing data and training model...";
        logStep("CSV data read, beginning processing");
        const predictedNumbers = await processCSVandPredict(csvData, maxNum);
        logStep("Prediction completed");

        //outputDiv.innerText = `Potential Jackpot: ${predictedNumbers.join(', ')}`;
	const elapsedTime = ((performance.now() - startTime) / 1000).toFixed(2); // in seconds
        outputDiv.innerText = `Potential Jackpot: ${predictedNumbers.join(', ')}\n Elapsed time: ${elapsedTime} second(s)`;
        downloadLogs();
    };
    reader.onerror = function() {
        logStep("Error reading file");
        outputDiv.innerText = "Error reading the file.";
        downloadLogs();
    };
    reader.readAsText(file);
}

async function processCSVandPredict(csvData, maxNum) {
    logStep("Parsing CSV data");
    const rows = csvData.trim().split('\n').filter(row => row.trim() !== '');
    logStep(`Found ${rows.length} rows in CSV`);
    
    if (rows.length < MINJACKPOT) {
        logStep("Error: Not enough data (need at least 2 rows for my learning)");
        return ["Not enough data (need at least 2 rows for my learning)"];
    }

    logStep("Converting rows to numbers");
    const data = rows.map(row => 
        row.split(',').map(num => parseInt(num.trim(), 10))
    );

    // FIXME: No need?
    logStep("Validating data with max number: " + maxNum);
    for (const [i, row] of data.entries()) {
        if (row.length !== TOTALNUM || row.some(num => isNaN(num) || num < MINPOWER || num > maxNum)) {
            //logStep(`Error: Invalid data in row ${i + 1}: ${row.join(', ')}`);
            logStep(`Error: Invalid data in row ${i + 1}: ${row.join(', ')} (exceeds ${maxNum})`);
            return ["Invalid data in CSV"];
        }
    }
    logStep("Data validated successfully");

    logStep("Preparing training data");
    const xs = data.slice(0, -1); // All but last row as input
    const ys = data.slice(1);     // Next rows as output
    const normalizedXs = xs.map(row => row.map(num => num / maxNum));
    const normalizedYs = ys.map(row => row.map(num => num / maxNum));
    logStep(`Training set: ${xs.length} input rows, ${ys.length} output rows`);

    logStep("Converting data to Tensor");
    const inputTensor = tf.tensor2d(normalizedXs);
    const outputTensor = tf.tensor2d(normalizedYs);

    logStep("Defining network model");
    // Tensor Flow DNN 64-32-6 layers
    const model = tf.sequential();
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

    // Entire 150 training set per sample
    logStep("Starting the training");
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
        num = Math.max(MINPOWER, Math.min(maxNum, num));
        numbers.add(num);
        logStep(`Added number ${num} from prediction index ${i}`);
    });

    const sortedPrediction = prediction.slice().sort((a, b) => b - a);
    while (numbers.size < TOTALNUM) {
        const probDist = sortedPrediction.map(p => p / sortedPrediction.reduce((a, b) => a + b));
        const randomNum = sampleFromDistribution(probDist, maxNum);
        numbers.add(randomNum);
        logStep(`Added sampled number ${randomNum} to ensure 6 unique numbers`);
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

function downloadLogs() {
    logStep("Generating log file for downloading");
    const logContent = logs.join('\n');
    const blob = new Blob([logContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `prediction_log_${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    logStep("Log file download triggered");
}
//
// vJackpot for Vietlott ball
// Created for fun 
// v.20250317
// Default latest big data or user input source
// Log storage, security check and mega/power
// Up to 10000 samples/lines
//
const MINJACKPOT = 2;
const TOTALNUM = 6;
const MAXPOWER = 55;
const MAXMEGA = 45;
const MINPOWER = 1;

let logs = [];
let startTime;
let requestCount = 0;
let lastResetTime = performance.now();
const TIME_WINDOW = 1000;
const REQUEST_THRESHOLD = 5;
const SAMPLE_SIZE = 1000; // Sample 1000 rows for training
const CHUNK_SIZE = 2000;  // Process 2000 rows per chunk

function updateOutput(message) {
    clearTimeout(updateOutput.timeout);
    updateOutput.timeout = setTimeout(() => {
        document.getElementById('output').innerText = message;
    }, 100);
}
updateOutput.timeout = null;

function logStep(message) {
    const timestamp = new Date().toISOString();
    logs.push(`${timestamp}: ${message}`);
}

function toggleCsvInput() {
    const csvType = document.querySelector('input[name="csvType"]:checked').value;
    const fileInput = document.getElementById('csvFile');
    const maxNumberSelect = document.getElementById('maxNumber');
    updateOutput('');
    fileInput.style.display = csvType === "input" ? "block" : "none";
    maxNumberSelect.style.display = csvType === "predefined" ? "block" : "none";
    fileInput.value = '';
    maxNumberSelect.value = '';
    logStep(`CSV type changed to ${csvType}, resetting inputs`);
}

function clearOutput() {
    updateOutput('');
    logStep("Output cleared due to max number or file selection change");
}

async function securityCheck() {
    const maxNumberSelect = document.getElementById('maxNumber');
    const csvType = document.querySelector('input[name="csvType"]:checked').value;
    const maxNum = maxNumberSelect.value;

    if (csvType === "predefined" && (!maxNum || (maxNum !== "45" && maxNum !== "55"))) {
        updateOutput("Please select a valid max number (Mega or Power) for predefined CSV.");
        logStep("Invalid maxNum for predefined data: " + maxNum);
        return;
    }

    const currentTime = performance.now();
    if (currentTime - lastResetTime > TIME_WINDOW) {
        requestCount = 0;
        lastResetTime = currentTime;
    }
    requestCount++;
    logStep(`Request count incremented to ${requestCount}`);

    if (requestCount > REQUEST_THRESHOLD) {
        updateOutput("Performing security check...");
        const start = performance.now();
        await new Promise(resolve => setTimeout(resolve, 100));
        const elapsed = performance.now() - start;
        if (elapsed > 500 || !navigator.userAgent.includes('mozilla')) {
            updateOutput("Security check failed. Access denied.");
            logStep("Security check failed: Potential bot detected");
            downloadLogs(null);
            return;
        }
        logStep("Security check passed");
    }
    updateOutput("Starting prediction...");
    setTimeout(() => predictNumbers(maxNum, csvType), 500);
}

async function predictNumbers(maxNum, csvType) {
    logs = [];
    startTime = performance.now();
    updateOutput("Starting prediction...");
    logStep("Starting prediction process with max number: " + (maxNum || "from input") + ", type: " + csvType);

    let effectiveMaxNum, dataStream;
    if (csvType === "predefined") {
        const csvFile = maxNum === "45" ? "mega.csv" : "power.csv";
        const fetchUrl = `./${csvFile}`;
        updateOutput(`Loading ${csvFile}...`);
        try {
            const response = await fetch(fetchUrl);
            if (!response.ok) throw new Error(`HTTP error ${response.status}`);
            dataStream = response.body; // Use ReadableStream
            effectiveMaxNum = parseInt(maxNum);
        } catch (error) {
            updateOutput(`Error: Could not load ${csvFile}. (${error.message})`);
            logStep(`Error fetching ${fetchUrl}: ${error.message}`);
            downloadLogs(effectiveMaxNum);
            return;
        }
    } else {
        const fileInput = document.getElementById('csvFile');
        const file = fileInput.files[0];
        if (!file) {
            updateOutput("Please upload a CSV file.");
            logStep("No file uploaded");
            downloadLogs(effectiveMaxNum);
            return;
        }
        dataStream = file.stream();
        effectiveMaxNum = await determineMaxNumFromStream(file);
    }

    const { sampledData, totalRows } = await streamAndSampleCSV(dataStream, effectiveMaxNum);
    if (totalRows < MINJACKPOT) {
        updateOutput("Error: CSV must contain at least 2 rows to learn");
        logStep("Error: Not enough data");
        downloadLogs(effectiveMaxNum);
        return;
    }

    const predictedNumbers = await processSampledData(sampledData, effectiveMaxNum, totalRows);
    const elapsedTime = ((performance.now() - startTime) / 1000).toFixed(2);
    updateOutput(`Predicted Numbers (1-${effectiveMaxNum}): ${predictedNumbers.join(', ')}\nElapsed Time: ${elapsedTime} second(s)`);
    logStep(`Elapsed Time: ${elapsedTime} second(s)`);
    downloadLogs(effectiveMaxNum);
}

async function determineMaxNumFromStream(file) {
    return new Promise((resolve) => {
        let maxNum = 0;
        Papa.parse(file, {
            step: (result) => {
                const row = result.data.map(Number);
                maxNum = Math.max(maxNum, ...row);
            },
            complete: () => resolve(maxNum <= 45 ? MAXMEGA : MAXPOWER),
            preview: 100 // Check first 100 rows for efficiency
        });
    });
}

// Stream and sample CSV data
async function streamAndSampleCSV(stream, maxNum) {
    return new Promise((resolve) => {
        let totalRows = 0;
        const sampledData = [];
        const reservoir = []; // Reservoir sampling

        Papa.parse(stream, {
            worker: true, // Offload to worker
            chunkSize: CHUNK_SIZE,
            step: (result) => {
                totalRows++;
                const row = result.data.map(Number);
                if (row.length !== TOTALNUM || row.some(n => isNaN(n) || n < 1 || n > maxNum)) return;

                if (reservoir.length < SAMPLE_SIZE) {
                    reservoir.push(row.map(n => n / maxNum));
                } else {
                    const r = Math.floor(Math.random() * totalRows);
                    if (r < SAMPLE_SIZE) reservoir[r] = row.map(n => n / maxNum);
                }
            },
            complete: () => {
                logStep(`Processed ${totalRows} rows, sampled ${reservoir.length}`);
                resolve({ sampledData: reservoir, totalRows });
            },
            error: (err) => {
                logStep(`Stream parsing error: ${err.message}`);
                resolve({ sampledData: [], totalRows: 0 });
            }
        });
    });
}

async function processSampledData(sampledData, maxNum, totalRows) {
    updateOutput(`Training model on ${sampledData.length} sampled rows of ${totalRows} total...`);
    logStep(`Training on ${sampledData.length} sampled rows`);

    await tf.setBackend('webgl');
    logStep("Using WebGL backend");

    const inputData = sampledData.slice(0, -1);
    const outputData = sampledData.slice(1);
    const inputTensor = tf.tensor2d(inputData);
    const outputTensor = tf.tensor2d(outputData);

    const model = tf.sequential();
    model.add(tf.layers.dense({ units: 32, activation: 'relu', inputShape: [6] })); // Simplified model
    model.add(tf.layers.dense({ units: 6, activation: 'linear' }));

    model.compile({
        optimizer: tf.train.adam(0.001),
        loss: 'meanSquaredError',
        metrics: ['mae']
    });

    await model.fit(inputTensor, outputTensor, {
        epochs: 50,
        batchSize: 32,
        shuffle: true,
        verbose: 0,
        callbacks: {
            onEpochEnd: async (epoch, logs) => {
                logStep(`Epoch ${epoch + 1}/50 - Loss: ${logs.loss.toFixed(4)}`);
                await tf.nextFrame();
            }
        }
    });

    const lastRow = sampledData[sampledData.length - 1];
    const predictionTensor = model.predict(tf.tensor2d([lastRow], [1, TOTALNUM]));
    const prediction = predictionTensor.dataSync();
    const predictedNumbers = generateUniqueNumbers(prediction, maxNum);

    tf.dispose([inputTensor, outputTensor, predictionTensor]);
    logStep("Teardown memory");
    return predictedNumbers;
}

function generateUniqueNumbers(prediction, maxNum) {
    const numbers = new Set();
    prediction.forEach(prob => {
        const num = Math.max(1, Math.min(maxNum, Math.round(prob * maxNum)));
        numbers.add(num);
    });

    while (numbers.size < TOTALNUM) {
        const num = Math.floor(Math.random() * maxNum) + 1; // Fallback to random
        numbers.add(num);
    }

    return Array.from(numbers).slice(0, TOTALNUM).sort((a, b) => a - b);
}

function downloadLogs(effectiveMaxNum) {
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
}

toggleCsvInput();
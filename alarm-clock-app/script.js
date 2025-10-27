// DOM Elements
const clock = document.getElementById('clock');
const alarmLabelInput = document.getElementById('alarm-label');
const alarmTimeInput = document.getElementById('alarm-time');
const alarmDurationInput = document.getElementById('alarm-duration');
const setAlarmBtn = document.getElementById('set-alarm');
const recordVoiceBtn = document.getElementById('record-voice');
const stopRecordBtn = document.getElementById('stop-record');
const previewAudio = document.getElementById('preview-audio');
const alarmsList = document.getElementById('alarms-list');
const alarmModal = document.getElementById('alarm-modal');
const alarmLabelDisplay = document.getElementById('alarm-label-display');
const alarmTimeDisplay = document.getElementById('alarm-time-display');
const snoozeBtn = document.getElementById('snooze-btn');
const dismissBtn = document.getElementById('dismiss-btn');

// Variables
let alarms = [];
let mediaRecorder;
let audioChunks = [];
let currentRecording = null;
let currentAlarm = null;
let alarmAudio = null;
let recordingForAlarmId = null;
let fallbackInterval = null;
let fallbackContext = null;

// Load alarms from localStorage
function loadAlarms() {
    const storedAlarms = localStorage.getItem('alarms');
    if (storedAlarms) {
        alarms = JSON.parse(storedAlarms);
        alarms.forEach(alarm => {
            if (alarm.audioData) {
                // Rebuild audio blob from base64
                const audioBlob = base64ToBlob(alarm.audioData, 'audio/webm');
                alarm.audio = new Audio(URL.createObjectURL(audioBlob));
            }
        });
        renderAlarms();
    }
}

// Save alarms to localStorage
function saveAlarms() {
    const alarmsToSave = alarms.map(alarm => ({
        ...alarm,
        audio: undefined, // Don't save the Audio object
        audioData: alarm.audioData // Keep the base64 data
    }));
    localStorage.setItem('alarms', JSON.stringify(alarmsToSave));
}

// Update clock display
function updateClock() {
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const seconds = now.getSeconds().toString().padStart(2, '0');
    clock.textContent = `${hours}:${minutes}:${seconds}`;

    // Check for alarms
    checkAlarms(now);
}

setInterval(updateClock, 1000);

// Check if any alarm should trigger
function checkAlarms(now) {
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    alarms.forEach(alarm => {
        if (alarm.time === currentTime && !alarm.triggered) {
            triggerAlarm(alarm);
        }
    });
}

// Trigger alarm
function triggerAlarm(alarm) {
    currentAlarm = alarm;
    alarm.triggered = true;

    alarmLabelDisplay.textContent = alarm.label || 'Alarm!';
    alarmTimeDisplay.textContent = `Time: ${alarm.time}`;

    if (alarm.audio) {
        alarmAudio = alarm.audio;
        alarmAudio.currentTime = 0;
        alarmAudio.loop = true;
        alarmAudio.play();
    } else {
        // Fallback beep sound
        playFallbackSound();
    }

    alarmModal.style.display = 'flex';

    // Auto-stop after duration
    setTimeout(() => {
        stopAlarm();
    }, (alarm.duration || 30) * 1000);
}

// Play fallback sound
function playFallbackSound() {
    fallbackContext = new (window.AudioContext || window.webkitAudioContext)();

    const playBeep = () => {
        const oscillator = fallbackContext.createOscillator();
        const gainNode = fallbackContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(fallbackContext.destination);

        oscillator.frequency.setValueAtTime(800, fallbackContext.currentTime);
        oscillator.type = 'square';

        gainNode.gain.setValueAtTime(0.3, fallbackContext.currentTime);

        oscillator.start();
        oscillator.stop(fallbackContext.currentTime + 0.5);
    };

    playBeep();
    fallbackInterval = setInterval(playBeep, 1000);
}

// Stop alarm
function stopAlarm() {
    if (alarmAudio) {
        alarmAudio.pause();
        alarmAudio.currentTime = 0;
        alarmAudio.loop = false;
    }
    if (fallbackInterval) {
        clearInterval(fallbackInterval);
        fallbackInterval = null;
    }
    if (fallbackContext) {
        fallbackContext.close();
        fallbackContext = null;
    }
    alarmModal.style.display = 'none';
    if (currentAlarm) {
        currentAlarm.triggered = false;
        currentAlarm = null;
    }
}

// Set alarm
setAlarmBtn.addEventListener('click', () => {
    const label = alarmLabelInput.value.trim();
    const time = alarmTimeInput.value;
    const duration = parseInt(alarmDurationInput.value) || 30;

    if (!time) {
        alert('Please select a time for the alarm.');
        return;
    }

    const alarm = {
        id: Date.now(),
        label: label || 'Alarm',
        time,
        duration,
        audio: currentRecording,
        audioData: currentRecording ? blobToBase64(currentRecording) : null,
        triggered: false
    };

    alarms.push(alarm);
    saveAlarms();
    renderAlarms();

    // Clear inputs
    alarmLabelInput.value = '';
    alarmTimeInput.value = '';
    alarmDurationInput.value = '30';
    currentRecording = null;
    previewAudio.style.display = 'none';
});

// Record voice
recordVoiceBtn.addEventListener('click', async () => {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);

        audioChunks = [];
        mediaRecorder.ondataavailable = event => {
            audioChunks.push(event.data);
        };

        mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            currentRecording = audioBlob;
            previewAudio.src = URL.createObjectURL(audioBlob);
            previewAudio.style.display = 'block';
            stream.getTracks().forEach(track => track.stop());

            // If recording for a specific alarm, update it
            if (recordingForAlarmId) {
                const alarm = alarms.find(a => a.id === recordingForAlarmId);
                if (alarm) {
                    alarm.audio = new Audio(URL.createObjectURL(audioBlob));
                    alarm.audioData = await blobToBase64(audioBlob);
                    saveAlarms();
                    renderAlarms();
                }
                recordingForAlarmId = null;
            }
        };

        mediaRecorder.start();
        recordVoiceBtn.disabled = true;
        stopRecordBtn.disabled = false;
    } catch (error) {
        console.error('Error accessing microphone:', error);
        alert('Could not access microphone. Please check permissions.');
    }
});

// Stop recording
stopRecordBtn.addEventListener('click', () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
        recordVoiceBtn.disabled = false;
        stopRecordBtn.disabled = true;
        recordingForAlarmId = null; // Cancel recording for alarm if stopped manually
    }
});

// Render alarms list
function renderAlarms() {
    alarmsList.innerHTML = '';

    alarms.forEach(alarm => {
        const alarmCard = document.createElement('div');
        alarmCard.className = 'alarm-card';

        alarmCard.innerHTML = `
            <div class="alarm-info">
                <h3>${alarm.label}</h3>
                <p>Time: ${alarm.time} | Duration: ${alarm.duration}s</p>
            </div>
            <div class="alarm-actions">
                <button class="record-btn" data-id="${alarm.id}">Record</button>
                <button class="play-btn" data-id="${alarm.id}" ${!alarm.audio ? 'disabled' : ''}>Play</button>
                <button class="edit-btn" data-id="${alarm.id}">Edit</button>
                <button class="delete-btn" data-id="${alarm.id}">Delete</button>
            </div>
        `;

        alarmsList.appendChild(alarmCard);
    });

    // Add event listeners
    document.querySelectorAll('.record-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const alarmId = parseInt(e.target.dataset.id);
            recordForAlarm(alarmId);
        });
    });

    document.querySelectorAll('.play-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const alarmId = parseInt(e.target.dataset.id);
            playAlarmAudio(alarmId);
        });
    });

    document.querySelectorAll('.edit-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const alarmId = parseInt(e.target.dataset.id);
            editAlarmLabel(alarmId);
        });
    });

    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const alarmId = parseInt(e.target.dataset.id);
            deleteAlarm(alarmId);
        });
    });
}

// Record for specific alarm
function recordForAlarm(alarmId) {
    recordingForAlarmId = alarmId;
    recordVoiceBtn.click();
}

// Play alarm audio
function playAlarmAudio(alarmId) {
    const alarm = alarms.find(a => a.id === alarmId);
    if (alarm && alarm.audio) {
        alarm.audio.play();
    }
}

// Edit alarm label
function editAlarmLabel(alarmId) {
    const alarm = alarms.find(a => a.id === alarmId);
    if (alarm) {
        const newLabel = prompt('Enter new label:', alarm.label);
        if (newLabel !== null) {
            alarm.label = newLabel.trim() || 'Alarm';
            saveAlarms();
            renderAlarms();
        }
    }
}

// Delete alarm
function deleteAlarm(alarmId) {
    alarms = alarms.filter(a => a.id !== alarmId);
    saveAlarms();
    renderAlarms();
}

// Snooze button
snoozeBtn.addEventListener('click', () => {
    if (currentAlarm) {
        const [hours, minutes] = currentAlarm.time.split(':').map(Number);
        const snoozeTime = new Date();
        snoozeTime.setHours(hours, minutes + 5);
        const snoozeTimeStr = `${snoozeTime.getHours().toString().padStart(2, '0')}:${snoozeTime.getMinutes().toString().padStart(2, '0')}`;

        currentAlarm.time = snoozeTimeStr;
        currentAlarm.triggered = false;
        saveAlarms();
        renderAlarms();
    }
    stopAlarm();
});

// Dismiss button
dismissBtn.addEventListener('click', () => {
    stopAlarm();
});

// Utility functions
async function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

function base64ToBlob(base64, mimeType) {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType });
}

// Initialize
loadAlarms();
updateClock();
// Léon — AudioRecorder : enregistrement micro + transcription Whisper
// Usage :
//   const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
//   const recorder = new AudioRecorder({ silenceTimeout: 3000, onStateChange: (state, msg) => {} });
//   const text = await recorder.record(stream);

window.AudioRecorder = class AudioRecorder {
    constructor(options = {}) {
        this.maxDuration = options.maxDuration || 30000;
        this.silenceTimeout = options.silenceTimeout || 0; // 0 = désactivé
        this.silenceThreshold = options.silenceThreshold || 0.01;
        this.apiTimeout = options.apiTimeout || 15000;
        this.onStateChange = options.onStateChange || (() => {});
        this.mediaRecorder = null;
        this.stream = null;
        this.chunks = [];
        this.isRecording = false;
        this._resolve = null;
        this._reject = null;
        this._maxTimer = null;
        this._silenceTimer = null;
        this._silenceCheckInterval = null;
        this._audioContext = null;
        this._analyser = null;
    }

    _getMimeType() {
        if (typeof MediaRecorder === 'undefined') return '';
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) return 'audio/webm;codecs=opus';
        if (MediaRecorder.isTypeSupported('audio/webm')) return 'audio/webm';
        if (MediaRecorder.isTypeSupported('audio/mp4')) return 'audio/mp4';
        return '';
    }

    _startSilenceDetection() {
        if (!this.silenceTimeout || !this.stream) return;
        try {
            this._audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const source = this._audioContext.createMediaStreamSource(this.stream);
            this._analyser = this._audioContext.createAnalyser();
            this._analyser.fftSize = 512;
            source.connect(this._analyser);

            const dataArray = new Uint8Array(this._analyser.frequencyBinCount);
            let silenceStart = null;
            let hasSpoken = false;

            this._silenceCheckInterval = setInterval(() => {
                if (!this.isRecording) return;
                this._analyser.getByteFrequencyData(dataArray);
                // Calculer le volume moyen normalisé (0-1)
                let sum = 0;
                for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
                const avg = sum / dataArray.length / 255;

                if (avg > this.silenceThreshold) {
                    hasSpoken = true;
                    silenceStart = null;
                } else if (hasSpoken) {
                    // Silence détecté après avoir parlé
                    if (!silenceStart) {
                        silenceStart = Date.now();
                    } else if (Date.now() - silenceStart >= this.silenceTimeout) {
                        this.stop();
                    }
                }
            }, 200);
        } catch (e) {
            console.warn('Silence detection not available:', e);
        }
    }

    _stopSilenceDetection() {
        if (this._silenceCheckInterval) {
            clearInterval(this._silenceCheckInterval);
            this._silenceCheckInterval = null;
        }
        if (this._audioContext) {
            try { this._audioContext.close(); } catch (_) {}
            this._audioContext = null;
        }
        this._analyser = null;
    }

    async record(existingStream) {
        // Toggle : si déjà en cours, on arrête
        if (this.isRecording) {
            this.stop();
            return null;
        }

        if (typeof MediaRecorder === 'undefined') {
            this.onStateChange('error', 'Enregistrement audio non supporté par ce navigateur');
            throw new Error('MediaRecorder not supported');
        }

        // Utiliser le stream fourni ou en acquérir un nouveau
        if (existingStream) {
            this.stream = existingStream;
        } else {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                const msg = 'Micro non disponible — vérifiez que le site est en HTTPS';
                this.onStateChange('error', msg);
                throw new Error(msg);
            }
            try {
                this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            } catch (err) {
                console.warn('getUserMedia error:', err.name, err.message);
                let msg;
                if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                    msg = 'Micro bloqué — autorisez le micro dans les réglages du navigateur';
                } else if (err.name === 'NotFoundError') {
                    msg = 'Aucun micro détecté sur cet appareil';
                } else if (err.name === 'NotReadableError' || err.name === 'AbortError') {
                    msg = 'Micro déjà utilisé par une autre application';
                } else {
                    msg = 'Impossible d\'accéder au micro : ' + (err.message || err.name);
                }
                this.onStateChange('error', msg);
                throw new Error(msg);
            }
        }

        const mimeType = this._getMimeType();

        return new Promise((resolve, reject) => {
            this._resolve = resolve;
            this._reject = reject;
            this.chunks = [];
            this.isRecording = true;

            const opts = mimeType ? { mimeType } : {};
            this.mediaRecorder = new MediaRecorder(this.stream, opts);

            this.mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) this.chunks.push(e.data);
            };

            this.mediaRecorder.onstop = async () => {
                clearTimeout(this._maxTimer);
                this._stopSilenceDetection();
                this.isRecording = false;
                this._releaseStream();

                if (this.chunks.length === 0) {
                    this.onStateChange('idle');
                    this._resolve('');
                    return;
                }

                const actualMime = this.mediaRecorder.mimeType || mimeType || 'audio/webm';
                const blob = new Blob(this.chunks, { type: actualMime });
                this.chunks = [];

                this.onStateChange('transcribing');
                try {
                    const text = await this._transcribe(blob, actualMime);
                    this.onStateChange('done');
                    this._resolve(text);
                } catch (err) {
                    this.onStateChange('error', err.message);
                    this._reject(err);
                }
            };

            this.mediaRecorder.onerror = () => {
                clearTimeout(this._maxTimer);
                this._stopSilenceDetection();
                this.isRecording = false;
                this._releaseStream();
                this.onStateChange('error', 'Erreur d\'enregistrement');
                this._reject(new Error('MediaRecorder error'));
            };

            // Auto-stop après maxDuration
            this._maxTimer = setTimeout(() => {
                if (this.isRecording) this.stop();
            }, this.maxDuration);

            this.mediaRecorder.start(1000);
            this.onStateChange('recording');

            // Démarrer la détection de silence
            this._startSilenceDetection();
        });
    }

    stop() {
        clearTimeout(this._maxTimer);
        this._stopSilenceDetection();
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
        } else {
            this.isRecording = false;
            this._releaseStream();
            this.onStateChange('idle');
        }
    }

    _releaseStream() {
        if (this.stream) {
            this.stream.getTracks().forEach(t => t.stop());
            this.stream = null;
        }
    }

    async _transcribe(blob, mimeType) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.apiTimeout);

        try {
            const authHeaders = await getAuthHeaders(null);
            authHeaders['Content-Type'] = mimeType;
            const response = await fetch('/api/transcribe', {
                method: 'POST',
                headers: authHeaders,
                body: blob,
                signal: controller.signal
            });
            clearTimeout(timeout);

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.error || 'La transcription a échoué');
            }

            const data = await response.json();
            return data.text || '';
        } catch (err) {
            clearTimeout(timeout);
            if (err.name === 'AbortError') {
                throw new Error('Transcription timeout (15s)');
            }
            throw err;
        }
    }
};

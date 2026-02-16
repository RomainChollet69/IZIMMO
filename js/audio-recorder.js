// WAIMMO — AudioRecorder : enregistrement micro + transcription Whisper
// Usage :
//   const recorder = new AudioRecorder({ onStateChange: (state, msg) => {} });
//   const text = await recorder.record();
//   recorder.stop();

window.AudioRecorder = class AudioRecorder {
    constructor(options = {}) {
        this.maxDuration = options.maxDuration || 30000;
        this.apiTimeout = options.apiTimeout || 15000;
        this.onStateChange = options.onStateChange || (() => {});
        this.mediaRecorder = null;
        this.stream = null;
        this.chunks = [];
        this.isRecording = false;
        this._resolve = null;
        this._reject = null;
        this._maxTimer = null;
    }

    _getMimeType() {
        if (typeof MediaRecorder === 'undefined') return '';
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) return 'audio/webm;codecs=opus';
        if (MediaRecorder.isTypeSupported('audio/webm')) return 'audio/webm';
        if (MediaRecorder.isTypeSupported('audio/mp4')) return 'audio/mp4';
        return '';
    }

    async record() {
        // Toggle : si déjà en cours, on arrête
        if (this.isRecording) {
            this.stop();
            return null;
        }

        if (typeof MediaRecorder === 'undefined') {
            this.onStateChange('error', 'Enregistrement audio non supporté par ce navigateur');
            throw new Error('MediaRecorder not supported');
        }

        // Demande micro
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (err) {
            const msg = (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')
                ? 'Micro bloqué — autorisez le micro dans les réglages du navigateur'
                : 'Impossible d\'accéder au micro';
            this.onStateChange('error', msg);
            throw new Error(msg);
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
        });
    }

    stop() {
        clearTimeout(this._maxTimer);
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
        } else {
            // Pas en cours → juste cleanup
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
            const response = await fetch('/api/transcribe', {
                method: 'POST',
                headers: { 'Content-Type': mimeType },
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

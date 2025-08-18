// lib/speechToText.js
import axios from 'axios';
import WebSocket from 'ws';

class SpeechToTextService {
    constructor() {
        this.apiKey = process.env.ASSEMBLYAI_API_KEY;
        this.baseUrl = 'https://api.assemblyai.com/v2';
        this.wsUrl = 'wss://api.assemblyai.com/v2/realtime/ws';
    }

    createRealtimeConnection(sampleRate = 16000) {
        const ws = new WebSocket(`${this.wsUrl}?sample_rate=${sampleRate}`, {
            headers: {
                'Authorization': this.apiKey
            }
        });

        return ws;
    }

    async uploadAudio(audioBuffer) {
        try {
            const response = await axios.post(`${this.baseUrl}/upload`, audioBuffer, {
                headers: {
                    'Authorization': this.apiKey,
                    'Content-Type': 'application/octet-stream'
                }
            });
            return response.data.upload_url;
        } catch (error) {
            throw new Error(`Audio upload failed: ${error.message}`);
        }
    }

    async startTranscription(audioUrl) {
        try {
            const response = await axios.post(`${this.baseUrl}/transcript`, {
                audio_url: audioUrl,
                language_code: 'tr', // Türkçe
                punctuate: true,
                format_text: true,
                speaker_labels: true // Konuşmacı tanıma
            }, {
                headers: {
                    'Authorization': this.apiKey,
                    'Content-Type': 'application/json'
                }
            });
            return response.data;
        } catch (error) {
            throw new Error(`Transcription failed: ${error.message}`);
        }
    }

    async getTranscriptionStatus(transcriptId) {
        try {
            const response = await axios.get(`${this.baseUrl}/transcript/${transcriptId}`, {
                headers: {
                    'Authorization': this.apiKey
                }
            });
            return response.data;
        } catch (error) {
            throw new Error(`Status check failed: ${error.message}`);
        }
    }
}

export default new SpeechToTextService();
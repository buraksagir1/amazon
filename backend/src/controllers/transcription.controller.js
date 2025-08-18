// controllers/transcription.controller.js
import Transcription from '../models/Transcription.js';
import speechToTextService from '../lib/speechToText.js';
import { StreamChat } from 'stream-chat';

const serverClient = StreamChat.getInstance(
    process.env.STREAM_API_KEY,
    process.env.STREAM_SECRET_KEY
);

// Gerçek zamanlı transkripsiyon başlat
export const startRealtimeTranscription = async (req, res) => {
    try {
        const { callId } = req.params;
        const userId = req.user.id;

        // WebSocket bağlantısı oluştur
        const ws = speechToTextService.createRealtimeConnection();

        ws.on('open', () => {
            console.log('Realtime transcription started for call:', callId);
            res.json({
                success: true,
                message: 'Realtime transcription started',
                callId
            });
        });

        ws.on('message', async (data) => {
            const result = JSON.parse(data);

            if (result.message_type === 'FinalTranscript' && result.text) {
                // Veritabanına kaydet
                const transcription = new Transcription({
                    callId,
                    userId,
                    transcript: result.text,
                    confidence: result.confidence,
                    timestamp: new Date(),
                    status: 'completed'
                });

                await transcription.save();

                // Stream Chat'e altyazıyı gönder
                await serverClient.sendMessage({
                    type: 'subtitle',
                    text: result.text,
                    user_id: userId,
                    call_id: callId,
                    timestamp: new Date().toISOString()
                }, callId);
            }
        });

        ws.on('error', (error) => {
            console.error('WebSocket error:', error);
        });

        // WebSocket referansını sakla (gerçek uygulamada Redis kullanabilirsiniz)
        global.activeTranscriptions = global.activeTranscriptions || {};
        global.activeTranscriptions[callId] = ws;

    } catch (error) {
        console.error('Start transcription error:', error);
        res.status(500).json({ error: error.message });
    }
};

// Ses dosyası yükle ve transkripsiyon yap
export const uploadAndTranscribe = async (req, res) => {
    try {
        const { callId } = req.params;
        const userId = req.user.id;
        const audioBuffer = req.file.buffer;

        // Ses dosyasını yükle
        const audioUrl = await speechToTextService.uploadAudio(audioBuffer);

        // Transkripsiyon başlat
        const transcriptData = await speechToTextService.startTranscription(audioUrl);

        // Veritabanına kaydet
        const transcription = new Transcription({
            callId,
            userId,
            transcript: '',
            audioUrl,
            status: 'processing'
        });

        await transcription.save();

        res.json({
            success: true,
            transcriptionId: transcription._id,
            assemblyAiId: transcriptData.id
        });

    } catch (error) {
        console.error('Upload and transcribe error:', error);
        res.status(500).json({ error: error.message });
    }
};

// Transkripsiyon durumunu kontrol et
export const checkTranscriptionStatus = async (req, res) => {
    try {
        const { transcriptionId } = req.params;

        const transcription = await Transcription.findById(transcriptionId);
        if (!transcription) {
            return res.status(404).json({ error: 'Transcription not found' });
        }

        res.json({
            success: true,
            transcription
        });

    } catch (error) {
        console.error('Check status error:', error);
        res.status(500).json({ error: error.message });
    }
};

// Call için tüm altyazıları getir
export const getCallTranscriptions = async (req, res) => {
    try {
        const { callId } = req.params;
        const { page = 1, limit = 50 } = req.query;

        const transcriptions = await Transcription.find({ callId })
            .populate('userId', 'username avatar')
            .sort({ timestamp: 1 })
            .limit(limit * 1)
            .skip((page - 1) * limit);

        const total = await Transcription.countDocuments({ callId });

        res.json({
            success: true,
            transcriptions,
            totalPages: Math.ceil(total / limit),
            currentPage: page
        });

    } catch (error) {
        console.error('Get transcriptions error:', error);
        res.status(500).json({ error: error.message });
    }
};

// Gerçek zamanlı transkripsiyon durdur
export const stopRealtimeTranscription = async (req, res) => {
    try {
        const { callId } = req.params;

        if (global.activeTranscriptions && global.activeTranscriptions[callId]) {
            global.activeTranscriptions[callId].close();
            delete global.activeTranscriptions[callId];
        }

        res.json({
            success: true,
            message: 'Transcription stopped'
        });

    } catch (error) {
        console.error('Stop transcription error:', error);
        res.status(500).json({ error: error.message });
    }
};

// Altyazı ayarlarını güncelle
export const updateTranscriptionSettings = async (req, res) => {
    try {
        const userId = req.user.id;
        const { language, autoEnable, fontSize, position } = req.body;

        // User modelinde transcription settings alanı olmalı
        // Bu örnek için basit response dönüyoruz
        res.json({
            success: true,
            settings: {
                language,
                autoEnable,
                fontSize,
                position
            }
        });

    } catch (error) {
        console.error('Update settings error:', error);
        res.status(500).json({ error: error.message });
    }
};
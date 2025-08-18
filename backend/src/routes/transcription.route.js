// routes/transcription.route.js
import express from 'express';
import multer from 'multer';
import {
    startRealtimeTranscription,
    uploadAndTranscribe,
    checkTranscriptionStatus,
    getCallTranscriptions,
    stopRealtimeTranscription,
    updateTranscriptionSettings
} from '../controllers/transcription.controller.js';
import { protectRoute } from '../middleware/auth.middleware.js';

const router = express.Router();

// Multer konfigürasyonu ses dosyaları için
const storage = multer.memoryStorage();
const upload = multer({
    storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('audio/') ||
            file.mimetype === 'video/webm' ||
            file.mimetype === 'video/mp4') {
            cb(null, true);
        } else {
            cb(new Error('Only audio/video files allowed'), false);
        }
    }
});

// Gerçek zamanlı transkripsiyon rotaları
router.post('/realtime/:callId/start', protectRoute, startRealtimeTranscription);
router.post('/realtime/:callId/stop', protectRoute, stopRealtimeTranscription);

// Ses dosyası yükleme ve transkripsiyon
router.post('/upload/:callId', protectRoute, upload.single('audio'), uploadAndTranscribe);

// Transkripsiyon durumu ve sonuçları
router.get('/status/:transcriptionId', protectRoute, checkTranscriptionStatus);
router.get('/call/:callId', protectRoute, getCallTranscriptions);

// Kullanıcı ayarları
router.put('/settings', protectRoute, updateTranscriptionSettings);

// Hata yakalama middleware
router.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'File too large' });
        }
    }
    res.status(400).json({ error: error.message });
});

export default router;
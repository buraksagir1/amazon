// models/Transcription.js
import mongoose from 'mongoose';

const transcriptionSchema = new mongoose.Schema({
    callId: {
        type: String,
        required: true,
        index: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    transcript: {
        type: String,
        required: true
    },
    confidence: {
        type: Number,
        min: 0,
        max: 1
    },
    timestamp: {
        type: Date,
        default: Date.now
    },
    duration: {
        type: Number // saniye cinsinden
    },
    language: {
        type: String,
        default: 'tr'
    },
    speakerLabel: {
        type: String // Konuşmacı tanıma için
    },
    audioUrl: {
        type: String
    },
    status: {
        type: String,
        enum: ['processing', 'completed', 'failed'],
        default: 'processing'
    }
}, {
    timestamps: true
});

// Arama için index
transcriptionSchema.index({ callId: 1, timestamp: 1 });
transcriptionSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model('Transcription', transcriptionSchema);
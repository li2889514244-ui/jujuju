const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const PORT = 3001;
const uploadDir = path.join(__dirname, 'public', 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
    destination: uploadDir,
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

const app = express();

// CORS
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

// File upload endpoint
app.post('/api/v1/content/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ code: 400, message: 'No file uploaded' });
    }
    res.json({
        code: 0,
        message: 'success',
        data: {
            url: '/uploads/' + req.file.filename,
            size: req.file.size,
            originalName: req.file.originalname
        }
    });
});

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => {
    console.log('Upload server running on port ' + PORT);
});

// Handle errors
process.on('uncaughtException', (err) => {
    console.error('Uncaught:', err);
});

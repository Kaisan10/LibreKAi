const path = require('path');
const sharp = require('sharp');
const { randomUUID: uuidv4 } = require('crypto');
const logger = require('./logger');
const db = require('./db');

const IMAGE_DIR = path.join(__dirname, '..', 'public', 'uploads');
const MAX_IMAGE_SIZE = 1 * 1024 * 1024; // 1MB

const saveImage = async (base64Data) => {
    try {
        // Strip header if present (data:image/xyz;base64,)
        const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);

        let buffer;
        let mimeType = 'image/jpeg';
        if (matches && matches.length === 3) {
            mimeType = matches[1];
            buffer = Buffer.from(matches[2], 'base64');
        } else {
            buffer = Buffer.from(base64Data, 'base64');
        }

        // Check size
        if (buffer.length > MAX_IMAGE_SIZE) {
            throw new Error('Image size exceeds 1MB limit');
        }

        // Get metadata using sharp
        const metadata = await sharp(buffer).metadata();
        const extension = metadata.format || 'jpg';
        const filename = `${uuidv4()}.${extension}`;

        // Save to Database
        await db.query(
            'INSERT INTO images (filename, data, mime_type, width, height, size) VALUES ($1, $2, $3, $4, $5, $6)',
            [filename, buffer, mimeType, metadata.width, metadata.height, buffer.length]
        );

        logger.info(`✅ Image saved to database: ${filename} (${buffer.length} bytes)`);

        return {
            filename,
            width: metadata.width,
            height: metadata.height,
            size: buffer.length
        };
    } catch (error) {
        logger.error('Save image error:', error);
        throw error;
    }
};

const getImagePath = (filename) => {
    // This is now handled by the server route fetching from DB
    return null;
};

module.exports = {
    saveImage,
    getImagePath,
    MAX_IMAGE_SIZE
};


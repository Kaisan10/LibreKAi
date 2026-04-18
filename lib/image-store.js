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

const getImage = async (filename) => {
    try {
        const row = await db.getRow(
            'SELECT data, mime_type FROM images WHERE filename = $1',
            [filename]
        );
        return row;
    } catch (error) {
        logger.error('Get image error:', error);
        return null;
    }
};

module.exports = {
    saveImage,
    getImage,
    MAX_IMAGE_SIZE
};


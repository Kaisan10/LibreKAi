require('dotenv').config({ path: '../.env' });
const ImageStore = require('../lib/image-store');
const db = require('../lib/db');
const logger = require('../lib/logger');

async function test() {
    const filename = 'a60e8337-0bfa-489f-a446-9d420a7888a5.svg';
    const image = await ImageStore.getImage(filename);
    if (image) {
        console.log('Success!');
        console.log('Mime type:', image.mime_type);
        console.log('Data length:', image.data.length);
    } else {
        console.log('Failed to fetch image');
    }
    process.exit(0);
}

test();

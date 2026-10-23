require('dotenv').config();
const jwt = require('jsonwebtoken');

const userId = Number(process.argv[2] || 1);
const secret = process.env.JWT_SECRET || 'capmoney_super_secret_jwt_key_2026_dev';

const token = jwt.sign({ id: userId }, secret, { expiresIn: '30d' });

console.log(token);

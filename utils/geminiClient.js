const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Pakai model flash atau pro versi gratis
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

module.exports = { model };

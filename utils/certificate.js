const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Import dengan fallback yang aman
let puppeteer;
let playwright;
let PDFDocument;

try {
    puppeteer = require('puppeteer');
} catch (err) {
    console.warn('⚠️ Puppeteer not available');
}

try {
    playwright = require('playwright');
} catch (err) {
    console.warn('⚠️ Playwright not available');
}

try {
    PDFDocument = require('pdfkit');
} catch (err) {
    console.warn('⚠️ PDFKit not available');
}

// Function to check and select best template
function selectTemplate() {
    const templateWithImages = path.join(__dirname, 'template-with-images.html');
    const templateOriginal = path.join(__dirname, 'template.html');

    if (fs.existsSync(templateWithImages)) {
        console.log('🎨 Using enhanced template with images');
        return templateWithImages;
    } else if (fs.existsSync(templateOriginal)) {
        console.log('📄 Using original template');
        return templateOriginal;
    } else {
        console.log('⚠️ No template found, will use PDFKit');
        return null;
    }
}

// Enhanced image embedding function
function embedImages() {
    const logoPath = path.join(__dirname, 'logo2.png');
    const mascotPath = path.join(__dirname, 'maskot6.png');

    const images = {};

    if (fs.existsSync(logoPath)) {
        try {
            const logoBuffer = fs.readFileSync(logoPath);
            images.logo = `data:image/png;base64,${logoBuffer.toString('base64')}`;
            console.log('✅ Logo embedded successfully');
        } catch (error) {
            console.warn('⚠️ Failed to embed logo:', error.message);
        }
    }

    if (fs.existsSync(mascotPath)) {
        try {
            const mascotBuffer = fs.readFileSync(mascotPath);
            images.mascot = `data:image/png;base64,${mascotBuffer.toString('base64')}`;
            console.log('✅ Mascot embedded successfully');
        } catch (error) {
            console.warn('⚠️ Failed to embed mascot:', error.message);
        }
    }

    return images;
}

// Retry utility
async function retryWithBackoff(operation, maxRetries = 2, baseDelay = 1000) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`🔄 Attempt ${attempt}/${maxRetries}`);
            return await Promise.race([
                operation(),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Operation timeout')), 30000)
                )
            ]);
        } catch (error) {
            console.error(`❌ Attempt ${attempt} failed:`, error.message);

            if (attempt === maxRetries) {
                throw new Error(`All ${maxRetries} attempts failed. Last error: ${error.message}`);
            }

            const delay = baseDelay * Math.pow(2, attempt - 1);
            console.log(`⏳ Waiting ${delay}ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

// Method 1: Fixed PDFKit with safer calculations
async function generateWithPDFKit({ fullName, courseTitle, teacherName, score }) {
    if (!PDFDocument) {
        throw new Error('PDFKit not available');
    }

    console.log('🎨 Using Enhanced PDFKit with professional design...');

    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({
                size: 'A4',
                layout: 'landscape',
                margins: { top: 30, bottom: 30, left: 30, right: 30 }
            });

            const buffers = [];
            doc.on('data', buffers.push.bind(buffers));
            doc.on('end', () => {
                const pdfData = Buffer.concat(buffers);
                console.log('✅ Enhanced PDF generated with PDFKit');
                resolve(pdfData);
            });

            const now = new Date();
            const formattedDate = now.toLocaleDateString('id-ID', {
                day: 'numeric', month: 'long', year: 'numeric'
            });
            const certId = uuidv4().substring(0, 8).toUpperCase();

            // FIXED: Safe page dimensions with validation
            const pageWidth = doc.page.width || 842; // A4 landscape width
            const pageHeight = doc.page.height || 595; // A4 landscape height

            console.log(`📐 Page dimensions: ${pageWidth}x${pageHeight}`);

            // Validate dimensions
            if (isNaN(pageWidth) || isNaN(pageHeight) || pageWidth <= 0 || pageHeight <= 0) {
                throw new Error(`Invalid page dimensions: ${pageWidth}x${pageHeight}`);
            }

            // FIXED: Simple background without complex gradient
            doc.fillColor('#f8f9fa')
                .rect(0, 0, pageWidth, pageHeight)
                .fill();

            // Main border
            doc.strokeColor('#1e90ff').lineWidth(6);
            doc.rect(20, 20, pageWidth - 40, pageHeight - 40).stroke();

            doc.strokeColor('#667eea').lineWidth(3);
            doc.rect(30, 30, pageWidth - 60, pageHeight - 60).stroke();

            // Logo and Mascot with proper error handling
            const logoPath = path.join(__dirname, 'logo2.png');
            const mascotPath = path.join(__dirname, 'maskot6.png');

            // Logo (top-left) with safe positioning
            try {
                if (fs.existsSync(logoPath)) {
                    doc.image(logoPath, 50, 50, { width: 70, height: 70 });
                    console.log('✅ Logo embedded from file');
                } else {
                    // Fallback logo design with safe coordinates
                    doc.fillColor('#1e90ff')
                        .circle(85, 85, 35)
                        .fill();
                    doc.fillColor('white')
                        .fontSize(20)
                        .font('Helvetica-Bold')
                        .text('EDU', 70, 75);
                    console.log('📄 Using fallback logo design');
                }
            } catch (error) {
                console.warn('⚠️ Logo embedding failed, using simple fallback');
                doc.fillColor('#1e90ff').circle(85, 85, 35).fill();
                doc.fillColor('white').fontSize(20).font('Helvetica-Bold').text('EDU', 70, 75);
            }

            // Mascot (top-right) with safe positioning
            try {
                if (fs.existsSync(mascotPath)) {
                    doc.image(mascotPath, pageWidth - 120, 50, { width: 70, height: 70 });
                    console.log('✅ Mascot embedded from file');
                } else {
                    // Fallback mascot design
                    const mascotX = pageWidth - 85;
                    doc.fillColor('#667eea')
                        .circle(mascotX, 85, 35)
                        .fill();
                    doc.fillColor('white')
                        .fontSize(24)
                        .font('Helvetica-Bold')
                        .text('🎓', mascotX - 15, 70);
                    console.log('📄 Using fallback mascot design');
                }
            } catch (error) {
                console.warn('⚠️ Mascot embedding failed, using simple fallback');
                const mascotX = pageWidth - 85;
                doc.fillColor('#667eea').circle(mascotX, 85, 35).fill();
                doc.fillColor('white').fontSize(24).font('Helvetica-Bold').text('🎓', mascotX - 15, 70);
            }

            // Title with safe positioning
            doc.fillColor('#1e90ff').fontSize(32).font('Helvetica-Bold');
            doc.text('CERTIFICATE OF COMPLETION', 0, 100, { align: 'center' });

            // Decorative line under title with safe coordinates
            const lineY = 135;
            const lineStartX = Math.round(pageWidth * 0.25);
            const lineEndX = Math.round(pageWidth * 0.75);

            doc.strokeColor('#667eea').lineWidth(3);
            doc.moveTo(lineStartX, lineY).lineTo(lineEndX, lineY).stroke();

            doc.fillColor('#666').fontSize(16).font('Helvetica');
            doc.text('Edura Learning Platform', 0, 145, { align: 'center' });

            // Content with safe spacing
            doc.fillColor('#333').fontSize(18).font('Helvetica');
            doc.text('This is to certify that', 0, 190, { align: 'center' });

            // Student name with safe underline
            doc.fillColor('#000').fontSize(28).font('Helvetica-Bold');
            const nameY = 220;
            doc.text(fullName, 0, nameY, { align: 'center' });

            // FIXED: Safe underline calculation
            try {
                const nameWidth = doc.widthOfString(fullName);
                if (!isNaN(nameWidth) && nameWidth > 0) {
                    const nameX = Math.round((pageWidth - nameWidth) / 2);
                    const underlineY = nameY + 35;

                    doc.strokeColor('#1e90ff').lineWidth(3);
                    doc.moveTo(nameX - 20, underlineY).lineTo(nameX + nameWidth + 20, underlineY).stroke();

                    doc.strokeColor('#667eea').lineWidth(1);
                    doc.moveTo(nameX - 15, underlineY + 3).lineTo(nameX + nameWidth + 15, underlineY + 3).stroke();
                }
            } catch (error) {
                console.warn('⚠️ Skipping name underline due to calculation error');
            }

            doc.fillColor('#333').fontSize(18).font('Helvetica');
            doc.text('has successfully completed the course', 0, 285, { align: 'center' });

            // Course title
            doc.fillColor('#1e90ff').fontSize(22).font('Helvetica-Bold');
            doc.text(`"${courseTitle}"`, 0, 315, { align: 'center' });

            doc.fillColor('#333').fontSize(18).font('Helvetica');
            doc.text('under the guidance of', 0, 350, { align: 'center' });

            // Teacher name
            doc.fillColor('#000').fontSize(20).font('Helvetica-Bold');
            doc.text(teacherName || 'Unknown', 0, 380, { align: 'center' });

            doc.fillColor('#333').fontSize(18).font('Helvetica');
            doc.text('with a final score of', 0, 415, { align: 'center' });

            // Score with safe background
            doc.fillColor('#1e90ff').fontSize(26).font('Helvetica-Bold');
            const scoreText = String(score ?? 'N/A');

            try {
                const scoreWidth = doc.widthOfString(scoreText);
                if (!isNaN(scoreWidth) && scoreWidth > 0) {
                    const scoreX = Math.round((pageWidth - scoreWidth) / 2);
                    const scoreY = 445;

                    // Score background
                    doc.fillColor('#f0f8ff')
                        .rect(scoreX - 15, scoreY - 5, scoreWidth + 30, 30)
                        .fill();

                    doc.fillColor('#1e90ff').text(scoreText, 0, scoreY, { align: 'center' });
                } else {
                    doc.text(scoreText, 0, 445, { align: 'center' });
                }
            } catch (error) {
                console.warn('⚠️ Using simple score display');
                doc.text(scoreText, 0, 445, { align: 'center' });
            }

            // Footer section with safe positioning
            const footerY = 500;

            // Signature section
            doc.strokeColor('#ddd').lineWidth(1);
            doc.rect(pageWidth - 250, footerY - 5, 200, 60).stroke();

            doc.fillColor('#333').fontSize(12).font('Helvetica');
            doc.text('Representative of Edura', pageWidth - 240, footerY + 5);

            // Signature line with safe coordinates
            doc.strokeColor('#1e90ff').lineWidth(2);
            doc.moveTo(pageWidth - 230, footerY + 25).lineTo(pageWidth - 70, footerY + 25).stroke();

            doc.fillColor('#1e90ff').fontSize(14).font('Helvetica-Bold');
            doc.text('Efrino Wahyu Eko Pambudi', pageWidth - 240, footerY + 35, { width: 180, align: 'center' });

            // Date and Certificate ID
            doc.fillColor('#666').fontSize(12).font('Helvetica');
            doc.text(`📅 Issued: ${formattedDate}`, 50, footerY + 10);
            doc.text(`🔖 ID: ${certId}`, 50, footerY + 25);
            doc.text(`© ${now.getFullYear()} Edura Platform`, 50, footerY + 40);

            // FIXED: Safe corner decorations
            const cornerSize = 30;
            doc.strokeColor('#1e90ff').lineWidth(3);

            // Safe corner coordinates
            const corners = [
                { x: 50, y: 50 },      // top-left
                { x: pageWidth - 50, y: 50 },  // top-right  
                { x: 50, y: pageHeight - 50 }, // bottom-left
                { x: pageWidth - 50, y: pageHeight - 50 } // bottom-right
            ];

            corners.forEach((corner, index) => {
                try {
                    if (index === 0) { // top-left
                        doc.moveTo(corner.x, corner.y).lineTo(corner.x + cornerSize, corner.y).stroke();
                        doc.moveTo(corner.x, corner.y).lineTo(corner.x, corner.y + cornerSize).stroke();
                    } else if (index === 1) { // top-right
                        doc.moveTo(corner.x, corner.y).lineTo(corner.x - cornerSize, corner.y).stroke();
                        doc.moveTo(corner.x, corner.y).lineTo(corner.x, corner.y + cornerSize).stroke();
                    } else if (index === 2) { // bottom-left
                        doc.moveTo(corner.x, corner.y).lineTo(corner.x + cornerSize, corner.y).stroke();
                        doc.moveTo(corner.x, corner.y).lineTo(corner.x, corner.y - cornerSize).stroke();
                    } else { // bottom-right
                        doc.moveTo(corner.x, corner.y).lineTo(corner.x - cornerSize, corner.y).stroke();
                        doc.moveTo(corner.x, corner.y).lineTo(corner.x, corner.y - cornerSize).stroke();
                    }
                } catch (error) {
                    console.warn(`⚠️ Skipping corner ${index} due to calculation error`);
                }
            });

            doc.end();
        } catch (error) {
            console.error('❌ Enhanced PDFKit error:', error);
            reject(error);
        }
    });
}

// Method 2: Playwright with proper installation check
async function generateWithPlaywright({ fullName, courseTitle, teacherName, score }) {
    if (!playwright) {
        throw new Error('Playwright not available');
    }

    console.log('🎭 Checking Playwright installation...');

    // Check if Playwright browsers are installed
    try {
        const browser = await playwright.chromium.launch({ headless: true });
        await browser.close();
        console.log('✅ Playwright browsers are installed');
    } catch (error) {
        if (error.message.includes("Executable doesn't exist")) {
            throw new Error('Playwright browsers not installed. Please run: npx playwright install');
        }
        throw error;
    }

    const templatePath = selectTemplate();
    if (!templatePath) {
        throw new Error('No HTML template found');
    }

    let html = fs.readFileSync(templatePath, 'utf-8');

    const now = new Date();
    const formattedDate = now.toLocaleDateString('id-ID', {
        day: 'numeric', month: 'long', year: 'numeric'
    });

    // Embed images
    const images = embedImages();

    html = html
        .replace(/{{FULL_NAME}}/g, fullName)
        .replace(/{{COURSE_TITLE}}/g, courseTitle)
        .replace(/{{TEACHER_NAME}}/g, teacherName || 'Unknown')
        .replace(/{{FINAL_SCORE}}/g, score ?? 'N/A')
        .replace(/{{YEAR}}/g, now.getFullYear())
        .replace(/{{DATE}}/g, formattedDate)
        .replace(/{{CERTIFICATE_ID}}/g, uuidv4().substring(0, 8).toUpperCase());

    let browser = null;
    try {
        console.log('🎭 Using Playwright with enhanced template...');

        browser = await playwright.chromium.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        });

        const context = await browser.newContext();
        const page = await context.newPage();

        await page.setContent(html, { waitUntil: 'domcontentloaded' });

        const pdfBuffer = await page.pdf({
            format: 'A4',
            landscape: true,
            printBackground: true,
            margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' }
        });

        console.log('✅ PDF generated with Playwright');
        return pdfBuffer;

    } finally {
        if (browser) {
            await browser.close();
            console.log('🎭 Playwright browser closed');
        }
    }
}

// Method 3: Puppeteer (unchanged)
async function generateWithPuppeteer({ fullName, courseTitle, teacherName, score }) {
    if (!puppeteer) {
        throw new Error('Puppeteer not available');
    }

    const templatePath = selectTemplate();
    if (!templatePath) {
        throw new Error('No HTML template found');
    }

    let html = fs.readFileSync(templatePath, 'utf-8');

    const now = new Date();
    const formattedDate = now.toLocaleDateString('id-ID', {
        day: 'numeric', month: 'long', year: 'numeric'
    });

    const images = embedImages();

    html = html
        .replace(/{{FULL_NAME}}/g, fullName)
        .replace(/{{COURSE_TITLE}}/g, courseTitle)
        .replace(/{{TEACHER_NAME}}/g, teacherName || 'Unknown')
        .replace(/{{FINAL_SCORE}}/g, score ?? 'N/A')
        .replace(/{{YEAR}}/g, now.getFullYear())
        .replace(/{{DATE}}/g, formattedDate)
        .replace(/{{CERTIFICATE_ID}}/g, uuidv4().substring(0, 8).toUpperCase());

    let browser = null;
    try {
        console.log('🤖 Using Puppeteer with enhanced template...');

        const isProduction = process.env.NODE_ENV === 'production' || process.env.GOOGLE_CLOUD_PROJECT;

        const launchOptions = {
            headless: true,
            timeout: 20000,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--single-process',
                '--disable-gpu'
            ]
        };

        if (isProduction) {
            launchOptions.executablePath = '/usr/bin/google-chrome-stable';
        }

        browser = await puppeteer.launch(launchOptions);
        const page = await browser.newPage();

        await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 10000 });

        const pdfBuffer = await page.pdf({
            format: 'A4',
            landscape: true,
            printBackground: true,
            margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' }
        });

        console.log('✅ PDF generated with Puppeteer');
        return pdfBuffer;

    } finally {
        if (browser) {
            await browser.close();
            console.log('🤖 Puppeteer browser closed');
        }
    }
}

// Main function dengan error handling yang lebih baik
async function generateCertificate(params) {
    console.log('📄 Starting enhanced certificate generation for:', params.fullName);

    // Check for image files
    const logoExists = fs.existsSync(path.join(__dirname, 'logo2.png'));
    const mascotExists = fs.existsSync(path.join(__dirname, 'maskot6.png'));

    console.log(`🎨 Images status: Logo ${logoExists ? '✅' : '❌'}, Mascot ${mascotExists ? '✅' : '❌'}`);

    const methods = [
        { name: 'Enhanced PDFKit', fn: generateWithPDFKit },
        { name: 'Playwright', fn: generateWithPlaywright },
        { name: 'Puppeteer', fn: generateWithPuppeteer }
    ];

    for (const method of methods) {
        try {
            console.log(`🔄 Trying ${method.name}...`);

            if (method.name.includes('PDFKit')) {
                return await method.fn(params);
            } else {
                return await retryWithBackoff(() => method.fn(params), 2, 1000);
            }
        } catch (error) {
            console.error(`❌ ${method.name} failed:`, error.message);

            if (method === methods[methods.length - 1]) {
                throw new Error(`All PDF generation methods failed. Last error: ${error.message}`);
            }
        }
    }
}

module.exports = { generateCertificate };
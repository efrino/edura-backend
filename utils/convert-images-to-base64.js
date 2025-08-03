const fs = require('fs');
const path = require('path');

/**
 * Script untuk convert PNG images ke base64 dan generate template HTML
 * Usage: node scripts/convert-images-to-base64.js
 */

function convertImageToBase64(imagePath) {
    try {
        if (!fs.existsSync(imagePath)) {
            console.warn(`⚠️ Image not found: ${imagePath}`);
            return null;
        }

        const imageBuffer = fs.readFileSync(imagePath);
        const base64String = imageBuffer.toString('base64');
        const ext = path.extname(imagePath).toLowerCase();

        let mimeType;
        switch (ext) {
            case '.png':
                mimeType = 'image/png';
                break;
            case '.jpg':
            case '.jpeg':
                mimeType = 'image/jpeg';
                break;
            case '.gif':
                mimeType = 'image/gif';
                break;
            case '.svg':
                mimeType = 'image/svg+xml';
                break;
            default:
                mimeType = 'image/png';
        }

        return `data:${mimeType};base64,${base64String}`;
    } catch (error) {
        console.error(`❌ Error converting ${imagePath}:`, error.message);
        return null;
    }
}

function generateTemplateWithImages() {
    const utilsDir = path.join(__dirname, '..', 'utils');
    const logoPath = path.join(utilsDir, 'logo2.png');
    const mascotPath = path.join(utilsDir, 'maskot6.png');

    console.log('🔄 Converting images to base64...');
    console.log(`Looking for logo: ${logoPath}`);
    console.log(`Looking for mascot: ${mascotPath}`);

    const logoBase64 = convertImageToBase64(logoPath);
    const mascotBase64 = convertImageToBase64(mascotPath);

    if (!logoBase64) {
        console.warn('⚠️ Logo not found, using fallback');
    }

    if (!mascotBase64) {
        console.warn('⚠️ Mascot not found, using fallback');
    }

    const templateContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <title>Certificate of Completion</title>
    <style>
        body {
            font-family: 'Georgia', 'Times New Roman', serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 0;
            margin: 0;
            width: 297mm;
            height: 210mm;
            box-sizing: border-box;
            position: relative;
            overflow: hidden;
        }

        @page {
            size: A4 landscape;
            margin: 0;
        }

        .certificate-background {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
            z-index: 1;
        }

        .certificate-overlay {
            position: absolute;
            top: 20px;
            left: 20px;
            right: 20px;
            bottom: 20px;
            background: white;
            border-radius: 20px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            z-index: 2;
            border: 4px solid;
            border-image: linear-gradient(45deg, #667eea, #764ba2, #667eea) 1;
        }

        .certificate-container {
            position: relative;
            width: 100%;
            height: 100%;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            padding: 40px;
            box-sizing: border-box;
            z-index: 3;
        }

        .header {
            text-align: center;
            margin-bottom: 20px;
        }

        .logo {
            position: absolute;
            top: 30px;
            left: 40px;
            width: 80px;
            height: 80px;
            ${logoBase64 ? `background-image: url('${logoBase64}');` : `
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-weight: bold;
            font-size: 24px;`}
            background-size: cover;
            background-position: center;
            border-radius: 15px;
            box-shadow: 0 8px 16px rgba(0,0,0,0.1);
        }

        .mascot {
            position: absolute;
            top: 30px;
            right: 40px;
            width: 80px;
            height: 80px;
            ${mascotBase64 ? `background-image: url('${mascotBase64}');` : `
            background: linear-gradient(135deg, #764ba2 0%, #667eea 100%);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-weight: bold;
            font-size: 32px;`}
            background-size: cover;
            background-position: center;
            border-radius: 15px;
            box-shadow: 0 8px 16px rgba(0,0,0,0.1);
        }

        .certificate-title {
            font-family: 'Georgia', serif;
            font-size: 42px;
            font-weight: bold;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            margin: 60px 0 10px 0;
            text-transform: uppercase;
            letter-spacing: 4px;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.1);
        }

        .subtitle {
            font-size: 18px;
            color: #666;
            font-style: italic;
            margin-bottom: 30px;
        }

        .content {
            text-align: center;
            flex-grow: 1;
            display: flex;
            flex-direction: column;
            justify-content: center;
            padding: 20px 0;
        }

        .content p {
            font-size: 20px;
            color: #555;
            margin: 8px 0;
            line-height: 1.6;
        }

        .name {
            font-size: 36px;
            font-weight: bold;
            margin: 25px 0;
            color: #333;
            padding: 15px 40px;
            background: linear-gradient(135deg, rgba(102, 126, 234, 0.1) 0%, rgba(118, 75, 162, 0.1) 100%);
            border-radius: 15px;
            display: inline-block;
            border: 2px solid rgba(102, 126, 234, 0.3);
            box-shadow: 0 4px 8px rgba(0,0,0,0.1);
        }

        .course-title {
            font-size: 24px;
            font-weight: 600;
            color: #764ba2;
            margin: 20px 0;
            font-style: italic;
            text-shadow: 1px 1px 2px rgba(0,0,0,0.1);
        }

        .score {
            font-size: 32px;
            font-weight: bold;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            margin: 15px 0;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.1);
        }

        .footer {
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
            margin-top: 30px;
        }

        .signature {
            text-align: center;
        }

        .signature-line {
            width: 200px;
            height: 2px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            margin: 20px auto 10px;
            border-radius: 1px;
        }

        .signature-name {
            font-size: 18px;
            font-weight: bold;
            color: #764ba2;
            margin-bottom: 5px;
        }

        .signature-title {
            font-size: 14px;
            color: #666;
            font-style: italic;
        }

        .certificate-info {
            text-align: left;
            font-size: 12px;
            color: #888;
        }

        .date-info {
            margin-bottom: 5px;
        }

        .certificate-id {
            font-weight: bold;
            color: #667eea;
        }

        /* Decorative elements */
        .decoration {
            position: absolute;
            width: 40px;
            height: 40px;
            border: 3px solid;
            border-image: linear-gradient(45deg, #667eea, #764ba2) 1;
        }

        .top-left {
            top: 60px;
            left: 60px;
            border-right: none;
            border-bottom: none;
        }

        .top-right {
            top: 60px;
            right: 60px;
            border-left: none;
            border-bottom: none;
        }

        .bottom-left {
            bottom: 60px;
            left: 60px;
            border-right: none;
            border-top: none;
        }

        .bottom-right {
            bottom: 60px;
            right: 60px;
            border-left: none;
            border-top: none;
        }

        /* Pattern overlay */
        .pattern-overlay {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            opacity: 0.05;
            background-image: 
                radial-gradient(circle at 50% 50%, #667eea 2px, transparent 2px);
            background-size: 30px 30px;
            z-index: 1;
        }
    </style>
</head>

<body>
    <div class="certificate-background"></div>
    <div class="certificate-overlay">
        <div class="pattern-overlay"></div>
        
        <div class="certificate-container">
            <!-- Decorative corners -->
            <div class="decoration top-left"></div>
            <div class="decoration top-right"></div>
            <div class="decoration bottom-left"></div>
            <div class="decoration bottom-right"></div>

            <!-- Logo and Mascot -->
            <div class="logo">${logoBase64 ? '' : 'EDU'}</div>
            <div class="mascot">${mascotBase64 ? '' : '🎓'}</div>

            <!-- Header -->
            <div class="header">
                <div class="certificate-title">Certificate of Completion</div>
                <div class="subtitle">Edura Learning Platform</div>
            </div>

            <!-- Content -->
            <div class="content">
                <p>This is to certify that</p>
                <div class="name">{{FULL_NAME}}</div>
                
                <p>has successfully completed the course</p>
                <div class="course-title">"{{COURSE_TITLE}}"</div>
                
                <p>under the guidance of</p>
                <div class="name">{{TEACHER_NAME}}</div>
                
                <p>with a final score of</p>
                <div class="score">{{FINAL_SCORE}}</div>
            </div>

            <!-- Footer -->
            <div class="footer">
                <div class="certificate-info">
                    <div class="date-info">Issued on: {{DATE}}</div>
                    <div class="certificate-id">Certificate ID: {{CERTIFICATE_ID}}</div>
                    <div style="margin-top: 10px; font-size: 10px;">
                        Edura LMS © {{YEAR}} | All Rights Reserved
                    </div>
                </div>
                
                <div class="signature">
                    <div class="signature-line"></div>
                    <div class="signature-name">Efrino Wahyu Eko Pambudi</div>
                    <div class="signature-title">Representative of Edura</div>
                </div>
            </div>
        </div>
    </div>
</body>
</html>`;

    // Save template
    const outputPath = path.join(utilsDir, 'template-with-images.html');
    fs.writeFileSync(outputPath, templateContent);

    console.log('✅ Template generated with images!');
    console.log(`📄 Saved to: ${outputPath}`);

    // Generate info file
    const infoContent = `# Certificate Template with Images

Generated: ${new Date().toISOString()}

## Images Used:
- Logo: ${logoBase64 ? '✅ logo2.png converted to base64' : '❌ logo2.png not found, using fallback'}
- Mascot: ${mascotBase64 ? '✅ maskot6.png converted to base64' : '❌ maskot6.png not found, using fallback'}

## File Locations:
- Template: utils/template-with-images.html
- Original logo: utils/logo2.png
- Original mascot: utils/maskot6.png

## Usage:
Update your certificate.js to use 'template-with-images.html' instead of 'template.html'

## Notes:
- Images are embedded as base64 data URLs
- No external file dependencies
- Works with all PDF generation methods
- Template is responsive and print-ready
`;

    const infoPath = path.join(utilsDir, 'template-info.md');
    fs.writeFileSync(infoPath, infoContent);

    console.log('📋 Info file created:', infoPath);

    return {
        templatePath: outputPath,
        logoFound: !!logoBase64,
        mascotFound: !!mascotBase64
    };
}

// Test function
function testImageConversion() {
    console.log('🧪 Testing image conversion...');

    const utilsDir = path.join(__dirname, '..', 'utils');
    const testImages = [
        path.join(utilsDir, 'logo2.png'),
        path.join(utilsDir, 'maskot6.png')
    ];

    testImages.forEach(imagePath => {
        const fileName = path.basename(imagePath);
        if (fs.existsSync(imagePath)) {
            const stats = fs.statSync(imagePath);
            const sizeKB = (stats.size / 1024).toFixed(2);
            console.log(`✅ ${fileName}: Found (${sizeKB} KB)`);

            const base64 = convertImageToBase64(imagePath);
            if (base64) {
                const base64SizeKB = (base64.length / 1024).toFixed(2);
                console.log(`   📏 Base64 size: ${base64SizeKB} KB`);
            }
        } else {
            console.log(`❌ ${fileName}: Not found`);
            console.log(`   Expected location: ${imagePath}`);
        }
    });
}

// Main execution
function main() {
    console.log('🎨 Certificate Template Image Converter');
    console.log('='.repeat(50));

    testImageConversion();
    console.log('');

    const result = generateTemplateWithImages();

    console.log('');
    console.log('📊 Summary:');
    console.log(`✅ Template generated: ${result.templatePath}`);
    console.log(`${result.logoFound ? '✅' : '❌'} Logo: ${result.logoFound ? 'Embedded successfully' : 'Using fallback'}`);
    console.log(`${result.mascotFound ? '✅' : '❌'} Mascot: ${result.mascotFound ? 'Embedded successfully' : 'Using fallback'}`);

    console.log('');
    console.log('🔄 Next steps:');
    console.log('1. Update your certificate.js to use "template-with-images.html"');
    console.log('2. Test certificate generation: npm run test:certificate');
    console.log('3. If images not found, place logo2.png and maskot6.png in utils/ directory');
}

if (require.main === module) {
    main();
}

module.exports = { convertImageToBase64, generateTemplateWithImages };
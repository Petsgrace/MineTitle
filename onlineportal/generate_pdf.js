const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();

    const htmlPath = path.resolve(__dirname, 'otdas_architecture.html');
    const pdfPath = path.resolve(__dirname, 'OTDAS_System_Architecture.pdf');

    console.log('Loading HTML file...');
    await page.goto(`file:///${htmlPath.replace(/\\/g, '/')}`, {
        waitUntil: 'networkidle0',
        timeout: 60000
    });

    // Wait for Mermaid to finish rendering
    console.log('Waiting for Mermaid diagrams to render...');
    await page.waitForFunction(() => {
        const mermaidDivs = document.querySelectorAll('.mermaid');
        return Array.from(mermaidDivs).every(div => div.querySelector('svg'));
    }, { timeout: 30000 });

    // Extra wait to ensure full render
    await new Promise(r => setTimeout(r, 2000));

    console.log('Generating PDF...');
    await page.pdf({
        path: pdfPath,
        format: 'A3',
        printBackground: true,
        margin: {
            top: '20mm',
            right: '15mm',
            bottom: '20mm',
            left: '15mm'
        },
        displayHeaderFooter: false
    });

    console.log(`PDF saved to: ${pdfPath}`);
    await browser.close();
})();

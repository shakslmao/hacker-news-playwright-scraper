const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

function generatePDFReport(results, screenshotsDir, tracesDir, pdfPath) {
    const doc = new PDFDocument();

    doc.pipe(fs.createWriteStream(pdfPath));

    // Title
    doc.fontSize(20)
        .text("Automated Test Report for Hacker News Scraping", { align: "center" })
        .moveDown(2);

    // Test Overview
    doc.fontSize(16).text("Test Overview", { underline: true }).moveDown(0.5);
    doc.fontSize(12)
        .text(`Date: ${new Date().toLocaleString()}`)
        .text(`Browser: ${results.browser}`)
        .text(`Pages Scraped: ${results.pages}`)
        .text(`Authentication: ${results.auth ? "Enabled" : "Disabled"}`)
        .text(`Trace: ${results.trace ? "Enabled" : "Disabled"}`)
        .moveDown(1);

    // Summary of Results
    doc.fontSize(16).text("Summary of Results", { underline: true }).moveDown(0.5);
    doc.fontSize(12)
        .text(`Total Articles Scraped: ${results.totalArticles}`)
        .text(`Sorting Validation: ${results.isSorted ? "Passed" : "Failed"}`)
        .moveDown(1);

    if (results.errors.length > 0) {
        doc.fontSize(12).text("Errors Encountered:");
        results.errors.forEach((error, index) => {
            doc.text(`${index + 1}. ${error}`);
        });
        doc.moveDown(1);
    }

    // Screenshots Section
    const screenshots = fs.readdirSync(screenshotsDir).filter((file) => file.endsWith(".png"));
    doc.fontSize(16).text("Screenshots", { underline: true }).moveDown(0.5);
    screenshots.forEach((screenshot, index) => {
        const imgPath = path.join(screenshotsDir, screenshot);
        doc.text(`Screenshot ${index + 1}: ${screenshot}`).moveDown(0.5);

        if (fs.existsSync(imgPath)) {
            doc.image(imgPath, { width: 400 }).moveDown(1);
        }
    });

    // Trace Files Section
    const traceFiles = fs.readdirSync(tracesDir).filter((file) => file.endsWith(".zip"));
    doc.fontSize(16).text("Trace Files", { underline: true }).moveDown(0.5);
    traceFiles.forEach((trace, index) => {
        doc.fontSize(12)
            .text(`Trace File ${index + 1}: ${trace}`)
            .moveDown(0.5);
    });

    // FinaliSe the PDF
    doc.end();
    console.log(`PDF report saved to ${pdfPath}`);
}

module.exports = { generatePDFReport };

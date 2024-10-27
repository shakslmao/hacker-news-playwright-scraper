const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

/**
 * Generates a formatted PDF report for the Hacker News scraping test results
 * @param {Object} results - Test results object
 * @param {string} screenshotsDir - Directory containing screenshots
 * @param {string} tracesDir - Directory containing trace files
 * @param {string} pdfPath - Output path for the PDF file
 */

function generatePDFReport(results, screenshotsDir, tracesDir, pdfPath) {
    // Initialize PDF document
    const doc = new PDFDocument({
        margin: 50,
        size: "A4",
    });

    // Setup write stream
    doc.pipe(fs.createWriteStream(pdfPath));

    // Helper function to add section headers
    const addSectionHeader = (text) => {
        doc.moveDown(1)
            .fontSize(16)
            .fillColor("#2c3e50")
            .text(text, { underline: true })
            .moveDown(0.5)
            .fillColor("#333333")
            .fontSize(12);
    };

    const addKeyValue = (key, value) => {
        doc.text(`${key}: `, {
            continued: true,
            width: 150,
        })
            .fillColor("#666666")
            .text(`${value}`)
            .fillColor("#333333");
    };

    // Title
    doc.fontSize(24)
        .fillColor("#1a365d")
        .text("Hacker News Scraping Test Report", {
            align: "center",
        })
        .moveDown(0.5);

    // Timestamp
    doc.fontSize(10)
        .fillColor("#666666")
        .text(`Generated: ${new Date().toLocaleString()}`, {
            align: "center",
        })
        .moveDown(2);

    // Test Configuration
    addSectionHeader("Test Configuration");
    addKeyValue("Browser", results.browser);
    addKeyValue("Pages Scraped", results.pages);
    addKeyValue("Authentication", results.auth ? "Enabled" : "Disabled");
    addKeyValue("Tracing", results.trace ? "Enabled" : "Disabled");

    // Test Results
    addSectionHeader("Test Results");

    const testPassed = results.isSorted && (!results.errors || results.errors.length === 0);
    const statusColor = testPassed ? "#27ae60" : "#c0392b";
    doc.fillColor(statusColor)
        .fontSize(14)
        .text(`Overall Status: ${testPassed ? "PASSED" : "FAILED"}`)
        .moveDown(0.5)
        .fillColor("#333333")
        .fontSize(12);

    addKeyValue("Total Articles Scraped", results.totalArticles);
    addKeyValue("Sorting Validation", results.isSorted ? "Passed" : "Failed");

    // Errors Section (if any)
    if (results.errors && results.errors.length > 0) {
        addSectionHeader("Errors Encountered");
        doc.fillColor("#e74c3c");
        results.errors.forEach((error, index) => {
            doc.text(`${index + 1}. ${error}`).moveDown(0.5);
        });
        doc.fillColor("#333333");
    }

    // Screenshots List
    addSectionHeader("Screenshots Captured");
    const screenshots = fs.readdirSync(screenshotsDir).filter((file) => file.endsWith(".png"));

    if (screenshots.length > 0) {
        screenshots.forEach((screenshot, index) => {
            doc.text(`${index + 1}. ${screenshot}`).moveDown(0.25);
        });
    } else {
        doc.fillColor("#666666")
            .text("No screenshots were captured during this test run")
            .fillColor("#333333");
    }

    // Trace Files
    addSectionHeader("Trace Files");
    const traceFiles = fs.readdirSync(tracesDir).filter((file) => file.endsWith(".zip"));

    if (traceFiles.length > 0) {
        traceFiles.forEach((trace, index) => {
            doc.text(`${index + 1}. ${trace}`).moveDown(0.25);
        });
    } else {
        doc.fillColor("#666666")
            .text("No trace files were generated during this test run")
            .fillColor("#333333");
    }

    // Footer
    doc.moveDown(2).fontSize(10).fillColor("#666666").text("End of Report", {
        align: "center",
    });

    // Finalise the PDF
    doc.end();
    console.log(`PDF report generated successfully: ${pdfPath}`);
}

module.exports = { generatePDFReport };

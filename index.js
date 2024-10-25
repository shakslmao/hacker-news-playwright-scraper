/**
 * @author Shaakir Akram
 * @description QA Wolf Take Home Assignment
 *  This script is designed to scrape articles from the Hacker News webssite and validate that they are sorted from newest to oldest.
 */

const fs = require("fs");
const { chromium, firefox, webkit } = require("playwright");
const { expect } = require("@playwright/test");
const { program } = require("commander");
const { generatePDFReport } = require("./generateReport");
const cookies = require("./cookies.json");

// Set up command-line options for the script, including username, password, browser type, number of pages to scrape, and other options
program
    .option("--username <username>", "Hacker News username")
    .option("--password <password>", "Hacker News password")
    .option("--browser <browserType>", "Browser to use (chromium, firefox, webkit)", "chromium")
    .option("--pages <number>", "Number of pages to scrape", 10)
    .option("--trace", "Enable tracing", false)
    .option("--auth", "Enable authentication", false)
    .parse(process.argv);

const options = program.opts(); // Parse the command-line arguments

const tracesDir = "./traces"; // Directory to store trace files
const screenshotsDir = "./screenshots"; // Directory to store screenshots

// Create directories for traces and screenshots if they do not exist
if (!fs.existsSync(tracesDir)) {
    fs.mkdirSync(tracesDir);
}
if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir);
}

// Function to scrape and validate Hacker News articles, checking if they are sorted by date
async function sortHackerNewsArticles(browserType, trace, authenticated, totalPages) {
    const browser = await (browserType === "chromium"
        ? chromium
        : browserType === "firefox"
        ? firefox
        : webkit
    ).launch({ headless: false });

    const context = await browser.newContext(); // Create a new browser context

    // Start tracing if the option is enabled
    if (trace) await context.tracing.start({ screenshots: true, snapshots: true });

    // Log in to Hacker News if authentication is required
    if (authenticated) {
        // await context.addCookies(cookies); // Add cookies to the context for authentication
        const loginSuccess = await logIntoHackerNews(
            context,
            options.username,
            options.password,
            browserType
        );
        if (!loginSuccess) {
            console.error("Aborting test due to login failure.");
            await context.close();
            await browser.close();
            return [];
        }
    }

    const page = await context.newPage(); // Open a new page
    let articlesToValidate = []; // Array to store scraped articles
    let nextPageUrl = "https://news.ycombinator.com/newest"; // Start scraping from the newest articles page
    let currentPage = 1; // Counter for the current page being scraped
    let retryCount = 0; // Counter for the number of retries on a page
    const maxRetries = 3; // Maximum number of retries before giving up

    // Loop through pages and scrape articles until the target of 100 articles is reached or no more pages are available
    while (articlesToValidate.length < 100 && nextPageUrl && currentPage <= totalPages) {
        try {
            console.log(`Scraping page ${currentPage}: ${nextPageUrl}`);
            await page.goto(nextPageUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
            await expect(page).toHaveURL(nextPageUrl); // Assert that the page has loaded correctly
            await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {
                console.log("Continuing after networkidle timeout");
            }); // Wait for the page to stabilise

            const currentUrl = page.url();
            if (!currentUrl.includes("news.ycombinator.com")) throw new Error("Invalid URL");

            await page.waitForSelector(".athing", { timeout: 10000 }); // Wait for the articles to appear on the page
            await page.screenshot({
                path: `${screenshotsDir}/screenshot-${browserType}-page${currentPage}${
                    authenticated ? "-auth" : ""
                }.png`, // Take a screenshot of each page
            });

            const articleRows = page.locator(".athing"); // Locate all article rows
            const articleCount = await articleRows.count(); // Count the number of articles on the page
            await expect(articleCount).toBeGreaterThan(0); // Ensure there are articles to scrape

            // Extract relevant details (title, age, date) for each article
            for (let i = 0; i < articleCount; i++) {
                const article = articleRows.nth(i);
                const articleId = await article.getAttribute("id");
                const articleTitle = await article.locator(".titleline > a").textContent();
                const subtextRow = article.locator(":scope + tr");
                const ageElement = subtextRow.locator(".age > a");
                const articleAge = await ageElement.textContent();
                const timestamp = await ageElement.getAttribute("title");

                let articleDate;
                // Parse the article's timestamp, defaulting to 0 if parsing fails
                if (timestamp) {
                    try {
                        articleDate = new Date(timestamp);
                    } catch (e) {
                        articleDate = new Date(0);
                        console.log(`Failed to parse date for article: ${articleTitle}`);
                    }
                } else {
                    articleDate = new Date(0);
                }

                // Add the article's details to the list for validation
                articlesToValidate.push({
                    articleId,
                    articleTitle: articleTitle.trim(),
                    articleAge: articleAge.trim(),
                    articleDate,
                });

                if (articlesToValidate.length >= 100) break;
            }

            // Check if there is a more link to go to the next page of articles
            const moreLink = await page.$("a.morelink");
            if (moreLink && currentPage < totalPages) {
                const href = await moreLink.getAttribute("href");
                nextPageUrl = "https://news.ycombinator.com/" + href; // Update URL for the next page
            } else {
                nextPageUrl = null; // Stop if there are no more pages
            }

            currentPage++; // Increment the page counter
        } catch (error) {
            console.error(`Error on Page ${currentPage}: ${error.message}`);
            retryCount++;

            if (retryCount >= maxRetries) {
                console.error(`Failed to load page ${currentPage} after ${maxRetries} attempts`);
                break;
            }

            await new Promise((resolve) => setTimeout(resolve, 3000)); // Wait for 3 seconds before retrying
        }
    }

    /*
    console.log(`Total articles collected: ${articlesToValidate.length}`);
    const isSorted = validateSorting(articlesToValidate);
    if (trace) {
        const tracePath = `${tracesDir}/trace-${browserType}-${Date.now()}.zip`;
        await context.tracing.stop({ path: tracePath });
        console.log(`Trace saved to ${tracePath}`);
    }
    */

    //Validate whether the articles are sorted correctly
    const isSorted = validateSorting(articlesToValidate);

    // Log the results of the sorting validation and display up to 100 articles
    if (articlesToValidate.length === 100) {
        console.log(`Articles are ${isSorted ? "correctly" : "not"} sorted from newest to oldest.`);
        articlesToValidate.slice(0, 100).forEach((article, i) => {
            console.log(`${i + 1}. ${article.articleTitle}`);
            console.log(`   Posted: ${article.articleAge}`);
        });
    } else {
        console.log(`Only found ${articlesToValidate.length} articles.`);
    }

    // Stop tracing and save the trace file if tracing is enabled
    if (trace) {
        const tracePath = `${tracesDir}/trace-${browserType}-${Date.now()}.zip`;
        await context.tracing.stop({ path: tracePath });
        console.log(`Trace saved to ${tracePath}`);
    }

    await browser.close(); // Close the browser
    return { articlesToValidate, isSorted }; // Return the validation results
}

// Function to validate that articles are sorted in descending order by date
function validateSorting(articles) {
    for (let i = 1; i < articles.length; i++) {
        if (articles[i].articleDate > articles[i - 1].articleDate) {
            console.error(`Sorting violation found between articles ${i} and ${i - 1}.`);
            return false; // Return false if a sorting issue is detected
        }
    }
    return true; // Return true if all articles are correctly sorted
}

/*
// Function to log in to Hacker News using the provided username and password
async function logIntoHackerNews(context, username, password, browserType = "chromium") {
    const page = await context.newPage(); // Open a new page
    await page.goto("https://news.ycombinator.com/login?goto=newest"); // Navigate to the login page

    // Ensure username and password are provided before attempting to log in
    if (!username || !password) {
        console.error("Username and password must be provided via command-line arguments.");
        await page.close();
        return false;
    }

    // Fill in the login form with the provided credentials
    await page.fill('input[name="acct"]', username);
    await page.fill('input[name="pw"]', password);

    // Submit the login form and wait for navigation
    try {
        await Promise.all([page.click('input[type="submit"]'), page.waitForNavigation()]);
    } catch (e) {
        console.error("Login failed during navigation:", e.message);
        await page.screenshot({ path: `${screenshotsDir}/login-failure-${browserType}.png` }); // Capture screenshot on failure
        await page.close();
        return false;
    }

    // Capture a screenshot after successful login
    await page.screenshot({ path: `${screenshotsDir}/post-login-${browserType}.png` });

    // Check for login failure based on page content
    const loginError = await page.$('body:has-text("Bad login.")');
    if (loginError) {
        console.error("Login failed: Bad login credentials.");
        await page.close();
        return false;
    }

    // Ensure the user is logged in by checking for the presence of a logout link
    const loggedIn = await page.$('a[id="logout"]');
    expect(loggedIn).not.toBeNull();

    if (loggedIn) {
        console.log("Login successful.");
        await page.close();
        return true; // Return true if login is successful
    } else {
        console.error("Login failed: Logout link not found.");
        await page.screenshot({ path: `${screenshotsDir}/login-error-${browserType}.png` });
        await page.close();
        return false;
    }
}
*/

// Amended function to handle reCAPTCHA verification
async function logIntoHackerNews(context, username, password, browserType = "chromium") {
    const page = await context.newPage();

    try {
        await page.goto("https://news.ycombinator.com/login?goto=newest");

        if (!username || !password) {
            console.error("Username and password must be provided via command-line arguments.");
            await page.close();
            return false;
        }

        await page.fill('input[name="acct"]', username);
        await page.fill('input[name="pw"]', password);
        await page.click('input[type="submit"]');

        try {
            const recaptchaFrame = await page.waitForSelector('iframe[title*="reCAPTCHA"]', {
                timeout: 5000,
            });

            if (recaptchaFrame) {
                console.log("reCAPTCHA detected. Waiting for manual interaction...");

                await page.screenshot({
                    path: `${screenshotsDir}/recaptcha-${browserType}.png`,
                });

                try {
                    await page.waitForSelector('a[id="logout"]', {
                        timeout: 60000,
                    });
                    console.log("Manual reCAPTCHA verification successful.");
                } catch (timeoutError) {
                    console.error("Timeout waiting for reCAPTCHA verification.");
                    await page.screenshot({
                        path: `${screenshotsDir}/recaptcha-timeout-${browserType}.png`,
                    });
                    await page.close();
                    return false;
                }
            }
        } catch (noRecaptchaError) {
            const loginError = await page.$('body:has-text("Bad login.")');
            if (loginError) {
                console.error("Login failed: Bad login credentials.");
                await page.close();
                return false;
            }
        }

        const loggedIn = await page.$('a[id="logout"]');
        if (loggedIn) {
            console.log("Login successful.");
            await page.screenshot({
                path: `${screenshotsDir}/post-login-${browserType}.png`,
            });
            await page.close();
            return true;
        } else {
            console.error("Login failed: Unable to verify successful login.");
            await page.screenshot({
                path: `${screenshotsDir}/login-error-${browserType}.png`,
            });
            await page.close();
            return false;
        }
    } catch (error) {
        console.error("Login process failed:", error.message);
        await page.screenshot({
            path: `${screenshotsDir}/login-exception-${browserType}.png`,
        });
        await page.close();
        return false;
    }
}

// Main function to initiate the test, validate sorting, and generate a PDF report
(async () => {
    try {
        console.log(
            `Running test on ${options.browser} with ${options.pages} page(s), tracing: ${options.trace}, auth: ${options.auth}`
        );
        const { articlesToValidate, isSorted } = await sortHackerNewsArticles(
            options.browser,
            options.trace,
            options.auth,
            options.pages
        );

        const results = {
            browser: options.browser,
            pages: options.pages,
            auth: options.auth,
            trace: options.trace,
            totalArticles: articlesToValidate.length,
            isSorted: isSorted,
            errors: [],
        };

        // Generate a PDF report with the test results
        const outputPDFPath = "./TestReport.pdf";
        generatePDFReport(results, screenshotsDir, tracesDir, outputPDFPath);
    } catch (e) {
        console.error(`Error during test: ${e.message}`);
    }
})();

module.exports = { sortHackerNewsArticles, validateSorting, logIntoHackerNews };

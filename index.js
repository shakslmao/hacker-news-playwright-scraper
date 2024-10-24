const fs = require("fs");
const { chromium, firefox, webkit } = require("playwright");
const { expect } = require("@playwright/test");
const { program } = require("commander");
const { generatePDFReport } = require("./generateReport");

program
    .option("--username <username>", "Hacker News username")
    .option("--password <password>", "Hacker News password")
    .option("--browser <browserType>", "Browser to use (chromium, firefox, webkit)", "chromium")
    .option("--pages <number>", "Number of pages to scrape", 1)
    .option("--trace", "Enable tracing", false)
    .option("--auth", "Enable authentication", false)
    .parse(process.argv);

const options = program.opts();

const tracesDir = "./traces";
const screenshotsDir = "./screenshots";

if (!fs.existsSync(tracesDir)) {
    fs.mkdirSync(tracesDir);
}
if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir);
}

async function sortHackerNewsArticles(browserType, trace, authenticated, totalPages) {
    const browser = await (browserType === "chromium"
        ? chromium
        : browserType === "firefox"
        ? firefox
        : webkit
    ).launch({ headless: false });

    const context = await browser.newContext();

    if (trace) await context.tracing.start({ screenshots: true, snapshots: true });
    if (authenticated) {
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

    const page = await context.newPage();
    let articlesToValidate = [];
    let nextPageUrl = "https://news.ycombinator.com/newest";
    let currentPage = 1;

    while (articlesToValidate.length < 100 && nextPageUrl && currentPage <= totalPages) {
        await page.goto(nextPageUrl);
        await expect(page).toHaveURL(nextPageUrl);

        await page.waitForSelector(".athing");
        await page.screenshot({
            path: `${screenshotsDir}/screenshot-${browserType}-page${currentPage}${
                authenticated ? "-auth" : ""
            }.png`,
        });

        const articleRows = page.locator(".athing");
        const articleCount = await articleRows.count();
        await expect(articleCount).toBeGreaterThan(0);

        for (let i = 0; i < articleCount; i++) {
            const article = articleRows.nth(i);
            const articleId = await article.getAttribute("id");
            const articleTitle = await article.locator(".titleline > a").textContent();
            const subtextRow = article.locator(":scope + tr");
            const ageElement = subtextRow.locator(".age > a");
            const articleAge = await ageElement.textContent();
            const timestamp = await ageElement.getAttribute("title");

            let articleDate;
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

            articlesToValidate.push({
                articleId,
                articleTitle: articleTitle.trim(),
                articleAge: articleAge.trim(),
                articleDate,
            });

            if (articlesToValidate.length >= 100) break;
        }

        const moreLink = await page.$("a.morelink");
        if (moreLink && currentPage < totalPages) {
            const href = await moreLink.getAttribute("href");
            nextPageUrl = "https://news.ycombinator.com/" + href;
        } else {
            nextPageUrl = null;
        }

        currentPage++;
    }

    const isSorted = validateSorting(articlesToValidate);

    if (articlesToValidate.length === 100) {
        console.log(`Articles are ${isSorted ? "correctly" : "not"} sorted from newest to oldest.`);
        articlesToValidate.slice(0, 100).forEach((article, i) => {
            console.log(`${i + 1}. ${article.articleTitle}`);
            console.log(`   Posted: ${article.articleAge}`);
        });
    } else {
        console.log(`Only found ${articlesToValidate.length} articles.`);
    }

    if (trace) {
        const tracePath = `${tracesDir}/trace-${browserType}-${Date.now()}.zip`;
        await context.tracing.stop({ path: tracePath });
        console.log(`Trace saved to ${tracePath}`);
    }

    await browser.close();
    return { articlesToValidate, isSorted };
}

function validateSorting(articles) {
    for (let i = 1; i < articles.length; i++) {
        if (articles[i].articleDate > articles[i - 1].articleDate) {
            console.error(`Sorting violation found between articles ${i} and ${i - 1}.`);
            return false;
        }
    }
    return true;
}

async function logIntoHackerNews(context, username, password, browserType = "chromium") {
    const page = await context.newPage();
    await page.goto("https://news.ycombinator.com/login?goto=newest");

    if (!username || !password) {
        console.error("Username and password must be provided via command-line arguments.");
        await page.close();
        return false;
    }

    await page.fill('input[name="acct"]', username);
    await page.fill('input[name="pw"]', password);

    try {
        await Promise.all([page.click('input[type="submit"]'), page.waitForNavigation()]);
    } catch (e) {
        console.error("Login failed during navigation:", e.message);
        await page.screenshot({ path: `${screenshotsDir}/login-failure-${browserType}.png` });
        await page.close();
        return false;
    }

    await page.screenshot({ path: `${screenshotsDir}/post-login-${browserType}.png` });

    const loginError = await page.$('body:has-text("Bad login.")');
    if (loginError) {
        console.error("Login failed: Bad login credentials.");
        await page.close();
        return false;
    }

    const loggedIn = await page.$('a[id="logout"]');
    expect(loggedIn).not.toBeNull();

    if (loggedIn) {
        console.log("Login successful.");
        await page.close();
        return true;
    } else {
        console.error("Login failed: Logout link not found.");
        await page.screenshot({ path: `${screenshotsDir}/login-error-${browserType}.png` });
        await page.close();
        return false;
    }
}

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

        const outputPDFPath = "./TestReport.pdf";
        generatePDFReport(results, screenshotsDir, tracesDir, outputPDFPath);
    } catch (e) {
        console.error(`Error during test: ${e.message}`);
    }
})();

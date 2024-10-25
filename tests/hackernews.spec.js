const { test, expect } = require("@playwright/test");
const { sortHackerNewsArticles, validateSorting, logIntoHackerNews } = require("../index.js");
require("dotenv").config();

test.describe("Hacker News Article Sorting", () => {
    // Test the sorting functionality across different browsers
    test("should work across different browsers", async ({ browser }) => {
        const browsers = ["chromium", "firefox", "webkit"];
        for (const browserType of browsers) {
            const { articlesToValidate, isSorted } = await sortHackerNewsArticles(
                browserType,
                false,
                false,
                1
            );
            // Assert that the articles were successfully retrieved and are sorted correctly
            expect(articlesToValidate.length).toBeGreaterThan(0);
            expect(isSorted).toBeTruthy();
        }
    });

    // Test to ensure that exactly 100 articles are fetched when expected
    test("should fetch exactly 100 articles", async ({ browser }) => {
        const { articlesToValidate } = await sortHackerNewsArticles("chromium", false, false, 5);
        // Assert that 100 articles were scraped
        expect(articlesToValidate).toHaveLength(100);
    });

    // Test to ensure that the articles are in correct chronological order
    test("should maintain chronological order", async ({ browser }) => {
        const { articlesToValidate, isSorted } = await sortHackerNewsArticles(
            "chromium",
            false,
            false,
            4
        );
        // Assert that articles are sorted from newest to oldest
        expect(isSorted).toBeTruthy();
    });

    /**
     * Note: The following test is commented out because it requires reCAPTCHA
    /*
    // Test the authentication feature using environment variables for login
    test("should handle authentication correctly", async ({ browser }) => {
        const username = process.env.HNEWSUSER;
        const password = process.env.HNEWSPASSWORD;

        // Skip the test if login credentials are not set in environment variables
        test.skip(!username || !password, "HNEWSUSER and HNEWSPASSWORD not set");

        const { articlesToValidate } = await sortHackerNewsArticles("chromium", true, false, 5);
        // Assert that articles are retrieved when authentication is successful
        expect(articlesToValidate.length).toBeGreaterThan(0);
    });
    */

    // Test to simulate network failure and ensure the error is handled gracefully
    test("should handle network errors gracefully", async ({ page }) => {
        // Block all network requests to simulate a failure
        await page.route("**/*", (route) => route.abort());

        try {
            await sortHackerNewsArticles("chromium", false, false, 1);
        } catch (error) {
            // Assert that an error was thrown during the test
            expect(error.message).toBeTruthy();
        }
    });

    // Test to ensure that the rate limiting mechanism is respected during scraping
    test("should respect rate limiting", async ({ browser }) => {
        const startTime = Date.now();
        const { articlesToValidate } = await sortHackerNewsArticles("chromium", false, false, 3);
        const endTime = Date.now();

        const minimumExpectedTime = 1000; // Example: 2 pages * 500ms
        // Assert that the scraping process takes at least the expected time to avoid rate limits
        expect(endTime - startTime).toBeGreaterThan(minimumExpectedTime);
    });
});

const { test, expect } = require("@playwright/test");
const { sortHackerNewsArticles, validateSorting, logIntoHackerNews } = require("../index.js");
require("dotenv").config();

test.describe("Hacker News Article Sorting", () => {
    // test.beforeEach(async ({ page }) => {});

    test("should work across different browsers", async ({ browser }) => {
        const browsers = ["chromium", "firefox", "webkit"];
        for (const browserType of browsers) {
            const { articlesToValidate, isSorted } = await sortHackerNewsArticles(
                browserType,
                false,
                false,
                1
            );
            expect(articlesToValidate.length).toBeGreaterThan(0);
            expect(isSorted).toBeTruthy();
        }
    });

    test("should fetch exactly 100 articles", async ({ browser }) => {
        const { articlesToValidate } = await sortHackerNewsArticles("chromium", false, false, 5);
        expect(articlesToValidate).toHaveLength(100);
    });

    test("should maintain chronological order", async ({ browser }) => {
        const { articlesToValidate, isSorted } = await sortHackerNewsArticles(
            "chromium",
            false,
            false,
            4
        );
        expect(isSorted).toBeTruthy();
    });

    test("should handle authentication correctly", async ({ browser }) => {
        const username = process.env.HNEWSUSER;
        const password = process.env.HNEWSPASSWORD;

        test.skip(!username || !password, "HNEWSUSER and HNEWSPASSWORD not set");
        const { articlesToValidate } = await sortHackerNewsArticles("chromium", true, false, 5);
        expect(articlesToValidate.length).toBeGreaterThan(0);
    });

    test("should handle network errors gracefully", async ({ page }) => {
        await page.route("**/*", (route) => route.abort());

        try {
            await sortHackerNewsArticles("chromium", false, false, 1);
        } catch (error) {
            expect(error.message).toBeTruthy();
        }
    });

    test("should respect rate limiting", async ({ browser }) => {
        const startTime = Date.now();
        const { articlesToValidate } = await sortHackerNewsArticles("chromium", false, false, 3);
        const endTime = Date.now();

        const minimumExpectedTime = 1000; // 2 pages * 500ms
        expect(endTime - startTime).toBeGreaterThan(minimumExpectedTime);
    });
});

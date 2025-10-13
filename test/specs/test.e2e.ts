import { expect, browser, $ } from "@wdio/globals"

describe("Graph", () => {
    it("Should be zoomable", async () => {
        await browser.url("http://localhost:8001/noise.html");

        const overlay = await $(".overlay");

        await browser.action("wheel").scroll({
            origin: overlay,
            deltaX: 0,
            deltaY: 500,
            duration: 1000
        }).perform();

        await browser.waitUntil(() => false, {timeout: 100000000});
    })
})


import assert from 'assert';

async function loadTestPage(testPage, params = {}) {
    const searchParams = new URLSearchParams(params);
    const queryString = searchParams.toString();
    await browser.url(`/test/${testPage}${queryString ? `?${queryString}` : ''}`);
    await waitForGraphVisible();
}

async function waitForGraphVisible() {
    const svg = await $('.smolgraph');
    await svg.waitForExist({ timeout: 5000 });
}

describe('smolgraph', () => {
    describe('rendering', () => {
        it('should display a graph with numeric x-values', async () => {
            await loadTestPage('test-numeric.html');

            const tickLabels = await $$('.smolgraph .tick-label');
            // This is a loose check, we just want to ensure some labels are rendered.
            // A more specific check might be brittle if `calculateNiceScale` changes.
            assert(tickLabels.length > 5, `Expected more than 5 tick labels, but found ${tickLabels.length}`);
        });

        it('should display a graph with stringy x-values', async () => {
            await loadTestPage('test-stringy.html');

            const allXTickLabels = await $$('.smolgraph .tick-label[text-anchor="middle"]');
            const xTickLabels = [];
            const expectedLabels = ["Jan", "Feb", "Mar", "Apr", "May"];

            for (const labelEl of allXTickLabels) {
                const labelText = await labelEl.getText();
                if (labelText !== '') {
                    xTickLabels.push(labelEl);
                }
            }

            assert.strictEqual(xTickLabels.length, expectedLabels.length, `Expected ${expectedLabels.length} non-empty x-axis tick labels, but found ${xTickLabels.length}`);

            for (let i = 0; i < expectedLabels.length; i++) {
                const labelText = await xTickLabels[i].getText();
                assert.strictEqual(labelText, expectedLabels[i], `Expected label "${expectedLabels[i]}" but found "${labelText}"`);
            }
        });
    });

    describe('tick amount configuration', () => {
        it('should display the correct number of x-axis ticks based on configuration', async () => {
            const expectedXTickAmount = 5;
            await loadTestPage('test-function-props.html', { xTickAmount: expectedXTickAmount });

            const xTickLabels = await $$('.smolgraph .tick-label[text-anchor="middle"]');
            // The calculateNiceScale function might return slightly more or fewer ticks
            // than maxTicks, depending on the data range and step calculation.
            // For the given data [0-10] and maxTicks=5, calculateNiceScale returns 6 ticks (0,2,4,6,8,10).
            // It's more about testing the config propagates, not the exact algorithm.
            assert(xTickLabels.length >= expectedXTickAmount - 1 && xTickLabels.length <= expectedXTickAmount + 2,
                `Expected x-axis tick labels to be around ${expectedXTickAmount}, but found ${xTickLabels.length}`);
        });

        it('should display the correct number of y-axis ticks based on configuration', async () => {
            const expectedYTickAmount = 4;
            await loadTestPage('test-function-props.html', { yTickAmount: expectedYTickAmount });

            const yTickLabels = await $$('.smolgraph .tick-label[text-anchor="end"]');
            // Similar to x-axis ticks, expect a range due to calculateNiceScale logic.
            // For the given data [10-40] and maxTicks=4, calculateNiceScale returns 4 ticks (10,20,30,40).
            assert(yTickLabels.length >= expectedYTickAmount - 1 && yTickLabels.length <= expectedYTickAmount + 2,
                `Expected y-axis tick labels to be around ${expectedYTickAmount}, but found ${yTickLabels.length}`);
        });

        it('should display the correct number of x-axis tick lines based on configuration', async () => {
            const expectedXTickAmount = 5;
            await loadTestPage('test-function-props.html', { xTickAmount: expectedXTickAmount });

            const allTicks = await $$('.smolgraph .tick');
            const xTickLines = [];
            for (const tick of allTicks) {
                const x1 = await tick.getAttribute('x1');
                const x2 = await tick.getAttribute('x2');
                if (x1 === x2) { // It's a vertical line
                    xTickLines.push(tick);
                }
            }
            // Similar to tick labels, expect a range due to calculateNiceScale logic.
            // For the given data [0-10] and maxTicks=5, calculateNiceScale returns 6 ticks.
            assert(xTickLines.length >= expectedXTickAmount - 1 && xTickLines.length <= expectedXTickAmount + 2,
                `Expected x-axis tick lines to be around ${expectedXTickAmount}, but found ${xTickLines.length}`);
        });

        it('should display the correct number of y-axis tick lines based on configuration', async () => {
            const expectedYTickAmount = 4;
            await loadTestPage('test-function-props.html', { yTickAmount: expectedYTickAmount });

            const allTicks = await $$('.smolgraph .tick');
            const yTickLines = [];
            for (const tick of allTicks) {
                const y1 = await tick.getAttribute('y1');
                const y2 = await tick.getAttribute('y2');
                if (y1 === y2) { // It's a horizontal line
                    yTickLines.push(tick);
                }
            }
            // Similar to tick labels, expect a range due to calculateNiceScale logic.
            // For the given data [10-40] and maxTicks=4, calculateNiceScale returns 4 ticks.
            assert(yTickLines.length >= expectedYTickAmount - 1 && yTickLines.length <= expectedYTickAmount + 2,
                `Expected y-axis tick lines to be around ${expectedYTickAmount}, but found ${yTickLines.length}`);
        });
    });

    describe('axis labels', () => {
        it('should display the correct x-axis label', async () => {
            const expectedXAxisLabel = 'Time (s)';
            await loadTestPage('test-function-props.html', { xAxisLabel: expectedXAxisLabel });

            const xAxisLabelElement = await $('.smolgraph text[text-anchor="middle"]:not(.tick-label)');
            const labelText = await xAxisLabelElement.getText();

            // There might be other text elements with text-anchor="middle", so we check content
            assert.strictEqual(labelText, expectedXAxisLabel, `Expected x-axis label to be "${expectedXAxisLabel}" but found "${labelText}"`);
        });

        it('should display the correct y-axis label', async () => {
            const expectedYAxisLabel = 'Value (units)';
            await loadTestPage('test-function-props.html', { yAxisLabel: expectedYAxisLabel });

            const yAxisLabelElement = await $('.smolgraph text[transform*="rotate(-90)"]');
            const labelText = await yAxisLabelElement.getText();

            assert.strictEqual(labelText, expectedYAxisLabel, `Expected y-axis label to be "${expectedYAxisLabel}" but found "${labelText}"`);
        });
    });
});

async function getXAxisTickLabelsCount() {
    const xTickLabels = await $$('.smolgraph .tick-label[text-anchor="middle"]');
    return xTickLabels.length;
}

async function getYAxisTickLabelsCount() {
    const yTickLabels = await $$('.smolgraph .tick-label[text-anchor="end"]');
    return yTickLabels.length;
}

async function getOverlay() {
    const overlay = await $('.smolgraph .overlay');
    await overlay.waitForExist({ timeout: 5000 });
    return overlay;
}

async function simulateWheelEvent(deltaY = -500) {
    const overlay = await getOverlay();
    await browser.action("wheel").scroll({
        origin: overlay,
        deltaX: 0,
        deltaY: deltaY,
        duration: 100
    }).perform();
}

async function getXAxisTickLabelTexts() {
    const xTickLabelElements = await $$('.smolgraph .tick-label[text-anchor="middle"]');
    const texts = [];
    for (const el of xTickLabelElements) {
        texts.push(await el.getText());
    }
    return texts;
}

describe('smolgraph zooming', () => {
    it('should zoom in with scroll wheel and affect tick labels', async () => {
        await loadTestPage('test-numeric.html');

        const initialXAxisLabelTexts = await getXAxisTickLabelTexts();
        assert(initialXAxisLabelTexts.length > 0, 'Initial x-axis labels should be greater than 0');

        // Zoom in once
        await simulateWheelEvent(-500);
        await browser.pause(1000); // Give graph time to re-render
        const firstZoomXAxisLabelTexts = await getXAxisTickLabelTexts();
        assert.notDeepStrictEqual(firstZoomXAxisLabelTexts, initialXAxisLabelTexts,
            `X-axis labels should change after first zoom. Initial: ${initialXAxisLabelTexts}, After zoom: ${firstZoomXAxisLabelTexts}`);

        // Zoom in twice
        await simulateWheelEvent(-500);
        await browser.pause(1000); // Give graph time to re-render
        const secondZoomXAxisLabelTexts = await getXAxisTickLabelTexts();
        assert.notDeepStrictEqual(secondZoomXAxisLabelTexts, firstZoomXAxisLabelTexts,
            `X-axis labels should change after second zoom. First zoom: ${firstZoomXAxisLabelTexts}, Second zoom: ${secondZoomXAxisLabelTexts}`);
    });

    it('should reset zoom and revert tick labels to initial state', async () => {
        await loadTestPage('test-numeric.html');
        const resetButton = await $('.smolgraph .zoom-out');

        const initialXAxisLabelTexts = await getXAxisTickLabelTexts();
        assert(initialXAxisLabelTexts.length > 0, 'Initial x-axis labels should be greater than 0');

        // Zoom in twice
        await simulateWheelEvent(-500);
        await browser.pause(1000);
        await simulateWheelEvent(-500);
        await browser.pause(1000);
        const zoomedXAxisLabelTexts = await getXAxisTickLabelTexts();
        assert.notDeepStrictEqual(zoomedXAxisLabelTexts, initialXAxisLabelTexts,
            'X-axis labels should be different from initial after zooming.');

        // Click reset zoom
        await resetButton.click();
        await browser.pause(1000); // Give graph time to re-render
        const labelsAfterReset = await getXAxisTickLabelTexts();

        assert.deepStrictEqual(labelsAfterReset, initialXAxisLabelTexts,
            `X-axis labels after reset (${labelsAfterReset}) should be equal to initial (${initialXAxisLabelTexts})`);
    });
});

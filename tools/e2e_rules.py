# Eselsbrücken: the rules page, a full quiz round, and a one-rule round.
import asyncio, sys
from playwright.async_api import async_playwright
OUT = sys.argv[1]; BASE = 'http://127.0.0.1:8765/'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, locale='de-DE')
        pg = await ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        await pg.goto(BASE + '#/ueben'); await pg.wait_for_selector('[data-go="regeln"]')
        await pg.click('[data-go="regeln"]'); await pg.wait_for_selector('.card.rule')
        print('rules on page:', await pg.locator('.card.rule').count())
        await pg.screenshot(path=f'{OUT}/r-page.png', full_page=True)
        await pg.click('#all')
        for i in range(10):
            await pg.wait_for_selector('.option')
            if i == 0: print('q1:', await pg.inner_text('.ex-def'))
            await pg.click('.option >> nth=0'); await pg.wait_for_selector('#next')
            if i == 0: await pg.screenshot(path=f'{OUT}/r-quiz.png')
            await pg.click('#next')
        await pg.wait_for_selector('.done'); print('done:', (await pg.inner_text('.done .big')))
        await pg.goto(BASE + '#/ueben/regeln-perfekt'); await pg.wait_for_selector('.option')
        print('one rule:', await pg.inner_text('.eyebrow'), '|', await pg.inner_text('.ex-def'), '|', await pg.inner_text('.num'))
        await pg.goto(BASE + '#/ueben/regeln-verben')
        for i in range(10):
            await pg.wait_for_selector('.option')
            if i < 2: print('verb q:', await pg.inner_text('.ex-def'), '|', ' / '.join(await pg.locator('.option').all_inner_texts()))
            await pg.click('.option >> nth=0'); await pg.wait_for_selector('#next')
            if i == 0: await pg.screenshot(path=f'{OUT}/r-verb.png')
            await pg.click('#next')
        await pg.wait_for_selector('.done'); print('verbs done')
        print('ERRORS:', errs or 'none')
        await b.close()
asyncio.run(main())

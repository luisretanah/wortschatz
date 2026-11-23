# Practice with all words (pool levels), word of the day from the pool, and "Merken" from an exercise.
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
        await pg.goto(BASE + '#/suchen'); await pg.wait_for_selector('#wotd-body .def', timeout=20000)
        print('word of the day:', await pg.inner_text('#wotd-hw'), '|', (await pg.inner_text('#wotd-body .def'))[:60])
        await pg.screenshot(path=f'{OUT}/p-home.png')
        await pg.goto(BASE + '#/ueben'); await pg.wait_for_selector('[data-lvl]')
        print('buttons above the cards:', await pg.locator('.seg.level button').count())
        await pg.screenshot(path=f'{OUT}/p-practice.png', full_page=True)
        for lvl in ('1', '3', '2'):
            await pg.click(f'[data-lvl="{lvl}"]'); await pg.wait_for_timeout(200)
            print('level', lvl, '->', await pg.inner_text('.seg.level .on'))
        await pg.goto(BASE + '#/ueben/bedeutung'); await pg.wait_for_selector('.option')
        print('meaning q:', (await pg.inner_text('.ex-def'))[:70])
        await pg.click('.option'); await pg.wait_for_selector('[data-keep]')
        await pg.click('[data-keep]'); await pg.wait_for_timeout(300)
        await pg.screenshot(path=f'{OUT}/p-meaning.png')
        await pg.goto(BASE + '#/ueben/artikel'); await pg.wait_for_selector('.gender-btns button')
        await pg.click('.gender-btns .m'); await pg.wait_for_selector('#next')
        await pg.screenshot(path=f'{OUT}/p-gender.png')
        await pg.goto(BASE + '#/ueben/luecken'); await pg.wait_for_selector('#ans')
        await pg.fill('#ans', 'x'); await pg.click('#check'); await pg.wait_for_selector('#next')
        await pg.screenshot(path=f'{OUT}/p-cloze.png')
        await pg.goto(BASE + '#/ueben/satz'); await pg.wait_for_selector('#draft')
        print('sentence word:', await pg.inner_text('.ex-word'))
        n = await pg.evaluate("Object.keys(JSON.parse(localStorage.getItem('ws.words') || '{}')).length")
        print('saved after Merken:', n)
        print('ERRORS:', errs or 'none')
        await b.close()
asyncio.run(main())

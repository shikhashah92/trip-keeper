#!/usr/bin/env python3
"""End-to-end smoke test for Trip Keeper.

Setup:  pip install playwright && playwright install chromium
Run:    python3 tests/smoke.py
Prints "ERRORS: []" and exits 0 when everything passes.
"""
import socket
import subprocess
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

APP = Path(__file__).resolve().parent.parent / 'app'
failures = []


def check(name, cond):
    print(('PASS ' if cond else 'FAIL ') + name)
    if not cond:
        failures.append(name)


def free_port():
    with socket.socket() as s:
        s.bind(('', 0))
        return s.getsockname()[1]


port = free_port()
srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(port), '-d', str(APP)],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
errs = []
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={'width': 390, 'height': 800}, accept_downloads=True)
        pg = ctx.new_page()
        pg.on('pageerror', lambda e: errs.append('PAGEERR ' + str(e)))
        pg.on('dialog', lambda d: (errs.append('DIALOG ' + d.message), d.accept()))
        pg.goto(f'http://localhost:{port}/index.html')
        pg.wait_for_timeout(600)

        # trip + country facts
        pg.click('nav button[data-t=more]')
        pg.fill('#tn', 'Spain'); pg.fill('#ts', '2026-10-23'); pg.fill('#te', '2026-11-05')
        pg.click('#saveTrip')
        pg.select_option('#cSel', 'Spain')
        pg.wait_for_timeout(300)
        check('country facts show emergency number', '112' in pg.inner_text('#cFacts'))

        # itinerary item, map and nearby links
        pg.click('nav button[data-t=plan]'); pg.click('#fab')
        pg.fill('#f_title', 'Sagrada Familia'); pg.fill('#f_date', '2026-10-25'); pg.fill('#f_time', '10:00')
        pg.fill('#f_place', 'Sagrada Familia, Barcelona'); pg.click('#f_save'); pg.wait_for_timeout(200)
        check('map link rendered', pg.locator('a.map[href*="google.com/maps"]').count() > 0)

        # paste import
        pg.click('nav button[data-t=book]'); pg.click('#pasteBtn')
        pg.fill('#pt', 'Subject: Hotel Arts confirmation\nBooking number: HAB48213\n'
                       'Check-in: 24 Oct 2026 3:00 PM\nCheck-out: 27 Oct 2026 11:00\n'
                       'Address: Carrer de la Marina 19, Barcelona')
        pg.click('#pgo')
        check('paste import reads reference', pg.input_value('#f_ref') == 'HAB48213')
        check('paste import reads start', pg.input_value('#f_start') == '2026-10-24T15:00')
        check('paste import reads end', pg.input_value('#f_end') == '2026-10-27T11:00')
        pg.click('#f_save'); pg.wait_for_timeout(200)

        # flight booking for reminder test
        pg.click('#fab'); pg.fill('#f_title', 'BOM to MAD'); pg.fill('#f_ref', 'XK92LM')
        pg.fill('#f_start', '2026-10-23T02:40'); pg.fill('#f_end', '2026-10-23T07:55')
        pg.fill('#f_place', 'Madrid Barajas Airport'); pg.click('#f_save'); pg.wait_for_timeout(200)

        # expenses in two currencies
        pg.click('nav button[data-t=exp]'); pg.click('#fab')
        pg.fill('#x_amt', '45.5'); pg.fill('#x_cur', 'eur'); pg.wait_for_selector('#x_rate')
        pg.fill('#x_rate', '95'); pg.fill('#x_desc', 'Lunch'); pg.click('#x_save'); pg.wait_for_timeout(200)
        pg.click('#fab'); pg.fill('#x_amt', '500'); pg.fill('#x_cur', 'INR')
        pg.select_option('#x_cat', 'transport'); pg.fill('#x_desc', 'Cab'); pg.click('#x_save'); pg.wait_for_timeout(200)
        check('expense total converts EUR at the saved rate', '4,822.50' in pg.inner_text('#main'))

        # calendar file
        pg.click('nav button[data-t=plan]'); pg.click('#tbCal')
        with pg.expect_download() as dl:
            pg.click('#c_go')
        ics = Path(dl.value.path()).read_bytes().decode()
        check('ics has CRLF line endings', '\r\n' in ics)
        check('ics has flight reminders', 'TRIGGER:-PT1440M' in ics and 'TRIGGER:-PT180M' in ics)
        check('ics has tomorrow preview events', ics.count('UID:tk-preview-') >= 3)

        # share text (clipboard or fallback sheet) must not contain booking references
        pg.click('#tbShare'); pg.wait_for_timeout(300)
        if pg.locator('#sharetxt').count():
            txt = pg.input_value('#sharetxt')
            check('share text omits booking references', 'XK92LM' not in txt and 'HAB48213' not in txt)
            pg.click('#sx')

        # PIN lock
        pg.click('nav button[data-t=more]'); pg.click('#pinSet')
        pg.fill('#p1', '1234'); pg.fill('#p2', '1234'); pg.click('#psave'); pg.wait_for_timeout(200)
        pg.reload(); pg.wait_for_timeout(600)
        check('locked after reload', pg.locator('#lock').count() == 1)
        pg.fill('#lpin', '0000'); pg.click('#lgo'); pg.wait_for_timeout(200)
        check('wrong PIN stays locked', pg.locator('#lock').count() == 1)
        pg.fill('#lpin', '1234'); pg.click('#lgo'); pg.wait_for_timeout(200)
        check('right PIN unlocks', pg.locator('#lock').count() == 0)

        # data survives reload
        pg.click('nav button[data-t=exp]')
        check('expenses persisted', 'Lunch' in pg.inner_text('#main'))
        b.close()
finally:
    srv.terminate()

print('ERRORS:', errs)
sys.exit(1 if (errs or failures) else 0)

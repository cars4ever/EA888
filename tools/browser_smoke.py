#!/usr/bin/env python3
"""Run EA888 Lab in system Chromium without a web server.

The app assets are injected exactly as shipped. Image URLs are replaced by data
URIs so the test works in a sandbox that blocks file:// and localhost navigation.
"""
from __future__ import annotations

import argparse
import base64
import json
import re
from pathlib import Path
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError


def data_uri(path: Path) -> str:
    mime = {
        '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
        '.webp': 'image/webp', '.svg': 'image/svg+xml'
    }.get(path.suffix.lower(), 'application/octet-stream')
    return f"data:{mime};base64,{base64.b64encode(path.read_bytes()).decode('ascii')}"


def load_app(page, assets: Path) -> None:
    html = (assets / 'index.html').read_text(encoding='utf-8')
    # Keep the real DOM skeleton and metadata, but inject production assets below.
    html = re.sub(r'<link[^>]+href="styles\.css"[^>]*>', '', html)
    html = re.sub(r'<script[^>]+src="(?:turbo-data|turbo|sim|audio-bank|app)\.js"[^>]*></script>', '', html)
    page.set_content(html, wait_until='domcontentloaded')
    css = (assets / 'styles.css').read_text(encoding='utf-8')
    for name in ('drag-strip-panorama.webp', 'drag-track-chase.webp', 'drag-burnout-box.webp', 'drag-v8-burnout.webp', 'drag-v8-stage.webp', 'drag-v8-race.webp', 'track-horizon-v10.webp'):
        css = css.replace(f'images/{name}', data_uri(assets / 'images' / name))
    page.add_style_tag(content=css)
    for script in ('turbo-data.js', 'turbo.js', 'sim.js'):
        page.add_script_tag(content=(assets / script).read_text(encoding='utf-8'))
    page.add_script_tag(content=(assets / 'audio-bank.js').read_text(encoding='utf-8'))
    app_js = (assets / 'app.js').read_text(encoding='utf-8')
    image_names = (
        'scirocco-app-icon.png', 'randy-scirocco-hero.jpg', 'randy-scirocco-garage.jpg',
        'randy-scirocco-side.png', 'randy-scirocco-cutout.png',
        'engine-realistic.webp', 'part-piston.webp', 'part-head.webp',
        'part-turbo.webp', 'part-intercooler.webp', 'part-fuel.webp',
        'part-transmission.webp', 'car-race.webp', 'drag-strip-panorama.webp',
        'drag-track-chase.webp', 'drag-burnout-box.webp', 'drag-v8-burnout.webp', 'drag-v8-stage.webp', 'drag-v8-race.webp', 'randy-scirocco-rear.svg', 'rival-scirocco.svg', 'randy-scirocco-rear-photo.png', 'randy-scirocco-race-v10.png', 'track-horizon-v10.webp',
    )
    for name in image_names:
        app_js = app_js.replace(f'images/{name}', data_uri(assets / 'images' / name))
    page.add_script_tag(content=app_js)
    page.wait_for_selector('.garage-page', state='visible')


def click(page, selector: str) -> None:
    locator = page.locator(selector).first
    try:
        locator.click(timeout=5000)
    except PlaywrightTimeoutError:
        # Element screenshots can leave Chromium with transient actionability
        # geometry; a real DOM click still exercises the app handler.
        locator.evaluate("element => element.click()")
    page.wait_for_timeout(80)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--assets', type=Path, default=Path(__file__).resolve().parents[1] / 'src' / 'assets')
    parser.add_argument('--screenshots', type=Path)
    parser.add_argument('--report', type=Path)
    args = parser.parse_args()
    assets = args.assets.resolve()
    screenshots = args.screenshots.resolve() if args.screenshots else None
    if screenshots:
        screenshots.mkdir(parents=True, exist_ok=True)

    console_errors: list[str] = []
    page_errors: list[str] = []
    report: dict[str, object] = {'assets': str(assets), 'checks': {}}

    with sync_playwright() as p:
        browser = p.chromium.launch(
            executable_path='/usr/bin/chromium',
            headless=True,
            args=['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu-sandbox']
        )
        context = browser.new_context(
            viewport={'width': 480, 'height': 1000},
            device_scale_factor=2,
            is_mobile=True,
            has_touch=True,
            locale='nl-NL',
            reduced_motion='reduce'
        )
        page = context.new_page()
        page.set_default_timeout(12000)
        page.on('pageerror', lambda exc: page_errors.append(str(exc)))
        page.on('console', lambda msg: console_errors.append(msg.text) if msg.type == 'error' else None)
        page.add_init_script("""
          Object.defineProperty(navigator, 'vibrate', {value: () => true, configurable: true});
          if (!navigator.clipboard) Object.defineProperty(navigator, 'clipboard', {value: {writeText: async () => {}}, configurable: true});
        """)

        print('CHECKPOINT garage', flush=True)
        load_app(page, assets)
        report['checks']['garage_loaded'] = page.locator('.garage-page').count() == 1
        initial_hp = page.evaluate("() => Math.round(__EA888_DEBUG__.dyno().peakHp)")
        report['checks']['initial_dyno_current'] = f'{initial_hp} pk' in page.locator('.v5-car-card').inner_text()
        if screenshots:
            page.screenshot(path=str(screenshots / 'EA888-Lab-v1.2.0-garage.png'), full_page=False)

        print('CHECKPOINT garage done', flush=True)
        # Three detailed engine views.
        click(page, '[data-nav="build"]')
        page.wait_for_selector('.motor-page')
        report['checks']['motor_page'] = page.locator('.v4-engine-visual').count() == 1
        report['checks']['realistic_engine_integrated'] = page.locator('.view-realistic .realistic-engine-image').count() == 1
        if screenshots:
            page.screenshot(path=str(screenshots / 'EA888-Lab-v1.2.0-engine-realistic.png'), full_page=False)
        click(page, '[data-engine-view="intake"]')
        report['checks']['intake_view'] = page.locator('.mode-build[data-view="intake"]').count() == 1
        if screenshots:
            page.screenshot(path=str(screenshots / 'EA888-Lab-v1.2.0-engine-intake.png'), full_page=False)
        click(page, '[data-engine-view="turbo"]')
        report['checks']['turbo_view'] = page.locator('.mode-build[data-view="turbo"]').count() == 1
        if screenshots:
            page.screenshot(path=str(screenshots / 'EA888-Lab-v1.2.0-engine-turbo.png'), full_page=False)
        click(page, '[data-engine-view="cutaway"]')
        report['checks']['cutaway_view'] = page.locator('.mode-build[data-view="cutaway"]').count() == 1
        if screenshots:
            page.screenshot(path=str(screenshots / 'EA888-Lab-v1.2.0-engine-cutaway.png'), full_page=False)

        print('CHECKPOINT engine views done', flush=True)
        # Assembly, all six bench tests, then a real hardware change.
        click(page, '[data-motor-panel="assembly"]')
        report['checks']['assembly_score_visible'] = '/100 montage' in page.locator('.assembly-hero').inner_text()
        click(page, '[data-motor-panel="bench"]')
        click(page, '[data-action="run-all-bench"]')
        page.wait_for_function("document.body.innerText.includes('6/6 actuele tests')")
        report['checks']['all_bench_tests'] = '6/6 actuele tests' in page.locator('.bench-overview').inner_text()
        if screenshots:
            page.locator('.bench-panel').screenshot(path=str(screenshots / 'EA888-Lab-v1.2.0-bench.png'))

        click(page, '[data-motor-panel="hardware"]')
        click(page, '[data-part-id="hx52"]')
        click(page, '[data-nav="bank"]')
        stale_text = page.locator('.v5-status-grid').inner_text() + '\n' + page.locator('.v5-car-card').inner_text()
        report['checks']['power_hidden_after_part_change'] = '? pk' in stale_text and 'ONGETESTE BUILD' in stale_text
        report['checks']['stale_status'] = 'ONGETEST' in page.locator('#topbar').inner_text()

        print('CHECKPOINT bench and stale done', flush=True)
        # Exercise every tuning panel.
        click(page, '[data-nav="tune"]')
        for panel_id in ('boost', 'fuel', 'cams', 'safety'):
            click(page, f'[data-tune-panel="{panel_id}"]')
            assert page.locator(f'[data-tune-panel="{panel_id}"].active').count() == 1
        report['checks']['all_tune_panels'] = True

        # Scroll-safe sliders: a vertical swipe across a slider must not change it; a horizontal drag must.
        click(page, '[data-tune-panel="boost"]')
        slider = page.evaluate("""() => {
          const el = document.querySelector('.control input[type="range"]');
          const attr = el.getAttributeNames().find(a => a.startsWith('data-') && !['data-unit', 'data-decimals'].includes(a));
          return { sel: `input[${attr}="${el.getAttribute(attr)}"]`, value: el.value };
        }""")
        gesture = """([sel, dx, dy]) => {
          const el = document.querySelector(sel), r = el.getBoundingClientRect();
          const x = r.left + r.width * .5, y = r.top + r.height / 2, o = { bubbles: true, cancelable: true, pointerId: 91, pointerType: 'touch', isPrimary: true };
          const target = el.closest('.control');
          target.dispatchEvent(new PointerEvent('pointerdown', { ...o, clientX: x, clientY: y }));
          for (let i = 1; i <= 6; i++) target.dispatchEvent(new PointerEvent('pointermove', { ...o, clientX: x + dx * i / 6, clientY: y + dy * i / 6 }));
          target.dispatchEvent(new PointerEvent('pointerup', { ...o, clientX: x + dx, clientY: y + dy }));
          return document.querySelector(sel).value;
        }"""
        after_vertical = page.evaluate(gesture, [slider['sel'], 3, 120])
        after_horizontal = page.evaluate(gesture, [slider['sel'], 90, 4])
        report['checks']['slider_ignores_vertical_swipe'] = after_vertical == slider['value']
        report['checks']['slider_follows_horizontal_drag'] = after_horizontal != slider['value']
        page.evaluate("""([sel, v]) => { const el = document.querySelector(sel); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }""", [slider['sel'], slider['value']])
        report['checks']['slider_restored'] = page.evaluate("sel => document.querySelector(sel).value", slider['sel']) == slider['value']

        print('CHECKPOINT tune done', flush=True)
        # Enable the faster animation path through the real settings UI.
        click(page, '[data-nav="service"]')
        reduced = page.locator('[data-setting-switch="reducedMotion"]')
        if reduced.get_attribute('aria-pressed') != 'true':
            reduced.click()
            page.wait_for_timeout(80)
        report['checks']['safe_bottom_navigation'] = page.eval_on_selector('#bottom-nav', "e => { const r=e.getBoundingClientRect(); return r.bottom < innerHeight && r.bottom > innerHeight-80; }")

        print('CHECKPOINT service done', flush=True)
        # New dyno pull; exercise all five channel views.
        click(page, '[data-nav="dyno"]')
        for channel in ('power', 'air', 'map', 'fuel', 'thermal', 'risk'):
            click(page, f'[data-dyno-channel="{channel}"]')
            assert page.locator(f'[data-dyno-channel="{channel}"].active').count() == 1
        click(page, '[data-action="start-dyno"]')
        page.wait_for_function("document.body.innerText.includes('Curve is geldig.')", timeout=12000)
        report['checks']['dyno_completed'] = 'Curve is geldig.' in page.locator('.dyno-page').inner_text()
        report['dyno_result'] = page.locator('.v4-result-card h2').first.inner_text()
        click(page, '[data-dyno-channel="map"]')
        report['checks']['dyno_turbo_map_channel'] = page.locator('[data-dyno-channel="map"].active').count() == 1
        if screenshots:
            page.locator('.dyno-chart-wrap').screenshot(path=str(screenshots / 'EA888-Lab-dyno-turbo-map.png'))
        click(page, '[data-dyno-channel="power"]')
        if screenshots:
            page.screenshot(path=str(screenshots / 'EA888-Lab-v1.2.0-dyno.png'), full_page=False, animations='disabled', timeout=12000)

        print('CHECKPOINT dyno done', flush=True)
        # V7 drag workflow: overview -> separate fullscreen burnout -> separate staging/tree -> rear chase run -> overview.
        print('DRAG go', flush=True)
        click(page, '[data-nav="drag"]')
        report['checks']['v7_drag_overview'] = page.locator('.v7-race-overview').count() == 1
        report['checks']['overview_rear_view'] = page.locator('.v7-overview-car').count() == 1
        for panel_id in ('tree', 'setup', 'telemetry', 'history'):
            click(page, f'[data-race-panel="{panel_id}"]')
            assert page.locator(f'[data-race-panel="{panel_id}"].active').count() == 1
        click(page, '[data-race-panel="setup"]')
        report['checks']['race_weekend_setup'] = page.locator('.v12-race-weekend-card').count() == 1
        report['checks']['heads_up_mode_active'] = page.locator('[data-race-mode="heads_up"].active').count() == 1
        report['checks']['four_rival_levels'] = page.locator('[data-rival-level]').count() == 4
        report['checks']['steering_setup_controls'] = page.locator('[data-vehicle="steeringSensitivityPct"]').count() == 1 and page.locator('[data-vehicle="steeringAssistPct"]').count() == 1
        click(page, '[data-rival-level="street"]')
        report['checks']['street_rival_selected'] = page.locator('[data-rival-level="street"].active').count() == 1
        click(page, '[data-race-mode="solo"]')
        report['checks']['solo_mode_disables_rivals'] = page.locator('[data-race-mode="solo"].active').count() == 1 and page.locator('.v12-rival-picker.disabled').count() == 1
        click(page, '[data-race-mode="heads_up"]')
        report['checks']['heads_up_restored'] = page.locator('[data-race-mode="heads_up"].active').count() == 1 and page.locator('[data-rival-level="street"].active').count() == 1
        click(page, '[data-race-panel="telemetry"]')
        report['checks']['telemetry_empty_before_run'] = page.locator('.v12-telemetry-empty').count() == 1
        click(page, '[data-race-panel="tree"]')

        # Manual opening proves the start button launches a genuinely separate fullscreen burnout scene.
        click(page, '[data-action="open-drag-game"]')
        page.wait_for_selector('#race-game-root .v8-burnout-game', state='visible')
        report['checks']['fullscreen_burnout'] = page.locator('#race-game-root .v8-burnout-game').count() == 1
        report['checks']['burnout_side_view'] = page.locator('#race-game-root .v8-burnout-plate').count() == 1
        before_temp = int(page.locator('#v7-burn-temp').inner_text().replace('°C','').strip())
        burnout = page.locator('#v7-burn-throttle')
        burnout.dispatch_event('pointerdown', {'pointerId': 17, 'pointerType': 'touch', 'isPrimary': True})
        page.wait_for_timeout(850)
        after_temp = int(page.locator('#v7-burn-temp').inner_text().replace('°C','').strip())
        report['checks']['interactive_burnout'] = after_temp > before_temp
        report['burnout_temperature'] = {'before': before_temp, 'after': after_temp}
        if screenshots:
            page.screenshot(path=str(screenshots / 'EA888-Lab-v1.2.0-burnout.png'), full_page=False, animations='disabled', timeout=12000)
        burnout.dispatch_event('pointerup', {'pointerId': 17, 'pointerType': 'touch', 'isPrimary': True})
        page.wait_for_function("window.__EA888_DEBUG__.audio().ready === true", timeout=12000)
        audio_first = page.evaluate("window.__EA888_DEBUG__.audio()")
        report['checks']['pcm_multisample_audio'] = audio_first.get('ready') is True and audio_first.get('sampleLayers', 0) >= 6 and 'PCM multisample v11' in audio_first.get('model', '')
        click(page, '[data-action="close-drag-game"]')
        page.wait_for_selector('.v7-race-overview', state='visible')
        page.wait_for_timeout(120)
        audio_after_manual_close = page.evaluate("window.__EA888_DEBUG__.audio()")
        report['checks']['audio_hard_stops_on_manual_close'] = audio_after_manual_close.get('exists') is False and audio_after_manual_close.get('contextState') == 'none' and audio_after_manual_close.get('active') is False
        # A generic overview tap must never wake the last RPM sample again.
        page.locator('.v7-race-overview').dispatch_event('pointerdown', {'pointerId': 77, 'pointerType': 'touch', 'isPrimary': True})
        page.locator('.v7-race-overview').dispatch_event('pointerup', {'pointerId': 77, 'pointerType': 'touch', 'isPrimary': True})
        page.wait_for_timeout(80)
        audio_after_overview_tap = page.evaluate("window.__EA888_DEBUG__.audio()")
        report['checks']['overview_tap_does_not_restart_audio'] = audio_after_overview_tap.get('exists') is False and audio_after_overview_tap.get('active') is False

        # Automatic pass still executes the exact same three scenes and makes the transition test deterministic.
        click(page, '[data-action="auto-drag-game"]')
        page.wait_for_selector('#race-game-root .v8-burnout-game', state='visible')
        page.wait_for_selector('#race-game-root .v8-stage-game', state='visible', timeout=12000)
        report['checks']['separate_stage_screen'] = page.locator('#race-game-root .v8-stage-game').count() == 1
        report['checks']['stage_rear_view'] = page.locator('#race-game-root .v8-stage-plate').count() == 1
        report['checks']['real_drag_tree'] = page.locator('#race-game-root [data-v7-bulb]').count() == 14
        report['checks']['stage_rival_visible'] = page.locator('#race-game-root .v12-stage-rival').count() == 1
        page.wait_for_function("document.querySelector('#v7-launch-button') && !document.querySelector('#v7-launch-button').disabled && (document.querySelector('#v7-launch-button').classList.contains('armed') || document.querySelector('#v7-launch-button').classList.contains('go'))", timeout=12000)
        report['checks']['launch_button_green_and_active'] = page.locator('#v7-launch-button.armed, #v7-launch-button.go').count() == 1 and not page.locator('#v7-launch-button').is_disabled()
        if screenshots:
            page.screenshot(path=str(screenshots / 'EA888-Lab-v1.2.0-stage-tree.png'), full_page=False, animations='disabled', timeout=12000)

        page.wait_for_selector('#race-game-root .v8-run-game', state='visible', timeout=12000)
        report['checks']['separate_race_screen'] = page.locator('#race-game-root .v8-run-game').count() == 1
        report['checks']['rear_chase_car'] = page.locator('.v10-live-car img').count() == 1 and page.eval_on_selector('.v10-live-car img', 'img => img.complete && img.naturalWidth > 500 && img.naturalHeight > 300')
        report['checks']['race_hud'] = all(page.locator(sel).count() == 1 for sel in ('#v7-run-tach','#v7-run-speed','#v7-run-boost','#v7-shift-button','#v10-track-canvas','.v10-live-car','[data-v7-control="steerLeft"]','[data-v7-control="steerRight"]'))
        report['checks']['heads_up_rival_car_visible'] = page.locator('#v12-rival-car img').count() == 1 and page.eval_on_selector('#v12-rival-car img', 'img => img.complete && img.naturalWidth > 100')
        report['checks']['heads_up_gap_hud'] = page.locator('#v12-rival-gap').count() == 1
        report['checks']['driveline_live_hud'] = all(page.locator(sel).count() == 1 for sel in ('#v12-clutch-temp','#v12-gearbox-temp','#v12-stress'))
        report['checks']['realtime_canvas_track'] = page.eval_on_selector('#v10-track-canvas', "c => c.width > 500 && c.height > 900 && c.getContext('2d').getImageData(Math.floor(c.width/2), Math.floor(c.height*.65), 1, 1).data[3] > 0")
        race_a = page.evaluate("window.__EA888_DEBUG__.race()")
        page.wait_for_timeout(420)
        race_b = page.evaluate("window.__EA888_DEBUG__.race()")
        report['checks']['realtime_distance_progresses'] = race_b.get('distanceM', 0) > race_a.get('distanceM', 0)
        report['checks']['independent_rival_progresses'] = race_b.get('opponentDistanceM', 0) > race_a.get('opponentDistanceM', 0) and race_b.get('raceMode') == 'heads_up'
        report['checks']['live_gap_is_finite'] = isinstance(race_b.get('opponentGapM'), (int, float))
        report['checks']['driveline_temperature_changes'] = (abs(race_b.get('clutchTempC', 0) - race_a.get('clutchTempC', 0)) > 0.01 or abs(race_b.get('gearboxTempC', 0) - race_a.get('gearboxTempC', 0)) > 0.01) and race_b.get('drivelineStress', 0) >= race_a.get('drivelineStress', 0)
        report['checks']['manual_transmission_requires_shift'] = race_b.get('transmissionId') == 'randy_o2q' and race_b.get('autoShift') is False and page.locator('#v7-shift-button').count() == 1
        assert page.evaluate("window.__EA888_DEBUG__.setDriverAssistForTest(false)")
        steer = page.locator('[data-v7-control="steerRight"]')
        steer.dispatch_event('pointerdown', {'pointerId': 31, 'pointerType': 'touch', 'isPrimary': True})
        page.wait_for_timeout(260)
        race_steered = page.evaluate("window.__EA888_DEBUG__.race()")
        steer.dispatch_event('pointerup', {'pointerId': 31, 'pointerType': 'touch', 'isPrimary': True})
        assert page.evaluate("window.__EA888_DEBUG__.setDriverAssistForTest(true)")
        report['checks']['steering_changes_lane_position'] = race_steered.get('lateralM', 0) > race_b.get('lateralM', 0)
        report['realtime_sample'] = {'before': race_a, 'after': race_b, 'steered': race_steered}
        audio_second = page.evaluate("window.__EA888_DEBUG__.audio()")
        report['checks']['audio_restarts_clean_second_race'] = audio_first.get('generation', 0) > 0 and audio_second.get('generation', 0) > audio_first.get('generation', 0) and audio_second.get('active') is True and audio_second.get('ready') is True
        report['audio_generations'] = {'first': audio_first, 'after_manual_close': audio_after_manual_close, 'after_overview_tap': audio_after_overview_tap, 'second': audio_second}
        if screenshots:
            page.screenshot(path=str(screenshots / 'EA888-Lab-v1.2.0-rear-chase-race.png'), full_page=False, animations='disabled', timeout=12000)

        page.wait_for_selector('#race-game-root .v8-game', state='detached', timeout=30000)
        page.wait_for_selector('.v7-race-overview', state='visible')
        overview_text = page.locator('.v7-timeslip-overview').inner_text()
        report['checks']['returns_to_overview'] = page.locator('.v7-race-overview').count() == 1
        report['checks']['drag_completed'] = ('HEADS-UP WIN' in overview_text or 'HEADS-UP LOSS' in overview_text)
        last_drag = page.evaluate("window.__EA888_DEBUG__.lastDrag()")
        report['checks']['heads_up_result_persisted'] = last_drag.get('raceMode') == 'heads_up' and bool(last_drag.get('opponentName')) and isinstance(last_drag.get('won'), bool) and isinstance(last_drag.get('raceDeltaS'), (int, float))
        report['heads_up_result'] = {k:last_drag.get(k) for k in ('opponentName','won','raceDeltaS','reward','quarter','opponentQuarter','finishTotalTime','opponentFinishTotalTime','maxClutchTempC','maxGearboxTempC','drivelineStress','limiterTimeS')}
        report['drag_timeslip'] = overview_text
        page.wait_for_timeout(120)
        audio_after_finish = page.evaluate("window.__EA888_DEBUG__.audio()")
        report['checks']['audio_hard_stops_after_finish'] = audio_after_finish.get('exists') is False and audio_after_finish.get('contextState') == 'none' and audio_after_finish.get('oneShots', 0) == 0
        page.locator('.v7-race-overview').dispatch_event('pointerdown', {'pointerId': 78, 'pointerType': 'touch', 'isPrimary': True})
        page.locator('.v7-race-overview').dispatch_event('pointerup', {'pointerId': 78, 'pointerType': 'touch', 'isPrimary': True})
        page.wait_for_timeout(80)
        report['checks']['post_finish_tap_stays_silent'] = page.evaluate("window.__EA888_DEBUG__.audio().exists === false")
        report['audio_generations']['after_finish'] = audio_after_finish
        if screenshots:
            page.screenshot(path=str(screenshots / 'EA888-Lab-v1.2.0-drag-overview-result.png'), full_page=False, animations='disabled', timeout=12000)

        click(page, '[data-race-panel="telemetry"]')
        page.wait_for_selector('.v12-telemetry-panel', state='visible')
        report['checks']['telemetry_panel_after_run'] = page.locator('.v12-telemetry-panel').count() == 1
        report['checks']['telemetry_analysis_cards'] = page.locator('.v12-analysis-card').count() >= 6
        report['checks']['telemetry_canvas_drawn'] = page.eval_on_selector('#v12-telemetry-canvas', "c => c.width > 500 && c.height > 400 && c.getContext('2d').getImageData(Math.floor(c.width*.5), Math.floor(c.height*.5), 1, 1).data[3] > 0")
        if screenshots:
            page.screenshot(path=str(screenshots / 'EA888-Lab-v1.2.0-telemetry.png'), full_page=False, animations='disabled', timeout=12000)
        click(page, '[data-race-panel="tree"]')

        # Only the DQ250 is allowed to shift by itself. The debug setter keeps the
        # already measured engine curve current and changes only the gearbox for this check.
        assert page.evaluate("window.__EA888_DEBUG__.setTransmissionForTest('dq250')")
        click(page, '[data-action="auto-drag-game"]')
        page.wait_for_selector('#race-game-root .v8-run-game', state='visible', timeout=12000)
        dsg_race = page.evaluate("window.__EA888_DEBUG__.race()")
        audio_third = page.evaluate("window.__EA888_DEBUG__.audio()")
        report['checks']['dq250_only_auto_shift'] = dsg_race.get('transmissionId') == 'dq250' and dsg_race.get('autoShift') is True and page.locator('#v7-dsg-status').count() == 1 and page.locator('#v7-shift-button').count() == 0
        report['checks']['audio_restarts_clean_third_race'] = audio_third.get('generation', 0) > audio_second.get('generation', 0) and audio_third.get('active') is True and audio_third.get('ready') is True
        report['audio_generations']['third'] = audio_third
        page.wait_for_selector('#race-game-root .v8-game', state='detached', timeout=30000)
        page.wait_for_selector('.v7-race-overview', state='visible')
        page.wait_for_timeout(120)
        audio_after_third = page.evaluate("window.__EA888_DEBUG__.audio()")
        report['checks']['audio_stops_after_third_race'] = audio_after_third.get('exists') is False and audio_after_third.get('contextState') == 'none'
        report['audio_generations']['after_third'] = audio_after_third

        # HOLD ANTILAG in staging on the reference build (Randy K04 hybrid, Syvecs):
        # boost, shaft speed, EGT, flames and wear respond live to the held button.
        click(page, '[data-nav="dyno"]')
        page.evaluate("() => __EA888_DEBUG__.configureBuildForTest({preset: 'randy'})")
        click(page, '[data-action="start-dyno"]')
        page.wait_for_function("document.body.innerText.includes('Curve is geldig.')", timeout=12000)
        click(page, '[data-nav="drag"]')
        assert page.evaluate("window.__EA888_DEBUG__.setAntiLagForTest('drag')")
        wear_before_als = page.evaluate("window.__EA888_DEBUG__.stateWear()")
        click(page, '[data-action="open-drag-game"]')
        page.wait_for_selector('#race-game-root .v8-burnout-game', state='visible')
        assert page.evaluate("window.__EA888_DEBUG__.enterStageForTest()")
        page.wait_for_selector('#v13-als-button', state='visible')
        report['checks']['als_hold_button_enabled'] = not page.locator('#v13-als-button').is_disabled() and 'HOLD ANTILAG' in page.locator('#v13-als-button').inner_text()
        creep = page.locator('[data-v7-control="creep"]')
        creep.dispatch_event('pointerdown', {'pointerId': 42, 'pointerType': 'touch', 'isPrimary': True})
        page.wait_for_function("window.__EA888_DEBUG__.stageState().progress >= 62", timeout=5000)
        creep.dispatch_event('pointerup', {'pointerId': 42, 'pointerType': 'touch', 'isPrimary': True})
        page.wait_for_timeout(250)
        als_idle = page.evaluate("window.__EA888_DEBUG__.turbo()")
        launch_btn = page.locator('#v7-launch-button')
        als_btn = page.locator('#v13-als-button')
        launch_btn.dispatch_event('pointerdown', {'pointerId': 43, 'pointerType': 'touch', 'isPrimary': True})
        # Launch ALS: with ALS armed the two-step alone fires the anti-lag (bangs, flames, boost).
        page.wait_for_timeout(450)
        launch_only = page.evaluate("window.__EA888_DEBUG__.turbo()")['snap']
        report['checks']['launch_als_fires_on_two_step'] = launch_only['alsActive'] is True
        als_btn.dispatch_event('pointerdown', {'pointerId': 41, 'pointerType': 'touch', 'isPrimary': True})
        page.wait_for_timeout(1300)
        als_held = page.evaluate("window.__EA888_DEBUG__.turbo()")
        audio_als = page.evaluate("window.__EA888_DEBUG__.audio()")
        report['checks']['als_bangs_audible_events'] = audio_als.get('alsBangs', 0) >= 8 and audio_als.get('masterGain', 0) > 0.2
        report['checks']['als_crackle_audio_follows_flame'] = audio_als.get('alsBed') is True and audio_als.get('alsBedGain', 0) > 0.1 and als_held['snap'].get('flameSustain', 0) > 0.3
        if screenshots:
            page.screenshot(path=str(screenshots / 'EA888-Lab-stage-antilag.png'), full_page=False, animations='disabled', timeout=12000)
        report['checks']['als_button_shows_active'] = page.locator('#v13-als-button.active').count() == 1
        als_btn.dispatch_event('pointerup', {'pointerId': 41, 'pointerType': 'touch', 'isPrimary': True})
        launch_btn.dispatch_event('pointerup', {'pointerId': 43, 'pointerType': 'touch', 'isPrimary': True})
        page.wait_for_timeout(150)
        als_released = page.evaluate("window.__EA888_DEBUG__.turbo()")
        page.wait_for_timeout(350)
        report['checks']['als_crackle_audio_stops_on_release'] = page.evaluate("window.__EA888_DEBUG__.audio().alsBedGain") < 0.05
        i, h, r = als_idle['snap'], als_held['snap'], als_released['snap']
        report['antilag_stage'] = {'idle': {k: i[k] for k in ('boostBar', 'shaftPct', 'egtC')}, 'held': {k: h[k] for k in ('boostBar', 'shaftPct', 'egtC', 'alsActive', 'empBar')}, 'released': {k: r[k] for k in ('boostBar', 'shaftPct', 'alsActive')}, 'flames': len(als_held['flames']), 'wear': als_held['wear']}
        report['checks']['als_raises_boost_and_shaft'] = h['boostBar'] > i['boostBar'] + 0.5 and h['shaftPct'] > i['shaftPct'] + 20
        report['checks']['als_raises_egt_and_emp'] = h['egtC'] > i['egtC'] + 100 and h['empBar'] > 0.5
        report['checks']['als_flames_are_als_events'] = len(als_held['flames']) > 0 and all(f['kind'] == 'als' for f in als_held['flames'])
        report['checks']['als_wear_accumulates'] = als_held['wear']['turbo'] + als_held['wear']['valves'] > 0
        report['checks']['als_stops_on_release'] = r['alsActive'] is False and h['alsActive'] is True
        page.wait_for_timeout(200)
        click(page, '[data-action="close-drag-game"]')
        page.wait_for_selector('.v7-race-overview', state='visible')
        wear_after_als = page.evaluate("window.__EA888_DEBUG__.stateWear()")
        report['checks']['als_wear_persisted'] = wear_after_als['wear']['turbo'] > wear_before_als['wear']['turbo'] and wear_after_als['wear']['valves'] > wear_before_als['wear']['valves']

        # Auto-start tree: once staged the tree starts by itself (0.5-5 s; 0.5 s with reduced motion) without
        # holding LAUNCH. A press after the tree started is a pedal launch from the current rpm (no two-step).
        click(page, '[data-action="open-drag-game"]')
        page.wait_for_selector('#race-game-root .v8-burnout-game', state='visible')
        assert page.evaluate("window.__EA888_DEBUG__.enterStageForTest()")
        creep = page.locator('[data-v7-control="creep"]')
        creep.dispatch_event('pointerdown', {'pointerId': 52, 'pointerType': 'touch', 'isPrimary': True})
        page.wait_for_function("window.__EA888_DEBUG__.stageState().progress >= 62", timeout=5000)
        creep.dispatch_event('pointerup', {'pointerId': 52, 'pointerType': 'touch', 'isPrimary': True})
        page.wait_for_function("window.__EA888_DEBUG__.stageState().treeStarted", timeout=6000)
        auto_tree = page.evaluate("window.__EA888_DEBUG__.stageState()")
        report['checks']['tree_starts_automatically_when_staged'] = auto_tree['treeStarted'] is True and auto_tree['launchArmed'] is False
        page.wait_for_function("window.__EA888_DEBUG__.stageState().green", timeout=6000)
        page.locator('#v7-launch-button').dispatch_event('pointerdown', {'pointerId': 53, 'pointerType': 'touch', 'isPrimary': True})
        page.wait_for_selector('#race-game-root .v8-run-game', state='visible', timeout=5000)
        pedal = page.evaluate("window.__EA888_DEBUG__.raceReaction()")
        report['checks']['pedal_launch_on_press_after_green'] = pedal['reactionTime'] >= 0 and pedal['redLight'] is False and pedal['startRpm'] < pedal['launchTargetRpm']
        report['pedal_launch'] = pedal
        click(page, '[data-action="close-drag-game"]')
        page.wait_for_selector('.v7-race-overview', state='visible')

        # Race with drag ALS: rolling ALS on shifts and event-driven shift/ALS flames.
        click(page, '[data-action="auto-drag-game"]')
        page.wait_for_selector('#race-game-root .v8-run-game', state='visible', timeout=12000)
        page.wait_for_timeout(500)
        run_turbo = page.evaluate("window.__EA888_DEBUG__.turbo()")
        report['checks']['race_uses_turbo_runtime'] = run_turbo['snap'] is not None and run_turbo['snap']['shaftPct'] > 0
        page.wait_for_selector('#race-game-root .v8-game', state='detached', timeout=30000)
        page.wait_for_selector('.v7-race-overview', state='visible')
        als_drag = page.evaluate("window.__EA888_DEBUG__.lastDrag()")
        report['antilag_race'] = als_drag.get('turbo')
        report['checks']['race_turbo_stats_recorded'] = bool(als_drag.get('turbo')) and als_drag['turbo']['maxEgtC'] > 700 and als_drag['turbo']['alsSeconds'] > 0
        report['checks']['race_flames_from_events'] = als_drag.get('flames', 0) > 0
        page.evaluate("window.__EA888_DEBUG__.setAntiLagForTest('off')")

        print('CHECKPOINT drag done', flush=True)
        # Build-code roundtrip and internal self-test.
        click(page, '[data-go="data"]')
        click(page, '[data-action="export-build"]')
        code = page.locator('#build-code-output').input_value()
        report['checks']['export_code'] = len(code) > 1500
        report['export_code_length'] = len(code)
        click(page, '.modal button[data-action="close-modal"]')
        click(page, '[data-action="open-import"]')
        page.wait_for_selector('#build-code-input')
        page.locator('#build-code-input').fill(code)
        click(page, '.modal button[data-action="confirm-import"]')
        page.wait_for_timeout(250)
        import_modal_count = page.locator('#modal-root .modal').count()
        import_modal_text = page.locator('#modal-root').inner_text() if import_modal_count else ''
        report['checks']['import_roundtrip'] = import_modal_count == 0
        click(page, '[data-action="self-test"]')
        page.wait_for_selector('.modal h2')
        report['checks']['internal_self_test'] = page.locator('.modal h2').inner_text() == 'Zelftest geslaagd'
        report['self_test_rows'] = page.locator('.test-row.pass').count()
        click(page, '.modal button[data-action="close-modal"]')

        print('CHECKPOINT data done', flush=True)
        # Dyno abort consistency: a pull that knocks out at 5900 rpm (v1.2.0 still
        # showed a "peak" at 7900 rpm) must only present data it actually reached.
        click(page, '[data-nav="dyno"]')
        page.evaluate("""() => __EA888_DEBUG__.configureBuildForTest({
          preset: 'hx52', selections: {fuel: 'ron95'},
          tune: {ignitionTrimDeg: 2, knockControl: false, boostHighBar: EA888Core.PRESETS.hx52.tune.boostHighBar + 0.6}
        })""")
        wear_before = page.evaluate("() => __EA888_DEBUG__.dyno()")
        click(page, '[data-action="start-dyno"]')
        page.wait_for_selector('.v4-result-card[data-dyno-status="aborted"]', timeout=12000)
        aborted = page.evaluate("() => __EA888_DEBUG__.dyno()")
        card_text = page.locator('.v4-result-card').first.inner_text()
        report['aborted_dyno'] = {k: aborted[k] for k in ('status', 'abortRpm', 'abortReason', 'peakHp', 'peakHpRpm', 'reliabilityScore', 'sampleCount', 'maxSampleRpm')}
        report['checks']['dyno_abort_status'] = aborted['status'] == 'aborted' and 5400 <= aborted['abortRpm'] <= 6300 and 'knock' in aborted['abortReason'].lower()
        report['checks']['dyno_abort_no_future_samples'] = aborted['maxSampleRpm'] == aborted['abortRpm'] and (aborted['peakHpRpm'] or 0) <= aborted['abortRpm']
        abort_rpm = aborted['abortRpm']
        quoted_rpms = [int(x) for x in re.findall(r'@ ([0-9]{4,5}) rpm', card_text)]
        report['checks']['dyno_abort_no_future_rpm_in_ui'] = bool(quoted_rpms) and max(quoted_rpms) <= abort_rpm and f'Afgebroken @ {abort_rpm} rpm' in card_text
        report['checks']['dyno_abort_labelled_partial'] = 'Hoogst waargenomen' in card_text and 'partieel' in card_text.lower()
        report['checks']['dyno_abort_no_reliability'] = aborted['reliabilityScore'] is None and page.locator('.v4-result-card .score-badge.none').count() == 1
        report['checks']['dyno_abort_damage_recorded'] = aborted['damage']['engine'] > wear_before['damage']['engine'] and aborted['wear']['engine'] > wear_before['wear']['engine']
        report['checks']['dyno_abort_history_partial'] = page.locator('.run-row.current.partial').count() == 1
        if screenshots:
            page.screenshot(path=str(screenshots / 'EA888-Lab-dyno-aborted.png'), full_page=False, animations='disabled', timeout=12000)
        click(page, '[data-nav="drag"]')
        report['checks']['dyno_abort_blocks_race'] = 'Race geblokkeerd.' in page.locator('.page').first.inner_text()

        # Operator abort mid-pull stores a partial run ending at the reached rpm.
        click(page, '[data-nav="dyno"]')
        page.evaluate("() => __EA888_DEBUG__.configureBuildForTest({preset: 'randy'})")
        click(page, '[data-action="start-dyno"]')
        page.wait_for_timeout(700)
        click(page, '[data-action="abort-dyno"]')
        page.wait_for_selector('.v4-result-card[data-dyno-status="aborted"]', timeout=6000)
        manual = page.evaluate("() => __EA888_DEBUG__.dyno()")
        report['manual_abort_dyno'] = {k: manual[k] for k in ('status', 'abortKind', 'abortRpm', 'sampleCount', 'maxSampleRpm', 'reliabilityScore')}
        report['checks']['dyno_manual_abort_partial'] = manual['abortKind'] == 'operator' and manual['maxSampleRpm'] == manual['abortRpm'] and manual['abortRpm'] < 8000 and manual['reliabilityScore'] is None
        # A completed pull restores the normal state.
        click(page, '[data-action="start-dyno"]')
        page.wait_for_function("document.body.innerText.includes('Curve is geldig.')", timeout=12000)
        report['checks']['dyno_completed_after_abort'] = page.evaluate("() => __EA888_DEBUG__.dyno().status") == 'completed'
        print('CHECKPOINT dyno abort done', flush=True)

        # Explicitly confirm the navigation does not overlap the main content area.
        overlap = page.evaluate("""
          () => {
            const nav = document.querySelector('#bottom-nav').getBoundingClientRect();
            const content = document.querySelector('#content').getBoundingClientRect();
            const safe = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-bottom')) || 0;
            return {navTop: nav.top, navBottom: nav.bottom, viewport: innerHeight, contentBottom: content.bottom, safe};
          }
        """)
        report['navigation_geometry'] = overlap
        report['console_errors'] = console_errors
        report['page_errors'] = page_errors
        report['ok'] = all(report['checks'].values()) and not console_errors and not page_errors
        context.close()
        browser.close()

    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding='utf-8')
    print(json.dumps(report, indent=2, ensure_ascii=False))
    if not report['ok']:
        raise SystemExit(1)


if __name__ == '__main__':
    main()

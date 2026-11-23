"""Real Chrome, three independent browser contexts, synthetic people and microphone."""

import json
import re
import socket
import subprocess
import tempfile
import time
from pathlib import Path
from urllib.request import urlopen

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / "evidence"


def port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def grab(p, selector):
    return p.locator(selector)


def submit(p):
    p.locator("#dialogSave").click()
    expect(p.locator("#dialog")).not_to_be_visible()


def fill(p, **data):
    for key, val in data.items():
        n = p.locator(f'[name="{key}"]')
        if n.evaluate("x=>x.tagName") == "SELECT":
            n.select_option(val)
        else:
            n.fill(val)


def main():
    evidence = []
    errors = []
    EVIDENCE.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        folder = Path(tmp)
        aiff = folder / "fake.aiff"
        wav = folder / "fake.wav"
        subprocess.run(
            [
                "say",
                "-v",
                "Samantha",
                "-r",
                "150",
                "-o",
                str(aiff),
                "We have three paying customers.",
            ],
            check=True,
        )
        subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-loglevel",
                "error",
                "-i",
                str(aiff),
                "-af",
                "apad=pad_dur=1.2",
                "-ar",
                "44100",
                "-ac",
                "1",
                str(wav),
            ],
            check=True,
        )
        portnum = port()
        url = f"http://127.0.0.1:{portnum}"
        data = folder / "data"
        with (folder / "server.log").open("w") as log:
            svc = subprocess.Popen(
                [
                    str(ROOT / ".venv/bin/python"),
                    "server.py",
                    "--port",
                    str(portnum),
                    "--data",
                    str(data),
                ],
                stdout=log,
                stderr=log,
                cwd=ROOT,
            )
            try:
                for _ in range(100):
                    try:
                        if (
                            json.load(urlopen(url + "/health", timeout=0.5))["service"]
                            == "founders-cafe"
                        ):
                            break
                    except OSError:
                        time.sleep(0.12)
                with sync_playwright() as pl:
                    browser = pl.chromium.launch(
                        channel="chrome",
                        headless=True,
                        args=[
                            "--use-fake-ui-for-media-stream",
                            "--use-fake-device-for-media-stream",
                            "--use-file-for-fake-audio-capture=" + str(wav),
                            "--autoplay-policy=no-user-gesture-required",
                        ],
                    )
                    host = browser.new_context(
                        viewport={"width": 1440, "height": 1050},
                        permissions=["microphone"],
                    )
                    user = browser.new_context(viewport={"width": 390, "height": 844})
                    visitor = browser.new_context()
                    for c in [host, user, visitor]:
                        c.add_init_script(
                            "window.scheduledAudio=0;const start=AudioBufferSourceNode.prototype.start;AudioBufferSourceNode.prototype.start=function(...a){window.scheduledAudio++;return start.apply(this,a)}"
                        )
                        c.set_default_timeout(9000)
                    h, u, v = [c.new_page() for c in (host, user, visitor)]
                    for p in [h, u, v]:
                        p.on("pageerror", lambda err: errors.append(str(err)))
                    h.goto(url + "/#pass=" + (data / "host-pass").read_text())
                    expect(h.locator("#take")).to_have_text("Take a seat")
                    h.screenshot(path=EVIDENCE / "cafe-desktop.png", full_page=True)
                    h.locator("#profile").click()
                    fill(h, name="Mia", tag="Founder")
                    submit(h)
                    u.goto(url)
                    v.goto(url)
                    expect(u.locator("#take")).to_have_text("Take a seat")
                    v.locator("#chatNav").click()
                    chat_input = v.locator("#chatText")
                    expect(chat_input).to_be_focused()
                    expect(chat_input).to_be_editable()
                    v.locator("#language").select_option("zh")
                    v.locator("#sourceLang").select_option("zh")
                    chat_request = v.expect_response(
                        lambda r: (
                            "/api/action" in r.url
                            and r.request.post_data_json.get("action") == "chat"
                        )
                    )
                    chat_input.fill("大家")
                    chat_input.dispatch_event("compositionstart")
                    v.locator("#chatForm").evaluate("form => form.requestSubmit()")
                    expect(v.locator("#chatLog article")).to_have_count(0)
                    expect(chat_input).to_have_value("大家")
                    chat_input.dispatch_event("compositionend")
                    chat_input.fill("大家好")
                    with chat_request:
                        chat_input.press("Enter")
                    expect(v.locator("#chatLog article")).to_have_count(1)
                    expect(v.locator("#chatLog")).to_contain_text("大家好")
                    expect(
                        h.locator("#chatLog .translation > span").first
                    ).to_contain_text(re.compile("[a-zA-Z]"), timeout=30000)
                    entrance = ".speech-bubble[data-anchor=entrance]"
                    expect(v.locator(entrance)).to_have_text("大家好")
                    expect(h.locator(entrance)).to_have_text(
                        re.compile("[a-zA-Z]"), timeout=30000
                    )
                    expect(chat_input).to_have_value("")
                    expect(v.locator("#take")).to_have_text("找个座位")
                    evidence.append(
                        "Unseated guest submitted Chinese by Enter before any talk; a second Chrome context received its translation"
                    )
                    u.locator("#language").select_option("zh")
                    u.locator("#profile").click()
                    fill(u, name="小林", tag="设计师", lang="zh")
                    submit(u)
                    h.locator("#take").click()
                    u.locator("#take").click()
                    expect(v.locator("#seatCount")).to_have_text("2 / 50 已入座")
                    evidence.append(
                        "Two participants and a third observer see the same seats"
                    )
                    # A sitting visitor speaks over their own seat, even before the talk.
                    u.locator("#chatText").fill("我坐好了")
                    u.locator("#chatSend").click()
                    own_seat = u.locator(
                        ".speech-bubble[data-own=true][data-anchor=seat]"
                    )
                    expect(own_seat).to_have_text("我坐好了")
                    expect(
                        h.locator(".speech-bubble[data-anchor=seat]")
                    ).to_contain_text(re.compile("[a-zA-Z]"))
                    u.locator("#showFloor").click()
                    assert own_seat.evaluate("""n => {
                        const b=n.getBoundingClientRect(), l=n.parentElement.getBoundingClientRect();
                        return b.left>=l.left && b.right<=l.right+1 && b.top>=l.top &&
                               b.bottom<l.top+Number(n.dataset.y)*l.height/358 && l.top<innerHeight;
                    }""")
                    evidence.append(
                        "Two Chrome clients rendered the visitor at the entrance and the seated speaker above their chair, in each viewer's language, including a 390px layout"
                    )
                    h.get_by_role("button", name="I'd like to share").click()
                    expect(h.locator("#dialogBody input")).to_have_count(1)
                    fill(h, title="Finding our first customers")
                    submit(h)
                    expect(u.locator("#stageState")).to_have_text("分享中")
                    chat_input.fill("分享时也可以在大厅聊天")
                    v.locator("#chatSend").click()
                    expect(v.locator("#chatLog article")).to_have_count(3)
                    expect(h.locator("#lines")).not_to_contain_text(
                        "分享时也可以在大厅聊天"
                    )
                    evidence.append(
                        "Guest chat stayed open during a talk and remained separate from stage questions"
                    )
                    h.locator("#sayText").fill("We have three paying customers.")
                    h.locator("#sendLine").click()
                    expect(
                        u.locator("#lines .translation > span").first
                    ).not_to_have_text("We have three paying customers.", timeout=30000)
                    u.locator("#sayText").fill("我可以帮忙设计页面。")
                    u.locator("#sendLine").click()
                    expect(
                        h.locator("#lines .translation > span").first
                    ).not_to_have_text("我可以帮忙设计页面。", timeout=30000)
                    expect(h.locator(".speech-bubble[data-anchor=stage]")).to_have_text(
                        "We have three paying customers."
                    )
                    expect(u.locator(".speech-bubble[data-anchor=stage]")).to_have_text(
                        u.locator("#lines article")
                        .first.locator(".translation > span")
                        .inner_text()
                    )
                    expect(
                        u.locator(".speech-bubble[data-anchor=seat][data-own=true]")
                    ).to_have_text("我可以帮忙设计页面。")
                    h.locator(".scene").screenshot(
                        path=EVIDENCE / "cafe-speech-bubbles.png"
                    )
                    evidence.append(
                        "English talk and Chinese question cross two clients with real local translations"
                    )
                    u.get_by_role("button", name="收听语音").click()
                    h.get_by_role("button", name="Start microphone").click()
                    submit(h)
                    expect(h.locator("#lines")).to_contain_text(
                        "Live caption", timeout=45000
                    )
                    u.wait_for_function("window.scheduledAudio>10", timeout=15000)
                    evidence.append(
                        "Synthetic microphone through browser capture, authenticated relay, listener playback scheduling and live speech caption"
                    )
                    h.get_by_role("button", name="Mute microphone").click()
                    caption = (
                        h.locator("#lines article")
                        .filter(has_text="Live caption")
                        .first
                    )
                    caption.get_by_role("button", name="Edit").click()
                    fill(h, text="We have seven paid customers.")
                    submit(h)
                    corrected = (
                        u.locator("#lines article")
                        .filter(has_text="We have seven paid customers.")
                        .first
                    )
                    expect(corrected).to_be_visible()
                    expect(corrected.locator(".translation > span")).to_contain_text(
                        re.compile("七|7"), timeout=30000
                    )
                    evidence.append(
                        "Speaker correction retranslated from revised source in the second browser"
                    )
                    h.get_by_role("button", name="Post collaboration card").click()
                    fill(
                        h,
                        title="Review signup",
                        task="Review one screen",
                        skills="Design",
                        hours="2 hours",
                        pay="paid",
                    )
                    submit(h)
                    u.get_by_role("button", name="我可以帮忙").click()
                    fill(u, text="我可以在周五帮忙。")
                    submit(u)
                    h.locator("#inboxNav").click()
                    expect(h.locator("#inbox")).to_contain_text("Pending")
                    expect(
                        v.locator(".speech-bubble[data-anchor=seat]")
                    ).to_contain_text("我可以在周五帮忙。")
                    v.locator("#inboxNav").click()
                    expect(v.locator("#inbox")).to_contain_text("我可以在周五帮忙。")
                    expect(v.get_by_role("button", name="撤回")).to_have_count(0)
                    v.get_by_role("button", name="公开回复").click()
                    expect(v.locator("#dialog")).to_contain_text("每个人都能看到")
                    fill(v, text="也欢迎旁听者参与。")
                    submit(v)
                    u.locator("#inboxNav").click()
                    expect(u.locator("#inbox")).to_contain_text("也欢迎旁听者参与。")
                    expect(h.locator("#inbox")).to_contain_text("也欢迎旁听者参与。")
                    h.get_by_role("button", name="Accept", exact=True).click()
                    v.locator("#roomNav").click()
                    u.get_by_role("button", name="公开回复").click()
                    fill(u, text="周五两点一起分享")
                    submit(u)
                    expect(
                        v.locator(".speech-bubble[data-anchor=seat]")
                    ).to_contain_text("周五两点一起分享")
                    expect(h.locator("#inbox")).to_contain_text("周五两点一起分享")
                    v.locator("#inboxNav").click()
                    expect(v.locator("#inbox")).to_contain_text("周五两点一起分享")
                    expect(
                        v.get_by_role("button", name="确认已约定下一步")
                    ).to_have_count(0)
                    u.get_by_role("button", name="确认已约定下一步").click()
                    h.get_by_role("button", name="Confirm a next step").click()
                    expect(u.locator("#inbox")).to_contain_text("2/2")
                    u.reload()
                    expect(u.locator("#stageState")).to_have_text("分享中")
                    u.locator("#inboxNav").click()
                    expect(u.locator("#inbox")).to_contain_text("周五两点一起分享")
                    evidence.append(
                        "A third unseated visitor read the pending public proposal, replied before acceptance and saw the accepted thread and avatar speech. Replies reached both other identities. Only the two collaborators confirmed the next step. Reload preserved the thread."
                    )
                    u.locator("#roomNav").click()
                    u.screenshot(path=EVIDENCE / "cafe-mobile.png", full_page=True)
                    assert u.evaluate(
                        "document.documentElement.scrollWidth<=innerWidth"
                    )
                    h.locator("#roomNav").click()
                    h.screenshot(path=EVIDENCE / "cafe-in-session.png", full_page=True)
                    h.locator("#take").click()
                    submit(h)
                    expect(u.locator("#stageState")).to_have_text("空闲")
                    v.locator("#roomNav").click()
                    chat_input.fill("最后一句")
                    v.locator("#chatSend").click()
                    expect(v.locator(".speech-bubble[data-own=true]")).to_have_text(
                        "最后一句"
                    )
                    expect(v.locator(".speech-bubble[data-own=true]")).to_have_count(
                        0, timeout=14000
                    )
                    expect(v.locator("#chatLog")).to_contain_text("最后一句")
                    evidence.append(
                        "Stage text and seated questions used distinct anchors; A fresh bubble expired while its original stayed in chat."
                    )
                    assert not errors, errors
                    evidence.append(
                        "Mobile 390px without horizontal overflow; handoff clears old stage; no page exceptions"
                    )
                    browser.close()
            finally:
                svc.terminate()
                svc.wait(timeout=10)
        print(json.dumps(evidence, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

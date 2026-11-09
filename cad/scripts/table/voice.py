# The explainer film's narration: each line spoken by Kokoro (an open-weights
# text-to-speech model, run locally on the CPU with onnxruntime), one WAV a line.
#
#   ~/.cache/di-tts/venv/bin/python scripts/table/voice.py <lines.json> <out dir> [voice] [speed]
#
# lines.json is [{"key": ..., "text": ...}]; writes <out dir>/<key>.wav and
# <out dir>/durations.json ({key: seconds}). The model lives in DI_TTS
# (default ~/.cache/di-tts): kokoro-v1.0.onnx and voices-v1.0.bin from
# github.com/thewh1teagle/kokoro-onnx/releases (model-files-v1.0), and the
# package in its venv: `python -m venv venv && venv/bin/pip install kokoro-onnx soundfile`.
import json
import os
import sys

import soundfile as sf
from kokoro_onnx import Kokoro

lines_path, out = sys.argv[1], sys.argv[2]
voice = sys.argv[3] if len(sys.argv) > 3 else "af_heart"
speed = float(sys.argv[4]) if len(sys.argv) > 4 else 1.0
home = os.environ.get("DI_TTS", os.path.expanduser("~/.cache/di-tts"))
os.makedirs(out, exist_ok=True)

kokoro = Kokoro(os.path.join(home, "kokoro-v1.0.onnx"), os.path.join(home, "voices-v1.0.bin"))
durations = {}
for line in json.load(open(lines_path)):
    samples, rate = kokoro.create(line["text"], voice=voice, speed=speed, lang="en-us")
    sf.write(os.path.join(out, f"{line['key']}.wav"), samples, rate)
    durations[line["key"]] = round(len(samples) / rate, 3)
    print(f"{line['key']}: {durations[line['key']]} s", flush=True)
json.dump(durations, open(os.path.join(out, "durations.json"), "w"), indent=2)

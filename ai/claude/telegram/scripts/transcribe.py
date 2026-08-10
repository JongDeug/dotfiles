#!/usr/bin/env python3
"""
음성 파일을 텍스트로 변환하는 스크립트 (faster-whisper 사용)
Usage: python3 transcribe.py <audio_file_path>
"""

import sys
import os

def transcribe(audio_path: str, language: str = "ko") -> str:
    from faster_whisper import WhisperModel

    # base 모델: 속도/정확도 균형 (Raspberry Pi 4 기준 ~30초/분)
    # language hint로 한국어 우선 처리
    model = WhisperModel("base", device="cpu", compute_type="int8")

    segments, info = model.transcribe(
        audio_path,
        language=language,
        beam_size=5,
        vad_filter=True,  # 묵음 구간 자동 제거
    )

    text = " ".join(seg.text.strip() for seg in segments)
    return text.strip()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 transcribe.py <audio_file>", file=sys.stderr)
        sys.exit(1)

    audio_file = sys.argv[1]
    lang = sys.argv[2] if len(sys.argv) > 2 else "ko"

    if not os.path.exists(audio_file):
        print(f"파일을 찾을 수 없음: {audio_file}", file=sys.stderr)
        sys.exit(1)

    result = transcribe(audio_file, language=lang)
    print(result)

# karabiner

오른쪽 Command로 한/영 전환. 맥북 내장 키보드와 Magic Keyboard 둘 다.

## 원리

macOS 입력 소스 단축키 **다음 입력 소스**가 F6다. Karabiner는 오른쪽 Command를 F6로 바꿔서, 키가 한/영처럼 동작하게 한다.

```
오른쪽 Command  →  Karabiner  →  F6  →  ABC ↔ 두벌식
```

내장 키보드는 identifiers가 `{ is_keyboard: true }` 뿐이라 그 항목에 매핑한다. Magic Keyboard는 vendor/product가 있어서 **별도 기기 항목**이 없으면 규칙이 안 먹는다. `vendor_id: 76`, `product_id: 800` 이 지금 쓰는 Magic Keyboard다.

## 심링크

```bash
ln -sfn "$REPO/karabiner/karabiner.json" ~/.config/karabiner/karabiner.json
```

Karabiner-Elements가 설치돼 있어야 한다. 설정 파일만 바꿔도 바로 다시 읽는다.

## 새 키보드

다른 외장을 쓰면 그 기기 identifiers를 추가한다.

```bash
/Library/Application\ Support/org.pqrs/Karabiner-Elements/bin/karabiner_cli --list-connected-devices
```

나온 `vendor_id` / `product_id`로 Magic Keyboard 항목을 복사해 넣으면 된다. Karabiner → Devices에서 그 키보드 **Modify events**도 켜져 있어야 한다.

## 새 Mac에서 F6가 안 먹으면

시스템 설정 → 키보드 → 키보드 단축키 → 입력 소스 → **다음 입력 소스**가 F6인지 본다. 이게 빠져 있으면 Karabiner가 F6를 보내도 한/영이 안 바뀐다.

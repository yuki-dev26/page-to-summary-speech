# Page to Summary Speech

<img width="1280" height="670" alt="image" src="https://github.com/user-attachments/assets/b3402dcb-e169-43a5-91a6-c5f643434226" />

閲覧中のWebページをAIで要約し、その要約を音声で読み上げるブラウザ拡張機能です。

## 基本フロー

1. Webページを開く
2. 拡張機能がページのタイトル・URL・本文・著者・公開日などを DOM から取得
3. メニューや広告などを除いて本文を抽出
4. OpenAI API で要約
5. OpenAI TTS で音声合成して再生

## セットアップ

1. [OpenAI APIキー](https://platform.openai.com/api-keys) を用意する
2. Chrome で `chrome://extensions`を開く
3. 「デベロッパーモード」を有効にする
4. 「パッケージ化されていない拡張機能を読み込む」でこのリポジトリのフォルダを選択する
5. 拡張機能アイコンをクリックし、サイドパネルでAPIキー等を設定する

ポップアップではなく **サイドパネル** で開きます。

対応言語: 日本語（デフォルト） / English / 简体中文 / 繁體中文 / 한국어  
言語・テーマ・APIキー・プロンプトなどは `chrome.storage.local` に保存され、端末内にのみ保持されます。UI文言と要約プロンプトの初期値も言語に合わせて切り替わります。設定内のアイコンでライト／ダークを切り替えできます。

## 使い方

1. 要約したいWebページを開く
2. 拡張機能アイコンをクリックしてサイドパネルを開く(固定推奨)
3. 必要なら下部の設定で API キー・モデル・話者・要約プロンプトを調整する
4. 読み上げパネルの「要約して読み上げ」ボタンを押す（本文抽出 → 回答生成 → 音声生成 → 再生まで一気に進む）
5. 一時停止や速度変更ができる

要約プロンプトは初期値が入っており、画面上で編集できます。「初期値に戻す」で元に戻せます。

## 使用 API

| 用途     | API                                | モデル                                                                 |
| -------- | ---------------------------------- | ---------------------------------------------------------------------- |
| 要約     | Responses API (`/v1/responses`)    | `gpt-5.4-nano` / `gpt-5.4-mini` / `gpt-5.4`（既定: nano）              |
| 音声合成 | Speech API (`/v1/audio/speech`)    | `gpt-4o-mini-tts`                                                      |

要約モデルはサイドパネルで切り替えできます（nano / mini / GPT-5.4）。
TTS はOpenAI APIの `gpt-4o-mini-tts` を使います。

## 構成

```text
manifest.json          # Manifest V3
background.js          # サイドパネル起動
icons/                 # 拡張アイコン (16/32/48/128)
popup/                 # サイドパネル UI
content/extract.js     # ページ本文抽出
lib/openai.js          # OpenAI 要約 / TTS
lib/i18n.js            # 言語切替ロジック
lib/locales/           # 言語別メッセージ (ja/en/zh-CN/zh-TW/ko)
```

## 注意

- `chrome://extensions` や新しいタブなど、ブラウザ内部ページでは動作しません。記事などの通常のWebページを前面にして実行してください
- ページ構造によっては本文抽出が不十分な場合があります
- OpenAI API の利用料はご自身のアカウントに課金されます

## Supporters

[![note メンバーシップ](https://img.shields.io/badge/note-Membership-41C9B4?style=for-the-badge&logo=note&logoColor=white)](https://note.com/yuki_tech/membership/members)

## License

Copyright (c) 2026 [yuki-P](https://x.com/yuki_p02)  
Licensed under the [Membership Source Code License](LICENSE).

メンバーシップ限定のソースコードライセンスです。個人・教育など非商用での閲覧・実行・改変は許可されますが、再配布・商用利用などは著作権者の事前の許諾が必要です。詳細は [LICENSE](LICENSE) を参照してください。

[![License: Custom](https://img.shields.io/badge/License-Custom-lightgrey.svg)](LICENSE)

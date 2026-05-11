# このPCで開発を続ける手順

このプロジェクトは、ファームウェア、記録用PWA、CADデータが同じリポジトリに入っています。

## 記録用アプリを開く

このPCでは `python` や `node` が見つからないため、PowerShellだけで動くローカルサーバーを用意しています。

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\tools\serve-local.ps1
```

起動したら、ブラウザで次を開きます。

```text
http://localhost:5173/app/
```

ポートを変えたい場合:

```powershell
.\tools\serve-local.ps1 -Port 5174
```

止めるときは、サーバーを起動しているPowerShellで `Ctrl+C` を押します。

## 記録データについて

記録用アプリのデータはブラウザのIndexedDBに保存されます。PC、ブラウザ、スマホを変える前には、アプリ内の「CSVエクスポート」でバックアップしてください。移行先では「CSVインポート」で戻せます。

## ファームウェアをビルドする

PlatformIOはこのPCで動作確認済みです。

```powershell
& "$env:USERPROFILE\.platformio\penv\Scripts\pio.exe" run
```

現在の設定は `platformio.ini` にあり、書き込みポートは `COM3` です。

## 確認済み

- PlatformIOビルド: 成功
- 記録用アプリ: `app/` に配置済み
- ローカル確認用サーバー: `tools/serve-local.ps1`

## 注意

PowerShellで日本語ファイルを `Get-Content` すると、環境によって文字化けして見える場合があります。ブラウザやGit diffでは正常に読めることがあります。

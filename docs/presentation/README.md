# プレゼン用クロージングスライド

## 資料の最後に載せるURL（ログイン）

| 用途 | URL |
|------|-----|
| **ログイン（おすすめ）** | **`https://moto-hub-blond.vercel.app/login`** |
| 新規加盟申請 | `https://moto-hub-blond.vercel.app/signup` |

> **`https://moto-hub.jp` はエックスサーバー（LP用）** — 公開時は `/lp` へリダイレクトするか、Vercel の `https://moto-hub-blond.vercel.app/lp` を案内してください。  
> QR・資料のログインURLは上記 **Vercel** を使ってください。

| LP（サービス紹介） | `https://moto-hub-blond.vercel.app/lp` |

`app.moto-hub.jp` などサブドメインを Vercel に繋いだら、`lib/brand.ts` の `NEXT_PUBLIC_APP_URL` を更新し、QRを差し替えます。

## ファイル

| ファイル | 用途 |
|----------|------|
| `closing-slide-1920x1080.png` | そのまま最終スライドに貼る画像 |
| `closing-slide.html` | 文言調整用 |
| `qr-login.png` | ログイン画面へのQR単体 |

## QRの再生成

```bash
curl -fsSL -o qr-login.png \
  "https://api.qrserver.com/v1/create-qr-code/?size=480x480&margin=10&data=https%3A%2F%2Fmoto-hub-blond.vercel.app%2Flogin"
```

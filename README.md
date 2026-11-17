# opencode-termux

AI coding agent untuk Termux Android — clean-room rebuild dari [opencode](https://github.com/anomalyco/opencode) yang berjalan sepenuhnya di terminal HP Android.

![Terminal screenshot](docs/screenshot.png)

## Fitur

- **Chat AI streaming** — Konversasi real-time dengan Anthropic Claude / OpenAI GPT / NVIDIA NIM
- **Multi-provider support** — Anthropic, OpenAI, NVIDIA NIM (OpenAI-compatible), lokal (Ollama, vLLM, dll)
- **Agent switching** — Tekan `Tab` untuk ganti agent: `build` (coding), `plan` (read-only), `general`
- **File operations** — `@file` baca file, AI bisa read/write/edit file via tools
- **Shell commands** — `!command` jalankan perintah shell langsung
- **Session persistence** — Riwayat chat tersimpan SQLite lokal, bisa resume kapan saja
- **Syntax highlighting** — Tree-sitter untuk 8+ bahasa (TS, Python, Rust, Go, Java, C++, JSON, Bash)
- **LSP integration** — Code intelligence (go to definition, hover, dll) via vscode-languageserver
- **Local-first** — Database SQLite + WAL mode, tidak butuh server
- **Optional cloud sync** — Siap untuk sinkronisasi sesi ke cloud (coming soon)
- **Telegram Bot** — Jalankan AI agent sebagai bot Telegram (`/bot telegram`)
- **WhatsApp Bot** — Jalankan AI agent sebagai bot WhatsApp via Baileys (`/bot whatsapp`)

## Prasyarat

- Android 7+ (API 24+)
- [Termux](https://termux.dev/) (install via F-Droid atau GitHub releases, **bukan** Play Store)
- Minimal 500MB ruang kosong

## Instalasi

### 1. Install dependensi di Termux

```bash
pkg update && pkg upgrade -y
pkg install git bun -y
```

### 2. Clone repository

```bash
git clone https://github.com/adityaanjay/opencode-termux.git
cd opencode-termux
```

### 3. Install dependencies & build

```bash
bun install
bun run build
```

### 4. Inisialisasi database

```bash
bun run db:push
```

### 5. Jalankan

```bash
bun run start
```

Atau biar bisa dipanggil dari mana saja:

```bash
bun link
# sekarang bisa jalanin `opencode-termux` dari directory manapun
```

## Konfigurasi API Key

Pertama kali jalan, set API key via slash command:

```
/config anthropic sk-ant-xxxxxxxxxxxx
# atau
/config openai sk-xxxxxxxxxxxx
# atau NVIDIA NIM / OpenAI-compatible endpoint
/config nvidia sk-xxxxxxxxxxxx
```

Key tersimpan di database lokal (`data/opencode.db`), tidak keluar dari device.

### NVIDIA NIM / Custom OpenAI-compatible Endpoint

Untuk NVIDIA NIM atau endpoint OpenAI-compatible lain (Ollama, vLLM, LocalAI, dll):

```
/config nvidia sk-dummy
/config base_url http://localhost:8000/v1
/config model meta/llama-3.1-70b-instruct
```

Atau set via `/config` sekali:
```
/config nvidia sk-dummy
# lalu edit base_url dan model di menu /config
```

Base URL default untuk NVIDIA NIM: `https://integrate.api.nvidia.com/v1`

## Penggunaan Dasar

| Key | Aksi |
|-----|------|
| `Tab` | Ganti agent (build/plan/general) |
| `!cmd` | Jalankan shell command |
| `@file` | Baca file & kirim ke AI |
| `/help` | Bantuan |
| `/session` | Kelola sesi |
| `/config` | Set API key / model / temperature / base_url |
| `/new` | Sesi baru |
| `/clear` | Bersihkan chat |
| `Esc` | Tutup dialog / cancel |

### Bot Commands

| Command | Aksi |
|---------|------|
| `/bot telegram` | Start Telegram bot |
| `/bot whatsapp` | Start WhatsApp bot (scan QR first run) |
| `/bot stop` | Stop bots (restart app) |
| `/bot status` | Cek status bot |

### Contoh

```
> @src/App.tsx
> !ls -la
> Buatkan unit test untuk fungsi parseJSON di utils.ts
> /config anthropic sk-ant-xxx
> /session
```

### Bot Usage

**Telegram Bot:**
1. Buat bot via @BotFather di Telegram, dapatkan token
2. Set token: `/config telegram_token 123456:ABC-DEF...`
3. (Optional) Batasi user: `/config telegram_allowed_users ["123456789", "987654321"]`
4. Jalankan: `/bot telegram`
5. Chat dengan bot di Telegram

**WhatsApp Bot:**
1. Jalankan: `/bot whatsapp`
2. Scan QR code yang muncul di terminal dengan WhatsApp HP
3. Bot siap digunakan (session tersimpan otomatis)
4. Chat ke nomor WhatsApp yang terhubung

**Catatan:** Bot menggunakan session dan tools yang sama dengan TUI. Bot bisa baca/tulis file, jalankan command, dsb.

## Arsitektur Singkat

```
src/
├── App.tsx           # Main app, state management, screens
├── cli.tsx           # Entry point, TTY check
├── db/
│   ├── schema.ts     # Drizzle schema (6 tables)
│   ├── index.ts      # Bun:sqlite connection, WAL mode
│   └── push.ts       # Migration runner
├── ai/
│   ├── providers/    # Anthropic, OpenAI, NVIDIA streaming
│   ├── tools/        # 6 tools: read/write/edit/run/list/grep
│   └── types.ts      # Message, ToolCall types
├── bot/
│   ├── telegram.ts   # Telegram bot (grammy)
│   ├── whatsapp.ts   # WhatsApp bot (baileys)
│   └── index.ts      # Bot exports
└── components/       # 12 Ink components (TUI)
```

**Stack**: Bun + TypeScript + Ink (React for CLI) + Drizzle ORM + SQLite + Tree-sitter + vscode-languageserver + grammy (Telegram) + baileys (WhatsApp)

## Development

```bash
bun run dev        # Watch mode
bun run build      # Production build
bun run typecheck  # TypeScript check
bun run lint       # ESLint
bun run db:studio  # Drizzle Studio (GUI database)
```

## Troubleshooting

### "Raw mode not supported" / TTY error
Jalankan langsung di Termux, bukan via SSH/ADB shell tanpa `-t`:
```bash
ssh -t user@host opencode-termux
```

### Yoga WASM missing
Sudah di-handle di build script, tapi kalau error:
```bash
cp node_modules/yoga-wasm-web/dist/yoga.wasm dist/
```

### Database locked
Pastikan cuma 1 instance jalan. Hapus `data/opencode.db-wal` dan `data/opencode.db-shm` kalau stuck.

### Bun version
Butuh Bun >= 1.1.0. Cek: `bun --version`

### Bot Issues

**Telegram bot not starting:**
- Cek token: `/config` → lihat `bot.telegram_token`
- Pastikan token valid dari @BotFather
- Cek log error di terminal

**WhatsApp QR not showing:**
- Hapus folder `data/whatsapp_auth` dan coba lagi
- Pastikan versi WhatsApp di HP support WhatsApp Web
- Baileys kadang butuh update: `bun add @whiskeysockets/baileys@latest`

**Bot not responding:**
- Cek apakah bot masih jalan (lihat log terminal)
- Restart app kalau bot hang
- Pastikan API key valid dan punya quota

## Roadmap

- [ ] Cloud sync (supabase/firebase)
- [ ] Git integration (diff, commit, push dari TUI)
- [ ] Plugin system
- [ ] MCP server support
- [ ] Themes kustom
- [x] NVIDIA NIM / OpenAI-compatible endpoints
- [x] Telegram bot
- [x] WhatsApp bot (Baileys)

## Lisensi

MIT — bebas dipakai, dimodifikasi, didistribusikan.

## Credit

Inspirasi dari [opencode](https://github.com/anomalyco/opencode) oleh anomalyco. Dibangun clean-room dengan replica-skill workflow + REA.
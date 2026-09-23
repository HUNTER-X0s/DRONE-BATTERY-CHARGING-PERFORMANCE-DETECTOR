# 🚁 Drone Battery Charging Performance Detector

A professional **Battery Charging Performance & Diagnosis System** that uses a camera to automatically detect digital meters during drone-battery charging, record timestamped readings, calculate 1% charge transitions, analyze charging performance, and generate Excel-based diagnosis reports.

> 🤖 Powered by the **Gemini AI API** for automatic meter-reading detection from camera frames.

## ✨ Features

- 📷 **Camera-based automatic meter detection** — point the camera at the charger display and let AI read the values in real time
- ⏱️ **Timestamped reading recording** — every meter state is captured with an exact timestamp
- 📊 **1% transition calculation** — automatically detects when the charge percentage crosses each 1% step
- 🧪 **Charging performance analysis** — evaluates voltage/current behavior across the charging curve
- 📑 **Excel diagnosis reports** — exports a fully formatted `.xlsx` report
- 🚀 **Modern React + Vite frontend** with real-time charting (Recharts) and animations (Motion)
- 📱 **Android companion module** under `app/`

## 🛠️ Tech Stack

| Layer      | Tech                                                              |
| ---------- | ----------------------------------------------------------------- |
| Frontend   | React 19, TypeScript, Vite, Tailwind CSS 4, Recharts, Motion      |
| Backend    | Node.js, Express, `@google/genai` (Gemini AI)                     |
| Reports    | SheetJS (`xlsx`)                                                  |
| Android    | Kotlin + Gradle                                                   |

## 🚀 Getting Started

**Prerequisites:** Node.js 18+, npm, and a [Google Gemini API key](https://aistudio.google.com/apikey).

```bash
# 1. Install dependencies
npm install

# 2. Configure the Gemini API key
cp .env.example .env   # then paste your key after GEMINI_API_KEY=

# 3. Start the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Production build

```bash
npm run build
npm start
```

## 📁 Project Structure

```
├── app/                # Android companion module (Kotlin + Gradle)
├── src/                # React frontend source
├── gradle/             # Gradle wrapper config
├── server.ts           # Express + Gemini AI API server
├── vite.config.ts      # Vite configuration
├── index.html          # App entry HTML
├── package.json        # Dependencies & scripts
└── .env.example        # Environment template (copy to .env)
```

## 🔐 Security Note

The `.env` file (with your `GEMINI_API_KEY`) is **git-ignored** — never commit it. Use `.env.example` as the template.

## 📄 License

This project is open-source. See the repository for details.
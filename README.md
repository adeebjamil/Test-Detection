# MallVision AI — Local CCTV Analytics

Starter project: Next.js light dashboard, Express API, SQLite database, and Python AI-engine scaffold.

## Requirements

- Node.js 20+
- Python 3.10+
- Windows 11 or Linux

## Start backend

```bash
cd backend
npm install
```

Copy `.env.example` to `.env`, then:

```bash
npm run dev
```

API health: http://localhost:4000/api/health

## Start dashboard (second terminal)

```bash
cd dashboard
npm install
```

Copy `.env.local.example` to `.env.local`, then:

```bash
npm run dev
```

Open http://localhost:3000

## Python scaffold

```bash
cd ai-engine
python -m venv .venv
# Windows: .venv\\Scripts\\activate
# Linux: source .venv/bin/activate
pip install -r requirements.txt
python main.py
```

The dashboard uses real database counts (zero until events exist). Its sample footfall curve is clearly labelled illustrative. The Python engine is a scaffold and does not yet start camera streams; next we will implement and validate object detection, tracking, and virtual line-crossing on the actual four entrance views.

Security: do not commit RTSP credentials. Keep camera secrets outside source control. Verify commercial model licensing before deployment. Gender/age labels, if later added, must be presented as uncertain estimates. Nationality or Dubai origin must not be inferred from appearance.

# Test-Detection

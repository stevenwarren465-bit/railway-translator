# Railway Translator

Real-time phone translation using Twilio Media Streams and Azure Speech Services.

## Deploy to Railway

1. **Create Railway account**: https://railway.app/

2. **Create new project**:
   - Click "New Project"
   - Choose "Deploy from GitHub repo"
   - Connect your GitHub account
   - Select this repository

3. **Set environment variables** in Railway:
   - `AZURE_SPEECH_KEY`: Your Azure Speech Services key
   - `AZURE_SPEECH_REGION`: `eastus`

4. **Deploy**: Railway will automatically deploy when you push to GitHub

5. **Get your URL**: Railway will give you a URL like `https://your-app.railway.app`

6. **Update Twilio webhook**:
   - Go to Twilio Console → Phone Numbers
   - Click your number: +1-210-405-1347
   - Voice webhook URL: `https://your-app.railway.app/voice`
   - Save

## How it works

1. Caller dials +1-210-405-1347
2. Twilio hits `/voice` endpoint → returns TwiML
3. TwiML starts Media Stream WebSocket
4. Your cell phone rings (+12145874121)
5. When you answer:
   - Caller speaks Spanish → Azure translates → You hear English
   - You speak English → Azure translates → Caller hears Spanish (TODO)

## Current Status

- ✅ WebSocket server setup
- ✅ Mulaw → PCM audio conversion
- ✅ Spanish recognition and English translation
- ⚠️ Audio playback not yet implemented (logs only)
- 🔄 Bidirectional translation needs work

## Local Testing

```bash
npm install
AZURE_SPEECH_KEY=your_key AZURE_SPEECH_REGION=eastus node server.js
```

## Next Steps

1. Add text-to-speech synthesis
2. Send translated audio back to Twilio
3. Handle bidirectional translation (both tracks)
4. Add error handling and reconnection logic

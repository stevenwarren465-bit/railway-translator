const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const sdk = require('microsoft-cognitiveservices-speech-sdk');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ noServer: true });

const PORT = process.env.PORT || 3000;

// Environment variables from Railway
const AZURE_SPEECH_KEY = process.env.AZURE_SPEECH_KEY;
const AZURE_SPEECH_REGION = process.env.AZURE_SPEECH_REGION || 'eastus';

// Health check endpoint
app.get('/', (req, res) => {
  res.send('Translation WebSocket Server Running');
});

// Twilio voice webhook - returns TwiML to start Media Stream
app.post('/voice', express.urlencoded({ extended: false }), (req, res) => {
  console.log('=== INCOMING CALL ===');
  console.log('From:', req.body.From);
  console.log('To:', req.body.To);
  console.log('Host:', req.get('host'));
  
  const from = req.body.From;
  const host = req.get('host');
  const wsUrl = `wss://${host}/media-stream`;
  
  console.log('WebSocket URL:', wsUrl);
  
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">Welcome to A A Texas translation service. Connecting you now.</Say>
  <Start>
    <Stream url="${wsUrl}" track="both_tracks"/>
  </Start>
  <Dial timeout="30" callerId="${from}">
    <Number>+12145874121</Number>
  </Dial>
</Response>`;
  
  console.log('Sending TwiML:', twiml);
  
  res.type('text/xml');
  res.send(twiml);
});

// WebSocket handler for Twilio Media Streams
wss.on('connection', (ws) => {
  console.log('New WebSocket connection');
  
  let streamSid = null;
  let callSid = null;
  let pushStream = null;
  let translator = null;
  
  ws.on('message', (message) => {
    try {
      const msg = JSON.parse(message);
      
      switch (msg.event) {
        case 'connected':
          console.log('Media stream connected');
          break;
          
        case 'start':
          streamSid = msg.streamSid || msg.start.streamSid;
          callSid = msg.start.callSid;
          console.log(`Stream started: ${streamSid}`);
          
          // Initialize Azure Speech Translation
          pushStream = sdk.AudioInputStream.createPushStream(
            sdk.AudioStreamFormat.getWaveFormatPCM(8000, 16, 1) // 8kHz, 16-bit, mono
          );
          
          const speechConfig = sdk.SpeechTranslationConfig.fromSubscription(
            AZURE_SPEECH_KEY,
            AZURE_SPEECH_REGION
          );
          
          // Spanish caller → English for you
          speechConfig.speechRecognitionLanguage = 'es-ES';
          speechConfig.addTargetLanguage('en');
          
          const audioConfig = sdk.AudioConfig.fromStreamInput(pushStream);
          translator = new sdk.TranslationRecognizer(speechConfig, audioConfig);
          
          // Handle recognized translations
          translator.recognized = (s, e) => {
            if (e.result.reason === sdk.ResultReason.TranslatedSpeech) {
              const spanish = e.result.text;
              const english = e.result.translations.get('en');
              
              console.log(`Spanish: ${spanish}`);
              console.log(`English: ${english}`);
              
              // TODO: Synthesize English audio and send back
              // This is the complex part that needs audio format handling
            }
          };
          
          translator.recognizing = (s, e) => {
            console.log(`Recognizing: ${e.result.text}`);
          };
          
          translator.startContinuousRecognitionAsync(
            () => console.log('Recognition started'),
            (err) => console.error('Recognition error:', err)
          );
          break;
          
        case 'media':
          if (pushStream && msg.media.payload) {
            // Twilio sends mulaw audio, base64 encoded
            const audioData = Buffer.from(msg.media.payload, 'base64');
            
            // Convert mulaw to PCM16
            const pcmData = mulawToPcm16(audioData);
            
            // Push to Azure Speech
            pushStream.write(pcmData);
          }
          break;
          
        case 'stop':
          console.log('Stream stopped');
          if (pushStream) pushStream.close();
          if (translator) translator.stopContinuousRecognitionAsync();
          break;
      }
    } catch (error) {
      console.error('Error processing message:', error);
    }
  });
  
  ws.on('close', () => {
    console.log('WebSocket connection closed');
    if (pushStream) pushStream.close();
    if (translator) translator.close();
  });
  
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

// Convert mulaw audio to PCM16 (required for Azure Speech)
function mulawToPcm16(mulawData) {
  const MULAW_TABLE = [
    -32124,-31100,-30076,-29052,-28028,-27004,-25980,-24956,
    -23932,-22908,-21884,-20860,-19836,-18812,-17788,-16764,
    -15996,-15484,-14972,-14460,-13948,-13436,-12924,-12412,
    -11900,-11388,-10876,-10364,-9852,-9340,-8828,-8316,
    -7932,-7676,-7420,-7164,-6908,-6652,-6396,-6140,
    -5884,-5628,-5372,-5116,-4860,-4604,-4348,-4092,
    -3900,-3772,-3644,-3516,-3388,-3260,-3132,-3004,
    -2876,-2748,-2620,-2492,-2364,-2236,-2108,-1980,
    -1884,-1820,-1756,-1692,-1628,-1564,-1500,-1436,
    -1372,-1308,-1244,-1180,-1116,-1052,-988,-924,
    -876,-844,-812,-780,-748,-716,-684,-652,
    -620,-588,-556,-524,-492,-460,-428,-396,
    -372,-356,-340,-324,-308,-292,-276,-260,
    -244,-228,-212,-196,-180,-164,-148,-132,
    -120,-112,-104,-96,-88,-80,-72,-64,
    -56,-48,-40,-32,-24,-16,-8,0,
    32124,31100,30076,29052,28028,27004,25980,24956,
    23932,22908,21884,20860,19836,18812,17788,16764,
    15996,15484,14972,14460,13948,13436,12924,12412,
    11900,11388,10876,10364,9852,9340,8828,8316,
    7932,7676,7420,7164,6908,6652,6396,6140,
    5884,5628,5372,5116,4860,4604,4348,4092,
    3900,3772,3644,3516,3388,3260,3132,3004,
    2876,2748,2620,2492,2364,2236,2108,1980,
    1884,1820,1756,1692,1628,1564,1500,1436,
    1372,1308,1244,1180,1116,1052,988,924,
    876,844,812,780,748,716,684,652,
    620,588,556,524,492,460,428,396,
    372,356,340,324,308,292,276,260,
    244,228,212,196,180,164,148,132,
    120,112,104,96,88,80,72,64,
    56,48,40,32,24,16,8,0
  ];
  
  const pcmBuffer = Buffer.alloc(mulawData.length * 2);
  
  for (let i = 0; i < mulawData.length; i++) {
    const sample = MULAW_TABLE[mulawData[i]];
    pcmBuffer.writeInt16LE(sample, i * 2);
  }
  
  return pcmBuffer;
}

// Handle WebSocket upgrade for /media-stream path
server.on('upgrade', (request, socket, head) => {
  console.log('WebSocket upgrade request for:', request.url);
  
  if (request.url === '/media-stream') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`WebSocket endpoint: ws://localhost:${PORT}/media-stream`);
});

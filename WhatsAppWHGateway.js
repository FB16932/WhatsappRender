// Import dependencies
const express = require('express');
const axios = require('axios');

// Create an Express app
const app = express();

// Middleware to parse JSON bodies
app.use(express.json());

// Set port and verify_token
const port = process.env.PORT || 3000;
const verifyToken = process.env.VERIFY_TOKEN;

// OAuth2 + Webhook URLs from env variables
const authUrl = process.env.AUTH_URL;
const externalWebhookUrl = process.env.EXTERNAL_WEBHOOK_URL;

// Function to request access token
async function getAccessToken() {
  try {
    const response = await axios.post(
      authUrl,
      new URLSearchParams({
        grant_type: process.env.GRANT_TYPE,
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET
      }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        }
      }
    );
    return response.data.access_token;
  } catch (err) {
    console.error("❌ Error obtaining token:", err.response?.data || err.message);
    throw err;
  }
}

// Function to forward WhatsApp event to external webhook
async function forwardToExternal(body) {
  try {
    const token = await getAccessToken();

    const response = await axios.post(externalWebhookUrl, body, {
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      }
    });

    console.log("✅ Event forwarded successfully:", response.status);
  } catch (err) {
    console.error("❌ Error forwarding event:", err.response?.data || err.message);
  }
}

// Route for GET requests (Webhook verification)
app.get('/', (req, res) => {
  const { 'hub.mode': mode, 'hub.challenge': challenge, 'hub.verify_token': token } = req.query;

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('WEBHOOK VERIFIED');
    res.status(200).send(challenge);
  } else {
    res.status(403).end();
  }
});

// Route for POST requests (WhatsApp messages)
app.post('/', async (req, res) => {
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
  console.log(`\n\nWebhook received ${timestamp}\n`);
  console.log(JSON.stringify(req.body, null, 2));

  try {
    // WhatsApp payload structure: entry -> changes -> value
    const entries = req.body.entry || [];
    for (const entry of entries) {
      const changes = entry.changes || [];
      for (const change of changes) {
        const value = change.value || {};

        // 👇 SOLO procesamos mensajes, no statuses
        if (value.messages && value.messages.length > 0) {
          console.log("📩 Forwarding WhatsApp message...");
          await forwardToExternal(req.body);
        } else {
          console.log("ℹ️ Ignored non-message event (status/update).");
        }
      }
    }
  } catch (err) {
    console.error("❌ Error processing webhook:", err.message);
  }

  res.status(200).end();
});

// Start the server
app.listen(port, () => {
  console.log(`\nListening on port ${port}\n`);
});

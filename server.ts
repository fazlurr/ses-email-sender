import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  // API Endpoint to send emails
  app.post("/api/send-email", async (req, res) => {
    const { credentials, sender, recipient, content } = req.body;

    if (!credentials || !sender || !recipient || !content) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    try {
      const client = new SESClient({
        region: credentials.region,
        credentials: {
          accessKeyId: credentials.accessKeyId,
          secretAccessKey: credentials.secretAccessKey,
        },
      });

      const command = new SendEmailCommand({
        Destination: {
          ToAddresses: [recipient.email],
        },
        Message: {
          Body: {
            Html: {
              Charset: "UTF-8",
              Data: content.body,
            },
          },
          Subject: {
            Charset: "UTF-8",
            Data: content.subject,
          },
        },
        Source: `${sender.name} <${sender.email}>`,
      });

      const response = await client.send(command);
      res.json({ success: true, messageId: response.MessageId });
    } catch (error: any) {
      console.error("SES Error:", error);
      res.status(500).json({ error: error.message || "Failed to send email" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

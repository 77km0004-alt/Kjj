import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: "1mb" }));

function cleanMessages(messages) {
  return Array.isArray(messages)
    ? messages.slice(-40).map(m => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: String(m.content ?? "").slice(0, 12000)
      }))
    : [];
}

app.post("/api/chat", async (req, res) => {
  try {
    const {
      provider = "openai-compatible",
      baseUrl,
      apiKey,
      model,
      systemPrompt = "",
      messages = [],
      temperature = 0.8,
      maxTokens = 1200
    } = req.body || {};

    if (!baseUrl || !model) {
      return res.status(400).json({ error: "baseUrl과 model이 필요합니다." });
    }

    const safeMessages = cleanMessages(messages);
    let url = String(baseUrl).replace(/\/+$/, "");

    if (provider === "anthropic") {
      url = url.endsWith("/messages") ? url : `${url}/v1/messages`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": String(apiKey || ""),
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model,
          max_tokens: Math.max(1, Math.min(Number(maxTokens) || 1200, 8192)),
          temperature: Number(temperature) || 0.8,
          system: systemPrompt,
          messages: safeMessages
        })
      });
      const data = await response.json();
      if (!response.ok) return res.status(response.status).json({ error: data?.error?.message || "Anthropic 요청 실패" });
      const text = Array.isArray(data.content)
        ? data.content.filter(x => x.type === "text").map(x => x.text).join("")
        : "";
      return res.json({ text });
    }

    // OpenAI-compatible providers: OpenAI, local gateways, Ollama-compatible gateways, etc.
    url = url.endsWith("/chat/completions") ? url : `${url}/v1/chat/completions`;
    const payloadMessages = [
      ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
      ...safeMessages
    ];
    const headers = { "content-type": "application/json" };
    if (apiKey) headers.authorization = `Bearer ${apiKey}`;

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        messages: payloadMessages,
        temperature: Number(temperature) || 0.8,
        max_tokens: Math.max(1, Math.min(Number(maxTokens) || 1200, 8192))
      })
    });
    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: data?.error?.message || "모델 요청 실패" });

    const text = data?.choices?.[0]?.message?.content ?? "";
    return res.json({ text: typeof text === "string" ? text : JSON.stringify(text) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "서버 요청 중 오류가 발생했습니다." });
  }
});

const dist = path.join(__dirname, "..", "dist");
app.use(express.static(dist));
app.get("*", (req, res) => {
  if (req.path.startsWith("/api/")) return res.status(404).end();
  res.sendFile(path.join(dist, "index.html"));
});

const port = process.env.PORT || 3001;
app.listen(port, () => console.log(`Vela server: http://localhost:${port}`));

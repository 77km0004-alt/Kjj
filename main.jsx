import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";

const STORAGE_KEY = "vela-chat";

const DEFAULT_DB = {
  characters: [],
  selectedCharacter: null,
  apiKey: "",
  model: "openrouter/free",
};

const DEFAULT_CHARACTER = {
  id: "",
  name: "새 캐릭터",
  description: "",
  userNote: "",
  rules: "",
  maxTokens: 700,
  reasoning: 0,
  temperature: 0.8,
  summaryInterval: 10,
  summary: "",
};

function loadDB() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : DEFAULT_DB;
  } catch {
    return DEFAULT_DB;
  }
}

function App() {
  const [db, setDB] = useState(loadDB);
  const [screen, setScreen] = useState("home");
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draft, setDraft] = useState(DEFAULT_CHARACTER);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  const character = db.characters.find(
    (item) => item.id === db.selectedCharacter
  );

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  }, [db]);

  function createCharacter() {
    setDraft({
      ...DEFAULT_CHARACTER,
      id: crypto.randomUUID(),
    });
    setScreen("create");
    setMenuOpen(false);
  }

  function editCharacter() {
    if (!character) return;

    setDraft({
      ...DEFAULT_CHARACTER,
      ...character,
    });

    setScreen("create");
    setMenuOpen(false);
  }

  function saveCharacter() {
    const nextCharacter = {
      ...draft,
      name: draft.name.trim() || "새 캐릭터",
    };

    setDB((old) => {
      const exists = old.characters.some(
        (item) => item.id === nextCharacter.id
      );

      return {
        ...old,
        characters: exists
          ? old.characters.map((item) =>
              item.id === nextCharacter.id ? nextCharacter : item
            )
          : [...old.characters, nextCharacter],
        selectedCharacter: nextCharacter.id,
      };
    });

    setMessages([]);
    setScreen("chat");
  }

  function openCharacter(id) {
    setDB((old) => ({
      ...old,
      selectedCharacter: id,
    }));

    const saved = db.chats?.[id] || [];
    setMessages(saved);
    setScreen("chat");
  }

  function systemPrompt() {
    return [
      `캐릭터 이름: ${draft.name}`,
      "",
      "캐릭터 설정:",
      draft.description || "(설정 없음)",
      "",
      "{user} 사용자 설정:",
      draft.userNote || "(설정 없음)",
      "",
      "추가 규칙:",
      draft.rules || "(추가 규칙 없음)",
      "",
      "이전 세션 요약:",
      draft.summary || "(요약 없음)",
    ].join("\n");
  }

  async function sendMessage() {
    const text = input.trim();

    if (!text || busy || !character) {
      return;
    }

    if (!db.apiKey.trim()) {
      setMessages((old) => [
        ...old,
        {
          role: "system",
          content: "OpenRouter API 키를 설정해주세요.",
        },
      ]);
      return;
    }

    const userMessage = {
      role: "user",
      content: text,
    };

    const nextMessages = [...messages, userMessage];

    setMessages(nextMessages);
    setInput("");
    setBusy(true);

    try {
      const response = await fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${db.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "openrouter/free",
            messages: [
              {
                role: "system",
                content: systemPrompt(),
              },
              ...nextMessages.slice(-20),
            ],
            temperature: Number(draft.temperature) || 0.8,
            max_tokens: Number(draft.maxTokens) || 700,
            ...(Number(draft.reasoning) > 0
              ? {
                  reasoning: {
                    max_tokens: Number(draft.reasoning),
                  },
                }
              : {}),
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error?.message || `API 오류: ${response.status}`
        );
      }

      const answer =
        data?.choices?.[0]?.message?.content || "응답이 없습니다.";

      const completed = [
        ...nextMessages,
        {
          role: "assistant",
          content: answer,
        },
      ];

      setMessages(completed);

      setDB((old) => ({
        ...old,
        chats: {
          ...(old.chats || {}),
          [character.id]: completed,
        },
      }));

      const userTurns = completed.filter(
        (item) => item.role === "user"
      ).length;

      const interval = Number(draft.summaryInterval) || 10;

      if (userTurns > 0 && userTurns % interval === 0) {
        await makeSummary(completed);
      }
    } catch (error) {
      setMessages((old) => [
        ...old,
        {
          role: "system",
          content: `오류: ${error.message}`,
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  async function makeSummary(history) {
    if (!db.apiKey.trim() || !character) return;

    try {
      const response = await fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${db.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "openrouter/free",
            messages: [
              {
                role: "system",
                content:
                  "대화의 연속성을 위해 기억해야 할 핵심 사실과 진행 상황만 짧게 요약하세요.",
              },
              {
                role: "user",
                content: history
                  .slice(-20)
                  .map((item) => `${item.role}: ${item.content}`)
                  .join("\n"),
              },
            ],
            max_tokens: 350,
            temperature: 0.2,
          }),
        }
      );

      const data = await response.json();
      const summary = data?.choices?.[0]?.message?.content;

      if (!summary) return;

      setDB((old) => ({
        ...old,
        characters: old.characters.map((item) =>
          item.id === character.id
            ? {
                ...item,
                summary,
              }
            : item
        ),
      }));

      setDraft((old) => ({
        ...old,
        summary,
      }));
    } catch {
      // 요약 실패가 채팅 자체를 중단시키지 않음
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <button onClick={() => setMenuOpen(true)}>☰</button>
        <strong>VELA</strong>
        <button onClick={() => setScreen("home")}>⌂</button>
      </header>

      {screen === "home" && (
        <Home
          characters={db.characters}
          onCreate={createCharacter}
          onOpen={openCharacter}
        />
      )}

      {screen === "chat" && character && (
        <Chat
          character={character}
          messages={messages}
          input={input}
          setInput={setInput}
          busy={busy}
          send={sendMessage}
        />
      )}

      {screen === "create" && (
        <CharacterEditor
          draft={draft}
          setDraft={setDraft}
          save={saveCharacter}
          back={() => setScreen(character ? "chat" : "home")}
        />
      )}

      {menuOpen && (
        <Drawer
          db={db}
          setDB={setDB}
          close={() => setMenuOpen(false)}
          create={createCharacter}
          edit={editCharacter}
          settings={() => setSettingsOpen(true)}
        />
      )}

      {settingsOpen && (
        <Settings
          draft={draft}
          setDraft={setDraft}
          close={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}

function Home({ characters, onCreate, onOpen }) {
  return (
    <main className="home">
      <div className="hero">
        <small>VELA CHAT</small>
        <h1>
          대화할 캐릭터를
          <br />
          선택하세요.
        </h1>
      </div>

      <button className="primary" onClick={onCreate}>
        + 캐릭터 만들기
      </button>

      <section>
        <div className="section-title">내 캐릭터</div>

        {characters.length === 0 ? (
          <div className="empty">아직 만든 캐릭터가 없습니다.</div>
        ) : (
          <div className="cards">
            {characters.map((item) => (
              <button
                className="character-card"
                key={item.id}
                onClick={() => onOpen(item.id)}
              >
                <strong>{item.name}</strong>
                <small>
                  {item.description || "설정이 없습니다."}
                </small>
              </button>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function Chat({
  character,
  messages,
  input,
  setInput,
  busy,
  send,
}) {
  return (
    <main className="chat">
      <div className="chat-header">
        <strong>{character.name}</strong>
        <small>{character.description}</small>
      </div>

      <div className="messages">
        {messages.length === 0 && (
          <div className="welcome">
            <b>접속 시작</b>
            <small>대화를 입력해보세요.</small>
          </div>
        )}

        {messages.map((message, index) => (
          <div
            key={`${message.role}-${index}`}
            className={`message ${message.role}`}
          >
            {message.content}
          </div>
        ))}

        {busy && (
          <div className="message assistant">
            생각하는 중…
          </div>
        )}
      </div>

      <div className="composer">
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              send();
            }
          }}
          placeholder="메시지 보내기"
        />

        <button disabled={busy} onClick={send}>
          ↑
        </button>
      </div>
    </main>
  );
}

function CharacterEditor({ draft, setDraft, save, back }) {
  function update(key, value) {
    setDraft((old) => ({
      ...old,
      [key]: value,
    }));
  }

  return (
    <main className="page">
      <div className="page-header">
        <button onClick={back}>‹</button>
        <strong>캐릭터 제작</strong>
      </div>

      <label>
        이름
        <input
          value={draft.name}
          onChange={(e) => update("name", e.target.value)}
        />
      </label>

      <label>
        캐릭터 설정
        <textarea
          value={draft.description}
          onChange={(e) => update("description", e.target.value)}
        />
      </label>

      <label>
        유저노트
        <textarea
          value={draft.userNote}
          onChange={(e) => update("userNote", e.target.value)}
        />
        <small>
          {"{user}"}의 설정과 AI에게 전달할 정보를 입력합니다.
        </small>
      </label>

      <label>
        추가 규칙
        <textarea
          value={draft.rules}
          onChange={(e) => update("rules", e.target.value)}
        />
      </label>

      <button className="primary" onClick={save}>
        저장하고 시작
      </button>
    </main>
  );
}

function Settings({ draft, setDraft, close }) {
  function update(key, value) {
    setDraft((old) => ({
      ...old,
      [key]: value,
    }));
  }

  return (
    <div className="overlay">
      <div className="modal">
        <div className="modal-header">
          <strong>채팅 설정</strong>
          <button onClick={close}>×</button>
        </div>

        <label>
          출력 토큰
          <input
            type="number"
            value={draft.maxTokens}
            onChange={(e) => update("maxTokens", e.target.value)}
          />
        </label>

        <label>
          추론량
          <input
            type="number"
            value={draft.reasoning}
            onChange={(e) => update("reasoning", e.target.value)}
          />
        </label>

        <label>
          요약 메모리
          <select
            value={draft.summaryInterval}
            onChange={(e) =>
              update("summaryInterval", e.target.value)
            }
          >
            <option value="10">10턴</option>
            <option value="15">15턴</option>
            <option value="20">20턴</option>
          </select>
        </label>

        <label>
          온도
          <input
            type="number"
            step="0.1"
            value={draft.temperature}
            onChange={(e) => update("temperature", e.target.value)}
          />
        </label>

        {draft.summary && (
          <div className="summary">
            <b>최근 요약</b>
            <p>{draft.summary}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function Drawer({
  db,
  setDB,
  close,
  create,
  edit,
  settings,
}) {
  return (
    <div className="overlay">
      <aside className="drawer">
        <button onClick={close}>×</button>

        <h2>VELA</h2>

        <button onClick={create}>+ 캐릭터 제작</button>

        <button onClick={edit}>캐릭터 설정</button>

        <button onClick={settings}>채팅 설정</button>

        <label>
          OpenRouter API Key
          <input
            type="password"
            value={db.apiKey}
            onChange={(e) =>
              setDB((old) => ({
                ...old,
                apiKey: e.target.value,
              }))
            }
          />
        </label>

        <small>
          OpenRouter 무료 모델도 API 키가 필요합니다.
        </small>
      </aside>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);

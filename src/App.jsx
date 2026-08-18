import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import "./App.css";

const CURRENT_CHAT_KEY = "vikop-current-chat";
const HISTORY_KEY = "vikop-chat-history";

function createChatId() {
  return Date.now().toString() + Math.random().toString(36).slice(2, 8);
}

function getChatTitle(messages) {
  const firstUserMessage = messages.find(
    (message) => message.role === "user" && message.text?.trim()
  );

  if (!firstUserMessage) return "New Chat";

  return firstUserMessage.text.trim().slice(0, 35) || "New Chat";
}

function App() {
  const [messages, setMessages] = useState(() => {
    try {
      const saved = localStorage.getItem(CURRENT_CHAT_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [chatHistory, setChatHistory] = useState(() => {
    try {
      const saved = localStorage.getItem(HISTORY_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [activeChatId, setActiveChatId] = useState(() => {
    try {
      return localStorage.getItem("vikop-active-chat") || null;
    } catch {
      return null;
    }
  });

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [listening, setListening] = useState(false);

  const fileInputRef = useRef(null);
  const userMessageRef = useRef(null);
  const recognitionRef = useRef(null);

  useEffect(() => {
    try {
      const safeMessages = messages.map((message) => ({
        ...message,
        attachments: Array.isArray(message.attachments)
          ? message.attachments.map((file) => ({
              name: file.name,
              mimeType: file.mimeType
            }))
          : []
      }));

      localStorage.setItem(
        CURRENT_CHAT_KEY,
        JSON.stringify(safeMessages)
      );
    } catch (error) {
      console.error("Chat save failed:", error);
    }
  }, [messages]);

  useEffect(() => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(chatHistory));
  }, [chatHistory]);

  useEffect(() => {
    if (activeChatId) {
      localStorage.setItem("vikop-active-chat", activeChatId);
    } else {
      localStorage.removeItem("vikop-active-chat");
    }
  }, [activeChatId]);

  useEffect(() => {
    if (messages.length === 0) return;

    const lastMessage = messages[messages.length - 1];

    if (lastMessage.role === "user") {
      requestAnimationFrame(() => {
        userMessageRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start"
        });
      });
    }
  }, [messages]);

  function saveCurrentChat(nextMessages) {
    if (nextMessages.length === 0) return;

    const id = activeChatId || createChatId();
    const title = getChatTitle(nextMessages);

    const safeMessages = nextMessages.map((message) => ({
      ...message,
      attachments: Array.isArray(message.attachments)
        ? message.attachments.map((file) => ({
            name: file.name,
            mimeType: file.mimeType
          }))
        : []
    }));

    setActiveChatId(id);

    setChatHistory((prev) => {
      const existing = prev.find((chat) => chat.id === id);

      if (existing) {
        return prev.map((chat) =>
          chat.id === id
            ? {
                ...chat,
                title,
                messages: safeMessages,
                updatedAt: Date.now()
              }
            : chat
        );
      }

      return [
        {
          id,
          title,
          messages: safeMessages,
          updatedAt: Date.now()
        },
        ...prev
      ];
    });
  }

  useEffect(() => {
    if (messages.length > 0) {
      saveCurrentChat(messages);
    }
  }, [messages]);

  function newChat() {
    if (messages.length > 0) {
      saveCurrentChat(messages);
    }

    setMessages([]);
    setSelectedFiles([]);
    setInput("");
    setActiveChatId(null);
    setShowHistory(false);
  }

  function openChat(chat) {
    setMessages(chat.messages || []);
    setActiveChatId(chat.id);
    setSelectedFiles([]);
    setInput("");
    setShowHistory(false);
  }

  function deleteChat(chatId) {
    setChatHistory((prev) => prev.filter((chat) => chat.id !== chatId));

    if (chatId === activeChatId) {
      setMessages([]);
      setSelectedFiles([]);
      setInput("");
      setActiveChatId(null);
      localStorage.removeItem(CURRENT_CHAT_KEY);
    }
  }

  async function handleFileSelect(event) {
    const files = Array.from(event.target.files || []);

    if (files.length === 0) {
      event.target.value = "";
      return;
    }

    const validFiles = files.filter((file) => {
      const name = (file.name || "").toLowerCase();
      const type = (file.type || "").toLowerCase();

      const isImage =
        type.startsWith("image/") ||
        /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(name);

      const isPDF =
        name.endsWith(".pdf") || type === "application/pdf";

      const isText =
        name.endsWith(".txt") ||
        name.endsWith(".json") ||
        name.endsWith(".csv") ||
        type.startsWith("text/") ||
        type === "application/json";

      return isImage || isPDF || isText;
    });

    if (validFiles.length !== files.length) {
      alert("Only images, PDF, text, JSON and CSV files are supported.");
    }

    try {
      const fileData = await Promise.all(
        validFiles.map(async (file) => {
          const name = (file.name || "").toLowerCase();
          const type = (file.type || "").toLowerCase();

          const isImage =
            type.startsWith("image/") ||
            /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(name);

          const isPDF =
            name.endsWith(".pdf") || type === "application/pdf";

          if (isImage) {
            if (file.size > 50 * 1024 * 1024) {
              throw new Error("Image 50 MB se badi hai.");
            }

            return await new Promise((resolve, reject) => {
              const reader = new FileReader();

              reader.onload = () => {
                const img = new Image();

                img.onload = () => {
                  const MAX_SIZE = 1600;

                  let width = img.naturalWidth || img.width;
                  let height = img.naturalHeight || img.height;

                  if (!width || !height) {
                    reject(new Error("Invalid image dimensions"));
                    return;
                  }

                  const scale = Math.min(
                    1,
                    MAX_SIZE / Math.max(width, height)
                  );

                  width = Math.max(1, Math.round(width * scale));
                  height = Math.max(1, Math.round(height * scale));

                  const canvas = document.createElement("canvas");
                  canvas.width = width;
                  canvas.height = height;

                  const ctx = canvas.getContext("2d");

                  if (!ctx) {
                    reject(new Error("Canvas unavailable"));
                    return;
                  }

                  ctx.drawImage(img, 0, 0, width, height);

                  canvas.toBlob(
                    (blob) => {
                      if (!blob) {
                        reject(new Error("Image compression failed"));
                        return;
                      }

                      const blobReader = new FileReader();

                      blobReader.onload = () => {
                        const result = String(blobReader.result || "");
                        const base64 = result.includes(",")
                          ? result.split(",")[1]
                          : result;

                        resolve({
                          name: file.name,
                          mimeType: "image/jpeg",
                          data: base64
                        });
                      };

                      blobReader.onerror = () =>
                        reject(new Error("Compressed image read failed."));

                      blobReader.readAsDataURL(blob);
                    },
                    "image/jpeg",
                    0.82
                  );
                };

                img.onerror = () =>
                  reject(new Error("Invalid image file."));

                img.src = String(reader.result || "");
              };

              reader.onerror = () =>
                reject(new Error("Image file read failed."));

              reader.readAsDataURL(file);
            });
          }

          if (isPDF) {
            if (file.size > 20 * 1024 * 1024) {
              throw new Error("PDF 20 MB se badi hai.");
            }

            return await new Promise((resolve, reject) => {
              const reader = new FileReader();

              reader.onload = () => {
                try {
                  const result = String(reader.result || "");

                  if (!result) {
                    reject(new Error("PDF read nahi ho payi."));
                    return;
                  }

                  const base64 = result.includes(",")
                    ? result.split(",")[1]
                    : result;

                  resolve({
                    name: file.name,
                    mimeType: "application/pdf",
                    data: base64
                  });
                } catch (error) {
                  reject(error);
                }
              };

              reader.onerror = () =>
                reject(new Error("PDF file read failed."));

              reader.readAsDataURL(file);
            });
          }

          if (file.size > 5 * 1024 * 1024) {
            throw new Error("Text file 5 MB se badi hai.");
          }

          return await new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = () => {
              const result = String(reader.result || "");
              const base64 = result.includes(",")
                ? result.split(",")[1]
                : result;

              resolve({
                name: file.name,
                mimeType: file.type || "text/plain",
                data: base64
              });
            };

            reader.onerror = () =>
              reject(new Error("Text file read failed."));

            reader.readAsDataURL(file);
          });
        })
      );

      setSelectedFiles((prev) => [...prev, ...fileData]);
    } catch (error) {
      console.error("File processing error:", error);
      alert(error?.message || "File process nahi ho payi.");
    }

    event.target.value = "";
  }

  async function requestAI(
    userMessage,
    historyForRequest,
    attachmentsForRequest,
    messagesToDisplay
  ) {
    setLoading(true);

    const displayMessages = [
      ...messagesToDisplay,
      {
        role: "assistant",
        text: ""
      }
    ];

    setMessages(displayMessages);

    try {
      const response = await fetch("/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          message: userMessage,
          history: historyForRequest,
          attachments: attachmentsForRequest
        })
      });

      if (!response.ok) {
        throw new Error("AI server error");
      }

      if (!response.body) {
        throw new Error("Streaming response unavailable");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      let assistantText = "";
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const events = buffer.split("\n\n");
        buffer = events.pop() || "";

        for (const event of events) {
          const dataLine = event
            .split("\n")
            .find((line) => line.startsWith("data: "));

          if (!dataLine) continue;

          const data = JSON.parse(dataLine.slice(6));

          if (data.error) {
            throw new Error(data.error);
          }

          if (data.text) {
            assistantText += data.text;

            setMessages((prev) => {
              const updated = [...prev];

              const lastIndex = updated.length - 1;

              if (
                lastIndex >= 0 &&
                updated[lastIndex].role === "assistant"
              ) {
                updated[lastIndex] = {
                  ...updated[lastIndex],
                  text: assistantText
                };
              }

              return updated;
            });
          }

          if (data.done) {
            break;
          }
        }
      }

      buffer += decoder.decode();

      if (buffer.trim()) {
        const dataLine = buffer
          .split("\n")
          .find((line) => line.startsWith("data: "));

        if (dataLine) {
          const data = JSON.parse(dataLine.slice(6));

          if (data.error) {
            throw new Error(data.error);
          }

          if (data.text) {
            assistantText += data.text;

            setMessages((prev) => {
              const updated = [...prev];
              const lastIndex = updated.length - 1;

              if (
                lastIndex >= 0 &&
                updated[lastIndex].role === "assistant"
              ) {
                updated[lastIndex] = {
                  ...updated[lastIndex],
                  text: assistantText
                };
              }

              return updated;
            });
          }
        }
      }
    } catch (error) {
      console.error(error);

      setMessages((prev) => {
        const updated = [...prev];

        if (
          updated.length > 0 &&
          updated[updated.length - 1].role === "assistant"
        ) {
          updated[updated.length - 1] = {
            role: "assistant",
            text: "Sorry, AI se connection nahi ho paya."
          };
          return updated;
        }

        return [
          ...updated,
          {
            role: "assistant",
            text: "Sorry, AI se connection nahi ho paya."
          }
        ];
      });
    } finally {
      setLoading(false);
    }
  }

  async function sendMessage() {
    if ((!input.trim() && selectedFiles.length === 0) || loading) {
      return;
    }

    const userMessage = input.trim();
    const attachments = [...selectedFiles];

    const updatedMessages = [
      ...messages,
      {
        role: "user",
        text: userMessage,
        attachments
      }
    ];

    setMessages(updatedMessages);
    setInput("");
    setSelectedFiles([]);

    await requestAI(
      userMessage,
      updatedMessages,
      attachments,
      updatedMessages
    );
  }

  async function regenerateAnswer() {
    if (loading || messages.length < 2) return;

    const lastMessage = messages[messages.length - 1];

    if (lastMessage.role !== "assistant") return;

    const userIndex = messages.length - 2;
    const userMessage = messages[userIndex];

    if (!userMessage || userMessage.role !== "user") return;

    const baseMessages = messages.slice(0, -1);
    const attachments = userMessage.attachments || [];

    await requestAI(
      userMessage.text || "",
      baseMessages,
      attachments,
      baseMessages
    );
  }

  async function copyAnswer(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    console.error("Copy failed:", error);
    return false;
  }
}

  function startVoiceInput() {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert("Voice input is not supported in this browser.");
      return;
    }

    if (listening && recognitionRef.current) {
      recognitionRef.current.stop();
      return;
    }

    const recognition = new SpeechRecognition();

    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => {
      setListening(true);
    };

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript || "";

      setInput((prev) =>
        prev.trim() ? `${prev} ${transcript}` : transcript
      );
    };

    recognition.onerror = (event) => {
      console.error("Voice input error:", event.error);
      setListening(false);
    };

    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    recognition.start();
  }

  return (
    <div className="app">
      <header className="header">
        <div className="header-top">
          <div className="brand">
            <div className="brand-icon">🐟</div>

            <div>
              <h1>VikoP</h1>
              <p>VikoAI</p>
            </div>
          </div>

          <div className="header-actions">
            <button
              className="header-button"
              onClick={() => setShowHistory((prev) => !prev)}
            >
              🗂️ History
            </button>

            <button className="header-button" onClick={newChat}>
              🆕 New Chat
            </button>
          </div>
        </div>
      </header>

      {showHistory && (
        <aside className="history-panel">
          <div className="history-header">
            <h3>Chat History</h3>

            <button
              className="history-close"
              onClick={() => setShowHistory(false)}
            >
              ✕
            </button>
          </div>

          {chatHistory.length === 0 ? (
            <p className="history-empty">No chats yet.</p>
          ) : (
            <div className="history-list">
              {chatHistory
                .slice()
                .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
                .map((chat) => (
                  <div
                    key={chat.id}
                    className={`history-item ${
                      chat.id === activeChatId ? "active" : ""
                    }`}
                  >
                    <button
                      className="history-open"
                      onClick={() => openChat(chat)}
                    >
                      <strong>{chat.title}</strong>
                      <span>
                        {chat.messages?.length || 0} messages
                      </span>
                    </button>

                    <button
                      className="history-delete"
                      onClick={() => deleteChat(chat.id)}
                      title="Delete chat"
                    >
                      🗑️
                    </button>
                  </div>
                ))}
            </div>
          )}
        </aside>
      )}

      <main className="chat">
        {messages.length === 0 ? (
          <div className="welcome">
            <div className="robot">🤖</div>
            <h2>How can I help you?</h2>
            <p>Ask me anything...</p>
          </div>
        ) : (
          messages.map((message, index) => (
            <div
              key={index}
              ref={
                message.role === "user" &&
                index === messages.length - 1
                  ? userMessageRef
                  : null
              }
              className={`message ${message.role}`}
            >
              {message.role === "assistant" ? (
                <>
                 <ReactMarkdown
  remarkPlugins={[remarkMath]}
  rehypePlugins={[rehypeKatex]}
>
  {message.text}
</ReactMarkdown>

                  {message.text &&
                    index === messages.length - 1 && (
                      <div className="answer-actions">
<button
  className="copy-button"
  onClick={async (e) => {
    const success = await copyAnswer(message.text);

    if (success) {
      e.currentTarget.textContent = "✓ Copied";
      setTimeout(() => {
        e.currentTarget.textContent = "📋 Copy";
      }, 2000);
    }
  }}
>
  📋 Copy
</button>

                        <button
                          className="regenerate-button"
                          onClick={regenerateAnswer}
                          disabled={loading}
                        >
                          🔄 Regenerate
                        </button>
                      </div>
                    )}
                </>
              ) : (
                <>
                  {message.attachments?.length > 0 && (
                    <div className="attachments">
                      {message.attachments.map((file, fileIndex) =>
                        file.mimeType?.startsWith("image/") ? (
                          <img
                            key={fileIndex}
                            src={`data:${file.mimeType};base64,${file.data}`}
                            alt={file.name || "Uploaded image"}
                            className="uploaded-image"
                          />
                        ) : (
                          <div
                            key={fileIndex}
                            className="attachment-file"
                          >
                            📄 {file.name}
                          </div>
                        )
                      )}
                    </div>
                  )}

                  {message.text && <div>{message.text}</div>}
                </>
              )}
            </div>
          ))
        )}

        {loading && (
          <div className="message assistant">
            Thinking... 🤔
          </div>
        )}
      </main>

      <div className="input-area">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="*/*"
          onChange={handleFileSelect}
          style={{ display: "none" }}
        />

        <button
          type="button"
          className="tool-button"
          onClick={() => fileInputRef.current?.click()}
          disabled={loading}
          title="Attach files"
        >
          📎
        </button>

        <div className="input-column">
          {selectedFiles.length > 0 && (
            <div className="selected-files">
              {selectedFiles.map((file, index) => (
                <div key={index} className="selected-file">
                  📄 {file.name}
                </div>
              ))}
            </div>
          )}

          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                sendMessage();
              }
            }}
            placeholder={
              listening ? "Listening..." : "Ask anything..."
            }
          />
        </div>

        <button
          type="button"
          className={`voice-button ${listening ? "listening" : ""}`}
          onClick={startVoiceInput}
          disabled={loading}
          title="Voice input"
        >
          🎤
        </button>

        <button
          type="button"
          className="send-button"
          onClick={sendMessage}
          disabled={loading}
          title="Send"
        >
          ➤
        </button>
      </div>
    </div>
  );
}

export default App;

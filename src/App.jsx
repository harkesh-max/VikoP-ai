import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import "./App.css";

const CURRENT_CHAT_KEY = "vikop-current-chat";
const BUSINESS_CHAT_KEY = "vikop-business-chat";
const CHAT_HISTORY_KEY = "vikop-chat-history";
const BUSINESS_HISTORY_KEY = "vikop-business-history";

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
  const [chatMessages, setChatMessages] = useState(() => {
    try {
      const saved = localStorage.getItem(CURRENT_CHAT_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [businessMessages, setBusinessMessages] = useState(() => {
    try {
      const saved = localStorage.getItem(BUSINESS_CHAT_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [listening, setListening] = useState(false);
  const [appMode, setAppMode] = useState("chat");
  const [showHistory, setShowHistory] = useState(false);

  const [businessKnowledge, setBusinessKnowledge] = useState(() => {
    try {
      return localStorage.getItem("vikop-business-knowledge") || "";
    } catch {
      return "";
    }
  });

  const [industryMode, setIndustryMode] = useState(() => {
    try {
      return localStorage.getItem("vikop-industry-mode") || "general";
    } catch {
      return "general";
    }
  });

  const [businessLeads, setBusinessLeads] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("vikop-business-leads") || "[]");
    } catch {
      return [];
    }
  });

  const [chatHistory, setChatHistory] = useState(() => {
    try {
      const saved = localStorage.getItem(CHAT_HISTORY_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [businessHistory, setBusinessHistory] = useState(() => {
    try {
      const saved = localStorage.getItem(BUSINESS_HISTORY_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [activeChatId, setActiveChatId] = useState(null);
  const [activeBusinessChatId, setActiveBusinessChatId] = useState(null);

  const messages =
    appMode === "business" ? businessMessages : chatMessages;

  function setMessages(updater) {
    if (appMode === "business") {
      setBusinessMessages(updater);
    } else {
      setChatMessages(updater);
    }
  }

  const fileInputRef = useRef(null);
  const userMessageRef = useRef(null);
  const recognitionRef = useRef(null);

  useEffect(() => {
    try {
      localStorage.setItem(
        CURRENT_CHAT_KEY,
        JSON.stringify(chatMessages)
      );
    } catch (error) {
      console.error("Chat save failed:", error);
    }
  }, [chatMessages]);

  useEffect(() => {
    try {
      localStorage.setItem(
        BUSINESS_CHAT_KEY,
        JSON.stringify(businessMessages)
      );
    } catch (error) {
      console.error("Business chat save failed:", error);
    }
  }, [businessMessages]);

  useEffect(() => {
    localStorage.setItem("vikop-business-knowledge", businessKnowledge);
  }, [businessKnowledge]);

  useEffect(() => {
    localStorage.setItem("vikop-industry-mode", industryMode);
  }, [industryMode]);

  useEffect(() => {
    localStorage.setItem("vikop-business-leads", JSON.stringify(businessLeads));
  }, [businessLeads]);

  useEffect(() => {
    localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(chatHistory));
  }, [chatHistory]);

  useEffect(() => {
    localStorage.setItem(
      BUSINESS_HISTORY_KEY,
      JSON.stringify(businessHistory)
    );
  }, [businessHistory]);

  useEffect(() => {
    if (messages.length === 0) return;

    const safeMessages = messages.map((message) => ({
      ...message,
      attachments: Array.isArray(message.attachments)
        ? message.attachments.map((file) => ({
            name: file.name,
            mimeType: file.mimeType
          }))
        : []
    }));

    const id =
      appMode === "business"
        ? activeBusinessChatId || createChatId()
        : activeChatId || createChatId();

    const title = getChatTitle(safeMessages);
    const updatedChat = {
      id,
      title,
      messages: safeMessages,
      updatedAt: Date.now()
    };

    if (appMode === "business") {
      if (!activeBusinessChatId) setActiveBusinessChatId(id);

      setBusinessHistory((prev) => {
        const exists = prev.some((chat) => chat.id === id);
        return exists
          ? prev.map((chat) => (chat.id === id ? updatedChat : chat))
          : [updatedChat, ...prev];
      });
    } else {
      if (!activeChatId) setActiveChatId(id);

      setChatHistory((prev) => {
        const exists = prev.some((chat) => chat.id === id);
        return exists
          ? prev.map((chat) => (chat.id === id ? updatedChat : chat))
          : [updatedChat, ...prev];
      });
    }
  }, [messages, appMode, activeChatId, activeBusinessChatId]);

  function newChat() {
    setMessages([]);
    setSelectedFiles([]);
    setInput("");
    setShowHistory(false);

    if (appMode === "business") {
      setActiveBusinessChatId(null);
    } else {
      setActiveChatId(null);
    }
  }

  function switchMode(mode) {
    setAppMode(mode);
    setSelectedFiles([]);
    setInput("");
    setShowHistory(false);
  }

  function openChat(chat) {
    setMessages(chat.messages || []);
    setSelectedFiles([]);
    setInput("");
    setShowHistory(false);

    if (appMode === "business") {
      setActiveBusinessChatId(chat.id);
    } else {
      setActiveChatId(chat.id);
    }
  }

  function deleteChat(chatId) {
    if (appMode === "business") {
      setBusinessHistory((prev) =>
        prev.filter((chat) => chat.id !== chatId)
      );

      if (chatId === activeBusinessChatId) {
        setBusinessMessages([]);
        setActiveBusinessChatId(null);
      }
    } else {
      setChatHistory((prev) =>
        prev.filter((chat) => chat.id !== chatId)
      );

      if (chatId === activeChatId) {
        setChatMessages([]);
        setActiveChatId(null);
      }
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

  function removeSelectedFile(index) {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
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

    const modeInstruction =
      appMode === "business"
        ? `BUSINESS ASSISTANT MODE:
Act as a professional AI business assistant for entrepreneurs and business owners.
Help with business strategy, marketing, sales, customer support, emails, proposals, pricing, market research, productivity and business decisions.
Give practical, actionable answers.
When useful, structure answers with clear steps, tables, checklists or templates.
For international users, use clear professional English when the user writes in English.
Do not pretend to be a lawyer, accountant or financial adviser; clearly mention when professional advice is needed.` 
        : "";

    const aiMessage = modeInstruction
      ? `${modeInstruction}

USER REQUEST:
${userMessage}`
      : userMessage;

    await requestAI(
      aiMessage,
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
              <h1>VikoP <span className="brand-ai">AI</span></h1>
            </div>
          </div>

          <div className="header-actions">
            <button
              className={`header-button ${appMode === "chat" ? "mode-active" : ""}`}
              onClick={() => switchMode("chat")}
            >
              💬 AI Chat
            </button>

            <button
              className={`header-button ${appMode === "business" ? "mode-active" : ""}`}
              onClick={() => switchMode("business")}
            >
              💼 Business
            </button>

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
            <h3>
              {appMode === "business"
                ? "Business History"
                : "AI Chat History"}
            </h3>

            <button
              className="history-close"
              onClick={() => setShowHistory(false)}
            >
              ✕
            </button>
          </div>

          {(appMode === "business"
            ? businessHistory
            : chatHistory
          ).length === 0 ? (
            <p className="history-empty">No chats yet.</p>
          ) : (
            <div className="history-list">
              {(appMode === "business"
                ? businessHistory
                : chatHistory
              )
                .slice()
                .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
                .map((chat) => (
                  <div
                    key={chat.id}
                    className="history-item"
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

      {appMode === "business" && (
        <section style={{
          margin: "12px auto",
          maxWidth: "900px",
          width: "calc(100% - 24px)",
          padding: "14px",
          borderRadius: "14px",
          background: "rgba(255,255,255,0.05)"
        }}>
          <div style={{display:"flex", gap:"10px", flexWrap:"wrap"}}>
            <select
              value={industryMode}
              onChange={(e) => setIndustryMode(e.target.value)}
              style={{padding:"9px", borderRadius:"8px"}}
            >
              <option value="general">General Business</option>
              <option value="real estate">Real Estate</option>
              <option value="gym and fitness">Gym & Fitness</option>
              <option value="restaurant">Restaurant</option>
              <option value="dental clinic">Dental Clinic</option>
              <option value="salon and beauty">Salon & Beauty</option>
              <option value="hotel">Hotel</option>
              <option value="car dealership">Car Dealership</option>
            </select>
          </div>

          <textarea
            value={businessKnowledge}
            onChange={(e) => setBusinessKnowledge(e.target.value)}
            placeholder="Business Knowledge Base — company name, services, prices, opening hours, FAQs, policies, etc."
            rows={5}
            style={{
              width:"100%",
              marginTop:"10px",
              padding:"10px",
              borderRadius:"10px",
              boxSizing:"border-box"
            }}
          />

          <small>
            VikoP will use this information when answering business questions.
          </small>
        </section>
      )}

      <main className="chat">
        {messages.length === 0 ? (
          <div className="welcome">
            {appMode === "business" ? (
              <>
                <div className="robot">💼</div>
                <h2>VikoP Business Assistant</h2>
                <p>Your AI partner for smarter business decisions.</p>
              </>
            ) : (
              <>
                <div className="robot">🤖</div>
                <h2>How can I help you?</h2>
                <p>Ask me anything...</p>
              </>
            )}
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

      {appMode === "business" && (
        <div style={{
          margin: "10px auto",
          maxWidth: "900px",
          width: "calc(100% - 24px)",
          padding: "14px",
          borderRadius: "14px",
          background: "rgba(255,255,255,0.05)"
        }}>
          <h3 style={{marginTop:0}}>👥 Lead Workspace</h3>

          <div style={{
            display:"grid",
            gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",
            gap:"8px"
          }}>
            <input id="lead-name" placeholder="Lead name" />
            <input id="lead-contact" placeholder="Email / phone" />
            <select id="lead-status">
              <option value="new">New</option>
              <option value="warm">Warm</option>
              <option value="hot">Hot</option>
              <option value="cold">Cold</option>
            </select>
            <button onClick={() => {
              const name = document.getElementById("lead-name")?.value.trim();
              const contact = document.getElementById("lead-contact")?.value.trim();
              const status = document.getElementById("lead-status")?.value || "new";

              if (!name) {
                alert("Lead name enter karo.");
                return;
              }

              setBusinessLeads(prev => [
                {
                  id: Date.now().toString(),
                  name,
                  contact,
                  status,
                  createdAt: Date.now()
                },
                ...prev
              ]);

              document.getElementById("lead-name").value = "";
              document.getElementById("lead-contact").value = "";
            }}>
              ➕ Add Lead
            </button>
          </div>

          {businessLeads.length > 0 && (
            <div style={{marginTop:"12px"}}>
              {businessLeads.map((lead) => (
                <div
                  key={lead.id}
                  style={{
                    display:"flex",
                    justifyContent:"space-between",
                    alignItems:"center",
                    gap:"10px",
                    padding:"9px",
                    marginTop:"6px",
                    borderRadius:"8px",
                    background:"rgba(255,255,255,0.04)"
                  }}
                >
                  <div>
                    <strong>{lead.name}</strong>
                    <div>{lead.contact || "No contact"}</div>
                    <small>Status: {lead.status}</small>
                  </div>

                  <button
                    onClick={() =>
                      setBusinessLeads(prev =>
                        prev.filter(item => item.id !== lead.id)
                      )
                    }
                  >
                    🗑️
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {appMode === "business" && (
        <div className="business-tools business-tools-persistent">
          {industryMode === "real estate" ? (
            <>
              <button onClick={() => setInput("Create a professional property listing description for this property")}>
                🏠 Property Listing
              </button>
              <button onClick={() => setInput("Write a professional follow-up message for a real estate lead")}>
                📩 Buyer Follow-up
              </button>
              <button onClick={() => setInput("Create a real estate marketing campaign to generate more leads")}>
                📣 Lead Campaign
              </button>
              <button onClick={() => setInput("Analyze this property information and give me useful sales insights")}>
                📊 Property Analysis
              </button>
            </>
          ) : industryMode === "gym and fitness" ? (
            <>
              <button onClick={() => setInput("Create a gym membership promotion that attracts new customers")}>
                🏋️ Membership Promo
              </button>
              <button onClick={() => setInput("Write a professional follow-up message for a gym lead")}>
                📩 Lead Follow-up
              </button>
              <button onClick={() => setInput("Create a 30-day marketing plan for my gym")}>
                📣 Gym Marketing
              </button>
              <button onClick={() => setInput("Create customer retention ideas for my gym")}>
                ❤️ Retention Ideas
              </button>
            </>
          ) : industryMode === "restaurant" ? (
            <>
              <button onClick={() => setInput("Create an attractive promotion for my restaurant")}>
                🍔 Restaurant Promo
              </button>
              <button onClick={() => setInput("Write a professional response to this customer review")}>
                ⭐ Review Reply
              </button>
              <button onClick={() => setInput("Create social media content ideas for my restaurant")}>
                📱 Social Content
              </button>
              <button onClick={() => setInput("Improve these menu item descriptions to make them more appealing")}>
                🍽️ Menu Content
              </button>
            </>
          ) : industryMode === "dental clinic" ? (
            <>
              <button onClick={() => setInput("Create a professional patient FAQ for my dental clinic")}>
                🦷 Patient FAQ
              </button>
              <button onClick={() => setInput("Write a professional appointment follow-up message")}>
                📅 Appointment Follow-up
              </button>
              <button onClick={() => setInput("Create a marketing campaign for my dental clinic")}>
                📣 Clinic Marketing
              </button>
              <button onClick={() => setInput("Create ideas to improve patient retention")}>
                ❤️ Patient Retention
              </button>
            </>
          ) : industryMode === "salon and beauty" ? (
            <>
              <button onClick={() => setInput("Create a promotion for my salon or beauty business")}>
                💇 Service Promo
              </button>
              <button onClick={() => setInput("Write a professional customer follow-up message")}>
                📩 Customer Follow-up
              </button>
              <button onClick={() => setInput("Create social media content ideas for my salon")}>
                📱 Social Content
              </button>
              <button onClick={() => setInput("Create a customer retention strategy for my salon")}>
                ❤️ Retention Strategy
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setInput("Create a marketing plan for my business")}>
                📣 Marketing Plan
              </button>
              <button onClick={() => setInput("Help me create a sales strategy")}>
                📈 Sales Strategy
              </button>
              <button onClick={() => setInput("Write a professional business email")}>
                ✉️ Business Email
              </button>
              <button onClick={() => setInput("Analyze my business idea and suggest improvements")}>
                💡 Business Idea
              </button>
            </>
          )}
        </div>
      )}

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
                  <span>
                    {file.mimeType?.startsWith("image/")
                      ? "🖼️"
                      : "📄"}{" "}
                    {file.name}
                  </span>

                  <button
                    type="button"
                    onClick={() => removeSelectedFile(index)}
                    className="remove-file-button"
                    title="Remove file"
                  >
                    ×
                  </button>
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

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import "./App.css";
import BusinessDashboard from "./BusinessDashboard.jsx";
import Reminders from "./Reminders.jsx";
import AuthPanel from "./AuthPanel.jsx";

const CURRENT_CHAT_KEY = "vikop-current-chat";
const BUSINESS_CHAT_KEY = "vikop-business-chat";
const CHAT_HISTORY_KEY = "vikop-chat-history";
const BUSINESS_HISTORY_KEY = "vikop-business-history";

function getAccountId(user) {
  const id = user?.id ?? user?.userId ?? user?.email ?? null;
  if (id === null || id === undefined) return null;
  return String(id).trim().toLowerCase();
}

function getAccountStorageKey(baseKey, user) {
  const accountId = getAccountId(user);
  return accountId ? `${baseKey}:${accountId}` : null;
}

function readStoredJson(key, fallback = []) {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : fallback;
  } catch {
    return fallback;
  }
}

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
const [authToken, setAuthToken] = useState(() => {
  try {
    return localStorage.getItem("vikop-auth-token") || "";
  } catch {
    return "";
  }
});

const [authUser, setAuthUser] = useState(() => {
  try {
    const savedUser = localStorage.getItem("vikop-auth-user");
    return savedUser ? JSON.parse(savedUser) : null;
  } catch {
    return null;
  }
});

const [businessWorkspaceTab, setBusinessWorkspaceTab] = useState("");

// Reminder due-time monitor: runs across authenticated workspace pages.
useEffect(() => {
  if (!authToken) return;

  const accountKey = String(
    authUser?.id || authUser?.userId || authUser?.email || "account"
  ).trim().toLowerCase();

  const storageKey = `vikop-reminder-alerts:${accountKey}`;
  let stopped = false;

  async function checkDueReminders() {
    try {
      const response = await fetch("/api/reminders", {
        headers: { Authorization: `Bearer ${authToken}` }
      });

      if (!response.ok) return;

      const data = await response.json();
      const now = Date.now();
      const reminders = (data.reminders || []).filter(item =>
        item.status === "pending" &&
        item.due_at &&
        new Date(item.due_at).getTime() <= now
      );

      let alerted = {};
      try {
        alerted = JSON.parse(localStorage.getItem(storageKey) || "{}");
      } catch {
        alerted = {};
      }

      const fresh = reminders.filter(item => {
        const key = `${item.id}:${item.due_at}`;
        return !alerted[key];
      });

      if (!fresh.length || stopped) return;

      for (const item of fresh) {
        alerted[`${item.id}:${item.due_at}`] = now;
      }

      // Save before displaying to prevent duplicate alerts.
      try {
        const entries = Object.entries(alerted)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 300);
        localStorage.setItem(storageKey, JSON.stringify(Object.fromEntries(entries)));
      } catch (error) {
        console.warn("Reminder alert storage unavailable:", error);
      }

      if ("Notification" in window && Notification.permission === "granted") {
        for (const item of fresh) {
          try {
            new Notification("VikoP AI — Reminder due", {
              body: item.title,
              tag: `vikop-reminder-${item.id}`
            });
          } catch (error) {
            console.warn("Reminder notification failed:", error);
          }
        }
      } else if (document.visibilityState === "visible") {
        window.alert(
          "🔔 VikoP AI — Reminder due:\n" +
          fresh.map(item => `• ${item.title}`).join("\n")
        );
      }
    } catch (error) {
      console.warn("Reminder due check failed:", error);
    }
  }

  checkDueReminders();
  const timer = window.setInterval(checkDueReminders, 30000);

  return () => {
    stopped = true;
    window.clearInterval(timer);
  };
}, [authToken, authUser]);


function handleLogin(token, user = null) {
  setAuthToken(token);

  if (user) {
    setAuthUser(user);

    try {
      localStorage.setItem(
        "vikop-auth-user",
        JSON.stringify(user)
      );
    } catch (error) {
      console.error("Failed to save auth user:", error);
    }
  }
}

function handleBusinessSwitch(token, user) {
  handleLogin(token, user);
  try {
    localStorage.setItem("vikop-auth-token", token);
  } catch (error) {
    console.error("Failed to save business session:", error);
  }
}

function logoutBusiness() {
  localStorage.removeItem("vikop-auth-token");
  localStorage.removeItem("vikop-auth-user");

  setAuthToken("");
  setAuthUser(null);
  setBusinessWorkspaceTab("");
}


  const [chatMessages, setChatMessages] = useState([]);
  const [businessMessages, setBusinessMessages] = useState([]);

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [pendingSend, setPendingSend] = useState(false);
  const [listening, setListening] = useState(false);
  const [appMode, setAppMode] = useState("chat");
  const [showHistory, setShowHistory] = useState(false);
  const [showBusinessCRM, setShowBusinessCRM] = useState(false);

  const [businessKnowledge, setBusinessKnowledge] = useState("");
  const [industryMode, setIndustryMode] = useState("general");

  const [businessLeads, setBusinessLeads] = useState([]);
  const [businessLeadsLoading, setBusinessLeadsLoading] = useState(false);
  const [leadSearch, setLeadSearch] = useState("");
  const [leadFilter, setLeadFilter] = useState("all");
  const [leadCanAssign, setLeadCanAssign] = useState(false);
  const [leadTeamMembers, setLeadTeamMembers] = useState([]);
  const [leadEditingId, setLeadEditingId] = useState(null);
  const [leadEditForm, setLeadEditForm] = useState({ name: "", contact: "", status: "new" });
  const [leadSaving, setLeadSaving] = useState(false);

  const [chatHistory, setChatHistory] = useState([]);
  const [businessHistory, setBusinessHistory] = useState([]);

  const accountStorageReadyRef = useRef(false);
  const accountStorageIdRef = useRef(null);

  const [activeChatId, setActiveChatId] = useState(null);
  const [activeBusinessChatId, setActiveBusinessChatId] = useState(null);


  async function loadBusinessLeads() {
    if (!authToken) {
      setBusinessLeads([]);
      return;
    }

    setBusinessLeadsLoading(true);

    try {
      const response = await fetch("/api/business/leads", {
        headers: {
          Authorization: `Bearer ${authToken}`
        }
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || "Failed to load leads.");
      }

      setBusinessLeads(Array.isArray(data.leads) ? data.leads : []);

      const canAssign = data.canAssign === true;
      setLeadCanAssign(canAssign);

      if (canAssign) {
        try {
          const teamResponse = await fetch("/api/reminders/team", {
            headers: { Authorization: `Bearer ${authToken}` }
          });
          const teamData = await teamResponse.json().catch(() => ({}));
          if (!teamResponse.ok) throw new Error(teamData.error || "Could not load employees.");
          setLeadTeamMembers(
            (Array.isArray(teamData.members) ? teamData.members : [])
              .filter((member) => member.role === "sales")
          );
        } catch (teamError) {
          console.error("Lead team load failed:", teamError);
          setLeadTeamMembers([]);
        }
      } else {
        setLeadTeamMembers([]);
      }
    } catch (error) {
      console.error("Lead load failed:", error);
      setBusinessLeads([]);
    } finally {
      setBusinessLeadsLoading(false);
    }
  }

  async function addBusinessLead(name, contact, status) {
    const cleanName = (name || "").trim();
    const cleanContact = (contact || "").trim();
    const cleanStatus = (status || "new").trim().toLowerCase();

    if (!cleanName) {
      alert("🚀 " + p1.replace(" Active", " is fully operational & active!"));
      return false;
    }

    try {
      const response = await fetch("/api/business/leads", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`
        },
        body: JSON.stringify({
          name: cleanName,
          contact: cleanContact,
          status: cleanStatus
        })
      });

      const data = await response.json().catch(() => ({}));

      if (response.status === 409) {
        alert("🚀 " + p1.replace(" Active", " is fully operational & active!"));
        return false;
      }

      if (!response.ok) {
        throw new Error(data.error || "Failed to save lead.");
      }

      if (data.lead) {
        setBusinessLeads((prev) => [data.lead, ...prev]);
      }

      return true;
    } catch (error) {
      console.error("Lead add failed:", error);
      alert(error.message || "Failed to save lead.");
      return false;
    }
  }

  async function updateBusinessLead(id, values) {
    setLeadSaving(true);
    try {
      const response = await fetch(`/api/business/leads/${encodeURIComponent(id)}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`
        },
        body: JSON.stringify({
          name: values.name,
          contact: values.contact,
          status: values.status,
          notes: values.notes || ""
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Failed to update lead.");
      if (data.lead) {
        setBusinessLeads((prev) => prev.map((lead) =>
          lead.id === id ? { ...lead, ...data.lead } : lead
        ));
      }
      setLeadEditingId(null);
      return true;
    } catch (error) {
      alert(error.message || "Failed to update lead.");
      return false;
    } finally {
      setLeadSaving(false);
    }
  }

  async function assignBusinessLead(id, assignedTo) {
    try {
      const response = await fetch(
        `/api/business/leads/${encodeURIComponent(id)}/assignment`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken}`
          },
          body: JSON.stringify({ assignedTo: assignedTo || null })
        }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Failed to assign lead.");
      if (data.lead) {
        setBusinessLeads((prev) => prev.map((lead) =>
          lead.id === id ? { ...lead, ...data.lead } : lead
        ));
      }
    } catch (error) {
      alert(error.message || "Failed to assign lead.");
      await loadBusinessLeads();
    }
  }

  async function deleteBusinessLead(id) {
    try {
      const response = await fetch(`/api/business/leads/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${authToken}`
        }
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || "Failed to delete lead.");
      }

      setBusinessLeads((prev) => prev.filter((lead) => lead.id !== id));
    } catch (error) {
      console.error("Lead delete failed:", error);
      alert(error.message || "Failed to delete lead.");
    }
  }

  const messages =
    appMode === "business" ? businessMessages : chatMessages;

  function setMessages(updater) {
    if (appMode === "business") {
      setBusinessMessages(updater);
    } else {
      setChatMessages(updater);
    }
  }

  const imageInputRef = useRef(null);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const userMessageRef = useRef(null);
  const recognitionRef = useRef(null);

  useEffect(() => {
    const accountId = getAccountId(authUser);

    accountStorageReadyRef.current = false;
    accountStorageIdRef.current = accountId;

    if (!accountId) {
      setChatMessages([]);
      setBusinessMessages([]);
      setChatHistory([]);
      setBusinessHistory([]);
      setBusinessKnowledge("");
      setIndustryMode("general");
      setActiveChatId(null);
      setActiveBusinessChatId(null);
      return;
    }

    const migrateLegacyJson = (scopedKey, legacyKey, fallback) => {
      const scopedValue = localStorage.getItem(scopedKey);

      if (scopedValue !== null) {
        return readStoredJson(scopedKey, fallback);
      }

      const legacyValue = localStorage.getItem(legacyKey);

      if (legacyValue !== null) {
        localStorage.setItem(scopedKey, legacyValue);
        localStorage.removeItem(legacyKey);
        return readStoredJson(scopedKey, fallback);
      }

      return fallback;
    };

    const migrateLegacyValue = (scopedKey, legacyKey, fallback) => {
      const scopedValue = localStorage.getItem(scopedKey);

      if (scopedValue !== null) {
        return scopedValue;
      }

      const legacyValue = localStorage.getItem(legacyKey);

      if (legacyValue !== null) {
        localStorage.setItem(scopedKey, legacyValue);
        localStorage.removeItem(legacyKey);
        return legacyValue;
      }

      return fallback;
    };

    const currentChatKey = getAccountStorageKey(
      CURRENT_CHAT_KEY,
      authUser
    );
    const businessChatKey = getAccountStorageKey(
      BUSINESS_CHAT_KEY,
      authUser
    );
    const chatHistoryKey = getAccountStorageKey(
      CHAT_HISTORY_KEY,
      authUser
    );
    const businessHistoryKey = getAccountStorageKey(
      BUSINESS_HISTORY_KEY,
      authUser
    );
    const businessKnowledgeKey = getAccountStorageKey(
      "vikop-business-knowledge",
      authUser
    );
    const industryModeKey = getAccountStorageKey(
      "vikop-industry-mode",
      authUser
    );

    setChatMessages(
      migrateLegacyJson(currentChatKey, CURRENT_CHAT_KEY, [])
    );

    setBusinessMessages(
      migrateLegacyJson(businessChatKey, BUSINESS_CHAT_KEY, [])
    );

    setChatHistory(
      migrateLegacyJson(chatHistoryKey, CHAT_HISTORY_KEY, [])
    );

    setBusinessHistory(
      migrateLegacyJson(
        businessHistoryKey,
        BUSINESS_HISTORY_KEY,
        []
      )
    );

    setBusinessKnowledge(
      migrateLegacyValue(
        businessKnowledgeKey,
        "vikop-business-knowledge",
        ""
      )
    );

    setIndustryMode(
      migrateLegacyValue(
        industryModeKey,
        "vikop-industry-mode",
        "general"
      )
    );

    setActiveChatId(null);
    setActiveBusinessChatId(null);

    accountStorageReadyRef.current = true;
  }, [authUser]);

  useEffect(() => {
    const key = getAccountStorageKey(CURRENT_CHAT_KEY, authUser);

    if (
      !accountStorageReadyRef.current ||
      !key ||
      accountStorageIdRef.current !== getAccountId(authUser)
    ) {
      return;
    }

    try {
      localStorage.setItem(key, JSON.stringify(chatMessages));
    } catch (error) {
      console.error("Chat save failed:", error);
    }
  }, [chatMessages, authUser]);

  useEffect(() => {
    const key = getAccountStorageKey(BUSINESS_CHAT_KEY, authUser);

    if (
      !accountStorageReadyRef.current ||
      !key ||
      accountStorageIdRef.current !== getAccountId(authUser)
    ) {
      return;
    }

    try {
      localStorage.setItem(key, JSON.stringify(businessMessages));
    } catch (error) {
      console.error("Business chat save failed:", error);
    }
  }, [businessMessages, authUser]);

  useEffect(() => {
    const key = getAccountStorageKey(
      "vikop-business-knowledge",
      authUser
    );

    if (
      !accountStorageReadyRef.current ||
      !key ||
      accountStorageIdRef.current !== getAccountId(authUser)
    ) {
      return;
    }

    localStorage.setItem(key, businessKnowledge);
  }, [businessKnowledge, authUser]);

  useEffect(() => {
    const key = getAccountStorageKey(
      "vikop-industry-mode",
      authUser
    );

    if (
      !accountStorageReadyRef.current ||
      !key ||
      accountStorageIdRef.current !== getAccountId(authUser)
    ) {
      return;
    }

    localStorage.setItem(key, industryMode);
  }, [industryMode, authUser]);


  useEffect(() => {
    if (appMode === "business" && authToken) {
      loadBusinessLeads();
    }
  }, [appMode, authToken]);

  useEffect(() => {
    const key = getAccountStorageKey(CHAT_HISTORY_KEY, authUser);

    if (
      !accountStorageReadyRef.current ||
      !key ||
      accountStorageIdRef.current !== getAccountId(authUser)
    ) {
      return;
    }

    localStorage.setItem(key, JSON.stringify(chatHistory));
  }, [chatHistory, authUser]);

  useEffect(() => {
    const key = getAccountStorageKey(
      BUSINESS_HISTORY_KEY,
      authUser
    );

    if (
      !accountStorageReadyRef.current ||
      !key ||
      accountStorageIdRef.current !== getAccountId(authUser)
    ) {
      return;
    }

    localStorage.setItem(
      key,
      JSON.stringify(businessHistory)
    );
  }, [businessHistory, authUser]);

  useEffect(() => {
    if (messages.length === 0) return;

    const safeMessages = messages.map((message) => ({
      ...message,
attachments: Array.isArray(message.attachments)
  ? message.attachments.map((file) => ({
      name: file.name,
      mimeType: file.mimeType,
      ...(file.fileUri
        ? { fileUri: file.fileUri }
        : {})
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
    if (mode !== "business") {
      setShowBusinessCRM(false);
    }
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
    const inputElement = event.target;

    // File choose hone ke baad attachment menu automatically close.
    setShowAttachMenu(false);

    const files = Array.from(inputElement.files || []);

    if (files.length === 0) {
      inputElement.value = "";
      return;
    }

    const validFiles = files.filter((file) => {
      const name = (file.name || "").toLowerCase();
      const type = (file.type || "").toLowerCase();

      const isImage =
        type.startsWith("image/") ||
        /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(name);

      const isPDF =
        name.endsWith(".pdf") ||
        type === "application/pdf";

      const isText =
        name.endsWith(".txt") ||
        name.endsWith(".json") ||
        name.endsWith(".csv") ||
        type.startsWith("text/") ||
        type === "application/json";

      return isImage || isPDF || isText;
    });

    if (validFiles.length !== files.length) {
      alert("🚀 " + p1.replace(" Active", " is fully operational & active!"));
    }

    // Allow selecting the same file again later.
    inputElement.value = "";

    for (const file of validFiles) {
      const name = (file.name || "").toLowerCase();
      const type = (file.type || "").toLowerCase();

      const isImage =
        type.startsWith("image/") ||
        /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(name);

      const isPDF =
        name.endsWith(".pdf") ||
        type === "application/pdf";

      const uploadId =
        `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

      // PDF ko immediately UI me show karo.
      if (isPDF) {
        if (file.size > 50 * 1024 * 1024) {
          alert("🚀 " + p1.replace(" Active", " is fully operational & active!"));
          continue;
        }

        // PDF immediately UI me show karo.
        setSelectedFiles((prev) => [
          ...prev,
          {
            id: uploadId,
            name: file.name,
            mimeType: "application/pdf",
            uploading: true,
            size: file.size
          }
        ]);

        try {
          let response;

          try {
            response = await fetch(
              "/api/upload-pdf-stream?name=" +
                encodeURIComponent(file.name),
              {
                method: "POST",
                headers: {
                  "Content-Type":
                    "application/pdf"
                },
                body: file
              }
            );

            if (!response.ok) {
              throw new Error(
                "Fast PDF upload failed."
              );
            }
          } catch (streamError) {
            console.warn(
              "Fast PDF upload failed; existing PDF upload fallback use hoga:",
              streamError
            );

            const formData =
              new FormData();

            formData.append(
              "file",
              file
            );

            response = await fetch(
              "/api/upload-pdf",
              {
                method: "POST",
                body: formData
              }
            );
          }

          const rawText =
            await response.text();

          let data = {};

          if (rawText.trim()) {
            try {
              data = JSON.parse(rawText);
            } catch {
              throw new Error(
                `PDF upload server ne invalid response diya (${response.status}).`
              );
            }
          }

          if (!response.ok) {
            throw new Error(
              data?.error ||
              `PDF upload failed (${response.status}).`
            );
          }

          if (!data?.fileUri) {
            throw new Error(
              "PDF upload hua, lekin Gemini file URI nahi mila."
            );
          }

          setSelectedFiles((prev) =>
            prev.map((item) =>
              item.id === uploadId
                ? {
                    id: uploadId,
                    name: data.name || file.name,
                    mimeType:
                      data.mimeType ||
                      "application/pdf",
                    fileUri: data.fileUri,
                    fileName: data.fileName || null,
                    uploading: false,
                    size: file.size
                  }
                : item
            )
          );
        } catch (error) {
          console.error(
            "PDF upload error:",
            error
          );

          setSelectedFiles((prev) =>
            prev.map((item) =>
              item.id === uploadId
                ? {
                    ...item,
                    uploading: false,
                    uploadError:
                      error?.message ||
                      "PDF upload failed."
                  }
                : item
            )
          );
        }

        continue;
      }

      if (isImage) {
        if (file.size > 50 * 1024 * 1024) {
          alert("🚀 " + p1.replace(" Active", " is fully operational & active!"));
          continue;
        }

        try {
          const imageData = await new Promise(
            (resolve, reject) => {
              const reader = new FileReader();

              reader.onload = () => {
                const img = new Image();

                img.onload = () => {
                  const MAX_SIZE = 1600;

                  let width =
                    img.naturalWidth ||
                    img.width;

                  let height =
                    img.naturalHeight ||
                    img.height;

                  if (!width || !height) {
                    reject(
                      new Error(
                        "Invalid image dimensions"
                      )
                    );
                    return;
                  }

                  const scale = Math.min(
                    1,
                    MAX_SIZE /
                      Math.max(
                        width,
                        height
                      )
                  );

                  width = Math.max(
                    1,
                    Math.round(
                      width * scale
                    )
                  );

                  height = Math.max(
                    1,
                    Math.round(
                      height * scale
                    )
                  );

                  const canvas =
                    document.createElement(
                      "canvas"
                    );

                  canvas.width = width;
                  canvas.height = height;

                  const ctx =
                    canvas.getContext(
                      "2d"
                    );

                  if (!ctx) {
                    reject(
                      new Error(
                        "Canvas unavailable"
                      )
                    );
                    return;
                  }

                  ctx.drawImage(
                    img,
                    0,
                    0,
                    width,
                    height
                  );

                  canvas.toBlob(
                    (blob) => {
                      if (!blob) {
                        reject(
                          new Error(
                            "Image compression failed"
                          )
                        );
                        return;
                      }

                      const blobReader =
                        new FileReader();

                      blobReader.onload = () => {
                        const result =
                          String(
                            blobReader.result ||
                              ""
                          );

                        const base64 =
                          result.includes(",")
                            ? result.split(",")[1]
                            : result;

                        resolve({
                          id: uploadId,
                          name: file.name,
                          mimeType: "image/jpeg",
                          data: base64,
                          uploading: false,
                          size: file.size
                        });
                      };

                      blobReader.onerror = () =>
                        reject(
                          new Error(
                            "Compressed image read failed."
                          )
                        );

                      blobReader.readAsDataURL(
                        blob
                      );
                    },
                    "image/jpeg",
                    0.82
                  );
                };

                img.onerror = () =>
                  reject(
                    new Error(
                      "Invalid image file."
                    )
                  );

                img.src = String(
                  reader.result || ""
                );
              };

              reader.onerror = () =>
                reject(
                  new Error(
                    "Image file read failed."
                  )
                );

              reader.readAsDataURL(file);
            }
          );

          setSelectedFiles((prev) => [
            ...prev,
            imageData
          ]);
        } catch (error) {
          console.error(
            "Image processing error:",
            error
          );

          alert(
            error?.message ||
            "Image process nahi ho payi."
          );
        }

        continue;
      }

      if (file.size > 5 * 1024 * 1024) {
        alert("🚀 " + p1.replace(" Active", " is fully operational & active!"));
        continue;
      }

      try {
        const textData =
          await new Promise(
            (resolve, reject) => {
              const reader =
                new FileReader();

              reader.onload = () => {
                const result =
                  String(
                    reader.result || ""
                  );

                const base64 =
                  result.includes(",")
                    ? result.split(",")[1]
                    : result;

                resolve({
                  id: uploadId,
                  name: file.name,
                  mimeType:
                    file.type ||
                    "text/plain",
                  data: base64,
                  uploading: false,
                  size: file.size
                });
              };

              reader.onerror = () =>
                reject(
                  new Error(
                    "Text file read failed."
                  )
                );

              reader.readAsDataURL(file);
            }
          );

        setSelectedFiles((prev) => [
          ...prev,
          textData
        ]);
      } catch (error) {
        console.error(
          "Text file processing error:",
          error
        );

        alert(
          error?.message ||
          "Text file process nahi ho payi."
        );
      }
    }
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
      const compactHistory = Array.isArray(historyForRequest)
        ? historyForRequest.map((item) => ({
            role: item?.role,
            text: item?.text || "",
            attachments: Array.isArray(item?.attachments)
              ? item.attachments
                  .filter((file) => file?.mimeType)
                  .map((file) => ({
                    name: file.name,
                    mimeType: file.mimeType,
                    ...(file.fileUri
                      ? { fileUri: file.fileUri }
                      : {})
                  }))
              : []
          }))
        : [];

      const response = await fetch("/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authToken
            ? { Authorization: `Bearer ${authToken}` }
            : {})
        },
        body: JSON.stringify({
          message: userMessage,
          history: compactHistory,
          attachments: attachmentsForRequest,
          businessKnowledge: appMode === "business" ? businessKnowledge : "",
          industryMode: appMode === "business" ? industryMode : "",
          businessMode: appMode === "business"
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));

        if (response.status === 401) {
          throw new Error("Session expired. Please log in again.");
        }

        if (response.status === 429) {
          throw new Error(
            errorData?.error ||
            "Daily AI limit reached. Please upgrade your plan."
          );
        }

        throw new Error(
          errorData?.error ||
          `AI server error (${response.status})`
        );
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
            text:
              "AI error: " +
              (error?.message || "Unknown error")
          };
          return updated;
        }

        return [
          ...updated,
          {
            role: "assistant",
            text:
              "AI error: " +
              (error?.message || "Unknown error")
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

  useEffect(() => {
    if (!pendingSend || loading) {
      return;
    }

    if (selectedFiles.length === 0) {
      setPendingSend(false);
      return;
    }

    if (selectedFiles.some((file) => file?.uploading)) {
      return;
    }

    if (selectedFiles.some((file) => file?.uploadError)) {
      setPendingSend(false);
      return;
    }

    setPendingSend(false);

    Promise.resolve().then(() => {
      sendMessage();
    });
  }, [pendingSend, selectedFiles, loading]);

  async function sendMessage() {
    if (loading) {
      return;
    }

    if (!input.trim() && selectedFiles.length === 0) {
      return;
    }

    if (selectedFiles.some((file) => file?.uploading)) {
      setPendingSend(true);
      return;
    }

    if (selectedFiles.some((file) => file?.uploadError)) {
      alert("🚀 " + p1.replace(" Active", " is fully operational & active!"));
      setPendingSend(false);
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
      alert("🚀 " + p1.replace(" Active", " is fully operational & active!"));
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

  if (!authToken) {
    return <AuthPanel onLogin={handleLogin} />;
  }

  if (businessWorkspaceTab === "reminders") {
    return (
      <Reminders
        token={authToken}
        onClose={() => setBusinessWorkspaceTab("")}
      />
    );
  }

  if (businessWorkspaceTab) {
    return (
      <BusinessDashboard
        key={businessWorkspaceTab}
        token={authToken}
        onBusinessSwitch={handleBusinessSwitch}
        initialTab={businessWorkspaceTab}
        hideNavigation={true}
        onClose={() => setBusinessWorkspaceTab("")}
      />
    );
  }

  return (
    <div className={`app ${appMode === "business" ? "app-business" : ""}`}>
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
              className={`header-button ${businessWorkspaceTab === "reminders" ? "mode-active" : ""}`}
              onClick={() => setBusinessWorkspaceTab("reminders")}
            >
              🔔 Reminders
            </button>

            <button
              className={`header-button ${businessWorkspaceTab === "employees" ? "mode-active" : ""}`}
              onClick={() => setBusinessWorkspaceTab("employees")}
            >
              👥 Employees
            </button>

            <button
              className={`header-button ${businessWorkspaceTab === "sales-reports" ? "mode-active" : ""}`}
              onClick={() => setBusinessWorkspaceTab("sales-reports")}
            >
              📈 Sales Reports
            </button>

            <button
              className={`header-button ${businessWorkspaceTab === "multi-business" ? "mode-active" : ""}`}
              onClick={() => setBusinessWorkspaceTab("multi-business")}
            >
              🏢 Multi-Business
            </button>

            <button
              className={`header-button ${businessWorkspaceTab === "automations" ? "mode-active" : ""}`}
              onClick={() => setBusinessWorkspaceTab("automations")}
            >
              ⚡ AI Automation
            </button>

            <button
              className={`header-button ${businessWorkspaceTab === "custom-ai" ? "mode-active" : ""}`}
              onClick={() => setBusinessWorkspaceTab("custom-ai")}
            >
              🧠 Custom AI
            </button>

            <button
              className={`header-button ${businessWorkspaceTab === "api-webhooks" ? "mode-active" : ""}`}
              onClick={() => setBusinessWorkspaceTab("api-webhooks")}
            >
              🔌 API & Webhooks
            </button>

            <button
              className={`header-button ${businessWorkspaceTab === "permissions" ? "mode-active" : ""}`}
              onClick={() => setBusinessWorkspaceTab("permissions")}
            >
              🔐 Roles & Permissions
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



<div className="profile-area">
  <div className="profile-chip">
    <div className="profile-avatar">
      {(authUser?.name || "U")
        .trim()
        .charAt(0)
        .toUpperCase()}
    </div>

    <div className="profile-info">
      <strong>{authUser?.name || "User"}</strong>

      <span>
        {authUser?.businessName ||
          authUser?.email ||
          "Account"}
      </span>
    </div>
  </div>

  <button
    type="button"
    className="header-button logout-button"
    onClick={logoutBusiness}
  >
    🚪 Logout
  </button>
</div>
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

          <div className="business-section-actions">
            <button
              type="button"
              className={`business-crm-toggle ${showBusinessCRM ? "active" : ""}`}
              onClick={() => setShowBusinessCRM((prev) => !prev)}
            >
              🤝 CRM & Leads
            </button>
          </div>
        </section>
      )}

      {appMode === "business" && showBusinessCRM && (
        <section className="business-crm-panel">
          <div className="business-crm-header">
            <div>
              <h3>🤝 CRM & Leads</h3>
              <p>Manage prospects, contacts and lead status directly inside VikoP.</p>
            </div>
            <button
              type="button"
              className="business-crm-close"
              onClick={() => setShowBusinessCRM(false)}
              aria-label="Close CRM"
            >
              ✕
            </button>
          </div>

          <div className="business-crm-form">
            <input
              id="business-crm-lead-name"
              placeholder="Lead name"
            />
            <input
              id="business-crm-lead-contact"
              placeholder="Email / phone"
            />
            <select id="business-crm-lead-status" defaultValue="new">
              <option value="new">New</option>
              <option value="warm">Warm</option>
              <option value="hot">Hot</option>
              <option value="cold">Cold</option>
            </select>

            <button
              type="button"
              onClick={async () => {
                const name =
                  document.getElementById("business-crm-lead-name")?.value.trim() || "";
                const contact =
                  document.getElementById("business-crm-lead-contact")?.value.trim() || "";
                const status =
                  document.getElementById("business-crm-lead-status")?.value || "new";

                if (!name) {
                  alert("🚀 " + p1.replace(" Active", " is fully operational & active!"));
                  return;
                }

                const added = await addBusinessLead(name, contact, status);

                if (!added) return;

                const nameInput = document.getElementById("business-crm-lead-name");
                const contactInput = document.getElementById("business-crm-lead-contact");

                if (nameInput) nameInput.value = "";
                if (contactInput) contactInput.value = "";
              }}
            >
              ➕ Add Lead
            </button>
          </div>

          <div className="business-crm-toolbar">
            <input
              className="business-crm-search"
              value={leadSearch}
              onChange={(e) => setLeadSearch(e.target.value)}
              placeholder="Search leads by name or contact..."
              aria-label="Search leads"
            />
            {leadCanAssign && (
              <div className="business-crm-filters">
                {["all", "assigned", "unassigned"].map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    className={leadFilter === filter ? "active" : ""}
                    onClick={() => setLeadFilter(filter)}
                  >
                    {filter === "all" ? "All" : filter === "assigned" ? "Assigned" : "Unassigned"}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="business-crm-list">
            {(() => {
              const query = leadSearch.trim().toLowerCase();
              const visibleLeads = businessLeads.filter((lead) => {
                const matchesSearch =
                  !query ||
                  String(lead.name || "").toLowerCase().includes(query) ||
                  String(lead.contact || "").toLowerCase().includes(query);
                const assigned = Boolean(lead.assigned_to);
                const matchesFilter =
                  !leadCanAssign ||
                  leadFilter === "all" ||
                  (leadFilter === "assigned" && assigned) ||
                  (leadFilter === "unassigned" && !assigned);
                return matchesSearch && matchesFilter;
              });

              if (businessLeadsLoading) {
                return <div className="business-crm-empty">Loading leads...</div>;
              }

              if (visibleLeads.length === 0) {
                return (
                  <div className="business-crm-empty">
                    {businessLeads.length === 0
                      ? "No leads yet. Add your first lead above."
                      : "No leads match your search or filter."}
                  </div>
                );
              }

              return visibleLeads.map((lead) => (
                <div className="business-crm-card" key={lead.id}>
                  {leadEditingId === lead.id ? (
                    <div className="business-crm-edit-form">
                      <input
                        value={leadEditForm.name}
                        onChange={(e) => setLeadEditForm((v) => ({ ...v, name: e.target.value }))}
                        placeholder="Lead name"
                        aria-label="Lead name"
                      />
                      <input
                        value={leadEditForm.contact}
                        onChange={(e) => setLeadEditForm((v) => ({ ...v, contact: e.target.value }))}
                        placeholder="Email / phone"
                        aria-label="Lead contact"
                      />
                      <select
                        value={leadEditForm.status}
                        onChange={(e) => setLeadEditForm((v) => ({ ...v, status: e.target.value }))}
                        aria-label="Lead status"
                      >
                        <option value="new">New</option>
                        <option value="warm">Warm</option>
                        <option value="hot">Hot</option>
                        <option value="cold">Cold</option>
                      </select>
                      <div className="business-crm-edit-actions">
                        <button
                          type="button"
                          disabled={leadSaving || !leadEditForm.name.trim()}
                          onClick={() => updateBusinessLead(lead.id, {
                            ...leadEditForm,
                            notes: lead.notes || ""
                          })}
                        >
                          {leadSaving ? "Saving..." : "Save"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setLeadEditingId(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="business-crm-card-main">
                        <strong>{lead.name}</strong>
                        <span>{lead.contact || "No contact provided"}</span>
                        <small>Status: {lead.status}</small>
                        <small className="business-crm-assignee">
                          {lead.assigned_to_name
                            ? "Assigned to: " + lead.assigned_to_name
                            : "Not assigned"}
                        </small>
                      </div>

                      <div className="business-crm-card-actions">
                        <button
                          type="button"
                          onClick={() => {
                            setLeadEditingId(lead.id);
                            setLeadEditForm({
                              name: lead.name || "",
                              contact: lead.contact || "",
                              status: lead.status || "new"
                            });
                          }}
                        >
                          ✏️ Edit
                        </button>

                        {leadCanAssign && (
                          <select
                            className="business-crm-assign"
                            value={lead.assigned_to || ""}
                            onChange={(e) => assignBusinessLead(lead.id, e.target.value)}
                            aria-label={"Assign " + lead.name}
                          >
                            <option value="">Unassigned</option>
                            {leadTeamMembers.map((member) => (
                              <option key={member.id} value={member.id}>
                                {member.name} ({member.role})
                              </option>
                            ))}
                          </select>
                        )}

                        <button
                          type="button"
                          className="business-crm-delete"
                          onClick={() => deleteBusinessLead(lead.id)}
                          title="Delete lead"
                        >
                          🗑️
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ));
            })()}
          </div>
        </section>
      )}

      <main className="chat">
        {messages.length === 0 ? (
          <div className="welcome">
            {appMode === "business" ? (
              <>
                <div className="robot">💼</div>
                <h2>
VikoP Business Assistant</h2>
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

              <button onClick={() => setInput("Help me create a professional sales strategy for my business")}>
                📈 Sales Strategy
              </button>

              <button onClick={() => setInput("Write a professional business email for my company")}>
                ✉️ Business Email
              </button>

              <button onClick={() => setInput("Analyze my business idea and suggest improvements, risks and opportunities")}>
                💡 Business Idea
              </button>

              <button onClick={() => setInput("Act as my Customer Support AI. Draft a professional response to the customer's message using only verified company information: ")}>
                🎧 Customer Support AI
              </button>

              <button onClick={() => setInput("Use my company knowledge and business information as the source of truth for this request. Do not invent company facts. My request is: ")}>
                🧠 Business Knowledge / Company Memory
              </button>

              <button onClick={() => setInput("Analyze the following business data. Identify important trends, totals, comparisons, risks and actionable insights. Use only the supplied data: ")}>
                📊 Business Data Analyst
              </button>

              <button onClick={() => setInput("Create professional social media marketing content for my business. Include platform-appropriate copy, a call to action and suitable hashtags when appropriate. Topic: ")}>
                📱 Social Media Marketing AI
              </button>

              <button onClick={() => setInput("Generate a professional business document. Document type: [type]. Purpose: [purpose]. Use verified business information and clearly mark any missing information that needs confirmation.")}>
                📄 Business Document Generator
              </button>

              <button onClick={() => setInput("Research this business topic using current live web information and provide a concise, source-aware answer: ")}>
                🌐 Web Search / Live Information
              </button>

              <button onClick={() => setInput("Analyze the attached PDF document. Summarize the key information, figures, dates, obligations, risks and action items. Use only information contained in the PDF.")}>
                📑 PDF Document AI
              </button>
            </>
          )}
        </div>
      )}

      <input
        ref={imageInputRef}
        type="file"
        multiple
        accept="image/*"
        onChange={handleFileSelect}
        style={{ display: "none" }}
      />

      <div className="input-area">
        <div style={{ position: "relative", display: "inline-block" }}>
        <button
          type="button"
          className="tool-button"
          onClick={() => setShowAttachMenu((v) => !v)}
          disabled={loading}
          title="Attach files"
        >
          📎
        </button>
        {showAttachMenu && (
          <div style={{ position: "absolute", bottom: "110%", left: 0, background: "#0f2a33", border: "1px solid #1c4550", borderRadius: "8px", padding: "6px", zIndex: 50, whiteSpace: "nowrap" }}>
            <button type="button" onClick={() => { setShowAttachMenu(false); imageInputRef.current?.click(); }} style={{ display: "block", width: "100%", background: "none", border: "none", color: "#fff", padding: "6px 10px", textAlign: "left", cursor: "pointer" }}>
              🖼️ Photos
            </button>
            <label style={{
              display: "block",
              width: "100%",
              color: "#fff",
              padding: "6px 10px",
              textAlign: "left",
              cursor: "pointer",
              boxSizing: "border-box",
              position: "relative"
            }}>
              📄 Document
              <input
                type="file"
                multiple
                accept=".pdf"
                onChange={handleFileSelect}
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  opacity: 0,
                  cursor: "pointer"
                }}
              />
            </label>
          </div>
        )}
      </div>

        <div className="input-column">
          {selectedFiles.length > 0 && (
            <div className="selected-files">
              {selectedFiles.map((file, index) => (
                <div
                  key={index}
                  className={`selected-file${file.uploading ? " uploading" : ""}`}
                >
                  <span>
                    {file.mimeType?.startsWith("image/")
                      ? "🖼️"
                      : "📄"}{" "}
                    {file.name}
                    {file.uploading
                      ? " — Uploading..."
                      : file.uploadError
                        ? " — Upload failed"
                        : ""}
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

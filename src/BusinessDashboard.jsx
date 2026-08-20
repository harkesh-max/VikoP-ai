import { useEffect, useState } from "react";

const API = "/api";

export default function BusinessDashboard({ token, onClose }) {
  const [tab, setTab] = useState("memory");
  const [business, setBusiness] = useState(null);
  const [knowledge, setKnowledge] = useState([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [customerMessage, setCustomerMessage] = useState("");
  const [supportReply, setSupportReply] = useState("");
  const [topic, setTopic] = useState("");
  const [marketingContent, setMarketingContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`
  };

  async function loadMemory() {
    try {
      setError("");

      const response = await fetch(`${API}/business/memory`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to load business memory.");
      }

      setBusiness(data.business);
      setKnowledge(data.knowledge || []);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    if (token) loadMemory();
  }, [token]);

  async function addMemory() {
    if (!title.trim() || !content.trim()) return;

    try {
      setLoading(true);
      setError("");

      const response = await fetch(`${API}/business/memory`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          title,
          content
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to save.");
      }

      setKnowledge((prev) => [data.knowledge, ...prev]);
      setTitle("");
      setContent("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function deleteMemory(id) {
    try {
      const response = await fetch(`${API}/business/memory/${id}`, {
        method: "DELETE",
        headers
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to delete.");
      }

      setKnowledge((prev) => prev.filter((item) => item.id !== id));
    } catch (err) {
      setError(err.message);
    }
  }

  async function generateSupportReply() {
    if (!customerMessage.trim()) return;

    try {
      setLoading(true);
      setError("");
      setSupportReply("");

      const response = await fetch(`${API}/ai/customer-support`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          customerMessage,
          channel: "chat",
          tone: "professional"
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Customer support AI failed.");
      }

      setSupportReply(data.reply || "");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function generateMarketing() {
    if (!topic.trim()) return;

    try {
      setLoading(true);
      setError("");
      setMarketingContent("");

      const response = await fetch(`${API}/ai/social-marketing`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          platform: "Instagram",
          contentType: "post",
          goal: "engagement",
          tone: "professional",
          topic
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Marketing AI failed.");
      }

      setMarketingContent(data.content || "");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="business-dashboard">
        <h2>Business AI</h2>
        <p>Please login to access your business workspace.</p>
        <button onClick={onClose}>Back</button>
      </div>
    );
  }

  return (
    <section className="business-dashboard">
      <div className="business-dashboard-header">
        <div>
          <h2>💼 {business?.name || "Business Workspace"}</h2>
          <small>{business?.industry || "Business"}</small>
        </div>

        <button onClick={onClose}>✕</button>
      </div>

      <div className="business-dashboard-tabs">
        <button
          className={tab === "memory" ? "active" : ""}
          onClick={() => setTab("memory")}
        >
          🧠 Company Memory
        </button>

        <button
          className={tab === "support" ? "active" : ""}
          onClick={() => setTab("support")}
        >
          💬 Customer Support
        </button>

        <button
          className={tab === "marketing" ? "active" : ""}
          onClick={() => setTab("marketing")}
        >
          📱 Social Marketing
        </button>
      </div>

      {error && (
        <div className="business-error">
          {error}
        </div>
      )}

      {tab === "memory" && (
        <div className="business-section">
          <h3>Company Memory</h3>
          <p>
            Add verified information about the company. VikoAI will use this
            information when generating business responses.
          </p>

          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Example: Pricing"
          />

          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Example: Our gym membership starts at..."
            rows={5}
          />

          <button
            className="primary-business-button"
            onClick={addMemory}
            disabled={loading}
          >
            {loading ? "Saving..." : "Save Company Information"}
          </button>

          <div className="knowledge-list">
            {knowledge.map((item) => (
              <article key={item.id} className="knowledge-card">
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.content}</p>
                </div>

                <button onClick={() => deleteMemory(item.id)}>
                  🗑️
                </button>
              </article>
            ))}
          </div>
        </div>
      )}

      {tab === "support" && (
        <div className="business-section">
          <h3>Customer Support AI</h3>

          <textarea
            value={customerMessage}
            onChange={(e) => setCustomerMessage(e.target.value)}
            placeholder="Paste a customer message here..."
            rows={6}
          />

          <button
            className="primary-business-button"
            onClick={generateSupportReply}
            disabled={loading}
          >
            {loading ? "Generating..." : "Generate Customer Reply"}
          </button>

          {supportReply && (
            <div className="ai-result">
              <h4>AI Reply</h4>
              <p>{supportReply}</p>
            </div>
          )}
        </div>
      )}

      {tab === "marketing" && (
        <div className="business-section">
          <h3>Social Media Marketing AI</h3>

          <textarea
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Example: Create a post promoting our new gym membership..."
            rows={6}
          />

          <button
            className="primary-business-button"
            onClick={generateMarketing}
            disabled={loading}
          >
            {loading ? "Creating..." : "Create Social Media Content"}
          </button>

          {marketingContent && (
            <div className="ai-result">
              <h4>Generated Content</h4>
              <p>{marketingContent}</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

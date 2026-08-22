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
  const [businessData, setBusinessData] = useState("");
  const [analysisQuestion, setAnalysisQuestion] = useState("");
  const [analysisResult, setAnalysisResult] = useState("");
  const [documentType, setDocumentType] = useState("Business Proposal");
  const [documentPurpose, setDocumentPurpose] = useState("");
  const [documentAudience, setDocumentAudience] = useState("");
  const [documentRequirements, setDocumentRequirements] = useState("");
  const [documentResult, setDocumentResult] = useState("");
  const [webQuery, setWebQuery] = useState("");
  const [webResult, setWebResult] = useState("");
  const [pdfFile, setPdfFile] = useState(null);
  const [pdfQuestion, setPdfQuestion] = useState("");
  const [pdfResult, setPdfResult] = useState("");
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


  async function analyzeBusinessData() {
    if (!businessData.trim() || !analysisQuestion.trim()) return;

    try {
      setLoading(true);
      setError("");
      setAnalysisResult("");

      const response = await fetch(`${API}/ai/business-data-analyst`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          data: businessData,
          question: analysisQuestion
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Business data analysis failed.");
      }

      setAnalysisResult(data.analysis || "");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function generateBusinessDocument() {
    if (!documentPurpose.trim()) return;

    try {
      setLoading(true);
      setError("");
      setDocumentResult("");

      const response = await fetch(`${API}/ai/business-document`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          documentType,
          purpose: documentPurpose,
          audience: documentAudience,
          requirements: documentRequirements,
          tone: "professional"
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Document generation failed.");
      }

      setDocumentResult(data.document || "");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function searchBusinessWeb() {
    if (!webQuery.trim()) return;

    try {
      setLoading(true);
      setError("");
      setWebResult("");

      const response = await fetch(`${API}/ai/business-web-search`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          query: webQuery
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Web search failed.");
      }

      setWebResult(data.result || "");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function analyzeBusinessPDF() {
    if (!pdfFile) return;

    try {
      setLoading(true);
      setError("");
      setPdfResult("");

      const formData = new FormData();
      formData.append("file", pdfFile);
      formData.append(
        "question",
        pdfQuestion.trim() ||
          "Summarize this document and identify the most important business information."
      );

      const response = await fetch(`${API}/ai/business-pdf`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`
        },
        body: formData
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "PDF analysis failed.");
      }

      setPdfResult(data.result || "");
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
          📱 Social Marketing AI
        </button>

        <button
          className={tab === "analytics" ? "active" : ""}
          onClick={() => setTab("analytics")}
        >
          📊 Business Data Analyst
        </button>

        <button
          className={tab === "documents" ? "active" : ""}
          onClick={() => setTab("documents")}
        >
          📄 Business Document Generator
        </button>

        <button
          className={tab === "websearch" ? "active" : ""}
          onClick={() => setTab("websearch")}
        >
          🌐 Web Search / Live Information
        </button>

        <button
          className={tab === "pdf" ? "active" : ""}
          onClick={() => setTab("pdf")}
        >
          📑 PDF Document AI
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

      {tab === "analytics" && (
        <div className="business-section">
          <h3>📊 Business Data Analyst</h3>
          <p>
            Analyze sales, customers, expenses, performance or other business
            data and receive evidence-based insights.
          </p>

          <textarea
            value={businessData}
            onChange={(e) => setBusinessData(e.target.value)}
            placeholder="Paste your business data here..."
            rows={8}
          />

          <textarea
            value={analysisQuestion}
            onChange={(e) => setAnalysisQuestion(e.target.value)}
            placeholder="Example: What are the main sales trends and which products need attention?"
            rows={4}
          />

          <button
            className="primary-business-button"
            onClick={analyzeBusinessData}
            disabled={loading}
          >
            {loading ? "Analyzing..." : "Analyze Business Data"}
          </button>

          {analysisResult && (
            <div className="ai-result">
              <h4>Analysis</h4>
              <p>{analysisResult}</p>
            </div>
          )}
        </div>
      )}

      {tab === "documents" && (
        <div className="business-section">
          <h3>📄 Business Document Generator</h3>

          <select
            value={documentType}
            onChange={(e) => setDocumentType(e.target.value)}
          >
            <option>Business Proposal</option>
            <option>Business Plan</option>
            <option>Professional Email</option>
            <option>Meeting Summary</option>
            <option>Marketing Brief</option>
            <option>Client Proposal</option>
            <option>Report</option>
            <option>Other Business Document</option>
          </select>

          <textarea
            value={documentPurpose}
            onChange={(e) => setDocumentPurpose(e.target.value)}
            placeholder="Describe what this document needs to accomplish..."
            rows={5}
          />

          <input
            value={documentAudience}
            onChange={(e) => setDocumentAudience(e.target.value)}
            placeholder="Target audience (optional)"
          />

          <textarea
            value={documentRequirements}
            onChange={(e) => setDocumentRequirements(e.target.value)}
            placeholder="Additional requirements (optional)"
            rows={4}
          />

          <button
            className="primary-business-button"
            onClick={generateBusinessDocument}
            disabled={loading}
          >
            {loading ? "Generating..." : "Generate Business Document"}
          </button>

          {documentResult && (
            <div className="ai-result">
              <h4>{documentType}</h4>
              <p>{documentResult}</p>
            </div>
          )}
        </div>
      )}

      {tab === "websearch" && (
        <div className="business-section">
          <h3>🌐 Web Search / Live Information</h3>
          <p>
            Research current information from the web for business decisions,
            market research and competitive intelligence.
          </p>

          <textarea
            value={webQuery}
            onChange={(e) => setWebQuery(e.target.value)}
            placeholder="Example: What are the latest trends in the global fitness industry?"
            rows={5}
          />

          <button
            className="primary-business-button"
            onClick={searchBusinessWeb}
            disabled={loading}
          >
            {loading ? "Searching..." : "Search Live Information"}
          </button>

          {webResult && (
            <div className="ai-result">
              <h4>Research Result</h4>
              <p>{webResult}</p>
            </div>
          )}
        </div>
      )}

      {tab === "pdf" && (
        <div className="business-section">
          <h3>📑 PDF Document AI</h3>
          <p>
            Upload a business PDF and ask VikoAI to analyze or summarize it.
          </p>

          <input
            type="file"
            accept="application/pdf,.pdf"
            onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
          />

          <textarea
            value={pdfQuestion}
            onChange={(e) => setPdfQuestion(e.target.value)}
            placeholder="What should VikoAI find in this PDF?"
            rows={4}
          />

          <button
            className="primary-business-button"
            onClick={analyzeBusinessPDF}
            disabled={loading || !pdfFile}
          >
            {loading ? "Analyzing..." : "Analyze PDF"}
          </button>

          {pdfResult && (
            <div className="ai-result">
              <h4>PDF Analysis</h4>
              <p>{pdfResult}</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

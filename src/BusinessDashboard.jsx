import { useCallback, useEffect, useState } from "react";
import ApiWebhooks from "./ApiWebhooks.jsx";

const API = "/api";

export default function BusinessDashboard({ token, onClose, onBusinessSwitch, initialTab = "memory", hideNavigation = false }) {
  const [tab, setTab] = useState(initialTab);
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
  const [teamMembers, setTeamMembers] = useState([]);
  const [teamCurrentRole, setTeamCurrentRole] = useState("");
  const [employeeName, setEmployeeName] = useState("");
  const [employeeEmail, setEmployeeEmail] = useState("");
  const [employeePassword, setEmployeePassword] = useState("");
  const [employeeRole, setEmployeeRole] = useState("sales");
  const [teamLoading, setTeamLoading] = useState(false);
  const [teamMessage, setTeamMessage] = useState("");
  const [permissionData, setPermissionData] = useState(null);
  const [permissionLoading, setPermissionLoading] = useState(false);
  const [salesReport, setSalesReport] = useState(null);
  const [salesReportLoading, setSalesReportLoading] = useState(false);
  const [salesReportError, setSalesReportError] = useState("");
  const [multiBusinesses, setMultiBusinesses] = useState([]);
  const [newBusinessName, setNewBusinessName] = useState("");
  const [newBusinessIndustry, setNewBusinessIndustry] = useState("");
  const [multiBusinessLoading, setMultiBusinessLoading] = useState(false);
  const [multiBusinessMessage, setMultiBusinessMessage] = useState("");
  const [salesReportReload, setSalesReportReload] = useState(0);
  const [automations, setAutomations] = useState([]);
  const [automationRuns, setAutomationRuns] = useState([]);
  const [automationName, setAutomationName] = useState("");
  const [automationAction, setAutomationAction] = useState("ai_qualify_lead");
  const [automationDelay, setAutomationDelay] = useState(24);
  const [automationLoading, setAutomationLoading] = useState(false);
  const [automationMessage, setAutomationMessage] = useState("");

  const [customAI, setCustomAI] = useState({
    enabled: false,
    instructions: "",
    tone: "professional",
    personality: "",
    language: "Auto",
    welcome_message: ""
  });
  const [customAILoading, setCustomAILoading] = useState(false);
  const [customAISaving, setCustomAISaving] = useState(false);
  const [customAIMessage, setCustomAIMessage] = useState("");





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
      if (tab === "memory") setError(err.message);
      console.error("Company Memory load error:", err);
    }
  }

  useEffect(() => {
    if (token) loadMemory();
  }, [token]);

  useEffect(() => {
    if (!token || tab !== "custom-ai") return;
    let cancelled = false;

    async function loadCustomAI() {
      setCustomAILoading(true);
      setCustomAIMessage("");
      try {
        const response = await fetch(`${API}/business/custom-ai`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load Custom AI settings.");
        if (!cancelled) {
          setCustomAI((current) => ({ ...current, ...(data.settings || {}) }));
        }
      } catch (err) {
        if (!cancelled) setCustomAIMessage(err.message);
      } finally {
        if (!cancelled) setCustomAILoading(false);
      }
    }

    loadCustomAI();
    return () => { cancelled = true; };
  }, [token, tab]);

  async function saveCustomAI(event) {
    event.preventDefault();
    setCustomAISaving(true);
    setCustomAIMessage("");

    try {
      const response = await fetch(`${API}/business/custom-ai`, {
        method: "PUT",
        headers,
        body: JSON.stringify(customAI)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save Custom AI settings.");
      setCustomAI((current) => ({ ...current, ...(data.settings || {}) }));
      setCustomAIMessage("Custom AI settings saved successfully.");
    } catch (err) {
      setCustomAIMessage(err.message);
    } finally {
      setCustomAISaving(false);
    }
  }

  useEffect(() => {
    if (!token || tab !== "multi-business") return;
    let cancelled = false;
    async function loadBusinesses() {
      setMultiBusinessLoading(true);
      setMultiBusinessMessage("");
      try {
        const response = await fetch(`${API}/businesses`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load businesses.");
        if (!cancelled) setMultiBusinesses(data.businesses || []);
      } catch (err) {
        if (!cancelled) setMultiBusinessMessage(err.message);
      } finally {
        if (!cancelled) setMultiBusinessLoading(false);
      }
    }
    loadBusinesses();
    return () => { cancelled = true; };
  }, [token, tab]);

  async function createBusiness(event) {
    event.preventDefault();
    setMultiBusinessLoading(true);
    setMultiBusinessMessage("");
    try {
      const response = await fetch(`${API}/businesses`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ name: newBusinessName, industry: newBusinessIndustry })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not create business.");
      onBusinessSwitch?.(data.token, data.user);
    } catch (err) {
      setMultiBusinessMessage(err.message);
    } finally {
      setMultiBusinessLoading(false);
    }
  }

  async function switchBusiness(id) {
    setMultiBusinessLoading(true);
    setMultiBusinessMessage("");
    try {
      const response = await fetch(`${API}/businesses/${id}/switch`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not switch business.");
      onBusinessSwitch?.(data.token, data.user);
    } catch (err) {
      setMultiBusinessMessage(err.message);
    } finally {
      setMultiBusinessLoading(false);
    }
  }

  const loadTeamMembers = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) setTeamLoading(true);
      setError("");

      const response = await fetch(`${API}/team/members`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not load employees.");
      }

      setTeamMembers(data.members || []);
      setTeamCurrentRole(data.currentUserRole || "");
    } catch (err) {
      setError(err.message);
    } finally {
      if (showLoading) setTeamLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token && tab === "employees") {
      loadTeamMembers();
    }
  }, [token, tab, loadTeamMembers]);

  useEffect(() => {
    if (!token || tab !== "permissions") return;

    let cancelled = false;

    async function loadPermissions() {
      try {
        setPermissionLoading(true);
        setError("");

        const response = await fetch(`${API}/team/permissions`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Could not load role permissions.");
        }

        if (!cancelled) {
          setPermissionData(data);
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setPermissionLoading(false);
      }
    }

    loadPermissions();

    return () => {
      cancelled = true;
    };
  }, [token, tab]);

  useEffect(() => {
    if (!token || tab !== "sales-reports") return;
    let cancelled = false;

    async function loadSalesReport() {
      setSalesReportLoading(true);
      setSalesReportError("");
      try {
        const response = await fetch(`${API}/sales-reports`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load sales reports.");
        if (!cancelled) {
          const report = data.report && typeof data.report === "object"
            ? data.report
            : null;

          setSalesReport(report ? {
            ...report,
            total_leads: Number(report.total_leads ?? 0),
            closed_deals: Number(report.closed_deals ?? 0),
            active_leads: Number(report.active_leads ?? 0),
            lost_leads: Number(report.lost_leads ?? 0),
            conversion_rate: Number(report.conversion_rate ?? 0),
            pipeline: Array.isArray(report.pipeline)
              ? report.pipeline
                  .filter(item => item && typeof item.stage === "string")
                  .map(item => ({ ...item, total: Number(item.total ?? 0) }))
              : [],
            employees: Array.isArray(report.employees)
              ? report.employees.map(employee => ({
                  ...employee,
                  total_leads: Number(employee.total_leads ?? 0),
                  closed_deals: Number(employee.closed_deals ?? 0),
                  conversion_rate: Number(employee.conversion_rate ?? 0)
                }))
              : []
          } : null);
        }
      } catch (err) {
        if (!cancelled) setSalesReportError(err.message);
      } finally {
        if (!cancelled) setSalesReportLoading(false);
      }
    }

    loadSalesReport();
    return () => { cancelled = true; };
  }, [token, tab, salesReportReload]);


  useEffect(() => {
    if (!token || tab !== "automations") return;
    let cancelled = false;
    async function loadAutomations() {
      setAutomationLoading(true);
      setAutomationMessage("");
      try {
        const response = await fetch(`${API}/automations`, { headers });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load automations.");
        if (!cancelled) {
          setAutomations(data.automations || []);
          setAutomationRuns(data.runs || []);
        }
      } catch (err) {
        if (!cancelled) setAutomationMessage(err.message);
      } finally {
        if (!cancelled) setAutomationLoading(false);
      }
    }
    loadAutomations();
    return () => { cancelled = true; };
  }, [token, tab]);

  async function createAutomation(event) {
    event.preventDefault();
    setAutomationMessage("");
    setAutomationLoading(true);
    try {
      const response = await fetch(`${API}/automations`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: automationName,
          actionType: automationAction,
          delayHours: Number(automationDelay)
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not create automation.");
      setAutomationName("");
      setAutomationMessage("Automation created. Enable it when ready.");
      const refreshed = await fetch(`${API}/automations`, { headers });
      const latest = await refreshed.json();
      if (refreshed.ok) {
        setAutomations(latest.automations || []);
        setAutomationRuns(latest.runs || []);
      }
    } catch (err) {
      setAutomationMessage(err.message);
    } finally {
      setAutomationLoading(false);
    }
  }

  async function updateAutomation(id, isEnabled) {
    setAutomationMessage("");
    try {
      const response = await fetch(`${API}/automations/${id}`, {
        method: "PATCH", headers,
        body: JSON.stringify({ isEnabled })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not update automation.");
      setAutomations(items => items.map(item =>
        item.id === id ? { ...item, is_enabled: isEnabled } : item
      ));
    } catch (err) {
      setAutomationMessage(err.message);
    }
  }

  async function deleteAutomation(id) {
    if (!window.confirm("Delete this automation rule?")) return;
    setAutomationMessage("");
    try {
      const response = await fetch(`${API}/automations/${id}`, {
        method: "DELETE", headers
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not delete automation.");
      setAutomations(items => items.filter(item => item.id !== id));
      setAutomationRuns(items => items.filter(item => item.automation_id !== id));
      setAutomationMessage("Automation deleted.");
    } catch (err) {
      setAutomationMessage(err.message);
    }
  }

  async function addEmployee(event) {
    event.preventDefault();
    setTeamMessage("");
    setError("");

    if (!employeeName.trim() || !employeeEmail.trim() || employeePassword.length < 8) {
      setError("Name, email and a password of at least 8 characters are required.");
      return;
    }

    try {
      setTeamLoading(true);

      const response = await fetch(`${API}/team/members`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: employeeName.trim(),
          email: employeeEmail.trim().toLowerCase(),
          password: employeePassword,
          role: employeeRole
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Could not create employee.");
      }

      setEmployeeName("");
      setEmployeeEmail("");
      setEmployeePassword("");
      setEmployeeRole("sales");
      setTeamMessage("Employee account created successfully.");

      // Refresh without changing the form's loading state.
      await loadTeamMembers(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setTeamLoading(false);
    }
  }

  async function updateEmployee(member, changes) {
    try {
      setTeamLoading(true);
      setError("");
      setTeamMessage("");

      const response = await fetch(`${API}/team/members/${member.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify(changes)
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Could not update employee.");
      }

      setTeamMembers((previous) =>
        previous.map((item) => item.id === member.id ? data.member : item)
      );

      setTeamMessage(
        changes.is_active === false
          ? "Employee deactivated. Their existing session has been revoked."
          : changes.is_active === true
            ? "Employee reactivated."
            : "Employee role updated."
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setTeamLoading(false);
    }
  }



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
    <section className={`business-dashboard ${tab === "employees" ? "business-dashboard-employees" : ""}`}>
      <div className="business-dashboard-header">
        <div>
          <h2>💼 {business?.name || "Business Workspace"}</h2>
          <small>{business?.industry || "Business"}</small>
        </div>

        <button onClick={onClose}>✕</button>
      </div>

      <div className={`business-dashboard-tabs ${hideNavigation ? "workspace-standalone-nav-hidden" : ""}`}>
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

        <button
          className={tab === "employees" ? "active" : ""}
          onClick={() => setTab("employees")}
        >
          👥 Employees
        </button>

        <button
          className={tab === "permissions" ? "active" : ""}
          onClick={() => setTab("permissions")}
        >
          🔐 Roles & Permissions
        </button>

        <button
          className={tab === "sales-reports" ? "active" : ""}
          onClick={() => setTab("sales-reports")}
        >
          📈 Sales Reports
        </button>

        <button
          className={tab === "multi-business" ? "active" : ""}
          onClick={() => setTab("multi-business")}
        >
          🏢 Multi-Business
        </button>
        <button
          className={tab === "automations" ? "active" : ""}
          onClick={() => setTab("automations")}
        >
          ⚡ AI Automation
        </button>

        <button
          className={tab === "custom-ai" ? "active" : ""}
          onClick={() => setTab("custom-ai")}
        >
          🧠 Custom AI
        </button>
        <button
          className={tab === "api-webhooks" ? "active" : ""}
          onClick={() => setTab("api-webhooks")}
        >
          🔌 API & Webhooks
        </button>
      </div>

      {error && (
        <div className="business-error">
          {error}
        </div>
      )}

      {tab === "multi-business" && (
        <div className="business-section multi-business-workspace">
          <h3>🏢 Multi-Business Workspace</h3>
          <p>Manage multiple businesses from one account. Each workspace keeps its data separate.</p>

          {multiBusinessMessage && (
            <div className="business-error" role="alert">{multiBusinessMessage}</div>
          )}

          {multiBusinessLoading && <p>Loading...</p>}

          <div className="multi-business-list">
            {multiBusinesses.map((item) => (
              <div className="ai-result" key={item.id}>
                <strong>{item.name}</strong>
                <p>{item.industry || "Business"}</p>
                {item.is_active ? (
                  <span>✓ Active Workspace</span>
                ) : (
                  <button
                    type="button"
                    disabled={multiBusinessLoading}
                    onClick={() => switchBusiness(item.id)}
                  >
                    Switch Workspace
                  </button>
                )}
              </div>
            ))}
            {!multiBusinessLoading && multiBusinesses.length === 0 && (
              <p>No business workspaces found.</p>
            )}
          </div>

          <form onSubmit={createBusiness} className="employee-create-form">
            <h4>＋ Create New Business</h4>
            <input
              value={newBusinessName}
              onChange={(e) => setNewBusinessName(e.target.value)}
              placeholder="Business name"
              maxLength={100}
              required
            />
            <input
              value={newBusinessIndustry}
              onChange={(e) => setNewBusinessIndustry(e.target.value)}
              placeholder="Industry (optional)"
              maxLength={80}
            />
            <button
              type="submit"
              disabled={multiBusinessLoading || !newBusinessName.trim()}
            >
              Create & Switch
            </button>
          </form>
        </div>
      )}

      {tab === "employees" && (
        <div className="business-section employee-workspace">
          <div className="employee-hero"><div><span className="employee-eyebrow">TEAM MANAGEMENT</span><h3>Build Your Team</h3><p>Add employees, assign roles and manage access to your business workspace.</p></div><div className="employee-hero-icon">👥</div></div>
          <p>Manage employee accounts belonging to this business.</p>

          {teamMessage && (
            <div className="ai-result" role="status">{teamMessage}</div>
          )}

          {teamCurrentRole === "owner" && (
            <form onSubmit={addEmployee} className="employee-create-form">
              <h4>Create Employee Account</h4>

              <input
                value={employeeName}
                onChange={(e) => setEmployeeName(e.target.value)}
                placeholder="Employee full name"
                required
              />

              <input
                type="email"
                value={employeeEmail}
                onChange={(e) => setEmployeeEmail(e.target.value)}
                placeholder="Employee email"
                required
              />

              <input
                type="password"
                value={employeePassword}
                onChange={(e) => setEmployeePassword(e.target.value)}
                placeholder="Temporary password (minimum 8 characters)"
                minLength={8}
                maxLength={128}
                required
              />

              <select
                value={employeeRole}
                onChange={(e) => setEmployeeRole(e.target.value)}
              >
                <option value="admin">Admin</option>
                <option value="manager">Manager</option>
                <option value="sales">Sales</option>
                <option value="viewer">Viewer</option>
              </select>

              <button
                type="submit"
                className="primary-business-button"
                disabled={teamLoading}
              >
                {teamLoading ? "Please wait..." : "Create Employee"}
              </button>
            </form>
          )}

          <div className="employee-list">
            <h4>Team Members</h4>

            {teamLoading && <p>Loading team...</p>}

            {!teamLoading && teamMembers.length === 0 && (
              <p>No team members found.</p>
            )}

            {teamMembers.map((member) => (
              <div className="employee-card" key={member.id}>
                <div>
                  <strong>{member.name}</strong>
                  <p>{member.email}</p>
                  <small>
                    {member.role} · {member.role === "owner" ? "Owner" : member.is_active ? "Active" : "Inactive"}
                  </small>
                </div>

                {teamCurrentRole === "owner" && member.role !== "owner" && (
                  <div className="employee-actions">
                    <select
                      aria-label={`Role for ${member.name}`}
                      value={member.role}
                      disabled={teamLoading || !member.is_active}
                      onChange={(e) => updateEmployee(member, { role: e.target.value })}
                    >
                      <option value="admin">Admin</option>
                      <option value="manager">Manager</option>
                      <option value="sales">Sales</option>
                      <option value="viewer">Viewer</option>
                    </select>

                    <button
                      type="button"
                      disabled={teamLoading}
                      onClick={() => updateEmployee(member, { is_active: !member.is_active })}
                    >
                      {member.is_active ? "Deactivate" : "Reactivate"}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "permissions" && (
        <div className="business-section roles-permissions-workspace">
          <div className="roles-permissions-hero">
            <div>
              <span>ACCESS CONTROL</span>
              <h3>Roles & Permissions</h3>
              <p>Control what each team role can access and manage.</p>
            </div>
            <div className="roles-permissions-icon">🔐</div>
          </div>

          {permissionLoading && <p>Loading role permissions...</p>}

          {permissionData && (
            <>
              <p className="roles-current">
                Your current role: <strong>{permissionData.currentUserRole}</strong>
              </p>

              <div className="roles-permissions-grid">
                {permissionData.roles.map((role) => (
                  <article className="role-permission-card" key={role.role}>
                    <div className="role-permission-heading">
                      <h4>{role.label}</h4>
                      {role.role === permissionData.currentUserRole && (
                        <span>YOUR ROLE</span>
                      )}
                    </div>

                    <ul>
                      {[
                        ["team:view", "View team members"],
                        ["team:manage", "Manage team accounts"],
                        ["leads:view", "View leads"],
                        ["leads:create", "Create leads"],
                        ["leads:update", "Edit leads"],
                        ["leads:delete", "Delete leads"],
                        ["leads:assign", "Assign leads"],
                        ["pipeline:update", "Update sales pipeline"],
                        ["reports:view", "View sales reports"],
                        ["memory:view", "View company memory"],
                        ["memory:manage", "Manage company memory"],
                        ["ai:use", "Use Business AI"],
                        ["profile:view", "View business profile"]
                      ].map(([key, label]) => (
                        <li key={key}>
                          <span>{label}</span>
                          <strong className={role.permissions.includes(key) ? "permission-allowed" : "permission-denied"}>
                            {role.permissions.includes(key) ? "✓" : "—"}
                          </strong>
                        </li>
                      ))}
                    </ul>
                  </article>
                ))}
              </div>

              <p className="roles-permissions-note">
                Only the Owner can create employee accounts, change employee roles
                or deactivate team accounts. Sales users can access only their
                assigned leads.
              </p>
            </>
          )}
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

      {tab === "custom-ai" && (
        <div className="business-section custom-ai-workspace">
          <h3>🧠 Custom AI Settings</h3>
          <p>Configure how VikoAI communicates with customers for this business.</p>

          {customAIMessage && (
            <div className={customAIMessage.includes("successfully") ? "ai-result" : "business-error"} role="status">
              {customAIMessage}
            </div>
          )}

          {customAILoading ? (
            <p>Loading Custom AI settings...</p>
          ) : (
            <form onSubmit={saveCustomAI}>
              <label className="business-form-label">
                <input
                  type="checkbox"
                  checked={Boolean(customAI.enabled)}
                  onChange={(e) => setCustomAI((current) => ({
                    ...current,
                    enabled: e.target.checked
                  }))}
                />
                Enable Custom AI preferences
              </label>

              <label className="business-form-label" htmlFor="custom-ai-tone">Response tone</label>
              <select
                id="custom-ai-tone"
                value={customAI.tone}
                onChange={(e) => setCustomAI((current) => ({
                  ...current, tone: e.target.value
                }))}
              >
                <option value="professional">Professional</option>
                <option value="friendly">Friendly</option>
                <option value="casual">Casual</option>
                <option value="formal">Formal</option>
                <option value="persuasive">Persuasive</option>
              </select>

              <label className="business-form-label" htmlFor="custom-ai-language">Response language</label>
              <select
                id="custom-ai-language"
                value={customAI.language}
                onChange={(e) => setCustomAI((current) => ({
                  ...current, language: e.target.value
                }))}
              >
                <option value="Auto">Automatic</option>
                <option value="English">English</option>
                <option value="Hindi">Hindi</option>
                <option value="Hinglish">Hinglish</option>
                <option value="Spanish">Spanish</option>
                <option value="Arabic">Arabic</option>
              </select>

              <label className="business-form-label" htmlFor="custom-ai-personality">AI personality</label>
              <textarea
                id="custom-ai-personality"
                value={customAI.personality}
                maxLength={500}
                rows={3}
                placeholder="Example: Helpful, patient and welcoming."
                onChange={(e) => setCustomAI((current) => ({
                  ...current, personality: e.target.value
                }))}
              />

              <label className="business-form-label" htmlFor="custom-ai-instructions">Business-specific AI instructions</label>
              <textarea
                id="custom-ai-instructions"
                value={customAI.instructions}
                maxLength={3000}
                rows={7}
                placeholder="Describe how the AI should answer customer questions for this business..."
                onChange={(e) => setCustomAI((current) => ({
                  ...current, instructions: e.target.value
                }))}
              />

              <label className="business-form-label" htmlFor="custom-ai-welcome">Welcome message</label>
              <textarea
                id="custom-ai-welcome"
                value={customAI.welcome_message}
                maxLength={500}
                rows={3}
                placeholder="Example: Welcome! How can we help you today?"
                onChange={(e) => setCustomAI((current) => ({
                  ...current, welcome_message: e.target.value
                }))}
              />

              <button
                type="submit"
                className="primary-business-button"
                disabled={customAISaving}
              >
                {customAISaving ? "Saving..." : "Save Custom AI Settings"}
              </button>
            </form>
          )}
        </div>
      )}

      {tab === "api-webhooks" && <ApiWebhooks token={token} />}

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

      {tab === "automations" && (
        <section className="business-section automation-workspace">
          <h2>⚡ AI Automation</h2>
          <p>Automate repetitive lead tasks in this business workspace.</p>

          <form onSubmit={createAutomation} className="business-form">
            <label>Automation name</label>
            <input
              value={automationName}
              onChange={e => setAutomationName(e.target.value)}
              placeholder="e.g. Qualify new leads"
              maxLength={80}
              required
            />

            <label>When a new lead is created</label>
            <select
              value={automationAction}
              onChange={e => setAutomationAction(e.target.value)}
            >
              <option value="ai_qualify_lead">AI Lead Qualification</option>
              <option value="create_followup_reminder">Create Follow-up Reminder</option>
            </select>

            {automationAction === "create_followup_reminder" && (
              <>
                <label>Reminder delay (hours)</label>
                <input
                  type="number"
                  min="1"
                  max="720"
                  value={automationDelay}
                  onChange={e => setAutomationDelay(e.target.value)}
                  required
                />
              </>
            )}

            <button type="submit" disabled={automationLoading}>
              {automationLoading ? "Please wait..." : "Create Automation"}
            </button>
          </form>

          {automationMessage && <p role="status">{automationMessage}</p>}
          {automationLoading && <p>Loading automations...</p>}

          <h3>Your Automation Rules</h3>
          {!automationLoading && automations.length === 0 && (
            <p>No automation rules yet. Create your first rule above.</p>
          )}
          {automations.map(rule => (
            <div className="business-section" key={rule.id}>
              <h4>{rule.name}</h4>
              <p>
                {rule.action_type === "ai_qualify_lead"
                  ? "AI Lead Qualification"
                  : `Follow-up reminder after ${rule.config?.delayHours || 24} hours`}
              </p>
              <p>Status: {rule.is_enabled ? "Enabled" : "Disabled"}</p>
              <button
                type="button"
                onClick={() => updateAutomation(rule.id, !rule.is_enabled)}
              >
                {rule.is_enabled ? "Disable" : "Enable"}
              </button>
              <button type="button" onClick={() => deleteAutomation(rule.id)}>
                Delete
              </button>
            </div>
          ))}

          <h3>Recent Automation Activity</h3>
          {automationRuns.length === 0 && <p>No runs recorded yet.</p>}
          {automationRuns.map(run => (
            <div className="business-section" key={run.id}>
              <strong>{run.automation_name || "Automation"}</strong>
              <p>Status: {run.status}</p>
              <p>Lead ID: {run.lead_id}</p>
              {run.error && <p role="alert">Error: {run.error}</p>}
              {run.result && <pre>{JSON.stringify(run.result, null, 2)}</pre>}
              <small>{run.created_at ? new Date(run.created_at).toLocaleString() : ""}</small>
            </div>
          ))}
        </section>
      )}

      {tab === "sales-reports" && (
        <div className="business-section sales-reports-section">
          <div className="sales-reports-heading">
            <div>
              <h3>📈 Sales Reports</h3>
              <p>Total leads, conversions and sales performance.</p>
            </div>
            <button
              type="button"
              disabled={salesReportLoading}
              onClick={() => setSalesReportReload(value => value + 1)}
            >
              Refresh
            </button>
          </div>

          {salesReportLoading && <p>Loading sales reports...</p>}
          {salesReportError && <p role="alert">{salesReportError}</p>}

          {!salesReportLoading && salesReport && (
            <>
              <div className="sales-report-summary">
                <div className="sales-report-card"><span>Total Leads</span><strong>{salesReport.total_leads}</strong></div>
                <div className="sales-report-card"><span>Conversions</span><strong>{salesReport.closed_deals}</strong></div>
                <div className="sales-report-card"><span>Conversion Rate</span><strong>{String(salesReport.conversion_rate ?? 0).replace(/%+$/, "")}%</strong></div>
                <div className="sales-report-card"><span>Active Leads</span><strong>{salesReport.active_leads}</strong></div>
                <div className="sales-report-card"><span>Lost Leads</span><strong>{salesReport.lost_leads}</strong></div>
              </div>

              <div className="sales-report-panel">
                <h4>Pipeline Breakdown</h4>
                {(salesReport.pipeline || []).length ? salesReport.pipeline.map(item => (
                  <div className="sales-report-row" key={item.stage}>
                    <span>{item.stage.charAt(0).toUpperCase() + item.stage.slice(1)}</span>
                    <strong>{item.total}</strong>
                  </div>
                )) : <p>No pipeline data yet.</p>}
              </div>

              {salesReport.employees?.length > 0 && (
                <div className="sales-report-panel">
                  <h4>Employee Sales Performance</h4>
                  {salesReport.employees.map(employee => (
                    <div className="sales-report-employee" key={employee.id}>
                      <strong>{employee.name}</strong>
                      <span>{employee.total_leads} leads</span>
                      <span>{employee.closed_deals} conversions</span>
                      <span>{String(employee.conversion_rate ?? 0).replace(/%+$/, "")}% conversion</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
          {!salesReportLoading && !salesReport && !salesReportError && (
            <p>No sales report data available.</p>
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

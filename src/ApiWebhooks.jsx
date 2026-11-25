import { useCallback, useEffect, useState } from "react";

const API = "/api";

export default function ApiWebhooks({ token }) {
  const [keys, setKeys] = useState([]);
  const [webhooks, setWebhooks] = useState([]);
  const [deliveries, setDeliveries] = useState([]);
  const [keyName, setKeyName] = useState("");
  const [scopes, setScopes] = useState(["leads:read"]);
  const [expiry, setExpiry] = useState("90");
  const [endpoint, setEndpoint] = useState("");
  const [secret, setSecret] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`
  };

  const request = useCallback(async (path, options = {}) => {
    let response;
    try {
      response = await fetch(`${API}${path}`, {
        ...options,
        headers: { ...headers, ...(options.headers || {}) }
      });
    } catch (err) {
      throw new Error(`Network error: ${err.message || "Could not reach the server."}`);
    }

    const raw = await response.text();
    let data = {};
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = {};
    }

    if (!response.ok) {
      const detail = data.error || data.message || raw.slice(0, 240);
      throw new Error(`${path}: ${detail || response.statusText || "Request failed"} (HTTP ${response.status})`);
    }
    return data;
  }, [token]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [keyData, hookData, deliveryData] = await Promise.all([
        request("/business/api-keys"),
        request("/business/webhooks"),
        request("/business/webhook-deliveries")
      ]);
      setKeys(keyData.keys || []);
      setWebhooks(hookData.webhooks || []);
      setDeliveries(deliveryData.deliveries || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [request]);

  useEffect(() => { loadAll(); }, [loadAll]);

  async function createKey(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    setSecret("");
    try {
      const data = await request("/business/api-keys", {
        method: "POST",
        body: JSON.stringify({
          name: keyName,
          scopes,
          expiresInDays: expiry === "never" ? null : Number(expiry)
        })
      });
      setKeyName("");
      setSecret(data.secret);
      setMessage("API key created. Copy the secret now; it will not be shown again.");
      await loadAll();
    } catch (err) { setError(err.message); }
  }

  async function createWebhook(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    setSecret("");
    try {
      const data = await request("/business/webhooks", {
        method: "POST",
        body: JSON.stringify({
          endpointUrl: endpoint,
          events: ["lead.created"]
        })
      });
      setEndpoint("");
      setSecret(data.secret);
      setMessage("Webhook created. Copy its signing secret now; it will not be shown again.");
      await loadAll();
    } catch (err) { setError(err.message); }
  }

  async function revokeKey(id) {
    if (!window.confirm("Revoke this API key? Existing integrations using it will stop working.")) return;
    try {
      await request(`/business/api-keys/${id}`, { method: "DELETE" });
      setMessage("API key revoked.");
      await loadAll();
    } catch (err) { setError(err.message); }
  }

  async function toggleWebhook(hook) {
    try {
      await request(`/business/webhooks/${hook.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !hook.is_active })
      });
      await loadAll();
    } catch (err) { setError(err.message); }
  }

  async function deleteWebhook(id) {
    if (!window.confirm("Delete this webhook and its delivery history?")) return;
    try {
      await request(`/business/webhooks/${id}`, { method: "DELETE" });
      setMessage("Webhook deleted.");
      await loadAll();
    } catch (err) { setError(err.message); }
  }

  async function retryDelivery(id) {
    try {
      await request(`/business/webhook-deliveries/${id}/retry`, { method: "POST" });
      setMessage("Failed delivery queued for retry.");
      await loadAll();
    } catch (err) { setError(err.message); }
  }

  async function copyText(value) {
    try {
      await navigator.clipboard.writeText(value);
      setMessage("Copied to clipboard.");
    } catch {
      setMessage("Copy unavailable. Select and copy the displayed text manually.");
    }
  }

  const curlExample = `curl -X GET "${window.location.origin}/api/v1/leads" \\
  -H "Authorization: Bearer YOUR_VIKOP_API_KEY"`;

  return (
    <div className="business-section api-webhooks-page">
      <h2>🔌 API & Webhooks</h2>
      <p>Connect your business workspace to external apps and services.</p>

      {error && <div className="business-error" role="alert">{error}</div>}
      {message && <div className="ai-result" role="status">{message}</div>}
      {secret && (
        <div className="business-card">
          <strong>One-time secret — copy it now</strong>
          <p>This secret is shown only once. Store it somewhere secure.</p>
          <textarea readOnly rows={3} value={secret} />
          <button type="button" onClick={() => copyText(secret)}>📋 Copy secret</button>
        </div>
      )}

      <h3>🔑 API Keys</h3>
      <p>Create keys to access your business leads through the VikoP API.</p>
      <form onSubmit={createKey}>
        <label className="business-form-label">Key name</label>
        <input value={keyName} onChange={e => setKeyName(e.target.value)}
          maxLength={80} required placeholder="Example: CRM Integration" />
        <label className="business-form-label">Permissions</label>
        <label>
          <input type="checkbox" checked={scopes.includes("leads:read")}
            onChange={e => setScopes(old => e.target.checked
              ? [...old, "leads:read"] : old.filter(x => x !== "leads:read"))} />
          Read leads
        </label>
        <label>
          <input type="checkbox" checked={scopes.includes("leads:write")}
            onChange={e => setScopes(old => e.target.checked
              ? [...old, "leads:write"] : old.filter(x => x !== "leads:write"))} />
          Create leads
        </label>
        <label className="business-form-label">Key expiry</label>
        <select value={expiry} onChange={e => setExpiry(e.target.value)}>
          <option value="30">30 days</option>
          <option value="90">90 days</option>
          <option value="365">365 days</option>
          <option value="never">Never expires</option>
        </select>
        <button className="primary-business-button" type="submit"
          disabled={!keyName.trim() || scopes.length === 0}>
          Create API Key
        </button>
      </form>

      {keys.length === 0 && <p>No API keys created yet.</p>}
      {keys.map(key => (
        <article className="knowledge-card" key={key.id}>
          <div>
            <strong>{key.name}</strong>
            <p>{key.key_prefix}••••</p>
            <small>Scopes: {key.scopes.join(", ")}</small>
            <br />
            <small>{key.revoked_at ? "Revoked" : key.expires_at
              ? `Expires: ${new Date(key.expires_at).toLocaleDateString()}` : "No expiry"}</small>
            {key.last_used_at && <p><small>Last used: {new Date(key.last_used_at).toLocaleString()}</small></p>}
          </div>
          {!key.revoked_at && <button type="button" onClick={() => revokeKey(key.id)}>Revoke</button>}
        </article>
      ))}

      <hr />
      <h3>🪝 Webhooks</h3>
      <p>Receive an event when a new lead is created. Currently supported event: <code>lead.created</code>.</p>
      <form onSubmit={createWebhook}>
        <label className="business-form-label">HTTPS endpoint URL</label>
        <input type="url" value={endpoint} onChange={e => setEndpoint(e.target.value)}
          required placeholder="https://your-server.com/webhooks/vikop" />
        <button className="primary-business-button" type="submit">Create Webhook</button>
      </form>

      {webhooks.length === 0 && <p>No webhooks configured yet.</p>}
      {webhooks.map(hook => (
        <article className="knowledge-card" key={hook.id}>
          <div>
            <strong>{hook.endpoint_url}</strong>
            <p>{hook.events.join(", ")}</p>
            <small>{hook.is_active ? "Active" : "Disabled"}</small>
          </div>
          <div>
            <button type="button" onClick={() => toggleWebhook(hook)}>
              {hook.is_active ? "Disable" : "Enable"}
            </button>
            <button type="button" onClick={() => deleteWebhook(hook.id)}>Delete</button>
          </div>
        </article>
      ))}

      <hr />
      <h3>📨 Webhook Delivery History</h3>
      <button type="button" onClick={loadAll} disabled={loading}>
        {loading ? "Refreshing..." : "↻ Refresh"}
      </button>
      {deliveries.length === 0 && <p>No webhook deliveries recorded yet.</p>}
      {deliveries.map(item => (
        <article className="knowledge-card" key={item.id}>
          <div>
            <strong>{item.event_type} — {item.status}</strong>
            <p>{item.endpoint_url}</p>
            <small>Attempts: {item.attempts} · HTTP: {item.response_status || "—"}</small>
            <p><small>{new Date(item.created_at).toLocaleString()}</small></p>
            {item.last_error && <p className="business-error">{item.last_error}</p>}
          </div>
          {item.status === "failed" && (
            <button type="button" onClick={() => retryDelivery(item.id)}>Retry</button>
          )}
        </article>
      ))}

      <hr />
      <h3>📘 API Quick Start</h3>
      <p>Use your API key in the Authorization header. Keep it private.</p>
      <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{curlExample}</pre>
      <button type="button" onClick={() => copyText(curlExample)}>📋 Copy cURL example</button>
      <p><strong>Available endpoints</strong></p>
      <ul>
        <li><code>GET /api/v1/leads</code> — requires leads:read</li>
        <li><code>POST /api/v1/leads</code> — requires leads:write</li>
      </ul>
      <p>Webhook requests include X-VikoP-Event, X-VikoP-Event-Id, X-VikoP-Timestamp and X-VikoP-Signature headers.</p>
    </div>
  );
}
